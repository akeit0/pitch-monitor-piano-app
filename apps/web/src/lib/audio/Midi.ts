import { audioEngine } from "./AudioEngine";

export class MidiManager {
    midiAccess: WebMidi.MIDIAccess | null = null;
    currentInput: WebMidi.MIDIInput | null = null;
    onStateChange: ((inputs: WebMidi.MIDIInput[]) => void) | null = null;
    currentInputId: string | null = null;

    constructor() {
        // Auto-initialize if possible
    }

    async init(onStateChange?: (inputs: WebMidi.MIDIInput[]) => void): Promise<{ success: boolean; error?: string }> {
        if (onStateChange) this.onStateChange = onStateChange;

        if (navigator.requestMIDIAccess) {
            try {
                this.midiAccess = await navigator.requestMIDIAccess();
                this.notifyStateChange();
                this.midiAccess.onstatechange = () => this.notifyStateChange();
                return { success: true };
            } catch (e: any) {
                console.warn("WebMIDI not supported or denied", e);
                return { success: false, error: e.message || String(e) };
            }
        }
        return { success: false, error: "WebMIDI API not supported in this environment." };
    }

    getInputs(): WebMidi.MIDIInput[] {
        if (!this.midiAccess) return [];
        return Array.from(this.midiAccess.inputs.values());
    }

    notifyStateChange() {
        if (this.onStateChange) {
            this.onStateChange(this.getInputs());
        }
    }

    setInput(id: string) {
        if (!this.midiAccess) return;

        // If selecting the same ID, do nothing (or re-connect?)
        // If selecting empty string/null, disconnect
        if (!id) {
            this.disconnect();
            return;
        }

        const input = this.midiAccess.inputs.get(id);
        if (input) {
            this.connectInput(input);
        }
    }

    disconnect() {
        if (this.currentInput) {
            this.currentInput.onmidimessage = null;
            this.currentInput = null;
            this.currentInputId = null;
        }
    }

    connectInput(input: WebMidi.MIDIInput) {
        this.disconnect(); // Disconnect previous
        this.currentInput = input;
        this.currentInputId = input.id;
        this.currentInput.onmidimessage = this.handleMidiMessage.bind(this);
        console.log(`Connected to MIDI device: ${input.name}`);
    }

    handleMidiMessage(event: WebMidi.MIDIMessageEvent) {
        const [status, data1, data2] = event.data;
        const command = status & 0xf0;
        // const channel = status & 0x0f;

        if (command === 0x90 && data2 > 0) {
            // Note On
            audioEngine.noteOn(data1, data2);
        } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
            // Note Off
            audioEngine.noteOff(data1);
        }
    }
}
