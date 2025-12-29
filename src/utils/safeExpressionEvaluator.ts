/**
 * Safe Expression Evaluator
 *
 * A sandboxed expression evaluator that replaces the dangerous `new Function()` pattern.
 * Only allows safe operations: comparisons, logical operators, literals, and variable access.
 *
 * Security: Blocks access to window, globalThis, constructor, __proto__, and other
 * dangerous properties that could enable arbitrary code execution.
 */

// Blocked property names that could enable prototype pollution or escaping
const BLOCKED_PROPERTIES = new Set([
  'window',
  'globalThis',
  'global',
  'self',
  'document',
  'constructor',
  '__proto__',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'eval',
  'Function',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'localStorage',
  'sessionStorage',
  'importScripts',
  'require',
  'module',
  'exports',
  'process',
]);

// Token types for lexer
type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'NULL'
  | 'UNDEFINED'
  | 'IDENTIFIER'
  | 'OPERATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string | number | boolean | null | undefined;
  raw: string;
}

/**
 * Tokenize an expression string into tokens
 */
function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < expr.length) {
    // Skip whitespace
    if (/\s/.test(expr[pos])) {
      pos++;
      continue;
    }

    // Numbers (including decimals and negatives handled by parser)
    if (/[0-9]/.test(expr[pos]) || (expr[pos] === '.' && /[0-9]/.test(expr[pos + 1] || ''))) {
      let num = '';
      while (pos < expr.length && /[0-9.]/.test(expr[pos])) {
        num += expr[pos++];
      }
      tokens.push({ type: 'NUMBER', value: parseFloat(num), raw: num });
      continue;
    }

    // String literals (single or double quotes)
    if (expr[pos] === '"' || expr[pos] === "'") {
      const quote = expr[pos++];
      let str = '';
      while (pos < expr.length && expr[pos] !== quote) {
        if (expr[pos] === '\\' && pos + 1 < expr.length) {
          pos++;
          switch (expr[pos]) {
            case 'n':
              str += '\n';
              break;
            case 't':
              str += '\t';
              break;
            case 'r':
              str += '\r';
              break;
            default:
              str += expr[pos];
          }
          pos++;
        } else {
          str += expr[pos++];
        }
      }
      pos++; // Skip closing quote
      tokens.push({ type: 'STRING', value: str, raw: quote + str + quote });
      continue;
    }

    // Operators (multi-character first)
    const twoChar = expr.slice(pos, pos + 2);
    const threeChar = expr.slice(pos, pos + 3);

    if (threeChar === '===' || threeChar === '!==') {
      tokens.push({ type: 'OPERATOR', value: threeChar, raw: threeChar });
      pos += 3;
      continue;
    }

    if (['==', '!=', '<=', '>=', '&&', '||'].includes(twoChar)) {
      tokens.push({ type: 'OPERATOR', value: twoChar, raw: twoChar });
      pos += 2;
      continue;
    }

    if (['<', '>', '!', '+', '-', '*', '/', '%'].includes(expr[pos])) {
      tokens.push({ type: 'OPERATOR', value: expr[pos], raw: expr[pos] });
      pos++;
      continue;
    }

    // Parentheses
    if (expr[pos] === '(') {
      tokens.push({ type: 'LPAREN', value: '(', raw: '(' });
      pos++;
      continue;
    }
    if (expr[pos] === ')') {
      tokens.push({ type: 'RPAREN', value: ')', raw: ')' });
      pos++;
      continue;
    }

    // Dot for property access - treat as part of identifier
    if (expr[pos] === '.') {
      tokens.push({ type: 'OPERATOR', value: '.', raw: '.' });
      pos++;
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_$]/.test(expr[pos])) {
      let id = '';
      while (pos < expr.length && /[a-zA-Z0-9_$]/.test(expr[pos])) {
        id += expr[pos++];
      }

      // Keywords
      if (id === 'true') {
        tokens.push({ type: 'BOOLEAN', value: true, raw: id });
      } else if (id === 'false') {
        tokens.push({ type: 'BOOLEAN', value: false, raw: id });
      } else if (id === 'null') {
        tokens.push({ type: 'NULL', value: null, raw: id });
      } else if (id === 'undefined') {
        tokens.push({ type: 'UNDEFINED', value: undefined, raw: id });
      } else if (id === 'and') {
        tokens.push({ type: 'OPERATOR', value: '&&', raw: id });
      } else if (id === 'or') {
        tokens.push({ type: 'OPERATOR', value: '||', raw: id });
      } else if (id === 'not') {
        tokens.push({ type: 'OPERATOR', value: '!', raw: id });
      } else {
        // Check for blocked identifiers
        if (BLOCKED_PROPERTIES.has(id)) {
          throw new Error(`Access to '${id}' is not allowed in expressions`);
        }
        tokens.push({ type: 'IDENTIFIER', value: id, raw: id });
      }
      continue;
    }

    // Unknown character
    throw new Error(`Unexpected character '${expr[pos]}' at position ${pos}`);
  }

  tokens.push({ type: 'EOF', value: '', raw: '' });
  return tokens;
}

