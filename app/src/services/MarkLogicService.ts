const SERVICE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:9390';

// ── Types ────────────────────────────────────────────────────────────────────

export type MarkLogicAuthType = 'digest' | 'basic';

export interface MarkLogicConnection {
  host: string;
  port: number;
  database?: string;
  username: string;
  /** Plaintext when sending; null/undefined when received (never returned by API). */
  password?: string | null;
  authType: MarkLogicAuthType;
  useSSL: boolean;
}

export interface SaveMarkLogicConnectionRequest {
  id: string;
  name: string;
  connection: MarkLogicConnection;
}

export interface SavedMarkLogicConnection {
  id: string;
  name: string;
  connection: MarkLogicConnection;
}

export interface MarkLogicConnectionTestResult {
  success: boolean;
  message: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Encrypts a password using the backend's AES-256-GCM key.
 * Returns the same string if already encrypted (ENC: prefix).
 */
export const encryptMarkLogicPassword = async (plaintext: string): Promise<string> => {
  if (!plaintext) return plaintext;
  const response = await fetch(`${SERVICE_URL}/v1/encrypt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: plaintext }),
  });
  if (!response.ok) throw new Error('Failed to encrypt password');
  const data = await response.json();
  return data.encrypted as string;
};

// ── API functions ─────────────────────────────────────────────────────────────

/**
 * Test a MarkLogic connection without saving it.
 */
export const testMarkLogicConnection = async (
  connection: MarkLogicConnection
): Promise<MarkLogicConnectionTestResult> => {
  try {
    const conn = { ...connection };
    if (conn.password) {
      conn.password = await encryptMarkLogicPassword(conn.password);
    }
    const response = await fetch(`${SERVICE_URL}/v1/marklogic/connections/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conn),
    });
    if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection test failed',
    };
  }
};

/**
 * Test a saved MarkLogic connection using its stored credentials.
 */
export const testMarkLogicConnectionById = async (
  id: string
): Promise<MarkLogicConnectionTestResult> => {
  try {
    const response = await fetch(
      `${SERVICE_URL}/v1/marklogic/connections/${encodeURIComponent(id)}/test`,
      { method: 'POST' }
    );
    if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection test failed',
    };
  }
};

/**
 * Get all saved MarkLogic connections.
 */
export const getSavedMarkLogicConnections = async (): Promise<SavedMarkLogicConnection[]> => {
  const response = await fetch(`${SERVICE_URL}/v1/marklogic/connections`);
  if (!response.ok) throw new Error(`Failed to fetch MarkLogic connections: ${response.statusText}`);
  return response.json();
};

/**
 * Save a new MarkLogic connection.
 */
export const saveMarkLogicConnection = async (
  request: SaveMarkLogicConnectionRequest
): Promise<SavedMarkLogicConnection> => {
  const response = await fetch(`${SERVICE_URL}/v1/marklogic/connections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`Failed to save MarkLogic connection: ${response.statusText}`);
  return response.json();
};

/**
 * Update a saved MarkLogic connection.
 * If request.connection.password is blank the backend retains the existing stored password.
 */
export const updateMarkLogicConnection = async (
  originalName: string,
  request: SaveMarkLogicConnectionRequest
): Promise<SavedMarkLogicConnection> => {
  const response = await fetch(
    `${SERVICE_URL}/v1/marklogic/connections/${encodeURIComponent(originalName)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) throw new Error(`Failed to update MarkLogic connection: ${response.statusText}`);
  return response.json();
};

/**
 * Delete a saved MarkLogic connection by name.
 */
export const deleteMarkLogicConnection = async (name: string): Promise<void> => {
  const response = await fetch(
    `${SERVICE_URL}/v1/marklogic/connections/${encodeURIComponent(name)}`,
    { method: 'DELETE' }
  );
  if (!response.ok) throw new Error(`Failed to delete MarkLogic connection: ${response.statusText}`);
};
