import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/adminCheck.js';
import { getDB, DATA_DIR } from '../utils/database.js';
import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { join, extname } from 'path';
import AdmZip from 'adm-zip';

const DB_DIR = join(DATA_DIR, 'databases');

async function downloadAttachment(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement échoué: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Parse buffer into entries based on file type
function parseBuffer(buffer, filename) {
  const ext = extname(filename).toLowerCase();
  const content = buffer.toString('utf-8');

  if (ext === '.json') {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return { entries: parsed, count: parsed.length };
    if (typeof parsed === 'object') return { entries: Object.values(parsed), count: Object.keys(parsed).length };
    return { entries: [], count: 0 };
  }

  if (ext === '.jsonl') {
    const entries = content.split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return { entries, count: entries.length };
  }

  if (ext === '.csv') {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length === 0) return { entries: [], count: 0 };
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const entries = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
      return obj;
    });
    return { entries, count: entries.length };
  }

  if (ext === '.txt') {
    const lines = content.split('\n').filter(l => l.trim());
    const entries = lines.map(l => ({ value: l.trim() }));
    return { entries, count: entries.length };
  }

  return { entries: [], count: 0 };
}

// Handle zip: find first readable file inside
function parseZip(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const supported = ['.json', '.jsonl', '.csv', '.txt'];

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const ext = extname(entry.entryName).toLowerCase();
    if (!supported.includes(ext)) continue;
    try {
      const content = zip.readAsText(entry);
      return parseBuffer(Buffer.from(content), entry.entryName);
    } catch {}
  }
  return { entries: [], count: 0 };
}

// Parse PDF: extract text lines as entries
function parsePdf(buffer) {
  try {
    const text = buffer.toString('latin1');
    // Extract readable text streams from PDF (basic extraction)
    const streamMatches = text.match(/stream([\s\S]*?)endstream/g) || [];
    const lines = [];
    for (const s of streamMatches) {
      const inner = s.replace(/^stream/, '').replace(/endstream$/, '').trim();
      // Extract text between parentheses (PDF text objects)
      const parens = inner.match(/\(([^)]{2,200})\)/g) || [];
      for (const p of parens) {
        const val = p.slice(1, -1).replace(/\\n/g, ' ').replace(/\\/g, '').trim();
        if (val.length > 2) lines.push(val);
      }
    }
    if (lines.length === 0) {
      // Fallback: extract all printable sequences
      const printable = text.replace(/[^\x20-\x7E\n]/g, ' ').split('\n')
        .map(l => l.trim()).filter(l => l.length > 3);
      const entries = printable.slice(0, 5000).map(l => ({ raw: l }));
      return { entries, count: entries.length };
    }
    const entries = lines.slice(0, 5000).map(l => ({ raw: l }));
    return { entries, count: entries.length };
  } catch (e) {
    return { entries: [], count: 0 };
  }
}

// Parse any supported format
function parseFile(buffer, filename) {
  const ext = extname(filename).toLowerCase();
  if (ext === '.zip') return parseZip(buffer);
  if (ext === '.pdf') return parsePdf(buffer);
  if (ext === '.rar') return { entries: [], count: 0 }; // rar not supported natively
  return parseBuffer(buffer, filename);
}

