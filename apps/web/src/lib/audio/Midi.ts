import { audioEngine } from "./AudioEngine";

export class MidiManager {
    midiAccess: WebMidi.MIDIAccess | null = null;
    currentInput: WebMidi.MIDIInput | null = null;

    constructor() {
        // Auto-initialize if possible
    }

    async init() {
        if (navigator.requestMIDIAccess) {
            try {
                this.midiAccess = await navigator.requestMIDIAccess();
                this.setupInputs();
                this.midiAccess.onstatechange = () => this.setupInputs();
            } catch (e) {
                console.warn("WebMIDI not supported or denied", e);
            }
        }
    }

    setupInputs() {
        if (!this.midiAccess) return;
        const inputs = Array.from(this.midiAccess.inputs.values());
        // Auto connect to first input for now
        if (inputs.length > 0 && !this.currentInput) {
            this.connectInput(inputs[0]);
        }
    }

    connectInput(input: WebMidi.MIDIInput) {
        if (this.currentInput) {
            this.currentInput.onmidimessage = null;
        }
        this.currentInput = input;
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
