import { useCallback, useEffect, useRef, useState } from 'react';

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
}

export function useWakeLock() {
  const [supported] = useState(
    () => typeof navigator !== 'undefined' && 'wakeLock' in navigator
  );
  const [active, setActive] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  const requestLock = useCallback(async () => {
    if (!supported || !enabled) return;
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
      };
      if (!nav.wakeLock) return;
      const lock = await nav.wakeLock.request('screen');
      sentinelRef.current = lock;
      setActive(true);
      lock.addEventListener?.('release', () => {
        setActive(false);
      });
    } catch {
      setActive(false);
    }
  }, [supported, enabled]);

  const releaseLock = useCallback(async () => {
    try {
      await sentinelRef.current?.release();
    } catch {
      // Ignore release errors
    }
    sentinelRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      void releaseLock();
      return;
    }
    const onVis = () => {
      if (document.visibilityState === 'visible' && enabled) {
        void requestLock();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void releaseLock();
    };
  }, [enabled, requestLock, releaseLock]);

  return {
    supported,
    active,
    enabled,
    setEnabled,
    requestLock,
  };
}
