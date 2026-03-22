// SyntheticJoinDialog — Portal dialog for creating synthetic (non-FK) joins between tables, with type-compatibility validation.
import React, { useState, useMemo } from 'react';
import * as ReactDOM from 'react-dom';
import { FaTimes, FaLink, FaPlus } from 'react-icons/fa';
import type { ProjectData, SyntheticJoin, JoinCondition, JoinType } from '@/services/ProjectService';

// ── SQL type family ───────────────────────────────────────────────────────────

type SqlTypeFamily = 'integer' | 'decimal' | 'string' | 'date' | 'datetime' | 'time' | 'boolean' | 'binary' | 'other';

const INTEGER_TYPES  = new Set(['INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'INT2', 'INT4', 'INT8', 'INT16',
    'MEDIUMINT', 'YEAR', 'SERIAL', 'BIGSERIAL', 'SMALLSERIAL', 'INT64', 'UINT64', 'BYTEINT']);
const DECIMAL_TYPES  = new Set(['DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL', 'MONEY', 'SMALLMONEY',
    'FLOAT4', 'FLOAT8', 'DOUBLE PRECISION', 'NUMBER']);
const STRING_TYPES   = new Set(['VARCHAR', 'CHAR', 'NVARCHAR', 'NCHAR', 'TEXT', 'CLOB', 'NCLOB', 'STRING',
    'MEDIUMTEXT', 'LONGTEXT', 'TINYTEXT', 'CHARACTER VARYING', 'CHARACTER', 'VARCHAR2', 'NVARCHAR2']);
