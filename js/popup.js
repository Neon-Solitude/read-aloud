
var queryString = getQueryString()
const playerCheckIn$ = new rxjs.Subject()

registerMessageListener("popup", {
  playerCheckIn() {
    playerCheckIn$.next()
  }
})

const engineInitializingSubject = new rxjs.Subject()
engineInitializingSubject
  .pipe(
    rxjs.distinctUntilChanged()
  )
  .subscribe(engine => {
    const status = qs("#status")
    if (engine) {
      status.textContent = `${engine} TTS engine initializing...`
      show(status)
    }
    else hide(status)
  })

domReady().then(function() {
  if (queryString.isPopup) document.body.classList.add("is-popup")
  else getCurrentTab().then(function(currentTab) {return updateSettings({readAloudTab: currentTab.id})})
})



getSettings(["showHighlighting", "readAloudTab"]).then(async settings => {
  if (settings.showHighlighting == 2 && queryString.isPopup) {
    await popout(settings.readAloudTab)
  } else {
    await init()
  }
}).catch(handleError)

async function popout(tabId) {
  const activeTab = await getActiveTab()
  const url = brapi.runtime.getURL("popup.html?tab=" + activeTab.id)
  try {
    if (!tabId) throw "Create"
    const tab = await updateTab(tabId, {url, active: true})
    await updateWindow(tab.windowId, {focused: true}).catch(console.error)
    window.close()
  }
  catch (err) {
    await createWindow({
      url,
      focused: true,
      type: "popup",
      width: 500,
      height: 600,
    })
    window.close()
  }
}

async function init() {
  await domReady()

  qs("#btnPlay").addEventListener("click", onPlay);
  qs("#btnPause").addEventListener("click", onPause);
  qs("#btnStop").addEventListener("click", onStop);
  qs("#btnSettings").addEventListener("click", onSettings);
  qs("#btnForward").addEventListener("click", onForward);
  qs("#btnRewind").addEventListener("click", onRewind);
  qs("#decrease-font-size").addEventListener("click", changeFontSize.bind(null, -1));
  qs("#increase-font-size").addEventListener("click", changeFontSize.bind(null, +1));
  qs("#decrease-window-size").addEventListener("click", changeWindowSize.bind(null, -1));
  qs("#increase-window-size").addEventListener("click", changeWindowSize.bind(null, +1));
  qs("#toggle-dark-mode").addEventListener("click", toggleDarkMode);

  refreshSize();
  checkAnnouncements();

  const {state} = await bgPageInvoke("getPlaybackState")
  if (state == "PAUSED" || state == "STOPPED") onPlay()
}



