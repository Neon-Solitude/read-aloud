"use strict";
/*
 * Regression baseline for voice -> engine routing (Speech.pickEngine, now driven
 * by engineRegistry in speech.js). This was previously untestable (a nested
 * if/else ladder inside the Speech constructor). We extract the registry and the
 * predicates it references, wire in sentinel engine stubs, and assert every
 * representative voice resolves to the same engine the original ladder did --
 * including order-sensitive cases and the GoogleTranslate Hebrew/Telugu opt-out.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readSrc, extractDecl } = require("./harness/extract.js");

// Sentinel "engines" so we can assert which one routing picked.
const stubs = {
  piperTtsEngine: "Piper",
  supertonicTtsEngine: "Supertonic",
  nghiTtsEngine: "NghiTTS",
  azureTtsEngine: "Azure",
  openaiTtsEngine: "OpenAI",
  phoneTtsEngine: "Phone",
  googleTranslateTtsEngine: "GoogleTranslate",
  amazonPollyTtsEngine: "AmazonPolly",
  googleWavenetTtsEngine: "GoogleWavenet",
  ibmWatsonTtsEngine: "IbmWatson",
  browserTtsEngine: "Browser",
  premiumTtsEngine: { prepare() {}, name: "Premium" },
  TimeoutTtsEngine: function (base) { this.wraps = base; this.kind = "Timeout"; },
};

// Predicates the registry references (plus their transitive helpers).
const PREDICATES = [
  "voiceNameMatches",
  "isPiperVoice", "isSupertonicVoice", "isNghiTtsVoice", "isAzure", "isOpenai",
  "isUseMyPhone", "isGoogleTranslate", "isAmazonPolly", "isGoogleWavenet",
  "isIbmWatson", "isPremiumVoice", "isReadAloudCloud", "isGoogleNative",
  "isAmazonCloud", "isMicrosoftCloud", "isRHVoice",
];

const defaultsSrc = readSrc("js/defaults.js");
const predSrc = PREDICATES.map((p) => extractDecl(defaultsSrc, p)).join("\n");
const registrySrc = extractDecl(readSrc("js/speech.js"), "engineRegistry");

const keys = Object.keys(stubs);
const engineRegistry = new Function(
  ...keys,
  `${predSrc}\n${registrySrc}\nreturn engineRegistry;`
)(...keys.map((k) => stubs[k]));

// Mirror of Speech.pickEngine's registry lookup.
function pickEngine(voice) {
  const entry = engineRegistry.find((e) => e.match(voice));
  return entry ? entry.get({ voice }) : stubs.browserTtsEngine;
}

const v = (voiceName, extra) => ({ voiceName, ...extra });

const routes = [
  ["Piper en_US-amy", "Piper"],
  ["Supertonic en-US", "Supertonic"],
  ["NghiTTS vi-VN", "NghiTTS"],
  ["Azure en-US - AriaNeural", "Azure"],
  ["OpenAI alloy", "OpenAI"],
  ["GoogleTranslate Spanish", "GoogleTranslate"],
  ["AmazonPolly en-US (Joanna)", "AmazonPolly"],
  ["GoogleWavenet en-US-Wavenet-A", "GoogleWavenet"],
  ["IBM-Watson en-US (Allison)", "IbmWatson"],
  ["Amazon Joanna", "Premium"],        // premium cloud, not AmazonPolly
  ["Microsoft David", "Premium"],
  ["ReadAloud Generic Voice", "Premium"],
];

for (const [name, expected] of routes) {
  test(`"${name}" routes to ${expected}`, () => {
    const picked = pickEngine(v(name));
    const got = picked === stubs.premiumTtsEngine ? "Premium" : picked;
    assert.equal(got, expected);
  });
}

test("isUseMyPhone voice routes to Phone", () => {
  assert.equal(pickEngine({ voiceName: "x", isUseMyPhone: true }), "Phone");
});

test("GoogleTranslate Hebrew/Telugu opt out of GoogleTranslate and fall back to Browser", () => {
  assert.equal(pickEngine(v("GoogleTranslate Hebrew")), "Browser");
  assert.equal(pickEngine(v("GoogleTranslate Telugu")), "Browser");
});

test("Google native voice is wrapped in a TimeoutTtsEngine over the browser engine", () => {
  const picked = pickEngine(v("Google US English"));
  assert.equal(picked.kind, "Timeout");
  assert.equal(picked.wraps, "Browser");
});

test("an unrecognized/native voice falls back to the browser engine", () => {
  assert.equal(pickEngine(v("Alex", { remote: false })), "Browser");
});
