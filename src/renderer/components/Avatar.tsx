import BoringAvatar from 'boring-avatars';
import { useAtomValue } from 'jotai';
import { avatarStyleAtom } from '../atoms/app';
import type { Contact } from '../data/types';

const palette = ['#4a9eff', '#4caf50', '#ff8c42', '#9c7cff', '#f06292', '#26a69a', '#ffb300'];

function hashColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = ((hash << 5) - hash + email.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

/** Generate a monochrome palette from the CSS accent color */
function getMonoPalette(): string[] {
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#dc4c3e';
  // Parse hex
  const r = parseInt(accent.slice(1, 3), 16);
  const g = parseInt(accent.slice(3, 5), 16);
  const b = parseInt(accent.slice(5, 7), 16);
  // Generate 5 shades from dark to light
  return [0.3, 0.5, 0.7, 0.85, 1.0].map(mult => {
    const mr = Math.round(r * mult);
    const mg = Math.round(g * mult);
    const mb = Math.round(b * mult);
    return `rgb(${mr},${mg},${mb})`;
  });
}

/** Map our style names to boring-avatars variant names */
const boringVariantMap: Record<string, 'marble' | 'beam' | 'pixel' | 'ring'> = {
  marble: 'marble',
  beam: 'beam',
  pixel: 'pixel',
  ring: 'ring',
  mono: 'marble',
};

function InitialsAvatar({ contact, size, className }: { contact: Contact; size: number; className: string }) {
  const initials = (contact.name || contact.email || '?')
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const bg = hashColor(contact.email);

  return (
    <div
      className={`avatar-color rounded-full flex items-center justify-center font-semibold text-white shrink-0 ${className}`}
      style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

export default function Avatar({ contact, size = 36, className = '' }: { contact: Contact; size?: number; className?: string }) {
  const style = useAtomValue(avatarStyleAtom);

  // Real avatar image takes priority
  if (contact.avatar) {
    return (
      <img
        src={contact.avatar}
        alt={contact.name}
        className={`rounded-full shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // Initials fallback
  if (style === 'initials') {
    return <InitialsAvatar contact={contact} size={size} className={className} />;
  }

  // Boring Avatars (colorful or mono)
  const variant = boringVariantMap[style] || 'marble';
  const colors = style === 'mono' ? getMonoPalette() : palette;

  return (
    <div className={`shrink-0 ${className}`} style={{ width: size, height: size }}>
      <BoringAvatar
        size={size}
        name={contact.email || contact.name || 'unknown'}
        variant={variant}
        colors={colors}
      />
    </div>
  );
}
