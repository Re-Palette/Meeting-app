# 本番デプロイ手順

MeetFlow を Cloudflare Workers にデプロイし、Google カレンダーと連携するまでの手順です。すべて無料枠で完結します。

前提:

- Cloudflare アカウント（無料）
- Google アカウント
- Node.js（LTS 推奨）と npm
- リポジトリのルートで作業すること

## 1. Cloudflare にログインする

```bash
npx wrangler login
```

ブラウザが開くので、Cloudflare アカウントで認可します。

## 2. D1 データベースを作成する

```bash
npx wrangler d1 create meetflow
```

出力に表示される `database_id` を、`wrangler.toml` の `[[d1_databases]]` にある `database_id` へ貼り付けます。初期値の `00000000-0000-0000-0000-000000000000` は置き換えてください。

```toml
[[d1_databases]]
binding = "DB"
database_name = "meetflow"
database_id = "（ここに貼り付け）"
migrations_dir = "migrations"
```

## 3. 本番データベースにマイグレーションを適用する

```bash
npm run db:migrate:remote
```

## 4. シークレットを登録する

シークレットは `wrangler.toml` や Git には書かず、Cloudflare に直接登録します。コマンドを実行すると値の入力を求められます。

ログインパスワードを登録します。

```bash
npx wrangler secret put ADMIN_PASSWORD
```

セッション署名用の文字列を生成します。出力された値を次のコマンドで入力してください。

```bash
openssl rand -hex 32
```

```bash
npx wrangler secret put SESSION_SECRET
```

`GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` は、手順 6 で OAuth クライアントを作成した後に登録します。

登録済みのシークレット名は次のコマンドで確認できます。

```bash
npx wrangler secret list
```

## 5. APP_URL を設定してデプロイする

Workers のアドレスは `https://meetflow.<subdomain>.workers.dev` の形式です。`<subdomain>` は Cloudflare ダッシュボードの「Workers & Pages」で確認できます。`wrangler.toml` の `[vars]` を次のように書き換えます。

```toml
[vars]
APP_URL = "https://meetflow.<subdomain>.workers.dev"
```

末尾に `/` を付けないでください。この値は Google の OAuth リダイレクト URI の元になります。

デプロイします。ビルドのあと Workers に配置されます。

```bash
npm run deploy
```

完了すると URL が表示されます。その URL を開き、`ADMIN_PASSWORD` でログインできれば成功です。

## 6. Google カレンダーと連携する

Google カレンダーとの連携には、自分の Google Cloud プロジェクトで OAuth クライアントを作成します。費用はかかりません。

### 6-1. プロジェクトを作成する

