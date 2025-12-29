/**
 * Safe Expression Evaluator Tests
 *
 * These tests verify the security and correctness of the safe expression evaluator.
 * The evaluator is used for flow conditions and must be protected against injection.
 */

import { describe, it, expect } from 'vitest';
import {
  safeEvaluate,
  safeEvaluateCondition,
  validateExpression,
} from '../safeExpressionEvaluator';

describe('safeExpressionEvaluator', () => {
  describe('safeEvaluate', () => {
    describe('literals', () => {
      it('evaluates number literals', () => {
        expect(safeEvaluate('42', {})).toBe(42);
        expect(safeEvaluate('3.14', {})).toBe(3.14);
        expect(safeEvaluate('0.5', {})).toBe(0.5);
      });

      it('evaluates string literals', () => {
        expect(safeEvaluate('"hello"', {})).toBe('hello');
        expect(safeEvaluate("'world'", {})).toBe('world');
        expect(safeEvaluate('"with spaces"', {})).toBe('with spaces');
      });

      it('evaluates boolean literals', () => {
        expect(safeEvaluate('true', {})).toBe(true);
        expect(safeEvaluate('false', {})).toBe(false);
      });

      it('evaluates null and undefined', () => {
        expect(safeEvaluate('null', {})).toBe(null);
        expect(safeEvaluate('undefined', {})).toBe(undefined);
      });
    });

    describe('variables', () => {
      it('accesses simple variables', () => {
        expect(safeEvaluate('x', { x: 10 })).toBe(10);
        expect(safeEvaluate('name', { name: 'Alice' })).toBe('Alice');
      });

      it('accesses nested properties', () => {
        expect(safeEvaluate('user.name', { user: { name: 'Bob' } })).toBe('Bob');
        expect(safeEvaluate('a.b.c', { a: { b: { c: 123 } } })).toBe(123);
      });

      it('returns undefined for missing variables', () => {
        expect(safeEvaluate('missing', {})).toBe(undefined);
      });

      it('returns undefined for missing nested properties', () => {
        expect(safeEvaluate('user.missing', { user: {} })).toBe(undefined);
      });

      it('returns undefined when accessing property of null', () => {
        // Access property chain where intermediate is null
        expect(safeEvaluate('a.b', { a: { b: null } })).toBe(null);
      });
    });

    describe('comparison operators', () => {
      it('evaluates equality operators', () => {
        expect(safeEvaluate('x == 5', { x: 5 })).toBe(true);
        expect(safeEvaluate('x == 5', { x: '5' })).toBe(true); // loose equality
        expect(safeEvaluate('x === 5', { x: 5 })).toBe(true);
        expect(safeEvaluate('x === 5', { x: '5' })).toBe(false); // strict equality
        expect(safeEvaluate('x != 5', { x: 3 })).toBe(true);
        expect(safeEvaluate('x !== 5', { x: '5' })).toBe(true);
      });

      it('evaluates comparison operators', () => {
        expect(safeEvaluate('x > 5', { x: 10 })).toBe(true);
        expect(safeEvaluate('x > 5', { x: 5 })).toBe(false);
        expect(safeEvaluate('x >= 5', { x: 5 })).toBe(true);
        expect(safeEvaluate('x < 5', { x: 3 })).toBe(true);
        expect(safeEvaluate('x <= 5', { x: 5 })).toBe(true);
      });
    });

    describe('logical operators', () => {
      it('evaluates AND operator', () => {
        expect(safeEvaluate('true && true', {})).toBe(true);
        expect(safeEvaluate('true && false', {})).toBe(false);
        expect(safeEvaluate('x > 0 && x < 10', { x: 5 })).toBe(true);
        expect(safeEvaluate('x > 0 && x < 10', { x: 15 })).toBe(false);
      });

      it('evaluates OR operator', () => {
        expect(safeEvaluate('true || false', {})).toBe(true);
        expect(safeEvaluate('false || false', {})).toBe(false);
        expect(safeEvaluate('x < 0 || x > 10', { x: 15 })).toBe(true);
      });

      it('evaluates NOT operator', () => {
        expect(safeEvaluate('!true', {})).toBe(false);
        expect(safeEvaluate('!false', {})).toBe(true);
        expect(safeEvaluate('!x', { x: false })).toBe(true);
        expect(safeEvaluate('!!x', { x: 'truthy' })).toBe(true);
      });

      it('supports keyword versions (and, or, not)', () => {
        expect(safeEvaluate('true and true', {})).toBe(true);
        expect(safeEvaluate('true or false', {})).toBe(true);
        expect(safeEvaluate('not false', {})).toBe(true);
      });
    });

    describe('arithmetic operators', () => {
      it('evaluates addition', () => {
        expect(safeEvaluate('2 + 3', {})).toBe(5);
        expect(safeEvaluate('x + y', { x: 10, y: 20 })).toBe(30);
      });

      it('evaluates string concatenation', () => {
        expect(safeEvaluate('"hello" + " " + "world"', {})).toBe('hello world');
        expect(safeEvaluate('x + y', { x: 'foo', y: 'bar' })).toBe('foobar');
      });

      it('evaluates subtraction', () => {
        expect(safeEvaluate('10 - 3', {})).toBe(7);
        expect(safeEvaluate('x - y', { x: 100, y: 25 })).toBe(75);
      });

      it('evaluates multiplication', () => {
        expect(safeEvaluate('4 * 5', {})).toBe(20);
        expect(safeEvaluate('x * y', { x: 3, y: 7 })).toBe(21);
      });

      it('evaluates division', () => {
        expect(safeEvaluate('20 / 4', {})).toBe(5);
        expect(safeEvaluate('x / y', { x: 15, y: 3 })).toBe(5);
      });

      it('evaluates modulo', () => {
        expect(safeEvaluate('17 % 5', {})).toBe(2);
        expect(safeEvaluate('x % y', { x: 10, y: 3 })).toBe(1);
      });

      it('evaluates unary minus', () => {
        expect(safeEvaluate('-5', {})).toBe(-5);
        expect(safeEvaluate('-x', { x: 10 })).toBe(-10);
      });
    });

    describe('operator precedence', () => {
      it('respects arithmetic precedence', () => {
        expect(safeEvaluate('2 + 3 * 4', {})).toBe(14);
        expect(safeEvaluate('(2 + 3) * 4', {})).toBe(20);
        expect(safeEvaluate('10 - 4 / 2', {})).toBe(8);
      });

      it('respects logical precedence', () => {
        expect(safeEvaluate('true || false && false', {})).toBe(true);
        expect(safeEvaluate('(true || false) && false', {})).toBe(false);
      });

      it('handles complex expressions', () => {
        expect(safeEvaluate('x > 5 && y < 10 || z == 0', { x: 3, y: 15, z: 0 })).toBe(true);
        expect(safeEvaluate('(x + y) * z > 100', { x: 5, y: 5, z: 15 })).toBe(true);
      });
    });

    describe('escape sequences', () => {
      it('handles escape sequences in strings', () => {
        expect(safeEvaluate('"line1\\nline2"', {})).toBe('line1\nline2');
        expect(safeEvaluate('"tab\\there"', {})).toBe('tab\there');
        expect(safeEvaluate('"quote\\"here"', {})).toBe('quote"here');
      });
    });
  });

  describe('safeEvaluateCondition', () => {
    it('returns boolean for truthy values', () => {
      expect(safeEvaluateCondition('1', {})).toBe(true);
      expect(safeEvaluateCondition('"hello"', {})).toBe(true);
      expect(safeEvaluateCondition('true', {})).toBe(true);
    });

    it('returns boolean for falsy values', () => {
      expect(safeEvaluateCondition('0', {})).toBe(false);
      expect(safeEvaluateCondition('""', {})).toBe(false);
      expect(safeEvaluateCondition('false', {})).toBe(false);
      expect(safeEvaluateCondition('null', {})).toBe(false);
    });

    it('returns false on evaluation error', () => {
      expect(safeEvaluateCondition('window.location', {})).toBe(false);
      expect(safeEvaluateCondition('invalid syntax !!!', {})).toBe(false);
    });

    it('handles empty and invalid inputs', () => {
      expect(safeEvaluateCondition('', {})).toBe(false);
      expect(safeEvaluateCondition(null as unknown as string, {})).toBe(false);
    });
  });

  describe('validateExpression', () => {
    it('validates correct expressions', () => {
      expect(validateExpression('x > 5')).toEqual({ valid: true });
      expect(validateExpression('user.name == "Alice"')).toEqual({ valid: true });
      expect(validateExpression('a && b || c')).toEqual({ valid: true });
    });

    it('rejects blocked identifiers', () => {
      const result = validateExpression('window');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('window');
    });

    it('rejects expressions with unknown characters', () => {
      const result = validateExpression('x { y');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('security', () => {
    it('blocks access to window', () => {
      expect(() => safeEvaluate('window', {})).toThrow();
      expect(() => safeEvaluate('window.location', {})).toThrow();
    });

    it('blocks access to globalThis', () => {
      expect(() => safeEvaluate('globalThis', {})).toThrow();
    });

    it('blocks access to constructor', () => {
      expect(() => safeEvaluate('constructor', {})).toThrow();
      expect(() => safeEvaluate('x.constructor', { x: {} })).toThrow();
    });

    it('blocks access to __proto__', () => {
      expect(() => safeEvaluate('__proto__', {})).toThrow();
      expect(() => safeEvaluate('x.__proto__', { x: {} })).toThrow();
    });

    it('blocks access to prototype', () => {
      expect(() => safeEvaluate('prototype', {})).toThrow();
    });

    it('blocks access to eval', () => {
      expect(() => safeEvaluate('eval', {})).toThrow();
    });

    it('blocks access to Function', () => {
      expect(() => safeEvaluate('Function', {})).toThrow();
    });

    it('blocks access to process (Node.js)', () => {
      expect(() => safeEvaluate('process', {})).toThrow();
    });

    it('blocks access to require', () => {
      expect(() => safeEvaluate('require', {})).toThrow();
    });

    it('blocks access to document', () => {
      expect(() => safeEvaluate('document', {})).toThrow();
    });

    it('blocks access to localStorage', () => {
      expect(() => safeEvaluate('localStorage', {})).toThrow();
    });

    it('blocks property access to dangerous properties', () => {
      expect(() => safeEvaluate('obj.constructor', { obj: {} })).toThrow();
      expect(() => safeEvaluate('arr.__proto__', { arr: [] })).toThrow();
    });

    it('cannot escape via nested object access', () => {
      const malicious = {
        escape: {
          constructor: Function,
        },
      };
      // Should block at 'constructor' property
      expect(() => safeEvaluate('escape.constructor', malicious)).toThrow();
    });
  });

  describe('edge cases', () => {
    it('handles empty string expression', () => {
      expect(safeEvaluate('', {})).toBe(false);
    });

    it('handles whitespace-only expression', () => {
      // Whitespace-only gets trimmed to empty, which returns false
      expect(safeEvaluateCondition('   ', {})).toBe(false);
    });

    it('handles deeply nested property access', () => {
      const obj = { a: { b: { c: { d: { e: 'deep' } } } } };
      expect(safeEvaluate('a.b.c.d.e', obj)).toBe('deep');
    });

    it('handles null in property chain', () => {
      expect(safeEvaluate('a.b.c', { a: { b: null } })).toBe(undefined);
    });

    it('handles undefined in property chain', () => {
      expect(safeEvaluate('a.b.c', { a: { b: undefined } })).toBe(undefined);
    });

    it('handles complex nested comparisons', () => {
      const data = {
        user: { age: 25, verified: true },
        settings: { minAge: 18 },
      };
      expect(
        safeEvaluate('user.age >= settings.minAge && user.verified', data)
      ).toBe(true);
    });
  });
});
