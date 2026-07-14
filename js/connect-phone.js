
domReady().then(onDomReady)

function onDomReady() {
  setState("loading")
  sendToPlayer({method: "startPairing"})
    .then(pairingCode => {
      qs("#pairing-code").textContent = String(pairingCode).slice(0,3) + "-" + String(pairingCode).slice(3)
      setState("pairing")
      waitPairing()
    })
    .catch(err => {
      console.error(err)
      setState("fail")
    })

  //event handlers
  qs("button.close").addEventListener("click", function() {
    history.back()
  })
  qs("#try-again-button").addEventListener("click", function() {
    setState("pairing")
    waitPairing()
  })
}

function waitPairing() {
  repeat({
    action: () => sendToPlayer({method: "isPaired"}),
    until: x => x,
    delay: 1000,
    max: 120
  })
  .then(isPaired => {
    if (isPaired) setState("success")
    else setState("fail")
  })
  .catch(err => {
    console.error(err)
    setState("fail")
  })
}



function setState(newState) {
  for (const state of ["loading", "pairing", "success", "fail"]) {
    toggle(qs("#state-" + state), state == newState)
  }
}
