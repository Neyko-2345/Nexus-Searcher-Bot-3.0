import { handleSearchSelect } from '../handlers/searchHandler.js';
import { handleSearchModal } from '../handlers/modalHandler.js';
import { handleExportButton } from '../handlers/exportHandler.js';
import { handlePageButton } from '../handlers/globalSearchHandler.js';
import { buildGuideEmbed, buildGuideRow, GUIDE_PAGES } from '../commands/admin-guide.js';
import { buildUserHistoryPage } from '../commands/admin-logs.js';
import {
  ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';
import { isVipOrAdmin, getCreditsInfo, getOrCreateUser } from '../utils/credits.js';
import { buildSelectOptions, DEFAULT_OPTIONS, VIP_OPTIONS, getGlobalEmoji, parseEmoji as parseEmojiCfg } from '../utils/optionsConfig.js';
import { getDB } from '../utils/database.js';

function getAccessConfig(db) {
  const row = db.prepare("SELECT value FROM guild_config WHERE key = 'access_config'").get();
  if (!row) return {};
  try { return JSON.parse(row.value); } catch { return {}; }
}

function getStatusConfig(db) {
  const row = db.prepare("SELECT value FROM guild_config WHERE key = 'status_watch_config'").get();
  if (!row) return null;
  try {
    const cfg = JSON.parse(row.value);
    return cfg?.enabled === true ? cfg : null;
  } catch { return null; }
}

const DEFAULT_VIP_SET = new Set(['intelx', 'nazapi']);

function isOptionVip(value, accessConfig) {
  if (value in accessConfig) return accessConfig[value] === 'vip';
  return DEFAULT_VIP_SET.has(value);
}

function parseEmoji(str) {
  if (!str) return undefined;
  const m = str.match(/^<a?:(\w+):(\d+)>$/);
  if (m) return { id: m[2], name: m[1], animated: str.startsWith('<a:') };
  return { name: str };
}

function isPanelLocked(db, guildId) {
  const row = db.prepare('SELECT locked FROM panel_locks WHERE guild_id = ?').get(guildId);
  return row?.locked === 1;
}

function getButtonConfig(db) {
  const rows = db.prepare('SELECT key, value FROM search_embed_buttons').all();
  const cfg = {};
  for (const r of rows) {
    try { cfg[r.key] = JSON.parse(r.value); } catch { cfg[r.key] = r.value; }
  }
  return cfg;
}

function buildMainOptions(db, vip, accessConfig) {
  const options = [];

  const globalEmoji = getGlobalEmoji();
  const globalOpt = { label: 'Global', value: 'global' };
  if (globalEmoji) globalOpt.emoji = globalEmoji;
  options.push(globalOpt);

  const groups = db.prepare('SELECT * FROM option_groups ORDER BY position ASC').all();
  for (const g of groups) {
    if (!vip && g.vip_only) continue;
    const opt = { label: g.label, value: `grp_${g.value}` };
    if (g.emoji) opt.emoji = parseEmoji(g.emoji);
    options.push(opt);
    if (options.length >= 25) break;
  }

  const allFixed = buildSelectOptions(true);
  for (const o of allFixed) {
    if (!vip && isOptionVip(o.value, accessConfig)) continue;
    const noDesc = { label: o.label, value: o.value };
    if (o.emoji) noDesc.emoji = o.emoji;
    options.push(noDesc);
    if (options.length >= 25) break;
  }

  const customOpts = db.prepare('SELECT * FROM custom_options ORDER BY position ASC, id ASC').all();
  for (const o of customOpts) {
    if (!vip && o.vip_only) continue;
    const opt = { label: o.label, value: `custom_${o.value}` };
    if (o.emoji) {
      const m = o.emoji.match(/^<a?:(\w+):(\d+)>$/);
      opt.emoji = m ? { id: m[2], name: m[1], animated: o.emoji.startsWith('<a:') } : { name: o.emoji };
    }
    options.push(opt);
    if (options.length >= 25) break;
  }

  return options.slice(0, 25);
}

async function showSearchModal(interaction, targetValue) {
  const isDb     = targetValue.startsWith('db_');
  const isGlobal = targetValue === 'global';
  const dbName   = isDb ? targetValue.replace('db_', '') : null;

  let title, label, placeholder;
  if (isGlobal) {
    title       = '🔍 Recherche Globale';
    label       = 'Mot-clé (email, nom, IP, téléphone…)';
    placeholder = 'ex: jean.dupont@gmail.com';
  } else if (isDb) {
    title       = `🔍 ${dbName.toUpperCase()}`;
    label       = `Rechercher dans ${dbName}`;
    placeholder = 'Entrez votre recherche…';
  } else {
    const BUILTIN_LABELS = {
      email: 'Email', phone: 'Téléphone', name: 'Nom / Prénom',
      username: 'Username', discord_id: 'Discord ID', ip: 'Adresse IP',
      city: 'Ville', postal: 'Code Postal', address: 'Adresse',
      iban: 'IBAN', password: 'Mot de passe', intelx: 'Intel_X', nazapi: 'Nazapi',
      login: 'L0gin / Email', ulp_password: 'Passw0rd', url: 'URL'
    };
    const db = getDB();
    let labelStr = BUILTIN_LABELS[targetValue];
    if (!labelStr && targetValue.startsWith('custom_')) {
      const opt = db.prepare('SELECT label FROM custom_options WHERE value = ?').get(targetValue.replace('custom_', ''));
      labelStr = opt?.label || targetValue;
    }
    title       = `🔍 ${labelStr || targetValue}`;
    label       = labelStr || targetValue;
    placeholder = 'Entrez votre recherche…';
  }

  const modal = new ModalBuilder()
    .setCustomId(`search_modal_${targetValue}`)
    .setTitle(title.substring(0, 45));

  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('search_query')
      .setLabel(label.substring(0, 45))
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(placeholder)
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(300)
  ));

  return interaction.showModal(modal);
}

