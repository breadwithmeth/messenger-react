import { CSSProperties } from 'react';

type IconName =
  | 'upload'
  | 'bell'
  | 'back'
  | 'video'
  | 'gear'
  | 'question'
  | 'dashboard'
  | 'chat'
  | 'ticket'
  | 'automation'
  | 'api'
  | 'send'
  | 'mic'
  | 'plus';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

const common = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function Icon({ name, size = 20, color = 'currentColor', className, style, title }: IconProps) {
  const props = {
    ...common,
    width: size,
    height: size,
    className,
    style: { color, ...style },
  };

  switch (name) {
    case 'upload':
      return (
        <svg {...props} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="M12 16V3" />
          <path d="M7 8l5-5 5 5" />
          <path d="M20 21H4" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...props} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
      );
    case 'back':
      return (
        <svg {...props} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="M15 18l-6-6 6-6" />
        </svg>
      );
    case 'video':
      return (
        <svg {...props} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <rect x="3" y="7" width="13" height="10" rx="2" />
          <path d="M16 10l5-3v10l-5-3" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...props} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case 'mic':
      return (
        <svg {...props} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="M12 14a3 3 0 003-3V7a3 3 0 10-6 0v4a3 3 0 003 3z" />
          <path d="M19 11a7 7 0 01-14 0" />
          <path d="M12 19v2" />
          <path d="M8 21h8" />
        </svg>
      );
    case 'send':
      return (
        <svg {...props} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="M22 2L11 13" />
          <path d="M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      );
    case 'chat':
      return (
        <svg {...props} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z" />
        </svg>
      );
    case 'dashboard':
      return (
        <svg {...props} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case 'ticket':
      return (
        <svg {...props} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="M3 9a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 010 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 010-4V9z" />
          <path d="M13 7v10" />
        </svg>
      );
    case 'automation':
      return (
        <svg {...props} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="M12 8V4" />
          <path d="M12 20v-4" />
          <path d="M4 12h4" />
          <path d="M20 12h-4" />
          <path d="M7 7l2.5 2.5" />
          <path d="M17 17l-2.5-2.5" />
          <path d="M17 7l-2.5 2.5" />
          <path d="M7 17l2.5-2.5" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'api':
      return (
        <svg {...props} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="M8 7h8" />
          <path d="M8 17h8" />
          <path d="M7 11l-2 1 2 1" />
          <path d="M17 11l2 1-2 1" />
          <rect x="3" y="4" width="18" height="16" rx="2" />
        </svg>
      );
    case 'gear':
      return (
        <svg {...props} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" />
          <path d="M19.4 15a1.9 1.9 0 00.4 2.1l.1.1-1.6 2.8-.2-.1a2 2 0 00-2.2.2l-.2.2-2.2-1.3-.1-.3a2 2 0 00-3.8 0l-.1.3-2.2 1.3-.2-.2a2 2 0 00-2.2-.2l-.2.1-1.6-2.8.1-.1A1.9 1.9 0 005 15l-.3-.1v-2l.3-.1a1.9 1.9 0 000-2.1l-.1-.1L6.5 7.8l.2.1a2 2 0 002.2-.2l.2-.2 2.2 1.3.1.3a2 2 0 003.8 0l.1-.3 2.2-1.3.2.2a2 2 0 002.2.2l.2-.1 1.6 2.8-.1.1a1.9 1.9 0 00-.4 2.1l.3.1v2l-.3.1z" />
        </svg>
      );
    case 'question':
      return (
        <svg {...props} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 015 0c0 2-2.5 2-2.5 4" />
          <path d="M12 17h.01" />
        </svg>
      );
    default:
      return null;
  }
}
