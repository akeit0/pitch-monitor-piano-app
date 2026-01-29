import WebAudioFontPlayer from './WebAudioFontPlayer';
// @ts-ignore
import pianoSoundFont from './piano.js';

export class AudioEngine {
    private context: AudioContext | null = null;
    private player: any;
    private masterGain: GainNode | null = null;
    private instrument: any;
    private activeEnvelopes: Map<number, any> = new Map();

    constructor() {
        console.log("AudioEngine initializing...");
        try {
            this.player = new WebAudioFontPlayer();
        } catch (e) {
            console.error("Failed to initialize WebAudioFontPlayer", e);
        }
    }

    async init() {
        if (this.context) return;

        console.log("AudioEngine: creating AudioContext");
        this.context = new (window.AudioContext || (window as any).webkitAudioContext)();

        // Handle auto-resume if created in suspended state (common in browsers)
        if (this.context.state === 'suspended') {
            console.log("AudioContext created in suspended state. Attempting resume...");
            this.context.resume().catch(e => console.debug("Auto-resume failed", e));
        }

        this.masterGain = this.context.createGain();
        this.masterGain.connect(this.context.destination);
        this.masterGain.gain.value = 0.5;

        // Load instrument from imported object
        this.instrument = pianoSoundFont;
        if (!this.instrument) {
            console.error("AudioEngine: No instrument data found!");
            return;
        }

        console.log("AudioEngine: Decoding zones explicitely...");
        await this.decodeZones(this.context, this.instrument);
        console.log("AudioEngine: Decoding finished.");

        // Still call adjustPreset to ensure other properties (loop, pitch) are set correctly by the lib
        if (this.player && this.player.loader) {
            this.player.loader.adjustPreset(this.context, this.instrument);
        }
    }

    private async decodeZones(audioContext: AudioContext, preset: any) {
        if (!preset.zones) return;

        const promises = preset.zones.map(async (zone: any, index: number) => {
            if (zone.buffer) return; // Already decoded

            if (zone.file) {
                // Decode 'file' (base64 encoded audio)
                try {
                    const binaryString = window.atob(zone.file);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    const buffer = await audioContext.decodeAudioData(bytes.buffer);
                    zone.buffer = buffer;
                } catch (e) {
                    console.error(`AudioEngine: Failed to decode zone ${index}`, e);
                }
            } else if (zone.sample) {
                // Decode 'sample' (custom base64 format used by WebAudioFont)
                // The library does this synchronously in adjustPreset, but we can do it here if needed.
                // Usually piano.js (FluidR3) uses 'file'.
                console.log(`AudioEngine: Zone ${index} uses 'sample', trusting adjustPreset.`);
            }
        });

        await Promise.all(promises);
    }

    async ensureRunning() {
        if (!this.context) {
            await this.init();
        }

        if (this.context && this.context.state !== 'running') {
            try {
                await this.context.resume();
            } catch (err) {
                console.warn("AudioEngine: Context resume failed (interaction needed?)", err);
            }
        }
    }

    setVolume(vol: number) {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, vol));
        }
    }

    transpose: number = 0;

    setTranspose(semitones: number) {
        this.transpose = semitones;
    }

    noteOn(pitch: number, velocity: number = 100) {
        if (!this.context || !this.masterGain || !this.player || !this.instrument) return;

        const actualPitch = pitch + this.transpose;

        // Stop existing note of same pitch
        this.noteOff(pitch);

        const when = this.context.currentTime;
        const volume = Math.max(0, Math.min(1, velocity / 127));

        try {
            const envelope = this.player.queueWaveTable(
                this.context,
                this.masterGain,
                this.instrument,
                when,
                actualPitch,
                999,
                volume
            );
            this.activeEnvelopes.set(pitch, envelope);
        } catch (e) {
            console.error(`AudioEngine: noteOn error for pitch ${actualPitch}`, e);
        }
    }

    noteOff(pitch: number) {
        const envelope = this.activeEnvelopes.get(pitch);
        if (envelope) {
            if (this.context) {
                if (envelope.cancel) {
                    envelope.cancel();
                }
            }
            this.activeEnvelopes.delete(pitch);
        }
    }

    panic() {
        this.activeEnvelopes.forEach((envelope) => {
            if (envelope && envelope.cancel) envelope.cancel();
        });
        this.activeEnvelopes.clear();
    }
}

export const audioEngine = new AudioEngine();
