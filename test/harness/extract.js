"use strict";
/*
 * Hermetic source extractor for the Read Aloud regression harness.
 *
 * The extension ships as plain <script> globals with no module system, and much
 * of the pure logic we want to pin down (text breakers, punctuators, the
 * html-doc punctuation fixer) lives *nested* inside big constructor functions,
 * so it can't be reached by evaluating the file and reading a global.
 *
 * Instead we pull individual declarations out of the source by name using a
 * tokenizer-aware brace/paren scanner (correctly skipping strings, template
 * literals, regex literals and comments), then eval the extracted snippets in a
 * fresh sandbox. This lets us unit-test private pure functions today, before
 * Phase 1 extracts them into real modules — and the same tests keep working
 * afterwards, becoming the regression oracle for every later refactor.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

function readSrc(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

/*
 * Walk `src` starting at `start`, honouring JS lexical context, and return the
 * index just past the end of the top-level statement that begins there.
 *
 * Handles: line comments, block comments, '...' "..." `...` strings (with
 * escapes), and /regex/ literals. Regex-vs-division is decided by the previous
 * significant token: a `/` is division when it follows an identifier char,
 * digit, `)`, `]` or `}`; otherwise it starts a regex.
 *
 * `kind` is "function" (statement ends when the body `{...}` closes) or
 * "var" (ends at the first `;` seen at bracket-depth 0).
 */
function scanStatement(src, start, kind) {
  let i = start;
  const n = src.length;
  let depth = 0;          // nesting of () [] {}
  let sawBody = false;    // for functions: have we entered the body block yet
  let prevSig = "";       // last significant char, for regex detection

  function isRegexContext() {
    // No previous significant char => start of input => regex.
    if (prevSig === "") return true;
    return !/[A-Za-z0-9_$)\]}]/.test(prevSig);
  }

  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];

    // Comments
    if (c === "/" && c2 === "/") {
      i += 2;
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    // Strings / template literals
    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      i++;
      while (i < n) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        i++;
      }
      prevSig = quote;
      continue;
    }

    // Regex literal
    if (c === "/" && isRegexContext()) {
      i++;
      let inClass = false;
      while (i < n) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "[") inClass = true;
        else if (src[i] === "]") inClass = false;
        else if (src[i] === "/" && !inClass) { i++; break; }
        i++;
      }
      // skip flags
      while (i < n && /[a-z]/i.test(src[i])) i++;
      prevSig = "/";
      continue;
    }

    // Brackets
    if (c === "{" || c === "(" || c === "[") {
      depth++;
      if (c === "{" && kind === "function" && !sawBody) sawBody = true;
      i++;
      prevSig = c;
      continue;
    }
    if (c === "}" || c === ")" || c === "]") {
      depth--;
      i++;
      prevSig = c;
      if (kind === "function" && sawBody && depth === 0) return i;
      continue;
    }

    if (c === ";" && depth === 0 && kind === "var") {
      return i + 1;
    }

    if (!/\s/.test(c)) prevSig = c;
    i++;
  }
  return i;
}

/*
 * Extract the full source text of a named top-level or nested declaration.
 * `name` may be a function or a var/let/const. Throws if not found.
 */
function extractDecl(src, name) {
  const re = new RegExp(
    "(?:^|[^\\w$.])((?:async\\s+)?function\\s+" + name + "\\b|" +
    "(?:var|let|const)\\s+" + name + "\\b)"
  );
  const m = re.exec(src);
  if (!m) throw new Error("Declaration not found: " + name);
  const declStart = m.index + m[0].indexOf(m[1]);
  const kind = /^(?:async\s+)?function/.test(m[1]) ? "function" : "var";
  const end = scanStatement(src, declStart, kind);
  return src.slice(declStart, end);
}

/*
 * Extract several declarations from one source file and evaluate them together
 * in a shared scope (so they can reference each other, e.g. isNativeVoice ->
 * isGoogleTranslate). Returns an object mapping each requested name to its
 * evaluated value.
 *
 * `sandbox` supplies any extra globals the snippets read (usually none — these
 * are pure). The snippets run in strict-mode-free Function scope so classic
 * `var`/`function` hoisting works as in the browser.
 */
function loadDecls(relPath, names, sandbox) {
  const src = readSrc(relPath);
  const snippets = names.map((nm) => extractDecl(src, nm));
  const sandboxKeys = Object.keys(sandbox || {});
  const body =
    snippets.join("\n\n") +
    "\n\nreturn {" + names.join(", ") + "};";
  const factory = new Function(...sandboxKeys, body);
  return factory(...sandboxKeys.map((k) => sandbox[k]));
}

module.exports = { ROOT, readSrc, extractDecl, loadDecls, scanStatement };
