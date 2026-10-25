// Briques d'interface partagées : boutons, jetons, fenêtres, logo.
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { cls } from '../lib/util';

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={cls('logo', `logo-${size}`)}>
      <Crosshair className="logo-mark" />
      <span className="logo-text">
        HOLD'EM <b>SNIPER</b>
      </span>
    </div>
  );
}

export function Crosshair({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cls('crosshair', className)} aria-hidden>
      <circle cx="24" cy="24" r="15" />
      <circle cx="24" cy="24" r="2.6" className="dot" />
      <path d="M24 3v11M24 34v11M3 24h11M34 24h11" />
    </svg>
  );
}

export function ChipIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cls('chip-icon', className)} aria-hidden>
      <circle cx="12" cy="12" r="10" className="chip-outer" />
      <circle cx="12" cy="12" r="6.2" className="chip-inner" />
      <path d="M12 2v3.2M12 18.8V22M2 12h3.2M18.8 12H22M4.9 4.9l2.3 2.3M16.8 16.8l2.3 2.3M4.9 19.1l2.3-2.3M16.8 7.2l2.3-2.3" className="chip-notch" />
    </svg>
  );
}

export function Chips({ n, className, big }: { n: number; className?: string; big?: boolean }) {
  return (
    <span className={cls('chips', big && 'chips-big', className)}>
      <ChipIcon />
      <span>{n}</span>
    </span>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
export function Button({
  variant = 'secondary',
  className,
  children,
  icon,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; icon?: ReactNode }) {
  return (
    <button type="button" className={cls('btn', `btn-${variant}`, className)} {...rest}>
      {icon}
      {children != null && <span>{children}</span>}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  className,
  dismissable = true,
}: {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  className?: string;
  dismissable?: boolean;
}) {
  useEffect(() => {
    if (!open || !dismissable) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, dismissable]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (dismissable && e.target === e.currentTarget) onClose?.();
          }}
        >
          <motion.div
            className={cls('modal', wide && 'modal-wide', className)}
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            role="dialog"
            aria-modal="true"
          >
            {(title || (dismissable && onClose)) && (
              <div className="modal-head">
                <div className="modal-title">{title}</div>
                {dismissable && onClose && (
                  <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
                    <X size={20} />
                  </button>
                )}
              </div>
            )}
            <div className="modal-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Pill({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'red' | 'gold' | 'green' | 'blue'; className?: string }) {
  return <span className={cls('pill', `pill-${tone}`, className)}>{children}</span>;
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: ReactNode; sub?: ReactNode }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cls('segmented', disabled && 'is-disabled')}>
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          className={cls('seg', o.value === value && 'is-on')}
          onClick={() => !disabled && onChange(o.value)}
          disabled={disabled}
        >
          <span className="seg-label">{o.label}</span>
          {o.sub && <span className="seg-sub">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, max, tone = 'gold' }: { value: number; max: number; tone?: 'gold' | 'green' | 'red' }) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return (
    <div className={cls('progress', `progress-${tone}`)}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
