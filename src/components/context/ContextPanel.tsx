import { useState } from 'react';
import { FileText, Plus, Trash2, CheckCircle, TestTube } from 'lucide-react';
import { Button, Input, Textarea, Card, CardHeader, CardContent } from '../ui';
import { DocumentUploader } from './DocumentUploader';
import { useContextStore } from '../../store/context';

interface ContextPanelProps {
  sessionId: string;
}

export function ContextPanel({ sessionId }: ContextPanelProps) {
  const { documents, examples, testCases, addDocument, removeDocument, addExample, removeExample, addTestCase, removeTestCase } = useContextStore();
  const [showExampleForm, setShowExampleForm] = useState(false);
  const [showTestCaseForm, setShowTestCaseForm] = useState(false);
  const [exampleForm, setExampleForm] = useState({ name: '', input: '', expectedOutput: '' });
  const [testCaseForm, setTestCaseForm] = useState({ name: '', input: '', expectedOutput: '', isGolden: false });

  const handleUpload = (doc: { sessionId: string; name: string; content: string; type: string }) => {
    addDocument({ sessionId: doc.sessionId, name: doc.name, content: doc.content, mimeType: `text/${doc.type}`, size: doc.content.length });
  };

  const handleAddExample = (e: React.FormEvent) => {
    e.preventDefault();
    if (!exampleForm.name.trim() || !exampleForm.input.trim()) return;
    addExample({ sessionId, name: exampleForm.name.trim(), input: exampleForm.input.trim(), expectedOutput: exampleForm.expectedOutput.trim() });
    setExampleForm({ name: '', input: '', expectedOutput: '' });
    setShowExampleForm(false);
  };

  const handleAddTestCase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testCaseForm.name.trim() || !testCaseForm.input.trim()) return;
    addTestCase({ sessionId, name: testCaseForm.name.trim(), input: testCaseForm.input.trim() });
    setTestCaseForm({ name: '', input: '', expectedOutput: '', isGolden: false });
    setShowTestCaseForm(false);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white rounded-xl border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Session Context</h2>
        <p className="text-xs text-gray-500">Documents, examples, and test cases</p>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Documents Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              <span className="font-medium text-sm">Documents</span>
              <span className="text-xs text-gray-400">({documents.length})</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {documents.length > 0 && (
              <ul className="space-y-2">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-gray-700 truncate">{doc.name}</span>
                      <span className="text-xs text-gray-400">{(doc.size / 1024).toFixed(1)}KB</span>
                    </div>
                    <button onClick={() => removeDocument(doc.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors" aria-label="Remove document">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <DocumentUploader sessionId={sessionId} onUpload={handleUpload} />
          </CardContent>
        </Card>

        {/* Examples Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="font-medium text-sm">Examples</span>
                <span className="text-xs text-gray-400">({examples.length})</span>
              </div>
              {!showExampleForm && (
                <Button size="sm" variant="ghost" onClick={() => setShowExampleForm(true)}><Plus className="w-4 h-4" /></Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {examples.length > 0 && (
              <ul className="space-y-2">
                {examples.map((example) => (
                  <li key={example.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-700">{example.name}</p>
                        <p className="text-xs text-gray-500 mt-1">Input: {example.input}</p>
                        {example.expectedOutput && <p className="text-xs text-gray-500">Expected: {example.expectedOutput}</p>}
                      </div>
                      <button onClick={() => removeExample(example.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors" aria-label="Remove example">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {showExampleForm && (
              <form onSubmit={handleAddExample} className="space-y-3 p-3 border rounded-lg bg-gray-50">
                <Input label="Name" value={exampleForm.name} onChange={(e) => setExampleForm({ ...exampleForm, name: e.target.value })} placeholder="Example name" />
                <Textarea label="Input" value={exampleForm.input} onChange={(e) => setExampleForm({ ...exampleForm, input: e.target.value })} placeholder="Example input" rows={2} />
                <Textarea label="Expected Output" value={exampleForm.expectedOutput} onChange={(e) => setExampleForm({ ...exampleForm, expectedOutput: e.target.value })} placeholder="Expected output" rows={2} />
                <div className="flex gap-2">
                  <Button type="submit" size="sm">Add Example</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setExampleForm({ name: '', input: '', expectedOutput: '' }); setShowExampleForm(false); }}>Cancel</Button>
                </div>
              </form>
            )}
            {!showExampleForm && examples.length === 0 && <p className="text-sm text-gray-400 text-center py-2">No examples added</p>}
          </CardContent>
        </Card>

        {/* Test Cases Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <TestTube className="w-4 h-4 text-purple-500" />
                <span className="font-medium text-sm">Test Cases</span>
                <span className="text-xs text-gray-400">({testCases.length})</span>
              </div>
              {!showTestCaseForm && (
                <Button size="sm" variant="ghost" onClick={() => setShowTestCaseForm(true)}><Plus className="w-4 h-4" /></Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {testCases.length > 0 && (
              <ul className="space-y-2">
                {testCases.map((testCase) => (
                  <li key={testCase.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-700">{testCase.name}</p>
                          {'isGolden' in testCase && (testCase as { isGolden?: boolean }).isGolden && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">Golden</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Input: {testCase.input}</p>
                      </div>
                      <button onClick={() => removeTestCase(testCase.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors" aria-label="Remove test case">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {showTestCaseForm && (
              <form onSubmit={handleAddTestCase} className="space-y-3 p-3 border rounded-lg bg-gray-50">
                <Input label="Name" value={testCaseForm.name} onChange={(e) => setTestCaseForm({ ...testCaseForm, name: e.target.value })} placeholder="Test case name" />
                <Textarea label="Input" value={testCaseForm.input} onChange={(e) => setTestCaseForm({ ...testCaseForm, input: e.target.value })} placeholder="Test input" rows={2} />
                <Textarea label="Expected Output" value={testCaseForm.expectedOutput} onChange={(e) => setTestCaseForm({ ...testCaseForm, expectedOutput: e.target.value })} placeholder="Expected output (optional)" rows={2} />
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="isGolden" checked={testCaseForm.isGolden} onChange={(e) => setTestCaseForm({ ...testCaseForm, isGolden: e.target.checked })} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                  <label htmlFor="isGolden" className="text-sm text-gray-700">Mark as golden test case</label>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm">Add Test Case</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setTestCaseForm({ name: '', input: '', expectedOutput: '', isGolden: false }); setShowTestCaseForm(false); }}>Cancel</Button>
                </div>
              </form>
            )}
            {!showTestCaseForm && testCases.length === 0 && <p className="text-sm text-gray-400 text-center py-2">No test cases added</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
