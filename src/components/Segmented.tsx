import { motion } from 'framer-motion';
import { useId, type ReactNode } from 'react';

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

interface Props<T extends string> {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}

/** Tab / segment control with a shared-layout sliding indicator. */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: Props<T>) {
  const id = useId();
  return (
    <div className="seg" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className="seg__item"
          onClick={() => onChange(o.value)}
        >
          {o.value === value && (
            <motion.span layoutId={`seg-${id}`} className="seg__pill" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />
          )}
          <span className="seg__label">
            {o.label}
            {o.count ? <span className="seg__count">{o.count}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}
