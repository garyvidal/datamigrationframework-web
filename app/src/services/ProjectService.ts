const SCHEMA_SERVICE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:9390';

/** Naming case options matching Java NamingCase enum (serialized as uppercase). */
export type NamingCase = 'SNAKE' | 'CAMEL' | 'PASCAL' | 'DASH';

export interface ProjectSettings {
  defaultCasing?: NamingCase;
  /** Connection line type matching @xyflow/react ConnectionLineType values. */
  connectionLineType?: string;
}

export interface ProjectTable {
  tableName: string;
  schema?: string;
  columns?: Record<string, {
    name: string;
    type: string;
    position?: number;
    primaryKey?: boolean;
    sequence?: boolean;
    nullable?: boolean;
    columnType?: { columnType: string; precision?: number; scale?: number };
    foreignKey?: { name: string };
  }>;
  relationships?: Array<{ fromColumn: string; toTable: string; toColumn: string }>;
  /** Optional SQL WHERE clause (without the WHERE keyword) to filter rows from this table. */
  whereClause?: string;
}

export interface ProjectSchema {
  name: string;
  tables?: Record<string, ProjectTable>;
}

export interface DiagramNode {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  collapsed?: boolean;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  startMarker?: string | null;
  endMarker?: string | null;
}

export interface DiagramObject {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export interface DiagramTab {
  id: string;
  name: string;
  relational?: DiagramObject;
  document?: DiagramObject | null;
}

export interface DiagramContainer {
  name: string;
  tabs: DiagramTab[];
}

export interface XmlNamespace {
  /** Namespace prefix, e.g. "dc", "xs", "my". */
  prefix: string;
  /** Namespace URI, e.g. "http://purl.org/dc/elements/1.1/". */
  uri: string;
}

export type XmlSchemaType =
  | 'xs:string'
  | 'xs:integer'
  | 'xs:long'
  | 'xs:date'
  | 'xs:dateTime'
  | 'xs:boolean'
  | 'xs:decimal'
  | 'xs:hexBinary'
  ;

export type TableMappingType = 'RootElement' | 'Elements' | 'InlineElement' | 'CUSTOM';
export type ColumnMappingType = 'Element' | 'ElementAttribute' | 'CUSTOM';

export type JoinType = 'equals' | 'notEquals' | 'lessThan' | 'lessThanOrEqual' | 'greaterThan' | 'greaterThanOrEqual' | 'like';

export interface JoinCondition {
  sourceColumn: string;
  joinType: JoinType;
  targetColumn: string;
}

export interface SyntheticJoin {
  id: string;
  sourceSchema: string;
  sourceTable: string;
  targetSchema: string;
  targetTable: string;
  conditions: JoinCondition[];
}

export interface XmlColumnMapping {
  /** Stable UUID — persists across renames. */
  id?: string;
  sourceColumn: string;
  xmlName: string;
  xmlType: XmlSchemaType;
  mappingType: ColumnMappingType;
  /** Custom fields only: JavaScript function body that computes this field's value. */
  customFunction?: string;
  /** Optional namespace prefix for this element or attribute. Must be declared in ProjectMapping.namespaces. */
  namespacePrefix?: string;
}

export interface XmlTableMapping {
  /** Stable UUID — persists across renames. */
  id?: string;
  sourceSchema: string;
  sourceTable: string;
  /** RootElement: the root element name. Elements/InlineElement: the child element name. CUSTOM: the output element name. */
  xmlName: string;
  mappingType: TableMappingType;
  /** Elements only: when true, columns are nested inside a wrapper element around the child element. */
  wrapInParent: boolean;
  /** Elements only: outer wrapper element name, used when wrapInParent is true. */
  wrapperElementName?: string;
  /** InlineElement: id of the parent XmlTableMapping this is nested inside. */
  parentRef?: string;
  /** InlineElement: when true, skip the wrapper element and embed columns directly into the parent. */
  embed?: boolean;
  /** When multiple FKs exist between parent and child, specifies the FK column to use for joining. */
  joinColumn?: string;
  /** CUSTOM: JavaScript function body that computes the element value from referenced fields. */
  customFunction?: string;
  /** CUSTOM: the XSD type returned by the custom function. */
  xmlType?: XmlSchemaType;
  /** Optional namespace prefix for this element. Must be declared in ProjectMapping.namespaces. */
  namespacePrefix?: string;
  columns: XmlColumnMapping[];
}

// ── JSON Mapping Types ────────────────────────────────────────────────────────

export type JsonColumnType = 'string' | 'number' | 'boolean';
export type JsonColumnMappingType = 'Property' | 'CUSTOM';
export type JsonTableMappingType = 'RootObject' | 'Array' | 'InlineObject';

export interface JsonColumnMapping {
  id?: string;
  sourceColumn: string;
  jsonKey: string;
  jsonType: JsonColumnType;
  mappingType: JsonColumnMappingType;
  customFunction?: string;
}

export interface JsonTableMapping {
  id?: string;
  sourceSchema: string;
  sourceTable: string;
  jsonName: string;
  mappingType: JsonTableMappingType;
  parentRef?: string;
  /** InlineObject: when true, skip the wrapper key and embed properties directly into the parent object. */
  embed?: boolean;
  /** When multiple FKs exist between parent and child, specifies the FK column to use for joining. */
  joinColumn?: string;
  columns: JsonColumnMapping[];
}

export type MappingTargetType = 'XML' | 'JSON' | 'BOTH';

export interface ProjectMapping {
  documentModel: {
    root?: XmlTableMapping;
    elements: XmlTableMapping[];
  };
  jsonDocumentModel?: {
    root?: JsonTableMapping;
    elements: JsonTableMapping[];
  };
  /** Which document type(s) to generate. Defaults to 'XML'. */
  mappingType?: MappingTargetType;
  /** XML namespace declarations applied to all generated documents. */
  namespaces?: XmlNamespace[];
}

// ── MarkLogic Security Types ──────────────────────────────────────────────────

export interface MarkLogicPermission {
  roleName: string;
  /** e.g. ["read"], ["read", "update"] */
  capabilities: string[];
}

export interface MarkLogicSecurityConfig {
  permissions?: MarkLogicPermission[];
  collections?: string[];
  /** Document quality score — higher ranks higher in search results. */
  quality?: number;
  /** Arbitrary key-value metadata pairs. */
  metadata?: Record<string, string>;
}

export interface ProjectData {
  id?: string;
  name: string;
  version?: string;
  connectionName: string;
  /** UUID-based connection reference (preferred over connectionName for new projects) */
  connectionId?: string;
  created?: string;
  modified?: string;
  schemas: Record<string, ProjectSchema>;
  diagrams?: DiagramContainer[] | null;
  settings?: ProjectSettings;
  mapping?: ProjectMapping;
  syntheticJoins?: SyntheticJoin[];
  securityConfig?: MarkLogicSecurityConfig;
}

export const saveProject = async (project: ProjectData): Promise<ProjectData> => {
  const response = await fetch(`${SCHEMA_SERVICE_URL}/v1/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  });
  if (!response.ok) {
    throw new Error(`Failed to save project: ${response.statusText}`);
  }
  return response.json();
};

export const getProject = async (idOrName: string): Promise<ProjectData> => {
  const response = await fetch(`${SCHEMA_SERVICE_URL}/v1/projects/${encodeURIComponent(idOrName)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch project: ${response.statusText}`);
  }
  return response.json();
};

export const getProjects = async (): Promise<ProjectData[]> => {
  const response = await fetch(`${SCHEMA_SERVICE_URL}/v1/projects`);
  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${response.statusText}`);
  }
  return response.json();
};

export const getProjectSecurity = async (projectId: string): Promise<MarkLogicSecurityConfig | null> => {
  const response = await fetch(`${SCHEMA_SERVICE_URL}/v1/projects/${encodeURIComponent(projectId)}/security`);
  if (!response.ok) throw new Error(`Failed to fetch project security: ${response.statusText}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

export const updateProjectSecurity = async (
  projectId: string,
  config: MarkLogicSecurityConfig,
): Promise<MarkLogicSecurityConfig> => {
  const response = await fetch(`${SCHEMA_SERVICE_URL}/v1/projects/${encodeURIComponent(projectId)}/security`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!response.ok) throw new Error(`Failed to update project security: ${response.statusText}`);
  return response.json();
};

export const deleteProject = async (idOrName: string): Promise<void> => {
  const response = await fetch(`${SCHEMA_SERVICE_URL}/v1/projects/${encodeURIComponent(idOrName)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Failed to delete project: ${response.statusText}`);
  }
};

export interface XmlPreviewResponse {
  documents: string[];
  totalRows: number;
  errors: string[];
}

export const generateXmlPreview = async (projectId: string, limit: number = 10): Promise<XmlPreviewResponse> => {
  const response = await fetch(
    `${SCHEMA_SERVICE_URL}/v1/projects/${encodeURIComponent(projectId)}/generate/preview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit }),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to generate preview: ${response.statusText}`);
  }
  return response.json();
};

export const generateXsdSchema = async (projectId: string): Promise<string> => {
  const response = await fetch(
    `${SCHEMA_SERVICE_URL}/v1/projects/${encodeURIComponent(projectId)}/generate/schema`,
    { method: 'GET' }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to generate XSD schema: ${response.statusText}`);
  }
  return response.text();
};

