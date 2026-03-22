const SERVICE_URL = 'http://localhost:9390';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DeploymentJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface DeploymentJob {
  id: string;
  projectId: string;
  projectName: string;
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
  marklogicConnectionId: string;
  directoryPath: string;
  collections: string[];
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
