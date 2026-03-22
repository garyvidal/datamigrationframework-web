// JsonMappingTableCard — Card for mapping a DB table to JSON structure; configures key names, types, and inline/array relationships.
import React, { useState } from 'react';
import { FaTimes, FaGripVertical, FaChevronDown, FaChevronUp, FaDatabase, FaLink } from 'react-icons/fa';
import type { JsonColumnType, JsonTableMapping } from '@/services/ProjectService';

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
}

export default function JsonMappingTableCard({ mapping, onChange, onRemove, parentJsonName }: JsonMappingTableCardProps) {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [expandedSourceIndex, setExpandedSourceIndex] = useState(-1);
    const [dragIndex, setDragIndex] = useState(-1);
    const [insertBefore, setInsertBefore] = useState(-1);
    const gripPressed = React.useRef(false);

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
                    <span className={`text-sm font-mono truncate ${accent}`}>
                        "{mapping.jsonName || '…'}"
                    </span>
                    <span className="text-xs text-gray-500 ml-1 shrink-0 truncate max-w-[110px]"
                          title={`${mapping.sourceSchema}.${mapping.sourceTable}`}>
                        {mapping.sourceSchema}.{mapping.sourceTable}
                    </span>
                </div>

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

                <button onClick={onRemove} className="shrink-0 text-gray-400 hover:text-red-400 transition" title="Remove table mapping">
                    <FaTimes size={12} />
                </button>
            </div>

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
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500 w-24 shrink-0">Nested Under</label>
                            <span className="text-xs font-mono text-violet-700 bg-violet-50 border border-violet-200 dark:text-violet-300 dark:bg-violet-900/20 dark:border-violet-800 px-2 py-1 rounded">
                                {parentJsonName || '(none)'}
                            </span>
                        </div>
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
