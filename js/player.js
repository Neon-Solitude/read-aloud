
const isEmbedded = top != self
var queryString = new URLSearchParams(location.search)
var activeDoc;
var playbackError = null;
var lastUrlPromise = Promise.resolve(null)


// A hosted tool runs its TTS engine inside a cross-origin iframe and talks to
// the player over a postMessage request/callback bridge. Piper, Supertonic and
// NghiTTS are structurally identical; this factory builds one. It returns the
// observable/callbacks the matching engine in tts-engines.js consumes lazily,
// the dispatcher used by the window "message" handler below, and a
// manageVoices() handler exposed to the popup/options.
function registerHostedTool(spec) {
  const subject = new rxjs.Subject()
  const callbacks = new rxjs.Subject()
  function createFrame() {
    const f = document.createElement("iframe")
    f.id = spec.frameId
    f.src = spec.url
    f.allow = "cross-origin-isolated"
    f.style.position = "absolute"
    f.style.left =
    f.style.top = "0"
    f.style.width =
    f.style.height = "100%"
    f.style.borderWidth = "0"
    document.body.appendChild(f)
  }
  function raiseFrame() {
    const maxZ = $('iframe').get().reduce((max, f) => Math.max(max, Number(f.style.zIndex) || 0), 0)
    $('#' + spec.frameId).css('z-index', maxZ + 1)
  }
  const observable = rxjs.defer(() => {
      createFrame()
      return subject
    })
    .pipe(
      rxjs.shareReplay({bufferSize: 1, refCount: false}),
      rxjs.tap(raiseFrame)
    )
  const handlers = {
    advertiseVoices({voices}, sender) {
      updateSettings({[spec.voicesKey]: voices})
      subject.next(sender)
    },
    onStart: args => callbacks.next({type: "start", ...args}),
    onSentence: args => callbacks.next({type: "sentence", ...args}),
    onParagraph: args => callbacks.next({type: "paragraph", ...args}),
    onEnd: args => callbacks.next({type: "end", ...args}),
    onError: args => callbacks.next({type: "error", ...args}),
  }
  if (spec.audioBridge) {
    handlers.audioPlay = args => audioPlayer.play(args.src, args.rate, args.volume)
    handlers.audioPause = () => audioPlayer.pause()
    handlers.audioResume = () => audioPlayer.resume()
  }
  const dispatcher = makeDispatcher(spec.host, handlers)
  function manageVoices() {
    if (isEmbedded) return "POPOUT"
    rxjs.firstValueFrom(observable)
      .catch(console.error)
    brapi.tabs.getCurrent()
      .then(tab => Promise.all([
        brapi.windows.update(tab.windowId, {focused: true}),
        brapi.tabs.update(tab.id, {active: true})
      ]))
      .catch(console.error)
    return "OK"
  }
  return {host: spec.host, service: spec.service, subject, observable, callbacks, dispatcher, manageVoices}
}

const piperTool = registerHostedTool({
  host: "piper-host", service: "piper-service", url: "https://piper.ttstool.com/",
  frameId: "piper-frame", voicesKey: "piperVoices", audioBridge: true,
})
const supertonicTool = registerHostedTool({
  host: "supertonic-host", service: "supertonic-service", url: "https://supertonic.ttstool.com/",
  frameId: "supertonic-frame", voicesKey: "supertonicVoices", audioBridge: true,
})
const nghiTtsTool = registerHostedTool({
  host: "nghitts-host", service: "nghitts-service", url: "https://nghitts.ttstool.com/?embed=1",
  frameId: "nghitts-frame", voicesKey: "nghiTtsVoices", audioBridge: false,
})

