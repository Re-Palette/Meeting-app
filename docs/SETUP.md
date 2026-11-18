# 本番デプロイ手順

MeetFlow を Vercel にデプロイし、Turso データベースと Google カレンダーに接続するまでの手順です。すべて無料枠で完結します。

前提:

- Vercel アカウント（無料の Hobby プラン）
- Google アカウント
- このプロジェクトを Git リポジトリにプッシュ済みであること（Vercel に取り込むため）
- ローカルで手順 6 の Google 設定を試す場合は Node.js（LTS 推奨）と npm

## 1. Vercel にプロジェクトを作成する

[Vercel](https://vercel.com/) にログインし、「Add New」→「Project」から、このリポジトリをインポートします。

フレームワーク、ビルドコマンド（`npm run build`）、出力先（`dist`）は `vercel.json` の設定が使われるため、変更は不要です。

## 2. Turso データベースを接続する

Turso は Vercel Marketplace から追加します。

1. Vercel のプロジェクトで「Storage」→「Marketplace」を開き、「Turso」を選びます。
2. データベースを作成し、このプロジェクトに接続します。

接続すると `TURSO_DATABASE_URL` と `TURSO_AUTH_TOKEN` が環境変数に自動で追加されます。手動で設定する必要はありません。

マイグレーション（`migrations/*.sql`）は、`TURSO_DATABASE_URL` が設定されているときにビルドの中で自動的に適用されます。

## 3. 環境変数を登録する

Vercel のプロジェクトで「Settings」→「Environment Variables」を開き、次の値を登録します。

| 名前 | 値 | 必須 |
|---|---|---|
| `ADMIN_PASSWORD` | ログインパスワード | 必須（既定値はありません） |
| `SESSION_SECRET` | セッション署名用の長いランダム文字列 | 必須 |
| `GOOGLE_CLIENT_ID` | 手順 6 で作成する OAuth クライアントの Client ID | 手順 6 のあとに登録 |
| `GOOGLE_CLIENT_SECRET` | 同じく Client Secret | 手順 6 のあとに登録 |
| `APP_URL` | `https://meeting-app1.vercel.app` | 任意（未設定ならリクエストの URL から決まる） |

`SESSION_SECRET` は次のコマンドで生成できます。出力された値を登録してください。

```bash
openssl rand -hex 32
```

`TURSO_DATABASE_URL` と `TURSO_AUTH_TOKEN` は手順 2 で自動的に入るため、ここでは登録しません。

## 4. 再デプロイしてマイグレーションを確認する

環境変数を追加・変更したら、再デプロイして反映します。

「Deployments」を開き、最新のデプロイの「…」メニューから「Redeploy」を選びます。

ビルドログに `[migrate]` で始まる行が出ていれば、マイグレーションが実行されています。

```
[migrate] applied 0001_init.sql
```

`[migrate] TURSO_DATABASE_URL is not set; skipping database migrations.` と出ている場合は、手順 2 の Turso の接続を確認してから、もう一度再デプロイしてください。

## 5. 動作を確認する

https://meeting-app1.vercel.app を開き、`ADMIN_PASSWORD` でログインできれば成功です。

ログアウトすると、そのデバイスだけでなく **すべてのセッションが終了** します。

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
https://meeting-app1.vercel.app/api/google/callback
http://localhost:5173/api/google/callback
```

1 行目は本番の `APP_URL` に `/api/google/callback` を付けた値です。手順 3 で設定した `APP_URL` と完全に一致させてください。2 行目はローカル開発用です。

作成すると Client ID と Client Secret が表示されます。Client ID と Client Secret を、手順 3 の環境変数 `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` に登録し、再デプロイしてください。

ローカルで連携を試す場合は、`.env` に次の値を追記します。

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

独自ドメインを使う場合は、Vercel のプロジェクトの「Settings」→「Domains」でドメインを追加し、表示される DNS の指示に従います。

1. 環境変数 `APP_URL` を新しいドメインに変更します（例: `https://meet.example.com`）。末尾に `/` は付けないでください。
2. Google Cloud の OAuth クライアントの承認済みリダイレクト URI を、新しいドメインの `/api/google/callback` に変更します。古い URI は残しても問題ありません。
3. 再デプロイします。

`vercel.app` の URL も引き続き使えます。

## データの保護とバックアップ

アプリを更新（再デプロイ）しても、設定や予約の記録は消えません。データはアプリではなく Turso に保存されています。

- データベースの構造変更（マイグレーション）は**本番デプロイのときだけ**実行されます。プレビューデプロイでは共有データベースに触れません。
- 構造変更の直前に、全データのスナップショットをデータベース内（`_backups`）に自動保存します（直近10件）。
- 構造変更は1つずつ「全部成功」か「何もしない」のどちらかで適用されます。失敗したらビルドが止まり、新しいアプリは公開されません。
- Turso の接続が外れた場合、アプリは空のデータベースで動かず「データベースが接続されていません」と表示して止まります。
- 設定画面の「データをダウンロード」で、自分のデータを JSON ファイルに保存できます（Google の認証情報は含まれません）。

スナップショットの一覧と復元（`.env` に本番の `TURSO_DATABASE_URL` と `TURSO_AUTH_TOKEN` を入れて実行）:

```bash
npm run db:restore -- --list
```

```bash
npm run db:restore -- --id 番号 --yes
```

**注意:** Vercel の Storage から Turso のデータベースを削除・接続解除しないでください。アプリの外側の操作なので、アプリからは防げません。

## 9. トラブルシューティング

### 管理者パスワードが設定されていません（ログイン画面）

`ADMIN_PASSWORD` または `SESSION_SECRET` が未設定です。手順 3 で登録し、再デプロイしてください。

### API が 500 エラーを返す（データベース関連）

Turso が接続されていないか、ビルド時にマイグレーションが実行されていません。次の順に確認してください。

1. 「Settings」→「Environment Variables」に `TURSO_DATABASE_URL` と `TURSO_AUTH_TOKEN` があるか
2. ビルドログに `[migrate]` の行があるか（手順 4 を参照）
3. 追加・変更のあと、再デプロイしたか

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

### 公開ページに「カレンダーを確認できませんでした」と出る

Google の更新トークンか、ICS URL の取得に失敗しています。「設定」で Google カレンダーを連携し直すか、ICS URL が正しいか（`https://` で始まっているか）を確認してください。

### 空き時間が表示されない・予約枠が出ない

次の順に確認してください。

1. 日程調整ページの「利用可能な曜日・時間帯」に、時間帯が設定されているか
2. 「設定」のタイムゾーン（初期値は `Asia/Tokyo`）が正しいか。予約ページの時刻は、このタイムゾーンで計算されます
3. 「最短通知時間」（直前の予約を受け付けない時間）と「最大先行日数」が、意図した値になっているか
4. 対象カレンダーに予定が入って埋まっていないか。ICS フィードを追加している場合は、URL が正しいか
5. バッファ時間（予定の前後に空ける時間）が長すぎないか
6. 予約ページの検索範囲は 1 回あたり最大 42 日です。日付の範囲を確認してください

### ログインできない

- 本番では、Vercel の環境変数に `ADMIN_PASSWORD` があるか確認してください。変更後は再デプロイが必要です。
- ログインは 1 つの IP アドレスから 10 分間に 10 回失敗すると、一時的に制限されます。時間をおいてから再度お試しください。
- ローカルでは `.env` の `ADMIN_PASSWORD` を入力しているか確認してください。`.env` を変更したら `npm run dev` を再起動します。

### エラーの詳細を見たい

Vercel のプロジェクトの「Deployments」でビルドログ、「Logs」で実行時のログを確認できます。
