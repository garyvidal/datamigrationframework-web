// CollapsiblePanel — Side panel wrapper that collapses to a narrow labeled ribbon and expands on demand.
import * as React from 'react'
import { FaChevronCircleRight, FaChevronCircleLeft, FaDatabase } from 'react-icons/fa'

interface CollapsiblePanelProps {
    title: string;
    body: React.ReactNode;
    direction: 'left' | 'right';
    ribbonLabel?: string;
    collapsed?: boolean;
    onToggle?: () => void;
}

const CollapsiblePanel = ({ title, body, direction, ribbonLabel, collapsed, onToggle }: CollapsiblePanelProps) => {
    if (collapsed) {
        const label = ribbonLabel ?? title;
        return (
            <div
                className="flex flex-col h-full bg-gray-50 dark:bg-slate-700 border-r border-gray-100 dark:border-slate-600 w-8 items-center select-none cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                onClick={onToggle}
                title={`Expand ${label}`}
            >
                {direction === 'right' && (
                    <div className="pt-2 pb-1 text-gray-500 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white shrink-0">
                        <FaChevronCircleLeft />
                    </div>
                )}
                <div className="flex-1 flex items-center justify-center overflow-hidden">
                    <span
                        className="text-gray-500 dark:text-gray-300 text-xs font-medium tracking-wide whitespace-nowrap"
                        style={{
                            writingMode: 'vertical-rl',
                            transform: direction === 'left' ? 'rotate(180deg)' : 'none',
                        }}
                    >
                        {label}
                    </span>
                </div>
                {direction === 'left' && (
                    <div className="pb-2 pt-1 text-gray-500 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white shrink-0">
                        <FaChevronCircleRight />
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-700 text-gray-800 dark:text-white">
            <h2 className="flex items-center shrink-0 border-b border-gray-100 dark:border-slate-600 bg-gray-50 dark:bg-slate-700">
                <span className="p-2 text-gray-500 dark:text-gray-300">
                    <FaDatabase />
                </span>
                <span className="flex-1 p-2 text-left text-sm font-medium truncate">{title}</span>
                <button
                    className="p-2 text-gray-500 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white"
                    onClick={onToggle}
                    title={`Collapse`}
                >
                    {direction === 'left' ? <FaChevronCircleLeft /> : <FaChevronCircleRight />}
                </button>
            </h2>
            <div className="flex-1 overflow-auto">{body}</div>
        </div>
    );
};

export default CollapsiblePanel;
