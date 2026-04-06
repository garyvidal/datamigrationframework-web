// SecurityConfigEditor — reusable editor for MarkLogic document-level security settings.
// Used in both the project ConfigDialog (project-level defaults) and the MigrationWizard (job-level overrides).
import React, { useState } from 'react';
import { FaPlus, FaTimes } from 'react-icons/fa';
import { MarkLogicPermission, MarkLogicSecurityConfig } from '@/services/ProjectService';

const CAPABILITIES = ['read', 'update', 'insert', 'execute', 'node-update'];

const inputCls =
  'w-full px-3 py-2 bg-white text-gray-800 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white dark:border-slate-500';

interface SecurityConfigEditorProps {
  value: MarkLogicSecurityConfig;
  onChange: (config: MarkLogicSecurityConfig) => void;
}

const SecurityConfigEditor: React.FC<SecurityConfigEditorProps> = ({ value, onChange }) => {
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleCaps, setNewRoleCaps] = useState<string[]>(['read']);
  const [newCollection, setNewCollection] = useState('');
  const [newMetaKey, setNewMetaKey] = useState('');
  const [newMetaVal, setNewMetaVal] = useState('');

  const permissions   = value.permissions   ?? [];
  const collections   = value.collections   ?? [];
  const metadata      = value.metadata      ?? {};

  // ── Permissions ─────────────────────────────────────────────────────────────

  const addPermission = () => {
    const role = newRoleName.trim();
    if (!role || newRoleCaps.length === 0) return;
    if (permissions.some(p => p.roleName === role)) return;
    onChange({ ...value, permissions: [...permissions, { roleName: role, capabilities: [...newRoleCaps] }] });
    setNewRoleName('');
    setNewRoleCaps(['read']);
  };

  const removePermission = (roleName: string) => {
    onChange({ ...value, permissions: permissions.filter(p => p.roleName !== roleName) });
  };

  const toggleCap = (cap: string) => {
    setNewRoleCaps(prev =>
      prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
    );
  };

  const toggleExistingCap = (perm: MarkLogicPermission, cap: string) => {
    const updated = permissions.map(p => {
      if (p.roleName !== perm.roleName) return p;
      const caps = p.capabilities.includes(cap)
        ? p.capabilities.filter(c => c !== cap)
        : [...p.capabilities, cap];
      return { ...p, capabilities: caps };
    });
    onChange({ ...value, permissions: updated });
  };

  // ── Collections ──────────────────────────────────────────────────────────────

  const addCollection = () => {
    const c = newCollection.trim();
    if (!c || collections.includes(c)) return;
    onChange({ ...value, collections: [...collections, c] });
    setNewCollection('');
  };

  const removeCollection = (c: string) => {
    onChange({ ...value, collections: collections.filter(x => x !== c) });
  };

  // ── Quality ──────────────────────────────────────────────────────────────────

  const setQuality = (q: string) => {
    const num = q === '' ? undefined : parseInt(q, 10);
    onChange({ ...value, quality: isNaN(num as number) ? undefined : num });
  };

  // ── Metadata ─────────────────────────────────────────────────────────────────

  const addMetadata = () => {
    const k = newMetaKey.trim();
    const v = newMetaVal.trim();
    if (!k) return;
    onChange({ ...value, metadata: { ...metadata, [k]: v } });
    setNewMetaKey('');
    setNewMetaVal('');
  };

  const removeMetadata = (key: string) => {
    const updated = { ...metadata };
    delete updated[key];
    onChange({ ...value, metadata: updated });
  };

  return (
    <div className="space-y-6">

      {/* ── Permissions ── */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Permissions</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Define which MarkLogic roles can access migrated documents and with what capabilities.
        </p>

        {/* Existing permissions */}
        {permissions.length > 0 && (
          <div className="space-y-2 mb-3">
            {permissions.map(perm => (
              <div
                key={perm.roleName}
                className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-slate-800 rounded border border-gray-200 dark:border-slate-600"
              >
                <span className="text-sm font-mono text-gray-800 dark:text-white min-w-[120px] shrink-0">
                  {perm.roleName}
                </span>
                <div className="flex flex-wrap gap-1 flex-1">
                  {CAPABILITIES.map(cap => (
                    <button
                      key={cap}
                      type="button"
                      onClick={() => toggleExistingCap(perm, cap)}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition border ${
                        perm.capabilities.includes(cap)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-gray-100 text-gray-400 border-gray-200 dark:bg-slate-700 dark:text-gray-500 dark:border-slate-600'
                      }`}
                    >
                      {cap}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => removePermission(perm.roleName)}
                  className="text-gray-400 hover:text-red-400 transition shrink-0"
                >
                  <FaTimes size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new permission */}
        <div className="flex gap-2 items-start">
          <input
            type="text"
            value={newRoleName}
            onChange={e => setNewRoleName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPermission(); }}}
            placeholder="Role name (e.g. data-reader)"
            className={`${inputCls} flex-1`}
          />
          <div className="flex flex-wrap gap-1 items-center">
            {CAPABILITIES.map(cap => (
              <button
                key={cap}
                type="button"
                onClick={() => toggleCap(cap)}
                className={`px-2 py-1 rounded text-xs font-medium transition border ${
                  newRoleCaps.includes(cap)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-slate-700 dark:text-gray-400 dark:border-slate-600 hover:border-gray-400'
                }`}
              >
                {cap}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={addPermission}
            disabled={!newRoleName.trim() || newRoleCaps.length === 0}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm shrink-0"
          >
            <FaPlus size={10} /> Add
          </button>
        </div>
      </div>

      {/* ── Collections ── */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Collections</h4>
        <div className="flex gap-2">
          <input
            type="text"
            value={newCollection}
            onChange={e => setNewCollection(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCollection(); }}}
            placeholder="e.g. my-collection"
            className={`${inputCls} flex-1`}
          />
          <button
            type="button"
            onClick={addCollection}
            disabled={!newCollection.trim()}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm shrink-0"
          >
            <FaPlus size={10} /> Add
          </button>
        </div>
        {collections.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {collections.map(c => (
              <span
                key={c}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 dark:bg-slate-700 dark:text-blue-300 rounded text-xs"
              >
                {c}
                <button onClick={() => removeCollection(c)} className="hover:text-red-400 transition">
                  <FaTimes size={9} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Quality ── */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Document Quality</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Optional integer — higher values rank documents higher in MarkLogic search results.
        </p>
        <input
          type="number"
          value={value.quality ?? ''}
          onChange={e => setQuality(e.target.value)}
          placeholder="e.g. 10"
          className={`${inputCls} w-40`}
        />
      </div>

      {/* ── Metadata ── */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Document Metadata</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Key-value pairs attached to each document as MarkLogic metadata values.
        </p>
        {Object.entries(metadata).length > 0 && (
          <div className="space-y-1 mb-3">
            {Object.entries(metadata).map(([k, v]) => (
              <div
                key={k}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-slate-800 rounded border border-gray-200 dark:border-slate-600 text-sm"
              >
                <span className="font-mono text-gray-500 dark:text-gray-400 min-w-[120px]">{k}</span>
                <span className="text-gray-400 dark:text-gray-500">→</span>
                <span className="font-mono text-gray-800 dark:text-white flex-1">{v}</span>
                <button
                  type="button"
                  onClick={() => removeMetadata(k)}
                  className="text-gray-400 hover:text-red-400 transition"
                >
                  <FaTimes size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={newMetaKey}
            onChange={e => setNewMetaKey(e.target.value)}
            placeholder="Key"
            className={`${inputCls} flex-1`}
          />
          <input
            type="text"
            value={newMetaVal}
            onChange={e => setNewMetaVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMetadata(); }}}
            placeholder="Value"
            className={`${inputCls} flex-1`}
          />
          <button
            type="button"
            onClick={addMetadata}
            disabled={!newMetaKey.trim()}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm shrink-0"
          >
            <FaPlus size={10} /> Add
          </button>
        </div>
      </div>

    </div>
  );
};

export default SecurityConfigEditor;
