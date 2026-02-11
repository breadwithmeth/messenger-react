import { ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../features/auth/model/authContext';
import { Icon } from '../Icon/Icon';
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
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = localStorage.getItem('theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuGroups = [
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

  const flatMenuItems = menuGroups.flatMap((g) => g.items);

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
              {flatMenuItems.map((item) => {
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
    </div>
  );
}