function handleError(err) {
  if (!err) return;
  if (isCancellation(err)) return;

  const status = qs("#status")
  if (/^{/.test(err.message)) {
    var errInfo = JSON.parse(err.message);

    status.innerHTML = formatError(errInfo);
    show(status);
    qsa("#status a").forEach(link => link.addEventListener("click", function() {
      switch (this.getAttribute("href")) {
        case "#open-extension-settings":
          brapi.tabs.create({url: "chrome://extensions/?id=" + brapi.runtime.id});
          break;
        case "#request-permissions":
          brapi.permissions.request(errInfo.perms)
            .then(function(granted) {
              if (granted) {
                if (errInfo.reload) return reloadAndPlay()
                else qs("#btnPlay").click()
              }
            })
          break;
        case "#sign-in":
          getAuthToken({interactive: true})
            .then(function(token) {
              if (token) qs("#btnPlay").click();
            })
            .catch(function(err) {
              status.textContent = err.message;
              show(status);
            })
          break;
        case "#auth-wavenet":
          brapi.permissions.request(config.wavenetPerms)
            .then(function(granted) {
              if (granted) bgPageInvoke("authWavenet");
            })
          break;
        case "#open-pdf-viewer":
          brapi.tabs.create({url: config.pdfViewerUrl})
          break
        case "#connect-phone":
          location.href = "connect-phone.html"
          break
      }
    }))
  }
  else if (config.browserId == "opera" && /locked fullscreen/.test(err.message)) {
    status.innerHTML = "Click <a href='#open-player-tab'>here</a> to start read aloud.";
    show(status);
    qsa("#status a").forEach(link => link.addEventListener("click", async function() {
      try {
        playerCheckIn$.pipe(rxjs.take(1)).subscribe(() => qs("#btnPlay").click())
        const tab = await brapi.tabs.create({
          url: "player.html?opener=popup&autoclose=long",
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
    show(status);
  }
}



rxjs.concat(domReady(), rxjs.interval(500)).subscribe(updateButtons)

async function updateButtons() {
  const [settings, stateInfo] = await Promise.all([
    getSettings(),
    bgPageInvoke("getPlaybackState"),
  ])
  const showHighlighting = settings.showHighlighting != null ? Number(settings.showHighlighting) : defaults.showHighlighting
  var state = stateInfo.state
  const speech = stateInfo.speechInfo
  var playbackErr = stateInfo.playbackError

  if (playbackErr) handleError(playbackErr)
  engineInitializingSubject.next(state == "LOADING" && speech?.engine)

  toggle(qs("#imgLoading"), state == "LOADING");
  toggle(qs("#btnSettings"), state == "STOPPED");
  toggle(qs("#btnPlay"), state == "PAUSED" || state == "STOPPED");
  toggle(qs("#btnPause"), state == "PLAYING");
  toggle(qs("#btnStop"), state == "PAUSED" || state == "PLAYING" || state == "LOADING");
  qsa("#btnForward, #btnRewind").forEach(el => toggle(el, state == "PLAYING" || state == "PAUSED"));

  if (showHighlighting && (state == "LOADING" || state == "PAUSED" || state == "PLAYING") && speech) {
    qsa("#highlight, #toolbar").forEach(show)
    updateHighlighting(speech)
  }
  else {
    qsa("#highlight, #toolbar").forEach(hide)
  }
}

function updateHighlighting(speech) {
  // Cached render state is stored directly on the element (jQuery .data
  // equivalent for non-string values).
  var elem = qs("#highlight");
  if (!elem.__texts
    || elem.__texts.length != speech.texts.length
    || elem.__texts.some((text,i) => text != speech.texts[i])
  ) {
    elem.style.direction = speech.isRTL ? "rtl" : ""
    elem.__texts = speech.texts
    elem.__position = null
    elem.replaceChildren()
    for (let i=0; i<speech.texts.length; i++) {
      const span = makeSpan(speech.texts[i])
      span.style.cursor = "pointer"
      span.addEventListener("click", onSeek.bind(null, i))
      elem.appendChild(span)
    }
  }

  const pos = speech.position
  if (!elem.__position || positionDiffers(elem.__position, pos)) {
    elem.__position = pos;
    for (const active of elem.querySelectorAll(".active")) active.classList.remove("active");
    const child = elem.children[pos.index]
    const section = pos.word
    if (section) {
      child.replaceChildren()
      const text = speech.texts[pos.index]
      let span
      if (section.startIndex > 0) {
        child.appendChild(makeSpan(text.slice(0, section.startIndex)))
      }
      if (section.endIndex > section.startIndex) {
        span = makeSpan(text.slice(section.startIndex, section.endIndex))
        span.classList.add("active")
        child.appendChild(span)
      }
      if (text.length > section.endIndex) {
        child.appendChild(makeSpan(text.slice(section.endIndex)))
      }
      if (span) scrollIntoView(span, elem)
    }
    else {
      child.classList.add("active")
      scrollIntoView(child, elem)
    }
  }
}

function makeSpan(text) {
  const html = escapeHtml(text).replace(/\r?\n/g, "<br/>")
  const span = document.createElement("span")
  span.innerHTML = html
  return span
}

function positionDiffers(left, right) {
  function rangeDiffers(a, b) {
    if (a == null && b == null) return false
    if (a != null && b != null) return a.startIndex != b.startIndex || a.endIndex != b.endIndex
    return true
  }
  return left.index != right.index ||
    rangeDiffers(left.paragraph, right.paragraph) ||
    rangeDiffers(left.sentence, right.sentence) ||
    rangeDiffers(left.word, right.word)
}

function scrollIntoView(child, scrollParent) {
  const childTop = child.getBoundingClientRect().top - scrollParent.getBoundingClientRect().top
  const childBottom = childTop + child.offsetHeight
  if (childTop < 0 || childBottom >= scrollParent.clientHeight)
    scrollParent.scrollTo({top: scrollParent.scrollTop + childTop - 10, behavior: "smooth"})
}



var currentPlayRequestId

function onPlay() {
  hide(qs("#status"));
  const requestId = currentPlayRequestId = Math.random()
  bgPageInvoke("getPlaybackState")
    .then(function(stateInfo) {
      if (stateInfo.state == "PAUSED") return bgPageInvoke("resume")
      else return bgPageInvoke("playTab", queryString.tab ? [Number(queryString.tab)] : [])
    })
    .then(updateButtons)
    .catch(err => {
      if (requestId == currentPlayRequestId) handleError(err)
      else console.debug("Ignoring error from an earlier request", err)
    })
}

function reloadAndPlay() {
  hide(qs("#status"));
  bgPageInvoke("reloadAndPlayTab", queryString.tab ? [Number(queryString.tab)] : [])
    .then(updateButtons)
    .catch(handleError)
}

function onPause() {
  bgPageInvoke("pause")
    .then(updateButtons)
    .catch(handleError)
}

function onStop() {
  bgPageInvoke("stop")
    .then(updateButtons)
    .catch(handleError)
}

function onSettings() {
  location.href = "options.html?referer=popup.html";
}

function onForward() {
  bgPageInvoke("forward")
    .then(updateButtons)
    .catch(handleError)
}

function onRewind() {
  bgPageInvoke("rewind")
    .then(updateButtons)
    .catch(handleError)
}

function onSeek(n) {
  bgPageInvoke("seek", [n])
    .catch(handleError)
}

function changeFontSize(delta) {
  getSettings(["highlightFontSize"])
    .then(function(settings) {
      var newSize = (settings.highlightFontSize || defaults.highlightFontSize) + delta;
      if (newSize >= 1 && newSize <= 8) return updateSettings({highlightFontSize: newSize}).then(refreshSize);
    })
    .catch(handleError)
}

function changeWindowSize(delta) {
  getSettings(["highlightWindowSize"])
    .then(function(settings) {
      var newSize = (settings.highlightWindowSize || defaults.highlightWindowSize) + delta;
      if (newSize >= 1 && newSize <= 3) return updateSettings({highlightWindowSize: newSize}).then(refreshSize);
    })
    .catch(handleError)
}

function refreshSize() {
  return getSettings(["highlightFontSize", "highlightWindowSize"])
    .then(function(settings) {
      var fontSize = getFontSize(settings);
      var windowSize = getWindowSize(settings);
      const highlight = qs("#highlight")
      highlight.style.fontSize = fontSize
      if (queryString.isPopup) {
        highlight.style.width = isMobileOS() ? "100%" : windowSize[0] + "px"
        highlight.style.height = windowSize[1] + "px"
      }
    })
  function getFontSize(settings) {
    switch (settings.highlightFontSize || defaults.highlightFontSize) {
      case 1: return ".9em";
      case 2: return "1em";
      case 3: return "1.1em";
      case 4: return "1.2em";
      case 5: return "1.3em";
      case 6: return "1.4em";
      case 7: return "1.5em";
      default: return "1.6em";
    }
  }
  function getWindowSize(settings) {
    switch (settings.highlightWindowSize || defaults.highlightWindowSize) {
      case 1: return [430, 330];
      case 2: return [550, 420];
      default: return [750, 450];
    }
  }
}

function checkAnnouncements() {
  var now = new Date().getTime();
  getSettings(["announcement"])
    .then(function(settings) {
      var ann = settings.announcement;
      if (ann && ann.expire > now)
        return ann;
      else
        return ajaxGet(config.serviceUrl + "/read-aloud/announcement")
          .then(JSON.parse)
          .then(function(result) {
            result.expire = now + 6*3600*1000;
            if (ann && result.id == ann.id) {
              result.lastShown = ann.lastShown;
              result.disabled = ann.disabled;
            }
            updateSettings({announcement: result});
            return result;
          })
    })
    .then(function(ann) {
      if (ann.text && !ann.disabled) {
        if (!ann.lastShown || now-ann.lastShown > ann.period*60*1000) {
          showAnnouncement(ann);
          ann.lastShown = now;
          updateSettings({announcement: ann});
        }
      }
    })
}

function showAnnouncement(ann) {
  var html = escapeHtml(ann.text).replace(/\[(.*?)\]/g, "<a target='_blank' href='" + ann.link + "'>$1</a>").replace(/\n/g, "<br/>");
  const footer = qs("#footer")
  footer.innerHTML = html;
  footer.classList.add("announcement");
  if (ann.disableIfClick)
    qsa("#footer a").forEach(a => a.addEventListener("click", function() {
      ann.disabled = true;
      updateSettings({announcement: ann});
    }))
}

function toggleDarkMode() {
  const darkMode = document.body.classList.toggle("dark-mode")
  updateSettings({darkMode})
}
