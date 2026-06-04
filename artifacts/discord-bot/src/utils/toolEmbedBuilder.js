/**
 * toolEmbedBuilder.js
 * Construit les embeds Discord pour afficher les résultats des tools externes.
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Construit un embed de résultat pour un tool externe.
 * Analyse intelligemment les champs retournés pour les afficher proprement.
 */
export function buildToolResultEmbed(toolResult, query) {
  const { toolName, toolEmoji, results, total, fromCache, error } = toolResult;

  const color = error ? 0xff0000 : (results?.length > 0 ? 0x5865f2 : 0xffa500);
  const title = `${toolEmoji} ${toolName}${fromCache ? ' ⚡' : ''}`;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setTimestamp();

  if (error) {
    embed.setDescription(`❌ ${error}`);
    return embed;
  }

  const count = results?.length || 0;
  embed.setDescription(`Requête : \`${query}\` — **${total || count}** résultat(s)${fromCache ? '\n*⚡ Résultat depuis le cache*' : ''}`);

  if (count === 0) {
    embed.setColor(0xffa500).setDescription(`Requête : \`${query}\`\nAucun résultat trouvé.`);
    return embed;
  }

  // Affiche jusqu'à 5 résultats dans l'embed
  const toShow = results.slice(0, 5);
  for (let i = 0; i < toShow.length; i++) {
    const record = toShow[i];
    const value = formatRecord(record);
    embed.addFields({
      name: `📄 Entrée #${i + 1}`,
      value: value.substring(0, 1024),
      inline: false,
    });
  }

  if (count > 5) {
    embed.addFields({
      name: `…+${count - 5} résultat(s) supplémentaire(s)`,
      value: 'Lance une recherche plus précise pour affiner les résultats.',
      inline: false,
    });
  }

  return embed;
}

/**
 * Formate un enregistrement objet en texte lisible pour un champ embed.
 */
function formatRecord(record) {
  if (typeof record !== 'object' || record === null) {
    return `\`${String(record).substring(0, 1000)}\``;
  }

  const FIELD_ICONS = {
    email: '📧', mail: '📧',
    phone: '📱', telephone: '📱', tel: '📱',
    username: '👤', pseudo: '👤', user: '👤', login: '👤',
    ip: '🌐', ip_address: '🌐', ipv4: '🌐',
    address: '📍', adresse: '📍', location: '📍', ville: '📍', city: '📍',
    name: '🏷️', nom: '🏷️', prenom: '🏷️', fullname: '🏷️',
    password: '🔑', pass: '🔑', mdp: '🔑', hash: '🔑',
    date: '📅', created: '📅', breachdate: '📅',
    source: '📂', breach: '📂', plateforme: '📂',
    url: '🔗', link: '🔗',
    statut: '✅', status: '✅',
    score: '📊', confidence: '📊',
    pays: '🗺️', country: '🗺️', region: '🗺️',
    isp: '🏢', org: '🏢', organisation: '🏢',
    info: 'ℹ️',
  };

  const lines = [];
  const entries = Object.entries(record).slice(0, 12);

  for (const [key, val] of entries) {
    if (val === null || val === undefined || val === '') continue;
    const keyLower = key.toLowerCase();
    const icon = FIELD_ICONS[keyLower] || '';
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    const valStr = String(val).substring(0, 120);
    lines.push(`${icon} **${label}:** \`${valStr}\``);
  }

  return lines.join('\n') || '*Données vides*';
}

/**
 * Construit un embed résumé des tools utilisés (pour l'embed header).
 */
export function buildToolsSummaryField(toolResults) {
  if (!toolResults || toolResults.length === 0) return null;

  const lines = toolResults.map(r => {
    if (r.error) return `${r.toolEmoji} **${r.toolName}** — ❌ Erreur`;
    const count = r.results?.length || 0;
    const cache = r.fromCache ? ' ⚡' : '';
    return `${r.toolEmoji} **${r.toolName}**${cache} — ${r.total || count} résultat(s)`;
  });

  return {
    name: `🔧 Tools externes (${toolResults.length})`,
    value: lines.join('\n') || 'Aucun',
    inline: false,
  };
}

/**
 * Exporte les résultats de tools vers JSON ou TXT.
 */
export function exportToolResults(toolResults, query, format) {
  if (format === 'json') {
    const data = toolResults.map(r => ({
      tool: r.toolName,
      query,
      results: r.results || [],
      total: r.total || 0,
      fromCache: r.fromCache,
    }));
    return {
      content: JSON.stringify(data, null, 2),
      filename: `export_tools_${Date.now()}.json`,
    };
  }

  const lines = [];
  for (const r of toolResults) {
    lines.push(`=== ${r.toolName} (${r.total || r.results?.length || 0} résultats) ===`);
    if (r.error) { lines.push(`ERREUR: ${r.error}`); continue; }
    for (const rec of (r.results || [])) {
      if (typeof rec === 'object') {
        lines.push(Object.entries(rec).map(([k, v]) => `${k}: ${v}`).join(' | '));
      } else {
        lines.push(String(rec));
      }
    }
    lines.push('');
  }
  return {
    content: lines.join('\n'),
    filename: `export_tools_${Date.now()}.txt`,
  };
}
