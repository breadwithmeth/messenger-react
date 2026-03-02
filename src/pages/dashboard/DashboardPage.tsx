import { useAuth } from '@/auth/useAuth';
import { Layout } from '../../shared/ui/Layout/Layout';
import styles from './DashboardPage.module.css';

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <Layout>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Главная панель</h1>
          <p className={styles.subtitle}>
            Добро пожаловать в омниканальную платформу чатов
          </p>
        </header>

        <div className={styles.stats}>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Активных чатов</p>
            <p className={styles.statValue}>0</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Сообщений сегодня</p>
            <p className={styles.statValue}>0</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Операторов онлайн</p>
            <p className={styles.statValue}>1</p>
          </div>
        </div>

        <div className={styles.content}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Информация профиля</h2>
            <ul className={styles.list}>
              <li className={styles.listItem}>
                <span className={styles.listLabel}>Email</span>
                <span className={styles.listValue}>{user?.email}</span>
              </li>
              <li className={styles.listItem}>
                <span className={styles.listLabel}>ID пользователя</span>
                <span className={styles.listValue}>{user?.id}</span>
              </li>
              <li className={styles.listItem}>
                <span className={styles.listLabel}>Статус</span>
                <span className={styles.listValue}>Активен</span>
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Быстрые действия</h2>
            <p className={styles.note}>
              Функционал находится в разработке. Скоро здесь появятся инструменты для управления чатами.
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
