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
  const childrenRef = useRef(children);
  childrenRef.current = children;

  // Animate only on viewKey changes — children ref ensures we swap in the latest content
  useEffect(() => {
    if (viewKey === prevKey.current) return;
    prevKey.current = viewKey;

    if (duration === 0) {
      setDisplay(childrenRef.current);
      return;
    }

    // Phase 1: fade out old content
    setAnimating(true);
    setPhase('out');

    const fadeOutTimer = setTimeout(() => {
      // Phase 2: swap content and fade in
      setDisplay(childrenRef.current);
      setPhase('in');

      const fadeInTimer = setTimeout(() => {
        setAnimating(false);
      }, duration);

      return () => clearTimeout(fadeInTimer);
    }, duration);

    return () => clearTimeout(fadeOutTimer);
  }, [viewKey, duration]);

  // Update content when children change within the same viewKey (only when not animating)
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
