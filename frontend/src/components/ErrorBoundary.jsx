import React from 'react';
import { AlertTriangle, RefreshCw, LogIn } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[Project Panther ErrorBoundary caught error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetAndLogin = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
    }
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAF9F5] text-[#1C1B18] flex flex-col justify-between p-6">
          <header className="max-w-4xl mx-auto w-full flex items-center justify-between py-4 border-b border-[#E2DFD8]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-sm bg-[#1C1B18] text-[#FAF9F5] flex items-center justify-center font-serif-title text-xl font-normal">
                §
              </div>
              <div>
                <span className="font-serif-title text-lg tracking-tight text-[#1C1B18] block leading-none">
                  The Thesis Archive
                </span>
                <span className="text-[11px] font-mono-meta text-[#737067] uppercase tracking-wider">
                  The Thesis Archive
                </span>
              </div>
            </div>
          </header>

          <main className="max-w-xl mx-auto w-full my-auto py-8">
            <div className="bg-white border border-[#E2DFD8] rounded-sm p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-amber-700 font-mono-meta text-xs uppercase tracking-wider font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Runtime Application Exception</span>
              </div>

              <h1 className="font-serif-title text-2xl text-[#1C1B18] leading-tight">
                An unexpected interface error interrupted this session
              </h1>

              <p className="text-xs text-[#524F47] leading-relaxed">
                The interface encountered a rendering exception. You can reload the page or reset the local session cache to return to the identity authentication gateway.
              </p>

              {this.state.error && (
                <div className="p-3 bg-[#FAF9F5] border border-[#E2DFD8] rounded-xs font-mono-meta text-[11px] text-red-700 overflow-x-auto whitespace-pre-wrap">
                  {this.state.error.toString()}
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 bg-[#1C1B18] text-white hover:bg-black rounded-sm text-xs font-mono-meta flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reload Application</span>
                </button>

                <button
                  type="button"
                  onClick={this.handleResetAndLogin}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 bg-[#FAF9F5] border border-[#D5D1C7] text-[#1C1B18] hover:bg-[#F2EFE8] rounded-sm text-xs font-mono-meta flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Reset Cache & Sign In</span>
                </button>
              </div>
            </div>
          </main>

          <footer className="max-w-4xl mx-auto w-full py-4 border-t border-[#E2DFD8] text-center text-xs font-mono-meta text-[#737067]">
            Prepared and Developed by CSE IMPOSTERS TEAM
          </footer>
        </div>
      );
    }

    return this.props.children;
  }
}