export interface JsonPreviewResponse {
  documents: string[];
  totalRows: number;
  errors: string[];
}

// ── Migration Package ─────────────────────────────────────────────────────────

export interface ImportResult {
  projectId: string;
  projectName: string;
  projectCreated: boolean;
  sourceConnectionId?: string;
  sourceConnectionName?: string;
  sourceConnectionCreated: boolean;
  marklogicConnectionId?: string;
  marklogicConnectionName?: string;
  marklogicConnectionCreated: boolean;
  warnings: string[];
}

/**
 * Triggers a browser download of a migration package JSON file for the given project.
 * Optionally bundles a source connection and/or MarkLogic connection (passwords excluded).
 */
export const downloadPackage = (
  projectId: string,
  sourceConnectionId?: string,
  marklogicConnectionId?: string,
): void => {
  const params = new URLSearchParams();
  if (sourceConnectionId) params.set('sourceConnectionId', sourceConnectionId);
  if (marklogicConnectionId) params.set('marklogicConnectionId', marklogicConnectionId);
  const query = params.toString() ? `?${params.toString()}` : '';
  window.location.href = `${SCHEMA_SERVICE_URL}/v1/packages/export/${encodeURIComponent(projectId)}${query}`;
};

/**
 * Imports a migration package. Creates the project and connections if they don't exist.
 * Optionally supplies plaintext passwords for the imported connections.
 */
export const importPackage = async (
  file: File,
  sourcePassword?: string,
  marklogicPassword?: string,
): Promise<ImportResult> => {
  const text = await file.text();
  const params = new URLSearchParams();
  if (sourcePassword) params.set('sourcePassword', sourcePassword);
  if (marklogicPassword) params.set('marklogicPassword', marklogicPassword);
  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${SCHEMA_SERVICE_URL}/v1/packages/import${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: text,
  });
  if (!response.ok) {
    const msg = await response.text().catch(() => response.statusText);
    throw new Error(`Failed to import package: ${msg}`);
  }
  return response.json();
};

export const generateJsonPreview = async (projectId: string, limit: number = 10): Promise<JsonPreviewResponse> => {
  const response = await fetch(
    `${SCHEMA_SERVICE_URL}/v1/projects/${encodeURIComponent(projectId)}/generate/json/preview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit }),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to generate JSON preview: ${response.statusText}`);
  }
  return response.json();
};
