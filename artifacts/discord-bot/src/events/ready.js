import { getDB } from '../utils/database.js';

export const name = 'ready';
export const once = true;

export async function execute(client) {
  console.log(`[BOT] Connecté en tant que ${client.user.tag}`);
  client.user.setActivity('🔍 Recherche de données', { type: 3 });

  // Start status watcher for auto role assignment
  startStatusWatcher(client);
}

function startStatusWatcher(client) {
  setInterval(async () => {
    try {
      const db = getDB();
      const row = db.prepare("SELECT value FROM guild_config WHERE key = 'status_watch_config'").get();
      if (!row) return;
      let cfg;
      try { cfg = JSON.parse(row.value); } catch { return; }
      if (!cfg?.enabled || !cfg.text || !cfg.role_id) return;

      const textLower = cfg.text.toLowerCase();

      for (const [, guild] of client.guilds.cache) {
        try {
          // Fetch all members with presence
          const members = await guild.members.fetch({ withPresences: true }).catch(() => null);
          if (!members) continue;

          for (const [, member] of members) {
            if (member.user.bot) continue;

            // Check if member has the status text
            const activities = member.presence?.activities || [];
            const hasStatus = activities.some(a =>
              a.type === 4 && // Custom status type
              a.state && a.state.toLowerCase().includes(textLower)
            );

            const hasRole = member.roles.cache.has(cfg.role_id);

            if (hasStatus && !hasRole) {
              await member.roles.add(cfg.role_id).catch(e =>
                console.error(`[STATUS] Cannot add role to ${member.user.tag}:`, e.message)
              );
            } else if (!hasStatus && hasRole) {
              await member.roles.remove(cfg.role_id).catch(e =>
                console.error(`[STATUS] Cannot remove role from ${member.user.tag}:`, e.message)
              );
            }
          }
        } catch (e) {
          console.error(`[STATUS] Guild ${guild.name} error:`, e.message);
        }
      }
    } catch (e) {
      console.error('[STATUS WATCHER]', e.message);
    }
  }, 60_000); // Check every 60 seconds
}
