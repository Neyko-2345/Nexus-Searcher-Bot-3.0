import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { isBlacklisted, hasCredits, consumeCredit, getOrCreateUser, getCreditsInfo, isVipOrAdmin } from '../utils/credits.js';
import { searchInLocalDatabasesGrouped, searchInSpecificDatabase, formatResults, buildDbResultEmbed, buildDbGroupedEmbed, exportResults } from '../utils/searcher.js';
import { searchIntelX, searchNazAPI } from '../utils/apiIntegrations.js';
import { getDB } from '../utils/database.js';
import { sendSearchLog } from '../utils/logService.js';
import { handleGlobalSearch, handleGroupGlobalSearch } from './globalSearchHandler.js';
import { searchWithAllPluginsForOption } from '../utils/pluginLoader.js';
import { detectQueryType } from '../utils/queryDetector.js';
import { executeAllCompatibleTools } from '../utils/toolEngine.js';
import { buildToolResultEmbed, buildToolsSummaryField, exportToolResults } from '../utils/toolEmbedBuilder.js';

const TYPE_LABELS = {
  email: 'Email', phone: 'Téléphone', name: 'Nom / Prénom',
  username: 'Username', discord_id: 'Discord ID', ip: 'Adresse IP',
  address: 'Adresse', iban: 'IBAN', password: 'Mot de passe',
  intelx: 'Intel_X', nazapi: 'Nazapi', global: 'Recherche Globale'
};

function buildOptionResultEmbed(optionValue, typeLabel, query, total, creditsInfo) {
  const db = getDB();
  const cfg = db.prepare('SELECT * FROM option_embed_config WHERE option_value = ?').get(optionValue);
  const color = cfg?.color ? parseInt(cfg.color.replace('#', ''), 16) : 0x5865f2;
  const title = cfg?.title
    ? cfg.title.replace('{query}', query).replace('{type}', typeLabel)
    : `🔍 ${typeLabel} — ${total} résultat(s)`;
  const desc = cfg?.description
    ? cfg.description.replace('{query}', query).replace('{type}', typeLabel)
    : `Requête: \`${query}\`${total > 10 ? `\n*(10 premiers sur ${total})*` : ''}`;

  const footerText = cfg?.footer || `Crédits restants: ${creditsInfo.unlimited ? '♾️' : creditsInfo.credits}`;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: footerText, iconURL: cfg?.footer_icon || undefined })
    .setTimestamp();
  if (cfg?.thumbnail) embed.setThumbnail(cfg.thumbnail);
  if (cfg?.image)     embed.setImage(cfg.image);
  return embed;
}

