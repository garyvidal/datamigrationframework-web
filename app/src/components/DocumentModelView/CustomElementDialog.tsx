// CustomElementDialog — Dialog for defining a custom XML element with an XSD type and one or more column/expression inputs.
import React, { useState } from 'react';
import { FaTimes, FaPlus, FaCode } from 'react-icons/fa';
import type { ProjectMapping, XmlColumnMapping, XmlSchemaType } from '@/services/ProjectService';

const XSD_TYPES: XmlSchemaType[] = ['xs:string', 'xs:integer', 'xs:long', 'xs:date', 'xs:dateTime', 'xs:boolean'];

const XML_TYPE_COLOR: Record<XmlSchemaType, string> = {
    'xs:string':   'bg-blue-900 text-blue-300',
    'xs:integer':  'bg-purple-900 text-purple-300',
    'xs:long':     'bg-purple-900 text-purple-300',
    'xs:date':     'bg-green-900 text-green-300',
    'xs:dateTime': 'bg-green-900 text-green-300',
    'xs:boolean':  'bg-yellow-900 text-yellow-300',
};

interface CustomElementDialogProps {
    mapping: ProjectMapping;
    onConfirm: (xmlName: string, xmlType: XmlSchemaType, columns: XmlColumnMapping[], customFunction: string) => void;
    onCancel: () => void;
}

const DEFAULT_FN = `// Referenced fields are available as properties on the 'fields' object.
// Return the computed string value for this element.
return fields.exampleField;`;

export default function CustomElementDialog({ mapping, onConfirm, onCancel }: CustomElementDialogProps) {
    const [elementName, setElementName] = useState('');
    const [xmlType, setXmlType] = useState<XmlSchemaType>('xs:string');
    const [fnBody, setFnBody] = useState(DEFAULT_FN);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    // Gather unique columns from all mapped tables (root + elements, excluding CUSTOM entries)
    type ColEntry = { tableKey: string; col: XmlColumnMapping };
    const allCols: ColEntry[] = [];
    const seen = new Set<string>();
    const { root, elements } = mapping.documentModel;

    const addCols = (tableKey: string, cols: XmlColumnMapping[]) => {
        cols.forEach(col => {
            const key = col.sourceColumn;
            if (!seen.has(key)) {
                seen.add(key);
                allCols.push({ tableKey, col });
            }
        });
    };

    if (root) addCols(`${root.sourceSchema}.${root.sourceTable}`, root.columns);
    (elements ?? [])
        .filter(e => e.mappingType !== 'CUSTOM')
        .forEach(e => addCols(`${e.sourceSchema}.${e.sourceTable}`, e.columns));

    const toggleCol = (sourceColumn: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(sourceColumn)) next.delete(sourceColumn);
            else next.add(sourceColumn);
            return next;
        });
    };

    const handleConfirm = () => {
        if (!elementName.trim()) return;
        const cols = allCols
            .filter(({ col }) => selected.has(col.sourceColumn))
            .map(({ col }) => ({ ...col, mappingType: 'CUSTOM' as const }));
        onConfirm(elementName.trim(), xmlType, cols, fnBody);
    };

    const selectedNames = [...selected].join(', ');

    return (
        <div
            className="absolute inset-0 bg-black/60 flex items-start justify-center pt-12 z-30"
            onClick={onCancel}
        >
            <div
                className="bg-slate-700 rounded-lg shadow-2xl border border-slate-500 w-[540px] max-h-[85vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-600 shrink-0">
                    <FaCode size={13} className="text-amber-400" />
                    <span className="text-sm font-semibold text-white flex-1">Add Custom Element</span>
                    <button onClick={onCancel} className="text-gray-300 hover:text-white transition">
                        <FaTimes size={13} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Element name */}
                    <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">Element XML Name</label>
                        <input
                            autoFocus
                            value={elementName}
                            onChange={e => setElementName(e.target.value)}
                            placeholder="customElement"
                            className="w-full bg-slate-800 border border-slate-500 rounded px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-gray-600"
                        />
                    </div>

                    {/* XML return type */}
                    <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">Return Type</label>
                        <p className="text-xs text-gray-400 mb-2">The XSD type that the function returns.</p>
                        <select
                            value={xmlType}
                            onChange={e => setXmlType(e.target.value as XmlSchemaType)}
                            className={`rounded font-mono text-xs px-2 py-1.5 border border-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer ${XML_TYPE_COLOR[xmlType]}`}
                        >
                            {XSD_TYPES.map(t => (
                                <option key={t} value={t} className="bg-slate-800 text-gray-200">{t}</option>
                            ))}
                        </select>
                    </div>

                    {/* Reference fields */}
                    <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">Reference Fields</label>
                        <p className="text-xs text-gray-400 mb-2">
                            Checked fields will be available as <code className="text-amber-300">fields.fieldName</code> in your function.
                        </p>
                        {allCols.length === 0 ? (
                            <p className="text-xs text-gray-400 italic px-2 py-2 rounded bg-slate-800/50">
                                No mapped columns available — add a Root Element or Elements group first.
                            </p>
                        ) : (
                            <div className="bg-slate-800/60 border border-slate-600 rounded max-h-40 overflow-y-auto">
                                {allCols.map(({ tableKey, col }) => (
                                    <label
                                        key={col.sourceColumn}
                                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selected.has(col.sourceColumn)}
                                            onChange={() => toggleCol(col.sourceColumn)}
                                            className="accent-amber-500 shrink-0"
                                        />
                                        <span className="text-xs font-mono text-gray-200">{col.sourceColumn}</span>
                                        <span className="text-xs text-gray-400 ml-auto truncate max-w-[160px]">{tableKey}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                        {selected.size > 0 && (
                            <p className="text-xs text-gray-400 mt-1">
                                Selected: <span className="text-amber-300 font-mono">{selectedNames}</span>
                            </p>
                        )}
                    </div>

                    {/* JS function */}
                    <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">JavaScript Function</label>
                        <textarea
                            value={fnBody}
                            onChange={e => setFnBody(e.target.value)}
                            rows={7}
                            spellCheck={false}
                            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-xs font-mono text-green-300 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-y leading-relaxed"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-600 shrink-0">
                    <button
                        onClick={onCancel}
                        className="px-3 py-1.5 text-xs text-gray-300 hover:text-white transition rounded border border-slate-600 hover:border-slate-400"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!elementName.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition
                            enabled:bg-amber-700 enabled:hover:bg-amber-600 enabled:text-white
                            disabled:bg-slate-700 disabled:text-gray-600 disabled:cursor-not-allowed"
                    >
                        <FaPlus size={9} />
                        Add Custom Element
                    </button>
                </div>
            </div>
        </div>
    );
}
