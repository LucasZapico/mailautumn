import type { EmailType } from '../data/types';

const chipConfig: Record<string, { label: string; classes: string }> = {
  newsletter:     { label: 'Newsletter', classes: 'bg-blue/15 text-blue' },
  notification:   { label: 'Update',     classes: 'bg-purple/15 text-purple' },
  marketing:      { label: 'Promo',      classes: 'bg-orange/15 text-orange' },
  transactional:  { label: 'Receipt',    classes: 'bg-green/15 text-green' },
  calendar:       { label: 'Calendar',   classes: 'bg-yellow/15 text-yellow' },
};

export default function TypeChip({ type }: { type: EmailType }) {
  const config = chipConfig[type];
  if (!config) return null;

  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-2xs font-medium shrink-0 ${config.classes}`}>
      {config.label}
    </span>
  );
}
