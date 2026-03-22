// JsonPreview — Syntax-highlighted JSON preview panel generated from the current table mappings; includes copy-to-clipboard.
import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { FaCopy, FaCheck } from 'react-icons/fa';
import type { ProjectMapping, JsonTableMapping } from '@/services/ProjectService';

// ── JSON Structure Generation ─────────────────────────────────────────────────

function buildObject(
    table: JsonTableMapping,
    inlinesByParent: Map<string, JsonTableMapping[]>,
    childArrays?: JsonTableMapping[],
): Record<string, unknown> {
    const obj: Record<string, unknown> = {};

    for (const col of table.columns) {
        if (col.mappingType === 'CUSTOM') {
            obj[col.jsonKey] = '/* custom */';
        } else {
            obj[col.jsonKey] = col.jsonType === 'number' ? 0 : col.jsonType === 'boolean' ? false : `{${col.sourceColumn}}`;
        }
    }

    // Inline children
    for (const inline of inlinesByParent.get(table.id ?? '') ?? []) {
        obj[inline.jsonName] = buildObject(inline, inlinesByParent);
    }

    // Top-level Array children
    for (const child of childArrays ?? []) {
        if (child.mappingType === 'Array') {
            obj[child.jsonName] = [buildObject(child, inlinesByParent)];
        }
    }

    return obj;
}

function generateJson(jsonDocModel: NonNullable<ProjectMapping['jsonDocumentModel']>): string {
    const { root, elements } = jsonDocModel;
    if (!root) return JSON.stringify({ _comment: 'No root object defined' }, null, 2);

    const allElements = elements ?? [];

    const inlinesByParent = new Map<string, JsonTableMapping[]>();
    for (const el of allElements) {
        if (el.mappingType === 'InlineObject' && el.parentRef) {
            const arr = inlinesByParent.get(el.parentRef) ?? [];
            arr.push(el);
            inlinesByParent.set(el.parentRef, arr);
        }
    }

    const topLevelChildren = allElements.filter(e => e.mappingType !== 'InlineObject');
    const doc = buildObject(root, inlinesByParent, topLevelChildren);

    return JSON.stringify(doc, null, 2);
}

// ── Syntax Highlighting ───────────────────────────────────────────────────────

type TokenKind = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punct' | 'placeholder' | 'ws';

interface JsonToken { kind: TokenKind; value: string }

function tokenizeLine(line: string): JsonToken[] {
    const tokens: JsonToken[] = [];
    let rest = line;

    const push = (kind: TokenKind, value: string) => { if (value) tokens.push({ kind, value }); };

    while (rest.length > 0) {
        // Leading whitespace
        const ws = rest.match(/^(\s+)/);
        if (ws) { push('ws', ws[1]); rest = rest.slice(ws[1].length); continue; }

        // Object key: "key":
        const keyMatch = rest.match(/^("(?:[^"\\]|\\.)*")(\s*:)/);
        if (keyMatch) {
            push('key', keyMatch[1]);
            push('punct', keyMatch[2]);
            rest = rest.slice(keyMatch[0].length);
            continue;
        }

        // String value with possible placeholder
        const strMatch = rest.match(/^("(?:[^"\\]|\\.)*")/);
        if (strMatch) {
            const raw = strMatch[1];
            const inner = raw.slice(1, -1);
            const phMatch = inner.match(/^(\{[^}]*\})$/);
            if (phMatch) {
                push('punct', '"');
                push('placeholder', phMatch[1]);
                push('punct', '"');
            } else if (inner === '/* custom */') {
                push('string', raw);
            } else {
                push('string', raw);
            }
            rest = rest.slice(raw.length);
            continue;
        }

        // Number
        const numMatch = rest.match(/^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
        if (numMatch) { push('number', numMatch[1]); rest = rest.slice(numMatch[1].length); continue; }

        // Boolean / null
        const boolMatch = rest.match(/^(true|false|null)/);
        if (boolMatch) { push('boolean', boolMatch[1]); rest = rest.slice(boolMatch[1].length); continue; }

        // Punctuation
        push('punct', rest[0]);
        rest = rest.slice(1);
    }

    return tokens;
}

const TOKEN_CLASS: Record<TokenKind, string> = {
    key:         'text-cyan-300',
    string:      'text-green-400',
    number:      'text-purple-300',
    boolean:     'text-yellow-300',
    null:        'text-gray-500',
    punct:       'text-slate-400',
    placeholder: 'text-amber-300 font-semibold',
    ws:          '',
};

export function HighlightedJson({ json }: { json: string }) {
    const lines = json.split('\n');
    return (
        <code className="text-xs font-mono leading-5 block">
            {lines.map((line, lineIdx) => {
                const tokens = tokenizeLine(line);
                return (
                    <div key={lineIdx} className="flex">
                        <span className="select-none text-slate-600 text-right pr-4 w-8 shrink-0">{lineIdx + 1}</span>
                        <span className="whitespace-pre">
                            {tokens.map((tok, ti) => (
                                <span key={ti} className={TOKEN_CLASS[tok.kind] ?? ''}>{tok.value}</span>
                            ))}
                        </span>
                    </div>
                );
            })}
        </code>
    );
}

// ── JsonPreview component ─────────────────────────────────────────────────────

interface JsonPreviewProps {
    mapping: ProjectMapping;
    onClose: () => void;
}

export default function JsonPreview({ mapping, onClose }: JsonPreviewProps) {
    const json = useMemo(() => {
        if (!mapping.jsonDocumentModel) return '{}';
        return generateJson(mapping.jsonDocumentModel);
    }, [mapping]);

    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(json).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return ReactDOM.createPortal(
        <div
            className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-8"
            onClick={onClose}
        >
            <div
                className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl flex flex-col w-full max-w-3xl"
                style={{ maxHeight: 'calc(100vh - 6rem)' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700 shrink-0">
                    <span className="text-sm font-semibold text-gray-200">JSON Preview</span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCopy}
                            title="Copy JSON to clipboard"
                            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border transition ${
                                copied
                                    ? 'border-green-600 text-green-400 bg-green-900/20'
                                    : 'border-slate-600 text-gray-400 hover:border-slate-400 hover:text-white'
                            }`}
                        >
                            {copied ? <FaCheck size={10} /> : <FaCopy size={10} />}
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-gray-200 transition px-1 text-sm"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-4 min-h-0">
                    <HighlightedJson json={json} />
                </div>
            </div>
        </div>,
        document.body,
    );
}