// Names consumed elsewhere: tts-engines.js reads these observables/callbacks
// lazily; the window "message" handler and popup/options use the dispatchers and
// manageVoices handlers.
const {observable: piperObservable, callbacks: piperCallbacks, dispatcher: piperDispatcher} = piperTool
const {observable: supertonic$, callbacks: supertonicCallbacks, dispatcher: supertonicDispatcher} = supertonicTool
const {observable: nghiTtsObservable, callbacks: nghiTtsCallbacks, dispatcher: nghiTtsDispatcher} = nghiTtsTool
const managePiperVoices = piperTool.manageVoices
const manageSupertonicVoices = supertonicTool.manageVoices
const manageNghiTtsVoices = nghiTtsTool.manageVoices


const audioPlayer = immediate(() => {
  let current
  return {
    play(src, rate, volume) {
      if (current) current.playback.unsubscribe()
      const isBlob = src instanceof Blob
      const url = isBlob ? URL.createObjectURL(src) : src
      const playbackState$ = new rxjs.BehaviorSubject("resumed")
      return new Promise((fulfill, reject) => {
        current = {
          playbackState$,
          playback: playAudio(Promise.resolve(url), {rate, volume}, playbackState$).subscribe({
            complete: fulfill,
            error: reject
          })
        }
        if (isBlob) current.playback.add(() => URL.revokeObjectURL(url))
      })
    },
    pause() {
      if (current) current.playbackState$.next("paused")
    },
    resume() {
      if (current) current.playbackState$.next("resumed")
    }
  }
})


const fasttextSubject = new rxjs.Subject()
const fasttextObservable = rxjs.defer(() => {
    createFasttextFrame()
    return fasttextSubject
  })
  .pipe(
    rxjs.startWith(null),
    rxjs.shareReplay({bufferSize: 1, refCount: false})
  )
const fasttextDispatcher = makeDispatcher("fasttext-host", {
  onServiceReady(args, sender) {
    fasttextSubject.next(sender)
  }
})


window.addEventListener("message", event => {
  const send = message => event.source.postMessage(message, {targetOrigin: event.origin})

  for (const {dispatcher, host, service} of [
    piperTool, supertonicTool, nghiTtsTool,
    {dispatcher: fasttextDispatcher, host: "fasttext-host", service: "fasttext-service"},
  ]) {
    dispatcher.dispatch(event.data, {
      sendRequest(method, args) {
        const id = String(Math.random())
        send({from: host, to: service, type: "request", id, method, args})
        return dispatcher.waitForResponse(id)
      }
    }, send)
  }
})


const idleSubject = new rxjs.BehaviorSubject(true)

if (queryString.has("autoclose")) {
  rxjs.combineLatest(
    idleSubject,
    piperTool.subject.pipe(rxjs.startWith(null)),
    supertonicTool.subject.pipe(rxjs.startWith(null)),
    nghiTtsTool.subject.pipe(rxjs.startWith(null))
  ).pipe(
    rxjs.switchMap(([isIdle, piper, supertonic, nghiTts]) =>
      rxjs.iif(
        () => isIdle,
        rxjs.timer(queryString.get("autoclose") == "long" || piper || supertonic || nghiTts ? 15*60*1000 : 5*60*1000),
        rxjs.EMPTY
      )
    )
  ).subscribe(closePlayer)
}


var messageHandlers = {
  playText: playText,
  playTab: playTab,
  stop: stop,
  pause: pause,
  resume: resume,
  getPlaybackState: getPlaybackState,
  forward: forward,
  rewind: rewind,
  seek: seek,
  close: closePlayer,
  shouldPlaySilence: shouldPlaySilence.bind({}),
  startPairing: () => phoneTtsEngine.startPairing(),
  isPaired: () => phoneTtsEngine.isPaired(),
  managePiperVoices,
  manageSupertonicVoices,
  manageNghiTtsVoices,
  getLastUrl: () => lastUrlPromise,
}

registerMessageListener("player", messageHandlers)

if (queryString.has("opener")) {
  brapi.runtime.sendMessage({dest: queryString.get("opener"), method: "playerCheckIn"})
    .catch(console.error)
} else {
  bgPageInvoke("playerCheckIn")
    .catch(console.error)
}

