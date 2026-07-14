"use strict";
/*
 * Regression baseline for the text-chunking core in js/speech.js.
 *
 * WordBreaker / CharBreaker / LatinPunctuator / EastAsianPunctuator are the
 * most intricate pure logic in the codebase and the most likely thing a
 * refactor could silently break (sentence/phrase splitting, abbreviation
 * handling, chunk-size limits). They are currently private nested functions
 * inside Speech(); we extract and test them directly. When Phase 1/7 lifts them
 * into a real module, point the import here at that module — the assertions
 * stay the same.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadDecls } = require("./harness/extract.js");

const {
  LatinPunctuator,
  EastAsianPunctuator,
  WordBreaker,
  CharBreaker,
} = loadDecls("js/speech.js", [
  "LatinPunctuator",
  "EastAsianPunctuator",
  "WordBreaker",
  "CharBreaker",
]);

test("LatinPunctuator splits sentences but keeps abbreviations attached", () => {
  const p = new LatinPunctuator();
  assert.deepEqual(p.getSentences("Hello world. Mr. Smith went home. Bye!"), [
    "Hello world. ",
    "Mr. Smith went home. ",
    "Bye!",
  ]);
});

test("LatinPunctuator getParagraphs splits on blank lines", () => {
  const p = new LatinPunctuator();
  assert.deepEqual(p.getParagraphs("Para one.\n\nPara two."), [
    "Para one.\n\n",
    "Para two.",
  ]);
});

test("LatinPunctuator getPhrases splits on commas/semicolons/dashes", () => {
  const p = new LatinPunctuator();
  assert.deepEqual(p.getPhrases("first, second; third - fourth"), [
    "first, ",
    "second; ",
    "third - ",
    "fourth",
  ]);
});

test("LatinPunctuator getWords tokenization (current behavior baseline)", () => {
  // Note: the current word regex splits inside decimals ("3.14" -> "3.","14")
  // and thousands ("1,000" -> "1,","000"), and keeps trailing whitespace on the
  // token. Locked here as a regression baseline; revisit if intentionally fixed.
  const p = new LatinPunctuator();
  assert.deepEqual(p.getWords("pi is 3.14 and 1,000"), [
    "pi ",
    "is ",
    "3.",
    "14 ",
    "and ",
    "1,",
    "000",
  ]);
});

test("EastAsianPunctuator getWords splits into characters", () => {
  const p = new EastAsianPunctuator();
  assert.deepEqual(p.getWords("你好 世界"), ["你", "好", "世", "界"]);
});

test("EastAsianPunctuator getSentences splits on CJK full stops", () => {
  const p = new EastAsianPunctuator();
  assert.deepEqual(p.getSentences("第一句。第二句。"), ["第一句。", "第二句。"]);
});

test("WordBreaker groups words up to the word limit", () => {
  const wb = new WordBreaker(4, new LatinPunctuator());
  assert.deepEqual(wb.breakText("one two three four five six seven eight"), [
    "one two three four ",
    "five six seven eight",
  ]);
});

test("WordBreaker splits an over-long phrase in half up to the limit", () => {
  const wb = new WordBreaker(3, new LatinPunctuator());
  const out = wb.breakText("alpha beta gamma delta epsilon zeta eta");
  // every chunk must be within the limit
  const p = new LatinPunctuator();
  for (const chunk of out) {
    assert.ok(p.getWords(chunk).length <= 3, "chunk over limit: " + chunk);
  }
  assert.equal(out.join(""), "alpha beta gamma delta epsilon zeta eta");
});

test("CharBreaker keeps chunks within the char limit and preserves content", () => {
  const cb = new CharBreaker(30, new LatinPunctuator());
  const text = "This is a sentence. Here is another one. And a third sentence here.";
  const out = cb.breakText(text);
  for (const chunk of out) {
    assert.ok(chunk.length <= 30, "chunk over limit (" + chunk.length + "): " + chunk);
  }
  // no characters lost or added
  assert.equal(out.join("").replace(/\s+/g, " ").trim(), text.replace(/\s+/g, " ").trim());
});

test("CharBreaker hard-splits a single word longer than the limit", () => {
  const cb = new CharBreaker(5, new LatinPunctuator());
  assert.deepEqual(cb.breakText("abcdefghijk"), ["abcde", "fghij", "k"]);
});
