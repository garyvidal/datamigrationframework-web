// DocumentModelView — Main XML document-mapping view; orchestrates MappingTableCards, NamespaceManager, and XmlPreview side-by-side.
import React, { useState, useCallback, useRef } from 'react';
import { FaFileCode, FaCode } from 'react-icons/fa';
import { SiJson } from 'react-icons/si';
import XmlPreview from './XmlPreview';
import JsonPreview from './JsonPreview';
import JsonDocumentModelView from './JsonDocumentModelView';
import type {
    ProjectData,
    ProjectMapping,
    XmlTableMapping,
    XmlColumnMapping,
    TableMappingType,
} from '@/services/ProjectService';

/** Returns true if there is an FK relationship or synthetic join between two tables (in either direction). */
function hasTableRelationship(
    project: ProjectData,
    a: { schema: string; table: string },
    b: { schema: string; table: string },
): boolean {
    const aRels = project.schemas[a.schema]?.tables?.[a.table]?.relationships ?? [];
    if (aRels.some(r => r.toTable === b.table)) return true;
    const bRels = project.schemas[b.schema]?.tables?.[b.table]?.relationships ?? [];
    if (bRels.some(r => r.toTable === a.table)) return true;
    const joins = project.syntheticJoins ?? [];
    return joins.some(j =>
        (j.sourceSchema === a.schema && j.sourceTable === a.table && j.targetSchema === b.schema && j.targetTable === b.table) ||
        (j.sourceSchema === b.schema && j.sourceTable === b.table && j.targetSchema === a.schema && j.targetTable === a.table),
    );
}
import { convertCaseFromSetting } from '@/lib/CaseConverter';
import { mapSqlTypeToXsd } from '@/lib/TypeMapper';
import MappingTableCard, { type RestorableColumn } from './MappingTableCard';
import NamespaceManager from './NamespaceManager';
import type { XmlNamespace } from '@/services/ProjectService';

interface DocumentModelViewProps {
    project: ProjectData;
    /** Table the user clicked in ProjectPanel (null when no pending action). */
    pendingTable: { tableName: string; schemaName: string } | null;
    onPendingTableConsumed: () => void;
    onMappingChange: (updatedProject: ProjectData) => void;
    /** Table selected by clicking a diagram node that is already mapped — scrolls to and highlights its card. */
    highlightedTable?: { tableName: string; schemaName: string } | null;
    onHighlightedTableConsumed?: () => void;
}

/** Build a full XmlTableMapping for a given table using the project's column data. */
function buildTableMapping(
    tableName: string,
    schemaName: string,
    project: ProjectData,
    mappingType: TableMappingType,
    parentRef?: string,
): XmlTableMapping {
    const namingCase = project.settings?.defaultCasing ?? 'SNAKE';
    const tableColumns = project.schemas[schemaName]?.tables?.[tableName]?.columns ?? {};

    const columns: XmlColumnMapping[] = Object.values(tableColumns).map(col => ({
        id: crypto.randomUUID(),
        sourceColumn: col.name,
        xmlName: convertCaseFromSetting(col.name, namingCase),
        xmlType: mapSqlTypeToXsd(col.type ?? ''),
        mappingType: 'Element',
    }));

    return {
        id: crypto.randomUUID(),
        sourceSchema: schemaName,
        sourceTable: tableName,
        xmlName: convertCaseFromSetting(tableName, namingCase),
        mappingType,
        wrapInParent: mappingType === 'Elements',
        wrapperElementName: mappingType === 'Elements' ? '' : undefined,
        parentRef,
        columns,
    };
}

function emptyMapping(): ProjectMapping {
    return { documentModel: { elements: [] } };
}

/** Build the full list of RestorableColumn for a table mapping from project schema data. */
function getAvailableColumns(
    mapping: XmlTableMapping,
    project: ProjectData,
): RestorableColumn[] {
    const namingCase = project.settings?.defaultCasing ?? 'SNAKE';
    const tableColumns = project.schemas[mapping.sourceSchema]?.tables?.[mapping.sourceTable]?.columns ?? {};
    return Object.values(tableColumns).map(col => ({
        name: col.name,
        xmlName: convertCaseFromSetting(col.name, namingCase),
        xmlType: mapSqlTypeToXsd(col.type ?? ''),
    }));
}

