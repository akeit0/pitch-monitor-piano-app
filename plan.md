# Svelte(SvelteKit) + Tauri ピアノアプリ実装メモ（WebAudioFont採用）

目的：
- ブラウザ / デスクトップ（Tauri）両対応
- 入力：タッチ（ポインタ）＋キーボード
- 音源：WebAudioFont（SoundFont）
- MIDI・録音などは後回し
- 低レイテンシは「ネイティブ拡張不要」レベルでOK（まずはWebAudioで快適に）

---

## 1. 全体方針（アーキテクチャ）

### 1) 役割分離
- UI層（Svelte）
  - 鍵盤描画、押下状態、キーボード入力、設定UI（音量・オクターブなど）
- Audio層（TypeScript）
  - AudioContext管理（生成/Resume）
  - WebAudioFont初期化（SoundFont読み込み）
  - 発音/消音（noteOn/noteOff相当）
  - 最低限のスケジューリング（currentTimeベース）

> ポイント：UIから直接WebAudioFontを叩かず、Audio層を1枚挟む。  
> 将来MIDI/録音/エフェクト追加が楽になる。

---

## 2. 推奨リポジトリ構成（最小）

repo/
apps/
web/ # SvelteKit (SPA)
desktop/ # Tauri wrapper（同じwebを使うならここは最小）
packages/
audio-engine/ # WebAudioFontラッパ
ui/ # 鍵盤コンポーネント等（任意、単一でもOK）


最小構成で始めるなら monorepo不要でもOK：
- `apps/web` だけ作って、後から `apps/desktop`（Tauri）を追加

---

## 3. SvelteKit（SPA）前提の注意

Tauri統合では **SvelteKitをSPA運用**に寄せるのが安全。
- SSRやprerender絡みの落とし穴を避けるため、クライアント専用で完結させる
- Tauri API呼び出しは必ず「クライアントでのみ」実行（`browser` 判定など）

---

## 4. WebAudioFont 採用時の設計ポイント

### 4.1 AudioContextのライフサイクル
- AudioContextはシングルトン（アプリ全体で1つ）
- 初回ユーザー操作（クリック/タップ/キー押下）で `audioContext.resume()` を呼ぶ
  - 自動再生制限対策（最重要）
- 以後はContextを使い回す（作り直さない）

### 4.2 SoundFont（楽器）読み込み
- 起動直後にプリロード（UIにLoading表示）
- 選ぶSoundFontはまず1種固定（例：Acoustic Grand Piano）
- 変更機能は後回しでもOK

### 4.3 発音/消音（最低限）
- noteOn: (midiNote, velocity, when=currentTime)
- noteOff: (midiNote, when=currentTime)
- 押下中のノートはMapで追跡（キー重複や同時押しに対応）

例：状態
- `activeNotes: Map<number, { startedAt: number; voiceId?: any }>`
  - WebAudioFontが返す“再生オブジェクト”を保持できるなら保持
  - できない場合でも、同一ノートの多重発音を避けるロジックを入れる

### 4.4 レイテンシ改善の簡易策（ネイティブ不要で効く）
- 初回発音の遅延を避ける：
  - SoundFontロード完了後、無音で短く鳴らす（“ウォームアップ”）
- WebAudioの時間基準を使う：
  - `when = audioContext.currentTime + smallOffset`（例 0.005〜0.02秒）
  - UIイベントのジッターを軽減

---

## 5. 入力仕様

### 5.1 タッチ/マウス（Pointer Events 推奨）
- `pointerdown`：鍵盤判定 → noteOn
- `pointerup` / `pointercancel` / `pointerleave`：noteOff
- マルチタッチ対応：
  - `pointerId` と「押下した鍵盤」を紐づけるMapを持つ
  - `activePointers: Map<number, midiNote>`

必須：
- `setPointerCapture(pointerId)` を使って、指が少し外れても追従する

### 5.2 キーボード入力（最低限）
- 例：ASDF… を白鍵に、WETY… を黒鍵に割当（よくある配置）
- `keydown`：未押下なら noteOn
- `keyup`：noteOff
- 押しっぱなしリピート対策：
  - `event.repeat` を無視する or `pressedKeys` Setでガード

### 5.3 共通ポリシー
- 入力 → 直接DOM依存で音を鳴らさず、`audioEngine.noteOn/noteOff` を必ず経由

---

## 6. UI（鍵盤）実装の最小要件

