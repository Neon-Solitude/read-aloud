"use strict";
/*
 * getSettings() and clearSettings() used to hard-code the same default list of
 * setting names in two places (a real drift hazard -- PR #426 had to edit both).
 * Phase 4 hoisted it to a single `defaultSettingsKeys` const; these tests assert
 * both functions reference that const rather than an inline literal, so the two
 * can no longer drift.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readSrc, extractDecl } = require("./harness/extract.js");

const src = readSrc("js/defaults.js");

test("defaultSettingsKeys is a single source containing the core settings", () => {
  const decl = extractDecl(src, "defaultSettingsKeys");
  const keys = JSON.parse(decl.slice(decl.indexOf("[")).replace(/'/g, '"').replace(/;\s*$/, ""));
  for (const k of ["voiceName", "rate", "pitch", "volume"]) {
    assert.ok(keys.includes(k), `missing core setting: ${k}`);
  }
});

test("getSettings and clearSettings both default to defaultSettingsKeys (no inline literal)", () => {
  for (const fn of ["getSettings", "clearSettings"]) {
    const fnSrc = extractDecl(src, fn);
    assert.match(fnSrc, /names \|\| defaultSettingsKeys/, `${fn} should use the shared const`);
    assert.doesNotMatch(fnSrc, /names \|\| \[/, `${fn} should not inline a key array`);
  }
});
