// CreateProjectWizard — 3-step modal wizard: DB Connection → Select Tables → Review/Save to create a new project.
import React, { useState, useEffect, useRef } from 'react';
import {
  analyzeSchema,
  getSavedConnections,
  saveConnection,
  testConnection,
  testConnectionById,
  DbConnection,
  DbDatabase,
  ConnectionType,
  ConnectionEnvironment,
  ENVIRONMENT_LABELS,
  SavedConnection,
} from '@/services/SchemaService';
import { saveProject } from '@/services/ProjectService';
import EnvironmentBadge from './EnvironmentBadge';
import { FaCheck, FaChevronRight, FaChevronDown, FaSpinner, FaTable, FaFolder, FaDatabase, FaTimes, FaSearch } from 'react-icons/fa';

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'failed';

type WizardStep = 'name-connection' | 'select-tables' | 'review';

interface SelectedTables {
  [schemaName: string]: Set<string>;
}

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'name-connection', label: 'Connection' },
  { id: 'select-tables', label: 'Select Tables' },
  { id: 'review', label: 'Review & Save' },
];

const StepIndicator: React.FC<{ current: WizardStep }> = ({ current }) => {
  const currentIdx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {STEPS.map((step, idx) => (
        <React.Fragment key={step.id}>
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition
                ${idx < currentIdx ? 'bg-green-600 text-white' : ''}
                ${idx === currentIdx ? 'bg-blue-600 text-white' : ''}
                ${idx > currentIdx ? 'bg-gray-200 text-gray-500 dark:bg-slate-600 dark:text-gray-400' : ''}`}
            >
              {idx < currentIdx ? <FaCheck size={12} /> : idx + 1}
            </div>
            <span className={`text-sm ${idx === currentIdx ? 'text-white' : 'text-gray-400'}`}>
              {step.label}
            </span>
          </div>
          {idx < STEPS.length - 1 && (
            <FaChevronRight className="text-slate-500 mx-1" size={12} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ── New-connection form state ─────────────────────────────────────────────────

interface NewConnForm {
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

const defaultNewConn = (): NewConnForm => ({
  id: crypto.randomUUID(),
  name: '',
  environment: 'None',
  dbType: ConnectionType.Postgres,
  enterUriManually: false,
  jdbcUri: '',
  host: 'localhost',
  port: DEFAULT_PORTS[ConnectionType.Postgres],
  database: 'northwind',
  username: 'postgres',
  password: 'postgres',
  authentication: 'SqlServer',
  identifier: 'ServiceName',
  pdbName: '',
  useSSL: false,
  sslMode: 'Prefer',
});

function formToDbConnection(f: NewConnForm): DbConnection {
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

// ── Wizard props ──────────────────────────────────────────────────────────────

interface CreateProjectWizardProps {
  onClose: () => void;
  onSaved: (projectId: string) => void;
}

const inputCls =
  'w-full px-3 py-2 bg-white text-gray-800 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-600 dark:text-white dark:border-slate-500';

const CreateProjectWizard: React.FC<CreateProjectWizardProps> = ({ onClose, onSaved }) => {
  const [step, setStep] = useState<WizardStep>('name-connection');

  // Step 1 state
  const [projectName, setProjectName] = useState('');
  const [connectionMode, setConnectionMode] = useState<'saved' | 'new'>('saved');
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [newConn, setNewConn] = useState<NewConnForm>(defaultNewConn);
  const [step1Error, setStep1Error] = useState<string | null>(null);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('idle');
  const [connTestMessage, setConnTestMessage] = useState<string | null>(null);

  // Step 2 state
  const [database, setDatabase] = useState<DbDatabase | null>(null);
  const [loadingSchemas, setLoadingSchemas] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [selectedTables, setSelectedTables] = useState<SelectedTables>({});
  const [tableFilter, setTableFilter] = useState('');

  // Step 3 state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    getSavedConnections()
      .then((conns) => {
        setSavedConnections(conns);
        if (conns.length === 0) setConnectionMode('new');
      })
      .catch(() => setConnectionMode('new'));
  }, []);

  const resetConnStatus = () => {
    setConnStatus('idle');
    setConnTestMessage(null);
  };

  const handleConnectionModeChange = (mode: 'saved' | 'new') => {
    setConnectionMode(mode);
    resetConnStatus();
  };

  const handleNewConnChange = <K extends keyof NewConnForm>(key: K, value: NewConnForm[K]) => {
    setNewConn((p) => ({ ...p, [key]: value }));
    if (key !== 'password') resetConnStatus();
  };

  const handleDbTypeChange = (type: ConnectionType) => {
    setNewConn((p) => ({ ...p, dbType: type, port: DEFAULT_PORTS[type] }));
    resetConnStatus();
  };


  // Find by id first, fall back to name match (handles backends that don't return id)
  const findSaved = (key: string | null) =>
    key ? savedConnections.find((c) => c.id === key || c.name === key) ?? null : null;

  const selectedSavedConn = findSaved(selectedConnectionId);

  const effectiveConnection: DbConnection | null =
    connectionMode === 'saved'
      ? selectedSavedConn?.connection ?? null
      : formToDbConnection(newConn);

  const handleTestConnection = async () => {
    setConnStatus('testing');
    setConnTestMessage(null);
    const result = (connectionMode === 'saved' && selectedSavedConn)
      ? await testConnectionById(selectedSavedConn.id)
      : await testConnection(effectiveConnection!);
    setConnStatus(result.success ? 'success' : 'failed');
    setConnTestMessage(result.message);
  };

  // ── Step 1 → Step 2 ──────────────────────────────────────────────────────────
  const handleStep1Next = async () => {
    setStep1Error(null);
    if (!projectName.trim()) { setStep1Error('Enter a project name'); return; }
    if (connectionMode === 'saved' && !selectedConnectionId) { setStep1Error('Select a saved connection'); return; }
    if (connectionMode === 'new') {
      if (!newConn.name.trim()) { setStep1Error('Enter a name for the new connection'); return; }
      if (!newConn.enterUriManually) {
        if (!newConn.host || !newConn.database || !newConn.username) {
          setStep1Error('Fill in all required connection fields (Host, Database, Username)');
          return;
        }
      } else {
        if (!newConn.jdbcUri) { setStep1Error('Enter a JDBC URI'); return; }
      }
      try {
        const saved = await saveConnection({
          id: newConn.id,
          name: newConn.name,
          environment: newConn.environment,
          connection: formToDbConnection(newConn),
        });
        // Add to local list and switch to saved mode
        setSavedConnections((prev) => [...prev, saved]);
        setSelectedConnectionId(saved.id || saved.name);
        setConnectionMode('saved');
      } catch (e) {
        setStep1Error(e instanceof Error ? e.message : 'Failed to save connection');
        return;
      }
    }

    setStep('select-tables');
    setLoadingSchemas(true);
    setSchemaError(null);
    try {
      const db = await analyzeSchema({
        connectionId: selectedSavedConn?.id,
        connection: effectiveConnection!,
        includeTables: true,
        includeColumns: true,
        includeRelationships: true,
      });
      setDatabase(db);
      const initial: SelectedTables = {};
      for (const schName of Object.keys(db.schemas)) {
        initial[schName] = new Set();
      }
      setSelectedTables(initial);
      setTableFilter('');
    } catch (e) {
      setSchemaError(e instanceof Error ? e.message : 'Failed to connect to database');
    } finally {
      setLoadingSchemas(false);
    }
  };

  // ── Table selection helpers ───────────────────────────────────────────────────
  const toggleTable = (schemaName: string, tableName: string) => {
    setSelectedTables((prev) => {
      const next = { ...prev };
      const set = new Set(next[schemaName] ?? []);
      if (set.has(tableName)) set.delete(tableName);
      else set.add(tableName);
      next[schemaName] = set;
      return next;
    });
  };

  const toggleSchema = (schemaName: string, allTables: string[]) => {
    setSelectedTables((prev) => {
      const next = { ...prev };
      const set = next[schemaName] ?? new Set<string>();
      const allSelected = allTables.every((t) => set.has(t));
      next[schemaName] = allSelected ? new Set() : new Set(allTables);
      return next;
    });
  };

  const totalSelected = Object.values(selectedTables).reduce((sum, s) => sum + s.size, 0);

  // ── Save project ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const schemas: Record<string, { name: string; tables: Record<string, object> }> = {};
      for (const [schName, tableSet] of Object.entries(selectedTables)) {
        if (tableSet.size === 0) continue;
        const tables: Record<string, object> = {};
        for (const tableName of tableSet) {
          const fullTable = database?.schemas[schName]?.tables?.[tableName];
          tables[tableName] = {
            tableName,
            schema: schName,
            columns: fullTable?.columns ?? null,
            relationships: fullTable?.relationships ?? null,
          };
        }
        schemas[schName] = { name: schName, tables };
      }
      const conn = selectedSavedConn ?? savedConnections.find((c) => c.id === selectedConnectionId);
      const id = crypto.randomUUID();
      await saveProject({
        id,
        name: projectName,
        version: '1.0',
        connectionId: conn?.id ?? selectedConnectionId ?? '',
        connectionName: conn?.name ?? '',
        schemas,
      });
      onSaved(id);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save project');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (step === 'select-tables') setStep('name-connection');
    else if (step === 'review') setStep('select-tables');
  };

  const isPostgres = newConn.dbType === ConnectionType.Postgres;
  const isSqlServer = newConn.dbType === ConnectionType.SqlServer;
  const isOracle = newConn.dbType === ConnectionType.Oracle;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">New Project</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-5">
          <StepIndicator current={step} />
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 pb-2">

          {/* ── STEP 1: Name & Connection ── */}
          {step === 'name-connection' && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Project Name *</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="My Project"
                  className="w-full px-4 py-2.5 bg-white text-gray-800 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white dark:border-slate-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Database Connection *</label>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => handleConnectionModeChange('saved')}
                    className={`px-4 py-1.5 rounded text-sm font-medium transition ${connectionMode === 'saved' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-600 dark:text-gray-300 dark:hover:bg-slate-500'}`}
                  >
                    Use Saved
                  </button>
                  <button
                    onClick={() => handleConnectionModeChange('new')}
                    className={`px-4 py-1.5 rounded text-sm font-medium transition ${connectionMode === 'new' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-600 dark:text-gray-300 dark:hover:bg-slate-500'}`}
                  >
                    New Connection
                  </button>
                </div>

                {/* Saved connections dropdown */}
                {connectionMode === 'saved' && (
                  <div className="space-y-2">
                    {savedConnections.length === 0 ? (
                      <p className="text-sm text-gray-400 py-2">
                        No saved connections — switch to "New Connection"
                      </p>
                    ) : (
                      <>
                        <select
                          value={selectedConnectionId ?? ''}
                          onChange={(e) => { setSelectedConnectionId(e.target.value || null); resetConnStatus(); }}
                          className="w-full px-3 py-2 bg-white text-gray-800 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white dark:border-slate-600"
                        >
                          <option value="">— Select a connection —</option>
                          {savedConnections.map((sc) => (
                            <option key={sc.id || sc.name} value={sc.id || sc.name}>{sc.name}</option>
                          ))}
                        </select>
                        {selectedSavedConn && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-slate-700 rounded text-xs text-gray-500 dark:text-gray-400">
                            <FaDatabase className="text-blue-400 shrink-0" size={12} />
                            <span className="truncate">
                              {selectedSavedConn.connection.type} &bull; {selectedSavedConn.connection.url}:{selectedSavedConn.connection.port} / {selectedSavedConn.connection.database}
                            </span>
                            <div className="ml-auto shrink-0">
                              <EnvironmentBadge environment={selectedSavedConn.environment} />
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* New connection form */}
                {connectionMode === 'new' && (
                  <div className="space-y-3 bg-gray-50 dark:bg-slate-700 p-4 rounded border border-gray-200 dark:border-transparent">

                    {/* Database Type */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Database Type</label>
                      <select
                        value={newConn.dbType}
                        onChange={(e) => handleDbTypeChange(e.target.value as ConnectionType)}
                        className={inputCls}
                      >
                        <option value={ConnectionType.Postgres}>PostgreSQL</option>
                        <option value={ConnectionType.MySql}>MySQL</option>
                        <option value={ConnectionType.SqlServer}>SQL Server</option>
                        <option value={ConnectionType.Oracle}>Oracle</option>
                      </select>
                    </div>

                    {/* Enter URI Manually */}
                    <div className="flex items-center gap-3">
                      <input
                        id="newConn-uriManual"
                        type="checkbox"
                        checked={newConn.enterUriManually}
                        onChange={(e) => handleNewConnChange('enterUriManually', e.target.checked)}
                        className="accent-blue-500 w-4 h-4"
                      />
                      <label htmlFor="newConn-uriManual" className="text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                        Enter URI Manually
                      </label>
                    </div>

                    {/* JDBC URI */}
                    {newConn.enterUriManually && (
                      <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">JDBC URI *</label>
                        <input
                          type="text"
                          value={newConn.jdbcUri}
                          onChange={(e) => handleNewConnChange('jdbcUri', e.target.value)}
                          placeholder="jdbc:postgresql://localhost:5432/mydb"
                          className={inputCls}
                        />
                      </div>
                    )}

                    {/* Host / Port */}
                    {!newConn.enterUriManually && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-300 mb-1">Host *</label>
                          <input
                            type="text"
                            value={newConn.host}
                            onChange={(e) => handleNewConnChange('host', e.target.value)}
                            placeholder="localhost"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-300 mb-1">Port *</label>
                          <input
                            type="number"
                            value={newConn.port}
                            onChange={(e) => handleNewConnChange('port', e.target.value)}
                            className={inputCls}
                          />
                        </div>
                      </div>
                    )}

                    {/* Database */}
                    {!newConn.enterUriManually && (
                      <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">Database *</label>
                        <input
                          type="text"
                          value={newConn.database}
                          onChange={(e) => handleNewConnChange('database', e.target.value)}
                          placeholder="database"
                          className={inputCls}
                        />
                      </div>
                    )}

                    {/* Authentication (SQL Server) */}
                    {isSqlServer && (
                      <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">Authentication</label>
                        <select
                          value={newConn.authentication}
                          onChange={(e) => handleNewConnChange('authentication', e.target.value as 'Windows' | 'SqlServer')}
                          className={inputCls}
                        >
                          <option value="Windows">Windows</option>
                          <option value="SqlServer">SQL Server</option>
                        </select>
                      </div>
                    )}

                    {/* Username / Password */}
                    {!newConn.enterUriManually && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-300 mb-1">Username *</label>
                          <input
                            type="text"
                            value={newConn.username}
                            onChange={(e) => handleNewConnChange('username', e.target.value)}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-300 mb-1">Password</label>
                          <input
                            type="password"
                            value={newConn.password}
                            onChange={(e) => handleNewConnChange('password', e.target.value)}
                            className={inputCls}
                          />
                        </div>
                      </div>
                    )}

                    {/* Oracle: Identifier + PDB Name */}
                    {isOracle && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-300 mb-1">Identifier</label>
                          <select
                            value={newConn.identifier}
                            onChange={(e) => handleNewConnChange('identifier', e.target.value as 'ServiceName' | 'SID')}
                            className={inputCls}
                          >
                            <option value="ServiceName">Service Name</option>
                            <option value="SID">SID</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-300 mb-1">PDB Name</label>
                          <input
                            type="text"
                            value={newConn.pdbName}
                            onChange={(e) => handleNewConnChange('pdbName', e.target.value)}
                            placeholder="Optional"
                            className={inputCls}
                          />
                        </div>
                      </>
                    )}

                    {/* Postgres: SSL */}
                    {isPostgres && (
                      <div className="border border-gray-200 dark:border-slate-600 rounded p-3 space-y-2">
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">SSL</div>
                        <div className="flex items-center gap-3">
                          <input
                            id="newConn-useSSL"
                            type="checkbox"
                            checked={newConn.useSSL}
                            onChange={(e) => handleNewConnChange('useSSL', e.target.checked)}
                            className="accent-blue-500 w-4 h-4"
                          />
                          <label htmlFor="newConn-useSSL" className="text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                            Use SSL
                          </label>
                        </div>
                        {newConn.useSSL && (
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">SSL Mode</label>
                            <select
                              value={newConn.sslMode}
                              onChange={(e) => handleNewConnChange('sslMode', e.target.value as NewConnForm['sslMode'])}
                              className={inputCls}
                            >
                              <option value="Prefer">Prefer</option>
                              <option value="Require">Require</option>
                              <option value="VerifyCA">Verify CA</option>
                              <option value="VerifyFull">Verify Full</option>
                            </select>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Divider */}
                    <hr className="border-gray-200 dark:border-slate-600" />

                    {/* Connection Name */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Connection Name *</label>
                      <input
                        type="text"
                        value={newConn.name}
                        onChange={(e) => handleNewConnChange('name', e.target.value)}
                        placeholder="my-database"
                        className={inputCls}
                      />
                    </div>

                    {/* Environment */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Environment</label>
                      <select
                        value={newConn.environment}
                        onChange={(e) => handleNewConnChange('environment', e.target.value as ConnectionEnvironment)}
                        className={inputCls}
                      >
                        {(Object.entries(ENVIRONMENT_LABELS) as [ConnectionEnvironment, string][]).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Test Connection */}
              {(connectionMode === 'new' || selectedConnectionId) && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={connStatus === 'testing' || (connectionMode === 'saved' && !selectedConnectionId)}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500"
                    >
                      {connStatus === 'testing' ? (
                        <><FaSpinner className="animate-spin" size={12} /> Testing...</>
                      ) : (
                        'Test Connection'
                      )}
                    </button>
                    {connStatus === 'success' && (
                      <span className="flex items-center gap-1.5 text-sm text-green-400">
                        <FaCheck size={12} /> Connected
                      </span>
                    )}
                    {connStatus === 'failed' && (
                      <span className="flex items-center gap-1.5 text-sm text-red-400">
                        <FaTimes size={12} /> Failed
                      </span>
                    )}
                  </div>
                  {connStatus === 'failed' && connTestMessage && (
                    <div className="p-3 bg-red-900/60 border border-red-700 rounded text-xs text-red-200 font-mono break-all">
                      {connTestMessage}
                    </div>
                  )}
                </div>
              )}

              {step1Error && (
                <div className="p-3 bg-red-900 border border-red-700 rounded text-sm text-red-100">{step1Error}</div>
              )}
            </div>
          )}

          {/* ── STEP 2: Select Tables ── */}
          {step === 'select-tables' && (
            <div>
              {loadingSchemas && (
                <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
                  <FaSpinner className="animate-spin text-lg" />
                  <span>Connecting to database...</span>
                </div>
              )}
              {schemaError && (
                <div className="p-3 bg-red-900 border border-red-700 rounded text-sm text-red-100 mb-4">{schemaError}</div>
              )}
              {!loadingSchemas && database && (
                <div>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="relative flex-1">
                      <FaSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={11} />
                      <input
                        type="text"
                        value={tableFilter}
                        onChange={(e) => setTableFilter(e.target.value)}
                        placeholder="Filter by schema or table name..."
                        className="w-full pl-7 pr-7 py-1.5 text-sm bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {tableFilter && (
                        <button
                          onClick={() => setTableFilter('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                          <FaTimes size={11} />
                        </button>
                      )}
                    </div>
                    <span className="text-sm text-gray-400 shrink-0">
                      {totalSelected} selected
                    </span>
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const filterLower = tableFilter.toLowerCase();
                      return Object.entries(database.schemas)
                        .filter(([schemaName, schema]) => {
                          if (!filterLower) return true;
                          if (schemaName.toLowerCase().includes(filterLower)) return true;
                          return Object.keys(schema.tables ?? {}).some((t) =>
                            t.toLowerCase().includes(filterLower)
                          );
                        })
                        .map(([schemaName, schema]) => {
                          const allTableNames = Object.keys(schema.tables ?? {});
                          const visibleTableNames = filterLower
                            ? allTableNames.filter(
                                (t) =>
                                  t.toLowerCase().includes(filterLower) ||
                                  schemaName.toLowerCase().includes(filterLower)
                              )
                            : allTableNames;
                          const selectedCount = selectedTables[schemaName]?.size ?? 0;
                          const allSelected =
                            allTableNames.length > 0 &&
                            allTableNames.every((t) => selectedTables[schemaName]?.has(t));
                          const someSelected = selectedCount > 0 && !allSelected;
                          return (
                            <SchemaTreeNode
                              key={schemaName}
                              schemaName={schemaName}
                              tableNames={visibleTableNames}
                              totalTableCount={allTableNames.length}
                              selectedCount={selectedCount}
                              allSelected={allSelected}
                              someSelected={someSelected}
                              selectedSet={selectedTables[schemaName] ?? new Set()}
                              isFiltering={!!filterLower}
                              onToggleSchema={() => toggleSchema(schemaName, allTableNames)}
                              onToggleTable={(t) => toggleTable(schemaName, t)}
                            />
                          );
                        });
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Review & Save ── */}
          {step === 'review' && (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-slate-700 rounded p-4 space-y-3 border border-gray-200 dark:border-transparent">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Project Name</span>
                  <span className="text-sm font-medium text-gray-800 dark:text-white">{projectName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Connection</span>
                  <span className="text-sm font-medium text-gray-800 dark:text-white">
                    {selectedSavedConn?.name ?? newConn.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Tables Selected</span>
                  <span className="text-sm font-medium text-gray-800 dark:text-white">{totalSelected}</span>
                </div>
              </div>

              <div className="space-y-2">
                {Object.entries(selectedTables)
                  .filter(([, s]) => s.size > 0)
                  .map(([schemaName, tableSet]) => (
                    <div key={schemaName} className="bg-gray-50 dark:bg-slate-700 rounded p-3 border border-gray-200 dark:border-transparent">
                      <div className="flex items-center gap-2 mb-2">
                        <FaFolder className="text-yellow-500" size={13} />
                        <span className="text-sm font-semibold text-gray-800 dark:text-white">{schemaName}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                          {tableSet.size} table{tableSet.size !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[...tableSet].sort().map((t) => (
                          <span key={t} className="text-xs bg-blue-50 text-blue-700 dark:bg-slate-600 dark:text-blue-300 px-2 py-0.5 rounded">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>

              {saveError && (
                <div className="p-3 bg-red-900 border border-red-700 rounded text-sm text-red-100">{saveError}</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-slate-700 mt-2">
          <div>
            {step !== 'name-connection' && (
              <button
                onClick={handleBack}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500"
            >
              Cancel
            </button>
            {step === 'name-connection' && (
              <button
                onClick={handleStep1Next}
                disabled={connStatus !== 'success'}
                className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium"
                title={connStatus !== 'success' ? 'Test the connection first' : undefined}
              >
                Next
              </button>
            )}
            {step === 'select-tables' && !loadingSchemas && !schemaError && (
              <button
                onClick={() => setStep('review')}
                disabled={totalSelected === 0}
                className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium"
              >
                Next
              </button>
            )}
            {step === 'review' && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
              >
                {saving ? <><FaSpinner className="animate-spin" /> Saving...</> : 'Save Project'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Schema tree node ──────────────────────────────────────────────────────────

interface SchemaTreeNodeProps {
  schemaName: string;
  tableNames: string[];
  totalTableCount: number;
  selectedCount: number;
  allSelected: boolean;
  someSelected: boolean;
  selectedSet: Set<string>;
  isFiltering: boolean;
  onToggleSchema: () => void;
  onToggleTable: (tableName: string) => void;
}

const SchemaTreeNode: React.FC<SchemaTreeNodeProps> = ({
  schemaName,
  tableNames,
  totalTableCount,
  selectedCount,
  allSelected,
  someSelected,
  selectedSet,
  isFiltering,
  onToggleSchema,
  onToggleTable,
}) => {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const isOpen = isFiltering || expanded;

  return (
    <div className="bg-gray-50 dark:bg-slate-700 rounded overflow-hidden border border-gray-200 dark:border-transparent">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-200 dark:bg-slate-600 select-none">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white shrink-0"
          title={isOpen ? 'Collapse' : 'Expand'}
        >
          {isOpen ? <FaChevronDown size={11} /> : <FaChevronRight size={11} />}
        </button>
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={allSelected}
          onChange={onToggleSchema}
          className="accent-blue-500 w-4 h-4 cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        />
        <button
          className="flex items-center gap-2 flex-1 text-left hover:opacity-80"
          onClick={() => setExpanded((v) => !v)}
        >
          <FaFolder className="text-yellow-500 shrink-0" size={14} />
          <span className="text-sm font-semibold text-gray-800 dark:text-white">{schemaName}</span>
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{selectedCount}/{totalTableCount}</span>
      </div>
      {isOpen && (
        <div className="divide-y divide-gray-200 dark:divide-slate-600/40">
          {tableNames.map((tableName) => (
            <div
              key={tableName}
              className="flex items-center gap-2 px-3 py-1.5 pl-8 hover:bg-gray-100 dark:hover:bg-slate-600 cursor-pointer select-none"
              onClick={() => onToggleTable(tableName)}
            >
              <input
                type="checkbox"
                checked={selectedSet.has(tableName)}
                onChange={() => onToggleTable(tableName)}
                className="accent-blue-500 w-4 h-4"
                onClick={(e) => e.stopPropagation()}
              />
              <FaTable className="text-blue-400" size={11} />
              <span className="text-sm text-gray-700 dark:text-gray-200">{tableName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CreateProjectWizard;
