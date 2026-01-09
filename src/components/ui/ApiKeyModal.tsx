import { useState, useEffect } from "react";
import { Key } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { Input } from "./Input";
import { useModelStore } from "../../store/model";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiKeyModal({ isOpen, onClose }: ApiKeyModalProps) {
  const { apiKey, setApiKey } = useModelStore();
  const [key, setKey] = useState(apiKey || "");

  useEffect(() => {
    setKey(apiKey || "");
  }, [apiKey, isOpen]);

  const handleSave = () => {
    setApiKey(key.trim() || null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Set API Key" size="md">
      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
          <div className="p-2 bg-blue-100 rounded-lg h-fit">
            <Key className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-medium text-blue-900">
              LiteLLM API Key Required
            </h3>
            <p className="text-sm text-blue-700 mt-1">
              To use the advanced features of Training Camp, you need to provide
              your LiteLLM API key. This key is stored locally in your browser.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="apiKey" className="text-sm font-medium text-gray-700">
            API Key
          </label>
          <Input
            id="apiKey"
            type="password"
            placeholder="sk-..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="font-mono"
          />
          <p className="text-xs text-gray-500">
            Your key is never sent to our servers, only to the LiteLLM proxy.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save API Key</Button>
        </div>
      </div>
    </Modal>
  );
}
