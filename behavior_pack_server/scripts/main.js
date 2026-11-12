import { world, system } from "@minecraft/server";
import { http, HttpRequest, HttpRequestMethod, HttpHeader } from "@minecraft/server-net";
import { variables, secrets } from "@minecraft/server-admin";

const VC_URL = "https://mc-proximity-vc.kosasorena.workers.dev";
const BASE_URL = variables.get("vc_url") ?? VC_URL;
const SECRET = secrets.get("vc_secret"); // "Bearer <MC_SECRET>"

let busy = false;

system.runInterval(async () => {
  if (busy) return;
  const players = world.getAllPlayers().map((p) => ({
    name: p.name,
    x: p.location.x,
    y: p.location.y,
    z: p.location.z,
    yaw: (p.getRotation().y * Math.PI) / 180,
    dim: p.dimension.id,
    codes: p.getTags().filter((t) => t.startsWith("vc_")).map((t) => t.slice(3)),
  }));

  busy = true;
  try {
    const req = new HttpRequest(`${BASE_URL}/api/positions`);
    req.method = HttpRequestMethod.Post;
    req.body = JSON.stringify(players);
    req.headers = [
      new HttpHeader("Content-Type", "application/json"),
      new HttpHeader("Authorization", SECRET),
    ];
    await http.request(req);
  } catch (e) {
    console.warn(`VC update failed: ${e}`);
  } finally {
    busy = false;
  }
}, 10);

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  system.runTimeout(() => {
    try {
      player.sendMessage(`§b[VC]§r §e${VC_URL}§r を開き、表示された §a/tag @s add vc_XXXX§r をここで実行してください`);
    } catch {}
  }, 60);
});
