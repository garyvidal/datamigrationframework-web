// GenerateXsltModal — Portal modal for generating, viewing, copying, and downloading a MarkLogic-compatible XSLT stylesheet derived from the project's XML document mapping.
import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { FaCheck, FaCopy, FaSpinner, FaDownload, FaRedo } from 'react-icons/fa';
import { generateXslt } from '@/services/ProjectService';
import { HighlightedXml } from '@/components/DocumentModelView/XmlPreview';

interface GenerateXsltModalProps {
    projectId: string;
    projectName: string;
    onClose: () => void;
}

export default function GenerateXsltModal({ projectId, projectName, onClose }: GenerateXsltModalProps) {
    const [loading, setLoading] = useState(false);
    const [xslt, setXslt] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const runGenerate = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await generateXslt(projectId);
            setXslt(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'XSLT generation failed');
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    // Auto-run on mount
    useEffect(() => { runGenerate(); }, []);

    const handleCopy = () => {
        if (!xslt) return;
        navigator.clipboard.writeText(xslt).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    const handleDownload = () => {
        if (!xslt) return;
        const blob = new Blob([xslt], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${projectName}.xsl`;
        link.click();
        URL.revokeObjectURL(url);
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
                    <span className="text-sm font-semibold text-gray-200">
                        XSLT Transform — <span className="text-orange-400">{projectName}</span>
                    </span>
                    <div className="flex items-center gap-2">
                        {/* Re-run */}
                        <button
                            onClick={runGenerate}
                            disabled={loading}
                            title="Re-generate XSLT"
                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-gray-300 rounded border border-slate-600 transition disabled:opacity-50"
                        >
                            {loading ? <FaSpinner className="animate-spin" size={10} /> : <FaRedo size={10} />}
                            {loading ? 'Generating…' : 'Re-run'}
                        </button>

                        {/* Copy */}
                        {xslt && (
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

                        {/* Download */}
                        {xslt && (
                            <button
                                onClick={handleDownload}
                                title={`Download as ${projectName}.xsl`}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-orange-600 text-orange-400 hover:bg-orange-900/30 hover:text-orange-300 transition"
                            >
                                <FaDownload size={10} />
                                Download .xsl
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

                {/* Code area */}
                <div className="flex-1 overflow-auto p-4 min-h-0">
                    {loading && (
                        <div className="flex items-center justify-center h-32 text-gray-500 gap-2">
                            <FaSpinner className="animate-spin" />
                            <span className="text-sm">Generating XSLT…</span>
                        </div>
                    )}
                    {!loading && error && (
                        <div className="p-4 bg-red-900/60 border border-red-700 rounded text-red-200 text-sm font-mono">
                            {error}
                        </div>
                    )}
                    {!loading && !error && !xslt && (
                        <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
                            No XSLT generated. Check that the project has an XML document mapping configured.
                        </div>
                    )}
                    {!loading && !error && xslt && (
                        <HighlightedXml xml={xslt} />
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}
