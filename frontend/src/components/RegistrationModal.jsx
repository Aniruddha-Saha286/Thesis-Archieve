import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

export default function RegistrationModal({ isOpen, onClose }) {
  const { registerStudent } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    university: '',
    studentId: '',
    degreeProgram: 'B.Sc. Undergraduate Thesis',
    researchDomain: 'Renewable Energy & Materials',
    thesisGoal: '',
    idCardProof: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await registerStudent(formData);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit student application.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#D5D1C7] rounded-sm w-full max-w-lg p-6 shadow-2xl relative max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#737067] hover:text-[#1C1B18] font-mono-meta text-xs"
        >
          [✕ CLOSE]
        </button>

        <div className="mb-5 pb-3 border-b border-[#E2DFD8]">
          <span className="text-[10px] font-mono-meta text-[#737067] uppercase tracking-wider block">
            Academic Depository
          </span>
          <h2 className="text-2xl font-serif-title font-normal text-[#1C1B18] mt-0.5">
            Student Verification Registry
          </h2>
          <p className="text-xs text-[#737067] mt-1 font-light">
            Provide your verified university credentials. Access is granted free of charge upon editorial review.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-mono-meta flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Full Student Name *</label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Zarin Tasnim"
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
              />
            </div>
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Academic Email *</label>
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                placeholder="name@university.edu"
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">University / Institute *</label>
              <input
                type="text"
                name="university"
                required
                value={formData.university}
                onChange={handleChange}
                placeholder="e.g. University of Dhaka"
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
              />
            </div>
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Student ID Number *</label>
              <input
                type="text"
                name="studentId"
                required
                value={formData.studentId}
                onChange={handleChange}
                placeholder="e.g. 2020-04-189"
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Degree Program *</label>
              <select
                name="degreeProgram"
                value={formData.degreeProgram}
                onChange={handleChange}
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
              >
                <option>B.Sc. Undergraduate Thesis</option>
                <option>M.Sc. Postgraduate Thesis</option>
                <option>M.Phil Researcher</option>
                <option>Doctoral Candidate (Ph.D.)</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Research Domain *</label>
              <select
                name="researchDomain"
                value={formData.researchDomain}
                onChange={handleChange}
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
              >
                <option>Renewable Energy & Materials</option>
                <option>Computer Science & NLP</option>
                <option>Biomedical & Clinical Science</option>
                <option>Agricultural Systems & Soil</option>
                <option>Development Economics</option>
                <option>Other Disciplines</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#1C1B18] mb-1">Password for Portal Access *</label>
            <input
              type="password"
              name="password"
              required
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••••••"
              className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
            />
          </div>

          <div>
            <label className="block font-medium text-[#1C1B18] mb-1">Thesis Working Title or Research Inquiry *</label>
            <textarea
              name="thesisGoal"
              rows="2"
              required
              value={formData.thesisGoal}
              onChange={handleChange}
              placeholder="Describe the research questions, paper references, or datasets you are seeking..."
              className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
            ></textarea>
          </div>

          <div>
            <label className="block font-medium text-[#1C1B18] mb-1">Student ID Card / Proof (Filename/URL)</label>
            <input
              type="text"
              name="idCardProof"
              value={formData.idCardProof}
              onChange={handleChange}
              placeholder="e.g. student_id_card_scan.jpg (or image link)"
              className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1C1B18] hover:bg-[#2E2C28] text-white font-medium py-2 rounded-sm transition text-xs shadow-sm cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Submitting Application...' : 'Submit Application for Editorial Verification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
