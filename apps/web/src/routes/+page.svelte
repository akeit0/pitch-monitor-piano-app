<script lang="ts">
    import { onMount } from "svelte";
    import Keyboard from "$lib/components/Keyboard.svelte";
    import { audioEngine } from "$lib/audio/AudioEngine";
    import { settingsDB } from "$lib/utils/db";

    let showLabels = $state(false);
    let transpose = $state(0);

    const defaultKeyMap = {
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

    function handleTransposeChange(delta: number) {
        transpose += delta;
        audioEngine.setTranspose(transpose);
    }

    async function saveKeyMap() {
        await settingsDB.saveKeyMap(JSON.parse(JSON.stringify(keyMap)));
        alert("Key configuration saved!");
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
                keyMap = newMap;
                alert("Key map imported!");
            } else {
                alert("Invalid file format. Expected 'key:offset' per line.");
            }
        };
        reader.readAsText(file);
    }

    function resetKeyMap() {
        keyMap = { ...defaultKeyMap };
    }
</script>

<div class="container">
    <div class="header">
        <h1>Svelte Piano</h1>
        <p>WebAudioFont + SvelteKit + Tauri</p>
    </div>

    <div class="controls-bar">
        <!-- Transpose Controls -->
        <div class="control-group">
            <label>Transpose: {transpose > 0 ? "+" : ""}{transpose}</label>
            <div class="buttons">
                <button onclick={() => handleTransposeChange(-1)}>-</button>
                <button onclick={() => handleTransposeChange(1)}>+</button>
            </div>
        </div>

        <!-- Display Options -->
        <div class="control-group">
            <label>
                <input type="checkbox" bind:checked={showLabels} />
                Show Key Labels
            </label>
        </div>

        <!-- Key Map Controls -->
        <div class="control-group">
            <label>Key Map (TXT)</label>
            <div class="buttons">
                <button onclick={saveKeyMap}>Save to DB</button>
                <button onclick={exportKeyMap}>Export TXT</button>
                <button onclick={resetKeyMap}>Reset</button>
                <label class="file-btn">
                    Import TXT
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
        <Keyboard startOctave={3} octaves={2} {showLabels} {keyMap} />
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

    .header {
        text-align: center;
    }

    h1 {
        font-size: 2.25rem;
        font-weight: bold;
        margin-bottom: 0.5rem;
        background: linear-gradient(to right, #60a5fa, #9333ea);
        -webkit-background-clip: text;
        color: transparent;
        display: inline-block;
    }

    p {
        color: #9ca3af;
        margin: 0;
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
