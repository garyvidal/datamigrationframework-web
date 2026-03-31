// JsonMappingTableCard — Card for mapping a DB table to JSON structure; configures key names, types, and inline/array relationships.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { FaTimes, FaGripVertical, FaChevronDown, FaChevronUp, FaDatabase, FaLink, FaPlus } from 'react-icons/fa';
import type { JsonColumnType, JsonTableMapping } from '@/services/ProjectService';

/** A DB column available for restore (deleted from mapping but still in schema). */
export interface RestorableJsonColumn {
    name: string;
    jsonKey: string;
    jsonType: JsonColumnType;
}

const JSON_TYPE_COLOR: Record<JsonColumnType, string> = {
    'string':  'bg-blue-900 text-blue-300',
    'number':  'bg-purple-900 text-purple-300',
    'boolean': 'bg-yellow-900 text-yellow-300',
};

const BADGE_LABEL: Record<string, string> = {
    RootObject:  'ROOT',
    Array:       'ARRAY',
    InlineObject: 'INLINE',
};

const HEADER_BG: Record<string, string> = {
    RootObject:  'bg-cyan-50 dark:bg-cyan-900/40',
    Array:       'bg-gray-100 dark:bg-slate-600',
    InlineObject: 'bg-violet-50 dark:bg-violet-900/40',
};

const ACCENT: Record<string, string> = {
    RootObject:  'text-cyan-700 dark:text-cyan-300',
    Array:       'text-gray-700 dark:text-gray-200',
    InlineObject: 'text-violet-700 dark:text-violet-300',
};

const DND_KEY = 'application/x-json-row-index';
const JSON_TYPES: JsonColumnType[] = ['string', 'number', 'boolean'];

interface JsonMappingTableCardProps {
    mapping: JsonTableMapping;
    onChange: (updated: JsonTableMapping) => void;
    onRemove: () => void;
    parentJsonName?: string;
    /** All DB columns for this table (used to compute which columns can be restored). */
    availableColumns?: RestorableJsonColumn[];
}

