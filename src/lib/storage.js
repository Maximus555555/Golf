export function safeGetLocalStorage(key, fallback = '') {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const value = window.localStorage.getItem(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function safeSetLocalStorage(key, value) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeGetBooleanLocalStorage(key, fallback = false) {
  const value = safeGetLocalStorage(key, null);
  if (value === null) return fallback;
  return value === 'true';
}

export function safeHasLocalStorageKey(key) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}
