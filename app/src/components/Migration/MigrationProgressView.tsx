// MigrationProgressView — Real-time migration job progress display: ingested count, errors, throughput, elapsed time, and job controls.
import React, { useEffect, useRef, useState } from 'react';
import { FaCheck, FaTimes, FaSpinner, FaDatabase } from 'react-icons/fa';
import {
  DeploymentJob,
  MigrationProgress,
  getMigrationProgress,
  deleteMigrationJob,
} from '@/services/MigrationService';

interface MigrationProgressViewProps {
  job: DeploymentJob;
  onClose: () => void;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatRate(processed: number, elapsed: number): string {
  if (elapsed === 0 || processed === 0) return '';
  const rate = Math.round(processed / elapsed);
  return `${rate} rec/s`;
}

const MigrationProgressView: React.FC<MigrationProgressViewProps> = ({ job, onClose }) => {
  const [progress, setProgress] = useState<MigrationProgress>({
    jobId: job.id,
    status: job.status,
    totalRecords: job.totalRecords,
    processedRecords: job.processedRecords,
    elapsedSeconds: 0,
    errorMessage: job.errorMessage,
    errors: job.errors,
  });
  const intervalRef = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);

  const isDone = progress.status === 'COMPLETED' || progress.status === 'FAILED' || progress.status === 'CANCELLED';

  useEffect(() => {
    if (isDone) return;
    const poll = async () => {
      try {
        const p = await getMigrationProgress(job.id);
        setProgress(p);
      } catch {
        // ignore transient errors
      }
    };
    poll();
    intervalRef.current = window.setInterval(poll, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [job.id, isDone]);

  const pct = progress.totalRecords > 0
    ? Math.min(100, Math.round((progress.processedRecords / progress.totalRecords) * 100))
    : progress.status === 'COMPLETED' ? 100 : 0;

  const handleClose = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (isDone) {
      setClosing(true);
      try { await deleteMigrationJob(job.id); } catch { /* ignore */ }
    }
    onClose();
  };

  const statusColor = {
    PENDING: 'text-gray-400',
    RUNNING: 'text-blue-400',
    COMPLETED: 'text-green-400',
    FAILED: 'text-red-400',
    CANCELLED: 'text-yellow-400',
  }[progress.status] ?? 'text-gray-400';

  const statusIcon = {
    PENDING: <FaSpinner className="animate-spin" size={14} />,
    RUNNING: <FaSpinner className="animate-spin" size={14} />,
    COMPLETED: <FaCheck size={14} />,
    FAILED: <FaTimes size={14} />,
    CANCELLED: <FaTimes size={14} />,
  }[progress.status];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <FaDatabase className="text-blue-400" size={18} />
            <div>
              <h2 className="text-lg font-bold text-gray-800 dark:text-white">Migration in Progress</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">{job.projectName} → {job.marklogicConnectionName}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          {/* Status badge */}
          <div className={`flex items-center gap-2 text-sm font-medium ${statusColor}`}>
            {statusIcon}
            <span>{progress.status}</span>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
              <span>
                {progress.processedRecords.toLocaleString()} / {progress.totalRecords > 0 ? progress.totalRecords.toLocaleString() : '?'} records
              </span>
              <span className="font-mono">{pct}%</span>
            </div>
            <div className="h-3 bg-gray-200 dark:bg-slate-600 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  progress.status === 'FAILED' ? 'bg-red-500' :
                  progress.status === 'COMPLETED' ? 'bg-green-500' : 'bg-blue-500'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3">
            <StatBox label="Processed" value={progress.processedRecords.toLocaleString()} />
            <StatBox label="Total" value={progress.totalRecords > 0 ? progress.totalRecords.toLocaleString() : '—'} />
            <StatBox label="Elapsed" value={formatElapsed(progress.elapsedSeconds)} />
          </div>

          {progress.elapsedSeconds > 0 && progress.processedRecords > 0 && !isDone && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
              {formatRate(progress.processedRecords, progress.elapsedSeconds)}
            </p>
          )}

          {/* Config summary */}
          <div className="bg-gray-50 dark:bg-slate-700 rounded p-3 space-y-1.5 text-xs border border-gray-200 dark:border-transparent">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Directory</span>
              <span className="font-mono text-gray-800 dark:text-gray-200 max-w-[60%] truncate text-right">
                {job.directoryPath}
              </span>
            </div>
            {job.collections.length > 0 && (
              <div className="flex justify-between items-start gap-2">
                <span className="text-gray-500 dark:text-gray-400 shrink-0">Collections</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {job.collections.map((c) => (
                    <span key={c} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-slate-600 dark:text-blue-300 rounded">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {(progress.errorMessage || (progress.errors && progress.errors.length > 0)) && (
            <div className="p-3 bg-red-900/60 border border-red-700 rounded text-xs text-red-200 space-y-1 max-h-32 overflow-y-auto">
              {progress.errorMessage && <p className="font-medium">{progress.errorMessage}</p>}
              {progress.errors?.map((e, i) => <p key={i} className="font-mono">{e}</p>)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-gray-200 dark:border-slate-700">
          <button
            onClick={handleClose}
            disabled={closing}
            className={`px-5 py-2 rounded text-sm font-medium transition ${
              isDone
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500'
            }`}
          >
            {isDone ? 'Done' : 'Running... (close to dismiss)'}
          </button>
        </div>
      </div>
    </div>
  );
};

const StatBox: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-gray-50 dark:bg-slate-700 rounded p-3 text-center border border-gray-200 dark:border-transparent">
    <div className="text-lg font-bold text-gray-800 dark:text-white font-mono">{value}</div>
    <div className="text-xs text-gray-400 mt-0.5">{label}</div>
  </div>
);

export default MigrationProgressView;
