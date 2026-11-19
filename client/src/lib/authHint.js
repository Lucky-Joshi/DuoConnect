const AUTH_HINT_KEY = 'duo:auth-hint';

/** Tiny localStorage hint so public routes can avoid flashing for signed-in users. */
export function hasAuthHint() {
  try {
    return localStorage.getItem(AUTH_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAuthHint(active) {
  try {
    if (active) localStorage.setItem(AUTH_HINT_KEY, '1');
    else localStorage.removeItem(AUTH_HINT_KEY);
  } catch {
    // Storage can be unavailable in private browsing; the cookie remains authoritative.
  }
}
