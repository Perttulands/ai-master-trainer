import { useState, useEffect } from 'react';
import { Key, Globe } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { useModelStore } from '../../store/model';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Get env var default for display hint
const ENV_BASE_URL = import.meta.env.VITE_LITELLM_API_BASE || '';

export function ApiKeyModal({ isOpen, onClose }: ApiKeyModalProps) {
  const { apiKey, apiBaseUrl, setApiKey, setApiBaseUrl } = useModelStore();
  const [key, setKey] = useState(apiKey || '');
  const [baseUrl, setBaseUrl] = useState(apiBaseUrl || ENV_BASE_URL || '');

  useEffect(() => {
    setKey(apiKey || '');
    setBaseUrl(apiBaseUrl || ENV_BASE_URL || '');
  }, [apiKey, apiBaseUrl, isOpen]);

  const handleSave = () => {
    setApiKey(key.trim() || null);
    setApiBaseUrl(baseUrl.trim() || null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="LLM Configuration"
      size="md"
    >
      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
          <div className="p-2 bg-blue-100 rounded-lg h-fit">
            <Key className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-medium text-blue-900">LiteLLM Configuration</h3>
            <p className="text-sm text-blue-700 mt-1">
              Configure your LiteLLM proxy connection. Both values are stored locally in your browser.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="apiBaseUrl" className="text-sm font-medium text-gray-700">
            API Base URL
          </label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              id="apiBaseUrl"
              type="url"
              placeholder="https://your-litellm-proxy.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="pl-10 font-mono"
            />
          </div>
          <p className="text-xs text-gray-500">
            The URL of your LiteLLM proxy endpoint (without /v1/chat/completions).
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="apiKey" className="text-sm font-medium text-gray-700">
            API Key
          </label>
          <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              id="apiKey"
              type="password"
              placeholder="sk-..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="pl-10 font-mono"
            />
          </div>
          <p className="text-xs text-gray-500">
            Your LiteLLM API key for authentication.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Configuration
          </Button>
        </div>
      </div>
    </Modal>
  );
}
