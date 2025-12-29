export type ValidationRule<T> = (value: T) => string | null;

export const required = (message = 'Поле обязательно для заполнения'): ValidationRule<string> => {
  return (value: string) => {
    return value.trim() ? null : message;
  };
};

export const email = (message = 'Неверный формат email'): ValidationRule<string> => {
  return (value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value) ? null : message;
  };
};

export const minLength = (length: number, message?: string): ValidationRule<string> => {
  return (value: string) => {
    return value.length >= length
      ? null
      : message || `Минимум ${length} символов`;
  };
};

export const maxLength = (length: number, message?: string): ValidationRule<string> => {
  return (value: string) => {
    return value.length <= length
      ? null
      : message || `Максимум ${length} символов`;
  };
};

export const composeValidators = <T>(...validators: ValidationRule<T>[]): ValidationRule<T> => {
  return (value: T) => {
    for (const validator of validators) {
      const error = validator(value);
      if (error) return error;
    }
    return null;
  };
};
