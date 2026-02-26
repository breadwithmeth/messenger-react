import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../features/auth/model/authContext';
import { apiClient } from '../../../shared/api/client';
import { NetworkError } from '../../../shared/api/types';
import { Icon } from '../Icon/Icon';
import styles from './Layout.module.css';

interface LayoutProps {
  children: ReactNode;
}

type ToastItem = {
  id: number;
  message: string;
};

type MenuItem = {
  path: string;
  label: string;
  icon: 'chat' | 'video' | 'ticket' | 'automation' | 'send' | 'api' | 'gear' | 'question';
};

export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isChatsPage = location.pathname.startsWith('/chats');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimeoutsRef = useRef<number[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = localStorage.getItem('theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    return () => {
      toastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      toastTimeoutsRef.current = [];
    };
  }, []);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  const showToast = (message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message }]);

    const timeoutId = window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      toastTimeoutsRef.current = toastTimeoutsRef.current.filter((t) => t !== timeoutId);
    }, 4000);

    toastTimeoutsRef.current.push(timeoutId);
  };

  const handleSimulateError = async () => {
    try {
      await apiClient.get('/__simulate_error__', { requiresAuth: false });
    } catch (error) {
      if (error instanceof NetworkError) {
        showToast(`Ошибка ${error.status}: ${error.message}`);
        return;
      }

      showToast(error instanceof Error ? error.message : 'Симулированная ошибка');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuGroups: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Работа',
      items: [
        { path: '/chats', label: 'Чаты', icon: 'chat' as const },
        { path: '/messenger', label: 'Мессенджер', icon: 'video' as const },
        { path: '/tickets', label: 'Тикеты', icon: 'ticket' as const },
      ],
    },
    {
      title: 'Инструменты',
      items: [
        { path: '/automation', label: 'Автоматизация', icon: 'automation' as const },
        { path: '/mass-operations', label: 'Рассылки и масс. операции', icon: 'send' as const },
        { path: '/api', label: 'API и скрипты', icon: 'api' as const },
      ],
    },
    {
      title: 'Система',
      items: [
        { path: '/settings', label: 'Настройки', icon: 'gear' as const },
        { path: '/help', label: 'Новости и справка', icon: 'question' as const },
      ],
    },
  ];

  const flatMenuItems: MenuItem[] = menuGroups.flatMap((g) => g.items);

  return (
    <div className={styles.layout}>
      {user && (
        <>
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
              {menuGroups.map((group) => (
                <div key={group.title} className={styles.menuGroup}>
                  <div className={styles.menuGroupTitle}>{group.title}</div>
                  <div className={styles.menuItemsBlock}>
                    {group.items.map((item) => {
                      const isActive = location.pathname === item.path;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setIsMenuOpen(false)}
                          className={`${styles.menuItem} ${isActive ? styles.menuItemActive : ''}`}
                        >
                          <span className={styles.menuItemIcon} aria-hidden>
                            <Icon name={item.icon} size={16} />
                          </span>
                          <span className={styles.menuLabel}>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className={styles.sidebarFooter}>
              <div className={styles.starRating}>
                <span className={styles.starCount}>0</span>
              </div>
              <button
                type="button"
                className={styles.themeToggle}
                onClick={toggleTheme}
                aria-label="Сменить тему"
              >
                {theme === 'light' ? '🌙 Тёмная' : '☀️ Светлая'}
              </button>
              <button
                type="button"
                className={styles.simulateErrorButton}
                onClick={() => {
                  void handleSimulateError();
                }}
              >
                Симулировать ошибку
              </button>
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
        {user && (
          <div className={styles.topBar}>
            <button
              type="button"
              className={styles.burgerButton}
              aria-label={isMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
              onClick={() => setIsMenuOpen((v) => !v)}
            >
              {isMenuOpen ? '×' : '☰'}
            </button>

            <nav className={styles.topNav} aria-label="Основное меню">
              {flatMenuItems.map((item: MenuItem) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`${styles.topNavItem} ${isActive ? styles.topNavItemActive : ''}`}
                  >
                    <Icon name={item.icon} size={16} />
                    <span className={styles.topNavLabel}>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
        <main className={isChatsPage ? styles.mainFluid : styles.main}>{children}</main>
      </div>

      {toasts.length > 0 ? (
        <div className={styles.toastContainer} aria-live="polite" aria-atomic="true">
          {toasts.map((toast) => (
            <div key={toast.id} className={styles.toastError} role="status">
              {toast.message}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
