// XmlPreview — Syntax-highlighted XML preview panel generated from the current table mappings; includes copy-to-clipboard.
import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { FaCopy, FaCheck } from 'react-icons/fa';
import type { ProjectMapping, XmlTableMapping } from '@/services/ProjectService';

// ── XML Generation ────────────────────────────────────────────────────────────

function renderTableToLines(
    table: XmlTableMapping,
    indent: number,
    inlinesByParent: Map<string, XmlTableMapping[]>,
    childElements?: XmlTableMapping[],
): string[] {
    const pad      = '    '.repeat(indent);
    const innerPad = '    '.repeat(indent + 1);
    const lines: string[] = [];

    const attrCols   = table.columns.filter(c => c.mappingType === 'ElementAttribute');
    const elemCols   = table.columns.filter(c => c.mappingType !== 'ElementAttribute');
    const inlineKids = inlinesByParent.get(table.id ?? '') ?? [];
    const topKids    = childElements ?? [];
    const normalKids = topKids.filter(e => e.mappingType !== 'CUSTOM');
    const customKids = topKids.filter(e => e.mappingType === 'CUSTOM');

    const attrStr    = attrCols.map(a => ` ${a.xmlName}="{${a.sourceColumn}}"`).join('');
    const hasChildren = elemCols.length > 0 || inlineKids.length > 0 || topKids.length > 0;

    if (!hasChildren) {
        lines.push(`${pad}<${table.xmlName}${attrStr}/>`);
        return lines;
    }

    lines.push(`${pad}<${table.xmlName}${attrStr}>`);

    for (const col of elemCols) {
        const val = col.sourceColumn ? `{${col.sourceColumn}}` : '{computed}';
        lines.push(`${innerPad}<${col.xmlName}>${val}</${col.xmlName}>`);
    }

    for (const inline of inlineKids) {
        lines.push(...renderTableToLines(inline, indent + 1, inlinesByParent));
    }

    for (const el of normalKids) {
        if (el.mappingType === 'Elements') {
            if (el.wrapInParent && el.wrapperElementName) {
                lines.push(`${innerPad}<${el.wrapperElementName}>`);
                lines.push(...renderTableToLines(el, indent + 2, inlinesByParent));
                lines.push(`${innerPad}</${el.wrapperElementName}>`);
            } else {
                lines.push(...renderTableToLines(el, indent + 1, inlinesByParent));
            }
        }
        // InlineElements are rendered via inlinesByParent — skip here
    }

    for (const custom of customKids) {
        const name = custom.xmlName || 'custom';
        lines.push(`${innerPad}<${name}>{/* custom function */}</${name}>`);
    }

    lines.push(`${pad}</${table.xmlName}>`);
    return lines;
}

function generateXml(documentModel: ProjectMapping['documentModel']): string {
    const { root, elements } = documentModel;
    if (!root) return '<!-- No root element defined -->';

    const allElements = elements ?? [];

    const inlinesByParent = new Map<string, XmlTableMapping[]>();
    for (const el of allElements) {
        if (el.mappingType === 'InlineElement' && el.parentRef) {
            const arr = inlinesByParent.get(el.parentRef) ?? [];
            arr.push(el);
            inlinesByParent.set(el.parentRef, arr);
        }
    }


    const topLevelChildren = allElements.filter(e => e.mappingType !== 'InlineElement');

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        ...renderTableToLines(root, 0, inlinesByParent, topLevelChildren),
    ].join('\n');
}

// ── Syntax Highlighting ───────────────────────────────────────────────────────

type TokenKind =
    | 'punct'
    | 'tag-name'
    | 'attr-name'
    | 'attr-value'
    | 'placeholder'
    | 'text'
    | 'comment'
    | 'pi'
    | 'ws';

interface XmlToken { kind: TokenKind; value: string }

