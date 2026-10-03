import React, { useEffect, useRef } from 'react';
import { X, Globe2, ShieldCheck, Database, Layers, ExternalLink, AlertCircle, Info } from 'lucide-react';

const SOURCES = [
  {
    name: 'OpenAlex',
    scope: 'Global scholarly graph covering articles, books, dissertations, citations, concepts, and topics.',
    role: 'Primary scholarly catalog & institution analytics',
    badge: 'API v2',
  },
  {
    name: 'arXiv',
    scope: 'Cornell University open-access repository for physics, computer science, mathematics, quantitative biology, and economics preprints.',
    role: 'Preprints & direct PDFs',
    badge: 'Open Archive',
  },
  {
    name: 'Crossref',
    scope: 'Authoritative Digital Object Identifier (DOI) registration agency with publisher metadata and verified citation counts.',
    role: 'DOIs & Publisher metadata',
    badge: 'DOI Registry',
  },
  {
    name: 'Europe PMC',
    scope: 'Biomedical and life sciences research repository providing PubMed Central articles and open-access full texts.',
    role: 'Life Sciences & Direct PDFs',
    badge: 'Life Sciences',
  },
  {
    name: 'HAL Open Science',
    scope: 'National multi-disciplinary open archive maintained by CNRS and European academic research establishments.',
    role: 'European Open Science',
    badge: 'European Archive',
  },
  {
    name: 'DOAJ (Directory of Open Access Journals)',
    scope: 'Community-curated directory of high-quality, peer-reviewed, open-access scholarly journals across all disciplines.',
    role: 'Peer-reviewed Open Access',
    badge: 'Quality Curated',
  },
  {
    name: 'The Thesis Archive (Local Repository)',
    scope: 'Curated institutional depository containing approved theses, dissertations, degree awards, and associated research datasets.',
    role: 'Institutional Degree Theses',
    badge: 'Local Depository',
  },
];

export default function CoverageModal({ isOpen, onClose }) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="coverage-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-[#1A1916] border border-[#D5D1C7] dark:border-[#2C2A26] rounded-sm max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2DFD8] dark:border-[#2C2A26] bg-[#FAF9F5] dark:bg-[#201F1C]">
          <div className="flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-[#1C1B18] dark:text-[#F0EDE6]" />
            <div>
              <h2 id="coverage-modal-title" className="font-serif-title text-base sm:text-lg font-bold text-[#1C1B18] dark:text-[#F0EDE6]">
                Federated Coverage & Scholarly Sources
              </h2>
              <p className="text-[11px] font-mono-meta text-[#737067] dark:text-[#9C988F]">
                Truthful Discovery & Source Integrity Disclosure
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close coverage modal"
            className="min-h-[44px] min-w-[44px] p-2 text-[#737067] dark:text-[#9C988F] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] hover:bg-[#FAF9F5] dark:hover:bg-[#272521] border border-transparent hover:border-[#D5D1C7] dark:hover:border-[#383530] rounded-sm transition flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-[#524F47] dark:text-[#B0ACA2] leading-relaxed">
          {/* Overview note */}
          <div className="bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#E2DFD8] dark:border-[#2C2A26] p-3.5 rounded-sm space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-[#1C1B18] dark:text-[#F0EDE6]">
              <Info className="w-4 h-4 text-[#8C887E] dark:text-[#9C988F]" />
              <span>Discovery Architecture Disclosure</span>
            </div>
            <p>
              Project Panther is a federated research discovery service. Searches query multiple independent
              academic repositories concurrently in real-time. Coverage reflects the combined holdings of our
              named partner providers and is subject to upstream index latency and metadata completeness.
            </p>
          </div>

          {/* Named Sources */}
          <div className="space-y-3">
            <h3 className="font-serif-title text-sm font-bold text-[#1C1B18] dark:text-[#F0EDE6] flex items-center gap-1.5">
              <Database className="w-4 h-4 text-[#1C1B18] dark:text-[#F0EDE6]" />
              Federated Academic Sources
            </h3>
            <div className="grid grid-cols-1 gap-2.5">
              {SOURCES.map((src) => (
                <div
                  key={src.name}
                  className="border border-[#E2DFD8] dark:border-[#2C2A26] p-3 rounded-sm hover:border-[#C5C1B8] dark:hover:border-[#383530] transition bg-white dark:bg-[#201F1C] space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#1C1B18] dark:text-[#F0EDE6] text-xs">{src.name}</span>
                    <span className="text-[10px] font-mono-meta bg-[#FAF9F5] dark:bg-[#272521] border border-[#D5D1C7] dark:border-[#383530] px-1.5 py-0.5 rounded-xs text-[#737067] dark:text-[#9C988F]">
                      {src.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#605D55] dark:text-[#9C988F]">{src.scope}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Capability Matrix & Filter Integrity */}
          <div className="space-y-2 pt-2 border-t border-[#E2DFD8] dark:border-[#2C2A26]">
            <h3 className="font-serif-title text-sm font-bold text-[#1C1B18] dark:text-[#F0EDE6] flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#1C1B18] dark:text-[#F0EDE6]" />
              Filter Capabilities & Limitations
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-[11px] text-[#605D55] dark:text-[#9C988F]">
              <li>
                <strong>Publisher Filtering:</strong> Supported by Local Archive, OpenAlex, and Crossref. Sources lacking publisher taxonomy (e.g. arXiv, Europe PMC, HAL) are skipped automatically rather than returning false negative zero results.
              </li>
              <li>
                <strong>Institutional Affiliations:</strong> Matched via OpenAlex and ROR metadata. Affiliation reflects coauthorship footprint on published works, not exclusive university ownership.
              </li>
              <li>
                <strong>Degree Awards:</strong> Degree-awarding institution classification is strictly reserved for theses and dissertations in the local depository.
              </li>
              <li>
                <strong>Zero Fabrication:</strong> Missing metadata (citations, abstracts, DOI, licensing) is represented honestly as unknown/null; data is never fabricated or simulated.
              </li>
              <li>
                <strong>Session Integrity:</strong> Search sessions are buffered for 30 minutes with multi-provider deduplication to ensure repeatable page browsing without shifting record positions.
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#E2DFD8] dark:border-[#2C2A26] bg-[#FAF9F5] dark:bg-[#201F1C] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 bg-[#1C1B18] hover:bg-black dark:bg-[#F0EDE6] dark:hover:bg-[#E2DFD8] text-white dark:text-[#141412] text-xs font-mono-meta rounded-sm transition cursor-pointer font-bold"
          >
            Close Disclosure
          </button>
        </div>
      </div>
    </div>
  );
}
