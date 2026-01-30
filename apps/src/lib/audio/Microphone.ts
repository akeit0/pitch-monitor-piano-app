export class MicrophoneManager {
    audioContext: AudioContext | null = null;
    analyser: AnalyserNode | null = null;
    mediaStream: MediaStream | null = null;
    source: MediaStreamAudioSourceNode | null = null;
    buffer: Float32Array<ArrayBuffer> | null = null;

    constructor() {
        // We create context only on start because browsers require user gesture
        // But we can instantiate the class early.
    }

    /**
     * Start microphone input.
     * @param sharedContext Optional shared AudioContext to use instead of creating a new one.
     *                      Using a shared context prevents audio volume issues on mobile.
     */
    async start(sharedContext?: AudioContext) {
        // Use shared context if provided, otherwise create a new one
        if (sharedContext) {
            this.audioContext = sharedContext;
        } else if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });


            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048; // Good resolution for pitch detection
            this.analyser.smoothingTimeConstant = 0.1; // Less smoothing for faster reaction?

            this.buffer = new Float32Array(this.analyser.fftSize);

            this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.source.connect(this.analyser);

            // Do NOT connect to destination, otherwise we hear feedback loop!
            // this.source.connect(this.audioContext.destination); 
        } catch (e) {
            console.error("Error accessing microphone:", e);
            throw e;
        }
    }

    stop() {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }
        // Don't close the audioContext if it was shared
        // Keep analyser reference but it's now disconnected
    }

    getAudioData(): { buffer: Float32Array, sampleRate: number } | null {
        if (!this.analyser || !this.audioContext || !this.buffer) return null;
        this.analyser.getFloatTimeDomainData(this.buffer);
        return {
            buffer: this.buffer,
            sampleRate: this.audioContext.sampleRate
        };
    }
}
