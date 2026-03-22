// SchemasPanel — Left panel for ad-hoc DB exploration; browses connections, schemas, and tables outside of a project context.
import React, { useState } from 'react';
import {
  DbDatabase,
  DbSchema,
  DbTable,
  getSavedConnections,
  SavedConnection,
  DbConnection,
} from '@/services/SchemaService';
import { FaChevronDown, FaChevronRight, FaTable, FaDatabase } from 'react-icons/fa';

interface SchemaPanelProps {
  onTableSelect?: (table: DbTable, schema: DbSchema) => void;
  isConnected?: boolean;
  database?: DbDatabase | null;
  onDisconnect?: () => void;
  onSwitchConnection?: (connection: DbConnection) => void;
}

const SchemasPanel: React.FC<SchemaPanelProps> = ({ onTableSelect, isConnected, database: initialDatabase, onDisconnect, onSwitchConnection }) => {
  const [database, setDatabase] = useState<DbDatabase | null>(initialDatabase || null);
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [loadingSavedConnections, setLoadingSavedConnections] = useState(false);

  React.useEffect(() => {
    if (initialDatabase) {
      setDatabase(initialDatabase);
      const firstSchemaName = Object.keys(initialDatabase.schemas)[0];
      if (firstSchemaName) {
        setExpandedSchemas(new Set([firstSchemaName]));
      }
    }
  }, [initialDatabase]);

  React.useEffect(() => {
    if (isConnected) {
      loadSavedConnections();
    }
  }, [isConnected]);

  const loadSavedConnections = async () => {
    try {
      setLoadingSavedConnections(true);
      const connections = await getSavedConnections();
      setSavedConnections(connections);
    } catch (err) {
      console.error('Error loading saved connections:', err);
    } finally {
      setLoadingSavedConnections(false);
    }
  };

  const toggleSchemaExpanded = (schemaName: string) => {
    const newExpanded = new Set(expandedSchemas);
    if (newExpanded.has(schemaName)) {
      newExpanded.delete(schemaName);
    } else {
      newExpanded.add(schemaName);
    }
    setExpandedSchemas(newExpanded);
  };

  const handleTableSelect = (table: DbTable, schema: DbSchema) => {
    setSelectedTable(`${schema.name}.${table.tableName}`);
    onTableSelect?.(table, schema);
  };

  if (!database || !isConnected) {
    return (
      <div className="flex flex-col h-full w-full bg-gray-50 dark:bg-slate-700 text-gray-500 dark:text-gray-400 items-center justify-center">
        <p className="text-sm">Waiting for connection...</p>
      </div>
    );
  }

  const schemas = Object.values(database.schemas);

  return (
    <div className="flex flex-col h-full w-full bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-white overflow-hidden">
      <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-slate-600 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Connected</span>
          <button
            onClick={() => onDisconnect?.()}
            className="text-sm px-2 py-1 bg-red-600 hover:bg-red-700 rounded transition"
          >
            Disconnect
          </button>
        </div>

        {savedConnections.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-300 mb-1">
              Quick Switch
            </label>
            <select
              onChange={(e) => {
                const selectedConn = savedConnections.find(c => c.name === e.target.value);
                if (selectedConn) {
                  onSwitchConnection?.(selectedConn.connection);
                  setSelectedTable(null);
                }
              }}
              defaultValue=""
              className="w-full px-2 py-1.5 bg-white text-gray-800 border border-gray-300 rounded hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs dark:bg-white/10 dark:text-white dark:border-white/20 dark:hover:border-white/40"
            >
              <option value="">Switch connection...</option>
              {savedConnections.map((conn) => (
                <option key={conn.name} value={conn.name}>
                  {conn.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {schemas.length === 0 && (
          <div className="p-4 text-gray-400 text-center">
            <p className="text-sm">No schemas found</p>
          </div>
        )}

        {schemas.length > 0 && (
          <div className="divide-y divide-gray-200 dark:divide-slate-600">
            {schemas.map((schema) => {
              const isExpanded = expandedSchemas.has(schema.name);
              const tables = schema.tables ? Object.values(schema.tables) : [];

              return (
                <div key={schema.name} className="bg-gray-50 dark:bg-slate-700">
                  <button
                    onClick={() => toggleSchemaExpanded(schema.name)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-slate-600 transition text-left"
                  >
                    {isExpanded ? (
                      <FaChevronDown className="text-gray-400 flex-shrink-0" />
                    ) : (
                      <FaChevronRight className="text-gray-400 flex-shrink-0" />
                    )}
                    <FaDatabase className="flex-shrink-0 text-blue-400" />
                    <span className="font-medium text-blue-900 dark:text-blue-300">{schema.name}</span>
                    <span className="text-xs text-blue-800 dark:text-blue-400 ml-auto">
                      {tables.length} table{tables.length !== 1 ? 's' : ''}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="bg-white dark:bg-slate-800 divide-y divide-gray-100 dark:divide-slate-700">
                      {tables.length === 0 ? (
                        <div className="px-6 py-2 text-xs text-blue-800 dark:text-blue-400">
                          No tables
                        </div>
                      ) : (
                        tables.map((table) => (
                          <button
                            key={`${schema.name}.${table.tableName}`}
                            onClick={() => handleTableSelect(table, schema)}
                            className={`w-full flex items-center gap-2 px-6 py-2 text-left hover:bg-blue-50 dark:hover:bg-slate-600 transition text-sm ${
                              selectedTable === `${schema.name}.${table.tableName}`
                                ? 'bg-blue-100 dark:bg-slate-500'
                                : ''
                            }`}
                          >
                            <FaTable className="flex-shrink-0 text-green-600" />
                            <span className="truncate text-blue-900 dark:text-blue-300">{table.tableName}</span>
                            {table.columns && Object.keys(table.columns).length > 0 && (
                              <span className="text-xs text-blue-800 dark:text-blue-400 ml-auto">
                                {Object.keys(table.columns).length} cols
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {database && (
        <div className="border-t border-gray-200 dark:border-slate-600 p-3 bg-gray-100 dark:bg-slate-800 text-xs text-blue-900 dark:text-blue-300">
          {schemas.length} schema{schemas.length !== 1 ? 's' : ''} •{' '}
          {schemas.reduce((acc, s) => acc + (s.tables ? Object.keys(s.tables).length : 0), 0)} tables
        </div>
      )}
    </div>
  );
};

export default SchemasPanel;
