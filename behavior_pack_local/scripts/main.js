import { world, system } from "@minecraft/server";

const VC_URL = "https://mc-proximity-vc.kosasorena.workers.dev";

// 参加時にVCのURLを案内
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  system.runTimeout(() => {
    try {
      player.sendMessage(`§b[VC]§r §e${VC_URL}§r を開き、表示された §a/tag @s add vc_XXXX§r をここで実行してください`);
    } catch {}
  }, 60);
});

// vc_ タグが付いたら通知
const linked = new Map();
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    const has = p.getTags().some((t) => t.startsWith("vc_"));
    if (has && !linked.get(p.id)) p.sendMessage("§b[VC]§r §aVCタグを確認しました");
    linked.set(p.id, has);
  }
}, 20);
