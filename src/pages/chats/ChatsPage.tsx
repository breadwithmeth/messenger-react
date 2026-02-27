import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, type ReactNode } from 'react';
import { Layout } from '../../shared/ui/Layout/Layout';
import { Button } from '../../shared/ui/Button/Button';
import { Input } from '../../shared/ui/Input/Input';
import { Icon } from '../../shared/ui/Icon/Icon';
import { Modal } from '../../shared/ui/Modal/Modal';
import { chatsApi } from '../../features/chats/api/chatsApi';
import { aiApi } from '../../features/ai/api/aiApi';
import { Chat, ChatPriority, Message } from '../../features/chats/model/types';
import { NetworkError } from '../../shared/api/types';
import { isFirefoxLikeBrowser } from '../../shared/utils/firefoxMode';
import { useAuth } from '../../features/auth/model/authContext';
import { CallWidget, type CallWidgetStatus } from '../../features/webrtc/ui/CallWidget/CallWidget';
import styles from './ChatsPage.module.css';

type ChatFilter = 'all' | 'my' | 'ignored' | 'open' | 'unread';

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

const formatTimeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  if (hours < 24) return `${hours} час назад`;
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit' });
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

const FIREFOX_SEND_WARNING = 'Воспользуйтесь браузером google chrome';

export function ChatsPage() {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
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
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
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
  const [isUpdatingPriority, setIsUpdatingPriority] = useState(false);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [sendError, setSendError] = useState('');
  const [autoTranslateIncoming, setAutoTranslateIncoming] = useState(true);
  const [translationsByMessageId, setTranslationsByMessageId] = useState<Record<number, TranslationState>>({});
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false,
  });
  const [allChatsTotal, setAllChatsTotal] = useState(0);
  const [isCallPanelCollapsed, setIsCallPanelCollapsed] = useState(false);
  const [callWidgetStatus, setCallWidgetStatus] = useState<CallWidgetStatus | null>(null);
  const [callWidgetCallee, setCallWidgetCallee] = useState('');
  const [callWidgetCalleeVersion, setCallWidgetCalleeVersion] = useState(0);

  const handleCallWidgetStatus = useCallback((s: CallWidgetStatus) => {
    setCallWidgetStatus(s);
  }, []);

  const selectedChat = useMemo(() => {
    if (!selectedChatId) return null;
    return chats.find((c) => c.id === selectedChatId) ?? null;
  }, [chats, selectedChatId]);

  const selectedChatPhone = useMemo(() => {
    return extractPhoneFromJid(selectedChat?.remoteJid ?? null);
  }, [selectedChat?.remoteJid]);

  const handleOpenCallPanel = useCallback(() => {
    setIsCallPanelCollapsed(false);
    if (!selectedChatPhone) return;
    setCallWidgetCallee(selectedChatPhone);
    setCallWidgetCalleeVersion((v) => v + 1);
  }, [selectedChatPhone]);

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

  const [messagesPagination, setMessagesPagination] = useState({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false,
  });

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchText.trim());
    }, 350);
    return () => clearTimeout(t);
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
      search: debouncedSearch || undefined,
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
  }, [activeFilter, debouncedSearch, searchType, channelFilter, priorityFilter, sortBy, sortOrder]);

  useLayoutEffect(() => {
    if (!shouldRestoreChatListScrollRef.current) return;
    const el = chatListRef.current;
    if (!el) return;
    el.scrollTop = chatListScrollTopRef.current;
    shouldRestoreChatListScrollRef.current = false;
  }, [chats]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  useEffect(() => {
    translationsRef.current = translationsByMessageId;
  }, [translationsByMessageId]);

  useEffect(() => {
    if (selectedChatId) {
      void loadMessages(selectedChatId);
    } else {
      setMessages([]);
    }
  }, [selectedChatId]);

  useEffect(() => {
    setTranslationsByMessageId({});
  }, [selectedChatId]);

  useEffect(() => {
    if (!selectedChatId) return;

    // Периодическое обновление сообщений активного чата
    const interval = setInterval(() => {
      void loadMessages(selectedChatId, { silent: true });
    }, 2000);

    return () => clearInterval(interval);
  }, [selectedChatId]);

  useEffect(() => {
    setIsSuggestionsOpen(false);
    setIsLoadingSuggestions(false);
    setSuggestionsError('');
    setSuggestions([]);
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
      const bottomGap = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (bottomGap > 120) return;

      if (isLoading || isLoadingMoreChats) return;
      if (!chatsPaginationRef.current.hasMore) return;
      void loadMoreChats();
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [isLoading, isLoadingMoreChats, activeFilter]);

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
        setAllChatsTotal(response.pagination?.total || nextChats.length);
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
        hasMore: response.pagination.hasMore,
      });
    } catch (err) {
      if (silent) return;
      if (err instanceof NetworkError) {
        setMessagesError(err.message);
      } else {
        setMessagesError('Не удалось загрузить сообщения');
      }
    } finally {
      if (silent) {
        messagesRefreshInFlightRef.current = false;
        return;
      }
      setIsLoadingMessages(false);
    }
  };

  const loadMoreMessages = async (chatId: number) => {
    if (isLoadingMoreMessages) return;
    if (!messagesPaginationRef.current.hasMore) return;

    const el = messagesContainerRef.current;
    if (el) {
      pendingScrollAdjustRef.current = {
        prevScrollHeight: el.scrollHeight,
        prevScrollTop: el.scrollTop,
      };
    }

    setIsLoadingMoreMessages(true);
    setMessagesError('');
    try {
      const nextOffset = messagesPaginationRef.current.offset + messagesPaginationRef.current.limit;
      const response = await chatsApi.getMessages(chatId, {
        limit: messagesPaginationRef.current.limit,
        offset: nextOffset,
      });

      const incoming = response.messages || [];
      setMessages((prev) => {
        const map = new Map<number, Message>();
        for (const m of prev) map.set(m.id, m);
        for (const m of incoming) map.set(m.id, m);
        return Array.from(map.values()).sort((a, b) => {
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        });
      });

      setMessagesPagination({
        total: response.pagination.total,
        limit: response.pagination.limit,
        offset: response.pagination.offset,
        hasMore: response.pagination.hasMore,
      });
    } catch (err) {
      pendingScrollAdjustRef.current = null;
      if (err instanceof NetworkError) {
        setMessagesError(err.message);
      } else {
        setMessagesError('Не удалось загрузить сообщения');
      }
    } finally {
      setIsLoadingMoreMessages(false);
    }
  };

  const getFilteredChats = () => {
    switch (activeFilter) {
      case 'unread':
        return chats.filter(chat => chat.unreadCount > 0);
      case 'open':
        return chats.filter(chat => chat.status !== 'closed');
      case 'my':
        return chats;
      case 'ignored':
        return chats.filter(chat => chat.status === 'closed');
      default:
        return chats;
    }
  };

  const handleChatClick = (chatId: number) => {
    setSelectedChatId(chatId);
  };

  const updateChatInState = (updated: Chat) => {
    setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleMarkChatRead = async () => {
    if (!selectedChatId) return;

    try {
      await chatsApi.markChatRead(selectedChatId);
      setChats((prev) =>
        prev.map((c) => (c.id === selectedChatId ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err) {
      if (err instanceof NetworkError) {
        alert(`Ошибка: ${err.message}`);
      } else {
        alert('Не удалось отметить чат прочитанным');
      }
    }
  };

  const handleToggleAssignment = async () => {
    if (!selectedChatId || !user) return;
    const current = chats.find((c) => c.id === selectedChatId) || null;

    setIsAssigningChat(true);
    try {
      const resp = current?.assignedUser ? await chatsApi.unassignChat({ chatId: selectedChatId }) : await chatsApi.assignChat({ chatId: selectedChatId, operatorId: user.id });
      updateChatInState(resp.chat);
    } catch (err) {
      if (err instanceof NetworkError) {
        alert(`Ошибка: ${err.message}`);
      } else {
        alert('Не удалось изменить назначение чата');
      }
    } finally {
      setIsAssigningChat(false);
    }
  };

  const handleSetChatPriority = async (priority: ChatPriority) => {
    if (!selectedChatId || isUpdatingPriority) return;

    setIsUpdatingPriority(true);
    try {
      const resp = await chatsApi.setChatPriority({ chatId: selectedChatId, priority });
      updateChatInState(resp.chat);
    } catch (err) {
      if (err instanceof NetworkError) {
        alert(`Ошибка: ${err.message}`);
      } else {
        alert('Не удалось изменить приоритет чата');
      }
    } finally {
      setIsUpdatingPriority(false);
    }
  };
  
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
      void loadMessages(selectedChatId, { silent: true });
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

  const loadSuggestions = async () => {
    if (!selectedChatId) return;

    setIsLoadingSuggestions(true);
    setSuggestionsError('');
    try {
      const resp = await aiApi.getSuggestions(selectedChatId, 3);
      setSuggestions(Array.isArray(resp.suggestions) ? resp.suggestions.slice(0, 3) : []);
      setIsSuggestionsOpen(true);
    } catch (err) {
      if (err instanceof NetworkError) {
        setSuggestionsError(err.message);
      } else {
        setSuggestionsError('Не удалось получить подсказки');
      }
      setIsSuggestionsOpen(true);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handlePickSuggestion = (text: string) => {
    setMessageInput(text);
    setIsSuggestionsOpen(false);
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

  useEffect(() => {
    if (!autoTranslateIncoming) return;

    let cancelled = false;

    const run = async () => {
      for (const message of messages) {
        if (cancelled) return;
        if (message.fromMe) continue;
        const sourceText = message.content?.trim() ?? '';
        if (!sourceText) continue;
        const current = translationsRef.current[message.id];
        if (current?.status === 'loading' || current?.status === 'done') continue;
        await translateIncomingMessage(message);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [messages, autoTranslateIncoming, translateIncomingMessage]);

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
      return (
        <>
          <audio
            className={styles.messageMediaAudio}
            controls
            preload="metadata"
            src={message.mediaUrl}
          />
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
      <div className={styles.page}>
        <div className={`${styles.container} ${isCallPanelCollapsed ? styles.containerCollapsed : ''}`}>
          <aside className={styles.sidebar}>
            <div className={styles.searchSection}>
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Поиск по чатам"
                aria-label="Поиск по чатам"
              />
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
                Все чаты <span className={styles.filterCount}>({activeFilter === 'all' ? pagination.total : allChatsTotal})</span>
              </button>
              <button
                className={`${styles.filterTab} ${activeFilter === 'my' ? styles.filterTabActive : ''}`}
                onClick={() => setActiveFilter('my')}
              >
                Мои чаты{' '}
                <span className={styles.filterCount}>
                  (
                  {activeFilter === 'my'
                    ? pagination.total
                    : chats.filter((c) => (user ? c.assignedUser?.id === user.id : c.assignedUser !== null)).length}
                  )
                </span>
              </button>
            </div>
            
            <div className={styles.chatList} ref={chatListRef}>
              {isLoading && chats.length === 0 ? (
                <div className={styles.loading}>Загрузка...</div>
              ) : error ? (
                <div className={styles.error}>
                  <p className={styles.errorText}>{error}</p>
                  <Button onClick={() => void loadChats()} size="small">
                    Повторить
                  </Button>
                </div>
              ) : getFilteredChats().length === 0 ? (
                <div className={styles.empty}>
                  <div className={styles.emptyIcon}>
                    <Icon name="chat" size={56} color="var(--text-muted)" />
                  </div>
                  <p className={styles.emptyText}>Нет чатов</p>
                </div>
              ) : (
                <>
                  {getFilteredChats().map((chat) => {
                  const displayName = (chat.displayName || chat.name || '').trim() || `Чат #${chat.id}`;
                  const avatarLetter = displayName.charAt(0).toUpperCase();
                  const timeAgo = formatTimeAgo(chat.lastMessageAt);
                  const clientPhone = extractPhoneFromJid(chat.remoteJid);
                  const orgPhoneLabel = chat.organizationPhone?.displayName || '';
                  const orgConnLabel = chat.organizationPhone?.connectionType || '';
                  
                  return (
                    <div
                      key={chat.id}
                      className={`${styles.chatItem} ${
                        selectedChatId === chat.id ? styles.active : ''
                      }`}
                      onClick={() => handleChatClick(chat.id)}
                    >
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
                            <span className={styles.chatName}>{displayName}</span>
                            {chat.assignedUser && (
                              <span className={styles.chatAssignedUser}>
                                {chat.assignedUser.name || chat.assignedUser.email}
                              </span>
                            )}
                            <span className={styles.chatSubtitle}>
                              {formatChannelLabel(chat.channel)}
                              {clientPhone ? ` • ${clientPhone}` : ''}
                              {orgPhoneLabel ? ` • ${orgPhoneLabel}` : ''}
                              {orgConnLabel ? ` (${orgConnLabel})` : ''}
                            </span>
                          </div>
                          <div className={styles.chatMeta}>
                            <span className={styles.chatTime}>{timeAgo}</span>
                            {chat.priority === 'urgent' && (
                              <span className={styles.urgentBadge}>URGENT</span>
                            )}
                            {chat.unreadCount > 0 && (
                              <span className={styles.unreadBubble}>{chat.unreadCount}</span>
                            )}
                          </div>
                        </div>
                        <p className={styles.chatLastMessage}>
                          {chat.lastMessage?.content.substring(0, 60) || 'Нет сообщений'}
                        </p>
                      </div>
                    </div>
                  );
                  })}
                  {isLoadingMoreChats && <div className={styles.chatsMoreLoading}>Загрузка...</div>}
                </>
              )}
            </div>
          </aside>

          <main className={styles.content}>
            {selectedChatId ? (
              <div className={styles.chatWindow}>
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
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <div className={styles.chatTopRight}>
                    <select
                      className={styles.searchSelect}
                      value={(chats.find((c) => c.id === selectedChatId)?.priority ?? 'medium') as ChatPriority}
                      onChange={(e) => void handleSetChatPriority(e.target.value as ChatPriority)}
                      aria-label="Приоритет чата"
                      disabled={!selectedChatId || isUpdatingPriority}
                    >
                      <option value="low">low</option>
                      <option value="medium">Нормально</option>
                      <option value="high">high</option>
                      <option value="urgent">Передать Администрации</option>
                    </select>
                    <button
                      className={styles.chatTopAction}
                      type="button"
                      onClick={handleToggleAssignment}
                      disabled={!user || isAssigningChat}
                    >
                      {(chats.find((c) => c.id === selectedChatId)?.assignedUser ? 'Снять' : 'Взять')}
                    </button>
                    <button
                      className={styles.chatTopAction}
                      type="button"
                      onClick={handleMarkChatRead}
                    >
                      Прочитать
                    </button>
                    <button
                      className={styles.chatTopAction}
                      type="button"
                      onClick={handleOpenCallPanel}
                      disabled={!selectedChatPhone}
                      title={selectedChatPhone ? `Позвонить: ${selectedChatPhone}` : 'Нет номера для звонка'}
                    >
                      Позвонить
                    </button>
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
                    <div className={styles.empty}>
                      <div className={styles.loading}>Загрузка сообщений...</div>
                    </div>
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
                      {messages.map((message) => {
                        const time = new Date(message.timestamp).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        });

                        const senderLabel = message.senderUser
                          ? (message.senderUser.name || message.senderUser.email).trim()
                          : '';
                        
                        return (
                          <div
                            key={message.id}
                            className={`${styles.message} ${
                              message.fromMe ? styles.messageOwn : styles.messageOther
                            }`}
                          >
                            <div className={styles.messageContent}>
                              {senderLabel && (
                                <div className={styles.messageSender}>{senderLabel}</div>
                              )}
                              {renderMessageBody(message)}
                              {renderTranslation(message)}
                              <span className={styles.messageTime}>{time}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedChatId && isSuggestionsOpen && (
                  <div className={styles.suggestionsPanel}>
                    <div className={styles.suggestionsHeader}>
                      <div className={styles.suggestionsTitle}>Подсказки</div>
                      <button
                        type="button"
                        className={styles.suggestionsClose}
                        onClick={() => setIsSuggestionsOpen(false)}
                        aria-label="Закрыть подсказки"
                        title="Закрыть"
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

                  <div className={styles.formatBar}>
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
                    onClick={loadSuggestions}
                    disabled={!selectedChatId || isLoadingSuggestions}
                    aria-label="Получить подсказки"
                    title="Подсказки"
                  >
                    AI
                  </button>
                  <button
                    type="button"
                    className={styles.suggestionsButton}
                    onClick={() => setAutoTranslateIncoming((v) => !v)}
                    disabled={!selectedChatId}
                    aria-label="Автоперевод входящих сообщений"
                    title="Автоперевод входящих сообщений"
                  >
                    {autoTranslateIncoming ? 'Перевод ON' : 'Перевод OFF'}
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
              <CallWidget
                defaultCallee={callWidgetCallee}
                defaultCalleeVersion={callWidgetCalleeVersion}
                onStatusChange={handleCallWidgetStatus}
              />
            </div>
          </aside>
        </div>
      </div>
    </Layout>
  );
}
