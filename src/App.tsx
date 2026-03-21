import { useState, useEffect } from 'react';
import { ModulatorUI } from './components/ModulatorUI';
import { Header } from './components/Header';

function App() {
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    // Catch cases where the event fired before this listener was attached
    if (typeof (window as any).__isPro !== 'undefined') {
        setIsPro((window as any).__isPro);
    }
    const handleAuth = (e: any) => setIsPro(e.detail.isPro);
    window.addEventListener('auth:status', handleAuth as EventListener);
    return () => window.removeEventListener('auth:status', handleAuth as EventListener);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-brain-bg text-slate-200 font-sans overflow-hidden">
      <Header />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-brain-bg to-[#0b1021] relative">
        {/* subtle background grid for lab feel */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>

        <div className="relative z-10 w-full min-h-full flex flex-col py-8">
          <ModulatorUI isPro={isPro} />
        </div>
      </main>
    </div>
  );
}

export default App;
