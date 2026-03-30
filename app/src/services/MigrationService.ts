const SERVICE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:9390';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DeploymentJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface DeploymentJob {
  id: string;
  projectId: string;
  projectName: string;
  sourceConnectionId?: string;
  sourceConnectionName?: string;
  marklogicConnectionId: string;
  marklogicConnectionName: string;
  directoryPath: string;
  collections: string[];
  status: DeploymentJobStatus;
  totalRecords: number;
  processedRecords: number;
  errorMessage?: string;
  errors?: string[];
  created: string;
  startTime?: string;
  endTime?: string;
}

export interface MigrationProgress {
  jobId: string;
  status: DeploymentJobStatus;
  totalRecords: number;
  processedRecords: number;
  elapsedSeconds: number;
  errorMessage?: string;
  errors?: string[];
}

export interface MigrationRequest {
  projectId: string;
  sourceConnectionId?: string;
  marklogicConnectionId: string;
  directoryPath: string;
  collections: string[];
}

export interface TableRowCount {
  schema: string | null;
  tableName: string;
  role: 'root' | 'child';
  rowCount: number;
  whereClause?: string | null;
}

export interface MigrationPreview {
  tables: TableRowCount[];
  totalRows: number;
}

// ── API functions ─────────────────────────────────────────────────────────────

export const startMigrationJob = async (request: MigrationRequest): Promise<DeploymentJob> => {
  const response = await fetch(`${SERVICE_URL}/v1/migration/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to start migration job: ${response.statusText}`);
  }
  return response.json();
};

export const getMigrationProgress = async (jobId: string): Promise<MigrationProgress> => {
  const response = await fetch(`${SERVICE_URL}/v1/migration/jobs/${encodeURIComponent(jobId)}/progress`);
  if (!response.ok) throw new Error(`Failed to get progress: ${response.statusText}`);
  return response.json();
};

export const getAllMigrationJobs = async (): Promise<DeploymentJob[]> => {
  const response = await fetch(`${SERVICE_URL}/v1/migration/jobs`);
  if (!response.ok) throw new Error(`Failed to list migration jobs: ${response.statusText}`);
  return response.json();
};

export const deleteMigrationJob = async (jobId: string): Promise<void> => {
  const response = await fetch(`${SERVICE_URL}/v1/migration/jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(`Failed to delete migration job: ${response.statusText}`);
};

export const getMigrationPreview = async (projectId: string, connectionId?: string): Promise<MigrationPreview> => {
  const url = new URL(`${SERVICE_URL}/v1/migration/preview/${encodeURIComponent(projectId)}`);
  if (connectionId) url.searchParams.set('connectionId', connectionId);
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Failed to load migration preview: ${response.statusText}`);
  return response.json();
};

/**
 * Opens an SSE connection to receive migration progress events.
 * - `onProgress` is called at each ~10% milestone with live processedRecords/elapsedSeconds.
 * - `onComplete` is called with the final state; the connection is closed automatically.
 * - `onError` is called if the connection drops unexpectedly.
 * Returns the EventSource so the caller can close it on unmount.
 */
export const subscribeMigrationProgress = (
  jobId: string,
  onProgress: (p: MigrationProgress) => void,
  onComplete: (p: MigrationProgress) => void,
  onError?: () => void,
): EventSource => {
  const es = new EventSource(
    `${SERVICE_URL}/v1/migration/jobs/${encodeURIComponent(jobId)}/events`,
  );

  es.addEventListener('progress', (e: MessageEvent) => {
    try { onProgress(JSON.parse(e.data)); } catch { /* ignore parse errors */ }
  });

  es.addEventListener('complete', (e: MessageEvent) => {
    try { onComplete(JSON.parse(e.data)); } catch { /* ignore parse errors */ }
    es.close();
  });

  es.onerror = () => {
    es.close();
    onError?.();
  };

  return es;
};
