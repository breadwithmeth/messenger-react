import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/model/authContext';
import { LoginForm } from '@/features/auth/ui/LoginForm';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>SaaS</h1>
        <LoginForm />
      </div>
    </div>
  );
}
