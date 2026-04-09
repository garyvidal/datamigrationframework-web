// MigrationWizard — 4-step modal wizard:
//   1. Connections  — select project, source RDBMS, MarkLogic connection
//   2. Path & Collections (via securityConfig)  — directory path + security overrides
//   3. Security  — job-level security overrides (permissions, collections, quality, metadata)
//   4. Summary  — row count preview + start button
import React, { useState, useEffect } from 'react';
import { FaCheck, FaChevronRight, FaSpinner, FaTimes, FaExclamationTriangle, FaFilter } from 'react-icons/fa';
import { getSavedConnections, SavedConnection } from '@/services/SchemaService';
import { getSavedMarkLogicConnections, SavedMarkLogicConnection } from '@/services/MarkLogicService';
import { getProjects, MarkLogicSecurityConfig, ProjectData } from '@/services/ProjectService';
import { startMigrationJob, getMigrationPreview, validateMigration, DeploymentJob, MigrationPreview, ValidationReport, ValidationCheck } from '@/services/MigrationService';
import { FaCheckCircle, FaTimesCircle, FaExclamationCircle } from 'react-icons/fa';
import SecurityConfigEditor from '@/components/Security/SecurityConfigEditor';

type WizardStep = 'connections' | 'settings' | 'security' | 'validation' | 'summary';

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'connections', label: 'Connections' },
  { id: 'settings',    label: 'Path' },
  { id: 'security',    label: 'Security' },
  { id: 'validation',  label: 'Validation' },
  { id: 'summary',     label: 'Summary' },
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

interface MigrationWizardProps {
  onClose: () => void;
  onStarted: (job: DeploymentJob) => void;
}

const inputCls =
  'w-full px-3 py-2 bg-white text-gray-800 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-600 dark:text-white dark:border-slate-500';

