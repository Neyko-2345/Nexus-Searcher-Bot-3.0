import { EmbedBuilder } from 'discord.js';
import { getDB } from './database.js';

function getLogChannel(client, key = 'log_channel_id') {
  const db = getDB();
  const row = db.prepare("SELECT value FROM guild_config WHERE key = ?").get(key);
  if (!row) return null;
  return client.channels.cache.get(row.value);
}

function isLogEnabled() {
  const db = getDB();
  const row = db.prepare("SELECT value FROM guild_config WHERE key = 'logs_enabled'").get();
  return row?.value === '1';
}

export async function sendSearchLog(client, {
  userId, userTag, username, option, query, resultCount, channelId
}) {
  const db = getDB();

  try {
    db.prepare(`
      INSERT INTO search_logs (user_id, user_tag, query, search_type, result_count, channel_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, userTag || username, query, option, resultCount ?? 0, channelId ?? null);
  } catch {}

  if (!isLogEnabled()) return;
  const logChannel = getLogChannel(client);
  if (!logChannel) return;

  const resultColor = resultCount > 0 ? 0x57f287 : 0xffa500;
  const resultIcon  = resultCount > 0 ? '✅' : '🔴';

  const embed = new EmbedBuilder()
    .setColor(resultColor)
    .setTitle(`${resultIcon} Recherche — ${option}`)
    .addFields(
      { name: '👤 Utilisateur', value: `<@${userId}> \`${userTag || username}\``, inline: true },
      { name: '🔍 Requête',     value: `\`${query.substring(0, 200)}\``,          inline: true },
      { name: '📊 Résultats',   value: `\`${resultCount}\``,                      inline: true },
      { name: '📁 Option',      value: `\`${option}\``,                           inline: true },
      { name: '📍 Salon',       value: channelId ? `<#${channelId}>` : '*Inconnu*', inline: true },
    )
    .setTimestamp();

  try {
    await logChannel.send({ embeds: [embed] });
  } catch (e) {
    console.error('[LOGS] Failed to send log:', e.message);
  }
}

export async function sendExportLog(client, { userId, userTag, username, query, format, channelId }) {
  if (!isLogEnabled()) return;
  const logChannel = getLogChannel(client);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📥 Export — ${format.toUpperCase()}`)
    .addFields(
      { name: '👤 Utilisateur', value: `<@${userId}> \`${userTag || username}\``, inline: true },
      { name: '🔍 Requête',     value: `\`${(query || '?').substring(0, 200)}\``, inline: true },
      { name: '📤 Format',      value: `\`${format.toUpperCase()}\``,             inline: true },
      { name: '📍 Salon',       value: channelId ? `<#${channelId}>` : '*Inconnu*', inline: true },
    )
    .setTimestamp();

  try {
    await logChannel.send({ embeds: [embed] });
  } catch (e) {
    console.error('[LOGS] Failed to send export log:', e.message);
  }
}

export async function sendBotActionLog(client, guildId, { action, userId, userTag, details }) {
  const db = getDB();
  const row = db.prepare('SELECT channel_id FROM bot_action_logs WHERE guild_id = ?').get(guildId);
  if (!row) return;
  const channel = client.channels.cache.get(row.channel_id);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🛠️ Action Admin — ${action}`)
    .addFields(
      { name: '👤 Par',     value: `<@${userId}> \`${userTag}\``, inline: true },
      { name: '⚙️ Action', value: action,                          inline: true },
    );

  if (details) embed.setDescription(details);
  embed.setTimestamp();

  try {
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error('[BOT_LOGS] Failed to send action log:', e.message);
  }
}

export async function sendStatutLog(client, guildId, { userId, userTag, action, roleId, roleName }) {
  const db = getDB();
  const row = db.prepare('SELECT channel_id FROM statut_log_config WHERE guild_id = ?').get(guildId);
  if (!row) return;
  const channel = client.channels.cache.get(row.channel_id);
  if (!channel) return;

  const isAdd = action === 'add';
  const embed = new EmbedBuilder()
    .setColor(isAdd ? 0x57f287 : 0xed4245)
    .setTitle(isAdd ? '✅ Rôle statut attribué' : '🔴 Rôle statut retiré')
    .addFields(
      { name: '👤 Membre', value: `<@${userId}> \`${userTag}\``, inline: true },
      { name: '🎭 Rôle',   value: `<@&${roleId}> \`${roleName}\``, inline: true },
      { name: '📌 Action', value: isAdd ? 'Statut détecté → rôle attribué' : 'Statut retiré → rôle enlevé', inline: false },
    )
    .setTimestamp();

  try {
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error('[STATUT_LOG] Failed:', e.message);
  }
}
