import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { apiClient } from '../../../shared/api/client';
import { NetworkError } from '../../../shared/api/types';
import { workforceApi } from '@/features/workforce/api/workforceApi';
import { getFirefoxModeEnabled, setFirefoxModeEnabled } from '../../utils/firefoxMode';
import { LAYOUT_TOGGLE_MENU_EVENT } from '../../utils/layoutMenu';
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
  const location = useLocation();
  const isChatsPage = location.pathname.startsWith('/chats');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimeoutsRef = useRef<number[]>([]);
  const [isFirefoxModeEnabled, setIsFirefoxModeEnabledState] = useState<boolean>(() => getFirefoxModeEnabled());
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
    const toggleFromOutside = () => {
      setIsMenuOpen((prev) => !prev);
    };

    window.addEventListener(LAYOUT_TOGGLE_MENU_EVENT, toggleFromOutside);

    return () => {
      window.removeEventListener(LAYOUT_TOGGLE_MENU_EVENT, toggleFromOutside);
      toastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      toastTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const send = async () => {
      try {
        await workforceApi.sendHeartbeat();
      } catch (e) {
        // тихо глотаем, хардбит не блокирует UI
        if (process.env.NODE_ENV === 'development') {
          console.debug('heartbeat failed', e);
        }
      }
    };

    void send();
    const intervalId = window.setInterval(send, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [user]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  const toggleFirefoxMode = () => {
    setIsFirefoxModeEnabledState((prev) => {
      const next = !prev;
      setFirefoxModeEnabled(next);
      showToast(next ? 'Режим фаерфокса включен' : 'Режим фаерфокса выключен');
      return next;
    });
  };

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
    void logout();
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
        { path: '/employees', label: 'Сотрудники', icon: 'gear' as const },
        { path: '/settings', label: 'Настройки', icon: 'gear' as const },
        { path: '/help', label: 'Новости и справка', icon: 'question' as const },
      ],
    },
  ];

  const userName = user?.displayName || user?.username || user?.email || 'Пользователь';

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
                className={`${styles.firefoxModeButton} ${isFirefoxModeEnabled ? styles.firefoxModeButtonActive : ''}`}
                onClick={toggleFirefoxMode}
                aria-label="Переключить режим фаерфокса"
              >
                Режим фаерфокса: {isFirefoxModeEnabled ? 'ON' : 'OFF'}
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
                <span className={styles.userName}>{userName}</span>
              </button>
            </div>
          </aside>
        </>
      )}
      
      <div className={styles.mainWrapper}>
        {user && !isChatsPage && (
          <div className={styles.topBar}>
            <button
              type="button"
              className={styles.burgerButton}
              aria-label={isMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
              onClick={() => setIsMenuOpen((v) => !v)}
            >
              {isMenuOpen ? '×' : '☰'}
            </button>
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
