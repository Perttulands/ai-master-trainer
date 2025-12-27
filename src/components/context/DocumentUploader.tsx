import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../utils/cn';

interface DocumentUploaderProps {
  sessionId: string;
  onUpload: (doc: {
    sessionId: string;
    name: string;
    content: string;
    type: 'document' | 'reference' | 'style_guide';
  }) => void;
}

export function DocumentUploader({ sessionId, onUpload }: DocumentUploaderProps) {
  const [preview, setPreview] = useState<{ name: string; content: string } | null>(null);
  const [docType, setDocType] = useState<'document' | 'reference' | 'style_guide'>('document');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setPreview({ name: file.name, content: reader.result as string });
    };
    reader.readAsText(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'application/json': ['.json'],
    },
    maxFiles: 1,
  });

  const handleUpload = () => {
    if (!preview) return;
    onUpload({ sessionId, name: preview.name, content: preview.content, type: docType });
    setPreview(null);
  };

  const handleClear = () => setPreview(null);

  return (
    <div className="space-y-3">
      {!preview ? (
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
            isDragActive
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
          )}
        >
          <input {...getInputProps()} />
          <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p className="text-sm text-gray-600">
            {isDragActive ? 'Drop file here' : 'Drag & drop or click to upload'}
          </p>
          <p className="text-xs text-gray-400 mt-1">.txt, .md, .json files accepted</p>
        </div>
      ) : (
        <div className="border rounded-lg p-4 bg-gray-50">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-5 h-5 text-gray-500" />
            <span className="text-sm font-medium text-gray-700 truncate flex-1">
              {preview.name}
            </span>
            <button onClick={handleClear} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">Document Type</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as typeof docType)}
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="document">Document</option>
              <option value="reference">Reference</option>
              <option value="style_guide">Style Guide</option>
            </select>
          </div>
          <Button onClick={handleUpload} size="sm" className="w-full">
            Add Document
          </Button>
        </div>
      )}
    </div>
  );
}
