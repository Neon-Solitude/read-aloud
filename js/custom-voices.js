
$(function() {
  getSettings(["awsCreds", "gcpCreds", "ibmCreds", "azureCreds"])
    .then(function(items) {
      if (items.awsCreds) {
        $("#aws-access-key-id").val(obfuscate(items.awsCreds.accessKeyId));
        $("#aws-secret-access-key").val(obfuscate(items.awsCreds.secretAccessKey));
      }
      if (items.gcpCreds) {
        $("#gcp-api-key").val(obfuscate(items.gcpCreds.apiKey));
        $("#gcp-enable-studio").prop('checked', items.gcpCreds.enableStudio);
      }
      if (items.ibmCreds) {
        $("#ibm-api-key").val(obfuscate(items.ibmCreds.apiKey));
        $("#ibm-url").val(obfuscate(items.ibmCreds.url));
      }
      if (items.azureCreds) {
        $("#azure-region").val(items.azureCreds.region)
        $("#azure-key").val(obfuscate(items.azureCreds.key))
      }
    })
  $(".status").hide();
  $("#aws-save-button").click(awsSave);
  $("#gcp-save-button").click(gcpSave);
  $("#ibm-save-button").click(ibmSave);
  $("#azure-save-button").click(azureSave)
})

function obfuscate(key) {
  return key.replace(/./g, function(m, i) {
    return i < key.length-5 ? "*" : m;
  })
}


// Builds the click handler for a credentials panel (AWS/GCP/IBM/Azure). Read the
// fields; if all are filled, test -> save -> obfuscate; if all are empty, clear
// the saved creds; otherwise report missing fields. Config:
//   prefix          element-id prefix for the -progress/-success/-error status
//   settingsKey     storage key for the creds
//   fields          [{id, key, obfuscate}] inputs (values collected keyed by `key`)
//   test(values)    Promise that validates the credentials
//   buildCreds(v)   object to persist (may read extra controls, e.g. a checkbox)
//   enabledMessage(v) / disabledMessage   status text
function makeCredentialForm(config) {
  return async function() {
    $(".status").hide();
    const values = {};
    for (const f of config.fields) values[f.key] = $("#" + f.id).val().trim();
    if (config.fields.every(f => values[f.key])) {
      $("#" + config.prefix + "-progress").show();
      try {
        await config.test(values);
        await updateSettings({[config.settingsKey]: config.buildCreds(values)});
        $("#" + config.prefix + "-success").text(config.enabledMessage(values)).show();
        for (const f of config.fields) if (f.obfuscate) $("#" + f.id).val(obfuscate(values[f.key]));
      }
      catch (err) {
        $("#" + config.prefix + "-error").text("Test failed: " + err.message).show();
      }
      finally {
        $("#" + config.prefix + "-progress").hide();
      }
    }
    else if (config.fields.every(f => !values[f.key])) {
      await clearSettings([config.settingsKey]);
      $("#" + config.prefix + "-success").text(config.disabledMessage).show();
    }
    else {
      $("#" + config.prefix + "-error").text("Missing required fields.").show();
    }
  };
}

const awsSave = makeCredentialForm({
  prefix: "aws",
  settingsKey: "awsCreds",
  fields: [
    {id: "aws-access-key-id", key: "accessKeyId", obfuscate: true},
    {id: "aws-secret-access-key", key: "secretAccessKey", obfuscate: true},
  ],
  test: v => testAws(v.accessKeyId, v.secretAccessKey),
  buildCreds: v => ({accessKeyId: v.accessKeyId, secretAccessKey: v.secretAccessKey}),
  enabledMessage: () => "Amazon Polly voices are enabled.",
  disabledMessage: "Amazon Polly voices are disabled.",
});

function testAws(accessKeyId, secretAccessKey) {
      var polly = new AWS.Polly({
        region: "us-east-1",
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
      })
      return polly.describeVoices().promise();
}


const gcpSave = makeCredentialForm({
  prefix: "gcp",
  settingsKey: "gcpCreds",
  fields: [
    {id: "gcp-api-key", key: "apiKey", obfuscate: true},
  ],
  test: v => testGcp(v.apiKey),
  buildCreds: v => ({apiKey: v.apiKey, enableStudio: $("#gcp-enable-studio").is(':checked')}),
  enabledMessage: () => $("#gcp-enable-studio").is(':checked')
    ? "Google Wavenet & Studio voices are enabled."
    : "Google Wavenet voices are enabled.",
  disabledMessage: "Google Wavenet voices are disabled.",
});

