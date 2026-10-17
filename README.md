# sui

モバイルファーストのメモ・タスク管理Webアプリ。

公開先: https://sui-tasks.hutari0315.workers.dev

GitHub: https://github.com/moyan0315/sui-tasks

## 機能

- 最初の画面から入力。下書きを端末へ保存し、追加したメモをIndexedDBへ永続化
- 右フリックで未着手→進行中→完了、左フリックで前の状態へ戻す
- 状態ボタン、ラジオボタンでの代替操作、変更・削除の取消
- 全文検索、状態フィルター、複数行編集、JSON書き出し
- 白ベースのLiquid Glass表現、バネ・レイアウト・シート・トーストのアニメーション
- 全画面スケルトンと、その上で待たずに使えるメモ欄
- Googleのみの認証、ユーザーごとのD1保存と同期
- Workers AIでメモをタスク候補に分解。確認して選んだ候補だけを追加

## 技術と選定理由

| 技術                                | 選定理由                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| TypeScript                          | ステータス、同期データ、APIの型を共有し、変更漏れを検出する                                                |
| React 19                            | 入力、検索、フィルター、ダイアログの状態を独立したコンポーネントで扱う                                     |
| Vite 7                              | SPAを軽い構成でビルドし、起動時にSSRや認証サーバーを待たせない                                             |
| Motion for React                    | フリック、バネ、リスト再配置、入退場を一つのアニメーションエンジンで管理する                               |
| CSS / backdrop-filter               | 白い透過、ぼかし、内側の反射でLiquid Glass表現を作る。WebGLの負荷と依存を増やさない                        |
| Phosphor Icons                      | 状態、検索、設定を同じ線幅・形状のベクターアイコンで統一する                                               |
| IndexedDB / idb                     | ネットワークを待たずに端末へ保存し、トランザクションで同期中の編集を保持する                               |
| localStorage                        | 小さな未送信下書きを入力ごとに保存する。大量のタスク保存には使わない                                       |
| Cloudflare Workers + Static Assets  | UIとAPIを同じオリジンで公開し、CORSと別のホスティング運用を不要にする                                      |
| Hono                                | Workersに適した小さいルーターで、認証・入力制限・APIを分離する                                             |
| Cloudflare D1                       | ユーザー・セッション・タスク・AI回数をSQLと一意制約で管理できる                                            |
| Google OAuth 2.0 / OpenID Connect   | 認証プロバイダーをGoogleだけに限定し、独自のパスワードを保管しない                                         |
| jose                                | Googleの署名、issuer、audience、有効期限を標準的なJWT実装で検証する                                        |
| Zod                                 | クライアント入力とAI応答を実行時に検証し、不正な値を保存しない                                             |
| Workers AI / Llama 3.3 70B FP8 Fast | Cloudflare上のバインディングで推論を呼び、日本語メモを短い作業候補に分解する。モデル名は環境変数で変更可能 |
| Web App Manifest / SVGアイコン      | ホーム画面への追加に備え、白いアプリ表示と拡大可能なアイコンを提供する                                     |
| Wrangler                            | D1マイグレーション、ローカルのWorkers実行、本番公開を同じ設定で行う                                        |
| Vitest / Testing Library            | 同期競合と起動直後の入力など、実害のある回帰を再現する                                                     |
| Miniflare                           | 本番に近いD1互換ランタイムで実際のSQLとAPIを検証する                                                       |
| jsdom / fake-indexeddb              | 保存禁止や読込競合を再現できるDOM・IndexedDBテスト環境を作る                                               |
| Prettier / @types/*                 | ソース整形と開発時の型検査を統一する                                                                       |
| Git / GitHub                        | 編集履歴と公開ソースを管理する。GitHub Actionsは追加していない                                             |

SSR・Next.jsは使わない。公開検索向けのコンテンツサイトではなく、即時入力と端末保存を中心にした個人用アプリのため。R2・KV・Durable Objectsも、現状のデータ型と規模には必須でないため追加しない。

## 起動

```sh
npm ci
npm run db:local
npm run build
npm run preview
```

http://localhost:4173 を開く。Google未設定でも端末内のメモ機能を利用できる。ローカルプレビューのWorkers AIバインディングはCloudflareのリモートリソースを使用する。

フロントエンドをホットリロードする場合は別ターミナルで `npx wrangler dev --port 8787` と `npm run dev` を実行する。Google OAuthを試す場合は両方のオリジンを混在させず、4173のプレビューで実施する。

## Google認証の設定

Google Cloud ConsoleでWebアプリケーションのOAuthクライアントを作成する。リダイレクトURI:

```text
https://sui-tasks.hutari0315.workers.dev/api/auth/callback
http://localhost:4173/api/auth/callback
```

本番の秘密情報はWrangler Secretに保存する。

```sh
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

`wrangler.jsonc` の `vars.APP_ORIGIN` を本番URLにする。開発時は `.dev.vars.example` を参考に、git管理しない `.dev.vars` に設定する。秘密値をREADMEやGitHubに記載しない。

## 公開

```sh
npm test
npm run build
npm run db:remote
npx wrangler deploy
```

別のCloudflareアカウントへ複製する場合は `npx wrangler d1 create sui-db` を実行し、`wrangler.jsonc`のD1 IDをそのアカウントの値に変更する。

GitHubへの初回公開は、認証済みCLIで次を実行する。

```sh
gh repo create sui-tasks --public --source . --remote origin --push
```

## データと認証

- GoogleのAuthorization Code + PKCE、state、nonceを検証。OAuth stateはD1上で使い切りにする
- セッションはランダム値をHttpOnly / SameSite=Lax / 本番Secure Cookieへ保存。D1にはハッシュのみ保存
- タスクの全SQLに認証済みユーザーIDを含める。メモ内容をSQLに結合しない
- 変更APIは同じOriginのみ許可。入力サイズとAI利用回数を制限
- 同期はversionとmutationIdで再送・競合を判定。衝突は両方の編集を残す
- 削除は墓標を同期し、古い端末からの復活を防ぐ
- ログアウト時は表示するデータ領域を切り替える。別アカウントのデータを自動で混ぜない
- Googleログイン前の端末メモは、ログイン後に利用者が「取り込む」を選んだときだけ複製する
- AIには選択したメモだけを送る。自動実行しない。AI候補はユーザーが確認して追加する
- エクスポートは利用中のアカウント領域の未削除データのみ

端末保存はブラウザのデータ消去・ストレージ制限によって失われる可能性がある。バックアップにはJSON書き出しを使う。サービスワーカーは未実装のため、ネットワークなしでの初回表示・再起動は保証しない。

## 検証と資料

`npm test` と `npm run build`。ブラウザ操作の記録・未検証事項は [QA.md](QA.md)、画面仕様は [DESIGN.md](DESIGN.md)、生成した画面基準は [design/concept.png](design/concept.png)。

公式ドキュメント:

- https://react.dev/
- https://vite.dev/
- https://motion.dev/docs/react
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/d1/
- https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/
- https://developers.google.com/identity/openid-connect/openid-connect

## 現在の公開状態

CloudflareへのUI・API・D1の公開と、GitHubリポジトリの作成は実行済み。Google OAuthの本番資格情報は未設定。認証・AI・同期の本番画面からの往復は未検証。最新の証拠と残件はQA.mdを参照。
