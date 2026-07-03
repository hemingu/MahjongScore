# 麻雀スコア記録

自動雀卓の点数表示を撮影した写真から Gemini（無料枠）が点数を読み取り、スコアを自動記録するWebアプリ。写真を使わない手動入力にも対応。

- **閲覧**（集計グラフ・集計表・記録一覧・役満一覧）: 誰でも認証なしで見られる
- **記録**（写真解析・役満記録・CSVインポート・メンバー管理）: パスワードログインが必要

## 構成

```
GitHub Pages (フロントエンド: React + Vite + Tailwind)
        │ HTTPS
Cloudflare Worker (API: Hono)
        ├─ Gemini API (gemini-2.5-flash, 無料枠) … 画像から点数を読み取り
        └─ Cloudflare D1 (SQLite) … 試合データ・メンバー
```

Gemini APIキーやパスワードは Cloudflare Worker の secret にのみ保存され、ブラウザには一切渡りません。
Gemini が使えないとき（無料枠の上限など）は、記録画面でそのまま点数を手動入力できます。
`DISCORD_WEBHOOK_URL` を設定しておくと、Gemini の無料枠超過（429エラー）時に指定したDiscordチャンネルへ通知が届きます（Discordのチャンネル設定「連携サービス → ウェブフック」で発行）。

| ディレクトリ | 内容 |
|---|---|
| `web/` | フロントエンド (React 19 + Vite + Tailwind CSS v4) |
| `worker/` | API (Hono on Cloudflare Workers + D1) |
| `shared/` | 型定義・スコア計算ロジック（テスト付き） |

## スコアルール

- ポイント = (終了時点数 − 30000)÷1000 ＋ 順位点÷1000、1位はさらに +20（オカ: 25000点持ち30000点返し＝トップ賞20000点）
- 順位点は試合ごとに選択:
  - **5-10**: 1位+10000 / 2位+5000 / 3位−5000 / 4位−10000
  - **10-30**: 1位+30000 / 2位+10000 / 3位−10000 / 4位−30000
- 同点時は起家に近い席（東→南→西→北）が上位。同点があった場合のみ記録時に起家を尋ねます

## 初回セットアップ

### 1. Cloudflare（バックエンド）

```sh
cd worker
pnpm install

# ログイン（ブラウザが開く）
pnpm exec wrangler login

# D1データベース作成 → 出力された database_id を worker/wrangler.jsonc に書き込む
pnpm exec wrangler d1 create mahjong-score

# スキーマ適用
pnpm exec wrangler d1 migrations apply mahjong-score --remote

# シークレット設定（対話式で値を入力）
pnpm exec wrangler secret put GEMINI_API_KEY       # Gemini APIキー (aistudio.google.com/apikey で無料発行)
pnpm exec wrangler secret put AUTH_PASSWORD        # 記録者ログイン用パスワード
pnpm exec wrangler secret put SESSION_SECRET       # ランダムな長い文字列 (openssl rand -hex 32 など)
pnpm exec wrangler secret put DISCORD_WEBHOOK_URL  # （任意）Gemini無料枠超過時にDiscordへ通知する場合のみ設定

# デプロイ → 表示された https://mahjong-score-api.<subdomain>.workers.dev を控える
pnpm exec wrangler deploy
```

### 2. GitHub（フロントエンド）

リポジトリの Settings で:

1. **Pages** → Source を「GitHub Actions」に変更
2. **Secrets and variables → Actions → Variables** に追加:
   - `VITE_API_BASE` = 手順1で控えたWorkerのURL（例: `https://mahjong-score-api.xxx.workers.dev`）
3. （Workerも自動デプロイしたい場合）**Secrets** に追加:
   - `CLOUDFLARE_API_TOKEN`（Cloudflareダッシュボード → My Profile → API Tokens → 「Edit Cloudflare Workers」テンプレート + D1 の編集権限）
   - `CLOUDFLARE_ACCOUNT_ID`（ダッシュボードのWorkers画面右側に表示）

main に push すると GitHub Actions が Pages（と Worker）を自動デプロイします。

### 3. 使い始める

1. サイトを開き「設定」→ ログイン → メンバーを登録
2. 「記録する」から写真をアップロードして試合を記録
3. 過去の記録は「CSV取込」からまとめて投入（テンプレートCSVをダウンロード可能）

## CSVインポート形式

```csv
日付,ルール,名前1,点数1,名前2,点数2,名前3,点数3,名前4,点数4,起家名(同点時のみ),備考
2026-07-01,5-10,太郎,45000,次郎,30000,三郎,15000,四郎,10000,,役満（国士無双）
```

- 4人の点数合計は100000点である必要があります
- 同点者がいる行のみ「起家名」が必須
- 未登録メンバーはインポート時に自動登録されます
- CSV内で全メンバーの試合数（出現回数）が一致していないとインポートできません

## 役満記録

- 「記録する」の「試合を記録」タブで、登録する試合に役満を同時入力できる（複数可）
- 「役満のみ記録」タブで過去の試合（通算試合数で選択）にも後から追加できる
- 入力項目: 和了者 / 放銃者（省略時はツモ）/ 親 or 子 / 役1〜4（役1のみ必須、プリセット＋自由入力）
- 「役満一覧」は認証なしで閲覧可能

## ローカル開発

```sh
pnpm install

# バックエンド (http://localhost:8787)
cd worker
cp .dev.vars.example .dev.vars   # 値を編集（GEMINI_API_KEY は実キー）
pnpm exec wrangler d1 migrations apply mahjong-score --local
pnpm dev

# フロントエンド (http://localhost:5173) — 別ターミナルで
cd web
pnpm dev
```

テスト: `pnpm test`（shared のスコア計算ロジック）

## ライセンス

[MIT License](LICENSE)
