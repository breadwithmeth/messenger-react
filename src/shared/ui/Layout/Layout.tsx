import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { apiClient } from '../../../shared/api/client';
import { NetworkError } from '../../../shared/api/types';
import { workforceApi } from '@/features/workforce/api/workforceApi';
import type { WorkforceActivityDto, WorkforceMessageDto } from '@/features/workforce/model/types';
import { toastEvents } from '@/shared/utils/toast';
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
  const [isPresenceOpen, setIsPresenceOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimeoutsRef = useRef<number[]>([]);
  const [activity, setActivity] = useState<WorkforceActivityDto | null>(null);
  const [isActivityLoading, setIsActivityLoading] = useState(false);
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
    const handleToast = (event: Event) => {
      const custom = event as CustomEvent<{ message?: string }>;
      const message = custom.detail?.message;
      if (message) showToast(message);
    };
    window.addEventListener(toastEvents.name, handleToast);

    return () => {
      window.removeEventListener(LAYOUT_TOGGLE_MENU_EVENT, toggleFromOutside);
      window.removeEventListener(toastEvents.name, handleToast);
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

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setIsActivityLoading(true);
      try {
        const data = await workforceApi.getActivity();
        setActivity(data);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('activity fetch failed', error);
        }
      } finally {
        setIsActivityLoading(false);
      }
    };

    void load();
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
        <main className={isChatsPage ? styles.mainFluid : styles.main}>{children}</main>
      </div>

      {/* {user && (
        <div className={styles.floatingControls}>
          <button
            type="button"
            className={styles.floatingBurger}
            aria-label={isMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
            onClick={() => setIsMenuOpen((v) => !v)}
          >
            {isMenuOpen ? '×' : '☰'}
          </button>
          <button
            type="button"
            className={styles.presenceToggle}
            aria-label={isPresenceOpen ? 'Скрыть активность' : 'Показать активность'}
            onClick={() => setIsPresenceOpen((v) => !v)}
          >
            Активность1
          </button>
        </div>
      )} */}

      {user && isPresenceOpen && (
        <div className={styles.presencePopover} role="dialog" aria-label="Онлайн-активность">
          <div className={styles.presencePopoverHeader}>
            <span>Онлайн-активность</span>
            <button
              type="button"
              className={styles.presenceClose}
              aria-label="Закрыть"
              onClick={() => setIsPresenceOpen(false)}
            >
              ×
            </button>
          </div>
          <PresenceMiniChart activity={activity} isLoading={isActivityLoading} />
        </div>
      )}

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

type PresenceMiniChartProps = {
  activity: WorkforceActivityDto | null;
  isLoading: boolean;
};

