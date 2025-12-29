/**
 * ID Generator Tests
 *
 * Tests for the UUID generation utility.
 */

import { describe, it, expect } from 'vitest';
import { generateId } from '../id';

describe('generateId', () => {
  it('returns a string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
  });

  it('returns a valid UUID v4 format', () => {
    const id = generateId();
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateId());
    }
    // All 1000 IDs should be unique
    expect(ids.size).toBe(1000);
  });

  it('generates IDs with correct length', () => {
    const id = generateId();
    // UUID v4 is always 36 characters (including 4 hyphens)
    expect(id.length).toBe(36);
  });

  it('has version 4 indicator in correct position', () => {
    const id = generateId();
    // The 13th character (index 14, after the second hyphen) should be '4'
    expect(id[14]).toBe('4');
  });

  it('has variant indicator in correct position', () => {
    const id = generateId();
    // The 17th character (index 19, after the third hyphen) should be 8, 9, a, or b
    expect(['8', '9', 'a', 'b']).toContain(id[19].toLowerCase());
  });
});