// Build user profile embed (ephemeral)
function buildProfileEmbed(db, member, user) {
  const userId = member.id;
  getOrCreateUser(userId, member.user.username);
  const info = getCreditsInfo(userId);

  // Count searches
  const searchCount = db.prepare('SELECT COUNT(*) as cnt FROM search_logs WHERE user_id = ?').get(userId)?.cnt ?? 0;

  // Get plan name from roles
  const plans = db.prepare('SELECT * FROM plans').all();
  let planName = info.plan || 'free';
  for (const p of plans) {
    if (member.roles.cache.has(p.role_id)) { planName = p.plan_name; break; }
  }

  const btnCfg = getButtonConfig(db);
  const profileEmbedCfg = btnCfg.profile_embed || {};

  // Next reset
  let nextReset = 'Inconnue';
  if (!info.unlimited) nextReset = info.nextReset || 'Inconnue';

  const vars = {
    '{user}':        member.user.username,
    '{plan}':        planName,
    '{credits}':     info.unlimited ? '♾️' : String(info.credits),
    '{max_credits}': info.unlimited ? '♾️' : String(info.maxDaily || 5),
    '{next_reset}':  info.unlimited ? '—' : nextReset,
    '{searches}':    String(searchCount),
    '{unlimited}':   info.unlimited ? '♾️' : '',
  };

  function applyVars(str) {
    if (!str) return str;
    return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(k, v), str);
  }

  const defaultTitle = `👤 Profil — ${member.user.username}`;
  const defaultDesc  = [
    `**Plan actuel :** \`${planName}\``,
    `**Crédits restants :** ${info.unlimited ? '♾️' : `\`${info.credits}\``}`,
    `**Max / jour :** ${info.unlimited ? '♾️' : `\`${info.maxDaily || 5}\``}`,
    `**Prochain rechargement :** ${info.unlimited ? '—' : nextReset}`,
    `**Recherches effectuées :** \`${searchCount}\``,
    '',
    `> Pour changer ton plan, obtenir un accès illimité et d'autres fonctions, ouvre un ticket sur le serveur pour contacter un owner.`,
  ].join('\n');
  const contactMsg = applyVars(profileEmbedCfg.contact_message) || '';

  const color = profileEmbedCfg.color ? parseInt(profileEmbedCfg.color.replace('#', ''), 16) : 0x5865f2;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(applyVars(profileEmbedCfg.title) || defaultTitle)
    .setDescription(applyVars(profileEmbedCfg.description) || defaultDesc)
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  if (profileEmbedCfg.footer) embed.setFooter({ text: applyVars(profileEmbedCfg.footer) });
  else embed.setFooter({ text: 'NΞXUS™ S€archer' });

  return { embed, contactMsg };
}

