// ConnectionLineTypeControl — Portal dropdown for choosing the ReactFlow edge line style (Bezier, SmoothStep, Step, Straight, SimpleBezier).
import * as React from "react";
import { useState, useRef, useEffect } from "react";
import * as ReactDOM from "react-dom";
import { ConnectionLineType } from "@xyflow/react";
import { FaProjectDiagram } from "react-icons/fa";

const LINE_TYPES: { value: ConnectionLineType; label: string }[] = [
    { value: ConnectionLineType.Bezier,       label: "Bezier" },
    { value: ConnectionLineType.SmoothStep,   label: "Smooth Step" },
    { value: ConnectionLineType.Step,         label: "Step" },
    { value: ConnectionLineType.Straight,     label: "Straight" },
    { value: ConnectionLineType.SimpleBezier, label: "Simple Bezier" },
];

interface ConnectionLineTypeControlProps {
    value: ConnectionLineType;
    onChange: (type: ConnectionLineType) => void;
}

export function ConnectionLineTypeControl({ value, onChange }: ConnectionLineTypeControlProps) {
    const [open, setOpen] = useState(false);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (!(e.target as Element).closest?.("[data-conntype-controls]")) {
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

    const current = LINE_TYPES.find(t => t.value === value)?.label ?? "Edge Style";

    const dropdown = open ? ReactDOM.createPortal(
        <div
            data-conntype-controls
            style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
            className="bg-white border border-gray-200 rounded shadow-lg min-w-[150px] dark:bg-slate-800 dark:border-slate-600"
        >
            {LINE_TYPES.map(type => (
                <button
                    key={type.value}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-slate-600 ${value === type.value ? "text-cyan-600 dark:text-cyan-400 font-semibold" : "text-gray-700 dark:text-gray-200"}`}
                    onClick={() => {
                        setOpen(false);
                        onChange(type.value);
                    }}
                >
                    {type.label}
                </button>
            ))}
        </div>,
        document.body
    ) : null;

    return (
        <div data-conntype-controls className="relative">
            <button
                ref={buttonRef}
                title="Edge line style"
                onClick={handleToggle}
                className={`p-1.5 rounded-none transition flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300 ${open ? "bg-gray-300 dark:bg-slate-600" : "bg-gray-200 hover:bg-gray-300 dark:bg-slate-800 dark:hover:bg-slate-600"}`}
            >
                <FaProjectDiagram className="shrink-0" />
                <span className="hidden sm:inline">{current}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" className="ml-0.5">
                    <polyline points="2,3 5,7 8,3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            </button>
            {dropdown}
        </div>
    );
}
