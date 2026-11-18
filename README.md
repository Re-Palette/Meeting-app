# MeetFlow

MeetFlow は、自分ひとりで使う無料の日程調整アプリです（TimeRex の代替を想定）。予約ページを公開すると、相手は空き時間から選んで予約できます。Google カレンダーの空き時間を読み取り、確定した予定には Google Meet のリンクを自動で付けます。Vercel と Turso の無料枠で動かせます。

## 機能

- **ホーム**: 今月の予定数、日程調整完了数、返答待ち、今週の空き時間をダッシュボードで表示
- **日程調整ページ**: 所要時間、場所、利用可能な曜日と時間帯、承認の要否を設定し、`/s/<slug>` で公開
- **予定一覧**: Google カレンダー、ICS フィード、予約をまとめて表示
- **チーム（連絡先）**: 予約してくれた人の連絡先と予約回数の一覧
- **分析**: 週次の予約推移、日程調整ページ別の件数、曜日・時間帯別の傾向
- **設定**: タイムゾーン、Google カレンダー連携、ICS フィードの登録
- **公開予約ページ**: ゲストは認証なしで空き時間から予約。承認制のページからの申し込みは **対応が必要なリクエスト** に表示され、承認または辞退できる

## 料金

無料枠の範囲で使えば **¥0** です。

| 項目 | 費用 | 条件 |
|---|---|---|
| Vercel（Hobby プラン） | ¥0 | 個人・非商用の利用が対象の無料プラン |
| Turso（無料プラン） | ¥0 | データベース（libSQL）の無料枠内 |
| Google Calendar API | ¥0 | 自分の Google Cloud プロジェクトの無料クォータ内 |
| ICS フィード（iCloud、Outlook など） | ¥0 | 非公開の iCal URL を読むだけ |
| 独自ドメイン | 別途 | 任意。Vercel の既定ドメインのみなら不要 |

上限や料金は変わることがあるため、最新の値は各サービスの料金ページで確認してください。1人分の予約であれば、無料枠を超えることは通常ありません。

## 技術スタック

- ホスティング: Vercel（画面は Vite の静的ビルド、API は Node.js の Vercel Function）
- API: Hono（`/api` 配下）
- データベース: Turso（libSQL、SQLite 互換）
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
cp .env.example .env
```

`.env` を開き、`ADMIN_PASSWORD`（ログインパスワード）と `SESSION_SECRET`（長いランダム文字列）を設定します。`SESSION_SECRET` は次のコマンドで生成できます。

```bash
openssl rand -hex 32
```

`TURSO_DATABASE_URL` は空のままにすると、ローカルの `.data/local.db` を使います。

3. データベースにマイグレーションを適用します。

```bash
npm run db:migrate
```

4. 開発サーバーを起動します。

```bash
npm run dev
```

5. ブラウザで http://localhost:5173 を開き、`.env` に設定した `ADMIN_PASSWORD` でログインします。

Google カレンダー連携をローカルで試す場合は、[docs/SETUP.md](docs/SETUP.md) の手順 6 を参照してください。

## npm スクリプト

| コマンド | 内容 |
|---|---|
| `npm run dev` | API（ポート 8787）と画面（Vite, ポート 5173）を同時に起動。Vite が `/api` を API に転送する |
| `npm run dev:web` | 画面（Vite）のみ起動 |
| `npm run dev:api` | API（ポート 8787）のみ起動 |
| `npm run build` | `TURSO_DATABASE_URL` が設定されていればマイグレーションを適用し、型チェックを行ったうえで `dist/` に画面をビルド |
| `npm run typecheck` | TypeScript の型チェックのみ実行 |
| `npm test` | Vitest でテストを実行 |
| `npm run db:migrate` | マイグレーションを適用。`TURSO_DATABASE_URL` 未設定時はローカルの `.data/local.db` |

## 本番デプロイ

手順の詳細は [docs/SETUP.md](docs/SETUP.md) を参照してください。概要は次のとおりです。

1. Vercel にプロジェクトを作成する
2. Vercel Marketplace から Turso データベースを接続する
3. 環境変数を登録して再デプロイする
4. Google Cloud で OAuth クライアントを作成し、Google カレンダーと連携する
5. 必要に応じて ICS フィードと独自ドメインを設定する

## プロジェクト構成

```
.
├── api/             Vercel Function のエントリ（api/index.ts）
├── worker/          Hono の API 本体（worker/index.ts）
├── src/             React の画面（管理画面と公開予約ページ）
├── shared/          API 仕様（API.md）と画面・API 共通の型（types.ts）
├── migrations/      データベースのマイグレーション（SQL）
├── scripts/         migrate.mjs（マイグレーション）、dev-server.ts（ローカル API）
├── docs/
│   └── SETUP.md     本番デプロイの手順
├── index.html
├── vite.config.ts   Vite の設定（/api を 8787 に転送）
├── vercel.json      ビルドと /api・画面のルーティング
├── package.json
└── .env.example     環境変数の雛形
```

API の仕様は [shared/API.md](shared/API.md) にまとめています。
