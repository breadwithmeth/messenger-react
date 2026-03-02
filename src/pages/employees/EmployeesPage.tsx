import { useEffect, useState } from 'react';
import { Layout } from '@/shared/ui/Layout/Layout';
import { workforceApi } from '@/features/workforce/api/workforceApi';
import { NetworkError } from '@/shared/api/types';
import type { EmployeeDto } from '@/features/workforce/model/types';
import styles from './EmployeesPage.module.css';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof NetworkError) {
    if (error.status === 401) {
      return 'Нужно войти заново / нет токена';
    }

    if (error.status === 403) {
      return 'Недостаточно прав (нужна роль admin/supervisor)';
    }

    if (error.status === 502 || error.status === 503) {
      return 'Workforce временно недоступен, попробуйте позже';
    }

    return 'Ошибка загрузки списка сотрудников';
  }

  return 'Ошибка загрузки списка сотрудников';
};

export function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setIsLoading(true);
      setError('');

      try {
        const list = await workforceApi.getEmployees();
        if (cancelled) return;
        setEmployees(Array.isArray(list) ? list : []);
      } catch (e) {
        if (cancelled) return;
        setError(getErrorMessage(e));
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Layout>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Employees</h1>
          <p className={styles.subtitle}>Список сотрудников из Workforce Service (через bm)</p>
        </header>

        {isLoading ? (
          <div className={styles.loadingWrap} aria-label="Загрузка сотрудников">
            <div className={styles.spinner} />
            <span>Загрузка сотрудников...</span>
          </div>
        ) : null}

        {!isLoading && error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}

        {!isLoading && !error ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>username</th>
                  <th>email</th>
                  <th>keycloakId</th>
                  <th>id</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.empty}>
                      Сотрудники не найдены
                    </td>
                  </tr>
                ) : (
                  employees.map((employee) => (
                    <tr key={employee.id}>
                      <td>{employee.username || '—'}</td>
                      <td>{employee.email || '—'}</td>
                      <td className={styles.mono}>{employee.keycloakId}</td>
                      <td className={styles.mono}>{employee.id}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
