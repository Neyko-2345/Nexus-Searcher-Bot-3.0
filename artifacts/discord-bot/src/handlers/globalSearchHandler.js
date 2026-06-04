import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { searchGlobal, searchGlobalFiltered, buildDbResultEmbed } from '../utils/searcher.js';
import { isBlacklisted, hasCredits, consumeCredit, getOrCreateUser, getCreditsInfo, isVipOrAdmin } from '../utils/credits.js';
import { getDB } from '../utils/database.js';
import { sendSearchLog } from '../utils/logService.js';
import { detectQueryType } from '../utils/queryDetector.js';
import { executeAllCompatibleTools } from '../utils/toolEngine.js';
import { buildToolResultEmbed, buildToolsSummaryField } from '../utils/toolEmbedBuilder.js';

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

export async function handleGlobalSearch(interaction, query) {
  const userId = interaction.user.id;
  const db     = getDB();

  getOrCreateUser(userId, interaction.user.username);

  if (isBlacklisted(userId)) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('🚫 Accès refusé').setDescription('Tu as été blacklisté.')]
    });
  }

  if (!hasCredits(userId)) {
    const info = getCreditsInfo(userId);
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xff0000).setTitle('❌ Plus de crédits')
        .setDescription(`Prochain rechargement: ${info.nextReset}`)
        .setFooter({ text: `Plan: ${info.plan} • Max: ${info.maxDaily || 5}/jour` })
      ]
    });
  }

  consumeCredit(userId);

  // Détection automatique du type de requête
  const { type: detectedType, confidence } = detectQueryType(query);

  // Lancer DB + tools en parallèle
  const [grouped, toolResults] = await Promise.all([
    Promise.resolve(searchGlobal(query)),
    executeAllCompatibleTools(query, detectedType, null),
  ]);

  const dbNames      = Object.keys(grouped);
  const totalDbRes   = dbNames.reduce((acc, n) => acc + grouped[n].records.length, 0);
  const totalToolRes = toolResults.reduce((acc, r) => acc + (r.results?.length || 0), 0);
  const totalResults = totalDbRes + totalToolRes;

  await sendSearchLog(interaction.client, {
    userId,
    userTag: interaction.user.tag || interaction.user.username,
    username: interaction.user.username,
    option: 'global',
    query,
    resultCount: totalResults,
    channelId: interaction.channelId,
  });

  const creditsInfo = getCreditsInfo(userId);
  const hasToolResults = toolResults.some(r => r.results?.length > 0 || r.error);

  // Embed résumé global
  const serviceCount = dbNames.length + toolResults.filter(r => r.results?.length > 0).length;
  const summaryEmbed = new EmbedBuilder()
    .setColor(totalResults > 0 ? 0x57f287 : 0xffa500)
    .setTitle('<:loupe:1510581015800709222> Recherche Global')
    .setDescription(
      `<:check:1512065393345171624> **${serviceCount}** Services\n` +
      `<:dossier:1510580881679585390> **${totalResults}** Résultats`
    )
    .setTimestamp();

  if (confidence !== 'low') {
    summaryEmbed.addFields({
      name: '🧠 Type détecté',
      value: `\`${detectedType}\` — confiance ${confidence === 'high' ? '🟢 haute' : '🟡 moyenne'}`,
      inline: true,
    });
  }

  if (dbNames.length > 0) {
    const serviceList = dbNames.map(n => `${grouped[n].emoji} **${grouped[n].label}** — \`${grouped[n].records.length}\` rés.`).join('\n');
    summaryEmbed.addFields({ name: '📋 Détail bases de données', value: serviceList.substring(0, 1024), inline: false });
  }

  if (hasToolResults) {
    const toolSummaryField = buildToolsSummaryField(toolResults.filter(r => r.results?.length > 0 || r.error));
    if (toolSummaryField) summaryEmbed.addFields(toolSummaryField);
  }

  await interaction.editReply({ embeds: [summaryEmbed] });

  if (totalResults === 0 && !hasToolResults) return;

  // Un followUp par DB avec résultats
  for (const dbName of dbNames) {
    const { records } = grouped[dbName];
    const resultId    = `${userId}_${Date.now()}_${dbName}`;

    db.prepare('INSERT OR REPLACE INTO temp_results (id, user_id, results) VALUES (?, ?, ?)').run(
      resultId, userId, JSON.stringify({ dbName, records, query })
    );

    const embed     = buildDbResultEmbed(dbName, records[0], 1, records.length, query);
    const pagRow    = buildPaginationRow(resultId, dbName, 1, records.length);
    const exportRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`export_json_${resultId}`).setLabel('Export JSON').setEmoji('📥').setStyle(ButtonStyle.Secondary)
    );

    await interaction.followUp({
      embeds: [embed],
      components: records.length > 1 ? [pagRow, exportRow] : [exportRow],
      ephemeral: true,
    });
  }

  // Un followUp par tool avec résultats (max 4)
  let toolCount = 0;
  for (const toolResult of toolResults) {
    if (toolCount >= 4) break;
    if (toolResult.results?.length > 0 || toolResult.error) {
      const toolEmbed = buildToolResultEmbed(toolResult, query);
      const exportRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`export_json_${userId}_tool_${toolResult.toolId}_${Date.now()}`)
          .setLabel('Export JSON').setEmoji('📥').setStyle(ButtonStyle.Secondary)
      );
      await interaction.followUp({ embeds: [toolEmbed], components: [exportRow], ephemeral: true });
      toolCount++;
    }
  }
}

