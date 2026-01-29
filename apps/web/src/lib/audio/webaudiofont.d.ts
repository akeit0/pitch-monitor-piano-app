declare module 'webaudiofont' {
    export default class WebAudioFontPlayer {
        constructor();
        loader: {
            decodeAfterLoading(audioContext: AudioContext, name: string): void;
            adjustPreset(audioContext: AudioContext, preset: any): void;
        };
        queueWaveTable(
            audioContext: AudioContext,
            target: AudioNode,
            preset: any,
            when: number,
            pitch: number,
            duration: number,
            volume: number,
            slides?: any[]
        ): any;
        cancelQueue(audioContext: AudioContext): void;
    }
}
