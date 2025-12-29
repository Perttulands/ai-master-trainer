import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, History, Download, RefreshCw, Zap, ZapOff } from 'lucide-react';
import { Button, ModelSelector } from '../ui';
import type { Session } from '../../types';
import { isLLMConfigured } from '../../api/llm';

interface HeaderProps {
  session?: Session | null;
  onRegenerate?: () => void;
  canRegenerate?: boolean;
  isRegenerating?: boolean;
  onExport?: () => void;
}

export function Header({
  session,
  onRegenerate,
  canRegenerate = false,
  isRegenerating = false,
  onExport,
}: HeaderProps) {
  const navigate = useNavigate();
  const llmConnected = isLLMConfigured();

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {session ? (
            <button
              onClick={() => navigate('/')}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">TC</span>
              </div>
              <span className="font-bold text-gray-900">Training Camp</span>
            </Link>
          )}
          {!session && (
            <>
              <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${llmConnected ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {llmConnected ? <Zap className="w-3 h-3" /> : <ZapOff className="w-3 h-3" />}
                {llmConnected ? 'LLM Connected' : 'Mock Mode'}
              </div>
              {llmConnected && (
                <div className="flex items-center gap-2">
                  <ModelSelector mode="trainer" />
                  <ModelSelector mode="agent" />
                </div>
              )}
            </>
          )}
          {session && (
            <div>
              <h1 className="font-semibold text-gray-900">{session.name}</h1>
              <p className="text-xs text-gray-500 truncate max-w-md">{session.need}</p>
            </div>
          )}
        </div>

        {session && (
          <div className="flex items-center gap-3">
            {llmConnected && (
              <div className="flex items-center gap-2">
                <ModelSelector mode="trainer" />
                <ModelSelector mode="agent" />
              </div>
            )}
            <div className="h-6 w-px bg-gray-200" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/session/${session.id}/history`)}
            >
              <History className="w-4 h-4 mr-1" />
              History
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onExport}
              disabled={!onExport}
            >
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
            {onRegenerate && (
              <Button
                onClick={onRegenerate}
                disabled={!canRegenerate || isRegenerating}
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${isRegenerating ? 'animate-spin' : ''}`} />
                {isRegenerating ? 'Regenerating...' : 'Regenerate Unlocked'}
              </Button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
