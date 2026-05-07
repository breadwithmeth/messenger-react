import {
  Fragment,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useCallback,
  useDeferredValue,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../shared/ui/Layout/Layout';
import { Button } from '../../shared/ui/Button/Button';
import { Input } from '../../shared/ui/Input/Input';
import { Icon } from '../../shared/ui/Icon/Icon';
import { Modal } from '../../shared/ui/Modal/Modal';
import type { PresenceResponse, PresenceStatus } from '../../shared/ui/PresenceTimeline/PresenceTimeline';
import { chatsApi } from '../../features/chats/api/chatsApi';
import { clientsApi } from '../../features/clients/api/clientsApi';
import { aiApi } from '../../features/ai/api/aiApi';
import { ticketsApi } from '../../features/tickets/api/ticketsApi';
import { Chat, ChatPriority, Message } from '../../features/chats/model/types';
import { ClientComment } from '../../features/clients/model/types';
import type { Ticket, TicketPriority, TicketStatus } from '../../features/tickets/model/types';
import { NetworkError } from '../../shared/api/types';
import { isFirefoxLikeBrowser } from '../../shared/utils/firefoxMode';
import { toggleLayoutMenu } from '../../shared/utils/layoutMenu';
import { emitToast } from '../../shared/utils/toast';
import { useAuth } from '@/auth/useAuth';
import { CallWidget, type CallWidgetStatus } from '../../features/webrtc/ui/CallWidget/CallWidget';
import { workforceApi } from '@/features/workforce/api/workforceApi';
import type { WorkforceActivityDto } from '@/features/workforce/model/types';
import styles from './ChatsPage.module.css';

type ChatFilter = 'all' | 'my' | 'ignored' | 'open' | 'unread';
type DensityMode = 'comfortable' | 'compact' | 'ultra';

type MediaType = 'image' | 'document' | 'video' | 'audio';

interface PendingAttachment {
  file: File;
  type: MediaType;
  previewUrl: string;
}

type TranslationState = {
  status: 'loading' | 'done' | 'error';
  text?: string;
  error?: string;
};

type MessageContextMenuState = {
  x: number;
  y: number;
  message: Message;
};

type DamagePopup = {
  id: number;
  text: string;
  kind: 'alert' | 'critical';
};

type PixelBurst = {
  id: number;
  x: number;
  y: number;
  tone: 'danger' | 'success' | 'neutral';
  size: number;
};

type AchievementToast = {
  id: number;
  title: string;
  tier: 'COMMON' | 'ELITE' | 'BOSS';
};

type AchievementId =
  | 'firstReply'
  | 'messages100'
  | 'noUnreadChats'
  | 'bossTicketClosed'
  | 'voiceRunner'
  | 'mediaCrafter'
  | 'translator'
  | 'questCommander'
  | 'nightShift'
  | 'urgentHunter';

type TicketHistoryEntry = {
  id: string;
  action: string;
  createdAt?: string;
  actor: string;
  from?: string;
  to?: string;
  note?: string;
};

type LocalActionEntry = {
  id: number;
  createdAt: string;
  text: string;
  tone: 'neutral' | 'success' | 'danger';
};

const formatTimeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  if (hours < 24) return `${hours} час назад`;
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit' });
};

const formatDateTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDayLabel = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    weekday: 'short',
  });
};

const getDayKey = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

const extractPhoneFromJid = (jid: string | null) => {
  if (!jid) return '';
  const beforeAt = jid.split('@')[0] ?? '';
  const beforeColon = beforeAt.split(':')[0] ?? '';
  const digits = beforeColon.replace(/\D/g, '');
  return digits || beforeColon || jid;
};

const formatChannelLabel = (channel: Chat['channel']) => {
  if (channel === 'whatsapp') return 'WhatsApp';
  if (channel === 'telegram') return 'Telegram';
  return channel;
};

const getQuestStatus = (chat: Chat) => {
  if (chat.priority === 'urgent') return 'BOSS FIGHT';
  if ((chat.unreadCount ?? 0) > 0) return 'NEW QUEST';
  if (chat.assignedUser) return 'IN PROGRESS';
  return 'COMPLETED';
};

const getFlowStatus = (chat: Chat) => {
  if (chat.priority === 'urgent') return 'Срочно';
  if ((chat.unreadCount ?? 0) > 0) return 'Новый';
  if (chat.assignedUser) return 'В работе';
  if (chat.status === 'closed') return 'Закрыт';
  return 'Готово';
};

const getRadarLabel = (id: string) => {
  if (id === 'urgent') return 'Срочные';
  if (id === 'unread') return 'Непрочитанные';
  if (id === 'translated') return 'Переводы';
  if (id === 'voice') return 'Голос';
  return id;
};

const formatLastMessagePreview = (lastMessage: Chat['lastMessage']) => {
  if (!lastMessage) return 'Нет сообщений';

  const text = (lastMessage.content || '').trim();
  if (text) return text.slice(0, 60);

  const type = (lastMessage.type || '').toLowerCase();
  if (type === 'image') return '🖼 Фото';
  if (type === 'video') return '🎬 Видео';
  if (type === 'audio') return '🎧 Аудио';
  if (type === 'document') return '📄 Документ';
  if (type === 'sticker') return '🌟 Стикер';

  return 'Сообщение';
};

const CANCELLATION_TERMS = ['отмен', 'отмена', 'cancel', 'cancellation'];
const DISCOUNT_TERMS = ['скидк', 'промокод', 'дисконт', 'бонус', 'купон'];
const SAFE_CANCELLATION_SUGGESTION =
  'Понимаю ваш запрос на отмену. Давайте подтвердим детали заказа и выберем корректный вариант решения.';

const hasAnyTerm = (text: string, terms: string[]) => {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
};

const sanitizeCancellationPolicySuggestion = (text: string) => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const talksAboutCancellation = hasAnyTerm(normalized, CANCELLATION_TERMS);
  const talksAboutDiscounts = hasAnyTerm(normalized, DISCOUNT_TERMS);

  if (talksAboutCancellation && talksAboutDiscounts) {
    return SAFE_CANCELLATION_SUGGESTION;
  }

  return normalized;
};

const buildSafeSuggestions = (rawSuggestions: string[]) => {
  const unique = new Set<string>();

  for (const suggestion of rawSuggestions) {
    const safe = sanitizeCancellationPolicySuggestion(suggestion);
    if (!safe) continue;
    unique.add(safe);
    if (unique.size >= 2) break;
  }

  if (unique.size === 0) {
    unique.add(SAFE_CANCELLATION_SUGGESTION);
  }

  return Array.from(unique).slice(0, 2);
};

const getNpcRarity = (chat: Chat | null): 'COMMON' | 'ELITE' | 'BOSS' => {
  if (!chat) return 'COMMON';
  if (chat.priority === 'urgent') return 'BOSS';
  if (chat.priority === 'high') return 'ELITE';
  return 'COMMON';
};

const toSlug = (value?: string | null) => (value || '').toLowerCase().replace(/\s+/g, '_');

const FIREFOX_SEND_WARNING = 'Воспользуйтесь браузером google chrome';
const CHAT_ITEM_ESTIMATED_HEIGHT_BY_DENSITY: Record<DensityMode, number> = {
  comfortable: 74,
  compact: 56,
  ultra: 48,
};
const CHAT_LIST_OVERSCAN = 8;
const TICKET_STATUS_OPTIONS: Array<TicketStatus | string> = [
  'new',
  'open',
  'in_progress',
  'pending',
  'resolved',
  'closed',
];
const TICKET_PRIORITY_OPTIONS: Array<TicketPriority | string> = ['low', 'normal', 'high', 'urgent'];

const formatTicketDuration = (startedAt?: string | null) => {
  if (!startedAt) return '';
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return '';
  const diffMs = Date.now() - start;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  if (days > 0) return `${days}д ${hours}ч`;
  if (hours > 0) return `${hours}ч`;
  const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  return `${minutes} мин`;
};

const toText = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
};