// Group Global search — only searches DBs referenced by this group's items
export async function handleGroupGlobalSearch(interaction, query, groupValue) {
  const userId = interaction.user.id;
  const db     = getDB();

  getOrCreateUser(userId, interaction.user.username);

  if (isBlacklisted(userId)) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('🚫 Accès refusé').setDescription('Tu as été blacklisté.')]
    });
  }

  if (!hasCredits(userId)) {
    const info = getCreditsInfo(userId);
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('❌ Plus de crédits')
        .setDescription(`Prochain rechargement: ${info.nextReset}`)
        .setFooter({ text: `Plan: ${info.plan} • Max: ${info.maxDaily || 5}/jour` })]
    });
  }

  const grp   = db.prepare('SELECT * FROM option_groups WHERE value = ?').get(groupValue);
  const items = db.prepare('SELECT * FROM option_group_items WHERE group_value = ?').all(groupValue);

  const dbNames = items
    .filter(i => i.target_value.startsWith('db_'))
    .map(i => i.target_value.replace('db_', ''));

  consumeCredit(userId);

  const { type: detectedType, confidence } = detectQueryType(query);

  const [grouped, toolResults] = await Promise.all([
    Promise.resolve(searchGlobalFiltered(query, dbNames)),
    executeAllCompatibleTools(query, detectedType, groupValue),
  ]);

  const resultDbKeys = Object.keys(grouped);
  const totalDbRes   = resultDbKeys.reduce((acc, n) => acc + grouped[n].records.length, 0);
  const totalToolRes = toolResults.reduce((acc, r) => acc + (r.results?.length || 0), 0);
  const totalResults = totalDbRes + totalToolRes;

  await sendSearchLog(interaction.client, {
    userId,
    userTag: interaction.user.tag || interaction.user.username,
    username: interaction.user.username,
    option: `global_group_${groupValue}`,
    query,
    resultCount: totalResults,
    channelId: interaction.channelId,
  });

  const creditsInfo = getCreditsInfo(userId);
  const grpLabel    = grp ? `${grp.emoji} ${grp.label}` : groupValue;
  const hasToolResults = toolResults.some(r => r.results?.length > 0 || r.error);

  const serviceCount2 = resultDbKeys.length + toolResults.filter(r => r.results?.length > 0).length;
  const grpLabelClean = grp ? grp.label : groupValue;
  const summaryEmbed = new EmbedBuilder()
    .setColor(totalResults > 0 ? 0x57f287 : 0xffa500)
    .setTitle(`<:loupe:1510581015800709222> Recherche ${grpLabelClean}`)
    .setDescription(
      `<:check:1512065393345171624> **${serviceCount2}** Services\n` +
      `<:dossier:1510580881679585390> **${totalResults}** Résultats`
    )
    .setTimestamp();

  if (resultDbKeys.length > 0) {
    const serviceList = resultDbKeys.map(n => `${grouped[n].emoji} **${grouped[n].label}** — \`${grouped[n].records.length}\` rés.`).join('\n');
    summaryEmbed.addFields({ name: '📋 Détail par service', value: serviceList.substring(0, 1024), inline: false });
  }

  if (hasToolResults) {
    const toolSummaryField = buildToolsSummaryField(toolResults.filter(r => r.results?.length > 0 || r.error));
    if (toolSummaryField) summaryEmbed.addFields(toolSummaryField);
  }

  await interaction.editReply({ embeds: [summaryEmbed] });
  if (totalResults === 0 && !hasToolResults) return;

  for (const dbName of resultDbKeys) {
    const { records } = grouped[dbName];
    const resultId    = `${userId}_${Date.now()}_${dbName}`;

    db.prepare('INSERT OR REPLACE INTO temp_results (id, user_id, results) VALUES (?, ?, ?)').run(
      resultId, userId, JSON.stringify({ dbName, records, query })
    );

    const embed     = buildDbResultEmbed(dbName, records[0], 1, records.length, query);
    const pagRow    = buildPaginationRow(resultId, dbName, 1, records.length);
    const exportRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`export_json_${resultId}`).setLabel('Export JSON').setEmoji('📥').setStyle(ButtonStyle.Secondary)
    );

    await interaction.followUp({
      embeds: [embed],
      components: records.length > 1 ? [pagRow, exportRow] : [exportRow],
      ephemeral: true,
    });
  }

  let toolCount = 0;
  for (const toolResult of toolResults) {
    if (toolCount >= 4) break;
    if (toolResult.results?.length > 0 || toolResult.error) {
      await interaction.followUp({
        embeds: [buildToolResultEmbed(toolResult, query)],
        ephemeral: true,
      });
      toolCount++;
    }
  }
}

// Handle pagination button clicks
export async function handlePageButton(interaction) {
  const parts     = interaction.customId.split('_');
  const direction = parts[1];
  const page      = parseInt(parts[parts.length - 1]);
  const dbName    = parts[parts.length - 2];
  const resultId  = parts.slice(2, parts.length - 2).join('_');

  const db  = getDB();
  const row = db.prepare('SELECT * FROM temp_results WHERE id = ?').get(resultId);

  if (!row) {
    return interaction.reply({ content: '❌ Session expirée. Relance une recherche.', ephemeral: true });
  }

  let data;
  try { data = JSON.parse(row.results); } catch {
    return interaction.reply({ content: '❌ Données corrompues.', ephemeral: true });
  }

  const { records, query } = data;
  const newPage = direction === 'next' ? page + 1 : page - 1;

  if (newPage < 1 || newPage > records.length) {
    return interaction.reply({ content: '❌ Page invalide.', ephemeral: true });
  }

  const embed  = buildDbResultEmbed(dbName, records[newPage - 1], newPage, records.length, query);
  const pagRow = buildPaginationRow(resultId, dbName, newPage, records.length);
  const exportRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`export_json_${resultId}`).setLabel('Export JSON').setEmoji('📥').setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({
    embeds: [embed],
    components: records.length > 1 ? [pagRow, exportRow] : [exportRow],
  });
}
