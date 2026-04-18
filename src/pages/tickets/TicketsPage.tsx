import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '@/shared/ui/Layout/Layout';
import { Button } from '@/shared/ui/Button/Button';
import { NetworkError } from '@/shared/api/types';
import { ticketsApi } from '@/features/tickets/api/ticketsApi';
import type {
  Ticket,
  TicketPagination,
  TicketPriority,
  TicketStats,
  TicketStatus,
} from '@/features/tickets/model/types';
import styles from './TicketsPage.module.css';

const DEFAULT_PAGINATION: TicketPagination = {
  total: 0,
  page: 1,
  limit: 20,
  pages: 0,
};

const STATUS_OPTIONS: TicketStatus[] = ['new', 'open', 'in_progress', 'pending', 'resolved', 'closed'];
const PRIORITY_OPTIONS: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];

type TicketHistoryEntry = {
  id: string;
  action: string;
  createdAt?: string;
  actor: string;
  from?: string;
  to?: string;
  note?: string;
};

const formatDate = (value?: string) => {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getErrorText = (error: unknown, fallback: string) => {
  if (error instanceof NetworkError) {
    if (error.status === 401) return 'Нужно войти заново / нет токена';
    if (error.status === 404) return 'Тикет или ресурс не найден';
    if (error.status === 500) return 'Внутренняя ошибка сервера';
    if (error.message) return error.message;
  }

  return fallback;
};

const toText = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
};

const normalizeHistory = (items: unknown[]): TicketHistoryEntry[] => {
  return items
    .reduce<TicketHistoryEntry[]>((acc, raw, index) => {
      if (!raw || typeof raw !== 'object') {
        return acc;
      }

      const row = raw as Record<string, unknown>;
      const actorData = (row.user ?? row.actor ?? row.by) as Record<string, unknown> | undefined;

      acc.push({
        id: toText(row.id) || toText(row.historyId) || `history-${index}`,
        action: toText(row.action) || toText(row.type) || toText(row.event) || 'Обновление тикета',
        createdAt: toText(row.createdAt) || toText(row.timestamp) || toText(row.date),
        actor:
          toText(actorData?.username)
          || toText(actorData?.email)
          || toText(actorData?.name)
          || toText(row.actorName)
          || 'Система',
        from: toText(row.from) || toText(row.previousValue),
        to: toText(row.to) || toText(row.nextValue),
        note: toText(row.note) || toText(row.reason) || toText(row.message),
      });
      return acc;
    }, [])
    .sort((a, b) => {
      const aTs = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTs = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTs - aTs;
    });
};

