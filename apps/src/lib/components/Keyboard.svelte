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

    // Full 88-key range A0-C8
    const MIN_MIDI = 21;
    const MAX_MIDI = 108;

    let startWhiteIndex = $derived(getAbsWhiteIndex(MIN_MIDI));

    // Calculate keyboard width scaling based on selected range
    // We want the range [rangeStart, rangeEnd] to fill the viewport (100% width)
    // The total width of 88 keys will be larger than 100%
    let keyboardWidthPercent = $derived.by(() => {
        // Find number of white keys in the selected range
        // rangeStart and rangeEnd are inclusive MIDI numbers
        // We need to count how many white keys are in this range

        const startWhite = getAbsWhiteIndex(rangeStart);
        // For rangeEnd, we want to include the key itself.
        // getAbsWhiteIndex returns index of the key if white.
        // If rangeEnd is black, its "index" in white keys logic needs care if we just subtract.
        // But getAbsWhiteIndex handles white key "slots".
        // Let's rely on consistent white key count logic.
        // keys.whites contains all white keys. We can filter.

        let visibleIds = 0;
        // Simple logic: difference in absolute white index + 1 if both are white?
        // Let's count properly:
        // We can use the global counting logic.

        // Count white keys in [rangeStart, rangeEnd]
        // MIN_MIDI is 21 (A0).
        // Let's use the helper.
        const endWhite = getAbsWhiteIndex(rangeEnd);

        // Number of white keys to show
        let visibleCount = endWhite - startWhite;

        // Correct for fencepost: if rangeStart is white, it has index X.
        // if rangeEnd is white, it has index Y. Count is Y - X + 1?
        // let's check: C (0), D (1). Count 2. 1-0 = 1. So +1.
        // But getAbsWhiteIndex returns the "slot".
        // D is 1. C is 0.
        // If start=C, end=D. visible=2 keys.
        // 1 - 0 = 1. So we need +1 for the count.
        // HOWEVER, we need to consider if start/end are black keys.
        // If start is C#, it shares slot 0 or 1?
        // Implement logic:
        // white key width logic is consistent.
        // We can just count how many white keys are >= start and <= end.
        let count = 0;
        for (let i = rangeStart; i <= rangeEnd; i++) {
            const note = i % 12;
            const isWhite = ![1, 3, 6, 8, 10].includes(note);
            if (isWhite) count++;
        }

        // If range is all black keys? unlikley but possible. At least 1 white usually.
        // If count is 0 (e.g. single black key), width is infinity? clamp it.
        if (count < 1) count = 1;

        // Total white keys in 88 layout (21 to 108) = 52
        const totalCount = 52;

        // Scale factor: Total / Visible
        return (totalCount / count) * 100;
    });

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

    let scrollContainer: HTMLDivElement;
    let keyboardEl: HTMLDivElement;
    let scrollbarTrack: HTMLDivElement;

    // Scrollbar Logic
    let isDraggingScroll = false;
    let startX = 0;
    let startScrollLeft = 0;

    // Use object state for better reactivity in callbacks
    let scrollbarState = $state({ thumbWidth: 100, thumbLeft: 0 });

    function updateScrollState() {
        if (!scrollContainer) return;
        const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;

        // Prevent division by zero
        if (scrollWidth === 0) return;

        let newThumbWidth = (clientWidth / scrollWidth) * 100;
        let newThumbLeft = (scrollLeft / scrollWidth) * 100;

        // Clamp
        if (newThumbWidth > 100) newThumbWidth = 100;
        if (newThumbLeft < 0) newThumbLeft = 0;
        if (newThumbLeft + newThumbWidth > 100)
            newThumbLeft = 100 - newThumbWidth;

        // Update state object
        scrollbarState.thumbWidth = newThumbWidth;
        scrollbarState.thumbLeft = newThumbLeft;
    }

    function handleScrollbarDown(e: PointerEvent) {
        // Click on track handling (jump to position)
        if (!scrollContainer) return;
        const rect = scrollbarTrack.getBoundingClientRect();
        const clickX = e.clientX - rect.left; // pixel within track
        const ratio = clickX / rect.width;

        // We want to center the thumb on click if possible, or just jump?
        // Standard behavior: jump to that spot (centered if possible)
        const totalScroll = scrollContainer.scrollWidth;
        const visibleW = scrollContainer.clientWidth;

        // target scrollLeft = (ratio * total) - (visible / 2)
        const target = ratio * totalScroll - visibleW / 2;

        scrollContainer.scrollTo({ left: target, behavior: "smooth" });
        // Manually update state ensuring immediate feedback
        requestAnimationFrame(() => updateScrollState());
    }

    function handleThumbDown(e: PointerEvent) {
        e.preventDefault();
        e.stopPropagation(); // Stop bubbling to track

        isDraggingScroll = true;
        startX = e.clientX;
        startScrollLeft = scrollContainer.scrollLeft;

        const thumbElement = e.target as HTMLElement;
        try {
            thumbElement.setPointerCapture(e.pointerId);
        } catch (err) {
            /* ignore */
        }

        const pointerUp = (ev: PointerEvent) => {
            if (ev.pointerId !== e.pointerId) return;
            isDraggingScroll = false;
            window.removeEventListener("pointerup", pointerUp);
            window.removeEventListener("pointermove", pointerMove);
            try {
                thumbElement.releasePointerCapture(ev.pointerId);
            } catch (err) {
                /* ignore */
            }
        };

        const pointerMove = (ev: PointerEvent) => {
            if (!isDraggingScroll || !scrollContainer || !scrollbarTrack)
                return;
            if (ev.pointerId !== e.pointerId) return;
            ev.preventDefault();

            const dx = ev.clientX - startX;
            const trackRect = scrollbarTrack.getBoundingClientRect();
            const trackWidth = trackRect.width;

            if (trackWidth === 0) return;

            const totalScrollW = scrollContainer.scrollWidth;
            const clientW = scrollContainer.clientWidth;
            const scrollRatio = totalScrollW / trackWidth;

            // Clamp scroll position
            const maxScroll = Math.max(0, totalScrollW - clientW);
            let scrollTarget = startScrollLeft + dx * scrollRatio;
            scrollTarget = Math.max(0, Math.min(scrollTarget, maxScroll));

            scrollContainer.scrollLeft = scrollTarget;
            updateScrollState();
        };

        window.addEventListener("pointerup", pointerUp);
        window.addEventListener("pointermove", pointerMove);
    }

    // Watch for range changes to update scroll position
    $effect(() => {
        if (scrollContainer && keys.numWhites > 0) {
            // Recalculate basic metrics
            const startWhite = getAbsWhiteIndex(rangeStart);
            const baseWhite = getAbsWhiteIndex(MIN_MIDI);
            const diffWhite = startWhite - baseWhite;

            const totalScrollWidth = scrollContainer.scrollWidth;

            // Ratio: (Distance to RangeStart in white keys) / (Total White Keys)
            const ratio = diffWhite / keys.numWhites; // 0..1

            const targetLeft = ratio * totalScrollWidth;

            scrollContainer.scrollLeft = targetLeft;
            updateScrollState();
        }
    });

    // Also update on resize
    $effect(() => {
        const resizeObserver = new ResizeObserver(() => {
            updateScrollState();
        });
        if (scrollContainer) resizeObserver.observe(scrollContainer);
        return () => resizeObserver.disconnect();
    });

    // Initialize scroll state on mount
    $effect(() => {
        if (scrollContainer) {
            // Use requestAnimationFrame to ensure DOM is fully rendered
            requestAnimationFrame(() => {
                updateScrollState();
            });
        }
    });

    // State
    let activeNotes = $state(new Set<number>());
    let isAudioEnabled = $state(false);
    let isWaitingForAudio = $state(false);

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

    let keys = $derived(generateKeys(MIN_MIDI, MAX_MIDI));

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

    async function initAudio(e: Event) {
        if (isWaitingForAudio) return;
        e.preventDefault();
        e.stopPropagation();

        isWaitingForAudio = true;
        try {
            await audioEngine.ensureRunning();
            isAudioEnabled = true;
        } finally {
            isWaitingForAudio = false;
        }
    }

    async function handlePointerDown(e: PointerEvent) {
        if (!isAudioEnabled) return; // Prevent interaction until audio is ready
        e.preventDefault();

        const keyboardEl = e.currentTarget as HTMLElement;
        const target = e.target as HTMLElement;
        const midi = getMidiFromElement(target);

        if (midi !== null) {
            try {
                keyboardEl.setPointerCapture(e.pointerId);
            } catch (err) {
                console.debug("Pointer capture failed", err);
            }

            pointerNotes.set(e.pointerId, midi);
            addRef(midi);
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
        } else {
            const el = document.elementFromPoint(
                e.clientX,
                e.clientY,
            ) as HTMLElement;
            const midi = getMidiFromElement(el);
            if (midi) {
                removeRef(midi);
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
        if (isWaitingForAudio) return;
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
        if (isWaitingForAudio) return;
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

<div class="keyboard-main-wrapper">
    <div
        class="scrollbar-track"
        bind:this={scrollbarTrack}
        onpointerdown={handleScrollbarDown}
        role="scrollbar"
        aria-controls="keyboard-container"
        aria-valuenow={scrollbarState.thumbLeft}
        aria-valuemin="0"
        aria-valuemax="100"
        tabindex="0"
    >
        <div
            class="scrollbar-thumb"
            style="width: {scrollbarState.thumbWidth}%; left: {scrollbarState.thumbLeft}%;"
            onpointerdown={handleThumbDown}
            role="none"
        ></div>
    </div>

    <div
        id="keyboard-container"
        class="keyboard-scroll-container"
        bind:this={scrollContainer}
        onscroll={updateScrollState}
    >
        <div
            class="keyboard"
            bind:this={keyboardEl}
            onpointerdown={handlePointerDown}
            onpointermove={handlePointerMove}
            oncontextmenu={(e) => e.preventDefault()}
            role="application"
            aria-label="Virtual Piano Keyboard"
            style="width: {keyboardWidthPercent}%;"
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
                        <div class="key-map-label keyboard-labels">
                            {midiToKeyLabels.get(key.midi)?.join(" ")}
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
                        <div class="key-map-label-black keyboard-labels">
                            {midiToKeyLabels.get(key.midi)?.join(", ")}
                        </div>
                    {/if}
                </div>
            {/each}

            <!-- Pitch Marker -->
            {#if detectedPitch !== null && detectedPitch - transpose >= MIN_MIDI - 1 && detectedPitch - transpose <= MAX_MIDI + 1}
                <div
                    class="pitch-marker"
                    style="left: {getMarkerPosition(
                        detectedPitch - transpose,
                    )}%"
                >
                    <div class="pitch-label">
                        {formatPitch(detectedPitch)}
                    </div>
                </div>
            {/if}
        </div>
    </div>

    {#if !isAudioEnabled}
        <button class="audio-overlay" onpointerdown={initAudio}>
            <div class="hint">
                {#if isWaitingForAudio}
                    Loading...
                {:else}
                    Tap to Start Audio
                {/if}
            </div>
        </button>
    {/if}
</div>

<style>
    .keyboard-main-wrapper {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        overflow: hidden;
        position: relative; /* For audio overlay positioning */
    }

    .scrollbar-track {
        width: 100%;
        height: 30px;
        flex-shrink: 0; /* Prevent shrinking */
        background-color: #374151;
        border-radius: 4px;
        margin-bottom: 4px;
        position: relative;
        cursor: pointer;
        touch-action: none;
    }

    .scrollbar-thumb {
        position: absolute;
        top: 2px;
        bottom: 2px;
        background-color: #9ca3af;
        border-radius: 3px;
        cursor: grab;
        touch-action: none;
    }
    .scrollbar-thumb:active {
        background-color: #d1d5db;
        cursor: grabbing;
    }

    .keyboard-scroll-container {
        width: 100%;
        flex: 1; /* Take remaining space */
        min-height: 0; /* Allow shrinking in flex context */
        overflow-x: hidden; /* Disable native scrolling - use custom scrollbar only */
        overflow-y: hidden;
        scrollbar-width: none; /* Firefox */
        -ms-overflow-style: none; /* IE/Edge */
        background-color: #111827;
        border-radius: 0.5rem;
        position: relative;
        touch-action: none; /* Disable native scrolling */
    }
    .keyboard-scroll-container::-webkit-scrollbar {
        display: none; /* Chrome/Safari */
    }

    .keyboard {
        /* transform: rotateX(180deg); Removed because we removed scroll container rotation */
        position: relative;
        display: flex;
        /* Width is controlled by style (zoom level) */
        min-width: 100%;
        height: 100%; /* Flexible height */
        max-height: 100%;
        min-height: 100px;
        bottom: 0px;
        /* background-color: #111827; */
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
        border-bottom-left-radius: 0.25rem;
        border-bottom-right-radius: 0.25rem;
        position: relative;
        z-index: 0;
        transition: background-color 75ms;
        min-width: 1rem;
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
        height: 60%; /* Percentage based */
        background-color: black;
        z-index: 10;
        border-bottom-left-radius: 0.25rem;
        border-bottom-right-radius: 0.25rem;
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
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        background: rgba(0, 0, 0, 0.7);
        padding: 0.5rem 1rem;
        border-radius: 4px;
        pointer-events: none;
        z-index: 50;
        font-size: 1.2rem;
    }

    .audio-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        cursor: pointer;
        outline: none;
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
