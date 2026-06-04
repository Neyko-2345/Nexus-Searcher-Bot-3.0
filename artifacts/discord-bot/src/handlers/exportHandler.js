import { AttachmentBuilder } from 'discord.js';
import { getDB } from '../utils/database.js';

const NEXUS_ASCII = [
  '███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗',
  '████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝',
  '██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗',
  '██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║',
  '██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║',
  '╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝',
  '',
  'NΞXUS™ S€archer — Bot OSINT',
  'https://discord.gg/nexussearcher',
].join('\n');

// Normalise les résultats quel que soit le format stocké en DB
function normalizeResults(raw) {
  if (!raw) return [];
  // Peut être un tableau d'objets {source, data} ou juste des objets bruts
  if (Array.isArray(raw)) return raw;
  // Objet {dbName, records, query} — ancien format
  if (raw.records && Array.isArray(raw.records)) return raw.records.map(r => ({ source: raw.dbName, data: r }));
  return [];
}

function buildTxtExport(results, query, optType) {
  const normalized = normalizeResults(results);
  const lines = [
    NEXUS_ASCII,
    '',
    '═══════════════════════════════════════════',
    `Requête    : ${query}`,
    `Type       : ${optType}`,
    `Résultats  : ${normalized.length}`,
    `Date       : ${new Date().toLocaleString('fr-FR')}`,
    '═══════════════════════════════════════════',
    '',
    '--- Résultat ---',
    '',
    ...normalized.map((r, i) => {
      const block = [`[${i + 1}]`];
      const obj = r?.data ?? r;
      if (typeof obj === 'object' && obj !== null) {
        for (const [k, v] of Object.entries(obj)) {
          if (v !== null && v !== undefined && v !== '') block.push(`  ${k}: ${v}`);
        }
      } else {
        block.push(`  ${obj}`);
      }
      return block.join('\n');
    }),
    '',
    '═══════════════════════════════════════════',
    'Exporté via NΞXUS™ S€archer',
    '═══════════════════════════════════════════',
  ];
  return { content: lines.join('\n'), filename: `nexus_export_${Date.now()}.txt` };
}

function buildJsonExport(results) {
  const normalized = normalizeResults(results);
  const data = normalized.map(r => {
    const obj = r?.data ?? r;
    return r?.source ? { source: r.source, ...obj } : obj;
  });
  return { content: JSON.stringify(data, null, 2), filename: `nexus_export_${Date.now()}.json` };
}

export async function handleExportButton(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const parts    = interaction.customId.split('_');
  const format   = parts[1]; // 'json' or 'txt'
  const resultId = parts.slice(2).join('_');

  const db  = getDB();
  const row = db.prepare('SELECT * FROM temp_results WHERE id = ?').get(resultId);

  if (!row) return interaction.editReply({ content: '❌ Résultats expirés ou introuvables.' });

  let rawParsed;
  try { rawParsed = JSON.parse(row.results); } catch { rawParsed = []; }

  const query   = rawParsed?.query   || row.query    || '';
  const optType = rawParsed?.dbName  || row.option_type || 'global';

  const exported = format === 'txt'
    ? buildTxtExport(rawParsed, query, optType)
    : buildJsonExport(rawParsed);

  const normalized = normalizeResults(rawParsed);
  const count = normalized.length || (rawParsed?.records?.length ?? 0);

  // Log dans search_logs
  try {
    db.prepare('INSERT INTO search_logs (user_id, user_tag, query, search_type, result_count, channel_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(interaction.user.id, interaction.user.tag, `[EXPORT ${format.toUpperCase()}] ${query}`, optType, count, interaction.channelId ?? null);
  } catch {}

  const buffer     = Buffer.from(exported.content, 'utf-8');
  const attachment = new AttachmentBuilder(buffer, { name: exported.filename });

  await interaction.editReply({
    content: `✅ Export **${format.toUpperCase()}** prêt ! (${count} entrées)`,
    files:   [attachment]
  });
}
