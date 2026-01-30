<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import Keyboard from "$lib/components/Keyboard.svelte";
    import { audioEngine } from "$lib/audio/AudioEngine";
    import { settingsDB } from "$lib/utils/db";
    import { MicrophoneManager } from "$lib/audio/Microphone";
    import { PitchDetector } from "$lib/audio/PitchDetector";
    import { getPitchInfo } from "$lib/utils/music";
    import { MidiManager } from "$lib/audio/Midi";

    let showLabels = $state(true);
    let transpose = $state(0);

    let rangeStart = $state(41); // F2
    let rangeEnd = $state(91); // F6
    let selectedPreset = $state("49");

    // Microphone & Pitch
    let micEnabled = $state(false);
    let detectedPitch = $state(null as number | null);
    const micManager = new MicrophoneManager();
    const pitchDetector = new PitchDetector();
    let animationFrameId: number;
    const midiManager = new MidiManager();

    let pitchInfo = $derived(
        detectedPitch ? getPitchInfo(detectedPitch) : null,
    );

    function detectPitchLoop() {
        if (!micEnabled) return;

        const data = micManager.getAudioData();
        if (data) {
            const freq = pitchDetector.detectPitch(
                data.buffer,
                data.sampleRate,
            );
            if (freq) {
                // Convert to MIDI
                detectedPitch = PitchDetector.freqToMidi(freq);
            } else {
                detectedPitch = null;
            }
        }
        animationFrameId = requestAnimationFrame(detectPitchLoop);
    }

    async function toggleMic() {
        if (micEnabled) {
            micEnabled = false;
            micManager.stop();
            cancelAnimationFrame(animationFrameId);
            detectedPitch = null;
            // Resume audio context which might be suspended by mic stop on iOS
            await audioEngine.ensureRunning();
        } else {
            try {
                // Ensure audio engine is running first so we can share its context
                await audioEngine.ensureRunning();
                // Pass shared AudioContext to prevent volume issues on mobile
                const sharedContext = audioEngine.getContext();
                await micManager.start(sharedContext ?? undefined);
                micEnabled = true;
                detectPitchLoop();
            } catch (e) {
                alert("Could not access microphone: " + e);
            }
        }
    }

    onDestroy(() => {
        if (micEnabled) {
            micManager.stop();
            cancelAnimationFrame(animationFrameId);
        }
    });

    const presets = {
        "88": { start: 21, end: 108, name: "88 Keys (A0 - C8)" },
        "61": { start: 36, end: 96, name: "61 Keys (C2 - C7)" },
        "49": { start: 41, end: 89, name: "49 Keys (F2 - F6)" },
        "41": { start: 41, end: 82, name: "41 Keys (F2 - A5)" },
        "25": { start: 48, end: 72, name: "25 Keys (C3 - C5)" },
        "13": { start: 53, end: 65, name: "13 Keys (F3 - F4)" },
    };

    function selectPreset() {
        if (presets[selectedPreset as keyof typeof presets]) {
            const p = presets[selectedPreset as keyof typeof presets];
            rangeStart = p.start;
            rangeEnd = p.end;
        }
    }

    const defaultKeyMap = {
        a: -10,
        z: -9,
        s: -8,
        x: -7,
        d: -6,
        c: -5,
        v: -4,
        g: -3,
        b: -2,
        h: -1,
        n: 0,
        j: 1,
        m: 2,
        "1": 2,
        ",": 3,
        q: 3,
        "2": 4,
        w: 5,
        "3": 6,
        e: 7,
        r: 8,
        "5": 9,
        t: 10,
        "6": 11,
        y: 12,
        "7": 13,
        u: 14,
        i: 15,
        "9": 16,
        o: 17,
        "0": 18,
        p: 19,
    };

    let keyMap: Record<string, number> = $state({ ...defaultKeyMap });

    // MIDI State
    let midiEnabled = $state(false);
    let midiInputs = $state([] as WebMidi.MIDIInput[]);
    let selectedMidiId = $state("");

    let settingsLoaded = $state(false);

    onMount(async () => {
        try {
            // midiManager.init(); // Init MIDI - Removed for manual activation

            // Load KeyMap
            const savedMap = await settingsDB.loadKeyMap();
            if (savedMap) {
                keyMap = savedMap;
            }

            // Load Transpose
            const savedTranspose = await settingsDB.loadTranspose();
            if (savedTranspose !== null) {
                transpose = savedTranspose;
                audioEngine.setTranspose(transpose);
            }

            // Load Range
            const savedRange = await settingsDB.loadRange();
            if (savedRange) {
                rangeStart = savedRange.start;
                rangeEnd = savedRange.end;

                // Try to match preset
                let match = "custom";
                for (const [key, p] of Object.entries(presets)) {
                    if (p.start === rangeStart && p.end === rangeEnd) {
                        match = key;
                        break;
                    }
                }
                selectedPreset = match;
            }

            // Mobile check: Default showLabels to false on small screens
            if (Math.min(window.innerWidth, window.innerHeight) <= 768) {
                showLabels = false;
            }

            settingsLoaded = true;
        } catch (e) {
            console.error("Failed to load settings", e);
            settingsLoaded = true; // Enable saving even if load failed (to save future changes)
        }
    });

    $effect(() => {
        if (settingsLoaded) {
            settingsDB.saveTranspose(transpose);
        }
    });

    $effect(() => {
        if (settingsLoaded) {
            settingsDB.saveRange(rangeStart, rangeEnd);
        }
    });

    async function toggleMidi() {
        if (!midiEnabled) {
            const result = await midiManager.init((inputs) => {
                midiInputs = inputs;
                // If current selected device is gone, reset
                if (
                    selectedMidiId &&
                    !inputs.find((i) => i.id === selectedMidiId)
                ) {
                    selectedMidiId = "";
                    midiManager.setInput("");
                }
            });

            if (result.success) {
                midiEnabled = true;
                midiInputs = midiManager.getInputs();
                // Auto-select first if available and none selected
                if (midiInputs.length > 0 && !selectedMidiId) {
                    selectedMidiId = midiInputs[0].id;
                    midiManager.setInput(selectedMidiId);
                }
            } else {
                if (result.error && result.error.includes("Permission")) {
                    alert(
                        "MIDI Access Denied.\n\n" +
                            "To fix this:\n" +
                            "1. Click the Lock/Info icon in your browser address bar.\n" +
                            "2. Find 'MIDI devices' and set to 'Allow' (or 'Reset permission').\n" +
                            "3. Refresh the page.",
                    );
                } else {
                    alert(`Could not access MIDI devices: ${result.error}`);
                }
            }
        } else {
            // Just disable/hide?
            // Usually we just want to stop listening.
            // But we can't really 'revoke' access easily without reload.
            // We can just set flag to false and disconnect manager.
            midiEnabled = false;
            midiManager.disconnect();
            selectedMidiId = "";
        }
    }

    function handleMidiSelect() {
        midiManager.setInput(selectedMidiId);
    }

    function handleTransposeChange(val: number) {
        transpose = val;
        audioEngine.setTranspose(transpose);
    }

    async function saveKeyMap(map: Record<string, number>) {
        await settingsDB.saveKeyMap(JSON.parse(JSON.stringify(map)));
        keyMap = map;
        // alert("Key configuration saved!"); // Auto-save silent
    }

    async function exportKeyMap() {
        // format as txt: key:offset per line
        const lines = Object.entries(keyMap).map(([k, v]) => `${k}:${v}`);
        const text = lines.join("\n");

        try {
            // @ts-ignore - File System Access API might not be in all TS configs
            if (window.showSaveFilePicker) {
                // @ts-ignore
                const handle = await window.showSaveFilePicker({
                    suggestedName: "piano-keymap.txt",
                    types: [
                        {
                            description: "Text Files",
                            accept: { "text/plain": [".txt"] },
                        },
                    ],
                });
                const writable = await handle.createWritable();
                await writable.write(text);
                await writable.close();
            } else {
                const blob = new Blob([text], { type: "text/plain" });
                const url = URL.createObjectURL(blob);

                const a = document.createElement("a");
                a.href = url;
                a.download = "piano-keymap.txt";
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err) {
            // Ignore AbortError (user cancelled)
            if ((err as Error).name !== "AbortError") {
                console.error("Failed to save file:", err);
                alert("Failed to save file");
            }
        }
    }

    function handleFileSelect(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target?.result as string;
            if (!text) return;

            const newMap: Record<string, number> = {};
            // Parse line by line
            text.split(/\r?\n/).forEach((line) => {
                const parts = line.split(":");
                if (parts.length === 2) {
                    const key = parts[0].trim();
                    const val = parseInt(parts[1].trim());
                    if (key && !isNaN(val)) {
                        newMap[key] = val;
                    }
                }
            });

            if (Object.keys(newMap).length > 0) {
                saveKeyMap(newMap);
            } else {
                alert("Invalid file format.");
            }
        };
        reader.readAsText(file);
    }

    function resetKeyMap() {
        saveKeyMap({ ...defaultKeyMap });
    }