export default function JsonMappingTableCard({ mapping, onChange, onRemove, parentJsonName, availableColumns = [] }: JsonMappingTableCardProps) {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [expandedSourceIndex, setExpandedSourceIndex] = useState(-1);
    const [dragIndex, setDragIndex] = useState(-1);
    const [insertBefore, setInsertBefore] = useState(-1);
    const gripPressed = React.useRef(false);
    const [restoreOpen, setRestoreOpen] = useState(false);
    const restoreButtonRef = useRef<HTMLButtonElement>(null);
    const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);

    const openRestore = useCallback(() => {
        if (restoreButtonRef.current) {
            const rect = restoreButtonRef.current.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + window.scrollY + 4, right: window.innerWidth - rect.right });
        }
        setRestoreOpen(true);
    }, []);

    useEffect(() => {
        if (!restoreOpen) return;
        const handler = (e: MouseEvent) => {
            if (restoreButtonRef.current && !restoreButtonRef.current.contains(e.target as Node)) {
                setRestoreOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [restoreOpen]);

    // Columns present in schema but removed from this mapping
    const mappedSourceCols = new Set(mapping.columns.map(c => c.sourceColumn));
    const restorableColumns = availableColumns.filter(c => !mappedSourceCols.has(c.name));

    const restoreColumn = (col: RestorableJsonColumn) => {
        const newCol = {
            id: crypto.randomUUID(),
            sourceColumn: col.name,
            jsonKey: col.jsonKey,
            jsonType: col.jsonType,
            mappingType: 'Property' as const,
        };
        onChange({ ...mapping, columns: [...mapping.columns, newCol] });
        setRestoreOpen(false);
    };

    const isInline = mapping.mappingType === 'InlineObject';
    const headerBg = HEADER_BG[mapping.mappingType] ?? 'bg-slate-600';
    const badge    = BADGE_LABEL[mapping.mappingType] ?? mapping.mappingType;
    const accent   = ACCENT[mapping.mappingType] ?? 'text-gray-200';

    const updateJsonKey = (index: number, key: string) => {
        const cols = mapping.columns.map((col, i) => i !== index ? col : { ...col, jsonKey: key });
        onChange({ ...mapping, columns: cols });
    };

    const updateJsonType = (index: number, type: JsonColumnType) => {
        const cols = mapping.columns.map((col, i) => i !== index ? col : { ...col, jsonType: type });
        onChange({ ...mapping, columns: cols });
    };

    const removeColumn = (index: number) => {
        onChange({ ...mapping, columns: mapping.columns.filter((_, i) => i !== index) });
    };

    const handleDragStart = (e: React.DragEvent, i: number) => {
        if (!gripPressed.current) { e.preventDefault(); return; }
        gripPressed.current = false;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(DND_KEY, String(i));
        setTimeout(() => setDragIndex(i), 0);
    };

    const handleDragOver = (e: React.DragEvent, i: number) => {
        if (!e.dataTransfer.types.includes(DND_KEY)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setInsertBefore(i);
    };

    const handleDragOverEnd = (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(DND_KEY)) return;
        e.preventDefault();
        setInsertBefore(mapping.columns.length);
    };

    const handleDrop = (e: React.DragEvent, target: number) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData(DND_KEY), 10);
        resetDrag();
        if (isNaN(from) || from === target || from === target - 1) return;
        const cols = [...mapping.columns];
        const [moved] = cols.splice(from, 1);
        cols.splice(target > from ? target - 1 : target, 0, moved);
        onChange({ ...mapping, columns: cols });
    };

    const resetDrag = () => { setDragIndex(-1); setInsertBefore(-1); gripPressed.current = false; };

    const DropLine = ({ before }: { before: number }) =>
        insertBefore === before && dragIndex >= 0 ? (
            <div className="h-0.5 bg-cyan-400 mx-2 rounded-full pointer-events-none"
                 style={{ boxShadow: '0 0 6px 1px rgb(34 211 238 / 0.6)' }} />
        ) : null;

    return (
        <div className="bg-white dark:bg-slate-700 rounded border border-gray-200 dark:border-slate-600 overflow-hidden">
            {/* Header */}
            <div className={`flex items-center gap-2 px-3 py-2 ${headerBg}`}>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-gray-200 dark:border-transparent shrink-0 ${accent}`}>
                    {badge}
                </span>

                <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
                    {isInline && parentJsonName && (
                        <>
                            <FaLink size={8} className="text-violet-400 shrink-0" />
                            <span className="text-xs text-violet-400 font-mono shrink-0 max-w-[80px] truncate">{parentJsonName}</span>
                            <span className="text-xs text-gray-500 shrink-0">›</span>
                        </>
                    )}
                    {mapping.joinColumn && (
                        <span
                            className="text-xs font-mono text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 px-1.5 py-0.5 rounded shrink-0"
                            title={`Joined via FK column: ${mapping.joinColumn}`}
                        >
                            {mapping.joinColumn}
                        </span>
                    )}
                    <span className={`text-sm font-mono truncate ${accent}`}>
                        "{mapping.jsonName || '…'}"
                    </span>
                    <span className="text-xs text-gray-500 ml-1 shrink-0 truncate max-w-[110px]"
                          title={`${mapping.sourceSchema}.${mapping.sourceTable}`}>
                        {mapping.sourceSchema}.{mapping.sourceTable}
                    </span>
                </div>

                {/* Restore deleted columns */}
                {restorableColumns.length > 0 && (
                    <div className="shrink-0">
                        <button
                            ref={restoreButtonRef}
                            onClick={() => restoreOpen ? setRestoreOpen(false) : openRestore()}
                            title="Restore a deleted column"
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition border ${
                                restoreOpen
                                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-600'
                                    : 'border-gray-300 text-gray-500 hover:text-cyan-600 hover:border-cyan-500 dark:border-slate-600 dark:text-gray-400 dark:hover:text-cyan-300 dark:hover:border-cyan-600'
                            }`}
                        >
                            <FaPlus size={8} />
                            <span>{restorableColumns.length}</span>
                        </button>
                        {restoreOpen && dropdownPos && ReactDOM.createPortal(
                            <div
                                style={{ position: 'fixed', top: dropdownPos.top, right: dropdownPos.right }}
                                className="z-[9999] min-w-[160px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded shadow-lg overflow-hidden"
                            >
                                <div className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-slate-700 font-medium">
                                    Restore column
                                </div>
                                {restorableColumns.map(col => (
                                    <button
                                        key={col.name}
                                        onClick={() => restoreColumn(col)}
                                        className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-700 dark:text-gray-200 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 hover:text-cyan-700 dark:hover:text-cyan-300 transition"
                                    >
                                        {col.name}
                                    </button>
                                ))}
                            </div>,
                            document.body,
                        )}
                    </div>
                )}

                <button
                    onClick={() => setSettingsOpen(v => !v)}
                    className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition border ${
                        settingsOpen
                            ? 'border-gray-400 bg-gray-200 text-gray-800 dark:border-slate-400 dark:bg-slate-600 dark:text-white'
                            : 'border-gray-300 bg-transparent text-gray-500 hover:text-gray-700 hover:border-gray-400 dark:border-slate-600 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-slate-500'
                    }`}
                >
                    {settingsOpen ? <FaChevronUp size={9} /> : <FaChevronDown size={9} />}
                </button>

                <button onClick={() => setShowDeleteConfirm(true)} className="shrink-0 text-gray-400 hover:text-red-400 transition" title="Remove table mapping">
                    <FaTimes size={12} />
                </button>
            </div>

            {showDeleteConfirm && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
                    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-xl px-6 py-5 w-80">
                        <p className="text-sm text-gray-800 dark:text-gray-100 font-medium mb-1">Remove table mapping?</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 font-mono">{mapping.sourceSchema}.{mapping.sourceTable}</p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => { setShowDeleteConfirm(false); onRemove(); }}
                                className="px-3 py-1.5 text-xs rounded bg-red-600 hover:bg-red-700 text-white transition"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {/* Settings panel */}
            {settingsOpen && (
                <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/70 space-y-3">
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 w-24 shrink-0">JSON Key</label>
                        <span className="text-xs text-gray-500">"</span>
                        <input
                            value={mapping.jsonName}
                            onChange={e => onChange({ ...mapping, jsonName: e.target.value })}
                            className="flex-1 min-w-0 bg-white border border-gray-300 rounded px-2 py-1 text-xs font-mono text-gray-800 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:bg-slate-700 dark:border-slate-500 dark:text-white"
                        />
                        <span className="text-xs text-gray-500">"</span>
                    </div>
                    {isInline && (
                        <>
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-500 w-24 shrink-0">Nested Under</label>
                                <span className="text-xs font-mono text-violet-700 bg-violet-50 border border-violet-200 dark:text-violet-300 dark:bg-violet-900/20 dark:border-violet-800 px-2 py-1 rounded">
                                    {parentJsonName || '(none)'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-500 w-24 shrink-0">Embed</label>
                                <button
                                    onClick={() => onChange({ ...mapping, embed: !mapping.embed })}
                                    className={`px-2 py-1 rounded text-xs font-medium border transition ${
                                        mapping.embed
                                            ? 'border-violet-600 bg-violet-900/40 text-violet-300 hover:border-violet-400'
                                            : 'border-slate-500 bg-slate-700 text-gray-500 hover:border-slate-400'
                                    }`}
                                    title="When enabled, skip the wrapper key and embed properties directly into the parent object"
                                >
                                    {mapping.embed ? 'Enabled' : 'Disabled'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Column rows */}
            <div onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) resetDrag(); }}>
                {mapping.columns.length === 0 && (
                    <div className="px-4 py-3 text-xs text-gray-500 italic">No columns</div>
                )}

                {mapping.columns.map((col, i) => {
                    const isDragging = dragIndex === i;
                    return (
                        <React.Fragment key={`col-${i}-${col.sourceColumn}`}>
                            <DropLine before={i} />
                            <div
                                draggable
                                onDragStart={e => handleDragStart(e, i)}
                                onDragOver={e => handleDragOver(e, i)}
                                onDrop={e => handleDrop(e, i)}
                                onDragEnd={resetDrag}
                                className={`flex items-center gap-2 px-2 py-1.5 text-xs border-t border-gray-100 dark:border-slate-600/40 transition-colors group select-none ${
                                    isDragging ? 'opacity-30 bg-gray-200/50 dark:bg-slate-500/30' : 'hover:bg-gray-50 dark:hover:bg-slate-600/50'
                                }`}
                            >
                                <span
                                    title="Drag to reorder"
                                    className="shrink-0 text-gray-400 hover:text-gray-200 cursor-grab active:cursor-grabbing"
                                    onMouseDown={() => { gripPressed.current = true; }}
                                    onMouseUp={() => { gripPressed.current = false; }}
                                >
                                    <FaGripVertical size={10} />
                                </span>

                                {/* JSON type toggle */}
                                <button
                                    onClick={() => {
                                        const types = JSON_TYPES;
                                        const next = types[(types.indexOf(col.jsonType) + 1) % types.length];
                                        updateJsonType(i, next);
                                    }}
                                    title={`Type: ${col.jsonType} — click to cycle`}
                                    className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-mono font-medium border-0 ${JSON_TYPE_COLOR[col.jsonType] ?? 'bg-slate-700 text-gray-400'}`}
                                >
                                    {col.jsonType}
                                </button>

                                {/* JSON key name */}
                                <input
                                    value={col.jsonKey}
                                    onChange={e => updateJsonKey(i, e.target.value)}
                                    onMouseDown={e => e.stopPropagation()}
                                    className="flex-1 min-w-0 bg-transparent font-mono text-gray-800 dark:text-white focus:outline-none rounded px-1 focus:ring-1 focus:ring-cyan-500"
                                />

                                {/* DB column info toggle */}
                                <button
                                    onClick={() => setExpandedSourceIndex(expandedSourceIndex === i ? -1 : i)}
                                    onMouseDown={e => e.stopPropagation()}
                                    title={expandedSourceIndex === i ? 'Hide source info' : 'Show source column info'}
                                    className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border transition ${
                                        expandedSourceIndex === i
                                            ? 'border-gray-400 bg-gray-200 text-gray-700 dark:border-slate-400 dark:bg-slate-600 dark:text-gray-300'
                                            : 'border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 dark:border-slate-600 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-slate-500'
                                    }`}
                                >
                                    <FaDatabase size={8} />
                                </button>

                                <button
                                    onClick={() => removeColumn(i)}
                                    title="Remove this column"
                                    className="shrink-0 text-gray-400 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                                >
                                    <FaTimes size={10} />
                                </button>
                            </div>

                            {expandedSourceIndex === i && (
                                <div className="px-3 py-2 bg-gray-50 dark:bg-slate-800/60 border-t border-gray-100 dark:border-slate-600/50 flex items-center gap-4">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-gray-500">Column</span>
                                        <span className="text-xs font-mono text-gray-700 bg-gray-100 dark:text-gray-300 dark:bg-slate-700 px-1.5 py-0.5 rounded">{col.sourceColumn}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-gray-500">JSON Type</span>
                                        <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${JSON_TYPE_COLOR[col.jsonType] ?? 'bg-slate-700 text-gray-400'}`}>
                                            {col.jsonType}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}

                {mapping.columns.length > 0 && (
                    <div className="h-2" onDragOver={handleDragOverEnd} onDrop={e => handleDrop(e, mapping.columns.length)}>
                        <DropLine before={mapping.columns.length} />
                    </div>
                )}
            </div>
        </div>
    );
}
