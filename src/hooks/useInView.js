import { useState, useEffect, useRef } from 'react';

/**
 * Intersection-observer hook for deferred rendering.
 * Returns [ref, inView]. Attach ref to a placeholder element; once it
 * scrolls into (or near) the viewport, inView flips to true permanently.
 *
 * @param {{ rootMargin?: string, triggerOnce?: boolean }} opts
 */
export function useInView({ rootMargin = '200px', triggerOnce = true } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || (triggerOnce && inView)) return;

    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (triggerOnce) observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, triggerOnce, inView]);

  return [ref, inView];
}
