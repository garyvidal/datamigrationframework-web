// SchemaView — Main canvas: ReactFlow diagram with left/right collapsible panels, Dagre auto-layout, edge wiring, and project-sync debounce.
import { ReactFlow, MiniMap, Background, Controls, useNodesState, useEdgesState, NodeTypes, useReactFlow, ConnectionLineType } from "@xyflow/react";
import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import * as ReactDOM from "react-dom";
import * as dagreNS from "@dagrejs/dagre";
import Splitter from "../Layout/Splitter";
import { useResizable } from "react-resizable-layout";
import { cn } from "@/lib/Utils";
import { useTheme } from "@/contexts/ThemeContext";
import CollapsiblePanel from "../Layout/CollapsiblePanel";
import SchemaToolbar, { ViewMode } from "./SchemaToolbar";
import DiagramTabs from "./DiagramTabs";
import DocumentModelView from "../DocumentModelView/DocumentModelView";
import SchemasPanel from "../Panels/SchemasPanel";
import ProjectPanel from "../Panels/ProjectPanel";
import AddTablesModal from "../Project/AddTablesModal";
import DatabaseConnectionForm from "../Project/DatabaseConnectionForm";
import { ConfigDialog } from "../Project/ConfigDialog";
import GenerateXmlModal from "../Project/GenerateXmlModal";
import GenerateJsonModal from "../Project/GenerateJsonModal";
import { DbTable, DbSchema, DbDatabase, DbConnection, SchemaAnalysisRequest, analyzeSchema, resolveConnection } from "@/services/SchemaService";
import { ProjectData, ProjectSettings, ProjectMapping, XmlTableMapping, SyntheticJoin, saveProject } from "@/services/ProjectService";
import SyntheticJoinDialog from "./SyntheticJoinDialog";
import { convertCaseFromSetting } from "@/lib/CaseConverter";
import type { Node as ReactFlowNode, Edge as ReactFlowEdge } from "@xyflow/react";
import { DatabaseSchemaNode } from "../Nodes/DatabaseSchemaNode";
import { LayoutAlgorithm } from "./LayoutControls";

// Vite pre-bundles @dagrejs/dagre as a default-only export; unwrap if needed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dagre = ((dagreNS as any).default ?? dagreNS) as typeof dagreNS;

const nodeTypes: NodeTypes = { databaseSchema: DatabaseSchemaNode };

// Estimates node dimensions for layout when measured sizes are not yet available
function estimateNodeSize(node: ReactFlowNode): { width: number; height: number } {
    if (node.measured?.width && node.measured?.height) {
        return { width: node.measured.width, height: node.measured.height };
    }
    const collapsed = (node.data as { collapsed?: boolean })?.collapsed ?? false;
    const cols = ((node.data as { schema?: unknown[] })?.schema ?? []).length;
    return { width: 220, height: collapsed ? 50 : 44 + cols * 28 };
}

function applyDagreLayout(
    nodes: ReactFlowNode[],
    edges: ReactFlowEdge[],
    rankdir: "TB" | "LR" | "BT",
): ReactFlowNode[] {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir, nodesep: 60, ranksep: 80, marginx: 20, marginy: 20 });
    g.setDefaultEdgeLabel(() => ({}));

    nodes.forEach(node => {
        const { width, height } = estimateNodeSize(node);
        g.setNode(node.id, { width, height });
    });
    edges.forEach(edge => {
        if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
            g.setEdge(edge.source, edge.target);
        }
    });

    dagre.layout(g);

    return nodes.map(node => {
        const pos = g.node(node.id);
        const { width, height } = estimateNodeSize(node);
        return { ...node, position: { x: pos.x - width / 2, y: pos.y - height / 2 } };
    });
}

function applyGridLayout(nodes: ReactFlowNode[]): ReactFlowNode[] {
    const cols = Math.ceil(Math.sqrt(nodes.length));
    const colWidth = 280;
    const rowHeight = 320;
    return nodes.map((node, i) => ({
        ...node,
        position: { x: 40 + (i % cols) * colWidth, y: 40 + Math.floor(i / cols) * rowHeight },
    }));
}

// Re-anchors edges so they connect from whichever side of the source faces the target.
function reanchorEdges(nodes: ReactFlowNode[], edges: ReactFlowEdge[]): ReactFlowEdge[] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    return edges.map(edge => {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        if (!src || !tgt) return edge;
        const srcW = src.measured?.width ?? estimateNodeSize(src).width;
        const tgtW = tgt.measured?.width ?? estimateNodeSize(tgt).width;
        const srcCx = src.position.x + srcW / 2;
        const tgtCx = tgt.position.x + tgtW / 2;
        if (srcCx <= tgtCx) {
            return { ...edge, sourceHandle: "right-source", targetHandle: "left-target" };
        } else {
            return { ...edge, sourceHandle: "left-source", targetHandle: "right-target" };
        }
    });
}

