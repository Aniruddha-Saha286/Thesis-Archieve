import React, { useRef } from 'react';
import useEscapeToClose from '../hooks/useEscapeToClose';
import { X, Globe2, Database, Layers, Info } from 'lucide-react';

// Everything a search asks, in the order a student is likely to care about.
const PAPER_SOURCES = [
  { name: 'The Thesis Archive', note: 'Theses deposited here by students, and thesis records copied from university repositories with a link back to the original.', tag: 'This site' },
  { name: 'OpenAlex', note: 'A very large open index of papers, books and theses from all fields, with citation counts.', tag: 'All fields' },
  { name: 'CORE', note: 'Open-access papers and theses collected from thousands of university repositories.', tag: 'Open access' },
  { name: 'Semantic Scholar', note: 'Papers from all fields, strong in computer science and medicine.', tag: 'All fields' },
  { name: 'Crossref', note: 'The official register of DOIs, with publisher details for journal and conference papers.', tag: 'DOIs' },
  { name: 'DBLP', note: 'Computer science conference and journal papers with clean venue names. It has no abstracts.', tag: 'Computer science' },
  { name: 'arXiv', note: 'Preprints in computer science, physics, mathematics and related fields. Not peer-reviewed.', tag: 'Preprints' },
  { name: 'OpenAIRE', note: 'Research outputs from European and other open repositories.', tag: 'Open access' },
  { name: 'DOAJ', note: 'Articles from checked, peer-reviewed open-access journals.', tag: 'Journals' },
  { name: 'Europe PMC', note: 'Biomedical and life-science papers, many with free full text.', tag: 'Life sciences' },
  { name: 'HAL', note: 'An open archive run by French research institutions, covering all fields.', tag: 'Open access' },
];

const DATASET_SOURCES = ['DataCite', 'Zenodo', 'Figshare', 'Dryad', 'Harvard Dataverse', 'Hugging Face', 'OpenAIRE ScholeXplorer (links a paper to its data)'];

export default function CoverageModal({ isOpen, onClose }) {
  useEscapeToClose(onClose, isOpen);
  const modalRef = useRef(null);

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
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[#E2DFD8] dark:border-[#2C2A26] bg-[#FAF9F5] dark:bg-[#201F1C]">
          <div className="flex items-start gap-2">
            <Globe2 className="w-5 h-5 mt-0.5 text-[#1C1B18] dark:text-[#F0EDE6]" />
            <div>
              <h2 id="coverage-modal-title" className="font-serif-title text-lg text-[#1C1B18] dark:text-[#F0EDE6]">
                Where results come from
              </h2>
              <p className="text-xs text-[#605D55] dark:text-[#9C988F]">
                One search asks this archive and ten outside sources at the same time.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            className="min-h-[40px] min-w-[40px] -mr-2 -mt-1 flex items-center justify-center text-[#605D55] dark:text-[#9C988F] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] hover:bg-[#F2EFE8] dark:hover:bg-[#272521] rounded-sm transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-sm text-[#524F47] dark:text-[#B0ACA2] leading-relaxed">
          <section className="space-y-2.5">
            <h3 className="font-serif-title text-base text-[#1C1B18] dark:text-[#F0EDE6] flex items-center gap-1.5">
              <Database className="w-4 h-4" />
              Papers and theses
            </h3>
            <ul className="grid grid-cols-1 gap-2">
              {PAPER_SOURCES.map((src) => (
                <li key={src.name} className="border border-[#E2DFD8] dark:border-[#2C2A26] p-3 rounded-sm bg-white dark:bg-[#201F1C]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#1C1B18] dark:text-[#F0EDE6]">{src.name}</span>
                    <span className="text-[11px] bg-[#FAF9F5] dark:bg-[#272521] border border-[#D5D1C7] dark:border-[#383530] px-1.5 py-0.5 rounded-xs text-[#605D55] dark:text-[#9C988F] shrink-0">
                      {src.tag}
                    </span>
                  </div>
                  <p className="text-xs text-[#605D55] dark:text-[#9C988F] mt-0.5">{src.note}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-1.5 pt-1">
            <h3 className="font-serif-title text-base text-[#1C1B18] dark:text-[#F0EDE6] flex items-center gap-1.5">
              <Layers className="w-4 h-4" />
              Datasets and free copies
            </h3>
            <p className="text-xs">
              Dataset search asks {DATASET_SOURCES.join(', ')}.
            </p>
            <p className="text-xs">
              “Find a free PDF” asks Unpaywall whether a legal free copy of a paper exists.
            </p>
          </section>

          <section className="space-y-1.5 pt-3 border-t border-[#E2DFD8] dark:border-[#2C2A26]">
            <h3 className="font-serif-title text-base text-[#1C1B18] dark:text-[#F0EDE6] flex items-center gap-1.5">
              <Info className="w-4 h-4" />
              Good to know
            </h3>
            <ul className="list-disc pl-5 space-y-1.5 text-xs">
              <li>
                <strong>IEEE, ACM, Springer, Elsevier.</strong> These publishers have no open search of their own for a site like this. Their papers still appear, through OpenAlex, Crossref, Semantic Scholar and DBLP. Use the Publisher filter to see only one of them. The full text may need a subscription; try “Find a free PDF”.
              </li>
              <li>
                <strong>The same paper from several sources</strong> is shown once.
              </li>
              <li>
                <strong>Nothing is made up.</strong> When a source gives no abstract, citation count or licence, it is shown as missing.
              </li>
              <li>
                <strong>A source can be slow or down.</strong> The results header shows how many sources answered. Results from the others still appear.
              </li>
              <li>
                <strong>Some filters do not work everywhere.</strong> For example, arXiv has no publisher, so it is not asked when a publisher filter is on.
              </li>
              <li>
                <strong>Citation counts</strong> come from the source named beside them and can differ between sources.
              </li>
            </ul>
          </section>
        </div>

        <div className="px-5 py-3 border-t border-[#E2DFD8] dark:border-[#2C2A26] bg-[#FAF9F5] dark:bg-[#201F1C] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 bg-[#1C1B18] hover:bg-black dark:bg-[#F0EDE6] dark:hover:bg-[#E2DFD8] text-white dark:text-[#141412] text-sm font-semibold rounded-sm transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
