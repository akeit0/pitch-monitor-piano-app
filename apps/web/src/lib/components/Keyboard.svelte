<script lang="ts">
    import { audioEngine } from "$lib/audio/AudioEngine";

    // Props
    let {
        rangeStart = 48, // C3
        rangeEnd = 72, // C5
        showLabels = true,
        keyMap = {} as Record<string, number>,
        transpose = 0,
        detectedPitch = null as number | null,
    } = $props();

    // Helper for key positioning
    const getAbsWhiteIndex = (m: number) => {
        const octave = Math.floor(m / 12);
        const note = m % 12; // 0..11
        const whiteOffsets = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
        return octave * 7 + whiteOffsets[note];
    };

    let startWhiteIndex = $derived(getAbsWhiteIndex(rangeStart));

    function getMarkerPosition(midi: number) {
        if (!keys.numWhites) return 0;

        const octave = Math.floor(midi / 12);
        const semitone = midi % 12;
        const index = Math.floor(semitone);
        const fraction = semitone - index;

        // Continuous positions for each semitone (0..11) in white key units
        // Visual centers:
        // C(0): 0.5, C#(1): 1.0, D(2): 1.5, D#(3): 2.0, E(4): 2.5
        // F(5): 3.5 (Gap 1.0 from E), F#(6): 4.0, G(7): 4.5, G#(8): 5.0, A(9): 5.5, A#(10): 6.0, B(11): 6.5
        // Next C is 7.5.
        const offsets = [
            0.5, 1.0, 1.5, 2.0, 2.5, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5,
        ];

        const p1 = offsets[index];
        const p2 = index === 11 ? 7.5 : offsets[index + 1]; // 7.5 = 7 + 0.5 (Next C)

        // Interpolate
        const notePos = p1 + (p2 - p1) * fraction;
        const absPos = octave * 7 + notePos;

        // Relative to start
        // startWhiteIndex is the left edge of the first key.
        // absPos is the center of the note.
        // relative = absPos - startWhiteIndex * 1.0 (since startWhiteIndex is strictly integer white index)
        const relPos = absPos - startWhiteIndex;

        return relPos * (100 / keys.numWhites);
    }

    // State
    let activeNotes = $state(new Set<number>());
    let isAudioEnabled = $state(false);

    // Derived: Reverse map for display: midi -> list of keys (labels)
    // We want the label to guide the user on WHICH KEY converts to the sound.
    // If I map 'A' to offset 0 (C3), and I press 'A', I hear C3.
    // Transpose does not affect the physical mapping key, but sound.
    // User request: "C3, C4 label should change on transpose."
    // This implies the NOTE NAME label on the key should reflect the transposed sound.

    let midiToKeyLabels = $derived.by(() => {
        const map = new Map<number, string[]>();
        if (!showLabels) return map;

        const base = MAPPING_BASE_MIDI;

        for (const [key, offset] of Object.entries(keyMap)) {
            const midi = base + offset;
            const labels = map.get(midi) || [];
            labels.push(key.toUpperCase());
            map.set(midi, labels);
        }
        return map;
    });

    // Helper for black key offsets within an octave (relative to C)
    const blackKeyOffsets = {
        1: 0.55, // C#
        3: 1.65, // D#
        6: 3.55, // F#
        8: 4.6, // G#
        10: 5.65, // A#
    };

    const MAPPING_BASE_MIDI = 57; // A4 is the center for key mapping

    function getNoteName(midi: number) {
        const notes = [
            "C",
            "C#",
            "D",
            "D#",
            "E",
            "F",
            "F#",
            "G",
            "G#",
            "A",
            "A#",
            "B",
        ];
        const octave = Math.floor(midi / 12) - 1;
        const note = notes[midi % 12];
        return `${note}${octave}`;
    }

    function generateKeys(start: number, end: number) {
        const whites = [];
        const blacks = [];
        let whiteCount = 0;

        // Calculate absolute white key index for reference (C-1 = 0)
        // This is purely for calculating relative width positions
        const getAbsWhiteIndex = (m: number) => {
            const octave = Math.floor(m / 12);
            const note = m % 12; // 0..11
            const whiteOffsets = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
            return octave * 7 + whiteOffsets[note];
        };

        const startWhiteIndex = getAbsWhiteIndex(start);

        for (let i = start; i <= end; i++) {
            const octave = Math.floor(i / 12);
            const noteInOctave = i % 12;
            const isBlack = [1, 3, 6, 8, 10].includes(noteInOctave);

            if (!isBlack) {
                whites.push({ midi: i, index: whiteCount++ });
            } else {
                // Calculate position based on OCTAVE start.
                // The offsets in blackKeyOffsets are relative to the start of the octave (C).
                // Absolute position in "white key units" = (octave * 7) + offset.
                // We subtract startWhiteIndex to get position relative to the start of the visible board.

                const offset =
                    blackKeyOffsets[
                        noteInOctave as keyof typeof blackKeyOffsets
                    ];
                const absPos = octave * 7 + offset;
                const relPos = absPos - startWhiteIndex;

                blacks.push({ midi: i, pos: relPos });
            }
        }
        return { whites, blacks, numWhites: whiteCount };
    }

    let keys = $derived(generateKeys(rangeStart, rangeEnd));

    // Pointer Management
    let pointerNotes = new Map<number, number>(); // pointerId -> midi

    function playNote(midi: number) {
        if (!activeNotes.has(midi)) {
            const newSet = new Set(activeNotes);
            newSet.add(midi);
            activeNotes = newSet;

            audioEngine.noteOn(midi);
        }
    }

    function stopNote(midi: number) {
        if (activeNotes.has(midi)) {
            const newSet = new Set(activeNotes);
            newSet.delete(midi);
            activeNotes = newSet;

            audioEngine.noteOff(midi);
        }
    }

    let noteRefCounts = new Map<number, number>();

    function addRef(midi: number) {
        const c = noteRefCounts.get(midi) || 0;
        noteRefCounts.set(midi, c + 1);
        if (c === 0) playNote(midi);
    }

    function removeRef(midi: number) {
        const c = noteRefCounts.get(midi) || 0;
        if (c > 0) {
            noteRefCounts.set(midi, c - 1);
            if (c - 1 === 0) stopNote(midi);
        }
    }

    function handlePointerMove(e: PointerEvent) {
        e.preventDefault();
        if (!pointerNotes.has(e.pointerId)) return;

        const el = document.elementFromPoint(
            e.clientX,
            e.clientY,
        ) as HTMLElement;
        const midi = getMidiFromElement(el);

        const oldMidi = pointerNotes.get(e.pointerId);

        if (midi !== oldMidi) {
            if (oldMidi !== undefined) removeRef(oldMidi);
            if (midi !== null) {
                pointerNotes.set(e.pointerId, midi);
                addRef(midi);
            } else {
                pointerNotes.delete(e.pointerId); // Finger went off keys
            }
        }
    }

    async function handlePointerDown(e: PointerEvent) {
        e.preventDefault();
        // Init audio
        if (!isAudioEnabled) {
            await audioEngine.ensureRunning();
            isAudioEnabled = true;
        }

        const target = e.target as HTMLElement;
        const midi = getMidiFromElement(target);
        if (midi !== null) {
            pointerNotes.set(e.pointerId, midi);
            addRef(midi);
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }
    }

    function handleWindowPointerUp(e: PointerEvent) {
        if (pointerNotes.has(e.pointerId)) {
            e.preventDefault();
            const midi = pointerNotes.get(e.pointerId);
            if (midi !== undefined) {
                removeRef(midi);
                pointerNotes.delete(e.pointerId);
            }
        }
    }

    function getMidiFromElement(el: HTMLElement | null): number | null {
        if (!el) return null;
        if (el.dataset.note) return parseInt(el.dataset.note);
        if (el.parentElement?.dataset?.note)
            return parseInt(el.parentElement.dataset.note);
        return null;
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (e.repeat) return;
        const offset = keyMap[e.key.toLowerCase()];
        if (offset !== undefined) {
            // For key map, we need a consistent base.
            // We chose keys.whites[0].midi as base in the derived loop.
            // Let's rely on consistent logic.
            // const base =
            //     keys.whites.length > 0 ? keys.whites[0].midi : rangeStart; // Old base
            const targetMidi = MAPPING_BASE_MIDI + offset;
            addRef(targetMidi);
        }
    }

    function handleKeyUp(e: KeyboardEvent) {
        const offset = keyMap[e.key.toLowerCase()];
        if (offset !== undefined) {
            // const base =
            //     keys.whites.length > 0 ? keys.whites[0].midi : rangeStart; // Old base
            const targetMidi = MAPPING_BASE_MIDI + offset;
            removeRef(targetMidi);
        }
    }

    function formatPitch(midi: number) {
        const rounded = Math.round(midi);
        const diff = midi - rounded;
        const cents = Math.round(diff * 100);
        const sign = cents >= 0 ? "+" : "";
        return `${getNoteName(rounded)} ${sign}${cents}`;
    }
