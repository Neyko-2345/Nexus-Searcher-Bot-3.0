import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { isAdmin } from '../utils/adminCheck.js';
import { isOwner } from '../utils/adminCheck.js';
import { getDB } from '../utils/database.js';

// ── Helpers embed boutons config ───────────────────────────────────────────
function getButtonConfig(db) {
  const rows = db.prepare('SELECT key, value FROM search_embed_buttons').all();
  const cfg = {};
  for (const r of rows) {
    try { cfg[r.key] = JSON.parse(r.value); } catch { cfg[r.key] = r.value; }
  }
  return cfg;
}

function buildSearchRow(db) {
  const cfg = getButtonConfig(db);

  const searchBtn = new ButtonBuilder()
    .setCustomId('launch_search')
    .setStyle(ButtonStyle.Primary);

  if (cfg.search_label !== undefined) searchBtn.setLabel(cfg.search_label);
  else searchBtn.setLabel('Rechercher');

  const searchEmoji = cfg.search_emoji || { id: '1511875326655856660', name: 'rechercher' };
  if (typeof searchEmoji === 'string') {
    const m = searchEmoji.match(/^<a?:(\w+):(\d+)>$/);
    if (m) searchBtn.setEmoji({ id: m[2], name: m[1] });
    else searchBtn.setEmoji({ name: searchEmoji });
  } else {
    searchBtn.setEmoji(searchEmoji);
  }

  const row = new ActionRowBuilder().addComponents(searchBtn);

  // Profile button — enabled by default
  const profileEnabled = cfg.profile_enabled !== false;
  if (profileEnabled) {
    const profileBtn = new ButtonBuilder()
      .setCustomId('user_profile')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: '1511875283467374713', name: 'user' });
    row.addComponents(profileBtn);
  }

  // Guide button — enabled by default
  const guideEnabled = cfg.guide_enabled !== false;
  if (guideEnabled) {
    const guideBtn = new ButtonBuilder()
      .setCustomId('user_guide')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: '1511875310302265414', name: 'ZippyRiri_Utility', animated: true });
    row.addComponents(guideBtn);
  }

  return row;
}

