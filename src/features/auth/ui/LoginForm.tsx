import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../model/authContext';
import { useForm } from '@/shared/hooks/useForm';
import { Input } from '@/shared/ui/Input/Input';
import { Button } from '@/shared/ui/Button/Button';
import { required } from '@/shared/utils/validation';
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
      email: required(),
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

  return (
    <>
      <form onSubmit={handleSubmit} className={styles.form}>
        <Input
          type="text"
          label="Логин"
          placeholder="Введите логин"
          value={values.email}
          onChange={handleChange('email')}
          error={errors.email}
          disabled={isSubmitting}
          autoComplete="username"
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

        {serverError && (
          <div className={styles.error} role="alert">
            {serverError}
          </div>
        )}

        <Button type="submit" fullWidth disabled={isSubmitting}>
          {isSubmitting ? 'Вход...' : 'Войти'}
        </Button>
      </form>
    </>
  );
}
