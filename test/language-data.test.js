"use strict";
/*
 * Tripwire for the language datasets. These assert the CURRENT (partly buggy)
 * state so the baseline is green, and act as a checklist for Phase 4, which
 * moves the data to JSON, dedupes it, and fixes the mojibake. When Phase 4
 * lands, flip the two "known issue" tests to assert zero duplicates / no
 * mojibake and remove the documented lists below.
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

test("KNOWN ISSUE (fix in Phase 4): duplicate language codes silently collapse", () => {
  // The live `new Map([...])` keeps only the last value for each duplicate key,
  // dropping the Cyrillic/alternate variants below. Documented, not yet fixed.
  assert.deepEqual(duplicateCodes(), [
    "az-AZx2",
    "es-ESx2",
    "se-FIx3",
    "se-NOx3",
    "se-SEx3",
    "sr-BAx2",
    "sr-SPx2",
    "uz-UZx2",
  ]);
});

test("KNOWN ISSUE (fix in Phase 4): Norwegian names contain mojibake", () => {
  const mojibake = pairs.filter((p) => p.name.includes("?")).map((p) => p.name);
  assert.deepEqual(mojibake, [
    "Norwegian (Bokm?l)",
    "Norwegian (Bokm?l) (Norway)",
  ]);
});
