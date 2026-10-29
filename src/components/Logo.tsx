// SPDX-License-Identifier: Apache-2.0

export function LogoIcon({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="oc_nexus_ring" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="50%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
        <linearGradient id="oc_nexus_core" x1="20" y1="16" x2="44" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
        <filter id="oc_nexus_glow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#2563EB" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Outer Open Civic Ring (Stylized 'O' and 'C') */}
      <circle
        cx="32"
        cy="32"
        r="24"
        stroke="url(#oc_nexus_ring)"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeDasharray="125 25"
        transform="rotate(-30 32 32)"
        filter="url(#oc_nexus_glow)"
      />

      {/* Inner Civic Gateway Tower */}
      <path
        d="M32 17L41 26V43C41 44.1 40.1 45 39 45H25C23.9 45 23 44.1 23 43V26L32 17Z"
        fill="url(#oc_nexus_core)"
      />

      {/* Gateway Portal Opening Arch */}
      <path
        d="M28 45V34C28 31.8 29.8 30 32 30C34.2 30 36 31.8 36 34V45"
        fill="#0B132B"
        opacity="0.95"
      />

      {/* Real-time Civic Pulse Indicator */}
      <circle cx="32" cy="24" r="2.5" fill="#34D399" />
    </svg>
  );
}

export function Logo({
  size = 36,
  showSubtitle = true,
  variant = 'default',
}: {
  size?: number;
  showSubtitle?: boolean;
  variant?: 'default' | 'light' | 'white';
}) {
  const isWhite = variant === 'white';
  const mainColor = isWhite ? '#FFFFFF' : '#0F172A';
  const subtitleColor = isWhite ? '#94A3B8' : '#64748B';

  return (
    <div className="logo-lockup">
      <LogoIcon size={size} />
      <div className="logo-lockup__text">
        <span
          className="logo-lockup__title"
          style={{ fontSize: `${size * 0.58}px`, color: mainColor }}
        >
          Open<span className="logo-lockup__accent">City</span>
        </span>
        {showSubtitle && (
          <span
            className="logo-lockup__subtitle"
            style={{ fontSize: `${Math.max(9, size * 0.26)}px`, color: subtitleColor }}
          >
            Cổng Dịch Vụ Đô Thị Số
          </span>
        )}
      </div>
    </div>
  );
}

export function LogoVertical({ size = 56 }: { size?: number }) {
  return (
    <div className="logo-vertical">
      <LogoIcon size={size} />
      <div>
        <span className="logo-vertical__title">
          Open<span className="logo-lockup__accent">City</span>
        </span>
        <span className="logo-vertical__subtitle">
          Nền Tảng Đô Thị Mở DX-OS
        </span>
      </div>
    </div>
  );
}
