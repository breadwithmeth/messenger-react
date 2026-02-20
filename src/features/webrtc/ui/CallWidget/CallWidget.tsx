import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Invitation,
  Inviter,
  Registerer,
  RegistererState,
  Session,
  SessionState,
  URI,
  UserAgent,
} from 'sip.js';
// sip.js держит holdModifier во внутреннем модуле
// eslint-disable-next-line import/no-unresolved
import { holdModifier } from 'sip.js/lib/platform/web/modifiers/modifiers';
import { Button } from '../../../../shared/ui/Button/Button';
import { Input } from '../../../../shared/ui/Input/Input';
import styles from './CallWidget.module.css';

type RegistrationStateUI = 'idle' | 'connecting' | 'registered' | 'error';
type CallStateUI = 'idle' | 'incoming' | 'outgoing' | 'in-call' | 'ended';

type SipCredentials = {
  login: string;
  password: string;
};

const STORAGE_KEY = 'webrtc.sip.credentials.v1';

// Рингтон входящего звонка (меняется здесь)
const RINGTONE_VOLUME = 0.16;
const RINGTONE_ON_MS = 2000;
const RINGTONE_OFF_MS = 4000;
// Простая “мелодия” (частота Гц, длительность мс). Частота 0 = пауза.
const RINGTONE_MELODY: Array<[number, number]> = [
  [659, 120], [0, 80],
  [659, 120], [0, 80],
  [659, 120], [0, 220],
  [523, 120], [0, 80],
  [659, 140], [0, 220],
  [784, 180], [0, 460],
  [392, 200], [0, 0],
];

// Дефолты (как на ваших скриншотах)
const DEFAULT_WS_SERVER_URL = 'wss://jasmine.naliv.kz:8089/asterisk/ws';
const DEFAULT_SIP_DOMAIN = '88.218.70.246';

const WS_SERVER_URL = import.meta.env.VITE_SIP_WS_SERVER_URL ?? DEFAULT_WS_SERVER_URL;
const SIP_DOMAIN = import.meta.env.VITE_SIP_DOMAIN ?? DEFAULT_SIP_DOMAIN;
const SIP_URI_PREFIX = import.meta.env.VITE_SIP_URI_PREFIX ?? 'sip:';

const loadCredentials = (): SipCredentials => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { login: '', password: '' };
    const parsed = JSON.parse(raw) as Partial<SipCredentials>;
    return { login: parsed.login ?? '', password: parsed.password ?? '' };
  } catch {
    return { login: '', password: '' };
  }
};

const saveCredentials = (credentials: SipCredentials) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
};

const buildSipUri = (login: string) => {
  const clean = login.trim();
  if (!clean) return '';
  const domain = (SIP_DOMAIN ?? '').trim();
  if (!domain) return '';
  const prefix = SIP_URI_PREFIX.endsWith(':') ? SIP_URI_PREFIX : `${SIP_URI_PREFIX}:`;
  return `${prefix}${clean}@${domain}`;
};

const makeUri = (value: string): URI | undefined => {
  try {
    return UserAgent.makeURI(value) ?? undefined;
  } catch {
    return undefined;
  }
};

const getPeerConnection = (session: Session | null): RTCPeerConnection | null => {
  if (!session) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdh: any = (session as any).sessionDescriptionHandler;
  const pc: RTCPeerConnection | undefined = sdh?.peerConnection;
  return pc ?? null;
};

const safeDisposeSession = async (session: Session | null) => {
  if (!session) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (session as any).dispose?.();
  } catch {
    // ignore
  }
};

