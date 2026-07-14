"use strict";
/*
 * Regression baseline for the paragraph-reflow helper in js/content.js.
 * fixParagraphs stitches PDF/line-wrapped text fragments back into sentences;
 * subtle and easy to regress. Values below are the ACTUAL current outputs.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadDecls } = require("./harness/extract.js");

const { fixParagraphs, paragraphSplitter } = loadDecls("js/content.js", [
  "fixParagraphs",
  "paragraphSplitter",
]);

test("fixParagraphs flushes a paragraph on a blank entry", () => {
  assert.deepEqual(fixParagraphs(["Hello", "", "World."]), ["Hello", "World."]);
});

test("fixParagraphs joins wrapped lines with a space until terminal punctuation", () => {
  assert.deepEqual(fixParagraphs(["This is", "one sentence."]), [
    "This is one sentence.",
  ]);
});

test("fixParagraphs re-joins ASCII hyphenated line breaks without a space", () => {
  assert.deepEqual(fixParagraphs(["frag-", "ment done."]), ["fragment done."]);
});

test("fixParagraphs re-joins em-dash hyphenation without a space", () => {
  assert.deepEqual(fixParagraphs(["line—", "two."]), ["linetwo."]);
});

test("fixParagraphs emits a trailing paragraph lacking terminal punctuation", () => {
  assert.deepEqual(fixParagraphs(["No terminal punct"]), ["No terminal punct"]);
});

test("paragraphSplitter matches two or more newlines", () => {
  assert.ok(paragraphSplitter instanceof RegExp);
  assert.ok(paragraphSplitter.test("a\n\nb"));
  assert.ok(!paragraphSplitter.test("a\nb"));
});
