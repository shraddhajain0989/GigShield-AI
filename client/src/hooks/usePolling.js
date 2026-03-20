// ============================================================================
// GigShield AI — usePolling Hook (Real-Time Updates)
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for real-time data polling.
 * @param {Function} fetchFn - Async function that returns data
 * @param {number} intervalMs - Polling interval (default 30s)
 * @param {boolean} enabled - Whether polling is active
 */
export function usePolling(fetchFn, intervalMs = 30000, enabled = true) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const result = await fetchFn();
      setData(result);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    intervalRef.current = setInterval(refresh, intervalMs);
    return () => clearInterval(intervalRef.current);
  }, [refresh, intervalMs, enabled]);

  return { data, loading, error, lastUpdated, refresh };
}
