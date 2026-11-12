# Minecraft Bedrock 近接ボイスチャット (Cloudflare Workers)

距離に応じて音量が変わり、左右の方向も聞こえるVCです。
Worker: https://mc-proximity-vc.kosasorena.workers.dev

## 構成
```
[ローカルワールド] Minecraft ─(/wsserver)→ bridge(PC上のNode) ─┐
[専用サーバー]    アドオン ──(HTTP POST)──────────────────────┤→ Cloudflare Worker ⇄ ブラウザ(WebRTC P2P)
```
座標の取得方法だけが環境で違い、ブラウザ側とWorkerは共通です。音声はブラウザ同士が直接やり取りします。

## 配布ファイル
- `ProximityVC.mcaddon` : Local版とServer版の両方を1ファイルにまとめたもの (これだけ配ればOK)
- `ProximityVC_Local.mcpack` / `ProximityVC_Server.mcpack` : 個別版

※ 1つのパックでローカルと専用サーバーの両対応にはできません。専用サーバー版は `@minecraft/server-net` に依存し、このモジュールは専用サーバーでしか使えないため、ローカルでは読み込めなくなります。

## 0. Worker (共通・最初に1回)
```
cd worker && npm install
npx wrangler secret put MC_SECRET   # 長いランダム文字列
npx wrangler deploy
```
※ `/api/codes` を追加したので、更新後は再デプロイしてください。

## A. ローカルワールド (ホストのPCだけで設定)
1. `ProximityVC.mcaddon` をダブルクリックで取り込み、ワールドのビヘイビアーパックに **Proximity VC (Local)** を追加 (チート有効、ベータAPI不要)
2. `bridge/` で `.env.example` を `.env` にコピーして `MC_SECRET` を記入 → `npm install` → `npm start` (Node 20.6以上)
3. Windowsは管理者PowerShellで1回だけ (localhost接続の許可):
   `CheckNetIsolation LoopbackExempt -a -n="Microsoft.MinecraftUWP_8wekyb3d8bbwe"`
4. ゲーム内で `/wsserver localhost:19131`
5. 全員がブラウザでWorkerのURLを開いてマイク許可 → 表示された `/tag @s add vc_XXXX` をゲーム内で実行

## B. Dedicated Server
1. `ProximityVC.mcaddon` の拡張子を `.zip` にして展開し、`ProximityVC_Server` を `behavior_packs/` に置いてワールドに登録 (`ProximityVC_Server.mcpack` を展開しても同じ)
2. `server_config/*.example.json` の `.example` を外して `config/default/` に置く (`secrets.json` は `Bearer <MC_SECRET>`)
3. 遊び方はAの5と同じ

## 注意
- ホスト(bridgeを動かす人)以外のプレイヤーは、ブラウザを開いて `/tag` を実行するだけです。LAN/オンラインで参加している友達もホストが `querytarget` で一括取得します。
- `/tag` と `/wsserver` にはコマンド権限が必要です。
- Realms・コンソールでは使えません (座標を外に出す手段がないため)。
- 全員が全員とP2P接続するため、目安は8〜10人。可聴距離は `worker/src/index.ts` の `MAX_DIST`。