const DATE_TYPES     = new Set(['DATE']);
const DATETIME_TYPES = new Set(['DATETIME', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE', 'TIMESTAMPTZ']);
const TIME_TYPES     = new Set(['TIME', 'TIMETZ', 'TIME WITH TIME ZONE']);
const BOOLEAN_TYPES  = new Set(['BOOLEAN', 'BOOL', 'BIT']);
const BINARY_TYPES   = new Set(['BINARY', 'VARBINARY', 'BLOB', 'BYTEA', 'MEDIUMBLOB', 'LONGBLOB', 'IMAGE', 'RAW']);

function getSqlTypeFamily(sqlType: string): SqlTypeFamily {
    const upper = sqlType.toUpperCase().split('(')[0].trim();
    if (INTEGER_TYPES.has(upper))  return 'integer';
    if (DECIMAL_TYPES.has(upper))  return 'decimal';
    if (STRING_TYPES.has(upper))   return 'string';
    if (DATE_TYPES.has(upper))     return 'date';
    if (DATETIME_TYPES.has(upper)) return 'datetime';
    if (TIME_TYPES.has(upper))     return 'time';
    if (BOOLEAN_TYPES.has(upper))  return 'boolean';
    if (BINARY_TYPES.has(upper))   return 'binary';
    return 'other';
}

function typesCompatible(a: string, b: string): boolean {
    return getSqlTypeFamily(a) === getSqlTypeFamily(b);
}

// ── Join type options ─────────────────────────────────────────────────────────

const JOIN_TYPE_OPTIONS: { value: JoinType; label: string }[] = [
    { value: 'equals',             label: '='    },
    { value: 'notEquals',          label: '≠'    },
    { value: 'lessThan',           label: '<'    },
    { value: 'lessThanOrEqual',    label: '≤'    },
    { value: 'greaterThan',        label: '>'    },
    { value: 'greaterThanOrEqual', label: '≥'    },
    { value: 'like',               label: 'LIKE' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface NodeOption {
    id: string;
    schemaName: string;
    tableName: string;
    label: string;
}

interface ColInfo {
    name: string;
    type: string;
}

function parseNodeOptions(ids: string[]): NodeOption[] {
    return ids.map(id => {
        const dot = id.indexOf('.');
        return {
            id,
            schemaName: id.substring(0, dot),
            tableName:  id.substring(dot + 1),
            label:      id,
        };
    });
}

function getTableCols(project: ProjectData, schemaName: string, tableName: string): ColInfo[] {
    return Object.values(project.schemas[schemaName]?.tables?.[tableName]?.columns ?? {})
        .map(c => ({ name: c.name, type: c.type ?? '' }));
}

// ── Component ─────────────────────────────────────────────────────────────────

interface SyntheticJoinDialogProps {
    project: ProjectData;
    visibleNodeIds: string[];
    onConfirm: (join: SyntheticJoin) => void;
    onCancel: () => void;
}

const EMPTY_CONDITION: JoinCondition = { sourceColumn: '', joinType: 'equals', targetColumn: '' };

export default function SyntheticJoinDialog({ project, visibleNodeIds, onConfirm, onCancel }: SyntheticJoinDialogProps) {
    const nodeOptions = useMemo(() => parseNodeOptions(visibleNodeIds), [visibleNodeIds]);

    const [sourceId, setSourceId] = useState(nodeOptions[0]?.id ?? '');
    const [targetId, setTargetId] = useState('');
    const [conditions, setConditions] = useState<JoinCondition[]>([{ ...EMPTY_CONDITION }]);

    const sourceNode = nodeOptions.find(n => n.id === sourceId);
    const targetNode = nodeOptions.find(n => n.id === targetId);

    const sourceCols = useMemo(
        () => sourceNode ? getTableCols(project, sourceNode.schemaName, sourceNode.tableName) : [],
        [project, sourceNode],
    );
    const targetCols = useMemo(
        () => targetNode ? getTableCols(project, targetNode.schemaName, targetNode.tableName) : [],
        [project, targetNode],
    );

    // When source table changes, clear conditions' columns
    const handleSourceChange = (id: string) => {
        setSourceId(id);
        setConditions(prev => prev.map(c => ({ ...c, sourceColumn: '', targetColumn: '' })));
    };

    // When target table changes, clear conditions' target columns
    const handleTargetChange = (id: string) => {
        setTargetId(id);
        setConditions(prev => prev.map(c => ({ ...c, targetColumn: '' })));
    };

    const updateCondition = (index: number, patch: Partial<JoinCondition>) => {
        setConditions(prev => prev.map((c, i) => {
            if (i !== index) return c;
            const updated = { ...c, ...patch };
            // If source column changed, clear target column
            if (patch.sourceColumn !== undefined && patch.sourceColumn !== c.sourceColumn) {
                updated.targetColumn = '';
            }
            return updated;
        }));
    };

    const addCondition    = () => setConditions(prev => [...prev, { ...EMPTY_CONDITION }]);
    const removeCondition = (i: number) => setConditions(prev => prev.filter((_, idx) => idx !== i));

    const canSubmit =
        sourceId &&
        targetId &&
        sourceId !== targetId &&
        conditions.length > 0 &&
        conditions.every(c => c.sourceColumn && c.targetColumn);

    const handleConfirm = () => {
        if (!canSubmit || !sourceNode || !targetNode) return;
        onConfirm({
            id: `synth-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            sourceSchema: sourceNode.schemaName,
            sourceTable:  sourceNode.tableName,
            targetSchema: targetNode.schemaName,
            targetTable:  targetNode.tableName,
            conditions,
        });
    };

    const targetOptions = nodeOptions.filter(n => n.id !== sourceId);

    const selectClass = 'bg-white border border-gray-300 dark:bg-slate-800 dark:border-slate-500 rounded px-2 py-1.5 text-xs text-gray-800 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed';

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onCancel}>
            <div
                className="bg-white dark:bg-slate-700 rounded-lg shadow-2xl border border-gray-200 dark:border-slate-500 w-[680px] p-5"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white">
                        <FaLink size={12} className="text-cyan-400" />
                        Create Synthetic Join
                    </div>
                    <button onClick={onCancel} className="text-gray-400 hover:text-gray-700 dark:hover:text-white transition">
                        <FaTimes size={14} />
                    </button>
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    Define join conditions between two tables with no foreign-key relationship.
                    Only columns with compatible SQL types can be selected as the target.
                </p>

                {/* Table selection row */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Source Table</label>
                        <select
                            value={sourceId}
                            onChange={e => handleSourceChange(e.target.value)}
                            className={`w-full ${selectClass}`}
                        >
                            {nodeOptions.map(n => (
                                <option key={n.id} value={n.id}>{n.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Target Table</label>
                        <select
                            value={targetId}
                            onChange={e => handleTargetChange(e.target.value)}
                            className={`w-full ${selectClass}`}
                        >
                            <option value="">— select —</option>
                            {targetOptions.map(n => (
                                <option key={n.id} value={n.id}>{n.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Column header */}
                <div className="grid grid-cols-[1fr_80px_1fr_24px] gap-2 px-1 mb-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate">
                        {sourceNode ? sourceNode.tableName : 'Source Column'}
                    </span>
                    <span className="text-xs text-gray-500 font-medium text-center">Condition</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate">
                        {targetNode ? targetNode.tableName : 'Target Column'}
                    </span>
                    <span />
                </div>

                {/* Condition rows */}
                <div className="space-y-2 mb-3">
                    {conditions.map((cond, i) => {
                        const srcColType = sourceCols.find(c => c.name === cond.sourceColumn)?.type ?? '';
                        const enrichedTargetCols = targetCols.map(c => ({
                            ...c,
                            compatible: !srcColType || typesCompatible(srcColType, c.type),
                        }));

                        return (
                            <div key={i} className="grid grid-cols-[1fr_80px_1fr_24px] gap-2 items-center">
                                {/* Source column */}
                                <select
                                    value={cond.sourceColumn}
                                    onChange={e => updateCondition(i, { sourceColumn: e.target.value })}
                                    disabled={sourceCols.length === 0}
                                    className={selectClass}
                                >
                                    <option value="">— column —</option>
                                    {sourceCols.map(c => (
                                        <option key={c.name} value={c.name}>{c.name}</option>
                                    ))}
                                </select>

                                {/* Join type */}
                                <select
                                    value={cond.joinType}
                                    onChange={e => updateCondition(i, { joinType: e.target.value as JoinType })}
                                    className={`${selectClass} text-center font-bold text-cyan-300`}
                                >
                                    {JOIN_TYPE_OPTIONS.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>

                                {/* Target column */}
                                <select
                                    value={cond.targetColumn}
                                    onChange={e => updateCondition(i, { targetColumn: e.target.value })}
                                    disabled={!targetId || targetCols.length === 0}
                                    className={selectClass}
                                    title={!cond.sourceColumn ? 'Select a source column first' : undefined}
                                >
                                    <option value="">— column —</option>
                                    {enrichedTargetCols.map(c => (
                                        <option
                                            key={c.name}
                                            value={c.name}
                                            disabled={!c.compatible}
                                            className={c.compatible ? '' : 'text-gray-500'}
                                        >
                                            {c.name}{!c.compatible ? ' (incompatible)' : ''}
                                        </option>
                                    ))}
                                </select>

                                {/* Remove */}
                                <button
                                    onClick={() => removeCondition(i)}
                                    disabled={conditions.length === 1}
                                    title="Remove this condition"
                                    className="flex items-center justify-center text-gray-500 hover:text-red-400 transition disabled:opacity-20 disabled:cursor-not-allowed"
                                >
                                    <FaTimes size={11} />
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* Add condition */}
                <button
                    onClick={addCondition}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-dashed border-slate-500 text-slate-300 hover:border-cyan-500 hover:text-cyan-300 hover:bg-cyan-900/20 transition mb-4"
                >
                    <FaPlus size={8} />
                    Add condition
                </button>

                {/* Actions */}
                <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-slate-600 pt-4">
                    <button
                        onClick={onCancel}
                        className="px-4 py-1.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-slate-600 rounded hover:bg-gray-200 dark:hover:bg-slate-500 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!canSubmit}
                        className="px-4 py-1.5 text-sm font-semibold rounded transition
                            enabled:bg-cyan-700 enabled:hover:bg-cyan-600 enabled:text-white
                            disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-slate-600 dark:disabled:text-gray-500 disabled:cursor-not-allowed"
                    >
                        Create Join
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
