import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/adminCheck.js';
import { getDB, DATA_DIR } from '../utils/database.js';
import { loadPlugin, reloadPlugin, getLoadedPlugins } from '../utils/pluginLoader.js';
import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

const PLUGIN_DIR = join(DATA_DIR, 'plugins');

async function downloadFile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const ALL_OPTIONS = [
  { name: '🌍 Global (toutes options)', value: 'global' },
  { name: '📧 Email', value: 'email' },
  { name: '📞 Téléphone', value: 'phone' },
  { name: '👤 Nom / Prénom', value: 'name' },
  { name: '🎮 Username', value: 'username' },
  { name: '🆔 Discord ID', value: 'discord_id' },
  { name: '🌐 Adresse IP', value: 'ip' },
  { name: '🏠 Adresse', value: 'address' },
  { name: '🏦 IBAN', value: 'iban' },
  { name: '🔑 Mot de passe', value: 'password' },
];

export const data = new SlashCommandBuilder()
  .setName('plugin')
  .setDescription('[ADMIN] Gérer les plugins/API externes de recherche')

  .addSubcommand(sub => sub
    .setName('add')
    .setDescription('Ajouter un plugin de recherche (fichier .js)')
    .addStringOption(opt => opt.setName('nom').setDescription('Nom unique du plugin').setRequired(true))
    .addAttachmentOption(opt => opt.setName('fichier').setDescription('Fichier .js du plugin').setRequired(true))
    .addStringOption(opt => opt
      .setName('option')
      .setDescription('Option de recherche associée')
      .setRequired(true)
      .addChoices(...ALL_OPTIONS)
    )
    .addStringOption(opt => opt.setName('description').setDescription('Description du plugin'))
    .addBooleanOption(opt => opt.setName('vip').setDescription('Restreindre aux VIP'))
  )

  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('Lister tous les plugins installés')
  )

  .addSubcommand(sub => sub
    .setName('remove')
    .setDescription('Supprimer un plugin')
    .addStringOption(opt => opt.setName('nom').setDescription('Nom du plugin').setRequired(true))
  )

  .addSubcommand(sub => sub
    .setName('reload')
    .setDescription('Recharger un plugin sans redémarrer le bot')
    .addStringOption(opt => opt.setName('nom').setDescription('Nom du plugin').setRequired(true))
  )

  .addSubcommand(sub => sub
    .setName('help')
    .setDescription('Voir le format attendu pour un fichier plugin')
  );

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
  }

  const db  = getDB();
  const sub = interaction.options.getSubcommand();

  // ── ADD ──────────────────────────────────────────────────────────────────
  if (sub === 'add') {
    await interaction.deferReply({ ephemeral: true });
    const nom         = interaction.options.getString('nom');
    const attachment  = interaction.options.getAttachment('fichier');
    const option      = interaction.options.getString('option');
    const description = interaction.options.getString('description') || '';
    const vipOnly     = interaction.options.getBoolean('vip') ? 1 : 0;

    if (!attachment.name.endsWith('.js') && !attachment.name.endsWith('.mjs')) {
      return interaction.editReply({ content: '❌ Le plugin doit être un fichier `.js` ou `.mjs`.' });
    }

    const existing = db.prepare('SELECT id FROM plugins WHERE name = ?').get(nom);
    if (existing) {
      return interaction.editReply({ content: `❌ Un plugin nommé \`${nom}\` existe déjà. Utilise /plugin reload.` });
    }

    let buffer;
    try {
      buffer = await downloadFile(attachment.url);
    } catch (e) {
      return interaction.editReply({ content: `❌ Téléchargement échoué: ${e.message}` });
    }

    const filename = `${nom.replace(/[^a-z0-9_]/gi, '_')}_${Date.now()}.mjs`;
    const filePath = join(PLUGIN_DIR, filename);
    writeFileSync(filePath, buffer);

    db.prepare(`
      INSERT INTO plugins (name, filename, option_value, vip_only, description, added_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(nom, filename, option, vipOnly, description, interaction.user.id);

    const record = db.prepare('SELECT * FROM plugins WHERE name = ?').get(nom);
    const loaded = await loadPlugin(record);

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(loaded ? 0x57f287 : 0xffa500)
        .setTitle(loaded ? '✅ Plugin installé et chargé' : '⚠️ Plugin installé (erreur au chargement)')
        .addFields(
          { name: 'Nom',     value: `\`${nom}\``, inline: true },
          { name: 'Option',  value: `\`${option}\``, inline: true },
          { name: 'Accès',   value: vipOnly ? '🔒 VIP' : '🌍 Libre', inline: true },
          { name: 'Fichier', value: `\`${filename}\``, inline: false }
        )
        .setDescription(loaded
          ? 'Le plugin répond aux recherches immédiatement.'
          : '⚠️ Le plugin n\'a pas pu être chargé. Vérifie les logs du bot.')
        .setTimestamp()
      ]
    });
  }

  // ── LIST ─────────────────────────────────────────────────────────────────
  if (sub === 'list') {
    const rows = db.prepare('SELECT * FROM plugins ORDER BY id ASC').all();
    if (rows.length === 0) {
      return interaction.reply({ content: '📭 Aucun plugin installé.', ephemeral: true });
    }
    const loaded = new Set(getLoadedPlugins().map(p => p.record.name));
    const fields = rows.map(r => ({
      name: `${loaded.has(r.name) ? '🟢' : '🔴'} ${r.name}`,
      value: [
        `Option: \`${r.option_value}\``,
        r.vip_only ? '🔒 VIP' : '🌍 Libre',
        r.description ? `*${r.description}*` : ''
      ].filter(Boolean).join(' • '),
      inline: false
    }));
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🔌 Plugins installés (${rows.length})`)
        .addFields(fields)
        .setFooter({ text: '🟢 = chargé | 🔴 = non chargé' })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── REMOVE ────────────────────────────────────────────────────────────────
  if (sub === 'remove') {
    const nom = interaction.options.getString('nom');
    const row = db.prepare('SELECT * FROM plugins WHERE name = ?').get(nom);
    if (!row) return interaction.reply({ content: `❌ Plugin \`${nom}\` introuvable.`, ephemeral: true });

    const filePath = join(PLUGIN_DIR, row.filename);
    if (existsSync(filePath)) { try { unlinkSync(filePath); } catch {} }
    db.prepare('DELETE FROM plugins WHERE name = ?').run(nom);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🗑️ Plugin supprimé')
        .setDescription(`Le plugin \`${nom}\` a été supprimé.`)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── RELOAD ────────────────────────────────────────────────────────────────
  if (sub === 'reload') {
    const nom    = interaction.options.getString('nom');
    await interaction.deferReply({ ephemeral: true });
    const success = await reloadPlugin(nom);
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(success ? 0x57f287 : 0xed4245)
        .setTitle(success ? '✅ Plugin rechargé' : '❌ Échec du rechargement')
        .setDescription(success
          ? `Le plugin \`${nom}\` est de nouveau actif.`
          : `Impossible de recharger \`${nom}\`. Vérifie les logs du bot.`)
        .setTimestamp()
      ]
    });
  }

  // ── HELP ──────────────────────────────────────────────────────────────────
  if (sub === 'help') {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📖 Format d\'un fichier plugin')
        .setDescription('Voici la structure minimale d\'un fichier plugin `.js` :')
        .addFields({
          name: 'Structure',
          value: [
            '```js',
            '// Fonction principale — OBLIGATOIRE',
            'export async function search(query, searchType) {',
            '  // query: ce que l\'utilisateur a tapé',
            '  // searchType: "email", "phone", etc.',
            '  // Retourner un tableau d\'objets',
            '  return [',
            '    { nom: "Dupont", email: "...", telephone: "..." }',
            '  ];',
            '}',
            '',
            '// Métadonnées — OPTIONNEL',
            'export const metadata = {',
            '  name: "Mon API",',
            '  version: "1.0"',
            '};',
            '```'
          ].join('\n'),
          inline: false
        })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }
}
