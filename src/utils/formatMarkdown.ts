/**
 * Lightweight Markdown Formatter
 *
 * Converts basic markdown syntax to HTML without external dependencies.
 * Supports: bold, italic, headers, code blocks, inline code, line breaks.
 *
 * For full markdown support, consider adding react-markdown package.
 */

/**
 * Convert markdown text to HTML for display.
 *
 * @param text - The markdown text to convert
 * @returns HTML string ready for dangerouslySetInnerHTML
 *
 * @example
 * formatMarkdownLite('**bold** and *italic*')
 * // Returns: '<strong>bold</strong> and <em>italic</em>'
 */
export function formatMarkdownLite(text: string): string {
  if (!text) return '';

  let html = text
    // Escape HTML special characters first (security)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

    // Code blocks (must come before other formatting to protect code content)
    // Match ```language\ncode\n``` or just ```code```
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, lang, code) => {
      const langClass = lang ? ` class="language-${lang}"` : '';
      return `<pre><code${langClass}>${code.trim()}</code></pre>`;
    })

    // Inline code (must come before other formatting)
    .replace(/`([^`]+)`/g, '<code>$1</code>')

    // Headers (must match from start of line)
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>')

    // Bold (must come before italic to handle ***text*** correctly)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')

    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')

    // Unordered lists (simple - just bullets)
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4">$1</li>')

    // Ordered lists (simple)
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')

    // Horizontal rules
    .replace(/^---+$/gm, '<hr class="my-4 border-gray-300" />')

    // Paragraphs (double newlines)
    .replace(/\n\n+/g, '</p><p class="my-2">')

    // Single line breaks
    .replace(/\n/g, '<br />');

  // Wrap in paragraph if not starting with a block element
  if (!html.startsWith('<h') && !html.startsWith('<pre') && !html.startsWith('<hr')) {
    html = `<p class="my-2">${html}</p>`;
  }

  return html;
}

/**
 * Strip all markdown formatting and return plain text.
 * Useful for previews or text-only contexts.
 *
 * @param text - The markdown text to strip
 * @returns Plain text without markdown syntax
 */
export function stripMarkdown(text: string): string {
  if (!text) return '';

  return text
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    // Remove italic
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Remove list markers
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    // Remove horizontal rules
    .replace(/^---+$/gm, '')
    // Normalize whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
