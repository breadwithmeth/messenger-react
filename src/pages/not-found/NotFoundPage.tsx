import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/ui/Button/Button';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <h1 className={styles.code}>404</h1>
      <h2 className={styles.title}>Страница не найдена</h2>
      <p className={styles.description}>
        К сожалению, запрашиваемая страница не существует
      </p>
      <Button onClick={() => navigate('/')} size="large">
        Вернуться на главную
      </Button>
    </div>
  );
}
