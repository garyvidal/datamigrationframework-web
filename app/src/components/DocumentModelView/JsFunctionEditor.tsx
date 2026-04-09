/**
 * JsFunctionEditor — CodeMirror 6 editor for custom JavaScript function bodies.
 *
 * Features:
 *  - JavaScript syntax highlighting (via @codemirror/lang-javascript)
 *  - Typeahead completions for `row.<fieldName>` from the available column list
 *  - Completion for the `row` identifier itself
 *  - Inline syntax-error banner updated on every change
 *  - Collapsible help panel showing examples
 *  - Keyboard: Tab/Enter to accept, Escape to dismiss, Arrow keys to navigate
 */
import React, { useMemo, useState, useCallback } from 'react';
import CodeMirror, { type Extension } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import {
    autocompletion,
    CompletionContext,
    type CompletionResult,
} from '@codemirror/autocomplete';
import { oneDark } from '@uiw/react-codemirror';
import { FaInfoCircle, FaChevronDown, FaChevronUp, FaExclamationTriangle } from 'react-icons/fa';

// ── Syntax validation ─────────────────────────────────────────────────────────

/**
 * Parses {@code body} as the body of `function(row){ <body> }` using the
 * browser's JS engine. Returns `null` when valid, or an error message string.
 *
 * Exported so callers can gate saves on validity.
 */
export function validateFunction(body: string): string | null {
    if (!body || !body.trim()) return null;
    const hasReturn = /\breturn\b/.test(body);
    const wrapped = hasReturn ? body : `return (${body})`;
    try {
        // eslint-disable-next-line no-new-func
        new Function('row', wrapped);
        return null;
    } catch (e) {
        return e instanceof Error ? e.message : String(e);
    }
}

// ── Autocomplete ──────────────────────────────────────────────────────────────

function buildRowCompletion(fieldNames: string[]) {
    return (context: CompletionContext): CompletionResult | null => {
        const rowProp = context.matchBefore(/row\.\w*/);
        if (rowProp) {
            const partial = rowProp.text.slice(4).toLowerCase();
            const options = fieldNames
                .filter(f => f.toLowerCase().startsWith(partial))
                .map(f => ({
                    label: `row.${f}`,
                    apply: `row.${f}`,
                    type: 'property' as const,
                    detail: 'column',
                }));
            if (options.length === 0) return null;
            return { from: rowProp.from, options, validFor: /^row\.\w*$/ };
        }

        const bareWord = context.matchBefore(/\b\w+/);
        if (bareWord && 'row'.startsWith(bareWord.text.toLowerCase()) && bareWord.text.toLowerCase() !== 'row') {
            return {
                from: bareWord.from,
                options: [{ label: 'row', type: 'variable' as const, detail: 'current row' }],
                validFor: /^\w+$/,
            };
        }

        return null;
    };
}

// ── Help panel ────────────────────────────────────────────────────────────────

