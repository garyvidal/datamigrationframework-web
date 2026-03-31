// JsonDocumentModelView — Main JSON document-mapping view; orchestrates JsonMappingTableCards and JsonPreview side-by-side.
import React, { useState, useCallback, useRef } from 'react';
import { FaFileCode } from 'react-icons/fa';
import type {
    ProjectData,
    ProjectMapping,
    JsonTableMapping,
    JsonColumnMapping,
    JsonTableMappingType,
} from '@/services/ProjectService';
import { convertCaseFromSetting } from '@/lib/CaseConverter';
import { mapSqlTypeToJson } from '@/lib/TypeMapper';
import JsonMappingTableCard, { type RestorableJsonColumn } from './JsonMappingTableCard';

/** Returns true if there is an FK relationship or synthetic join between two tables (in either direction). */
function hasTableRelationship(
    project: ProjectData,
    a: { schema: string; table: string },
    b: { schema: string; table: string },
): boolean {
    const aRels = project.schemas[a.schema]?.tables?.[a.table]?.relationships ?? [];
    if (aRels.some(r => r.toTable === `${b.schema}.${b.table}`)) return true;
    const bRels = project.schemas[b.schema]?.tables?.[b.table]?.relationships ?? [];
    if (bRels.some(r => r.toTable === `${a.schema}.${a.table}`)) return true;
    const joins = project.syntheticJoins ?? [];
    return joins.some(j =>
        (j.sourceSchema === a.schema && j.sourceTable === a.table && j.targetSchema === b.schema && j.targetTable === b.table) ||
        (j.sourceSchema === b.schema && j.sourceTable === b.table && j.targetSchema === a.schema && j.targetTable === a.table),
    );
}

function buildJsonTableMapping(
    tableName: string,
    schemaName: string,
    project: ProjectData,
    mappingType: JsonTableMappingType,
    parentRef?: string,
    joinColumn?: string,
): JsonTableMapping {
    const namingCase = project.settings?.defaultCasing ?? 'SNAKE';
    const tableColumns = project.schemas[schemaName]?.tables?.[tableName]?.columns ?? {};

    const columns: JsonColumnMapping[] = Object.values(tableColumns).map(col => ({
        id: crypto.randomUUID(),
        sourceColumn: col.name,
        jsonKey: convertCaseFromSetting(col.name, namingCase),
        jsonType: mapSqlTypeToJson(col.type ?? ''),
        mappingType: 'Property' as const,
    }));

    return {
        id: crypto.randomUUID(),
        sourceSchema: schemaName,
        sourceTable: tableName,
        jsonName: convertCaseFromSetting(tableName, namingCase),
        mappingType,
        parentRef,
        joinColumn: joinColumn || undefined,
        columns,
    };
}

function getMultiFkColumns(
    project: ProjectData,
    parentSchema: string, parentTable: string,
    childSchema: string,  childTable: string,
): string[] {
    const childFullName = `${childSchema}.${childTable}`;
    const parentFullName = `${parentSchema}.${parentTable}`;
    const parentRels = project.schemas[parentSchema]?.tables?.[parentTable]?.relationships ?? [];
    const childRels  = project.schemas[childSchema]?.tables?.[childTable]?.relationships ?? [];
    const cols: string[] = [];
    for (const r of parentRels) {
        if (r.toTable === childFullName || r.toTable === childTable) cols.push(r.fromColumn);
    }
    for (const r of childRels) {
        if (r.toTable === parentFullName || r.toTable === parentTable) cols.push(r.fromColumn);
    }
    return cols;
}

function emptyJsonDocumentModel(): NonNullable<ProjectMapping['jsonDocumentModel']> {
    return { elements: [] };
}

/** Build the full list of RestorableJsonColumn for a table mapping from project schema data. */
function getAvailableJsonColumns(
    mapping: JsonTableMapping,
    project: ProjectData,
): RestorableJsonColumn[] {
    const namingCase = project.settings?.defaultCasing ?? 'SNAKE';
    const tableColumns = project.schemas[mapping.sourceSchema]?.tables?.[mapping.sourceTable]?.columns ?? {};
    return Object.values(tableColumns).map(col => ({
        name: col.name,
        jsonKey: convertCaseFromSetting(col.name, namingCase),
        jsonType: mapSqlTypeToJson(col.type ?? ''),
    }));
}

type PopoverStep = 'type' | 'inline-parent' | 'fk-picker';

interface JsonDocumentModelViewProps {
    project: ProjectData;
    pendingTable: { tableName: string; schemaName: string } | null;
    onPendingTableConsumed: () => void;
    onMappingChange: (updatedProject: ProjectData) => void;
    highlightedTable?: { tableName: string; schemaName: string } | null;
    onHighlightedTableConsumed?: () => void;
}

