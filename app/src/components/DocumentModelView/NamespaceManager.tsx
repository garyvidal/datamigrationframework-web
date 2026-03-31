// NamespaceManager — Collapsible UI for declaring XML namespaces (default and prefixed) used across the document mapping.
import React, { useState } from 'react';
import { FaTimes, FaPlus, FaGlobe } from 'react-icons/fa';
import type { XmlNamespace } from '@/services/ProjectService';

interface NamespaceManagerProps {
    namespaces: XmlNamespace[];
    onChange: (namespaces: XmlNamespace[]) => void;
}

export default function NamespaceManager({ namespaces, onChange }: NamespaceManagerProps) {
    const [collapsed, setCollapsed] = useState(true);

    // Default namespace: the entry with prefix === '' (at most one)
    const defaultNs = namespaces.find(ns => ns.prefix === '');
    // Prefixed namespaces: all entries with a non-empty prefix
    const prefixedNs = namespaces.filter(ns => ns.prefix !== '');

    const setDefaultUri = (uri: string) => {
        if (uri) {
            // Update existing or prepend new default entry
            if (defaultNs) {
                onChange(namespaces.map(ns => ns.prefix === '' ? { ...ns, uri } : ns));
            } else {
                onChange([{ prefix: '', uri }, ...prefixedNs]);
            }
        } else {
            // Remove the default namespace entry
            onChange(prefixedNs);
        }
    };

    const addRow = () => {
        onChange([...namespaces, { prefix: '', uri: '' }]);
        setCollapsed(false);
    };

    const removePrefixed = (index: number) => {
        onChange([
            ...(defaultNs ? [defaultNs] : []),
            ...prefixedNs.filter((_, i) => i !== index),
        ]);
    };

    const updatePrefix = (index: number, value: string) => {
        const updated = prefixedNs.map((ns, i) => i !== index ? ns : { ...ns, prefix: value });
        onChange([...(defaultNs ? [defaultNs] : []), ...updated]);
    };

    const updateUri = (index: number, value: string) => {
        const updated = prefixedNs.map((ns, i) => i !== index ? ns : { ...ns, uri: value });
        onChange([...(defaultNs ? [defaultNs] : []), ...updated]);
    };

    const addPrefixedRow = () => {
        onChange([...(defaultNs ? [defaultNs] : []), ...prefixedNs, { prefix: 'xmlns', uri: '' }]);
        setCollapsed(false);
    };

    const validCount = (defaultNs?.uri ? 1 : 0) + prefixedNs.filter(ns => ns.prefix && ns.uri).length;

    return (
        <div className="rounded border border-gray-200 dark:border-slate-600 overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setCollapsed(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-slate-800/70 hover:bg-gray-100 dark:hover:bg-slate-700/70 transition text-left"
            >
                <div className="flex items-center gap-2">
                    <FaGlobe size={11} className="text-teal-500 dark:text-teal-400 shrink-0" />
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        XML Namespaces
                    </span>
                    {validCount > 0 && (
                        <span className="text-xs text-teal-600 dark:text-teal-400 font-mono">
                            ({validCount})
                        </span>
                    )}
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-300">{collapsed ? '▸' : '▾'}</span>
            </button>

            {!collapsed && (
                <div className="bg-white dark:bg-slate-800 px-3 py-2 space-y-1.5">

                    {/* Default namespace row — always shown */}
                    <div className="flex items-center gap-2">
                        <span className="w-20 shrink-0 text-xs font-mono text-gray-500 dark:text-gray-300 px-2 py-1 bg-gray-100 dark:bg-slate-700 rounded border border-gray-200 dark:border-slate-600 text-center select-none">
                            xmlns
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-400 shrink-0">=</span>
                        <input
                            value={defaultNs?.uri ?? ''}
                            onChange={e => setDefaultUri(e.target.value)}
                            placeholder="http://example.com/default (optional)"
                            spellCheck={false}
                            className="flex-1 min-w-0 bg-gray-50 border border-gray-300 rounded px-2 py-1 text-xs font-mono text-gray-800 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:bg-slate-700 dark:border-slate-500 dark:text-white"
                        />
                        {defaultNs?.uri && (
                            <button
                                onClick={() => setDefaultUri('')}
                                title="Clear default namespace"
                                className="shrink-0 text-gray-400 hover:text-red-400 transition"
                            >
                                <FaTimes size={11} />
                            </button>
                        )}
                    </div>

                    {/* Divider */}
                    {prefixedNs.length > 0 && (
                        <div className="border-t border-gray-100 dark:border-slate-700 pt-1" />
                    )}

                    {/* Prefixed namespace rows */}
                    {prefixedNs.map((ns, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input
                                value={ns.prefix}
                                onChange={e => updatePrefix(i, e.target.value)}
                                placeholder="prefix"
                                spellCheck={false}
                                className="w-20 shrink-0 bg-gray-50 border border-gray-300 rounded px-2 py-1 text-xs font-mono text-gray-800 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:bg-slate-700 dark:border-slate-500 dark:text-white"
                            />
                            <span className="text-xs text-gray-400 dark:text-gray-400 shrink-0">=</span>
                            <input
                                value={ns.uri}
                                onChange={e => updateUri(i, e.target.value)}
                                placeholder="http://example.com/ns"
                                spellCheck={false}
                                className="flex-1 min-w-0 bg-gray-50 border border-gray-300 rounded px-2 py-1 text-xs font-mono text-gray-800 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:bg-slate-700 dark:border-slate-500 dark:text-white"
                            />
                            <button
                                onClick={() => removePrefixed(i)}
                                title="Remove namespace"
                                className="shrink-0 text-gray-400 hover:text-red-400 transition"
                            >
                                <FaTimes size={11} />
                            </button>
                        </div>
                    ))}

                    <button
                        onClick={addPrefixedRow}
                        className="flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-dashed border-slate-400 text-slate-500 hover:border-teal-500 hover:text-teal-500 hover:bg-teal-50 dark:border-slate-600 dark:text-slate-400 dark:hover:border-teal-500 dark:hover:text-teal-400 dark:hover:bg-teal-900/20 transition"
                    >
                        <FaPlus size={8} />
                        Add prefix namespace
                    </button>
                </div>
            )}
        </div>
    );
}
