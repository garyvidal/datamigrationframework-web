// MigrationWizard — 2-step modal wizard: select source project + MarkLogic connection → configure collection path and start migration.
import React, { useState, useEffect } from 'react';
import { FaCheck, FaChevronRight, FaSpinner, FaTimes, FaPlus } from 'react-icons/fa';
import { getSavedConnections, SavedConnection } from '@/services/SchemaService';
import { getSavedMarkLogicConnections, SavedMarkLogicConnection } from '@/services/MarkLogicService';
import { getProjects, ProjectData } from '@/services/ProjectService';
import { startMigrationJob, DeploymentJob } from '@/services/MigrationService';

type WizardStep = 'connections' | 'settings';

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'connections', label: 'Connections' },
  { id: 'settings', label: 'Path & Collections' },
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
  const [mlConnections, setMlConnections] = useState<SavedMarkLogicConnection[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedMlConnectionId, setSelectedMlConnectionId] = useState<string>('');
  const [step1Error, setStep1Error] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Step 2 state
  const [directoryPath, setDirectoryPath] = useState('/');
  const [collections, setCollections] = useState<string[]>([]);
  const [newCollection, setNewCollection] = useState('');
  const [step2Error, setStep2Error] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    Promise.all([getProjects(), getSavedMarkLogicConnections()])
      .then(([projs, mlConns]) => {
        setProjects(projs);
        setMlConnections(mlConns);
        if (projs.length > 0) setSelectedProjectId(projs[0].id ?? '');
        if (mlConns.length > 0) setSelectedMlConnectionId(mlConns[0].id ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectedProject = projects.find((p) => (p.id ?? p.name) === selectedProjectId);

  // Derive root element name from project mapping for path hint
  const rootElementName = (() => {
    if (!selectedProject) return '';
    const mt = selectedProject.mapping?.mappingType ?? 'XML';
    if (mt === 'JSON') return selectedProject.mapping?.jsonDocumentModel?.root?.jsonName ?? '';
    return selectedProject.mapping?.documentModel?.root?.xmlName ?? '';
  })();

  const handleStep1Next = () => {
    setStep1Error(null);
    if (!selectedProjectId) { setStep1Error('Select a project'); return; }
    if (!selectedMlConnectionId) { setStep1Error('Select a MarkLogic connection'); return; }

    // Pre-fill directory with rootElement variable
    if (rootElementName) {
      setDirectoryPath(`/{rootElement}/`);
    }
    setStep('settings');
  };

  const addCollection = () => {
    const trimmed = newCollection.trim();
    if (trimmed && !collections.includes(trimmed)) {
      setCollections((prev) => [...prev, trimmed]);
    }
    setNewCollection('');
  };

  const removeCollection = (c: string) => {
    setCollections((prev) => prev.filter((x) => x !== c));
  };

  const handleStart = async () => {
    setStep2Error(null);
    if (!directoryPath.trim()) { setStep2Error('Enter a directory path'); return; }

    setStarting(true);
    try {
      const job = await startMigrationJob({
        projectId: selectedProjectId,
        marklogicConnectionId: selectedMlConnectionId,
        directoryPath: directoryPath.trim(),
        collections,
      });
      onStarted(job);
    } catch (e) {
      setStep2Error(e instanceof Error ? e.message : 'Failed to start migration job');
    } finally {
      setStarting(false);
    }
  };

  const selectedMlConn = mlConnections.find(
    (c) => c.id === selectedMlConnectionId || c.name === selectedMlConnectionId
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">Migrate to MarkLogic</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-5">
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
                        onChange={(e) => setSelectedProjectId(e.target.value)}
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

          {/* ── STEP 2: Path & Collections ── */}
          {step === 'settings' && (
            <div className="space-y-5">
              {/* Directory Path */}
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

              {/* Collections */}
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                  Collections
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCollection}
                    onChange={(e) => setNewCollection(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCollection(); }}}
                    placeholder="e.g. my-collection"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={addCollection}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm shrink-0"
                  >
                    <FaPlus size={11} /> Add
                  </button>
                </div>
                {collections.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {collections.map((c) => (
                      <span
                        key={c}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 dark:bg-slate-600 dark:text-blue-300 rounded text-xs"
                      >
                        {c}
                        <button onClick={() => removeCollection(c)} className="hover:text-red-400 transition">
                          <FaTimes size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="bg-gray-50 dark:bg-slate-700 rounded p-4 space-y-2 border border-gray-200 dark:border-transparent text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Project</span>
                  <span className="text-gray-800 dark:text-white font-medium">{selectedProject?.name}</span>
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-slate-700 mt-2">
          <div>
            {step === 'settings' && (
              <button
                onClick={() => setStep('connections')}
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
            {step === 'connections' && (
              <button
                onClick={handleStep1Next}
                disabled={loading || !selectedProjectId || !selectedMlConnectionId}
                className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium"
              >
                Next
              </button>
            )}
            {step === 'settings' && (
              <button
                onClick={handleStart}
                disabled={starting || !directoryPath.trim()}
                className="px-5 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
              >
                {starting ? <><FaSpinner className="animate-spin" size={13} /> Starting...</> : 'Start Migration'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MigrationWizard;
