
domReady().then(() => {
  getSettings(["awsCreds", "gcpCreds", "ibmCreds", "azureCreds"])
    .then(function(items) {
      if (items.awsCreds) {
        qs("#aws-access-key-id").value = obfuscate(items.awsCreds.accessKeyId);
        qs("#aws-secret-access-key").value = obfuscate(items.awsCreds.secretAccessKey);
      }
      if (items.gcpCreds) {
        qs("#gcp-api-key").value = obfuscate(items.gcpCreds.apiKey);
        qs("#gcp-enable-studio").checked = items.gcpCreds.enableStudio;
      }
      if (items.ibmCreds) {
        qs("#ibm-api-key").value = obfuscate(items.ibmCreds.apiKey);
        qs("#ibm-url").value = obfuscate(items.ibmCreds.url);
      }
      if (items.azureCreds) {
        qs("#azure-region").value = items.azureCreds.region;
        qs("#azure-key").value = obfuscate(items.azureCreds.key);
      }
    })
  qsa(".status").forEach(hide);
  qs("#aws-save-button").addEventListener("click", awsSave);
  qs("#gcp-save-button").addEventListener("click", gcpSave);
  qs("#ibm-save-button").addEventListener("click", ibmSave);
  qs("#azure-save-button").addEventListener("click", azureSave);
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
  const statusEl = suffix => qs("#" + config.prefix + suffix)
  const report = (suffix, text) => { const el = statusEl(suffix); el.textContent = text; show(el); }
  return async function() {
    qsa(".status").forEach(hide);
    const values = {};
    for (const f of config.fields) values[f.key] = qs("#" + f.id).value.trim();
    if (config.fields.every(f => values[f.key])) {
      show(statusEl("-progress"));
      try {
        await config.test(values);
        await updateSettings({[config.settingsKey]: config.buildCreds(values)});
        report("-success", config.enabledMessage(values));
        for (const f of config.fields) if (f.obfuscate) qs("#" + f.id).value = obfuscate(values[f.key]);
      }
      catch (err) {
        report("-error", "Test failed: " + err.message);
      }
      finally {
        hide(statusEl("-progress"));
      }
    }
    else if (config.fields.every(f => !values[f.key])) {
      await clearSettings([config.settingsKey]);
      report("-success", config.disabledMessage);
    }
    else {
      report("-error", "Missing required fields.");
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
  buildCreds: v => ({apiKey: v.apiKey, enableStudio: qs("#gcp-enable-studio").checked}),
  enabledMessage: () => qs("#gcp-enable-studio").checked
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
domReady().then(() => {
  const creds$ = observeSetting("openaiCreds")
  const editMode$ = new rxjs.BehaviorSubject(false)
  const status$ = new rxjs.BehaviorSubject({type: "IDLE"})

  rxjs.combineLatest(creds$, editMode$).subscribe(([creds, editMode]) => {
    toggle(qs(".openai .view-new"), creds == null && !editMode)
    toggle(qs(".openai .view-exist"), creds != null && !editMode)
    toggle(qs(".openai .view-edit"), editMode)
  })

  creds$.subscribe(creds => {
    const endpointUrl = creds && creds.url || openaiTtsEngine.defaultEndpointUrl
    const apiKey = creds && creds.apiKey || ""
    const voiceList = creds && creds.voiceList || openaiTtsEngine.defaultVoiceList
    qs(".openai .endpoint-url").textContent = endpointUrl
    qs(".openai .api-key").textContent = apiKey && (apiKey.slice(0,13) + "*****" + apiKey.slice(-5))
    qs(".openai .voice-list").textContent = voiceList.map(x => x.voice).join(", ")
    qs(".openai .txt-endpoint-url").value = endpointUrl
    qs(".openai .txt-api-key").value = apiKey
    qs(".openai .txt-voice-list").value = JSON.stringify(voiceList, null, 2)
  })

  status$.subscribe(status => {
    toggle(qs(".openai .status.progress"), status.type == "PROGRESS")
    toggle(qs(".openai .status.success"), status.type == "SUCCESS")
    const error = qs(".openai .status.error")
    toggle(error, status.type == "ERROR")
    error.textContent = status.type == "ERROR" ? status.error.message : ""
  })

  //actions
  qs(".openai .btn-add").addEventListener("click", () => {
    status$.next({type: "IDLE"})
    editMode$.next(true)
  })
  qs(".openai .btn-edit").addEventListener("click", () => {
    status$.next({type: "IDLE"})
    editMode$.next(true)
  })
  qs(".openai .btn-delete").addEventListener("click", () => {
    clearSettings(["openaiCreds"])
    editMode$.next(false)
  })
  qs(".openai .btn-save").addEventListener("click", async () => {
    try {
      const openaiCreds = {
        url: qs(".openai .txt-endpoint-url").value,
        apiKey: qs(".openai .txt-api-key").value,
        voiceList: JSON.parse(qs(".openai .txt-voice-list").value)
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
  qs(".openai .btn-cancel").addEventListener("click", () => {
    editMode$.next(false)
  })
})
