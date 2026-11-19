import { useEffect, useState } from 'react';

/** Exposes the browser's install prompt plus iOS-specific guidance. */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      navigator.standalone === true
    ) {
      setInstalled(true);
    }
    const onPrompt = (event) => {
      event.preventDefault();
      setDeferred(event);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const isIOS =
    typeof navigator !== 'undefined' &&
    typeof window !== 'undefined' &&
    /iPhone|iPad|iPod/.test(navigator.userAgent) &&
    !window.MSStream;

  const install = async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    return choice.outcome === 'accepted';
  };

  return { canInstall: Boolean(deferred), isIOS, installed, install };
}
