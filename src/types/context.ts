export interface ContextDocument {
  id: string;
  sessionId: string;
  name: string;
  content: string;
  mimeType: string;
  size: number;
  createdAt: number;
}

export interface ContextExample {
  id: string;
  sessionId: string;
  name: string;
  input: string;
  expectedOutput: string;
  createdAt: number;
}

export interface TestCase {
  id: string;
  sessionId: string;
  name: string;
  input: string;
  createdAt: number;
}

export interface SessionContext {
  documents: ContextDocument[];
  examples: ContextExample[];
  testCases: TestCase[];
}
