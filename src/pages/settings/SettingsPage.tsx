import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Layout } from '@/shared/ui/Layout/Layout';
import { Button } from '@/shared/ui/Button/Button';
import { Input } from '@/shared/ui/Input/Input';
import { NetworkError } from '@/shared/api/types';
import { useAuth } from '@/auth/useAuth';
import { organizationPhonesApi } from '@/features/organization-phones/api/organizationPhonesApi';
import type { OrganizationPhone } from '@/features/organization-phones/model/types';
import styles from './SettingsPage.module.css';

const ADMIN_ROLE = 'admin';

const mapLoadError = (error: unknown): string => {
  if (error instanceof NetworkError) {
    if (error.status === 401) return 'Нужно войти заново / нет токена';
    if (error.status === 403) return 'Недостаточно прав (нужна роль admin/supervisor)';
    if (error.status === 502 || error.status === 503) {
      return 'Сервис WhatsApp временно недоступен, попробуйте позже';
    }
  }

  return 'Ошибка загрузки списка номеров';
};

const mapActionError = (error: unknown, fallback: string): string => {
  if (error instanceof NetworkError) {
    if (error.status === 401) return 'Нужно войти заново / нет токена';
    if (error.status === 403) return 'Недостаточно прав (нужна роль admin/supervisor)';
    if (error.status === 502 || error.status === 503) {
      return 'Сервис WhatsApp временно недоступен, попробуйте позже';
    }

    if (error.message) return error.message;
  }

  return fallback;
};

