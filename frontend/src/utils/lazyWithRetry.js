import { lazy } from 'react';

// React.lazy for parts of the app that are loaded only when opened (the staff console, large
// windows). One extra rule: right after a new version is published, a browser that still has
// the old page open asks for files that no longer exist. In that case the page is reloaded
// once, which picks up the new version, instead of showing an error.
const RELOAD_FLAG = 'tta:reloaded-for-new-version';
// At most one automatic reload a minute, whichever part failed. A part that keeps failing
// (blocked by a network filter, say) then shows the error screen instead of reloading forever.
const RELOAD_GAP_MS = 60000;

export default function lazyWithRetry(importer) {
  return lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      let alreadyReloaded = true;
      try {
        const last = Number(window.sessionStorage.getItem(RELOAD_FLAG)) || 0;
        alreadyReloaded = Date.now() - last < RELOAD_GAP_MS;
        if (!alreadyReloaded) window.sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
      } catch {
        // storage blocked: do not risk a reload loop
      }
      if (!alreadyReloaded) {
        window.location.reload();
        // Keep showing the loading state while the page reloads
        return new Promise(() => {});
      }
      throw error;
    }
  });
}
