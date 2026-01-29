export class PitchDetector {
    private correlationBuffer: Float32Array;

    constructor() {
        // Initialize max size for correlation buffer (assuming frames usually <= 2048)
        this.correlationBuffer = new Float32Array(2048);
    }

    detectPitch(buffer: Float32Array, sampleRate: number): number | null {
        // Implements the ACF2+ algorithm
        let SIZE = buffer.length;
        let rms = 0;

        for (let i = 0; i < SIZE; i++) {
            const val = buffer[i];
            rms += val * val;
        }
        rms = Math.sqrt(rms / SIZE);
        if (rms < 0.01) return null; // not enough signal

        let r1 = 0, r2 = SIZE - 1, thres = 0.2;
        for (let i = 0; i < SIZE / 2; i++) {
            if (Math.abs(buffer[i]) < thres) { r1 = i; break; }
        }
        for (let i = 1; i < SIZE / 2; i++) {
            if (Math.abs(buffer[SIZE - i]) < thres) { r2 = SIZE - i; break; }
        }

        // Use subarray to share memory instead of slice (allocate new)
        const buf = buffer.subarray(r1, r2);
        SIZE = buf.length;

        // Resize correlation buffer if needed (unlikely if fixed fftSize)
        if (SIZE > this.correlationBuffer.length) {
            this.correlationBuffer = new Float32Array(SIZE);
        }

        // Zero out used part
        this.correlationBuffer.fill(0, 0, SIZE);
        // Actually fill is O(N).
        // The loop below calculates c[i] = sum(...). It accumulates?
        // Original code: c[i] = c[i] + ... -> yes, it accumulates.
        // So we MUST zero it.

        const c = this.correlationBuffer;

        for (let i = 0; i < SIZE; i++) {
            for (let j = 0; j < SIZE - i; j++) {
                c[i] = c[i] + buf[j] * buf[j + i];
            }
        }

        let d = 0;
        while (c[d] > c[d + 1]) d++;

        let maxval = -1, maxpos = -1;
        for (let i = d; i < SIZE; i++) {
            if (c[i] > maxval) {
                maxval = c[i];
                maxpos = i;
            }
        }
        let T0 = maxpos;

        const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
        const a = (x1 + x3 - 2 * x2) / 2;
        const b = (x3 - x1) / 2;
        if (a) T0 = T0 - b / (2 * a);

        return sampleRate / T0;
    }

    static freqToMidi(frequency: number): number {
        // MIDI = 12 * log2(freq / 440) + 69
        return 12 * (Math.log(frequency / 440) / Math.log(2)) + 69;
    }
}
