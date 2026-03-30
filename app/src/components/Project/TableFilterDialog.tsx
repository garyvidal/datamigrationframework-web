// TableFilterDialog — Portal dialog for adding/editing a SQL WHERE clause on a table,
// with column name autocomplete suggestions.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as ReactDOM from 'react-dom';

export interface ColumnInfo {
  name: string;
  type: string;
  primaryKey?: boolean;
}

interface TableFilterDialogProps {
  tableName: string;
  schemaName: string;
  currentFilter?: string;
  columns?: ColumnInfo[];
  onSave: (whereClause: string | undefined) => void;
  onClose: () => void;
}

/** Returns the identifier token immediately before the cursor (letters, digits, underscores). */
function getTokenAtCursor(text: string, cursor: number): string {
  const before = text.substring(0, cursor);
  const match = before.match(/[\w]+$/);
  return match ? match[0] : '';
}

/** Replaces the token immediately before the cursor with `replacement`. */
function replaceToken(text: string, cursor: number, replacement: string): { newText: string; newCursor: number } {
  const before = text.substring(0, cursor);
  const match = before.match(/[\w]+$/);
  const tokenStart = match ? cursor - match[0].length : cursor;
  const newText = text.substring(0, tokenStart) + replacement + text.substring(cursor);
  return { newText, newCursor: tokenStart + replacement.length };
}

export const TableFilterDialog: React.FC<TableFilterDialogProps> = ({
  tableName,
  schemaName,
  currentFilter,
  columns = [],
  onSave,
  onClose,
}) => {
  const [value, setValue] = useState(currentFilter ?? '');
  const [cursor, setCursor] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [suppressSuggest, setSuppressSuggest] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    setValue(currentFilter ?? '');
  }, [currentFilter]);

  const token = suppressSuggest ? '' : getTokenAtCursor(value, cursor);

  const suggestions = token.length > 0
    ? columns.filter(c => c.name.toLowerCase().startsWith(token.toLowerCase()) && c.name.toLowerCase() !== token.toLowerCase())
    : [];

  // Reset active index when suggestion list changes
  useEffect(() => {
    setActiveIdx(0);
  }, [suggestions.length]);

  const applySuggestion = useCallback((col: ColumnInfo) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? cursor;
    const { newText, newCursor } = replaceToken(value, pos, col.name);
    setValue(newText);
    setSuppressSuggest(true);
    // Restore focus and cursor position
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
      setCursor(newCursor);
      setSuppressSuggest(false);
    }, 0);
  }, [value, cursor]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSuppressSuggest(false);
    setValue(e.target.value);
    setCursor(e.target.selectionStart ?? 0);
  };

  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    setCursor(ta.selectionStart ?? 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySuggestion(suggestions[activeIdx]);
        return;
      }
      if (e.key === 'Escape') {
        setSuppressSuggest(true);
        return;
      }
    } else {
      if (e.key === 'Escape') {
        onClose();
      }
    }
  };

  const handleSave = () => {
    const trimmed = value.trim();
    onSave(trimmed.length > 0 ? trimmed : undefined);
  };

  const handleClear = () => {
    onSave(undefined);
  };

  const dialog = (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-slate-700 rounded-lg shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-600">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">SQL WHERE Filter</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              <span className="font-mono text-blue-600 dark:text-blue-300">{schemaName}.{tableName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none w-7 h-7 flex items-center justify-center"
          >
            &#x2715;
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
            WHERE clause <span className="text-gray-400 dark:text-gray-500 font-normal">(omit the WHERE keyword)</span>
          </label>

          {/* Textarea + suggestions wrapper */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              autoFocus
              value={value}
              onChange={handleChange}
              onSelect={handleSelect}
              onKeyDown={handleKeyDown}
              placeholder={`e.g. status = 'ACTIVE' AND created_at > '2024-01-01'`}
              rows={4}
              className="w-full px-3 py-2 text-sm font-mono bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-500 rounded text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />

            {/* Autocomplete dropdown */}
            {suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-0.5 bg-white dark:bg-slate-800 border border-blue-300 dark:border-slate-500 rounded shadow-lg z-10 max-h-48 overflow-y-auto">
                <div className="px-2 py-1 text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-slate-700 select-none">
                  Columns — Tab or Enter to insert
                </div>
                {suggestions.map((col, i) => (
                  <button
                    key={col.name}
                    ref={el => { suggestionRefs.current[i] = el; }}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); applySuggestion(col); }}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-sm font-mono transition ${
                      i === activeIdx
                        ? 'bg-blue-50 dark:bg-slate-600 text-blue-700 dark:text-blue-200'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {col.primaryKey && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-500 dark:text-yellow-400 shrink-0"><path d="M3 11v2a4 4 0 0 0 4 4h0a4 4 0 0 0 4-4v-2"/><path d="M7 7v4"/><circle cx="7" cy="7" r="4"/></svg>
                    )}
                    <span className="font-medium">{col.name}</span>
                    <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 font-sans">{col.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Start typing a column name for suggestions. Filters rows during migration and preview.
          </p>

          {/* Column chips */}
          {columns.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Columns:</div>
              <div className="flex flex-wrap gap-1.5">
                {columns.map(col => (
                  <button
                    key={col.name}
                    type="button"
                    title={col.type}
                    onClick={() => {
                      const ta = textareaRef.current;
                      if (!ta) return;
                      const pos = ta.selectionStart ?? value.length;
                      const { newText, newCursor } = replaceToken(value, pos, col.name);
                      setValue(newText);
                      setSuppressSuggest(true);
                      setTimeout(() => {
                        ta.focus();
                        ta.setSelectionRange(newCursor, newCursor);
                        setCursor(newCursor);
                        setSuppressSuggest(false);
                      }, 0);
                    }}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono border transition
                      ${col.primaryKey
                        ? 'border-yellow-400 dark:border-yellow-600 text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/40'
                        : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 hover:border-blue-300 dark:hover:border-blue-500'
                      }`}
                  >
                    {col.primaryKey && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M3 11v2a4 4 0 0 0 4 4h0a4 4 0 0 0 4-4v-2"/><path d="M7 7v4"/><circle cx="7" cy="7" r="4"/></svg>
                    )}
                    {col.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 pb-4">
          <button
            onClick={handleClear}
            className="px-3 py-1.5 text-xs text-red-500 dark:text-red-400 bg-transparent hover:bg-red-50 dark:hover:bg-red-900/20 rounded border border-red-300 dark:border-red-700 transition"
          >
            Clear Filter
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-slate-600 rounded hover:bg-gray-200 dark:hover:bg-slate-500 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-500 transition"
            >
              Save Filter
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(dialog, document.body);
};
