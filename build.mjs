// Read Aloud build — Phase 1 (concat bundler).
//
// The extension is authored as plain <script> globals with an intentional load
// order (no import/export). This build reproduces that model exactly: for each
// HTML page (and the service worker) it concatenates the same ordered list of
// source files into ONE bundle, preserving the single shared global scope, then
// runs it through esbuild for whitespace minification + sourcemaps.
//
// Deliberately conservative: identifiers and syntax are NOT mangled (no renamed
// functions, no dead-code elimination), so the bundled output is behaviourally
// identical to loading the individual scripts. Real ES-module boundaries arrive
// incrementally in later phases as each area is refactored.
//
// Injected content scripts (js/content/*, js/content.js, page-scripts/*) are
// NOT bundled here — they are injected individually by the scripting API and
// must remain standalone files.

import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(ROOT, "build", "js");

// Each entry = the ordered js/*.js list currently loaded by that surface.
// Keep these in lockstep with the <script> tags in the corresponding *.html
// (and background.js's importScripts for the "background" service-worker entry).
const ENTRIES = {
  "advanced-options": ["rxjs.umd.min", "defaults", "advanced-options"],
  "connect-phone": ["rxjs.umd.min", "defaults", "connect-phone"],
  "custom-voices": ["rxjs.umd.min", "aws-sdk", "defaults", "tts-engines", "custom-voices"],
  "languages": ["rxjs.umd.min", "defaults", "tts-engines", "languages"],
  "offscreen": ["rxjs.umd.min", "defaults", "messaging", "offscreen"],
  "options": ["rxjs.umd.min", "aws-sdk", "defaults", "messaging", "tts-engines", "options"],
  "pdf-viewer": ["rxjs.umd.min", "defaults", "messaging", "pdf-viewer"],
  "player": ["rxjs.umd.min", "peerjs.min", "defaults", "messaging", "google-translate", "aws-sdk", "tts-engines", "speech", "document", "player"],
  "popup": ["rxjs.umd.min", "defaults", "messaging", "popup"],
  "report": ["rxjs.umd.min", "defaults", "report"],
  "shortcuts": ["rxjs.umd.min", "defaults"],
  // Service worker (manifest background.service_worker -> background.js, which
  // importScripts this bundle). Mirrors background.js's original importScripts.
  "background": ["rxjs.umd.min", "defaults", "messaging", "content-handlers", "events"],
};

function readSource(name) {
  const file = path.join(ROOT, "js", name + ".js");
  let code = fs.readFileSync(file, "utf8");
  // Drop any //# sourceMappingURL comments from pre-minified vendor files so
  // they don't leak into the concatenated bundle.
  code = code.replace(/\/\/[#@]\s*sourceMappingURL=.*$/gm, "");
  return `// ==== js/${name}.js ====\n${code}\n`;
}

async function buildEntry(name, files) {
  // Separate each file with a newline + semicolon to guard against ASI hazards
  // at file boundaries (a file ending without ';' followed by one starting with
  // '(' or '[').
  const contents = files.map(readSource).join("\n;\n");
  await esbuild.build({
    stdin: { contents, loader: "js", sourcefile: `${name}.bundle.js`, resolveDir: ROOT },
    bundle: false,          // no import resolution — inputs share one global scope
    minifyWhitespace: true, // safe: strips whitespace only
    minifyIdentifiers: false,
    minifySyntax: false,
    sourcemap: true,
    target: ["chrome99"],
    legalComments: "none",
    outfile: path.join(OUT_DIR, `${name}.js`),
  });
  const bytes = fs.statSync(path.join(OUT_DIR, `${name}.js`)).size;
  return { name, files: files.length, kb: (bytes / 1024).toFixed(1) };
}

async function main() {
  fs.rmSync(path.join(ROOT, "build", "js"), { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results = await Promise.all(
    Object.entries(ENTRIES).map(([name, files]) => buildEntry(name, files))
  );
  for (const r of results.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  build/js/${r.name}.js  (${r.files} files, ${r.kb} KB)`);
  }
  console.log(`Built ${results.length} bundles.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
