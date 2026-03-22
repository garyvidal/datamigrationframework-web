// SavedConnectionsList — Scrollable list of persisted DB connections with a delete button per entry.
import React, { useEffect, useState } from 'react';
import { getSavedConnections, deleteConnection, SavedConnection, DbConnection } from '@/services/SchemaService';
import { FaTrash, FaSpinner, FaLink } from 'react-icons/fa';

interface SavedConnectionsListProps {
  onConnectionSelect: (connection: DbConnection) => void;
}

const SavedConnectionsList: React.FC<SavedConnectionsListProps> = ({ onConnectionSelect }) => {
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSavedConnections();
  }, []);

  const loadSavedConnections = async () => {
    try {
      setLoading(true);
      setError(null);
      const connections = await getSavedConnections();
      setSavedConnections(connections);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load saved connections';
      setError(errorMessage);
      console.error('Error loading saved connections:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (confirm(`Delete connection "${name}"?`)) {
      try {
        await deleteConnection(name);
        setSavedConnections(prev => prev.filter(c => c.name !== name));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to delete connection';
        setError(errorMessage);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <FaSpinner className="animate-spin text-lg text-blue-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 bg-red-900 border border-red-700 rounded">
        <p className="text-sm text-red-100">{error}</p>
      </div>
    );
  }

  if (savedConnections.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-gray-400">No saved connections yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Saved Connections ({savedConnections.length})</h4>
      {savedConnections.map((savedConn) => (
        <div
          key={savedConn.name}
          className="flex items-center justify-between bg-gray-100 dark:bg-slate-600 p-3 rounded hover:bg-gray-200 dark:hover:bg-slate-500 transition"
        >
          <button
            onClick={() => onConnectionSelect(savedConn.connection)}
            className="flex items-center gap-2 flex-1 text-left text-sm text-gray-800 dark:text-white hover:text-blue-600 dark:hover:text-blue-300 transition"
          >
            <FaLink className="text-blue-400" />
            <div>
              <div className="font-medium">{savedConn.name}</div>
              <div className="text-xs text-gray-400">
                {savedConn.connection.type} @ {savedConn.connection.url}:{savedConn.connection.port}
              </div>
            </div>
          </button>
          <button
            onClick={() => handleDelete(savedConn.name)}
            className="text-red-400 hover:text-red-300 p-2 transition"
            title="Delete connection"
          >
            <FaTrash size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default SavedConnectionsList;
