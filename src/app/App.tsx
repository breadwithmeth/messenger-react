import { useState } from 'react';
import { Providers } from './providers';
import { AppRouter } from './router';
import styles from './App.module.css';
import { isFirefoxLikeBrowser } from '../shared/utils/firefoxMode';

export function App() {
  const [isFirefox] = useState(() => isFirefoxLikeBrowser());

  return (
    <Providers>
      {isFirefox ? (
        <div className={styles.browserWarning}>Воспользуйтесь браузером google chrome</div>
      ) : null}
      <AppRouter />
    </Providers>
  );
}
