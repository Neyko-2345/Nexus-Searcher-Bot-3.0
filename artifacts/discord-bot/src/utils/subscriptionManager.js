/**
 * subscriptionManager.js
 * Gère les abonnements avec expiration automatique + rappels DM.
 *
 * Rappels : 1 jour avant, 5 min avant, puis message d'expiration.
 * À l'expiration : retrait du rôle + plan remis à zéro (aucun plan si statut actif, free sinon).
 */

import { getDB } from './database.js';

let _client = null;

// ── Init ──────────────────────────────────────────────────────────────────────

export function initSubscriptionManager(client) {
  _client = client;
  // Toutes les 60 secondes on vérifie les expirations et rappels
  setInterval(() => checkSubscriptions(), 60_000);
  console.log('[SUBSCRIPTIONS] Scheduler démarré.');
}

// ── Helpers DB ────────────────────────────────────────────────────────────────

export function ensureSubscriptionTables() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS plan_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      plan_name TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      reminded_1day INTEGER DEFAULT 0,
      reminded_5min INTEGER DEFAULT 0,
      UNIQUE(guild_id, user_id, role_id)
    );
  `);
  // Migration : ajoute duration_days à plans si absent
  try { db.exec("ALTER TABLE plans ADD COLUMN duration_days INTEGER DEFAULT NULL"); } catch {}
}

/**
 * Crée ou renouvelle un abonnement pour un utilisateur.
 * @param {string} guildId
 * @param {string} userId
 * @param {string} roleId
 * @param {string} planName
 * @param {number} durationDays  – durée en jours
 */
export function createSubscription(guildId, userId, roleId, planName, durationDays) {
  const db = getDB();
  const expiresAt = Date.now() + durationDays * 24 * 60 * 60 * 1000;
  db.prepare(`
    INSERT INTO plan_subscriptions (guild_id, user_id, role_id, plan_name, expires_at, reminded_1day, reminded_5min)
    VALUES (?, ?, ?, ?, ?, 0, 0)
    ON CONFLICT(guild_id, user_id, role_id) DO UPDATE SET
      expires_at = excluded.expires_at,
      reminded_1day = 0,
      reminded_5min = 0
  `).run(guildId, userId, roleId, planName, expiresAt);
}

/**
 * Supprime l'abonnement d'un utilisateur pour un plan donné.
 */
export function removeSubscription(guildId, userId, roleId) {
  const db = getDB();
  db.prepare('DELETE FROM plan_subscriptions WHERE guild_id = ? AND user_id = ? AND role_id = ?').run(guildId, userId, roleId);
}

/**
 * Retourne l'abonnement actif d'un utilisateur sur un rôle donné, ou null.
 */
export function getSubscription(guildId, userId, roleId) {
  const db = getDB();
  return db.prepare('SELECT * FROM plan_subscriptions WHERE guild_id = ? AND user_id = ? AND role_id = ?').get(guildId, userId, roleId);
}

/**
 * Retourne tous les abonnements actifs d'un utilisateur dans une guilde.
 */
export function getUserSubscriptions(guildId, userId) {
  const db = getDB();
  return db.prepare('SELECT * FROM plan_subscriptions WHERE guild_id = ? AND user_id = ?').all(guildId, userId);
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

async function checkSubscriptions() {
  if (!_client) return;
  const db = getDB();
  const now = Date.now();

  const subs = db.prepare('SELECT * FROM plan_subscriptions').all();

  for (const sub of subs) {
    const msLeft = sub.expires_at - now;

    // ── Rappel 1 jour avant ──────────────────────────────────────────────────
    if (!sub.reminded_1day && msLeft <= 24 * 60 * 60 * 1000 && msLeft > 0) {
      await sendReminder(sub, '1jour');
      db.prepare('UPDATE plan_subscriptions SET reminded_1day = 1 WHERE id = ?').run(sub.id);
    }

    // ── Rappel 5 min avant ───────────────────────────────────────────────────
    if (!sub.reminded_5min && msLeft <= 5 * 60 * 1000 && msLeft > 0) {
      await sendReminder(sub, '5min');
      db.prepare('UPDATE plan_subscriptions SET reminded_5min = 1 WHERE id = ?').run(sub.id);
    }

    // ── Expiration ───────────────────────────────────────────────────────────
    if (msLeft <= 0) {
      await expireSubscription(sub);
    }
  }
}

async function sendReminder(sub, type) {
  try {
    const user = await _client.users.fetch(sub.user_id).catch(() => null);
    if (!user) return;

    const timeStr = type === '1jour' ? '**1 jour**' : '**5 minutes**';
    const expiresTs = `<t:${Math.floor(sub.expires_at / 1000)}:R>`;

    await user.send({
      embeds: [{
        color: type === '1jour' ? 0xfaa61a : 0xed4245,
        title: `⏳ Ton abonnement expire bientôt`,
        description: [
          `Ton plan **${sub.plan_name}** expire dans ${timeStr} ${expiresTs}.`,
          '',
          `> Contacte un administrateur du serveur pour renouveler ton abonnement.`,
        ].join('\n'),
        timestamp: new Date().toISOString(),
      }]
    }).catch(() => {});
  } catch (e) {
    console.error('[SUBSCRIPTIONS] Rappel DM échoué:', e.message);
  }
}

async function expireSubscription(sub) {
  const db = getDB();
  try {
    const guild = await _client.guilds.fetch(sub.guild_id).catch(() => null);
    if (!guild) {
      db.prepare('DELETE FROM plan_subscriptions WHERE id = ?').run(sub.id);
      return;
    }

    const member = await guild.members.fetch(sub.user_id).catch(() => null);

    // Retrait du rôle
    if (member) {
      await member.roles.remove(sub.role_id).catch(() => {});
    }

    // Remet le plan à zéro selon la config statut
    const statusRow = db.prepare("SELECT value FROM guild_config WHERE key = 'status_watch_config'").get();
    let statusActive = false;
    try {
      if (statusRow) {
        const cfg = JSON.parse(statusRow.value);
        statusActive = cfg?.enabled === true;
      }
    } catch {}

    const freeRow = db.prepare("SELECT value FROM guild_config WHERE key = 'free_daily_credits'").get();
    const freeCredits = freeRow ? parseInt(freeRow.value) : 5;

    if (statusActive) {
      // Aucun plan attribué (l'utilisateur doit avoir le statut pour accéder)
      db.prepare("UPDATE users SET plan = 'none', credits = 0, max_daily_credits = 0 WHERE id = ?").run(sub.user_id);
    } else {
      // Plan de base gratuit
      db.prepare("UPDATE users SET plan = 'free', credits = ?, max_daily_credits = ? WHERE id = ?").run(freeCredits, freeCredits, sub.user_id);
    }

    // DM d'expiration
    try {
      const user = await _client.users.fetch(sub.user_id).catch(() => null);
      if (user) {
        await user.send({
          embeds: [{
            color: 0xed4245,
            title: `❌ Abonnement expiré`,
            description: [
              `Ton plan **${sub.plan_name}** a expiré.`,
              '',
              statusActive
                ? `> Tu n'as plus accès aux recherches. Contacte un administrateur pour renouveler.`
                : `> Tu es revenu au plan gratuit (**${freeCredits} crédits/jour**). Contacte un administrateur pour renouveler.`,
            ].join('\n'),
            timestamp: new Date().toISOString(),
          }]
        }).catch(() => {});
      }
    } catch {}

    console.log(`[SUBSCRIPTIONS] Plan "${sub.plan_name}" expiré pour ${sub.user_id} (guild: ${sub.guild_id})`);
  } catch (e) {
    console.error('[SUBSCRIPTIONS] Expiration échouée:', e.message);
  } finally {
    // Supprime l'abonnement dans tous les cas
    db.prepare('DELETE FROM plan_subscriptions WHERE id = ?').run(sub.id);
  }
}
