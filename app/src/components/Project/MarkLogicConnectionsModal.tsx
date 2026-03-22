// MarkLogicConnectionsModal — Modal for managing MarkLogic endpoint connections with auth-type selection.
import React, { useState, useEffect } from 'react';
import {
  getSavedMarkLogicConnections,
  saveMarkLogicConnection,
  updateMarkLogicConnection,
  deleteMarkLogicConnection,
  testMarkLogicConnection,
  testMarkLogicConnectionById,
  encryptMarkLogicPassword,
  SavedMarkLogicConnection,
  MarkLogicConnection,
  MarkLogicAuthType,
} from '@/services/MarkLogicService';
import {
  FaDatabase,
  FaPlus,
  FaTrash,
  FaEdit,
  FaCheck,
  FaTimes,
  FaSpinner,
  FaChevronLeft,
  FaLock,
} from 'react-icons/fa';

// ── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  id: string;
  name: string;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  authType: MarkLogicAuthType;
  useSSL: boolean;
}

const emptyForm = (): FormData => ({
  id: crypto.randomUUID(),
  name: '',
  host: 'localhost',
  port: '8000',
  database: '',
  username: '',
  password: '',
  authType: 'digest',
  useSSL: false,
});

function savedToForm(sc: SavedMarkLogicConnection): FormData {
  const c = sc.connection;
  return {
    id: sc.id,
    name: sc.name,
    host: c.host ?? 'localhost',
    port: String(c.port ?? 8000),
    database: c.database ?? '',
    username: c.username ?? '',
    password: '', // never returned by API
    authType: c.authType ?? 'digest',
    useSSL: c.useSSL ?? false,
  };
}

function formToConnection(f: FormData): MarkLogicConnection {
  return {
    host: f.host,
    port: parseInt(f.port, 10) || 8000,
    database: f.database || undefined,
    username: f.username,
    password: f.password,
    authType: f.authType,
    useSSL: f.useSSL,
  };
}

// ── Shared style constants ────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-1.5 bg-white text-gray-800 border border-gray-300 dark:bg-slate-600 dark:text-white dark:border-slate-500 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className={labelCls}>{label}</label>
    {children}
  </div>
);

// ── Connection Form ───────────────────────────────────────────────────────────

interface ConnectionFormProps {
  initial?: SavedMarkLogicConnection;
  onSaved: (conn: SavedMarkLogicConnection) => void;
  onCancel: () => void;
}

