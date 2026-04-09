// OpenProjectModal — Modal listing saved projects with open, rename, delete, export-package, and new-project actions.
// Footer provides an Import Package button.
import React, { useEffect, useRef, useState } from 'react';
import { FaFolderOpen, FaTimes, FaTrash, FaPlus, FaPencilAlt, FaDownload, FaUpload } from 'react-icons/fa';
import { ProjectData, getProjects, deleteProject, saveProject, downloadPackage, ImportResult } from '@/services/ProjectService';
import { getSavedConnections, SavedConnection } from '@/services/SchemaService';
import { getSavedMarkLogicConnections, SavedMarkLogicConnection } from '@/services/MarkLogicService';
import ImportPackageModal from './ImportPackageModal';

interface OpenProjectModalProps {
  onOpen: (project: ProjectData) => void;
  onClose: () => void;
  onDeleted?: (projectName: string) => void;
  onRenamed?: (oldName: string, newName: string) => void;
  onNewProject?: () => void;
  alreadyOpenNames: string[];
}

/** Minimal inline export picker shown when the download icon is clicked. */
interface ExportPickerState {
  projectId: string;
  projectName: string;
  sourceConnectionId: string;
  marklogicConnectionId: string;
}

export default function OpenProjectModal({ onOpen, onClose, onDeleted, onRenamed, onNewProject, alreadyOpenNames }: OpenProjectModalProps) {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Export package
  const [exportPicker, setExportPicker] = useState<ExportPickerState | null>(null);
  const [dbConnections, setDbConnections] = useState<SavedConnection[]>([]);
  const [mlConnections, setMlConnections] = useState<SavedMarkLogicConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);

  // Import package
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    if (renamingName && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingName]);

  useEffect(() => {
    getProjects()
      .then(setProjects)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load projects'))
      .finally(() => setLoading(false));
  }, []);

  const loadConnections = async () => {
    if (dbConnections.length > 0 || mlConnections.length > 0) return;
    setConnectionsLoading(true);
    try {
      const [db, ml] = await Promise.all([getSavedConnections(), getSavedMarkLogicConnections()]);
      setDbConnections(db);
      setMlConnections(ml);
    } finally {
      setConnectionsLoading(false);
    }
  };

  const openExportPicker = async (project: ProjectData) => {
    setConfirmDelete(null);
    setRenamingName(null);
    await loadConnections();
    setExportPicker({
      projectId: project.id ?? project.name,
      projectName: project.name,
      sourceConnectionId: project.connectionId ?? '',
      marklogicConnectionId: '',
    });
  };

  const handleExportDownload = () => {
    if (!exportPicker) return;
    downloadPackage(
      exportPicker.projectId,
      exportPicker.sourceConnectionId || undefined,
      exportPicker.marklogicConnectionId || undefined,
    );
    setExportPicker(null);
  };

  const handleRename = async (project: ProjectData) => {
    const newName = renameValue.trim();
    if (!newName || newName === project.name) { setRenamingName(null); return; }
    const conflict = projects.find(
      (p) => p.name.toLowerCase() === newName.toLowerCase() && (p.id ?? p.name) !== (project.id ?? project.name)
    );
    if (conflict) {
      setError(`A project named "${newName}" already exists.`);
      return;
    }
    setRenaming(true);
    try {
      await saveProject({ ...project, name: newName });
      setProjects((prev) => prev.map((p) => (p.id ?? p.name) === (project.id ?? project.name) ? { ...p, name: newName } : p));
      onRenamed?.(project.name, newName);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename project');
    } finally {
      setRenaming(false);
      setRenamingName(null);
    }
  };

  const handleDelete = async (project: ProjectData) => {
    setDeleting(true);
    try {
      await deleteProject(project.id ?? project.name);
      setProjects((prev) => prev.filter((p) => (p.id ?? p.name) !== (project.id ?? project.name)));
      onDeleted?.(project.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete project');
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const handleImported = (result: ImportResult) => {
    // Refresh the project list after a successful import
    getProjects().then(setProjects).catch(() => {});
  };

  const selectCls =
    'w-full px-2 py-1.5 text-xs bg-white dark:bg-slate-700 text-gray-800 dark:text-white border border-gray-300 dark:border-slate-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <>
      <div className="dark fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-700 rounded-lg shadow-2xl w-full max-w-2xl mx-4">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-600">
            <h2 className="text-gray-800 dark:text-white font-semibold text-lg">Open Project</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white">
              <FaTimes />
            </button>
          </div>

          <div className="px-6 py-4 max-h-[32rem] overflow-y-auto">
            {loading && <p className="text-gray-400 text-sm">Loading projects...</p>}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            {!loading && !error && projects.length === 0 && (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <p className="text-gray-400 text-sm">No saved projects found.</p>
                {onNewProject && (
                  <button
                    onClick={() => { onClose(); onNewProject(); }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition"
                  >
                    <FaPlus size={12} /> Create New Project
                  </button>
                )}
              </div>
            )}
            {!loading && !error && projects.length > 0 && (
              <ul className="space-y-2">
                {projects.map((project) => {
                  const projectKey = project.id ?? project.name;
                  const isOpen = alreadyOpenNames.includes(project.name);
                  const isConfirming = confirmDelete === projectKey;
                  const tableCount = Object.values(project.schemas).reduce(
                    (sum, s) => sum + Object.keys(s.tables ?? {}).length,
                    0
                  );
                  const isRenaming = renamingName === projectKey;
                  const isExporting = exportPicker?.projectName === project.name;

                  return (
                    <li key={projectKey} className="space-y-1">
                      {isRenaming ? (
                        <div className="flex items-stretch gap-2">
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(project);
                              if (e.key === 'Escape') setRenamingName(null);
                            }}
                            className="flex-1 px-3 py-2 bg-white text-gray-800 text-sm rounded border border-gray-300 focus:outline-none focus:border-blue-400 dark:bg-slate-800 dark:text-white dark:border-slate-500"
                          />
                          <button
                            onClick={() => handleRename(project)}
                            disabled={renaming}
                            className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition disabled:opacity-50 shrink-0"
                          >
                            {renaming ? '...' : 'Save'}
                          </button>
                          <button
                            onClick={() => setRenamingName(null)}
                            className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-slate-500 dark:hover:bg-slate-400 dark:text-white rounded transition shrink-0"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-stretch gap-2">
                          <button
                            onClick={() => { if (!isOpen) onOpen(project); }}
                            disabled={isOpen}
                            className={`flex-1 text-left px-3 py-2 rounded flex items-start gap-3 transition ${
                              isOpen
                                ? 'bg-gray-100 dark:bg-slate-600 opacity-50 cursor-default'
                                : 'bg-gray-100 hover:bg-gray-200 dark:bg-slate-600 dark:hover:bg-slate-500 cursor-pointer'
                            }`}
                          >
                            <FaFolderOpen className="text-yellow-400 mt-0.5 shrink-0" size={16} />
                            <div className="min-w-0">
                              <div className="text-gray-800 dark:text-white text-sm font-medium truncate">{project.name}</div>
                              <div className="text-gray-400 text-xs mt-0.5">
                                {Object.keys(project.schemas).length} schema{Object.keys(project.schemas).length !== 1 ? 's' : ''} &bull; {tableCount} table{tableCount !== 1 ? 's' : ''}
                                {project.connectionName && <> &bull; {project.connectionName}</>}
                              </div>
                              {isOpen && <div className="text-cyan-400 text-xs mt-0.5">Already open</div>}
                            </div>
                          </button>

                          {/* Export package */}
                          <button
                            onClick={() => isExporting ? setExportPicker(null) : openExportPicker(project)}
                            className={`shrink-0 px-3 rounded transition ${
                              isExporting
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-blue-600 dark:bg-slate-600 dark:hover:bg-slate-500 dark:text-gray-400 dark:hover:text-blue-300'
                            }`}
                            title="Export as package"
                          >
                            <FaDownload size={12} />
                          </button>

                          {/* Rename */}
                          <button
                            onClick={() => { setRenamingName(projectKey); setRenameValue(project.name); setConfirmDelete(null); setExportPicker(null); }}
                            className="shrink-0 px-3 rounded bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 dark:bg-slate-600 dark:hover:bg-slate-500 dark:text-gray-400 dark:hover:text-white transition"
                            title={`Rename ${project.name}`}
                          >
                            <FaPencilAlt size={12} />
                          </button>

                          {/* Delete */}
                          {isConfirming ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleDelete(project)}
                                disabled={deleting}
                                className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition disabled:opacity-50"
                              >
                                {deleting ? '...' : 'Delete'}
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-slate-500 dark:hover:bg-slate-400 dark:text-white rounded transition"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setConfirmDelete(projectKey); setExportPicker(null); }}
                              className="shrink-0 px-3 rounded bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-700 dark:bg-slate-600 dark:hover:bg-red-800 dark:text-gray-400 dark:hover:text-white transition"
                              title={`Delete ${project.name}`}
                            >
                              <FaTrash size={12} />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Inline export picker */}
                      {isExporting && exportPicker && (
                        <div className="ml-1 p-3 bg-blue-50 dark:bg-slate-800 rounded-lg border border-blue-200 dark:border-slate-600 space-y-2">
                          <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                              Source connection
                            </label>
                            {connectionsLoading ? (
                              <p className="text-xs text-gray-400">Loading...</p>
                            ) : (
                              <select
                                value={exportPicker.sourceConnectionId}
                                onChange={(e) => setExportPicker(p => p ? { ...p, sourceConnectionId: e.target.value } : p)}
                                className={selectCls}
                              >
                                <option value="">— None —</option>
                                {dbConnections.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                              MarkLogic connection
                            </label>
                            {connectionsLoading ? (
                              <p className="text-xs text-gray-400">Loading...</p>
                            ) : (
                              <select
                                value={exportPicker.marklogicConnectionId}
                                onChange={(e) => setExportPicker(p => p ? { ...p, marklogicConnectionId: e.target.value } : p)}
                                className={selectCls}
                              >
                                <option value="">— None —</option>
                                {mlConnections.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            )}
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              onClick={() => setExportPicker(null)}
                              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white transition"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleExportDownload}
                              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition flex items-center gap-1"
                            >
                              <FaDownload size={10} /> Download
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="px-6 py-3 border-t border-gray-200 dark:border-slate-600 flex items-center justify-between">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-blue-700 dark:bg-slate-600 dark:hover:bg-slate-500 dark:text-gray-300 dark:hover:text-blue-300 rounded transition"
            >
              <FaUpload size={11} /> Import Package
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {showImport && (
        <ImportPackageModal
          onClose={() => setShowImport(false)}
          onImported={(result) => {
            handleImported(result);
            setShowImport(false);
          }}
        />
      )}
    </>
  );
}
