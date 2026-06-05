import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getDB } from '../utils/database.js';
import { fetchGitHubRepoInfo, analyzeRepo, generateToolModule } from '../utils/toolAnalyzer.js';
import { clearCache, getCacheStats } from '../utils/toolCache.js';
import { isOwner } from './admin-owner.js';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = join(__dirname, '../../data/tools');
mkdirSync(TOOLS_DIR, { recursive: true });

export const data = new SlashCommandBuilder()
  .setName('tool')
  .setDescription('[OWNER] Gestion des tools externes de recherche')

  .addSubcommand(sub => sub
    .setName('add')
    .setDescription('Ajouter un tool depuis GitHub ou une URL API')
    .addStringOption(o => o.setName('url').setDescription('URL du dépôt GitHub (ex: https://github.com/user/repo)').setRequired(true))
    .addStringOption(o => o.setName('nom').setDescription('Nom personnalisé du tool (optionnel)'))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji du tool (optionnel)'))
  )

  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('Lister tous les tools installés')
  )

  .addSubcommand(sub => sub
    .setName('delete')
    .setDescription('Supprimer un tool')
    .addStringOption(o => o.setName('id').setDescription('ID du tool').setRequired(true))
  )

  .addSubcommand(sub => sub
    .setName('toggle')
    .setDescription('Activer / désactiver un tool')
    .addStringOption(o => o.setName('id').setDescription('ID du tool').setRequired(true))
  )

  .addSubcommand(sub => sub
    .setName('config')
    .setDescription('Configurer la clé API d\'un tool')
    .addStringOption(o => o.setName('id').setDescription('ID du tool').setRequired(true))
    .addStringOption(o => o.setName('key').setDescription('Valeur de la clé API').setRequired(true))
  )

  .addSubcommand(sub => sub
    .setName('link')
    .setDescription('Lier un tool à une option/groupe spécifique (sinon global)')
    .addStringOption(o => o.setName('id').setDescription('ID du tool').setRequired(true))
    .addStringOption(o => o.setName('option').setDescription('Valeur de l\'option ou du groupe').setRequired(true))
  )

  .addSubcommand(sub => sub
    .setName('unlink')
    .setDescription('Délier un tool d\'une option')
    .addStringOption(o => o.setName('id').setDescription('ID du tool').setRequired(true))
    .addStringOption(o => o.setName('option').setDescription('Valeur de l\'option').setRequired(true))
  )

  .addSubcommand(sub => sub
    .setName('test')
    .setDescription('Tester un tool avec une requête')
    .addStringOption(o => o.setName('id').setDescription('ID du tool').setRequired(true))
    .addStringOption(o => o.setName('query').setDescription('Requête de test').setRequired(true))
  )

  .addSubcommand(sub => sub
    .setName('cache')
    .setDescription('Vider le cache des résultats')
    .addStringOption(o => o.setName('id').setDescription('ID du tool (laisser vide = tout vider)'))
  )

  .addSubcommand(sub => sub
    .setName('info')
    .setDescription('Voir les détails d\'un tool')
    .addStringOption(o => o.setName('id').setDescription('ID du tool').setRequired(true))
  );

