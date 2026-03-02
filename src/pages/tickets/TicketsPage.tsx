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
        setTickets(single ? [single] : []);
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
      setTickets(Array.isArray(listResponse.tickets) ? listResponse.tickets : []);
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

  return (
    <Layout>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Тикеты</h1>
          <p className={styles.subtitle}>Статистика и список тикетов</p>
        </header>

        <section className={styles.statsGrid} aria-label="Статистика тикетов">
          <article className={styles.statCard}>
            <div className={styles.statLabel}>Всего тикетов</div>
            <div className={styles.statValue}>{stats?.total ?? 0}</div>
          </article>

          <article className={styles.statCard}>
            <div className={styles.statLabel}>По статусам</div>
            <div className={styles.statList}>
              {totalByStatus.length === 0
                ? '—'
                : totalByStatus.map(([key, value]) => `${key}: ${value}`).join(' · ')}
            </div>
          </article>

          <article className={styles.statCard}>
            <div className={styles.statLabel}>По приоритетам</div>
            <div className={styles.statList}>
              {totalByPriority.length === 0
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

          {isLoading ? <div className={styles.note}>Загрузка тикетов...</div> : null}
          {!isLoading && error ? <div className={styles.error}>{error}</div> : null}

          {!isLoading && !error ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>ticketNumber</th>
                    <th>status</th>
                    <th>priority</th>
                    <th>category</th>
                    <th>assigned</th>
                    <th>updatedAt</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={styles.empty}>
                        Тикеты не найдены
                      </td>
                    </tr>
                  ) : (
                    tickets.map((ticket) => (
                      <tr key={ticket.ticketNumber}>
                        <td className={styles.mono}>{ticket.ticketNumber}</td>
                        <td>{ticket.status || '—'}</td>
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
