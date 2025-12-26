import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useSessionStore } from '../store/session';
import { useLineageStore } from '../store/lineages';

export function useCurrentSession() {
  const { id } = useParams<{ id: string }>();
  const { currentSession, loadSession } = useSessionStore();
  const { lineages, loadLineages } = useLineageStore();

  useEffect(() => {
    if (id) {
      loadSession(id);
      loadLineages(id);
    }
  }, [id, loadSession, loadLineages]);

  return {
    session: currentSession,
    lineages,
    sessionId: id,
  };
}