export function TicketsPage() {
  const [searchParams] = useSearchParams();
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [pagination, setPagination] = useState<TicketPagination>(DEFAULT_PAGINATION);
  const [status, setStatus] = useState<string>('');
  const [priority, setPriority] = useState<string>('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTicketNumber, setSelectedTicketNumber] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<TicketHistoryEntry[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [statusUpdatingTicket, setStatusUpdatingTicket] = useState<string | null>(null);
  const [statusUpdateError, setStatusUpdateError] = useState('');

  useEffect(() => {
    const ticketFromUrl = searchParams.get('ticketNumber') || '';
    if (ticketFromUrl) {
      setTicketNumber(ticketFromUrl);
      setPage(1);
    }
  }, [searchParams]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const statsResponse = await ticketsApi.getStats();

      if (ticketNumber) {
        const single = await ticketsApi.getTicket(ticketNumber);
        setStats(statsResponse);
        const list = single ? [single] : [];
        setTickets(list);
        setSelectedTicketNumber(list[0]?.ticketNumber ?? null);
        setPagination({ ...DEFAULT_PAGINATION, total: single ? 1 : 0, pages: 1 });
        return;
      }

      const listResponse = await ticketsApi.getTickets({
        status: status || undefined,
        priority: priority || undefined,
        page,
        limit,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });

      setStats(statsResponse);
      const list = Array.isArray(listResponse.tickets) ? listResponse.tickets : [];
      setTickets(list);
      setSelectedTicketNumber((prev) => {
        if (prev && list.some((ticket) => ticket.ticketNumber === prev)) return prev;
        return list[0]?.ticketNumber ?? null;
      });
      setPagination(listResponse.pagination ?? DEFAULT_PAGINATION);
    } catch (e) {
      setError(getErrorText(e, 'Ошибка загрузки тикетов'));
    } finally {
      setIsLoading(false);
    }
  }, [limit, page, priority, status, ticketNumber]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadHistory = useCallback(async (targetTicketNumber: string) => {
    setIsHistoryLoading(true);
    setHistoryError('');

    try {
      const response = await ticketsApi.getHistory(targetTicketNumber);
      const normalized = normalizeHistory(Array.isArray(response?.history) ? response.history : []);
      setHistoryItems(normalized);
    } catch (e) {
      setHistoryItems([]);
      setHistoryError(getErrorText(e, 'Не удалось загрузить историю тикета'));
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedTicketNumber) {
      setHistoryItems([]);
      setHistoryError('');
      return;
    }

    void loadHistory(selectedTicketNumber);
  }, [loadHistory, selectedTicketNumber]);

  const handleStatusChange = useCallback(async (ticketNumberValue: string, nextStatus: string) => {
    const currentTicket = tickets.find((item) => item.ticketNumber === ticketNumberValue);
    if (!currentTicket || currentTicket.status === nextStatus) return;

    const previousStatus = currentTicket.status;

    setStatusUpdateError('');
    setStatusUpdatingTicket(ticketNumberValue);
    setTickets((prev) => prev.map((ticket) => (
      ticket.ticketNumber === ticketNumberValue
        ? { ...ticket, status: nextStatus, updatedAt: new Date().toISOString() }
        : ticket
    )));

    try {
      await ticketsApi.setStatus(ticketNumberValue, nextStatus);
      if (selectedTicketNumber === ticketNumberValue) {
        void loadHistory(ticketNumberValue);
      }
    } catch (e) {
      setTickets((prev) => prev.map((ticket) => (
        ticket.ticketNumber === ticketNumberValue
          ? { ...ticket, status: previousStatus }
          : ticket
      )));
      setStatusUpdateError(getErrorText(e, 'Не удалось обновить статус. Изменение отменено.'));
    } finally {
      setStatusUpdatingTicket(null);
    }
  }, [loadHistory, selectedTicketNumber, tickets]);

  const canPrev = pagination.page > 1;
  const canNext = pagination.page < pagination.pages;

  const totalByStatus = useMemo(() => {
    if (!stats?.byStatus) return [];
    return Object.entries(stats.byStatus);
  }, [stats?.byStatus]);

  const totalByPriority = useMemo(() => {
    if (!stats?.byPriority) return [];
    return Object.entries(stats.byPriority);
  }, [stats?.byPriority]);

  const skeletonRows = useMemo(() => Array.from({ length: 6 }, (_, idx) => idx), []);
  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.ticketNumber === selectedTicketNumber) ?? null,
    [selectedTicketNumber, tickets],
  );
  const statusAnnouncement = useMemo(() => {
    if (isLoading) return 'Загрузка списка тикетов';
    if (statusUpdatingTicket) return `Обновляем статус тикета ${statusUpdatingTicket}`;
    if (statusUpdateError) return statusUpdateError;
    if (error) return error;
    return '';
  }, [error, isLoading, statusUpdateError, statusUpdatingTicket]);

  return (
    <Layout>
      <div className={styles.page}>
        <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
          {statusAnnouncement}
        </p>

        <header className={styles.header}>
          <p className={styles.kicker}>support center</p>
          <h1 className={styles.title}>Тикеты</h1>
          <p className={styles.subtitle}>Статистика и список тикетов</p>
        </header>

        <section className={styles.statsGrid} aria-label="Статистика тикетов">
          <article className={styles.statCard}>
            <div className={styles.statLabel}>Всего тикетов</div>
            <div className={styles.statValue}>{isLoading ? <span className={styles.statSkeleton} /> : (stats?.total ?? 0)}</div>
          </article>

          <article className={styles.statCard}>
            <div className={styles.statLabel}>По статусам</div>
            <div className={styles.statList}>
              {isLoading
                ? <span className={styles.statSkeletonLong} />
                : totalByStatus.length === 0
                ? '—'
                : totalByStatus.map(([key, value]) => `${key}: ${value}`).join(' · ')}
            </div>
          </article>

          <article className={styles.statCard}>
            <div className={styles.statLabel}>По приоритетам</div>
            <div className={styles.statList}>
              {isLoading
                ? <span className={styles.statSkeletonLong} />
                : totalByPriority.length === 0
                ? '—'
                : totalByPriority.map(([key, value]) => `${key}: ${value}`).join(' · ')}
            </div>
          </article>
        </section>

        <section className={styles.content}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Список тикетов</h2>
            <Button onClick={() => void loadData()} variant="secondary" size="small">
              Обновить
            </Button>
          </div>

          <div className={styles.filtersRow}>
            <label className={styles.filterBlock}>
              <span>ticketNumber</span>
              <input
                type="text"
                value={ticketNumber}
                placeholder="Например, 12345"
                onChange={(e) => {
                  setTicketNumber(e.target.value.trim());
                  setPage(1);
                }}
              />
            </label>

            <label className={styles.filterBlock}>
              <span>Статус</span>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Все</option>
                {STATUS_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.filterBlock}>
              <span>Приоритет</span>
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Все</option>
                {PRIORITY_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.filterBlock}>
              <span>Лимит</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
              >
                {[10, 20, 50].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isLoading ? (
            <div className={styles.tableSkeleton} aria-label="Загрузка тикетов">
              {skeletonRows.map((item) => (
                <div key={`ticket-row-skeleton-${item}`} className={styles.tableSkeletonRow}>
                  <span className={styles.tableSkeletonCell} />
                  <span className={styles.tableSkeletonCell} />
                  <span className={styles.tableSkeletonCell} />
                  <span className={styles.tableSkeletonCellWide} />
                </div>
              ))}
            </div>
          ) : null}
          {!isLoading && error ? <div className={styles.error}>{error}</div> : null}
          {!isLoading && statusUpdateError ? <div className={styles.error}>{statusUpdateError}</div> : null}

          {!isLoading && !error ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">ticketNumber</th>
                    <th scope="col">status</th>
                    <th scope="col">priority</th>
                    <th scope="col">category</th>
                    <th scope="col">assigned</th>
                    <th scope="col">updatedAt</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={styles.empty}>
                        <div className={styles.emptyState}>
                          <p className={styles.emptyStateTitle}>Тикеты не найдены</p>
                          <p className={styles.emptyStateText}>Измените фильтры или сбросьте `ticketNumber`, чтобы увидеть список.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    tickets.map((ticket) => (
                      <tr
                        key={ticket.ticketNumber}
                        className={`${styles.tableRow} ${selectedTicketNumber === ticket.ticketNumber ? styles.tableRowActive : ''}`}
                        onClick={() => setSelectedTicketNumber(ticket.ticketNumber)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedTicketNumber(ticket.ticketNumber);
                          }
                        }}
                        tabIndex={0}
                        aria-selected={selectedTicketNumber === ticket.ticketNumber}
                      >
                        <td className={styles.mono}>{ticket.ticketNumber}</td>
                        <td>
                          <label htmlFor={`ticket-status-${ticket.ticketNumber}`} className={styles.srOnly}>
                            Изменить статус для тикета {ticket.ticketNumber}
                          </label>
                          <select
                            id={`ticket-status-${ticket.ticketNumber}`}
                            className={styles.statusSelect}
                            value={ticket.status || ''}
                            disabled={statusUpdatingTicket === ticket.ticketNumber}
                            onChange={(event) => {
                              void handleStatusChange(ticket.ticketNumber, event.target.value);
                            }}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {STATUS_OPTIONS.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>{ticket.priority || '—'}</td>
                        <td>{ticket.category || '—'}</td>
                        <td>{ticket.assignedUser?.username || ticket.assignedUser?.email || '—'}</td>
                        <td>{formatDate(ticket.updatedAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}

          <section className={styles.historySection} aria-live="polite" aria-busy={isHistoryLoading}>
            <div className={styles.historySectionHeader}>
              <h3 className={styles.historyTitle}>История изменений</h3>
              {selectedTicket ? <p className={styles.historyMeta}>Тикет: {selectedTicket.ticketNumber}</p> : null}
            </div>

            {isHistoryLoading ? (
              <div className={styles.historySkeleton} aria-label="Загрузка истории тикета">
                {skeletonRows.slice(0, 4).map((item) => (
                  <span key={`history-skeleton-${item}`} className={styles.historySkeletonRow} />
                ))}
              </div>
            ) : null}

            {!isHistoryLoading && historyError ? <p className={styles.historyError}>{historyError}</p> : null}

            {!isHistoryLoading && !historyError && historyItems.length === 0 ? (
              <p className={styles.historyEmpty}>История по выбранному тикету пока отсутствует.</p>
            ) : null}

            {!isHistoryLoading && !historyError && historyItems.length > 0 ? (
              <ol className={styles.historyList}>
                {historyItems.map((item) => (
                  <li key={item.id} className={styles.historyItem}>
                    <div className={styles.historyDot} aria-hidden="true" />
                    <div className={styles.historyContent}>
                      <p className={styles.historyAction}>{item.action}</p>
                      <p className={styles.historyInfo}>
                        {formatDate(item.createdAt)} · {item.actor}
                      </p>
                      {item.from || item.to ? (
                        <p className={styles.historyDiff}>
                          {item.from || '—'} → {item.to || '—'}
                        </p>
                      ) : null}
                      {item.note ? <p className={styles.historyNote}>{item.note}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
          </section>

          <div className={styles.paginationRow}>
            <Button
              size="small"
              variant="secondary"
              disabled={!canPrev || isLoading}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Назад
            </Button>

            <span className={styles.pageInfo}>
              Страница {pagination.page || page} из {Math.max(1, pagination.pages || 1)}
            </span>

            <Button
              size="small"
              variant="secondary"
              disabled={!canNext || isLoading}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Вперед
            </Button>
          </div>
        </section>
      </div>
    </Layout>
  );
}
