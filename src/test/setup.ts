import '@testing-library/jest-dom';
import { vi, beforeEach, afterEach } from 'vitest';

// Create a mock database instance for reuse
export function createMockDatabase() {
  return {
    run: vi.fn(),
    exec: vi.fn(() => []),
    getRowsModified: vi.fn(() => 1),
    export: vi.fn(() => new Uint8Array()),
    close: vi.fn(),
  };
}

// Create a shared mock database
const mockDb = createMockDatabase();

// Mock sql.js for database tests
vi.mock('sql.js', () => ({
  default: vi.fn(() =>
    Promise.resolve({
      Database: vi.fn(() => mockDb),
    })
  ),
}));

// Mock the database module to avoid initialization issues
vi.mock('../db/index', () => ({
  getDatabase: vi.fn(() => mockDb),
  saveDatabase: vi.fn(),
  initDatabase: vi.fn(() => Promise.resolve(mockDb)),
  closeDatabase: vi.fn(),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.getItem.mockReturnValue(null);
  // Reset mock database methods
  mockDb.run.mockClear();
  mockDb.exec.mockClear().mockReturnValue([]);
  mockDb.getRowsModified.mockClear().mockReturnValue(1);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Export utilities for tests
export { vi, mockDb };
