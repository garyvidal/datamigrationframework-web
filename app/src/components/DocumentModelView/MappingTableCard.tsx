// MappingTableCard — Card for mapping a DB table to XML elements; configures columns, attributes, and inline/child relationships with drag-reorder.
import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { FaTimes, FaTag, FaLayerGroup, FaLink, FaGripVertical, FaChevronDown, FaChevronUp, FaPlus, FaDatabase } from 'react-icons/fa';
import type { XmlTableMapping, XmlColumnMapping, XmlNamespace, ColumnMappingType, XmlSchemaType } from '@/services/ProjectService';
import JsFunctionEditor from './JsFunctionEditor';

// FunctionTextarea replaced by JsFunctionEditor (CodeMirror-based, see JsFunctionEditor.tsx)

/** A DB column available for restore (deleted from mapping but still in schema). */
export interface RestorableColumn {
    name: string;
    xmlName: string;
    xmlType: XmlSchemaType;
}

interface MappingTableCardProps {
    mapping: XmlTableMapping;
    onChange: (updated: XmlTableMapping) => void;
    onRemove: () => void;
    /** Resolved xmlName of the parent mapping (for InlineElement display). */
    parentXmlName?: string;
    /** Project-level namespace declarations available for prefix selection. */
    namespaces?: XmlNamespace[];
    /** All DB columns for this table (used to compute which columns can be restored). */
    availableColumns?: RestorableColumn[];
}

const XML_TYPE_COLOR: Record<XmlSchemaType, string> = {
    'xs:string':   'bg-blue-900 text-blue-300',
    'xs:integer':  'bg-purple-900 text-purple-300',
    'xs:long':     'bg-purple-900 text-purple-300',
    'xs:date':     'bg-green-900 text-green-300',
    'xs:dateTime': 'bg-green-900 text-green-300',
    'xs:boolean':   'bg-yellow-900 text-yellow-300',
    'xs:decimal':   'bg-purple-900 text-purple-300',
    'xs:hexBinary': 'bg-orange-900 text-orange-300',
};

const MAPPING_TYPE_LABELS: Record<ColumnMappingType, string> = {
    Element:          'Element',
    ElementAttribute: 'Attr',
    CUSTOM:           'Ref',
};

const BADGE_LABEL: Record<string, string> = {
    RootElement:   'ROOT',
    Elements:      'ELEMENTS',
    InlineElement: 'INLINE',
    CUSTOM:        'CUSTOM',
};

const HEADER_BG: Record<string, string> = {
    RootElement:   'bg-cyan-50 dark:bg-cyan-900/40',
    Elements:      'bg-gray-100 dark:bg-slate-600',
    InlineElement: 'bg-violet-50 dark:bg-violet-900/40',
    CUSTOM:        'bg-amber-50 dark:bg-amber-900/30',
};

const ACCENT: Record<string, string> = {
    RootElement:   'text-cyan-700 dark:text-cyan-300',
    Elements:      'text-gray-700 dark:text-gray-200',
    InlineElement: 'text-violet-700 dark:text-violet-300',
    CUSTOM:        'text-amber-700 dark:text-amber-300',
};

const DND_KEY = 'application/x-row-index';

