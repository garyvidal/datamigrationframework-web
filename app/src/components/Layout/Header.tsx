// Header — Top navigation bar: new project, open project, DB connections, MarkLogic connections, migration wizard, and theme toggle.
import * as React from 'react'
import { useState, useRef, useEffect } from 'react'
import { FaPlus, FaFolderOpen, FaDatabase, FaSun, FaMoon, FaCube, FaUpload, FaChevronDown } from 'react-icons/fa'
import { useTheme } from '@/contexts/ThemeContext'

interface HeaderProps {
  onNewProject?: () => void;
  onOpenProject?: () => void;
  onConnections?: () => void;
  onMarkLogicConnections?: () => void;
  onMigrate?: () => void;
}

function Header({ onNewProject, onOpenProject, onConnections, onMarkLogicConnections, onMigrate }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!connectionsOpen) return;
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) {
        setConnectionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [connectionsOpen]);

  const hasConnections = onConnections || onMarkLogicConnections;

  return (
    <nav className="bg-gray-900 dark:bg-slate-900 w-full z-20 top-0 start-0 border-b border-gray-200 dark:border-gray-600 py-1">
      <div className="flex flex-wrap justify-between items-center mx-auto px-4 py-2">
        <span className="self-center text-2xl font-semibold whitespace-nowrap text-white dark:text-white flex items-center gap-2">
          <FaCube size={24} className="text-red-600" />
          Data Migration Framework
        </span>

        <div className="flex items-center gap-2">
          {/* Theme toggle — tertiary */}
          <button
            onClick={toggleTheme}
            className="p-2 text-white/60 rounded hover:bg-white/10 hover:text-white transition cursor-pointer"
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <FaSun size={14} /> : <FaMoon size={14} />}
          </button>

          {/* Connections dropdown — secondary */}
          {hasConnections && (
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setConnectionsOpen(v => !v)}
                className="flex items-center gap-2 px-3 py-2 bg-white/10 text-white text-sm font-medium rounded hover:bg-white/20 transition cursor-pointer"
              >
                <FaDatabase size={13} />
                Connections
                <FaChevronDown size={10} className={`transition-transform ${connectionsOpen ? 'rotate-180' : ''}`} />
              </button>
              {connectionsOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-gray-800 border border-gray-700 rounded shadow-lg z-50">
                  {onConnections && (
                    <button
                      onClick={() => { setConnectionsOpen(false); onConnections(); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white hover:bg-white/10 transition"
                    >
                      <FaDatabase size={12} className="text-gray-400" />
                      Source Databases
                    </button>
                  )}
                  {onMarkLogicConnections && (
                    <button
                      onClick={() => { setConnectionsOpen(false); onMarkLogicConnections(); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white hover:bg-white/10 transition"
                    >
                      <FaDatabase size={12} className="text-amber-400" />
                      MarkLogic
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Open Project — secondary */}
          {onOpenProject && (
            <button
              onClick={onOpenProject}
              className="flex items-center gap-2 px-3 py-2 bg-white/10 text-white text-sm font-medium rounded hover:bg-white/20 transition cursor-pointer"
            >
              <FaFolderOpen size={13} />
              Open
            </button>
          )}

          {/* Migrate — contextual action */}
          {onMigrate && (
            <button
              onClick={onMigrate}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition cursor-pointer"
            >
              <FaUpload size={13} />
              Migrate
            </button>
          )}

          {/* New Project — primary CTA */}
          {onNewProject && (
            <button
              onClick={onNewProject}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition cursor-pointer"
            >
              <FaPlus size={12} />
              New Project
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}

export default Header