document.addEventListener("DOMContentLoaded", initialize)



async function initialize() {
  setI18nText()

  $("#hidethistab-link")
    .toggle(canUseEmbeddedPlayer() && !(await getSettings()).useEmbeddedPlayer)
    .click(function() {
      $("#dialog-backdrop, #hidethistab-dialog").show()
    })

  $("#hidethistab-dialog .btn, #hidethistab-dialog .close")
    .click(function(event) {
      $("#dialog-backdrop, #hidethistab-dialog").hide()
      if ($(event.target).is(".btn-ok")) {
        updateSettings({useEmbeddedPlayer: true})
          .then(() => window.close())
          .catch(console.error)
      }
    })
}

function playText(text, opts) {
  opts = opts || {}
  playbackError = null
  if (!activeDoc) {
    openDoc(new SimpleSource(text.split(/(?:\r?\n){2,}/), {lang: opts.lang}), function(err) {
      if (err) playbackError = err
    })
  }
  const doc = activeDoc
  return activeDoc.play()
    .catch(function(err) {
      if (doc == activeDoc) {
        handleError(err);
        closeDoc();
      }
      throw err;
    })
}

function playTab() {
  playbackError = null
  if (!activeDoc) {
    openDoc(new TabSource(), function(err) {
      if (err) playbackError = err
    })
  }
  const doc = activeDoc
  return activeDoc.play()
    .catch(function(err) {
      if (doc == activeDoc) {
        handleError(err);
        closeDoc();
      }
      throw err;
    })
}

function stop() {
  if (activeDoc) {
    activeDoc.stop();
    closeDoc();
  }
  return true;
}

function pause() {
  if (activeDoc) return activeDoc.pause();
  else return Promise.resolve();
}

function resume() {
  if (activeDoc) return activeDoc.play()
  else return Promise.resolve()
}

function getPlaybackState() {
  if (activeDoc) {
    return Promise.all([activeDoc.getState(), activeDoc.getActiveSpeech()])
      .then(function(results) {
        return {
          state: results[0],
          speechInfo: results[1] && results[1].getInfo(),
          playbackError: errorToJson(playbackError),
        }
      })
      .finally(() => {
        playbackError = null
      })
  }
  else {
    return {
      state: "STOPPED",
      playbackError: errorToJson(playbackError),
    }
  }
}

function openDoc(source, onEnd) {
  activeDoc = new Doc(source, function(err) {
    handleError(err);
    closeDoc();
    if (typeof onEnd == "function") onEnd(err);
  })
  idleSubject.next(false)
  lastUrlPromise = Promise.resolve(source.getUri())
}

function closeDoc() {
  if (activeDoc) {
    activeDoc.close();
    activeDoc = null;
    idleSubject.next(true)
  }
}

function forward() {
  if (activeDoc) return activeDoc.forward();
  else return Promise.reject(new Error("Can't forward, not active"));
}

function rewind() {
  if (activeDoc) return activeDoc.rewind();
  else return Promise.reject(new Error("Can't rewind, not active"));
}

function seek(n) {
  if (activeDoc) return activeDoc.seek(n);
  else return Promise.reject(new Error("Can't seek, not active"));
}

function closePlayer() {
  if (top == self) window.close()
  else location.href = "about:blank"
}

