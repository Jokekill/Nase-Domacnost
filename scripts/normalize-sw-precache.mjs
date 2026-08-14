// Fixes precache URLs in public/sw.js after `next build`.
//
// @serwist/next globs the public/ directory for files to precache. On Windows
// glob returns "icons\icon-192.png" and the entry ends up as
// "/icons\icon-192.png" — a URL that only answers 308. Precaching treats a
// redirect as a failed entry, the install step fails and the service worker
// stays in "installing" forever, so nothing is ever cached and the app cannot
// be installed to the home screen. serwist's own manifestTransforms run before
// these entries are appended, which is why this is a post-build step.
//
// On Linux (the Docker build) glob already returns forward slashes and this
// script changes nothing.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const swPath = "public/sw.js";

if (!existsSync(swPath)) {
  // Service worker disabled for this build (dev) — nothing to do.
  process.exit(0);
}

const source = readFileSync(swPath, "utf8");
// Only inside precache entries, never anywhere else in the bundle. A separator
// is written escaped in the bundle ("icons\\icon-192.png" = one backslash in
// the URL), so a whole run of backslashes collapses into a single slash.
let fixedCount = 0;
const fixed = source.replace(/'url':'([^']+)'/g, (match, url) => {
  if (!url.includes("\\")) return match;
  fixedCount += 1;
  return `'url':'${url.replace(/\\+/g, "/")}'`;
});

if (fixedCount > 0) {
  writeFileSync(swPath, fixed);
  console.log(`normalize-sw-precache: opraveno ${fixedCount} cest v ${swPath}`);
}
