import { lazy } from 'react';

const RELOAD_FLAG = 'tta:reloaded-for-new-version';
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
      }
      if (!alreadyReloaded) {
        window.location.reload();
        return new Promise(() => {});
      }
      throw error;
    }
  });
}