/**
 * Parser for safe expression evaluation
 * Uses recursive descent with proper operator precedence
 */
class SafeExpressionParser {
  private tokens: Token[];
  private pos: number;
  private variables: Record<string, unknown>;

  constructor(tokens: Token[], variables: Record<string, unknown>) {
    this.tokens = tokens;
    this.pos = 0;
    this.variables = variables;
  }

  private current(): Token {
    return this.tokens[this.pos] || { type: 'EOF', value: '', raw: '' };
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  // Note: peek method available for future use if needed for lookahead
  // private peek(offset = 0): Token {
  //   return this.tokens[this.pos + offset] || { type: 'EOF', value: '', raw: '' };
  // }

  /**
   * Parse and evaluate the expression
   */
  parse(): unknown {
    const result = this.parseOr();
    if (this.current().type !== 'EOF') {
      throw new Error(`Unexpected token: ${this.current().raw}`);
    }
    return result;
  }

  // Lowest precedence: OR (||)
  private parseOr(): unknown {
    let left = this.parseAnd();

    while (this.current().value === '||') {
      this.advance();
      const right = this.parseAnd();
      left = Boolean(left) || Boolean(right);
    }

    return left;
  }

  // AND (&&)
  private parseAnd(): unknown {
    let left = this.parseEquality();

    while (this.current().value === '&&') {
      this.advance();
      const right = this.parseEquality();
      left = Boolean(left) && Boolean(right);
    }

    return left;
  }

  // Equality (==, !=, ===, !==)
  private parseEquality(): unknown {
    let left = this.parseComparison();

    while (['==', '!=', '===', '!=='].includes(this.current().value as string)) {
      const op = this.advance().value;
      const right = this.parseComparison();

      switch (op) {
        case '==':
          left = left == right;
          break;
        case '!=':
          left = left != right;
          break;
        case '===':
          left = left === right;
          break;
        case '!==':
          left = left !== right;
          break;
      }
    }

    return left;
  }

  // Comparison (<, >, <=, >=)
  private parseComparison(): unknown {
    let left = this.parseAdditive();

    while (['<', '>', '<=', '>='].includes(this.current().value as string)) {
      const op = this.advance().value;
      const right = this.parseAdditive();

      switch (op) {
        case '<':
          left = (left as number) < (right as number);
          break;
        case '>':
          left = (left as number) > (right as number);
          break;
        case '<=':
          left = (left as number) <= (right as number);
          break;
        case '>=':
          left = (left as number) >= (right as number);
          break;
      }
    }

    return left;
  }

  // Additive (+, -)
  private parseAdditive(): unknown {
    let left = this.parseMultiplicative();

    while (['+', '-'].includes(this.current().value as string)) {
      const op = this.advance().value;
      const right = this.parseMultiplicative();

      if (op === '+') {
        // Handle string concatenation
        if (typeof left === 'string' || typeof right === 'string') {
          left = String(left) + String(right);
        } else {
          left = (left as number) + (right as number);
        }
      } else {
        left = (left as number) - (right as number);
      }
    }

    return left;
  }

  // Multiplicative (*, /, %)
  private parseMultiplicative(): unknown {
    let left = this.parseUnary();

    while (['*', '/', '%'].includes(this.current().value as string)) {
      const op = this.advance().value;
      const right = this.parseUnary();

      switch (op) {
        case '*':
          left = (left as number) * (right as number);
          break;
        case '/':
          left = (left as number) / (right as number);
          break;
        case '%':
          left = (left as number) % (right as number);
          break;
      }
    }

    return left;
  }

  // Unary (!, -)
  private parseUnary(): unknown {
    if (this.current().value === '!') {
      this.advance();
      return !this.parseUnary();
    }
    if (this.current().value === '-') {
      this.advance();
      return -(this.parseUnary() as number);
    }
    return this.parsePrimary();
  }

  // Primary (literals, identifiers, parentheses)
  private parsePrimary(): unknown {
    const token = this.current();

    // Parentheses
    if (token.type === 'LPAREN') {
      this.advance();
      const result = this.parseOr();
      if (this.current().type !== 'RPAREN') {
        throw new Error('Expected closing parenthesis');
      }
      this.advance();
      return result;
    }

    // Literals
    if (token.type === 'NUMBER') {
      this.advance();
      return token.value;
    }
    if (token.type === 'STRING') {
      this.advance();
      return token.value;
    }
    if (token.type === 'BOOLEAN') {
      this.advance();
      return token.value;
    }
    if (token.type === 'NULL') {
      this.advance();
      return null;
    }
    if (token.type === 'UNDEFINED') {
      this.advance();
      return undefined;
    }

    // Identifiers (variable access with optional property access)
    if (token.type === 'IDENTIFIER') {
      return this.parsePropertyAccess();
    }

    throw new Error(`Unexpected token: ${token.raw}`);
  }

  // Property access (e.g., object.property.nested)
  private parsePropertyAccess(): unknown {
    const firstToken = this.advance();
    const rootName = firstToken.value as string;

    // Security: Block dangerous root names
    if (BLOCKED_PROPERTIES.has(rootName)) {
      throw new Error(`Access to '${rootName}' is not allowed`);
    }

    // Get root value from variables
    let value: unknown = this.variables[rootName];

    // Handle dot notation property access
    while (this.current().value === '.') {
      this.advance(); // Skip the dot

      if (this.current().type !== 'IDENTIFIER') {
        throw new Error('Expected property name after dot');
      }

      const propName = this.advance().value as string;

      // Security: Block dangerous property access
      if (BLOCKED_PROPERTIES.has(propName)) {
        throw new Error(`Access to property '${propName}' is not allowed`);
      }

      // Navigate into the property
      if (value === null || value === undefined) {
        return undefined;
      }

      if (typeof value === 'object') {
        value = (value as Record<string, unknown>)[propName];
      } else {
        return undefined;
      }
    }

    return value;
  }
}

/**
 * Safely evaluate a condition expression against a set of variables.
 *
 * @param expression - The condition expression to evaluate
 * @param variables - The variables available for the expression
 * @returns The result of the expression, coerced to boolean for conditions
 * @throws Error if the expression contains unsafe constructs
 *
 * @example
 * safeEvaluate('score > 5', { score: 7 }) // true
 * safeEvaluate('status == "active"', { status: 'active' }) // true
 * safeEvaluate('user.age >= 18 && user.verified', { user: { age: 25, verified: true } }) // true
 * safeEvaluate('window.localStorage', {}) // throws Error
 */
export function safeEvaluate(expression: string, variables: Record<string, unknown>): unknown {
  if (!expression || typeof expression !== 'string') {
    return false;
  }

  const tokens = tokenize(expression.trim());
  const parser = new SafeExpressionParser(tokens, variables);
  return parser.parse();
}

/**
 * Safely evaluate a condition expression and return a boolean.
 * This is the main entry point for condition evaluation in flows.
 *
 * @param expression - The condition expression to evaluate
 * @param variables - The variables available for the expression
 * @returns Boolean result of the expression
 */
export function safeEvaluateCondition(
  expression: string,
  variables: Record<string, unknown>
): boolean {
  try {
    const result = safeEvaluate(expression, variables);
    return Boolean(result);
  } catch (error) {
    // Log the error for debugging, but don't expose to users
    console.warn('[SafeExpressionEvaluator] Expression evaluation failed:', error);
    // Default to false on error (fail-safe)
    return false;
  }
}

/**
 * Check if an expression is safe to evaluate.
 * Use this for validation before storing expressions.
 *
 * @param expression - The expression to validate
 * @returns Object with valid flag and optional error message
 */
export function validateExpression(expression: string): { valid: boolean; error?: string } {
  try {
    // Just tokenize to check for syntax errors and blocked identifiers
    tokenize(expression.trim());
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
