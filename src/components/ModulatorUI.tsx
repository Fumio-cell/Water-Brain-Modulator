import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Square, UploadCloud, Activity, Waves, Zap, Mic, Download } from 'lucide-react';
import { ModulationEngine } from '../dsp/engine';
import { encodeWav } from '../audio/encoder';

interface ModulatorUIProps {
    isPro: boolean;
}

export const ModulatorUI: React.FC<ModulatorUIProps> = ({ isPro }) => {
    const [engine] = useState(() => new ModulationEngine());
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [volDepth, setVolDepth] = useState(0.3);
    const [panDepth, setPanDepth] = useState(0.4);
    const [fileName, setFileName] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Scopes visuals
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>(0);

    const drawScopes = useCallback(() => {
        if (!canvasRef.current || !isPlaying) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Background fade for oscilloscope effect
        ctx.fillStyle = 'rgba(15, 23, 42, 0.2)'; // brain-bg
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const currentTime = engine.getCurrentTime();
        const lfos = engine.getLfoValue(currentTime);

        const drawX = (currentTime * 50) % canvas.width;

        if (drawX < 5) {
            ctx.fillStyle = 'rgba(15, 23, 42, 1.0)';
            ctx.fillRect(0, 0, 10, canvas.height);
        }

        // Vol (Cyan)
        const volY = canvas.height * 0.25 + (lfos.volLfo * canvas.height * 0.2);
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(drawX, volY, 2, 0, 2 * Math.PI);
        ctx.fill();

        // Pan (Indigo)
        const panY = canvas.height * 0.75 + (lfos.panLfo * canvas.height * 0.2);
        ctx.fillStyle = '#818cf8';
        ctx.beginPath();
        ctx.arc(drawX, panY, 2, 0, 2 * Math.PI);
        ctx.fill();

        requestRef.current = requestAnimationFrame(drawScopes);
    }, [engine, isPlaying]);

    useEffect(() => {
        if (isPlaying) {
            requestRef.current = requestAnimationFrame(drawScopes);
        } else {
            cancelAnimationFrame(requestRef.current);
        }
        return () => cancelAnimationFrame(requestRef.current);
    }, [isPlaying, drawScopes]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsLoading(true);
        setFileName(file.name);
        try {
            const buffer = await engine.loadAudio(file);
            setAudioBuffer(buffer);
        } catch (err) {
            alert("ファイルの読み込みに失敗しました。");
            console.error(err);
        }
        setIsLoading(false);
    };

    const handleDownload = (recordData: { channels: Float32Array[], sampleRate: number }) => {
        const blob = encodeWav(recordData.channels, recordData.sampleRate);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const base = fileName?.replace(/\.[^.]+$/, '') || 'modulated';
        a.download = `${base}_modulated.wav`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const togglePlay = (recordMode: boolean = false) => {
        if (!audioBuffer) return;
        if (isPlaying) {
            const recordData = engine.stop();
            if (isRecording && recordData) {
                handleDownload(recordData);
            }
            setIsPlaying(false);
            setIsRecording(false);
        } else {
            if (recordMode && !isPro) {
                if (confirm("Recording is a PRO feature. Would you like to upgrade?")) {
                    window.dispatchEvent(new CustomEvent('app:buyPro'));
                }
                return;
            }
            engine.play(audioBuffer, volDepth, panDepth, recordMode);
            setIsPlaying(true);
            setIsRecording(recordMode);
        }
    };

    const handleVolDepthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setVolDepth(val);
        engine.setVolumeDepth(val);
    };

    const handlePanDepthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setPanDepth(val);
        engine.setPanDepth(val);
    };

    return (
        <div className="flex flex-col min-h-full items-center p-4 md:p-8 w-full max-w-4xl mx-auto pb-24">

            {/* Visualizer Panel */}
            <div className="w-full bg-brain-panel/50 backdrop-blur-xl rounded-2xl border border-white/5 shadow-2xl overflow-hidden mb-8 relative group">
                <div className="absolute top-4 left-4 text-[10px] font-mono text-slate-500 uppercase flex gap-4 z-10">
                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] shadow-[0_0_8px_#38bdf8]"></span> 1/f Breathe</span>
                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#818cf8] shadow-[0_0_8px_#818cf8]"></span> 1/f Drift</span>
                </div>
                
                {isRecording && (
                    <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/30 rounded-full animate-pulse z-10">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        <span className="text-[10px] font-bold text-red-500 tracking-tighter uppercase">Recording Modulated Flow</span>
                    </div>
                )}

                <canvas
                    ref={canvasRef}
                    width={800}
                    height={250}
                    className="w-full h-64 object-cover opacity-90 transition-opacity duration-700"
                ></canvas>
                
                {!isPlaying && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-slate-950/20">
                        <div className="flex flex-col items-center gap-2 transition-transform duration-500 scale-95 opacity-50">
                            <Activity className="w-8 h-8 text-slate-500" />
                            <span className="text-slate-600 font-mono tracking-[0.3em] text-[10px] uppercase">
                                System Idle / Waiting for Signal
                            </span>
                        </div>
                    </div>
                )}
                
                <div className="absolute inset-0 bg-gradient-to-t from-brain-panel/80 to-transparent pointer-events-none"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                {/* Input / Control Panel */}
                <div className="bg-white/[0.03] backdrop-blur-md p-8 rounded-3xl border border-white/5 shadow-xl flex flex-col gap-8">
                    <div className="flex items-center justify-between border-b border-white/5 pb-4">
                        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-3">
                            <UploadCloud className="w-4 h-4 text-brain-accent" /> Audio Source
                        </h2>
                        {audioBuffer && (
                            <span className="text-[9px] font-bold text-emerald-400 border border-emerald-400/20 px-2 py-0.5 rounded-md bg-emerald-400/5 uppercase tracking-tighter">
                                Connected
                            </span>
                        )}
                    </div>

                    <div className="flex flex-col gap-6">
                        <label className="group relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-700/50 rounded-2xl cursor-pointer hover:bg-white/[0.02] hover:border-brain-accent/30 transition-all duration-300">
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <UploadCloud className="w-10 h-10 mb-4 text-slate-500 group-hover:text-brain-accent transition-colors duration-300" />
                                <p className="text-xs text-slate-400 group-hover:text-slate-200">
                                    Drop <span className="text-brain-accent">Ambient / Audio</span> here
                                </p>
                            </div>
                            <input type="file" className="hidden" accept="audio/*" onChange={handleFileUpload} />
                        </label>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => togglePlay(false)}
                                disabled={!audioBuffer || isLoading || isRecording}
                                className={`h-14 rounded-xl font-black text-xs tracking-[0.2em] flex items-center justify-center gap-3 transition-all duration-300 ${!audioBuffer ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed' :
                                    isPlaying && !isRecording ? 'bg-slate-200 text-slate-900 shadow-[0_0_20px_rgba(255,255,255,0.2)]' :
                                        'bg-brain-accent/10 text-brain-accent hover:bg-brain-accent/20 border border-brain-accent/20'
                                    }`}
                            >
                                {isPlaying && !isRecording ? <><Square className="w-4 h-4" /> STOP</> :
                                    <><Play className="w-4 h-4" /> INJECT 1/f FLOW</>}
                            </button>

                            <button
                                onClick={() => togglePlay(true)}
                                disabled={!audioBuffer || isLoading || (isPlaying && !isRecording)}
                                className={`h-14 rounded-xl font-black text-xs tracking-[0.2em] flex items-center justify-center gap-3 transition-all duration-300 ${!audioBuffer ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed' :
                                    isRecording ? 'bg-red-500 text-white shadow-[0_0_25px_rgba(239,68,68,0.4)]' :
                                        'bg-white/[0.05] text-slate-400 hover:bg-white/[0.08] border border-white/5 relative group'
                                    }`}
                            >
                                {isRecording ? <><Download className="w-4 h-4" /> COMPLETE & SAVE</> :
                                    <><Mic className="w-4 h-4" /> RECORD MODULATION</>}
                                {!isPro && !isRecording && (
                                    <div className="absolute -top-2 -right-2 bg-amber-500 text-[8px] text-white px-1.5 py-0.5 rounded shadow-lg flex items-center gap-1 font-bold">
                                        <Zap className="w-2 h-2" fill="currentColor" /> PRO
                                    </div>
                                )}
                            </button>
                        </div>

                        <div className="font-mono text-[9px] p-3 bg-black/30 rounded-xl border border-white/5 text-slate-500 flex justify-between overflow-hidden">
                            <span className="truncate pr-4">{isLoading ? 'STABILIZING STREAM...' : (fileName || 'AWAITING INPUT')}</span>
                            <span className="opacity-50 tracking-widest">{isRecording ? 'CAPTURING...' : 'IDLE'}</span>
                        </div>
                    </div>
                </div>

                {/* DSP Parameters Panel */}
                <div className="bg-white/[0.03] backdrop-blur-md p-8 rounded-3xl border border-white/5 shadow-xl flex flex-col gap-10">
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-3 border-b border-white/5 pb-4">
                        <Waves className="w-4 h-4 text-brain-wave" /> Liquid Dynamics
                    </h2>

                    <div className="flex flex-col gap-10 flex-1 justify-center">
                        {/* Volume Depth Slider */}
                        <div className="flex flex-col gap-5">
                            <div className="flex justify-between items-end">
                                <label className="text-[11px] font-bold text-[#38bdf8] uppercase tracking-tighter">
                                    Breathe Depth
                                </label>
                                <span className="font-mono text-[10px] text-slate-500 bg-black/40 px-2 py-0.5 rounded">{(volDepth * 100).toFixed(0)}%</span>
                            </div>
                            <input
                                type="range" min="0" max="1" step="0.01"
                                value={volDepth} onChange={handleVolDepthChange}
                                className="w-full h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-[#38bdf8]"
                            />
                            <div className="flex justify-between text-[8px] text-slate-600 font-mono tracking-widest uppercase">
                                <span>Static</span>
                                <span>Organic Ripple</span>
                            </div>
                        </div>

                        {/* Pan Depth Slider */}
                        <div className="flex flex-col gap-5">
                            <div className="flex justify-between items-end">
                                <label className="text-[11px] font-bold text-[#818cf8] uppercase tracking-tighter">
                                    Spatial Drift
                                </label>
                                <span className="font-mono text-[10px] text-slate-500 bg-black/40 px-2 py-0.5 rounded">{(panDepth * 100).toFixed(0)}%</span>
                            </div>
                            <input
                                type="range" min="0" max="1" step="0.01"
                                value={panDepth} onChange={handlePanDepthChange}
                                className="w-full h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-[#818cf8]"
                            />
                            <div className="flex justify-between text-[8px] text-slate-600 font-mono tracking-widest uppercase">
                                <span>Narrow</span>
                                <span>Oceanic Sweep</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-auto pt-4 flex items-center gap-3 text-slate-600 border-t border-white/5">
                        <Activity className="w-3 h-3" />
                        <span className="text-[9px] font-medium tracking-tight">1/f pink noise generated @ 120sec loop profile</span>
                    </div>
                </div>

            </div>
        </div>
    );
};
