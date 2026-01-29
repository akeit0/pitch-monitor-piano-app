<script lang="ts">
    import Keyboard from "$lib/components/Keyboard.svelte";
    import { audioEngine } from "$lib/audio/AudioEngine";
</script>

<div class="container">
    <div class="header">
        <h1>Svelte Piano</h1>
        <p>WebAudioFont + SvelteKit + Tauri</p>
    </div>

    <div class="piano-wrapper">
        <Keyboard startOctave={3} octaves={2} />
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
        gap: 2rem;
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
