import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/adminCheck.js';
import { getDB } from '../utils/database.js';

const VARIABLES_HINT = 'Variables : {query} {type} {results} {user}';

export const data = new SlashCommandBuilder()
  .setName('embed')
  .setDescription('[ADMIN] Configurer les embeds du bot')

  // ── Menu principal ──────────────────────────────────────────────────────────
  .addSubcommand(sub => sub
    .setName('set')
    .setDescription('Modifier l\'embed du menu de recherche principal')
    .addStringOption(opt => opt.setName('title').setDescription('Titre de l\'embed'))
    .addStringOption(opt => opt.setName('description').setDescription('Description de l\'embed'))
    .addStringOption(opt => opt.setName('color').setDescription('Couleur hex (ex: #5865f2)'))
    .addStringOption(opt => opt.setName('footer').setDescription('Texte du footer'))
    .addStringOption(opt => opt.setName('footer_icon').setDescription('URL de l\'icône du footer'))
    .addStringOption(opt => opt.setName('thumbnail').setDescription('URL de la miniature (coin sup. droit)'))
    .addStringOption(opt => opt.setName('image').setDescription('URL de la grande image en bas'))
    .addAttachmentOption(opt => opt.setName('thumbnail_fichier').setDescription('Miniature depuis ta galerie (remplace thumbnail si renseignée)'))
    .addAttachmentOption(opt => opt.setName('image_fichier').setDescription('Grande image depuis ta galerie (remplace image si renseignée)'))
    .addAttachmentOption(opt => opt.setName('footer_icon_fichier').setDescription('Icône du footer depuis ta galerie'))
  )
  .addSubcommand(sub => sub
    .setName('preview')
    .setDescription('Prévisualiser l\'embed actuel du menu principal')
  )
  .addSubcommand(sub => sub
    .setName('reset')
    .setDescription('Réinitialiser l\'embed du menu principal par défaut')
  )

  // ── Embed résultats d'option ─────────────────────────────────────────────────
  .addSubcommand(sub => sub
    .setName('option')
    .setDescription('Personnaliser l\'embed des résultats pour une option de recherche (intégrée ou custom)')
    .addStringOption(opt => opt
      .setName('option')
      .setDescription('Valeur de l\'option (email, phone, name, username, discord_id, ip, iban, password… ou custom)')
      .setRequired(true)
    )
    .addStringOption(opt => opt.setName('titre').setDescription(`Titre — ${VARIABLES_HINT}`))
    .addStringOption(opt => opt.setName('description').setDescription(`Description — ${VARIABLES_HINT}`))
    .addStringOption(opt => opt.setName('couleur').setDescription('Couleur hex (ex: #5865f2 ou ff6b35)'))
    .addStringOption(opt => opt.setName('footer').setDescription(`Texte du pied de page — ${VARIABLES_HINT}`))
    .addStringOption(opt => opt.setName('footer_icon').setDescription('URL de l\'icône du footer'))
    .addStringOption(opt => opt.setName('thumbnail').setDescription('URL image miniature (coin supérieur droit)'))
    .addStringOption(opt => opt.setName('image').setDescription('URL de la grande image en bas de l\'embed'))
    .addAttachmentOption(opt => opt.setName('thumbnail_fichier').setDescription('Miniature depuis ta galerie (remplace thumbnail)'))
    .addAttachmentOption(opt => opt.setName('image_fichier').setDescription('Grande image depuis ta galerie (remplace image)'))
    .addAttachmentOption(opt => opt.setName('footer_icon_fichier').setDescription('Icône du footer depuis ta galerie'))
  )
  .addSubcommand(sub => sub
    .setName('option-view')
    .setDescription('Voir la configuration embed actuelle d\'une option')
    .addStringOption(opt => opt
      .setName('option')
      .setDescription('Valeur de l\'option (email, phone, name… ou valeur custom)')
      .setRequired(true)
    )
  )
  .addSubcommand(sub => sub
    .setName('option-reset')
    .setDescription('Réinitialiser l\'embed d\'une option à son apparence par défaut')
    .addStringOption(opt => opt
      .setName('option')
      .setDescription('Valeur de l\'option à réinitialiser (email, phone…)')
      .setRequired(true)
    )
  )

  // ── Embed sous-menu groupe ──────────────────────────────────────────────────
  .addSubcommand(sub => sub
    .setName('group')
    .setDescription('Personnaliser l\'embed du sous-menu d\'un groupe')
    .addStringOption(opt => opt.setName('groupe').setDescription('Identifiant du groupe (ex: operateurs)').setRequired(true))
    .addStringOption(opt => opt.setName('titre').setDescription('Titre de l\'embed du sous-menu'))
    .addStringOption(opt => opt.setName('description').setDescription('Description — variables : {groupe}, {emoji}'))
    .addStringOption(opt => opt.setName('couleur').setDescription('Couleur hex (ex: #5865f2)'))
    .addStringOption(opt => opt.setName('footer').setDescription('Texte du pied de page'))
    .addStringOption(opt => opt.setName('footer_icon').setDescription('URL de l\'icône du footer'))
    .addStringOption(opt => opt.setName('thumbnail').setDescription('URL de la miniature'))
    .addStringOption(opt => opt.setName('image').setDescription('URL de la grande image en bas'))
    .addAttachmentOption(opt => opt.setName('thumbnail_fichier').setDescription('Miniature depuis ta galerie'))
    .addAttachmentOption(opt => opt.setName('image_fichier').setDescription('Grande image depuis ta galerie'))
    .addAttachmentOption(opt => opt.setName('footer_icon_fichier').setDescription('Icône du footer depuis ta galerie'))
  )
  .addSubcommand(sub => sub
    .setName('group-reset')
    .setDescription('Réinitialiser l\'embed d\'un groupe à son apparence par défaut')
    .addStringOption(opt => opt.setName('groupe').setDescription('Identifiant du groupe').setRequired(true))
  );

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
  }

  const db  = getDB();
  const sub = interaction.options.getSubcommand();

  // ── SET (menu principal) ─────────────────────────────────────────────────────
  if (sub === 'set') {
    const current = db.prepare("SELECT value FROM guild_config WHERE key = 'embed_config'").get();
    let config = {};
    if (current) { try { config = JSON.parse(current.value); } catch {} }

    const title          = interaction.options.getString('title');
    const description    = interaction.options.getString('description');
    const color          = interaction.options.getString('color');
    const footer         = interaction.options.getString('footer');
    const footerIcon     = interaction.options.getString('footer_icon');
    const thumbnail      = interaction.options.getString('thumbnail');
    const image          = interaction.options.getString('image');
    const thumbnailFile  = interaction.options.getAttachment('thumbnail_fichier');
    const imageFile      = interaction.options.getAttachment('image_fichier');
    const footerIconFile = interaction.options.getAttachment('footer_icon_fichier');

    if (title)           config.title       = title;
    if (description)     config.description = description;
    if (color)           config.color       = color;
    if (footer)          config.footer      = footer;
    if (footerIcon)      config.footer_icon = footerIcon;
    if (footerIconFile)  config.footer_icon = footerIconFile.url;
    if (thumbnail)       config.thumbnail   = thumbnail;
    if (thumbnailFile)   config.thumbnail   = thumbnailFile.url;
    if (image)           config.image       = image;
    if (imageFile)       config.image       = imageFile.url;

    db.prepare("INSERT OR REPLACE INTO guild_config (key, value) VALUES ('embed_config', ?)").run(JSON.stringify(config));

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ Embed principal mis à jour')
        .setDescription('Utilise `/embed preview` pour voir le résultat.')
        .addFields(
          { name: 'Titre',        value: config.title       || '*(inchangé)*',  inline: true },
          { name: 'Couleur',      value: config.color       || '*(inchangée)*', inline: true },
          { name: 'Footer',       value: config.footer      || '*(inchangé)*',  inline: true },
          { name: 'Icône footer', value: config.footer_icon ? '✅ défini' : '*(aucun)*', inline: true },
          { name: 'Thumbnail',    value: config.thumbnail   ? '✅ défini' : '*(aucun)*', inline: true },
          { name: 'Image',        value: config.image       ? '✅ défini' : '*(aucune)*', inline: true }
        )
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── PREVIEW ──────────────────────────────────────────────────────────────────
  if (sub === 'preview') {
    const current = db.prepare("SELECT value FROM guild_config WHERE key = 'embed_config'").get();
    let config = {};
    if (current) { try { config = JSON.parse(current.value); } catch {} }

    const embed = new EmbedBuilder()
      .setColor(config.color ? parseInt(config.color.replace('#', ''), 16) : 0x5865f2)
      .setTitle(config.title || '🔍 Recherche de Données')
      .setDescription(config.description || 'Sélectionne une catégorie dans le menu ci-dessous pour effectuer ta recherche.')
      .setTimestamp();

    if (config.footer)    embed.setFooter({ text: config.footer, iconURL: config.footer_icon || undefined });
    if (config.thumbnail) embed.setThumbnail(config.thumbnail);
    if (config.image)     embed.setImage(config.image);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── RESET (menu principal) ───────────────────────────────────────────────────
  if (sub === 'reset') {
    db.prepare("DELETE FROM guild_config WHERE key = 'embed_config'").run();
    return interaction.reply({ content: '✅ L\'embed principal a été réinitialisé aux valeurs par défaut.', ephemeral: true });
  }

  // ── OPTION (embed résultats) ──────────────────────────────────────────────────
  if (sub === 'option') {
    const optionValue    = interaction.options.getString('option').toLowerCase().trim();
    const titre          = interaction.options.getString('titre');
    const description    = interaction.options.getString('description');
    const couleur        = interaction.options.getString('couleur')?.replace('#', '');
    const footer         = interaction.options.getString('footer');
    const footerIcon     = interaction.options.getString('footer_icon');
    const thumbnail      = interaction.options.getString('thumbnail')
                        || interaction.options.getAttachment('thumbnail_fichier')?.url;
    const image          = interaction.options.getString('image')
                        || interaction.options.getAttachment('image_fichier')?.url;
    const footerIconUrl  = footerIcon
                        || interaction.options.getAttachment('footer_icon_fichier')?.url;

    if (!titre && !description && !couleur && !footer && !footerIconUrl && !thumbnail && !image) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xffa500).setTitle('ℹ️ Comment configurer un embed de résultats')
          .setDescription(
            '**Exemple :**\n`/embed option option:email titre:📧 Résultat Email description:Requête : {query} footer:NΞXUS Searcher`\n\n' +
            '**Variables disponibles dans titre, description et footer :**\n' +
            '> `{query}` — la requête de l\'utilisateur\n' +
            '> `{type}` — le type de recherche (ex: Email)\n' +
            '> `{results}` — nombre de résultats trouvés\n' +
            '> `{user}` — pseudo de l\'utilisateur\n\n' +
            '**Images :** renseigne une URL **ou** upload un fichier directement via `thumbnail_fichier` / `image_fichier`.\n\n' +
            '**Options disponibles :** `email`, `phone`, `name`, `username`, `discord_id`, `ip`, `address`, `iban`, `password`, `intelx`, `nazapi` ou la valeur d\'une option custom.'
          )
          .setTimestamp()
        ],
        ephemeral: true
      });
    }

    const existing = db.prepare('SELECT * FROM option_embed_config WHERE option_value = ?').get(optionValue);
    if (existing) {
      const updates = [], vals = [];
      if (titre)        { updates.push('title = ?');       vals.push(titre); }
      if (description)  { updates.push('description = ?'); vals.push(description); }
      if (couleur)      { updates.push('color = ?');       vals.push(couleur); }
      if (thumbnail)    { updates.push('thumbnail = ?');   vals.push(thumbnail); }
      if (footer)       { updates.push('footer = ?');      vals.push(footer); }
      if (footerIconUrl){ updates.push('footer_icon = ?'); vals.push(footerIconUrl); }
      if (image)        { updates.push('image = ?');       vals.push(image); }
      vals.push(optionValue);
      db.prepare(`UPDATE option_embed_config SET ${updates.join(', ')} WHERE option_value = ?`).run(...vals);
    } else {
      db.prepare('INSERT INTO option_embed_config (option_value, title, description, color, thumbnail, footer, footer_icon, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(optionValue, titre || null, description || null, couleur || null, thumbnail || null, footer || null, footerIconUrl || null, image || null);
    }

    const previewColor = couleur ? parseInt(couleur, 16) : 0x57f287;
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(previewColor).setTitle('✅ Embed de résultat configuré')
        .addFields(
          { name: '🔍 Option',       value: `\`${optionValue}\``,                    inline: true },
          { name: '🔤 Titre',        value: titre       || '*inchangé*',             inline: true },
          { name: '🎨 Couleur',      value: couleur ? `#${couleur}` : '*inchangée*', inline: true },
          { name: '📝 Description',  value: description || '*inchangée*',            inline: false },
          { name: '🖼️ Thumbnail',    value: thumbnail   ? '✅ défini' : '*inchangé*', inline: true },
          { name: '🖼️ Image bas',    value: image       ? '✅ défini' : '*inchangée*', inline: true },
          { name: '📌 Footer',       value: footer      || '*inchangé*',             inline: true },
          { name: '🔳 Icône footer', value: footerIconUrl ? '✅ défini' : '*inchangé*', inline: true }
        )
        .setFooter({ text: VARIABLES_HINT })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── OPTION-VIEW ───────────────────────────────────────────────────────────────
  if (sub === 'option-view') {
    const optionValue = interaction.options.getString('option').toLowerCase().trim();
    const cfg = db.prepare('SELECT * FROM option_embed_config WHERE option_value = ?').get(optionValue);

    if (!cfg) {
      return interaction.reply({ content: `ℹ️ Aucune configuration d'embed pour \`${optionValue}\` (apparence par défaut).`, ephemeral: true });
    }

    const color = cfg.color ? parseInt(cfg.color, 16) : 0x5865f2;
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(color).setTitle(`🔍 Embed actuel — \`${optionValue}\``)
        .addFields(
          { name: '🔤 Titre',        value: cfg.title       || '*défaut*', inline: true },
          { name: '🎨 Couleur',      value: cfg.color ? `#${cfg.color}` : '*défaut*', inline: true },
          { name: '📝 Description',  value: cfg.description || '*défaut*', inline: false },
          { name: '🖼️ Thumbnail',    value: cfg.thumbnail   ? '✅ défini' : '*aucun*', inline: true },
          { name: '🖼️ Image bas',    value: cfg.image       ? '✅ défini' : '*aucune*', inline: true },
          { name: '📌 Footer',       value: cfg.footer      || '*aucun*',  inline: true },
          { name: '🔳 Icône footer', value: cfg.footer_icon ? '✅ défini' : '*aucune*', inline: true }
        )
        .setFooter({ text: VARIABLES_HINT })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── OPTION-RESET ──────────────────────────────────────────────────────────────
  if (sub === 'option-reset') {
    const optionValue = interaction.options.getString('option').toLowerCase().trim();
    const r = db.prepare('DELETE FROM option_embed_config WHERE option_value = ?').run(optionValue);

    if (r.changes === 0) {
      return interaction.reply({ content: `ℹ️ \`${optionValue}\` n'avait pas de configuration personnalisée.`, ephemeral: true });
    }
    return interaction.reply({ content: `✅ L'embed de \`${optionValue}\` a été réinitialisé par défaut.`, ephemeral: true });
  }

  // ── GROUP ─────────────────────────────────────────────────────────────────────
  if (sub === 'group') {
    const groupValue  = interaction.options.getString('groupe').toLowerCase().trim();
    const grp         = db.prepare('SELECT * FROM option_groups WHERE value = ?').get(groupValue);
    if (!grp) return interaction.reply({ content: `❌ Groupe \`${groupValue}\` introuvable. Vérifie avec \`/group list\`.`, ephemeral: true });

    const titre       = interaction.options.getString('titre');
    const description = interaction.options.getString('description');
    const couleur     = interaction.options.getString('couleur')?.replace('#', '');
    const footer      = interaction.options.getString('footer');
    const footerIcon  = interaction.options.getString('footer_icon');
    const thumbnail   = interaction.options.getString('thumbnail')
                     || interaction.options.getAttachment('thumbnail_fichier')?.url;
    const image       = interaction.options.getString('image')
                     || interaction.options.getAttachment('image_fichier')?.url;
    const footerIconUrl = footerIcon
                       || interaction.options.getAttachment('footer_icon_fichier')?.url;

    if (!titre && !description && !couleur && !footer && !footerIconUrl && !thumbnail && !image) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xffa500).setTitle('ℹ️ Configuration embed de groupe')
          .setDescription(
            `**Groupe :** ${grp.emoji} ${grp.label} (\`${groupValue}\`)\n\n` +
            '**Variables disponibles dans description :**\n' +
            '> `{groupe}` — nom du groupe\n> `{emoji}` — emoji du groupe\n\n' +
            '**Images :** renseigne une URL **ou** upload un fichier via `thumbnail_fichier` / `image_fichier`.\n\n' +
            '**Exemple :**\n`/embed group groupe:operateurs titre:📱 Opérateurs description:Bienvenue dans {groupe} !`'
          )
          .setTimestamp()
        ],
        ephemeral: true
      });
    }

    const existing = db.prepare('SELECT * FROM group_embed_config WHERE group_value = ?').get(groupValue);
    if (existing) {
      const updates = [], vals = [];
      if (titre)         { updates.push('title = ?');       vals.push(titre); }
      if (description)   { updates.push('description = ?'); vals.push(description); }
      if (couleur)       { updates.push('color = ?');       vals.push(couleur); }
      if (thumbnail)     { updates.push('thumbnail = ?');   vals.push(thumbnail); }
      if (footer)        { updates.push('footer = ?');      vals.push(footer); }
      if (footerIconUrl) { updates.push('footer_icon = ?'); vals.push(footerIconUrl); }
      if (image)         { updates.push('image = ?');       vals.push(image); }
      vals.push(groupValue);
      db.prepare(`UPDATE group_embed_config SET ${updates.join(', ')} WHERE group_value = ?`).run(...vals);
    } else {
      db.prepare('INSERT INTO group_embed_config (group_value, title, description, color, thumbnail, footer, footer_icon, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(groupValue, titre || null, description || null, couleur || null, thumbnail || null, footer || null, footerIconUrl || null, image || null);
    }

    const previewColor = couleur ? parseInt(couleur, 16) : 0x57f287;
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(previewColor).setTitle('✅ Embed du groupe configuré')
        .addFields(
          { name: '📂 Groupe',       value: `${grp.emoji} ${grp.label} (\`${groupValue}\`)`, inline: false },
          { name: '🔤 Titre',        value: titre       || '*inchangé*',                       inline: true },
          { name: '🎨 Couleur',      value: couleur ? `#${couleur}` : '*inchangée*',           inline: true },
          { name: '📝 Description',  value: description || '*inchangée*',                      inline: false },
          { name: '🖼️ Thumbnail',    value: thumbnail   ? '✅ défini' : '*inchangé*',           inline: true },
          { name: '🖼️ Image bas',    value: image       ? '✅ défini' : '*inchangée*',          inline: true },
          { name: '📌 Footer',       value: footer      || '*inchangé*',                       inline: true },
          { name: '🔳 Icône footer', value: footerIconUrl ? '✅ défini' : '*inchangé*',         inline: true }
        )
        .setFooter({ text: 'Variables : {groupe}, {emoji}' })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── GROUP-RESET ───────────────────────────────────────────────────────────────
  if (sub === 'group-reset') {
    const groupValue = interaction.options.getString('groupe').toLowerCase().trim();
    const r = db.prepare('DELETE FROM group_embed_config WHERE group_value = ?').run(groupValue);

    if (r.changes === 0) {
      return interaction.reply({ content: `ℹ️ Le groupe \`${groupValue}\` n'avait pas de configuration personnalisée.`, ephemeral: true });
    }
    return interaction.reply({ content: `✅ L'embed du groupe \`${groupValue}\` a été réinitialisé par défaut.`, ephemeral: true });
  }
}
