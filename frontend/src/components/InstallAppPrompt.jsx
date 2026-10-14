import React, { useEffect, useState } from 'react';
export default function InstallAppPrompt() {
  const [prompt, setPrompt] = useState(null); const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const listener = event => { event.preventDefault(); setPrompt(event); };
    const installed = () => { setPrompt(null); setDismissed(true); };
    window.addEventListener('beforeinstallprompt', listener); window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', listener); window.removeEventListener('appinstalled', installed); };
  }, []);
  if (dismissed || window.matchMedia('(display-mode: standalone)').matches) return null;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (!prompt && !ios) return null;
  return <aside className="fixed bottom-24 sm:bottom-6 right-4 left-4 sm:left-auto sm:max-w-sm z-30 bg-white dark:bg-[#201F1C] border rounded-2xl p-4 shadow-xl text-sm space-y-2">
    <p className="font-semibold">Keep your research close</p><p>{ios ? 'In Safari, tap Share, then Add to Home Screen.' : 'Install the archive for an app view and offline library snapshots.'}</p>
    <div className="flex gap-3">{prompt && <button type="button" onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }} className="rounded-lg bg-[#254B40] text-white px-3 py-2">Add to home screen</button>}<button type="button" onClick={() => setDismissed(true)} className="underline">Later</button></div>
  </aside>;
}
