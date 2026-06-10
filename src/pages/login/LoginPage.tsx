import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { LoginForm } from '@/features/auth/ui/LoginForm';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Messenger</h1>
        <LoginForm />
      </div>
    </div>
  );
}
