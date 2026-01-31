# リリース自動化ガイド

このプロジェクトでは、バージョンアップ時に以下が自動的に実行されます：

1. ✅ リリースノートの自動生成
2. ✅ GitHub Releaseの作成
3. ✅ GitHub Pagesへのデプロイ
4. ✅ Tauriアプリのバージョン同期

## 使い方

### パッチバージョンアップ（0.0.3 → 0.0.4）

```bash
cd apps
npm run version:patch
```

### マイナーバージョンアップ（0.0.3 → 0.1.0）

```bash
cd apps
npm run version:minor
```

### メジャーバージョンアップ（0.0.3 → 1.0.0）

```bash
cd apps
npm run version:major
```

## 自動実行される処理

1. **package.jsonのバージョン更新**
2. **src-tauri/tauri.conf.jsonのバージョン同期**
3. **変更のコミット**
4. **Gitタグの作成**（例: `v0.0.4`）
5. **GitHubへのプッシュ**
6. **GitHub Actionsが自動起動**:
   - 前回のタグからのコミット履歴を取得
   - リリースノートを自動生成
   - GitHub Releaseを作成
   - GitHub Pagesをビルド＆デプロイ

## リリースノートについて

リリースノートは、前回のタグから今回のタグまでのコミットメッセージから自動生成されます。

**コミットメッセージのベストプラクティス:**
- わかりやすい説明を書く
- 例: `Add pitch detection feature`
- 例: `Fix audio context initialization bug`
- 例: `Improve UI responsiveness`

## 手動デプロイ

自動デプロイとは別に、手動でGitHub Pagesをデプロイすることもできます：

1. GitHubリポジトリの「Actions」タブを開く
2. 「Deploy to GitHub Pages」を選択
3. 「Run workflow」をクリック

## トラブルシューティング

### タグのプッシュに失敗する場合

```bash
git push --tags -f
```

### バージョンを間違えた場合

```bash
# タグを削除
git tag -d v0.0.4
git push origin :refs/tags/v0.0.4

# package.jsonを手動で修正してから再実行
```
