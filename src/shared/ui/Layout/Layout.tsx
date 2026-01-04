import { ReactNode, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../features/auth/model/authContext';
import styles from './Layout.module.css';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isChatsPage = location.pathname.startsWith('/chats');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { path: '/chats', label: 'Чаты' },
    { path: '/messenger', label: 'Мессенджер' },
    { path: '/tickets', label: 'Тикеты' },
    { path: '/automation', label: 'Автоматизация' },
    { path: '/mass-operations', label: 'Рассылки и масс. операции' },
    { path: '/api', label: 'API и скрипты' },
    { path: '/settings', label: 'Настройки' },
    { path: '/help', label: 'Новости и справка' },
  ];

  return (
    <div className={styles.layout}>
      {user && (
        <>
          <button
            type="button"
            className={styles.burgerButton}
            aria-label={isMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
            onClick={() => setIsMenuOpen((v) => !v)}
          >
            {isMenuOpen ? '×' : '☰'}
          </button>

          {isMenuOpen && (
            <button
              type="button"
              className={styles.backdrop}
              aria-label="Закрыть меню"
              onClick={() => setIsMenuOpen(false)}
            />
          )}

          <aside className={`${styles.sidebar} ${isMenuOpen ? styles.sidebarOpen : styles.sidebarClosed}`}>
            <Link
              to="/"
              className={styles.logo}
              onClick={() => setIsMenuOpen(false)}
            >
              SaaS
            </Link>

            <nav className={styles.menu}>
              {menuItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMenuOpen(false)}
                  className={`${styles.menuItem} ${location.pathname === item.path ? styles.menuItemActive : ''}`}
                >
                  <span className={styles.menuLabel}>{item.label}</span>
                </Link>
              ))}
            </nav>

            <div className={styles.sidebarFooter}>
              <div className={styles.starRating}>
                <span className={styles.starCount}>0</span>
              </div>
              <button
                className={styles.userButton}
                onClick={handleLogout}
              >
                <span className={styles.userName}>Администратор Г.</span>
              </button>
            </div>
          </aside>
        </>
      )}
      
      <div className={styles.mainWrapper}>
        <main className={isChatsPage ? styles.mainFluid : styles.main}>{children}</main>
      </div>
    </div>
  );
}
