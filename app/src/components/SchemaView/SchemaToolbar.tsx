// SchemaToolbar — Toolbar above the canvas: layout picker, edge-type picker, relational/document mode toggle, Generate dropdown (XML/XSD/JSON), print, and settings.
import * as React from 'react'
import { useState, useRef, useEffect } from 'react'
import * as ReactDOM from 'react-dom'
import { FaCog, FaCode, FaMousePointer, FaProjectDiagram, FaLink, FaFileImage, FaFileCode, FaChevronDown, FaMagic } from 'react-icons/fa';
import { SiJson } from 'react-icons/si';
import { LayoutControls, LayoutAlgorithm } from './LayoutControls';
import { ConnectionLineTypeControl } from './ConnectionLineTypeControl';
import { ConnectionLineType } from '@xyflow/react';
import type { MappingTargetType } from '@/services/ProjectService';

export type ViewMode = 'relational' | 'document';

interface SchemaToolbarProps {
  hasNodes: boolean;
  showEdges: boolean;
  onToggleEdges: () => void;
  onLayout: (algorithm: LayoutAlgorithm) => void;
  connectionLineType: ConnectionLineType;
  onConnectionLineTypeChange: (type: ConnectionLineType) => void;
  hasActiveProject?: boolean;
  onOpenConfig?: () => void;
  onGenerateXml?: () => void;
  onGenerateJson?: () => void;
  onGenerateXsd?: () => void;
  onGenerateXslt?: () => void;
  mappingType?: MappingTargetType;
  onCreateJoin?: () => void;
  onPrint?: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}

function GenerateDropdown({ onGenerateXml, onGenerateJson, onGenerateXsd, onGenerateXslt, mappingType = 'XML' }: {
  onGenerateXml?: () => void;
  onGenerateJson?: () => void;
  onGenerateXsd?: () => void;
  onGenerateXslt?: () => void;
  mappingType?: MappingTargetType;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const showXml  = onGenerateXml  && (mappingType === 'XML'  || mappingType === 'BOTH');
  const showJson = onGenerateJson && (mappingType === 'JSON' || mappingType === 'BOTH');
  const showXsd  = onGenerateXsd  && (mappingType === 'XML'  || mappingType === 'BOTH');
  const showXslt = onGenerateXslt && (mappingType === 'XML'  || mappingType === 'BOTH');

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.('[data-generate-dropdown]')) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
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
      data-generate-dropdown
      style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded shadow-lg min-w-[160px] dark:bg-slate-800 dark:border-slate-600"
    >
      {showXml && (
        <button
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-600"
          onClick={() => { setOpen(false); onGenerateXml!(); }}
        >
          <FaCode className="text-emerald-600 dark:text-emerald-400" size={12} />
          Generate XML
        </button>
      )}
      {showXsd && (
        <button
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-600"
          onClick={() => { setOpen(false); onGenerateXsd!(); }}
        >
          <FaFileCode className="text-violet-600 dark:text-violet-400" size={12} />
          Generate XSD
        </button>
      )}
      {showXslt && (
        <button
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-600"
          onClick={() => { setOpen(false); onGenerateXslt!(); }}
        >
          <FaMagic className="text-orange-600 dark:text-orange-400" size={12} />
          Generate XSLT
        </button>
      )}
      {showJson && (
        <button
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-600"
          onClick={() => { setOpen(false); onGenerateJson!(); }}
        >
          <SiJson className="text-amber-600 dark:text-amber-400" size={12} />
          Generate JSON
        </button>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div data-generate-dropdown className="relative">
      <button
        ref={buttonRef}
        title="Generate output files"
        onClick={handleToggle}
        className={`p-1.5 rounded-none transition flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300 ${open ? 'bg-gray-300 dark:bg-slate-600' : 'bg-gray-200 hover:bg-gray-300 dark:bg-slate-800 dark:hover:bg-slate-600'}`}
      >
        <FaCode size={12} />
        <span className="hidden sm:inline">Generate</span>
        <FaChevronDown size={8} className={`ml-0.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {dropdown}
    </div>
  );
}

function SchemaToolbar({
  hasNodes,
  showEdges,
  onToggleEdges,
  onLayout,
  connectionLineType,
  onConnectionLineTypeChange,
  hasActiveProject,
  onOpenConfig,
  onGenerateXml,
  onGenerateJson,
  onGenerateXsd,
  onGenerateXslt,
  mappingType = 'XML',
  onCreateJoin,
  onPrint,
}: SchemaToolbarProps) {
  const hasGenerateOptions =
    hasActiveProject && (onGenerateXml || onGenerateJson || onGenerateXsd || onGenerateXslt);

  return (
    <div className="w-full h-10 align-top border-b border-gray-200 bg-white dark:border-b-slate-700 dark:bg-slate-800 overflow-y-hidden flex items-stretch justify-between">

      {/* Left: canvas interaction tools */}
      <div className="flex items-center px-1 shrink-0 gap-0.5">
        <button id="select-tool" title="Select tool" className="p-1.5 bg-gray-200 rounded-none hover:bg-gray-300 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-600 dark:text-gray-300">
          <FaMousePointer />
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-300 dark:bg-slate-600 mx-1" />

        <button
          id="connections"
          onClick={onToggleEdges}
          title="Toggle connections"
          className={`p-1.5 rounded-none transition ${
            showEdges
              ? 'bg-cyan-700 text-white hover:bg-cyan-600'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-600'
          }`}
        >
          <FaProjectDiagram />
        </button>
        <ConnectionLineTypeControl value={connectionLineType} onChange={onConnectionLineTypeChange} />

        {/* Divider */}
        <div className="w-px h-5 bg-gray-300 dark:bg-slate-600 mx-1" />

        <LayoutControls onLayout={onLayout} disabled={!hasNodes} />

        {hasActiveProject && onCreateJoin && (
          <button
            onClick={onCreateJoin}
            disabled={!hasNodes}
            title="Create synthetic join between two tables"
            className={`p-1.5 rounded-none transition ${
              hasNodes
                ? 'bg-gray-200 text-cyan-700 hover:bg-gray-300 hover:text-cyan-600 dark:bg-slate-800 dark:text-cyan-300 dark:hover:bg-slate-600 dark:hover:text-cyan-200'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-slate-800 dark:text-gray-600'
            }`}
          >
            <FaLink size={11} />
          </button>
        )}
      </div>

      {/* Right: output actions + settings */}
      <div className="flex items-center px-2 gap-1">
        {hasGenerateOptions && (
          <GenerateDropdown
            onGenerateXml={onGenerateXml}
            onGenerateJson={onGenerateJson}
            onGenerateXsd={onGenerateXsd}
            onGenerateXslt={onGenerateXslt}
            mappingType={mappingType}
          />
        )}

        {/* Divider */}
        {hasGenerateOptions && (
          <div className="w-px h-5 bg-gray-300 dark:bg-slate-600 mx-0.5" />
        )}

        {onPrint && (
          <button
            onClick={onPrint}
            title="Download diagram as PNG"
            className="p-1.5 bg-gray-200 rounded-none hover:bg-gray-300 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-600 dark:text-gray-300"
          >
            <FaFileImage />
          </button>
        )}
        {hasActiveProject && onOpenConfig && (
          <button
            onClick={onOpenConfig}
            title="Project settings"
            className="p-1.5 bg-gray-200 rounded-none hover:bg-gray-300 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-600 dark:text-gray-300"
          >
            <FaCog />
          </button>
        )}
      </div>
    </div>
  )
}

export default SchemaToolbar;
