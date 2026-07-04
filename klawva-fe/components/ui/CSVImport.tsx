'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Upload, X, Check, FileDown } from 'lucide-react';
import { parseProductCSV, productsToPlainText } from '../../lib/csv';
import { Button } from './Button';

interface CSVImportProps {
  onImport: (plainText: string) => void;
}

const SAMPLE_CSV = `name,price,description,stock
Product A,5000 NGN,High quality widget,10
Product B,3000 NGN,Another great item,5
Product C,7500 NGN,Premium option,2`;

const ALLOWED_EXTENSIONS = new Set(['.csv', '.txt']);

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    invoke: (...args: Parameters<T>) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delayMs);
    },
    cancel: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

export function CSVImport({ onImport }: CSVImportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [csvContent, setCsvContent] = useState('');
  const [parsedProducts, setParsedProducts] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseCSV = useCallback((content: string) => {
    setIsParsing(true);
    setError('');

    setTimeout(() => {
      try {
        const products = parseProductCSV(content);
        setParsedProducts(products);
        if (products.length === 0) {
          setError('No products found. Check CSV format.');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to parse CSV.';
        setError(message);
        setParsedProducts([]);
      } finally {
        setIsParsing(false);
      }
    }, 0);
  }, []);

  const debouncedParseCSV = useMemo(
    () => debounce((content: string) => parseCSV(content), 300),
    [parseCSV],
  );

  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const validateFile = (file: File): boolean => {
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      setError('Please upload a .csv or .txt file.');
      return false;
    }
    if (file.size > 1024 * 1024) {
      setError('File too large. Max size is 1MB.');
      return false;
    }
    return true;
  };

  const handleFile = (file: File) => {
    setError('');
    if (!validateFile(file)) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content !== 'string') {
        setError('Failed to read file.');
        return;
      }
      setCsvContent(content);
      parseCSV(content);
    };
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleUseData = () => {
    const plainText = productsToPlainText(parsedProducts);
    onImport(plainText);
    setIsOpen(false);
    setCsvContent('');
    setParsedProducts([]);
    setError('');
  };

  const downloadTemplate = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'klawva-products-template.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1 text-xs text-klawva-accent hover:text-klawva-text transition-colors"
      >
        <Upload size={12} />
        Import CSV
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}
    >
      <div className="bg-klawva-surface border border-klawva-border rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-syne font-bold text-lg text-klawva-text">Import Products CSV</h3>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="text-klawva-muted hover:text-klawva-text"
          >
            <X size={20} />
          </button>
        </div>

        <button
          type="button"
          onClick={downloadTemplate}
          className="flex items-center gap-2 text-xs text-klawva-accent hover:text-klawva-text mb-4"
        >
          <FileDown size={14} />
          Download template CSV
        </button>

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragging ? 'border-klawva-accent bg-klawva-accent/5' : 'border-klawva-border hover:border-klawva-accent'
          }`}
        >
          <Upload size={32} className="text-klawva-muted mx-auto mb-4" />
          <p className="text-sm text-klawva-muted">Click to upload or drag & drop a CSV file</p>
          <p className="text-xs text-klawva-dim mt-2">Max 1MB · .csv or .txt</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="hidden"
        />

        <div className="mt-4">
          <p className="text-xs text-klawva-muted mb-2">Or paste CSV content:</p>
          <textarea
            value={csvContent}
            onChange={(e) => {
              const content = e.target.value;
              setCsvContent(content);
              setError('');
              setParsedProducts([]);
              if (content.trim()) {
                debouncedParseCSV.invoke(content);
              } else {
                debouncedParseCSV.cancel();
                setIsParsing(false);
              }
            }}
            placeholder="name,price,description,stock&#10;Product A,5000,High quality widget,10"
            className="w-full h-32 bg-klawva-bg border border-klawva-border rounded p-3 text-xs font-mono text-klawva-text focus:border-klawva-accent focus:outline-none"
          />
        </div>

        {isParsing && <p className="text-xs text-klawva-muted mt-2">Parsing...</p>}
        {error && <p className="text-xs text-klawva-orange mt-2">{error}</p>}

        {parsedProducts.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-klawva-muted mb-2">
              Preview ({parsedProducts.length} products):
            </p>
            <div className="max-h-48 overflow-y-auto border border-klawva-border rounded">
              <table className="w-full text-xs">
                <thead className="bg-klawva-bg sticky top-0">
                  <tr>
                    {Object.keys(parsedProducts[0]).slice(0, 4).map((h) => (
                      <th key={h} className="p-2 text-left text-klawva-muted capitalize">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedProducts.slice(0, 10).map((p, i) => (
                    <tr key={i} className="border-t border-klawva-border">
                      {Object.values(p).slice(0, 4).map((v, j) => (
                        <td key={j} className="p-2 text-klawva-text truncate max-w-[150px]">
                          {String(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsedProducts.length > 10 && (
              <p className="text-xs text-klawva-dim mt-1">
                ...and {parsedProducts.length - 10} more
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleUseData}
            disabled={parsedProducts.length === 0 || isParsing}
          >
            <Check size={16} className="mr-2" />
            Use This Data
          </Button>
        </div>
      </div>
    </div>
  );
}