function PresenceMiniChart({ activity, isLoading }: PresenceMiniChartProps) {
  const visualization = useMemo(() => {
    if (!activity) return null;
    const width = 240;
    const height = 64;
    const paddingX = 10;
    const paddingY = 8;

    const aggregatedMessages: WorkforceMessageDto[] = [
      ...activity.presenceHistory.flatMap((h) => h.messages),
      ...activity.messages.recent,
    ];

    const rangeFrom = activity.range?.from ? new Date(activity.range.from).getTime() : undefined;
    const rangeTo = activity.range?.to ? new Date(activity.range.to).getTime() : undefined;

    const historyWithTs = activity.presenceHistory.map((h, idx) => ({
      ...h,
      ts: h.changedAt ? new Date(h.changedAt).getTime() : undefined,
      idx,
    }));

    const messageTimestamps = aggregatedMessages
      .map((m) => new Date(m.timestamp).getTime())
      .filter((v) => Number.isFinite(v));

    const knownTs = historyWithTs
      .map((h) => h.ts)
      .filter((v): v is number => typeof v === 'number');

    const minTimeCandidate = [rangeFrom, ...knownTs, ...messageTimestamps].filter((v): v is number => Number.isFinite(v));
    const maxTimeCandidate = [rangeTo, ...knownTs, ...messageTimestamps].filter((v): v is number => Number.isFinite(v));

    if (minTimeCandidate.length === 0 || maxTimeCandidate.length === 0) {
      return null;
    }

    const minTime = Math.min(...minTimeCandidate);
    const maxTime = Math.max(...maxTimeCandidate);
    const range = Math.max(1, maxTime - minTime);

    const syntheticStep = historyWithTs.length > 1 ? range / Math.max(1, historyWithTs.length - 1) : 0;

    const history = historyWithTs
      .map((h) => ({
        ...h,
        ts: h.ts ?? minTime + h.idx * syntheticStep,
      }))
      .sort((a, b) => a.ts - b.ts);

    const getX = (ts: number) => paddingX + ((ts - minTime) / range) * (width - paddingX * 2);

    const segments = history.map((item, idx) => {
      const startX = getX(item.ts);
      const endX = idx < history.length - 1 ? getX(history[idx + 1].ts) : getX(maxTime);
      const color = item.status === 'ONLINE' ? 'var(--success, #16a34a)' : 'var(--danger, #ef4444)';
      return { startX, endX, color, status: item.status };
    });

    const barY = paddingY + 14;

    const messagePoints = aggregatedMessages.map((msg) => {
      const ts = new Date(msg.timestamp).getTime();
      const clampedTs = Math.min(Math.max(ts, minTime), maxTime);
      const x = getX(clampedTs);
      const y = barY;
      return { x, y, direction: msg.direction };
    });

    const minLabel = new Date(minTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const maxLabel = new Date(maxTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return { segments, messagePoints, width, height, paddingX, paddingY, barY, minLabel, maxLabel };
  }, [activity]);

  return (
    <div className={styles.presenceCard}>
      <div className={styles.presenceHeader}>Онлайн-активность</div>
      {isLoading ? (
        <div className={styles.presenceSkeleton} aria-label="Загрузка активности" />
      ) : visualization ? (
        <div className={styles.presenceChartWrapper}>
          <svg
            viewBox={`0 0 ${visualization.width} ${visualization.height}`}
            role="img"
            aria-label="График смены статусов и сообщений"
            className={styles.presenceChart}
          >
            <rect
              x={visualization.paddingX}
              y={visualization.barY - 8}
              width={visualization.width - visualization.paddingX * 2}
              height={16}
              rx={8}
              ry={8}
              className={styles.statusBarBg}
            />
            {visualization.segments.map((seg, idx) => (
              <rect
                key={`${seg.startX}-${seg.endX}-${idx}`}
                x={seg.startX}
                y={visualization.barY - 7}
                width={Math.max(2, seg.endX - seg.startX)}
                height={14}
                rx={6}
                ry={6}
                fill={seg.color}
                opacity={0.9}
              />
            ))}
            {visualization.messagePoints.map((p, idx) => (
              <circle
                key={`${p.x}-${p.y}-${idx}`}
                cx={p.x}
                cy={p.y}
                r={4}
                className={p.direction === 'inbound' ? styles.dotInbound : styles.dotOutbound}
              />
            ))}
            <text x={visualization.paddingX} y={visualization.height - 6} className={styles.presenceAxisLabel}>
              {visualization.minLabel}
            </text>
            <text
              x={visualization.width - visualization.paddingX}
              y={visualization.height - 6}
              className={styles.presenceAxisLabel}
              textAnchor="end"
            >
              {visualization.maxLabel}
            </text>
          </svg>
          <div className={styles.presenceLegend}>
            <span className={styles.legendSwatchOnline}>Online</span>
            <span className={styles.legendSwatchOffline}>Offline</span>
            <span className={styles.legendDotInbound}>Входящие</span>
            <span className={styles.legendDotOutbound}>Исходящие</span>
          </div>
        </div>
      ) : (
        <div className={styles.presenceEmpty}>Нет данных активности</div>
      )}
    </div>
  );
}