### 6.1 鍵盤レンジ
- 初期：2〜3オクターブ程度（C3〜B5など）
- オクターブシフト（±1）を後で追加できる設計に

### 6.2 鍵盤判定
推奨2案：
1) **鍵ごとに要素を分ける**（シンプル・確実）
   - 白鍵/黒鍵を個別divで描画
   - pointerdownは要素からmidiNoteを取得
2) 1枚Canvasで座標判定（上級・後回し）

まずは1)でよい。

### 6.3 押下中の視覚フィードバック
- `pressedNotes: Set<number>`
- Svelteのclass bindingで押下スタイルを切替

---

## 7. packages/audio-engine の仕様（AI agent向けタスク定義）

### 7.1 公開API（例）
- `init(): Promise<void>`
  - AudioContext生成（ただしresumeは別）
  - WebAudioFontPlayer生成
  - SoundFontロード
- `ensureRunning(): Promise<void>`
  - `audioContext.state !== 'running'` なら `resume()`
- `setMasterGain(value: number)`（0..1）
- `noteOn(midiNote: number, velocity: number, when?: number): void`
- `noteOff(midiNote: number, when?: number): void`
- `panic(): void`
  - 全ノート停止（activeNotes全解放）

### 7.2 内部状態
- `audioContext: AudioContext | null`
- `masterGain: GainNode`
- `player: WebAudioFontPlayer`
- `instrument: any`（読み込んだSoundFont）
- `activeNotes: Map<number, any>`（停止に必要なハンドルがあるなら保持）

### 7.3 例外・フォールバック
- AudioContext未初期化でnoteOnされた場合は no-op ではなく
  - 可能なら `ensureRunning()` を促す（UI側で「Tap to enable audio」を出すのが基本）

---

## 8. 実装ステップ（AI agentの作業順）

1) SvelteKit（apps/web）プロジェクト作成（TypeScript）
2) SPA運用に寄せる（SSR依存を避ける）
3) `packages/audio-engine` を作成し、WebAudioFontを組み込み
   - SoundFontのimport方法を決める（ローカル配置 or CDN）
4) `Tap to enable audio` 導線
   - 最初のユーザー操作で `audioEngine.ensureRunning()` を呼ぶ
5) `Keyboard` コンポーネント実装（白鍵/黒鍵div方式）
6) pointer events + multi-touch 対応
7) キーボード入力（keydown/keyup）対応
8) マスター音量スライダー
9) panicボタン（全音停止）
10) Tauri追加（apps/desktop）
   - webのビルド成果物を読み込む設定
   - デスクトップでも同様に音が出ることを確認

---

## 9. Tauri（後段）の最小要件

- webをそのまま同梱して表示するだけにする
- ファイル保存などの権限はまだ不要 → Tauri側の権限/プラグインは最小に

注意：
- `http(s)` 経由のSoundFont取得をCDNに頼る場合、TauriのCSP/ネットワーク制限に注意
  - 安定運用するなら SoundFontをローカル同梱（`static/`）が無難

---

## 10. 重要な注意点（実装でハマりやすい）

- 自動再生制限：必ず「ユーザー操作 → resume()」が必要
- リピートキー：keydownのrepeatで多重発音しない
- pointercancel：スマホで頻発するのでnoteOff漏れ対策必須
- 同一ノート多重：押下状態の管理（Set/Map）をUIとAudioで一貫させる
- 初回遅延：ロード完了 + ウォームアップで体感改善

---

## 11. Doneの定義（受け入れ条件）

- ブラウザで：
  - 初回タップでオーディオ有効化できる
  - タッチで単音/和音が鳴る（マルチタッチ）
  - キーボード入力で鳴る
  - 離したら止まる（noteOff漏れなし）
  - panicで全停止できる
- デスクトップ（Tauri）で：
  - 同等に動作（少なくとも基本発音と入力が成立）
  - SoundFontロードが安定（同梱または許可された取得手段）

---

## 12. 実装メモ（サンプルコードを入れるなら）

※ AI agentが実装時に参照できるよう、最低限の疑似コード例。

### Audio Engine 例（擬似）
- initでSoundFontロード
- ensureRunningでresume
- noteOn/noteOffはcurrentTime基準

### Input 例（擬似）
- pointerId -> midiNote のMap
- key -> midiNote のMap
- pressedNotes Set（UI表示用）

（具体コードは実装時に確定させる）
