import { useState, type FormEventHandler } from 'react';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/shared/ui/Button/Button';
import styles from './LoginForm.module.css';

export function LoginForm() {
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    setServerError('');
    setIsSubmitting(true);

    void login().catch(() => {
      setServerError('Не удалось выполнить вход через Keycloak. Попробуйте позже.');
      setIsSubmitting(false);
    });
  };

  return (
    <>
      <form onSubmit={handleSubmit} className={styles.form}>
        {serverError && (
          <div className={styles.error} role="alert">
            {serverError}
          </div>
        )}

        <Button type="submit" fullWidth disabled={isSubmitting}>
          {isSubmitting ? 'Переход к Keycloak...' : 'Войти через Keycloak'}
        </Button>
      </form>
    </>
  );
}