// Inner component so we can use useReactFlow() inside the ReactFlow context
interface LayoutApplierProps {
    pendingLayout: LayoutAlgorithm | null;
    edges: ReactFlowEdge[];
    setNodes: (updater: (prev: ReactFlowNode[]) => ReactFlowNode[]) => void;
    setEdges: (updater: (prev: ReactFlowEdge[]) => ReactFlowEdge[]) => void;
    onDone: () => void;
}

function LayoutApplier({ pendingLayout, edges, setNodes, setEdges, onDone }: LayoutApplierProps) {
    const { fitView } = useReactFlow();

    useEffect(() => {
        if (!pendingLayout) return;
        setNodes(prev => {
            if (prev.length === 0) return prev;
            let laid: ReactFlowNode[];
            switch (pendingLayout) {
                case "dagre-tb": laid = applyDagreLayout(prev, edges, "TB"); break;
                case "dagre-lr": laid = applyDagreLayout(prev, edges, "LR"); break;
                case "dagre-bt": laid = applyDagreLayout(prev, edges, "BT"); break;
                case "grid":     laid = applyGridLayout(prev); break;
                default:         return prev;
            }
            setEdges(prevEdges => reanchorEdges(laid, prevEdges));
            return laid;
        });
        onDone();
        // Fit view after layout positions settle
        setTimeout(() => fitView({ padding: 0.1, duration: 300 }), 50);
    }, [pendingLayout]);

    return null;
}

/** Rebuild all xmlName fields in a mapping using a new project naming case. */
function remapAllNames(mapping: ProjectMapping, newCasing: string): ProjectMapping {
    const remapXmlTable = (t: XmlTableMapping): XmlTableMapping => ({
        ...t,
        xmlName: convertCaseFromSetting(t.sourceTable, newCasing),
        columns: t.columns.map(col => ({
            ...col,
            xmlName: convertCaseFromSetting(col.sourceColumn, newCasing),
        })),
    });
    const remapJsonTable = (t: import('@/services/ProjectService').JsonTableMapping): import('@/services/ProjectService').JsonTableMapping => ({
        ...t,
        jsonName: convertCaseFromSetting(t.sourceTable, newCasing),
        columns: t.columns.map(col => ({
            ...col,
            jsonKey: convertCaseFromSetting(col.sourceColumn, newCasing),
        })),
    });
    return {
        ...mapping,
        documentModel: {
            root: mapping.documentModel.root ? remapXmlTable(mapping.documentModel.root) : undefined,
            elements: mapping.documentModel.elements.map(remapXmlTable),
        },
        jsonDocumentModel: mapping.jsonDocumentModel ? {
            root: mapping.jsonDocumentModel.root ? remapJsonTable(mapping.jsonDocumentModel.root) : undefined,
            elements: mapping.jsonDocumentModel.elements.map(remapJsonTable),
        } : undefined,
    };
}

interface SchemaViewProps {
    openProjects: ProjectData[];
    activeProjectName: string | null;
    onProjectSelect: (name: string) => void;
    onProjectClose: (name: string) => void;
    onProjectRename?: (oldName: string, newName: string) => void;
    onDiagramChange?: (projectName: string, nodes: ReactFlowNode[], edges: ReactFlowEdge[]) => void;
    onProjectSchemasUpdated?: (project: ProjectData) => void;
    onProjectSettingsUpdated?: (project: ProjectData) => void;
}

