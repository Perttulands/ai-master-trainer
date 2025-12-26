import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Trash2, Clock } from 'lucide-react';
import { Button, Card, CardContent } from '../components/ui';
import { Header } from '../components/layout/Header';
import { useSessionStore } from '../store/session';

export function Home() {
  const navigate = useNavigate();
  const { sessions, loadSessions, deleteSession } = useSessionStore();

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this session?')) {
      deleteSession(id);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Training Sessions</h1>
            <p className="text-gray-500">Create and manage your AI training sessions</p>
          </div>
          <Button onClick={() => navigate('/new')}>
            <Plus className="w-4 h-4 mr-1" />
            New Session
          </Button>
        </div>

        {sessions.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Plus className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No sessions yet</h3>
              <p className="text-gray-500 mb-4">
                Create your first training session to start evolving AI outputs.
              </p>
              <Button onClick={() => navigate('/new')}>
                <Plus className="w-4 h-4 mr-1" />
                Create Session
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {sessions.map((session) => (
              <Link key={session.id} to={`/session/${session.id}`}>
                <Card className="hover:border-primary-300 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {session.name}
                      </h3>
                      <p className="text-sm text-gray-500 truncate">{session.need}</p>
                      <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                        <Clock className="w-3 h-3" />
                        {new Date(session.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, session.id)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
