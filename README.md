# MeetFlow

MeetFlow は、自分ひとりで使う無料の日程調整アプリです（TimeRex の代替を想定）。予約ページを公開すると、相手は空き時間から選んで予約できます。Google カレンダーの空き時間を読み取り、確定した予定には Google Meet のリンクを自動で付けます。Cloudflare Workers と D1 で動くため、サーバーの維持費はかかりません。

## 機能

- **ホーム**: 今月の予定数、日程調整完了数、返答待ち、今週の空き時間をダッシュボードで表示
- **日程調整ページ**: 所要時間、場所、利用可能な曜日と時間帯、承認の要否を設定し、`/s/<slug>` で公開
- **予定一覧**: Google カレンダー、ICS フィード、予約をまとめて表示
- **チーム（連絡先）**: 予約してくれた人の連絡先と予約回数の一覧
- **分析**: 週次の予約推移、日程調整ページ別の件数、曜日・時間帯別の傾向
- **設定**: タイムゾーン、Google カレンダー連携、ICS フィードの登録
- **公開予約ページ**: ゲストは認証なしで空き時間から予約。承認制のページからの申し込みは **対応が必要なリクエスト** に表示され、承認または辞退できる

## 料金

すべて無料枠の範囲で使えば **¥0** です。

| 項目 | 費用 | 適用される無料枠・制限 |
|---|---|---|
| Cloudflare Workers | ¥0 | 10万リクエスト/日（無料プラン） |
| Cloudflare 静的アセット（画面の配信） | ¥0 | 静的ファイルへのリクエストは Workers のリクエスト数に含まれない |
| Cloudflare D1（データベース） | ¥0 | 読み取り 500万行/日、書き込み 10万行/日、保存 5GB（無料プラン） |
| Google Calendar API | ¥0 | 自分の Google Cloud プロジェクトの無料クォータ内 |
| ICS フィード（iCloud、Outlook など） | ¥0 | 非公開の iCal URL を読むだけ |
| workers.dev サブドメイン | ¥0 | 独自ドメインを使う場合のみ、ドメイン代が別途かかる |

上限の最新値は Cloudflare の公式ドキュメントで確認してください。1人分の予約であれば、無料枠を超えることはまずありません。

## 技術スタック

- 実行基盤: Cloudflare Workers（画面は Workers の静的アセットとして配信）
- API: Hono（`/api` 配下）
- データベース: Cloudflare D1（SQLite）
- 画面: React 18、React Router、framer-motion、lucide-react
- ビルド: Vite、TypeScript
- テスト: Vitest

## クイックスタート（ローカル開発）

前提: Node.js（LTS 推奨）と npm。

1. 依存パッケージをインストールします。

```bash
npm install
```

2. 環境変数ファイルを作成します。

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` を開き、`ADMIN_PASSWORD`（ログインパスワード）と `SESSION_SECRET`（長いランダム文字列）を設定します。`SESSION_SECRET` は次のコマンドで生成できます。

```bash
openssl rand -hex 32
```

3. ローカル D1 にマイグレーションを適用します。

```bash
npm run db:migrate:local
```

4. 開発サーバーを起動します。

```bash
npm run dev
```

5. ブラウザで http://localhost:5173 を開き、`.dev.vars` に設定した `ADMIN_PASSWORD` でログインします。

Google カレンダー連携をローカルで試す場合は、[docs/SETUP.md](docs/SETUP.md) の手順 6 を参照してください。

## npm スクリプト

| コマンド | 内容 |
|---|---|
| `npm run dev` | API（wrangler, ポート 8787）と画面（Vite, ポート 5173）を同時に起動。Vite が `/api` を API に転送する |
| `npm run dev:web` | 画面（Vite）のみ起動 |
| `npm run dev:api` | API（wrangler dev, ポート 8787）のみ起動 |
| `npm run build` | 型チェックを行い、画面をビルドして `dist/` に出力 |
| `npm run typecheck` | TypeScript の型チェックのみ実行 |
| `npm test` | Vitest でテストを実行 |
| `npm run db:migrate:local` | ローカル D1 にマイグレーションを適用 |
| `npm run db:migrate:remote` | 本番 D1 にマイグレーションを適用 |
| `npm run deploy` | ビルドしたうえで Cloudflare Workers にデプロイ |

## 本番デプロイ

手順の詳細は [docs/SETUP.md](docs/SETUP.md) を参照してください。概要は次のとおりです。

1. Cloudflare にログインし、D1 データベースを作成する
2. マイグレーションを適用し、シークレットを登録する
3. `APP_URL` を設定して `npm run deploy` する
4. Google Cloud で OAuth クライアントを作成し、Google カレンダーと連携する
5. 必要に応じて ICS フィードと独自ドメインを設定する

## プロジェクト構成

```
.
├── src/             React の画面（管理画面と公開予約ページ）
├── worker/          Hono の API（Worker のエントリは worker/index.ts）
├── shared/          API 仕様（API.md）と画面・API 共通の型（types.ts）
├── migrations/      D1 のマイグレーション（SQL）
├── docs/
│   └── SETUP.md     本番デプロイの手順
├── index.html
├── vite.config.ts   Vite の設定（/api を 8787 に転送）
├── wrangler.toml    Cloudflare Workers と D1 の設定
├── package.json
└── .dev.vars.example  ローカル用の環境変数の雛形
```

API の仕様は [shared/API.md](shared/API.md) にまとめています。