function buildPaginationRow(resultId, dbName, page, total) {
  const row = new ActionRowBuilder();
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`pg_prev_${resultId}_${dbName}_${page}`)
      .setLabel('◀ Précédent')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`pg_info_${resultId}_${dbName}_${page}`)
      .setLabel(`${page} / ${total}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`pg_next_${resultId}_${dbName}_${page}`)
      .setLabel('Suivant ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= total)
  );
  return row;
}

export async function handleSearchModal(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const userId   = interaction.user.id;
  const username = interaction.user.username;
  const rawType  = interaction.customId.replace('search_modal_', '');
  const query    = interaction.fields.getTextInputValue('search_query').trim();
  const db       = getDB();

  if (isBlacklisted(userId)) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🚫 Accès refusé')
        .setDescription('Tu as été blacklisté et ne peux plus effectuer de recherches.')
      ]
    });
  }

  getOrCreateUser(userId, username);

  // ── GLOBAL ────────────────────────────────────────────────────────────────
  if (rawType === 'global') {
    return handleGlobalSearch(interaction, query);
  }

  // ── GROUP GLOBAL ──────────────────────────────────────────────────────────
  if (rawType.startsWith('group_global__')) {
    const groupValue = rawType.replace('group_global__', '');
    return handleGroupGlobalSearch(interaction, query, groupValue);
  }

  // ── DATABASE-SPECIFIC ─────────────────────────────────────────────────────
  if (rawType.startsWith('db_')) {
    const dbName = rawType.replace('db_', '');
    const dbRow  = db.prepare('SELECT * FROM databases WHERE name = ?').get(dbName);

    if (!dbRow) return interaction.editReply({ content: '❌ Base de données introuvable.' });

    if (dbRow.vip_only && !isVipOrAdmin(interaction.member)) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('🔒 Accès restreint')
          .setDescription('Cette base est réservée aux **VIP** et **Admins**.')
        ]
      });
    }

    if (!hasCredits(userId)) {
      const info = getCreditsInfo(userId);
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('❌ Plus de crédits')
          .setDescription(`Prochain rechargement: ${info.nextReset}`)
          .setFooter({ text: `Plan: ${info.plan} • Max: ${info.maxDaily || 5}/jour` })
        ]
      });
    }

    consumeCredit(userId);
    const records = searchInSpecificDatabase(dbName, query);

    await sendSearchLog(interaction.client, {
      userId, userTag: interaction.user.tag || username, username,
      option: dbName, query, resultCount: records.length, channelId: interaction.channelId
    });

    const creditsInfo = getCreditsInfo(userId);

    if (records.length === 0) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle(`${dbRow.emoji || '🗄️'} ${dbRow.label || dbName} — Aucun résultat`)
          .setDescription(`Aucune entrée pour \`${query}\`.`)
          .setFooter({ text: `Crédits: ${creditsInfo.unlimited ? '♾️' : creditsInfo.credits}` })
          .setTimestamp()
        ]
      });
    }

    const resultId  = `${userId}_${Date.now()}_${dbName}`;
    const allRecords = records.map(r => r.data);
    db.prepare('INSERT OR REPLACE INTO temp_results (id, user_id, results) VALUES (?, ?, ?)').run(
      resultId, userId, JSON.stringify({ dbName, records: allRecords, query })
    );

    const embed  = buildDbResultEmbed(dbName, allRecords[0], 1, allRecords.length, query);
    embed.setFooter({ text: `Page 1/${allRecords.length} • Crédits: ${creditsInfo.unlimited ? '♾️' : creditsInfo.credits}` });

    const pagRow    = buildPaginationRow(resultId, dbName, 1, allRecords.length);
    const exportRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`export_json_${resultId}`).setLabel('Export JSON').setEmoji('📥').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`export_txt_${resultId}`).setLabel('Export TXT').setEmoji('📄').setStyle(ButtonStyle.Secondary)
    );

    const components = allRecords.length > 1 ? [pagRow, exportRow] : [exportRow];
    return interaction.editReply({ embeds: [embed], components });
  }

  // ── CUSTOM OPTION ─────────────────────────────────────────────────────────
  let searchType = rawType;
  let typeLabel  = TYPE_LABELS[rawType] || rawType;
  let customOpt  = null;

  if (rawType.startsWith('custom_')) {
    const customValue = rawType.replace('custom_', '');
    customOpt = db.prepare('SELECT * FROM custom_options WHERE value = ?').get(customValue);
    if (!customOpt) return interaction.editReply({ content: '❌ Option introuvable.' });
    if (customOpt.vip_only && !isVipOrAdmin(interaction.member)) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('🔒 Accès restreint').setDescription('Option réservée aux **VIP**.')]
      });
    }
    searchType = customValue;
    typeLabel  = customOpt.label;
  }

  if (!hasCredits(userId)) {
    const info = getCreditsInfo(userId);
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Plus de crédits')
        .setDescription(`Prochain rechargement: ${info.nextReset}`)
        .setFooter({ text: `Plan: ${info.plan} • Max: ${info.maxDaily || 5}/jour` })
      ]
    });
  }

  // ── Intel_X ───────────────────────────────────────────────────────────────
  if (rawType === 'intelx') {
    consumeCredit(userId);
    const result = await searchIntelX(query, 'intelx');
    await sendSearchLog(interaction.client, { userId, userTag: interaction.user.tag || username, username, option: 'intelx', query, resultCount: result.total || 0, channelId: interaction.channelId });
    if (result.error) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('❌ Erreur Intel_X').setDescription(result.error)] });
    if (!result.results?.length) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xffa500).setTitle('🔍 Intel_X — Aucun résultat').setDescription(`Aucun résultat pour \`${query}\``)] });
    const fields = result.results.slice(0, 10).map((r, i) => ({
      name: `📄 #${i + 1} — ${r.bucket || 'Unknown'}`,
      value: [r.name && `**Nom:** \`${r.name}\``, r.date && `**Date:** \`${r.date}\``, r.size && `**Taille:** \`${r.size}\``, r.score && `**Score:** \`${r.score}\``].filter(Boolean).join('\n') || '*Pas de détails*',
      inline: false
    }));
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`🔓 Intel_X — ${result.total} résultat(s)`).setDescription(`Requête: \`${query}\``).addFields(fields).setTimestamp()] });
  }

  // ── Nazapi ────────────────────────────────────────────────────────────────
  if (rawType === 'nazapi') {
    consumeCredit(userId);
    const result = await searchNazAPI(query, 'nazapi');
    await sendSearchLog(interaction.client, { userId, userTag: interaction.user.tag || username, username, option: 'nazapi', query, resultCount: result.total || 0, channelId: interaction.channelId });
    if (result.error) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('❌ Erreur Nazapi').setDescription(result.error)] });
    if (!result.results?.length) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xffa500).setTitle('🔍 Nazapi — Aucun résultat').setDescription(`Aucun résultat pour \`${query}\``)] });
    const fields = result.results.slice(0, 10).map((r, i) => ({
      name: `📄 #${i + 1}`,
      value: typeof r === 'object' ? Object.entries(r).slice(0, 8).map(([k, v]) => `**${k}:** \`${String(v).substring(0, 100)}\``).join('\n') : `\`${String(r).substring(0, 300)}\``,
      inline: false
    }));
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`🔍 Nazapi — ${result.total} résultat(s)`).setDescription(`Requête: \`${query}\``).addFields(fields).setTimestamp()] });
  }

  // ── LOCAL + PLUGINS + TOOLS EXTERNES ─────────────────────────────────────
  consumeCredit(userId);

  // Détection automatique du type de requête
  const { type: detectedType, confidence } = detectQueryType(query);

  // Lancer DB + plugins + tools en parallèle
  const [groupedLocal, pluginResults, toolResults] = await Promise.all([
    Promise.resolve(searchInLocalDatabasesGrouped(query, searchType)),
    searchWithAllPluginsForOption(searchType, query),
    executeAllCompatibleTools(query, detectedType, searchType),
  ]);

  // Aplatir les résultats locaux pour export + log
  const allLocalResults = Object.entries(groupedLocal).flatMap(([dbName, d]) =>
    d.records.map(record => ({ source: dbName, dbLabel: d.label, data: record }))
  );
  const allResults = [...allLocalResults, ...pluginResults];
  const totalWithTools = allResults.length + toolResults.reduce((acc, r) => acc + (r.results?.length || 0), 0);

  await sendSearchLog(interaction.client, {
    userId, userTag: interaction.user.tag || username, username,
    option: searchType, query, resultCount: totalWithTools, channelId: interaction.channelId
  });

  const creditsInfo = getCreditsInfo(userId);
  const dbNames     = Object.keys(groupedLocal);
  const hasToolResults = toolResults.some(r => r.results?.length > 0 || r.error);

  if (allResults.length === 0 && !hasToolResults) {
    const noResEmbed = buildOptionResultEmbed(searchType, typeLabel, query, 0, creditsInfo);
    noResEmbed.setColor(0xffa500).setTitle('🔍 Aucun résultat')
      .setDescription(`Aucune entrée pour \`${query}\` dans **${typeLabel}** (bases + tools).`);
    return interaction.editReply({ embeds: [noResEmbed] });
  }

  // Stocker pour export
  const resultId = `${userId}_${Date.now()}`;
  const exportData = {
    local: allResults,
    tools: toolResults.map(r => ({ tool: r.toolName, results: r.results || [] })),
  };
  db.prepare('INSERT OR REPLACE INTO temp_results (id, user_id, results) VALUES (?, ?, ?)').run(
    resultId, userId, JSON.stringify(allResults) // local pour compat export existant
  );

  const exportRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`export_json_${resultId}`).setLabel('Export JSON').setEmoji('📥').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`export_txt_${resultId}`).setLabel('Export TXT').setEmoji('📄').setStyle(ButtonStyle.Secondary)
  );

  // ── Construction des embeds ───────────────────────────────────────────────
  const embeds = [];

  // Embed header : résumé global
  const headerEmbed = buildOptionResultEmbed(searchType, typeLabel, query, totalWithTools, creditsInfo);

  // Indicateur de détection automatique
  if (confidence !== 'low') {
    headerEmbed.addFields({
      name: '🧠 Type détecté automatiquement',
      value: `\`${detectedType}\` (confiance: ${confidence === 'high' ? '🟢 haute' : '🟡 moyenne'})`,
      inline: false,
    });
  }

  // Résumé bases de données
  if (dbNames.length > 0) {
    const dbSummary = dbNames.slice(0, 5).map(n => {
      const d = groupedLocal[n];
      return `${d.emoji} **${d.label}** — ${d.records.length} résultat(s)${d.isLinked ? ' ⭐' : ''}`;
    }).join('\n');
    headerEmbed.addFields({
      name: `🗄️ Bases avec résultats (${dbNames.length})`,
      value: dbSummary + (dbNames.length > 5 ? `\n*…et ${dbNames.length - 5} de plus*` : ''),
      inline: false,
    });
  }

  // Résumé tools externes
  if (hasToolResults) {
    const toolSummaryField = buildToolsSummaryField(toolResults.filter(r => r.results?.length > 0 || r.error));
    if (toolSummaryField) headerEmbed.addFields(toolSummaryField);
  }

  // Plugins
  if (pluginResults.length > 0) {
    const plugFormatted = formatResults(pluginResults, query, searchType);
    if (plugFormatted) headerEmbed.addFields(plugFormatted.fields);
  }

  embeds.push(headerEmbed);

  // Un embed par base de données (max 5)
  for (const dbName of dbNames) {
    if (embeds.length >= 6) break;
    embeds.push(buildDbGroupedEmbed(dbName, groupedLocal[dbName], query));
  }

  // Un embed par tool externe avec résultats (max 4 tools)
  for (const toolResult of toolResults) {
    if (embeds.length >= 10) break;
    if (toolResult.results?.length > 0 || toolResult.error) {
      embeds.push(buildToolResultEmbed(toolResult, query));
    }
  }

  await interaction.editReply({ embeds, components: [exportRow] });
}
