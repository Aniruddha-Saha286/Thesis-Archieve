import React, { useState } from 'react';
import { Check, X, FileText, Eye } from 'lucide-react';
import DocumentViewerModal from './DocumentViewerModal';

export default function VerificationDrawer({ isOpen, onClose, pendingStudents, onEvaluate, loading }) {
  const [inspectingCandidate, setInspectingCandidate] = useState(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-neutral-900/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-lg bg-white border-l border-[#D5D1C7] p-6 shadow-2xl overflow-y-auto">
          
          {/* Drawer Header */}
          <div className="flex items-center justify-between pb-4 border-b border-[#E2DFD8] mb-5">
            <div>
              <h3 className="text-xl font-serif-title font-semibold text-[#1C1B18]">
                Candidate Verification Desk
              </h3>
              <p className="text-xs font-mono-meta text-[#737067] mt-0.5">
                Administrative evaluation of registered student credentials
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-[#737067] hover:text-[#1C1B18] font-mono-meta text-xs cursor-pointer"
            >
              [✕ CLOSE]
            </button>
          </div>

          {/* List of Applications */}
          {(!pendingStudents || pendingStudents.length === 0) ? (
            <div className="py-12 text-center text-xs font-mono-meta text-[#737067] space-y-2">
              <div className="text-2xl">✓</div>
              <p>No student applications currently pending review.</p>
              <p className="text-[11px] text-[#99958C]">All registered researchers have been evaluated.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(pendingStudents || []).map((candidate) => (
                <div
                  key={candidate._id}
                  className="border border-[#E2DFD8] p-4 rounded-sm space-y-3 bg-[#FAF9F5]"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-[#1C1B18]">{candidate.name}</h4>
                      <p className="text-xs font-mono-meta text-[#737067]">{candidate.email}</p>
                    </div>
                    <span className="px-2 py-0.5 border border-amber-300 bg-amber-50 text-amber-800 text-[10px] font-mono-meta font-bold">
                      AWAITING REVIEW
                    </span>
                  </div>

                  <div className="text-xs font-mono-meta space-y-1.5 text-[#524F47] bg-white p-3 border border-[#E5E2DA]">
                    <div>
                      <span className="text-[#8C887E]">INSTITUTION:</span>{' '}
                      <strong className="text-[#1C1B18]">{candidate.university || 'University Student'}</strong>
                    </div>
                    <div>
                      <span className="text-[#8C887E]">STUDENT ID:</span>{' '}
                      <code className="bg-[#FAF9F5] px-1 py-0.5 rounded text-[#1C1B18]">
                        {candidate.studentId || 'N/A'}
                      </code>
                    </div>
                    <div>
                      <span className="text-[#8C887E]">DEGREE:</span> {candidate.degreeProgram}
                    </div>
                    <div>
                      <span className="text-[#8C887E]">DOMAIN:</span> {candidate.researchDomain}
                    </div>
                    {candidate.thesisGoal && (
                      <div>
                        <span className="text-[#8C887E]">TOPIC:</span>{' '}
                        <em className="text-[#1C1B18]">{candidate.thesisGoal}</em>
                      </div>
                    )}
                    {(candidate.hasVerificationDocument || candidate.idCardProof) && (
                      <div className="pt-2 border-t border-[#E5E2DA] space-y-1">
                        <div className="flex items-center gap-1.5 text-[#1C1B18]">
                          <FileText className="w-3.5 h-3.5 text-[#737067]" />
                          <span className="font-bold">STUDENT ID PROOF:</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setInspectingCandidate(candidate)}
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-[#FAF9F5] hover:bg-blue-50 border border-[#D5D1C7] px-2.5 py-1 rounded-sm cursor-pointer transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect Verification Document (Protected) &rarr;</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1 font-mono-meta text-xs">
                    <button
                      onClick={() => onEvaluate(candidate._id, 'approve')}
                      disabled={loading}
                      className="flex-1 bg-[#1C1B18] hover:bg-[#2E2C28] text-white py-2 rounded-sm font-medium transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Grant Full Access</span>
                    </button>
                    <button
                      onClick={() => onEvaluate(candidate._id, 'reject')}
                      disabled={loading}
                      className="px-3 bg-white border border-[#D5D1C7] hover:bg-red-50 text-red-700 py-2 rounded-sm transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Decline</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* Protected Document Viewer Modal */}
      {inspectingCandidate && (
        <DocumentViewerModal
          isOpen={!!inspectingCandidate}
          onClose={() => setInspectingCandidate(null)}
          studentId={inspectingCandidate._id}
          studentName={inspectingCandidate.name}
        />
      )}
    </div>
  );
}
