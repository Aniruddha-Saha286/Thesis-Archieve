import { useEffect, useRef } from 'react';

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
