const SCHEMA_SERVICE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:9390';

export enum ConnectionType {
  Postgres = 'Postgres',
  MySql = 'MySql',
  SqlServer = 'SqlServer',
  Oracle = 'Oracle'
}

export type ConnectionEnvironment =
  | 'ContinuousIntegration'
  | 'Development'
  | 'Staging'
  | 'QA_UAT'
  | 'Production'
  | 'None';

export const ENVIRONMENT_LABELS: Record<ConnectionEnvironment, string> = {
  ContinuousIntegration: 'Continuous Integration',
  Development: 'Development',
  Staging: 'Staging',
  QA_UAT: 'QA UAT',
  Production: 'Production',
  None: 'None',
};

export interface DbConnection {
  type: ConnectionType;
  /** When true, use jdbcUri directly instead of host/port/database fields */
  enterUriManually?: boolean;
  jdbcUri?: string;
  url: string;
  port: number;
  database: string;
  userName: string;
  /** Plaintext when sending to the backend; null/undefined when received (password is never returned). */
  password?: string | null;
  /** SQL Server only */
  authentication?: 'Windows' | 'SqlServer';
  /** Oracle only */
  identifier?: 'ServiceName' | 'SID';
  /** Oracle only */
  pdbName?: string;
  /** Postgres only */
  useSSL?: boolean;
  /** Postgres only, when useSSL is true */
  sslMode?: 'Prefer' | 'Require' | 'VerifyCA' | 'VerifyFull';
}

export interface SchemaAnalysisRequest {
  /** When set, the backend resolves credentials from the stored connection — no password needed. */
  connectionId?: string;
  connection: DbConnection;
  includeTables: boolean;
  includeColumns: boolean;
  includeRelationships: boolean;
  includeViews?: boolean;
  includeProcedures?: boolean;
}

export interface Column {
  name: string;
  type: string;
  position?: number;
  primaryKey?: boolean;
  sequence?: boolean;
  nullable?: boolean;
  columnType?: {
    columnType: string;
    precision?: number;
    scale?: number;
  };
  foreignKey?: {
    name: string;
  };
}

export interface DbTable {
  tableName: string;
  schema?: string;
  columns?: Record<string, Column>;
  relationships?: Array<{
    toTable: string;
  }>;
}

export interface DbSchema {
  name: string;
  tables?: Record<string, DbTable>;
}

export interface DbDatabase {
  name?: string;
  schemas: Record<string, DbSchema>;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
}

/**
 * Strip frontend-only fields before sending DbConnection to any backend API.
 * When enterUriManually is true, the jdbcUri becomes the url.
 */
function toApiConnection(conn: DbConnection): Omit<DbConnection, 'enterUriManually' | 'jdbcUri'> {
  const { enterUriManually, jdbcUri, ...rest } = conn;
  if (enterUriManually && jdbcUri) {
    return { ...rest, url: jdbcUri };
  }
  return rest;
}

/**
 * Encrypts a password using the backend's AES-256-GCM key.
 * Returns the same string if it is already encrypted (ENC: prefix).
 */
