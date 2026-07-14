"use strict";
/*
 * Integrity checks for the language datasets. Phase 4 deduped languageTable and
 * fixed the mojibake; these now assert the data stays clean (no duplicate codes,
 * no replacement characters) so a future edit can't silently reintroduce either.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readSrc, extractDecl } = require("./harness/extract.js");

const tableSrc = extractDecl(readSrc("js/defaults.js"), "languageTable");

// Parse the raw [code, name] pairs from the nameFromCode Map source so we can
// see duplicates that the live Map silently collapses.
const pairs = [...tableSrc.matchAll(/\[\s*(["'])([^"']+)\1\s*,\s*(["'])([^"']*)\3\s*\]/g)].map(
  (m) => ({ code: m[2], name: m[4] })
);

function duplicateCodes() {
  const count = new Map();
  for (const { code } of pairs) count.set(code, (count.get(code) || 0) + 1);
  return [...count.entries()].filter(([, n]) => n > 1).map(([code, n]) => `${code}x${n}`).sort();
}

test("languageTable parses into a non-trivial set of entries", () => {
  assert.ok(pairs.length > 200, `expected >200 entries, got ${pairs.length}`);
});

test("languageTable has no duplicate language codes", () => {
  // Duplicate keys silently collapse in `new Map([...])`, dropping variants.
  assert.deepEqual(duplicateCodes(), []);
});

test("languageTable names are free of mojibake / replacement characters", () => {
  const bad = pairs.filter((p) => /[?�]/.test(p.name)).map((p) => p.name);
  assert.deepEqual(bad, []);
});