function HelpPanel({ fieldNames }: { fieldNames: string[] }) {
    const exampleCol = fieldNames[0] ?? 'column_name';
    const exampleCol2 = fieldNames[1] ?? 'other_column';

    return (
        <div className="text-xs text-gray-300 space-y-2 px-3 py-2.5 bg-slate-900/80 border-t border-slate-600">
            <p className="font-semibold text-amber-300">How to write a custom function</p>

            <p className="text-gray-400">
                The function body runs with <code className="text-amber-200">row</code> in scope.
                Access any column from the current database row using <code className="text-amber-200">row.column_name</code>.
                The value you <code className="text-amber-200">return</code> becomes the field value in the document.
            </p>

            <div className="space-y-2">
                <p className="text-gray-500 uppercase tracking-wide text-[10px]">Examples</p>

                <div>
                    <p className="text-gray-500 mb-0.5">Simple field (no <code className="text-amber-200">return</code> needed):</p>
                    <pre className="bg-slate-800 rounded px-2 py-1 text-green-300 leading-relaxed overflow-x-auto">{
`row.${exampleCol}`
                    }</pre>
                </div>

                <div>
                    <p className="text-gray-500 mb-0.5">Concatenate two columns:</p>
                    <pre className="bg-slate-800 rounded px-2 py-1 text-green-300 leading-relaxed overflow-x-auto">{
`row.${exampleCol} + ' ' + row.${exampleCol2}`
                    }</pre>
                </div>

                <div>
                    <p className="text-gray-500 mb-0.5">Conditional / default value:</p>
                    <pre className="bg-slate-800 rounded px-2 py-1 text-green-300 leading-relaxed overflow-x-auto">{
`row.${exampleCol} ? row.${exampleCol}.trim() : 'N/A'`
                    }</pre>
                </div>

                <div>
                    <p className="text-gray-500 mb-0.5">Number formatting:</p>
                    <pre className="bg-slate-800 rounded px-2 py-1 text-green-300 leading-relaxed overflow-x-auto">{
`parseFloat(row.${exampleCol}).toFixed(2)`
                    }</pre>
                </div>

                <div>
                    <p className="text-gray-500 mb-0.5">Multi-step logic (use <code className="text-amber-200">return</code>):</p>
                    <pre className="bg-slate-800 rounded px-2 py-1 text-green-300 leading-relaxed overflow-x-auto">{
`var d = new Date(row.${exampleCol});
return d.toISOString().slice(0, 10);`
                    }</pre>
                </div>
            </div>

            {fieldNames.length > 0 && (
                <div>
                    <p className="text-gray-500 uppercase tracking-wide text-[10px] mb-1">Available columns</p>
                    <div className="flex flex-wrap gap-1">
                        {fieldNames.map(f => (
                            <code key={f} className="px-1.5 py-0.5 rounded bg-slate-700 text-amber-200 text-[10px]">
                                row.{f}
                            </code>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Editor component ──────────────────────────────────────────────────────────

interface JsFunctionEditorProps {
    value: string;
    onChange: (v: string) => void;
    fieldNames: string[];
    minLines?: number;
    className?: string;
    placeholder?: string;
}

export default function JsFunctionEditor({
    value,
    onChange,
    fieldNames,
    minLines = 5,
    className,
    placeholder,
}: JsFunctionEditorProps) {
    const [syntaxError, setSyntaxError] = useState<string | null>(() => validateFunction(value));
    const [showHelp, setShowHelp] = useState(false);

    const extensions: Extension[] = useMemo(() => [
        javascript(),
        autocompletion({
            override: [buildRowCompletion(fieldNames)],
            activateOnTyping: true,
            closeOnBlur: true,
        }),
    ], [fieldNames]);

    const handleChange = useCallback((v: string) => {
        onChange(v);
        setSyntaxError(validateFunction(v));
    }, [onChange]);

    return (
        <div className={`rounded overflow-hidden border ${syntaxError ? 'border-red-500' : 'border-slate-600'} focus-within:ring-1 ${syntaxError ? 'focus-within:ring-red-500' : 'focus-within:ring-amber-500'} ${className ?? ''}`}>
            {/* Editor */}
            <CodeMirror
                value={value}
                onChange={handleChange}
                extensions={extensions}
                theme={oneDark}
                placeholder={placeholder}
                style={{ fontSize: '12px' }}
                minHeight={`${minLines * 1.6}em`}
                basicSetup={{
                    lineNumbers: true,
                    foldGutter: false,
                    dropCursor: false,
                    allowMultipleSelections: false,
                    indentOnInput: true,
                    bracketMatching: true,
                    closeBrackets: true,
                    autocompletion: true,
                    highlightActiveLine: true,
                    highlightSelectionMatches: false,
                    tabSize: 2,
                }}
            />

            {/* Syntax error banner */}
            {syntaxError && (
                <div className="flex items-start gap-1.5 px-2 py-1.5 bg-red-950/70 border-t border-red-700 text-red-300 text-[11px] font-mono">
                    <FaExclamationTriangle size={10} className="mt-0.5 shrink-0 text-red-400" />
                    <span>{syntaxError}</span>
                </div>
            )}

            {/* Help toggle */}
            <div className="border-t border-slate-700">
                <button
                    type="button"
                    onClick={() => setShowHelp(h => !h)}
                    className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] text-gray-500 hover:text-gray-300 transition"
                >
                    <FaInfoCircle size={10} className="text-amber-500/70" />
                    <span>How to reference columns</span>
                    <span className="ml-auto">{showHelp ? <FaChevronUp size={8} /> : <FaChevronDown size={8} />}</span>
                </button>
                {showHelp && <HelpPanel fieldNames={fieldNames} />}
            </div>
        </div>
    );
}
