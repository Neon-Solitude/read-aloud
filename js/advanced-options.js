
Promise.all([getSettings(), domReady()]).then(([settings]) => {
  const close = qs("button.close")
  show(close)
  close.addEventListener("click", () => history.back())

  const checkbox = qs("#fix-bt-silence-gap")
  checkbox.checked = settings.fixBtSilenceGap
  checkbox.addEventListener("change", function() {
    updateSettings({fixBtSilenceGap: this.checked})
      .catch(console.error)
  })
})