</script>

<svelte:window
    onkeydown={handleKeyDown}
    onkeyup={handleKeyUp}
    onpointerup={handleWindowPointerUp}
    onpointercancel={handleWindowPointerUp}
/>

<div
    class="keyboard"
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    oncontextmenu={(e) => e.preventDefault()}
    role="application"
    aria-label="Virtual Piano Keyboard"
>
    <!-- White Keys -->
    {#each keys.whites as key}
        <div
            class="white-key"
            class:active={activeNotes.has(key.midi)}
            data-note={key.midi}
        >
            <div class="note-label">
                {key.midi % 12 === 0 // Show C labels
                    ? getNoteName(key.midi + transpose)
                    : ""}
            </div>
            {#if showLabels && midiToKeyLabels.has(key.midi)}
                <div class="key-map-label">
                    {midiToKeyLabels.get(key.midi)?.join(", ")}
                </div>
            {/if}
        </div>
    {/each}

    <!-- Black Keys -->
    {#each keys.blacks as key}
        <div
            class="black-key"
            class:active={activeNotes.has(key.midi)}
            style="width: {80 / keys.numWhites}%; left: {key.pos *
                (100 / keys.numWhites)}%;"
            data-note={key.midi}
        >
            {#if showLabels && midiToKeyLabels.has(key.midi)}
                <div class="key-map-label-black">
                    {midiToKeyLabels.get(key.midi)?.join(", ")}
                </div>
            {/if}
        </div>
    {/each}

    <!-- Pitch Marker -->
    {#if detectedPitch !== null && detectedPitch - transpose >= rangeStart - 1 && detectedPitch - transpose <= rangeEnd + 1}
        <div
            class="pitch-marker"
            style="left: {getMarkerPosition(detectedPitch - transpose)}%"
        >
            <div class="pitch-label">
                {formatPitch(detectedPitch)}
            </div>
        </div>
    {/if}
</div>

<div class="hint">
    {#if !isAudioEnabled}
        Tap to Start Audio
    {/if}
</div>

<style>
    .keyboard {
        position: relative;
        display: flex;
        width: 100%;
        height: 20rem; /* 80 equivalent */
        background-color: #111827;
        border-radius: 0.5rem;
        overflow: hidden;
        user-select: none;
        touch-action: none;
    }

    .pitch-marker {
        position: absolute;
        top: 0;
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 10px solid #ef4444; /* red-500 */
        z-index: 20;
        transform: translateX(-50%);
        pointer-events: none;
        /* transition: left 50ms linear; */
    }

    .pitch-label {
        position: absolute;
        top: 14px;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 2px 4px;
        border-radius: 4px;
        font-size: 0.7rem;
        white-space: nowrap;
        pointer-events: none;
    }

    .white-key {
        flex: 1;
        background-color: white;
        border: 1px solid #d1d5db;
        border-bottom-left-radius: 0.375rem;
        border-bottom-right-radius: 0.375rem;
        position: relative;
        z-index: 0;
        transition: background-color 75ms;
    }

    .white-key.active {
        background-color: #60a5fa; /* blue-400 */
    }

    .note-label {
        position: absolute;
        bottom: 0.5rem;
        left: 0;
        right: 0;
        text-align: center;
        font-size: 0.75rem;
        color: #9ca3af;
        pointer-events: none;
    }

    .black-key {
        position: absolute;
        height: 12rem; /* 48 equivalent */
        background-color: black;
        z-index: 10;
        border-bottom-left-radius: 0.125rem;
        border-bottom-right-radius: 0.125rem;
        border-left: 1px solid #1f2937;
        border-bottom: 1px solid #1f2937;
        border-right: 1px solid #1f2937;
        transition: background-color 75ms;
    }

    .black-key.active {
        background-color: #1e40af; /* blue-800 */
    }

    .hint {
        position: absolute;
        top: 1rem;
        left: 1rem;
        color: white;
        opacity: 0.5;
        pointer-events: none;
    }
    .key-map-label {
        position: absolute;
        bottom: 2rem;
        left: 0;
        right: 0;
        text-align: center;
        font-size: 0.8rem;
        font-weight: bold;
        color: #3b82f6; /* blue-500 */
        pointer-events: none;
    }

    .key-map-label-black {
        position: absolute;
        bottom: 1rem;
        left: 0;
        right: 0;
        text-align: center;
        font-size: 0.7rem;
        font-weight: bold;
        color: #93c5fd; /* blue-300 */
        pointer-events: none;
    }
</style>
