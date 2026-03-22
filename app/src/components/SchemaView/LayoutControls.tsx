// LayoutControls — Portal dropdown for choosing the Dagre layout algorithm (TB, LR, BT, Grid).
import * as React from "react";
import { useState, useRef, useEffect } from "react";
import * as ReactDOM from "react-dom";
import { FaSitemap } from "react-icons/fa";

export type LayoutAlgorithm = "dagre-tb" | "dagre-lr" | "dagre-bt" | "grid";

const ALGORITHMS: { id: LayoutAlgorithm; label: string; description: string }[] = [
    { id: "dagre-tb", label: "Hierarchical ↓", description: "Top → Bottom" },
    { id: "dagre-lr", label: "Hierarchical →", description: "Left → Right" },
    { id: "dagre-bt", label: "Hierarchical ↑", description: "Bottom → Top" },
    { id: "grid",     label: "Grid",           description: "Even grid" },
];

interface LayoutControlsProps {
    onLayout: (algorithm: LayoutAlgorithm) => void;
    disabled?: boolean;
}

export function LayoutControls({ onLayout, disabled }: LayoutControlsProps) {
    const [open, setOpen] = useState(false);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (!(e.target as Element).closest?.("[data-layout-controls]")) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const handleToggle = () => {
        if (!open && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + 2, left: rect.left });
        }
        setOpen(v => !v);
    };

    const dropdown = open ? ReactDOM.createPortal(
        <div
            data-layout-controls
            style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
            className="bg-white border border-gray-200 rounded shadow-lg min-w-[170px] dark:bg-slate-800 dark:border-slate-600"
        >
            {ALGORITHMS.map(algo => (
                <button
                    key={algo.id}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-600 flex flex-col"
                    onClick={() => {
                        setOpen(false);
                        onLayout(algo.id);
                    }}
                >
                    <span className="font-medium">{algo.label}</span>
                    <span className="text-gray-400">{algo.description}</span>
                </button>
            ))}
        </div>,
        document.body
    ) : null;

    return (
        <div data-layout-controls className="relative">
            <button
                ref={buttonRef}
                title="Auto-layout"
                disabled={disabled}
                onClick={handleToggle}
                className={`p-1.5 rounded-none transition disabled:opacity-40 flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300 ${open ? "bg-gray-300 dark:bg-slate-600" : "bg-gray-200 hover:bg-gray-300 dark:bg-slate-800 dark:hover:bg-slate-600"}`}
            >
                <FaSitemap />
                <span className="hidden sm:inline">Layout</span>
                <svg width="10" height="10" viewBox="0 0 10 10" className="ml-0.5">
                    <polyline points="2,3 5,7 8,3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            </button>
            {dropdown}
        </div>
    );
}
