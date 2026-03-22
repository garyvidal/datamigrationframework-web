// ConnectionsModal — Modal for managing relational DB connections: create, edit, delete, and test saved connections.
import React, { useState, useEffect } from 'react';
import {
  getSavedConnections,
  saveConnection,
  updateConnection,
  deleteConnection,
  testConnection,
  testConnectionById,
  encryptPassword,
  SavedConnection,
  DbConnection,
  ConnectionType,
  ConnectionEnvironment,
} from '@/services/SchemaService';
import EnvironmentBadge from './EnvironmentBadge';
import EnvironmentSelect from './EnvironmentSelect';
import {
  FaDatabase,
  FaPlus,
  FaTrash,
  FaEdit,
  FaCheck,
  FaTimes,
  FaSpinner,
  FaChevronLeft,
} from 'react-icons/fa';

// ── Types ────────────────────────────────────────────────────────────────────

interface ConnectionFormData {
  id: string;
  name: string;
  environment: ConnectionEnvironment;
  dbType: ConnectionType;
  enterUriManually: boolean;
  jdbcUri: string;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  authentication: 'Windows' | 'SqlServer';
  identifier: 'ServiceName' | 'SID';
  pdbName: string;
  useSSL: boolean;
  sslMode: 'Prefer' | 'Require' | 'VerifyCA' | 'VerifyFull';
}

const DEFAULT_PORTS: Record<ConnectionType, string> = {
  [ConnectionType.Postgres]: '5432',
  [ConnectionType.MySql]: '3306',
  [ConnectionType.SqlServer]: '1433',
  [ConnectionType.Oracle]: '1521',
};

const emptyForm = (): ConnectionFormData => ({
  id: crypto.randomUUID(),
  name: '',
  environment: 'None',
  dbType: ConnectionType.Postgres,
  enterUriManually: false,
  jdbcUri: '',
  host: 'localhost',
  port: DEFAULT_PORTS[ConnectionType.Postgres],
  database: '',
  username: '',
  password: '',
  authentication: 'SqlServer',
  identifier: 'ServiceName',
  pdbName: '',
  useSSL: false,
  sslMode: 'Prefer',
});

function savedToForm(sc: SavedConnection): ConnectionFormData {
  const c = sc.connection;
  return {
    id: sc.id,
    name: sc.name,
    environment: sc.environment ?? 'None',
    dbType: c.type,
    enterUriManually: c.enterUriManually ?? false,
    jdbcUri: c.jdbcUri ?? '',
    host: c.url ?? 'localhost',
    port: String(c.port ?? DEFAULT_PORTS[c.type] ?? ''),
    database: c.database ?? '',
    username: c.userName ?? '',
    password: '', // password is never returned by the API; leave blank to keep existing
    authentication: c.authentication ?? 'SqlServer',
    identifier: c.identifier ?? 'ServiceName',
    pdbName: c.pdbName ?? '',
    useSSL: c.useSSL ?? false,
    sslMode: c.sslMode ?? 'Prefer',
  };
}

function formToConnection(f: ConnectionFormData): DbConnection {
  return {
    type: f.dbType,
    enterUriManually: f.enterUriManually,
    jdbcUri: f.enterUriManually ? f.jdbcUri : undefined,
    url: f.host,
    port: parseInt(f.port, 10) || 0,
    database: f.database,
    userName: f.username,
    password: f.password,
    authentication: f.dbType === ConnectionType.SqlServer ? f.authentication : undefined,
    identifier: f.dbType === ConnectionType.Oracle ? f.identifier : undefined,
    pdbName: f.dbType === ConnectionType.Oracle ? f.pdbName : undefined,
    useSSL: f.dbType === ConnectionType.Postgres ? f.useSSL : undefined,
    sslMode: f.dbType === ConnectionType.Postgres && f.useSSL ? f.sslMode : undefined,
  };
}

// ── Sub-components ───────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-1.5 bg-white text-gray-800 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-600 dark:text-white dark:border-slate-500';

const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1';

interface FieldProps {
  label: string;
  children: React.ReactNode;
}
const Field: React.FC<FieldProps> = ({ label, children }) => (
  <div>
    <label className={labelCls}>{label}</label>
    {children}
  </div>
);

// ── Connection Form ───────────────────────────────────────────────────────────

interface ConnectionFormProps {
  initial?: SavedConnection;
  onSaved: (conn: SavedConnection) => void;
  onCancel: () => void;
}