type PopoverStep = 'type' | 'inline-parent';

const DND_CARD_KEY = 'application/x-card-index';

export default function DocumentModelView({
    project,
    pendingTable,
    onPendingTableConsumed,
    onMappingChange,
    highlightedTable,
    onHighlightedTableConsumed,
}: DocumentModelViewProps) {
    const mapping = project.mapping ?? emptyMapping();
    const { root, elements } = mapping.documentModel;

    const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    // Drag-and-drop state for reordering normalElements
    const [dragCardIdx, setDragCardIdx] = useState<number | null>(null);
    // dropLineIdx = insert-before index (0..normalElements.length); null = no active drop
    const [dropLineIdx, setDropLineIdx] = useState<number | null>(null);

    // Scroll to and briefly highlight a card when a mapped node is clicked on the diagram.
    React.useEffect(() => {
        if (!highlightedTable) return;
        const key = `${highlightedTable.schemaName}.${highlightedTable.tableName}`;
        const el = cardRefs.current.get(key);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        onHighlightedTableConsumed?.();
    }, [highlightedTable]);

    const mappingType = project.mapping?.mappingType ?? 'XML';
    const showBothTabs = mappingType === 'BOTH';
    const showJsonOnly = mappingType === 'JSON';
    const [activeTab, setActiveTab] = useState<'xml' | 'json'>(showJsonOnly ? 'json' : 'xml');

    // Sync activeTab when mappingType changes (e.g. project switch or settings change).
    React.useEffect(() => {
        if (showJsonOnly) setActiveTab('json');
        else if (!showBothTabs) setActiveTab('xml');
    }, [showJsonOnly, showBothTabs]);

    const [showPreview, setShowPreview] = useState(false);
    const [showPopover, setShowPopover] = useState(false);
    const [popoverStep, setPopoverStep] = useState<PopoverStep>('type');
    const [inlineParentRef, setInlineParentRef] = useState<string>('');
    // Show the popover whenever a new pending table arrives.
    React.useEffect(() => {
        if (pendingTable) {
            setShowPopover(true);
            setPopoverStep('type');
            setInlineParentRef('');
        }
    }, [pendingTable]);

    // Options for inline-element parent selection: root + non-CUSTOM elements, with relationship check.
    type ParentOption = { id: string; xmlName: string; label: string; sourceSchema: string; sourceTable: string; hasRelationship: boolean };
    const parentOptions: ParentOption[] = [
        ...(root?.id ? [{
            id: root.id,
            xmlName: root.xmlName,
            label: `Root: <${root.xmlName}>`,
            sourceSchema: root.sourceSchema,
            sourceTable: root.sourceTable,
            hasRelationship: pendingTable
                ? hasTableRelationship(project,
                    { schema: pendingTable.schemaName, table: pendingTable.tableName },
                    { schema: root.sourceSchema,       table: root.sourceTable })
                : false,
        }] : []),
        ...(elements ?? [])
            .filter(e => e.mappingType === 'Elements' || e.mappingType === 'InlineElement')
            .filter(e => !!e.id)
            .map(e => ({
                id: e.id!,
                xmlName: e.xmlName,
                label: `Element: <${e.xmlName}>`,
                sourceSchema: e.sourceSchema,
                sourceTable: e.sourceTable,
                hasRelationship: pendingTable
                    ? hasTableRelationship(project,
                        { schema: pendingTable.schemaName, table: pendingTable.tableName },
                        { schema: e.sourceSchema,          table: e.sourceTable })
                    : false,
            })),
    ];
    const validParentOptions = parentOptions.filter(p => p.hasRelationship);

    const handleAddMapping = useCallback((type: TableMappingType, parentRef?: string) => {
        if (!pendingTable) return;
        const { tableName, schemaName } = pendingTable;
        const newMap = buildTableMapping(tableName, schemaName, project, type, parentRef);

        let updatedDocModel: ProjectMapping['documentModel'];
        if (type === 'RootElement') {
            updatedDocModel = { root: newMap, elements: elements ?? [] };
        } else {
            updatedDocModel = { root, elements: [...(elements ?? []), newMap] };
        }

        onMappingChange({ ...project, mapping: { ...project.mapping, documentModel: updatedDocModel } });
        setShowPopover(false);
        setPopoverStep('type');
        onPendingTableConsumed();
    }, [pendingTable, project, root, elements, onMappingChange, onPendingTableConsumed]);

    const handleDismissPopover = () => {
        setShowPopover(false);
        setPopoverStep('type');
        onPendingTableConsumed();
    };

    const handleInlineElementClick = () => {
        if (validParentOptions.length === 0) return;
        setInlineParentRef(validParentOptions[0].id);
        setPopoverStep('inline-parent');
    };

    const handleCardChange = useCallback((updated: XmlTableMapping) => {
        let updatedDocModel: ProjectMapping['documentModel'];
        if (updated.mappingType === 'RootElement' && root?.sourceTable === updated.sourceTable && root?.sourceSchema === updated.sourceSchema) {
            updatedDocModel = { root: updated, elements: elements ?? [] };
        } else {
            updatedDocModel = {
                root,
                elements: (elements ?? []).map(e =>
                    e.sourceTable === updated.sourceTable && e.sourceSchema === updated.sourceSchema && e.mappingType === updated.mappingType
                        ? updated : e
                ),
            };
        }
        onMappingChange({ ...project, mapping: { ...project.mapping, documentModel: updatedDocModel } });
    }, [project, root, elements, onMappingChange]);

    const handleRemoveRoot = useCallback(() => {
        onMappingChange({
            ...project,
            mapping: { ...project.mapping, documentModel: { root: undefined, elements: elements ?? [] } },
        });
    }, [project, elements, onMappingChange]);

    const handleNamespacesChange = useCallback((namespaces: XmlNamespace[]) => {
        onMappingChange({ ...project, mapping: { ...project.mapping, namespaces } });
    }, [project, onMappingChange]);

    const handleRemoveElement = useCallback((index: number) => {
        const updated = (elements ?? []).filter((_, i) => i !== index);
        onMappingChange({
            ...project,
            mapping: { ...project.mapping, documentModel: { root, elements: updated } },
        });
    }, [project, root, elements, onMappingChange]);

    /** Returns false if dropping dragIdx before targetIdx would violate constraints. */
    const isCardDropValid = useCallback((dragIdx: number, targetIdx: number, normals: XmlTableMapping[]): boolean => {
        // No-op positions
        if (targetIdx === dragIdx || targetIdx === dragIdx + 1) return false;
        const el = normals[dragIdx];
        // InlineElement cannot go before its parent
        if (el.mappingType === 'InlineElement' && el.parentRef) {
            const parentIdx = normals.findIndex(e => e.id === el.parentRef);
            if (parentIdx >= 0 && targetIdx <= parentIdx) return false;
        }
        return true;
    }, []);

    const handleCardDrop = useCallback((dragIdx: number, targetIdx: number) => {
        const normals = (elements ?? []).filter(e => e.mappingType !== 'CUSTOM');
        const customs = (elements ?? []).filter(e => e.mappingType === 'CUSTOM');
        if (!isCardDropValid(dragIdx, targetIdx, normals)) return;

        const newList = [...normals];
        const [dragged] = newList.splice(dragIdx, 1);
        const insertAt = targetIdx > dragIdx ? targetIdx - 1 : targetIdx;
        newList.splice(insertAt, 0, dragged);

        onMappingChange({
            ...project,
            mapping: { ...project.mapping, documentModel: { root, elements: [...newList, ...customs] } },
        });
    }, [elements, project, root, onMappingChange, isCardDropValid]);

    const resolveParentXmlName = (parentRef?: string): string | undefined => {
        if (!parentRef) return undefined;
        if (root?.id === parentRef) return root.xmlName;
        return elements?.find(e => e.id === parentRef)?.xmlName;
    };

    const hasMapping = root || (elements && elements.length > 0);
    const normalElements = (elements ?? []).filter(e => e.mappingType !== 'CUSTOM');
    const customElements = (elements ?? []).filter(e => e.mappingType === 'CUSTOM');

    const elementCountLabel = [
        root ? '1 root' : '',
        normalElements.length > 0 ? `${normalElements.length} element${normalElements.length !== 1 ? 's' : ''}` : '',
        customElements.length > 0 ? `${customElements.length} custom` : '',
    ].filter(Boolean).join(', ');

    // When the JSON tab is active, delegate rendering to JsonDocumentModelView
    if ((showJsonOnly || showBothTabs) && activeTab === 'json') {
        return (
            <div className="flex flex-col h-full bg-white dark:bg-slate-800 text-gray-800 dark:text-white relative overflow-hidden">
                {/* Header bar with tabs */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-[#1b2a3b] shrink-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        <FaFileCode size={14} className="text-cyan-500 dark:text-cyan-400" />
                        Document Model
                        <span className="text-xs text-gray-600 dark:text-gray-300">— {project.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {showBothTabs && (
                            <div className="flex items-center gap-1 bg-gray-200 dark:bg-slate-900 rounded p-0.5">
                                <button onClick={() => setActiveTab('xml')}
                                    className="px-3 py-1 text-xs rounded text-gray-700 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white transition">
                                    XML
                                </button>
                                <button className="px-3 py-1 text-xs rounded bg-white text-gray-800 dark:bg-slate-600 dark:text-white">
                                    JSON
                                </button>
                            </div>
                        )}
                        {!showBothTabs && (
                            <span className="text-xs text-gray-600 dark:text-gray-300 font-mono">JSON</span>
                        )}
                        <button
                            onClick={() => setShowPreview(true)}
                            title="Preview generated JSON"
                            className="flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:border-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:border-slate-600 dark:text-gray-300 dark:hover:border-amber-500 dark:hover:text-amber-300 dark:hover:bg-amber-900/20 transition"
                        >
                            <SiJson size={10} />
                            Preview JSON
                        </button>
                    </div>
                </div>
                <JsonDocumentModelView
                    project={project}
                    pendingTable={pendingTable}
                    onPendingTableConsumed={onPendingTableConsumed}
                    onMappingChange={onMappingChange}
                    highlightedTable={highlightedTable}
                    onHighlightedTableConsumed={onHighlightedTableConsumed}
                />
                {showPreview && (
                    <JsonPreview mapping={mapping} onClose={() => setShowPreview(false)} />
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-800 text-gray-800 dark:text-white relative overflow-hidden">
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-[#1b2a3b] shrink-0">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <FaFileCode size={14} className="text-cyan-500 dark:text-cyan-400" />
                    Document Model
                    <span className="text-xs text-gray-600 dark:text-gray-500">— {project.name}</span>
                </div>
                <div className="flex items-center gap-2">
                    {showBothTabs && (
                        <div className="flex items-center gap-1 bg-gray-200 dark:bg-slate-900 rounded p-0.5">
                            <button className="px-3 py-1 text-xs rounded bg-white text-gray-800 dark:bg-slate-600 dark:text-white">
                                XML
                            </button>
                            <button onClick={() => setActiveTab('json')}
                                className="px-3 py-1 text-xs rounded text-gray-700 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white transition">
                                JSON
                            </button>
                        </div>
                    )}
                    {hasMapping && (
                        <span className="text-xs text-gray-600 dark:text-gray-400">{elementCountLabel}</span>
                    )}
                    {hasMapping && (
                        <button
                            onClick={() => setShowPreview(true)}
                            title="Preview generated XML"
                            className="flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:border-cyan-500 hover:text-cyan-600 hover:bg-cyan-50 dark:border-slate-600 dark:text-gray-300 dark:hover:border-cyan-500 dark:hover:text-cyan-300 dark:hover:bg-cyan-900/20 transition"
                        >
                            <FaCode size={10} />
                            Preview XML
                        </button>
                    )}
                </div>
            </div>

            {/* XML Preview overlay */}
            {showPreview && (
                <XmlPreview mapping={mapping} onClose={() => setShowPreview(false)} />
            )}

            {/* Popover: choose mapping type */}
            {showPopover && pendingTable && (
                <div className="absolute inset-0 bg-black/50 flex items-start justify-center pt-24 z-20"
                    onClick={handleDismissPopover}
                >
                    <div
                        className="bg-white dark:bg-slate-700 rounded-lg shadow-2xl border border-gray-200 dark:border-slate-500 w-80 p-4"
                        onClick={e => e.stopPropagation()}
                    >
                        {popoverStep === 'type' ? (
                            <>
                                <p className="text-sm font-semibold text-gray-800 dark:text-white mb-1">
                                    Add <span className="text-cyan-600 dark:text-cyan-300 font-mono">{pendingTable.schemaName}.{pendingTable.tableName}</span>
                                </p>
                                <p className="text-xs text-gray-700 dark:text-gray-200 mb-4">How should this table appear in the XML document model?</p>
                                <div className="space-y-2">
                                    <button
                                        onClick={() => handleAddMapping('RootElement')}
                                        disabled={!!root}
                                        className="w-full text-left px-4 py-3 rounded border transition
                                            enabled:border-cyan-500 enabled:bg-cyan-50 enabled:hover:bg-cyan-100 enabled:text-gray-800
                                            dark:enabled:border-cyan-600 dark:enabled:bg-cyan-900/30 dark:enabled:hover:bg-cyan-900/60 dark:enabled:text-white
                                            disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed
                                            dark:disabled:border-slate-600 dark:disabled:bg-slate-800 dark:disabled:text-gray-600"
                                    >
                                        <div className="font-semibold text-sm">Root Element</div>
                                        <div className="text-xs mt-0.5 text-gray-400 dark:text-gray-400">
                                            {root
                                                ? `Root already set to <${root.xmlName}>`
                                                : 'Creates the top-level XML element for each row'}
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => handleAddMapping('Elements')}
                                        className="w-full text-left px-4 py-3 rounded border border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100 text-gray-800 dark:border-slate-500 dark:bg-slate-800 dark:hover:border-slate-400 dark:hover:bg-slate-700 dark:text-white transition"
                                    >
                                        <div className="font-semibold text-sm">Elements</div>
                                        <div className="text-xs mt-0.5 text-gray-400">Creates a nested sequence of child elements</div>
                                    </button>
                                    <button
                                        onClick={handleInlineElementClick}
                                        disabled={validParentOptions.length === 0}
                                        className="w-full text-left px-4 py-3 rounded border transition
                                            enabled:border-violet-400 enabled:bg-violet-50 enabled:hover:bg-violet-100 enabled:text-gray-800
                                            dark:enabled:border-violet-600 dark:enabled:bg-violet-900/30 dark:enabled:hover:bg-violet-900/60 dark:enabled:text-white
                                            disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed
                                            dark:disabled:border-slate-600 dark:disabled:bg-slate-800 dark:disabled:text-gray-600"
                                    >
                                        <div className="font-semibold text-sm">Inline Element</div>
                                        <div className="text-xs mt-0.5 text-gray-400">
                                            {parentOptions.length === 0
                                                ? 'Add a Root or Elements mapping first'
                                                : validParentOptions.length === 0
                                                    ? 'No related tables mapped — create a join first'
                                                    : 'Nests this table inside a related element'}
                                        </div>
                                    </button>
                                </div>
                                <button
                                    onClick={handleDismissPopover}
                                    className="mt-3 w-full text-center text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition"
                                >
                                    Cancel
                                </button>
                            </>
                        ) : (
                            <>
                                <p className="text-sm font-semibold text-gray-800 dark:text-white mb-1">Select Parent</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                    <span className="text-violet-600 dark:text-violet-300 font-mono">{pendingTable.schemaName}.{pendingTable.tableName}</span> will be nested inside:
                                </p>
                                <div className="space-y-1 mb-4">
                                    {parentOptions.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => p.hasRelationship && setInlineParentRef(p.id)}
                                            disabled={!p.hasRelationship}
                                            title={!p.hasRelationship ? 'No table relationship — create a synthetic join first' : undefined}
                                            className={`w-full text-left px-3 py-2 rounded border text-sm font-mono transition ${
                                                !p.hasRelationship
                                                    ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed dark:border-slate-700 dark:bg-slate-800/40 dark:text-gray-600'
                                                    : inlineParentRef === p.id
                                                        ? 'border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-500 dark:bg-violet-900/40 dark:text-violet-200'
                                                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300 dark:hover:border-slate-400'
                                            }`}
                                        >
                                            <span>{p.label}</span>
                                            {!p.hasRelationship && (
                                                <span className="ml-2 text-xs text-gray-400 dark:text-gray-600 font-sans">no relationship</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPopoverStep('type')}
                                        className="flex-1 px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-500 hover:text-gray-800 hover:border-gray-400 dark:border-slate-600 dark:text-gray-400 dark:hover:text-white dark:hover:border-slate-400 transition"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={() => handleAddMapping('InlineElement', inlineParentRef)}
                                        disabled={!inlineParentRef || !validParentOptions.some(p => p.id === inlineParentRef)}
                                        className="flex-1 px-3 py-1.5 text-xs font-semibold rounded transition
                                            enabled:bg-violet-600 enabled:hover:bg-violet-500 enabled:text-white
                                            dark:enabled:bg-violet-700 dark:enabled:hover:bg-violet-600
                                            disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed
                                            dark:disabled:bg-slate-700 dark:disabled:text-gray-600"
                                    >
                                        Add Inline
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Main content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Namespace manager — always visible in XML mode */}
                <NamespaceManager
                    namespaces={mapping.namespaces ?? []}
                    onChange={handleNamespacesChange}
                />

                {!hasMapping && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
                        <FaFileCode size={32} className="opacity-30" />
                        <p className="text-sm">Click a table in the left panel to start mapping</p>
                        <p className="text-xs text-gray-600">You'll be asked whether it's a Root Element, Elements, or Inline Element</p>
                    </div>
                )}

                {/* Root element card */}
                {root && (() => {
                    const key = `${root.sourceSchema}.${root.sourceTable}`;
                    const isHighlighted = highlightedTable
                        ? highlightedTable.schemaName === root.sourceSchema && highlightedTable.tableName === root.sourceTable
                        : false;
                    return (
                        <div>
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 px-1">Root Element</div>
                            <div
                                ref={el => el ? cardRefs.current.set(key, el) : cardRefs.current.delete(key)}
                                className={isHighlighted ? 'rounded ring-2 ring-cyan-400 ring-offset-1 ring-offset-white dark:ring-offset-slate-800' : ''}
                            >
                                <MappingTableCard
                                    mapping={root}
                                    onChange={handleCardChange}
                                    onRemove={handleRemoveRoot}
                                    namespaces={mapping.namespaces ?? []}
                                    availableColumns={getAvailableColumns(root, project)}
                                />
                            </div>
                        </div>
                    );
                })()}

                {/* Elements + Inline Elements */}
                {normalElements.length > 0 && (
                    <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 px-1 mt-4">Elements</div>
                        <div
                            className="space-y-0"
                            onDragOver={e => { if (e.dataTransfer.types.includes(DND_CARD_KEY)) e.preventDefault(); }}
                            onDrop={e => {
                                // Drop on the container itself (below last card)
                                const src = e.dataTransfer.getData(DND_CARD_KEY);
                                if (src === '') return;
                                e.preventDefault();
                                handleCardDrop(Number(src), normalElements.length);
                                setDragCardIdx(null);
                                setDropLineIdx(null);
                            }}
                            onDragLeave={e => {
                                const target = e.currentTarget as HTMLElement;
                                if (!target.contains(e.relatedTarget as Node)) setDropLineIdx(null);
                            }}
                        >
                            {normalElements.map((el, i) => {
                                const fullIndex = (elements ?? []).indexOf(el);
                                const key = `${el.sourceSchema}.${el.sourceTable}`;
                                const isHighlighted = highlightedTable
                                    ? highlightedTable.schemaName === el.sourceSchema && highlightedTable.tableName === el.sourceTable
                                    : false;
                                const isBeingDragged = dragCardIdx === i;
                                const showLineBefore = dropLineIdx === i && dragCardIdx !== null && isCardDropValid(dragCardIdx, i, normalElements);
                                return (
                                    <div key={`${el.id ?? el.sourceTable}.${i}`}>
                                        {/* Drop indicator line before this card */}
                                        <div className={`h-0.5 mx-1 rounded transition-all ${showLineBefore ? 'bg-cyan-400 mb-1' : 'bg-transparent mb-0'}`} />
                                        <div
                                            ref={div => div ? cardRefs.current.set(key, div) : cardRefs.current.delete(key)}
                                            className={[
                                                'mb-2 flex items-stretch group/card',
                                                isBeingDragged ? 'opacity-40' : '',
                                                isHighlighted ? 'rounded ring-2 ring-cyan-400 ring-offset-1 ring-offset-white dark:ring-offset-slate-800' : '',
                                            ].filter(Boolean).join(' ')}
                                            onDragOver={e => {
                                                if (!e.dataTransfer.types.includes(DND_CARD_KEY)) return;
                                                e.preventDefault();
                                                e.stopPropagation();
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const midY = rect.top + rect.height / 2;
                                                setDropLineIdx(e.clientY < midY ? i : i + 1);
                                            }}
                                            onDrop={e => {
                                                const src = e.dataTransfer.getData(DND_CARD_KEY);
                                                if (src === '') return;
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleCardDrop(Number(src), dropLineIdx ?? i);
                                                setDragCardIdx(null);
                                                setDropLineIdx(null);
                                            }}
                                        >
                                            {/* Drag handle */}
                                            <div
                                                draggable
                                                title="Drag to reorder"
                                                className="flex items-center justify-center w-4 shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 dark:text-slate-600 dark:hover:text-slate-400 opacity-0 group-hover/card:opacity-100 transition-opacity select-none"
                                                onDragStart={e => {
                                                    setDragCardIdx(i);
                                                    setDropLineIdx(null);
                                                    e.dataTransfer.setData(DND_CARD_KEY, String(i));
                                                    e.dataTransfer.effectAllowed = 'move';
                                                }}
                                                onDragEnd={() => {
                                                    setDragCardIdx(null);
                                                    setDropLineIdx(null);
                                                }}
                                            >
                                                ⠿
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <MappingTableCard
                                                    mapping={el}
                                                    onChange={handleCardChange}
                                                    onRemove={() => handleRemoveElement(fullIndex)}
                                                    parentXmlName={el.mappingType === 'InlineElement' ? resolveParentXmlName(el.parentRef) : undefined}
                                                    namespaces={mapping.namespaces ?? []}
                                                    availableColumns={getAvailableColumns(el, project)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {/* Drop indicator line after the last card */}
                            <div className={`h-0.5 mx-1 rounded transition-all ${
                                dropLineIdx === normalElements.length && dragCardIdx !== null && isCardDropValid(dragCardIdx, normalElements.length, normalElements)
                                    ? 'bg-cyan-400' : 'bg-transparent'
                            }`} />
                        </div>
                    </div>
                )}

                {/* Custom elements */}
                {customElements.length > 0 && (
                    <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 px-1 mt-4">Custom Elements</div>
                        <div className="space-y-2">
                            {customElements.map((el, i) => {
                                const fullIndex = (elements ?? []).indexOf(el);
                                return (
                                    <MappingTableCard
                                        key={`custom.${el.xmlName}.${i}`}
                                        mapping={el}
                                        onChange={handleCardChange}
                                        onRemove={() => handleRemoveElement(fullIndex)}
                                        namespaces={mapping.namespaces ?? []}
                                        availableColumns={getAvailableColumns(el, project)}
                                    />
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
