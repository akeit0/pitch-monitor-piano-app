<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import Keyboard from "$lib/components/Keyboard.svelte";
    import { audioEngine } from "$lib/audio/AudioEngine";
    import { settingsDB } from "$lib/utils/db";
    import { MicrophoneManager } from "$lib/audio/Microphone";
    import { PitchDetector } from "$lib/audio/PitchDetector";

    let showLabels = $state(true);
    let transpose = $state(0);

    let rangeStart = $state(48); // C3
    let rangeEnd = $state(72); // C5
    let selectedPreset = $state("25");

    // Microphone & Pitch
    let micEnabled = $state(false);
    let detectedPitch = $state(null as number | null);
    const micManager = new MicrophoneManager();
    const pitchDetector = new PitchDetector();
    let animationFrameId: number;

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
        } else {
            try {
                await micManager.start();
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
        "49": { start: 41, end: 91, name: "49 Keys (F2 - F6)" },
        "25": { start: 48, end: 72, name: "25 Keys (C3 - C5)" },
    };

    function selectPreset() {
        if (presets[selectedPreset as keyof typeof presets]) {
            const p = presets[selectedPreset as keyof typeof presets];
            rangeStart = p.start;
            rangeEnd = p.end;
        }
    }

    const defaultKeyMap = {
        z: -9,
        x: -7,
        c: -5,
        v: -4,
        b: -2,
        n: 0,
        m: 2,
        a: 3,
        w: 4,
        s: 5,
        e: 6,
        d: 7,
        f: 8,
        t: 9,
        g: 10,
        y: 11,
        h: 12,
        u: 13,
        j: 14,
        k: 15,
        o: 16,
        l: 17,
    };

    let keyMap = $state({ ...defaultKeyMap });

    onMount(async () => {
        try {
            const savedMap = await settingsDB.loadKeyMap();
            if (savedMap) {
                keyMap = savedMap;
            }
        } catch (e) {
            console.error("Failed to load key map", e);
        }
    });

    function handleTransposeChange(val: number) {
        transpose = val;
        audioEngine.setTranspose(transpose);
    }

    async function saveKeyMap(map: Record<string, number>) {
        await settingsDB.saveKeyMap(JSON.parse(JSON.stringify(map)));
        keyMap = map;
        // alert("Key configuration saved!"); // Auto-save silent
    }

    function exportKeyMap() {
        // format as txt: key:offset per line
        const lines = Object.entries(keyMap).map(([k, v]) => `${k}:${v}`);
        const text = lines.join("\n");
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "piano-keymap.txt";
        a.click();
        URL.revokeObjectURL(url);
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
                alert("Key map imported and saved!");
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
            <label>Transpose</label>
            <div class="transpose-controls">
                <select
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
        <div class="control-group">
            <label>Keyboard Size</label>
            <select bind:value={selectedPreset} onchange={selectPreset}>
                <option value="88">88 Keys (Full)</option>
                <option value="61">61 Keys</option>
                <option value="49">49 Keys</option>
                <option value="25">25 Keys</option>
                <option value="custom">Custom</option>
            </select>
            {#if selectedPreset === "custom"}
                <div class="custom-range">
                    <label
                        >Start: <input
                            type="number"
                            bind:value={rangeStart}
                        /></label
                    >
                    <label
                        >End: <input
                            type="number"
                            bind:value={rangeEnd}
                        /></label
                    >
                </div>
            {/if}
        </div>

        <!-- Display Options -->
        <div class="control-group">
            <label>
                <input type="checkbox" bind:checked={showLabels} />
                Show Key Labels
            </label>
            <button
                class="mic-btn"
                class:active={micEnabled}
                onclick={toggleMic}
            >
                {micEnabled ? "Stop Mic" : "Start Mic"}
            </button>
        </div>

        <!-- Key Map Controls -->
        <div class="control-group">
            <label>Key Map</label>
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

    <button class="panic-btn" onclick={() => audioEngine.panic()}>
        Panic (Stop All Sounds)
    </button>
</div>

<style>
    .container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        padding: 1rem;
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

    .custom-range {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.5rem;
        justify-content: center;
    }

    .custom-range input {
        width: 4rem;
        padding: 0.25rem;
        border-radius: 0.25rem;
        border: 1px solid #4b5563;
        background-color: #374151;
        color: white;
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

    .piano-wrapper {
        width: 100%;
        max-width: 72rem;
        background-color: rgba(17, 24, 39, 0.5);
        border: 1px solid #1f2937;
        border-radius: 0.75rem;
        padding: 1.5rem;
        backdrop-filter: blur(4px);
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }

    .panic-btn {
        padding: 0.5rem 1.5rem;
        background-color: rgba(239, 68, 68, 0.2);
        color: #fecaca;
        border: 1px solid rgba(239, 68, 68, 0.5);
        border-radius: 0.5rem;
        transition: background-color 0.2s;
    }

    .panic-btn:hover {
        background-color: rgba(239, 68, 68, 0.4);
    }
</style>
