"use strict";
/*
 * Regression baseline for the voice-engine classification predicates in
 * js/defaults.js. Phase 2 introduces an engine registry and Phase 4 turns these
 * into a data table; these tests lock the current routing so those refactors
 * can't silently reroute a voice to the wrong engine.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadDecls } = require("./harness/extract.js");

const V = loadDecls("js/defaults.js", [
  "voiceNameMatches",
  "isGoogleNative",
  "isGoogleTranslate",
  "isAmazonCloud",
  "isMicrosoftCloud",
  "isReadAloudCloud",
  "isAmazonPolly",
  "isGoogleWavenet",
  "isIbmWatson",
  "isOpenai",
  "isAzure",
  "isPiperVoice",
  "isSupertonicVoice",
  "isNghiTtsVoice",
  "isRHVoice",
  "isNativeVoice",
  "isPremiumVoice",
]);

const voice = (name) => ({ voiceName: name });

// name -> the single predicate expected to match it
const cases = [
  ["Google US English", "isGoogleNative"],
  ["GoogleTranslate en-US", "isGoogleTranslate"],
  ["Amazon Joanna", "isAmazonCloud"],
  ["Microsoft David", "isMicrosoftCloud"],
  ["ReadAloud Neural", "isReadAloudCloud"],
  ["AmazonPolly en-US-Joanna", "isAmazonPolly"],
  ["GoogleWavenet en-US-Wavenet-A", "isGoogleWavenet"],
  ["GoogleNeural2 en-US", "isGoogleWavenet"],
  ["IBM-Watson en-US", "isIbmWatson"],
  ["OpenAI alloy", "isOpenai"],
  ["Azure en-US", "isAzure"],
  ["Piper en_US-amy", "isPiperVoice"],
  ["Supertonic en-US", "isSupertonicVoice"],
  ["NghiTTS vi-VN", "isNghiTtsVoice"],
  ["RHVoice Alan", "isRHVoice"],
];

for (const [name, expected] of cases) {
  test(`"${name}" is classified by ${expected}`, () => {
    assert.equal(V[expected](voice(name)), true, `${expected} should match`);
  });
}

test("cloud voices are not native, native voices are", () => {
  assert.equal(V.isNativeVoice(voice("GoogleTranslate en-US")), false);
  assert.equal(V.isNativeVoice(voice("AmazonPolly en-US-Joanna")), false);
  assert.equal(V.isNativeVoice(voice("Azure en-US")), false);
  assert.equal(V.isNativeVoice(voice("Google US English")), true);
  assert.equal(V.isNativeVoice(voice("MacOS Alex")), true);
});

test("isMicrosoftCloud excludes SAPI names containing ' - '", () => {
  assert.equal(V.isMicrosoftCloud(voice("Microsoft David")), true);
  assert.equal(V.isMicrosoftCloud(voice("Microsoft David - English (United States)")), false);
});

test("isPremiumVoice covers Amazon/Microsoft/RHVoice only", () => {
  assert.equal(V.isPremiumVoice(voice("Amazon Joanna")), true);
  assert.equal(V.isPremiumVoice(voice("Microsoft David")), true);
  assert.equal(V.isPremiumVoice(voice("RHVoice Alan")), true);
  assert.equal(V.isPremiumVoice(voice("AmazonPolly en-US-Joanna")), false);
  assert.equal(V.isPremiumVoice(voice("Google US English")), false);
});
