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

export type CallWidgetStatus = {
  registrationState: RegistrationStateUI;
  registrationText: string;
  callState: CallStateUI;
  callText: string;
  callPeer: string;
  isMuted: boolean;
  isHeld: boolean;
  error: string;
};

type SipCredentials = {
  login: string;
  password: string;
};

const STORAGE_KEY = 'webrtc.sip.credentials.v1';
const AUTO_CONNECT_KEY = 'webrtc.sip.autoConnect.v1';
const DND_KEY = 'webrtc.sip.dnd.v1';
const DEVICES_KEY = 'webrtc.sip.devices.v1';
const VOLUMES_KEY = 'webrtc.sip.volumes.v1';

// Рингтон входящего звонка (меняется здесь)
const DEFAULT_RINGTONE_VOLUME = 0.16;
const RINGTONE_ON_MS = 2000;
const RINGTONE_OFF_MS = 4000;
// Гудки для исходящего (локальный ringback)
const RINGBACK_VOLUME_MULTIPLIER = 0.85;
const RINGBACK_FREQUENCY_HZ = 425;
const RINGBACK_ON_MS = 2000;
const RINGBACK_OFF_MS = 4000;
// Простая “мелодия” (частота Гц, длительность мс). Частота 0 = пауза.
const RINGTONE_MELODY: Array<[number, number]> = [
  // Нейтральный «цифровой звонок»: короткие аккордовые импульсы + паузы
  // (без узнаваемых мотивов)
  [523, 90], [659, 90], [784, 120], [0, 120],
  [523, 90], [659, 90], [784, 120], [0, 260],
  [587, 110], [740, 110], [880, 140], [0, 220],
  [523, 120], [0, 0],
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

const loadBool = (key: string, fallback: boolean) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === '1' || raw === 'true';
  } catch {
    return fallback;
  }
};

