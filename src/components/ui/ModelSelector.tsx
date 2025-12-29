import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Sparkles, Zap, Gauge, Brain, Bot } from 'lucide-react';
import { useModelStore, AVAILABLE_MODELS, type ModelInfo } from '../../store/model';
import { cn } from '../../utils/cn';

const TIER_CONFIG = {
  'high-end': {
    icon: Sparkles,
    label: 'High-End',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
  standard: {
    icon: Zap,
    label: 'Standard',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  economy: {
    icon: Gauge,
    label: 'Economy',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
};

const MODE_CONFIG = {
  trainer: {
    label: 'Trainer',
    description: 'Model for evolution and planning',
    icon: Brain,
    accentColor: 'text-violet-600',
    accentBg: 'bg-violet-50',
    accentBorder: 'border-violet-200',
  },
  agent: {
    label: 'Agent',
    description: 'Model for generated agents',
    icon: Bot,
    accentColor: 'text-sky-600',
    accentBg: 'bg-sky-50',
    accentBorder: 'border-sky-200',
  },
};

interface ModelSelectorProps {
  mode: 'trainer' | 'agent';
}

export function ModelSelector({ mode }: ModelSelectorProps) {
  const store = useModelStore();

  const selectedModelId = mode === 'trainer' ? store.trainerModelId : store.agentModelId;
  const setModel = mode === 'trainer' ? store.setTrainerModel : store.setAgentModel;
  const getModel = mode === 'trainer' ? store.getTrainerModel : store.getAgentModel;
  const modeConfig = MODE_CONFIG[mode];
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedModel = getModel();
  const ModeIcon = modeConfig.icon;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (model: ModelInfo) => {
    setModel(model.id);
    setIsOpen(false);
  };

  // Group models by tier
  const modelsByTier = {
    'high-end': AVAILABLE_MODELS.filter((m) => m.tier === 'high-end'),
    standard: AVAILABLE_MODELS.filter((m) => m.tier === 'standard'),
    economy: AVAILABLE_MODELS.filter((m) => m.tier === 'economy'),
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors',
          modeConfig.accentBg,
          modeConfig.accentBorder,
          'hover:opacity-80'
        )}
        title={modeConfig.description}
      >
        <ModeIcon className={cn('w-4 h-4', modeConfig.accentColor)} />
        <span className={cn('text-xs font-semibold', modeConfig.accentColor)}>
          {modeConfig.label}:
        </span>
        <span className="font-medium text-gray-700 max-w-[100px] truncate">
          {selectedModel?.name || 'Select'}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
          <div className={cn('p-2 border-b border-gray-100', modeConfig.accentBg)}>
            <p className={cn('text-xs font-medium', modeConfig.accentColor)}>
              {modeConfig.label} Model: {modeConfig.description}
            </p>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {(Object.entries(modelsByTier) as [ModelInfo['tier'], ModelInfo[]][]).map(([tier, models]) => {
              const config = TIER_CONFIG[tier];
              const Icon = config.icon;

              return (
                <div key={tier}>
                  <div className={cn('px-3 py-2 flex items-center gap-2', config.bgColor)}>
                    <Icon className={cn('w-4 h-4', config.color)} />
                    <span className={cn('text-xs font-semibold uppercase', config.color)}>
                      {config.label}
                    </span>
                  </div>

                  {models.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => handleSelect(model)}
                      className={cn(
                        'w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors flex items-start gap-3',
                        selectedModelId === model.id && 'bg-primary-50'
                      )}
                    >
                      <div
                        className={cn(
                          'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                          selectedModelId === model.id ? 'bg-primary-500' : 'bg-gray-300'
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 text-sm">{model.name}</span>
                          <span className="text-xs text-gray-400">{model.provider}</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{model.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          <div className="p-2 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-400 text-center">
              Model selection persists across sessions
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
