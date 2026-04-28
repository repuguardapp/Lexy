'use client';

import { useEffect } from 'react';

/**
 * Posts the embed page's scroll height to its parent window so the
 * widget.js loader can resize the iframe (no inner scrollbars).
 *
 * Uses ResizeObserver so dynamic content changes (form → progress →
 * completed states) are reflected immediately.
 */
export function EmbedAutosize() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.parent === window) return; // not embedded

    const post = () => {
      const height = document.documentElement.scrollHeight;
      window.parent.postMessage({ type: 'lexyflow:resize', height }, '*');
    };

    post();

    const observer = new ResizeObserver(() => post());
    observer.observe(document.documentElement);

    return () => observer.disconnect();
  }, []);

  return null;
}
