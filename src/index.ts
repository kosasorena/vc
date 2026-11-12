import { DurableObject } from "cloudflare:workers";
import html from "./client.html";

interface Env {
  ROOM: DurableObjectNamespace<Room>;
  MC_SECRET: string;
}
type Player = { name: string; x: number; y: number; z: number; yaw: number; dim: string; codes: string[] };
type Att = { id: string; code: string };

const MAX_DIST = 24; // これ以上離れると聞こえない(ブロック)

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const room = env.ROOM.get(env.ROOM.idFromName("main"));

    if (url.pathname === "/api/positions") {
      if (req.method !== "POST" || req.headers.get("authorization") !== `Bearer ${env.MC_SECRET}`) {
        return new Response("unauthorized", { status: 401 });
      }
      return room.fetch(req);
    }
    if (url.pathname === "/ws") {
      if (req.headers.get("upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
      return room.fetch(req);
    }
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  },
} satisfies ExportedHandler<Env>;

export class Room extends DurableObject<Env> {
  players = new Map<string, Player>();

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Minecraftサーバーからの座標更新
    if (url.pathname === "/api/positions") {
      const list = (await req.json()) as Player[];
      this.players = new Map(list.map((p) => [p.name, p]));
      this.pushState();
      return new Response("ok");
    }

    // ブラウザのWebSocket
    const { 0: client, 1: server } = new WebSocketPair();
    const existing = this.ctx.getWebSockets();
    const used = new Set(existing.map((w) => (w.deserializeAttachment() as Att).code));
    let code: string;
    do code = String(1000 + Math.floor(Math.random() * 9000));
    while (used.has(code));
    const id = crypto.randomUUID();

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, code } satisfies Att);
    const others = existing.map((w) => (w.deserializeAttachment() as Att).id);
    server.send(JSON.stringify({ type: "hello", id, code, others }));
    return new Response(null, { status: 101, webSocket: client });
  }

  // WebRTCシグナリング中継
  webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    let m: any;
    try { m = JSON.parse(String(msg)); } catch { return; }
    const me = ws.deserializeAttachment() as Att;
    if (m.type === "signal") {
      const target = this.ctx.getWebSockets().find((w) => (w.deserializeAttachment() as Att).id === m.to);
      target?.send(JSON.stringify({ type: "signal", from: me.id, data: m.data }));
    }
  }

  webSocketClose(ws: WebSocket) { this.left(ws); }
  webSocketError(ws: WebSocket) { this.left(ws); }

  left(ws: WebSocket) {
    const me = ws.deserializeAttachment() as Att;
    for (const w of this.ctx.getWebSockets()) if (w !== ws) w.send(JSON.stringify({ type: "left", id: me.id }));
  }

  // 距離に応じた音量・左右パンを各クライアントに配信
  pushState() {
    const socks = this.ctx.getWebSockets().map((ws) => ({ ws, att: ws.deserializeAttachment() as Att }));
    const all = [...this.players.values()];
    const link = new Map<string, Player>();
    for (const { att } of socks) {
      const p = all.find((p) => p.codes.includes(att.code));
      if (p) link.set(att.id, p);
    }
    for (const { ws, att } of socks) {
      const me = link.get(att.id);
      const peers = socks
        .filter((s) => s.att.id !== att.id)
        .map((s) => {
          const q = link.get(s.att.id);
          if (!me || !q || me.dim !== q.dim) return { id: s.att.id, vol: 0, pan: 0 };
          const dx = q.x - me.x, dy = q.y - me.y, dz = q.z - me.z;
          const d = Math.hypot(dx, dy, dz);
          const vol = d >= MAX_DIST ? 0 : (1 - d / MAX_DIST) ** 2;
          const h = Math.hypot(dx, dz);
          const pan = h < 0.5 ? 0 : (-dx * Math.cos(me.yaw) - dz * Math.sin(me.yaw)) / h;
          return { id: s.att.id, vol: +vol.toFixed(3), pan: +pan.toFixed(3) };
        });
      ws.send(JSON.stringify({ type: "state", name: me?.name ?? null, peers }));
    }
  }
}
