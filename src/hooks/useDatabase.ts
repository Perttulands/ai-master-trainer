import { useState, useEffect } from 'react';
import { initDatabase } from '../db';

export function useDatabase() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    initDatabase()
      .then(() => {
        if (mounted) {
          setIsReady(true);
        }
      })
      .catch((e) => {
        if (mounted) {
          setError(e);
        }
      });

    return () => {
      mounted = false;
      // Don't close on unmount during dev (HMR)
      // closeDatabase();
    };
  }, []);

  return { isReady, error };
}
