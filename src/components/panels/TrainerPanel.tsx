import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Trash2 } from 'lucide-react';
import { Button, Textarea } from '../ui';
import { ActionProposalCard } from './ActionProposalCard';
import type { TrainerMessage, TrainerAction } from '../../types';

interface TrainerPanelProps {
  messages: TrainerMessage[];
  onSendMessage: (message: string) => void;
  onApplyActions?: (actions: TrainerAction[]) => Promise<void>;
  onResetChat?: () => void;
  isLoading?: boolean;
}

export function TrainerPanel({ messages, onSendMessage, onApplyActions, onResetChat, isLoading = false }: TrainerPanelProps) {
  const [input, setInput] = useState('');
  const [applyingMessageId, setApplyingMessageId] = useState<string | null>(null);
  const [dismissedActions, setDismissedActions] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleApplyActions = async (messageId: string, actions: TrainerAction[]) => {
    if (!onApplyActions) return;
    setApplyingMessageId(messageId);
    try {
      await onApplyActions(actions);
      // Mark as dismissed after successful apply
      setDismissedActions(prev => new Set([...prev, messageId]));
    } finally {
      setApplyingMessageId(null);
    }
  };

  const handleDiscardActions = (messageId: string) => {
    setDismissedActions(prev => new Set([...prev, messageId]));
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Master Trainer</h3>
            <p className="text-xs text-gray-500">AI-powered evolution guidance</p>
          </div>
        </div>
        {onResetChat && messages.length > 0 && (
          <button
            onClick={onResetChat}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Reset Chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <Bot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">
              I'm your Master Trainer. I'll help evolve your lineages based on your feedback.
            </p>
          </div>
        )}
        {messages.map((message) => {
          const hasActions = message.actions && message.actions.length > 0;
          const showActions = hasActions && !dismissedActions.has(message.id);

          return (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  message.role === 'user'
                    ? 'bg-gray-100'
                    : 'bg-primary-100'
                }`}
              >
                {message.role === 'user' ? (
                  <User className="w-4 h-4 text-gray-600" />
                ) : (
                  <Bot className="w-4 h-4 text-primary-600" />
                )}
              </div>
              <div
                className={`flex-1 rounded-lg p-3 ${
                  message.role === 'user'
                    ? 'bg-gray-100 text-gray-800'
                    : 'bg-primary-50 text-gray-800'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>

                {showActions && message.actions && (
                  <ActionProposalCard
                    actions={message.actions}
                    onApply={(actions) => handleApplyActions(message.id, actions)}
                    onDiscard={() => handleDiscardActions(message.id)}
                    isApplying={applyingMessageId === message.id}
                  />
                )}
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary-600" />
            </div>
            <div className="bg-primary-50 rounded-lg p-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce delay-100" />
                <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce delay-200" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-100">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about training strategy..."
            rows={2}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <Button type="submit" disabled={!input.trim() || isLoading}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