export default function JsonDocumentModelView({
    project,
    pendingTable,
    onPendingTableConsumed,
    onMappingChange,
    highlightedTable,
    onHighlightedTableConsumed,
}: JsonDocumentModelViewProps) {
    const jsonModel = project.mapping?.jsonDocumentModel ?? emptyJsonDocumentModel();
    const { root, elements } = jsonModel;

    const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    React.useEffect(() => {
        if (!highlightedTable) return;
        const key = `${highlightedTable.schemaName}.${highlightedTable.tableName}`;
        cardRefs.current.get(key)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        onHighlightedTableConsumed?.();
    }, [highlightedTable]);

    const [showPopover, setShowPopover] = useState(false);
    const [popoverStep, setPopoverStep] = useState<PopoverStep>('type');
    const [inlineParentRef, setInlineParentRef] = useState<string>('');
    const [selectedJoinColumn, setSelectedJoinColumn] = useState<string>('');

    React.useEffect(() => {
        if (pendingTable) {
            setShowPopover(true);
            setPopoverStep('type');
            setInlineParentRef('');
            setSelectedJoinColumn('');
        }
    }, [pendingTable]);

    type ParentOption = { id: string; jsonName: string; label: string; sourceSchema: string; sourceTable: string; hasRelationship: boolean };
    const parentOptions: ParentOption[] = [
        ...(root?.id ? [{
            id: root.id,
            jsonName: root.jsonName,
            label: `Root: "${root.jsonName}"`,
            sourceSchema: root.sourceSchema,
            sourceTable: root.sourceTable,
            hasRelationship: pendingTable
                ? hasTableRelationship(project,
                    { schema: pendingTable.schemaName, table: pendingTable.tableName },
                    { schema: root.sourceSchema, table: root.sourceTable })
                : false,
        }] : []),
        ...(elements ?? [])
            .filter(e => e.mappingType === 'Array' || e.mappingType === 'InlineObject')
            .filter(e => !!e.id)
            .map(e => ({
                id: e.id!,
                jsonName: e.jsonName,
                label: `${e.mappingType === 'Array' ? 'Array' : 'Object'}: "${e.jsonName}"`,
                sourceSchema: e.sourceSchema,
                sourceTable: e.sourceTable,
                hasRelationship: pendingTable
                    ? hasTableRelationship(project,
                        { schema: pendingTable.schemaName, table: pendingTable.tableName },
                        { schema: e.sourceSchema, table: e.sourceTable })
                    : false,
            })),
    ];
    const validParentOptions = parentOptions.filter(p => p.hasRelationship);

    const updateJsonModel = (newRoot: JsonTableMapping | undefined, newElements: JsonTableMapping[]) => {
        const updatedMapping = {
            ...(project.mapping ?? { documentModel: { elements: [] } }),
            jsonDocumentModel: { root: newRoot, elements: newElements },
        };
        onMappingChange({ ...project, mapping: updatedMapping });
    };

    const handleAddMapping = useCallback((type: JsonTableMappingType, parentRef?: string, joinColumn?: string) => {
        if (!pendingTable) return;
        const { tableName, schemaName } = pendingTable;
        const newMap = buildJsonTableMapping(tableName, schemaName, project, type, parentRef, joinColumn);

        if (type === 'RootObject') {
            updateJsonModel(newMap, elements ?? []);
        } else {
            updateJsonModel(root, [...(elements ?? []), newMap]);
        }
        setShowPopover(false);
        setPopoverStep('type');
        onPendingTableConsumed();
    }, [pendingTable, project, root, elements]);

    const handleDismissPopover = () => {
        setShowPopover(false);
        setPopoverStep('type');
        setSelectedJoinColumn('');
        onPendingTableConsumed();
    };

    const handleCardChange = useCallback((updated: JsonTableMapping) => {
        if (updated.mappingType === 'RootObject' && root?.id === updated.id) {
            updateJsonModel(updated, elements ?? []);
        } else {
            updateJsonModel(root, (elements ?? []).map(e => e.id === updated.id ? updated : e));
        }
    }, [project, root, elements]);

    const handleConfirmParent = useCallback((jsonMappingType: JsonTableMappingType) => {
        if (!pendingTable || !inlineParentRef) return;
        const parent = parentOptions.find(p => p.id === inlineParentRef);
        if (!parent) return;
        const fkCols = getMultiFkColumns(project,
            parent.sourceSchema, parent.sourceTable,
            pendingTable.schemaName, pendingTable.tableName);
        if (fkCols.length > 1) {
            setSelectedJoinColumn(fkCols[0]);
            setPopoverStep('fk-picker');
        } else {
            handleAddMapping(jsonMappingType, inlineParentRef, fkCols[0] || undefined);
        }
    }, [pendingTable, inlineParentRef, parentOptions, project, handleAddMapping]);

    const handleRemoveRoot = useCallback(() => {
        updateJsonModel(undefined, elements ?? []);
    }, [project, elements]);

    const handleRemoveElement = useCallback((index: number) => {
        updateJsonModel(root, (elements ?? []).filter((_, i) => i !== index));
    }, [project, root, elements]);

    const resolveParentJsonName = (parentRef?: string): string | undefined => {
        if (!parentRef) return undefined;
        if (root?.id === parentRef) return root.jsonName;
        return elements?.find(e => e.id === parentRef)?.jsonName;
    };

    const hasMapping = root || (elements && elements.length > 0);
    const normalElements = (elements ?? []).filter(e => e.mappingType !== 'CUSTOM' as string);

    return (
        <div className="flex flex-col h-full relative overflow-hidden">
            {/* Popover */}
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
                                <p className="text-xs text-gray-500 dark:text-gray-300 mb-4">How should this table appear in the JSON document model?</p>
                                <div className="space-y-2">
                                    <button
                                        onClick={() => handleAddMapping('RootObject')}
                                        disabled={!!root}
                                        className="w-full text-left px-4 py-3 rounded border transition
                                            enabled:border-cyan-500 enabled:bg-cyan-50 enabled:hover:bg-cyan-100 enabled:text-gray-800
                                            dark:enabled:border-cyan-600 dark:enabled:bg-cyan-900/30 dark:enabled:hover:bg-cyan-900/60 dark:enabled:text-white
                                            disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed
                                            dark:disabled:border-slate-600 dark:disabled:bg-slate-800 dark:disabled:text-gray-600"
                                    >
                                        <div className="font-semibold text-sm">Root Object</div>
                                        <div className="text-xs mt-0.5 text-gray-500 dark:text-gray-300">
                                            {root ? `Root already set to "${root.jsonName}"` : 'Creates the top-level JSON object for each row'}
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => handleAddMapping('Array')}
                                        className="w-full text-left px-4 py-3 rounded border border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100 text-gray-800 dark:border-slate-500 dark:bg-slate-800 dark:hover:border-slate-400 dark:hover:bg-slate-700 dark:text-white transition"
                                    >
                                        <div className="font-semibold text-sm">Array</div>
                                        <div className="text-xs mt-0.5 text-gray-500 dark:text-gray-300">Creates a nested array of child objects</div>
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (validParentOptions.length === 0) return;
                                            setInlineParentRef(validParentOptions[0].id);
                                            setPopoverStep('inline-parent');
                                        }}
                                        disabled={validParentOptions.length === 0}
                                        className="w-full text-left px-4 py-3 rounded border transition
                                            enabled:border-violet-400 enabled:bg-violet-50 enabled:hover:bg-violet-100 enabled:text-gray-800
                                            dark:enabled:border-violet-600 dark:enabled:bg-violet-900/30 dark:enabled:hover:bg-violet-900/60 dark:enabled:text-white
                                            disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed
                                            dark:disabled:border-slate-600 dark:disabled:bg-slate-800 dark:disabled:text-gray-600"
                                    >
                                        <div className="font-semibold text-sm">Inline Object</div>
                                        <div className="text-xs mt-0.5 text-gray-500 dark:text-gray-300">
                                            {parentOptions.length === 0
                                                ? 'Add a Root Object or Array mapping first'
                                                : validParentOptions.length === 0
                                                    ? 'No related tables mapped — create a join first'
                                                    : 'Nests this table inside a related object'}
                                        </div>
                                    </button>
                                </div>
                                <button onClick={handleDismissPopover} className="mt-3 w-full text-center text-xs text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white transition">
                                    Cancel
                                </button>
                            </>
                        ) : popoverStep === 'inline-parent' ? (
                            <>
                                <p className="text-sm font-semibold text-gray-800 dark:text-white mb-1">Select Parent</p>
                                <p className="text-xs text-gray-500 dark:text-gray-300 mb-3">
                                    <span className="text-violet-600 dark:text-violet-300 font-mono">{pendingTable.schemaName}.{pendingTable.tableName}</span> will be nested inside:
                                </p>
                                <div className="space-y-1 mb-4">
                                    {parentOptions.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => p.hasRelationship && setInlineParentRef(p.id)}
                                            disabled={!p.hasRelationship}
                                            className={`w-full text-left px-3 py-2 rounded border text-sm font-mono transition ${
                                                !p.hasRelationship
                                                    ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed dark:border-slate-700 dark:bg-slate-800/40 dark:text-gray-500'
                                                    : inlineParentRef === p.id
                                                        ? 'border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-500 dark:bg-violet-900/40 dark:text-violet-200'
                                                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300 dark:hover:border-slate-400'
                                            }`}
                                        >
                                            {p.label}
                                            {!p.hasRelationship && <span className="ml-2 text-xs text-gray-400 dark:text-gray-400 font-sans">no relationship</span>}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPopoverStep('type')}
                                        className="flex-1 px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-600 hover:text-gray-800 hover:border-gray-400 dark:border-slate-600 dark:text-gray-300 dark:hover:text-white dark:hover:border-slate-400 transition"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={() => handleConfirmParent('InlineObject')}
                                        disabled={!inlineParentRef || !validParentOptions.some(p => p.id === inlineParentRef)}
                                        className="flex-1 px-3 py-1.5 text-xs font-semibold rounded transition
                                            enabled:bg-violet-600 enabled:hover:bg-violet-500 enabled:text-white
                                            dark:enabled:bg-violet-700 dark:enabled:hover:bg-violet-600
                                            disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed
                                            dark:disabled:bg-slate-700 dark:disabled:text-gray-600"
                                    >
                                        Next
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="text-sm font-semibold text-gray-800 dark:text-white mb-1">Select Relationship</p>
                                <p className="text-xs text-gray-500 dark:text-gray-300 mb-3">
                                    Multiple foreign keys exist between these tables. Choose which one to use:
                                </p>
                                <div className="space-y-1 mb-4">
                                    {(() => {
                                        const parent = parentOptions.find(p => p.id === inlineParentRef);
                                        return parent
                                            ? getMultiFkColumns(project, parent.sourceSchema, parent.sourceTable, pendingTable.schemaName, pendingTable.tableName)
                                            : [];
                                    })().map(col => (
                                        <button
                                            key={col}
                                            onClick={() => setSelectedJoinColumn(col)}
                                            className={`w-full text-left px-3 py-2 rounded border text-sm font-mono transition ${
                                                selectedJoinColumn === col
                                                    ? 'border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-500 dark:bg-violet-900/40 dark:text-violet-200'
                                                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300 dark:hover:border-slate-400'
                                            }`}
                                        >
                                            {col}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPopoverStep('inline-parent')}
                                        className="flex-1 px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-600 hover:text-gray-800 hover:border-gray-400 dark:border-slate-600 dark:text-gray-300 dark:hover:text-white dark:hover:border-slate-400 transition"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={() => handleAddMapping('InlineObject', inlineParentRef, selectedJoinColumn || undefined)}
                                        disabled={!selectedJoinColumn}
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
                {!hasMapping && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500 dark:text-gray-300">
                        <FaFileCode size={32} className="opacity-30" />
                        <p className="text-sm">Click a table in the left panel to start JSON mapping</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Choose Root Object, Array, or Inline Object</p>
                    </div>
                )}

                {root && (() => {
                    const key = `${root.sourceSchema}.${root.sourceTable}`;
                    const isHighlighted = highlightedTable?.schemaName === root.sourceSchema && highlightedTable?.tableName === root.sourceTable;
                    return (
                        <div>
                            <div className="text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider mb-1.5 px-1">Root Object</div>
                            <div ref={el => el ? cardRefs.current.set(key, el) : cardRefs.current.delete(key)}
                                 className={isHighlighted ? 'rounded ring-2 ring-cyan-400 ring-offset-1 ring-offset-white dark:ring-offset-slate-800' : ''}>
                                <JsonMappingTableCard mapping={root} onChange={handleCardChange} onRemove={handleRemoveRoot} availableColumns={getAvailableJsonColumns(root, project)} />
                            </div>
                        </div>
                    );
                })()}

                {normalElements.length > 0 && (
                    <div>
                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider mb-1.5 px-1 mt-4">Arrays & Objects</div>
                        <div className="space-y-2">
                            {normalElements.map((el, i) => {
                                const fullIndex = (elements ?? []).indexOf(el);
                                const key = el.id ?? `${el.sourceSchema}.${el.sourceTable}.${i}`;
                                const isHighlighted = highlightedTable?.schemaName === el.sourceSchema && highlightedTable?.tableName === el.sourceTable;
                                return (
                                    <div
                                        key={key}
                                        ref={div => div ? cardRefs.current.set(key, div) : cardRefs.current.delete(key)}
                                        className={isHighlighted ? 'rounded ring-2 ring-cyan-400 ring-offset-1 ring-offset-white dark:ring-offset-slate-800' : ''}
                                    >
                                        <JsonMappingTableCard
                                            mapping={el}
                                            onChange={handleCardChange}
                                            onRemove={() => handleRemoveElement(fullIndex)}
                                            parentJsonName={el.mappingType === 'InlineObject' ? resolveParentJsonName(el.parentRef) : undefined}
                                            availableColumns={getAvailableJsonColumns(el, project)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