const MigrationWizard: React.FC<MigrationWizardProps> = ({ onClose, onStarted }) => {
  const [step, setStep] = useState<WizardStep>('connections');

  // Step 1 state
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [rdbmsConnections, setRdbmsConnections] = useState<SavedConnection[]>([]);
  const [mlConnections, setMlConnections] = useState<SavedMarkLogicConnection[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedSourceConnectionId, setSelectedSourceConnectionId] = useState<string>('');
  const [selectedMlConnectionId, setSelectedMlConnectionId] = useState<string>('');
  const [step1Error, setStep1Error] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Step 2 state
  const [directoryPath, setDirectoryPath] = useState('/');
  const [transformName, setTransformName] = useState('');
  const [transformParams, setTransformParams] = useState<Record<string, string>>({});
  const [newParamKey, setNewParamKey] = useState('');
  const [newParamValue, setNewParamValue] = useState('');
  const [step2Error, setStep2Error] = useState<string | null>(null);

  // Step 3 state — security overrides (initialised from project defaults when project is selected)
  const [securityConfig, setSecurityConfig] = useState<MarkLogicSecurityConfig>({});

  // Step 4 — validation state
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Step 5 state
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(false);

  useEffect(() => {
    Promise.all([getProjects(), getSavedMarkLogicConnections(), getSavedConnections()])
      .then(([projs, mlConns, rdbmsConns]) => {
        setProjects(projs);
        setMlConnections(mlConns);
        setRdbmsConnections(rdbmsConns);
        if (mlConns.length > 0) setSelectedMlConnectionId(mlConns[0].id ?? '');
        if (projs.length > 0) {
          const firstProj = projs[0];
          setSelectedProjectId(firstProj.id ?? '');
          setSecurityConfig(firstProj.securityConfig ?? {});
          const defaultConn = rdbmsConns.find(
            (c) => c.id === firstProj.connectionId || c.name === firstProj.connectionName
          );
          setSelectedSourceConnectionId(defaultConn?.id ?? rdbmsConns[0]?.id ?? '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectedProject = projects.find((p) => (p.id ?? p.name) === selectedProjectId);

  const rootElementName = (() => {
    if (!selectedProject) return '';
    const mt = selectedProject.mapping?.mappingType ?? 'XML';
    if (mt === 'JSON') return selectedProject.mapping?.jsonDocumentModel?.root?.jsonName ?? '';
    return selectedProject.mapping?.documentModel?.root?.xmlName ?? '';
  })();

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    const proj = projects.find((p) => (p.id ?? p.name) === projectId);
    if (proj) {
      setSecurityConfig(proj.securityConfig ?? {});
      const defaultConn = rdbmsConnections.find(
        (c) => c.id === proj.connectionId || c.name === proj.connectionName
      );
      setSelectedSourceConnectionId(defaultConn?.id ?? rdbmsConnections[0]?.id ?? '');
    }
  };

  const handleStep1Next = () => {
    setStep1Error(null);
    if (!selectedProjectId) { setStep1Error('Select a project'); return; }
    if (!selectedSourceConnectionId) { setStep1Error('Select a source RDBMS connection'); return; }
    if (!selectedMlConnectionId) { setStep1Error('Select a MarkLogic connection'); return; }
    if (rootElementName) setDirectoryPath(`/{rootElement}/`);
    setStep('settings');
  };

  const handleStep2Next = () => {
    setStep2Error(null);
    if (!directoryPath.trim()) { setStep2Error('Enter a directory path'); return; }
    setStep('security');
  };

  const handleStep3Next = async () => {
    setValidating(true);
    setValidationReport(null);
    setValidationError(null);
    setStep('validation');
    try {
      const report = await validateMigration({
        projectId: selectedProjectId,
        sourceConnectionId: selectedSourceConnectionId,
        marklogicConnectionId: selectedMlConnectionId,
        directoryPath: directoryPath.trim(),
        collections: securityConfig.collections ?? [],
        securityConfig,
      });
      setValidationReport(report);
    } catch (e) {
      setValidationError(e instanceof Error ? e.message : 'Validation request failed');
    } finally {
      setValidating(false);
    }
  };

  const handleValidationNext = async () => {
    setPreviewLoading(true);
    setPreview(null);
    setPreviewError(null);
    setStartError(null);
    setStep('summary');
    try {
      const result = await getMigrationPreview(selectedProjectId, selectedSourceConnectionId);
      setPreview(result);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Failed to load row counts');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleStart = async () => {
    setStartError(null);
    setStarting(true);
    try {
      const job = await startMigrationJob({
        projectId: selectedProjectId,
        sourceConnectionId: selectedSourceConnectionId,
        marklogicConnectionId: selectedMlConnectionId,
        directoryPath: directoryPath.trim(),
        collections: securityConfig.collections ?? [],
        securityConfig,
        transformName: transformName.trim() || undefined,
        transformParams: transformName.trim() && Object.keys(transformParams).length > 0 ? transformParams : undefined,
        dryRun,
      });
      onStarted(job);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Failed to start migration job');
    } finally {
      setStarting(false);
    }
  };

  const selectedMlConn = mlConnections.find(
    (c) => c.id === selectedMlConnectionId || c.name === selectedMlConnectionId
  );

  const hasSecurityOverrides = !!(
    (securityConfig.permissions?.length) ||
    (securityConfig.collections?.length) ||
    securityConfig.quality != null ||
    Object.keys(securityConfig.metadata ?? {}).length > 0
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">Migrate to MarkLogic</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-5 shrink-0">
          <StepIndicator current={step} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-2">

          {/* ── STEP 1: Connections ── */}
          {step === 'connections' && (
            <div className="space-y-5">
              {loading ? (
                <div className="flex items-center justify-center py-12 gap-3 text-gray-400">
                  <FaSpinner className="animate-spin" />
                  <span>Loading...</span>
                </div>
              ) : (
                <>
                  {/* Project */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                      Source Project *
                    </label>
                    {projects.length === 0 ? (
                      <p className="text-sm text-red-400">No projects found. Create a project first.</p>
                    ) : (
                      <select
                        value={selectedProjectId}
                        onChange={(e) => handleProjectChange(e.target.value)}
                        className={inputCls}
                      >
                        <option value="">— Select a project —</option>
                        {projects.map((p) => (
                          <option key={p.id ?? p.name} value={p.id ?? p.name}>{p.name}</option>
                        ))}
                      </select>
                    )}
                    {selectedProject && rootElementName && (
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        Root element: <span className="font-mono text-blue-400">{rootElementName}</span>
                        {' '}— use <span className="font-mono text-blue-400">{'{rootElement}'}</span> in path
                      </p>
                    )}
                    {selectedProject?.securityConfig && (
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        Project has security defaults — you can override them in the Security step.
                      </p>
                    )}
                  </div>

                  {/* Source RDBMS connection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                      Source RDBMS Connection *
                    </label>
                    {rdbmsConnections.length === 0 ? (
                      <p className="text-sm text-red-400">No RDBMS connections found. Add one via the Connections menu.</p>
                    ) : (
                      <select
                        value={selectedSourceConnectionId}
                        onChange={(e) => setSelectedSourceConnectionId(e.target.value)}
                        className={inputCls}
                      >
                        <option value="">— Select a connection —</option>
                        {rdbmsConnections.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                    {selectedSourceConnectionId && (() => {
                      const conn = rdbmsConnections.find((c) => c.id === selectedSourceConnectionId);
                      return conn ? (
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                          {conn.connection.type} — {conn.connection.url}:{conn.connection.port}
                          {conn.connection.database ? `/${conn.connection.database}` : ''}
                        </p>
                      ) : null;
                    })()}
                  </div>

                  {/* MarkLogic connection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                      MarkLogic Connection *
                    </label>
                    {mlConnections.length === 0 ? (
                      <p className="text-sm text-red-400">No MarkLogic connections found. Add one via the Connections menu.</p>
                    ) : (
                      <select
                        value={selectedMlConnectionId}
                        onChange={(e) => setSelectedMlConnectionId(e.target.value)}
                        className={inputCls}
                      >
                        <option value="">— Select a connection —</option>
                        {mlConnections.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                    {selectedMlConn && (
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        {selectedMlConn.connection.host}:{selectedMlConn.connection.port}
                        {selectedMlConn.connection.database ? ` / ${selectedMlConn.connection.database}` : ''}
                      </p>
                    )}
                  </div>
                </>
              )}

              {step1Error && (
                <div className="p-3 bg-red-900 border border-red-700 rounded text-sm text-red-100">{step1Error}</div>
              )}
            </div>
          )}

          {/* ── STEP 2: Path ── */}
          {step === 'settings' && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Directory Path *
                </label>
                <input
                  type="text"
                  value={directoryPath}
                  onChange={(e) => setDirectoryPath(e.target.value)}
                  placeholder="/{rootElement}/"
                  className={inputCls}
                />
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  Supports variables:{' '}
                  <span className="font-mono text-blue-400">{'{rootElement}'}</span>{' '}
                  <span className="font-mono text-blue-400">{'{index}'}</span>
                </p>
              </div>

              {/* Transform */}
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Ingest Transform <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={transformName}
                  onChange={(e) => setTransformName(e.target.value)}
                  placeholder="e.g. my-transform"
                  className={inputCls}
                />
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  Name of a server-side MarkLogic REST transform to apply on ingest.
                </p>
              </div>

              {/* Transform params — only shown when a transform name is set */}
              {transformName.trim() && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Transform Parameters
                  </label>
                  <div className="space-y-1">
                    {Object.entries(transformParams).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 font-mono px-2 py-1 bg-gray-100 dark:bg-slate-600 rounded text-gray-700 dark:text-gray-200 truncate">{k}</span>
                        <span className="text-gray-400">=</span>
                        <span className="flex-1 font-mono px-2 py-1 bg-gray-100 dark:bg-slate-600 rounded text-gray-700 dark:text-gray-200 truncate">{v}</span>
                        <button
                          onClick={() => setTransformParams(p => { const n = { ...p }; delete n[k]; return n; })}
                          className="text-gray-400 hover:text-red-500 transition shrink-0"
                          title="Remove"
                        >&times;</button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newParamKey}
                        onChange={(e) => setNewParamKey(e.target.value)}
                        placeholder="param name"
                        className="flex-1 px-2 py-1 text-sm bg-white dark:bg-slate-600 text-gray-800 dark:text-white border border-gray-300 dark:border-slate-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-gray-400 text-sm">=</span>
                      <input
                        type="text"
                        value={newParamValue}
                        onChange={(e) => setNewParamValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newParamKey.trim()) {
                            setTransformParams(p => ({ ...p, [newParamKey.trim()]: newParamValue }));
                            setNewParamKey(''); setNewParamValue('');
                          }
                        }}
                        placeholder="value"
                        className="flex-1 px-2 py-1 text-sm bg-white dark:bg-slate-600 text-gray-800 dark:text-white border border-gray-300 dark:border-slate-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => {
                          if (newParamKey.trim()) {
                            setTransformParams(p => ({ ...p, [newParamKey.trim()]: newParamValue }));
                            setNewParamKey(''); setNewParamValue('');
                          }
                        }}
                        disabled={!newParamKey.trim()}
                        className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-40 transition shrink-0"
                      >Add</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="bg-gray-50 dark:bg-slate-700 rounded p-4 space-y-2 border border-gray-200 dark:border-transparent text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Project</span>
                  <span className="text-gray-800 dark:text-white font-medium">{selectedProject?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Source DB</span>
                  <span className="text-gray-800 dark:text-white font-medium">
                    {rdbmsConnections.find((c) => c.id === selectedSourceConnectionId)?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">MarkLogic</span>
                  <span className="text-gray-800 dark:text-white font-medium">{selectedMlConn?.name}</span>
                </div>
              </div>

              {step2Error && (
                <div className="p-3 bg-red-900 border border-red-700 rounded text-sm text-red-100">{step2Error}</div>
              )}
            </div>
          )}

          {/* ── STEP 3: Security ── */}
          {step === 'security' && (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Configure document-level security for this job.
                {selectedProject?.securityConfig
                  ? ' Settings are pre-filled from the project defaults — modify as needed.'
                  : ' Leave empty to use MarkLogic server defaults.'}
              </p>
              <SecurityConfigEditor value={securityConfig} onChange={setSecurityConfig} />
            </div>
          )}

          {/* ── STEP 4: Validation ── */}
          {step === 'validation' && (
            <div className="space-y-4">
              {validating && (
                <div className="flex items-center justify-center py-12 gap-3 text-gray-400">
                  <FaSpinner className="animate-spin" />
                  <span>Running pre-flight checks...</span>
                </div>
              )}

              {validationError && !validating && (
                <div className="flex items-start gap-2 p-3 bg-yellow-900/40 border border-yellow-700 rounded text-sm text-yellow-200">
                  <FaExclamationTriangle className="mt-0.5 shrink-0" size={13} />
                  <span>Validation request failed: {validationError}. You may still proceed.</span>
                </div>
              )}

              {validationReport && !validating && (
                <>
                  <div className="rounded border border-gray-200 dark:border-slate-600 overflow-hidden">
                    {(['CONNECTIVITY', 'MAPPING', 'SECURITY'] as const).map(category => {
                      const checks = validationReport.checks.filter(c => c.category === category);
                      if (checks.length === 0) return null;
                      return (
                        <div key={category}>
                          <div className="px-3 py-1.5 bg-gray-100 dark:bg-slate-700 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            {category}
                          </div>
                          {checks.map((check: ValidationCheck) => (
                            <div key={check.checkId} className="flex items-start gap-3 px-3 py-2.5 border-t border-gray-100 dark:border-slate-600 bg-white dark:bg-slate-800">
                              <div className="mt-0.5 shrink-0">
                                {check.status === 'PASS' && <FaCheckCircle className="text-green-500" size={14} />}
                                {check.status === 'WARN' && <FaExclamationCircle className="text-amber-400" size={14} />}
                                {check.status === 'FAIL' && <FaTimesCircle className="text-red-500" size={14} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm text-gray-800 dark:text-white">{check.label}</span>
                                {check.detail && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate" title={check.detail}>{check.detail}</p>
                                )}
                                {check.hint && check.status !== 'PASS' && (
                                  <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">{check.hint}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>

                  {validationReport.canProceed ? (
                    <div className={`p-3 rounded text-sm font-medium ${validationReport.hasWarnings ? 'bg-amber-900/30 border border-amber-700 text-amber-200' : 'bg-green-900/30 border border-green-700 text-green-200'}`}>
                      {validationReport.hasWarnings
                        ? 'Checks passed with warnings — review before proceeding.'
                        : 'All checks passed — ready to migrate.'}
                    </div>
                  ) : (
                    <div className="p-3 rounded text-sm font-medium bg-red-900/30 border border-red-700 text-red-200">
                      One or more checks failed — fix the issues above before proceeding.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── STEP 5: Summary ── */}
          {step === 'summary' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Row counts from <span className="font-medium text-gray-700 dark:text-gray-200">{selectedProject?.name}</span>:
              </p>

              {previewLoading && (
                <div className="flex items-center justify-center py-10 gap-3 text-gray-400">
                  <FaSpinner className="animate-spin" />
                  <span>Counting rows...</span>
                </div>
              )}

              {previewError && (
                <div className="flex items-start gap-2 p-3 bg-yellow-900/40 border border-yellow-700 rounded text-sm text-yellow-200">
                  <FaExclamationTriangle className="mt-0.5 shrink-0" size={13} />
                  <span>Could not load row counts: {previewError}. You can still proceed with the migration.</span>
                </div>
              )}

              {preview && (
                <div className="rounded border border-gray-200 dark:border-slate-600 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-slate-700 text-left">
                        <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Schema</th>
                        <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Table</th>
                        <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Role</th>
                        <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Filter</th>
                        <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300 text-right whitespace-nowrap">Rows</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.tables.map((t, i) => (
                        <tr
                          key={i}
                          className="border-t border-gray-100 dark:border-slate-600 odd:bg-white even:bg-gray-50 dark:odd:bg-slate-800 dark:even:bg-slate-700"
                        >
                          <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono text-xs">{t.schema ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-800 dark:text-white font-mono text-xs">{t.tableName}</td>
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              t.role === 'root'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                : 'bg-gray-100 text-gray-600 dark:bg-slate-600 dark:text-gray-300'
                            }`}>
                              {t.role}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {t.whereClause ? (
                              <span
                                title={`WHERE ${t.whereClause}`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-700 max-w-[160px]"
                              >
                                <FaFilter size={9} className="shrink-0" />
                                <span className="truncate font-mono">{t.whereClause}</span>
                              </span>
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-800 dark:text-white whitespace-nowrap">
                            {t.rowCount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700">
                        <td colSpan={4} className="px-3 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300">
                          Total documents to migrate
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 dark:text-white">
                          {preview.totalRows.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Security summary */}
              {hasSecurityOverrides && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <p className="font-medium">Security settings will be applied:</p>
                  {(securityConfig.permissions?.length ?? 0) > 0 && (
                    <p className="text-xs">{securityConfig.permissions!.length} permission(s): {securityConfig.permissions!.map(p => p.roleName).join(', ')}</p>
                  )}
                  {(securityConfig.collections?.length ?? 0) > 0 && (
                    <p className="text-xs">Collections: {securityConfig.collections!.join(', ')}</p>
                  )}
                  {securityConfig.quality != null && (
                    <p className="text-xs">Quality: {securityConfig.quality}</p>
                  )}
                  {Object.keys(securityConfig.metadata ?? {}).length > 0 && (
                    <p className="text-xs">{Object.keys(securityConfig.metadata!).length} metadata key(s)</p>
                  )}
                </div>
              )}

              {/* Transform summary */}
              {transformName.trim() && (
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded text-sm text-purple-700 dark:text-purple-300 space-y-1">
                  <p className="font-medium">Ingest transform: <span className="font-mono">{transformName.trim()}</span></p>
                  {Object.keys(transformParams).length > 0 && (
                    <p className="text-xs">{Object.keys(transformParams).length} parameter(s): {Object.entries(transformParams).map(([k, v]) => `${k}=${v}`).join(', ')}</p>
                  )}
                </div>
              )}

              {/* Dry run toggle */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700 rounded border border-gray-200 dark:border-slate-600">
                <input
                  type="checkbox"
                  id="dryRunCheck"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="w-4 h-4 accent-blue-600"
                />
                <label htmlFor="dryRunCheck" className="text-sm text-gray-700 dark:text-gray-200 cursor-pointer select-none">
                  Dry run — count documents only, do not write to MarkLogic
                </label>
              </div>

              {startError && (
                <div className="p-3 bg-red-900 border border-red-700 rounded text-sm text-red-100">{startError}</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-slate-700 mt-2">
          <div>
            {step === 'settings' && (
              <button onClick={() => setStep('connections')} className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500">
                Back
              </button>
            )}
            {step === 'security' && (
              <button onClick={() => setStep('settings')} className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500">
                Back
              </button>
            )}
            {step === 'validation' && (
              <button onClick={() => setStep('security')} disabled={validating} className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed">
                Back
              </button>
            )}
            {step === 'summary' && (
              <button onClick={() => setStep('validation')} disabled={starting} className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed">
                Back
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500">
              Cancel
            </button>
            {step === 'connections' && (
              <button
                onClick={handleStep1Next}
                disabled={loading || !selectedProjectId || !selectedSourceConnectionId || !selectedMlConnectionId}
                className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium"
              >
                Next
              </button>
            )}
            {step === 'settings' && (
              <button
                onClick={handleStep2Next}
                disabled={!directoryPath.trim()}
                className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium"
              >
                Next
              </button>
            )}
            {step === 'security' && (
              <button onClick={handleStep3Next} className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium">
                Next
              </button>
            )}
            {step === 'validation' && (
              <button
                onClick={handleValidationNext}
                disabled={validating || (validationReport != null && !validationReport.canProceed)}
                className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium"
              >
                Next
              </button>
            )}
            {step === 'summary' && (
              <button
                onClick={handleStart}
                disabled={starting || previewLoading}
                className="px-5 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
              >
                {starting ? <><FaSpinner className="animate-spin" size={13} /> Starting...</> : dryRun ? 'Start Dry Run' : 'Start Migration'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MigrationWizard;
