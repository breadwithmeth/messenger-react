import { Providers } from './providers';
import { AppRouter } from './router';
import styles from './App.module.css';

export function App() {
  const isFirefox =
    typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent);

  return (
    <Providers>
      {isFirefox ? (
        <div className={styles.browserWarning}>Воспользуйтесь браузером google chrome</div>
      ) : null}
      <AppRouter />
    </Providers>
  );
}
