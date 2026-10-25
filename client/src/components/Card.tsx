// Carte numérotée (1 à 10), avec dos « viseur » et retournement animé.
import { cls } from '../lib/util';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

interface Props {
  value?: number | null;
  size?: CardSize;
  faceDown?: boolean;
  empty?: boolean;
  highlight?: boolean;
  dim?: boolean;
  delay?: number;
  className?: string;
}

export function Card({ value, size = 'md', faceDown, empty, highlight, dim, delay = 0, className }: Props) {
  if (empty) return <div className={cls('card', `card-${size}`, 'card-empty', className)} />;
  const showFace = !faceDown && value != null;
  return (
    <div
      className={cls('card', `card-${size}`, showFace && 'is-up', highlight && 'is-hl', dim && 'is-dim', className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="card-inner">
        <div className="card-face card-front" data-v={value ?? undefined}>
          {value != null && (
            <>
              <span className="card-corner tl">{value}</span>
              <span className="card-num">{value}</span>
              <span className="card-pips">
                {Array.from({ length: value }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
              <span className="card-corner br">{value}</span>
            </>
          )}
        </div>
        <div className="card-face card-back">
          <svg viewBox="0 0 40 40" className="card-back-mark" aria-hidden>
            <circle cx="20" cy="20" r="11" />
            <circle cx="20" cy="20" r="3" />
            <path d="M20 4v8M20 28v8M4 20h8M28 20h8" />
          </svg>
        </div>
      </div>
    </div>
  );
}

export function CardRow({ values, size = 'sm', gap }: { values: number[]; size?: CardSize; gap?: number }) {
  return (
    <div className="card-row" style={gap != null ? { gap } : undefined}>
      {values.map((v, i) => (
        <Card key={i} value={v} size={size} />
      ))}
    </div>
  );
}
