// OpenProjectModal — Modal listing saved projects with open, rename, delete, and new-project actions.
import React, { useEffect, useRef, useState } from 'react';
import { FaFolderOpen, FaTimes, FaTrash, FaPlus, FaPencilAlt } from 'react-icons/fa';
import { ProjectData, getProjects, deleteProject, saveProject } from '@/services/ProjectService';

interface OpenProjectModalProps {
  onOpen: (project: ProjectData) => void;
  onClose: () => void;
  onDeleted?: (projectName: string) => void;
  onRenamed?: (oldName: string, newName: string) => void;
  onNewProject?: () => void;
  alreadyOpenNames: string[];
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

  const handleRename = async (project: ProjectData) => {
    const newName = renameValue.trim();
    if (!newName || newName === project.name) { setRenamingName(null); return; }
    setRenaming(true);
    try {
      await saveProject({ ...project, name: newName });
      setProjects((prev) => prev.map((p) => p.name === project.name ? { ...p, name: newName } : p));
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
      setProjects((prev) => prev.filter((p) => p.name !== project.name));
      onDeleted?.(project.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete project');
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="dark fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-700 rounded-lg shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-600">
          <h2 className="text-gray-800 dark:text-white font-semibold text-lg">Open Project</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white">
            <FaTimes />
          </button>
        </div>

        <div className="px-6 py-4 max-h-96 overflow-y-auto">
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
                const isOpen = alreadyOpenNames.includes(project.name);
                const isConfirming = confirmDelete === project.name;
                const tableCount = Object.values(project.schemas).reduce(
                  (sum, s) => sum + Object.keys(s.tables ?? {}).length,
                  0
                );
                const isRenaming = renamingName === project.name;
                return (
                  <li key={project.name} className="flex items-stretch gap-2">
                    {isRenaming ? (
                      <>
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
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { if (!isOpen) onOpen(project); }}
                          disabled={isOpen}
                          className={`flex-1 text-left px-4 py-3 rounded flex items-start gap-3 transition ${
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

                        <button
                          onClick={() => { setRenamingName(project.name); setRenameValue(project.name); setConfirmDelete(null); }}
                          className="shrink-0 px-3 rounded bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 dark:bg-slate-600 dark:hover:bg-slate-500 dark:text-gray-400 dark:hover:text-white transition"
                          title={`Rename ${project.name}`}
                        >
                          <FaPencilAlt size={12} />
                        </button>

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
                            onClick={() => setConfirmDelete(project.name)}
                            className="shrink-0 px-3 rounded bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-700 dark:bg-slate-600 dark:hover:bg-red-800 dark:text-gray-400 dark:hover:text-white transition"
                            title={`Delete ${project.name}`}
                          >
                            <FaTrash size={12} />
                          </button>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-200 dark:border-slate-600 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
