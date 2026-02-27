import { useEffect, useState } from 'react';
import { Providers } from './providers';
import { AppRouter } from './router';
import styles from './App.module.css';
import { FIREFOX_MODE_EVENT, isFirefoxLikeBrowser } from '../shared/utils/firefoxMode';

export function App() {
  const [isFirefox, setIsFirefox] = useState(() => isFirefoxLikeBrowser());

  useEffect(() => {
    const syncFirefoxMode = () => {
      setIsFirefox(isFirefoxLikeBrowser());
    };

    syncFirefoxMode();
    window.addEventListener(FIREFOX_MODE_EVENT, syncFirefoxMode as EventListener);
    window.addEventListener('storage', syncFirefoxMode);

    return () => {
      window.removeEventListener(FIREFOX_MODE_EVENT, syncFirefoxMode as EventListener);
      window.removeEventListener('storage', syncFirefoxMode);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-firefox-mode', isFirefox ? 'on' : 'off');
  }, [isFirefox]);

  return (
    <Providers>
      {isFirefox ? (
        <div className={styles.browserWarning}>Воспользуйтесь браузером google chrome</div>
      ) : null}
      <AppRouter />
    </Providers>
  );
}
