"use strict";
/*
 * Regression coverage for makeCredentialForm (custom-voices.js), the shared
 * handler behind the AWS/GCP/IBM/Azure credential panels. Drives its three
 * branches -- all fields filled (test + save), all empty (clear), partial
 * (missing-fields error) -- with a tiny jQuery/settings mock. This is the only
 * coverage for that UI logic, which had none before the Phase 5 dedup.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadDecls } = require("./harness/extract.js");

function harness(fieldValues) {
  const calls = { update: [], clear: [], texts: [], shown: [] };
  const qs = (sel) => ({
    get value() { return fieldValues[sel] || ""; },
    set value(v) {},
    set textContent(t) { calls.texts.push(t); },
    checked: false,
  });
  const qsa = () => [];
  const { makeCredentialForm } = loadDecls("js/custom-voices.js", ["makeCredentialForm", "obfuscate"], {
    qs,
    qsa,
    show: () => { calls.shown.push(true); },
    hide: () => {},
    updateSettings: async (o) => { calls.update.push(o); },
    clearSettings: async (k) => { calls.clear.push(k); },
  });
  return { makeCredentialForm, calls };
}

const CONFIG = (over = {}) => ({
  prefix: "x",
  settingsKey: "xCreds",
  fields: [
    { id: "f1", key: "a", obfuscate: true },
    { id: "f2", key: "b", obfuscate: false },
  ],
  test: async () => {},
  buildCreds: (v) => ({ a: v.a, b: v.b }),
  enabledMessage: () => "enabled msg",
  disabledMessage: "disabled msg",
  ...over,
});

test("all fields filled -> tests, saves creds, shows enabled message", async () => {
  const { makeCredentialForm, calls } = harness({ "#f1": "AAA", "#f2": "BBB" });
  await makeCredentialForm(CONFIG())();
  assert.deepEqual(calls.update, [{ xCreds: { a: "AAA", b: "BBB" } }]);
  assert.deepEqual(calls.clear, []);
  assert.ok(calls.texts.includes("enabled msg"));
});

test("all fields empty -> clears creds, shows disabled message", async () => {
  const { makeCredentialForm, calls } = harness({});
  await makeCredentialForm(CONFIG())();
  assert.deepEqual(calls.clear, [["xCreds"]]);
  assert.deepEqual(calls.update, []);
  assert.ok(calls.texts.includes("disabled msg"));
});

test("partially filled -> reports missing fields, saves nothing", async () => {
  const { makeCredentialForm, calls } = harness({ "#f1": "AAA" });
  await makeCredentialForm(CONFIG())();
  assert.deepEqual(calls.update, []);
  assert.deepEqual(calls.clear, []);
  assert.ok(calls.texts.includes("Missing required fields."));
});

test("a failing test surfaces the error and does not save", async () => {
  const { makeCredentialForm, calls } = harness({ "#f1": "AAA", "#f2": "BBB" });
  await makeCredentialForm(CONFIG({ test: async () => { throw new Error("bad creds"); } }))();
  assert.deepEqual(calls.update, []);
  assert.ok(calls.texts.some((t) => t.includes("Test failed: bad creds")));
});