function handleError(err) {
  if (err) {
    var code = /^{/.test(err.message) ? JSON.parse(err.message).code : err.message;
    if (code == "error_payment_required") clearSettings(["voiceName"]);
    reportError(err);
  }
}

function reportError(err) {
  if (err && err.stack) {
    var details = err.stack;
    if (!details.startsWith(err.name)) details = err.name + ": " + err.message + "\n" + details;
    console.error(details)
    lastUrlPromise
      .then(url => bgPageInvoke("reportIssue", [url, details]))
      .catch(console.error)
  }
}

function playAudio(urlPromise, options, playbackState$) {
  if (brapi.offscreen) {
    return playAudioOffscreen(urlPromise, options, playbackState$)
  }
  else {
    return playAudioHere(requestAudioPlaybackPermission().then(() => urlPromise), options, playbackState$)
  }
}

var requestAudioPlaybackPermission = lazy(async function() {
  const thisTab = await brapi.tabs.getCurrent()
  const prevTab = await brapi.tabs.query({windowId: thisTab.windowId, active: true}).then(tabs => tabs[0])
  await brapi.tabs.update(thisTab.id, {active: true})
  $("#dialog-backdrop, #audio-playback-permission-dialog").show()
  await new Audio(brapi.runtime.getURL("sound/silence.mp3")).play()
  $("#dialog-backdrop, #audio-playback-permission-dialog").hide()
  await brapi.tabs.update(prevTab.id, {active: true})
})

async function createOffscreen() {
  const readyPromise = new Promise(f => messageHandlers.offscreenCheckIn = f)
  brapi.offscreen.createDocument({
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Read Aloud would like to play audio in the background",
    url: brapi.runtime.getURL("offscreen.html")
  })
  await readyPromise
}

function playAudioOffscreen(urlPromise, options, playbackState$) {
  return rxjs.from(urlPromise).pipe(
    rxjs.exhaustMap(url =>
      playbackState$.pipe(
        rxjs.distinctUntilChanged(),
        rxjs.skipWhile(state => state != "resumed"),
        rxjs.scan((playback$, state) => {
          if (state == "resumed") {
            return rxjs.defer(async () => {
              if (!playback$) {
                const result = await sendToOffscreen({method: "play", args: [url, options]})
                if (result != true) throw "Offscreen doc not present"
              } else {
                const result = await sendToOffscreen({method: "resume"})
                if (result != true) throw "Offscreen doc gone"
              }
            }).pipe(
              rxjs.catchError(err => {
                console.debug(err)
                return rxjs.defer(createOffscreen).pipe(
                  rxjs.exhaustMap(async () => {
                    const result = await sendToOffscreen({method: "play", args: [url, options]})
                    if (result != true) throw new Error("Offscreen doc inaccessible")
                  })
                )
              }),
              rxjs.exhaustMap(() =>
                rxjs.NEVER.pipe(
                  rxjs.finalize(() => {
                    sendToOffscreen({method: "pause"})
                      .catch(console.error)
                  })
                )
              )
            )
          } else {
            return rxjs.EMPTY
          }
        }, null),
        rxjs.switchAll()
      )
    ),
    rxjs.mergeWith(
      new rxjs.Observable(observer => {
        messageHandlers.offscreenPlaybackEvent = function(event) {
          if (event.type == "error") observer.error(event.error)
          else observer.next(event)
        }
      })
    ),
    rxjs.takeWhile(event => event.type != "end", true)
  )
}

async function sendToOffscreen(message) {
  message.dest = "offscreen"
  const result = await brapi.runtime.sendMessage(message)
    .catch(err => {
      if (/^(A listener indicated|Could not establish)/.test(err.message)) throw new Error(err.message + " " + message.method)
      throw err
    })
  if (result && result.error) throw result.error
  else return result
}

async function shouldPlaySilence(providerId) {
  const should = await getPlaybackState().then(x => x.state == "PLAYING")
  const now = Date.now()
  if (providerId == this.providerId) {
    this.nextExpectedCheckIn = now + (now - this.lastCheckIn)
    this.lastCheckIn = now
    return should
  }
  else {
    if (now < this.nextExpectedCheckIn) {
      return false
    }
    else {
      this.providerId = providerId
      this.lastCheckIn = now
      return should
    }
  }
}

function createFasttextFrame() {
  const f = document.createElement("iframe")
  f.id = "fasttext-frame"
  f.src = "https://ttstool.com/fasttext/index.html"
  f.allow = "cross-origin-isolated"
  f.style.display = "none"
  document.body.appendChild(f)
}