export const data = new SlashCommandBuilder()
  .setName('db')
  .setDescription('[ADMIN] Gérer les bases de données de recherche')

  .addSubcommand(sub => sub
    .setName('add')
    .setDescription('Ajouter une base de données (json, jsonl, csv, txt, zip)')
    .addStringOption(opt => opt.setName('nom').setDescription('Identifiant unique (ex: sfr, caf)').setRequired(true))
    .addStringOption(opt => opt.setName('label').setDescription('Nom affiché dans le menu (ex: SFR, CAF)').setRequired(true))
    .addAttachmentOption(opt => opt.setName('fichier').setDescription('Fichier .json / .jsonl / .csv / .txt / .zip / .pdf').setRequired(true))
    .addStringOption(opt => opt.setName('emoji').setDescription('Emoji affiché (ex: 📱 ou <:sfr:123456789>)'))
    .addStringOption(opt => opt.setName('description').setDescription('Description courte de la base'))
    .addBooleanOption(opt => opt.setName('vip').setDescription('Restreindre aux VIP'))
    .addStringOption(opt => opt.setName('id_externe').setDescription('ID externe (référence personnelle, ex: BOUYGUES_2024)'))
    .addStringOption(opt => opt
      .setName('options')
      .setDescription('Options liées, séparées par virgules (ex: email,phone,name)')
    )
  )

  .addSubcommand(sub => sub
    .setName('remove')
    .setDescription('Supprimer une base de données')
    .addStringOption(opt => opt.setName('nom').setDescription('Identifiant de la base').setRequired(true))
  )

  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('Lister toutes les bases de données')
  )

  .addSubcommand(sub => sub
    .setName('edit')
    .setDescription('Modifier les infos d\'une base (label, description, emoji, options liées…)')
    .addStringOption(opt => opt.setName('nom').setDescription('Identifiant de la base').setRequired(true))
    .addStringOption(opt => opt.setName('label').setDescription('Nouveau nom affiché'))
    .addStringOption(opt => opt.setName('description').setDescription('Nouvelle description'))
    .addStringOption(opt => opt.setName('emoji').setDescription('Nouvel emoji'))
    .addStringOption(opt => opt.setName('id_externe').setDescription('Nouvel ID externe'))
    .addStringOption(opt => opt.setName('options').setDescription('Nouvelles options liées (remplace les précédentes, ex: email,phone)'))
  )

  .addSubcommand(sub => sub
    .setName('config')
    .setDescription('Personnaliser l\'embed de résultats d\'une base')
    .addStringOption(opt => opt.setName('nom').setDescription('Identifiant de la base').setRequired(true))
    .addStringOption(opt => opt.setName('titre').setDescription('Titre de l\'embed'))
    .addStringOption(opt => opt.setName('description').setDescription('Description ({query} = la recherche, {results} = nb résultats)'))
    .addStringOption(opt => opt.setName('couleur').setDescription('Couleur hex (ex: ff6b35)'))
    .addStringOption(opt => opt.setName('thumbnail').setDescription('URL de l\'image thumbnail'))
    .addStringOption(opt => opt.setName('footer').setDescription('Texte du pied de page'))
    .addStringOption(opt => opt.setName('image').setDescription('URL de la grande image en bas'))
  )

  .addSubcommand(sub => sub
    .setName('fields')
    .setDescription('Définir les champs à afficher dans les résultats')
    .addStringOption(opt => opt.setName('nom').setDescription('Identifiant de la base').setRequired(true))
    .addStringOption(opt => opt
      .setName('champs')
      .setDescription('Format: emoji:Label:cle_json,... Ex: 👤:Prénom:prenom,📧:Email:email')
      .setRequired(true)
    )
  )

  .addSubcommand(sub => sub
    .setName('access')
    .setDescription('Définir le plan requis pour accéder à cette base')
    .addStringOption(opt => opt.setName('nom').setDescription('Identifiant de la base').setRequired(true))
    .addStringOption(opt => opt.setName('mode').setDescription('Mode d\'accès').setRequired(true)
      .addChoices(
        { name: '🌍 Libre — ouvert à tous', value: 'free' },
        { name: '🔒 VIP uniquement', value: 'vip' }
      )
    )
  )

  .addSubcommand(sub => sub
    .setName('menu')
    .setDescription('Afficher ou cacher cette base dans le menu de recherche')
    .addStringOption(opt => opt.setName('nom').setDescription('Identifiant de la base').setRequired(true))
    .addBooleanOption(opt => opt.setName('visible').setDescription('Visible dans le menu ?').setRequired(true))
  )

  .addSubcommand(sub => sub
    .setName('info')
    .setDescription('Voir les détails complets d\'une base')
    .addStringOption(opt => opt.setName('nom').setDescription('Identifiant de la base').setRequired(true))
  );

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
  }

  const db  = getDB();
  const sub = interaction.options.getSubcommand();

  // ── ADD ──────────────────────────────────────────────────────────────────────
  if (sub === 'add') {
    await interaction.deferReply({ ephemeral: true });

    const nom         = interaction.options.getString('nom').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const label       = interaction.options.getString('label');
    const attachment  = interaction.options.getAttachment('fichier');
    const emoji       = interaction.options.getString('emoji') || '🗄️';
    const description = interaction.options.getString('description') || '';
    const vipOnly     = interaction.options.getBoolean('vip') ? 1 : 0;
    const idExterne   = interaction.options.getString('id_externe') || null;
    const optionsStr  = interaction.options.getString('options') || '';

    const existing = db.prepare('SELECT id FROM databases WHERE name = ?').get(nom);
    if (existing) return interaction.editReply({ content: `❌ Une base nommée \`${nom}\` existe déjà. Utilise \`/db edit\` pour la modifier.` });

    const supportedExts = ['.json', '.jsonl', '.csv', '.txt', '.zip'];
    const fileExt = extname(attachment.name).toLowerCase();
    if (!supportedExts.includes(fileExt)) {
      return interaction.editReply({ content: `❌ Format non supporté. Formats acceptés : **${supportedExts.join(', ')}**` });
    }

    if (fileExt === '.rar') {
      return interaction.editReply({ content: '❌ Le format `.rar` n\'est pas supporté. Convertis ton archive en `.zip` avant de l\'envoyer.' });
    }

    let buffer;
    try {
      buffer = await downloadAttachment(attachment.url);
    } catch (e) {
      return interaction.editReply({ content: `❌ Erreur lors du téléchargement: ${e.message}` });
    }

    let parsed;
    try {
      parsed = parseFile(buffer, attachment.name);
    } catch (e) {
      return interaction.editReply({ content: `❌ Impossible de lire le fichier : ${e.message}` });
    }

    const filename = `${nom}_${Date.now()}${fileExt}`;
    const filePath = join(DB_DIR, filename);
    writeFileSync(filePath, buffer);

    db.prepare(`
      INSERT INTO databases (name, label, emoji, filename, description, added_by, entry_count, vip_only, show_in_menu, file_url, external_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(nom, label, emoji, filename, description, interaction.user.id, parsed.count, vipOnly, attachment.url, idExterne);

    // Link to options
    const linkedOptions = optionsStr ? optionsStr.split(',').map(o => o.trim().toLowerCase()).filter(Boolean) : [];
    for (const optVal of linkedOptions) {
      try {
        db.prepare('INSERT OR IGNORE INTO db_option_links (db_name, option_value) VALUES (?, ?)').run(nom, optVal);
      } catch {}
    }

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ Base de données ajoutée')
        .addFields(
          { name: 'Identifiant',    value: `\`${nom}\``,                                             inline: true },
          { name: 'Label',          value: label,                                                     inline: true },
          { name: 'Format',         value: fileExt,                                                   inline: true },
          { name: 'Entrées',        value: `\`${parsed.count}\``,                                     inline: true },
          { name: 'Accès',          value: vipOnly ? '🔒 VIP' : '🌍 Libre',                          inline: true },
          { name: 'ID Externe',     value: idExterne ? `\`${idExterne}\`` : '*aucun*',                inline: true },
          { name: 'Options liées',  value: linkedOptions.length > 0 ? linkedOptions.map(o => `\`${o}\``).join(', ') : '*aucune*', inline: false }
        )
        .setDescription('La base est prête. Elle alimentera les recherches **Global** et les options liées.\nUtilise `/db config` et `/db fields` pour personnaliser l\'embed des résultats.')
        .setTimestamp()
      ]
    });
  }

  // ── REMOVE ────────────────────────────────────────────────────────────────────
  if (sub === 'remove') {
    const nom = interaction.options.getString('nom').toLowerCase();
    const row = db.prepare('SELECT * FROM databases WHERE name = ?').get(nom);
    if (!row) return interaction.reply({ content: `❌ Base \`${nom}\` introuvable.`, ephemeral: true });

    const filePath = join(DB_DIR, row.filename);
    if (existsSync(filePath)) { try { unlinkSync(filePath); } catch {} }

    db.prepare('DELETE FROM databases WHERE name = ?').run(nom);
    db.prepare('DELETE FROM db_embed_config WHERE db_name = ?').run(nom);
    db.prepare('DELETE FROM db_option_links WHERE db_name = ?').run(nom);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xed4245).setTitle('🗑️ Base supprimée')
        .setDescription(`La base \`${nom}\` (${row.label}) a été supprimée.`)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── LIST ──────────────────────────────────────────────────────────────────────
  if (sub === 'list') {
    const rows = db.prepare('SELECT * FROM databases ORDER BY id ASC').all();
    if (rows.length === 0) {
      return interaction.reply({ content: '📭 Aucune base de données enregistrée.', ephemeral: true });
    }
    const fields = rows.map(r => {
      const links = db.prepare('SELECT option_value FROM db_option_links WHERE db_name = ?').all(r.name);
      const linkedStr = links.length > 0 ? links.map(l => `\`${l.option_value}\``).join(' ') : '';
      return {
        name: `${r.emoji || '🗄️'} ${r.label || r.name} (\`${r.name}\`)`,
        value: [
          `Entrées: \`${r.entry_count}\``,
          r.vip_only ? '🔒 VIP' : '🌍 Libre',
          r.show_in_menu ? '👁️ Visible' : '🙈 Caché',
          r.external_id ? `ID: \`${r.external_id}\`` : '',
          linkedStr ? `🔗 ${linkedStr}` : ''
        ].filter(Boolean).join(' • '),
        inline: false
      };
    });
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2).setTitle(`🗄️ Bases de données (${rows.length})`)
        .addFields(fields)
        .setFooter({ text: '/db info <nom> pour plus de détails' })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── EDIT ──────────────────────────────────────────────────────────────────────
  if (sub === 'edit') {
    const nom         = interaction.options.getString('nom').toLowerCase();
    const row         = db.prepare('SELECT * FROM databases WHERE name = ?').get(nom);
    if (!row) return interaction.reply({ content: `❌ Base \`${nom}\` introuvable.`, ephemeral: true });

    const label       = interaction.options.getString('label');
    const description = interaction.options.getString('description');
    const emoji       = interaction.options.getString('emoji');
    const idExterne   = interaction.options.getString('id_externe');
    const optionsStr  = interaction.options.getString('options');

    if (!label && !description && !emoji && idExterne === null && optionsStr === null) {
      return interaction.reply({ content: '❌ Indique au moins un champ à modifier.', ephemeral: true });
    }

    const updates = [], vals = [];
    if (label)       { updates.push('label = ?');       vals.push(label); }
    if (description) { updates.push('description = ?'); vals.push(description); }
    if (emoji)       { updates.push('emoji = ?');       vals.push(emoji); }
    if (idExterne !== null) { updates.push('external_id = ?'); vals.push(idExterne); }

    if (updates.length > 0) {
      vals.push(nom);
      db.prepare(`UPDATE databases SET ${updates.join(', ')} WHERE name = ?`).run(...vals);
    }

    // Update option links if provided
    let linkedOptions = [];
    if (optionsStr !== null) {
      db.prepare('DELETE FROM db_option_links WHERE db_name = ?').run(nom);
      linkedOptions = optionsStr.split(',').map(o => o.trim().toLowerCase()).filter(Boolean);
      for (const optVal of linkedOptions) {
        try { db.prepare('INSERT OR IGNORE INTO db_option_links (db_name, option_value) VALUES (?, ?)').run(nom, optVal); } catch {}
      }
    }

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ Base modifiée')
        .addFields(
          { name: 'Identifiant',   value: `\`${nom}\``,                                                         inline: true },
          { name: 'Label',         value: label || row.label,                                                    inline: true },
          { name: 'ID Externe',    value: idExterne !== null ? (idExterne || '*effacé*') : (row.external_id ? `\`${row.external_id}\`` : '*aucun*'), inline: true },
          { name: 'Options liées', value: optionsStr !== null ? (linkedOptions.length > 0 ? linkedOptions.map(o => `\`${o}\``).join(', ') : '*aucune*') : '*inchangées*', inline: false }
        )
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── CONFIG ────────────────────────────────────────────────────────────────────
  if (sub === 'config') {
    const nom    = interaction.options.getString('nom').toLowerCase();
    const row    = db.prepare('SELECT * FROM databases WHERE name = ?').get(nom);
    if (!row) return interaction.reply({ content: `❌ Base \`${nom}\` introuvable.`, ephemeral: true });

    const titre       = interaction.options.getString('titre');
    const description = interaction.options.getString('description');
    const couleur     = interaction.options.getString('couleur')?.replace('#', '');
    const thumbnail   = interaction.options.getString('thumbnail');
    const footer      = interaction.options.getString('footer');
    const image       = interaction.options.getString('image');

    if (!titre && !description && !couleur && !thumbnail && !footer && !image) {
      return interaction.reply({ content: '❌ Indique au moins un champ à modifier (titre, description, couleur, thumbnail, footer, image).', ephemeral: true });
    }

    const existing = db.prepare('SELECT * FROM db_embed_config WHERE db_name = ?').get(nom);
    if (existing) {
      const updates = [], vals = [];
      if (titre)       { updates.push('title = ?');       vals.push(titre); }
      if (description) { updates.push('description = ?'); vals.push(description); }
      if (couleur)     { updates.push('color = ?');       vals.push(couleur); }
      if (thumbnail)   { updates.push('thumbnail = ?');   vals.push(thumbnail); }
      if (footer)      { updates.push('footer = ?');      vals.push(footer); }
      if (image)       { updates.push('image = ?');       vals.push(image); }
      vals.push(nom);
      db.prepare(`UPDATE db_embed_config SET ${updates.join(', ')} WHERE db_name = ?`).run(...vals);
    } else {
      db.prepare('INSERT INTO db_embed_config (db_name, title, description, color, thumbnail, footer, image) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(nom, titre || null, description || null, couleur || null, thumbnail || null, footer || null, image || null);
    }

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(couleur ? parseInt(couleur, 16) : 0x57f287).setTitle('✅ Embed configuré')
        .addFields(
          { name: 'Base',        value: `${row.emoji} ${row.label}`,       inline: true },
          { name: 'Titre',       value: titre       || '*inchangé*',       inline: true },
          { name: 'Couleur',     value: couleur ? `#${couleur}` : '*inchangé*', inline: true },
          { name: 'Footer',      value: footer      || '*inchangé*',       inline: true },
          { name: 'Description', value: description || '*inchangée*',      inline: false }
        )
        .setFooter({ text: 'Variables : {query}, {results}' })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── FIELDS ────────────────────────────────────────────────────────────────────
  if (sub === 'fields') {
    const nom    = interaction.options.getString('nom').toLowerCase();
    const champs = interaction.options.getString('champs');
    const row    = db.prepare('SELECT * FROM databases WHERE name = ?').get(nom);
    if (!row) return interaction.reply({ content: `❌ Base \`${nom}\` introuvable.`, ephemeral: true });

    const fields = [];
    for (const part of champs.split(',')) {
      const segs = part.trim().split(':');
      if (segs.length >= 3) fields.push({ emoji: segs[0], label: segs[1], key: segs[2], inline: false });
      else if (segs.length === 2) fields.push({ emoji: '', label: segs[0], key: segs[1], inline: false });
    }

    if (fields.length === 0) {
      return interaction.reply({ content: '❌ Format invalide. Utilise: `emoji:Label:cle_json,...`', ephemeral: true });
    }

    const existing = db.prepare('SELECT * FROM db_embed_config WHERE db_name = ?').get(nom);
    if (existing) {
      db.prepare('UPDATE db_embed_config SET fields_json = ? WHERE db_name = ?').run(JSON.stringify(fields), nom);
    } else {
      db.prepare('INSERT INTO db_embed_config (db_name, fields_json) VALUES (?, ?)').run(nom, JSON.stringify(fields));
    }

    const preview = fields.map(f => `${f.emoji} **${f.label}** → \`${f.key}\``).join('\n');
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ Champs configurés')
        .setDescription(`**${fields.length} champ(s)** pour **${row.label}** :\n\n${preview}`)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── ACCESS ────────────────────────────────────────────────────────────────────
  if (sub === 'access') {
    const nom  = interaction.options.getString('nom').toLowerCase();
    const mode = interaction.options.getString('mode');
    const row  = db.prepare('SELECT * FROM databases WHERE name = ?').get(nom);
    if (!row) return interaction.reply({ content: `❌ Base \`${nom}\` introuvable.`, ephemeral: true });

    db.prepare('UPDATE databases SET vip_only = ? WHERE name = ?').run(mode === 'vip' ? 1 : 0, nom);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(mode === 'vip' ? 0xfee75c : 0x57f287).setTitle('✅ Accès mis à jour')
        .setDescription(`**${row.label}** est maintenant en mode ${mode === 'vip' ? '🔒 VIP' : '🌍 Libre'}`)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── MENU ──────────────────────────────────────────────────────────────────────
  if (sub === 'menu') {
    const nom     = interaction.options.getString('nom').toLowerCase();
    const visible = interaction.options.getBoolean('visible');
    const row     = db.prepare('SELECT * FROM databases WHERE name = ?').get(nom);
    if (!row) return interaction.reply({ content: `❌ Base \`${nom}\` introuvable.`, ephemeral: true });

    db.prepare('UPDATE databases SET show_in_menu = ? WHERE name = ?').run(visible ? 1 : 0, nom);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ Visibilité mise à jour')
        .setDescription(`**${row.label}** est maintenant ${visible ? '👁️ visible' : '🙈 cachée'} dans le menu.`)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── INFO ──────────────────────────────────────────────────────────────────────
  if (sub === 'info') {
    const nom    = interaction.options.getString('nom').toLowerCase();
    const row    = db.prepare('SELECT * FROM databases WHERE name = ?').get(nom);
    if (!row) return interaction.reply({ content: `❌ Base \`${nom}\` introuvable.`, ephemeral: true });

    const config  = db.prepare('SELECT * FROM db_embed_config WHERE db_name = ?').get(nom);
    const links   = db.prepare('SELECT option_value FROM db_option_links WHERE db_name = ?').all(nom);

    let fieldsPreview = '*Non configurés (affichage auto)*';
    if (config?.fields_json) {
      try {
        const f = JSON.parse(config.fields_json);
        if (f.length > 0) fieldsPreview = f.map(x => `${x.emoji} ${x.label} → \`${x.key}\``).join('\n');
      } catch {}
    }

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2).setTitle(`${row.emoji || '🗄️'} ${row.label}`)
        .addFields(
          { name: 'Identifiant',   value: `\`${row.name}\``,                                                          inline: true },
          { name: 'ID Externe',    value: row.external_id ? `\`${row.external_id}\`` : '*aucun*',                      inline: true },
          { name: 'Entrées',       value: `\`${row.entry_count}\``,                                                    inline: true },
          { name: 'Accès',         value: row.vip_only ? '🔒 VIP' : '🌍 Libre',                                       inline: true },
          { name: 'Menu',          value: row.show_in_menu ? '👁️ Visible' : '🙈 Caché',                              inline: true },
          { name: 'Fichier',       value: `\`${row.filename}\``,                                                       inline: false },
          { name: 'Options liées', value: links.length > 0 ? links.map(l => `\`${l.option_value}\``).join(', ') : '*aucune*', inline: false },
          { name: 'Titre embed',   value: config?.title  || '*Auto*',                                                  inline: true },
          { name: 'Couleur',       value: config?.color  ? `#${config.color}` : '*Auto*',                             inline: true },
          { name: 'Champs',        value: fieldsPreview,                                                               inline: false }
        )
        .setTimestamp()
      ],
      ephemeral: true
    });
  }
}
