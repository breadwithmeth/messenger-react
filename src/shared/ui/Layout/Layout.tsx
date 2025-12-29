import { ReactNode } from 'react';
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
        <aside className={styles.sidebar}>
          <Link to="/" className={styles.logo}>
            SaaS
          </Link>
          
          <div className={styles.menuItem} style={{ marginTop: '32px', marginBottom: '12px', color: '#003d82', fontSize: '12px', fontWeight: '600', paddingLeft: '12px' }}>
            Бесплатный режим
          </div>
          
          <nav className={styles.menu}>
            {menuItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
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
            <button className={styles.userButton} onClick={handleLogout}>
              <span className={styles.userName}>Администратор Г.</span>
            </button>
          </div>
        </aside>
      )}
      
      <div className={styles.mainWrapper}>
        <main className={isChatsPage ? styles.mainFluid : styles.main}>{children}</main>
      </div>
    </div>
  );
}
