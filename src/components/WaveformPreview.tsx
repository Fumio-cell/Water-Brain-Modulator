import React, { useRef, useEffect } from 'react';

interface WaveformPreviewProps {
    audioBuffer: AudioBuffer | null;
}

const WaveformPreview: React.FC<WaveformPreviewProps> = ({ audioBuffer }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!audioBuffer || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;
        const data = audioBuffer.getChannelData(0);
        // Optimize step rendering
        const step = Math.ceil(data.length / width);

        ctx.clearRect(0, 0, width, height);

        // Water Brain Modulator styling: #38bdf8 (cyan) to #818cf8 (indigo) to #d946ef (fuchsia)
        const grad = ctx.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0, '#38bdf8');
        grad.addColorStop(0.5, '#818cf8');
        grad.addColorStop(1, '#d946ef');

        ctx.beginPath();
        const mid = height / 2;

        for (let x = 0; x < width; x++) {
            let min = 1.0, max = -1.0;
            // Get min/max for this pixel column to draw the exact envelope
            for (let j = 0; j < step; j++) {
                const idx = x * step + j;
                if (idx < data.length) {
                    const v = data[idx];
                    if (v < min) min = v;
                    if (v > max) max = v;
                }
            }
            const yTop = mid + min * mid * 0.85;
            const yBot = mid + max * mid * 0.85;
            ctx.moveTo(x, yTop);
            ctx.lineTo(x, yBot);
        }

        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        // Make it slightly more organic with line joins
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Subtle center line for the 'zero crossing' reference
        ctx.beginPath();
        ctx.moveTo(0, mid);
        ctx.lineTo(width, mid);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }, [audioBuffer]);

    if (!audioBuffer) return null;

    return (
        <div className="w-full relative h-28 bg-white/[0.01] rounded-2xl border border-white/5 overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 pointer-events-none"></div>
            <div className="absolute top-2 left-3 text-[8px] font-mono font-bold tracking-[0.2em] text-[#38bdf8] uppercase opacity-50 relative z-10 pointer-events-none">
                Full Spectrum Timeline
            </div>
            <canvas 
                ref={canvasRef} 
                className="w-full h-full block opacity-80 group-hover:opacity-100 transition-opacity duration-300"
            />
        </div>
    );
};

export default WaveformPreview;