</script>

<div class="container">
    <div class="controls-bar">
        <!-- Transpose Controls -->
        <div class="control-group">
            <label for="transpose-select">Transpose</label>
            <div class="transpose-controls">
                <select
                    id="transpose-select"
                    value={transpose}
                    onchange={(e) =>
                        handleTransposeChange(parseInt(e.currentTarget.value))}
                >
                    {#each Array.from({ length: 25 }, (_, i) => i - 12) as t}
                        <option value={t}>{t > 0 ? "+" : ""}{t}</option>
                    {/each}
                </select>
                <button
                    onclick={() => handleTransposeChange(0)}
                    title="Reset Transpose">Reset</button
                >
            </div>
        </div>

        <!-- Range Controls -->
        <div class="control-group keyboard-range">
            <label for="keyboard-range">Keyboard Range</label>
            <select
                id="keyboard-range"
                bind:value={selectedPreset}
                onchange={selectPreset}
            >
                <option value="88">88 Keys (Full)</option>
                <option value="61">61 Keys</option>
                <option value="49">49 Keys</option>
                <option value="41">41 Keys</option>
                <option value="25">25 Keys</option>
                <option value="13">13 Keys</option>
            </select>
        </div>

        <!-- Display Options -->
        <div class="control-group">
            <label for="mic-toggle">Microphone</label>
            <button
                class="mic-btn"
                class:active={micEnabled}
                onclick={toggleMic}
                title={micEnabled ? "Stop Microphone" : "Start Microphone"}
                aria-label={micEnabled ? "Stop Microphone" : "Start Microphone"}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    {#if micEnabled}
                        <!-- Mic Off / Recording / Active Style -->
                        <path
                            d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
                        />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                    {:else}
                        <!-- Mic On / Inactive Style -->
                        <path
                            d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
                        />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                        <line
                            x1="1"
                            y1="1"
                            x2="23"
                            y2="23"
                            stroke="transparent"
                        />
                        <!-- Just use standard mic for inactive, maybe 'slash' for consistency if desired, but user said 'mic icon' -->
                    {/if}
                </svg>
            </button>
        </div>
        <!-- MIDI Controls -->
        <div class="control-group desktop-only">
            <label for="midi-toggle">MIDI Input</label>
            <div class="midi-controls">
                <button
                    id="midi-toggle"
                    class="mic-btn"
                    class:active={midiEnabled}
                    onclick={toggleMidi}
                    title={midiEnabled ? "Disable MIDI" : "Enable MIDI"}
                >
                    <!-- Improved DIN-5 Icon -->
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="30"
                        height="30"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <circle cx="12" cy="12" r="10"></circle>
                        <!-- Pins -->
                        <circle
                            cx="12"
                            cy="16"
                            r="1.5"
                            fill="currentColor"
                            stroke="none"
                        ></circle>
                        <circle
                            cx="7"
                            cy="14"
                            r="1.5"
                            fill="currentColor"
                            stroke="none"
                        ></circle>
                        <circle
                            cx="17"
                            cy="14"
                            r="1.5"
                            fill="currentColor"
                            stroke="none"
                        ></circle>
                        <circle
                            cx="5"
                            cy="10"
                            r="1.5"
                            fill="currentColor"
                            stroke="none"
                        ></circle>
                        <circle
                            cx="19"
                            cy="10"
                            r="1.5"
                            fill="currentColor"
                            stroke="none"
                        ></circle>
                    </svg>
                </button>
                {#if midiEnabled}
                    <select
                        bind:value={selectedMidiId}
                        onchange={handleMidiSelect}
                        class="midi-select"
                    >
                        <option value="">Select Device...</option>
                        {#each midiInputs as input (input.id)}
                            <option value={input.id}>{input.name}</option>
                        {/each}
                    </select>
                {/if}
            </div>
        </div>
        <!-- Key Map Controls -->
        <div class="control-group desktop-only">
            <label for="key-map">Key Map</label>
            <div class="buttons">
                <button onclick={exportKeyMap}>Export</button>
                <button onclick={resetKeyMap}>Reset Default</button>
                <label class="file-btn">
                    Import
                    <input
                        type="file"
                        accept=".txt"
                        onchange={handleFileSelect}
                        hidden
                    />
                </label>
            </div>
            <label>
                <input type="checkbox" bind:checked={showLabels} />
                Show Key Labels
            </label>
        </div>
    </div>

    <div class="fixed-pitch-display">
        <div class="pitch-note">{pitchInfo?.note ?? "--"}</div>
        <div class="pitch-cents">
            <div class="cents-value">
                {pitchInfo
                    ? (pitchInfo.cents > 0 ? "+" : "") + pitchInfo.cents
                    : "--"} cents
            </div>
            <div class="cents-meter">
                <div class="meter-center"></div>
                {#if pitchInfo}
                    <div
                        class="meter-pointer"
                        style="left: {50 + pitchInfo.cents}%"
                    ></div>
                {/if}
            </div>
            <div class="meter-labels">
                <span>-50</span>
                <span>0</span>
                <span>+50</span>
            </div>
        </div>
    </div>
    <div class="piano-wrapper">
        <Keyboard
            {rangeStart}
            {rangeEnd}
            {showLabels}
            {keyMap}
            {transpose}
            {detectedPitch}
        />
    </div>
    <div class="version-indicator">v0.1.3</div>
</div>

<style>
    .container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        width: 100%;
        height: 100%;
        padding: 1rem 1rem 0 1rem;
        gap: 1.5rem;
        box-sizing: border-box;
    }

    .controls-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 2rem;
        background-color: rgba(31, 41, 55, 0.5);
        padding: 1rem;
        border-radius: 0.5rem;
        border: 1px solid #374151;
        justify-content: center;
    }

    .control-group {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        color: #e5e7eb;
    }

    .control-group label {
        font-size: 0.875rem;
        font-weight: 500;
    }

    .keyboard-range {
        width: 10rem;
    }

    .buttons {
        display: flex;
        gap: 0.5rem;
    }

    button,
    .file-btn {
        padding: 0.25rem 0.75rem;
        background-color: #374151;
        color: white;
        border: 1px solid #4b5563;
        border-radius: 0.25rem;
        cursor: pointer;
        font-size: 0.875rem;
        transition: background-color 0.2s;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
    }

    .transpose-controls {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    select {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        border: 1px solid #4b5563;
        background-color: #374151;
        color: white;
    }

    button:hover,
    .file-btn:hover {
        background-color: #4b5563;
    }

    .mic-btn {
        padding: 0.5rem;
        border-radius: 50%; /* Circle */
        display: flex;
        justify-content: center;
        align-items: center;
        line-height: 0;
    }
    .mic-btn.active {
        background-color: #ef4444; /* Red for recording */
        border-color: #dc2626;
        animation: pulse 1.5s infinite;
    }
    .mic-btn.active:hover {
        background-color: #dc2626;
    }

    @keyframes pulse {
        0% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
        }
        70% {
            box-shadow: 0 0 0 6px rgba(239, 68, 68, 0);
        }
        100% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
        }
    }

    .piano-wrapper {
        width: 95%;
        background-color: rgba(21, 30, 45, 0.5);
        border: 1px solid #1f2937;
        border-radius: 0.75rem;
        padding: 1rem;
        backdrop-filter: blur(4px);
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        margin-top: 1rem;
        margin: 0;
        border-bottom: none;
        height: 16rem; /* Default height for portrait */
        display: flex; /* Ensure inner keyboard expands */
    }

    .fixed-pitch-display {
        display: flex;
        flex-direction: column-reverse;
        align-items: center;
        background-color: rgba(31, 41, 55, 0.8);
        padding: 1rem 2rem;
        border-radius: 1rem;
        border: 1px solid #4b5563;
        min-width: 200px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        /* margin-bottom: 2rem; */
    }
    .pitch-note {
        font-size: 3rem;
        font-weight: bold;
        color: #60a5fa; /* blue-400 */
        line-height: 1;
    }
    .pitch-cents {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        margin-top: 0.5rem;
    }
    .cents-value {
        color: #9ca3af;
        font-size: 0.875rem;
        margin-bottom: 0.25rem;
    }
    .cents-meter {
        width: 100%;
        height: 8px; /* Slightly thicker */
        background-color: #374151;
        border-radius: 4px;
        position: relative;
        overflow: hidden;
    }
    .meter-center {
        position: absolute;
        left: 50%;
        top: 0;
        bottom: 0;
        width: 2px;
        background-color: #9ca3af;
        transform: translateX(-50%);
    }
    .meter-pointer {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 6px;
        background-color: #ef4444; /* red-500 */
        border-radius: 3px;
        transform: translateX(-50%);
        transition: left 0.1s linear;
    }
    .meter-labels {
        display: flex;
        justify-content: space-between;
        width: 100%;
        color: #6b7280;
        font-size: 0.75rem;
        margin-top: 0.25rem;
    }

    .midi-controls {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .midi-select {
        max-width: 12rem;
        /* Match other select styles if needed, but they are generic 'select' */
    }

    /* Hide desktop controls on mobile (narrow width OR clear landscape phone height) */
    @media (max-width: 768px), (max-height: 500px) {
        .desktop-only {
            display: none !important;
        }
    }

    /* Landscape Mode Tweaks for Phones/Tablets */
    /* Also apply to Mobile Portrait because we force-rotate it to landscape */
    @media (orientation: landscape) and (max-height: 500px),
        (max-width: 768px) and (orientation: portrait) {
        .container {
            flex-direction: row; /* Horizontal layout */
            flex-wrap: wrap; /* Allow wrapping */
            align-items: flex-start; /* Align to top */
            padding: 0.5rem;
            gap: 0.5rem;
            height: 100%; /* Full viewport height */
            overflow: hidden; /* Prevent body scroll if possible */
        }

        .controls-bar {
            flex: 1; /* Take available width */
            padding: 0.5rem;
            max-width: 60%;
            gap: 1rem;
            overflow-y: auto; /* Allow scroll if controls overflow */
            max-height: 40%; /* Limit height */
        }

        .fixed-pitch-display {
            min-width: 120px;
            padding: 0.5rem;
            /* Move next to controls if possible, effectively flex-item */
            margin-bottom: 0;
            order: 2; /* Ensure order */
            flex: 0 0 auto;
        }

        .controls-bar {
            order: 1;
        }

        .piano-wrapper {
            height: 60%;
            order: 3;
        }

        .pitch-note {
            font-size: 1.5rem;
        }
    }

    .version-indicator {
        position: fixed;
        top: 16px;
        left: 16px;
        font-size: 1rem;
        color: rgba(156, 163, 175, 0.5);
        pointer-events: none;
        z-index: 1000;
    }
</style>
