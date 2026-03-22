// EnvironmentSelect — Dropdown for tagging a connection with an environment label (Development, Staging, QA_UAT, Production, CI, None).
import React, { useState, useRef, useEffect } from 'react';
import { FaCheck, FaChevronDown } from 'react-icons/fa';
import type { ConnectionEnvironment } from '@/services/SchemaService';
import { ENVIRONMENT_LABELS } from '@/services/SchemaService';

const ENV_DOT: Record<ConnectionEnvironment, React.ReactNode> = {
  ContinuousIntegration: <span className="w-4 h-4 rounded-full bg-gray-500 shrink-0 inline-block" />,
  Development:           <span className="w-4 h-4 rounded-full bg-yellow-800 shrink-0 inline-block" />,
  Staging:               <span className="w-4 h-4 rounded-full bg-red-800 shrink-0 inline-block" />,
  QA_UAT:                <span className="w-4 h-4 rounded-full bg-indigo-900 shrink-0 inline-block" />,
  Production:            <span className="w-4 h-4 rounded-full bg-green-700 shrink-0 inline-block" />,
  None: (
    <span className="w-4 h-4 shrink-0 inline-flex items-center justify-center">
      <svg viewBox="0 0 16 16" className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6.5" />
        <line x1="3" y1="13" x2="13" y2="3" />
      </svg>
    </span>
  ),
};

const ORDERED: ConnectionEnvironment[] = [
  'ContinuousIntegration',
  'Development',
  'Staging',
  'QA_UAT',
  'Production',
  'None',
];

interface EnvironmentSelectProps {
  value: ConnectionEnvironment;
  onChange: (value: ConnectionEnvironment) => void;
  className?: string;
}

const EnvironmentSelect: React.FC<EnvironmentSelectProps> = ({ value, onChange, className = '' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-white text-gray-800 border border-gray-300 dark:bg-slate-600 dark:text-white dark:border-slate-500 rounded hover:border-gray-400 dark:hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
      >
        {ENV_DOT[value]}
        <span className="flex-1 text-left">{ENVIRONMENT_LABELS[value]}</span>
        <FaChevronDown className={`text-gray-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 dark:bg-slate-700 dark:border-slate-600 rounded shadow-lg py-1">
          {ORDERED.map((env) => (
            <button
              key={env}
              type="button"
              onClick={() => { onChange(env); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
            >
              {ENV_DOT[env]}
              <span className="flex-1 text-left font-medium">{ENVIRONMENT_LABELS[env]}</span>
              {value === env && <FaCheck className="text-blue-400 text-xs shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default EnvironmentSelect;
