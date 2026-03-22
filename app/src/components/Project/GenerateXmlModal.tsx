// GenerateXmlModal — Portal modal for generating, paginating, and copying XML document previews from project mappings.
import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { FaCheck, FaCopy, FaChevronLeft, FaChevronRight, FaSpinner, FaExclamationTriangle, FaRedo } from 'react-icons/fa';
import { generateXmlPreview, XmlPreviewResponse } from '@/services/ProjectService';
import { HighlightedXml } from '@/components/DocumentModelView/XmlPreview';

interface GenerateXmlModalProps {
    projectId: string;
    projectName: string;
    onClose: () => void;
}

export default function GenerateXmlModal({ projectId, projectName, onClose }: GenerateXmlModalProps) {
    const [limit, setLimit] = useState(10);
    const [pendingLimit, setPendingLimit] = useState(10);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<XmlPreviewResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [docIndex, setDocIndex] = useState(0);
    const [copied, setCopied] = useState(false);
    const [showErrors, setShowErrors] = useState(false);

    const runPreview = useCallback(async (requestedLimit: number) => {
        setLoading(true);
        setError(null);
        setDocIndex(0);
        try {
            const data = await generateXmlPreview(projectId, requestedLimit);
            setResult(data);
            setLimit(requestedLimit);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Generation failed');
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    // Auto-run on mount
    useEffect(() => { runPreview(pendingLimit); }, []);

    const docs = result?.documents ?? [];
    const currentDoc = docs[docIndex] ?? '';
    const docCount = docs.length;

    const handleCopy = () => {
        navigator.clipboard.writeText(currentDoc).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    const handleRerun = () => {
        setPendingLimit(pendingLimit);
        runPreview(pendingLimit);
    };

    return ReactDOM.createPortal(
        <div
            className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-6"
            onClick={onClose}
        >
            <div
                className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl flex flex-col w-full max-w-5xl"
                style={{ maxHeight: 'calc(100vh - 4rem)' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700 shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-200">
                            Generate XML — <span className="text-cyan-400">{projectName}</span>
                        </span>
                        {!loading && result && (
                            <span className="text-xs text-gray-500">
                                {docCount === 0
                                    ? 'No documents'
                                    : `${docCount} document${docCount !== 1 ? 's' : ''} · ${result.totalRows} row${result.totalRows !== 1 ? 's' : ''}`}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Document navigation */}
                        {docCount > 1 && (
                            <div className="flex items-center gap-1 mr-1">
                                <button
                                    onClick={() => setDocIndex(i => Math.max(0, i - 1))}
                                    disabled={docIndex === 0}
                                    className="p-1 text-gray-400 hover:text-white disabled:text-gray-700 transition"
                                    title="Previous document"
                                >
                                    <FaChevronLeft size={11} />
                                </button>
                                <span className="text-xs text-gray-400 min-w-[60px] text-center">
                                    {docIndex + 1} of {docCount}
                                </span>
                                <button
                                    onClick={() => setDocIndex(i => Math.min(docCount - 1, i + 1))}
                                    disabled={docIndex === docCount - 1}
                                    className="p-1 text-gray-400 hover:text-white disabled:text-gray-700 transition"
                                    title="Next document"
                                >
                                    <FaChevronRight size={11} />
                                </button>
                            </div>
                        )}

                        {/* Copy */}
                        {currentDoc && (
                            <button
                                onClick={handleCopy}
                                title="Copy to clipboard"
                                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border transition ${
                                    copied
                                        ? 'border-green-600 text-green-400 bg-green-900/20'
                                        : 'border-slate-600 text-gray-400 hover:border-slate-400 hover:text-white'
                                }`}
                            >
                                {copied ? <FaCheck size={10} /> : <FaCopy size={10} />}
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        )}

                        {/* Close */}
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-gray-200 transition px-1 text-sm ml-1"
                            title="Close"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800 shrink-0 bg-slate-900">
                    <label className="text-xs text-gray-400">Limit</label>
                    <input
                        type="number"
                        min={1}
                        max={100}
                        value={pendingLimit}
                        onChange={e => setPendingLimit(Math.max(1, Math.min(100, Number(e.target.value))))}
                        onKeyDown={e => e.key === 'Enter' && handleRerun()}
                        className="w-16 px-2 py-0.5 text-xs bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:border-cyan-500"
                    />
                    <button
                        onClick={handleRerun}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-cyan-700 hover:bg-cyan-600 text-white rounded transition disabled:opacity-50"
                    >
                        {loading ? <FaSpinner className="animate-spin" size={10} /> : <FaRedo size={10} />}
                        {loading ? 'Running…' : 'Re-run'}
                    </button>

                    {/* Error badge */}
                    {result && result.errors.length > 0 && (
                        <button
                            onClick={() => setShowErrors(v => !v)}
                            className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-amber-400 hover:text-amber-300 transition"
                        >
                            <FaExclamationTriangle size={10} />
                            {result.errors.length} warning{result.errors.length !== 1 ? 's' : ''}
                        </button>
                    )}
                </div>

                {/* Error list (expandable) */}
                {showErrors && result && result.errors.length > 0 && (
                    <div className="px-4 py-2 border-b border-slate-800 shrink-0 space-y-1 max-h-28 overflow-y-auto">
                        {result.errors.map((err, i) => (
                            <p key={i} className="text-xs text-amber-300 font-mono">{err}</p>
                        ))}
                    </div>
                )}

                {/* Code area */}
                <div className="flex-1 overflow-auto p-4 min-h-0">
                    {loading && (
                        <div className="flex items-center justify-center h-32 text-gray-500 gap-2">
                            <FaSpinner className="animate-spin" />
                            <span className="text-sm">Generating…</span>
                        </div>
                    )}
                    {!loading && error && (
                        <div className="p-4 bg-red-900/60 border border-red-700 rounded text-red-200 text-sm font-mono">
                            {error}
                        </div>
                    )}
                    {!loading && !error && docCount === 0 && (
                        <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
                            No documents generated. Check that the project has a document model mapping.
                        </div>
                    )}
                    {!loading && !error && currentDoc && (
                        <HighlightedXml xml={currentDoc} />
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}