[Google Cloud Console](https://console.cloud.google.com/) で新しいプロジェクトを作成し、選択します。

### 6-2. Google Calendar API を有効にする

「API とサービス」→「ライブラリ」で **Google Calendar API** を検索し、「有効にする」を押します。Google Meet のリンクも、この API で予定を作成するときに付与されます。

### 6-3. OAuth 同意画面を設定する

「Google Auth Platform」（または「API とサービス」→「OAuth 同意画面」）を開き、次の内容を設定します。

- ユーザーの種類: **外部**
- アプリ名、ユーザーサポートメール、デベロッパーの連絡先メール: 任意（自分のメールアドレスで構いません）
- スコープ: 次の 4 つを追加します
  - `https://www.googleapis.com/auth/calendar.events`
  - `https://www.googleapis.com/auth/calendar.readonly`
  - `openid`
  - `https://www.googleapis.com/auth/userinfo.email`
- テストユーザー: 自分の Google アカウントを追加します

### 6-4. 公開ステータスを「本番環境」にする

**重要**: 公開ステータスが「テスト」のままだと、Google の更新トークンは **7 日で失効** します。その場合、7 日ごとに再連携が必要になります。個人で長く使うなら、ステータスを **「本番環境に公開」** に切り替えてください。

- 「この Google アプリは確認されていません」という警告が表示されます。自分で使う場合は「詳細」→「安全でないページに移動」で続行できます。
- 個人利用（ユーザー 100 人未満）であれば、Google の審査は不要です。

### 6-5. OAuth クライアント ID を作成する

「認証情報」→「認証情報を作成」→「OAuth クライアント ID」を選びます。

- アプリケーションの種類: **ウェブ アプリケーション**
- 承認済みのリダイレクト URI: 次の 2 つを追加します

```
https://meetflow.<subdomain>.workers.dev/api/google/callback
http://localhost:5173/api/google/callback
```

1 行目は `APP_URL` に `/api/google/callback` を付けた値です。手順 5 で設定した `APP_URL` と完全に一致させてください。2 行目はローカル開発用です。

作成すると Client ID と Client Secret が表示されます。次のコマンドで登録します。

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
```

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

登録後は再デプロイ不要です。反映されない場合は `npm run deploy` を実行してください。

ローカルで連携を試す場合は、`.dev.vars` に次の値を追記します。`.dev.vars` の値は `wrangler.toml` の `[vars]` より優先されるため、ローカルのリダイレクト先が本番の URL に向かなくなります。

```
GOOGLE_CLIENT_ID=（Client ID）
GOOGLE_CLIENT_SECRET=（Client Secret）
APP_URL=http://localhost:5173
```

### 6-6. アプリで連携する

MeetFlow の「設定」→「Google カレンダーと連携」を押し、Google の認可画面で許可します。連携後、次の 2 つを設定します。

- 空き時間を確認するカレンダー（`googleCalendarIds`）: 予定が入っているカレンダーをすべて選びます
- 予約を書き込むカレンダー（`googleTargetCalendarId`）: 確定した予約を入れるカレンダーを選びます

## 7. ICS フィードを追加する（任意）

Google カレンダー以外の予定も空き時間の判定に含めたい場合は、非公開の iCal URL（ICS フィード）を追加します。ICS の予定は「予定あり」として扱われます。

追加するときは、`webcal://` で始まる URL の先頭を `https://` に書き換えてください。`webcal://` のままでは取得できません。追加先は「設定」の ICS URL 欄です。

- **Google カレンダー**: 「設定」→ 対象のカレンダー → 「カレンダーの統合」→「iCal 形式の非公開アドレス」の URL をコピー
- **iCloud**: 「カレンダー」の共有設定で「公開カレンダー」を有効にし、表示される URL をコピー
- **Outlook（Web）**: 「設定」→「カレンダー」→「共有されたカレンダー」→「予定表を公開する」で公開し、ICS のリンクをコピー。権限は「空き時間のみ」を選ぶと、予定の詳細は公開されません

ICS の URL は、そのまま他人に渡せる情報です。秘密として扱い、公開リポジトリや共有チャットに貼らないでください。

## 8. 独自ドメインを設定する（任意）

独自ドメインを使う場合は、そのドメインのネームサーバーが Cloudflare で管理されている必要があります。

1. Cloudflare ダッシュボードの「Workers & Pages」→ `meetflow` →「設定」→「ドメインとルート」を開き、「カスタムドメイン」を追加します。
2. `wrangler.toml` の `APP_URL` を新しいドメインに変更します（例: `APP_URL = "https://meet.example.com"`）。
3. Google Cloud の OAuth クライアントの承認済みリダイレクト URI を、新しいドメインの `/api/google/callback` に変更します。古い URI は残しても問題ありません。
4. 再デプロイします。

```bash
npm run deploy
```

`workers.dev` の URL も引き続き使えます。

## 9. トラブルシューティング

### redirect_uri_mismatch（Google の画面にエラーが出る）

Google Cloud の「承認済みのリダイレクト URI」と、実際にアクセスしている URL が一致していません。次の点を確認してください。

- `APP_URL` と OAuth クライアントの URI のプロトコル（`http` / `https`）、ドメイン、ポートが一致しているか
- 末尾に余計な `/` が付いていないか
- ローカル開発では `http://localhost:5173/api/google/callback` が登録されているか

設定を変更したら、Google Cloud 側の反映に数分かかることがあります。

### invalid_grant（連携が切れた）

Google の更新トークンが失効しています。主な原因は次のとおりです。

- 公開ステータスが「テスト」のままで、7 日が経過した（手順 6-4 を参照）
- Google アカウント側で MeetFlow へのアクセスを取り消した

「設定」→「Google カレンダーと連携」をもう一度実行してください。

### 空き時間が表示されない・予約枠が出ない

次の順に確認してください。

1. 日程調整ページの「利用可能な曜日・時間帯」に、時間帯が設定されているか
2. 「設定」のタイムゾーン（初期値は `Asia/Tokyo`）が正しいか。予約ページの時刻は、このタイムゾーンで計算されます
3. 「最短通知時間」（直前の予約を受け付けない時間）と「最大先行日数」が、意図した値になっているか
4. 対象カレンダーに予定が入って埋まっていないか。ICS フィードを追加している場合は、URL が正しいか
5. バッファ時間（予定の前後に空ける時間）が長すぎないか
6. 予約ページの検索範囲は 1 回あたり最大 42 日です。日付の範囲を確認してください

### ログインできない

- 本番では `ADMIN_PASSWORD` が登録されているか確認してください（`npx wrangler secret list`）。
- ローカルでは `.dev.vars` の `ADMIN_PASSWORD` を入力しているか確認してください。`.dev.vars` を変更したら `npm run dev` を再起動します。

### 「no such table」などデータベースのエラーが出る

マイグレーションが適用されていません。本番では `npm run db:migrate:remote`、ローカルでは `npm run db:migrate:local` を実行してください。

### エラーの詳細を見たい

本番の Worker のログをリアルタイムで確認できます。

```bash
npx wrangler tail
```