export async function execute(interaction) {
  if (!isOwner(interaction.user.id)) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🔒 Accès refusé')
        .setDescription('Seuls les **owners du bot** peuvent gérer les tools.')
      ],
      ephemeral: true,
    });
  }

  const sub = interaction.options.getSubcommand();

  // ── ADD ───────────────────────────────────────────────────────────────────
  if (sub === 'add') {
    const url    = interaction.options.getString('url');
    const nom    = interaction.options.getString('nom');
    const emoji  = interaction.options.getString('emoji');

    await interaction.deferReply({ ephemeral: true });

    const statusEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🔄 Analyse du dépôt GitHub…')
      .setDescription(`Récupération de \`${url}\`\n\nCela peut prendre quelques secondes…`)
      .setTimestamp();

    await interaction.editReply({ embeds: [statusEmbed] });

    try {
      // 1. Fetch repo info
      const repoInfo = await fetchGitHubRepoInfo(url);

      // 2. Analyse automatique
      const analysis = analyzeRepo(repoInfo);

      // 3. Générer un ID unique
      const db = getDB();
      const toolId = `${repoInfo.repo.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(36)}`;
      const finalName  = nom  || analysis.suggestedName;
      const finalEmoji = emoji || analysis.suggestedEmoji;

      // 4. Vérifier si déjà installé
      const existing = db.prepare('SELECT id FROM tools WHERE github_url = ?').get(url);
      if (existing) {
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle('⚠️ Tool déjà installé')
            .setDescription(`Ce dépôt est déjà installé sous l\'ID \`${existing.id}\`.\nUtilise \`/tool delete id:${existing.id}\` pour le supprimer d\'abord.`)
          ],
        });
      }

      // 5. Générer le module JS
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('⚙️ Génération du module JS…')
          .setDescription(`Dépôt analysé : **${repoInfo.owner}/${repoInfo.repo}**\nType détecté : \`${analysis.type}\`\nTypes de requêtes : ${analysis.queryTypes.join(', ')}\n\nGénération du code natif…`)
        ],
      });

      const filePath = generateToolModule(toolId, repoInfo, analysis);

      // 6. Sauvegarder en DB
      db.prepare(`
        INSERT INTO tools (id, name, emoji, type, github_url, github_owner, github_repo,
          description, query_types, config_json, scope, enabled, added_by, needs_api_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'global', 1, ?, ?)
      `).run(
        toolId, finalName, finalEmoji, analysis.type, url,
        repoInfo.owner, repoInfo.repo, analysis.description,
        JSON.stringify(analysis.queryTypes),
        JSON.stringify(analysis.config),
        interaction.user.id,
        analysis.needsApiKey ? 1 : 0
      );

      // 7. Embed de confirmation
      const confirmEmbed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(`✅ Tool installé : ${finalEmoji} ${finalName}`)
        .setDescription(`Le tool a été intégré avec succès dans le bot.`)
        .addFields(
          { name: '🆔 ID',           value: `\`${toolId}\``,                    inline: true },
          { name: '⚙️ Type',         value: `\`${analysis.type}\``,             inline: true },
          { name: '🌟 Stars GitHub', value: `\`${repoInfo.stars}\``,            inline: true },
          { name: '🔍 Requêtes',     value: analysis.queryTypes.map(t => `\`${t}\``).join(' '),  inline: false },
          { name: '🔗 Source',       value: url,                                 inline: false },
        )
        .setTimestamp();

      if (analysis.detectedApis.length > 0) {
        confirmEmbed.addFields({ name: '🔌 APIs détectées', value: analysis.detectedApis.join(', '), inline: false });
      }

      if (analysis.needsApiKey) {
        confirmEmbed.addFields({
          name: '🔑 Clé API requise',
          value: `Ce tool nécessite une clé API.\nConfigure-la avec :\n\`/tool config id:${toolId} key:<ta_clé>\`\n\n${analysis.apiKeyHints.length > 0 ? `Nom de variable détecté : \`${analysis.apiKeyHints[0]}\`` : 'Consulte le README du dépôt pour trouver comment obtenir la clé.'}`,
          inline: false,
        });
        confirmEmbed.setColor(0xffa500);
      }

      return interaction.editReply({ embeds: [confirmEmbed] });

    } catch (e) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('❌ Erreur lors de l\'installation')
          .setDescription(`\`\`\`${e.message}\`\`\``)
          .addFields({ name: '💡 Aide', value: 'Vérifie que le dépôt est public et que l\'URL est correcte.\nFormat : `https://github.com/user/repo`' })
        ],
      });
    }
  }

  // ── LIST ──────────────────────────────────────────────────────────────────
  if (sub === 'list') {
    const db    = getDB();
    const tools = db.prepare('SELECT * FROM tools ORDER BY added_at DESC').all();

    if (tools.length === 0) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle('🔧 Aucun tool installé')
          .setDescription('Ajoute un tool avec `/tool add url:https://github.com/user/repo`')
        ],
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🔧 Tools installés (${tools.length})`)
      .setTimestamp();

    for (const t of tools.slice(0, 20)) {
      const types = JSON.parse(t.query_types || '[]').join(', ');
      const links = db.prepare('SELECT option_value FROM tool_option_links WHERE tool_id = ?').all(t.id);
      const linkStr = links.length > 0 ? links.map(l => `\`${l.option_value}\``).join(', ') : '`global`';
      embed.addFields({
        name: `${t.emoji || '🔧'} ${t.name} ${t.enabled ? '🟢' : '🔴'} — \`${t.id}\``,
        value: `**Type:** \`${t.type}\` | **Requêtes:** ${types || 'global'} | **Scope:** ${linkStr}${t.needs_api_key ? '\n⚠️ *Clé API requise*' : ''}`,
        inline: false,
      });
    }

    if (tools.length > 20) embed.setFooter({ text: `+${tools.length - 20} tools supplémentaires` });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (sub === 'delete') {
    const id = interaction.options.getString('id');
    const db = getDB();
    const tool = db.prepare('SELECT * FROM tools WHERE id = ?').get(id);

    if (!tool) return interaction.reply({ content: `❌ Tool \`${id}\` introuvable.`, ephemeral: true });

    db.prepare('DELETE FROM tools WHERE id = ?').run(id);
    db.prepare('DELETE FROM tool_option_links WHERE tool_id = ?').run(id);
    clearCache(id);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🗑️ Tool supprimé')
        .setDescription(`**${tool.emoji} ${tool.name}** (\`${id}\`) a été supprimé.`)
      ],
      ephemeral: true,
    });
  }

  // ── TOGGLE ────────────────────────────────────────────────────────────────
  if (sub === 'toggle') {
    const id = interaction.options.getString('id');
    const db = getDB();
    const tool = db.prepare('SELECT * FROM tools WHERE id = ?').get(id);

    if (!tool) return interaction.reply({ content: `❌ Tool \`${id}\` introuvable.`, ephemeral: true });

    const newState = tool.enabled ? 0 : 1;
    db.prepare('UPDATE tools SET enabled = ? WHERE id = ?').run(newState, id);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(newState ? 0x57f287 : 0xffa500)
        .setTitle(`${newState ? '✅ Tool activé' : '⏸️ Tool désactivé'}`)
        .setDescription(`**${tool.emoji} ${tool.name}** est maintenant **${newState ? 'actif' : 'inactif'}**.`)
      ],
      ephemeral: true,
    });
  }

  // ── CONFIG (API KEY) ──────────────────────────────────────────────────────
  if (sub === 'config') {
    const id  = interaction.options.getString('id');
    const key = interaction.options.getString('key');
    const db  = getDB();
    const tool = db.prepare('SELECT * FROM tools WHERE id = ?').get(id);

    if (!tool) return interaction.reply({ content: `❌ Tool \`${id}\` introuvable.`, ephemeral: true });

    let config = {};
    try { config = JSON.parse(tool.config_json || '{}'); } catch {}

    const configKey = config.api_key_config_key || `tool_${id}_api_key`;
    db.prepare("INSERT OR REPLACE INTO guild_config (key, value) VALUES (?, ?)").run(configKey, key);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🔑 Clé API configurée')
        .setDescription(`La clé API de **${tool.emoji} ${tool.name}** a été enregistrée.\n\nTeste le tool avec \`/tool test id:${id} query:<requête>\``)
      ],
      ephemeral: true,
    });
  }

  // ── LINK ──────────────────────────────────────────────────────────────────
  if (sub === 'link') {
    const id     = interaction.options.getString('id');
    const option = interaction.options.getString('option');
    const db     = getDB();
    const tool   = db.prepare('SELECT * FROM tools WHERE id = ?').get(id);

    if (!tool) return interaction.reply({ content: `❌ Tool \`${id}\` introuvable.`, ephemeral: true });

    db.prepare("INSERT OR IGNORE INTO tool_option_links (tool_id, option_value) VALUES (?, ?)").run(id, option);
    db.prepare("UPDATE tools SET scope = 'linked' WHERE id = ?").run(id);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🔗 Tool lié')
        .setDescription(`**${tool.emoji} ${tool.name}** est maintenant lié à l'option \`${option}\`.\nIl sera utilisé uniquement pour les recherches de ce type.`)
      ],
      ephemeral: true,
    });
  }

  // ── UNLINK ────────────────────────────────────────────────────────────────
  if (sub === 'unlink') {
    const id     = interaction.options.getString('id');
    const option = interaction.options.getString('option');
    const db     = getDB();

    db.prepare("DELETE FROM tool_option_links WHERE tool_id = ? AND option_value = ?").run(id, option);

    const remaining = db.prepare("SELECT COUNT(*) as c FROM tool_option_links WHERE tool_id = ?").get(id);
    if (remaining.c === 0) {
      db.prepare("UPDATE tools SET scope = 'global' WHERE id = ?").run(id);
    }

    return interaction.reply({ content: `✅ Tool \`${id}\` délié de l'option \`${option}\`.`, ephemeral: true });
  }

  // ── TEST ──────────────────────────────────────────────────────────────────
  if (sub === 'test') {
    const id    = interaction.options.getString('id');
    const query = interaction.options.getString('query');
    const db    = getDB();
    const tool  = db.prepare('SELECT * FROM tools WHERE id = ?').get(id);

    if (!tool) return interaction.reply({ content: `❌ Tool \`${id}\` introuvable.`, ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const { executeTool } = await import('../utils/toolEngine.js');
    const { buildToolResultEmbed } = await import('../utils/toolEmbedBuilder.js');

    const start = Date.now();
    const result = await executeTool(tool, query);
    const elapsed = Date.now() - start;

    const embed = buildToolResultEmbed(result, query);
    embed.setFooter({ text: `⏱️ ${elapsed}ms${result.fromCache ? ' (cache)' : ' (live)'}` });

    return interaction.editReply({ embeds: [embed] });
  }

  // ── CACHE ─────────────────────────────────────────────────────────────────
  if (sub === 'cache') {
    const id = interaction.options.getString('id');
    const statsBefore = getCacheStats();
    clearCache(id || undefined);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🧹 Cache vidé')
        .setDescription(id ? `Cache du tool \`${id}\` vidé.` : 'Cache global vidé.')
        .addFields(
          { name: 'Entrées supprimées', value: `\`${statsBefore.active}\``, inline: true },
        )
      ],
      ephemeral: true,
    });
  }

  // ── INFO ──────────────────────────────────────────────────────────────────
  if (sub === 'info') {
    const id   = interaction.options.getString('id');
    const db   = getDB();
    const tool = db.prepare('SELECT * FROM tools WHERE id = ?').get(id);

    if (!tool) return interaction.reply({ content: `❌ Tool \`${id}\` introuvable.`, ephemeral: true });

    const links = db.prepare('SELECT option_value FROM tool_option_links WHERE tool_id = ?').all(id);
    const types = JSON.parse(tool.query_types || '[]');

    const embed = new EmbedBuilder()
      .setColor(tool.enabled ? 0x5865f2 : 0x808080)
      .setTitle(`${tool.emoji} ${tool.name} ${tool.enabled ? '🟢' : '🔴'}`)
      .setDescription(tool.description || '*Aucune description*')
      .addFields(
        { name: '🆔 ID',       value: `\`${tool.id}\``,          inline: true },
        { name: '⚙️ Type',     value: `\`${tool.type}\``,        inline: true },
        { name: '🌐 Scope',    value: `\`${tool.scope}\``,       inline: true },
        { name: '🔍 Requêtes', value: types.map(t => `\`${t}\``).join(' ') || '`global`', inline: false },
        { name: '🔗 Lié à',   value: links.length > 0 ? links.map(l => `\`${l.option_value}\``).join(', ') : '*(aucun filtre — toutes les recherches)*', inline: false },
        {
          name: '🔓 Non lié à',
          value: (() => {
            const ALL_OPTIONS = ['global','email','phone','name','username','discord_id','ip','address','iban','password','intelx','nazapi','login','ulp_password','url'];
            const linkedSet = new Set(links.map(l => l.option_value));
            const unlinked  = ALL_OPTIONS.filter(o => !linkedSet.has(o));
            return links.length === 0 ? '*Ce tool répond à toutes les options*' : (unlinked.length > 0 ? unlinked.map(o => `\`${o}\``).join(', ') : '*Aucune — lié à tout*');
          })(),
          inline: false
        },
        { name: '📅 Ajouté',  value: tool.added_at || 'Inconnu', inline: true },
      )
      .setTimestamp();

    if (tool.github_url) {
      embed.addFields({ name: '🔗 GitHub', value: tool.github_url, inline: false });
    }
    if (tool.needs_api_key) {
      let config = {};
      try { config = JSON.parse(tool.config_json || '{}'); } catch {}
      const ck = config.api_key_config_key || `tool_${id}_api_key`;
      const keyRow = db.prepare('SELECT value FROM guild_config WHERE key = ?').get(ck);
      embed.addFields({
        name: '🔑 Clé API',
        value: keyRow ? '✅ Configurée' : '❌ Non configurée — `/tool config id:' + id + ' key:<clé>`',
        inline: false,
      });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