// Build user guide embed (ephemeral)
function buildUserGuideEmbed(db) {
  const btnCfg = getButtonConfig(db);
  const guideCfg = btnCfg.guide_embed || {};

  const color = guideCfg.color ? parseInt(guideCfg.color.replace('#', ''), 16) : 0x3B3B44;

  const defaultDesc = [ 
    '**Avant tout consulte les salons suivant :**',
    '<#1513135361625292881>',
    '<#1510277638415978496>',
    '',
    '**Comment utiliser NΞXUS™ S€archer ?**',
    '',
    '**1. Cliquer sur** <:rechercher:1511875326655856660> **Rechercher**',
    '> Un menu apparaît avec toutes les options de recherche disponibles.',
    '',
    '**2. Choisir un type de recherche**',
    '> Email, Téléphone, Nom, Username, IP, et bien plus selon ton accès.',
    '',
    '**3. Entrer ta recherche**',
    '> Une boîte de saisie s\'ouvre. Entre ta requête et valide.',
    '',
    '**4. Consulter les résultats**',
    '> Les résultats s\'affichent en privé (éphémère — seul toi les vois).',
    '> Tu peux naviguer entre les résultats et exporter en JSON.',
    '',
    '> 🔒 Tous les résultats sont **privés**. Personne d\'autre ne les voit.',
    '> 💳 Chaque recherche consomme un crédit selon ton plan.',
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(guideCfg.title || '📖 Guide — NΞXUS™ S€archer')
    .setDescription(guideCfg.description || defaultDesc)
    .setTimestamp();

  if (guideCfg.footer) embed.setFooter({ text: guideCfg.footer });
  else embed.setFooter({ text: 'NΞXUS™ S€archer' });

  return embed;
}

export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction, client) {

  // ── SLASH COMMANDS ──────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction, client);
    } catch (err) {
      console.error(`[CMD ERROR] ${interaction.commandName}:`, err);
      const msg = { content: '❌ Une erreur est survenue.', ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
      else await interaction.reply(msg);
    }
    return;
  }

  // ── BUTTONS ─────────────────────────────────────────────────────────────────
  if (interaction.isButton()) {
    // Wrap all button handling to prevent crashes on expired interactions
    try {

    // Bouton profil utilisateur
    if (interaction.customId === 'user_profile') {
      const db = getDB();
      const { embed, contactMsg } = buildProfileEmbed(db, interaction.member, interaction.user);
      return interaction.reply({ embeds: [embed], content: contactMsg || undefined, ephemeral: true });
    }

    // Bouton guide utilisateur
    if (interaction.customId === 'user_guide') {
      const db = getDB();
      const embed = buildUserGuideEmbed(db);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Launch search button → check lock first, then show main select menu
    if (interaction.customId === 'launch_search') {
      const db = getDB();

      if (isPanelLocked(db, interaction.guildId)) {
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('🔒 Panel verrouillé')
            .setDescription('Le panel de recherche est actuellement verrouillé par un owner du bot.')
          ],
          ephemeral: true
        });
      }

      // Status gating — if statut system active and user doesn't have the role
      const statusCfg = getStatusConfig(db);
      if (statusCfg && !interaction.member.roles.cache.has(statusCfg.role_id)) {
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('🔒 Accès refusé')
            .setDescription(
              `Tu n'as pas accès aux recherches.\n\n` +
              `**Pour obtenir l'accès :**\n` +
              `> Ajoute **\`${statusCfg.text}\`** dans ton **statut personnalisé Discord**.\n\n` +
              `Le rôle te sera attribué automatiquement une fois le statut détecté.`
            )
            .setFooter({ text: 'Discord → Ton profil → Paramètres → Statut personnalisé' })
          ],
          ephemeral: true
        });
      }

      const vip          = isVipOrAdmin(interaction.member);
      const accessConfig = getAccessConfig(db);
      const allOptions   = buildMainOptions(db, vip, accessConfig);

      const select = new StringSelectMenuBuilder()
        .setCustomId('search_type_select')
        .setPlaceholder('Choisissez un service…')
        .addOptions(allOptions);

      const embed = new EmbedBuilder()
        .setColor(0x3B3B44)
        .setDescription(
          `# NΞXUS™ - S€archer\n` +
          `<:whitearrow:1510580999614894172> **${allOptions.length}** services disponibles\n` +
          `<:whitearrow:1510580999614894172> Multi-critères\n` +
          `<:whitearrow:1510580999614894172> Export JSON`
        );

      return interaction.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true
      });
    }

    // Pagination buttons
    if (interaction.customId.startsWith('pg_prev_') || interaction.customId.startsWith('pg_next_')) {
      return handlePageButton(interaction);
    }

    if (interaction.customId.startsWith('pg_info_')) {
      return interaction.reply({ content: 'ℹ️ Bouton de navigation.', ephemeral: true });
    }

    // Guide navigation buttons
    if (interaction.customId.startsWith('guide_prev_') || interaction.customId.startsWith('guide_next_')) {
      const parts   = interaction.customId.split('_');
      const dir     = parts[1];
      const current = parseInt(parts[2], 10);
      const newPage = dir === 'next' ? current + 1 : current - 1;
      if (newPage < 0 || newPage >= GUIDE_PAGES.length) {
        return interaction.reply({ content: 'ℹ️ Pas d\'autre page.', ephemeral: true });
      }
      return interaction.update({ embeds: [buildGuideEmbed(newPage)], components: [buildGuideRow(newPage)] });
    }

    if (interaction.customId.startsWith('guide_page_')) {
      return interaction.deferUpdate();
    }

    // User history pagination buttons
    if (interaction.customId.startsWith('uhist_')) {
      const parts = interaction.customId.split('_');
      const dir   = parts[1];
      if (dir === 'info') return interaction.deferUpdate();

      const targetUserId = parts[2];
      const currentPage  = parseInt(parts[3], 10);
      const newPage      = dir === 'next' ? currentPage + 1 : currentPage - 1;

      const db    = getDB();
      const total = db.prepare('SELECT COUNT(*) as cnt FROM search_logs WHERE user_id = ?').get(targetUserId)?.cnt ?? 0;
      if (newPage < 1 || newPage > total) return interaction.deferUpdate();

      const usernameRow = db.prepare('SELECT user_tag FROM search_logs WHERE user_id = ? LIMIT 1').get(targetUserId);
      const username    = usernameRow?.user_tag || targetUserId;

      const { embed, btnRow } = buildUserHistoryPage(db, targetUserId, username, newPage, total);
      return interaction.update({ embeds: [embed], components: [btnRow] });
    }

    // Export buttons
    if (interaction.customId.startsWith('export_')) {
      return handleExportButton(interaction);
    }

    return;
    } catch (err) {
      const code = err?.code;
      // 10062 = interaction expirée, pas une vraie erreur
      if (code !== 10062) console.error('[BUTTON ERROR]', err?.message || err);
    }
  }

  // ── SELECT MENUS ─────────────────────────────────────────────────────────────
  if (interaction.isStringSelectMenu()) {

    if (interaction.customId === 'search_type_select') {
      const db = getDB();

      // Check lock
      if (isPanelLocked(db, interaction.guildId)) {
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('🔒 Panel verrouillé')
            .setDescription('Le panel de recherche est actuellement verrouillé par un owner du bot.')
          ],
          ephemeral: true
        });
      }

      const selected = interaction.values[0];

      if (selected.startsWith('grp_')) {
        const groupValue = selected.replace('grp_', '');
        const vip        = isVipOrAdmin(interaction.member);
        const grp        = db.prepare('SELECT * FROM option_groups WHERE value = ?').get(groupValue);

        if (!grp) return interaction.reply({ content: '❌ Groupe introuvable.', ephemeral: true });

        const items = db.prepare('SELECT * FROM option_group_items WHERE group_value = ? ORDER BY position ASC').all(groupValue);

        if (items.length === 0) {
          return interaction.reply({ content: `❌ Le groupe **${grp.label}** ne contient aucun élément.`, ephemeral: true });
        }

        const subGlobalEmoji = getGlobalEmoji();
        const subGlobalOpt = { label: 'Global', value: `subgrp_global__${groupValue}` };
        if (subGlobalEmoji) subGlobalOpt.emoji = subGlobalEmoji;

        const subOptions = [subGlobalOpt, ...items.map(i => {
          const opt = { label: i.label, value: `subgrp_${i.target_value}` };
          if (i.emoji) opt.emoji = parseEmoji(i.emoji);
          return opt;
        })].slice(0, 25);

        const subSelect = new StringSelectMenuBuilder()
          .setCustomId('subgroup_select')
          .setPlaceholder(`Choisir dans ${grp.label}…`)
          .addOptions(subOptions);

        const grpEmbed = db.prepare('SELECT * FROM group_embed_config WHERE group_value = ?').get(groupValue);
        const grpColor = grpEmbed?.color ? parseInt(grpEmbed.color.replace('#', ''), 16) : 0x3B3B44;
        let grpTitle   = grpEmbed?.title || null;
        let grpDesc    = grpEmbed?.description || `${grp.emoji} **${grp.label}**\n${grp.description || 'Choisissez une option ci-dessous.'}`;
        if (grpEmbed?.description) {
          grpDesc = grpEmbed.description.replace('{groupe}', grp.label).replace('{emoji}', grp.emoji);
        }

        const embed = new EmbedBuilder().setColor(grpColor).setDescription(grpDesc);
        if (grpTitle) embed.setTitle(grpTitle);
        if (grpEmbed?.thumbnail) embed.setThumbnail(grpEmbed.thumbnail);
        if (grpEmbed?.image) embed.setImage(grpEmbed.image);
        else {
          // Default images for specific groups
          const { GROUP_DEFAULT_IMAGES } = await import('../utils/groupEmbedImages.js');
          if (GROUP_DEFAULT_IMAGES[groupValue]) embed.setImage(GROUP_DEFAULT_IMAGES[groupValue]);
        }

        return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(subSelect)], ephemeral: true });
      }

      if (selected === 'global' || selected.startsWith('db_')) {
        return showSearchModal(interaction, selected);
      }

      return handleSearchSelect(interaction);
    }

    if (interaction.customId === 'subgroup_select') {
      const db = getDB();

      if (isPanelLocked(db, interaction.guildId)) {
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('🔒 Panel verrouillé')
            .setDescription('Le panel de recherche est actuellement verrouillé par un owner du bot.')
          ],
          ephemeral: true
        });
      }

      const selected    = interaction.values[0];
      const targetValue = selected.replace('subgrp_', '');

      if (targetValue.startsWith('global__')) {
        const groupValue = targetValue.replace('global__', '');
        return showSearchModal(interaction, `group_global__${groupValue}`);
      }

      return showSearchModal(interaction, targetValue);
    }

    return;
  }

  // ── MODALS ─────────────────────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('search_modal_')) {
      return handleSearchModal(interaction);
    }
    return;
  }
}
