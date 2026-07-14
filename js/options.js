
(function() {
  const queryString = getQueryString()
  const domReadyPromise = domReady()
  const playerCheckIn$ = new rxjs.Subject()

  registerMessageListener("options", {
    playerCheckIn() {
      playerCheckIn$.next()
    }
  })


  //i18n
  domReadyPromise
    .then(setI18nText)



  //close button
  domReadyPromise
    .then(() => {
      if (queryString.referer) {
        const close = qs("button.close")
        show(close)
        close.addEventListener("click", function() {
          history.back();
        })
      }
    })



  //account button
  domReadyPromise
    .then(() => {
      qs("#account-button").addEventListener("click", function(e) {
        e.preventDefault();
        getAuthToken({interactive: true})
          .then(token => brapi.tabs.create({url: config.webAppUrl + "/premium-voices.html?t=" + token}))
          .catch(handleError)
      })
      qs("#logout-button").addEventListener("click", function(e) {
        e.preventDefault();
        clearAuthToken()
      })
    })

  rxjs.combineLatest([
      observeSetting("authToken").pipe(
        rxjs.switchMap(token => token ? getAccountInfo(token) : Promise.resolve(null))
      ),
      domReadyPromise
    ])
    .subscribe(([account]) => showAccountInfo(account))



  //hotkey
  domReadyPromise
    .then(() => {
      qs("#hotkeys-link").addEventListener("click", function() {
        brapi.tabs.create({url: getHotkeySettingsUrl()});
      });
    })



  //voice
  domReadyPromise
    .then(() => {
      qs("#voices").addEventListener("change", function() {
        var voiceName = this.value;
        if (voiceName == "@custom") brapi.tabs.create({url: "custom-voices.html"});
        else if (voiceName == "@languages") brapi.tabs.create({url: "languages.html"});
        else if (voiceName == "@premium") brapi.tabs.create({url: "premium-voices.html"});
        else if (voiceName == "@piper") bgPageInvoke("managePiperVoices").catch(console.error)
        else if (voiceName == "@supertonic") bgPageInvoke("manageSupertonicVoices").catch(console.error)
        else if (voiceName == "@nghitts") bgPageInvoke("manageNghiTtsVoices").catch(console.error)
        else updateSettings({voiceName})
      });
      qs("#languages-edit-button").addEventListener("click", function() {
        brapi.tabs.create({url: "languages.html"});
      })
    })

  const voicesPopulatedObservable = rxjs.combineLatest([
    voices$,
    observeSetting("languages"),
    brapi.i18n.getAcceptLanguages().catch(err => {console.error(err); return []}),
    domReadyPromise
  ]).pipe(
      rxjs.tap(([voices, languages, acceptLangs]) => populateVoices(voices, {languages}, acceptLangs)),
      rxjs.share()
    )

  rxjs.combineLatest([observeSetting("voiceName"), voicesPopulatedObservable])
    .subscribe(([voiceName]) => {
      qs("#voices").value = voiceName || ""
    })

  rxjs.combineLatest(
    observeSetting("voiceName"),
    observeSetting("gcpCreds"),
    domReadyPromise
  ).subscribe(([voiceName, gcpCreds]) => {
    toggle(qs("#voice-info"), !!voiceName && isGoogleWavenet({voiceName}) && !gcpCreds)
  })



  //rate
  const rateSliderPromise = domReadyPromise
    .then(() => {
      const slider = createSlider(qs("#rate"), {
          onChange(value) {
            const rate = Math.pow(Number(qs("#rate").dataset.pow), value)
            updateSetting("rate" + qs("#voices").value, Number(rate.toFixed(3)))
          }
        })
      qs("#rate-edit-button").addEventListener("click", function() {
        qsa("#rate, #rate-input-div").forEach(el => toggle(el, getComputedStyle(el).display == "none"))
      });
      qs("#rate-input").addEventListener("change", function() {
        var val = this.value.trim();
        if (isNaN(val)) this.value = 1;
        else if (val < .1) this.value = .1;
        else if (val > 10) this.value = 10;
        else hide(qs("#rate-edit-button"));
        updateSetting("rate" + qs("#voices").value, Number(this.value))
      });
      return slider
    })

  const rateObservable = observeSetting("voiceName")
    .pipe(
      rxjs.switchMap(voiceName => observeSetting("rate" + (voiceName || ""))),
      rxjs.share()
    )

  rxjs.combineLatest([rateObservable, rateSliderPromise])
    .subscribe(([rate, slider]) => {
      slider.setValue(Math.log(rate || defaults.rate) / Math.log(Number(qs("#rate").dataset.pow)))
      qs("#rate-input").value = rate || defaults.rate
    })

  rxjs.combineLatest([observeSetting("voiceName"), rateObservable, domReadyPromise])
    .subscribe(([voiceName, rate]) => {
      toggle(qs("#rate-warning"), (!voiceName || isNativeVoice({voiceName})) && rate > 2)
    })



  //pitch
  const pitchSliderPromise = domReadyPromise
    .then(() => {
      return createSlider(qs("#pitch"), {
          onChange(value) {
            updateSettings({pitch: value})
          }
        })
    })

  rxjs.combineLatest([observeSetting("pitch"), pitchSliderPromise])
    .subscribe(([pitch, slider]) => slider.setValue(pitch || defaults.pitch))



  //volume
  const volumeSliderPromise = domReadyPromise
    .then(() => {
      return createSlider(qs("#volume"), {
          onChange(value) {
            updateSettings({volume: value})
          }
        })
    })

  rxjs.combineLatest([observeSetting("volume"), volumeSliderPromise])
    .subscribe(([volume, slider]) => slider.setValue(volume || defaults.volume))



  //showHighlighting
  domReadyPromise
    .then(() => {
      qs("#show-highlighting").addEventListener("change", function() {
        updateSettings({showHighlighting: this.value})
      })
    })

  rxjs.combineLatest([observeSetting("showHighlighting"), domReadyPromise])
    .subscribe(([showHighlighting]) => qs("#show-highlighting").value = showHighlighting || defaults.showHighlighting)



  //audioPlayback
  Promise.all([brapi.storage.local.get(["useEmbeddedPlayer"]), domReadyPromise])
    .then(([settings]) => {
      qs("#audio-playback").addEventListener("change", function() {
        updateSettings({useEmbeddedPlayer: JSON.parse(this.value)})
        brapi.runtime.sendMessage({dest: "player", method: "close"})
          .catch(err => "OK")
      })
      qsa(".audio-playback-visible").forEach(el => toggle(el, settings.useEmbeddedPlayer ? true : false))
    })

  rxjs.combineLatest([observeSetting("useEmbeddedPlayer"), domReadyPromise])
    .subscribe(([useEmbeddedPlayer]) => {
      qs("#audio-playback").value = useEmbeddedPlayer ? "true" : "false"
    })



  //voiceTest
  const demoSpeech = {
    get(lang) {
      return this[lang] || (
        this[lang] = ajaxGet(config.serviceUrl + "/read-aloud/get-demo-speech-text/" + lang).then(JSON.parse)
      )
    }
  }
  const voiceTestSubject = new rxjs.Subject()
  rxjs.defer(() => domReadyPromise).pipe(
    rxjs.exhaustMap(() =>
      voiceTestSubject.pipe(
        rxjs.switchScan(({state}) =>
          rxjs.iif(
            () => state == "STOPPED",
            //play
            rxjs.defer(() => {
              return voices$.pipe(rxjs.take(1))
            }).pipe(
              rxjs.exhaustMap(voices => {
                const voiceName = qs("#voices").value
                const voice = voiceName && findVoiceByName(voices, voiceName)
                const {lang} = parseLang(voice && getFirstLanguage(voice) || "en-US")
                return rxjs.defer(() => demoSpeech.get(lang)).pipe(
                  rxjs.exhaustMap(({text}) => bgPageInvoke("playText", [text, {lang}]))
                )
              }),
              rxjs.exhaustMap(() =>
                rxjs.timer(100, 500).pipe(
                  rxjs.exhaustMap(() => bgPageInvoke("getPlaybackState")),
                  rxjs.takeWhile(({state}) => state != "STOPPED", true)
                )
              )
            ),
            //stop
            rxjs.defer(() => bgPageInvoke("stop")).pipe(
              rxjs.map(() => ({state: "STOPPED"}))
            )
          ),
          {state: "STOPPED"}
        ),
        rxjs.startWith({state: "STOPPED"})
      )
    )
  ).subscribe({
    next({state, playbackError}) {
      toggle(qs("#test-voice .spinner"), state == "LOADING")
      qs("#test-voice [data-i18n]").textContent =
        brapi.i18n.getMessage(state == "STOPPED" ? "options_test_button" : "options_stop_button")
      if (state == "STOPPED" && playbackError) handleError(playbackError)
      else hide(qs("#status").parentElement)
    },
    error: handleError
  })



  //buttons
  domReadyPromise
    .then(() => {
      qs("#test-voice").addEventListener("click", () => voiceTestSubject.next())
      qs("#reset").addEventListener("click", function() {
        clearSettings()
      });
    })



  //status
  domReadyPromise
    .then(() => {
      hide(qs("#status").parentElement)
    })

  settingsChange$
    .subscribe(() => {
      showConfirmation()
      bgPageInvoke("stop").catch(err => "OK")
    })





  function populateVoices(allVoices, settings, acceptLangs) {
    const voicesEl = qs("#voices")
    voicesEl.replaceChildren()
    makeEl("option", {text: "Auto select", attrs: {value: ""}, parent: voicesEl})

    //get voices filtered by selected languages
    var selectedLangs = getSelectedLangs(settings, allVoices, acceptLangs)
    var voices = !selectedLangs ? allVoices : allVoices.filter(
      function(voice) {
        const voiceLanguages = getVoiceLanguages(voice)
        return !voiceLanguages
          || voiceLanguages.map(parseLang).some(({ lang }) => selectedLangs.includes(lang))
          || isPiperVoice(voice)
          || isSupertonicVoice(voice)
          || isNghiTtsVoice(voice)
          || isOpenai(voice)
      });

    //group by standard/premium
    var groups = Object.assign({
        experimental: [],
        offline: [],
        premium: [],
        standard: [],
      },
      voices.groupBy(function(voice) {
        if (isPiperVoice(voice) || isSupertonicVoice(voice) || isNghiTtsVoice(voice)) return "experimental"
        if (isOfflineVoice(voice)) return "offline"
        if (isPremiumVoice(voice)) return "premium";
        return "standard"
      }))
    for (var name in groups) groups[name].sort(voiceSorter);

    const msg = key => brapi.i18n.getMessage(key)
    const spacer = () => makeEl("optgroup", {parent: qs("#voices")})   //empty group for visual separation

    //offline
    renderOptgroup(msg("options_voicegroup_offline"), groups.offline)

    //experimental
    spacer()
    const experimental = renderOptgroup(msg("options_voicegroup_experimental"), groups.experimental)
    appendVoiceOption(experimental, "@piper", msg("options_enable_piper_voices"))
    appendVoiceOption(experimental, "@supertonic", msg("options_enable_supertonic_voices"))
    if (!selectedLangs || selectedLangs.includes('vi')) {
      appendVoiceOption(experimental, "@nghitts", msg("options_enable_nghitts_voices") || "Install NghiTTS voices...")
    }

    //standard
    spacer()
    renderOptgroup(msg("options_voicegroup_standard"), groups.standard)

    //premium
    spacer()
    renderOptgroup(msg("options_voicegroup_premium"), groups.premium)

    //additional
    spacer()
    const additional = renderOptgroup(msg("options_voicegroup_additional"), [])
    appendVoiceOption(additional, "@languages", msg("options_add_more_languages"))
    appendVoiceOption(additional, "@custom", msg("options_enable_custom_voices"))
  }

  //Append a labeled <optgroup> of voices to #voices and return it.
  function renderOptgroup(label, voices) {
    const group = makeEl("optgroup", {attrs: {label}, parent: qs("#voices")})
    for (const voice of voices) appendVoiceOption(group, voice.voiceName, voice.voiceName)
    return group
  }

  function appendVoiceOption(group, value, text) {
    makeEl("option", {text, attrs: {value}, parent: group})
  }

  function voiceSorter(a, b) {
    function getWeight(voice) {
      var weight = 0
      //native voices should appear before non-natives in Standard group
      if (!isNativeVoice(voice)) weight += 10
      //ReadAloud Generic Voice should appear first among the non-natives
      if (!isReadAloudCloud(voice)) weight += 1
      //UseMyPhone should appear last in Offline group
      if (isUseMyPhone(voice)) weight += 1
      return weight
    }
    return getWeight(a)-getWeight(b) || a.voiceName.localeCompare(b.voiceName)
  }



  var greenCheckAnimation
  function showConfirmation() {
    const check = qs(".green-check")
    if (greenCheckAnimation) greenCheckAnimation.cancel()
    show(check)
    check.style.opacity = "1"
    greenCheckAnimation = check.animate(
      [{opacity: 1, offset: 0}, {opacity: 1, offset: 0.55}, {opacity: 0, offset: 1}],
      {duration: 900}
    )
    greenCheckAnimation.onfinish = () => { hide(check); check.style.opacity = "" }
  }

  function handleError(err) {
    const status = qs("#status")
    if (/^{/.test(err.message)) {
      var errInfo = JSON.parse(err.message);
      status.innerHTML = formatError(errInfo);
      show(status.parentElement);
      qsa("#status a").forEach(link => link.addEventListener("click", function() {
        switch (this.getAttribute("href")) {
          case "#sign-in":
            getAuthToken({interactive: true})
              .then(function(token) {
                if (token) {
                  qs("#test-voice").click();
                  getAccountInfo(token).then(showAccountInfo);
                }
              })
              .catch(function(err) {
                status.textContent = err.message;
                show(status.parentElement);
              })
            break;
          case "#auth-wavenet":
            brapi.permissions.request(config.wavenetPerms)
              .then(function(granted) {
                if (granted) bgPageInvoke("authWavenet");
              })
            break;
          case "#connect-phone":
            location.href = "connect-phone.html"
            break
        }
      }))
    }
    else if (config.browserId == "opera" && /locked fullscreen/.test(err.message)) {
      status.innerHTML = "Click <a href='#open-player-tab'>here</a> to start read aloud.";
      show(status.parentElement);
      qsa("#status a").forEach(link => link.addEventListener("click", async function() {
        try {
          playerCheckIn$.pipe(rxjs.take(1)).subscribe(() => qs("#test-voice").click())
          const tab = await brapi.tabs.create({
            url: "player.html?opener=options&autoclose=long",
            index: 0,
            active: false,
          })
          brapi.tabs.update(tab.id, {pinned: true})
            .catch(console.error)
        } catch (err) {
          handleError(err)
        }
      }))
    }
    else {
      status.textContent = err.message;
      show(status.parentElement);
    }
  }

  function showAccountInfo(account) {
    if (account) {
      qs("#account-email").textContent = account.email;
      show(qs("#account-info"));
    }
    else {
      hide(qs("#account-info"));
    }
  }



  function createSlider(elem, {onChange, onSlideChange}) {
    const min = Number(elem.dataset.min) || 0;
    const max = Number(elem.dataset.max) || 1;
    const step = 1 / (Number(elem.dataset.steps) || 20);
    elem.replaceChildren();
    elem.classList.add("slider");
    const bar = makeEl("div", {className: "bar", parent: elem});
    const track = makeEl("div", {className: "track", parent: elem});
    const knob = makeEl("div", {className: "knob", parent: track});

    elem.addEventListener("click", function(e) {
      var pos = calcPosition(e.clientX);
      setPosition(pos);
      onChange(min + pos*(max-min));
    })
    knob.addEventListener("click", function(e) {
      e.stopPropagation();
    })
    function onKnobDown(e) {
      e.preventDefault();
      e.stopPropagation();
      onSlideStart(function(clientX) {
        var pos = calcPosition(clientX);
        setPosition(pos);
        if (onSlideChange) onSlideChange(min + pos*(max-min));
      },
      function(clientX) {
        var pos = calcPosition(clientX);
        setPosition(pos);
        onChange(min + pos*(max-min));
      })
    }
    knob.addEventListener("mousedown", onKnobDown)
    knob.addEventListener("touchstart", onKnobDown)
    return {
      setValue(value) {
        setPosition((Math.min(value, max)-min) / (max-min))
      }
    }

    function setPosition(pos) {
      var percent = (100 * pos) + "%";
      knob.style.left = percent;
      bar.style.width = percent;
    }
    function calcPosition(clientX) {
      var rect = track.getBoundingClientRect();
      var position = (clientX - rect.left) / rect.width;
      position = Math.min(1, Math.max(position, 0));
      return step * Math.round(position / step);
    }
  }

  function onSlideStart(onSlideMove, onSlideStop) {
    function clientXOf(e) {
      return e.changedTouches ? e.changedTouches[0].clientX : e.clientX
    }
    function move(e) {
      if (e.cancelable) e.preventDefault();
      onSlideMove(clientXOf(e));
    }
    function stop(e) {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", stop);
      document.removeEventListener("mouseleave", stop);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", stop);
      document.removeEventListener("touchcancel", stop);
      onSlideStop(clientXOf(e));
    }
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", stop);
    document.addEventListener("mouseleave", stop);
    document.addEventListener("touchmove", move, {passive: false});
    document.addEventListener("touchend", stop);
    document.addEventListener("touchcancel", stop);
  }
})();
