export class PitchDetector {
    private fftSize: number = 0;

    // FFT buffers
    private re!: Float32Array;
    private im!: Float32Array;

    // window & autocorr
    private window!: Float32Array;

    // 作業用
    private lastBufferSize: number = 0;

    /**
     * 設定可能パラメータ（用途に応じて調整）
     * - minFreq: 低いほど大きいラグを探索（コスト増）
     * - maxFreq: 高いほど小さいラグを探索（誤検出減に有効）
     * - rmsThreshold: 無音判定
     * - peakThreshold: 正規化相関のピークがこの値未満なら null（雑音除外）
     */
    constructor(
        private readonly minFreq: number = 50,     // Hz（低音まで取りたいなら下げる）
        private readonly maxFreq: number = 1000,   // Hz（声なら 800〜1200 くらいが実用的）
        private readonly rmsThreshold: number = 0.01,
        private readonly peakThreshold: number = 0.25
    ) { }

    detectPitch(input: Float32Array, sampleRate: number): number | null {
        const n = input.length;
        if (n < 32) return null;

        // --- RMS & DC除去（平均値） ---
        let mean = 0;
        for (let i = 0; i < n; i++) mean += input[i];
        mean /= n;

        let rms = 0;
        for (let i = 0; i < n; i++) {
            const v = input[i] - mean;
            rms += v * v;
        }
        rms = Math.sqrt(rms / n);
        if (rms < this.rmsThreshold) return null;

        // --- FFTサイズ確保（循環相関を避けるため 2N 以上にゼロパディング） ---
        this.ensureSize(n);

        // --- 窓掛け + ゼロパディング ---
        // re に信号、im は 0
        const re = this.re;
        const im = this.im;
        const win = this.window;

        // 先にゼロクリア（fftSize が大きいので fill の方が速い）
        re.fill(0);
        im.fill(0);

        // windowed, DC removed
        for (let i = 0; i < n; i++) {
            re[i] = (input[i] - mean) * win[i];
        }

        // --- FFT -> パワースペクトル -> IFFT で自己相関 ---
        this.fft(re, im, false);

        // power spectrum: |X|^2 を re に、im=0
        for (let k = 0; k < this.fftSize; k++) {
            const a = re[k];
            const b = im[k];
            re[k] = a * a + b * b;
            im[k] = 0;
        }

        this.fft(re, im, true); // IFFT（内部でスケーリング）

        // IFFT後の re[0..] が自己相関（スケーリング済み）
        // 正規化：acf[lag] / acf[0]
        const acf0 = re[0];
        if (!(acf0 > 0)) return null;

        const minLag = Math.max(1, Math.floor(sampleRate / this.maxFreq));
        const maxLag = Math.min(n - 1, Math.floor(sampleRate / this.minFreq));
        if (maxLag <= minLag) return null;

        // --- 正規化自己相関でピーク探索（最初の谷の後の最大ピーク） ---
        // 「単に最大」を取ると 0-lag 近傍や倍音に吸われやすいので、
        // 1) 下降区間を抜ける（最初の谷まで）
        // 2) そこから最大ピーク
        let d = minLag;
        // re は acf、正規化比較のため re[d]/acf0 を使う
        while (d + 1 <= maxLag && re[d] > re[d + 1]) d++;

        let bestLag = -1;
        let bestVal = -Infinity;

        for (let lag = d; lag <= maxLag; lag++) {
            const v = re[lag] / acf0;
            if (v > bestVal) {
                bestVal = v;
                bestLag = lag;
            }
        }

        if (bestLag <= 0 || bestVal < this.peakThreshold) return null;

        // --- 放物線補間（サブサンプル精度） ---
        // 周辺が取れない端は補間しない
        let lagRefined = bestLag;
        if (bestLag > 1 && bestLag < maxLag) {
            const y1 = re[bestLag - 1] / acf0;
            const y2 = re[bestLag] / acf0;
            const y3 = re[bestLag + 1] / acf0;

            const a = (y1 + y3 - 2 * y2) * 0.5;
            const b = (y3 - y1) * 0.5;

            // 頂点 x = -b/(2a) を lag に足す（a=0 のときは補間なし）
            if (a !== 0) {
                const shift = -b / (2 * a);
                // 過度な補間は抑制
                if (shift > -1 && shift < 1) lagRefined = bestLag + shift;
            }
        }

        const freq = sampleRate / lagRefined;
        if (!Number.isFinite(freq) || freq <= 0) return null;
        return freq;
    }

    static freqToMidi(frequency: number): number {
        return 12 * (Math.log(frequency / 440) / Math.log(2)) + 69;
    }

    // -----------------------
    // internal helpers
    // -----------------------

    private ensureSize(n: number) {
        if (n === this.lastBufferSize && this.fftSize !== 0) return;

        // 2N 以上の nextPow2
        const need = this.nextPow2(n * 2);
        this.fftSize = need;

        this.re = new Float32Array(this.fftSize);
        this.im = new Float32Array(this.fftSize);

        // Hann window（n に合わせて作る：精度と安定性が上がる）
        this.window = new Float32Array(n);
        if (n === 1) {
            this.window[0] = 1;
        } else {
            for (let i = 0; i < n; i++) {
                // Hann: 0.5 - 0.5*cos(2πi/(n-1))
                this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
            }
        }

        this.lastBufferSize = n;
    }

    private nextPow2(x: number): number {
        let p = 1;
        while (p < x) p <<= 1;
        return p;
    }

    /**
     * In-place complex FFT (re, im)
     * inverse=false: FFT
     * inverse=true: IFFT (結果を 1/N でスケール)
     *
     * radix-2 iterative Cooley–Tukey
     */
    private fft(re: Float32Array, im: Float32Array, inverse: boolean) {
        const n = this.fftSize;

        // bit-reversal permutation
        for (let i = 1, j = 0; i < n; i++) {
            let bit = n >> 1;
            for (; j & bit; bit >>= 1) j ^= bit;
            j ^= bit;

            if (i < j) {
                // swap re
                const tr = re[i];
                re[i] = re[j];
                re[j] = tr;
                // swap im
                const ti = im[i];
                im[i] = im[j];
                im[j] = ti;
            }
        }

        // butterflies
        for (let len = 2; len <= n; len <<= 1) {
            const half = len >> 1;
            const ang = (2 * Math.PI) / len * (inverse ? 1 : -1);
            const wlenRe = Math.cos(ang);
            const wlenIm = Math.sin(ang);

            for (let i = 0; i < n; i += len) {
                let wRe = 1;
                let wIm = 0;

                for (let j = 0; j < half; j++) {
                    const uRe = re[i + j];
                    const uIm = im[i + j];

                    const vRe = re[i + j + half] * wRe - im[i + j + half] * wIm;
                    const vIm = re[i + j + half] * wIm + im[i + j + half] * wRe;

                    re[i + j] = uRe + vRe;
                    im[i + j] = uIm + vIm;

                    re[i + j + half] = uRe - vRe;
                    im[i + j + half] = uIm - vIm;

                    // w *= wlen
                    const nextWRe = wRe * wlenRe - wIm * wlenIm;
                    const nextWIm = wRe * wlenIm + wIm * wlenRe;
                    wRe = nextWRe;
                    wIm = nextWIm;
                }
            }
        }

        if (inverse) {
            const invN = 1 / n;
            for (let i = 0; i < n; i++) {
                re[i] *= invN;
                im[i] *= invN;
            }
        }
    }
}
