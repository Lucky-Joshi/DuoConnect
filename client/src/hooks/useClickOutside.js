import { useEffect, useRef } from 'react';

/** Calls `handler` when a pointer press lands outside the referenced element. */
export function useClickOutside(handler, enabled = true) {
  const ref = useRef(null);
  const saved = useRef(handler);
  saved.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;

    const onPointer = (event) => {
      const element = ref.current;
      if (element && !element.contains(event.target)) saved.current?.(event);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') saved.current?.(event);
    };

    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [enabled]);

  return ref;
}
