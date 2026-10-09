import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, ArrowRight, Search, Lightbulb, FileText, Bookmark } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';

export default function LoginView() {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signInIntent, setSignInIntent] = useState('');
  const signInHeadingRef = useRef(null);

  const goToSignIn = (event, intent) => {
    event.preventDefault();
    setSignInIntent(intent);
    signInHeadingRef.current?.focus({ preventScroll: true });
    document.getElementById('sign-in')?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  const rawClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const isGoogleConfigured = Boolean(
    rawClientId &&
    rawClientId !== '—' &&
    !rawClientId.includes('—') &&
    rawClientId.trim().length > 5
  );

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle({
        credential: credentialResponse.credential,
      });
    } catch (err) {
      console.error('Google sign-in error:', err);
      const serverMessage = err.response?.data?.message;
      if (serverMessage && typeof serverMessage === 'string') {
        setError(serverMessage);
      } else if (!err.response) {
        setError(
          'Cannot connect to the server (Network or CORS error). Please ensure the backend is running and reachable.'
        );
      } else if (err.response.status === 404 || err.response.status === 405) {
        setError(
          'API address not found (404/405). If running on Vercel, please ensure VITE_API_URL is configured in your Vercel Project Settings.'
        );
      } else if (err.response.status === 401 || err.response.status === 403) {
        setError(
          err.response?.data?.detail || 'Authentication was rejected by the depository server. Please verify your Google account.'
        );
      } else {
        setError(
          err.message || 'Sign-in did not work. Please try again, or use a different Google account.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('The Google sign-in window was closed before it finished. Please try again.');
  };

  const jobs = [
    {
      icon: Search,
      title: 'Find papers',
      text: 'Search university theses and research papers together, then narrow down what matters.',
    },
    {
      icon: Lightbulb,
      title: 'Explore your topic',
      text: 'See who has already done it, which supervisors work on it, and whether data exists for it.',
    },
    {
      icon: FileText,
      title: 'Understand each paper faster',
      text: 'Explore methodology, limitations and future work with supporting excerpts. AI analysis is available when enabled.',
    },
    {
      icon: Bookmark,
      title: 'Build your reading list',
      text: 'Keep a reading list, copy citations in APA, BibTeX or RIS, and compare up to five papers side by side.',
    },
  ];

  return (
    <div className="research-shell welcome-page min-h-screen bg-[#FAF9F5] dark:bg-[#141412] text-[#1C1B18] dark:text-[#F0EDE6] flex flex-col">
      <header className="max-w-6xl mx-auto w-full flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#E2DFD8] dark:border-[#2C2A26]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-2xl bg-[#1C1B18] dark:bg-[#F0EDE6] text-[#FAF9F5] dark:text-[#141412] flex items-center justify-center font-serif-title text-xl font-normal">
            T
          </div>
          <span className="font-serif-title text-xl tracking-tight text-[#1C1B18] dark:text-[#F0EDE6] leading-none">
            The Thesis Archive
          </span>
        </div>
        <a href="#sign-in" className="lg:hidden text-sm font-semibold underline underline-offset-4">
          Sign in
        </a>
      </header>

      <main className="max-w-6xl mx-auto w-full px-5 sm:px-6 py-8 lg:py-12 grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 flex-1 items-start">
        {/* What the site does for a student */}
        <div className="lg:col-span-3 space-y-7">
          <div className="space-y-3">
            <p className="text-xs font-mono-meta uppercase tracking-wider text-amber-800 dark:text-amber-400 font-bold">
              For thesis students
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-6xl font-serif-title font-normal tracking-tight leading-[1.12]">
              Your thesis starts with a spark. Find yours.
            </h1>
            <p className="text-base text-[#524F47] dark:text-[#B0ACA2] max-w-xl leading-relaxed">
              Turn a curious question into a research direction. Discover papers, explore datasets and keep your best ideas in one place.
            </p>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
            {jobs.map((job) => (
              <li key={job.title}>
                <a href="#sign-in" onClick={(event) => goToSignIn(event, job.title)}
                  className="group flex h-full items-start gap-3 bg-white/70 dark:bg-[#1A1916] border border-[#E2DFD8] dark:border-[#2C2A26] hover:border-emerald-600 dark:hover:border-emerald-400 rounded-2xl p-4 transition-colors">
                <span className="mt-0.5 w-8 h-8 shrink-0 rounded-2xl bg-[#1C1B18] dark:bg-[#2C2A26] text-amber-300 flex items-center justify-center">
                  <job.icon className="w-4 h-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-[#1C1B18] dark:text-[#F0EDE6]">{job.title}</span>
                  <span className="block text-sm text-[#605D55] dark:text-[#A8A49C] leading-relaxed mt-0.5">{job.text}</span>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    Sign in to get started <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                </span>
                </a>
              </li>
            ))}
          </ul>

          <figure className="hidden sm:block">
            <figcaption className="text-xs text-[#737067] dark:text-[#9C988F] mb-1.5">A glimpse of your research workspace · illustrative example</figcaption>
            <div className="relative bg-white dark:bg-[#1A1916] border border-[#E2DFD8] dark:border-[#2C2A26] rounded-2xl p-3.5 pl-5 shadow-2xs max-w-xl">
              <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l-sm bg-blue-500" />
              <div className="text-lg font-semibold leading-snug">Sentiment analysis in Bangla using transformers</div>
              <div className="text-[13px] text-[#605D55] dark:text-[#A8A49C] mt-1">
                <span className="font-semibold text-blue-800 dark:text-blue-300">B.Sc. Thesis</span> · 2025 · a university in Dhaka · Advisor named
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[13px]">
                {['Open PDF', 'Save', 'Cite', 'More'].map((action, index) => (
                  <a key={action} href="#sign-in" onClick={(event) => goToSignIn(event, action)}
                    aria-label={`${action} — sign in to use paper tools`}
                    className={`px-2.5 py-1 rounded-2xl ${index === 0 ? 'bg-[#1C1B18] dark:bg-amber-400 text-white dark:text-neutral-950 font-semibold' : 'border border-[#D5D1C7] dark:border-[#383530] hover:border-emerald-600'}`}>
                    {action}
                  </a>
                ))}
              </div>
            </div>
          </figure>
        </div>

        {/* Sign in */}
        <div id="sign-in" className="lg:col-span-2 lg:sticky lg:top-6 scroll-mt-4">
          <div className="bg-white dark:bg-[#1A1916] border border-[#E2DFD8] dark:border-[#2C2A26] rounded-2xl shadow-sm p-5 sm:p-6 space-y-5">
            <div>
              <h2 ref={signInHeadingRef} tabIndex={-1} className="text-xl font-serif-title text-[#1C1B18] dark:text-[#F0EDE6]">Sign in to start</h2>
              {signInIntent && <p role="status" className="mt-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">{signInIntent}: continue with Google to get started.</p>}
              <p className="text-sm text-[#605D55] dark:text-[#A8A49C] mt-1 leading-relaxed">
                Use any Google account. New students add their university details after signing in.
              </p>
            </div>

            {error && (
              <div role="alert" className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {isGoogleConfigured ? (
              <div className="w-full flex flex-col items-center justify-center py-4 bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#E5E2DA] dark:border-[#2C2A26] rounded-2xl px-3 space-y-2 overflow-hidden">
                <div className="w-full flex justify-center">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleError}
                    theme="filled_black"
                    size="large"
                    width="280"
                    text="continue_with"
                    shape="rectangular"
                  />
                </div>
                {loading && (
                  <div role="status" className="text-xs text-[#737067] dark:text-[#9C988F] text-center animate-pulse">
                    Signing you in…
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-300 rounded-2xl space-y-2 text-sm">
                <div className="font-bold flex items-center gap-1.5 text-amber-950 dark:text-amber-200">
                  <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                  Sign-in is not set up yet
                </div>
                <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                  For the site owner: set <code className="bg-amber-100 dark:bg-amber-900/50 px-1 py-0.5 rounded text-amber-950 dark:text-amber-200 font-bold">VITE_GOOGLE_CLIENT_ID</code> in the frontend settings to a Google client ID, then build again.
                </p>
              </div>
            )}

            <ol className="space-y-2 text-sm text-[#524F47] dark:text-[#B0ACA2]">
              {[
                'Sign in with Google.',
                'Add your university, student ID and academic program.',
                'Start searching once the team has checked your details.',
              ].map((text, index) => (
                <li key={text} className="flex items-start gap-2.5">
                  <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full border border-[#D5D1C7] dark:border-[#383530] text-[11px] font-bold flex items-center justify-center">
                    {index + 1}
                  </span>
                  <span className="leading-relaxed">{text}</span>
                </li>
              ))}
            </ol>

            <p className="text-xs text-[#737067] dark:text-[#9C988F] leading-relaxed border-t border-[#F0ECE1] dark:border-[#2C2A26] pt-3">
              Your academic details are used only to confirm you are a university scholar. Editors and administrators sign in here as well.
            </p>
          </div>
        </div>
      </main>

      <footer className="max-w-6xl mx-auto w-full px-5 sm:px-6 py-4 border-t border-[#E2DFD8] dark:border-[#2C2A26] text-center text-xs text-[#737067] dark:text-[#9C988F]">
        Prepared and developed by CSE IMPOSTERS TEAM
      </footer>
    </div>
  );
}
