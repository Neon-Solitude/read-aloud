"use strict";
/*
 * Invariant: getSettings() and clearSettings() hard-code the SAME default list
 * of setting names in two places, which must stay in sync (a real hazard —
 * PR #426 had to edit both). Phase 4 collapses these to a single source; until
 * then this test fails loudly if the two lists drift.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readSrc, extractDecl } = require("./harness/extract.js");

const src = readSrc("js/defaults.js");

function defaultKeys(fnName) {
  const fnSrc = extractDecl(src, fnName);
  const m = fnSrc.match(/names\s*\|\|\s*(\[[^\]]*\])/);
  assert.ok(m, `could not find default key array in ${fnName}`);
  return JSON.parse(m[1].replace(/'/g, '"'));
}

test("getSettings and clearSettings default key lists are identical", () => {
  assert.deepEqual(defaultKeys("getSettings"), defaultKeys("clearSettings"));
});

test("default key list contains the core playback settings", () => {
  const keys = defaultKeys("getSettings");
  for (const k of ["voiceName", "rate", "pitch", "volume"]) {
    assert.ok(keys.includes(k), `missing core setting: ${k}`);
  }
});
