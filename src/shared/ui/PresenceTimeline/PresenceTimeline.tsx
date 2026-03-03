import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Scatter,
  Tooltip,
  ReferenceArea,
} from 'recharts';

// Types for incoming API data
export type Message = {
  timestamp: string;
  type: 'inbound' | 'outbound';
};

export type PresenceStatus = 'ONLINE' | 'OFFLINE' | 'AWAY' | 'BUSY' | 'IDLE';

export type PresenceItem = {
  status: PresenceStatus;
  changedAt: string;
  messages: Message[];
};

export type PresenceResponse = {
  range: { from: string; to: string };
  presenceHistory: PresenceItem[];
  messages?: Message[] | { recent: Message[] };
};

// Internal view models
type Interval = {
  start: number;
  end: number;
  status: PresenceStatus;
  messageCount: number;
  midpoint: number;
};

type IntervalPoint = {
  x: number;
  y: number;
  start: number;
  end: number;
  status: PresenceStatus;
  messageCount: number;
};

type MessagePoint = {
  x: number;
  y: number;
  type: Message['type'];
};

const STATUS_COLORS: Record<PresenceStatus, string> = {
  ONLINE: '#22c55e',
  BUSY: '#ef4444',
  AWAY: '#fbbf24',
  IDLE: '#8b5cf6',
  OFFLINE: '#cbd5e1',
};

const INBOUND_COLOR = '#2563eb';
const OUTBOUND_COLOR = '#f97316';

const STATUS_LABEL: Record<PresenceStatus, string> = {
  ONLINE: 'Online',
  BUSY: 'Busy',
  AWAY: 'Away',
  IDLE: 'Idle',
  OFFLINE: 'Offline',
};

const tooltipStyle: React.CSSProperties = {
  padding: '8px 10px',
  background: '#0f172a',
  color: '#e2e8f0',
  borderRadius: 8,
  boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
  fontSize: 12,
  lineHeight: 1.4,
};

const tooltipTitle: React.CSSProperties = {
  fontWeight: 700,
  marginBottom: 4,
};

const formatTime = (ts: number) =>
  new Date(ts).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const formatDurationMinutes = (start: number, end: number) => {
  const mins = Math.max(0, Math.round((end - start) / 60000));
  return `${mins} мин`;
};

const toTimestamp = (value?: string) => {
  const ts = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ts) ? ts : undefined;
};

const buildIntervals = (data: PresenceResponse): Interval[] => {
  const items = (data.presenceHistory || []).filter((i) => i && i.changedAt);
  if (!items.length) return [];

  const deduped: PresenceItem[] = [];
  for (const item of items) {
    if (!deduped.length || deduped[deduped.length - 1].status !== item.status) {
      deduped.push(item);
    }
  }

  const rangeEnd = toTimestamp(data.range.to) ?? Date.now();

  return deduped.map((item, idx) => {
    const start = toTimestamp(item.changedAt) ?? rangeEnd;
    const next = deduped[idx + 1];
    const end = next ? toTimestamp(next.changedAt) ?? rangeEnd : rangeEnd;
    const count = item.messages?.length ?? 0;
    return {
      start,
      end,
      status: item.status,
      messageCount: count,
      midpoint: start + Math.max(0, end - start) / 2,
    };
  });
};

const buildMessagePoints = (data: PresenceResponse): MessagePoint[] => {
  const points: MessagePoint[] = [];

  for (const item of data.presenceHistory || []) {
    for (const msg of item.messages || []) {
      const ts = new Date(msg.timestamp).getTime();
      const type = msg.type === 'outbound' ? 'outbound' : 'inbound';
      points.push({ x: ts, y: 2, type });
    }
  }

  const topLevelMessages = Array.isArray(data.messages)
    ? data.messages
    : Array.isArray((data.messages as { recent?: Message[] } | undefined)?.recent)
      ? ((data.messages as { recent: Message[] }).recent || [])
      : [];

  for (const msg of topLevelMessages) {
    const ts = new Date(msg.timestamp).getTime();
    const type = msg.type === 'outbound' ? 'outbound' : 'inbound';
    points.push({ x: ts, y: 2, type });
  }

  return points;
};