export function CallWidget({
  defaultCallee,
}: {
  defaultCallee?: string;
}) {
  const [credentials, setCredentials] = useState<SipCredentials>(() => loadCredentials());

  const [registrationState, setRegistrationState] = useState<RegistrationStateUI>('idle');
  const [registrationText, setRegistrationText] = useState('Отключено');
  const [callState, setCallState] = useState<CallStateUI>('idle');
  const [callText, setCallText] = useState('');
  const [callee, setCallee] = useState(defaultCallee ?? '');
  const [error, setError] = useState('');
  const [saveFeedback, setSaveFeedback] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isHeld, setIsHeld] = useState(false);

  const uaRef = useRef<UserAgent | null>(null);
  const registererRef = useRef<Registerer | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const ringtoneCtxRef = useRef<AudioContext | null>(null);
  const ringtoneTimeoutRef = useRef<number | null>(null);
  const ringtoneNodesRef = useRef<{ oscs: OscillatorNode[]; gain: GainNode } | null>(null);

  const ensureRingtoneContext = async () => {
    if (!ringtoneCtxRef.current) {
      const Ctx =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((window as any).webkitAudioContext as typeof window.AudioContext | undefined);
      if (!Ctx) return;
      ringtoneCtxRef.current = new Ctx();
    }

    if (ringtoneCtxRef.current.state !== 'running') {
      try {
        await ringtoneCtxRef.current.resume();
      } catch {
        // браузер может блокировать до жеста пользователя
      }
    }
  };

  const stopRingtone = () => {
    if (ringtoneTimeoutRef.current) {
      window.clearTimeout(ringtoneTimeoutRef.current);
      ringtoneTimeoutRef.current = null;
    }

    const nodes = ringtoneNodesRef.current;
    if (nodes) {
      ringtoneNodesRef.current = null;
      try {
        nodes.gain.gain.setValueAtTime(0, nodes.gain.context.currentTime);
      } catch {
        // ignore
      }

      nodes.oscs.forEach((osc) => {
        try {
          osc.stop();
        } catch {
          // ignore
        }
      });
      try {
        nodes.oscs.forEach((osc) => osc.disconnect());
        nodes.gain.disconnect();
      } catch {
        // ignore
      }
    }
  };

  const startRingtone = () => {
    // Запускаем только если реально входящий вызов
    if (callState !== 'incoming') return;
    if (ringtoneTimeoutRef.current || ringtoneNodesRef.current) return;

    const playCycle = () => {
      if (callState !== 'incoming') {
        stopRingtone();
        return;
      }

      void ensureRingtoneContext().finally(() => {
        const ctx = ringtoneCtxRef.current;
        if (!ctx || ctx.state !== 'running') {
          // если заблокировано autoplay — попробуем снова позже
          ringtoneTimeoutRef.current = window.setTimeout(playCycle, 1500);
          return;
        }

        // Мелодичный рингтон (один осциллятор + расписание частоты/громкости)
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.connect(ctx.destination);

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.connect(gain);

        const now = ctx.currentTime;
        let t = now;

        // Длительность мелодии ограничиваем RINGTONE_ON_MS
        const endAt = now + RINGTONE_ON_MS / 1000;
        const volume = RINGTONE_VOLUME;

        gain.gain.setValueAtTime(0, now);

        for (const [freq, ms] of RINGTONE_MELODY) {
          if (t >= endAt) break;
          const dur = Math.max(0, ms) / 1000;
          const nextT = Math.min(endAt, t + dur);
          if (freq > 0) {
            osc.frequency.setValueAtTime(freq, t);
            // мягкая атака/релиз
            const attackEnd = Math.min(nextT, t + 0.01);
            const releaseStart = Math.max(t, nextT - 0.01);
            gain.gain.linearRampToValueAtTime(volume, attackEnd);
            gain.gain.setValueAtTime(volume, releaseStart);
            gain.gain.linearRampToValueAtTime(0, nextT);
          } else {
            // пауза
            gain.gain.setValueAtTime(0, t);
            gain.gain.setValueAtTime(0, nextT);
          }
          t = nextT;
        }

        // гарантированный ноль на конце
        gain.gain.setValueAtTime(0, endAt);

        osc.start(now);
        osc.stop(endAt + 0.05);

        ringtoneNodesRef.current = { oscs: [osc], gain };

        const cleanupAfterTone = () => {
          stopRingtone();
          // Пауза → следующий цикл
          if (callState === 'incoming') {
            ringtoneTimeoutRef.current = window.setTimeout(playCycle, RINGTONE_OFF_MS);
          }
        };

        // гарантированная очистка после тона
        ringtoneTimeoutRef.current = window.setTimeout(cleanupAfterTone, RINGTONE_ON_MS + 200);
      });
    };

    playCycle();
  };

  const sipUri = useMemo(() => buildSipUri(credentials.login), [credentials.login]);

  const canSave = useMemo(() => {
    return Boolean(credentials.login.trim()) || Boolean(credentials.password.trim());
  }, [credentials.login, credentials.password]);

  const canConnect = useMemo(() => {
    return Boolean(WS_SERVER_URL.trim()) && Boolean(sipUri) && Boolean(credentials.password.trim());
  }, [credentials.password, sipUri]);

  const connectBlockedReason = useMemo(() => {
    const missing: string[] = [];
    if (!WS_SERVER_URL.trim()) missing.push('WebSocket URL');
    if (!SIP_DOMAIN.trim()) missing.push('SIP domain');
    if (!credentials.login.trim()) missing.push('логин');
    if (!credentials.password.trim()) missing.push('пароль');
    if (missing.length === 0) return '';
    return `не заполнено: ${missing.join(', ')}`;
  }, [credentials.login, credentials.password]);

  const isConnectedLike = registrationState === 'connecting' || registrationState === 'registered' || Boolean(uaRef.current);
  const hasActiveCall = callState === 'outgoing' || callState === 'incoming' || callState === 'in-call';
  const statusLine = saveFeedback || (callState !== 'idle' ? callText : registrationText);

  useEffect(() => {
    if (defaultCallee && defaultCallee.trim() && callState === 'idle') {
      setCallee(defaultCallee);
    }
  }, [defaultCallee, callState]);

  useEffect(() => {
    return () => {
      stopRingtone();
      try {
        void ringtoneCtxRef.current?.close();
      } catch {
        // ignore
      }
      ringtoneCtxRef.current = null;

      void safeDisposeSession(sessionRef.current);
      try {
        void registererRef.current?.unregister();
      } catch {
        // ignore
      }
      try {
        void uaRef.current?.stop();
      } catch {
        // ignore
      }
      uaRef.current = null;
      registererRef.current = null;
      sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    // Разблокировка аудио по первому жесту пользователя
    const onFirstGesture = () => {
      void ensureRingtoneContext();
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };

    window.addEventListener('pointerdown', onFirstGesture, { once: true });
    window.addEventListener('keydown', onFirstGesture, { once: true });

    return () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
  }, []);

  useEffect(() => {
    if (callState === 'incoming') {
      startRingtone();
    } else {
      stopRingtone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState]);

  const cleanupCall = () => {
    sessionRef.current = null;
    setCallState('idle');
    setCallText('');
    setIsMuted(false);
    setIsHeld(false);
    remoteStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    stopRingtone();
  };

  const attachRemoteAudio = (session: Session) => {
    const el = remoteAudioRef.current;
    if (!el) return;

    if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
    el.srcObject = remoteStreamRef.current;

    const ensurePlay = async () => {
      try {
        await el.play();
      } catch {
        // autoplay может блокироваться до жеста пользователя
      }
    };

    const tryAttach = (attemptsLeft: number) => {
      const pc = getPeerConnection(session);
      if (!pc) {
        if (attemptsLeft > 0) window.setTimeout(() => tryAttach(attemptsLeft - 1), 120);
        return;
      }

      pc.ontrack = (event: RTCTrackEvent) => {
        if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
        const stream = remoteStreamRef.current;
        if (!stream.getTracks().includes(event.track)) stream.addTrack(event.track);
        el.srcObject = remoteStreamRef.current;
        void ensurePlay();
      };

      // на случай если треки уже есть
      pc.getReceivers()
        .map((r) => r.track)
        .filter((t): t is MediaStreamTrack => Boolean(t))
        .forEach((track) => {
          if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
          const stream = remoteStreamRef.current;
          if (!stream.getTracks().includes(track)) stream.addTrack(track);
        });
      el.srcObject = remoteStreamRef.current;
      void ensurePlay();
    };

    tryAttach(10);
  };

  const disconnect = () => {
    setError('');
    setRegistrationState('idle');
    setRegistrationText('Отключено');

    void safeDisposeSession(sessionRef.current);
    try {
      void registererRef.current?.unregister();
    } catch {
      // ignore
    }
    try {
      void uaRef.current?.stop();
    } catch {
      // ignore
    }

    uaRef.current = null;
    registererRef.current = null;
    sessionRef.current = null;
    cleanupCall();
  };

  const connect = () => {
    setError('');

    if (!canConnect) {
      if (!credentials.login.trim()) {
        setError('Введите логин SIP.');
        return;
      }
      if (!credentials.password.trim()) {
        setError('Введите пароль SIP.');
        return;
      }
      setError(connectBlockedReason || 'Не удалось подключиться');
      return;
    }

    try {
      disconnect();
      saveCredentials(credentials);

      setRegistrationState('connecting');
      setRegistrationText('Подключение…');

      const ua = new UserAgent({
        uri: makeUri(sipUri),
        displayName: credentials.login || undefined,
        authorizationUsername: credentials.login,
        authorizationPassword: credentials.password,
        transportOptions: { server: WS_SERVER_URL.trim() },
      });

      uaRef.current = ua;

      ua.delegate = {
        onInvite: (invitation: Invitation) => {
          if (sessionRef.current && sessionRef.current !== invitation) {
            try {
              void invitation.reject();
            } catch {
              // ignore
            }
            return;
          }

          sessionRef.current = invitation;
          setIsMuted(false);
          setIsHeld(false);
          setCallState('incoming');
          setCallText('Входящий звонок');

          invitation.stateChange.addListener((state) => {
            if (state === SessionState.Establishing) setCallText('Соединение…');
            if (state === SessionState.Established) {
              setCallState('in-call');
              setCallText('Разговор');
              stopRingtone();
              attachRemoteAudio(invitation);
            }
            if (state === SessionState.Terminated) {
              setCallState('ended');
              setCallText('Завершено');
              stopRingtone();
              window.setTimeout(() => cleanupCall(), 400);
            }
          });
        },
      };

      void ua
        .start()
        .then(() => {
          const registerer = new Registerer(ua);
          registererRef.current = registerer;

          registerer.stateChange.addListener((state) => {
            if (state === RegistererState.Registered) {
              setRegistrationState('registered');
              setRegistrationText('Зарегистрирован');
            } else if (state === RegistererState.Unregistered) {
              setRegistrationState('idle');
              setRegistrationText('Отключено');
            } else if (state === RegistererState.Terminated) {
              setRegistrationState('idle');
              setRegistrationText('Отключено');
            }
          });

          void registerer.register().catch((e) => {
            setRegistrationState('error');
            setRegistrationText('Ошибка регистрации');
            setError(e instanceof Error ? e.message : 'Ошибка регистрации');
          });
        })
        .catch((e) => {
          setRegistrationState('error');
          setRegistrationText('Ошибка');
          setError(e instanceof Error ? e.message : 'Ошибка подключения');
        });
    } catch (e) {
      setRegistrationState('error');
      setRegistrationText('Ошибка');
      setError(e instanceof Error ? e.message : 'Ошибка подключения');
    }
  };

  const dialTarget = (raw: string) => {
    const value = raw.trim();
    if (!value) return '';
    if (/^sip:/i.test(value)) return value;
    const prefix = SIP_URI_PREFIX.endsWith(':') ? SIP_URI_PREFIX : `${SIP_URI_PREFIX}:`;
    return `${prefix}${value}@${SIP_DOMAIN}`;
  };

  const startCall = () => {
    setError('');
    const ua = uaRef.current;
    if (!ua || registrationState !== 'registered') {
      setError('Сначала подключитесь и дождитесь статуса "Зарегистрирован".');
      return;
    }
    if (callState !== 'idle') return;

    const target = dialTarget(callee);
    const targetUri = makeUri(target);
    if (!targetUri) {
      setError('Введите номер/адрес для звонка.');
      return;
    }

    const inviter = new Inviter(ua, targetUri, {
      sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } },
    });

    sessionRef.current = inviter;
    setCallState('outgoing');
    setCallText('Исходящий звонок…');
    setIsMuted(false);
    setIsHeld(false);

    inviter.stateChange.addListener((state) => {
      if (state === SessionState.Establishing) setCallText('Соединение…');
      if (state === SessionState.Established) {
        setCallState('in-call');
        setCallText('Разговор');
        attachRemoteAudio(inviter);
      }
      if (state === SessionState.Terminated) {
        setCallState('ended');
        setCallText('Завершено');
        window.setTimeout(() => cleanupCall(), 400);
      }
    });

    void inviter.invite().catch((e) => {
      setCallState('ended');
      setCallText('Не удалось');
      setError(e instanceof Error ? e.message : 'Звонок не удался');
      window.setTimeout(() => cleanupCall(), 600);
    });
  };

  const hangup = () => {
    setError('');
    const session = sessionRef.current;
    if (!session) return;

    try {
      if (session.state === SessionState.Established) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        void (session as any).bye?.();
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        void (session as any).cancel?.();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        void (session as any).reject?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось завершить звонок');
    }
  };

  const accept = () => {
    setError('');
    const session = sessionRef.current;
    if (!session) return;
    const invitation = session as Invitation;

    void invitation
      .accept({ sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } })
      .then(() => attachRemoteAudio(invitation))
      .catch((e) => setError(e instanceof Error ? e.message : 'Не удалось принять звонок'));
  };

  const reject = () => {
    setError('');
    const session = sessionRef.current;
    if (!session) return;
    try {
      void (session as Invitation).reject();
    } catch {
      // ignore
    }
  };

  const toggleMute = () => {
    setError('');
    const pc = getPeerConnection(sessionRef.current);
    if (!pc) return;
    const audioSender = pc.getSenders().find((s) => s.track?.kind === 'audio');
    if (!audioSender?.track) return;

    audioSender.track.enabled = isMuted;
    setIsMuted((v) => !v);
  };

  const toggleHold = () => {
    setError('');
    const session = sessionRef.current;
    if (!session) return;

    // hold/unhold через re-INVITE
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reinvite = (session as any).invite as undefined | ((options?: any) => Promise<void>);
    if (!reinvite) {
      setError('Удержание не поддерживается');
      return;
    }

    if (isHeld) {
      void reinvite({ sessionDescriptionHandlerModifiers: [] })
        .then(() => setIsHeld(false))
        .catch((e) => setError(e instanceof Error ? e.message : 'Не удалось снять удержание'));
    } else {
      void reinvite({ sessionDescriptionHandlerModifiers: [holdModifier] })
        .then(() => setIsHeld(true))
        .catch((e) => setError(e instanceof Error ? e.message : 'Не удалось поставить на удержание'));
    }
  };

  const onSaveSettings = () => {
    setError('');
    if (!canSave) {
      setError('Введите логин и/или пароль, затем нажмите «Сохранить».');
      return;
    }

    try {
      saveCredentials(credentials);
      setSaveFeedback('Сохранено');
      setRegistrationText((prev) => (prev === 'Зарегистрирован' ? prev : 'Сохранено'));
      window.setTimeout(() => {
        setSaveFeedback('');
        setRegistrationText((prev) => (prev === 'Сохранено' ? 'Отключено' : prev));
      }, 1100);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    }
  };

  return (
    <div className={styles.widget} aria-label="Звонки">
      <div className={styles.header}>
        <div className={styles.title}>
          <div className={styles.titleMain}>Звонок (WebRTC)</div>
          <div className={styles.status}>{statusLine || '—'}</div>
        </div>
      </div>

      <div className={styles.body}>
        {error ? <div className={styles.error}>{error}</div> : null}

        <audio ref={remoteAudioRef} autoPlay playsInline />

        <div className={styles.row2}>
          <Input
            value={credentials.login}
            onChange={(e) => setCredentials((s) => ({ ...s, login: e.target.value }))}
            placeholder="Логин SIP (например 152)"
            aria-label="Логин SIP"
          />
          <Input
            value={credentials.password}
            onChange={(e) => setCredentials((s) => ({ ...s, password: e.target.value }))}
            placeholder="Пароль"
            aria-label="Пароль"
            type="password"
          />
        </div>

        <div className={styles.row2}>
          <Button onClick={onSaveSettings}>{saveFeedback ? saveFeedback : 'Сохранить'}</Button>
          {isConnectedLike ? <Button onClick={disconnect}>Отключить</Button> : <Button onClick={connect}>Подключить</Button>}
        </div>

        <div className={styles.row2}>
          {callState === 'idle' ? (
            <Button onClick={startCall} disabled={registrationState !== 'registered'}>
              Позвонить
            </Button>
          ) : (
            <Button onClick={hangup}>Завершить</Button>
          )}

          {callState === 'incoming' ? (
            <Button onClick={accept}>Принять</Button>
          ) : (
            <Button onClick={toggleMute} disabled={callState !== 'in-call'}>
              {isMuted ? 'Unmute' : 'Mute'}
            </Button>
          )}
        </div>

        {callState === 'incoming' ? (
          <div className={styles.row2}>
            <Button onClick={reject}>Отклонить</Button>
            <Button onClick={() => { /* placeholder to keep grid */ }} disabled>
              —
            </Button>
          </div>
        ) : null}

        {hasActiveCall ? (
          <div className={styles.row2}>
            <Button onClick={toggleHold} disabled={callState !== 'in-call'}>
              {isHeld ? 'Снять удержание' : 'Удержание'}
            </Button>
            <span className={styles.badge}>{callState === 'in-call' ? 'В разговоре' : 'Аудио'}</span>
          </div>
        ) : null}

        <div className={styles.callRow}>
          <Input
            value={callee}
            onChange={(e) => setCallee(e.target.value)}
            placeholder="Номер или sip:user@domain"
            aria-label="Кому звонить"
          />
          <span className={styles.badge}>Аудио</span>
        </div>

        <div className={styles.hint}>WebSocket: {WS_SERVER_URL} · Домен: {SIP_DOMAIN}</div>
        {!canConnect && connectBlockedReason ? <div className={styles.hint}>Подключение недоступно: {connectBlockedReason}</div> : null}
      </div>
    </div>
  );
}
