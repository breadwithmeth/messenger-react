import { ReactNode, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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

const Theme3DBackground = lazy(() =>
  import('../Theme3DBackground/Theme3DBackground').then((module) => ({
    default: module.Theme3DBackground,
  }))
);

interface LayoutProps {
  children: ReactNode;
}

type ThemeName = 'light' | 'dark' | 'calm-oasis' | 'retro8' | 'barbie-diary' | 'minecraft' | 'minecraft-nether';
type CrtLevel = 'soft' | 'arcade' | 'crt' | 'vhs';
type SecretThemeKey = 'retro8' | 'barbie-diary' | 'minecraft' | 'minecraft-nether';

type SecretThemesState = {
  retro8: boolean;
  'barbie-diary': boolean;
  minecraft: boolean;
  'minecraft-nether': boolean;
};

const SECRET_THEMES_STORAGE_KEY = 'secret-themes-unlocked';
const RETRO_UNLOCK_SEQUENCE = ['r', 'e', 't', 'r', 'o'] as const;
const BARBIE_UNLOCK_SEQUENCE = ['b', 'a', 'r', 'b', 'i', 'e'] as const;
const MINECRAFT_UNLOCK_SEQUENCE = ['m', 'i', 'n', 'e', 'c', 'r', 'a', 'f', 't'] as const;
const NETHER_UNLOCK_SEQUENCE = ['n', 'e', 't', 'h', 'e', 'r'] as const;

const readSecretThemesState = (): SecretThemesState => {
  if (typeof window === 'undefined') {
    return { retro8: false, 'barbie-diary': false, minecraft: false, 'minecraft-nether': false };
  }

  const raw = localStorage.getItem(SECRET_THEMES_STORAGE_KEY);
  if (!raw) {
    return { retro8: false, 'barbie-diary': false, minecraft: false, 'minecraft-nether': false };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SecretThemesState>;
    return {
      retro8: parsed.retro8 === true,
      'barbie-diary': parsed['barbie-diary'] === true,
      minecraft: parsed.minecraft === true,
      'minecraft-nether': parsed['minecraft-nether'] === true,
    };
  } catch {
    return { retro8: false, 'barbie-diary': false, minecraft: false, 'minecraft-nether': false };
  }
};

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
  const [isTrackingLossActive, setIsTrackingLossActive] = useState(false);
  const [isRetroSfxEnabled, setIsRetroSfxEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('retro-sfx') !== 'off';
  });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [crtLevel, setCrtLevel] = useState<CrtLevel>(() => {
    if (typeof window === 'undefined') return 'crt';
    const saved = localStorage.getItem('crt-level');
    return saved === 'soft' || saved === 'arcade' || saved === 'crt' || saved === 'vhs' ? saved : 'crt';
  });
  const toastTimeoutsRef = useRef<number[]>([]);
  const trackingLossTimeoutRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [activity, setActivity] = useState<WorkforceActivityDto | null>(null);
  const [isActivityLoading, setIsActivityLoading] = useState(false);
  const [isFirefoxModeEnabled, setIsFirefoxModeEnabledState] = useState<boolean>(() => getFirefoxModeEnabled());
  const [secretThemes, setSecretThemes] = useState<SecretThemesState>(() => readSecretThemesState());
  const [theme, setTheme] = useState<ThemeName>(() => {
    if (typeof window === 'undefined') return 'light';
    const unlocked = readSecretThemesState();
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    if (saved === 'calm-oasis') return saved;
    if (saved === 'retro8' && unlocked.retro8) return saved;
    if (saved === 'barbie-diary' && unlocked['barbie-diary']) return saved;
    if (saved === 'minecraft' && unlocked.minecraft) return saved;
    if (saved === 'minecraft-nether' && unlocked['minecraft-nether']) return saved;
    return 'light';
  });
  const comboBufferRef = useRef<string[]>([]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(SECRET_THEMES_STORAGE_KEY, JSON.stringify(secretThemes));
  }, [secretThemes]);

  useEffect(() => {
    const isRetroLocked = theme === 'retro8' && !secretThemes.retro8;
    const isBarbieLocked = theme === 'barbie-diary' && !secretThemes['barbie-diary'];
    const isMinecraftLocked = theme === 'minecraft' && !secretThemes.minecraft;
    const isNetherLocked = theme === 'minecraft-nether' && !secretThemes['minecraft-nether'];
    if (isRetroLocked || isBarbieLocked || isMinecraftLocked || isNetherLocked) {
      setTheme('light');
    }
  }, [secretThemes, theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-crt-level', crtLevel);
    localStorage.setItem('crt-level', crtLevel);
  }, [crtLevel]);

  useEffect(() => {
    localStorage.setItem('retro-sfx', isRetroSfxEnabled ? 'on' : 'off');
  }, [isRetroSfxEnabled]);

  const playRetroTone = (frequency: number, duration = 0.05, type: OscillatorType = 'square', gain = 0.025) => {
    if (typeof window === 'undefined') return;
    if (theme !== 'retro8' || !isRetroSfxEnabled) return;
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new Ctx();
    }

    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
  };

  useEffect(() => {
    const toggleFromOutside = () => {
      setIsMenuOpen((prev) => !prev);
    };

    window.addEventListener(LAYOUT_TOGGLE_MENU_EVENT, toggleFromOutside);
    const handleGlobalClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const interactive = target.closest('button, a, [role="button"], input, select, textarea');
      if (!interactive) return;
      playRetroTone(660, 0.045, 'square', 0.02);
    };
    const handleToast = (event: Event) => {
      const custom = event as CustomEvent<{ message?: string }>;
      const message = custom.detail?.message;
      if (message) showToast(message);
      playRetroTone(420, 0.09, 'triangle', 0.03);
    };
    document.addEventListener('click', handleGlobalClick, true);
    window.addEventListener(toastEvents.name, handleToast);

    return () => {
      window.removeEventListener(LAYOUT_TOGGLE_MENU_EVENT, toggleFromOutside);
      document.removeEventListener('click', handleGlobalClick, true);
      window.removeEventListener(toastEvents.name, handleToast);
      toastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      toastTimeoutsRef.current = [];
      if (trackingLossTimeoutRef.current) {
        window.clearTimeout(trackingLossTimeoutRef.current);
        trackingLossTimeoutRef.current = null;
      }
      document.documentElement.removeAttribute('data-tracking-loss');
    };
  }, [theme, isRetroSfxEnabled]);

  useEffect(() => {
    if (theme === 'retro8') return;
    setIsTrackingLossActive(false);
    if (trackingLossTimeoutRef.current) {
      window.clearTimeout(trackingLossTimeoutRef.current);
      trackingLossTimeoutRef.current = null;
    }
    document.documentElement.removeAttribute('data-tracking-loss');
  }, [theme]);

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

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable) return true;
      return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    };

    const unlockTheme = (themeKey: SecretThemeKey, message: string) => {
      setSecretThemes((prev) => {
        if (prev[themeKey]) return prev;
        showToast(message);
        return { ...prev, [themeKey]: true };
      });
    };

    const endsWithSequence = (buffer: string[], sequence: readonly string[]) => {
      if (buffer.length < sequence.length) return false;
      const start = buffer.length - sequence.length;
      for (let i = 0; i < sequence.length; i += 1) {
        if (buffer[start + i] !== sequence[i]) return false;
      }
      return true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if (!key) return;

      comboBufferRef.current.push(key);
      if (comboBufferRef.current.length > 20) {
        comboBufferRef.current = comboBufferRef.current.slice(-20);
      }

      if (endsWithSequence(comboBufferRef.current, RETRO_UNLOCK_SEQUENCE)) {
        unlockTheme('retro8', 'Секретная тема 8-bit разблокирована');
        return;
      }

      if (endsWithSequence(comboBufferRef.current, BARBIE_UNLOCK_SEQUENCE)) {
        unlockTheme('barbie-diary', 'Секретная тема Barbie Diary разблокирована');
        return;
      }

      if (endsWithSequence(comboBufferRef.current, MINECRAFT_UNLOCK_SEQUENCE)) {
        unlockTheme('minecraft', 'Секретная тема Minecraft разблокирована');
        setTheme('minecraft');
        return;
      }

      if (endsWithSequence(comboBufferRef.current, NETHER_UNLOCK_SEQUENCE)) {
        unlockTheme('minecraft-nether', 'Секретная тема Minecraft: Nether разблокирована');
        setTheme('minecraft-nether');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const availableThemes = useMemo<ThemeName[]>(() => {
    const themes: ThemeName[] = ['light', 'calm-oasis', 'dark'];
    if (secretThemes.retro8) themes.push('retro8');
    if (secretThemes['barbie-diary']) themes.push('barbie-diary');
    if (secretThemes.minecraft) themes.push('minecraft');
    if (secretThemes['minecraft-nether']) themes.push('minecraft-nether');
    return themes;
  }, [secretThemes]);

  const toggleTheme = () => {
    setTheme((current) => {
      const index = availableThemes.indexOf(current);
      const nextIndex = index === -1 ? 0 : (index + 1) % availableThemes.length;
      return availableThemes[nextIndex];
    });
  };

  const nextTheme = useMemo<ThemeName>(() => {
    const index = availableThemes.indexOf(theme);
    const nextIndex = index === -1 ? 0 : (index + 1) % availableThemes.length;
    return availableThemes[nextIndex];
  }, [availableThemes, theme]);

  const nextThemeLabel =
    nextTheme === 'light'
      ? '☀️ Светлая'
      : nextTheme === 'calm-oasis'
        ? '🍃 Calm Oasis'
      : nextTheme === 'dark'
        ? '🌙 Тёмная'
        : nextTheme === 'retro8'
          ? '🕹 8-bit'
          : nextTheme === 'barbie-diary'
            ? '💖 Barbie Diary'
            : nextTheme === 'minecraft'
              ? '⛏ Minecraft'
              : '🔥 Nether';

  const toggleFirefoxMode = () => {
    setIsFirefoxModeEnabledState((prev) => {
      const next = !prev;
      setFirefoxModeEnabled(next);
      showToast(next ? 'Режим фаерфокса включен' : 'Режим фаерфокса выключен');
      return next;
    });
  };

  const triggerTrackingLoss = () => {
    if (theme !== 'retro8') {
      showToast('Tracking Loss доступен только в теме 8-bit');
      return;
    }

    setIsTrackingLossActive(true);
    document.documentElement.setAttribute('data-tracking-loss', 'on');

    if (trackingLossTimeoutRef.current) {
      window.clearTimeout(trackingLossTimeoutRef.current);
    }

    trackingLossTimeoutRef.current = window.setTimeout(() => {
      document.documentElement.removeAttribute('data-tracking-loss');
      setIsTrackingLossActive(false);
      trackingLossTimeoutRef.current = null;
    }, 1800);
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
  const isThreeDTheme = theme === 'minecraft' || theme === 'minecraft-nether';

  return (
    <div className={styles.layout}>
      {isThreeDTheme ? (
        <div className={styles.threeScene} aria-hidden>
          <Suspense fallback={null}>
            <Theme3DBackground theme={theme} />
          </Suspense>
        </div>
      ) : null}

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
                {nextThemeLabel}
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
                type="button"
                className={`${styles.trackingLossButton} ${isTrackingLossActive ? styles.trackingLossButtonActive : ''}`}
                onClick={triggerTrackingLoss}
                disabled={theme !== 'retro8'}
                aria-label="Включить VHS tracking loss"
                title={theme === 'retro8' ? 'Срыв синхронизации VHS' : 'Доступно только в теме 8-bit'}
              >
                VHS: Tracking Loss
              </button>
              <button
                type="button"
                className={`${styles.trackingLossButton} ${isRetroSfxEnabled ? styles.trackingLossButtonActive : ''}`}
                onClick={() => setIsRetroSfxEnabled((prev) => !prev)}
                disabled={theme !== 'retro8'}
                aria-label="Переключить ретро звук"
                title={theme === 'retro8' ? 'Ретро звуки UI' : 'Доступно только в теме 8-bit'}
              >
                SFX: {isRetroSfxEnabled ? 'ON' : 'OFF'}
              </button>
              <label className={styles.crtLabel}>
                Scanline Intensity
                <select
                  className={styles.crtSelect}
                  value={crtLevel}
                  onChange={(event) => setCrtLevel(event.target.value as CrtLevel)}
                  disabled={theme !== 'retro8'}
                  aria-label="CRT intensity"
                >
                  <option value="soft">Soft</option>
                  <option value="arcade">Arcade</option>
                  <option value="crt">CRT</option>
                  <option value="vhs">VHS Broken</option>
                </select>
              </label>
              <button
                type="button"
                className={styles.themeToggle}
                onClick={() => setIsPresenceOpen((v) => !v)}
                aria-expanded={isPresenceOpen}
                aria-controls="presence-popover"
              >
                Онлайн-активность
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
        <main id="main-content" tabIndex={-1} className={isChatsPage ? styles.mainFluid : styles.main}>
          {children}
        </main>
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
        <div
          className={styles.presencePopover}
          role="dialog"
          aria-label="Онлайн-активность"
          id="presence-popover"
        >
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
    const presenceHistory = Array.isArray(activity.presenceHistory) ? activity.presenceHistory : [];
    const recentMessages = Array.isArray(activity.messages?.recent) ? activity.messages?.recent ?? [] : [];

    const aggregatedMessages: WorkforceMessageDto[] = [
      ...presenceHistory.flatMap((h) => h.messages ?? []),
      ...recentMessages,
    ];

    const rangeFrom = activity.range?.from ? new Date(activity.range.from).getTime() : undefined;
    const rangeTo = activity.range?.to ? new Date(activity.range.to).getTime() : undefined;

    const historyWithTs = presenceHistory.map((h, idx) => ({
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

    if (history.length === 0) return null;

    const statusValue = (status: string) => (status === 'ONLINE' ? 1 : 0);

    const chartData: { ts: number; status: number; statusLabel: string }[] = [];
    const firstStatus = history[0]?.status ?? 'OFFLINE';
    chartData.push({ ts: minTime, status: statusValue(firstStatus), statusLabel: firstStatus });

    history.forEach((item) => {
      chartData.push({ ts: item.ts, status: statusValue(item.status), statusLabel: item.status });
    });

    const lastStatus = history[history.length - 1]?.status ?? firstStatus;
    chartData.push({ ts: maxTime, status: statusValue(lastStatus), statusLabel: lastStatus });

    const messagesData = aggregatedMessages.map((msg) => {
      const ts = new Date(msg.timestamp).getTime();
      const clampedTs = Math.min(Math.max(ts, minTime), maxTime);
      return { ts: clampedTs, y: 1.12, direction: msg.direction };
    });

    return {
      chartData,
      messagesData,
      minTime,
      maxTime,
    };
  }, [activity]);

  const renderTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const point = payload[0];
    const ts: number | undefined = point?.payload?.ts;
    if (!ts) return null;
    const statusPayload = payload.find((p: any) => p.dataKey === 'status');
    const statusLabel = statusPayload?.payload?.statusLabel;
    const directions = payload
      .filter((p: any) => p.name === 'messages' || p.dataKey === 'y')
      .map((p: any) => p.payload?.direction)
      .filter(Boolean);

    return (
      <div className={styles.tooltipBox}>
        <div className={styles.tooltipLine}>{new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
        {statusLabel ? <div className={styles.tooltipLine}>Статус: {statusLabel}</div> : null}
        {directions.length ? <div className={styles.tooltipLine}>Сообщения: {directions.join(', ')}</div> : null}
      </div>
    );
  };

  return (
    <div className={styles.presenceCard}>
      <div className={styles.presenceHeaderRow}>
        <div className={styles.presenceHeader}>Онлайн-активность</div>
      </div>
      {isLoading ? (
        <div className={styles.presenceSkeleton} aria-label="Загрузка активности" />
      ) : visualization ? (
        <div className={styles.presenceChartWrapper}>
          <div className={styles.presenceChart}>
            <ResponsiveContainer width="100%" height={90}>
              <ComposedChart data={visualization.chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border, #dbeafe)" />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={[visualization.minTime, visualization.maxTime]}
                  tickFormatter={(ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  tick={{ fontSize: 10, fill: 'var(--text-subtle)' }}
                  axisLine={false}
                  tickLine={false}
                  stroke="var(--text-subtle)"
                />
                <YAxis hide domain={[-0.2, 1.4]} />
                <Tooltip content={renderTooltip} wrapperStyle={{ outline: 'none' }} />
                <Area
                  dataKey="status"
                  type="stepAfter"
                  stroke="var(--primary, #2f63e4)"
                  fill="var(--primary, #2f63e4)"
                  fillOpacity={0.18}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <Scatter
                  data={visualization.messagesData}
                  name="messages"
                  dataKey="y"
                  yAxisId={0}
                  shape={(props: { cx?: number; cy?: number; payload?: { direction?: string } }) => {
                    const direction = props.payload?.direction;
                    const color = direction === 'inbound' ? 'var(--success, #16a34a)' : 'var(--warning, #f59e0b)';
                    return (
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={4}
                        fill={color}
                        stroke="var(--surface, #fff)"
                        strokeWidth={1.5}
                      />
                    );
                  }}
                  line={false}
                  isAnimationActive={false}
                />
                <Brush
                  dataKey="ts"
                  height={14}
                  stroke="var(--primary, #2f63e4)"
                  travellerWidth={8}
                  tickFormatter={(ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
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
