import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, ChevronDown, ChevronUp, FileText, Plus, Trash2, Wand2, ListChecks } from 'lucide-react';
import { Button, Input, Textarea, Card, CardContent } from '../components/ui';
import { Header } from '../components/layout/Header';
import { StrategyDiscussionModal } from '../components/strategy';
import { useSessionStore } from '../store/session';
import { useLineageStore } from '../store/lineages';
import { useContextStore } from '../store/context';
import { generateAgentsFromStrategies } from '../agents/agent-generator';
import { proposeInputPrompt, generateRubric } from '../agents/master-trainer';
import type { CustomStrategy } from '../types/strategy';

interface ContextDocument {
  name: string;
  content: string;
}

interface ContextExample {
  name: string;
  input: string;
  expectedOutput: string;
}

export function NewSession() {
  const navigate = useNavigate();
  const { createSession } = useSessionStore();
  const { createInitialLineagesWithAgents } = useLineageStore();
  const { addDocument, addExample } = useContextStore();

  const [name, setName] = useState('');
  const [need, setNeed] = useState('');
  const [constraints, setConstraints] = useState('');
  const [rubric, setRubric] = useState('');
  const [inputPrompt, setInputPrompt] = useState('');
  const [agentCount, setAgentCount] = useState<1 | 2 | 4>(4);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isGeneratingRubric, setIsGeneratingRubric] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStrategyModal, setShowStrategyModal] = useState(false);

  // Context state
  const [showContext, setShowContext] = useState(false);
  const [documents, setDocuments] = useState<ContextDocument[]>([]);
  const [examples, setExamples] = useState<ContextExample[]>([]);

  // Inline forms for adding context
  const [showDocForm, setShowDocForm] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocContent, setNewDocContent] = useState('');

  const [showExampleForm, setShowExampleForm] = useState(false);
  const [newExampleName, setNewExampleName] = useState('');
  const [newExampleInput, setNewExampleInput] = useState('');
  const [newExampleOutput, setNewExampleOutput] = useState('');

  const handleAddDocument = () => {
    if (newDocName.trim() && newDocContent.trim()) {
      setDocuments([...documents, { name: newDocName.trim(), content: newDocContent.trim() }]);
      setNewDocName('');
      setNewDocContent('');
      setShowDocForm(false);
    }
  };

  const handleAddExample = () => {
    if (newExampleName.trim() && newExampleInput.trim() && newExampleOutput.trim()) {
      setExamples([
        ...examples,
        { name: newExampleName.trim(), input: newExampleInput.trim(), expectedOutput: newExampleOutput.trim() },
      ]);
      setNewExampleName('');
      setNewExampleInput('');
      setNewExampleOutput('');
      setShowExampleForm(false);
    }
  };

  const handleRemoveDocument = (index: number) => {
    setDocuments(documents.filter((_, i) => i !== index));
  };

  const handleRemoveExample = (index: number) => {
    setExamples(examples.filter((_, i) => i !== index));
  };

  // Generate input prompt using Master Trainer
  const handleGeneratePrompt = async () => {
    if (!need.trim()) return;
    setIsGeneratingPrompt(true);
    try {
      const proposed = await proposeInputPrompt(need.trim(), constraints.trim() || undefined);
      setInputPrompt(proposed);
    } catch (err) {
      console.error('Failed to generate input prompt:', err);
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  // Generate rubric using Master Trainer
  const handleGenerateRubric = async () => {
    if (!need.trim()) return;
    setIsGeneratingRubric(true);
    try {
      const proposed = await generateRubric(need.trim(), constraints.trim() || undefined);
      setRubric(proposed);
    } catch (err) {
      console.error('Failed to generate rubric:', err);
    } finally {
      setIsGeneratingRubric(false);
    }
  };

  // Open strategy discussion modal when form is submitted
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !need.trim()) return;
    setError(null);
    setShowStrategyModal(true);
  };

  // Handle confirmed strategies from discussion modal
  const handleStrategiesConfirmed = useCallback(async (strategies: CustomStrategy[]) => {
    setShowStrategyModal(false);
    setIsCreating(true);
    setError(null);

    try {
      // Create session with input prompt, rubric, and agent count
      const session = createSession({
        name: name.trim(),
        need: need.trim(),
        constraints: constraints.trim() || undefined,
        rubric: rubric.trim() || undefined,
        inputPrompt: inputPrompt.trim() || undefined,
        initialAgentCount: agentCount,
      });

      // Save context to store
      for (const doc of documents) {
        addDocument({
          sessionId: session.id,
          name: doc.name,
          content: doc.content,
          mimeType: 'text/plain',
          size: doc.content.length,
        });
      }
      for (const example of examples) {
        addExample({
          sessionId: session.id,
          name: example.name,
          input: example.input,
          expectedOutput: example.expectedOutput,
        });
      }

      // Generate agents using the confirmed custom strategies
      const agentConfigs = await generateAgentsFromStrategies(
        need.trim(),
        strategies,
        constraints.trim() || undefined
      );

      // Create lineages with agents and execute them to produce artifacts
      await createInitialLineagesWithAgents(session.id, agentConfigs);

      // Navigate to training view
      navigate(`/session/${session.id}`);
    } catch (err) {
      console.error('Failed to create session:', err);
      setError(err instanceof Error ? err.message : 'Failed to create session');
      setIsCreating(false);
    }
  }, [name, need, constraints, rubric, inputPrompt, agentCount, documents, examples, createSession, addDocument, addExample, createInitialLineagesWithAgents, navigate]);

  const contextCount = documents.length + examples.length;

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
                  Define what you want and we'll generate initial agent options
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

              {/* Rubric Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    <span className="flex items-center gap-1.5">
                      <ListChecks className="w-4 h-4 text-gray-500" />
                      Evaluation Rubric
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateRubric}
                    disabled={!need.trim() || isGeneratingRubric}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Wand2 className={`w-3.5 h-3.5 ${isGeneratingRubric ? 'animate-spin' : ''}`} />
                    {isGeneratingRubric ? 'Generating...' : 'Generate'}
                  </button>
                </div>
                <Textarea
                  placeholder="• Criteria for evaluating outputs&#10;• What makes an output good vs bad&#10;• Specific requirements to check"
                  value={rubric}
                  onChange={(e) => setRubric(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-gray-500">
                  Define criteria for scoring agent outputs. This helps you evaluate consistently and guides agent evolution.
                </p>
              </div>

              {/* Input Prompt Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    Input Prompt
                  </label>
                  <button
                    type="button"
                    onClick={handleGeneratePrompt}
                    disabled={!need.trim() || isGeneratingPrompt}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Wand2 className={`w-3.5 h-3.5 ${isGeneratingPrompt ? 'animate-spin' : ''}`} />
                    {isGeneratingPrompt ? 'Generating...' : 'Generate'}
                  </button>
                </div>
                <Textarea
                  placeholder="Enter a test prompt that agents will respond to (e.g., 'Write a poem about autumn leaves')"
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-gray-500">
                  This is the actual input your agents will respond to. If left empty, agents will receive a generic prompt based on your need.
                </p>
              </div>

              {/* Agent Count Section */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Number of Agents
                </label>
                <div className="flex gap-2">
                  {([1, 2, 4] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setAgentCount(count)}
                      className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                        agentCount === count
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {count} Agent{count > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  Start with fewer agents for quick iteration, or more for broader exploration. You can add more agents later.
                </p>
              </div>

              {/* Context Section */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowContext(!showContext)}
                  className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-gray-500" />
                    <span className="font-medium text-gray-700">Context & Examples</span>
                    {contextCount > 0 && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">
                        {contextCount} added
                      </span>
                    )}
                  </div>
                  {showContext ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {showContext && (
                  <div className="p-4 space-y-4 border-t border-gray-200">
                    <p className="text-sm text-gray-500">
                      Add reference documents and examples to help the AI understand your specific style and requirements.
                    </p>

                    {/* Documents Section */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-gray-700">Reference Documents</h4>
                        <button
                          type="button"
                          onClick={() => setShowDocForm(true)}
                          className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
                        >
                          <Plus className="w-3 h-3" />
                          Add Document
                        </button>
                      </div>

                      {documents.length > 0 && (
                        <div className="space-y-2 mb-2">
                          {documents.map((doc, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-gray-400" />
                                <span className="text-gray-700">{doc.name}</span>
                                <span className="text-gray-400">({doc.content.length} chars)</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveDocument(index)}
                                className="p-1 text-gray-400 hover:text-red-500"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {showDocForm && (
                        <div className="p-3 bg-gray-50 rounded-lg space-y-3">
                          <Input
                            placeholder="Document name"
                            value={newDocName}
                            onChange={(e) => setNewDocName(e.target.value)}
                          />
                          <Textarea
                            placeholder="Paste your document content here..."
                            value={newDocContent}
                            onChange={(e) => setNewDocContent(e.target.value)}
                            rows={4}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setShowDocForm(false);
                                setNewDocName('');
                                setNewDocContent('');
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={handleAddDocument}
                              disabled={!newDocName.trim() || !newDocContent.trim()}
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Examples Section */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-gray-700">Examples (Input → Expected Output)</h4>
                        <button
                          type="button"
                          onClick={() => setShowExampleForm(true)}
                          className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
                        >
                          <Plus className="w-3 h-3" />
                          Add Example
                        </button>
                      </div>

                      {examples.length > 0 && (
                        <div className="space-y-2 mb-2">
                          {examples.map((example, index) => (
                            <div
                              key={index}
                              className="p-2 bg-gray-50 rounded-lg text-sm"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-gray-700">{example.name}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveExample(index)}
                                  className="p-1 text-gray-400 hover:text-red-500"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="text-xs text-gray-500 truncate">
                                Input: {example.input.slice(0, 50)}...
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {showExampleForm && (
                        <div className="p-3 bg-gray-50 rounded-lg space-y-3">
                          <Input
                            placeholder="Example name (e.g., 'Email Summary Example')"
                            value={newExampleName}
                            onChange={(e) => setNewExampleName(e.target.value)}
                          />
                          <Textarea
                            placeholder="Input text..."
                            value={newExampleInput}
                            onChange={(e) => setNewExampleInput(e.target.value)}
                            rows={3}
                          />
                          <Textarea
                            placeholder="Expected output..."
                            value={newExampleOutput}
                            onChange={(e) => setNewExampleOutput(e.target.value)}
                            rows={3}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setShowExampleForm(false);
                                setNewExampleName('');
                                setNewExampleInput('');
                                setNewExampleOutput('');
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={handleAddExample}
                              disabled={!newExampleName.trim() || !newExampleInput.trim() || !newExampleOutput.trim()}
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

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

      {/* Strategy Discussion Modal */}
      <StrategyDiscussionModal
        isOpen={showStrategyModal}
        onClose={() => setShowStrategyModal(false)}
        onConfirm={handleStrategiesConfirmed}
        need={need.trim()}
        constraints={constraints.trim() || undefined}
        agentCount={agentCount}
      />
    </div>
  );
}
