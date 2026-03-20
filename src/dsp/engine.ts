export class ModulationEngine {
    private ctx: AudioContext | null = null;
    private sourceNode: AudioBufferSourceNode | null = null;

    // Modulation Nodes
    private volModNode: GainNode | null = null; // Applies the volume modulation
    private panModNode: StereoPannerNode | null = null; // Applies the pan modulation
    private filterModNode: BiquadFilterNode | null = null; // Low-pass filter for "breathing" effect
    private rippleModNode: DelayNode | null = null; // NEW: Delay for "ripple" pitch modulation

    // Modulator Sources
    private lfoBufferSource: AudioBufferSourceNode | null = null;
    private volDepthNode: GainNode | null = null;
    private panDepthNode: GainNode | null = null;
    private filterDepthNode: GainNode | null = null; // Maps LFO to filter frequency
    private rippleDepthNode: GainNode | null = null; // NEW: Maps LFO to delay time

    // Output
    private masterGain: GainNode | null = null;

    // Binaural Beats Nodes
    private binauralLeftOsc: OscillatorNode | null = null;
    private binauralRightOsc: OscillatorNode | null = null;
    private binauralMerger: ChannelMergerNode | null = null;
    private binauralGain: GainNode | null = null;

    // Binaural State
    private binauralEnabled: boolean = false;
    private binauralCarrierFreq: number = 432;
    private binauralDiffFreq: number = 6;
    private binauralVol: number = 0.5;

    // State
    private isPlaying = false;
    private lfoBuffer: AudioBuffer | null = null;

    // Recording state
    private recorderNode: ScriptProcessorNode | null = null;
    private recordedChunks: Float32Array[][] = [[], []]; // Left, Right
    private isRecording = false;

    constructor() {
        // Context is created on user interaction
    }

    public async init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

        // Master Gain
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 1.0;
        this.masterGain.connect(this.ctx.destination);

        // 1. Generate slow 1/f noise buffer (120 seconds, looping)
        this.lfoBuffer = this.generateSlowPinkNoise(this.ctx, 120, 0.5); // Max freq: 0.5 Hz
    }

    public async loadAudio(file: File): Promise<AudioBuffer> {
        await this.init();
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await this.ctx!.decodeAudioData(arrayBuffer);
        return audioBuffer;
    }

    public play(buffer: AudioBuffer, volDepth: number = 0.5, panDepth: number = 0.5, flowSpeed: number = 1.0, rippleDepth: number = 0.3, startRecording: boolean = false) {
        if (!this.ctx) return;
        this.stop();

        // 1. Audio Source
        this.sourceNode = this.ctx.createBufferSource();
        this.sourceNode.buffer = buffer;
        this.sourceNode.loop = true;

        // 2. Processing Chain: Source -> Filter -> PanNode -> VolNode -> MasterGain
        this.filterModNode = this.ctx.createBiquadFilter();
        this.filterModNode.type = 'lowpass';
        this.filterModNode.frequency.value = 20000; // Base frequency (fully open)
        this.filterModNode.Q.value = 4.5; // Significantly higher resonance for more "wah" / liquid character

        this.panModNode = this.ctx.createStereoPanner();
        this.volModNode = this.ctx.createGain();
        this.volModNode.gain.value = 1.0;

        this.rippleModNode = this.ctx.createDelay(0.1);
        this.rippleModNode.delayTime.value = 0.02; // 20ms base delay

        this.sourceNode.connect(this.rippleModNode);
        this.rippleModNode.connect(this.filterModNode);
        this.filterModNode.connect(this.panModNode);
        this.panModNode.connect(this.volModNode);
        this.volModNode.connect(this.masterGain!);

        // 3. Set up the Modulator (LFO)
        if (this.lfoBuffer) {
            this.lfoBufferSource = this.ctx.createBufferSource();
            this.lfoBufferSource.buffer = this.lfoBuffer;
            this.lfoBufferSource.loop = true;

            const splitter = this.ctx.createChannelSplitter(2);
            this.lfoBufferSource.connect(splitter);

            this.volDepthNode = this.ctx.createGain();
            this.volDepthNode.gain.value = -volDepth;
            splitter.connect(this.volDepthNode, 0);
            this.volDepthNode.connect(this.volModNode.gain);

            this.panDepthNode = this.ctx.createGain();
            this.panDepthNode.gain.value = panDepth;
            splitter.connect(this.panDepthNode, 1);
            this.panDepthNode.connect(this.panModNode.pan);

            // NEW: Connect same LFO 0 (vol) to filter but with different depth
            this.filterDepthNode = this.ctx.createGain();
            // Expanded range: map 0..1 LFO to -19500Hz (can pull down to 500Hz)
            this.filterDepthNode.gain.value = -19500 * volDepth; 
            splitter.connect(this.filterDepthNode, 0);
            this.filterDepthNode.connect(this.filterModNode.frequency);

            // NEW: Ripple / Pitch modulation
            this.rippleDepthNode = this.ctx.createGain();
            this.rippleDepthNode.gain.value = 0.005 * rippleDepth; // Subtle 5ms max deviation
            splitter.connect(this.rippleDepthNode, 0);
            this.rippleDepthNode.connect(this.rippleModNode.delayTime);

            this.lfoBufferSource.playbackRate.value = flowSpeed;
            this.lfoBufferSource.start();
        }

        // 4. Recording Setup
        if (startRecording) {
            this.isRecording = true;
            this.recordedChunks = [[], []];
            this.recorderNode = this.ctx.createScriptProcessor(4096, 2, 2);
            this.volModNode.connect(this.recorderNode);
            this.recorderNode.connect(this.ctx.destination); // Required for processing

            this.recorderNode.onaudioprocess = (e) => {
                if (!this.isRecording) return;
                const left = e.inputBuffer.getChannelData(0);
                const right = e.inputBuffer.getChannelData(1);
                this.recordedChunks[0].push(new Float32Array(left));
                this.recordedChunks[1].push(new Float32Array(right));
            };
        }

        this.setupBinaural();

        this.sourceNode.start();
        this.isPlaying = true;
    }

    public stop(): { channels: Float32Array[], sampleRate: number } | null {
        if (this.sourceNode) {
            try { this.sourceNode.stop(); } catch (e) { }
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        if (this.lfoBufferSource) {
            try { this.lfoBufferSource.stop(); } catch (e) { }
            this.lfoBufferSource.disconnect();
            this.lfoBufferSource = null;
        }

        this.stopBinaural();
        
        let result = null;
        if (this.isRecording && this.ctx) {
            this.isRecording = false;
            if (this.recorderNode) {
                this.recorderNode.disconnect();
                this.recorderNode = null;
            }

            // Flatten chunks
            const left = this.flattenChunks(this.recordedChunks[0]);
            const right = this.flattenChunks(this.recordedChunks[1]);
            result = { channels: [left, right], sampleRate: this.ctx.sampleRate };
            this.recordedChunks = [[], []];
        }

        this.isPlaying = false;
        return result;
    }

    private flattenChunks(chunks: Float32Array[]): Float32Array {
        const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
        const result = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    }

    // Set real-time parameters
    public setVolumeDepth(depth: number) {
        // depth is 0.0 to 1.0
        if (this.volDepthNode) {
            this.volDepthNode.gain.setTargetAtTime(-depth, this.ctx!.currentTime, 0.1);
        }
    }

    public setPanDepth(depth: number) {
        if (this.panDepthNode) {
            this.panDepthNode.gain.setTargetAtTime(depth, this.ctx!.currentTime, 0.1);
        }
    }

    public setMasterVolume(vol: number) {
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(vol, this.ctx!.currentTime, 0.1);
        }
    }

    public setFlowSpeed(speed: number) {
        if (this.lfoBufferSource) {
            this.lfoBufferSource.playbackRate.setTargetAtTime(speed, this.ctx!.currentTime, 0.1);
        }
    }

    public setRippleDepth(depth: number) {
        if (this.rippleDepthNode) {
            // Map 0..1 to 0..5ms
            this.rippleDepthNode.gain.setTargetAtTime(0.005 * depth, this.ctx!.currentTime, 0.1);
        }
    }

    public getCurrentTime(): number {
        return this.ctx ? this.ctx.currentTime : 0;
    }

    // --- Binaural Methods ---
    
    public setBinauralState(enabled: boolean) {
        this.binauralEnabled = enabled;
        if (this.isPlaying) {
            if (enabled) {
                this.setupBinaural();
            } else {
                this.stopBinaural();
            }
        }
    }

    public setBinauralFrequencies(carrier: number, diff: number) {
        this.binauralCarrierFreq = carrier;
        this.binauralDiffFreq = diff;
        this.updateBinauralFrequencies();
    }

    public setBinauralVolume(vol: number) {
        this.binauralVol = vol;
        if (this.binauralGain && this.ctx) {
            this.binauralGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
        }
    }

    private setupBinaural() {
        if (!this.binauralEnabled || !this.ctx) return;
        this.stopBinaural(); // Clean up existing if any

        this.binauralMerger = this.ctx.createChannelMerger(2);
        this.binauralGain = this.ctx.createGain();
        this.binauralGain.gain.value = this.binauralVol;

        this.binauralLeftOsc = this.ctx.createOscillator();
        this.binauralRightOsc = this.ctx.createOscillator();
        this.binauralLeftOsc.type = 'sine';
        this.binauralRightOsc.type = 'sine';

        this.updateBinauralFrequencies();

        // Hard pan: Left Osc to Channel 0, Right Osc to Channel 1
        this.binauralLeftOsc.connect(this.binauralMerger, 0, 0);
        this.binauralRightOsc.connect(this.binauralMerger, 0, 1);

        this.binauralMerger.connect(this.binauralGain);
        this.binauralGain.connect(this.masterGain!);

        if (this.isRecording && this.recorderNode) {
            this.binauralGain.connect(this.recorderNode);
        }

        this.binauralLeftOsc.start();
        this.binauralRightOsc.start();
    }

    private updateBinauralFrequencies() {
        if (this.binauralLeftOsc && this.binauralRightOsc && this.ctx) {
            const time = this.ctx.currentTime;
            // E.g., Carrier=432, Diff=6 -> Left=429, Right=435
            const halfDiff = this.binauralDiffFreq / 2;
            this.binauralLeftOsc.frequency.setTargetAtTime(this.binauralCarrierFreq - halfDiff, time, 0.1);
            this.binauralRightOsc.frequency.setTargetAtTime(this.binauralCarrierFreq + halfDiff, time, 0.1);
        }
    }

    private stopBinaural() {
        if (this.binauralLeftOsc) {
            try { this.binauralLeftOsc.stop(); } catch (e) {}
            this.binauralLeftOsc.disconnect();
            this.binauralLeftOsc = null;
        }
        if (this.binauralRightOsc) {
            try { this.binauralRightOsc.stop(); } catch (e) {}
            this.binauralRightOsc.disconnect();
            this.binauralRightOsc = null;
        }
        if (this.binauralMerger) {
            this.binauralMerger.disconnect();
            this.binauralMerger = null;
        }
        if (this.binauralGain) {
            this.binauralGain.disconnect();
            this.binauralGain = null;
        }
    }

    // Get raw LFO values for visualization (returns left & right)
    // This is a naive polling approach for the UI
    public getLfoValue(time: number): { volLfo: number, panLfo: number } {
        if (!this.lfoBuffer || !this.isPlaying) return { volLfo: 0, panLfo: 0 };

        // Find index based on time looping
        let t = time % this.lfoBuffer.duration;
        let idx = Math.floor(t * this.lfoBuffer.sampleRate);
        if (idx >= this.lfoBuffer.length) idx = this.lfoBuffer.length - 1;

        const volLfoRaw = this.lfoBuffer.getChannelData(0)[idx];
        const panLfoRaw = this.lfoBuffer.getChannelData(1)[idx];

        return { volLfo: volLfoRaw, panLfo: panLfoRaw };
    }

    /**
     * Generates a stereo buffer of very slow moving 1/f noise.
     */
    private generateSlowPinkNoise(ctx: AudioContext, durationStr: number, maxFreq: number): AudioBuffer {
        const bufferSize = ctx.sampleRate * durationStr;
        const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);

        const dt = 1.0 / ctx.sampleRate;
        const rc = 1.0 / (2.0 * Math.PI * maxFreq);
        const alpha = dt / (rc + dt);

        for (let c = 0; c < 2; c++) {
            const data = buffer.getChannelData(c);

            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            let prev = 0;
            let maxVal = 0.0001; // prevent div by zero
            let minVal = 0;

            // 1st pass: generate and lowpass
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                let pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                b6 = white * 0.115926;

                // Lowpass filter (RC)
                prev = prev + alpha * (pink - prev);
                data[i] = prev;

                if (prev > maxVal) maxVal = prev;
                if (prev < minVal) minVal = prev;
            }

            // Calculate amplitude to normalize
            const range = maxVal - minVal;

            // 2nd pass: Normalize and Scale for more dramatic effect
            // We apply a non-linear curve (Math.pow) to make the "waves" more distinct
            // instead of just hovering around the average.
            for (let i = 0; i < bufferSize; i++) {
                if (c === 0) {
                    // Unipolar: mapping min..max to 0..1
                    let normalized = (data[i] - minVal) / range;
                    // Make the dips more dramatic (breathe effect)
                    data[i] = Math.pow(normalized, 2.0); // curve: mostly low, sharp peaks
                } else {
                    // Bipolar: mapping min..max to -1..1
                    let normalized = (data[i] - minVal) / range;
                    // Enhance the pan sweep so it goes wider more often
                    let bipolar = normalized * 2.0 - 1.0;
                    data[i] = Math.sign(bipolar) * Math.pow(Math.abs(bipolar), 0.8);
                }
            }
        }

        return buffer;
    }
}
