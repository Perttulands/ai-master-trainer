import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Button, Input, Textarea, Card, CardContent } from '../components/ui';
import { Header } from '../components/layout/Header';
import { useSessionStore } from '../store/session';
import { useLineageStore } from '../store/lineages';
import { generateInitialLineages } from '../agents/master-trainer';

export function NewSession() {
  const navigate = useNavigate();
  const { createSession } = useSessionStore();
  const { createInitialLineages } = useLineageStore();

  const [name, setName] = useState('');
  const [need, setNeed] = useState('');
  const [constraints, setConstraints] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !need.trim()) return;

    setIsCreating(true);
    setError(null);

    try {
      // Create session
      const session = createSession({
        name: name.trim(),
        need: need.trim(),
        constraints: constraints.trim() || undefined,
      });

      // Generate initial lineages with Master Trainer (uses LLM)
      const initialLineages = await generateInitialLineages(
        need.trim(),
        constraints.trim() || undefined
      );

      // Create lineages in database
      createInitialLineages(session.id, initialLineages);

      // Navigate to training view
      navigate(`/session/${session.id}`);
    } catch (err) {
      console.error('Failed to create session:', err);
      setError(err instanceof Error ? err.message : 'Failed to create session');
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to sessions
        </button>

        <Card>
          <CardContent>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">New Training Session</h1>
                <p className="text-sm text-gray-500">
                  Define what you want to create and we'll generate 4 initial options
                </p>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <Input
                label="Session Name"
                placeholder="e.g., Email Summarizer, Blog Post Writer"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />

              <Textarea
                label="What do you need?"
                placeholder="e.g., Summarize emails in my writing style while keeping key action items highlighted"
                value={need}
                onChange={(e) => setNeed(e.target.value)}
                rows={4}
                required
              />

              <Textarea
                label="Constraints (optional)"
                placeholder="e.g., Keep under 200 words, Use bullet points, Maintain formal tone"
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                rows={3}
              />

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate('/')}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!name.trim() || !need.trim() || isCreating}>
                  {isCreating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-1" />
                      Generate Options
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
