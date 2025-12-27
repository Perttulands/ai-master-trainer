import { useState } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import { Copy, Check } from 'lucide-react';
import { cn } from '../../utils/cn';

interface PromptViewerProps {
  prompt: string;
  className?: string;
  maxHeight?: string;
}

export function PromptViewer({ prompt, className, maxHeight = '400px' }: PromptViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('relative rounded-lg border border-gray-200 bg-gray-50', className)}>
      {/* Copy button */}
      <button
        onClick={handleCopy}
        className={cn(
          'absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
          'bg-white border border-gray-200 shadow-sm',
          'hover:bg-gray-50 hover:border-gray-300',
          'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1',
          copied && 'text-green-600 border-green-300 bg-green-50'
        )}
        aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5" />
            <span>Copied!</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5" />
            <span>Copy</span>
          </>
        )}
      </button>

      {/* Scrollable content area */}
      <div
        className="overflow-auto"
        style={{ maxHeight }}
      >
        <Highlight
          theme={themes.vsLight}
          code={prompt}
          language="markdown"
        >
          {({ className: highlightClassName, style, tokens, getLineProps, getTokenProps }) => (
            <pre
              className={cn(
                highlightClassName,
                'p-4 pr-20 text-sm font-mono leading-relaxed',
                'bg-transparent'
              )}
              style={{ ...style, backgroundColor: 'transparent' }}
            >
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  );
}

PromptViewer.displayName = 'PromptViewer';
