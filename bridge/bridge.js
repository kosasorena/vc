// ローカルワールド用ブリッジ
// Minecraft(/wsserver) ⇄ このスクリプト ⇄ Cloudflare Worker
import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";

const WORKER_URL = process.env.VC_URL ?? "https://mc-proximity-vc.kosasorena.workers.dev";
const SECRET = process.env.MC_SECRET;
const PORT = Number(process.env.PORT ?? 19131);
const INTERVAL_MS = 500;

if (!SECRET) {
  console.error("MC_SECRET が未設定です (.env を作成してください)");
  process.exit(1);
}
const auth = { authorization: `Bearer ${SECRET}` };

let game = null;
const pending = new Map();

const wss = new WebSocketServer({ port: PORT });
console.log(`待機中: Minecraftで  /wsserver localhost:${PORT}  を実行してください`);

wss.on("connection", (ws) => {
  console.log("Minecraftに接続しました");
  game = ws;
  ws.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.header?.messagePurpose === "commandResponse") {
      const resolve = pending.get(m.header.requestId);
      if (resolve) { pending.delete(m.header.requestId); resolve(m.body); }
    }
  });
  ws.on("close", () => {
    if (game === ws) game = null;
    console.log("Minecraftとの接続が切れました");
  });
});

function runCommand(commandLine) {
  return new Promise((resolve) => {
    if (!game) return resolve(null);
    const id = randomUUID();
    const timer = setTimeout(() => { pending.delete(id); resolve(null); }, 800);
    pending.set(id, (body) => { clearTimeout(timer); resolve(body); });
    game.send(JSON.stringify({
      header: { version: 1, requestId: id, messagePurpose: "commandRequest", messageType: "commandRequest" },
      body: { version: 1, commandLine, origin: { type: "player" } },
    }));
  });
}

// vc_<code> タグを持つプレイヤーの座標を取得
async function queryPlayer(code) {
  const body = await runCommand(`querytarget @a[tag=vc_${code}]`);
  if (!body || body.statusCode !== 0 || !body.details) return null;
  try {
    const t = JSON.parse(body.details)[0];
    if (!t) return null;
    return {
      name: t.name ?? `vc_${code}`,
      x: t.position.x, y: t.position.y, z: t.position.z,
      yaw: (t.yRot * Math.PI) / 180,
      dim: String(t.dimension),
      codes: [code],
    };
  } catch {
    return null;
  }
}

let codes = [];
let codesAt = 0;
let running = false;

async function tick() {
  if (running || !game) return;
  running = true;
  try {
    if (Date.now() - codesAt > 2000) {
      const r = await fetch(`${WORKER_URL}/api/codes`, { headers: auth });
      if (!r.ok) throw new Error(`/api/codes ${r.status} (MC_SECRETを確認してください)`);
      codes = await r.json();
      codesAt = Date.now();
    }
    const players = (await Promise.all(codes.map(queryPlayer))).filter(Boolean);
    const r = await fetch(`${WORKER_URL}/api/positions`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify(players),
    });
    if (!r.ok) throw new Error(`/api/positions ${r.status}`);
  } catch (e) {
    console.warn(`更新に失敗: ${e.message}`);
  } finally {
    running = false;
  }
}
setInterval(tick, INTERVAL_MS);