function tokenizeLine(line: string): XmlToken[] {
    const tokens: XmlToken[] = [];
    let rest = line;

    const push = (kind: TokenKind, value: string) => { if (value) tokens.push({ kind, value }); };

    // Comment
    if (rest.trimStart().startsWith('<!--')) {
        const ws = rest.match(/^(\s*)/)?.[1] ?? '';
        push('ws', ws);
        push('comment', rest.slice(ws.length));
        return tokens;
    }

    // Processing instruction
    if (rest.trimStart().startsWith('<?')) {
        const ws = rest.match(/^(\s*)/)?.[1] ?? '';
        push('ws', ws);
        push('pi', rest.slice(ws.length));
        return tokens;
    }

    while (rest.length > 0) {
        // Whitespace
        const wsMatch = rest.match(/^(\s+)/);
        if (wsMatch) { push('ws', wsMatch[1]); rest = rest.slice(wsMatch[1].length); continue; }

        // Closing tag </name>
        const closeTag = rest.match(/^(<\/)([\w:.-]+)(>)/);
        if (closeTag) {
            push('punct', '</');
            push('tag-name', closeTag[2]);
            push('punct', '>');
            rest = rest.slice(closeTag[0].length);
            continue;
        }

        // Opening tag start <name
        const openTag = rest.match(/^(<)([\w:.-]+)/);
        if (openTag) {
            push('punct', '<');
            push('tag-name', openTag[2]);
            rest = rest.slice(openTag[0].length);

            // Attributes inside tag
            while (rest.length > 0 && !rest.startsWith('>') && !rest.startsWith('/>')) {
                const attrMatch = rest.match(/^(\s+)([\w:.-]+)(\s*=\s*)("(?:[^"\\]|\\.)*")/);
                if (attrMatch) {
                    push('ws', attrMatch[1]);
                    push('attr-name', attrMatch[2]);
                    push('punct', attrMatch[3]);
                    // Attr value may contain {placeholder} — highlight it
                    const rawVal = attrMatch[4]; // includes surrounding quotes
                    const inner = rawVal.slice(1, -1);
                    const phMatch = inner.match(/^(\{[^}]*\})$/);
                    if (phMatch) {
                        push('punct', '"');
                        push('placeholder', phMatch[1]);
                        push('punct', '"');
                    } else {
                        push('attr-value', rawVal);
                    }
                    rest = rest.slice(attrMatch[0].length);
                    continue;
                }
                push('ws', rest[0]);
                rest = rest.slice(1);
            }

            if (rest.startsWith('/>'))      { push('punct', '/>'); rest = rest.slice(2); }
            else if (rest.startsWith('>'))  { push('punct', '>');  rest = rest.slice(1); }
            continue;
        }

        // Placeholder {xxx}
        const phMatch = rest.match(/^(\{[^}]*\})/);
        if (phMatch) {
            push('placeholder', phMatch[1]);
            rest = rest.slice(phMatch[0].length);
            continue;
        }

        // Text content up to next < or {
        const textMatch = rest.match(/^([^<{]+)/);
        if (textMatch) {
            push('text', textMatch[1]);
            rest = rest.slice(textMatch[0].length);
            continue;
        }

        push('text', rest[0]);
        rest = rest.slice(1);
    }

    return tokens;
}

const TOKEN_CLASS: Record<TokenKind, string> = {
    'punct':       'text-slate-400',
    'tag-name':    'text-cyan-400',
    'attr-name':   'text-yellow-300',
    'attr-value':  'text-green-400',
    'placeholder': 'text-amber-300 font-semibold',
    'text':        'text-slate-300',
    'comment':     'text-slate-500 italic',
    'pi':          'text-slate-500',
    'ws':          '',
};

export function HighlightedXml({ xml }: { xml: string }) {
    const lines = xml.split('\n');
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

// ── XmlPreview component ──────────────────────────────────────────────────────

interface XmlPreviewProps {
    mapping: ProjectMapping;
    onClose: () => void;
}

export default function XmlPreview({ mapping, onClose }: XmlPreviewProps) {
    const xml = useMemo(() => generateXml(mapping.documentModel), [mapping]);
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(xml).then(() => {
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
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700 shrink-0">
                    <span className="text-sm font-semibold text-gray-200">XML Preview</span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCopy}
                            title="Copy XML to clipboard"
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
                            title="Close preview"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Code area */}
                <div className="flex-1 overflow-auto p-4 min-h-0">
                    <HighlightedXml xml={xml} />
                </div>
            </div>
        </div>,
        document.body,
    );
}
