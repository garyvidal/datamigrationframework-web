// AddTablesModal — Modal for adding more tables to an existing project by re-analyzing the connected database schema.
import React, { useState, useEffect } from 'react';
import { analyzeSchema, resolveConnection, DbDatabase } from '@/services/SchemaService';
import { ProjectData, saveProject } from '@/services/ProjectService';
import { FaFolder, FaSpinner, FaTable, FaTimes } from 'react-icons/fa';

interface AddTablesModalProps {
  project: ProjectData;
  onClose: () => void;
  onTablesAdded: (updatedProject: ProjectData) => void;
}

const AddTablesModal: React.FC<AddTablesModalProps> = ({ project, onClose, onTablesAdded }) => {
  const [database, setDatabase] = useState<DbDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTables, setSelectedTables] = useState<Record<string, Set<string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const savedConn = await resolveConnection(project.connectionId, project.connectionName);
        const db = await analyzeSchema({
          connectionId: savedConn.id,
          connection: savedConn.connection,
          includeTables: true,
          includeColumns: true,
          includeRelationships: true,
        });
        setDatabase(db);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load schema');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const isInProject = (schemaName: string, tableName: string) =>
    !!project.schemas[schemaName]?.tables?.[tableName];

  const toggleTable = (schemaName: string, tableName: string) => {
    if (isInProject(schemaName, tableName)) return;
    setSelectedTables(prev => {
      const next = { ...prev };
      const set = new Set(next[schemaName] ?? []);
      if (set.has(tableName)) set.delete(tableName);
      else set.add(tableName);
      next[schemaName] = set;
      return next;
    });
  };

  const toggleSchema = (schemaName: string, availableTables: string[]) => {
    setSelectedTables(prev => {
      const next = { ...prev };
      const set = new Set(next[schemaName] ?? []);
      const allSelected = availableTables.every(t => set.has(t));
      next[schemaName] = allSelected ? new Set() : new Set(availableTables);
      return next;
    });
  };

  const totalSelected = Object.values(selectedTables).reduce((sum, s) => sum + s.size, 0);

  const handleAdd = async () => {
    if (!database || totalSelected === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updatedSchemas = { ...project.schemas };
      for (const [schemaName, tableSet] of Object.entries(selectedTables)) {
        if (tableSet.size === 0) continue;
        const existing = updatedSchemas[schemaName];
        const tables = { ...(existing?.tables ?? {}) };
        for (const tableName of tableSet) {
          const fullTable = database.schemas[schemaName]?.tables?.[tableName];
          tables[tableName] = {
            tableName,
            schema: schemaName,
            columns: fullTable?.columns ?? null,
            relationships: fullTable?.relationships ?? null,
          };
        }
        updatedSchemas[schemaName] = { name: schemaName, ...existing, tables };
      }
      const updatedProject: ProjectData = { ...project, schemas: updatedSchemas };
      await saveProject(updatedProject);
      onTablesAdded(updatedProject);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save project');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Add Tables</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{project.name} &bull; {project.connectionName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="px-6 pt-3 pb-2 border-b border-gray-200 dark:border-slate-700">
          <div className="relative">
            <input
              type="text"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              placeholder="Filter tables..."
              className="w-full px-2 py-1.5 pr-7 text-xs bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-500 rounded text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {filterText && (
              <button
                onClick={() => setFilterText('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-white"
              >
                <FaTimes size={10} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12 gap-3 text-gray-400">
              <FaSpinner className="animate-spin" />
              <span>Loading schema...</span>
            </div>
          )}
          {error && (
            <div className="p-3 bg-red-900 border border-red-700 rounded text-sm text-red-100">{error}</div>
          )}
          {!loading && database && (
            <div className="space-y-2">
              <p className="text-sm text-gray-400 mb-3">
                {totalSelected} new table{totalSelected !== 1 ? 's' : ''} selected
              </p>
              {Object.entries(database.schemas).map(([schemaName, schema]) => {
                const lc = filterText.toLowerCase();
                const allTableNames = Object.keys(schema.tables ?? {});
                const tableNames = lc ? allTableNames.filter(t => t.toLowerCase().includes(lc)) : allTableNames;
                if (tableNames.length === 0 && lc) return null;
                const available = tableNames.filter(t => !isInProject(schemaName, t));
                const selectedSet = selectedTables[schemaName] ?? new Set<string>();
                const allAvailableSelected = available.length > 0 && available.every(t => selectedSet.has(t));

                return (
                  <div key={schemaName} className="bg-gray-50 dark:bg-slate-700 rounded overflow-hidden border border-gray-200 dark:border-transparent">
                    <div
                      className="flex items-center gap-2 px-3 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-slate-600 dark:hover:bg-slate-500 cursor-pointer select-none"
                      onClick={() => available.length > 0 && toggleSchema(schemaName, available)}
                    >
                      {available.length > 0 && (
                        <input
                          type="checkbox"
                          checked={allAvailableSelected}
                          onChange={() => toggleSchema(schemaName, available)}
                          className="accent-blue-500 w-4 h-4"
                          onClick={e => e.stopPropagation()}
                        />
                      )}
                      <FaFolder className="text-yellow-500" size={14} />
                      <span className="text-sm font-semibold text-gray-800 dark:text-white flex-1">{schemaName}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {selectedSet.size > 0 ? `${selectedSet.size} / ` : ''}{available.length} available
                      </span>
                    </div>
                    <div className="divide-y divide-gray-200 dark:divide-slate-600/40">
                      {tableNames.map(tableName => {
                        const alreadyAdded = isInProject(schemaName, tableName);
                        const checked = alreadyAdded || selectedSet.has(tableName);
                        return (
                          <div
                            key={tableName}
                            className={`flex items-center gap-2 px-3 py-1.5 pl-8 select-none ${
                              alreadyAdded
                                ? 'opacity-50 cursor-not-allowed'
                                : 'hover:bg-gray-100 dark:hover:bg-slate-600 cursor-pointer'
                            }`}
                            onClick={() => toggleTable(schemaName, tableName)}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={alreadyAdded}
                              onChange={() => toggleTable(schemaName, tableName)}
                              className="accent-blue-500 w-4 h-4"
                              onClick={e => e.stopPropagation()}
                            />
                            <FaTable className={alreadyAdded ? 'text-gray-500' : 'text-blue-400'} size={11} />
                            <span className={`text-sm ${alreadyAdded ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}`}>
                              {tableName}
                            </span>
                            {alreadyAdded && (
                              <span className="text-xs text-gray-500 ml-auto">in project</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {saveError && (
            <div className="mt-3 p-3 bg-red-900 border border-red-700 rounded text-sm text-red-100">{saveError}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={totalSelected === 0 || saving}
            className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
          >
            {saving
              ? <><FaSpinner className="animate-spin" size={12} /> Adding...</>
              : `Add ${totalSelected > 0 ? totalSelected + ' ' : ''}Table${totalSelected !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddTablesModal;