function testGcp(apiKey) {
      return ajaxGet("https://texttospeech.googleapis.com/v1beta1/voices?key=" + apiKey);
}


const ibmSave = makeCredentialForm({
  prefix: "ibm",
  settingsKey: "ibmCreds",
  fields: [
    {id: "ibm-api-key", key: "apiKey", obfuscate: true},
    {id: "ibm-url", key: "url", obfuscate: true},
  ],
  test: v => testIbm(v.apiKey, v.url),
  buildCreds: v => ({apiKey: v.apiKey, url: v.url}),
  enabledMessage: () => "IBM Watson voices are enabled.",
  disabledMessage: "IBM Watson voices are disabled.",
});

function testIbm(apiKey, url) {
  return brapi.permissions.request({origins: [url + "/*"]})
    .then(function(granted) {
      if (!granted) throw new Error("Permission not granted");
    })
    .then(function() {
      return ibmWatsonTtsEngine.fetchVoices(apiKey, url);
    })
}


const azureSave = makeCredentialForm({
  prefix: "azure",
  settingsKey: "azureCreds",
  fields: [
    {id: "azure-region", key: "region", obfuscate: false},
    {id: "azure-key", key: "key", obfuscate: true},
  ],
  test: v => testAzure(v.region, v.key),
  buildCreds: v => ({region: v.region, key: v.key}),
  enabledMessage: () => "Azure voices are enabled.",
  disabledMessage: "Azure voices are disabled.",   // was mistakenly "IBM Watson voices are disabled."
});

async function testAzure(region, key) {
  await azureTtsEngine.fetchVoices(region, key)
}



//OpenAI
$(function() {
  const creds$ = observeSetting("openaiCreds")
  const editMode$ = new rxjs.BehaviorSubject(false)
  const status$ = new rxjs.BehaviorSubject({type: "IDLE"})

  rxjs.combineLatest(creds$, editMode$).subscribe(([creds, editMode]) => {
    $(".openai .view-new").toggle(creds == null && !editMode)
    $(".openai .view-exist").toggle(creds != null && !editMode)
    $(".openai .view-edit").toggle(editMode)
  })

  creds$.subscribe(creds => {
    const endpointUrl = creds && creds.url || openaiTtsEngine.defaultEndpointUrl
    const apiKey = creds && creds.apiKey || ""
    const voiceList = creds && creds.voiceList || openaiTtsEngine.defaultVoiceList
    $(".openai .endpoint-url").text(endpointUrl)
    $(".openai .api-key").text(apiKey && (apiKey.slice(0,13) + "*****" + apiKey.slice(-5)))
    $(".openai .voice-list").text(voiceList.map(x => x.voice).join(", "))
    $(".openai .txt-endpoint-url").val(endpointUrl)
    $(".openai .txt-api-key").val(apiKey)
    $(".openai .txt-voice-list").val(JSON.stringify(voiceList, null, 2))
  })

  status$.subscribe(status => {
    $(".openai .status.progress").toggle(status.type == "PROGRESS")
    $(".openai .status.success").toggle(status.type == "SUCCESS")
    $(".openai .status.error").toggle(status.type == "ERROR")
      .text(status.type == "ERROR" ? status.error.message : "")
  })

  //actions
  $(".openai .btn-add").click(() => {
    status$.next({type: "IDLE"})
    editMode$.next(true)
  })
  $(".openai .btn-edit").click(() => {
    status$.next({type: "IDLE"})
    editMode$.next(true)
  })
  $(".openai .btn-delete").click(() => {
    clearSettings(["openaiCreds"])
    editMode$.next(false)
  })
  $(".openai .btn-save").click(async () => {
    try {
      const openaiCreds = {
        url: $(".openai .txt-endpoint-url").val(),
        apiKey: $(".openai .txt-api-key").val(),
        voiceList: JSON.parse($(".openai .txt-voice-list").val())
      }
      status$.next({type: "PROGRESS"})
      await openaiTtsEngine.test(openaiCreds)
      await updateSettings({openaiCreds})
      editMode$.next(false)
      status$.next({type: "IDLE"})
    } catch (err) {
      status$.next({type: "ERROR", error: err})
    }
  })
  $(".openai .btn-cancel").click(() => {
    editMode$.next(false)
  })
})
