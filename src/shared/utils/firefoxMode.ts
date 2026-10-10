const isRealFirefox = () =>
  typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent);

export const isFirefoxLikeBrowser = () => isRealFirefox();
