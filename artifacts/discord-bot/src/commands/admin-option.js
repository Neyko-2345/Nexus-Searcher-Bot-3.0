import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/adminCheck.js';
import { getDB } from '../utils/database.js';
import {
  GLOBAL_OPTION, DEFAULT_OPTIONS, VIP_OPTIONS,
  parseEmoji, getOptionsConfig, saveOptionsConfig,
  getHiddenOptions, setHiddenOptions
} from '../utils/optionsConfig.js';

const ALL_BUILTIN     = [...DEFAULT_OPTIONS, ...VIP_OPTIONS];
const ALL_FOR_EMOJI   = [GLOBAL_OPTION, ...DEFAULT_OPTIONS, ...VIP_OPTIONS];

function getAccessConfig(db) {
  const row = db.prepare("SELECT value FROM guild_config WHERE key = 'access_config'").get();
  if (!row) return {};
  try { return JSON.parse(row.value); } catch { return {}; }
}
function saveAccessConfig(db, config) {
  db.prepare("INSERT OR REPLACE INTO guild_config (key, value) VALUES ('access_config', ?)").run(JSON.stringify(config));
}
function toSlug(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').substring(0, 32);
}

export const data = new SlashCommandBuilder()
  .setName('option')
  .setDescription('[ADMIN] Gérer toutes les options de recherche du menu')

  // ── Gestion des options personnalisées ────────────────────────────────────
  .addSubcommand(sub => sub
    .setName('add')
    .setDescription('Ajouter une option personnalisée au menu de recherche')
    .addStringOption(o => o.setName('label').setDescription('Nom affiché dans le menu (ex: Steam ID)').setRequired(true).setMaxLength(25))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji (unicode ou <:nom:id> ou <a:nom:id>)').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Sous-titre dans le menu (max 50 car.)').setRequired(true).setMaxLength(50))
    .addStringOption(o => o.setName('modal_label').setDescription('Titre du champ dans le formulaire').setRequired(true).setMaxLength(45))
    .addStringOption(o => o.setName('modal_placeholder').setDescription('Texte d\'exemple dans le formulaire').setMaxLength(100))
    .addStringOption(o => o.setName('modal_hint').setDescription('Message d\'aide sous le formulaire').setMaxLength(100))
    .addBooleanOption(o => o.setName('vip_only').setDescription('Réserver aux VIP et Admins ?'))
    .addIntegerOption(o => o.setName('position').setDescription('Position dans le menu (défaut: 99)').setMinValue(1).setMaxValue(99))
  )
  .addSubcommand(sub => sub
    .setName('remove')
    .setDescription('Supprimer/masquer une option (custom → supprimée définitivement, intégrée → masquée du menu)')
    .addStringOption(o => o.setName('label').setDescription('Nom de l\'option (intégrée ou personnalisée) — ex: Email, Téléphone, MonOption…').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('edit')
    .setDescription('Modifier une option personnalisée existante')
    .addStringOption(o => o.setName('label').setDescription('Nom exact de l\'option à modifier').setRequired(true))
    .addStringOption(o => o.setName('new_label').setDescription('Nouveau nom').setMaxLength(25))
    .addStringOption(o => o.setName('emoji').setDescription('Nouvel emoji'))
    .addStringOption(o => o.setName('description').setDescription('Nouvelle description').setMaxLength(50))
    .addStringOption(o => o.setName('modal_label').setDescription('Nouveau titre du formulaire').setMaxLength(45))
    .addStringOption(o => o.setName('modal_placeholder').setDescription('Nouveau placeholder').setMaxLength(100))
    .addStringOption(o => o.setName('modal_hint').setDescription('Nouveau message d\'aide').setMaxLength(100))
    .addBooleanOption(o => o.setName('vip_only').setDescription('Réserver aux VIP ?'))
    .addIntegerOption(o => o.setName('position').setDescription('Nouvelle position').setMinValue(1).setMaxValue(99))
  )
  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('Voir TOUTES les options du bot : intégrées, VIP, personnalisées et masquées')
  )
  .addSubcommand(sub => sub
    .setName('restore')
    .setDescription('Réafficher une option intégrée masquée dans le menu')
    .addStringOption(o => o.setName('label').setDescription('Nom exact de l\'option intégrée (ex: Email, Adresse…)').setRequired(true))
  )

  // ── Gestion des emojis ────────────────────────────────────────────────────
  .addSubcommand(sub => sub
    .setName('emoji')
    .setDescription('Modifier l\'emoji d\'une option du menu (intégrées + Global)')
    .addStringOption(opt => opt
      .setName('option').setDescription('Option à modifier').setRequired(true)
      .addChoices(...ALL_FOR_EMOJI.map(o => ({ name: o.label, value: o.value })))
    )
    .addStringOption(opt => opt
      .setName('nouvel_emoji').setDescription('Emoji à utiliser (unicode ou <:nom:id> ou <a:nom:id>)').setRequired(true)
    )
  )
  .addSubcommand(sub => sub
    .setName('emoji-list')
    .setDescription('Voir tous les emojis actuels des options intégrées')
  )
  .addSubcommand(sub => sub
    .setName('emoji-reset')
    .setDescription('Remettre tous les emojis par défaut')
  )

  // ── Gestion des accès ─────────────────────────────────────────────────────
  .addSubcommand(sub => sub
    .setName('access')
    .setDescription('Définir l\'accès d\'une option (plan ou libre)')
    .addStringOption(opt => opt
      .setName('option').setDescription('Option à configurer').setRequired(true)
      .addChoices(...ALL_BUILTIN.map(o => ({ name: `${o.defaultEmoji} ${o.label}`, value: o.value })))
    )
    .addStringOption(opt => opt
      .setName('mode').setDescription('Mode d\'accès : "free" ou le nom exact d\'un plan (ex: vip, premium)').setRequired(true)
    )
  )
  .addSubcommand(sub => sub
    .setName('access-bulk')
    .setDescription('Passer toutes les options sur un plan ou en libre d\'un coup')
    .addStringOption(opt => opt
      .setName('mode').setDescription('Mode : "free" = tout le monde, ou le nom exact d\'un plan (ex: vip, premium)').setRequired(true)
    )
  )
  .addSubcommand(sub => sub
    .setName('access-credits')
    .setDescription('Définir le nombre de recherches journalières pour le plan gratuit')
    .addIntegerOption(opt => opt
      .setName('nombre').setDescription('Nombre de recherches par jour').setRequired(true).setMinValue(1).setMaxValue(100)
    )
  )
  .addSubcommand(sub => sub
    .setName('access-list')
    .setDescription('Voir les accès actuels de toutes les options')
  )
  .addSubcommand(sub => sub
    .setName('ids')
    .setDescription('Voir tous les identifiants d\'options, groupes et bases pour /plugin add, /db edit, /group add…')
  );

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
  }

  const db  = getDB();
  const sub = interaction.options.getSubcommand();

  // ── ADD ───────────────────────────────────────────────────────────────────
  if (sub === 'add') {
    const label       = interaction.options.getString('label');
    const emoji       = interaction.options.getString('emoji').trim();
    const description = interaction.options.getString('description');
    const modalLabel  = interaction.options.getString('modal_label');
    const placeholder = interaction.options.getString('modal_placeholder') || label;
    const hint        = interaction.options.getString('modal_hint') || '';
    const vipOnly     = interaction.options.getBoolean('vip_only') ?? false;
    const position    = interaction.options.getInteger('position') ?? 99;
    const value       = toSlug(label);

    const parsed = parseEmoji(emoji);
    if (!parsed) return interaction.reply({ content: `❌ Emoji invalide : \`${emoji}\``, ephemeral: true });

    const totalFixed  = 13;
    const customCount = db.prepare('SELECT COUNT(*) as c FROM custom_options').get().c;
    if (totalFixed + customCount >= 25) {
      return interaction.reply({ content: '❌ Limite atteinte : maximum 25 options au total.', ephemeral: true });
    }

    const existing = db.prepare('SELECT id FROM custom_options WHERE value = ? OR label = ?').get(value, label);
    if (existing) return interaction.reply({ content: `❌ Une option \`${label}\` existe déjà.`, ephemeral: true });

    db.prepare(`
      INSERT INTO custom_options (value, label, description, emoji, modal_label, modal_placeholder, modal_hint, vip_only, position, added_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(value, label, description, emoji, modalLabel, placeholder, hint, vipOnly ? 1 : 0, position, interaction.user.id);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x3B3B44).setTitle('✅ Option ajoutée au menu')
        .addFields(
          { name: '🏷️ Label',       value: `${emoji} ${label}`,              inline: true },
          { name: '📋 Description', value: description,                       inline: true },
          { name: '📝 Formulaire',  value: `**${modalLabel}**\n*${placeholder}*`, inline: false },
          { name: '🔒 VIP only',    value: vipOnly ? 'Oui' : 'Non',          inline: true },
          { name: '📍 Position',    value: `#${position}`,                    inline: true }
        )
        .setFooter({ text: 'L\'option apparaît immédiatement dans le menu.' }).setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── REMOVE ────────────────────────────────────────────────────────────────
  if (sub === 'remove') {
    const label = interaction.options.getString('label');
    const customOpt = db.prepare('SELECT * FROM custom_options WHERE label = ?').get(label);
    if (customOpt) {
      db.prepare('DELETE FROM custom_options WHERE label = ?').run(label);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xff4444).setTitle('🗑️ Option supprimée')
          .setDescription(`L'option personnalisée **${customOpt.emoji} ${customOpt.label}** a été supprimée définitivement.`)
          .setTimestamp()
        ],
        ephemeral: true
      });
    }
    const builtin = ALL_FOR_EMOJI.find(o => o.label.toLowerCase() === label.toLowerCase());
    if (builtin) {
      const hidden = getHiddenOptions();
      if (hidden.includes(builtin.value)) {
        return interaction.reply({ content: `⚠️ **${builtin.label}** est déjà masquée.`, ephemeral: true });
      }
      setHiddenOptions([...hidden, builtin.value]);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xffa500).setTitle('👁️ Option masquée')
          .setDescription(`**${builtin.defaultEmoji} ${builtin.label}** est masquée du menu.\nPour la réafficher : \`/option restore label:${builtin.label}\``)
          .setTimestamp()
        ],
        ephemeral: true
      });
    }
    return interaction.reply({ content: `❌ Option introuvable : \`${label}\``, ephemeral: true });
  }

  // ── EDIT ──────────────────────────────────────────────────────────────────
  if (sub === 'edit') {
    const label = interaction.options.getString('label');
    const opt   = db.prepare('SELECT * FROM custom_options WHERE label = ?').get(label);
    if (!opt) return interaction.reply({ content: `❌ Option introuvable : \`${label}\``, ephemeral: true });

    const newLabel       = interaction.options.getString('new_label')         ?? opt.label;
    const newEmoji       = interaction.options.getString('emoji')?.trim()     ?? opt.emoji;
    const newDesc        = interaction.options.getString('description')       ?? opt.description;
    const newModalLabel  = interaction.options.getString('modal_label')       ?? opt.modal_label;
    const newPlaceholder = interaction.options.getString('modal_placeholder') ?? opt.modal_placeholder;
    const newHint        = interaction.options.getString('modal_hint')        ?? opt.modal_hint;
    const newVip         = interaction.options.getBoolean('vip_only')         ?? (opt.vip_only === 1);
    const newPos         = interaction.options.getInteger('position')         ?? opt.position;
    const newValue       = toSlug(newLabel);

    db.prepare(`
      UPDATE custom_options SET value=?,label=?,description=?,emoji=?,
      modal_label=?,modal_placeholder=?,modal_hint=?,vip_only=?,position=?
      WHERE label=?
    `).run(newValue, newLabel, newDesc, newEmoji, newModalLabel, newPlaceholder, newHint, newVip ? 1 : 0, newPos, label);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x3B3B44).setTitle('✏️ Option modifiée')
        .addFields(
          { name: 'Label',       value: `${newEmoji} ${newLabel}`, inline: true },
          { name: 'Description', value: newDesc,                   inline: true },
          { name: 'VIP only',    value: newVip ? 'Oui' : 'Non',   inline: true }
        ).setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── LIST ──────────────────────────────────────────────────────────────────
  if (sub === 'list') {
    const customOpts   = db.prepare('SELECT * FROM custom_options ORDER BY position ASC, id ASC').all();
    const hidden       = getHiddenOptions();
    const emojiCfg     = getOptionsConfig();
    const accessCfg    = getAccessConfig(db);

    function getEmoji(opt) {
      return emojiCfg[opt.value] || opt.defaultEmoji;
    }
    function getAccess(val) {
      const raw = accessCfg[val];
      if (!raw) return (val === 'intelx' || val === 'nazapi') ? '🔒 VIP' : '🌍 Libre';
      return raw === 'vip' ? '🔒 VIP' : '🌍 Libre';
    }

    const lines = [];

    // Global
    const globalStatus = hidden.includes('global') ? ' *(masquée)*' : '';
    lines.push(`${getEmoji(GLOBAL_OPTION)} **Global**${globalStatus} — 🔍 Toutes les bases`);
    lines.push('');

    // Built-in options
    const visibleDefault  = DEFAULT_OPTIONS.filter(o => !hidden.includes(o.value));
    const hiddenDefault   = DEFAULT_OPTIONS.filter(o =>  hidden.includes(o.value));
    const visibleVip      = VIP_OPTIONS.filter(o => !hidden.includes(o.value));
    const hiddenVip       = VIP_OPTIONS.filter(o =>  hidden.includes(o.value));

    if (visibleDefault.length > 0) {
      lines.push('**🔧 Options intégrées**');
      visibleDefault.forEach(o => lines.push(`${getEmoji(o)} ${o.label} • ${getAccess(o.value)}`));
      lines.push('');
    }

    if (visibleVip.length > 0) {
      lines.push('**⭐ Options VIP intégrées**');
      visibleVip.forEach(o => lines.push(`${getEmoji(o)} ${o.label} • ${getAccess(o.value)}`));
      lines.push('');
    }

    if (customOpts.length > 0) {
      lines.push(`**🛠️ Options personnalisées (${customOpts.length})**`);
      customOpts.forEach(o => lines.push(`${o.emoji} ${o.label} • ${o.vip_only ? '🔒 VIP' : '🌍 Libre'} • \`#${o.position}\``));
      lines.push('');
    }

    const allHidden = [...hiddenDefault, ...hiddenVip, ...(hidden.includes('global') ? [GLOBAL_OPTION] : [])];
    if (allHidden.length > 0) {
      lines.push(`**🙈 Masquées (${allHidden.length})** — \`/option restore label:...\` pour réafficher`);
      allHidden.forEach(o => lines.push(`~~${o.defaultEmoji} ${o.label}~~`));
    }

    const credRow   = db.prepare("SELECT value FROM guild_config WHERE key = 'free_daily_credits'").get();
    const freeCreds = credRow?.value || '5';
    const totalVisi = (hidden.includes('global') ? 0 : 1) + visibleDefault.length + visibleVip.length + customOpts.length;

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x3B3B44)
        .setTitle(`🎛️ Toutes les options — ${totalVisi} visible(s), ${allHidden.length} masquée(s)`)
        .setDescription(lines.join('\n').substring(0, 4000))
        .addFields({ name: '💳 Plan gratuit', value: `${freeCreds} recherche(s)/jour`, inline: true })
        .setFooter({ text: '/option emoji • /option access • /option add' })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── RESTORE ───────────────────────────────────────────────────────────────
  if (sub === 'restore') {
    const label   = interaction.options.getString('label');
    const builtin = ALL_FOR_EMOJI.find(o => o.label.toLowerCase() === label.toLowerCase());
    if (!builtin) {
      return interaction.reply({ content: `❌ Option intégrée \`${label}\` introuvable. Exemples: Email, Téléphone, Adresse…`, ephemeral: true });
    }
    const hidden = getHiddenOptions();
    if (!hidden.includes(builtin.value)) {
      return interaction.reply({ content: `⚠️ **${builtin.label}** n'est pas masquée.`, ephemeral: true });
    }
    setHiddenOptions(hidden.filter(v => v !== builtin.value));
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ Option réaffichée')
        .setDescription(`**${builtin.defaultEmoji} ${builtin.label}** est de nouveau visible dans le menu.`)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── EMOJI ─────────────────────────────────────────────────────────────────
  if (sub === 'emoji') {
    const optionKey = interaction.options.getString('option');
    const emoji     = interaction.options.getString('nouvel_emoji').trim();
    const optInfo   = ALL_FOR_EMOJI.find(o => o.value === optionKey);

    const config = getOptionsConfig();
    config[optionKey] = emoji;
    saveOptionsConfig(config);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x3B3B44).setTitle('✅ Emoji mis à jour')
        .addFields(
          { name: 'Option',      value: optInfo?.label || optionKey, inline: true },
          { name: 'Nouvel emoji', value: emoji,                      inline: true }
        )
        .setFooter({ text: 'S\'applique immédiatement au prochain clic.' }).setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'emoji-list') {
    const config = getOptionsConfig();
    const fields = ALL_FOR_EMOJI.map(opt => ({
      name: opt.label,
      value: config[opt.value] || opt.defaultEmoji,
      inline: true
    }));
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x3B3B44).setTitle('🎨 Emojis des options')
        .addFields(fields)
        .setFooter({ text: 'Utilise /option emoji pour modifier.' }).setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'emoji-reset') {
    saveOptionsConfig({});
    return interaction.reply({ content: '✅ Tous les emojis ont été réinitialisés par défaut.', ephemeral: true });
  }

  // ── ACCESS ────────────────────────────────────────────────────────────────
  if (sub === 'access') {
    const option = interaction.options.getString('option');
    const mode   = interaction.options.getString('mode').trim().toLowerCase();
    const config = getAccessConfig(db);

    // Reset to free
    if (mode === 'free') {
      config[option] = 'free';
    } else {
      // Check if the plan name exists
      const plans = db.prepare('SELECT * FROM plans').all();
      const planMatch = plans.find(p => p.plan_name.toLowerCase() === mode);
      if (!planMatch) {
        const planList = plans.length > 0
          ? plans.map(p => `\`${p.plan_name}\``).join(', ')
          : '*Aucun plan créé — utilise `/plan set`*';
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xed4245).setTitle('❌ Plan introuvable')
            .setDescription(`Le plan \`${mode}\` n'existe pas.\n\n**Plans disponibles :** ${planList}\n\nUtilise \`free\` pour rendre l'option libre.`)
            .setTimestamp()
          ],
          ephemeral: true
        });
      }
      config[option] = planMatch.plan_name.toLowerCase();
    }

    saveAccessConfig(db, config);
    const optInfo   = ALL_BUILTIN.find(o => o.value === option);
    const modeLabel = mode === 'free' ? '🌍 Libre — ouvert à tous' : `🔒 Plan \`${mode}\` requis`;
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(mode === 'free' ? 0x57f287 : 0xfee75c).setTitle('✅ Accès mis à jour')
        .addFields(
          { name: 'Option', value: (optInfo?.defaultEmoji || '') + ' ' + (optInfo?.label || option), inline: true },
          { name: 'Accès',  value: modeLabel, inline: true }
        )
        .setFooter({ text: 'Actif immédiatement.' }).setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'access-bulk') {
    const mode = interaction.options.getString('mode').trim().toLowerCase();
    // Valider : 'free' ou un plan existant en DB
    if (mode !== 'free') {
      const planExists = db.prepare('SELECT 1 FROM plans WHERE plan_name = ?').get(mode);
      if (!planExists) {
        const plans = db.prepare('SELECT plan_name FROM plans').all().map(p => p.plan_name);
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xed4245).setTitle('❌ Plan introuvable')
            .setDescription(`Le plan \`${mode}\` n'existe pas.\n\n**Plans disponibles :** ${plans.length ? plans.map(p => `\`${p}\``).join(', ') : '*Aucun plan configuré*'}\n\nUtilise \`free\` pour tout le monde ou le nom exact d'un plan.`)
          ],
          ephemeral: true
        });
      }
    }
    const config = getAccessConfig(db);
    for (const o of ALL_BUILTIN) config[o.value] = mode;
    saveAccessConfig(db, config);
    const modeLabel = mode === 'free' ? '🌍 Libre — ouvert à tous' : `🔒 Réservé au plan **${mode}**`;
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(mode === 'free' ? 0x57f287 : 0xfee75c).setTitle('✅ Toutes les options mises à jour')
        .setDescription(`Toutes les options sont maintenant en mode ${modeLabel}.`).setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'access-credits') {
    const nombre = interaction.options.getInteger('nombre');
    db.prepare("INSERT OR REPLACE INTO guild_config (key, value) VALUES ('free_daily_credits', ?)").run(String(nombre));
    db.prepare("UPDATE users SET max_daily_credits = ?, credits = ? WHERE plan = 'free'").run(nombre, nombre);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2).setTitle('✅ Crédits du plan gratuit mis à jour')
        .setDescription(`Les utilisateurs en plan **gratuit** ont maintenant **${nombre} recherche(s)/jour**.`).setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'access-list') {
    const config    = getAccessConfig(db);
    const credRow   = db.prepare("SELECT value FROM guild_config WHERE key = 'free_daily_credits'").get();
    const freeCreds = credRow?.value || '5';
    const fields    = ALL_BUILTIN.map(o => {
      const mode = config[o.value];
      let display = !mode
        ? (o.value === 'intelx' || o.value === 'nazapi' ? '🔒 VIP (défaut)' : '🌍 Libre (défaut)')
        : (mode === 'vip' ? '🔒 VIP uniquement' : '🌍 Libre');
      return { name: `${o.defaultEmoji} ${o.label}`, value: display, inline: true };
    });
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x3B3B44).setTitle('🔐 Accès des options de recherche')
        .addFields(fields)
        .addFields({ name: '\u200b', value: `**Plan gratuit :** ${freeCreds} recherche(s)/jour`, inline: false })
        .setFooter({ text: 'Utilise /option access pour modifier.' }).setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── IDS ───────────────────────────────────────────────────────────────────
  if (sub === 'ids') {
    const builtins = [...DEFAULT_OPTIONS, ...VIP_OPTIONS];
    const customs  = db.prepare('SELECT * FROM custom_options ORDER BY position').all();
    const groups   = db.prepare('SELECT * FROM option_groups ORDER BY position').all();
    const items    = db.prepare('SELECT * FROM option_group_items ORDER BY group_value, position').all();
    const bases    = db.prepare('SELECT name, label, emoji FROM databases ORDER BY name').all();

    const lines = [];

    lines.push('**📋 Options intégrées** — à utiliser dans `/plugin add option:`, `/db edit options:`, `/embed option option:`');
    for (const o of builtins) {
      const tag = (o.value === 'intelx' || o.value === 'nazapi') ? ' *(VIP)*' : '';
      lines.push(`> \`${o.value}\` — ${o.defaultEmoji} ${o.label}${tag}`);
    }

    if (customs.length > 0) {
      lines.push('\n**📝 Options personnalisées**');
      for (const o of customs) {
        lines.push(`> \`${o.value}\` — ${o.emoji} ${o.label}`);
      }
    } else {
      lines.push('\n**📝 Options personnalisées** — *aucune*');
    }

    if (groups.length > 0) {
      lines.push('\n**📂 Groupes** — ID pour `/embed group groupe:`, `/group config valeur:`');
      for (const g of groups) {
        lines.push(`> \`${g.value}\` — ${g.emoji} ${g.label}`);
        const gItems = items.filter(i => i.group_value === g.value);
        for (const it of gItems) {
          lines.push(`>  ↳ \`${it.target_value}\` — ${it.emoji || ''} ${it.label}`);
        }
      }
    } else {
      lines.push('\n**📂 Groupes** — *aucun*');
    }

    if (bases.length > 0) {
      lines.push('\n**🗄️ Bases de données** — préfixe `db_` pour cibler dans `/group add cible:`');
      for (const b of bases) {
        lines.push(`> \`db_${b.name}\` — ${b.emoji || '🗄️'} ${b.label || b.name}`);
      }
    }

    const desc = lines.join('\n');
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x3B3B44).setTitle('📋 Identifiants disponibles')
        .setDescription(desc.substring(0, 4096))
        .setFooter({ text: 'Ces IDs s\'utilisent dans /plugin add, /db edit options:, /embed option option:, /group add cible:, etc.' })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }
}
