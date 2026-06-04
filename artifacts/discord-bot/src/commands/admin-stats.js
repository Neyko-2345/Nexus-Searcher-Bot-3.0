import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/adminCheck.js';
import { getDB } from '../utils/database.js';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('[ADMIN] Voir les statistiques du bot');

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
  }

  const db = getDB();

  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const blacklisted = db.prepare('SELECT COUNT(*) as c FROM users WHERE blacklisted = 1').get().c;
  const unlimited = db.prepare("SELECT COUNT(*) as c FROM users WHERE plan = 'unlimited'").get().c;
  const totalSearches = db.prepare('SELECT COUNT(*) as c FROM search_logs').get().c;
  const todaySearches = db.prepare("SELECT COUNT(*) as c FROM search_logs WHERE date(timestamp) = date('now')").get().c;
  const totalDatabases = db.prepare('SELECT COUNT(*) as c FROM databases').get().c;
  const totalEntries = db.prepare('SELECT SUM(entry_count) as s FROM databases').get().s || 0;
  const topSearchType = db.prepare("SELECT search_type, COUNT(*) as c FROM search_logs GROUP BY search_type ORDER BY c DESC LIMIT 1").get();

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📊 Statistiques du Bot')
    .addFields(
      { name: '👥 Utilisateurs', value: totalUsers.toString(), inline: true },
      { name: '🚫 Blacklistés', value: blacklisted.toString(), inline: true },
      { name: '♾️ Illimités', value: unlimited.toString(), inline: true },
      { name: '🔍 Recherches totales', value: totalSearches.toLocaleString(), inline: true },
      { name: '🔍 Recherches aujourd\'hui', value: todaySearches.toString(), inline: true },
      { name: '📂 Type le plus recherché', value: topSearchType ? `${topSearchType.search_type} (${topSearchType.c}x)` : 'N/A', inline: true },
      { name: '📚 Bases de données', value: totalDatabases.toString(), inline: true },
      { name: '📝 Entrées totales', value: totalEntries.toLocaleString(), inline: true }
    )
    .setFooter({ text: `Uptime: ${Math.floor(process.uptime() / 60)}min` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
