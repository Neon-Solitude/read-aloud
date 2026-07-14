"use strict";
/*
 * Coverage for the reader-quality text cleanup in js/content/html-doc.js.
 * These are pure string helpers extracted from the (jQuery-bound, individually
 * injected) scraper -- the surrounding DOM code isn't loaded, only the two
 * self-contained functions. removeReferences was added from upstream PR #369
 * to stop inline bibliography markers being read aloud mid-sentence.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadDecls } = require("./harness/extract.js");

const { removeReferences, addMissingPunctuation } = loadDecls(
  "js/content/html-doc.js",
  ["removeReferences", "addMissingPunctuation"]
);

test("removeReferences strips numeric bibliography markers", () => {
  assert.equal(
    removeReferences("As shown by Smith[1] and others[42], this holds."),
    "As shown by Smith and others, this holds."
  );
});

test("removeReferences leaves non-numeric brackets alone", () => {
  assert.equal(removeReferences("see [note] and [a]"), "see [note] and [a]");
});

test("addMissingPunctuation drops refs and still inserts sentence periods", () => {
  // A newline after a word with no terminal punctuation gets a period, and the
  // bracketed ref is gone.
  assert.equal(addMissingPunctuation("finding[3]\n"), "finding.\n");
});
