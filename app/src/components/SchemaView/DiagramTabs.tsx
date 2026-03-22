// DiagramTabs — Scrollable tab bar for switching between open projects; supports inline rename and close.
import * as React from "react";
import { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/Utils";
import { ProjectData } from "@/services/ProjectService";

interface DiagramTabsProps {
  projects: ProjectData[];
  activeProjectName: string | null;
  onProjectSelect: (name: string) => void;
  onProjectClose: (name: string) => void;
  onProjectRename?: (oldName: string, newName: string) => void;
}

export default function DiagramTabs({ projects, activeProjectName, onProjectSelect, onProjectClose, onProjectRename }: DiagramTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    if (editingName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingName]);

  const startEdit = (name: string) => {
    setEditingName(name);
    setEditValue(name);
  };

  const commitEdit = () => {
    if (editingName && editValue.trim() && editValue.trim() !== editingName) {
      onProjectRename?.(editingName, editValue.trim());
    }
    setEditingName(null);
  };

  const cancelEdit = () => setEditingName(null);

  if (projects.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className="flex h-9 shrink-0 overflow-x-auto overflow-y-hidden bg-[#f5f6f8] border-b border-gray-200 dark:bg-slate-800 dark:border-slate-700"
      style={{ scrollbarWidth: "none" }}
    >
      {projects.map((project) => {
        const isActive = project.name === activeProjectName;
        const isEditing = editingName === project.name;
        return (
          <div
            key={project.name}
            onClick={() => { if (!isEditing) onProjectSelect(project.name); }}
            onDoubleClick={() => { if (onProjectRename) startEdit(project.name); }}
            className={cn(
              "flex items-center gap-1.5 px-3 h-full whitespace-nowrap cursor-pointer select-none shrink-0 border-r border-gray-200 dark:border-slate-700 text-sm",
              isActive
                ? "bg-white text-gray-800 border-b-2 border-b-cyan-600 dark:bg-slate-700 dark:text-white dark:border-b-cyan-500"
                : "bg-[#f5f6f8] text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:bg-slate-800 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-gray-200"
            )}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit();
                  if (e.key === 'Escape') cancelEdit();
                }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white text-gray-800 dark:bg-slate-900 dark:text-white text-sm px-1 rounded outline outline-1 outline-cyan-500 w-32"
              />
            ) : (
              project.name
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onProjectClose(project.name);
              }}
              className="text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-white leading-none ml-0.5 text-base"
              title={`Close ${project.name}`}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