export const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('[ADMIN] Envoie l\'embed de recherche dans ce salon — ou gère l\'embed d\'info public')

  .addSubcommand(sub => sub
    .setName('deploy')
    .setDescription('Envoie l\'embed de recherche avec les boutons dans ce salon')
  )
  .addSubcommand(sub => sub
    .setName('info')
    .setDescription('Affiche l\'embed d\'information public dans ce salon (visible par tous)')
  )
  .addSubcommand(sub => sub
    .setName('info-set')
    .setDescription('Modifier l\'embed d\'info public (/search info)')
    .addStringOption(o => o.setName('title').setDescription('Titre de l\'embed'))
    .addStringOption(o => o.setName('description').setDescription('Description de l\'embed'))
    .addStringOption(o => o.setName('color').setDescription('Couleur hex (ex: #5865f2)'))
    .addStringOption(o => o.setName('footer').setDescription('Texte du footer'))
    .addStringOption(o => o.setName('footer_icon').setDescription('URL de l\'icône du footer'))
    .addStringOption(o => o.setName('thumbnail').setDescription('URL de la miniature'))
    .addStringOption(o => o.setName('image').setDescription('URL de la grande image'))
    .addAttachmentOption(o => o.setName('thumbnail_fichier').setDescription('Miniature depuis ta galerie'))
    .addAttachmentOption(o => o.setName('image_fichier').setDescription('Grande image depuis ta galerie'))
    .addAttachmentOption(o => o.setName('footer_icon_fichier').setDescription('Icône footer depuis ta galerie'))
  )

  // ── LOCK ──────────────────────────────────────────────────────────────────
  .addSubcommand(sub => sub
    .setName('lock')
    .setDescription('[OWNER] Verrouiller le panel de recherche de ce serveur')
  )
  .addSubcommand(sub => sub
    .setName('unlock')
    .setDescription('[OWNER] Déverrouiller le panel de recherche de ce serveur')
  )

  // ── BOUTON RECHERCHER config ───────────────────────────────────────────────
  .addSubcommand(sub => sub
    .setName('btn-search')
    .setDescription('[OWNER] Modifier le bouton Rechercher (label, emoji, couleur)')
    .addStringOption(o => o.setName('label').setDescription('Nouveau label (laisser vide = pas de label)'))
    .addStringOption(o => o.setName('emoji').setDescription('Nouvel emoji (ex: <:rechercher:123456>)'))
    .addStringOption(o => o.setName('couleur').setDescription('Couleur du bouton').addChoices(
      { name: '🔵 Bleu (Primary)', value: 'primary' },
      { name: '⚪ Gris (Secondary)', value: 'secondary' },
      { name: '🟢 Vert (Success)', value: 'success' },
      { name: '🔴 Rouge (Danger)', value: 'danger' },
    ))
  )

  // ── BOUTON PROFIL config ──────────────────────────────────────────────────
  .addSubcommand(sub => sub
    .setName('btn-profile')
    .setDescription('[OWNER] Activer ou désactiver le bouton profil dans l\'embed search')
    .addBooleanOption(o => o.setName('actif').setDescription('Activer le bouton profil ?').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('btn-guide')
    .setDescription('[OWNER] Activer ou désactiver le bouton guide dans l\'embed search')
    .addBooleanOption(o => o.setName('actif').setDescription('Activer le bouton guide ?').setRequired(true))
  )

  // ── EMBED PROFIL config ───────────────────────────────────────────────────
  .addSubcommand(sub => sub
    .setName('profile-set')
    .setDescription('[OWNER] Configurer l\'embed du profil utilisateur (bouton <:user:...>)')
    .addStringOption(o => o.setName('title').setDescription('Titre. Variables: {user} {plan} {credits} {max_credits} {next_reset} {searches}'))
    .addStringOption(o => o.setName('description').setDescription('Description. Variables: {user} {plan} {credits} {max_credits} {next_reset} {searches} {unlimited}'))
    .addStringOption(o => o.setName('footer').setDescription('Footer. Variables disponibles: {user} {plan}'))
    .addStringOption(o => o.setName('color').setDescription('Couleur hex (ex: 5865f2)'))
    .addStringOption(o => o.setName('contact_message').setDescription('Message de contact pour changer de plan (affiché sous l\'embed)'))
  )

  // ── EMBED GUIDE config ────────────────────────────────────────────────────
  .addSubcommand(sub => sub
    .setName('guide-set')
    .setDescription('[OWNER] Configurer l\'embed guide utilisateur (bouton <a:ZippyRiri_Utility:...>)')
    .addStringOption(o => o.setName('title').setDescription('Titre de l\'embed guide'))
    .addStringOption(o => o.setName('description').setDescription('Description complète du guide (markdown Discord supporté)'))
    .addStringOption(o => o.setName('footer').setDescription('Footer de l\'embed'))
    .addStringOption(o => o.setName('color').setDescription('Couleur hex (ex: 5865f2)'))
  );

export async function execute(interaction) {
  const db  = getDB();
  const sub = interaction.options.getSubcommand();

  // ── Commandes OWNER uniquement ────────────────────────────────────────────
  const ownerOnlyCommands = ['lock', 'unlock', 'btn-search', 'btn-profile', 'btn-guide', 'profile-set', 'guide-set'];
  if (ownerOnlyCommands.includes(sub)) {
    if (!isOwner(interaction.user.id)) {
      return interaction.reply({ content: '❌ Seuls les **owners** du bot peuvent utiliser cette commande.', ephemeral: true });
    }
  } else {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
    }
  }

  // ── DEPLOY ────────────────────────────────────────────────────────────────
  if (sub === 'deploy') {
    const cfgRow = db.prepare("SELECT value FROM guild_config WHERE key = 'embed_config'").get();
    let cfg = {};
    if (cfgRow) { try { cfg = JSON.parse(cfgRow.value); } catch {} }

    const embed = new EmbedBuilder()
      .setColor(cfg.color ? parseInt(cfg.color.replace('#', ''), 16) : 0x3B3B44)
      .setDescription(cfg.description ||
        `## <a:dsclookup:1510618934909599865> NΞXUS™ - L00kup\n\n` +
        `- Recherche & infos en un clic.\n` +
        `Choisis un outil dans le menu ci-dessous.\n\n` +
        `**<a:online:1508490406357110825> Services**\n` +
        `\`\`\`En ligne\`\`\`` +
        `**<:white_emoji_1453224614456201306_:1510618345106571395> Outils**\n` +
        `\`\`\`Email\nTéléphone\nNom / Prénom\nUsername\nAdresse IP\nDiscord ID\`\`\``
      );

    if (cfg.title)     embed.setTitle(cfg.title);
    if (cfg.footer)    embed.setFooter({ text: cfg.footer, iconURL: cfg.footer_icon || undefined });
    if (cfg.thumbnail) embed.setThumbnail(cfg.thumbnail);
    if (cfg.image)     embed.setImage(cfg.image);
    else if (!cfg.image && !cfg.title) embed.setImage('https://i.postimg.cc/3R5HjX9P/IMG-4685.jpg');

    embed.addFields({ name: '\u200b', value: '\u200b', inline: false });

    const row = buildSearchRow(db);

    return interaction.reply({ embeds: [embed], components: [row] });
  }

  // ── INFO ──────────────────────────────────────────────────────────────────
  if (sub === 'info') {
    const row = db.prepare("SELECT value FROM guild_config WHERE key = 'search_info_embed'").get();
    let cfg = {};
    if (row) { try { cfg = JSON.parse(row.value); } catch {} }

    const embed = new EmbedBuilder()
      .setColor(cfg.color ? parseInt(cfg.color.replace('#', ''), 16) : 0x5865f2)
      .setTitle(cfg.title || '🔍 NΞXUS™ S€archer — Informations')
      .setDescription(cfg.description || [
        '**Bienvenue sur le service de recherche NΞXUS™.**',
        '',
        'Ce bot vous permet de rechercher des informations à partir de différentes sources.',
        '',
        '**Comment utiliser le service :**',
        '> Cliquez sur le bouton **Rechercher** dans le salon dédié.',
        '> Choisissez un type de recherche dans le menu.',
        '> Entrez votre requête dans la boîte de saisie.',
        '',
        '> Les résultats sont **privés** — seul vous pouvez les voir.',
      ].join('\n'))
      .setTimestamp();

    if (cfg.footer)    embed.setFooter({ text: cfg.footer, iconURL: cfg.footer_icon || undefined });
    if (cfg.thumbnail) embed.setThumbnail(cfg.thumbnail);
    if (cfg.image)     embed.setImage(cfg.image);

    return interaction.reply({ embeds: [embed] });
  }

  // ── INFO-SET ──────────────────────────────────────────────────────────────
  if (sub === 'info-set') {
    const row = db.prepare("SELECT value FROM guild_config WHERE key = 'search_info_embed'").get();
    let cfg = {};
    if (row) { try { cfg = JSON.parse(row.value); } catch {} }

    const title         = interaction.options.getString('title');
    const description   = interaction.options.getString('description');
    const color         = interaction.options.getString('color');
    const footer        = interaction.options.getString('footer');
    const footerIcon    = interaction.options.getString('footer_icon');
    const thumbnail     = interaction.options.getString('thumbnail')    || interaction.options.getAttachment('thumbnail_fichier')?.url;
    const image         = interaction.options.getString('image')         || interaction.options.getAttachment('image_fichier')?.url;
    const footerIconUrl = footerIcon || interaction.options.getAttachment('footer_icon_fichier')?.url;

    if (title)        cfg.title       = title;
    if (description)  cfg.description = description;
    if (color)        cfg.color       = color;
    if (footer)       cfg.footer      = footer;
    if (footerIconUrl) cfg.footer_icon = footerIconUrl;
    if (thumbnail)    cfg.thumbnail   = thumbnail;
    if (image)        cfg.image       = image;

    db.prepare("INSERT OR REPLACE INTO guild_config (key, value) VALUES ('search_info_embed', ?)").run(JSON.stringify(cfg));

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ Embed d\'info mis à jour')
        .setDescription('Utilise `/search info` pour afficher le résultat dans un salon.')
        .addFields(
          { name: 'Titre',     value: cfg.title       || '*(défaut)*',  inline: true },
          { name: 'Couleur',   value: cfg.color       || '*(défaut)*',  inline: true },
          { name: 'Footer',    value: cfg.footer      || '*(aucun)*',   inline: true },
          { name: 'Thumbnail', value: cfg.thumbnail   ? '✅' : '*(aucun)*', inline: true },
          { name: 'Image',     value: cfg.image       ? '✅' : '*(aucune)*', inline: true },
        )
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── LOCK ──────────────────────────────────────────────────────────────────
  if (sub === 'lock') {
    const guildId = interaction.guildId;
    db.prepare('INSERT OR REPLACE INTO panel_locks (guild_id, locked, locked_by, locked_at) VALUES (?, 1, ?, ?)').run(
      guildId, interaction.user.id, new Date().toISOString()
    );
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xed4245).setTitle('🔒 Panel de recherche verrouillé')
        .setDescription('Les utilisateurs ne peuvent plus lancer de recherche sur ce serveur.\nUtilise `/search unlock` pour déverrouiller.')
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'unlock') {
    const guildId = interaction.guildId;
    db.prepare('INSERT OR REPLACE INTO panel_locks (guild_id, locked, locked_by, locked_at) VALUES (?, 0, ?, ?)').run(
      guildId, interaction.user.id, new Date().toISOString()
    );
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('🔓 Panel de recherche déverrouillé')
        .setDescription('Les utilisateurs peuvent de nouveau lancer des recherches.')
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── BTN-SEARCH ────────────────────────────────────────────────────────────
  if (sub === 'btn-search') {
    const label   = interaction.options.getString('label');
    const emoji   = interaction.options.getString('emoji');
    const couleur = interaction.options.getString('couleur');

    const styleMap = { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger };

    if (label !== null) db.prepare('INSERT OR REPLACE INTO search_embed_buttons (key, value) VALUES (?, ?)').run('search_label', JSON.stringify(label));
    if (emoji) db.prepare('INSERT OR REPLACE INTO search_embed_buttons (key, value) VALUES (?, ?)').run('search_emoji', JSON.stringify(emoji));
    if (couleur) db.prepare('INSERT OR REPLACE INTO search_embed_buttons (key, value) VALUES (?, ?)').run('search_style', JSON.stringify(couleur));

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ Bouton Rechercher mis à jour')
        .addFields(
          { name: '🏷️ Label',  value: label  !== null ? `\`${label || '(aucun)'}\`` : '*inchangé*', inline: true },
          { name: '😀 Emoji',  value: emoji  || '*inchangé*', inline: true },
          { name: '🎨 Couleur', value: couleur || '*inchangée*', inline: true },
        )
        .setFooter({ text: 'Re-déploie /search deploy pour voir les changements' }).setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── BTN-PROFILE ───────────────────────────────────────────────────────────
  if (sub === 'btn-profile') {
    const actif = interaction.options.getBoolean('actif');
    db.prepare('INSERT OR REPLACE INTO search_embed_buttons (key, value) VALUES (?, ?)').run('profile_enabled', JSON.stringify(actif));
    return interaction.reply({
      content: `✅ Bouton profil **${actif ? 'activé ✅' : 'désactivé ❌'}**. Re-déploie \`/search deploy\` pour voir l'effet.`,
      ephemeral: true
    });
  }

  // ── BTN-GUIDE ─────────────────────────────────────────────────────────────
  if (sub === 'btn-guide') {
    const actif = interaction.options.getBoolean('actif');
    db.prepare('INSERT OR REPLACE INTO search_embed_buttons (key, value) VALUES (?, ?)').run('guide_enabled', JSON.stringify(actif));
    return interaction.reply({
      content: `✅ Bouton guide **${actif ? 'activé ✅' : 'désactivé ❌'}**. Re-déploie \`/search deploy\` pour voir l'effet.`,
      ephemeral: true
    });
  }

  // ── PROFILE-SET ───────────────────────────────────────────────────────────
  if (sub === 'profile-set') {
    const row = db.prepare("SELECT value FROM search_embed_buttons WHERE key = 'profile_embed'").get();
    let cfg = {};
    if (row) { try { cfg = JSON.parse(row.value); } catch {} }

    const title          = interaction.options.getString('title');
    const description    = interaction.options.getString('description');
    const footer         = interaction.options.getString('footer');
    const color          = interaction.options.getString('color');
    const contactMessage = interaction.options.getString('contact_message');

    if (title)          cfg.title          = title;
    if (description)    cfg.description    = description;
    if (footer)         cfg.footer         = footer;
    if (color)          cfg.color          = color;
    if (contactMessage) cfg.contact_message = contactMessage;

    db.prepare('INSERT OR REPLACE INTO search_embed_buttons (key, value) VALUES (?, ?)').run('profile_embed', JSON.stringify(cfg));

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ Embed profil mis à jour')
        .setDescription(
          '**Variables disponibles :**\n' +
          '`{user}` — pseudo Discord\n`{plan}` — nom du plan\n`{credits}` — crédits restants\n' +
          '`{max_credits}` — max crédits/jour\n`{next_reset}` — prochain rechargement\n' +
          '`{searches}` — nb recherches faites\n`{unlimited}` — ♾️ ou vide'
        )
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── GUIDE-SET ─────────────────────────────────────────────────────────────
  if (sub === 'guide-set') {
    const row = db.prepare("SELECT value FROM search_embed_buttons WHERE key = 'guide_embed'").get();
    let cfg = {};
    if (row) { try { cfg = JSON.parse(row.value); } catch {} }

    const title       = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const footer      = interaction.options.getString('footer');
    const color       = interaction.options.getString('color');

    if (title)       cfg.title       = title;
    if (description) cfg.description = description;
    if (footer)      cfg.footer      = footer;
    if (color)       cfg.color       = color;

    db.prepare('INSERT OR REPLACE INTO search_embed_buttons (key, value) VALUES (?, ?)').run('guide_embed', JSON.stringify(cfg));

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ Embed guide mis à jour')
        .setDescription('L\'embed guide s\'affiche quand un utilisateur clique sur le bouton <a:ZippyRiri_Utility:1511875310302265414>.')
        .setTimestamp()
      ],
      ephemeral: true
    });
  }
}
