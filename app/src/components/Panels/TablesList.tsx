// TablesList — Simple list of database tables with loading/error states; emits a callback when the user selects a table.
import React, { useEffect, useState } from 'react';
import { fetchTables, Table } from '@/services/SchemaService';
import { FaTable, FaSpinner } from 'react-icons/fa';

interface TablesListProps {
  onTableSelect?: (table: Table) => void;
}

const TablesList: React.FC<TablesListProps> = ({ onTableSelect }) => {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  useEffect(() => {
    const loadTables = async () => {
      try {
        setLoading(true);
        setError(null);
        const fetchedTables = await fetchTables();
        setTables(fetchedTables);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tables');
        console.error('Error loading tables:', err);
      } finally {
        setLoading(false);
      }
    };

    loadTables();
  }, []);

  const handleTableSelect = (table: Table) => {
    setSelectedTable(table.name);
    onTableSelect?.(table);
  };

  return (
    <div className="flex flex-col h-full w-full bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-white overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <FaSpinner className="animate-spin text-lg" />
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-900 border border-red-700 rounded m-2">
            <p className="text-sm font-semibold">Error loading tables</p>
            <p className="text-xs mt-1">{error}</p>
          </div>
        )}

        {!loading && !error && tables.length === 0 && (
          <div className="p-4 text-gray-400 text-center">
            <p className="text-sm">No tables found</p>
          </div>
        )}

        {!loading && !error && tables.length > 0 && (
          <ul className="divide-y divide-gray-200 dark:divide-slate-600">
            {tables.map((table) => (
              <li
                key={table.name}
                className={`px-3 py-2 cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-600 transition ${
                  selectedTable === table.name ? 'bg-blue-100 dark:bg-slate-500' : ''
                }`}
                onClick={() => handleTableSelect(table)}
              >
                <div className="flex items-center gap-2">
                  <FaTable className="flex-shrink-0 text-blue-400" />
                  <span className="text-sm font-semibold text-gray-950 dark:text-cyan-900 truncate">{table.name}</span>
                </div>
                {table.schema && (
                  <div className="text-xs text-gray-900 dark:text-cyan-900 ml-6 truncate">
                    {table.schema}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!loading && tables.length > 0 && (
        <div className="border-t border-gray-200 dark:border-slate-600 p-3 bg-gray-100 dark:bg-slate-800 text-xs text-gray-950 dark:text-cyan-400">
          {tables.length} table{tables.length !== 1 ? 's' : ''} found
        </div>
      )}
    </div>
  );
};

export default TablesList;
