/**
 * ViewTransition — animates between views with a fade + slide.
 * Respects the user's animation speed setting.
 * Wraps children and triggers animation when `viewKey` changes.
 */

import { useRef, useState, useEffect, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { animationDurationAtom } from '../atoms/app';

export default function ViewTransition({ viewKey, children, className = '' }: {
  viewKey: string;
  children: ReactNode;
  className?: string;
}) {
  const duration = useAtomValue(animationDurationAtom);
  const [display, setDisplay] = useState(children);
  const [animating, setAnimating] = useState(false);
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const prevKey = useRef(viewKey);

  useEffect(() => {
    if (viewKey === prevKey.current) {
      setDisplay(children);
      return;
    }
    prevKey.current = viewKey;

    if (duration === 0) {
      setDisplay(children);
      return;
    }

    // Phase 1: fade out old content
    setAnimating(true);
    setPhase('out');

    const fadeOutTimer = setTimeout(() => {
      // Phase 2: swap content and fade in
      setDisplay(children);
      setPhase('in');

      const fadeInTimer = setTimeout(() => {
        setAnimating(false);
      }, duration);

      return () => clearTimeout(fadeInTimer);
    }, duration);

    return () => clearTimeout(fadeOutTimer);
  }, [viewKey, children, duration]);

  // Update content when children change within the same viewKey
  useEffect(() => {
    if (!animating) setDisplay(children);
  }, [children, animating]);

  if (duration === 0) {
    return <div className={className}>{children}</div>;
  }

  const style: React.CSSProperties = {
    transition: `opacity ${duration}ms ease, transform ${duration}ms ease`,
    opacity: animating ? (phase === 'out' ? 0 : 1) : 1,
    transform: animating
      ? (phase === 'out' ? 'translateX(-8px)' : 'translateX(0)')
      : 'translateX(0)',
  };

  return (
    <div className={className} style={style}>
      {display}
    </div>
  );
}
