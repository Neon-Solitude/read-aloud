try {
  // Bundled by build.mjs (concatenation of the same ordered sources).
  importScripts("build/js/background.js")
}
catch (err) {
  console.error(err)
}
