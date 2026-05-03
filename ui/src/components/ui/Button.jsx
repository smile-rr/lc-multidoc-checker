import React from 'react';

// Border-radius rule: 6 = inline button, 8 = primary CTA, 10 = card.
const BASE = 'inline-flex items-center gap-1.5 font-medium transition-colors disabled:cursor-not-allowed';

const SIZE = {
  sm: 'text-[11px] px-2.5 py-1 rounded-[6px]',
  md: 'text-[12px] px-3 py-1.5 rounded-[8px]',
  lg: 'text-[13px] px-4 py-2 rounded-[8px]',
};

const TONES = {
  primary: 'bg-navy-1 text-white hover:bg-navy-2 disabled:bg-line disabled:text-muted',
  teal:    'bg-teal-1 text-white hover:bg-teal-2 disabled:bg-line disabled:text-muted',
  danger:  'bg-status-red text-white hover:bg-status-red/80 disabled:bg-line disabled:text-muted',
  dev:     'bg-status-gold text-white hover:bg-status-gold/80 disabled:opacity-40',
};

/** Solid CTA button. tone: primary | teal | danger | dev. */
export function PrimaryButton({ tone = 'primary', size = 'md', className = '', children, ...rest }) {
  return (
    <button className={`${BASE} ${SIZE[size]} ${TONES[tone]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** Bordered button. */
export function SecondaryButton({ size = 'md', className = '', children, ...rest }) {
  return (
    <button
      className={`${BASE} ${SIZE[size]} bg-white border border-line text-navy-1 hover:bg-slate2 disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Quiet text-only button. */
export function GhostButton({ size = 'sm', className = '', children, ...rest }) {
  return (
    <button
      className={`${BASE} ${SIZE[size]} text-muted hover:text-navy-1 hover:bg-slate2 disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Gold ⚡ DEV-mode shortcut. */
export function DevShortcutButton({ size = 'sm', className = '', children, ...rest }) {
  return (
    <PrimaryButton tone="dev" size={size} className={className} {...rest}>
      {children}
    </PrimaryButton>
  );
}
