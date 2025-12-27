import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Check, Sparkles, RefreshCw } from 'lucide-react';
import { Modal, Button } from '../ui';
import { proposeInitialStrategies, discussStrategies, formatStrategyMessage } from '../../agents/strategy-advisor';
import type { CustomStrategy, StrategyMessage } from '../../types/strategy';
import { DEFAULT_STRATEGIES } from '../../types/strategy';
import { generateId } from '../../utils/id';
import { cn } from '../../utils/cn';

interface StrategyDiscussionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (strategies: CustomStrategy[]) => void;
  need: string;
  constraints?: string;
}

export function StrategyDiscussionModal({
  isOpen,
  onClose,
  onConfirm,
  need,
  constraints,
}: StrategyDiscussionModalProps) {
  const [messages, setMessages] = useState<StrategyMessage[]>([]);
  const [currentStrategies, setCurrentStrategies] = useState<CustomStrategy[]>(DEFAULT_STRATEGIES);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initialize with strategy proposal when modal opens
  useEffect(() => {
    if (isOpen && !hasInitialized) {
      initializeDiscussion();
    }
  }, [isOpen, hasInitialized]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setMessages([]);
      setCurrentStrategies(DEFAULT_STRATEGIES);
      setHasInitialized(false);
      setInputValue('');
    }
  }, [isOpen]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const initializeDiscussion = async () => {
    setIsLoading(true);
    setHasInitialized(true);

    try {
      const response = await proposeInitialStrategies(need, constraints);
      setMessages([response]);
      if (response.proposedStrategies) {
        setCurrentStrategies(response.proposedStrategies);
      }
    } catch (error) {
      console.error('Failed to initialize strategy discussion:', error);
      // Use default strategies on error
      setMessages([{
        id: generateId(),
        role: 'assistant',
        content: "I'll help you with strategy selection. Here are the default strategies to get started. Feel free to modify them:",
        timestamp: Date.now(),
        proposedStrategies: DEFAULT_STRATEGIES,
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: StrategyMessage = {
      id: generateId(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await discussStrategies([...messages, userMessage], userMessage.content, need);
      setMessages((prev) => [...prev, response]);
      if (response.proposedStrategies) {
        setCurrentStrategies(response.proposedStrategies);
      }
    } catch (error) {
      console.error('Failed to discuss strategies:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: 'assistant',
          content: "I apologize, but I encountered an error. Please try again or proceed with the current strategies.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, messages, need]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleConfirm = () => {
    onConfirm(currentStrategies);
  };

  const handleRegenerate = () => {
    setMessages([]);
    setHasInitialized(false);
    initializeDiscussion();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="flex flex-col h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Strategy Discussion</h2>
              <p className="text-sm text-gray-500">Define 4 unique approaches for your agent</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRegenerate} disabled={isLoading}>
            <RefreshCw className={cn("w-4 h-4 mr-1", isLoading && "animate-spin")} />
            Restart
          </Button>
        </div>

        {/* Main content area */}
        <div className="flex flex-1 gap-4 mt-4 overflow-hidden">
          {/* Chat area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex',
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-xl px-4 py-3',
                      message.role === 'user'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    )}
                  >
                    <div className="text-sm whitespace-pre-wrap">
                      {formatStrategyMessage(message.content)}
                    </div>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 text-gray-500">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.1s]" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="mt-4 flex gap-2">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Share your thoughts on the strategies..."
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                rows={2}
                disabled={isLoading}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isLoading}
                className="self-end"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Strategy preview sidebar */}
          <div className="w-72 flex flex-col border-l border-gray-200 pl-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Current Strategies</h3>
            <div className="flex-1 overflow-y-auto space-y-3">
              {currentStrategies.map((strategy) => (
                <div
                  key={strategy.label}
                  className="p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center">
                      {strategy.label}
                    </span>
                    <span className="font-medium text-gray-900 text-sm">{strategy.name}</span>
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2">{strategy.description}</p>
                </div>
              ))}
            </div>

            {/* Confirm button */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <Button
                onClick={handleConfirm}
                className="w-full"
                disabled={isLoading || messages.length === 0}
              >
                <Check className="w-4 h-4 mr-2" />
                Confirm & Generate
              </Button>
              <p className="text-xs text-gray-500 text-center mt-2">
                This will create 4 agents with these strategies
              </p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
