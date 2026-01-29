export const NOTES = [
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
];

export function getNoteName(midi: number): string {
    const octave = Math.floor(midi / 12) - 1;
    const note = NOTES[midi % 12];
    return `${note}${octave}`;
}

export function getPitchInfo(midi: number) {
    const rounded = Math.round(midi);
    const diff = midi - rounded;
    const cents = Math.round(diff * 100);
    const note = getNoteName(rounded);
    return { note, cents, roundedMidi: rounded };
}