const SchemaView = ({ openProjects, activeProjectName, onProjectSelect, onProjectClose, onProjectRename, onDiagramChange, onProjectSchemasUpdated, onProjectSettingsUpdated }: SchemaViewProps): JSX.Element => {
    const { theme } = useTheme();
    const [selectedTable, setSelectedTable] = useState<DbTable | null>(null);
    const [selectedSchema, setSelectedSchema] = useState<DbSchema | null>(null);
    const [database, setDatabase] = useState<DbDatabase | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showConnectionModal, setShowConnectionModal] = useState(false);
    const [showEdges, setShowEdges] = useState(true);
    const [connectionLineType, setConnectionLineType] = useState<ConnectionLineType>(ConnectionLineType.SmoothStep);
    const [pendingLayout, setPendingLayout] = useState<LayoutAlgorithm | null>(null);
    const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
    const [edgeContextMenu, setEdgeContextMenu] = useState<{ edgeId: string; x: number; y: number } | null>(null);
    const [showAddTablesModal, setShowAddTablesModal] = useState(false);
    const [showConfigDialog, setShowConfigDialog] = useState(false);
    const [showGenerateModal, setShowGenerateModal] = useState(false);
    const [showGenerateJsonModal, setShowGenerateJsonModal] = useState(false);
    const [pendingCasingUpdate, setPendingCasingUpdate] = useState<{
        settings: ProjectSettings;
        lineType: ConnectionLineType;
        mappingType?: import('@/services/ProjectService').MappingTargetType;
    } | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('relational');
    const [showJoinDialog, setShowJoinDialog] = useState(false);
    const [pendingMappingTable, setPendingMappingTable] = useState<{ tableName: string; schemaName: string } | null>(null);
    const [highlightedMappingTable, setHighlightedMappingTable] = useState<{ tableName: string; schemaName: string } | null>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    const visibleNodeIds = useMemo(() => new Set(nodes.map(n => n.id)), [nodes]);
    const projectDbCache = useRef<Map<string, DbDatabase>>(new Map());
    const diagramSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isRestoringRef = useRef(false);
    const diagramRef = useRef<HTMLDivElement>(null);

    const handleExportPng = useCallback(async () => {
        const el = diagramRef.current;
        if (!el) return;
        const { toPng } = await import('html-to-image');
        const dataUrl = await toPng(el, { backgroundColor: '#0f172a', pixelRatio: 2 });
        const link = document.createElement('a');
        link.download = `${activeProjectRef.current?.name ?? 'diagram'}.png`;
        link.href = dataUrl;
        link.click();
    }, []);

    const activeProject = openProjects.find((p) => p.name === activeProjectName) ?? null;
    const activeProjectRef = useRef<ProjectData | null>(activeProject);
    activeProjectRef.current = activeProject;

    const mappedTableKeys = useMemo(() => {
        const keys = new Set<string>();
        const dm = activeProject?.mapping?.documentModel;
        if (dm?.root) keys.add(`${dm.root.sourceSchema}.${dm.root.sourceTable}`);
        dm?.elements.forEach(e => keys.add(`${e.sourceSchema}.${e.sourceTable}`));
        const jdm = activeProject?.mapping?.jsonDocumentModel;
        if (jdm?.root) keys.add(`${jdm.root.sourceSchema}.${jdm.root.sourceTable}`);
        jdm?.elements.forEach(e => keys.add(`${e.sourceSchema}.${e.sourceTable}`));
        return keys;
    }, [activeProject?.mapping]);

    // Restore saved diagram nodes and settings when switching projects
    useEffect(() => {
        isRestoringRef.current = true;

        if (activeProject?.settings?.connectionLineType) {
            setConnectionLineType(activeProject.settings.connectionLineType as ConnectionLineType);
        }

        const savedNodes = activeProject?.diagrams?.[0]?.tabs?.[0]?.relational?.nodes ?? [];
        const savedEdges = activeProject?.diagrams?.[0]?.tabs?.[0]?.relational?.edges ?? [];

        if (savedNodes.length > 0) {
            const restored = savedNodes.map((sn) => {
                const dotIdx = sn.id.indexOf(".");
                const schemaName = sn.id.substring(0, dotIdx);
                const tableName = sn.id.substring(dotIdx + 1);
                const table = activeProject?.schemas[schemaName]?.tables?.[tableName];
                return {
                    id: sn.id,
                    type: "databaseSchema",
                    position: { x: sn.x, y: sn.y },
                    data: {
                        label: tableName,
                        schema: Object.values(table?.columns ?? {}).map((col) => ({
                            title: col.name,
                            type: col.type ?? "",
                        })),
                        collapsed: sn.collapsed ?? false,
                    },
                };
            });
            const initialEdges = savedEdges.map((se) => ({ id: se.id, source: se.source, target: se.target }));
            setNodes(restored);
            setEdges(reanchorEdges(restored, initialEdges));
        } else {
            setNodes([]);
            setEdges([]);
        }
        setTimeout(() => { isRestoringRef.current = false; }, 100);
    }, [activeProjectName]);

    // Debounced diagram + settings save on node/edge/connectionLineType changes
    useEffect(() => {
        if (!activeProject || isRestoringRef.current) return;
        if (diagramSaveTimer.current) clearTimeout(diagramSaveTimer.current);
        diagramSaveTimer.current = setTimeout(async () => {
            // Use ref to get the latest project (avoids stale closure overwriting mapping changes)
            const latestProject = activeProjectRef.current;
            if (!latestProject) return;
            onDiagramChange?.(latestProject.name, nodes, edges);
            const updatedProject: ProjectData = {
                ...latestProject,
                settings: {
                    ...latestProject.settings,
                    connectionLineType,
                },
                diagrams: [
                    {
                        name: latestProject.diagrams?.[0]?.name || "Main",
                        tabs: [
                            {
                                id: latestProject.diagrams?.[0]?.tabs?.[0]?.id || "tab-1",
                                name: latestProject.diagrams?.[0]?.tabs?.[0]?.name || "Relational",
                                relational: {
                                    nodes: nodes.map(n => ({
                                        id: n.id,
                                        type: n.type,
                                        x: n.position.x,
                                        y: n.position.y,
                                        collapsed: n.data?.collapsed ?? false,
                                    })),
                                    edges: edges.map(e => ({
                                        id: e.id,
                                        source: e.source,
                                        target: e.target,
                                    })),
                                },
                            },
                        ],
                    },
                ],
            };
            try {
                await saveProject(updatedProject);
                onProjectSettingsUpdated?.(updatedProject);
            } catch (err) {
                console.error("Failed to save diagram to ProjectRepository", err);
            }
        }, 1500);
        return () => {
            if (diagramSaveTimer.current) clearTimeout(diagramSaveTimer.current);
        };
    }, [nodes, edges, connectionLineType]);

    const handleProjectTableSelect = useCallback(async (tableName: string, schemaName: string) => {
        if (!activeProject) return;
        const nodeId = `${schemaName}.${tableName}`;
        if (nodes.some(n => n.id === nodeId)) return;

        let db = projectDbCache.current.get(activeProject.connectionId ?? activeProject.connectionName);
        if (!db) {
            try {
                const savedConn = await resolveConnection(activeProject.connectionId, activeProject.connectionName);
                db = await analyzeSchema({
                    connectionId: savedConn.id,
                    connection: savedConn.connection,
                    includeTables: true,
                    includeColumns: true,
                    includeRelationships: false,
                });
                projectDbCache.current.set(activeProject.connectionId ?? activeProject.connectionName, db);
            } catch (e) {
                console.error("Failed to fetch schema for project:", e);
                return;
            }
        }
        const table = db.schemas[schemaName]?.tables?.[tableName];
        if (!table) return;

        const idx = nodes.length;
        const newNode: ReactFlowNode = {
            id: nodeId,
            type: "databaseSchema",
            position: { x: 50 + (idx % 4) * 380, y: 50 + Math.floor(idx / 4) * 280 },
            data: {
                label: tableName,
                schema: Object.values(table.columns ?? {}).map(col => ({ title: col.name, type: col.type ?? "", primaryKey: col.primaryKey })),
            },
        };
        const updatedNodes = [...nodes, newNode];

        // Build edges for relationships
        const projectTable = activeProject.schemas[schemaName]?.tables?.[tableName];
        const outgoingRels = projectTable?.relationships ?? [];
        const newEdges: ReactFlowEdge[] = [...edges];
        const existingEdgeIds = new Set(edges.map(e => e.id));

        for (const rel of outgoingRels) {
            const targetNode = nodes.find(n => n.id.substring(n.id.indexOf(".") + 1) === rel.toTable);
            if (targetNode) {
                const edgeId = `${nodeId}->${targetNode.id}`;
                if (!existingEdgeIds.has(edgeId)) {
                    newEdges.push({ id: edgeId, source: nodeId, target: targetNode.id });
                    existingEdgeIds.add(edgeId);
                }
            }
        }

        for (const existingNode of nodes) {
            const dotIdx = existingNode.id.indexOf(".");
            const existingSchemaName = existingNode.id.substring(0, dotIdx);
            const existingTableName = existingNode.id.substring(dotIdx + 1);
            const existingRels = activeProject.schemas[existingSchemaName]?.tables?.[existingTableName]?.relationships ?? [];
            for (const rel of existingRels) {
                if (rel.toTable === tableName) {
                    const edgeId = `${existingNode.id}->${nodeId}`;
                    if (!existingEdgeIds.has(edgeId)) {
                        newEdges.push({ id: edgeId, source: existingNode.id, target: nodeId });
                        existingEdgeIds.add(edgeId);
                    }
                }
            }
        }

        setNodes(updatedNodes);
        setEdges(reanchorEdges(updatedNodes, newEdges));
    }, [activeProject, nodes, edges]);

    const handleNodeDragStop = useCallback((_event: React.MouseEvent, _node: ReactFlowNode) => {
        setNodes(currentNodes => {
            setEdges(currentEdges => reanchorEdges(currentNodes, currentEdges));
            return currentNodes;
        });
    }, []);

    const handleNodeClick = useCallback((_event: React.MouseEvent, node: ReactFlowNode) => {
        if (!activeProject) return;
        const dotIdx = node.id.indexOf('.');
        const schemaName = node.id.substring(0, dotIdx);
        const tableName = node.id.substring(dotIdx + 1);
        if (mappedTableKeys.has(node.id)) {
            setHighlightedMappingTable({ tableName, schemaName });
        } else {
            setPendingMappingTable({ tableName, schemaName });
        }
    }, [activeProject, mappedTableKeys]);

    const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: ReactFlowNode) => {
        event.preventDefault();
        setEdgeContextMenu(null);
        setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY });
    }, []);

    const handleRemoveNode = useCallback((nodeId: string) => {
        setNodes(prev => prev.filter(n => n.id !== nodeId));
        setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId));
        setContextMenu(null);
    }, []);

    const handleEdgeContextMenu = useCallback((event: React.MouseEvent, edge: ReactFlowEdge) => {
        if (!edge.id.startsWith('synth-')) return;
        event.preventDefault();
        setContextMenu(null);
        setEdgeContextMenu({ edgeId: edge.id, x: event.clientX, y: event.clientY });
    }, []);

    const handleDeleteJoin = useCallback(async (edgeId: string) => {
        // Parse edge ID: "synth-{sourceSchema}.{sourceTable}->{targetSchema}.{targetTable}"
        const withoutPrefix = edgeId.substring('synth-'.length);
        const arrowIdx = withoutPrefix.indexOf('->');
        const sourceNodeId = withoutPrefix.substring(0, arrowIdx);
        const targetNodeId = withoutPrefix.substring(arrowIdx + 2);

        setEdges(prev => prev.filter(e => e.id !== edgeId));
        setEdgeContextMenu(null);

        if (!activeProject) return;
        const updatedProject: ProjectData = {
            ...activeProject,
            syntheticJoins: (activeProject.syntheticJoins ?? []).filter(j =>
                `${j.sourceSchema}.${j.sourceTable}` !== sourceNodeId ||
                `${j.targetSchema}.${j.targetTable}` !== targetNodeId,
            ),
        };
        try {
            await saveProject(updatedProject);
            onProjectSchemasUpdated?.(updatedProject);
        } catch (err) {
            console.error("Failed to delete synthetic join", err);
        }
    }, [activeProject, onProjectSchemasUpdated]);

    const persistSettings = useCallback(async (settings: ProjectSettings, lineType: ConnectionLineType, applyToMapping: boolean, mappingType?: import('@/services/ProjectService').MappingTargetType) => {
        if (!activeProject) return;
        setConnectionLineType(lineType);
        let mapping = applyToMapping && activeProject.mapping && settings.defaultCasing
            ? remapAllNames(activeProject.mapping, settings.defaultCasing)
            : activeProject.mapping;
        if (mappingType !== undefined) {
            mapping = { ...(mapping ?? { documentModel: { elements: [] } }), mappingType };
        }
        const updatedProject: ProjectData = { ...activeProject, settings, mapping };
        try {
            await saveProject(updatedProject);
            onProjectSettingsUpdated?.(updatedProject);
        } catch (err) {
            console.error("Failed to save project settings", err);
        }
    }, [activeProject, onProjectSettingsUpdated]);

    const handleConfigSave = useCallback((settings: ProjectSettings, newLineType: ConnectionLineType, newMappingType?: import('@/services/ProjectService').MappingTargetType) => {
        if (!activeProject) return;
        setShowConfigDialog(false);
        const casingChanged = settings.defaultCasing !== activeProject.settings?.defaultCasing;
        const hasMapping = !!(
            activeProject.mapping?.documentModel.root ||
            (activeProject.mapping?.documentModel.elements ?? []).length > 0 ||
            activeProject.mapping?.jsonDocumentModel?.root ||
            (activeProject.mapping?.jsonDocumentModel?.elements ?? []).length > 0
        );
        if (casingChanged && hasMapping) {
            setPendingCasingUpdate({ settings, lineType: newLineType, mappingType: newMappingType });
        } else {
            persistSettings(settings, newLineType, false, newMappingType);
        }
    }, [activeProject, persistSettings]);

    const handleCreateJoin = useCallback(async (join: SyntheticJoin) => {
        if (!activeProject) return;
        const sourceId = `${join.sourceSchema}.${join.sourceTable}`;
        const targetId = `${join.targetSchema}.${join.targetTable}`;
        const edgeId = `synth-${sourceId}->${targetId}`;
        const updatedProject: ProjectData = {
            ...activeProject,
            syntheticJoins: [
                ...(activeProject.syntheticJoins ?? []).filter(j => j.id !== join.id),
                join,
            ],
        };
        try {
            await saveProject(updatedProject);
            onProjectSchemasUpdated?.(updatedProject);
        } catch (err) {
            console.error("Failed to save synthetic join", err);
        }
        setEdges(prev => {
            if (prev.some(e => e.id === edgeId)) return prev;
            const newEdge = { id: edgeId, source: sourceId, target: targetId };
            return reanchorEdges(nodes, [...prev, newEdge]);
        });
        setShowJoinDialog(false);
    }, [activeProject, nodes, onProjectSchemasUpdated]);

    const displayedEdges = useMemo(() => {
        if (!showEdges) return [];
        return edges.map(e => {
            const isSynthetic = e.id.startsWith('synth-');
            return {
                ...e,
                type: connectionLineType,
                style: isSynthetic
                    ? { stroke: '#eab308', strokeWidth: 2 }
                    : { stroke: '#94a3b8', strokeWidth: 1.5 },
                markerEnd: isSynthetic
                    ? { type: 'arrowclosed' as const, color: '#eab308' }
                    : 'crowsfoot-one',
                markerStart: isSynthetic
                    ? undefined
                    : 'crowsfoot-many',
            };
        });
    }, [edges, showEdges, connectionLineType]);

    const handleMappingChange = useCallback(async (updatedProject: ProjectData) => {
        try {
            await saveProject(updatedProject);
            onProjectSchemasUpdated?.(updatedProject);
        } catch (err) {
            console.error("Failed to save document model mapping", err);
        }
    }, [onProjectSchemasUpdated]);

    const handleTableSelect = (table: DbTable, schema: DbSchema) => {
        setSelectedTable(table);
        setSelectedSchema(schema);
    };

    const handleConnect = async (connection: DbConnection) => {
        try {
            setLoading(true);
            setError(null);
            const request: SchemaAnalysisRequest = {
                connection,
                includeTables: true,
                includeColumns: true,
                includeRelationships: true,
            };
            const result = await analyzeSchema(request);
            setDatabase(result);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Failed to analyze schema";
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = () => {
        setDatabase(null);
        setSelectedTable(null);
        setSelectedSchema(null);
        setError(null);
    };

    const handleSwitchConnection = async (connection: DbConnection) => {
        try {
            setLoading(true);
            setError(null);
            const request: SchemaAnalysisRequest = {
                connection,
                includeTables: true,
                includeColumns: true,
                includeRelationships: true,
            };
            const result = await analyzeSchema(request);
            setDatabase(result);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Failed to analyze schema";
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const [leftCollapsed, setLeftCollapsed] = useState(false);
    const [rightCollapsed, setRightCollapsed] = useState(false);

    const RIBBON_WIDTH = 32;

    const { isDragging: isFileDragging, position: fileW, splitterProps: fileDragBarProps } = useResizable({
        axis: "x", initial: 250, min: 50,
    });
    const { isDragging: isPluginDragging, position: pluginW, splitterProps: pluginDragBarProps } = useResizable({
        axis: "x", initial: 200, min: 50, reverse: true,
    });

    const leftPanelTitle = activeProject ? activeProject.name : "Database Schemas";
    const leftPanelBody = activeProject
        ? <ProjectPanel
            project={activeProject}
            onTableSelect={handleProjectTableSelect}
            onTableMappingRequest={viewMode === 'document'
                ? (t: string, s: string) => setPendingMappingTable({ tableName: t, schemaName: s })
                : undefined}
            visibleNodeIds={visibleNodeIds}
            onAddTables={() => setShowAddTablesModal(true)}
            mappedTableKeys={mappedTableKeys.size > 0 ? mappedTableKeys : undefined}
          />
        : <SchemasPanel
            onTableSelect={handleTableSelect}
            isConnected={!!database}
            database={database}
            onDisconnect={handleDisconnect}
            onSwitchConnection={handleSwitchConnection}
          />;

    const showModal = !database && !activeProject && showConnectionModal;

    return (
        <>
        <div className="relative flex-1 overflow-hidden flex">
            {showModal && (
                <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 rounded">
                    <div className="bg-white dark:bg-slate-700 rounded-lg shadow-2xl p-8 relative max-w-2xl w-full mx-4">
                        <button
                            onClick={() => setShowConnectionModal(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl leading-none w-8 h-8 flex items-center justify-center"
                        >
                            &#x2715;
                        </button>
                        <DatabaseConnectionForm onConnect={handleConnect} isLoading={loading} />
                        {error && (
                            <div className="mt-6 p-4 bg-red-900 border border-red-700 rounded-lg">
                                <p className="text-sm font-semibold mb-2 text-white">Connection Error</p>
                                <p className="text-sm text-red-100">{error}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="flex grow" style={{ opacity: showModal ? 0.3 : 1 }}>
                <div
                    className={cn("shrink-0 contents-top", isFileDragging && "dragging")}
                    style={{ width: leftCollapsed ? RIBBON_WIDTH : fileW }}
                >
                    <CollapsiblePanel
                        title={leftPanelTitle}
                        direction="left"
                        body={leftPanelBody}
                        ribbonLabel="Schema Tables"
                        collapsed={leftCollapsed}
                        onToggle={() => setLeftCollapsed(v => !v)}
                    />
                </div>
                {!leftCollapsed && <Splitter isDragging={isFileDragging} {...fileDragBarProps} />}

                <div className="flex grow">
                    <div className="grow flex flex-col">
                        <DiagramTabs
                            projects={openProjects}
                            activeProjectName={activeProjectName}
                            onProjectSelect={onProjectSelect}
                            onProjectClose={onProjectClose}
                            onProjectRename={onProjectRename}
                        />
                        <SchemaToolbar
                            hasNodes={nodes.length > 0}
                            showEdges={showEdges}
                            onToggleEdges={() => setShowEdges(v => !v)}
                            onLayout={setPendingLayout}
                            connectionLineType={connectionLineType}
                            onConnectionLineTypeChange={setConnectionLineType}
                            hasActiveProject={!!activeProject}
                            onOpenConfig={() => setShowConfigDialog(true)}
                            onGenerateXml={activeProject ? () => setShowGenerateModal(true) : undefined}
                            onGenerateJson={activeProject ? () => setShowGenerateJsonModal(true) : undefined}
                            mappingType={activeProject?.mapping?.mappingType ?? 'XML'}
                            onCreateJoin={activeProject ? () => setShowJoinDialog(true) : undefined}
                            onPrint={nodes.length > 0 ? handleExportPng : undefined}
                            viewMode={viewMode}
                            onViewModeChange={activeProject ? setViewMode : undefined}
                        />
                        <div className="flex-1 relative overflow-hidden">
                            <div className="absolute inset-0" ref={diagramRef}>
                                {/* SVG marker definitions must live inside diagramRef so html-to-image captures them */}
                                <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
                                    <defs>
                                        <marker id="crowsfoot-one" viewBox="-2 -2 8 20" refX="2" refY="8"
                                                markerWidth="4" markerHeight="16" orient="auto" overflow="visible">
                                            <line x1="2" y1="0" x2="2" y2="16" stroke="#94a3b8" strokeWidth="1.5"/>
                                        </marker>
                                        <marker id="crowsfoot-many" viewBox="-2 -2 14 20" refX="0" refY="8"
                                                markerWidth="10" markerHeight="16" orient="auto-start-reverse" overflow="visible">
                                            <path d="M 0 8 L 10 0 M 0 8 L 10 8 M 0 8 L 10 16"
                                                  stroke="#94a3b8" strokeWidth="1.5" fill="none"/>
                                        </marker>
                                    </defs>
                                </svg>
                                <ReactFlow
                                    nodes={nodes}
                                    edges={displayedEdges}
                                    onNodesChange={onNodesChange}
                                    onEdgesChange={onEdgesChange}
                                    nodeTypes={nodeTypes}
                                    colorMode={theme === 'dark' ? 'dark' : 'light'}
                                    fitView
                                    onNodeClick={handleNodeClick}
                                    onNodeContextMenu={handleNodeContextMenu}
                                    onEdgeContextMenu={handleEdgeContextMenu}
                                    onNodeDragStop={handleNodeDragStop}
                                    onPaneClick={() => { setContextMenu(null); setEdgeContextMenu(null); setHighlightedMappingTable(null); }}
                                    connectionLineType={connectionLineType}
                                    selectionKeyCode={null}
                                    selectNodesOnDrag={false}
                                >
                                    <Controls />
                                    <MiniMap />
                                    <Background />
                                    <LayoutApplier
                                        pendingLayout={pendingLayout}
                                        edges={edges}
                                        setNodes={setNodes}
                                        setEdges={setEdges}
                                        onDone={() => setPendingLayout(null)}
                                    />
                                </ReactFlow>
                            </div>
                        </div>
                    </div>
                    <>
                    {!rightCollapsed && <Splitter isDragging={isPluginDragging} {...pluginDragBarProps} />}
                    <div
                        className={cn("shrink-0 contents-top h-full overflow-hidden", isPluginDragging && "dragging")}
                        style={{ width: rightCollapsed ? RIBBON_WIDTH : pluginW }}
                    >
                        <CollapsiblePanel
                            title="Document Mapping"
                            direction="right"
                            ribbonLabel="Document Mapping"
                            collapsed={rightCollapsed}
                            onToggle={() => setRightCollapsed(v => !v)}
                            body={activeProject ? (
                                <DocumentModelView
                                    project={activeProject}
                                    pendingTable={pendingMappingTable}
                                    onPendingTableConsumed={() => setPendingMappingTable(null)}
                                    onMappingChange={handleMappingChange}
                                    highlightedTable={highlightedMappingTable}
                                    onHighlightedTableConsumed={() => setHighlightedMappingTable(null)}
                                />
                            ) : selectedTable ? (
                                <div className="h-full w-full bg-[#1b2a3b] dark:bg-slate-700 text-white overflow-auto">
                                    <div className="p-4 border-b border-[#0d1520] dark:border-slate-600">
                                        <h3 className="font-semibold text-lg">{selectedTable.tableName}</h3>
                                        <p className="text-sm text-gray-400">{selectedSchema?.name}</p>
                                    </div>
                                    {selectedTable.columns && Object.keys(selectedTable.columns).length > 0 && (
                                        <div className="p-4">
                                            <h4 className="font-semibold text-sm mb-3">
                                                Columns ({Object.keys(selectedTable.columns).length})
                                            </h4>
                                            <div className="space-y-2">
                                                {Object.values(selectedTable.columns).map((col) => (
                                                    <div key={col.name} className="text-xs bg-white/10 p-2 rounded">
                                                        <div className="font-mono font-semibold text-blue-300">{col.name}</div>
                                                        <div className="text-gray-300">{col.type}</div>
                                                        {col.columnType?.columnType && (
                                                            <div className="text-gray-400">{col.columnType.columnType}</div>
                                                        )}
                                                        <div className="text-gray-500 text-xs mt-1">
                                                            {col.primaryKey && <span className="bg-green-900 px-2 py-0.5 rounded mr-1">PK</span>}
                                                            {col.foreignKey && <span className="bg-yellow-900 px-2 py-0.5 rounded mr-1">FK</span>}
                                                            {col.sequence && <span className="bg-purple-900 px-2 py-0.5 rounded">AUTO</span>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="h-full w-full bg-[#1b2a3b] dark:bg-slate-700 text-gray-400 flex items-center justify-center flex-col gap-3">
                                    <p className="text-sm">Select a table to view details</p>
                                </div>
                            )}
                        />
                    </div>
                    </>
                </div>
            </div>
        </div>

        {showConfigDialog && activeProject && (
            <ConfigDialog
                projectName={activeProject.name}
                settings={activeProject.settings ?? {}}
                connectionLineType={connectionLineType}
                mappingType={activeProject.mapping?.mappingType ?? 'XML'}
                onSave={handleConfigSave}
                onClose={() => setShowConfigDialog(false)}
            />
        )}

        {showGenerateModal && activeProject?.id && (
            <GenerateXmlModal
                projectId={activeProject.id}
                projectName={activeProject.name}
                onClose={() => setShowGenerateModal(false)}
            />
        )}

        {showGenerateJsonModal && activeProject?.id && (
            <GenerateJsonModal
                projectId={activeProject.id}
                projectName={activeProject.name}
                onClose={() => setShowGenerateJsonModal(false)}
            />
        )}

        {showJoinDialog && activeProject && (
            <SyntheticJoinDialog
                project={activeProject}
                visibleNodeIds={nodes.map(n => n.id)}
                onConfirm={handleCreateJoin}
                onCancel={() => setShowJoinDialog(false)}
            />
        )}

        {showAddTablesModal && activeProject && (
            <AddTablesModal
                project={activeProject}
                onClose={() => setShowAddTablesModal(false)}
                onTablesAdded={(updatedProject: ProjectData) => {
                    setShowAddTablesModal(false);
                    onProjectSchemasUpdated?.(updatedProject);
                }}
            />
        )}

        {pendingCasingUpdate && ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-slate-700 rounded-lg shadow-2xl border border-gray-200 dark:border-slate-500 w-96 p-6">
                    <h3 className="text-gray-800 dark:text-white font-semibold text-base mb-2">Update Mapping Names?</h3>
                    <p className="text-gray-600 dark:text-gray-300 text-sm mb-1">
                        The default field casing has changed to{' '}
                        <span className="font-mono text-cyan-300">{pendingCasingUpdate.settings.defaultCasing?.toLowerCase()}</span>.
                    </p>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">
                        Would you like to regenerate all XML names in your document model mapping using the new casing?
                    </p>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => {
                                persistSettings(pendingCasingUpdate.settings, pendingCasingUpdate.lineType, false, pendingCasingUpdate.mappingType);
                                setPendingCasingUpdate(null);
                            }}
                            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-slate-600 rounded hover:bg-gray-200 dark:hover:bg-slate-500 transition"
                        >
                            Keep Existing Names
                        </button>
                        <button
                            onClick={() => {
                                persistSettings(pendingCasingUpdate.settings, pendingCasingUpdate.lineType, true, pendingCasingUpdate.mappingType);
                                setPendingCasingUpdate(null);
                            }}
                            className="px-4 py-2 text-sm text-white bg-cyan-600 rounded hover:bg-cyan-500 transition"
                        >
                            Update Mapping Names
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        )}

        {edgeContextMenu && ReactDOM.createPortal(
            <div
                style={{ position: "fixed", top: edgeContextMenu.y, left: edgeContextMenu.x, zIndex: 9999 }}
                className="bg-white dark:bg-slate-800 border border-yellow-500 dark:border-yellow-700 rounded shadow-lg py-1 min-w-[180px]"
                onMouseLeave={() => setEdgeContextMenu(null)}
            >
                <div className="px-3 py-1 text-xs text-yellow-600 dark:text-yellow-500 border-b border-gray-200 dark:border-slate-600 mb-1 flex items-center gap-1.5">
                    <span>⚡</span>
                    <span className="truncate max-w-[160px]">Synthetic Join</span>
                </div>
                <button
                    className="w-full text-left px-3 py-1.5 text-sm text-red-500 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-slate-600 hover:text-red-700 dark:hover:text-red-300 transition"
                    onClick={() => handleDeleteJoin(edgeContextMenu.edgeId)}
                >
                    Delete join
                </button>
            </div>,
            document.body
        )}

        {contextMenu && ReactDOM.createPortal(
            <div
                style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, zIndex: 9999 }}
                className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded shadow-lg py-1 min-w-[160px]"
                onMouseLeave={() => setContextMenu(null)}
            >
                <div className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-slate-600 mb-1 truncate max-w-[200px]">
                    {contextMenu.nodeId.substring(contextMenu.nodeId.indexOf(".") + 1)}
                </div>
                <button
                    className="w-full text-left px-3 py-1.5 text-sm text-red-500 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-slate-600 hover:text-red-700 dark:hover:text-red-300 transition"
                    onClick={() => handleRemoveNode(contextMenu.nodeId)}
                >
                    Remove from view
                </button>
            </div>,
            document.body
        )}
        </>
    );
};

export default SchemaView;
