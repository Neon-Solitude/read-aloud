"use strict";
/*
 * Static integrity lint. No logic — just proves that every path the extension
 * loads actually exists on disk. This is the guard rail for Phase 1, where the
 * <script>/importScripts/manifest wiring gets repointed at bundled outputs: if
 * any entry point loses a referenced file, these fail before Chrome ever does.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, readSrc } = require("./harness/extract.js");

const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const stripQuery = (p) => p.split(/[?#]/)[0];
const isLocal = (p) => p && !/^(https?:)?\/\//.test(p) && !p.startsWith("data:");

const htmlFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));

test("there are HTML entry points to check", () => {
  assert.ok(htmlFiles.length > 0);
});

for (const html of htmlFiles) {
  test(`local <script>/<link> paths in ${html} exist`, () => {
    const src = readSrc(html);
    const refs = [
      ...[...src.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/g)].map((m) => m[1]),
      ...[...src.matchAll(/<link[^>]*\shref=["']([^"']+)["']/g)].map((m) => m[1]),
    ].filter(isLocal);
    for (const ref of refs) {
      assert.ok(exists(stripQuery(ref)), `${html} references missing file: ${ref}`);
    }
  });
}

test("background.js importScripts paths exist", () => {
  const src = readSrc("background.js");
  const block = src.match(/importScripts\(([\s\S]*?)\)/);
  assert.ok(block, "no importScripts() call found");
  const paths = [...block[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  assert.ok(paths.length > 0);
  for (const p of paths) assert.ok(exists(p), `missing importScripts target: ${p}`);
});

test("manifest.json referenced files exist", () => {
  const manifest = JSON.parse(readSrc("manifest.json"));
  const checks = [];
  if (manifest.background && manifest.background.service_worker)
    checks.push(manifest.background.service_worker);
  if (manifest.action && manifest.action.default_popup)
    checks.push(stripQuery(manifest.action.default_popup));
  if (manifest.options_page) checks.push(manifest.options_page);
  if (manifest.options_ui && manifest.options_ui.page) checks.push(manifest.options_ui.page);
  for (const size of Object.values(manifest.icons || {})) checks.push(size);

  for (const c of checks) assert.ok(exists(c), `manifest references missing file: ${c}`);

  // web_accessible_resources: check the leading dir of each glob resolves
  for (const entry of manifest.web_accessible_resources || []) {
    for (const res of entry.resources || []) {
      const dir = res.includes("/") ? res.slice(0, res.indexOf("/")) : stripQuery(res);
      assert.ok(exists(dir), `web_accessible_resources dir missing: ${res}`);
    }
  }
});

test("manifest and package versions are valid semver", () => {
  const manifest = JSON.parse(readSrc("manifest.json"));
  const pkg = JSON.parse(readSrc("package.json"));
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
});

test("manifest and package versions agree", () => {
  // Reconciled in Phase 7: package.json (was stale at 1.0.1) now tracks
  // manifest.json, the source of truth. Keep these in lockstep on every release.
  const manifest = JSON.parse(readSrc("manifest.json"));
  const pkg = JSON.parse(readSrc("package.json"));
  assert.equal(manifest.version, pkg.version);
});