export const encryptPassword = async (plaintext: string): Promise<string> => {
  if (!plaintext) return plaintext;
  const response = await fetch(`${SCHEMA_SERVICE_URL}/v1/encrypt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: plaintext }),
  });
  if (!response.ok) throw new Error('Failed to encrypt password');
  const data = await response.json();
  return data.encrypted as string;
};

/**
 * Test a database connection without saving it
 */
export const testConnection = async (connection: DbConnection): Promise<ConnectionTestResult> => {
  try {
    const conn = toApiConnection(connection);
    if (conn.password) {
      conn.password = await encryptPassword(conn.password);
    }
    const response = await fetch(`${SCHEMA_SERVICE_URL}/v1/connections/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conn),
    });
    if (!response.ok) {
      throw new Error(`Server error: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Connection test failed' };
  }
};

/**
 * Analyze database schema using SchemaCrawler
 */
export const analyzeSchema = async (request: SchemaAnalysisRequest): Promise<DbDatabase> => {
  try {
    const conn = toApiConnection(request.connection);
    if (conn.password) {
      conn.password = await encryptPassword(conn.password);
    }
    const response = await fetch(`${SCHEMA_SERVICE_URL}/v1/schemas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...request, connection: conn }),
    });
    if (!response.ok) {
      let message = response.statusText;
      try {
        const body = await response.json();
        if (body?.error) message = body.error;
      } catch { /* ignore parse errors */ }
      throw new Error(`Failed to analyze schema: ${message}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error analyzing schema:', error);
    throw error;
  }
};

/**
 * Get all schemas from database
 */
export const fetchSchemas = async (request: SchemaAnalysisRequest): Promise<DbSchema[]> => {
  try {
    const database = await analyzeSchema(request);
    return Object.values(database.schemas);
  } catch (error) {
    console.error('Error fetching schemas:', error);
    throw error;
  }
};

/**
 * Get all tables from a specific schema
 */
export const fetchTablesForSchema = async (
  request: SchemaAnalysisRequest,
  schemaName: string
): Promise<DbTable[]> => {
  try {
    const database = await analyzeSchema(request);
    const schema = database.schemas[schemaName];
    if (!schema || !schema.tables) {
      return [];
    }
    return Object.values(schema.tables);
  } catch (error) {
    console.error(`Error fetching tables for schema ${schemaName}:`, error);
    throw error;
  }
};

export interface SaveConnectionRequest {
  id: string;
  name: string;
  environment?: ConnectionEnvironment;
  connection: DbConnection;
}

export interface SavedConnection {
  id: string;
  name: string;
  environment?: ConnectionEnvironment;
  connection: DbConnection;
}

/**
 * Save a database connection for later use
 */
export const saveConnection = async (request: SaveConnectionRequest): Promise<SavedConnection> => {
  try {
    const response = await fetch(`${SCHEMA_SERVICE_URL}/v1/connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`Failed to save connection: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error saving connection:', error);
    throw error;
  }
};

/**
 * Get all saved connections
 */
export const getSavedConnections = async (): Promise<SavedConnection[]> => {
  try {
    const response = await fetch(`${SCHEMA_SERVICE_URL}/v1/connections`);
    if (!response.ok) {
      throw new Error(`Failed to fetch saved connections: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching saved connections:', error);
    throw error;
  }
};

/**
 * Get a specific saved connection by name (legacy path-based lookup)
 */
export const getConnection = async (name: string): Promise<SavedConnection> => {
  try {
    const response = await fetch(`${SCHEMA_SERVICE_URL}/v1/connections/${encodeURIComponent(name)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch connection: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching connection ${name}:`, error);
    throw error;
  }
};

/**
 * Resolve a connection by id or name (id takes priority).
 * Use this when a project may have either connectionId or connectionName.
 */
export const resolveConnection = async (
  connectionId?: string,
  connectionName?: string
): Promise<SavedConnection> => {
  if (connectionId) {
    const all = await getSavedConnections();
    const found = all.find((c) => c.id === connectionId);
    if (found) return found;
  }
  if (connectionName) {
    return getConnection(connectionName);
  }
  throw new Error('No connection identifier provided');
};

/**
 * Delete a saved connection by name
 */
export const deleteConnection = async (name: string): Promise<void> => {
  try {
    const response = await fetch(`${SCHEMA_SERVICE_URL}/v1/connections/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete connection: ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Error deleting connection ${name}:`, error);
    throw error;
  }
};

/**
 * Delete a saved connection by id
 */
export const deleteConnectionById = async (id: string): Promise<void> => {
  const all = await getSavedConnections();
  const conn = all.find((c) => c.id === id);
  if (!conn) throw new Error(`Connection not found: ${id}`);
  return deleteConnection(conn.name);
};

/**
 * Update a saved connection via PUT.
 * If request.connection.password is blank the backend retains the existing stored password.
 */
export const updateConnection = async (
  originalName: string,
  request: SaveConnectionRequest
): Promise<SavedConnection> => {
  try {
    const response = await fetch(
      `${SCHEMA_SERVICE_URL}/v1/connections/${encodeURIComponent(originalName)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to update connection: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error updating connection:', error);
    throw error;
  }
};

/**
 * Test a saved connection using its stored credentials (no password required from client).
 */
export const testConnectionById = async (id: string): Promise<ConnectionTestResult> => {
  try {
    const response = await fetch(
      `${SCHEMA_SERVICE_URL}/v1/connections/${encodeURIComponent(id)}/test`,
      { method: 'POST' }
    );
    if (!response.ok) {
      throw new Error(`Server error: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Connection test failed' };
  }
};
