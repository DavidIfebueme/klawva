'use client';

import React, { useRef, useState } from 'react';

interface DocxUploadProps {
  onTextExtracted: (text: string) => void;
  disabled?: boolean;
}

export function DocxUpload({ onTextExtracted, disabled = false }: DocxUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.docx')) {
      setError('Please upload a .docx file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File must be under 5MB');
      return;
    }

    setError(null);
    setFileName(file.name);
    setUploading(true);

    try {
      const mammoth = await import('mammoth');
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      if (result.value.trim()) {
        onTextExtracted(result.value.trim());
      } else {
        setError('Document contains no text');
        setFileName(null);
      }
    } catch {
      setError('Failed to parse .docx file');
      setFileName(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".docx"
        onChange={handleChange}
        className="hidden"
        disabled={disabled || uploading}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
        className="flex items-center gap-2 px-4 py-2 bg-[#111111] border border-klawva-border rounded font-mono text-sm text-klawva-muted hover:border-klawva-accent hover:text-klawva-accent transition-colors disabled:opacity-50"
      >
        {uploading ? (
          <>
            <span className="animate-spin">⏳</span>
            Parsing...
          </>
        ) : fileName ? (
          <>
            <span className="text-klawva-accent">✓</span>
            {fileName}
          </>
        ) : (
          <>
            <span>📎</span>
            Choose .docx file
          </>
        )}
      </button>
      {error && (
        <p className="font-mono text-klawva-orange text-xs">{error}</p>
      )}
    </div>
  );
}
