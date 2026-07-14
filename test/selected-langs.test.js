"use strict";
/*
 * getSelectedLangs (defaults.js) is shared by options.js and languages.js. The
 * subtle part is the "no explicit selection" sentinel: it returns null (which
 * options.js reads as "show all voices" and languages.js coerces to []). These
 * lock the explicit-setting branches, which are pure. The accept-languages
 * derivation branch is a verbatim move of the previous code.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadDecls } = require("./harness/extract.js");

// groupVoicesByLang/getVoiceLanguages/parseLang only need to be in scope (the
// tested branches never call them).
const { getSelectedLangs } = loadDecls("js/defaults.js", [
  "getSelectedLangs",
  "groupVoicesByLang",
  "getVoiceLanguages",
  "parseLang",
]);

test("an explicit languages setting is split into a code array", () => {
  assert.deepEqual(getSelectedLangs({ languages: "en,fr,de" }, [], []), ["en", "fr", "de"]);
});

test('an empty-string languages setting means "all" -> null', () => {
  assert.equal(getSelectedLangs({ languages: "" }, [], []), null);
});
