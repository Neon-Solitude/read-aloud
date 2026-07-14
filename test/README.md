# Regression test harness

Run with:

```
npm test
```

Zero third-party dependencies — just Node's built-in test runner (`node --test`).

## Why this looks unusual

The extension ships as plain `<script>` globals with **no module system or build
step**, and much of the pure logic worth pinning down (the text breakers and
punctuators in `js/speech.js`, the punctuation fixer in
`js/content/html-doc.js`) lives *nested* inside large constructor functions, so
it can't be reached by loading the file and reading a global.

`harness/extract.js` solves this: it pulls individual declarations out of the
source **by name**, using a tokenizer-aware brace/paren scanner that correctly
skips strings, template literals, regex literals (including `/{2,}/`-style
quantifiers), and both `//` and `/* */` comments — and distinguishes a regex `/`
from a division `/`. Extracted snippets are eval'd in a fresh scope so the pure
functions can be tested in isolation today.

When later phases lift these into real ES modules, point the `loadDecls(...)`
calls at the new module's exports; the assertions stay the same.

## What's covered

| File | Locks down |
|------|-----------|
| `speech-breakers.test.js` | WordBreaker / CharBreaker / Latin & EastAsian punctuators — sentence/phrase splitting, abbreviations, chunk limits |
| `content.test.js` | `fixParagraphs` line-reflow + `paragraphSplitter` |
| `defaults-voices.test.js` | voice→engine classification predicates (routing) |
| `settings-keys.test.js` | `getSettings`/`clearSettings` default-key lists stay in sync |
| `language-data.test.js` | language dataset size + **tripwires** for known bugs |
| `assets.test.js` | every `<script>`/`<link>`/`importScripts`/manifest path exists; version sanity |

## Baseline philosophy

These tests capture **actual current behavior**, not idealized behavior — even
where current behavior is quirky (e.g. the word tokenizer splitting `3.14`).
That makes them a true regression oracle: a refactor that changes output fails
loudly, and any *intended* behavior change is an explicit, reviewed edit here.

## Tripwires for later phases

A few tests assert a **known bug's current state** so the baseline stays green
while flagging work for a later phase. When that phase lands, flip the assertion:

- `language-data.test.js` — duplicate language codes + Norwegian mojibake → **Phase 4**
- `assets.test.js` — manifest (`2.23.0`) vs package (`1.0.1`) version drift → **Phase 7**
