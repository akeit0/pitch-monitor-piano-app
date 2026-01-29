# Piano App

A modern, feature-rich virtual piano application built with **Svelte 5** and **Tauri**. Designed for musicians and hobbyists, this app offers a responsive playing experience, MIDI support, and built-in pitch detection tools.

![Piano App Icon](src/lib/assets/piano.svg)

## Features

### 🎹 Virtual Piano
- **Responsive Keyboard**: Smooth, interactive keys that react to mouse clicks and touch.
- **Computer Keyboard Support**: Play the piano using your PC keyboard.
- **Audio Engine**: High-quality sound synthesis using `webaudiofont`.

### 🎛️ Advanced Controls
- **Adjustable Range**: Choose from standard presets (88, 61, 49, 42, 26 keys) or define a custom key range.
- **Transpose**: Shift pitch up or down by semitones (-12 to +12).
- **Auto-Save**: innovative system that automatically saves your **transpose settings**, **keyboard range**, and **key mappings** so you pick up right where you left off.

### 🔌 MIDI Integration
- **Plug & Play**: Automatically detects connected MIDI devices.
- **Input Selection**: Choose specifically which MIDI device to use from the interface.

### 🎤 Pitch Detection (Tuner)
- **Real-time Analysis**: visualizes the pitch detected from your microphone.
- **Cents Meter**: Precision tuning display showing notes and cent deviation (flat/sharp).

### ⌨️ Key Mapping & Customization
- **Custom Key Map**: Remap any computer key to any piano note.
- **Import/Export**: Save your custom key layouts to text files and share them or load them later.
- **Default Presets**: Quickly reset to the optimized default layout.

## Tech Stack

- **Frontend**: Svelte 5, TypeScript, Vite
- **Desktop Framework**: Tauri 2 (Rust)
- **Audio**: Web Audio API
- **Storage**: IndexedDB (via persistent browser storage)

## Getting Started

### Prerequisites
- Node.js installed
- Rust/Cargo installed (for Tauri desktop app)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd piano-app/apps
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running the App

**For Web (Browser):**
```bash
npm run dev
```

**For Desktop (Tauri):**
```bash
npm run tauri dev
```

## License

MIT
