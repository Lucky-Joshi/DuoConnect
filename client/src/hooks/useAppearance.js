import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

const DARK_THEME_COLOR = '#08070f';
const LIGHT_THEME_COLOR = '#f3effb';

/** Applies theme, accent, wallpaper, and motion preferences to the document. */
export function useAppearance() {
  const settings = useAuthStore((state) => state.settings);
  const reduceMotion = useUiStore((state) => state.reduceMotion);
  const theme = settings?.theme ?? 'dark';
  const accent = settings?.accent ?? 'violet';
  const wallpaper = settings?.wallpaper ?? 'aurora';

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const meta = document.querySelector('meta[name="theme-color"]');

    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
      meta?.setAttribute('content', resolved === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
    };

    apply();
    if (theme !== 'system') return undefined;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  useEffect(() => {
    document.documentElement.dataset.wallpaper = wallpaper;
  }, [wallpaper]);

  useEffect(() => {
    if (reduceMotion) document.documentElement.dataset.reducedMotion = 'true';
    else delete document.documentElement.dataset.reducedMotion;
  }, [reduceMotion]);
}
