const FIREFOX_MODE_STORAGE_KEY = 'app.forceFirefoxMode.v1';
export const FIREFOX_MODE_EVENT = 'app:firefox-mode-changed';

const isRealFirefox = () =>
  typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent);

export const getFirefoxModeEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(FIREFOX_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

export const setFirefoxModeEnabled = (enabled: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FIREFOX_MODE_STORAGE_KEY, enabled ? '1' : '0');
    window.dispatchEvent(
      new CustomEvent(FIREFOX_MODE_EVENT, {
        detail: { enabled },
      })
    );
  } catch {
    // ignore
  }
};

export const isFirefoxLikeBrowser = () => isRealFirefox() || getFirefoxModeEnabled();