export function SettingsPage() {
  const { roles } = useAuth();
  const isAdmin = useMemo(() => roles.includes(ADMIN_ROLE), [roles]);

  const [phones, setPhones] = useState<OrganizationPhone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [createError, setCreateError] = useState('');
  const [actionError, setActionError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [connectingId, setConnectingId] = useState<number | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<number | null>(null);
  const [phoneJid, setPhoneJid] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [generatedQrByPhoneId, setGeneratedQrByPhoneId] = useState<Record<number, string>>({});
  const [openedQrByPhoneId, setOpenedQrByPhoneId] = useState<Record<number, boolean>>({});
  const pollTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const entries = phones.filter((item) => Boolean(item.qrCode));
      if (entries.length === 0) {
        setGeneratedQrByPhoneId({});
        return;
      }

      const next: Record<number, string> = {};

      await Promise.all(
        entries.map(async (item) => {
          if (!item.qrCode) return;

          if (item.qrCode.startsWith('data:image/')) {
            next[item.id] = item.qrCode;
            return;
          }

          try {
            const image = await QRCode.toDataURL(item.qrCode, {
              width: 192,
              margin: 1,
            });
            next[item.id] = image;
          } catch {
            // keep fallback rendering for this entry
          }
        })
      );

      if (!cancelled) {
        setGeneratedQrByPhoneId(next);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [phones]);

  const renderQrCell = (phoneId: number, qrCode: string | null) => {
    if (!qrCode) return '—';

    const isOpened = Boolean(openedQrByPhoneId[phoneId]);

    const generatedImage = generatedQrByPhoneId[phoneId];
    const imageSrc = generatedImage || (qrCode.startsWith('data:image/') ? qrCode : '');

    return (
      <div className={styles.qrCellWrap}>
        <Button
          size="small"
          variant="secondary"
          onClick={() => {
            setOpenedQrByPhoneId((prev) => ({ ...prev, [phoneId]: !isOpened }));
          }}
        >
          {isOpened ? 'Скрыть QR' : 'Показать QR'}
        </Button>

        {isOpened ? (
          imageSrc ? (
            <img src={imageSrc} alt="QR для подключения WhatsApp" className={styles.qrImage} />
          ) : (
            <code className={styles.qrCode}>{qrCode}</code>
          )
        ) : null}
      </div>
    );
  };

  const clearPoll = useCallback(() => {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const loadPhones = useCallback(async () => {
    try {
      const list = await organizationPhonesApi.getAll();
      setPhones(Array.isArray(list) ? list : []);
      setError('');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      setError(mapLoadError(e));
      return [] as OrganizationPhone[];
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const run = async () => {
      setIsLoading(true);
      const list = await loadPhones();
      if (!mounted) return;
      setIsLoading(false);

      const shouldPoll = list.some((item) => item.status === 'pending' || Boolean(item.qrCode));
      if (shouldPoll) {
        clearPoll();
        pollTimeoutRef.current = window.setTimeout(() => {
          void run();
        }, 2500);
      }
    };

    void run();

    return () => {
      mounted = false;
      clearPoll();
    };
  }, [clearPoll, isAdmin, loadPhones]);

  const handleCreate = async () => {
    const nextPhoneJid = phoneJid.trim();
    const nextDisplayName = displayName.trim();

    if (!nextPhoneJid || !nextDisplayName) {
      setCreateError('Заполните phoneJid и displayName');
      return;
    }

    setIsCreating(true);
    setCreateError('');
    setActionError('');

    try {
      await organizationPhonesApi.create({
        phoneJid: nextPhoneJid,
        displayName: nextDisplayName,
      });

      setPhoneJid('');
      setDisplayName('');
      await loadPhones();
    } catch (e) {
      setCreateError(mapActionError(e, 'Не удалось создать номер'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleConnect = async (id: number) => {
    setConnectingId(id);
    setActionError('');

    try {
      await organizationPhonesApi.connect(id);
      await loadPhones();
      clearPoll();
      pollTimeoutRef.current = window.setTimeout(() => {
        void loadPhones();
      }, 1800);
    } catch (e) {
      setActionError(mapActionError(e, 'Не удалось инициировать подключение'));
    } finally {
      setConnectingId(null);
    }
  };

  const handleDisconnect = async (id: number) => {
    setDisconnectingId(id);
    setActionError('');

    try {
      await organizationPhonesApi.disconnect(id);
      await loadPhones();
    } catch (e) {
      setActionError(mapActionError(e, 'Не удалось отключить номер'));
    } finally {
      setDisconnectingId(null);
    }
  };

  return (
    <Layout>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Настройки</h1>
          <p className={styles.subtitle}>Управление номерами телефонов организации (WhatsApp)</p>
        </header>

        {!isAdmin ? (
          <div className={styles.error} role="alert">
            Недостаточно прав (нужна роль admin/supervisor)
          </div>
        ) : (
          <section className={styles.section} aria-label="Управление номерами WhatsApp">
            <h2 className={styles.sectionTitle}>Номера WhatsApp</h2>

            <div className={styles.createRow}>
              <Input
                value={phoneJid}
                onChange={(e) => setPhoneJid(e.target.value)}
                placeholder="79001112233@s.whatsapp.net"
                aria-label="phoneJid"
              />
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Main WA"
                aria-label="displayName"
              />
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating ? 'Создание...' : 'Создать номер'}
              </Button>
            </div>

            {createError ? <div className={styles.error}>{createError}</div> : null}
            {actionError ? <div className={styles.error}>{actionError}</div> : null}

            {isLoading ? (
              <div className={styles.loadingWrap} aria-label="Загрузка номеров">
                <div className={styles.spinner} />
                <span>Загрузка...</span>
              </div>
            ) : error ? (
              <div className={styles.error} role="alert">{error}</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>displayName</th>
                      <th>phoneJid</th>
                      <th>status</th>
                      <th>QR</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {phones.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={styles.empty}>Номера не найдены</td>
                      </tr>
                    ) : (
                      phones.map((item) => (
                        <tr key={item.id}>
                          <td>{item.displayName || '—'}</td>
                          <td className={styles.mono}>{item.phoneJid}</td>
                          <td>{item.status}</td>
                          <td className={styles.qrCell}>{renderQrCell(item.id, item.qrCode)}</td>
                          <td>
                            <div className={styles.actions}>
                              <Button
                                size="small"
                                variant="secondary"
                                disabled={connectingId === item.id}
                                onClick={() => {
                                  void handleConnect(item.id);
                                }}
                              >
                                {connectingId === item.id ? 'Подключение...' : 'Connect'}
                              </Button>
                              <Button
                                size="small"
                                variant="secondary"
                                disabled={disconnectingId === item.id}
                                onClick={() => {
                                  void handleDisconnect(item.id);
                                }}
                              >
                                {disconnectingId === item.id ? 'Отключение...' : 'Disconnect'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </Layout>
  );
}
