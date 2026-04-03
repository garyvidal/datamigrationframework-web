// ImportPackageModal — Drag-and-drop / file-picker for importing a migration package (.json).
// Shows a preview of the package contents and lets the user optionally supply passwords
// before importing the project and connections.
import React, { useCallback, useRef, useState } from 'react';
import { FaTimes, FaUpload, FaFileCode, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import { importPackage, ImportResult } from '@/services/ProjectService';

interface PackagePreview {
  projectName?: string;
  projectId?: string;
  sourceConnectionName?: string;
  sourceConnectionHost?: string;
  marklogicConnectionName?: string;
  marklogicConnectionHost?: string;
  packageVersion?: string;
  exportedAt?: string;
}

interface ImportPackageModalProps {
  onClose: () => void;
  onImported: (result: ImportResult) => void;
}

export default function ImportPackageModal({ onClose, onImported }: ImportPackageModalProps) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PackagePreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [sourcePassword, setSourcePassword] = useState('');
  const [marklogicPassword, setMarklogicPassword] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const parseFile = useCallback(async (f: File) => {
    setFile(f);
    setParseError(null);
    setPreview(null);
    setImportResult(null);
    setImportError(null);
    try {
      const text = await f.text();
      const json = JSON.parse(text);
      setPreview({
        packageVersion: json.packageVersion,
        exportedAt: json.exportedAt,
        projectName: json.project?.name,
        projectId: json.project?.id,
        sourceConnectionName: json.sourceConnection?.name,
        sourceConnectionHost: json.sourceConnection?.connection?.url,
        marklogicConnectionName: json.marklogicConnection?.name,
        marklogicConnectionHost: json.marklogicConnection?.connection?.host,
      });
    } catch {
      setParseError('Could not parse the file as a migration package. Make sure it is a valid JSON package.');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) parseFile(dropped);
  }, [parseFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) parseFile(picked);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      const result = await importPackage(
        file,
        sourcePassword || undefined,
        marklogicPassword || undefined,
      );
      setImportResult(result);
      onImported(result);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2 bg-white dark:bg-slate-700 text-gray-800 dark:text-white border border-gray-300 dark:border-slate-500 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="dark fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-700 rounded-lg shadow-2xl w-full max-w-lg mx-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-600">
          <h2 className="text-gray-800 dark:text-white font-semibold text-lg flex items-center gap-2">
            <FaUpload className="text-blue-400" size={15} />
            Import Migration Package
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white">
            <FaTimes />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Drop zone */}
          {!importResult && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-lg p-8 cursor-pointer transition
                ${dragging
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-slate-500 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-slate-600/40'}`}
            >
              <FaFileCode className="text-blue-400" size={28} />
              <div className="text-center">
                <p className="text-sm text-gray-700 dark:text-gray-200 font-medium">
                  {file ? file.name : 'Drop package file here or click to browse'}
                </p>
                {!file && (
                  <p className="text-xs text-gray-400 mt-1">Accepts <code>*-package.json</code> files</p>
                )}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          )}

          {/* Parse error */}
          {parseError && (
            <p className="text-red-400 text-sm flex items-center gap-2">
              <FaExclamationTriangle size={13} /> {parseError}
            </p>
          )}

          {/* Package preview */}
          {preview && !importResult && (
            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 space-y-2 text-sm">
              <h3 className="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">
                Package Contents
              </h3>
              <Row label="Project" value={preview.projectName} />
              {preview.sourceConnectionName && (
                <Row
                  label="Source connection"
                  value={`${preview.sourceConnectionName}${preview.sourceConnectionHost ? ` (${preview.sourceConnectionHost})` : ''}`}
                />
              )}
              {preview.marklogicConnectionName && (
                <Row
                  label="MarkLogic connection"
                  value={`${preview.marklogicConnectionName}${preview.marklogicConnectionHost ? ` (${preview.marklogicConnectionHost})` : ''}`}
                />
              )}
              {preview.exportedAt && (
                <Row label="Exported" value={new Date(preview.exportedAt).toLocaleString()} />
              )}
            </div>
          )}

          {/* Password inputs — shown only when connections are in the package */}
          {preview && !importResult && (preview.sourceConnectionName || preview.marklogicConnectionName) && (
            <div className="space-y-3">
              <p className="text-xs text-amber-500 dark:text-amber-400 flex items-start gap-1.5">
                <FaExclamationTriangle className="mt-0.5 shrink-0" size={11} />
                Passwords are never included in packages. Provide them below to use these connections immediately,
                or leave blank and update them later in the Connections panel.
              </p>
              {preview.sourceConnectionName && (
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Source connection password <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="password"
                    value={sourcePassword}
                    onChange={(e) => setSourcePassword(e.target.value)}
                    placeholder={`Password for "${preview.sourceConnectionName}"`}
                    className={inputCls}
                    autoComplete="new-password"
                  />
                </div>
              )}
              {preview.marklogicConnectionName && (
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    MarkLogic connection password <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="password"
                    value={marklogicPassword}
                    onChange={(e) => setMarklogicPassword(e.target.value)}
                    placeholder={`Password for "${preview.marklogicConnectionName}"`}
                    className={inputCls}
                    autoComplete="new-password"
                  />
                </div>
              )}
            </div>
          )}

          {/* Import error */}
          {importError && (
            <p className="text-red-400 text-sm flex items-center gap-2">
              <FaExclamationTriangle size={13} /> {importError}
            </p>
          )}

          {/* Success result */}
          {importResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-500">
                <FaCheckCircle size={18} />
                <span className="font-semibold text-sm">Package imported successfully</span>
              </div>
              <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 space-y-1.5 text-sm">
                <StatusRow label="Project" name={importResult.projectName} created={importResult.projectCreated} />
                {importResult.sourceConnectionName && (
                  <StatusRow label="Source connection" name={importResult.sourceConnectionName} created={importResult.sourceConnectionCreated} />
                )}
                {importResult.marklogicConnectionName && (
                  <StatusRow label="MarkLogic connection" name={importResult.marklogicConnectionName} created={importResult.marklogicConnectionCreated} />
                )}
              </div>
              {importResult.warnings.length > 0 && (
                <ul className="space-y-1">
                  {importResult.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-amber-500 dark:text-amber-400 flex items-start gap-1.5">
                      <FaExclamationTriangle className="mt-0.5 shrink-0" size={11} /> {w}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-slate-600 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white transition"
          >
            {importResult ? 'Close' : 'Cancel'}
          </button>
          {!importResult && (
            <button
              onClick={handleImport}
              disabled={!preview || importing}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {importing ? 'Importing...' : 'Import'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-gray-400 dark:text-gray-500 w-36 shrink-0">{label}</span>
      <span className="text-gray-800 dark:text-gray-200 truncate">{value}</span>
    </div>
  );
}

function StatusRow({ label, name, created }: { label: string; name: string; created: boolean }) {
  return (
    <div className="flex gap-2 items-center">
      <span className="text-gray-400 dark:text-gray-500 w-36 shrink-0">{label}</span>
      <span className="text-gray-800 dark:text-gray-200 truncate">{name}</span>
      <span className={`ml-auto text-xs shrink-0 ${created ? 'text-green-500' : 'text-gray-400'}`}>
        {created ? 'created' : 'already existed'}
      </span>
    </div>
  );
}