export default function MappingTableCard({ mapping, onChange, onRemove, parentXmlName, namespaces = [], availableColumns = [] }: MappingTableCardProps) {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    /** Pending namespace prefix to propagate to columns — non-null triggers the cascade prompt. */
    const [pendingNsPropagate, setPendingNsPropagate] = useState<string | null>(null);
    /** Whether the restore-column dropdown is open. */
    const [restoreOpen, setRestoreOpen] = useState(false);
    const restoreButtonRef = useRef<HTMLButtonElement>(null);
    const restoreDropdownRef = useRef<HTMLDivElement>(null);
    const [restoreDropdownPos, setRestoreDropdownPos] = useState<{ top: number; right: number } | null>(null);
    /** Index of custom field row whose fn editor is open (-1 = none). */
    const [expandedFnIndex, setExpandedFnIndex] = useState(-1);
    /** Index of DB column row whose relational info panel is open (-1 = none). */
    const [expandedSourceIndex, setExpandedSourceIndex] = useState(-1);
    /** Index of the row currently being dragged (-1 = none). */
    const [dragIndex, setDragIndex] = useState(-1);
    /** Index before which the drop indicator line should appear (-1 = none). */
    const [insertBefore, setInsertBefore] = useState(-1);

    /**
     * Guard: only drags that originate on the grip handle are allowed.
     * This prevents clicking an input from accidentally starting a drag.
     */
    const gripPressed = useRef(false);

    const openRestore = useCallback(() => {
        if (restoreButtonRef.current) {
            const rect = restoreButtonRef.current.getBoundingClientRect();
            setRestoreDropdownPos({ top: rect.bottom + window.scrollY + 4, right: window.innerWidth - rect.right });
        }
        setRestoreOpen(true);
    }, []);

    // Close restore dropdown on outside click
    useEffect(() => {
        if (!restoreOpen) return;
        const handler = (e: MouseEvent) => {
            if (
                restoreButtonRef.current && !restoreButtonRef.current.contains(e.target as Node) &&
                restoreDropdownRef.current && !restoreDropdownRef.current.contains(e.target as Node)
            ) {
                setRestoreOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [restoreOpen]);

    // Columns present in schema but removed from this mapping
    const mappedSourceCols = new Set(mapping.columns.map(c => c.sourceColumn));
    const restorableColumns = availableColumns.filter(c => !mappedSourceCols.has(c.name));

    const restoreColumn = (col: RestorableColumn) => {
        const newCol: XmlColumnMapping = {
            id: crypto.randomUUID(),
            sourceColumn: col.name,
            xmlName: col.xmlName,
            xmlType: col.xmlType,
            mappingType: 'Element',
        };
        onChange({ ...mapping, columns: [...mapping.columns, newCol] });
        setRestoreOpen(false);
    };

    const isInline = mapping.mappingType === 'InlineElement';
    const isCustom = mapping.mappingType === 'CUSTOM';
    const isElems  = mapping.mappingType === 'Elements';
    const wrapInParent = mapping.wrapInParent !== false;

    // ── column mutation helpers ───────────────────────────────────────────────
    const toggleColumnType = (index: number) => {
        const cols = mapping.columns.map((col, i) =>
            i !== index ? col : {
                ...col,
                mappingType: (col.mappingType === 'Element' ? 'ElementAttribute' : 'Element') as ColumnMappingType,
            }
        );
        onChange({ ...mapping, columns: cols });
    };

    const removeColumn = (index: number) => {
        onChange({ ...mapping, columns: mapping.columns.filter((_, i) => i !== index) });
    };

    const updateXmlName = (index: number, name: string) => {
        const cols = mapping.columns.map((col, i) =>
            i !== index ? col : { ...col, xmlName: name }
        );
        onChange({ ...mapping, columns: cols });
    };

    const XSD_TYPES: XmlSchemaType[] = ['xs:string', 'xs:integer', 'xs:long', 'xs:decimal', 'xs:date', 'xs:dateTime', 'xs:boolean','xs:hexBinary'];

    /** DB column names available as `row.X` in custom functions */
    const availableFieldNames = mapping.columns
        .filter(c => c.sourceColumn !== '')
        .map(c => c.sourceColumn);

    const addCustomField = () => {
        onChange({ ...mapping, columns: [...mapping.columns, { sourceColumn: '', xmlName: 'customField', xmlType: 'xs:string' as XmlSchemaType, mappingType: 'Element' as ColumnMappingType }] });
    };

    const updateColumnFn = (index: number, fn: string) => {
        onChange({ ...mapping, columns: mapping.columns.map((c, i) => i !== index ? c : { ...c, customFunction: fn }) });
    };

    const toggleWrapInParent = () => {
        onChange({
            ...mapping,
            wrapInParent: !wrapInParent,
            wrapperElementName: !wrapInParent ? (mapping.wrapperElementName ?? '') : undefined,
        });
    };

    // ── drag-and-drop ─────────────────────────────────────────────────────────
    const handleDragStart = (e: React.DragEvent, i: number) => {
        if (!gripPressed.current) {
            e.preventDefault();
            return;
        }
        gripPressed.current = false;
        e.dataTransfer.effectAllowed = 'move';
        // Store the source index in the transfer payload — this is the reliable
        // way to read it in onDrop, independent of React state timing.
        e.dataTransfer.setData(DND_KEY, String(i));
        // Delay the state change so the drag ghost captures the row before it fades.
        setTimeout(() => setDragIndex(i), 0);
    };

    const handleDragOver = (e: React.DragEvent, i: number) => {
        if (!e.dataTransfer.types.includes(DND_KEY)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setInsertBefore(i);
    };

    /** Drop after the last row */
    const handleDragOverEnd = (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(DND_KEY)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setInsertBefore(mapping.columns.length);
    };

    const handleDrop = (e: React.DragEvent, target: number) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData(DND_KEY), 10);
        resetDrag();
        if (isNaN(from) || from === target || from === target - 1) return;
        const cols = [...mapping.columns];
        const [moved] = cols.splice(from, 1);
        // Adjust target index after removal
        const adjustedTarget = target > from ? target - 1 : target;
        cols.splice(adjustedTarget, 0, moved);
        onChange({ ...mapping, columns: cols });
    };

    const resetDrag = () => {
        setDragIndex(-1);
        setInsertBefore(-1);
        gripPressed.current = false;
    };

    // ── derived display values ────────────────────────────────────────────────
    const headerBg = HEADER_BG[mapping.mappingType] ?? 'bg-slate-600';
    const badge    = BADGE_LABEL[mapping.mappingType] ?? mapping.mappingType;
    const accent   = ACCENT[mapping.mappingType] ?? 'text-gray-200';

    const DropLine = ({ before }: { before: number }) =>
        insertBefore === before && dragIndex >= 0 ? (
            <div
                className="h-0.5 bg-cyan-400 mx-2 rounded-full pointer-events-none"
                style={{ boxShadow: '0 0 6px 1px rgb(34 211 238 / 0.6)' }}
            />
        ) : null;

    return (
        <div className="bg-white dark:bg-slate-700 rounded border border-gray-200 dark:border-slate-600 overflow-hidden">

            {/* ── Compact header ───────────────────────────────────────────── */}
            <div className={`flex items-center gap-2 px-3 py-2 ${headerBg}`}>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-gray-200 dark:border-transparent shrink-0 ${accent}`}>
                    {badge}
                </span>

                <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
                    {isInline && parentXmlName && (
                        <>
                            <FaLink size={8} className="text-violet-400 shrink-0" />
                            <span className="text-xs text-violet-400 font-mono shrink-0 max-w-[80px] truncate"
                                  title={parentXmlName}>
                                {parentXmlName}
                            </span>
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
                        &lt;{mapping.xmlName || '…'}&gt;
                    </span>
                    {!isCustom && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-1 shrink-0 truncate max-w-[110px]"
                              title={`${mapping.sourceSchema}.${mapping.sourceTable}`}>
                            {mapping.sourceSchema}.{mapping.sourceTable}
                        </span>
                    )}
                </div>

                {/* Restore deleted columns */}
                {restorableColumns.length > 0 && !isCustom && (
                    <div className="shrink-0">
                        <button
                            ref={restoreButtonRef}
                            onClick={() => restoreOpen ? setRestoreOpen(false) : openRestore()}
                            title="Restore a deleted column"
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition border ${
                                restoreOpen
                                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-600'
                                    : 'border-gray-300 text-gray-500 hover:text-cyan-600 hover:border-cyan-500 dark:border-slate-600 dark:text-gray-300 dark:hover:text-cyan-300 dark:hover:border-cyan-600'
                            }`}
                        >
                            <FaPlus size={8} />
                            <span>{restorableColumns.length}</span>
                        </button>
                        {restoreOpen && restoreDropdownPos && ReactDOM.createPortal(
                            <div
                                ref={restoreDropdownRef}
                                style={{ position: 'fixed', top: restoreDropdownPos.top, right: restoreDropdownPos.right }}
                                className="z-[9999] min-w-[160px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded shadow-lg overflow-hidden"
                            >
                                <div className="px-2 py-1 text-xs text-gray-500 dark:text-gray-300 border-b border-gray-100 dark:border-slate-700 font-medium">
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
                    title={settingsOpen ? 'Close settings' : 'Edit settings'}
                    className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition border ${
                        settingsOpen
                            ? 'border-gray-400 bg-gray-200 text-gray-800 dark:border-slate-400 dark:bg-slate-600 dark:text-white'
                            : 'border-gray-300 bg-transparent text-gray-500 hover:text-gray-700 hover:border-gray-400 dark:border-slate-600 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:border-slate-500'
                    }`}
                >
                    {settingsOpen ? <FaChevronUp size={9} /> : <FaChevronDown size={9} />}
                </button>

                <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="shrink-0 text-gray-400 hover:text-red-400 transition"
                    title="Remove entire table mapping"
                >
                    <FaTimes size={12} />
                </button>
            </div>

            {showDeleteConfirm && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
                    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-xl px-6 py-5 w-80">
                        <p className="text-sm text-gray-800 dark:text-gray-100 font-medium mb-1">Remove table mapping?</p>
                        <p className="text-xs text-gray-500 dark:text-gray-300 mb-4 font-mono">{mapping.sourceSchema}.{mapping.sourceTable}</p>
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

            {/* ── Settings panel ────────────────────────────────────────────── */}
            {settingsOpen && (
                <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/70 space-y-3">

                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 dark:text-gray-300 w-24 shrink-0">Element Name</label>
                        <span className="text-xs text-gray-500">&lt;</span>
                        {namespaces.length > 0 && (
                            <select
                                value={mapping.namespacePrefix ?? ''}
                                onChange={e => {
                                    const newPrefix = e.target.value || undefined;
                                    onChange({ ...mapping, namespacePrefix: newPrefix });
                                    // Offer to cascade to columns only when there are non-ref columns
                                    const cascadable = mapping.columns.filter(c => c.mappingType !== 'CUSTOM' && c.sourceColumn !== '');
                                    if (cascadable.length > 0) {
                                        setPendingNsPropagate(newPrefix ?? '');
                                    }
                                }}
                                title="Namespace prefix"
                                className="shrink-0 bg-white border border-gray-300 rounded px-1 py-1 text-xs font-mono text-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:bg-slate-700 dark:border-slate-500 dark:text-teal-300"
                            >
                                <option value="">—</option>
                                {namespaces.filter(ns => ns.prefix).map(ns => (
                                    <option key={ns.prefix} value={ns.prefix}>{ns.prefix}</option>
                                ))}
                            </select>
                        )}
                        {namespaces.length > 0 && mapping.namespacePrefix && (
                            <span className="text-xs text-gray-400">:</span>
                        )}
                        <input
                            value={mapping.xmlName}
                            onChange={e => onChange({ ...mapping, xmlName: e.target.value })}
                            className="flex-1 min-w-0 bg-white border border-gray-300 rounded px-2 py-1 text-xs font-mono text-gray-800 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:bg-slate-700 dark:border-slate-500 dark:text-white"
                        />
                        <span className="text-xs text-gray-500">&gt;</span>
                    </div>

                    {/* Cascade namespace prompt */}
                    {pendingNsPropagate !== null && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded border border-teal-300 bg-teal-50 dark:border-teal-700 dark:bg-teal-900/20">
                            <span className="flex-1 text-xs text-teal-800 dark:text-teal-200">
                                Apply <span className="font-mono font-semibold">{pendingNsPropagate || '(none)'}</span> prefix to all child columns too?
                            </span>
                            <button
                                onClick={() => {
                                    const updated = mapping.columns.map(c =>
                                        c.mappingType === 'CUSTOM' || c.sourceColumn === '' ? c : { ...c, namespacePrefix: pendingNsPropagate || undefined }
                                    );
                                    onChange({ ...mapping, columns: updated });
                                    setPendingNsPropagate(null);
                                }}
                                className="shrink-0 px-2 py-0.5 text-xs rounded bg-teal-600 hover:bg-teal-500 text-white font-medium transition"
                            >
                                Apply
                            </button>
                            <button
                                onClick={() => setPendingNsPropagate(null)}
                                className="shrink-0 text-teal-500 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-200 transition"
                                title="Dismiss"
                            >
                                <FaTimes size={11} />
                            </button>
                        </div>
                    )}

                    {isInline && (
                        <>
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-500 dark:text-gray-300 w-24 shrink-0">Nested Under</label>
                                <span className="text-xs font-mono text-violet-300 bg-violet-900/20 border border-violet-800 px-2 py-1 rounded">
                                    {parentXmlName || '(none)'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-500 dark:text-gray-300 w-24 shrink-0">Embed</label>
                                <button
                                    onClick={() => onChange({ ...mapping, embed: !mapping.embed })}
                                    className={`px-2 py-1 rounded text-xs font-medium border transition ${
                                        mapping.embed
                                            ? 'border-violet-600 bg-violet-900/40 text-violet-300 hover:border-violet-400'
                                            : 'border-slate-500 bg-slate-700 text-gray-500 hover:border-slate-400'
                                    }`}
                                    title="When enabled, skip the wrapper element and embed columns directly into the parent"
                                >
                                    {mapping.embed ? 'Enabled' : 'Disabled'}
                                </button>
                            </div>
                        </>
                    )}

                    {isElems && (
                        <>
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-500 dark:text-gray-300 w-24 shrink-0">Wrap In Parent</label>
                                <button
                                    onClick={toggleWrapInParent}
                                    className={`px-2 py-1 rounded text-xs font-medium border transition ${
                                        wrapInParent
                                            ? 'border-cyan-600 bg-cyan-900/40 text-cyan-300 hover:border-cyan-400'
                                            : 'border-slate-500 bg-slate-700 text-gray-500 hover:border-slate-400'
                                    }`}
                                >
                                    {wrapInParent ? 'Enabled' : 'Disabled'}
                                </button>
                            </div>
                            {wrapInParent && (
                                <div className="flex items-center gap-2">
                                    <label className="text-xs text-gray-500 dark:text-gray-300 w-24 shrink-0">Wrapper Name</label>
                                    <span className="text-xs text-gray-500">&lt;</span>
                                    <input
                                        value={mapping.wrapperElementName ?? ''}
                                        onChange={e => onChange({ ...mapping, wrapperElementName: e.target.value })}
                                        placeholder="wrapperElement"
                                        className="flex-1 min-w-0 bg-white border border-gray-300 rounded px-2 py-1 text-xs font-mono text-gray-800 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:bg-slate-700 dark:border-slate-500 dark:text-white"
                                    />
                                    <span className="text-xs text-gray-500">&gt;</span>
                                </div>
                            )}
                        </>
                    )}

                    {isCustom && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-500 dark:text-gray-300 w-24 shrink-0">Return Type</label>
                                <select
                                    value={mapping.xmlType ?? 'xs:string'}
                                    onChange={e => onChange({ ...mapping, xmlType: e.target.value as XmlSchemaType })}
                                    className={`rounded font-mono text-xs px-1.5 py-0.5 border-0 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer ${XML_TYPE_COLOR[mapping.xmlType ?? 'xs:string'] ?? 'bg-slate-700 text-gray-400'}`}
                                >
                                    {XSD_TYPES.map(t => (
                                        <option key={t} value={t} className="bg-slate-800 text-gray-200">{t}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">
                                    JavaScript Function
                                    <span className="text-gray-600 ml-1">
                                        — use <code className="text-amber-300">row.columnName</code> to access columns
                                    </span>
                                </label>
                                <JsFunctionEditor
                                    value={mapping.customFunction ?? ''}
                                    onChange={v => onChange({ ...mapping, customFunction: v })}
                                    fieldNames={availableFieldNames}
                                    minLines={6}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Column rows ───────────────────────────────────────────────── */}
            {/* Drop zone covers the whole column list area */}
            <div onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) resetDrag(); }}>
                {mapping.columns.length === 0 && (
                    <div className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 italic">
                        {isCustom ? 'No field references' : 'No columns — all removed'}
                    </div>
                )}

                {mapping.columns.map((col, i) => {
                    const isRef        = col.mappingType === 'CUSTOM';
                    const isCustomCol  = col.sourceColumn === '';
                    const isDragging   = dragIndex === i;

                    return (
                        <React.Fragment key={`col-${i}-${col.sourceColumn}`}>
                            {/* Insert indicator ABOVE row i */}
                            <DropLine before={i} />

                            <div
                                draggable
                                onDragStart={e => handleDragStart(e, i)}
                                onDragOver={e => handleDragOver(e, i)}
                                onDrop={e => handleDrop(e, i)}
                                onDragEnd={resetDrag}
                                className={`flex items-center gap-2 px-2 py-1.5 text-xs border-t border-gray-100 dark:border-slate-600/40 transition-colors group select-none ${
                                    isDragging
                                        ? 'opacity-30 bg-gray-200/50 dark:bg-slate-500/30'
                                        : 'hover:bg-gray-50 dark:hover:bg-slate-600/50'
                                }`}
                            >
                                {/* Grip handle — only this activates drag */}
                                <span
                                    title="Drag to reorder"
                                    className="shrink-0 text-gray-400 hover:text-gray-200 cursor-grab active:cursor-grabbing"
                                    onMouseDown={() => { gripPressed.current = true; }}
                                    onMouseUp={() => { gripPressed.current = false; }}
                                >
                                    <FaGripVertical size={10} />
                                </span>

                                {/* Element / Attr toggle (or Ref badge) */}
                                {isRef ? (
                                    <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border border-amber-700 bg-amber-900/20 text-amber-400">
                                        <FaLink size={8} />
                                        <span>Ref</span>
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => toggleColumnType(i)}
                                        title={col.mappingType === 'Element' ? 'Switch to ElementAttribute' : 'Switch to Element'}
                                        className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition border ${
                                            col.mappingType === 'Element'
                                                ? 'border-gray-400 bg-gray-100 text-gray-700 hover:border-cyan-500 dark:border-slate-500 dark:bg-slate-800 dark:text-gray-300 dark:hover:border-cyan-500'
                                                : 'border-cyan-500 bg-cyan-50 text-cyan-700 hover:border-cyan-600 dark:border-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-300 dark:hover:border-cyan-400'
                                        }`}
                                    >
                                        {col.mappingType === 'Element'
                                            ? <FaLayerGroup size={9} />
                                            : <FaTag size={9} />
                                        }
                                        <span>{MAPPING_TYPE_LABELS[col.mappingType]}</span>
                                    </button>
                                )}

                                {/* Namespace prefix picker (column level) */}
                                {!isRef && namespaces.length > 0 && (
                                    <select
                                        value={col.namespacePrefix ?? ''}
                                        onChange={e => {
                                            const val = e.target.value || undefined;
                                            onChange({ ...mapping, columns: mapping.columns.map((c, ci) => ci !== i ? c : { ...c, namespacePrefix: val }) });
                                        }}
                                        onMouseDown={e => e.stopPropagation()}
                                        title="Namespace prefix"
                                        className="shrink-0 bg-transparent border border-slate-500 rounded px-1 py-0.5 text-xs font-mono text-teal-500 dark:text-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
                                    >
                                        <option value="">ns</option>
                                        {namespaces.filter(ns => ns.prefix).map(ns => (
                                            <option key={ns.prefix} value={ns.prefix}>{ns.prefix}</option>
                                        ))}
                                    </select>
                                )}

                                {/* XML name */}
                                <input
                                    value={col.xmlName}
                                    onChange={e => updateXmlName(i, e.target.value)}
                                    readOnly={isRef}
                                    onMouseDown={e => e.stopPropagation()}
                                    className={`flex-1 min-w-0 bg-transparent font-mono text-gray-800 dark:text-white focus:outline-none rounded px-1 ${
                                        isRef ? 'text-gray-400 cursor-default' : 'focus:ring-1 focus:ring-cyan-500'
                                    }`}
                                />

                                {/* Custom badge */}
                                {isCustomCol && (
                                    <span className="shrink-0 px-1.5 py-0.5 rounded text-xs border border-dashed border-slate-500 text-gray-400 italic">
                                        custom
                                    </span>
                                )}

                                {/* DB column info toggle */}
                                {!isCustomCol && !isRef && (
                                    <button
                                        onClick={() => setExpandedSourceIndex(expandedSourceIndex === i ? -1 : i)}
                                        onMouseDown={e => e.stopPropagation()}
                                        title={expandedSourceIndex === i ? 'Hide source info' : 'Show source column info'}
                                        className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border transition ${
                                            expandedSourceIndex === i
                                                ? 'border-slate-400 bg-slate-600 text-gray-300'
                                                : 'border-slate-600 text-gray-400 hover:text-gray-200 hover:border-slate-500'
                                        }`}
                                    >
                                        <FaDatabase size={8} />
                                    </button>
                                )}

                                {/* Fn expand toggle — custom fields only */}
                                {isCustomCol && (
                                    <button
                                        onClick={() => setExpandedFnIndex(expandedFnIndex === i ? -1 : i)}
                                        onMouseDown={e => e.stopPropagation()}
                                        title={expandedFnIndex === i ? 'Close function editor' : 'Edit JavaScript function'}
                                        className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border transition ${
                                            expandedFnIndex === i
                                                ? 'border-amber-600 bg-amber-900/30 text-amber-300'
                                                : 'border-slate-600 text-gray-400 hover:text-amber-300 hover:border-amber-700'
                                        }`}
                                    >
                                        <span className="font-serif font-bold text-sm leading-none">ƒ</span>
                                    </button>
                                )}

                                {/* Remove — revealed on hover */}
                                <button
                                    onClick={() => removeColumn(i)}
                                    title="Remove this column"
                                    className="shrink-0 text-gray-400 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                                >
                                    <FaTimes size={10} />
                                </button>
                            </div>

                            {/* Relational info panel — DB columns only */}
                            {!isCustomCol && !isRef && expandedSourceIndex === i && (
                                <div className="px-3 py-2 bg-gray-50 dark:bg-slate-800/60 border-t border-gray-100 dark:border-slate-600/50 flex items-center gap-4">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-gray-500 dark:text-gray-400">Column</span>
                                        <span className="text-xs font-mono text-gray-700 bg-gray-100 dark:text-gray-300 dark:bg-slate-700 px-1.5 py-0.5 rounded" title={col.sourceColumn}>
                                            {col.sourceColumn}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-gray-500 dark:text-gray-400">Type</span>
                                        <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${XML_TYPE_COLOR[col.xmlType] ?? 'bg-slate-700 text-gray-400'}`}>
                                            {col.xmlType}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Inline function editor */}
                            {isCustomCol && expandedFnIndex === i && (
                                <div className="px-3 pb-2 pt-1 bg-gray-50 dark:bg-slate-800/60 border-t border-amber-100 dark:border-amber-900/40">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs text-gray-500 dark:text-gray-400">Return Type</span>
                                        <select
                                            value={col.xmlType}
                                            onChange={e => {
                                                const next = e.target.value as XmlSchemaType;
                                                onChange({ ...mapping, columns: mapping.columns.map((c, ci) => ci !== i ? c : { ...c, xmlType: next }) });
                                            }}
                                            onMouseDown={e => e.stopPropagation()}
                                            className={`rounded font-mono text-xs px-1 py-0.5 border-0 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer ${XML_TYPE_COLOR[col.xmlType] ?? 'bg-slate-700 text-gray-400'}`}
                                        >
                                            {XSD_TYPES.map(t => (
                                                <option key={t} value={t} className="bg-slate-800 text-gray-200">{t}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <label className="block text-xs text-gray-500 mb-1">
                                        JavaScript Function
                                        <span className="text-gray-600 ml-1">— return the computed value for <code className="text-amber-300">{col.xmlName || 'this field'}</code></span>
                                    </label>
                                    <JsFunctionEditor
                                        value={col.customFunction ?? ''}
                                        onChange={v => updateColumnFn(i, v)}
                                        fieldNames={availableFieldNames}
                                        minLines={5}
                                        placeholder={`// return the value for ${col.xmlName || 'this field'}\nreturn null;`}
                                    />
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}

                {/* Drop zone after the last row */}
                {mapping.columns.length > 0 && (
                    <div
                        className="h-2"
                        onDragOver={handleDragOverEnd}
                        onDrop={e => handleDrop(e, mapping.columns.length)}
                    >
                        <DropLine before={mapping.columns.length} />
                    </div>
                )}

                {/* Add custom field */}
                <div className="px-2 py-2 border-t border-gray-100 dark:border-slate-600/40">
                    <button
                        onClick={addCustomField}
                        onMouseDown={e => e.stopPropagation()}
                        title="Add a custom field not sourced from a DB column"
                        className="flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-dashed border-slate-400 text-slate-500 hover:border-cyan-500 hover:text-cyan-600 hover:bg-cyan-50 dark:border-slate-500 dark:text-slate-300 dark:hover:border-cyan-500 dark:hover:text-cyan-300 dark:hover:bg-cyan-900/20 transition"
                    >
                        <FaPlus size={8} />
                        <span>Add custom field</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
