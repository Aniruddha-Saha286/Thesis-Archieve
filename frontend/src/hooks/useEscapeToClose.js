import { useEffect, useRef } from 'react';

// Escape closes the window on top, and only that one.
//
// Several windows can be open at once (paper details with Cite above it). Every open window
// registers here; one shared key listener calls the newest one. So Escape steps back one
// window at a time, the same as pressing each window's own close button.
const openWindows = [];
let listening = false;

function handleKeyDown(event) {
  if (event.key !== 'Escape' || event.defaultPrevented || openWindows.length === 0) return;
  const top = openWindows[openWindows.length - 1];
  if (top && typeof top.current === 'function') {
    event.preventDefault();
    top.current();
  }
}

export default function useEscapeToClose(onClose, isOpen = true) {
  // Always call the latest onClose without re-registering on every render
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;

    openWindows.push(closeRef);
    if (!listening) {
      document.addEventListener('keydown', handleKeyDown);
      listening = true;
    }

    return () => {
      const index = openWindows.lastIndexOf(closeRef);
      if (index !== -1) openWindows.splice(index, 1);
      if (openWindows.length === 0 && listening) {
        document.removeEventListener('keydown', handleKeyDown);
        listening = false;
      }
    };
  }, [isOpen]);
}