const normalizeTicketHistory = (items: unknown[]): TicketHistoryEntry[] => {
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

const formatPhoneInput = (raw: string) => {
  const digits = raw.replace(/\D+/g, '');
  if (!digits) return '';
  let result = digits.startsWith('7') || digits.startsWith('8') ? '+7 ' : '+';
  const tail = digits.startsWith('7') ? digits.slice(1) : digits.startsWith('8') ? digits.slice(1) : digits;
  const chunks = [tail.slice(0, 3), tail.slice(3, 6), tail.slice(6, 8), tail.slice(8, 10)].filter(Boolean);
  result += chunks
    .map((chunk, idx) => {
      if (idx === 2) return `${chunk[0] ?? ''}${chunk[1] ?? ''}`.trim();
      return chunk;
    })
    .join(' ');
  return result.trim();
};

type PixelIconName = 'user' | 'close' | 'call' | 'check' | 'take' | 'release';

const PIXEL_ICON_SHAPES: Record<PixelIconName, Array<[number, number, number, number]>> = {
  user: [
    [6, 4, 4, 4],
    [4, 9, 8, 2],
    [3, 11, 10, 2],
  ],
  close: [
    [4, 4, 2, 2],
    [10, 4, 2, 2],
    [6, 6, 4, 4],
    [4, 10, 2, 2],
    [10, 10, 2, 2],
  ],
  call: [
    [3, 4, 3, 2],
    [6, 6, 2, 2],
    [8, 8, 2, 2],
    [10, 10, 3, 2],
    [4, 12, 4, 2],
  ],
  check: [
    [3, 9, 3, 2],
    [6, 11, 2, 2],
    [8, 9, 2, 2],
    [10, 7, 2, 2],
  ],
  take: [
    [3, 8, 10, 2],
    [9, 4, 4, 2],
    [9, 12, 4, 2],
  ],
  release: [
    [3, 8, 10, 2],
    [3, 4, 4, 2],
    [3, 12, 4, 2],
  ],
};

const renderPixelIcon = (name: PixelIconName) => (
  <svg className={styles.pixelIcon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    {PIXEL_ICON_SHAPES[name].map(([x, y, width, height], idx) => (
      <rect key={`${name}-${idx}`} x={x} y={y} width={width} height={height} />
    ))}
  </svg>
);

const renderIconLabel = (icon: PixelIconName, label: string) => (
  <span className={styles.iconLabel}>
    <span className={styles.iconGlyph}>{renderPixelIcon(icon)}</span>
    <span className={styles.iconLabelText}>{label}</span>
  </span>
);

export function ChatsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const deferredChats = useDeferredValue(chats);
  const [chatListViewport, setChatListViewport] = useState({ scrollTop: 0, height: 0 });
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const selectedChatIdRef = useRef<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMoreChats, setIsLoadingMoreChats] = useState(false);
  const [error, setError] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<ChatFilter>('all');
  const [densityMode, setDensityMode] = useState<DensityMode>('compact');
  const [selectedChatIds, setSelectedChatIds] = useState<number[]>([]);
  const [isBulkActionLoading, setIsBulkActionLoading] = useState(false);
  const [isHotkeysHelpOpen, setIsHotkeysHelpOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [searchType, setSearchType] = useState<'all' | 'message' | 'phone'>('all');
  const [channelFilter, setChannelFilter] = useState<'' | 'whatsapp' | 'telegram'>('');
  const [priorityFilter, setPriorityFilter] = useState<'' | ChatPriority>('');
  const [sortBy, setSortBy] = useState<
    '' | 'lastMessageAt' | 'createdAt' | 'priority' | 'unreadCount' | 'status' | 'name'
  >('lastMessageAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [messageInput, setMessageInput] = useState('');
  const [isSendingMedia, setIsSendingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string>('');
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [previewCaption, setPreviewCaption] = useState('');
  const [viewerMessage, setViewerMessage] = useState<Message | null>(null);
  const [isAssigningChat, setIsAssigningChat] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsFromCache, setSuggestionsFromCache] = useState(false);
  const [isSuggestionsEnabled, setIsSuggestionsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('chat-ai-suggestions-enabled') !== 'off';
  });
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [sendError, setSendError] = useState('');
  const [activeVoiceMessageId, setActiveVoiceMessageId] = useState<number | null>(null);
  const [playedVoiceCount, setPlayedVoiceCount] = useState(0);
  const [messageContextMenu, setMessageContextMenu] = useState<MessageContextMenuState | null>(null);
  const [isPauseMenuOpen, setIsPauseMenuOpen] = useState(false);
  const [isSceneTransitioning, setIsSceneTransitioning] = useState(false);
  const [urgentIncomingMessageId, setUrgentIncomingMessageId] = useState<number | null>(null);
  const [isRetroMiniMode, setIsRetroMiniMode] = useState(false);
  const [damagePopups, setDamagePopups] = useState<DamagePopup[]>([]);
  const [pixelBursts, setPixelBursts] = useState<PixelBurst[]>([]);
  const [achievementToast, setAchievementToast] = useState<AchievementToast | null>(null);
  const [bootStepIndex, setBootStepIndex] = useState(0);
  const [achievements, setAchievements] = useState<Record<AchievementId, boolean>>({
    firstReply: false,
    messages100: false,
    noUnreadChats: false,
    bossTicketClosed: false,
    voiceRunner: false,
    mediaCrafter: false,
    translator: false,
    questCommander: false,
    nightShift: false,
    urgentHunter: false,
  });
  const [translationsByMessageId, setTranslationsByMessageId] = useState<Record<number, TranslationState>>({});
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false,
  });
  const [isCallPanelCollapsed, setIsCallPanelCollapsed] = useState(true);
  const [callWidgetStatus, setCallWidgetStatus] = useState<CallWidgetStatus | null>(null);
  const [callWidgetCallee, setCallWidgetCallee] = useState('');
  const [callWidgetCalleeVersion, setCallWidgetCalleeVersion] = useState(0);
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
  const [clientComments, setClientComments] = useState<ClientComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isLoadingMoreComments, setIsLoadingMoreComments] = useState(false);
  const [commentsError, setCommentsError] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [commentsPagination, setCommentsPagination] = useState({
    limit: 50,
    offset: 0,
    total: 0,
    hasMore: false,
  });
  const commentsPaginationRef = useRef({
    limit: 50,
    offset: 0,
    total: 0,
    hasMore: false,
  });
  const [isLoadingTicket, setIsLoadingTicket] = useState(false);
  const [ticketError, setTicketError] = useState('');
  const [isTicketActionLoading, setIsTicketActionLoading] = useState(false);
  const [ticketActionError, setTicketActionError] = useState('');
  const [ticketActionToast, setTicketActionToast] = useState('');
  const [ticketHistory, setTicketHistory] = useState<TicketHistoryEntry[]>([]);
  const [isTicketHistoryLoading, setIsTicketHistoryLoading] = useState(false);
  const [ticketHistoryError, setTicketHistoryError] = useState('');
  const [localActionTimeline, setLocalActionTimeline] = useState<LocalActionEntry[]>([]);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  // pinning disabled
  const [isActivityVisible, setIsActivityVisible] = useState(true);

  const handleCallWidgetStatus = useCallback((s: CallWidgetStatus) => {
    setCallWidgetStatus(s);
  }, []);

  const selectedChat = useMemo(() => {
    if (!selectedChatId) return null;
    return chats.find((c) => c.id === selectedChatId) ?? null;
  }, [chats, selectedChatId]);

  const pushLocalAction = useCallback((text: string, tone: LocalActionEntry['tone'] = 'neutral') => {
    const now = new Date().toISOString();
    setLocalActionTimeline((prev) => [
      {
        id: Date.now() + Math.floor(Math.random() * 1000),
        createdAt: now,
        text,
        tone,
      },
      ...prev,
    ].slice(0, 12));
  }, []);

  const isSelectedChatFresh = useMemo(() => {
    if (!selectedChat) return false;
    return selectedChat.status === 'new' || (selectedChat.unreadCount ?? 0) > 0;
  }, [selectedChat]);

  const isLatestMessageFromClient = useMemo(() => {
    if (messages.length > 0) {
      const latest = messages[messages.length - 1];
      return !latest.fromMe;
    }

    if (selectedChat?.lastMessage) {
      return !selectedChat.lastMessage.fromMe;
    }

    return false;
  }, [messages, selectedChat?.lastMessage]);

  const canUseAiSuggestions = isSelectedChatFresh && isLatestMessageFromClient;

  const unreadStartMessageIndex = useMemo(() => {
    const unreadCount = Math.max(0, selectedChat?.unreadCount ?? 0);
    if (unreadCount === 0 || messages.length === 0) return -1;

    let unreadSeen = 0;
    for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
      if (messages[idx].fromMe) continue;
      unreadSeen += 1;
      if (unreadSeen === unreadCount) return idx;
    }

    return -1;
  }, [messages, selectedChat?.unreadCount]);

  const selectedChatPhone = useMemo(() => {
    return extractPhoneFromJid(selectedChat?.remoteJid ?? null);
  }, [selectedChat?.remoteJid]);

  const handleOpenCallPanel = useCallback(() => {
    setIsCallPanelCollapsed(false);
    if (!selectedChatPhone) return;
    setCallWidgetCallee(selectedChatPhone);
    setCallWidgetCalleeVersion((v) => v + 1);
  }, [selectedChatPhone]);

  const statusChipClass = useCallback(
    (status?: string | null) => {
      if (!status) return '';
      const slug = toSlug(status);
      return [styles.statusChip, styles[`status-${slug}`]].filter(Boolean).join(' ');
    },
    []
  );

  const priorityChipClass = useCallback(
    (priority?: string | null) => {
      if (!priority) return '';
      const slug = toSlug(priority);
      return [styles.priorityChip, styles[`priority-${slug}`]].filter(Boolean).join(' ');
    },
    []
  );

  const [activity, setActivity] = useState<WorkforceActivityDto | null>(null);
  const [isActivityLoading, setIsActivityLoading] = useState(false);
  const [isActivityFullscreen, setIsActivityFullscreen] = useState(false);
  const isRetroTheme =
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'retro8';

  const bootSequenceSteps = useMemo(
    () => ['INIT MEMORY', 'LOAD NPC DIALOGUE', 'SYNC QUEST FLAGS', 'READY'],
    []
  );

  const currentTicketNumber = useMemo(() => {
    if (!selectedChat?.ticketNumber) return '';
    return String(selectedChat.ticketNumber);
  }, [selectedChat?.ticketNumber]);

  const handleOpenTicketPage = useCallback(() => {
    if (!currentTicketNumber) return;
    navigate(`/tickets?ticketNumber=${currentTicketNumber}`);
  }, [currentTicketNumber, navigate]);

  const retroQueueCount = useMemo(() => chats.filter((c) => c.unreadCount > 0).length, [chats]);
  const retroUrgentCount = useMemo(() => chats.filter((c) => c.priority === 'urgent').length, [chats]);
  const retroUnreadTotal = useMemo(() => chats.reduce((sum, chat) => sum + (chat.unreadCount ?? 0), 0), [chats]);
  const retroTranslatedCount = useMemo(
    () => Object.values(translationsByMessageId).filter((state) => state.status === 'done').length,
    [translationsByMessageId]
  );
  const retroVoiceActiveCount = useMemo(
    () => messages.filter((msg) => msg.type === 'audio' && Boolean(msg.mediaUrl)).length,
    [messages]
  );
  const retroSelectedQuest = useMemo(() => {
    if (!selectedChat) return 'NO TARGET';
    return getQuestStatus(selectedChat);
  }, [selectedChat]);

  const combatBars = useMemo(() => {
    const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
    const relationBase = selectedChat ? 48 + (selectedChat.assignedUser ? 16 : 0) + Math.min(26, messages.filter((m) => m.fromMe).length / 2) : 0;
    const relation = clamp(relationBase);

    const riskBase = selectedChat
      ? (selectedChat.priority === 'urgent'
          ? 88
          : selectedChat.priority === 'high'
            ? 70
            : selectedChat.priority === 'medium'
              ? 48
              : 30) + Math.min(16, (selectedChat.unreadCount ?? 0) * 2)
      : 0;
    const risk = clamp(riskBase);

    const slaBase = currentTicket
      ? currentTicket.status === 'closed'
        ? 100
        : currentTicket.status === 'resolved'
          ? 84
          : currentTicket.status === 'in_progress'
            ? 70
            : 58
      : selectedChat
        ? 62
        : 0;
    const sla = clamp(slaBase - Math.min(18, retroUnreadTotal));

    return [
      { label: 'RELATION', value: relation, tone: 'good' as const },
      { label: 'RISK', value: risk, tone: 'danger' as const },
      { label: 'SLA', value: sla, tone: 'neutral' as const },
    ];
  }, [currentTicket, messages, retroUnreadTotal, selectedChat]);

  const retroRadarEvents = useMemo(
    () => [
      {
        id: 'urgent',
        label: 'URGENT',
        value: retroUrgentCount,
        active: retroUrgentCount > 0,
        tone: 'danger' as const,
      },
      {
        id: 'unread',
        label: 'UNREAD',
        value: retroUnreadTotal,
        active: retroUnreadTotal > 0,
        tone: 'warn' as const,
      },
      {
        id: 'translated',
        label: 'TRANSLATED',
        value: retroTranslatedCount,
        active: retroTranslatedCount > 0,
        tone: 'good' as const,
      },
      {
        id: 'voice',
        label: 'VOICE',
        value: retroVoiceActiveCount,
        active: retroVoiceActiveCount > 0,
        tone: 'neutral' as const,
      },
    ],
    [retroTranslatedCount, retroUnreadTotal, retroUrgentCount, retroVoiceActiveCount]
  );

  const retroQuestProgress = useMemo(() => {
    if (!selectedChat) return 0;
    const status = getQuestStatus(selectedChat);
    if (status === 'COMPLETED') return 100;
    if (status === 'IN PROGRESS') return 65;
    if (status === 'BOSS FIGHT') return 85;
    return 30;
  }, [selectedChat]);

  const retroQuestHistory = useMemo(() => {
    const latest = messages.slice(-4).map((m) => {
      const stamp = formatDateTime(m.timestamp) || '--:--';
      const source = m.fromMe ? 'PLAYER' : 'NPC';
      return `${stamp} ${source} EVENT`;
    });
    if (latest.length > 0) return latest.reverse();
    return ['NO RECENT EVENTS'];
  }, [messages]);

  const operationalHistory = useMemo(() => {
    const latest = messages.slice(-4).map((m) => {
      const stamp = formatDateTime(m.timestamp) || '--:--';
      const source = m.fromMe ? 'Оператор' : 'Клиент';
      return `${stamp} ${source}`;
    });
    if (latest.length > 0) return latest.reverse();
    return ['Нет недавних событий'];
  }, [messages]);

  const retroAchievementList = useMemo(
    () => [
      {
        id: 'firstReply' as const,
        label: 'First Response',
        description: 'Send your first reply',
        tier: 'COMMON' as const,
      },
      {
        id: 'messages100' as const,
        label: 'Comms Veteran',
        description: 'Send 100 replies',
        tier: 'ELITE' as const,
      },
      {
        id: 'noUnreadChats' as const,
        label: 'Inbox Zero',
        description: 'Clear all unread chats',
        tier: 'ELITE' as const,
      },
      {
        id: 'bossTicketClosed' as const,
        label: 'Boss Defeated',
        description: 'Close urgent ticket',
        tier: 'BOSS' as const,
      },
      {
        id: 'voiceRunner' as const,
        label: 'Voice Runner',
        description: 'Play 5 voice logs',
        tier: 'COMMON' as const,
      },
      {
        id: 'mediaCrafter' as const,
        label: 'Media Crafter',
        description: 'Use 3 media types',
        tier: 'ELITE' as const,
      },
      {
        id: 'translator' as const,
        label: 'Lore Translator',
        description: 'Complete 3 translations',
        tier: 'COMMON' as const,
      },
      {
        id: 'questCommander' as const,
        label: 'Quest Commander',
        description: 'Handle 3 assigned chats',
        tier: 'ELITE' as const,
      },
      {
        id: 'nightShift' as const,
        label: 'Night Shift',
        description: 'Send message after 22:00',
        tier: 'COMMON' as const,
      },
      {
        id: 'urgentHunter' as const,
        label: 'Urgent Hunter',
        description: 'Read all urgent chats',
        tier: 'BOSS' as const,
      },
    ],
    []
  );

  const achievementMetaById = useMemo(
    () =>
      Object.fromEntries(
        retroAchievementList.map((achievement) => [achievement.id, { label: achievement.label, tier: achievement.tier }])
      ) as Record<AchievementId, { label: string; tier: 'COMMON' | 'ELITE' | 'BOSS' }>,
    [retroAchievementList]
  );

  const playedVoiceMessageIdsRef = useRef<Set<number>>(new Set());

  const spawnPixelBurst = useCallback((tone: PixelBurst['tone']) => {
    const center = tone === 'danger' ? { x: 76, y: 18 } : tone === 'success' ? { x: 72, y: 24 } : { x: 68, y: 20 };
    const particles: PixelBurst[] = Array.from({ length: 14 }).map((_, idx) => ({
      id: Date.now() + idx,
      x: center.x + (Math.random() * 12 - 6),
      y: center.y + (Math.random() * 10 - 5),
      tone,
      size: 4 + Math.floor(Math.random() * 4),
    }));
    setPixelBursts((prev) => [...prev, ...particles].slice(-48));
    window.setTimeout(() => {
      setPixelBursts((prev) => prev.filter((particle) => !particles.some((item) => item.id === particle.id)));
    }, 720);
  }, []);

  useEffect(() => {
    // Stop visualizer when switching chat to avoid stale active state.
    setActiveVoiceMessageId(null);
  }, [selectedChatId]);

  const lastIncomingUrgentMessageIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isRetroTheme || selectedChat?.priority !== 'urgent') {
      setUrgentIncomingMessageId(null);
      lastIncomingUrgentMessageIdRef.current = null;
      return;
    }

    const latestIncoming = [...messages].reverse().find((message) => !message.fromMe);
    if (!latestIncoming) return;

    const previousId = lastIncomingUrgentMessageIdRef.current;
    lastIncomingUrgentMessageIdRef.current = latestIncoming.id;
    if (previousId === null || previousId === latestIncoming.id) return;

    setUrgentIncomingMessageId(latestIncoming.id);
    spawnPixelBurst('danger');
    const timeout = window.setTimeout(() => {
      setUrgentIncomingMessageId((current) => (current === latestIncoming.id ? null : current));
    }, 1400);
    return () => window.clearTimeout(timeout);
  }, [isRetroTheme, messages, selectedChat?.priority, spawnPixelBurst]);

  useEffect(() => {
    if (!isLoading || chats.length > 0) return;
    setBootStepIndex(0);
    const interval = window.setInterval(() => {
      setBootStepIndex((prev) => (prev + 1) % bootSequenceSteps.length);
    }, 420);
    return () => window.clearInterval(interval);
  }, [bootSequenceSteps.length, chats.length, isLoading]);

  useEffect(() => {
    const saved = localStorage.getItem('retro-achievements');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as Partial<Record<AchievementId, boolean>>;
      setAchievements((prev) => ({ ...prev, ...parsed }));
    } catch {
      // ignore invalid local storage values
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('retro-achievements', JSON.stringify(achievements));
  }, [achievements]);

  useEffect(() => {
    const saved = localStorage.getItem('retro-mini-mode');
    if (!saved) return;
    setIsRetroMiniMode(saved === '1');
  }, []);

  useEffect(() => {
    localStorage.setItem('retro-mini-mode', isRetroMiniMode ? '1' : '0');
  }, [isRetroMiniMode]);

  useEffect(() => {
    setAchievements((prev) => {
      const next = { ...prev };
      const sentByMe = messages.filter((m) => m.fromMe).length;
      const sentByMeHours = messages
        .filter((m) => m.fromMe)
        .map((m) => new Date(m.timestamp).getHours())
        .filter((h) => !Number.isNaN(h));
      const translatedCount = Object.values(translationsByMessageId).filter((state) => state.status === 'done').length;
      const assignedCount = chats.filter((c) => c.assignedUser).length;
      const hasUrgentUnread = chats.some((c) => c.priority === 'urgent' && (c.unreadCount ?? 0) > 0);
      const mediaTypesUsed = new Set(
        messages
          .filter((m) => m.fromMe && (m.type === 'image' || m.type === 'video' || m.type === 'audio' || m.type === 'document'))
          .map((m) => m.type)
      );

      if (sentByMe >= 1) next.firstReply = true;
      if (sentByMe >= 100) next.messages100 = true;
      if (chats.length > 0 && chats.every((c) => (c.unreadCount ?? 0) === 0)) next.noUnreadChats = true;
      if (currentTicket?.status === 'closed' && currentTicket?.priority === 'urgent') next.bossTicketClosed = true;
      if (playedVoiceCount >= 5) next.voiceRunner = true;
      if (mediaTypesUsed.size >= 3) next.mediaCrafter = true;
      if (translatedCount >= 3) next.translator = true;
      if (assignedCount >= 3) next.questCommander = true;
      if (sentByMeHours.some((h) => h >= 22 || h < 6)) next.nightShift = true;
      if (!hasUrgentUnread && chats.some((c) => c.priority === 'urgent')) next.urgentHunter = true;
      return next;
    });
  }, [messages, chats, currentTicket?.priority, currentTicket?.status, translationsByMessageId, playedVoiceCount]);

  const achievementSnapshotRef = useRef<Record<AchievementId, boolean>>(achievements);
  useEffect(() => {
    const previous = achievementSnapshotRef.current;
    const unlocked = (Object.keys(achievements) as AchievementId[]).find((id) => achievements[id] && !previous[id]);
    achievementSnapshotRef.current = achievements;
    if (!unlocked) return;

    const meta = achievementMetaById[unlocked];
    setAchievementToast({ id: Date.now(), title: meta.label, tier: meta.tier });
    spawnPixelBurst('success');
    const timeout = window.setTimeout(() => setAchievementToast(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [achievementMetaById, achievements, spawnPixelBurst]);

  useEffect(() => {
    if (!isRetroTheme) {
      setIsPauseMenuOpen(false);
      return;
    }

    const handleEscPause = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target as HTMLElement | null;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';
      if (isInput && !isPauseMenuOpen) return;
      event.preventDefault();
      setIsPauseMenuOpen((prev) => !prev);
    };

    window.addEventListener('keydown', handleEscPause);
    return () => window.removeEventListener('keydown', handleEscPause);
  }, [isPauseMenuOpen, isRetroTheme]);

  const lastRetroCountersRef = useRef({ unread: 0, urgent: 0 });
  useEffect(() => {
    const unread = chats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
    const urgent = chats.filter((c) => c.priority === 'urgent' && (c.unreadCount ?? 0) > 0).length;
    const previous = lastRetroCountersRef.current;
    const popups: DamagePopup[] = [];

    if (unread > previous.unread) {
      popups.push({ id: Date.now(), text: `+${unread - previous.unread} ALERT`, kind: 'alert' });
    }
    if (urgent > previous.urgent) {
      popups.push({ id: Date.now() + 1, text: 'CRITICAL', kind: 'critical' });
    }

    if (popups.length > 0) {
      setDamagePopups((prev) => [...prev, ...popups].slice(-4));
      popups.forEach((popup) => {
        window.setTimeout(() => {
          setDamagePopups((prev) => prev.filter((item) => item.id !== popup.id));
        }, 1400);
      });
    }

    lastRetroCountersRef.current = { unread, urgent };
  }, [chats]);

  useEffect(() => {
    const handleClose = () => setMessageContextMenu(null);
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMessageContextMenu(null);
    };

    window.addEventListener('click', handleClose);
    window.addEventListener('resize', handleClose);
    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('resize', handleClose);
      window.removeEventListener('keydown', handleKeydown);
    };
  }, []);

  const openMessageContextMenu = useCallback((event: React.MouseEvent, message: Message) => {
    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 240;
    const menuHeight = 170;
    const x = Math.min(event.clientX, window.innerWidth - menuWidth - 12);
    const y = Math.min(event.clientY, window.innerHeight - menuHeight - 12);
    setMessageContextMenu({ x: Math.max(8, x), y: Math.max(8, y), message });
  }, []);

  const resolveVoiceThemeClass = useCallback(
    (message: Message) => {
      if (message.fromMe) return styles.voiceThemePlayer;
      if (getNpcRarity(selectedChat) === 'BOSS') return styles.voiceThemeBoss;
      return styles.voiceThemeNpc;
    },
    [selectedChat]
  );

  const resolveMessageRarityClass = useCallback(
    (message: Message) => {
      if (message.fromMe) return '';
      const rarity = getNpcRarity(selectedChat);
      if (rarity === 'BOSS') return styles.npcRarityBoss;
      if (rarity === 'ELITE') return styles.npcRarityElite;
      return styles.npcRarityCommon;
    },
    [selectedChat]
  );

  const renderRetroTimeRadar = useCallback((timestamp: string) => {
    const date = new Date(timestamp);
    const minutes = Number.isNaN(date.getTime()) ? 0 : date.getMinutes();
    const activeIndex = Math.floor((minutes / 60) * 8);
    return (
      <span className={styles.retroTimeRadar} aria-label={formatDateTime(timestamp)}>
        {Array.from({ length: 8 }).map((_, idx) => (
          <span key={`rt-${timestamp}-${idx}`} className={`${styles.retroTimeDot} ${idx === activeIndex ? styles.retroTimeDotActive : ''}`} />
        ))}
      </span>
    );
  }, []);

  const handleCopyMessageText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await navigator.clipboard.writeText(trimmed);
      emitToast('Текст сообщения скопирован');
    } catch {
      emitToast('Не удалось скопировать');
    } finally {
      setMessageContextMenu(null);
    }
  }, []);

  const handleOpenMessageMedia = useCallback((message: Message) => {
    if (!message.mediaUrl) return;
    window.open(message.mediaUrl, '_blank', 'noopener,noreferrer');
    setMessageContextMenu(null);
  }, []);

  // const togglePinChat = useCallback(() => undefined, []);

  const loadActivity = useCallback(async () => {
    setIsActivityLoading(true);
    try {
      const data = await workforceApi.getActivity();
      setActivity(data);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.debug('activity load failed', error);
      }
    } finally {
      setIsActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isActivityVisible) return;
    if (activity || isActivityLoading) return;
    void loadActivity();
  }, [activity, isActivityLoading, isActivityVisible, loadActivity]);

  const formatDurationShort = (ms: number) => {
    const totalMinutes = Math.max(0, Math.round(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}ч ${minutes.toString().padStart(2, '0')}м`;
    return `${Math.max(1, minutes)} мин`;
  };

  const normalizePresenceStatus = (status?: WorkforceActivityDto['presenceHistory'][number]['status']): PresenceStatus => {
    switch (status) {
      case 'ONLINE':
        return 'ONLINE';
      case 'BUSY':
        return 'BUSY';
      case 'AWAY':
        return 'AWAY';
      case 'IDLE':
        return 'IDLE';
      case 'OFFLINE':
      default:
        return 'OFFLINE';
    }
  };

  const parseTimestamp = (value?: string) => {
    const ts = value ? new Date(value).getTime() : NaN;
    return Number.isFinite(ts) ? ts : undefined;
  };

  const activityTimelineData = useMemo<PresenceResponse | null>(() => {
    if (!activity) return null;

    const now = Date.now();
    const lastHistoryItem = activity.presenceHistory?.[activity.presenceHistory.length - 1];
    const rangeFromTs =
      parseTimestamp(activity.range?.from) ?? parseTimestamp(activity.presenceHistory?.[0]?.changedAt) ?? now - 60 * 60 * 1000;
    const rangeToTs = Math.max(
      rangeFromTs + 60 * 1000,
      parseTimestamp(activity.range?.to) ?? parseTimestamp(lastHistoryItem?.changedAt) ?? now,
    );

    const range: PresenceResponse['range'] = {
      from: new Date(rangeFromTs).toISOString(),
      to: new Date(rangeToTs).toISOString(),
    };

    const presenceHistory: PresenceResponse['presenceHistory'] = (activity.presenceHistory ?? []).map((item, idx) => {
      const ts = parseTimestamp(item.changedAt) ?? rangeFromTs + idx * 60_000;
      return {
        status: normalizePresenceStatus(item.status),
        changedAt: new Date(ts).toISOString(),
        messages: (item.messages ?? []).map((m) => ({
          timestamp: m.timestamp,
          type: m.direction === 'outbound' ? ('outbound' as const) : ('inbound' as const),
        })),
      };
    });

    const recentMessages = (activity.messages?.recent ?? []).map((m) => ({
      timestamp: m.timestamp,
      type: m.direction === 'outbound' ? ('outbound' as const) : ('inbound' as const),
    }));

    return {
      range,
      presenceHistory,
      messages: recentMessages,
    };
  }, [activity]);

  const activityStats = useMemo(() => {
    if (!activity) return null;

    const now = Date.now();
    const lastHistoryItem = activity.presenceHistory?.[activity.presenceHistory.length - 1];
    const rangeFromTs =
      parseTimestamp(activity.range?.from) ?? parseTimestamp(activity.presenceHistory?.[0]?.changedAt) ?? now - 60 * 60 * 1000;
    const rangeToTs = Math.max(
      rangeFromTs + 60 * 1000,
      parseTimestamp(activity.range?.to) ?? parseTimestamp(lastHistoryItem?.changedAt) ?? now,
    );

    const durations: Record<PresenceStatus, number> = {
      ONLINE: 0,
      BUSY: 0,
      AWAY: 0,
      IDLE: 0,
      OFFLINE: 0,
    };

    const history = (activity.presenceHistory ?? [])
      .map((item, idx) => ({
        status: normalizePresenceStatus(item.status),
        ts: parseTimestamp(item.changedAt) ?? rangeFromTs + idx * 60_000,
      }))
      .sort((a, b) => a.ts - b.ts);

    let prevStatus = history[0]?.status ?? 'OFFLINE';
    let prevTs = rangeFromTs;

    for (const item of history) {
      const start = Math.max(prevTs, rangeFromTs);
      const end = Math.min(item.ts, rangeToTs);
      if (end > start) durations[prevStatus] += end - start;
      prevStatus = item.status;
      prevTs = item.ts;
    }

    if (rangeToTs > prevTs) {
      durations[prevStatus] += rangeToTs - Math.max(prevTs, rangeFromTs);
    }

    const recent = activity.messages?.recent ?? [];
    const historyMessages = (activity.presenceHistory ?? []).flatMap((item) => item.messages ?? []);
    const combinedMessages = [...historyMessages, ...recent];

    const inboundCount =
      typeof activity.messages?.inbound === 'number'
        ? activity.messages.inbound
        : combinedMessages.filter((m) => m.direction === 'inbound').length;

    const outboundCount =
      typeof activity.messages?.outbound === 'number'
        ? activity.messages.outbound
        : combinedMessages.filter((m) => m.direction === 'outbound').length;

    return {
      durations,
      inbound: inboundCount,
      outbound: outboundCount,
      totalMessages: inboundCount + outboundCount,
    };
  }, [activity]);

  const ActivityTimeline = ({ isLoading }: { isLoading: boolean }) => {
    if (isLoading) {
      return <div className={styles.activitySkeleton} aria-label="Загрузка активности" />;
    }

    if (!activityTimelineData) {
      return <div className={styles.activityEmpty}>Нет данных активности</div>;
    }

    return (
      <button
        type="button"
        className={styles.activityOpenButton}
        onClick={() => setIsActivityFullscreen(true)}
      >
        Показать график активности
      </button>
    );
  };

  const ActivityLegend = () => (
    <div className={styles.activityLegend}>
      <span className={`${styles.activityLegendPill} ${styles.activityLegendOnline}`}>Online</span>
      <span className={`${styles.activityLegendPill} ${styles.activityLegendBusy}`}>Busy</span>
      <span className={`${styles.activityLegendPill} ${styles.activityLegendAway}`}>Away</span>
      <span className={`${styles.activityLegendPill} ${styles.activityLegendIdle}`}>Idle</span>
      <span className={`${styles.activityLegendPill} ${styles.activityLegendOffline}`}>Offline</span>
      <span className={styles.activityLegendDotInbound}>Входящие</span>
      <span className={styles.activityLegendDotOutbound}>Исходящие</span>
    </div>
  );

  const ActivityMeta = () => {
    if (!activityStats) return null;

    const statusOrder: PresenceStatus[] = ['ONLINE', 'BUSY', 'AWAY', 'IDLE', 'OFFLINE'];
    const labels: Record<PresenceStatus, string> = {
      ONLINE: 'Онлайн',
      BUSY: 'Занят',
      AWAY: 'Отошел',
      IDLE: 'Бездействует',
      OFFLINE: 'Оффлайн',
    };

    return (
      <div className={styles.activityMeta}>
        {statusOrder
          .filter((status) => activityStats.durations[status] > 0)
          .map((status) => (
            <div key={status} className={styles.activityStat}>
              <span>{labels[status]}</span>
              <strong>{formatDurationShort(activityStats.durations[status])}</strong>
            </div>
          ))}
        <div className={styles.activityStat}>
          <span>Входящие</span>
          <strong>{activityStats.inbound}</strong>
        </div>
        <div className={styles.activityStat}>
          <span>Исходящие</span>
          <strong>{activityStats.outbound}</strong>
        </div>
        <div className={styles.activityStatTotal}>
          <span>Всего сообщений</span>
          <strong>{activityStats.totalMessages}</strong>
        </div>
      </div>
    );
  };

  const ActivityFullscreen = () => (
    <div className={styles.activityFullscreen} role="dialog" aria-label="Детальная активность">
      <div className={styles.activityFullscreenContent}>
        <div className={styles.activityFullscreenHeader}>
          <div>
            <div className={styles.activityFullscreenTitle}>Детальная активность</div>
            <div className={styles.activityFullscreenSubtitle}>Статусы оператора и сообщения за выбранный диапазон</div>
          </div>
          <button
            type="button"
            className={styles.activityFullscreenClose}
            aria-label="Закрыть"
            onClick={() => setIsActivityFullscreen(false)}
          >
            ×
          </button>
        </div>
        <div className={styles.activityFullscreenBody}>
          <div className={styles.activityChartWide}>
            <ActivityTimeline isLoading={isActivityLoading} />
          </div>
        </div>
        <ActivityLegend />
        <ActivityMeta />
      </div>
    </div>
  );

  const updateChatInState = useCallback((chat: Chat) => {
    setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, ...chat } : c)));
  }, []);

  const handleChatClick = useCallback(
    (chatId: number) => {
      if (isRetroTheme) {
        setIsSceneTransitioning(true);
        window.setTimeout(() => setIsSceneTransitioning(false), 280);
      }
      setSelectedChatId(chatId);
      setMessages([]);
      setMessagesError('');
      setSendError('');
      setPendingAttachment(null);
      setPreviewCaption('');
      setMediaError('');
      setSuggestions([]);
      setSuggestionsError('');
      setIsLoadingSuggestions(false);
      setSuggestionsFromCache(false);
      setMessagesPagination((prev) => ({ ...prev, offset: 0, hasMore: false, total: 0 }));
      messagesPaginationRef.current = { ...messagesPaginationRef.current, offset: 0, hasMore: false };
    },
    [isRetroTheme, setSelectedChatId]
  );

  const getFilteredChats = useCallback((): Chat[] => {
    let result = deferredChats;

    if (activeFilter === 'my' && user) {
      // Сервер уже возвращает assignedToMe, не фильтруем повторно чтобы не терять чаты из-за несовпадения id
      return result;
    } else if (activeFilter === 'ignored') {
      result = result.filter((c) => c.status === 'closed');
    } else if (activeFilter === 'open') {
      result = result.filter((c) => c.status === 'open');
    } else if (activeFilter === 'unread') {
      result = result.filter((c) => (c.unreadCount ?? 0) > 0);
    }

    if (priorityFilter) {
      result = result.filter((c) => c.priority === priorityFilter);
    }

    if (channelFilter) {
      result = result.filter((c) => c.channel === channelFilter);
    }

    return result;
  }, [activeFilter, channelFilter, deferredChats, priorityFilter, user]);

  const filteredChats = useMemo(() => getFilteredChats(), [getFilteredChats]);
  const chatItemEstimatedHeight = CHAT_ITEM_ESTIMATED_HEIGHT_BY_DENSITY[densityMode];

  const getSlaMeta = useCallback((chat: Chat) => {
    const diffMs = Date.now() - new Date(chat.lastMessageAt).getTime();
    const minutes = Math.max(0, Math.floor(diffMs / 60000));
    if (minutes >= 30) return { label: `SLA ${minutes}м`, level: 'critical' as const };
    if (minutes >= 15) return { label: `SLA ${minutes}м`, level: 'warning' as const };
    return { label: `SLA ${minutes}м`, level: 'ok' as const };
  }, []);

  const toggleChatSelection = useCallback((chatId: number) => {
    setSelectedChatIds((prev) => (prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId]));
  }, []);

  const clearBulkSelection = useCallback(() => {
    setSelectedChatIds([]);
  }, []);

  const selectAllFilteredChats = useCallback(() => {
    setSelectedChatIds(filteredChats.map((chat) => chat.id));
  }, [filteredChats]);

  const handleBulkMarkRead = useCallback(async () => {
    if (selectedChatIds.length === 0) return;
    setIsBulkActionLoading(true);
    try {
      await Promise.all(selectedChatIds.map((id) => chatsApi.markChatRead(id)));
      setChats((prev) => prev.map((chat) => (selectedChatIds.includes(chat.id) ? { ...chat, unreadCount: 0 } : chat)));
      emitToast(`Отмечено прочитанными: ${selectedChatIds.length}`);
      setSelectedChatIds([]);
    } catch {
      emitToast('Не удалось применить массовое действие');
    } finally {
      setIsBulkActionLoading(false);
    }
  }, [selectedChatIds]);

  const handleBulkAssignToMe = useCallback(async () => {
    if (!user || selectedChatIds.length === 0) return;
    setIsBulkActionLoading(true);
    try {
      const selectedSet = new Set(selectedChatIds);
      const targets = chats.filter((chat) => selectedSet.has(chat.id) && !chat.assignedUser).map((chat) => chat.id);
      const assigned = await Promise.all(targets.map((chatId) => chatsApi.assignChat({ chatId, operatorId: user.id })));
      const map = new Map(assigned.map((item) => [item.chat.id, item.chat]));
      setChats((prev) => prev.map((chat) => map.get(chat.id) ?? chat));
      emitToast(`Назначено на вас: ${targets.length}`);
      setSelectedChatIds([]);
    } catch {
      emitToast('Не удалось назначить выбранные чаты');
    } finally {
      setIsBulkActionLoading(false);
    }
  }, [chats, selectedChatIds, user]);

  const shouldVirtualizeChats = false;

  const virtualChatWindow = useMemo(() => {
    if (!shouldVirtualizeChats) return null;

    const viewportHeight = chatListViewport.height || 620;
    const visibleCount = Math.max(1, Math.ceil(viewportHeight / chatItemEstimatedHeight));
    const start = Math.max(
      0,
      Math.floor(chatListViewport.scrollTop / chatItemEstimatedHeight) - CHAT_LIST_OVERSCAN
    );
    const end = Math.min(filteredChats.length, start + visibleCount + CHAT_LIST_OVERSCAN * 2);

    return {
      start,
      end,
      paddingTop: start * chatItemEstimatedHeight,
      paddingBottom: (filteredChats.length - end) * chatItemEstimatedHeight,
    };
  }, [chatItemEstimatedHeight, chatListViewport.height, chatListViewport.scrollTop, filteredChats.length, shouldVirtualizeChats]);

  const chatsToRender = useMemo(() => {
    if (!virtualChatWindow) return filteredChats;
    return filteredChats.slice(virtualChatWindow.start, virtualChatWindow.end);
  }, [filteredChats, virtualChatWindow]);

  useEffect(() => {
    const stored = localStorage.getItem('chat-density-mode') as DensityMode | null;
    if (!stored) return;
    if (stored === 'comfortable' || stored === 'compact' || stored === 'ultra') {
      setDensityMode(stored);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('chat-density-mode', densityMode);
  }, [densityMode]);

  useEffect(() => {
    localStorage.setItem('chat-ai-suggestions-enabled', isSuggestionsEnabled ? 'on' : 'off');
  }, [isSuggestionsEnabled]);

  useEffect(() => {
    const allowed = new Set(filteredChats.map((chat) => chat.id));
    setSelectedChatIds((prev) => prev.filter((id) => allowed.has(id)));
  }, [filteredChats]);

  const updateChatListViewport = useCallback(() => {
    const el = chatListRef.current;
    if (!el) return;

    setChatListViewport((prev) => {
      const next = { scrollTop: el.scrollTop, height: el.clientHeight };
      if (prev.scrollTop === next.scrollTop && prev.height === next.height) return prev;
      return next;
    });
  }, []);

  const loadCurrentTicket = useCallback(async () => {
    if (!currentTicketNumber) {
      setCurrentTicket(null);
      setTicketError('');
      return;
    }

    setIsLoadingTicket(true);
    setTicketError('');
    try {
      const ticket = await ticketsApi.getTicket(currentTicketNumber);
      setCurrentTicket(ticket);
    } catch (err) {
      setCurrentTicket(null);
      if (err instanceof NetworkError) setTicketError(err.message);
      else setTicketError('Не удалось загрузить тикет');
    } finally {
      setIsLoadingTicket(false);
    }
  }, [currentTicketNumber]);

  const loadTicketHistory = useCallback(async () => {
    if (!currentTicketNumber) {
      setTicketHistory([]);
      setTicketHistoryError('');
      return;
    }

    setIsTicketHistoryLoading(true);
    setTicketHistoryError('');
    try {
      const response = await ticketsApi.getHistory(String(currentTicketNumber));
      const normalized = normalizeTicketHistory(Array.isArray(response?.history) ? response.history : []);
      setTicketHistory(normalized);
    } catch (err) {
      setTicketHistory([]);
      if (err instanceof NetworkError) setTicketHistoryError(err.message);
      else setTicketHistoryError('Не удалось загрузить историю тикета');
    } finally {
      setIsTicketHistoryLoading(false);
    }
  }, [currentTicketNumber]);

  const loadClientComments = useCallback(async (chatId: number | null, options?: { append?: boolean }) => {
    if (!chatId) {
      setClientComments([]);
      setCommentsError('');
      setCommentsPagination((prev) => ({ ...prev, offset: 0, total: 0, hasMore: false }));
      commentsPaginationRef.current = { ...commentsPaginationRef.current, offset: 0, total: 0, hasMore: false };
      return;
    }

    const append = options?.append ?? false;
    if (append) setIsLoadingMoreComments(true);
    else setIsLoadingComments(true);
    setCommentsError('');

    const { limit, offset: currentOffset } = commentsPaginationRef.current;
    const offset = append ? currentOffset : 0;

    try {
      const response = await clientsApi.getComments(chatId, { limit, offset });
      const comments = response.comments ?? [];
      const pagination = response.pagination ?? {};

      const totalFromApi = typeof pagination.total === 'number' ? pagination.total : undefined;
      const nextOffset = offset + comments.length;
      const total = totalFromApi ?? (append ? Math.max(currentOffset, nextOffset) : comments.length);
      const hasMoreFromApi = typeof pagination.hasMore === 'boolean' ? pagination.hasMore : undefined;
      const hasMore = hasMoreFromApi ?? (typeof total === 'number' ? nextOffset < total : comments.length === limit);

      commentsPaginationRef.current = { limit, offset: nextOffset, total: total ?? nextOffset, hasMore };
      setCommentsPagination(commentsPaginationRef.current);
      setClientComments((prev) => (append ? [...prev, ...comments] : comments));
    } catch (err) {
      if (err instanceof NetworkError) setCommentsError(err.message);
      else setCommentsError('Не удалось загрузить комментарии');
    } finally {
      if (append) setIsLoadingMoreComments(false);
      else setIsLoadingComments(false);
    }
  }, []);

  const handleAddComment = useCallback(async () => {
    if (!selectedChatId) return;
    const text = commentInput.trim();
    if (!text) return;

    setIsAddingComment(true);
    setCommentsError('');
    try {
      const newComment = await clientsApi.addComment(selectedChatId, text);
      setClientComments((prev) => [newComment, ...prev]);
      setCommentsPagination((prev) => ({
        ...prev,
        total: (prev.total || prev.offset || 0) + 1,
      }));
      commentsPaginationRef.current = {
        ...commentsPaginationRef.current,
        total: (commentsPaginationRef.current.total || commentsPaginationRef.current.offset || 0) + 1,
      };
      setCommentInput('');
    } catch (err) {
      if (err instanceof NetworkError) setCommentsError(err.message);
      else setCommentsError('Не удалось добавить комментарий');
    } finally {
      setIsAddingComment(false);
    }
  }, [commentInput, selectedChatId]);

  const withTicketAction = useCallback(async (
    action: () => Promise<unknown>,
    fallbackError: string,
    options?: {
      optimisticUpdate?: (prev: Ticket | null) => Ticket | null;
      onSuccessText?: string;
      onFailText?: string;
    }
  ) => {
    const snapshot = currentTicket;

    if (options?.optimisticUpdate) {
      setCurrentTicket((prev) => options.optimisticUpdate?.(prev) ?? prev);
    }

    setIsTicketActionLoading(true);
    setTicketActionError('');
    setLiveAnnouncement('Выполняем действие по тикету');

    try {
      await action();
      await loadCurrentTicket();
      if (options?.onSuccessText) {
        pushLocalAction(options.onSuccessText, 'success');
        setLiveAnnouncement(options.onSuccessText);
      }
      void loadTicketHistory();
      return true;
    } catch (err) {
      setCurrentTicket(snapshot);
      if (err instanceof NetworkError) setTicketActionError(err.message);
      else setTicketActionError(fallbackError);

      const failText = options?.onFailText || fallbackError;
      pushLocalAction(failText, 'danger');
      setLiveAnnouncement(failText);
      return false;
    } finally {
      setIsTicketActionLoading(false);
    }
  }, [currentTicket, loadCurrentTicket, loadTicketHistory, pushLocalAction]);

  const handleAssignTicketToMe = useCallback(async () => {
    if (!currentTicketNumber || !user?.id) return;
    await withTicketAction(
      () => ticketsApi.assignTicket(currentTicketNumber, user.id),
      'Не удалось назначить тикет на вас',
      {
        optimisticUpdate: (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            assignedUserId: user.id,
            assignedUser: {
              id: user.id,
              email: user.email,
            },
          };
        },
        onSuccessText: 'Тикет назначен на вас',
      }
    );
  }, [currentTicketNumber, user, withTicketAction]);

  const handleSetTicketStatus = useCallback(async (status: string) => {
    if (!currentTicketNumber) return;
    await withTicketAction(
      () => ticketsApi.setStatus(currentTicketNumber, status),
      'Не удалось изменить статус тикета',
      {
        optimisticUpdate: (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status,
            updatedAt: new Date().toISOString(),
          };
        },
        onSuccessText: `Статус тикета обновлен: ${status}`,
      }
    );
  }, [currentTicketNumber, withTicketAction]);

  const handleSetTicketPriority = useCallback(async (priority: string) => {
    if (!currentTicketNumber) return;
    await withTicketAction(
      () => ticketsApi.setPriority(currentTicketNumber, priority),
      'Не удалось изменить приоритет тикета',
      {
        optimisticUpdate: (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            priority,
            updatedAt: new Date().toISOString(),
          };
        },
        onSuccessText: `Приоритет тикета обновлен: ${priority}`,
      }
    );
  }, [currentTicketNumber, withTicketAction]);

  const handleCloseTicket = useCallback(async () => {
    if (!currentTicketNumber) return;
    const success = await withTicketAction(
      () => ticketsApi.closeTicket(currentTicketNumber),
      'Не удалось закрыть тикет',
      {
        optimisticUpdate: (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status: 'closed',
            closedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        },
        onSuccessText: 'Тикет закрыт',
      }
    );
    if (!success) return;
    setTicketActionToast('Boss objective closed');
    spawnPixelBurst('success');
    window.setTimeout(() => setTicketActionToast(''), 2200);
  }, [currentTicketNumber, spawnPixelBurst, withTicketAction]);

  const chatsPaginationRef = useRef({ limit: 50, offset: 0, hasMore: false });
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const chatListScrollTopRef = useRef(0);
  const shouldRestoreChatListScrollRef = useRef(false);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);
  const lastAutoScrolledChatIdRef = useRef<number | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesPaginationRef = useRef({ limit: 50, offset: 0, hasMore: false });
  const pendingScrollAdjustRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(null);
  const messagesRefreshInFlightRef = useRef(false);
  const messagesLoadSeqRef = useRef(0);
  const translationsRef = useRef<Record<number, TranslationState>>({});
  const suggestionsCacheRef = useRef<Map<number, { signature: string; suggestions: string[] }>>(new Map());

  const [messagesPagination, setMessagesPagination] = useState({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false,
  });
  const [isFormatBarOpen, setIsFormatBarOpen] = useState(false);

  const handleApplySearch = useCallback(() => {
    setAppliedSearch(searchText.trim());
  }, [searchText]);

  const buildChatsQuery = (options: { limit: number; offset: number }) => {
    const { limit, offset } = options;

    const status =
      activeFilter === 'open'
        ? 'open'
        : activeFilter === 'ignored'
          ? 'closed'
          : undefined;

    const shouldForceMy = activeFilter === 'my';
    const assignedToMe = shouldForceMy ? true : undefined;

    return {
      includeProfile: true,
      status,
      assignedToMe,
      priority: priorityFilter || undefined,
      channel: channelFilter || undefined,
      search: appliedSearch || undefined,
      searchType,
      sortBy: sortBy || undefined,
      sortOrder,
      limit,
      offset,
    };
  };

  useEffect(() => {
    void loadChats();

    // Обновление списка чатов каждые 2 секунды
    const interval = setInterval(() => {
      void loadChats({ silent: true });
    }, 2000);

    return () => clearInterval(interval);
  }, [activeFilter, appliedSearch, searchType, channelFilter, priorityFilter, sortBy, sortOrder]);

  useLayoutEffect(() => {
    if (!shouldRestoreChatListScrollRef.current) return;
    const el = chatListRef.current;
    if (!el) return;
    el.scrollTop = chatListScrollTopRef.current;
    updateChatListViewport();
    shouldRestoreChatListScrollRef.current = false;
  }, [chats, updateChatListViewport]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  useEffect(() => {
    translationsRef.current = translationsByMessageId;
  }, [translationsByMessageId]);

  useEffect(() => {}, []);

  useEffect(() => {
    if (selectedChatId) {
      void loadMessages(selectedChatId);
    } else {
      setMessages([]);
    }
  }, [selectedChatId]);

  useEffect(() => {
    commentsPaginationRef.current = { limit: 50, offset: 0, total: 0, hasMore: false };
    setCommentsPagination(commentsPaginationRef.current);
    void loadClientComments(selectedChatId, { append: false });
  }, [loadClientComments, selectedChatId]);

  useEffect(() => {
    void loadCurrentTicket();
  }, [loadCurrentTicket]);

  useEffect(() => {
    void loadTicketHistory();
  }, [loadTicketHistory]);

  useEffect(() => {
    if (!ticketActionError) return;
    setTicketActionToast(ticketActionError);
    const t = setTimeout(() => setTicketActionToast(''), 3500);
    return () => clearTimeout(t);
  }, [ticketActionError]);

  useEffect(() => {
    setTranslationsByMessageId({});
  }, [selectedChatId]);

  useEffect(() => {
    setLocalActionTimeline([]);
  }, [selectedChatId]);

  useEffect(() => {
    if (!selectedChatId) return;

    // Периодическое обновление сообщений активного чата (раз в 7 секунд)
    const interval = setInterval(() => {
      void loadMessages(selectedChatId, { silent: true });
    }, 7000);

    return () => clearInterval(interval);
  }, [selectedChatId]);

  useEffect(() => {
    setIsLoadingSuggestions(false);
    setSuggestionsError('');
    setSuggestions([]);
    setSuggestionsFromCache(false);
  }, [selectedChatId]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const bottomGap = el.scrollHeight - el.scrollTop - el.clientHeight;
      const scrolledUp = bottomGap > 40;
      userScrolledUpRef.current = scrolledUp;
      setShowScrollToBottom(scrolledUp);

      if (
        el.scrollTop <= 80 &&
        !isLoadingMessages &&
        !isLoadingMoreMessages &&
        messagesPaginationRef.current.hasMore &&
        selectedChatId
      ) {
        void loadMoreMessages(selectedChatId);
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => el.removeEventListener('scroll', handleScroll);
  }, [selectedChatId, isLoadingMessages, isLoadingMoreMessages]);

  const scrollMessagesToBottom = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    userScrolledUpRef.current = false;
    setShowScrollToBottom(false);
  };

  useLayoutEffect(() => {
    if (!selectedChatId) return;
    const el = messagesContainerRef.current;
    if (!el) return;

    if (pendingScrollAdjustRef.current) {
      const { prevScrollHeight, prevScrollTop } = pendingScrollAdjustRef.current;
      const delta = el.scrollHeight - prevScrollHeight;
      el.scrollTop = prevScrollTop + delta;
      pendingScrollAdjustRef.current = null;
      return;
    }

    const shouldForce = lastAutoScrolledChatIdRef.current !== selectedChatId;
    if (shouldForce || !userScrolledUpRef.current) {
      el.scrollTop = el.scrollHeight;
      lastAutoScrolledChatIdRef.current = selectedChatId;
    }
  }, [selectedChatId, messages.length, isLoadingMessages]);

  useEffect(() => {
    messagesPaginationRef.current = {
      limit: messagesPagination.limit,
      offset: messagesPagination.offset,
      hasMore: messagesPagination.hasMore,
    };
  }, [messagesPagination.limit, messagesPagination.offset, messagesPagination.hasMore]);

  useEffect(() => {
    chatsPaginationRef.current = {
      limit: pagination.limit,
      offset: pagination.offset,
      hasMore: pagination.hasMore,
    };
  }, [pagination.limit, pagination.offset, pagination.hasMore]);

  useEffect(() => {
    const el = chatListRef.current;
    if (!el) return;

    const handleScroll = () => {
      updateChatListViewport();
      const bottomGap = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (bottomGap > 120) return;

      if (isLoading || isLoadingMoreChats) return;
      if (!chatsPaginationRef.current.hasMore) return;
      void loadMoreChats();
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    updateChatListViewport();
    const handleResize = () => updateChatListViewport();
    window.addEventListener('resize', handleResize);

    return () => {
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [isLoading, isLoadingMoreChats, activeFilter, updateChatListViewport]);

  useEffect(() => {
    updateChatListViewport();
  }, [filteredChats.length, updateChatListViewport]);

  const loadChats = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    const el = chatListRef.current;

    if (silent && el) {
      chatListScrollTopRef.current = el.scrollTop;
      shouldRestoreChatListScrollRef.current = true;
    }

    if (!silent) {
      setIsLoading(true);
      setError('');
    }

    try {
      const response = await chatsApi.getChats(buildChatsQuery({ limit: 50, offset: 0 }));
      const nextChats = response.chats || [];
      setChats(nextChats);
      setPagination(
        response.pagination || {
          total: nextChats.length,
          limit: 50,
          offset: 0,
          hasMore: false,
        }
      );
      
      // Сохраняем общее количество всех чатов только когда фильтр "all"
      if (activeFilter === 'all') {
      }
    } catch (err) {
      if (silent) return;
      if (err instanceof NetworkError) {
        setError(err.message);
      } else {
        setError('Не удалось загрузить чаты');
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const loadMoreChats = async () => {
    if (isLoadingMoreChats) return;
    if (!chatsPaginationRef.current.hasMore) return;

    setIsLoadingMoreChats(true);
    setError('');

    try {
      const nextOffset = chatsPaginationRef.current.offset + chatsPaginationRef.current.limit;
      const response = await chatsApi.getChats(
        buildChatsQuery({ limit: chatsPaginationRef.current.limit, offset: nextOffset })
      );

      const incoming = response.chats || [];
      setChats((prev) => {
        const existing = new Set(prev.map((c) => c.id));
        const appended = incoming.filter((c) => !existing.has(c.id));
        return prev.concat(appended);
      });
      setPagination(
        response.pagination || {
          total: (response.chats || []).length,
          limit: chatsPaginationRef.current.limit,
          offset: chatsPaginationRef.current.offset,
          hasMore: false,
        }
      );
    } catch (err) {
      if (err instanceof NetworkError) {
        setError(err.message);
      } else {
        setError('Не удалось загрузить чаты');
      }
    } finally {
      setIsLoadingMoreChats(false);
    }
  };

  const loadMessages = async (chatId: number, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;

    if (silent && messagesRefreshInFlightRef.current) return;
    if (silent && (isLoadingMessages || isLoadingMoreMessages)) return;

    const seq = ++messagesLoadSeqRef.current;

    if (silent) {
      messagesRefreshInFlightRef.current = true;
    } else {
      setIsLoadingMessages(true);
      setMessagesError('');
    }

    try {
      const response = await chatsApi.getMessages(chatId, {
        limit: messagesPaginationRef.current.limit,
        offset: 0,
      });

      if (selectedChatIdRef.current !== chatId) return;
      if (seq !== messagesLoadSeqRef.current) return;

      const incomingSorted = (response.messages || []).slice().sort((a, b) => {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });

      if (silent) {
        setMessagesError('');
        setMessages((prev) => {
          const map = new Map<number, Message>();
          for (const m of prev) map.set(m.id, m);
          for (const m of incomingSorted) map.set(m.id, m);
          return Array.from(map.values()).sort((a, b) => {
            return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          });
        });

        setMessagesPagination((prev) => {
          const total = response.pagination.total;
          const limit = prev.limit;
          const offset = prev.offset;
          return {
            total,
            limit,
            offset,
            hasMore: offset + limit < total,
          };
        });
        return;
      }

      setMessages(incomingSorted);
      setMessagesPagination({
        total: response.pagination.total,
        limit: response.pagination.limit,
        offset: response.pagination.offset,
        hasMore:
          typeof response.pagination.hasMore === 'boolean'
            ? response.pagination.hasMore
            : response.pagination.offset + response.pagination.limit < response.pagination.total,
      });
    } catch (err) {
      if (err instanceof NetworkError) {
        setMessagesError(err.message);
        emitToast(err.message);
      } else {
        const msg = 'Не удалось загрузить сообщения';
        setMessagesError(msg);
        emitToast(msg);
      }
    } finally {
      if (silent) {
        messagesRefreshInFlightRef.current = false;
      } else {
        setIsLoadingMessages(false);
      }
    }
  };

  const loadMoreMessages = async (chatId: number) => {
    if (isLoadingMoreMessages) return;
    setIsLoadingMoreMessages(true);
    setMessagesError('');

    try {
      const { limit, offset } = messagesPaginationRef.current;
      const nextOffset = offset + limit;

      const response = await chatsApi.getMessages(chatId, {
        limit,
        offset: nextOffset,
      });

      setMessages((prev) => {
        const merged = [...prev, ...response.messages];
        return merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      });

      setMessagesPagination({
        total: response.pagination.total,
        limit: response.pagination.limit,
        offset: response.pagination.offset,
        hasMore:
          typeof response.pagination.hasMore === 'boolean'
            ? response.pagination.hasMore
            : response.pagination.offset + response.pagination.limit < response.pagination.total,
      });
    } catch (err) {
      if (err instanceof NetworkError) {
        setMessagesError(err.message);
      } else {
        setMessagesError('Не удалось загрузить сообщения');
      }
    } finally {
      setIsLoadingMoreMessages(false);
    }
  };

  const handleToggleAssignment = async () => {
    if (!selectedChatId || !user) return;
    const current = chats.find((c) => c.id === selectedChatId) || null;
    if (!current) return;

    const optimisticAssignedUser = current.assignedUser
      ? null
      : {
        id: user.id,
        email: user.email,
        name: null,
      };

    setChats((prev) => prev.map((chat) => (
      chat.id === selectedChatId
        ? { ...chat, assignedUser: optimisticAssignedUser }
        : chat
    )));
    const actionText = current.assignedUser ? 'Назначение чата снято' : 'Чат назначен на вас';
    setLiveAnnouncement(`${actionText}. Сохраняем изменения`);

    setIsAssigningChat(true);
    try {
      const resp = current?.assignedUser ? await chatsApi.unassignChat({ chatId: selectedChatId }) : await chatsApi.assignChat({ chatId: selectedChatId, operatorId: user.id });
      updateChatInState(resp.chat);
      pushLocalAction(actionText, 'success');
      setLiveAnnouncement(actionText);
    } catch (err) {
      setChats((prev) => prev.map((chat) => (
        chat.id === selectedChatId
          ? { ...chat, assignedUser: current.assignedUser }
          : chat
      )));

      if (err instanceof NetworkError) {
        setError(err.message);
        emitToast(err.message);
        setLiveAnnouncement(err.message);
      } else {
        const msg = 'Не удалось изменить назначение чата';
        setError(msg);
        emitToast(msg);
        setLiveAnnouncement(msg);
      }
      pushLocalAction('Не удалось обновить назначение чата', 'danger');
    } finally {
      setIsAssigningChat(false);
    }
  };

  const handleMarkChatRead = useCallback(async () => {
    if (!selectedChatId) return;
    const current = chats.find((c) => c.id === selectedChatId) || null;
    const previousUnread = current?.unreadCount ?? 0;

    setChats((prev) => prev.map((c) => (c.id === selectedChatId ? { ...c, unreadCount: 0 } : c)));
    setLiveAnnouncement('Помечаем чат как прочитанный');

    try {
      await chatsApi.markChatRead(selectedChatId);
      pushLocalAction('Чат помечен прочитанным', 'success');
      setLiveAnnouncement('Чат помечен прочитанным');
    } catch (err) {
      setChats((prev) => prev.map((c) => (c.id === selectedChatId ? { ...c, unreadCount: previousUnread } : c)));

      if (err instanceof NetworkError) {
        setError(err.message);
        emitToast(err.message);
        setLiveAnnouncement(err.message);
      } else {
        const msg = 'Не удалось отметить чат прочитанным';
        setError(msg);
        emitToast(msg);
        setLiveAnnouncement(msg);
      }
      pushLocalAction('Не удалось отметить чат прочитанным', 'danger');
    }
  }, [chats, pushLocalAction, selectedChatId]);

  const handleSearchInputChange = useCallback(
    (value: string) => {
      if (searchType === 'phone') {
        const formatted = formatPhoneInput(value);
        setSearchText(formatted);
        return;
      }
      setSearchText(value);
    },
    [searchType]
  );

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedChatId || isSendingMessage) return;
    const firefoxSendWarning = isFirefoxLikeBrowser();
    
    setIsSendingMessage(true);
    setSendError('');
    try {
      await chatsApi.sendMessage(selectedChatId, messageInput);
      setMessageInput('');
      if (firefoxSendWarning) {
        setSendError(FIREFOX_SEND_WARNING);
      }
      void loadMessages(selectedChatId);
    } catch (err) {
      if (err instanceof NetworkError) {
        setSendError(firefoxSendWarning ? `${err.message}. ${FIREFOX_SEND_WARNING}` : err.message);
      }
      if (!(err instanceof NetworkError)) {
        setSendError(
          firefoxSendWarning
            ? `Не удалось отправить сообщение. ${FIREFOX_SEND_WARNING}`
            : 'Не удалось отправить сообщение'
        );
      }
    } finally {
      setIsSendingMessage(false);
    }
  };

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const handleGlobalHotkeys = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isMod = event.ctrlKey || event.metaKey;
      const isModShift = isMod && event.shiftKey;

      if (isMod && key === 'k') {
        event.preventDefault();
        const searchEl = document.getElementById('chat-search-input') as HTMLInputElement | null;
        searchEl?.focus();
        searchEl?.select();
        return;
      }

      if (key === '/' && !isEditableTarget(event.target)) {
        event.preventDefault();
        const searchEl = document.getElementById('chat-search-input') as HTMLInputElement | null;
        searchEl?.focus();
        searchEl?.select();
        return;
      }

      if (event.shiftKey && event.key === '?' && !isEditableTarget(event.target)) {
        event.preventDefault();
        setIsHotkeysHelpOpen((prev) => !prev);
        return;
      }

      if (event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        if (key === '1') {
          event.preventDefault();
          setActiveFilter('all');
          return;
        }
        if (key === '2') {
          event.preventDefault();
          setActiveFilter('my');
          return;
        }
        if (key === '3') {
          event.preventDefault();
          setActiveFilter('unread');
          return;
        }
        if (key === 'r' && selectedChatId) {
          event.preventDefault();
          void handleMarkChatRead();
          return;
        }
      }

      if (isEditableTarget(event.target)) return;

      if (key === 'escape' && isHotkeysHelpOpen) {
        event.preventDefault();
        setIsHotkeysHelpOpen(false);
        return;
      }

      if (isModShift && key === 'a') {
        event.preventDefault();
        selectAllFilteredChats();
        return;
      }

      if (isModShift && key === 'd') {
        event.preventDefault();
        clearBulkSelection();
        return;
      }

      if (isModShift && key === 'r') {
        event.preventDefault();
        void handleBulkMarkRead();
        return;
      }

      if (isModShift && key === 'm') {
        event.preventDefault();
        void handleBulkAssignToMe();
        return;
      }

      if (filteredChats.length === 0) return;

      if (key === 'j' || key === 'k' || key === '[' || key === ']') {
        event.preventDefault();
        const currentIndex = filteredChats.findIndex((chat) => chat.id === selectedChatId);
        const delta = key === 'j' || key === ']' ? 1 : -1;
        const nextIndex = currentIndex === -1 ? 0 : Math.max(0, Math.min(filteredChats.length - 1, currentIndex + delta));
        const nextChat = filteredChats[nextIndex];
        if (nextChat) handleChatClick(nextChat.id);
        return;
      }

      if (key === 'enter' && selectedChatId) {
        event.preventDefault();
        messageInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleGlobalHotkeys);
    return () => window.removeEventListener('keydown', handleGlobalHotkeys);
  }, [
    clearBulkSelection,
    filteredChats,
    handleBulkAssignToMe,
    handleBulkMarkRead,
    handleChatClick,
    handleMarkChatRead,
    isHotkeysHelpOpen,
    selectAllFilteredChats,
    selectedChatId,
  ]);

  const loadSuggestions = useCallback(
    async (options?: { force?: boolean }) => {
      if (!isSuggestionsEnabled || !selectedChatId || !canUseAiSuggestions) {
        setSuggestions([]);
        setSuggestionsError('');
        setSuggestionsFromCache(false);
        return;
      }

      // Token-saving strategy: one AI generation per chat, refresh only on explicit user action.
      const signature = `${selectedChatId}`;
      const cached = suggestionsCacheRef.current.get(selectedChatId);

      if (!options?.force && cached && cached.signature === signature) {
        setSuggestions(buildSafeSuggestions(cached.suggestions));
        setSuggestionsError('');
        setSuggestionsFromCache(true);
        return;
      }

      setIsLoadingSuggestions(true);
      setSuggestionsError('');
      try {
        const resp = await aiApi.getSuggestions(selectedChatId, 2);
        const next = buildSafeSuggestions(Array.isArray(resp.suggestions) ? resp.suggestions : []);
        setSuggestions(next);
        suggestionsCacheRef.current.set(selectedChatId, { signature, suggestions: next });
        setSuggestionsFromCache(false);
      } catch (err) {
        if (err instanceof NetworkError) {
          setSuggestionsError(err.message);
        } else {
          setSuggestionsError('Не удалось получить подсказки');
        }
      } finally {
        setIsLoadingSuggestions(false);
      }
    },
    [canUseAiSuggestions, isSuggestionsEnabled, selectedChatId]
  );

  useEffect(() => {
    if (!isSuggestionsEnabled || !selectedChatId || !canUseAiSuggestions) return;
    void loadSuggestions();
  }, [canUseAiSuggestions, isSuggestionsEnabled, loadSuggestions, selectedChatId]);

  useEffect(() => {
    if (canUseAiSuggestions && isSuggestionsEnabled) return;
    setIsLoadingSuggestions(false);
    setSuggestionsError('');
    setSuggestions([]);
    setSuggestionsFromCache(false);
  }, [canUseAiSuggestions, isSuggestionsEnabled]);

  const handlePickSuggestion = (text: string) => {
    setMessageInput((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text));
    messageInputRef.current?.focus();
  };

  const translateIncomingMessage = useCallback(async (message: Message) => {
    if (message.fromMe) return;
    const sourceText = message.content?.trim() ?? '';
    if (!sourceText) return;

    const current = translationsRef.current[message.id];
    if (current?.status === 'loading' || current?.status === 'done') return;

    setTranslationsByMessageId((prev) => ({
      ...prev,
      [message.id]: { status: 'loading' },
    }));

    try {
      const translated = await aiApi.translateText(sourceText, 'ru', 'auto');
      setTranslationsByMessageId((prev) => ({
        ...prev,
        [message.id]: { status: 'done', text: translated },
      }));
    } catch (err) {
      setTranslationsByMessageId((prev) => ({
        ...prev,
        [message.id]: {
          status: 'error',
          error: err instanceof NetworkError ? err.message : 'Не удалось перевести',
        },
      }));
    }
  }, []);

  const getMediaTypeFromFile = (file: File): 'image' | 'document' | 'video' | 'audio' => {
    const mime = file.type;
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'document';
  };

  const openAttachmentPreview = (file: File) => {
    const type = getMediaTypeFromFile(file);
    const previewUrl = URL.createObjectURL(file);
    setPendingAttachment({ file, type, previewUrl });
    setPreviewCaption('');
  };

  const closeAttachmentPreview = () => {
    setMediaError('');
    setPreviewCaption('');
    setPendingAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  };

  const handlePickFile = () => {
    setMediaError('');
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedChatId) return;

    if (file.size > 50 * 1024 * 1024) {
      setMediaError('Файл больше 50MB');
      return;
    }

    openAttachmentPreview(file);
  };

  const handlePaste: React.ClipboardEventHandler<HTMLTextAreaElement> = (e) => {
    const files = Array.from(e.clipboardData.files || []);
    if (files.length === 0) return;
    e.preventDefault();
    const file = files[0];
    if (file.size > 50 * 1024 * 1024) {
      setMediaError('Файл больше 50MB');
      return;
    }
    openAttachmentPreview(file);
  };

  const applyWhatsAppWrap = (left: string, right: string) => {
    const el = messageInputRef.current;
    if (!el) return;

    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const value = messageInput;
    const selected = value.slice(start, end);

    const next = value.slice(0, start) + left + selected + right + value.slice(end);
    setMessageInput(next);

    requestAnimationFrame(() => {
      el.focus();
      const nextStart = start + left.length;
      const nextEnd = end + left.length;
      el.setSelectionRange(nextStart, nextEnd);
    });
  };

  const renderWhatsAppInline = (text: string) => {
    const nodes: ReactNode[] = [];
    const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = re.exec(text)) !== null) {
      const idx = match.index;
      if (idx > lastIndex) nodes.push(text.slice(lastIndex, idx));
      const token = match[0];
      const inner = token.slice(1, -1);

      if (token.startsWith('*')) nodes.push(<strong key={`b-${key++}`}>{inner}</strong>);
      else if (token.startsWith('_')) nodes.push(<em key={`i-${key++}`}>{inner}</em>);
      else nodes.push(<del key={`s-${key++}`}>{inner}</del>);

      lastIndex = idx + token.length;
    }

    if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
    return nodes;
  };

  const renderWhatsAppText = (text: string) => {
    const nodes: ReactNode[] = [];
    let rest = text;
    let key = 0;

    while (true) {
      const start = rest.indexOf('```');
      if (start === -1) break;

      const before = rest.slice(0, start);
      if (before) nodes.push(...renderWhatsAppInline(before));
      rest = rest.slice(start + 3);

      const end = rest.indexOf('```');
      if (end === -1) {
        nodes.push(...renderWhatsAppInline('```' + rest));
        rest = '';
        break;
      }

      const code = rest.slice(0, end);
      nodes.push(
        <code key={`c-${key++}`} className={styles.messageCode}>
          {code}
        </code>
      );
      rest = rest.slice(end + 3);
    }

    if (rest) nodes.push(...renderWhatsAppInline(rest));
    return nodes;
  };

  const handleSendPendingAttachment = async () => {
    if (!pendingAttachment || !selectedChatId) return;
    const firefoxSendWarning = isFirefoxLikeBrowser();
    setIsSendingMedia(true);
    setMediaError('');

    try {
      const upload = await chatsApi.uploadMediaForWaba(pendingAttachment.file, pendingAttachment.type);
      await chatsApi.sendMediaMessage({
        chatId: selectedChatId,
        type: pendingAttachment.type,
        mediaUrl: upload.mediaUrl,
        filename:
          pendingAttachment.type === 'document'
            ? upload.metadata?.originalName || pendingAttachment.file.name
            : undefined,
        caption: previewCaption.trim() ? previewCaption.trim() : undefined,
      });
      closeAttachmentPreview();
      await loadMessages(selectedChatId, { silent: true });
      messageInputRef.current?.focus();
      if (firefoxSendWarning) {
        setMediaError(FIREFOX_SEND_WARNING);
      }
    } catch (err) {
      if (err instanceof NetworkError) {
        setMediaError(firefoxSendWarning ? `${err.message}. ${FIREFOX_SEND_WARNING}` : err.message);
      } else {
        setMediaError(
          firefoxSendWarning
            ? `Не удалось отправить медиа. ${FIREFOX_SEND_WARNING}`
            : 'Не удалось отправить медиа'
        );
      }
    } finally {
      setIsSendingMedia(false);
    }
  };

  const renderMessageBody = (message: Message) => {
    const hasText = Boolean(message.content?.trim());

    if (message.type === 'image' && message.mediaUrl) {
      return (
        <>
          <button
            type="button"
            className={styles.messageMediaButton}
            onClick={() => setViewerMessage(message)}
            aria-label="Открыть изображение"
            title="Открыть"
          >
            <img
              src={message.mediaUrl}
              alt={message.filename || 'Изображение'}
              className={styles.messageMediaImage}
              loading="lazy"
            />
          </button>
          {hasText && <p className={styles.messageText}>{renderWhatsAppText(message.content)}</p>}
        </>
      );
    }

    if (message.type === 'video' && message.mediaUrl) {
      return (
        <>
          <button
            type="button"
            className={styles.messageMediaButton}
            onClick={() => setViewerMessage(message)}
            aria-label="Открыть видео"
            title="Открыть"
          >
            <video className={styles.messageMediaVideo} controls preload="metadata" src={message.mediaUrl} />
          </button>
          {hasText && <p className={styles.messageText}>{renderWhatsAppText(message.content)}</p>}
        </>
      );
    }

    if (message.type === 'audio' && message.mediaUrl) {
      const isVoiceActive = activeVoiceMessageId === message.id;
      return (
        <>
          <div
            className={`${styles.messageMediaAudioWrap} ${resolveVoiceThemeClass(message)} ${
              isVoiceActive ? styles.messageMediaAudioWrapActive : ''
            }`}
            onContextMenu={(event) => openMessageContextMenu(event, message)}
          >
            <audio
              className={styles.messageMediaAudio}
              controls
              preload="metadata"
              src={message.mediaUrl}
              onContextMenu={(event) => openMessageContextMenu(event, message)}
              onPlay={() => {
                if (!playedVoiceMessageIdsRef.current.has(message.id)) {
                  playedVoiceMessageIdsRef.current.add(message.id);
                  setPlayedVoiceCount(playedVoiceMessageIdsRef.current.size);
                }
                setActiveVoiceMessageId(message.id);
              }}
              onPause={() => setActiveVoiceMessageId((current) => (current === message.id ? null : current))}
              onEnded={() => setActiveVoiceMessageId((current) => (current === message.id ? null : current))}
            />
            <div className={styles.voiceVisualizer} aria-hidden="true">
              {Array.from({ length: 8 }).map((_, idx) => (
                <span
                  key={`bar-${message.id}-${idx}`}
                  className={`${styles.voiceVisualizerBar} ${isVoiceActive ? styles.voiceVisualizerBarActive : ''}`}
                  style={{ animationDelay: `${idx * 0.08}s` }}
                />
              ))}
            </div>
          </div>
          {hasText && <p className={styles.messageText}>{renderWhatsAppText(message.content)}</p>}
        </>
      );
    }

    if (message.type === 'document' && message.mediaUrl) {
      return (
        <>
          <a
            className={styles.messageMediaDoc}
            href={message.mediaUrl}
            target="_blank"
            rel="noreferrer"
          >
            {message.filename || 'Открыть документ'}
          </a>
          {hasText && <p className={styles.messageText}>{renderWhatsAppText(message.content)}</p>}
        </>
      );
    }

    return <p className={styles.messageText}>{renderWhatsAppText(message.content)}</p>;
  };

  const renderTranslation = (message: Message) => {
    if (message.fromMe) return null;
    const sourceText = message.content?.trim() ?? '';
    if (!sourceText) return null;

    const state = translationsByMessageId[message.id];

    if (!state) {
      return (
        <button
          type="button"
          className={styles.translateRetry}
          onClick={() => void translateIncomingMessage(message)}
        >
          Перевести
        </button>
      );
    }

    if (state.status === 'loading') {
      return <div className={styles.translationHint}>Перевод…</div>;
    }

    if (state.status === 'error') {
      return (
        <div className={styles.translationErrorWrap}>
          <span className={styles.translationError}>{state.error || 'Ошибка перевода'}</span>
          <button
            type="button"
            className={styles.translateRetry}
            onClick={() => void translateIncomingMessage(message)}
          >
            Повторить
          </button>
        </div>
      );
    }

    const translatedText = state.text?.trim() ?? '';
    if (!translatedText || translatedText.toLowerCase() === sourceText.toLowerCase()) return null;

    return (
      <div className={styles.translationBox}>
        <div className={styles.translationTitle}>Перевод</div>
        <div className={styles.translationText}>{translatedText}</div>
      </div>
    );
  };

  return (
    <Layout>
      <div className={`${styles.page} ${styles[`density-${densityMode}`]}`}>
        <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
          {liveAnnouncement}
        </p>

        <div
          className={`${styles.container} ${isCallPanelCollapsed ? styles.containerCollapsed : ''} ${
            isRetroTheme && selectedChat?.priority === 'urgent' ? styles.retroGlitchEvent : ''
          } ${isSceneTransitioning ? styles.sceneTransitioning : ''} ${
            isRetroTheme && isRetroMiniMode ? styles.retroMiniMode : ''
          } ${
            isRetroTheme && selectedChat?.priority === 'urgent' && urgentIncomingMessageId ? styles.panicFlash : ''
          }`}
        >
          <aside className={styles.sidebar}>
            <div className={styles.searchSection}>
              <div className={styles.searchInputRow}>
                <button
                  type="button"
                  className={styles.menuToggleButton}
                  aria-label="Открыть меню"
                  onClick={toggleLayoutMenu}
                >
                  ☰
                </button>
                <Input
                  id="chat-search-input"
                  value={searchText}
                  onChange={(e) => handleSearchInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplySearch();
                    }
                  }}
                  placeholder="Поиск по чатам"
                  aria-label="Поиск по чатам"
                />
                <button
                  type="button"
                  className={styles.searchApplyButton}
                  onClick={handleApplySearch}
                  aria-label="Выполнить поиск"
                >
                  Поиск
                </button>
                <button
                  type="button"
                  className={styles.activityToggle}
                  onClick={() => setIsActivityVisible((v) => !v)}
                  aria-label={isActivityVisible ? 'Скрыть активность' : 'Показать активность'}
                >
                  {isActivityVisible ? '🙈' : '📊'}
                </button>
              </div>
              <div className={styles.searchRow}>
                <select
                  className={styles.searchSelect}
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  aria-label="Сортировка"
                >
                  <option value="priority">priority</option>
                  <option value="unreadCount">unreadCount</option>
                  <option value="lastMessageAt">lastMessageAt</option>
                  <option value="createdAt">createdAt</option>
                  <option value="status">status</option>
                  <option value="name">name</option>
                </select>

                <select
                  className={styles.searchSelect}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                  aria-label="Порядок сортировки"
                >
                  <option value="desc">desc</option>
                  <option value="asc">asc</option>
                </select>

                <select
                  className={styles.searchSelect}
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value as 'all' | 'message' | 'phone')}
                  aria-label="Тип поиска"
                >
                  <option value="all">Везде</option>
                  <option value="message">По сообщениям</option>
                  <option value="phone">По телефону</option>
                </select>

                <select
                  className={styles.searchSelect}
                  value={channelFilter}
                  onChange={(e) => setChannelFilter(e.target.value as '' | 'whatsapp' | 'telegram')}
                  aria-label="Канал"
                >
                  <option value="">Все каналы</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="telegram">Telegram</option>
                </select>

                <select
                  className={styles.searchSelect}
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value as '' | ChatPriority)}
                  aria-label="Приоритет"
                >
                  <option value="">Любой приоритет</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="urgent">Передать Администрации</option>
                </select>
              </div>

              {/* {isActivityVisible && (
                <div className={styles.activityCard}>
                  <div className={styles.activityCardHeader}>
                    <span className={styles.activityCardTitle}>Активность</span>
                    <button
                      type="button"
                      className={styles.activityExpand}
                      onClick={() => setIsActivityFullscreen(true)}
                    >
                      Развернуть
                    </button>
                  </div>
                  <ActivityTimeline isLoading={isActivityLoading} />
                  <ActivityLegend />
                  <ActivityMeta />
                </div>
              )} */}
            </div>
            
            <div className={styles.sidebarHeader}>
              <div className={styles.sidebarTitleRow}>
                <h2 className={styles.sidebarTitle}>Новые</h2>
                {!isLoading && !error && chats.filter(c => c.unreadCount > 0).length > 0 && (
                  <span className={styles.newBadge}>{chats.filter(c => c.unreadCount > 0).length}</span>
                )}
              </div>
            </div>
            
            <div className={styles.filterTabs}>
              <button
                className={`${styles.filterTab} ${activeFilter === 'all' ? styles.filterTabActive : ''}`}
                onClick={() => setActiveFilter('all')}
              >
                Все чаты
              </button>
              <button
                className={`${styles.filterTab} ${activeFilter === 'my' ? styles.filterTabActive : ''}`}
                onClick={() => setActiveFilter('my')}
              >
                Мои чаты
              </button>
              <button
                className={`${styles.filterTab} ${activeFilter === 'unread' ? styles.filterTabActive : ''}`}
                onClick={() => setActiveFilter('unread')}
              >
                Непрочитанные
              </button>
            </div>

            <div className={styles.quickFiltersRow}>
              <Button
                size="small"
                variant={priorityFilter === 'urgent' ? 'primary' : 'secondary'}
                onClick={() => setPriorityFilter((prev) => (prev === 'urgent' ? '' : 'urgent'))}
              >
                🔥 Срочные
              </Button>
              <select
                className={styles.densitySelect}
                value={densityMode}
                onChange={(e) => setDensityMode(e.target.value as DensityMode)}
                aria-label="Плотность списка"
                title="Плотность списка"
              >
                <option value="comfortable">Комфорт</option>
                <option value="compact">Компакт</option>
                <option value="ultra">Ультра</option>
              </select>
              <button
                type="button"
                className={styles.hotkeysHintButton}
                onClick={() => setIsHotkeysHelpOpen(true)}
                aria-label="Подсказка горячих клавиш"
                title="Горячие клавиши (Shift+?)"
              >
                ⌨
              </button>
            </div>

            <div className={styles.bulkActionsRow}>
              <button
                type="button"
                className={styles.bulkActionButton}
                onClick={selectAllFilteredChats}
                disabled={filteredChats.length === 0 || isBulkActionLoading}
              >
                Все ({filteredChats.length})
              </button>
              <button
                type="button"
                className={styles.bulkActionButton}
                onClick={clearBulkSelection}
                disabled={selectedChatIds.length === 0 || isBulkActionLoading}
              >
                Снять
              </button>
              <button
                type="button"
                className={styles.bulkActionButton}
                onClick={() => void handleBulkMarkRead()}
                disabled={selectedChatIds.length === 0 || isBulkActionLoading}
              >
                Прочесть
              </button>
              <button
                type="button"
                className={styles.bulkActionButton}
                onClick={() => void handleBulkAssignToMe()}
                disabled={selectedChatIds.length === 0 || isBulkActionLoading || !user}
              >
                Назначить
              </button>
            </div>

            <div className={`${styles.retroRadarCard} ${!isRetroTheme ? styles.overviewCard : ''}`} aria-label="Оперативная сводка">
                <div className={styles.retroRadarHeader}>
                  <span>{isRetroTheme ? 'RADAR / QUEUE' : 'ОПЕРАТИВНАЯ СВОДКА'}</span>
                  {isRetroTheme ? (
                    <button
                      type="button"
                      className={styles.retroMiniToggle}
                      onClick={() => setIsRetroMiniMode((prev) => !prev)}
                      aria-label={isRetroMiniMode ? 'Обычный размер HUD' : 'Мини размер HUD'}
                      title={isRetroMiniMode ? 'HUD: Normal' : 'HUD: Mini'}
                    >
                      {isRetroMiniMode ? 'NORMAL' : 'MINI'}
                    </button>
                  ) : null}
                </div>
                <div className={styles.retroRadarGrid}>
                  {Array.from({ length: Math.max(6, Math.min(10, retroQueueCount + 4)) }).map((_, idx) => (
                    <span
                      key={`radar-${idx}`}
                      className={`${styles.retroRadarDot} ${idx < retroQueueCount ? styles.retroRadarDotActive : ''}`}
                    />
                  ))}
                </div>
                <div className={styles.retroRadarFooter}>
                  <div className={styles.retroRadarMeta}>{isRetroTheme ? 'ALERTS' : 'Срочных'}: {retroUrgentCount}</div>
                  <div className={styles.retroRadarEvents}>
                    {retroRadarEvents.slice(0, 2).map((event) => (
                    <span
                      key={event.id}
                      className={`${styles.retroRadarEvent} ${
                        event.active ? styles.retroRadarEventActive : ''
                      } ${
                        event.tone === 'danger'
                          ? styles.retroRadarEventDanger
                          : event.tone === 'warn'
                            ? styles.retroRadarEventWarn
                            : event.tone === 'good'
                              ? styles.retroRadarEventGood
                              : styles.retroRadarEventNeutral
                      }`}
                    >
                      {isRetroTheme ? event.label : getRadarLabel(event.id)}:{' '}
                      <strong>{event.value}</strong>
                    </span>
                    ))}
                  </div>
                </div>
              </div>
            
            <div className={styles.chatList} ref={chatListRef}>
              {isLoading && chats.length === 0 ? (
                isRetroTheme ? (
                  <div className={styles.bootSequence} aria-label="Boot sequence">
                    <div className={styles.bootTitle}>CARTRIDGE BOOT</div>
                    {bootSequenceSteps.map((step, idx) => (
                      <div key={step} className={`${styles.bootLine} ${idx <= bootStepIndex ? styles.bootLineActive : ''}`}>
                        {idx <= bootStepIndex ? '>' : ' '} {step}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.skeletonList} aria-label="Загрузка чатов">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <div key={idx} className={styles.skeletonItem}>
                        <div className={styles.skeletonAvatar} />
                        <div className={styles.skeletonBody}>
                          <div className={styles.skeletonLineShort} />
                          <div className={styles.skeletonLine} />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : error ? (
                <div className={styles.error}>
                  <p className={styles.errorText}>{error}</p>
                  <Button onClick={() => void loadChats()} size="small">
                    Повторить
                  </Button>
                </div>
              ) : filteredChats.length === 0 ? (
                <div className={styles.empty}>
                  <div className={styles.emptyIcon}>
                    <Icon name="chat" size={56} color="var(--text-muted)" />
                  </div>
                  <p className={styles.emptyText}>Нет чатов</p>
                </div>
              ) : (
                <>
                  {virtualChatWindow ? (
                    <div className={styles.chatListVirtualSpacer} style={{ height: virtualChatWindow.paddingTop }} aria-hidden="true" />
                  ) : null}
                  {chatsToRender.map((chat, idx) => {
                  const absoluteIdx = virtualChatWindow ? virtualChatWindow.start + idx : idx;
                  const displayName = (chat.displayName || chat.name || '').trim() || `Чат #${chat.id}`;
                  const avatarLetter = displayName.charAt(0).toUpperCase();
                  const timeAgo = formatTimeAgo(chat.lastMessageAt);
                  const clientPhone = extractPhoneFromJid(chat.remoteJid);
                  const telegramHandle = (chat.telegramUsername || '').trim();
                  const clientHandle = telegramHandle ? `@${telegramHandle.replace(/^@+/, '')}` : clientPhone;
                  const showClientHandle = Boolean(clientHandle) && clientHandle !== displayName;
                  const orgPhoneLabel = chat.organizationPhone?.displayName || '';
                  const orgConnLabel = chat.organizationPhone?.connectionType || '';
                  const slaMeta = getSlaMeta(chat);
                  
                  return (
                    <div
                      key={chat.id}
                      data-priority={chat.priority || undefined}
                      className={`${styles.chatItem} ${
                        selectedChatId === chat.id ? styles.active : ''
                      } ${
                        chat.unreadCount > 0 ? styles.chatItemUnread : ''
                      }`}
                      style={{ '--item-index': Math.min(absoluteIdx, 18) } as CSSProperties}
                      onClick={() => handleChatClick(chat.id)}
                    >
                      <button
                        type="button"
                        className={`${styles.chatSelectButton} ${selectedChatIds.includes(chat.id) ? styles.chatSelectButtonActive : ''}`}
                        aria-label={selectedChatIds.includes(chat.id) ? 'Убрать из выбранных' : 'Выбрать чат'}
                        title={selectedChatIds.includes(chat.id) ? 'Убрать из выбранных' : 'Выбрать чат'}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleChatSelection(chat.id);
                        }}
                      >
                        {selectedChatIds.includes(chat.id) ? '✓' : ''}
                      </button>
                      <div className={styles.chatAvatar}>
                        {chat.profilePhotoUrl ? (
                          <img src={chat.profilePhotoUrl} alt={displayName} className={styles.avatarImage} />
                        ) : (
                          <div className={styles.avatarPlaceholder}>
                            {avatarLetter}
                          </div>
                        )}
                      </div>
                      
                      <div className={styles.chatDetails}>
                        <div className={styles.chatHeader}>
                          <div className={styles.chatTitleBlock}>
                            <div className={styles.chatTitleRow}>
                              <span
                                className={`${styles.priorityDot} ${styles[`priorityDot-${chat.priority || 'low'}`]}`}
                                aria-hidden="true"
                              />
                              <span
                                className={`${styles.chatName} ${chat.unreadCount > 0 ? styles.chatNameUnread : ''}`}
                              >
                                {displayName}
                              </span>
                              {showClientHandle ? (
                                <span className={styles.chatClientHandle} title={clientHandle}>
                                  {clientHandle}
                                </span>
                              ) : null}
                              {/* pin badge removed */}
                              {chat.assignedUser && (
                                <span className={styles.chatAssignedUser}>
                                  {chat.assignedUser.name || chat.assignedUser.email}
                                </span>
                              )}
                              {user && chat.assignedUser?.id === user.id ? (
                                <span className={styles.myBadge}>Мой</span>
                              ) : null}
                              <span className={`${styles.questBadge} ${!isRetroTheme ? styles.questBadgeNeutral : ''}`}>
                                {isRetroTheme ? getQuestStatus(chat) : getFlowStatus(chat)}
                              </span>
                              {chat.status === 'closed' || chat.assignedUser || chat.priority === 'high' || chat.priority === 'urgent' ? (
                                <span className={`${styles.statusEffects} ${!isRetroTheme ? styles.statusEffectsNeutral : ''}`}>
                                  {chat.status === 'closed' ? (
                                    <span className={`${styles.statusEffectChip} ${!isRetroTheme ? styles.statusEffectChipNeutral : ''}`}>
                                      {isRetroTheme ? 'SILENCED' : 'Закрыт'}
                                    </span>
                                  ) : null}
                                  {(chat.priority === 'high' || chat.priority === 'urgent') ? (
                                    <span className={`${styles.statusEffectChip} ${!isRetroTheme ? styles.statusEffectChipNeutral : ''}`}>
                                      {isRetroTheme ? 'PRIORITY' : 'Приоритет'}
                                    </span>
                                  ) : null}
                                  {chat.assignedUser ? (
                                    <span className={`${styles.statusEffectChip} ${!isRetroTheme ? styles.statusEffectChipNeutral : ''}`}>
                                      {isRetroTheme ? 'ASSIGNED' : 'Назначен'}
                                    </span>
                                  ) : null}
                                </span>
                              ) : null}
                            </div>
                            <div className={styles.chatSubtitleRow}>
                              <span className={styles.channelBadge}>{formatChannelLabel(chat.channel)}</span>
                              {clientPhone ? <span className={styles.metaDot}>•</span> : null}
                              {clientPhone ? <span className={styles.chatSubtitle}>{clientPhone}</span> : null}
                              {orgPhoneLabel ? <span className={styles.chatSubtitle}>• {orgPhoneLabel}</span> : null}
                              {orgConnLabel ? <span className={styles.chatSubtitle}> ({orgConnLabel})</span> : null}
                            </div>
                          </div>
                          <div className={styles.chatMeta}>
                            <span className={styles.chatTime}>{timeAgo}</span>
                            <span
                              className={`${styles.slaBadge} ${
                                slaMeta.level === 'critical'
                                  ? styles.slaBadgeCritical
                                  : slaMeta.level === 'warning'
                                    ? styles.slaBadgeWarning
                                    : styles.slaBadgeOk
                              }`}
                              title="SLA по времени без ответа"
                            >
                              {slaMeta.label}
                            </span>
                            {chat.priority === 'urgent' && (
                              <span className={styles.urgentBadge}>URGENT</span>
                            )}
                            {/* pin button removed */}
                            {chat.unreadCount > 0 && (
                              <span className={styles.unreadBubble}>{chat.unreadCount}</span>
                            )}
                          </div>
                        </div>
                        <p
                          className={`${styles.chatLastMessage} ${
                            chat.unreadCount > 0 ? styles.chatLastMessageUnread : ''
                          }`}
                        >
                          {formatLastMessagePreview(chat.lastMessage)}
                        </p>
                      </div>
                    </div>
                  );
                  })}
                  {virtualChatWindow ? (
                    <div className={styles.chatListVirtualSpacer} style={{ height: virtualChatWindow.paddingBottom }} aria-hidden="true" />
                  ) : null}
                  {isLoadingMoreChats && <div className={styles.chatsMoreLoading}>Загрузка...</div>}
                </>
              )}
            </div>
          </aside>

          <main className={styles.content}>
            {selectedChatId ? (
              <div className={`${styles.chatWindow} ${isSceneTransitioning ? styles.chatWindowSceneTransition : ''}`}>
                <div className={styles.chatHeaderPanel}>
                  <div className={styles.chatTopBar}>
                    <button className={styles.chatTopIcon} type="button" aria-label="Назад">
                      <Icon name="back" size={20} color="var(--primary)" />
                    </button>

                    <div className={styles.chatTopCenter}>
                      <div className={styles.chatTopAvatar}>
                        {(chats.find((c) => c.id === selectedChatId)?.displayName || 'Ч').charAt(0).toUpperCase()}
                      </div>
                      <div className={styles.chatTopTitleBlock}>
                        {(() => {
                          const currentChat = chats.find((c) => c.id === selectedChatId) || null;
                          const title = currentChat?.displayName || currentChat?.name || `Чат #${selectedChatId}`;
                          const clientPhone = extractPhoneFromJid(currentChat?.remoteJid ?? null);
                          const orgPhoneLabel = currentChat?.organizationPhone?.displayName || '';
                          const orgConnLabel = currentChat?.organizationPhone?.connectionType || '';

                          return (
                            <>
                              <div className={styles.chatTopTitle}>{title}</div>
                              <div className={styles.chatTopSubtitle}>
                                {currentChat ? formatChannelLabel(currentChat.channel) : ''}
                                {clientPhone ? ` • ${clientPhone}` : ''}
                                {orgPhoneLabel ? ` • ${orgPhoneLabel}` : ''}
                                {orgConnLabel ? ` (${orgConnLabel})` : ''}
                              </div>
                              {currentChat?.unreadCount ? (
                                <div className={styles.chatTopUnread}>Непрочитано: {currentChat.unreadCount}</div>
                              ) : null}
                              {isRetroTheme ? (
                                <div className={styles.combatBars}>
                                  {combatBars.map((bar) => (
                                    <div key={bar.label} className={styles.combatBarRow}>
                                      <span className={styles.combatBarLabel}>{bar.label}</span>
                                      <div className={styles.combatBarTrack}>
                                        <div
                                          className={`${styles.combatBarFill} ${
                                            bar.tone === 'danger'
                                              ? styles.combatBarFillDanger
                                              : bar.tone === 'good'
                                                ? styles.combatBarFillGood
                                                : styles.combatBarFillNeutral
                                          }`}
                                          style={{ width: `${bar.value}%` }}
                                        />
                                      </div>
                                      <span className={styles.combatBarValue}>{bar.value}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              {currentTicketNumber && (
                                <div className={styles.chatTopTicketMeta}>
                                  Тикет #{currentTicketNumber}
                                  {currentTicket?.status ? ` • ${currentTicket.status}` : ''}
                                  {currentTicket?.priority ? ` • ${currentTicket.priority}` : ''}
                                  {currentTicket?.createdAt ? ` • ${formatTicketDuration(currentTicket.createdAt)}` : ''}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>

                  <div className={styles.chatTopRight}>
                    {currentTicketNumber && (
                      <div className={styles.ticketInlineGroup}>
                        <button
                          type="button"
                          className={styles.chatTopTicketBadge}
                          onClick={handleOpenTicketPage}
                          title="Открыть тикет"
                        >
                          #{currentTicketNumber}
                        </button>
                        {currentTicket?.status ? (
                          <span className={statusChipClass(currentTicket.status)} title={`Статус: ${currentTicket.status}`}>
                            {currentTicket.status}
                          </span>
                        ) : null}
                        {currentTicket?.priority ? (
                          <span
                            className={priorityChipClass(currentTicket.priority)}
                            title={`Приоритет: ${currentTicket.priority}`}
                          >
                            {currentTicket.priority}
                          </span>
                        ) : null}
                      </div>
                    )}

                    {currentTicketNumber && (
                      <>
                        {isLoadingTicket ? (
                          isRetroTheme ? (
                            <span className={styles.chatTopTicketSkeleton} aria-label="Loading ticket data">
                              <span className={styles.chatTopTicketSkeletonLine} />
                              <span className={styles.chatTopTicketSkeletonLineShort} />
                            </span>
                          ) : (
                            <span className={styles.chatTopTicketState}>
                              <span className={styles.spinner} aria-label="Загрузка" />
                            </span>
                          )
                        ) : ticketError ? (
                          <span className={styles.chatTopTicketError}>{ticketError}</span>
                        ) : currentTicket ? (
                          <>
                            <select
                              className={styles.ticketSelect}
                              value={String(currentTicket.status || '')}
                              onChange={(e) => void handleSetTicketStatus(e.target.value)}
                              disabled={isTicketActionLoading}
                              aria-label="Статус тикета"
                            >
                              {TICKET_STATUS_OPTIONS.map((item) => (
                                <option key={item} value={item}>
                                  {item}
                                </option>
                              ))}
                            </select>

                            <select
                              className={styles.ticketSelect}
                              value={String(currentTicket.priority || '')}
                              onChange={(e) => void handleSetTicketPriority(e.target.value)}
                              disabled={isTicketActionLoading}
                              aria-label="Приоритет тикета"
                            >
                              {TICKET_PRIORITY_OPTIONS.map((item) => (
                                <option key={item} value={item}>
                                  {item}
                                </option>
                              ))}
                            </select>

                            <Button
                              size="small"
                              variant="secondary"
                              onClick={() => void handleAssignTicketToMe()}
                              disabled={!user || isTicketActionLoading}
                            >
                              {renderIconLabel('user', 'Мне')}
                            </Button>

                            <Button
                              size="small"
                              variant="secondary"
                              onClick={() => void handleCloseTicket()}
                              disabled={isTicketActionLoading || currentTicket.status === 'closed'}
                            >
                              {renderIconLabel('close', 'Закрыть')}
                            </Button>

                            {ticketActionError ? (
                              <span className={styles.chatTopTicketError}>{ticketActionError}</span>
                            ) : null}
                            {ticketActionToast ? (
                              <span className={styles.chatTopTicketToast} role="status">{ticketActionToast}</span>
                            ) : null}
                          </>
                        ) : (
                          <span className={styles.chatTopTicketState}>Тикет не найден</span>
                        )}
                      </>
                    )}

                    <button
                      className={styles.chatTopAction}
                      type="button"
                      onClick={handleOpenCallPanel}
                      disabled={!selectedChatPhone}
                      title={selectedChatPhone ? `Позвонить: ${selectedChatPhone}` : 'Нет номера для звонка'}
                    >
                      {renderIconLabel('call', 'Звонок')}
                    </button>
                    <button
                      className={`${styles.chatTopAction} ${styles.chatTopGhost}`}
                      type="button"
                      onClick={handleMarkChatRead}
                      title="Отметить чат прочитанным"
                    >
                      {renderIconLabel('check', 'Прочесть')}
                    </button>

                    <button
                      className={styles.chatTopAction}
                      type="button"
                      onClick={handleToggleAssignment}
                      disabled={!user || isAssigningChat}
                      title={chats.find((c) => c.id === selectedChatId)?.assignedUser ? 'Снять' : 'Взять'}
                    >
                      {renderIconLabel(
                        chats.find((c) => c.id === selectedChatId)?.assignedUser ? 'release' : 'take',
                        chats.find((c) => c.id === selectedChatId)?.assignedUser ? 'Снять' : 'Взять'
                      )}
                    </button>
                  </div>
                  </div>

                  <div className={`${styles.retroHudBar} ${!isRetroTheme ? styles.overviewHudBar : ''}`}>
                    <span>{isRetroTheme ? 'FOCUS' : 'Фокус'}: {selectedChat ? 100 - Math.min(95, selectedChat.unreadCount * 8) : 0}%</span>
                    <span>{isRetroTheme ? 'QUEUE' : 'В очереди'}: {retroQueueCount}</span>
                    <span>{isRetroTheme ? 'MODE' : 'Состояние'}: {isRetroTheme ? retroSelectedQuest : (selectedChat ? getFlowStatus(selectedChat) : 'Нет')}</span>
                  </div>
                </div>
                
                <div className={styles.messagesContainer} ref={messagesContainerRef}>
                  {showScrollToBottom && !isLoadingMessages && !messagesError && messages.length > 0 && (
                    <button
                      type="button"
                      className={styles.scrollToBottom}
                      onClick={scrollMessagesToBottom}
                      aria-label="Прокрутить вниз"
                      title="Вниз"
                    >
                      ↓
                    </button>
                  )}
                  {isLoadingMessages ? (
                    isRetroTheme ? (
                      <div className={styles.retroMessageSkeletonList} aria-label="Loading messages">
                        {Array.from({ length: 6 }).map((_, idx) => (
                          <div
                            key={`rmsg-sk-${idx}`}
                            className={`${styles.retroMessageSkeleton} ${idx % 2 === 0 ? styles.retroMessageSkeletonOwn : ''}`}
                          >
                            <span className={styles.retroMessageSkeletonLine} />
                            <span className={styles.retroMessageSkeletonLineShort} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.empty}>
                        <div className={styles.loading}>Загрузка сообщений...</div>
                      </div>
                    )
                  ) : messagesError ? (
                    <div className={styles.empty}>
                      <div className={styles.error}>
                        <p className={styles.errorText}>{messagesError}</p>
                        <Button onClick={() => loadMessages(selectedChatId)} size="small">
                          Повторить
                        </Button>
                      </div>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className={styles.empty}>
                      <div className={styles.emptyIcon}>
                        <Icon name="chat" size={56} color="var(--text-muted)" />
                      </div>
                      <p className={styles.emptyText}>Нет сообщений</p>
                    </div>
                  ) : (
                    <div className={styles.messagesList}>
                      {isLoadingMoreMessages && (
                        <div className={styles.moreLoading}>Загрузка...</div>
                      )}
                      {messages.map((message, idx) => {
                        const time = new Date(message.timestamp).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                        const previousMessage = idx > 0 ? messages[idx - 1] : null;
                        const showDayDivider = !previousMessage || getDayKey(previousMessage.timestamp) !== getDayKey(message.timestamp);
                        const showUnreadDivider = unreadStartMessageIndex === idx;

                        const ticketNumber =
                          message.ticketNumber ??
                          message.ticket?.ticketNumber ??
                          selectedChat?.ticketNumber ??
                          null;
                        const ticketStatus = message.ticketStatus ?? message.ticket?.status ?? null;
                        const ticketPriority = message.ticketPriority ?? message.ticket?.priority ?? null;

                        const senderLabel = message.senderUser
                          ? (message.senderUser.name || message.senderUser.email).trim()
                          : '';
                        
                        return (
                          <Fragment key={message.id}>
                            {showDayDivider ? (
                              <div className={styles.messagesDayDivider}>
                                <span>{formatDayLabel(message.timestamp)}</span>
                              </div>
                            ) : null}
                            {showUnreadDivider ? (
                              <div className={styles.messagesUnreadDivider}>
                                <span>Непрочитанные</span>
                              </div>
                            ) : null}
                            <div
                              className={`${styles.message} ${
                                message.fromMe ? styles.messageOwn : styles.messageOther
                              } ${resolveMessageRarityClass(message)} ${isRetroTheme ? styles.messageAppear : styles.messageAppearSmooth} ${
                                urgentIncomingMessageId === message.id ? styles.messageUrgentPulse : ''
                              }`}
                              style={
                                isRetroTheme
                                  ? { animationDelay: `${Math.min(idx, 12) * 18}ms` }
                                  : ({ '--message-index': Math.min(idx, 20) } as CSSProperties)
                              }
                              onContextMenu={(event) => openMessageContextMenu(event, message)}
                            >
                              <div className={styles.messageContent}>
                                {isRetroTheme && !message.fromMe ? (
                                  <div className={styles.messageNpcNameplate}>
                                    {senderLabel || selectedChat?.displayName || 'NPC UNIT'}
                                  </div>
                                ) : null}
                                {senderLabel && (
                                  <div className={styles.messageSender}>{senderLabel}</div>
                                )}
                                {ticketNumber ? (
                                  <div className={styles.messageTicket}>
                                    <span className={styles.messageTicketBadge}>Тикет #{ticketNumber}</span>
                                    {(ticketStatus || ticketPriority) && (
                                      <span className={styles.messageTicketMeta}>
                                        {[ticketStatus, ticketPriority].filter(Boolean).join(' · ')}
                                      </span>
                                    )}
                                  </div>
                                ) : null}
                                {renderMessageBody(message)}
                                {renderTranslation(message)}
                                {message.responsibleUser ? (
                                  <div className={styles.messageResponsible}>
                                    Ответственный: {message.responsibleUser.name || message.responsibleUser.email}
                                  </div>
                                ) : null}
                                <span className={styles.messageTime}>
                                  {isRetroTheme ? renderRetroTimeRadar(message.timestamp) : time}
                                </span>
                              </div>
                            </div>
                          </Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedChatId && isSuggestionsEnabled && canUseAiSuggestions && (isLoadingSuggestions || suggestionsError || suggestions.length > 0) && (
                  <div className={styles.suggestionsPanel}>
                    <div className={styles.suggestionsHeader}>
                      <div className={styles.suggestionsTitle}>
                        AI быстрые ответы {suggestionsFromCache ? '(кэш)' : ''}
                      </div>
                      <button
                        type="button"
                        className={styles.suggestionsClose}
                        onClick={() => setIsSuggestionsEnabled(false)}
                        aria-label="Скрыть подсказки"
                        title="Скрыть"
                      >
                        ×
                      </button>
                    </div>

                    {isLoadingSuggestions ? (
                      <div className={styles.suggestionsState}>Загрузка…</div>
                    ) : suggestionsError ? (
                      <div className={styles.suggestionsState}>{suggestionsError}</div>
                    ) : suggestions.length === 0 ? (
                      <div className={styles.suggestionsState}>Нет подсказок</div>
                    ) : (
                      <div className={styles.suggestionsList}>
                        {suggestions.map((s, idx) => (
                          <button
                            key={`${idx}-${s}`}
                            type="button"
                            className={styles.suggestionItem}
                            onClick={() => handlePickSuggestion(s)}
                            title="Вставить в сообщение"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                <div className={styles.messageInputContainer}>
                  {isRetroTheme && (
                    <div className={styles.retroSpeakerBox}>
                      PLAYER &gt; {(user?.displayName || user?.username || 'OPERATOR').toUpperCase()}
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className={styles.fileInput}
                    onChange={handleFileSelected}
                    aria-label="Выбрать файл"
                  />
                  <button
                    type="button"
                    className={styles.attachButton}
                    onClick={handlePickFile}
                    disabled={!selectedChatId || isSendingMedia}
                    aria-label="Прикрепить файл"
                    title="Прикрепить файл"
                  >
                    {isSendingMedia ? '…' : '+'}
                  </button>

                  <button
                    type="button"
                    className={`${styles.formatToggle} ${isFormatBarOpen ? styles.formatToggleActive : ''}`}
                    onClick={() => setIsFormatBarOpen((v) => !v)}
                    aria-label={isFormatBarOpen ? 'Скрыть форматирование' : 'Показать форматирование'}
                    aria-pressed={isFormatBarOpen}
                    title={isFormatBarOpen ? 'Скрыть форматирование' : 'Показать форматирование'}
                  >
                    Aa
                  </button>

                  <div className={`${styles.formatBar} ${!isFormatBarOpen ? styles.formatBarClosed : ''}`}>
                    <button
                      type="button"
                      className={styles.formatButton}
                      onClick={() => applyWhatsAppWrap('*', '*')}
                      aria-label="Жирный"
                      title="Жирный (*текст*)"
                    >
                      B
                    </button>
                    <button
                      type="button"
                      className={styles.formatButton}
                      onClick={() => applyWhatsAppWrap('_', '_')}
                      aria-label="Курсив"
                      title="Курсив (_текст_)"
                    >
                      I
                    </button>
                    <button
                      type="button"
                      className={styles.formatButton}
                      onClick={() => applyWhatsAppWrap('~', '~')}
                      aria-label="Зачёркнутый"
                      title="Зачёркнутый (~текст~)"
                    >
                      S
                    </button>
                    <button
                      type="button"
                      className={styles.formatButton}
                      onClick={() => applyWhatsAppWrap('```', '```')}
                      aria-label="Моноширинный"
                      title="Моноширинный (```текст```)"
                    >
                      {'</>'}
                    </button>
                  </div>

                  <textarea
                    className={styles.messageInput}
                    placeholder="Сообщение (Enter/Ctrl+Enter — отправить, Shift+Enter — новая строка)"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      const isCtrlSend = e.ctrlKey || e.metaKey;
                      const isShiftNewline = e.shiftKey && !isCtrlSend;
                      if (isShiftNewline) return;
                      if ((e.nativeEvent as unknown as { isComposing?: boolean }).isComposing) return;
                      if (isSendingMessage) return;
                      e.preventDefault();
                      void handleSendMessage();
                    }}
                    onPaste={handlePaste}
                    ref={messageInputRef}
                    rows={1}
                  />
                  {sendError && <div className={styles.toastError}>{sendError}</div>}
                  <button
                    type="button"
                    className={styles.suggestionsButton}
                    onClick={() => {
                      if (!isSuggestionsEnabled) {
                        setIsSuggestionsEnabled(true);
                        return;
                      }
                      void loadSuggestions({ force: true });
                    }}
                    disabled={!selectedChatId || isLoadingSuggestions || (isSuggestionsEnabled && !canUseAiSuggestions)}
                    aria-label={isSuggestionsEnabled ? 'Обновить AI ответы' : 'Включить AI подсказки'}
                    title={
                      !selectedChatId
                        ? 'Выберите чат'
                        : !isSuggestionsEnabled
                          ? 'Включить AI подсказки'
                        : !canUseAiSuggestions
                          ? 'AI доступен только в свежих чатах, когда последнее сообщение от клиента'
                          : 'Обновить AI ответы'
                    }
                  >
                    {isSuggestionsEnabled ? 'AI' : 'AI OFF'}
                  </button>
                  <button
                    type="button"
                    className={styles.voiceButton}
                    aria-label="Голос"
                    title="Голос"
                  >
                    <Icon name="mic" size={18} />
                  </button>
                  <button
                    type="button"
                    className={styles.sendButton}
                    onClick={() => void handleSendMessage()}
                    disabled={!selectedChatId || !messageInput.trim() || isSendingMessage}
                    aria-label="Отправить"
                    title="Отправить"
                  >
                    {isSendingMessage ? <span className={styles.sendSpinner} /> : <Icon name="send" size={18} />}
                  </button>
                </div>

                {messageContextMenu && (
                  <div
                    className={styles.messageContextMenu}
                    style={{ left: messageContextMenu.x, top: messageContextMenu.y }}
                    role="menu"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      className={styles.messageContextMenuItem}
                      onClick={() => void handleCopyMessageText(messageContextMenu.message.content || '')}
                      disabled={!messageContextMenu.message.content?.trim()}
                    >
                      Copy text
                    </button>
                    <button
                      type="button"
                      className={styles.messageContextMenuItem}
                      onClick={() => void translateIncomingMessage(messageContextMenu.message)}
                      disabled={messageContextMenu.message.fromMe || !messageContextMenu.message.content?.trim()}
                    >
                      Translate
                    </button>
                    <button
                      type="button"
                      className={styles.messageContextMenuItem}
                      onClick={() => handleOpenMessageMedia(messageContextMenu.message)}
                      disabled={!messageContextMenu.message.mediaUrl}
                    >
                      Open media
                    </button>
                    <button
                      type="button"
                      className={styles.messageContextMenuItem}
                      onClick={() => setMessageContextMenu(null)}
                    >
                      Close
                    </button>
                  </div>
                )}

                {mediaError && <div className={styles.mediaError}>{mediaError}</div>}

                <Modal
                  isOpen={Boolean(pendingAttachment)}
                  title="Предпросмотр"
                  onClose={() => {
                    if (!isSendingMedia) closeAttachmentPreview();
                  }}
                >
                  {pendingAttachment && (
                    <div className={styles.previewWrap}>
                      <div className={styles.previewBody}>
                        {pendingAttachment.type === 'image' ? (
                          <img className={styles.previewImage} src={pendingAttachment.previewUrl} alt="preview" />
                        ) : pendingAttachment.type === 'video' ? (
                          <video className={styles.previewVideo} src={pendingAttachment.previewUrl} controls />
                        ) : pendingAttachment.type === 'audio' ? (
                          <audio className={styles.previewAudio} src={pendingAttachment.previewUrl} controls />
                        ) : (
                          <div className={styles.previewDoc}>
                            <div className={styles.previewDocName}>{pendingAttachment.file.name}</div>
                            <div className={styles.previewDocMeta}>
                              {(pendingAttachment.file.size / (1024 * 1024)).toFixed(2)} MB
                            </div>
                          </div>
                        )}
                      </div>

                      <input
                        type="text"
                        className={styles.previewCaption}
                        placeholder="Подпись (необязательно)"
                        value={previewCaption}
                        onChange={(e) => setPreviewCaption(e.target.value)}
                        disabled={isSendingMedia}
                      />

                      <div className={styles.previewActions}>
                        <Button onClick={closeAttachmentPreview} size="small" disabled={isSendingMedia}>
                          Отмена
                        </Button>
                        <Button onClick={handleSendPendingAttachment} size="small" disabled={isSendingMedia}>
                          {isSendingMedia ? 'Отправка…' : 'Отправить'}
                        </Button>
                      </div>
                    </div>
                  )}
                </Modal>

                <Modal
                  isOpen={Boolean(viewerMessage)}
                  title=""
                  onClose={() => setViewerMessage(null)}
                >
                  {viewerMessage?.type === 'image' && viewerMessage.mediaUrl && (
                    <img className={styles.viewerImage} src={viewerMessage.mediaUrl} alt="image" />
                  )}
                  {viewerMessage?.type === 'video' && viewerMessage.mediaUrl && (
                    <video className={styles.viewerVideo} src={viewerMessage.mediaUrl} controls />
                  )}
                </Modal>
              </div>
            ) : (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>
                  <Icon name="chat" size={56} color="var(--text-muted)" />
                </div>
                <p className={styles.emptyText}>Выберите чат</p>
              </div>
            )}
          </main>

          {isRetroTheme && selectedChatId && (
            <aside className={styles.retroQuestSidebar} aria-label="Quest log">
              <div className={styles.retroQuestTitle}>QUEST LOG</div>
              <div className={styles.retroQuestActive}>ACTIVE: {retroSelectedQuest}</div>
              <div className={styles.retroQuestProgressTrack}>
                <div className={styles.retroQuestProgressFill} style={{ width: `${retroQuestProgress}%` }} />
              </div>
              <div className={styles.retroQuestProgressLabel}>{retroQuestProgress}%</div>
              <div className={styles.retroQuestHistory}>
                {retroQuestHistory.map((entry, idx) => (
                  <div key={`qh-${idx}-${entry}`} className={styles.retroQuestHistoryLine}>
                    {entry}
                  </div>
                ))}
              </div>
              <div className={styles.retroAchievements}>
                <div className={styles.retroAchievementsTitle}>ACHIEVEMENTS</div>
                {retroAchievementList.map((achievement) => (
                  <div
                    key={achievement.id}
                    className={`${styles.retroAchievementItem} ${achievements[achievement.id] ? styles.retroAchievementUnlocked : ''}`}
                  >
                    <span>{achievements[achievement.id] ? '★' : '☆'} {achievement.label}</span>
                    <span className={styles.retroAchievementMeta}>{achievement.description}</span>
                    <span className={styles.retroAchievementTier}>{achievement.tier}</span>
                  </div>
                ))}
              </div>
            </aside>
          )}

          <aside
            className={`${styles.callPanel} ${isCallPanelCollapsed ? styles.callPanelCollapsed : ''}`}
            aria-label="Звонки"
          >
            <div className={styles.callPanelHeader}>
              <div className={styles.callPanelTitle}>Звонки</div>

              {callWidgetStatus && callWidgetStatus.callState !== 'idle' && (
                <div
                  className={styles.callPanelStatus}
                  aria-label={`Статус звонка: ${callWidgetStatus.callState}`}
                  title={`${callWidgetStatus.callText || callWidgetStatus.callState}${
                    callWidgetStatus.callPeer ? ` • ${callWidgetStatus.callPeer}` : ''
                  }`}
                >
                  <span
                    className={`${styles.callPanelStatusDot} ${
                      callWidgetStatus.callState === 'incoming'
                        ? styles.callPanelStatusDotIncoming
                        : callWidgetStatus.callState === 'in-call'
                          ? styles.callPanelStatusDotInCall
                          : styles.callPanelStatusDotOther
                    }`}
                  />
                  <span className={styles.callPanelStatusText}>
                    {(callWidgetStatus.callState === 'incoming'
                      ? 'Входящий'
                      : callWidgetStatus.callState === 'in-call'
                        ? 'Разговор'
                        : callWidgetStatus.callState === 'outgoing'
                          ? 'Исходящий'
                          : 'Завершено') + (callWidgetStatus.callPeer ? ` ${callWidgetStatus.callPeer}` : '')}
                  </span>
                </div>
              )}
              <button
                type="button"
                className={styles.callPanelToggle}
                onClick={() => setIsCallPanelCollapsed((v) => !v)}
                aria-label={isCallPanelCollapsed ? 'Развернуть панель звонков' : 'Свернуть панель звонков'}
                title={isCallPanelCollapsed ? 'Развернуть' : 'Свернуть'}
              >
                {isCallPanelCollapsed ? '<' : '>'}
              </button>
            </div>

            <div className={styles.callPanelContent}>
              {!isRetroTheme && selectedChatId ? (
                <section className={styles.overviewQuestCard} aria-label="Сводка чата">
                  <div className={styles.overviewQuestTitle}>Сводка чата</div>
                  <div className={styles.overviewQuestState}>
                    Статус: {selectedChat ? getFlowStatus(selectedChat) : 'Нет данных'}
                  </div>
                  <div className={styles.overviewQuestProgressTrack}>
                    <div className={styles.overviewQuestProgressFill} style={{ width: `${retroQuestProgress}%` }} />
                  </div>
                  <div className={styles.overviewQuestProgressLabel}>Прогресс: {retroQuestProgress}%</div>
                  <div className={styles.overviewQuestHistory}>
                    {operationalHistory.slice(0, 3).map((entry, idx) => (
                      <div key={`oh-${idx}-${entry}`} className={styles.overviewQuestHistoryLine}>
                        {entry}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <CallWidget
                defaultCallee={callWidgetCallee}
                defaultCalleeVersion={callWidgetCalleeVersion}
                onStatusChange={handleCallWidgetStatus}
              />

              <div className={styles.commentsSection} aria-label="Комментарии клиента">
                <div className={styles.commentsHeader}>
                  <div className={styles.commentsTitle}>Комментарии</div>
                  {isLoadingComments ? <span className={styles.commentStatus}>Загрузка…</span> : null}
                  {commentsError ? <span className={styles.commentError}>{commentsError}</span> : null}
                </div>

                <div className={styles.commentsList}>
                  {!isLoadingComments && !commentsError && clientComments.length === 0 ? (
                    <div className={styles.commentEmpty}>Нет комментариев</div>
                  ) : null}

                  {clientComments.map((comment) => (
                    <div key={comment.id} className={styles.commentItem}>
                        <div className={styles.commentMeta}>
                        <div className={styles.commentAuthor}>{comment.user?.name || 'Без имени'}</div>
                        {comment.user?.email ? (
                          <div className={styles.commentEmail}>{comment.user.email}</div>
                        ) : null}
                        <div className={styles.commentTime}>{formatDateTime(comment.createdAt)}</div>
                      </div>
                      <div className={styles.commentText}>{comment.content}</div>
                    </div>
                  ))}

                  {commentsPagination.hasMore ? (
                    <button
                      type="button"
                      className={styles.commentsLoadMore}
                      onClick={() => void loadClientComments(selectedChatId, { append: true })}
                      disabled={isLoadingMoreComments}
                    >
                      {isLoadingMoreComments ? 'Загрузка…' : 'Показать ещё'}
                    </button>
                  ) : null}
                </div>

                <div className={styles.commentForm}>
                  <textarea
                    className={styles.commentTextarea}
                    placeholder="Новый комментарий"
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    rows={2}
                    disabled={isAddingComment}
                  />
                  <Button
                    size="small"
                    variant="primary"
                    onClick={() => void handleAddComment()}
                    disabled={!commentInput.trim() || isAddingComment || !selectedChatId}
                  >
                    {isAddingComment ? 'Сохранение…' : 'Добавить'}
                  </Button>
                </div>
              </div>

              <section className={styles.activityTimelineSection} aria-label="История действий" aria-live="polite">
                <div className={styles.activityTimelineHeader}>
                  <div className={styles.activityTimelineTitle}>История действий</div>
                  {currentTicketNumber ? (
                    <span className={styles.activityTimelineMeta}>Тикет #{currentTicketNumber}</span>
                  ) : null}
                </div>

                {localActionTimeline.length === 0 && !currentTicketNumber ? (
                  <div className={styles.activityTimelineEmpty}>Выберите чат с тикетом, чтобы увидеть историю.</div>
                ) : null}

                {localActionTimeline.length > 0 ? (
                  <ol className={styles.activityTimelineList}>
                    {localActionTimeline.slice(0, 5).map((item) => (
                      <li key={item.id} className={styles.activityTimelineItem}>
                        <span
                          className={`${styles.activityTimelineDot} ${
                            item.tone === 'success'
                              ? styles.activityTimelineDotSuccess
                              : item.tone === 'danger'
                                ? styles.activityTimelineDotDanger
                                : styles.activityTimelineDotNeutral
                          }`}
                          aria-hidden="true"
                        />
                        <div className={styles.activityTimelineContent}>
                          <div className={styles.activityTimelineText}>{item.text}</div>
                          <div className={styles.activityTimelineTime}>{formatDateTime(item.createdAt)}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : null}

                {currentTicketNumber ? (
                  <>
                    {isTicketHistoryLoading ? <div className={styles.activityTimelineState}>Загрузка истории тикета…</div> : null}
                    {!isTicketHistoryLoading && ticketHistoryError ? (
                      <div className={styles.activityTimelineError}>{ticketHistoryError}</div>
                    ) : null}
                    {!isTicketHistoryLoading && !ticketHistoryError && ticketHistory.length === 0 ? (
                      <div className={styles.activityTimelineState}>История тикета пока пустая.</div>
                    ) : null}
                    {!isTicketHistoryLoading && !ticketHistoryError && ticketHistory.length > 0 ? (
                      <ol className={styles.activityTimelineList}>
                        {ticketHistory.slice(0, 6).map((item) => (
                          <li key={item.id} className={styles.activityTimelineItem}>
                            <span className={`${styles.activityTimelineDot} ${styles.activityTimelineDotNeutral}`} aria-hidden="true" />
                            <div className={styles.activityTimelineContent}>
                              <div className={styles.activityTimelineText}>{item.action}</div>
                              <div className={styles.activityTimelineMetaLine}>
                                {formatDateTime(item.createdAt || '')} · {item.actor}
                              </div>
                              {item.from || item.to ? (
                                <div className={styles.activityTimelineMetaLine}>
                                  {item.from || '—'} → {item.to || '—'}
                                </div>
                              ) : null}
                              {item.note ? <div className={styles.activityTimelineMetaLine}>{item.note}</div> : null}
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </>
                ) : null}
              </section>
            </div>
          </aside>

          {isRetroTheme && damagePopups.length > 0 && (
            <div className={styles.damagePopupLayer} aria-hidden="true">
              {damagePopups.map((popup) => (
                <div
                  key={popup.id}
                  className={`${styles.damagePopup} ${popup.kind === 'critical' ? styles.damagePopupCritical : styles.damagePopupAlert}`}
                >
                  {popup.text}
                </div>
              ))}
            </div>
          )}

          {isRetroTheme && pixelBursts.length > 0 && (
            <div className={styles.pixelBurstLayer} aria-hidden="true">
              {pixelBursts.map((particle) => (
                <span
                  key={particle.id}
                  className={`${styles.pixelBurst} ${
                    particle.tone === 'danger'
                      ? styles.pixelBurstDanger
                      : particle.tone === 'success'
                        ? styles.pixelBurstSuccess
                        : styles.pixelBurstNeutral
                  }`}
                  style={{ left: `${particle.x}%`, top: `${particle.y}%`, width: particle.size, height: particle.size }}
                />
              ))}
            </div>
          )}

          {isRetroTheme && achievementToast && (
            <div className={styles.achievementToast} role="status" aria-live="polite">
              <div className={styles.achievementToastTitle}>ACHIEVEMENT UNLOCKED</div>
              <div className={styles.achievementToastName}>{achievementToast.title}</div>
              <div className={styles.achievementToastTier}>{achievementToast.tier}</div>
            </div>
          )}

          {isRetroTheme && isPauseMenuOpen && (
            <div className={styles.pauseMenuOverlay} role="dialog" aria-label="Pause menu">
              <div className={styles.pauseMenuCard}>
                <div className={styles.pauseMenuTitle}>PAUSE MENU</div>
                <button type="button" className={styles.pauseMenuButton} onClick={() => setIsPauseMenuOpen(false)}>
                  RESUME
                </button>
                <button
                  type="button"
                  className={styles.pauseMenuButton}
                  onClick={() => {
                    setIsPauseMenuOpen(false);
                    navigate('/settings');
                  }}
                >
                  SETTINGS
                </button>
                <button
                  type="button"
                  className={styles.pauseMenuButton}
                  onClick={() => {
                    setIsPauseMenuOpen(false);
                    setSelectedChatId(null);
                  }}
                >
                  EXIT CHAT
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {isActivityFullscreen && <ActivityFullscreen />}
      <Modal isOpen={isHotkeysHelpOpen} title="Горячие клавиши" onClose={() => setIsHotkeysHelpOpen(false)}>
        <div className={styles.hotkeysList}>
          <div><strong>Ctrl/⌘ + K</strong> - фокус на поиск</div>
          <div><strong>/</strong> - быстрый фокус на поиск</div>
          <div><strong>J / K</strong> - следующий / предыдущий чат</div>
          <div><strong>[ / ]</strong> - предыдущий / следующий чат</div>
          <div><strong>Alt + 1/2/3</strong> - Все / Мои / Непрочитанные</div>
          <div><strong>Enter</strong> - фокус в поле ввода</div>
          <div><strong>Alt + R</strong> - отметить выбранный чат прочитанным</div>
          <div><strong>Ctrl/⌘ + Shift + A</strong> - выбрать все чаты в фильтре</div>
          <div><strong>Ctrl/⌘ + Shift + D</strong> - снять массовое выделение</div>
          <div><strong>Ctrl/⌘ + Shift + R</strong> - массово отметить прочитанными</div>
          <div><strong>Ctrl/⌘ + Shift + M</strong> - массово назначить на меня</div>
          <div><strong>Shift + ?</strong> - открыть подсказку клавиш</div>
        </div>
      </Modal>
    </Layout>
  );
}
