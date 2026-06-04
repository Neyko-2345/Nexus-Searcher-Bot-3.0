/**
 * /db-parse — Suivi admin du parsing intelligent des bases de données
 * Commandes :
 *   /db-parse preview nom:sfr   → Voir comment le bot parse les N premières lignes
 *   /db-parse stats nom:sfr     → Stats de confiance du parsing
 *   /db-parse reset nom:sfr     → Remettre en mode raw (désactiver le smart parse)
 *   /db-parse enable nom:sfr    → Réactiver le smart parse
 *   /db-parse list              → Voir le statut de toutes les bases
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/adminCheck.js';
import { getDB } from '../utils/database.js';
import { smartParseAll, formatParsedFields } from '../utils/smartParser.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, '../../data/databases');

function loadEntries(database, limit = 10) {
  const filePath = join(DB_DIR, database.filename);
  if (!existsSync(filePath)) return [];
  try {
    const content = readFileSync(filePath, 'utf-8');
    if (database.filename.endsWith('.json')) {
      const parsed = JSON.parse(content);
      const arr = Array.isArray(parsed) ? parsed : Object.values(parsed);
      return arr.slice(0, limit);
    }
    return content.split('\n').filter(l => l.trim()).slice(0, limit).map(line => {
      try { return JSON.parse(line); } catch { return { raw: line }; }
    });
  } catch { return []; }
}

export const data = new SlashCommandBuilder()
  .setName('db-parse')
  .setDescription('[ADMIN] Suivi et contrôle du parsing intelligent des bases de données')

  .addSubcommand(sub => sub
    .setName('preview')
    .setDescription('Voir comment le bot parse les premières entrées d\'une base')
    .addStringOption(o => o.setName('nom').setDescription('Nom de la base').setRequired(true))
    .addIntegerOption(o => o.setName('lignes').setDescription('Nombre de lignes à prévisualiser (défaut 5, max 10)').setMinValue(1).setMaxValue(10))
  )
  .addSubcommand(sub => sub
    .setName('stats')
    .setDescription('Statistiques de confiance du parsing pour une base')
    .addStringOption(o => o.setName('nom').setDescription('Nom de la base').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('reset')
    .setDescription('Désactiver le smart parse pour une base (retour au mode raw)')
    .addStringOption(o => o.setName('nom').setDescription('Nom de la base').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('enable')
    .setDescription('Activer le smart parse pour une base')
    .addStringOption(o => o.setName('nom').setDescription('Nom de la base').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('Voir le statut du smart parse pour toutes les bases')
  );

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
  }

  const db  = getDB();
  const sub = interaction.options.getSubcommand();

  // Ensure parse_mode column exists
  try { db.exec("ALTER TABLE databases ADD COLUMN parse_mode TEXT DEFAULT 'smart'"); } catch {}

  if (sub === 'list') {
    const bases = db.prepare('SELECT * FROM databases ORDER BY label ASC').all();
    if (!bases.length) return interaction.reply({ content: 'ℹ️ Aucune base de données.', ephemeral: true });
    const lines = bases.map(b => {
      const mode = b.parse_mode || 'smart';
      const icon = mode === 'raw' ? '⚠️ RAW' : '✅ Smart';
      return `${b.emoji || '🗄️'} **${b.label || b.name}** — \`${icon}\``;
    });
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x3B3B44).setTitle('📊 Statut parsing des bases')
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Smart = parsing intelligent | RAW = brut' }).setTimestamp()
      ],
      ephemeral: true
    });
  }

  const nom = interaction.options.getString('nom');
  const dbRow = db.prepare('SELECT * FROM databases WHERE name = ?').get(nom)
    || db.prepare('SELECT * FROM databases WHERE label LIKE ?').get(`%${nom}%`);

  if (!dbRow) return interaction.reply({ content: `❌ Base \`${nom}\` introuvable.`, ephemeral: true });

  if (sub === 'reset') {
    db.prepare("UPDATE databases SET parse_mode = 'raw' WHERE name = ?").run(dbRow.name);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xffa500).setTitle('⚠️ Smart parse désactivé')
        .setDescription(`La base **${dbRow.label || dbRow.name}** affichera maintenant les lignes en mode **RAW brut**.\nUtilise \`/db-parse enable nom:${dbRow.name}\` pour réactiver.`)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'enable') {
    db.prepare("UPDATE databases SET parse_mode = 'smart' WHERE name = ?").run(dbRow.name);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ Smart parse activé')
        .setDescription(`La base **${dbRow.label || dbRow.name}** utilise maintenant le **parsing intelligent**.`)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'stats') {
    await interaction.deferReply({ ephemeral: true });
    const entries = loadEntries(dbRow, 100);
    if (!entries.length) return interaction.editReply({ content: '❌ Base vide ou fichier introuvable.' });
    const { stats } = smartParseAll(entries, dbRow.name);
    const total = stats.high + stats.medium + stats.low;
    const pct = n => Math.round((n / total) * 100);
    const barFill = (n) => '█'.repeat(Math.round((n / total) * 20)).padEnd(20, '░');
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(stats.low > total * 0.5 ? 0xed4245 : stats.medium > total * 0.5 ? 0xfee75c : 0x57f287)
        .setTitle(`📊 Stats parsing — ${dbRow.label || dbRow.name}`)
        .setDescription(`Analyse de **${total}** entrées`)
        .addFields(
          { name: '🟢 Confiance haute', value: `${barFill(stats.high)} **${stats.high}** (${pct(stats.high)}%)`, inline: false },
          { name: '🟡 Confiance moyenne', value: `${barFill(stats.medium)} **${stats.medium}** (${pct(stats.medium)}%)`, inline: false },
          { name: '🔴 Confiance basse (raw)', value: `${barFill(stats.low)} **${stats.low}** (${pct(stats.low)}%)`, inline: false },
        )
        .addFields({
          name: '💡 Recommandation',
          value: stats.low > total * 0.5
            ? '⚠️ Beaucoup de lignes non parsées. Utilise `/db-parse reset` pour rester en raw, ou `/db fields` pour configurer les champs manuellement.'
            : stats.high > total * 0.7
            ? '✅ Parsing de bonne qualité. Les résultats seront bien structurés.'
            : '🟡 Parsing partiel. Vérifie avec `/db-parse preview` pour voir le résultat.',
          inline: false
        })
        .setFooter({ text: `Mode actuel : ${dbRow.parse_mode || 'smart'}` }).setTimestamp()
      ]
    });
  }

  if (sub === 'preview') {
    await interaction.deferReply({ ephemeral: true });
    const nb = interaction.options.getInteger('lignes') || 5;
    const entries = loadEntries(dbRow, nb);
    if (!entries.length) return interaction.editReply({ content: '❌ Base vide ou fichier introuvable.' });

    const { parsed } = smartParseAll(entries, dbRow.name);
    const embeds = parsed.slice(0, 5).map((p, i) => {
      const confidenceColor = p.confidence === 'high' ? 0x57f287 : p.confidence === 'medium' ? 0xfee75c : 0xed4245;
      const confidenceLabel = p.confidence === 'high' ? '🟢 Haute' : p.confidence === 'medium' ? '🟡 Moyenne' : '🔴 Basse';
      const formatted = formatParsedFields(p.fields, p._raw);
      return new EmbedBuilder()
        .setColor(confidenceColor)
        .setTitle(`📄 Entrée #${i + 1} — Confiance ${confidenceLabel}`)
        .setDescription(formatted.substring(0, 2000))
        .addFields(p._raw ? [{ name: '🔩 Ligne brute originale', value: `\`${String(p._raw).substring(0, 300)}\``, inline: false }] : [])
        .setFooter({ text: `Champs détectés : ${Object.keys(p.fields).join(', ')}` });
    });

    if (!embeds.length) return interaction.editReply({ content: '❌ Aucune entrée à prévisualiser.' });
    return interaction.editReply({
      content: `**Prévisualisation du parsing — ${dbRow.label || dbRow.name}** (${parsed.length} entrée(s) analysée(s))\nSi le parsing est mauvais → \`/db-parse reset nom:${dbRow.name}\``,
      embeds
    });
  }
}