const saveBool = (key: string, value: boolean) => {
  localStorage.setItem(key, value ? '1' : '0');
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

type StoredDevices = { micId: string; speakerId: string };

const loadDevices = (): StoredDevices => {
  try {
    const raw = localStorage.getItem(DEVICES_KEY);
    if (!raw) return { micId: '', speakerId: '' };
    const parsed = JSON.parse(raw) as Partial<StoredDevices>;
    return { micId: parsed.micId ?? '', speakerId: parsed.speakerId ?? '' };
  } catch {
    return { micId: '', speakerId: '' };
  }
};

const saveDevices = (devices: StoredDevices) => {
  localStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
};

type StoredVolumes = { ringtone: number; call: number };

const loadVolumes = (): StoredVolumes => {
  try {
    const raw = localStorage.getItem(VOLUMES_KEY);
    if (!raw) return { ringtone: DEFAULT_RINGTONE_VOLUME, call: 1 };
    const parsed = JSON.parse(raw) as Partial<StoredVolumes>;
    const ringtone = typeof parsed.ringtone === 'number' ? clamp01(parsed.ringtone) : DEFAULT_RINGTONE_VOLUME;
    const call = typeof parsed.call === 'number' ? clamp01(parsed.call) : 1;
    return { ringtone, call };
  } catch {
    return { ringtone: DEFAULT_RINGTONE_VOLUME, call: 1 };
  }
};

const saveVolumes = (volumes: StoredVolumes) => {
  localStorage.setItem(
    VOLUMES_KEY,
    JSON.stringify({ ringtone: clamp01(volumes.ringtone), call: clamp01(volumes.call) })
  );
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

const normalizeDialInput = (raw: string) => {
  // Требование: убирать пробелы и тире в номере.
  // Для SIP-URI оставляем содержимое как есть, кроме пробелов.
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^sip:/i.test(trimmed) || trimmed.includes('@')) {
    return trimmed.replace(/\s+/g, '');
  }
  return trimmed.replace(/[\s-]+/g, '');
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

type CallLogDirection = 'incoming' | 'outgoing';
type CallLogResult = 'ringing' | 'in-call' | 'completed' | 'missed' | 'rejected' | 'failed' | 'canceled';

type CallLogItem = {
  id: string;
  direction: CallLogDirection;
  peer: string;
  startedAt: number;
  establishedAt?: number;
  endedAt?: number;
  result: CallLogResult;
  durationSec?: number;
};

const formatShortTime = (t: number) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

const formatDuration = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}с`;
  return `${m}м ${String(r).padStart(2, '0')}с`;
};

export function CallWidget({
  defaultCallee,
  onStatusChange,
}: {
  defaultCallee?: string;
  onStatusChange?: (status: CallWidgetStatus) => void;
}) {
  const [credentials, setCredentials] = useState<SipCredentials>(() => loadCredentials());

  const [autoConnect, setAutoConnect] = useState<boolean>(() => loadBool(AUTO_CONNECT_KEY, false));
  const [dndEnabled, setDndEnabled] = useState<boolean>(() => loadBool(DND_KEY, false));

  const [registrationState, setRegistrationState] = useState<RegistrationStateUI>('idle');
  const [registrationText, setRegistrationText] = useState('Отключено');
  const [callState, setCallState] = useState<CallStateUI>('idle');
  const [callText, setCallText] = useState('');
  const [callPeer, setCallPeer] = useState('');
  const [callee, setCallee] = useState(defaultCallee ?? '');
  const [error, setError] = useState('');
  const [saveFeedback, setSaveFeedback] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isHeld, setIsHeld] = useState(false);

  const storedDevices = useMemo(() => loadDevices(), []);
  const storedVolumes = useMemo(() => loadVolumes(), []);

  const [selectedMicId, setSelectedMicId] = useState<string>(storedDevices.micId);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>(storedDevices.speakerId);
  const selectedSpeakerIdRef = useRef<string>(selectedSpeakerId);
  const selectedMicIdRef = useRef<string>(selectedMicId);

  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);

  const [ringtoneVolume, setRingtoneVolume] = useState<number>(storedVolumes.ringtone);
  const [callVolume, setCallVolume] = useState<number>(storedVolumes.call);
  const ringtoneVolumeRef = useRef<number>(ringtoneVolume);

  const dndRef = useRef<boolean>(dndEnabled);
  const outgoingTimeoutRef = useRef<number | null>(null);
  const hangupRequestedRef = useRef<boolean>(false);

  const [callLog, setCallLog] = useState<CallLogItem[]>([]);
  const activeLogIdRef = useRef<string | null>(null);

  const micTestStreamRef = useRef<MediaStream | null>(null);
  const micTestCtxRef = useRef<AudioContext | null>(null);
  const micTestRafRef = useRef<number | null>(null);
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const uaRef = useRef<UserAgent | null>(null);
  const registererRef = useRef<Registerer | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const ringtoneCtxRef = useRef<AudioContext | null>(null);
  const ringtoneTimeoutRef = useRef<number | null>(null);
  const ringtoneNodesRef = useRef<{ oscs: OscillatorNode[]; gain: GainNode } | null>(null);
  const ringbackTimeoutRef = useRef<number | null>(null);
  const ringbackNodesRef = useRef<{ oscs: OscillatorNode[]; gain: GainNode } | null>(null);
  const callStateRef = useRef<CallStateUI>(callState);
  const ringtoneUnlockHandlerRef = useRef<((e: Event) => void) | null>(null);

  useEffect(() => {
    dndRef.current = dndEnabled;
    try {
      saveBool(DND_KEY, dndEnabled);
    } catch {
      // ignore
    }
  }, [dndEnabled]);

  useEffect(() => {
    try {
      saveBool(AUTO_CONNECT_KEY, autoConnect);
    } catch {
      // ignore
    }
  }, [autoConnect]);

  useEffect(() => {
    selectedSpeakerIdRef.current = selectedSpeakerId;
    selectedMicIdRef.current = selectedMicId;
    try {
      saveDevices({ micId: selectedMicId, speakerId: selectedSpeakerId });
    } catch {
      // ignore
    }
  }, [selectedMicId, selectedSpeakerId]);

  useEffect(() => {
    ringtoneVolumeRef.current = ringtoneVolume;
    try {
      saveVolumes({ ringtone: ringtoneVolume, call: callVolume });
    } catch {
      // ignore
    }
  }, [ringtoneVolume, callVolume]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  const refreshDevices = () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    void navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        setAudioInputs(devices.filter((d) => d.kind === 'audioinput'));
        setAudioOutputs(devices.filter((d) => d.kind === 'audiooutput'));
      })
      .catch(() => {
        // ignore
      });
  };

  useEffect(() => {
    refreshDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = remoteAudioRef.current;
    if (!el) return;
    el.volume = clamp01(callVolume);
  }, [callVolume]);

  const getAudioConstraints = () => {
    const micId = selectedMicIdRef.current.trim();
    if (!micId) return true;
    return { deviceId: { exact: micId } } as MediaTrackConstraints;
  };

  const applySpeakerSink = (el: HTMLMediaElement | null, sinkId: string) => {
    if (!el) return;
    const clean = sinkId.trim();
    if (!clean) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyEl: any = el as any;
    if (typeof anyEl.setSinkId !== 'function') return;
    void Promise.resolve()
      .then(() => anyEl.setSinkId(clean))
      .catch(() => {
        setError('Не удалось переключить динамик');
      });
  };

  useEffect(() => {
    if (!remoteAudioRef.current) return;
    applySpeakerSink(remoteAudioRef.current, selectedSpeakerIdRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSpeakerId]);

  const addLog = (item: CallLogItem) => {
    setCallLog((prev) => [item, ...prev].slice(0, 30));
  };

  const patchLog = (id: string, patch: Partial<CallLogItem>) => {
    setCallLog((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const finalizeActiveLog = (patch: Partial<CallLogItem>) => {
    const id = activeLogIdRef.current;
    if (!id) return;
    patchLog(id, patch);
  };

  const clearOutgoingTimeoutIfAny = () => {
    if (!outgoingTimeoutRef.current) return;
    window.clearTimeout(outgoingTimeoutRef.current);
    outgoingTimeoutRef.current = null;
  };

  const armOutgoingTimeout = () => {
    clearOutgoingTimeoutIfAny();
    outgoingTimeoutRef.current = window.setTimeout(() => {
      if (callStateRef.current !== 'outgoing') return;
      setError('Нет ответа');
      hangupRequestedRef.current = true;
      hangup();
    }, 45000);
  };

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

  const armRingtoneAudioUnlock = () => {
    if (ringtoneUnlockHandlerRef.current) return;

    const onGesture = () => {
      void ensureRingtoneContext().finally(() => {
        const ctx = ringtoneCtxRef.current;
        if (ctx?.state === 'running') {
          const handler = ringtoneUnlockHandlerRef.current;
          if (handler) {
            window.removeEventListener('pointerdown', handler);
            window.removeEventListener('keydown', handler);
          }
          ringtoneUnlockHandlerRef.current = null;
        }
      });
    };

    ringtoneUnlockHandlerRef.current = onGesture;
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
  };

  const stopRingtoneNodes = () => {
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

  const stopRingbackNodes = () => {
    const nodes = ringbackNodesRef.current;
    if (nodes) {
      ringbackNodesRef.current = null;
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

  const stopRingtone = () => {
    if (ringtoneTimeoutRef.current) {
      window.clearTimeout(ringtoneTimeoutRef.current);
      ringtoneTimeoutRef.current = null;
    }

    stopRingtoneNodes();
  };

  const stopRingback = () => {
    if (ringbackTimeoutRef.current) {
      window.clearTimeout(ringbackTimeoutRef.current);
      ringbackTimeoutRef.current = null;
    }
    stopRingbackNodes();
  };

  const scheduleRingbackOnce = () => {
    const ctx = ringtoneCtxRef.current;
    if (!ctx || ctx.state !== 'running') return;
    if (ringbackNodesRef.current) return;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(RINGBACK_FREQUENCY_HZ, ctx.currentTime);
    osc.connect(gain);

    const now = ctx.currentTime;
    const endAt = now + RINGBACK_ON_MS / 1000;
    const base = clamp01(ringtoneVolumeRef.current);
    const volume = clamp01(base * RINGBACK_VOLUME_MULTIPLIER);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.02);
    gain.gain.setValueAtTime(volume, Math.max(now, endAt - 0.03));
    gain.gain.linearRampToValueAtTime(0, endAt);

    osc.start(now);
    osc.stop(endAt + 0.05);

    ringbackNodesRef.current = { oscs: [osc], gain };
  };

  const scheduleRingtoneOnce = () => {
    const ctx = ringtoneCtxRef.current;
    if (!ctx || ctx.state !== 'running') return;
    if (ringtoneNodesRef.current) return;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.connect(gain);

    const now = ctx.currentTime;
    let t = now;
    const endAt = now + RINGTONE_ON_MS / 1000;
    const volume = clamp01(ringtoneVolumeRef.current);

    gain.gain.setValueAtTime(0, now);

    for (const [freq, ms] of RINGTONE_MELODY) {
      if (t >= endAt) break;
      const dur = Math.max(0, ms) / 1000;
      const nextT = Math.min(endAt, t + dur);
      if (freq > 0) {
        osc.frequency.setValueAtTime(freq, t);
        const attackEnd = Math.min(nextT, t + 0.01);
        const releaseStart = Math.max(t, nextT - 0.015);
        gain.gain.linearRampToValueAtTime(volume, attackEnd);
        gain.gain.setValueAtTime(volume, releaseStart);
        gain.gain.linearRampToValueAtTime(0, nextT);
      } else {
        gain.gain.setValueAtTime(0, t);
        gain.gain.setValueAtTime(0, nextT);
      }
      t = nextT;
    }

    gain.gain.setValueAtTime(0, endAt);

    osc.start(now);
    osc.stop(endAt + 0.05);

    ringtoneNodesRef.current = { oscs: [osc], gain };
  };

  const startRingtone = () => {
    // Запускаем только если реально входящий вызов
    if (callStateRef.current !== 'incoming') return;
    if (ringtoneTimeoutRef.current || ringtoneNodesRef.current) return;

    const playCycle = () => {
      if (callStateRef.current !== 'incoming') {
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

        scheduleRingtoneOnce();

        const cleanupAfterTone = () => {
          stopRingtone();
          // Пауза → следующий цикл
          if (callStateRef.current === 'incoming') {
            ringtoneTimeoutRef.current = window.setTimeout(playCycle, RINGTONE_OFF_MS);
          }
        };

        // гарантированная очистка после тона
        ringtoneTimeoutRef.current = window.setTimeout(cleanupAfterTone, RINGTONE_ON_MS + 200);
      });
    };

    playCycle();
  };

  const startRingback = () => {
    if (callStateRef.current !== 'outgoing') return;
    if (ringbackTimeoutRef.current || ringbackNodesRef.current) return;

    const playCycle = () => {
      if (callStateRef.current !== 'outgoing') {
        stopRingback();
        return;
      }

      void ensureRingtoneContext().finally(() => {
        const ctx = ringtoneCtxRef.current;
        if (!ctx || ctx.state !== 'running') {
          ringbackTimeoutRef.current = window.setTimeout(playCycle, 900);
          return;
        }

        scheduleRingbackOnce();

        ringbackTimeoutRef.current = window.setTimeout(() => {
          stopRingbackNodes();
          if (callStateRef.current === 'outgoing') {
            ringbackTimeoutRef.current = window.setTimeout(playCycle, RINGBACK_OFF_MS);
          }
        }, RINGBACK_ON_MS + 120);
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
  const statusLine =
    saveFeedback ||
    (callState !== 'idle' ? `${callText}${callPeer ? ` • ${callPeer}` : ''}` : registrationText);

  useEffect(() => {
    onStatusChange?.({
      registrationState,
      registrationText,
      callState,
      callText,
      callPeer,
      isMuted,
      isHeld,
      error,
    });
  }, [onStatusChange, registrationState, registrationText, callState, callText, callPeer, isMuted, isHeld, error]);

  useEffect(() => {
    if (defaultCallee && defaultCallee.trim() && callState === 'idle') {
      setCallee(normalizeDialInput(defaultCallee));
    }
  }, [defaultCallee, callState]);

  useEffect(() => {
    return () => {
      stopRingtone();
      const unlockHandler = ringtoneUnlockHandlerRef.current;
      if (unlockHandler) {
        window.removeEventListener('pointerdown', unlockHandler);
        window.removeEventListener('keydown', unlockHandler);
      }
      ringtoneUnlockHandlerRef.current = null;
      try {
        void ringtoneCtxRef.current?.close();
      } catch {
        // ignore
      }
      ringtoneCtxRef.current = null;

      clearOutgoingTimeoutIfAny();

      if (micTestRafRef.current) {
        cancelAnimationFrame(micTestRafRef.current);
        micTestRafRef.current = null;
      }
      try {
        micTestStreamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      micTestStreamRef.current = null;
      try {
        void micTestCtxRef.current?.close();
      } catch {
        // ignore
      }
      micTestCtxRef.current = null;

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
    // Разблокировка аудио: держим слушатели до реального `AudioContext.state === 'running'`.
    // Это устойчиво к React StrictMode (двойной маунт/анмаунт в dev).
    armRingtoneAudioUnlock();

    return () => {
      const handler = ringtoneUnlockHandlerRef.current;
      if (handler) {
        window.removeEventListener('pointerdown', handler);
        window.removeEventListener('keydown', handler);
      }
      ringtoneUnlockHandlerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (callState === 'incoming') {
      stopRingtone();
      startRingtone();
      return;
    }

    // при любом другом состоянии — останавливаем входящий рингтон
    stopRingtone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState]);

  useEffect(() => {
    if (callState === 'outgoing') {
      stopRingback();
      startRingback();
      return;
    }

    stopRingback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState]);

  useEffect(() => {
    if (callState !== 'outgoing') {
      clearOutgoingTimeoutIfAny();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState]);

  const cleanupCall = () => {
    sessionRef.current = null;
    setCallState('idle');
    setCallText('');
    setCallPeer('');
    setIsMuted(false);
    setIsHeld(false);
    remoteStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    stopRingtone();
    stopRingback();
  };

  const attachRemoteAudio = (session: Session) => {
    const el = remoteAudioRef.current;
    if (!el) return;

    el.volume = clamp01(callVolume);
    applySpeakerSink(el, selectedSpeakerIdRef.current);

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
          refreshDevices();

          const peer = invitation.remoteIdentity.uri?.toString?.() ?? 'Неизвестно';
          const logId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          activeLogIdRef.current = logId;

          if (dndRef.current) {
            addLog({
              id: logId,
              direction: 'incoming',
              peer,
              startedAt: Date.now(),
              endedAt: Date.now(),
              result: 'rejected',
              durationSec: 0,
            });
            try {
              void invitation.reject();
            } catch {
              // ignore
            }
            return;
          }

          if (sessionRef.current && sessionRef.current !== invitation) {
            try {
              void invitation.reject();
            } catch {
              // ignore
            }
            return;
          }

          addLog({
            id: logId,
            direction: 'incoming',
            peer,
            startedAt: Date.now(),
            result: 'ringing',
          });

          sessionRef.current = invitation;
          setIsMuted(false);
          setIsHeld(false);
          setCallState('incoming');
          setCallText('Входящий звонок');
          setCallPeer(peerFromUri(invitation.remoteIdentity.uri));

          invitation.stateChange.addListener((state) => {
            if (state === SessionState.Establishing) setCallText('Соединение…');
            if (state === SessionState.Established) {
              setCallState('in-call');
              setCallText('Разговор');
              stopRingtone();
              finalizeActiveLog({ establishedAt: Date.now(), result: 'in-call' });
              attachRemoteAudio(invitation);
            }
            if (state === SessionState.Terminated) {
              setCallState('ended');
              setCallText('Завершено');
              stopRingtone();
              const endedAt = Date.now();
              const id = activeLogIdRef.current;
              if (id) {
                setCallLog((prev) =>
                  prev.map((i) => {
                    if (i.id !== id) return i;
                    if (i.result === 'rejected') return { ...i, endedAt, durationSec: 0 };
                    const establishedAt = i.establishedAt;
                    const durationSec = establishedAt ? Math.max(0, (endedAt - establishedAt) / 1000) : 0;
                    const result: CallLogResult = establishedAt ? 'completed' : 'missed';
                    return { ...i, endedAt, durationSec, result };
                  })
                );
              }
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
    const value = normalizeDialInput(raw);
    if (!value) return '';
    if (/^sip:/i.test(value)) return value;
    const prefix = SIP_URI_PREFIX.endsWith(':') ? SIP_URI_PREFIX : `${SIP_URI_PREFIX}:`;
    return `${prefix}${value}@${SIP_DOMAIN}`;
  };

  const peerFromUri = (uri: URI | undefined | null) => {
    const user = uri?.user;
    if (typeof user === 'string' && user.trim()) return user.trim();
    const s = uri?.toString?.() ?? '';
    if (!s) return '';
    const m = s.match(/^sip:([^@;>]+)@/i);
    if (m?.[1]) return m[1];
    return s;
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
      sessionDescriptionHandlerOptions: { constraints: { audio: getAudioConstraints(), video: false } },
    });

    sessionRef.current = inviter;
    hangupRequestedRef.current = false;
    setCallState('outgoing');
    setCallText('Исходящий звонок…');
    setCallPeer(peerFromUri(targetUri));
    setIsMuted(false);
    setIsHeld(false);

    refreshDevices();
    const logId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    activeLogIdRef.current = logId;
    addLog({
      id: logId,
      direction: 'outgoing',
      peer: target,
      startedAt: Date.now(),
      result: 'ringing',
    });

    armOutgoingTimeout();

    inviter.stateChange.addListener((state) => {
      if (state === SessionState.Establishing) setCallText('Соединение…');
      if (state === SessionState.Established) {
        setCallState('in-call');
        setCallText('Разговор');
        finalizeActiveLog({ establishedAt: Date.now(), result: 'in-call' });
        clearOutgoingTimeoutIfAny();
        attachRemoteAudio(inviter);
      }
      if (state === SessionState.Terminated) {
        setCallState('ended');
        setCallText('Завершено');
        clearOutgoingTimeoutIfAny();
        const endedAt = Date.now();
        const id = activeLogIdRef.current;
        if (id) {
          setCallLog((prev) =>
            prev.map((i) => {
              if (i.id !== id) return i;
              const establishedAt = i.establishedAt;
              const durationSec = establishedAt ? Math.max(0, (endedAt - establishedAt) / 1000) : 0;
              const result: CallLogResult = establishedAt
                ? 'completed'
                : hangupRequestedRef.current
                  ? 'canceled'
                  : 'failed';
              return { ...i, endedAt, durationSec, result };
            })
          );
        }
        window.setTimeout(() => cleanupCall(), 400);
      }
    });

    void inviter.invite().catch((e) => {
      setCallState('ended');
      setCallText('Не удалось');
      setError(e instanceof Error ? e.message : 'Звонок не удался');
      clearOutgoingTimeoutIfAny();
      finalizeActiveLog({ endedAt: Date.now(), result: 'failed', durationSec: 0 });
      window.setTimeout(() => cleanupCall(), 600);
    });
  };

  const hangup = () => {
    setError('');
    const session = sessionRef.current;
    if (!session) return;

    hangupRequestedRef.current = true;

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
      .accept({ sessionDescriptionHandlerOptions: { constraints: { audio: getAudioConstraints(), video: false } } })
      .then(() => attachRemoteAudio(invitation))
      .catch((e) => setError(e instanceof Error ? e.message : 'Не удалось принять звонок'));
  };

  const reject = () => {
    setError('');
    const session = sessionRef.current;
    if (!session) return;
    try {
      void (session as Invitation).reject();
      finalizeActiveLog({ endedAt: Date.now(), result: 'rejected', durationSec: 0 });
    } catch {
      // ignore
    }
  };

  const sendDtmf = (tone: string) => {
    setError('');
    if (callState !== 'in-call') return;
    const pc = getPeerConnection(sessionRef.current);
    if (!pc) {
      setError('Нет WebRTC соединения');
      return;
    }
    const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
    const dtmf = sender?.dtmf;
    if (!dtmf) {
      setError('DTMF не поддерживается');
      return;
    }
    try {
      dtmf.insertDTMF(tone, 160, 70);
    } catch {
      setError('Не удалось отправить DTMF');
    }
  };

  useEffect(() => {
    if (!autoConnect) return;
    if (uaRef.current) return;
    if (registrationState === 'connecting' || registrationState === 'registered') return;
    if (!canConnect) return;
    const t = window.setTimeout(() => connect(), 50);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, canConnect]);

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

  const startMicTest = () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('getUserMedia не поддерживается');
      return;
    }

    setIsMicTesting(true);
    refreshDevices();

    const constraints: MediaStreamConstraints = {
      audio: getAudioConstraints(),
      video: false,
    };

    void navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        micTestStreamRef.current = stream;

        const Ctx =
          window.AudioContext ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((window as any).webkitAudioContext as typeof window.AudioContext | undefined);
        if (!Ctx) {
          setError('AudioContext не поддерживается');
          return;
        }

        const ctx = new Ctx();
        micTestCtxRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const data = new Uint8Array(analyser.fftSize);

        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          setMicLevel(rms);
          micTestRafRef.current = requestAnimationFrame(tick);
        };

        tick();
      })
      .catch((e) => {
        setIsMicTesting(false);
        setError(e instanceof Error ? e.message : 'Не удалось открыть микрофон');
      });
  };

  const stopMicTest = () => {
    setIsMicTesting(false);
    setMicLevel(0);
    if (micTestRafRef.current) {
      cancelAnimationFrame(micTestRafRef.current);
      micTestRafRef.current = null;
    }
    try {
      micTestStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }
    micTestStreamRef.current = null;
    try {
      void micTestCtxRef.current?.close();
    } catch {
      // ignore
    }
    micTestCtxRef.current = null;
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

        <div className={styles.toggleRow}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={autoConnect}
              onChange={(e) => setAutoConnect(e.target.checked)}
            />
            <span>Автоподключение</span>
          </label>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={dndEnabled}
              onChange={(e) => setDndEnabled(e.target.checked)}
            />
            <span>Не беспокоить</span>
          </label>
        </div>

        <div className={styles.row2}>
          <div className={styles.rangeBlock}>
            <div className={styles.rangeHeader}>
              <span className={styles.rangeLabel}>Рингтон</span>
              <span className={styles.rangeValue}>{Math.round(clamp01(ringtoneVolume) * 100)}%</span>
            </div>
            <input
              className={styles.rangeInput}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={ringtoneVolume}
              onChange={(e) => setRingtoneVolume(Number(e.target.value))}
              aria-label="Громкость рингтона"
            />
          </div>

          <div className={styles.rangeBlock}>
            <div className={styles.rangeHeader}>
              <span className={styles.rangeLabel}>Разговор</span>
              <span className={styles.rangeValue}>{Math.round(clamp01(callVolume) * 100)}%</span>
            </div>
            <input
              className={styles.rangeInput}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={callVolume}
              onChange={(e) => setCallVolume(Number(e.target.value))}
              aria-label="Громкость разговора"
            />
          </div>
        </div>

        <div className={styles.row2}>
          <div className={styles.selectBlock}>
            <label className={styles.selectLabel} htmlFor="webrtc-mic">Микрофон</label>
            <select
              id="webrtc-mic"
              className={styles.select}
              value={selectedMicId}
              onChange={(e) => setSelectedMicId(e.target.value)}
            >
              <option value="">По умолчанию</option>
              {audioInputs.map((d, idx) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Микрофон ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.selectBlock}>
            <label className={styles.selectLabel} htmlFor="webrtc-spk">Динамик</label>
            <select
              id="webrtc-spk"
              className={styles.select}
              value={selectedSpeakerId}
              onChange={(e) => setSelectedSpeakerId(e.target.value)}
            >
              <option value="">По умолчанию</option>
              {audioOutputs.map((d, idx) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Динамик ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.row2}>
          {isMicTesting ? (
            <Button onClick={stopMicTest} variant="secondary">
              Остановить микрофон
            </Button>
          ) : (
            <Button onClick={startMicTest} variant="secondary">
              Проверить микрофон
            </Button>
          )}
          <div className={styles.micMeter} aria-label="Уровень микрофона">
            <div
              className={styles.micMeterBar}
              style={{ width: `${Math.min(100, Math.round(micLevel * 220))}%` }}
            />
          </div>
        </div>

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
            onChange={(e) => setCallee(normalizeDialInput(e.target.value))}
            placeholder="Номер или sip:user@domain"
            aria-label="Кому звонить"
          />
          <span className={styles.badge}>Аудио</span>
        </div>

        <div className={styles.hint}>WebSocket: {WS_SERVER_URL} · Домен: {SIP_DOMAIN}</div>
        {!canConnect && connectBlockedReason ? <div className={styles.hint}>Подключение недоступно: {connectBlockedReason}</div> : null}

        {callState === 'in-call' ? (
          <div className={styles.dtmfSection} aria-label="DTMF">
            <div className={styles.sectionTitle}>DTMF</div>
            <div className={styles.dtmfGrid}>
              {['1','2','3','4','5','6','7','8','9','*','0','#'].map((t) => (
                <Button key={t} size="small" variant="secondary" onClick={() => sendDtmf(t)}>
                  {t}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <div className={styles.section} aria-label="История звонков">
          <div className={styles.sectionTitle}>История</div>
          {callLog.length === 0 ? (
            <div className={styles.hint}>Пока нет звонков</div>
          ) : (
            <div className={styles.callLogList}>
              {callLog.slice(0, 10).map((i) => (
                <div key={i.id} className={styles.callLogItem}>
                  <span className={styles.callLogMeta}>
                    {i.direction === 'incoming' ? 'Вх' : 'Исх'} · {formatShortTime(i.startedAt)}
                  </span>
                  <span className={styles.callLogPeer}>{i.peer}</span>
                  <span className={styles.callLogResult}>
                    {i.result === 'in-call'
                      ? 'Разговор'
                      : i.result === 'ringing'
                        ? 'Звонит'
                        : i.result === 'completed'
                          ? `Ок${typeof i.durationSec === 'number' ? ` · ${formatDuration(i.durationSec)}` : ''}`
                          : i.result === 'missed'
                            ? 'Пропущен'
                            : i.result === 'rejected'
                              ? 'Отклонен'
                              : i.result === 'canceled'
                                ? 'Отменен'
                                : 'Ошибка'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.section} aria-label="Состояние">
          <div className={styles.sectionTitle}>Состояние</div>
          <div className={styles.diagLine}>Регистрация: {registrationState}</div>
          <div className={styles.diagLine}>Звонок: {callState}</div>
          <div className={styles.diagLine}>DND: {dndEnabled ? 'вкл' : 'выкл'} · Авто: {autoConnect ? 'вкл' : 'выкл'}</div>
          <div className={styles.diagLine}>AudioContext: {ringtoneCtxRef.current?.state ?? 'n/a'}</div>
          <div className={styles.diagLine}>SinkId: {typeof (remoteAudioRef.current as any)?.setSinkId === 'function' ? 'да' : 'нет'}</div>
        </div>
      </div>
    </div>
  );
}
