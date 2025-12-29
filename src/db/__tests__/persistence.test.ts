/**
 * Tests for database persistence (save/load to localStorage)
 *
 * These tests verify that:
 * 1. Large databases can be saved without stack overflow
 * 2. Databases can be round-tripped (save then load)
 * 3. Errors are properly thrown, not silently caught
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// We need to unmock the db/index module for these tests
vi.unmock('../index');

// Import the actual module (not the mock from setup.ts)
const actualModule = await vi.importActual<typeof import('../index')>('../index');
const {
  uint8ArrayToBase64,
  base64ToUint8Array,
  saveDatabase,
  _setDbForTesting,
} = actualModule;

describe('Base64 Conversion', () => {
  describe('uint8ArrayToBase64', () => {
    it('should convert small arrays correctly', () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const base64 = uint8ArrayToBase64(data);
      expect(base64).toBe('SGVsbG8=');
    });

    it('should convert empty array', () => {
      const data = new Uint8Array([]);
      const base64 = uint8ArrayToBase64(data);
      expect(base64).toBe('');
    });

    it('should handle arrays larger than 10KB without stack overflow', () => {
      // This is the critical test - the bug causes stack overflow at ~10KB
      const size = 100 * 1024; // 100KB
      const data = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        data[i] = i % 256;
      }

      // This should NOT throw RangeError: Maximum call stack size exceeded
      expect(() => uint8ArrayToBase64(data)).not.toThrow();

      const base64 = uint8ArrayToBase64(data);
      expect(base64.length).toBeGreaterThan(0);
    });

    it('should handle arrays at 1MB without stack overflow', () => {
      const size = 1024 * 1024; // 1MB
      const data = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        data[i] = i % 256;
      }

      expect(() => uint8ArrayToBase64(data)).not.toThrow();
    });
  });

  describe('base64ToUint8Array', () => {
    it('should convert base64 back to array correctly', () => {
      const base64 = 'SGVsbG8='; // "Hello"
      const data = base64ToUint8Array(base64);
      expect(Array.from(data)).toEqual([72, 101, 108, 108, 111]);
    });

    it('should handle empty string', () => {
      const data = base64ToUint8Array('');
      expect(data.length).toBe(0);
    });
  });

  describe('round-trip conversion', () => {
    it('should round-trip small data correctly', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
      const base64 = uint8ArrayToBase64(original);
      const restored = base64ToUint8Array(base64);
      expect(Array.from(restored)).toEqual(Array.from(original));
    });

    it('should round-trip 100KB data correctly', () => {
      const size = 100 * 1024;
      const original = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        original[i] = i % 256;
      }

      const base64 = uint8ArrayToBase64(original);
      const restored = base64ToUint8Array(base64);

      expect(restored.length).toBe(original.length);
      // Check first and last chunks
      expect(Array.from(restored.slice(0, 100))).toEqual(
        Array.from(original.slice(0, 100))
      );
      expect(Array.from(restored.slice(-100))).toEqual(
        Array.from(original.slice(-100))
      );
    });
  });
});

describe('saveDatabase', () => {
  // Mock localStorage for these tests
  let localStorageMock: {
    getItem: ReturnType<typeof vi.fn>;
    setItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    vi.stubGlobal('localStorage', localStorageMock);
    _setDbForTesting(null);
  });

  it('should throw when database not initialized', () => {
    _setDbForTesting(null);
    expect(() => saveDatabase()).toThrow('Database not initialized');
  });

  it('should save database to localStorage', () => {
    // Create a mock database with export() method
    const mockData = new Uint8Array([1, 2, 3, 4, 5]);
    const mockDb = {
      export: vi.fn(() => mockData),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setDbForTesting(mockDb as any);

    saveDatabase();

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'training-camp-db',
      expect.any(String)
    );
  });

  it('should throw on quota exceeded error', () => {
    const mockDb = {
      export: vi.fn(() => new Uint8Array([1, 2, 3])),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setDbForTesting(mockDb as any);

    // Mock localStorage to throw quota exceeded
    const quotaError = new DOMException('Quota exceeded', 'QuotaExceededError');
    localStorageMock.setItem.mockImplementation(() => {
      throw quotaError;
    });

    expect(() => saveDatabase()).toThrow(/quota exceeded/i);
  });
});
