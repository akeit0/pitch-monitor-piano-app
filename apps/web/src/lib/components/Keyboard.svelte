<script lang="ts">
    import { onMount } from "svelte";
    import { audioEngine } from "$lib/audio/AudioEngine";

    // Props
    let { startOctave = 3, octaves = 2 } = $props();

    // State
    let activeNotes = $state(new Set<number>());
    let isAudioEnabled = $state(false);

    // Derived state
    let startMidi = $derived(startOctave * 12 + 12 + 12);

    // We want to generate keys based on octaves.
    function generateKeys(startOpt: number, count: number) {
        const startMidiVal = startOpt * 12 + 24;
        const base = startOpt * 12 + 12;

        const whites = [];
        const blacks = [];

        let whiteIndex = 0;

        // Total keys = octaves * 12 + 1 (end with C)
        const totalKeys = count * 12 + 1;

        for (let i = 0; i < totalKeys; i++) {
            const midi = base + i;
            const noteInOctave = i % 12;
            // 0 2 4 5 7 9 11 are white (C D E F G A B)
            const isBlack = [1, 3, 6, 8, 10].includes(noteInOctave);

            if (!isBlack) {
                whites.push({ midi, index: whiteIndex++ });
            } else {
                const octavePosition = Math.floor(i / 12);
                const noteType = noteInOctave;
                let offset = 0;

                if (noteType === 1)
                    offset = 0.55; // C#
                else if (noteType === 3)
                    offset = 1.65; // D#
                else if (noteType === 6)
                    offset = 3.55; // F#
                else if (noteType === 8)
                    offset = 4.6; // G#
                else if (noteType === 10) offset = 5.65; // A#

                const pos = octavePosition * 7 + offset;

                blacks.push({ midi, pos });
            }
        }
        return { whites, blacks, numWhites: whiteIndex };
    }

    let keys = $derived(generateKeys(startOctave, octaves));

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

    const keyMap: Record<string, number> = {
        a: 0,
        w: 1,
        s: 2,
        e: 3,
        d: 4,
        f: 5,
        t: 6,
        g: 7,
        y: 8,
        h: 9,
        u: 10,
        j: 11,
        k: 12,
    };

    function handleKeyDown(e: KeyboardEvent) {
        if (e.repeat) return;
        const offset = keyMap[e.key.toLowerCase()];
        if (offset !== undefined) {
            const base = generateKeys(startOctave, octaves).whites[0].midi;
            const targetMidi = base + offset;
            addRef(targetMidi);
        }
    }

    function handleKeyUp(e: KeyboardEvent) {
        const offset = keyMap[e.key.toLowerCase()];
        if (offset !== undefined) {
            const base = generateKeys(startOctave, octaves).whites[0].midi;
            const targetMidi = base + offset;
            removeRef(targetMidi);
        }
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
                {key.midi % 12 === 0
                    ? "C" + (Math.floor(key.midi / 12) - 1)
                    : ""}
            </div>
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
        ></div>
    {/each}
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
</style>
