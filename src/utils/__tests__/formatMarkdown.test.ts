/**
 * Markdown Formatter Tests
 *
 * Tests for the lightweight markdown formatter utility.
 */

import { describe, it, expect } from 'vitest';
import { formatMarkdownLite, stripMarkdown } from '../formatMarkdown';

describe('formatMarkdownLite', () => {
  describe('basic text handling', () => {
    it('returns empty string for empty input', () => {
      expect(formatMarkdownLite('')).toBe('');
    });

    it('returns empty string for null/undefined', () => {
      expect(formatMarkdownLite(null as unknown as string)).toBe('');
      expect(formatMarkdownLite(undefined as unknown as string)).toBe('');
    });

    it('wraps plain text in paragraph', () => {
      const result = formatMarkdownLite('Hello world');
      expect(result).toContain('<p');
      expect(result).toContain('Hello world');
    });
  });

  describe('HTML escaping (security)', () => {
    it('escapes HTML special characters', () => {
      const result = formatMarkdownLite('<script>alert("xss")</script>');
      expect(result).toContain('&lt;script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('escapes ampersands', () => {
      const result = formatMarkdownLite('Tom & Jerry');
      expect(result).toContain('&amp;');
    });

    it('escapes greater than signs', () => {
      const result = formatMarkdownLite('5 > 3');
      expect(result).toContain('&gt;');
    });
  });

  describe('code formatting', () => {
    it('formats inline code', () => {
      const result = formatMarkdownLite('Use `console.log()` for debugging');
      expect(result).toContain('<code>console.log()</code>');
    });

    it('formats code blocks', () => {
      const result = formatMarkdownLite('```\nconst x = 1;\n```');
      expect(result).toContain('<pre><code>');
      expect(result).toContain('const x = 1;');
    });

    it('formats code blocks with language hint', () => {
      const result = formatMarkdownLite('```javascript\nconst x = 1;\n```');
      expect(result).toContain('class="language-javascript"');
    });

    it('formats code blocks with special characters', () => {
      const result = formatMarkdownLite('```\nconst x = 1;\n```');
      // Code blocks should have pre and code tags
      expect(result).toContain('<pre><code>');
      expect(result).toContain('const x = 1;');
    });
  });

  describe('headers', () => {
    it('formats h1 headers', () => {
      const result = formatMarkdownLite('# Main Title');
      expect(result).toContain('<h1');
      expect(result).toContain('Main Title');
    });

    it('formats h2 headers', () => {
      const result = formatMarkdownLite('## Section');
      expect(result).toContain('<h2');
      expect(result).toContain('Section');
    });

    it('formats h3 headers', () => {
      const result = formatMarkdownLite('### Subsection');
      expect(result).toContain('<h3');
      expect(result).toContain('Subsection');
    });

    it('only formats headers at start of line', () => {
      const result = formatMarkdownLite('Not a # header');
      expect(result).not.toContain('<h1');
    });
  });

  describe('emphasis', () => {
    it('formats bold with **', () => {
      const result = formatMarkdownLite('This is **bold** text');
      expect(result).toContain('<strong>bold</strong>');
    });

    it('formats bold with __', () => {
      const result = formatMarkdownLite('This is __bold__ text');
      expect(result).toContain('<strong>bold</strong>');
    });

    it('formats italic with *', () => {
      const result = formatMarkdownLite('This is *italic* text');
      expect(result).toContain('<em>italic</em>');
    });

    it('formats italic with _', () => {
      const result = formatMarkdownLite('This is _italic_ text');
      expect(result).toContain('<em>italic</em>');
    });

    it('handles nested emphasis', () => {
      const result = formatMarkdownLite('This is **bold and *italic* inside**');
      expect(result).toContain('<strong>');
      expect(result).toContain('<em>');
    });
  });

  describe('lists', () => {
    it('formats unordered lists with -', () => {
      const result = formatMarkdownLite('- Item 1\n- Item 2');
      expect(result).toContain('<li');
      expect(result).toContain('Item 1');
      expect(result).toContain('Item 2');
    });

    it('formats unordered lists with *', () => {
      const result = formatMarkdownLite('* Item 1\n* Item 2');
      expect(result).toContain('<li');
    });

    it('formats ordered lists', () => {
      const result = formatMarkdownLite('1. First\n2. Second');
      expect(result).toContain('<li');
      expect(result).toContain('list-decimal');
    });
  });

  describe('horizontal rules', () => {
    it('formats horizontal rules', () => {
      const result = formatMarkdownLite('Above\n---\nBelow');
      expect(result).toContain('<hr');
    });

    it('handles multiple dashes', () => {
      const result = formatMarkdownLite('------');
      expect(result).toContain('<hr');
    });
  });

  describe('line breaks and paragraphs', () => {
    it('converts single newlines to br', () => {
      const result = formatMarkdownLite('Line 1\nLine 2');
      expect(result).toContain('<br />');
    });

    it('converts double newlines to paragraph breaks', () => {
      const result = formatMarkdownLite('Para 1\n\nPara 2');
      expect(result).toContain('</p><p');
    });
  });

  describe('block element detection', () => {
    it('does not wrap headers in paragraph', () => {
      const result = formatMarkdownLite('# Header');
      expect(result.startsWith('<h1')).toBe(true);
    });

    it('does not wrap code blocks in paragraph', () => {
      const result = formatMarkdownLite('```\ncode\n```');
      expect(result.startsWith('<pre')).toBe(true);
    });

    it('does not wrap horizontal rules in paragraph', () => {
      const result = formatMarkdownLite('---');
      expect(result.startsWith('<hr')).toBe(true);
    });
  });
});

describe('stripMarkdown', () => {
  describe('basic text handling', () => {
    it('returns empty string for empty input', () => {
      expect(stripMarkdown('')).toBe('');
    });

    it('returns empty string for null/undefined', () => {
      expect(stripMarkdown(null as unknown as string)).toBe('');
      expect(stripMarkdown(undefined as unknown as string)).toBe('');
    });

    it('returns plain text unchanged', () => {
      expect(stripMarkdown('Hello world')).toBe('Hello world');
    });
  });

  describe('code removal', () => {
    it('removes code blocks', () => {
      expect(stripMarkdown('Before\n```\ncode\n```\nAfter')).toBe('Before\n\nAfter');
    });

    it('removes inline code but keeps content', () => {
      expect(stripMarkdown('Use `console.log()` here')).toBe('Use console.log() here');
    });
  });

  describe('header removal', () => {
    it('removes h1 markers', () => {
      expect(stripMarkdown('# Title')).toBe('Title');
    });

    it('removes h2 markers', () => {
      expect(stripMarkdown('## Section')).toBe('Section');
    });

    it('removes h3 markers', () => {
      expect(stripMarkdown('### Subsection')).toBe('Subsection');
    });

    it('removes multiple header levels', () => {
      expect(stripMarkdown('###### Deep header')).toBe('Deep header');
    });
  });

  describe('emphasis removal', () => {
    it('removes bold ** markers', () => {
      expect(stripMarkdown('This is **bold** text')).toBe('This is bold text');
    });

    it('removes bold __ markers', () => {
      expect(stripMarkdown('This is __bold__ text')).toBe('This is bold text');
    });

    it('removes italic * markers', () => {
      expect(stripMarkdown('This is *italic* text')).toBe('This is italic text');
    });

    it('removes italic _ markers', () => {
      expect(stripMarkdown('This is _italic_ text')).toBe('This is italic text');
    });
  });

  describe('list marker removal', () => {
    it('removes unordered list markers (-)', () => {
      expect(stripMarkdown('- Item 1\n- Item 2')).toBe('Item 1\nItem 2');
    });

    it('removes unordered list markers (*)', () => {
      expect(stripMarkdown('* Item 1\n* Item 2')).toBe('Item 1\nItem 2');
    });

    it('removes ordered list markers', () => {
      expect(stripMarkdown('1. First\n2. Second')).toBe('First\nSecond');
    });
  });

  describe('horizontal rule removal', () => {
    it('removes horizontal rules', () => {
      expect(stripMarkdown('Above\n---\nBelow')).toBe('Above\n\nBelow');
    });
  });

  describe('whitespace normalization', () => {
    it('collapses multiple newlines', () => {
      expect(stripMarkdown('Line 1\n\n\n\nLine 2')).toBe('Line 1\n\nLine 2');
    });

    it('trims leading and trailing whitespace', () => {
      expect(stripMarkdown('  Hello world  ')).toBe('Hello world');
    });
  });

  describe('complex documents', () => {
    it('strips a complete markdown document', () => {
      const markdown = `# Title

This is **bold** and *italic* text.

## Section

- Item 1
- Item 2

\`\`\`
code block
\`\`\`

Use \`inline code\` here.

---

The end.`;

      const result = stripMarkdown(markdown);

      expect(result).not.toContain('#');
      expect(result).not.toContain('**');
      expect(result).not.toContain('*');
      expect(result).not.toContain('```');
      expect(result).not.toContain('---');
      expect(result).toContain('Title');
      expect(result).toContain('bold');
      expect(result).toContain('italic');
      expect(result).toContain('inline code');
    });
  });
});
