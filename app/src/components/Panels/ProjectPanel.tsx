// ProjectPanel — Left panel listing project schemas and tables; supports table visibility toggle, add-tables, and open-mapping actions.
import React, { useState } from 'react';
import { ProjectData } from '@/services/ProjectService';
import { FaChevronDown, FaChevronRight, FaTable, FaFolder, FaEye, FaPlus, FaCheck, FaFilter } from 'react-icons/fa';

interface ProjectPanelProps {
  project: ProjectData;
  onTableSelect?: (tableName: string, schemaName: string) => void;
  visibleNodeIds?: Set<string>;
  onAddTables?: () => void;
  /** When provided, clicking a table calls this instead of onTableSelect (used in Document Model view). */
  onTableMappingRequest?: (tableName: string, schemaName: string) => void;
  /** Keys of tables that already have a document model mapping ("schema.table"). */
  mappedTableKeys?: Set<string>;
}

const ProjectPanel: React.FC<ProjectPanelProps> = ({
  project,
  onTableSelect,
  visibleNodeIds,
  onAddTables,
  onTableMappingRequest,
  mappedTableKeys,
}) => {
  const schemas = Object.entries(project.schemas);
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(
    new Set(schemas.map(([key]) => key))
  );
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');

  const toggleSchema = (schemaKey: string) => {
    setExpandedSchemas((prev) => {
      const next = new Set(prev);
      if (next.has(schemaKey)) next.delete(schemaKey);
      else next.add(schemaKey);
      return next;
    });
  };

  const totalTables = schemas.reduce(
    (sum, [, s]) => sum + Object.keys(s.tables ?? {}).length,
    0
  );

  const handleTableClick = (tableName: string, schemaKey: string, key: string) => {
    setSelectedTable(key);
    if (onTableMappingRequest) {
      onTableMappingRequest(tableName, schemaKey);
    } else {
      onTableSelect?.(tableName, schemaKey);
    }
  };

  const isMappingMode = !!onTableMappingRequest;

  return (
    <div className="flex flex-col h-full w-full bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-white overflow-hidden">
      <div className="flex-shrink-0 px-3 py-2 border-b border-gray-200 dark:border-slate-600">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-blue-900 dark:text-blue-300">
            {schemas.length} schema{schemas.length !== 1 ? 's' : ''} &bull; {totalTables} table{totalTables !== 1 ? 's' : ''}
          </div>
          {!isMappingMode && (
            <button
              onClick={onAddTables}
              title="Add tables to project"
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-200 hover:bg-blue-600 text-gray-600 hover:text-white dark:bg-white/10 dark:text-gray-300 rounded transition"
            >
              <FaPlus size={9} /> Add
            </button>
          )}
        </div>
        <div className="text-xs text-blue-800 dark:text-blue-400 mt-0.5 truncate">
          {isMappingMode
            ? <span className="text-cyan-500">Click a table to map it</span>
            : `Connection: ${project.connectionName}`
          }
        </div>
        <div className="mt-1.5 relative">
          <input
            type="text"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            placeholder="Filter tables..."
            className="w-full px-2 py-1 pr-6 text-xs bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-500 rounded text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {filterText && (
            <button
              onClick={() => setFilterText('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-white text-xs leading-none"
            >&times;</button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-200 dark:divide-slate-600">
        {schemas.map(([schemaKey, schema]) => {
          const allTables = Object.values(schema.tables ?? {});
          const lc = filterText.toLowerCase();
          const tables = lc ? allTables.filter(t => t.tableName.toLowerCase().includes(lc)) : allTables;
          if (tables.length === 0 && lc) return null;
          const isExpanded = expandedSchemas.has(schemaKey) || !!lc;
          const mappedInSchema = mappedTableKeys
            ? tables.filter(t => mappedTableKeys.has(`${schemaKey}.${t.tableName}`)).length
            : 0;

          return (
            <div key={schemaKey}>
              <button
                onClick={() => toggleSchema(schemaKey)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-slate-600 transition text-left"
              >
                {isExpanded
                  ? <FaChevronDown className="text-gray-400 shrink-0" size={11} />
                  : <FaChevronRight className="text-gray-400 shrink-0" size={11} />}
                <FaFolder className="text-yellow-500 shrink-0" size={13} />
                <span className="text-sm font-medium text-blue-900 dark:text-blue-300 truncate">{schema.name || schemaKey}</span>
                <span className="text-xs text-blue-800 dark:text-blue-400 ml-auto">{tables.length}</span>
                {mappedInSchema > 0 && (
                  <span
                    className="ml-1 text-xs text-cyan-400 font-medium shrink-0"
                    title={`${mappedInSchema} table${mappedInSchema !== 1 ? 's' : ''} mapped`}
                  >
                    {mappedInSchema}✓
                  </span>
                )}
              </button>

              {isExpanded && (
                <div className="bg-white dark:bg-slate-800 divide-y divide-gray-100 dark:divide-slate-700">
                  {tables.length === 0 ? (
                    <div className="px-8 py-2 text-xs text-blue-800 dark:text-blue-400">No tables</div>
                  ) : (
                    tables.map((table) => {
                      const key = `${schemaKey}.${table.tableName}`;
                      const isMapped = mappedTableKeys?.has(key) ?? false;
                      const hasFilter = !!(table.whereClause?.trim());
                      return (
                        <button
                          key={key}
                          onClick={() => handleTableClick(table.tableName, schemaKey, key)}
                          className={`w-full flex items-center gap-2 px-8 py-2 text-left hover:bg-blue-50 dark:hover:bg-slate-600 transition text-sm ${
                            selectedTable === key ? 'bg-blue-100 dark:bg-slate-500' : ''
                          }`}
                        >
                          <FaTable
                            className={`shrink-0 ${isMappingMode ? 'text-cyan-400' : isMapped ? 'text-cyan-500' : 'text-green-400'}`}
                            size={11}
                          />
                          <span className={`truncate ${isMapped ? 'text-cyan-600 dark:text-cyan-200' : 'text-blue-900 dark:text-blue-300'}`}>{table.tableName}</span>
                          <span className="ml-auto flex items-center gap-1.5 shrink-0">
                            {hasFilter && (
                              <FaFilter
                                className="text-amber-500 dark:text-amber-400"
                                size={10}
                                title={`WHERE ${table.whereClause}`}
                              />
                            )}
                            {isMapped && (
                              <FaCheck
                                className="text-cyan-400"
                                size={10}
                                title="Mapped to document model"
                              />
                            )}
                            {!isMappingMode && visibleNodeIds?.has(key) && (
                              <FaEye className="text-gray-400" size={11} title="Visible in diagram" />
                            )}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProjectPanel;
