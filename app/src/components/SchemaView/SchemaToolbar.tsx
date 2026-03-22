// SchemaToolbar — Toolbar above the canvas: layout picker, edge-type picker, undo/redo, relational/document mode toggle, XML/JSON generate buttons, and settings.
import * as React from 'react'
import { FaCog, FaCode, FaMousePointer, FaProjectDiagram, FaRedo, FaUndo, FaLink, FaFileImage } from 'react-icons/fa';
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
  mappingType?: MappingTargetType;
  onCreateJoin?: () => void;
  onPrint?: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
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
  mappingType = 'XML',
  onCreateJoin,
  onPrint,
}: SchemaToolbarProps) {
  const showXmlButton  = hasActiveProject && onGenerateXml  && (mappingType === 'XML'  || mappingType === 'BOTH');
  const showJsonButton = hasActiveProject && onGenerateJson && (mappingType === 'JSON' || mappingType === 'BOTH');
  return (
    <div className="w-full h-10 align-top border-b border-gray-200 bg-white dark:border-b-slate-700 dark:bg-slate-800 overflow-y-hidden flex items-stretch justify-between">

      {/* Left: toolbar tools */}
      <div className="flex items-center px-1 shrink-0 gap-0.5">
        <button id="select-tool" className="p-1.5 bg-gray-200 rounded-none hover:bg-gray-300 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-600 dark:text-gray-300">
          <FaMousePointer />
        </button>
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
        {/* <button id="redo" className="p-1.5 bg-gray-200 rounded-none hover:bg-gray-300 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-600 dark:text-gray-300">
          <FaRedo />
        </button>
        <button id="undo" className="p-1.5 bg-gray-200 rounded-none hover:bg-gray-300 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-600 dark:text-gray-300">
          <FaUndo />
        </button> */}
      </div>

      {/* Right: print + settings */}
      <div className="flex items-center px-2 gap-1">
        {onPrint && (
          <button
            onClick={onPrint}
            title="Download diagram as PNG"
            className="p-1.5 bg-gray-200 rounded-none hover:bg-gray-300 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-600 dark:text-gray-300"
          >
            <FaFileImage />
          </button>
        )}
        {showXmlButton && (
          <button
            onClick={onGenerateXml}
            title="Generate XML documents from mapping"
            className="p-1.5 bg-emerald-600 rounded-none hover:bg-gray-300 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-600 dark:text-gray-300 dark:hover:text-emerald-300"
          >
            <FaCode />
          </button>
        )}
        {showJsonButton && (
          <button
            onClick={onGenerateJson}
            title="Generate JSON documents from mapping"
            className="p-1.5 bg-gray-200 rounded-none hover:bg-gray-300 text-amber-700 hover:text-amber-800 dark:bg-slate-800 dark:hover:bg-slate-600 dark:text-amber-400 dark:hover:text-amber-300"
          >
            <SiJson />
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