const ConnectionForm: React.FC<ConnectionFormProps> = ({ initial, onSaved, onCancel }) => {
  const [form, setForm] = useState<FormData>(initial ? savedToForm(initial) : emptyForm());
  const [originalName] = useState(initial?.name ?? '');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key !== 'password') {
      setTestStatus('idle');
      setTestMessage(null);
    }
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setTestMessage(null);
    const result =
      initial && !form.password
        ? await testMarkLogicConnectionById(initial.id)
        : await testMarkLogicConnection(formToConnection(form));
    setTestStatus(result.success ? 'success' : 'failed');
    setTestMessage(result.message);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Connection Name is required'); return; }
    if (!form.host.trim()) { setError('Host is required'); return; }
    if (!form.username.trim()) { setError('Username is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const conn = formToConnection(form);
      if (conn.password) {
        conn.password = await encryptMarkLogicPassword(conn.password);
      }
      const request = { id: form.id, name: form.name.trim(), connection: conn };
      const saved = initial
        ? await updateMarkLogicConnection(originalName, request)
        : await saveMarkLogicConnection(request);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save connection');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 dark:border-slate-700 shrink-0">
        <button
          onClick={onCancel}
          className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition"
          title="Back to list"
        >
          <FaChevronLeft size={14} />
        </button>
        <h3 className="text-gray-800 dark:text-white font-semibold">
          {initial ? 'Edit MarkLogic Connection' : 'New MarkLogic Connection'}
        </h3>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3 space-y-3">

        {/* Host / Port */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Host">
            <input
              type="text"
              value={form.host}
              onChange={(e) => set('host', e.target.value)}
              placeholder="localhost"
              className={inputCls}
            />
          </Field>
          <Field label="Port">
            <input
              type="number"
              value={form.port}
              onChange={(e) => set('port', e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        {/* Database (optional) */}
        <Field label="Database (optional — uses app server default if blank)">
          <input
            type="text"
            value={form.database}
            onChange={(e) => set('database', e.target.value)}
            placeholder="Documents"
            className={inputCls}
          />
        </Field>

        {/* Username / Password */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username">
            <input
              type="text"
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
              placeholder="admin"
              className={inputCls}
            />
          </Field>
          <Field label={initial ? 'Password (leave blank to keep current)' : 'Password'}>
            <input
              type="password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder={initial ? '••••••••' : ''}
              className={inputCls}
            />
          </Field>
        </div>

        {/* Auth Type */}
        <Field label="Authentication">
          <select
            value={form.authType}
            onChange={(e) => set('authType', e.target.value as MarkLogicAuthType)}
            className={inputCls}
          >
            <option value="digest">Digest (recommended)</option>
            <option value="basic">Basic</option>
          </select>
        </Field>

        {/* SSL */}
        <div className="border border-gray-200 dark:border-slate-600 rounded p-3 space-y-1">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">SSL / TLS</div>
          <div className="flex items-center gap-3 pt-1">
            <input
              id="ml-useSSL"
              type="checkbox"
              checked={form.useSSL}
              onChange={(e) => set('useSSL', e.target.checked)}
              className="accent-blue-500 w-4 h-4"
            />
            <label htmlFor="ml-useSSL" className="text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
              Use SSL / TLS
            </label>
          </div>
        </div>

        <hr className="border-gray-200 dark:border-slate-600" />

        {/* Connection Name */}
        <Field label="Connection Name *">
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="marklogic-dev"
            className={inputCls}
          />
        </Field>

        {/* Test Connection */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTest}
              disabled={testStatus === 'testing'}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-slate-600 text-gray-700 dark:text-white text-sm rounded hover:bg-gray-200 dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {testStatus === 'testing' ? (
                <><FaSpinner className="animate-spin" size={12} /> Testing...</>
              ) : (
                'Test Connection'
              )}
            </button>
            {testStatus === 'success' && (
              <span className="flex items-center gap-1.5 text-sm text-green-400">
                <FaCheck size={12} /> Connected
              </span>
            )}
            {testStatus === 'failed' && (
              <span className="flex items-center gap-1.5 text-sm text-red-400">
                <FaTimes size={12} /> Failed
              </span>
            )}
          </div>
          {testStatus === 'failed' && testMessage && (
            <div className="p-3 bg-red-900/60 border border-red-700 rounded text-xs text-red-200 font-mono break-all">
              {testMessage}
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-900 border border-red-700 rounded text-sm text-red-100">
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-200 dark:border-slate-700 shrink-0">
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-100 dark:bg-slate-600 text-gray-700 dark:text-white rounded hover:bg-gray-200 dark:hover:bg-slate-500 text-sm transition"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2 transition"
        >
          {saving ? <><FaSpinner className="animate-spin" size={12} /> Saving...</> : 'Save Connection'}
        </button>
      </div>
    </div>
  );
};

// ── Connection List ───────────────────────────────────────────────────────────

interface ConnectionListProps {
  connections: SavedMarkLogicConnection[];
  onEdit: (conn: SavedMarkLogicConnection) => void;
  onDelete: (conn: SavedMarkLogicConnection) => void;
  onNew: () => void;
  onClose: () => void;
}

const ConnectionList: React.FC<ConnectionListProps> = ({
  connections,
  onEdit,
  onDelete,
  onNew,
  onClose,
}) => {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async (conn: SavedMarkLogicConnection) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteMarkLogicConnection(conn.name);
      onDelete(conn);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete connection');
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* List header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-slate-700 shrink-0">
        <h3 className="text-gray-800 dark:text-white font-semibold">MarkLogic Connections</h3>
        <button
          onClick={onNew}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
        >
          <FaPlus size={11} /> New Connection
        </button>
      </div>

      {/* List body */}
      <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3">
        {connections.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <FaLock className="text-slate-500" size={36} />
            <p className="text-gray-400 text-sm">No MarkLogic connections saved yet.</p>
            <button
              onClick={onNew}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition"
            >
              <FaPlus size={11} /> Create your first connection
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {connections.map((conn) => {
              const isConfirming = confirmDelete === conn.id;
              const summary = `${conn.connection.host}:${conn.connection.port}${conn.connection.database ? ` / ${conn.connection.database}` : ''}`;
              return (
                <li key={conn.id} className="flex items-stretch gap-2">
                  <div className="flex-1 flex items-center gap-3 px-4 py-2.5 bg-gray-100 dark:bg-slate-700 rounded min-w-0">
                    <FaDatabase className="text-amber-400 shrink-0" size={15} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800 dark:text-white">{conn.name}</span>
                        {conn.connection.useSSL && (
                          <span className="flex items-center gap-1 text-xs text-green-400">
                            <FaLock size={9} /> SSL
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 truncate mt-0.5">
                        MarkLogic &bull; {summary} &bull; {conn.connection.authType}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onEdit(conn)}
                    className="px-3 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white rounded transition"
                    title={`Edit "${conn.name}"`}
                  >
                    <FaEdit size={13} />
                  </button>

                  {isConfirming ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleDelete(conn)}
                        disabled={deleting}
                        className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition disabled:opacity-50"
                      >
                        {deleting ? '...' : 'Delete'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-2 py-1 text-xs bg-gray-100 dark:bg-slate-600 hover:bg-gray-200 dark:hover:bg-slate-500 text-gray-700 dark:text-white rounded transition"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(conn.id)}
                      className="px-3 bg-gray-100 dark:bg-slate-700 hover:bg-red-100 dark:hover:bg-red-800 text-gray-500 dark:text-gray-400 hover:text-red-700 dark:hover:text-white rounded transition"
                      title={`Delete "${conn.name}"`}
                    >
                      <FaTrash size={12} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {deleteError && (
          <div className="mt-3 p-3 bg-red-900 border border-red-700 rounded text-sm text-red-100">
            {deleteError}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end px-5 py-3 border-t border-gray-200 dark:border-slate-700 shrink-0">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-100 dark:bg-slate-600 text-gray-700 dark:text-white rounded hover:bg-gray-200 dark:hover:bg-slate-500 text-sm transition"
        >
          Close
        </button>
      </div>
    </div>
  );
};

// ── Modal ─────────────────────────────────────────────────────────────────────

interface MarkLogicConnectionsModalProps {
  onClose: () => void;
}

type ModalView = 'list' | 'form';

const MarkLogicConnectionsModal: React.FC<MarkLogicConnectionsModalProps> = ({ onClose }) => {
  const [connections, setConnections] = useState<SavedMarkLogicConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<ModalView>('list');
  const [editing, setEditing] = useState<SavedMarkLogicConnection | undefined>(undefined);

  useEffect(() => {
    getSavedMarkLogicConnections()
      .then(setConnections)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load connections'))
      .finally(() => setLoading(false));
  }, []);

  const handleSaved = (saved: SavedMarkLogicConnection) => {
    setConnections((prev) => {
      const existsById = prev.find((c) => c.id === saved.id);
      const existsByName = prev.find((c) => c.name === saved.name);
      const match = existsById ?? existsByName;
      if (match) return prev.map((c) => (c === match ? saved : c));
      return [...prev, saved];
    });
    setView('list');
  };

  return (
    <div className="dark fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] min-h-0">

        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            <FaDatabase className="text-amber-400" size={16} />
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">MarkLogic Connections</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-2xl leading-none">
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3 text-gray-400">
              <FaSpinner className="animate-spin text-lg" />
              <span>Loading connections...</span>
            </div>
          ) : loadError ? (
            <div className="px-5 py-4">
              <div className="p-3 bg-red-900 border border-red-700 rounded text-sm text-red-100">
                {loadError}
              </div>
            </div>
          ) : view === 'list' ? (
            <ConnectionList
              connections={connections}
              onEdit={(conn) => { setEditing(conn); setView('form'); }}
              onDelete={(deleted) => setConnections((prev) => prev.filter((c) => c.id !== deleted.id))}
              onNew={() => { setEditing(undefined); setView('form'); }}
              onClose={onClose}
            />
          ) : (
            <ConnectionForm
              initial={editing}
              onSaved={handleSaved}
              onCancel={() => setView('list')}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default MarkLogicConnectionsModal;
