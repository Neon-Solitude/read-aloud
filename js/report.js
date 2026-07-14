domReady().then(function() {
  var queryString = getQueryString();
  if (queryString.referer) {
    const close = qs("button.close")
    show(close)
    close.addEventListener("click", function() {
      history.back();
    })
  }

  sendToPlayer({method: "getLastUrl"}).then(url => qs("#txt-url").value = url)
  qs("#txt-comment").focus();
  qs("#btn-submit").addEventListener("click", submit);
});

function submit() {
  qsa("#btn-submit, #lbl-status, #lbl-error").forEach(hide);
  show(qs("#img-spinner"));
  bgPageInvoke("reportIssue", [qs("#txt-url").value, qs("#txt-comment").value])
    .then(function() {
      hide(qs("#img-spinner"));
      const status = qs("#lbl-status");
      status.textContent = "Issue has been reported, thank you!";
      show(status);
    },
    function() {
      hide(qs("#img-spinner"));
      const error = qs("#lbl-error");
      error.textContent = "Server could not be contacted, please email me directly at hai.phan@gmail.com. Thank you!";
      show(error);
    })
}