const ConnectionForm: React.FC<ConnectionFormProps> = ({ initial, onSaved, onCancel }) => {
  const [form, setForm] = useState<ConnectionFormData>(
    initial ? savedToForm(initial) : emptyForm()
  );
  const [originalName] = useState(initial?.name ?? '');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ConnectionFormData>(key: K, value: ConnectionFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key !== 'password') {
      setTestStatus('idle');
      setTestMessage(null);
    }
  };

  const handleDbTypeChange = (type: ConnectionType) => {
    setForm((prev) => ({
      ...prev,
      dbType: type,
      port: DEFAULT_PORTS[type],
    }));
    setTestStatus('idle');
    setTestMessage(null);
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setTestMessage(null);
    // When editing with no new password typed, test using stored credentials
    const result = (initial && !form.password)
      ? await testConnectionById(initial.id)
      : await testConnection(formToConnection(form));
    setTestStatus(result.success ? 'success' : 'failed');
    setTestMessage(result.message);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Connection Name is required'); return; }
    if (!form.enterUriManually) {
      if (!form.host.trim()) { setError('Host is required'); return; }
      if (!form.database.trim()) { setError('Database is required'); return; }
      if (!form.username.trim()) { setError('Username is required'); return; }
    } else {
      if (!form.jdbcUri.trim()) { setError('JDBC URI is required'); return; }
    }
    setSaving(true);
    setError(null);
    try {
      const conn = formToConnection(form);
      if (conn.password) {
        conn.password = await encryptPassword(conn.password);
      }
      const request = {
        id: form.id,
        name: form.name.trim(),
        environment: form.environment,
        connection: conn,
      };
      const saved = initial
        ? await updateConnection(originalName, request)
        : await saveConnection(request);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save connection');
    } finally {
      setSaving(false);
    }
  };

  const isRdbms = true; // all current types are RDBMS
  const isPostgres = form.dbType === ConnectionType.Postgres;
  const isSqlServer = form.dbType === ConnectionType.SqlServer;
  const isOracle = form.dbType === ConnectionType.Oracle;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Form header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 dark:border-slate-700 shrink-0">
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-700 dark:hover:text-white transition"
          title="Back to list"
        >
          <FaChevronLeft size={14} />
        </button>
        <h3 className="text-gray-800 dark:text-white font-semibold">
          {initial ? 'Edit Connection' : 'New Connection'}
        </h3>
      </div>

      {/* Scrollable form body */}
      <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3 space-y-3">

        {/* Database Type */}
        <Field label="Database Type">
          <select
            value={form.dbType}
            onChange={(e) => handleDbTypeChange(e.target.value as ConnectionType)}
            className={inputCls}
          >
            <option value={ConnectionType.Postgres}>PostgreSQL</option>
            <option value={ConnectionType.MySql}>MySQL</option>
            <option value={ConnectionType.SqlServer}>SQL Server</option>
            <option value={ConnectionType.Oracle}>Oracle</option>
          </select>
        </Field>

        {/* Enter URI Manually */}
        {isRdbms && (
          <div className="flex items-center gap-3">
            <input
              id="enterUriManually"
              type="checkbox"
              checked={form.enterUriManually}
              onChange={(e) => set('enterUriManually', e.target.checked)}
              className="accent-blue-500 w-4 h-4"
            />
            <label htmlFor="enterUriManually" className="text-sm text-gray-300 cursor-pointer">
              Enter URI Manually
            </label>
          </div>
        )}

        {/* JDBC URI (manual mode) */}
        {isRdbms && form.enterUriManually && (
          <Field label="JDBC URI">
            <input
              type="text"
              value={form.jdbcUri}
              onChange={(e) => set('jdbcUri', e.target.value)}
              placeholder="jdbc:postgresql://localhost:5432/mydb"
              className={inputCls}
            />
          </Field>
        )}

        {/* Host / Port */}
        {isRdbms && !form.enterUriManually && (
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
        )}

        {/* Database */}
        {isRdbms && !form.enterUriManually && (
          <Field label="Database">
            <input
              type="text"
              value={form.database}
              onChange={(e) => set('database', e.target.value)}
              placeholder="my_database"
              className={inputCls}
            />
          </Field>
        )}

        {/* Authentication (SQL Server only) */}
        {isSqlServer && (
          <Field label="Authentication">
            <select
              value={form.authentication}
              onChange={(e) => set('authentication', e.target.value as 'Windows' | 'SqlServer')}
              className={inputCls}
            >
              <option value="Windows">Windows</option>
              <option value="SqlServer">SQL Server</option>
            </select>
          </Field>
        )}

        {/* Username / Password */}
        {isRdbms && !form.enterUriManually && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Username">
              <input
                type="text"
                value={form.username}
                onChange={(e) => set('username', e.target.value)}
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
        )}

        {/* Oracle: Identifier + PDB Name */}
        {isOracle && (
          <>
            <Field label="Identifier">
              <select
                value={form.identifier}
                onChange={(e) => set('identifier', e.target.value as 'ServiceName' | 'SID')}
                className={inputCls}
              >
                <option value="ServiceName">Service Name</option>
                <option value="SID">SID</option>
              </select>
            </Field>
            <Field label="PDB Name">
              <input
                type="text"
                value={form.pdbName}
                onChange={(e) => set('pdbName', e.target.value)}
                placeholder="Optional PDB name"
                className={inputCls}
              />
            </Field>
          </>
        )}

        {/* Postgres: SSL */}
        {isPostgres && (
          <div className="border border-gray-200 dark:border-slate-600 rounded p-3 space-y-3">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">SSL</div>
            <div className="flex items-center gap-3">
              <input
                id="useSSL"
                type="checkbox"
                checked={form.useSSL}
                onChange={(e) => set('useSSL', e.target.checked)}
                className="accent-blue-500 w-4 h-4"
              />
              <label htmlFor="useSSL" className="text-sm text-gray-300 cursor-pointer">
                Use SSL
              </label>
            </div>
            {form.useSSL && (
              <Field label="SSL Mode">
                <select
                  value={form.sslMode}
                  onChange={(e) =>
                    set('sslMode', e.target.value as ConnectionFormData['sslMode'])
                  }
                  className={inputCls}
                >
                  <option value="Prefer">Prefer</option>
                  <option value="Require">Require</option>
                  <option value="VerifyCA">Verify CA</option>
                  <option value="VerifyFull">Verify Full</option>
                </select>
              </Field>
            )}
          </div>
        )}

        {/* Divider */}
        <hr className="border-gray-200 dark:border-slate-600" />

        {/* Connection Name */}
        <Field label="Connection Name *">
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="my-database-dev"
            className={inputCls}
          />
        </Field>

        {/* Environment */}
        <Field label="Environment">
          <EnvironmentSelect
            value={form.environment}
            onChange={(env) => set('environment', env)}
          />
        </Field>

        {/* Test Connection */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTest}
              disabled={testStatus === 'testing'}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500"
            >
              {testStatus === 'testing' ? (
                <>
                  <FaSpinner className="animate-spin" size={12} /> Testing...
                </>
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

      {/* Form footer */}
      <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-200 dark:border-slate-700 shrink-0">
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm transition dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500"
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
  connections: SavedConnection[];
  onEdit: (conn: SavedConnection) => void;
  onDelete: (conn: SavedConnection) => void;
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

  const handleDelete = async (conn: SavedConnection) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteConnection(conn.name);
      onDelete(conn);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete connection');
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const dbTypeLabel: Record<ConnectionType, string> = {
    [ConnectionType.Postgres]: 'PostgreSQL',
    [ConnectionType.MySql]: 'MySQL',
    [ConnectionType.SqlServer]: 'SQL Server',
    [ConnectionType.Oracle]: 'Oracle',
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* List header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-slate-700 shrink-0">
        <h3 className="text-gray-800 dark:text-white font-semibold">Saved Connections</h3>
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
            <FaDatabase className="text-slate-500" size={36} />
            <p className="text-gray-400 text-sm">No saved connections yet.</p>
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
              const connSummary = conn.connection.enterUriManually
                ? conn.connection.jdbcUri ?? '(JDBC URI)'
                : `${conn.connection.url}:${conn.connection.port} / ${conn.connection.database}`;
              return (
                <li key={conn.id} className="flex items-stretch gap-2">
                  <div className="flex-1 flex items-center gap-3 px-4 py-2.5 bg-gray-50 dark:bg-slate-700 rounded min-w-0">
                    <FaDatabase className="text-blue-400 shrink-0" size={15} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800 dark:text-white">{conn.name}</span>
                        <EnvironmentBadge environment={conn.environment} />
                      </div>
                      <div className="text-xs text-gray-400 truncate mt-0.5">
                        {dbTypeLabel[conn.connection.type]} &bull; {connSummary}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onEdit(conn)}
                    className="px-3 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-gray-400 dark:hover:text-white rounded transition"
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
                        className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-slate-600 dark:hover:bg-slate-500 dark:text-white rounded transition"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(conn.id)}
                      className="px-3 bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-700 dark:bg-slate-700 dark:hover:bg-red-800 dark:text-gray-400 dark:hover:text-white rounded transition"
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

      {/* List footer */}
      <div className="flex justify-end px-5 py-3 border-t border-gray-200 dark:border-slate-700 shrink-0">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm transition dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500"
        >
          Close
        </button>
      </div>
    </div>
  );
};

// ── ConnectionsModal ──────────────────────────────────────────────────────────

interface ConnectionsModalProps {
  onClose: () => void;
}

type ModalView = 'list' | 'form';

const ConnectionsModal: React.FC<ConnectionsModalProps> = ({ onClose }) => {
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<ModalView>('list');
  const [editingConnection, setEditingConnection] = useState<SavedConnection | undefined>(undefined);

  useEffect(() => {
    getSavedConnections()
      .then(setConnections)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load connections'))
      .finally(() => setLoading(false));
  }, []);

  const handleNew = () => {
    setEditingConnection(undefined);
    setView('form');
  };

  const handleEdit = (conn: SavedConnection) => {
    setEditingConnection(conn);
    setView('form');
  };

  const handleDelete = (deleted: SavedConnection) => {
    setConnections((prev) => prev.filter((c) => c.id !== deleted.id));
  };

  const handleSaved = (saved: SavedConnection) => {
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
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">Connections</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-2xl leading-none">
            &times;
          </button>
        </div>

        {/* Content — fills remaining space, children handle their own scroll */}
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
              onEdit={handleEdit}
              onDelete={handleDelete}
              onNew={handleNew}
              onClose={onClose}
            />
          ) : (
            <ConnectionForm
              initial={editingConnection}
              onSaved={handleSaved}
              onCancel={() => setView('list')}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ConnectionsModal;
