import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LogOut, AlertCircle, ShieldCheck, Sun, Moon } from 'lucide-react';
import axios from 'axios';

export default function StudentRegistrationView() {
  const { user, refreshUser, logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [formData, setFormData] = useState({
    name: user?.name || '',
    university: '',
    studentId: '',
    degreeProgram: 'B.Sc. Undergraduate Thesis',
    researchDomain: 'Renewable Energy & Materials',
    thesisGoal: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await axios.post('/api/auth/complete-profile', formData);
      await refreshUser();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit student registration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] dark:bg-neutral-950 text-[#1C1B18] dark:text-neutral-100 flex flex-col justify-between p-6 transition-colors">
      
      <header className="max-w-6xl mx-auto w-full flex items-center justify-between py-4 border-b border-[#E2DFD8] dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-[#1C1B18] dark:bg-neutral-100 text-[#FAF9F5] dark:text-neutral-950 flex items-center justify-center font-serif-title text-xl font-normal">
            §
          </div>
          <div>
            <span className="font-serif-title text-xl tracking-tight text-[#1C1B18] dark:text-neutral-100 block leading-none">
              The Thesis Archive
            </span>
            <span className="text-[11px] font-mono-meta text-[#737067] dark:text-neutral-400 uppercase tracking-wider">
              Student Registration Gateway
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-sm border border-[#D5D1C7] dark:border-neutral-700 bg-white dark:bg-neutral-800 text-[#5C5950] dark:text-neutral-200 hover:text-[#1C1B18] dark:hover:text-white transition cursor-pointer"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-neutral-600" />}
          </button>

          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 text-xs font-mono-meta text-[#737067] dark:text-neutral-400 hover:text-[#1C1B18] dark:hover:text-white transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>[SIGN OUT]</span>
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto w-full my-auto py-10">
        <div className="bg-white dark:bg-neutral-900 border border-[#E2DFD8] dark:border-neutral-800 p-8 rounded-sm shadow-sm space-y-5">
          
          <div className="pb-3 border-b border-[#E5E2DA] dark:border-neutral-800">
            <span className="text-[11px] font-mono-meta text-[#2C6B3F] dark:text-emerald-400 uppercase tracking-wider font-semibold block flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Signed in as {user?.email}
            </span>
            <h2 className="text-2xl font-serif-title font-normal text-[#1C1B18] dark:text-neutral-100 mt-1">
              Tell us where you study
            </h2>
            <p className="text-xs text-[#737067] dark:text-neutral-400 mt-0.5">
              The team uses these academic details to review your registration. It is done once.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-mono-meta flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono-meta">
            
            <div>
              <label className="block font-medium text-[#1C1B18] dark:text-neutral-200 mb-1">Full Legal Name *</label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Aniruddha Saha"
                className="w-full bg-[#FAF9F5] dark:bg-neutral-800 border border-[#D5D1C7] dark:border-neutral-700 px-3 py-2 text-[#1C1B18] dark:text-neutral-100 rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#1C1B18] dark:text-neutral-200 mb-1">University / Institute *</label>
                <input
                  type="text"
                  name="university"
                  required
                  value={formData.university}
                  onChange={handleChange}
                  placeholder="e.g. University of Dhaka"
                  className="w-full bg-[#FAF9F5] dark:bg-neutral-800 border border-[#D5D1C7] dark:border-neutral-700 px-3 py-2 text-[#1C1B18] dark:text-neutral-100 rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-medium text-[#1C1B18] dark:text-neutral-200 mb-1">Student / Registration ID *</label>
                <input
                  type="text"
                  name="studentId"
                  required
                  value={formData.studentId}
                  onChange={handleChange}
                  placeholder="e.g. 2020-832-114"
                  className="w-full bg-[#FAF9F5] dark:bg-neutral-800 border border-[#D5D1C7] dark:border-neutral-700 px-3 py-2 text-[#1C1B18] dark:text-neutral-100 rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#1C1B18] dark:text-neutral-200 mb-1">Degree Program *</label>
                <select
                  name="degreeProgram"
                  value={formData.degreeProgram}
                  onChange={handleChange}
                  className="w-full bg-[#FAF9F5] dark:bg-neutral-800 border border-[#D5D1C7] dark:border-neutral-700 px-3 py-2 text-[#1C1B18] dark:text-neutral-100 rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400"
                >
                  <option>B.Sc. Undergraduate Thesis</option>
                  <option>M.Sc. Postgraduate Thesis</option>
                  <option>M.Phil. Research</option>
                  <option>Ph.D. Doctoral Dissertation</option>
                  <option>Faculty / Institutional Researcher</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-[#1C1B18] dark:text-neutral-200 mb-1">Primary Research Domain *</label>
                <select
                  name="researchDomain"
                  value={formData.researchDomain}
                  onChange={handleChange}
                  className="w-full bg-[#FAF9F5] dark:bg-neutral-800 border border-[#D5D1C7] dark:border-neutral-700 px-3 py-2 text-[#1C1B18] dark:text-neutral-100 rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400"
                >
                  <option>Computer Science & NLP</option>
                  <option>Biomedical & Clinical Science</option>
                  <option>Agricultural Systems & Soil</option>
                  <option>Development Economics</option>
                  <option>Other Disciplines</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-medium text-[#1C1B18] dark:text-neutral-200 mb-1">Thesis Working Title or Research Inquiry *</label>
              <textarea
                name="thesisGoal"
                rows="2"
                required
                value={formData.thesisGoal}
                onChange={handleChange}
                placeholder="Describe your thesis inquiry or datasets you need..."
                className="w-full bg-[#FAF9F5] dark:bg-neutral-800 border border-[#D5D1C7] dark:border-neutral-700 px-3 py-2 text-[#1C1B18] dark:text-neutral-100 rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400"
              ></textarea>
            </div>

            {/* Registration Review Note */}
            <div className="p-3 bg-[#FAF9F5] dark:bg-neutral-800/60 border border-[#E2DFD8] dark:border-neutral-700/80 rounded-sm text-[11px] font-mono-meta text-[#605D55] dark:text-neutral-400 space-y-1">
              <span className="font-semibold text-[#1C1B18] dark:text-neutral-200 block uppercase tracking-wider text-[11px]">
                Registration Review
              </span>
              <p className="leading-relaxed">
                Your academic details are reviewed by authorized staff before access is approved.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1C1B18] hover:bg-[#2C2A24] dark:bg-amber-500 dark:hover:bg-amber-400 text-[#FAF9F5] dark:text-neutral-950 py-2.5 rounded-sm transition font-semibold cursor-pointer disabled:opacity-50 text-xs"
              >
                {loading ? 'Submitting Application...' : 'Submit Academic Registration'}
              </button>
            </div>

          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto w-full py-4 border-t border-[#E2DFD8] dark:border-neutral-800 text-center text-xs font-mono-meta text-[#737067] dark:text-neutral-500">
        Prepared and Developed by CSE IMPOSTERS TEAM
      </footer>
    </div>
  );
}
