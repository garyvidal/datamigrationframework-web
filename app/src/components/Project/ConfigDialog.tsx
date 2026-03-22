// ConfigDialog — Portal dialog for per-project settings: default naming case (SNAKE/CAMEL/PASCAL/DASH) and edge line type.
import React, { useState } from 'react';
import * as ReactDOM from 'react-dom';
import { ConnectionLineType } from '@xyflow/react';
import { MappingTargetType, NamingCase, ProjectSettings } from '@/services/ProjectService';

const NAMING_CASES: { value: NamingCase; label: string; example: string }[] = [
    { value: 'SNAKE',  label: 'Snake case',  example: 'my_field_name' },
    { value: 'CAMEL',  label: 'Camel case',  example: 'myFieldName' },
    { value: 'PASCAL', label: 'Pascal case', example: 'MyFieldName' },
    { value: 'DASH',   label: 'Dash case',   example: 'my-field-name' },
];

const LINE_TYPES: { value: ConnectionLineType; label: string }[] = [
    { value: ConnectionLineType.Bezier,       label: 'Bezier' },
    { value: ConnectionLineType.SmoothStep,   label: 'Smooth Step' },
    { value: ConnectionLineType.Step,         label: 'Step' },
    { value: ConnectionLineType.Straight,     label: 'Straight' },
    { value: ConnectionLineType.SimpleBezier, label: 'Simple Bezier' },
];

const MAPPING_TYPES: { value: MappingTargetType; label: string; description: string }[] = [
    { value: 'XML',  label: 'XML',      description: 'Generate XML documents only' },
    { value: 'JSON', label: 'JSON',     description: 'Generate JSON documents only' },
    { value: 'BOTH', label: 'XML + JSON', description: 'Generate both XML and JSON documents' },
];

interface ConfigDialogProps {
    projectName: string;
    settings: ProjectSettings;
    connectionLineType: ConnectionLineType;
    mappingType: MappingTargetType;
    onSave: (settings: ProjectSettings, connectionLineType: ConnectionLineType, mappingType: MappingTargetType) => void;
    onClose: () => void;
}

export function ConfigDialog({ projectName, settings, connectionLineType, mappingType, onSave, onClose }: ConfigDialogProps) {
    const [defaultCasing, setDefaultCasing] = useState<NamingCase>(settings.defaultCasing ?? 'SNAKE');
    const [lineType, setLineType] = useState<ConnectionLineType>(connectionLineType);
    const [selectedMappingType, setSelectedMappingType] = useState<MappingTargetType>(mappingType ?? 'XML');

    const handleSave = () => {
        onSave({ ...settings, defaultCasing, connectionLineType: lineType }, lineType, selectedMappingType);
    };

    const dialog = (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-700 rounded-lg shadow-2xl w-full max-w-md mx-4">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-600">
                    <div>
                        <h2 className="text-gray-800 dark:text-white font-semibold text-lg">Project Settings</h2>
                        <p className="text-gray-400 text-xs mt-0.5">{projectName}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white text-xl leading-none w-8 h-8 flex items-center justify-center"
                    >
                        &#x2715;
                    </button>
                </div>

                <div className="px-6 py-5 space-y-5">
                    {/* Mapping Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                            Document Mapping Type
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                            Choose which document format(s) to generate from this project's relational data.
                        </p>
                        <div className="flex gap-2">
                            {MAPPING_TYPES.map(mt => (
                                <button
                                    key={mt.value}
                                    onClick={() => setSelectedMappingType(mt.value)}
                                    title={mt.description}
                                    className={`flex-1 px-3 py-2 rounded border text-sm font-medium transition ${
                                        selectedMappingType === mt.value
                                            ? 'border-cyan-500 bg-cyan-900/30 text-cyan-700 dark:text-cyan-200'
                                            : 'border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-slate-500 hover:text-gray-700 dark:hover:text-gray-200'
                                    }`}
                                >
                                    {mt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Default Casing */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                            Default Field Casing
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                            Applied when generating MarkLogic document field names from database columns.
                        </p>
                        <div className="space-y-2">
                            {NAMING_CASES.map(nc => (
                                <label
                                    key={nc.value}
                                    className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer border transition ${
                                        defaultCasing === nc.value
                                            ? 'border-cyan-500 bg-cyan-900/30 text-cyan-700 dark:text-white'
                                            : 'border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-slate-500'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="radio"
                                            name="defaultCasing"
                                            value={nc.value}
                                            checked={defaultCasing === nc.value}
                                            onChange={() => setDefaultCasing(nc.value)}
                                            className="accent-cyan-500"
                                        />
                                        <span className="text-sm">{nc.label}</span>
                                    </div>
                                    <span className="text-xs font-mono text-gray-400">{nc.example}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Connection Line Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                            Connection Line Style
                        </label>
                        <select
                            value={lineType}
                            onChange={e => setLineType(e.target.value as ConnectionLineType)}
                            className="w-full bg-white border border-gray-300 text-gray-800 dark:bg-slate-800 dark:border-slate-600 dark:text-gray-200 text-sm rounded px-3 py-2 focus:outline-none focus:border-cyan-500"
                        >
                            {LINE_TYPES.map(lt => (
                                <option key={lt.value} value={lt.value}>{lt.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-slate-600">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-slate-600 rounded hover:bg-gray-200 dark:hover:bg-slate-500 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 text-sm text-white bg-cyan-600 rounded hover:bg-cyan-500 transition"
                    >
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(dialog, document.body);
}
