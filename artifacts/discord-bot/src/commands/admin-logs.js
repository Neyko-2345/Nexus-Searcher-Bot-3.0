import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/adminCheck.js';
import { getDB } from '../utils/database.js';

export const data = new SlashCommandBuilder()
  .setName('logs')
  .setDescription('[ADMIN] Configurer et consulter les logs de recherche')

  .addSubcommand(sub => sub
    .setName('setup')
    .setDescription('Activer les logs dans un salon')
    .addChannelOption(opt => opt.setName('salon').setDescription('Salon où envoyer les logs').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('disable')
    .setDescription('Désactiver les logs')
  )
  .addSubcommand(sub => sub
    .setName('status')
    .setDescription('Voir l\'état actuel des logs')
  )
  .addSubcommand(sub => sub
    .setName('history')
    .setDescription('Voir les dernières recherches effectuées')
    .addIntegerOption(opt => opt.setName('nombre').setDescription('Nombre à afficher (max 20)').setMinValue(1).setMaxValue(20))
    .addUserOption(opt => opt.setName('utilisateur').setDescription('Filtrer par utilisateur'))
  )
  .addSubcommand(sub => sub
    .setName('search')
    .setDescription('Rechercher dans les logs avec des filtres')
    .addStringOption(opt => opt.setName('mot_cle').setDescription('Mot-clé à chercher dans la requête (ex: gmail.com)'))
    .addUserOption(opt => opt.setName('utilisateur').setDescription('Filtrer par utilisateur'))
    .addStringOption(opt => opt
      .setName('option')
      .setDescription('Filtrer par type de recherche')
      .addChoices(
        { name: '🔍 Global',      value: 'global' },
        { name: '📧 Email',        value: 'email' },
        { name: '📞 Téléphone',    value: 'phone' },
        { name: '👤 Nom/Prénom',   value: 'name' },
        { name: '🎮 Username',     value: 'username' },
        { name: '🆔 Discord ID',   value: 'discord_id' },
        { name: '🌐 Adresse IP',   value: 'ip' },
        { name: '🏠 Adresse',      value: 'address' },
        { name: '🏦 IBAN',         value: 'iban' },
        { name: '🔑 Mot de passe', value: 'password' },
        { name: '🔓 Intel_X',      value: 'intelx' },
        { name: '🔍 Nazapi',       value: 'nazapi' },
      )
    )
    .addStringOption(opt => opt.setName('depuis').setDescription('Date de début (format YYYY-MM-DD, ex: 2025-01-01)'))
    .addStringOption(opt => opt.setName('jusqua').setDescription('Date de fin (format YYYY-MM-DD, ex: 2025-12-31)'))
    .addIntegerOption(opt => opt.setName('limite').setDescription('Nombre max de résultats (défaut: 10, max: 25)').setMinValue(1).setMaxValue(25))
  )
  .addSubcommand(sub => sub
    .setName('clear')
    .setDescription('Supprimer tous les logs de recherche enregistrés')
  );

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
  }

  const db  = getDB();
  const sub = interaction.options.getSubcommand();

  // ── SETUP ─────────────────────────────────────────────────────────────────────
  if (sub === 'setup') {
    const channel = interaction.options.getChannel('salon');
    if (!channel.isTextBased()) {
      return interaction.reply({ content: '❌ Ce salon n\'est pas un salon textuel.', ephemeral: true });
    }
    db.prepare("INSERT OR REPLACE INTO guild_config (key, value) VALUES ('log_channel_id', ?)").run(channel.id);
    db.prepare("INSERT OR REPLACE INTO guild_config (key, value) VALUES ('logs_enabled', '1')").run();

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ Logs activés')
        .setDescription(`Les logs de recherche seront envoyés dans <#${channel.id}>`)
        .addFields({ name: '📋 Infos loggées', value: '- 👤 Utilisateur\n- 🔍 Requête\n- 📁 Option\n- 📊 Résultats\n- 📍 Salon\n- 🕐 Heure' })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── DISABLE ───────────────────────────────────────────────────────────────────
  if (sub === 'disable') {
    db.prepare("INSERT OR REPLACE INTO guild_config (key, value) VALUES ('logs_enabled', '0')").run();
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xed4245).setTitle('🔕 Logs désactivés')
        .setDescription('Les logs de recherche ont été désactivés.')
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── STATUS ────────────────────────────────────────────────────────────────────
  if (sub === 'status') {
    const enabledRow = db.prepare("SELECT value FROM guild_config WHERE key = 'logs_enabled'").get();
    const channelRow = db.prepare("SELECT value FROM guild_config WHERE key = 'log_channel_id'").get();
    const totalLogs  = db.prepare('SELECT COUNT(*) as cnt FROM search_logs').get();
    const enabled    = enabledRow?.value === '1';

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(enabled ? 0x57f287 : 0xed4245).setTitle('📋 État des logs')
        .addFields(
          { name: 'Statut',           value: enabled ? '🟢 Activé' : '🔴 Désactivé', inline: true },
          { name: 'Salon',            value: channelRow ? `<#${channelRow.value}>` : '*Non configuré*', inline: true },
          { name: 'Total recherches', value: `\`${totalLogs?.cnt ?? 0}\``, inline: true }
        )
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── HISTORY ───────────────────────────────────────────────────────────────────
  if (sub === 'history') {
    const limit      = interaction.options.getInteger('nombre') || 10;
    const userFilter = interaction.options.getUser('utilisateur');

    let rows;
    if (userFilter) {
      rows = db.prepare('SELECT * FROM search_logs WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userFilter.id, limit);
    } else {
      rows = db.prepare('SELECT * FROM search_logs ORDER BY id DESC LIMIT ?').all(limit);
    }

    if (rows.length === 0) {
      return interaction.reply({ content: '📭 Aucune recherche enregistrée.', ephemeral: true });
    }

    const lines = rows.map((r, i) =>
      `\`${i + 1}.\` **${r.user_tag || r.user_id}** — \`${r.search_type}\` — \`${r.query}\` — ${r.result_count ?? '?'} rés. — <t:${Math.floor(new Date(r.timestamp).getTime() / 1000)}:R>`
    );

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2).setTitle(`📋 Historique des recherches (${rows.length})`)
        .setDescription(lines.join('\n').substring(0, 4000))
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── SEARCH ────────────────────────────────────────────────────────────────────
  if (sub === 'search') {
    const motCle     = interaction.options.getString('mot_cle');
    const userFilter = interaction.options.getUser('utilisateur');
    const option     = interaction.options.getString('option');
    const depuis     = interaction.options.getString('depuis');
    const jusqua     = interaction.options.getString('jusqua');
    const limite     = interaction.options.getInteger('limite') || 10;

    // Build dynamic query
    const conditions = [];
    const params     = [];

    if (motCle) {
      conditions.push("query LIKE ?");
      params.push(`%${motCle}%`);
    }
    if (userFilter) {
      conditions.push("user_id = ?");
      params.push(userFilter.id);
    }
    if (option) {
      conditions.push("search_type LIKE ?");
      params.push(`%${option}%`);
    }
    if (depuis) {
      conditions.push("timestamp >= ?");
      params.push(`${depuis} 00:00:00`);
    }
    if (jusqua) {
      conditions.push("timestamp <= ?");
      params.push(`${jusqua} 23:59:59`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limite);

    const rows = db.prepare(`SELECT * FROM search_logs ${where} ORDER BY id DESC LIMIT ?`).all(...params);

    if (rows.length === 0) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xffa500).setTitle('🔍 Recherche dans les logs — 0 résultat')
          .setDescription('Aucun log ne correspond à tes critères.')
          .addFields(
            motCle     ? { name: 'Mot-clé',     value: motCle,          inline: true } : null,
            userFilter ? { name: 'Utilisateur',  value: userFilter.tag,  inline: true } : null,
            option     ? { name: 'Option',       value: option,          inline: true } : null,
            depuis     ? { name: 'Depuis',       value: depuis,          inline: true } : null,
            jusqua     ? { name: 'Jusqu\'à',     value: jusqua,          inline: true } : null,
          ).filter(Boolean)
          .setTimestamp()
        ],
        ephemeral: true
      });
    }

    const lines = rows.map((r, i) =>
      `\`${i + 1}.\` **${r.user_tag || r.user_id}** — \`${r.search_type}\` — \`${r.query}\` — ${r.result_count ?? '?'} rés. — <t:${Math.floor(new Date(r.timestamp).getTime() / 1000)}:f>`
    );

    const filterDesc = [
      motCle     ? `🔎 Mot-clé : \`${motCle}\`` : null,
      userFilter ? `👤 Utilisateur : ${userFilter}` : null,
      option     ? `📁 Option : \`${option}\`` : null,
      depuis     ? `📅 Depuis : \`${depuis}\`` : null,
      jusqua     ? `📅 Jusqu'à : \`${jusqua}\`` : null,
    ].filter(Boolean).join('\n');

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🔍 Résultats de recherche dans les logs (${rows.length})`)
        .setDescription((filterDesc ? `**Filtres appliqués :**\n${filterDesc}\n\n` : '') + lines.join('\n').substring(0, 3500))
        .setFooter({ text: `${rows.length} résultat(s) — /logs search pour affiner` })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── CLEAR ─────────────────────────────────────────────────────────────────────
  if (sub === 'clear') {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM search_logs').get().cnt;
    db.prepare('DELETE FROM search_logs').run();
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xed4245).setTitle('🗑️ Logs supprimés')
        .setDescription(`**${count}** entrée(s) de logs ont été supprimées.`)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }
}