const MessageMarker: React.FC<Record<string, unknown>> = (rawProps) => {
  const { cx, cy, payload } = rawProps as { cx?: number; cy?: number; payload?: MessagePoint };
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) return null;
  const color = payload.type === 'inbound' ? INBOUND_COLOR : OUTBOUND_COLOR;
  return (
    <g>
      <line x1={cx} x2={cx} y1={cy - 16} y2={cy + 16} stroke={color} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={4} fill={color} stroke="#fff" strokeWidth={1.5} />
    </g>
  );
};

const InvisibleShape: React.FC<Record<string, unknown>> = () => <></>;

const TooltipContent: React.FC<{ active?: boolean; payload?: any[] }> = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload as IntervalPoint | MessagePoint | undefined;
  if (!p) return null;

  if ('start' in p && 'end' in p) {
    return (
      <div style={tooltipStyle}>
        <div style={tooltipTitle}>{STATUS_LABEL[p.status as PresenceStatus] ?? 'Status'}</div>
        <div>Начало: {formatTime(p.start)}</div>
        <div>Конец: {formatTime(p.end)}</div>
        <div>Длительность: {formatDurationMinutes(p.start, p.end)}</div>
        <div>Сообщений: {p.messageCount}</div>
      </div>
    );
  }

  if ('type' in p) {
    return (
      <div style={tooltipStyle}>
        <div style={tooltipTitle}>{p.type === 'inbound' ? 'Входящее' : 'Исходящее'}</div>
        <div>{formatTime(p.x)}</div>
      </div>
    );
  }

  return null;
};

export type PresenceTimelineProps = {
  data: PresenceResponse;
};

export default function PresenceTimeline({ data }: PresenceTimelineProps) {
  const intervals = useMemo(() => buildIntervals(data), [data]);
  const messagePoints = useMemo(() => buildMessagePoints(data), [data]);

  const intervalPoints: IntervalPoint[] = useMemo(
    () =>
      intervals.map((i) => ({
        x: i.midpoint,
        y: 4,
        start: i.start,
        end: i.end,
        status: i.status,
        messageCount: i.messageCount,
      })),
    [intervals],
  );

  const domainFrom = useMemo(() => new Date(data.range.from).getTime(), [data.range.from]);
  const domainTo = useMemo(() => new Date(data.range.to).getTime(), [data.range.to]);

  const chartData = useMemo(() => {
    if (messagePoints.length) return messagePoints;
    if (intervalPoints.length) return intervalPoints;
    return [{ x: domainFrom, y: 0 }];
  }, [domainFrom, intervalPoints, messagePoints]);

  return (
    <div style={{ width: '100%', height: 160 }}>
      <ResponsiveContainer>
        <ComposedChart data={chartData} margin={{ top: 12, right: 16, bottom: 12, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[domainFrom, domainTo]}
            tickFormatter={(v) => formatTime(Number(v))}
            tick={{ fontSize: 11, fill: '#475569' }}
            axisLine={{ stroke: '#cbd5e1' }}
            tickLine={{ stroke: '#cbd5e1' }}
          />
          <YAxis type="number" dataKey="y" domain={[0, 10]} hide />
          {intervals.map((interval) => (
            <ReferenceArea
              key={`${interval.start}-${interval.end}-${interval.status}`}
              x1={interval.start}
              x2={interval.end}
              y1={3}
              y2={5}
              strokeOpacity={0}
              fill={STATUS_COLORS[interval.status] ?? STATUS_COLORS.OFFLINE}
              fillOpacity={0.3}
            />
          ))}

          <Scatter data={intervalPoints} shape={<InvisibleShape />} isAnimationActive={false} />
          <Scatter data={messagePoints} shape={<MessageMarker />} isAnimationActive={false} name="messages" />

          <Tooltip content={<TooltipContent />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
