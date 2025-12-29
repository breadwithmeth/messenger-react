import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../model/authContext';
import { useForm } from '@/shared/hooks/useForm';
import { Input } from '@/shared/ui/Input/Input';
import { Button } from '@/shared/ui/Button/Button';
import { required, email, composeValidators } from '@/shared/utils/validation';
import { NetworkError } from '@/shared/api/types';
import styles from './LoginForm.module.css';

interface LoginFormValues extends Record<string, string> {
  email: string;
  password: string;
}

export function LoginForm() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string>('');

  const { values, errors, isSubmitting, handleChange, handleSubmit } = useForm<LoginFormValues>({
    initialValues: {
      email: '',
      password: '',
    },
    validators: {
      email: composeValidators(required(), email()),
      password: required(),
    },
    onSubmit: async (formValues) => {
      setServerError('');
      try {
        await login(formValues);
        navigate('/chats');
      } catch (err) {
        if (err instanceof NetworkError) {
          setServerError(err.message);
        } else {
          setServerError('Произошла ошибка. Попробуйте позже.');
        }
      }
    },
  });

  const handleSocialLogin = (provider: string) => {
    console.log(`OAuth ${provider} integration`);
  };

  return (
    <>
      <div className={styles.socialButtons}>
        <button
          type="button"
          className={styles.socialButton}
          onClick={() => handleSocialLogin('Google')}
          aria-label="Войти через Google"
        >
          <span className={styles.icon}>G</span>
        </button>
        <button
          type="button"
          className={styles.socialButton}
          onClick={() => handleSocialLogin('Facebook')}
          aria-label="Войти через Facebook"
        >
          <span className={styles.icon}>f</span>
        </button>
        <button
          type="button"
          className={styles.socialButton}
          onClick={() => handleSocialLogin('Apple')}
          aria-label="Войти через Apple"
        >
          <span className={styles.icon}>🍎</span>
        </button>
      </div>

      <div className={styles.divider}>or</div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <Input
          type="email"
          label="Email"
          placeholder="your@email.com"
          value={values.email}
          onChange={handleChange('email')}
          error={errors.email}
          disabled={isSubmitting}
          autoComplete="email"
        />

        <Input
          type="password"
          label="Пароль"
          placeholder="Введите пароль"
          value={values.password}
          onChange={handleChange('password')}
          error={errors.password}
          disabled={isSubmitting}
          autoComplete="current-password"
        />

        <button
          type="button"
          className={styles.forgotPassword}
          onClick={() => navigate('/forgot-password')}
        >
          Забыли пароль?
        </button>

        {serverError && (
          <div className={styles.error} role="alert">
            {serverError}
          </div>
        )}

        <Button type="submit" fullWidth disabled={isSubmitting}>
          {isSubmitting ? 'Вход...' : 'Войти'}
        </Button>
      </form>

      <div className={styles.footer}>
        У вас нет аккаунта?{' '}
        <a href="/register" className={styles.footerLink}>
          Зарегистрироваться
        </a>
      </div>
    </>
  );
}
