import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/adminCheck.js';
import { getDB } from '../utils/database.js';

export const data = new SlashCommandBuilder()
  .setName('group')
  .setDescription('[ADMIN] Créer des groupes/sous-menus dans le menu de recherche')

  .addSubcommand(sub => sub
    .setName('create')
    .setDescription('Créer un nouveau groupe (apparaît dans le menu principal → ouvre un sous-menu)')
    .addStringOption(o => o.setName('valeur').setDescription('Identifiant unique du groupe (ex: operateurs, services)').setRequired(true))
    .addStringOption(o => o.setName('label').setDescription('Nom affiché dans le menu (ex: Opérateurs)').setRequired(true))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji du groupe (ex: 📱)').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Sous-titre affiché dans le menu principal'))
    .addBooleanOption(o => o.setName('vip').setDescription('Restreindre ce groupe aux VIP uniquement'))
    .addIntegerOption(o => o.setName('position').setDescription('Position dans le menu (défaut: 50)').setMinValue(1).setMaxValue(99))
  )

  .addSubcommand(sub => sub
    .setName('config')
    .setDescription('Personnaliser l\'embed du sous-menu d\'un groupe')
    .addStringOption(o => o.setName('valeur').setDescription('Identifiant du groupe (ex: operateurs)').setRequired(true))
    .addStringOption(o => o.setName('titre').setDescription('Titre de l\'embed du sous-menu'))
    .addStringOption(o => o.setName('description').setDescription('Description de l\'embed (supporte {groupe} et {emoji})'))
    .addStringOption(o => o.setName('couleur').setDescription('Couleur hex (ex: #5865f2)'))
    .addStringOption(o => o.setName('thumbnail').setDescription('URL de la miniature'))
  )

  .addSubcommand(sub => sub
    .setName('add')
    .setDescription('Ajouter un élément dans un groupe')
    .addStringOption(o => o.setName('groupe').setDescription('Identifiant du groupe parent (ex: operateurs)').setRequired(true))
    .addStringOption(o => o.setName('cible').setDescription('Ce qui se lance quand on clique : db_sfr, email, custom_steam…').setRequired(true))
    .addStringOption(o => o.setName('label').setDescription('Nom affiché dans le sous-menu (ex: SFR)').setRequired(true))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji de l\'élément (ex: 📱)'))
    .addStringOption(o => o.setName('description').setDescription('Sous-titre de l\'élément dans le sous-menu'))
    .addIntegerOption(o => o.setName('position').setDescription('Position dans le sous-menu').setMinValue(1).setMaxValue(99))
  )

  .addSubcommand(sub => sub
    .setName('remove-item')
    .setDescription('Retirer un élément d\'un groupe')
    .addStringOption(o => o.setName('groupe').setDescription('Identifiant du groupe').setRequired(true))
    .addStringOption(o => o.setName('cible').setDescription('La valeur cible à retirer (db_sfr, email…)').setRequired(true))
  )

  .addSubcommand(sub => sub
    .setName('delete')
    .setDescription('Supprimer entièrement un groupe et tous ses éléments')
    .addStringOption(o => o.setName('valeur').setDescription('Identifiant du groupe').setRequired(true))
  )

  .addSubcommand(sub => sub
    .setName('emoji')
    .setDescription('Modifier l\'emoji d\'un élément dans le sous-menu d\'un groupe')
    .addStringOption(o => o.setName('groupe').setDescription('Identifiant du groupe (ex: operateurs)').setRequired(true))
    .addStringOption(o => o.setName('cible').setDescription('Valeur cible de l\'élément (ex: db_sfr, email…)').setRequired(true))
    .addStringOption(o => o.setName('emoji').setDescription('Nouvel emoji (unicode ou <:nom:id>)').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('Voir tous les groupes et leurs éléments')
  );

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
  }

  const db  = getDB();
  const sub = interaction.options.getSubcommand();

  // ── CREATE ────────────────────────────────────────────────────────────────
  if (sub === 'create') {
    const valeur      = interaction.options.getString('valeur').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const label       = interaction.options.getString('label');
    const emoji       = interaction.options.getString('emoji');
    const description = interaction.options.getString('description') || `Recherche ${label}`;
    const vip         = interaction.options.getBoolean('vip') ? 1 : 0;
    const position    = interaction.options.getInteger('position') || 50;

    const existing = db.prepare('SELECT id FROM option_groups WHERE value = ?').get(valeur);
    if (existing) return interaction.reply({ content: `❌ Un groupe \`${valeur}\` existe déjà.`, ephemeral: true });

    db.prepare(`
      INSERT INTO option_groups (value, label, emoji, description, vip_only, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(valeur, label, emoji, description, vip, position);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ Groupe créé')
        .setDescription(`Le groupe **${emoji} ${label}** est maintenant visible dans le menu de recherche.\nAjoute-y des éléments avec \`/group add groupe:${valeur}\``)
        .addFields(
          { name: 'Identifiant', value: `\`${valeur}\``, inline: true },
          { name: 'Accès',       value: vip ? '🔒 VIP' : '🌍 Libre', inline: true },
          { name: 'Position',    value: `\`${position}\``, inline: true }
        )
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── CONFIG EMBED ──────────────────────────────────────────────────────────
  if (sub === 'config') {
    const valeur      = interaction.options.getString('valeur').toLowerCase();
    const grp         = db.prepare('SELECT * FROM option_groups WHERE value = ?').get(valeur);
    if (!grp) return interaction.reply({ content: `❌ Groupe \`${valeur}\` introuvable.`, ephemeral: true });

    const titre       = interaction.options.getString('titre');
    const description = interaction.options.getString('description');
    const couleur     = interaction.options.getString('couleur')?.replace('#', '');
    const thumbnail   = interaction.options.getString('thumbnail');

    if (!titre && !description && !couleur && !thumbnail) {
      return interaction.reply({ content: '❌ Indique au moins un champ à modifier (titre, description, couleur ou thumbnail).', ephemeral: true });
    }

    const existing = db.prepare('SELECT * FROM group_embed_config WHERE group_value = ?').get(valeur);
    if (existing) {
      const updates = [], vals = [];
      if (titre)       { updates.push('title = ?');       vals.push(titre); }
      if (description) { updates.push('description = ?'); vals.push(description); }
      if (couleur)     { updates.push('color = ?');       vals.push(couleur); }
      if (thumbnail)   { updates.push('thumbnail = ?');   vals.push(thumbnail); }
      vals.push(valeur);
      db.prepare(`UPDATE group_embed_config SET ${updates.join(', ')} WHERE group_value = ?`).run(...vals);
    } else {
      db.prepare('INSERT INTO group_embed_config (group_value, title, description, color, thumbnail) VALUES (?, ?, ?, ?, ?)')
        .run(valeur, titre || null, description || null, couleur || null, thumbnail || null);
    }

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(couleur ? parseInt(couleur, 16) : 0x57f287)
        .setTitle('✅ Embed du groupe configuré')
        .addFields(
          { name: '📂 Groupe',      value: `${grp.emoji} ${grp.label} (\`${valeur}\`)`, inline: false },
          { name: '🔤 Titre',       value: titre || '*inchangé*',                        inline: true },
          { name: '🎨 Couleur',     value: couleur ? `#${couleur}` : '*inchangée*',      inline: true },
          { name: '📝 Description', value: description || '*inchangée*',                 inline: false }
        )
        .setFooter({ text: 'Supporte {groupe} et {emoji} dans la description' })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── ADD ITEM ──────────────────────────────────────────────────────────────
  if (sub === 'add') {
    const groupe      = interaction.options.getString('groupe').toLowerCase();
    const cible       = interaction.options.getString('cible').trim();
    const label       = interaction.options.getString('label');
    const emoji       = interaction.options.getString('emoji') || '';
    const description = interaction.options.getString('description') || '';
    const position    = interaction.options.getInteger('position') || 99;

    const grp = db.prepare('SELECT * FROM option_groups WHERE value = ?').get(groupe);
    if (!grp) return interaction.reply({ content: `❌ Groupe \`${groupe}\` introuvable. Crée-le d'abord avec \`/group create\`.`, ephemeral: true });

    const existing = db.prepare('SELECT id FROM option_group_items WHERE group_value = ? AND target_value = ?').get(groupe, cible);
    if (existing) return interaction.reply({ content: `❌ \`${cible}\` est déjà dans ce groupe.`, ephemeral: true });

    db.prepare(`
      INSERT INTO option_group_items (group_value, target_value, label, emoji, description, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(groupe, cible, label, emoji, description, position);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ Élément ajouté')
        .setDescription(`**${emoji} ${label}** → \`${cible}\` ajouté dans le groupe **${grp.emoji} ${grp.label}**.`)
        .addFields({ name: '💡 Comment ça marche', value: `Quand un utilisateur sélectionne **${grp.label}** dans le menu, il voit un sous-menu avec tous ses éléments. En choisissant **${label}**, il lance une recherche dans \`${cible}\`.`, inline: false })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── REMOVE ITEM ───────────────────────────────────────────────────────────
  if (sub === 'remove-item') {
    const groupe = interaction.options.getString('groupe').toLowerCase();
    const cible  = interaction.options.getString('cible').trim();

    const r = db.prepare('DELETE FROM option_group_items WHERE group_value = ? AND target_value = ?').run(groupe, cible);
    if (r.changes === 0) {
      return interaction.reply({ content: `❌ Élément \`${cible}\` introuvable dans le groupe \`${groupe}\`.`, ephemeral: true });
    }
    return interaction.reply({ content: `✅ \`${cible}\` retiré du groupe \`${groupe}\`.`, ephemeral: true });
  }

  // ── DELETE GROUP ──────────────────────────────────────────────────────────
  if (sub === 'delete') {
    const valeur = interaction.options.getString('valeur').toLowerCase();
    const grp    = db.prepare('SELECT * FROM option_groups WHERE value = ?').get(valeur);
    if (!grp) return interaction.reply({ content: `❌ Groupe \`${valeur}\` introuvable.`, ephemeral: true });

    db.prepare('DELETE FROM option_groups WHERE value = ?').run(valeur);
    db.prepare('DELETE FROM option_group_items WHERE group_value = ?').run(valeur);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🗑️ Groupe supprimé')
        .setDescription(`Le groupe **${grp.emoji} ${grp.label}** et ses éléments ont été supprimés.`)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── EMOJI ─────────────────────────────────────────────────────────────────
  if (sub === 'emoji') {
    const groupe = interaction.options.getString('groupe').toLowerCase();
    const cible  = interaction.options.getString('cible').trim();
    const emoji  = interaction.options.getString('emoji').trim();

    const grp  = db.prepare('SELECT * FROM option_groups WHERE value = ?').get(groupe);
    if (!grp)  return interaction.reply({ content: `❌ Groupe \`${groupe}\` introuvable.`, ephemeral: true });

    const item = db.prepare('SELECT * FROM option_group_items WHERE group_value = ? AND target_value = ?').get(groupe, cible);
    if (!item) return interaction.reply({ content: `❌ Élément \`${cible}\` introuvable dans le groupe \`${groupe}\`.`, ephemeral: true });

    db.prepare('UPDATE option_group_items SET emoji = ? WHERE group_value = ? AND target_value = ?').run(emoji, groupe, cible);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ Emoji mis à jour')
        .addFields(
          { name: '📂 Groupe', value: `${grp.emoji} ${grp.label}`, inline: true },
          { name: '🔤 Élément', value: item.label,                  inline: true },
          { name: '🎨 Emoji',   value: emoji,                       inline: true }
        )
        .setFooter({ text: 'S\'applique immédiatement au prochain clic.' }).setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── LIST ──────────────────────────────────────────────────────────────────
  if (sub === 'list') {
    const groups = db.prepare('SELECT * FROM option_groups ORDER BY position ASC').all();
    if (groups.length === 0) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle('📂 Groupes — Aucun groupe créé')
          .setDescription('Crée un groupe avec `/group create valeur:operateurs label:Opérateurs emoji:📱`')
          .setTimestamp()
        ],
        ephemeral: true
      });
    }

    const fields = [];
    for (const grp of groups) {
      const items = db.prepare('SELECT * FROM option_group_items WHERE group_value = ? ORDER BY position ASC').all(grp.value);
      const itemList = items.length > 0
        ? items.map(i => `${i.emoji || ''} **${i.label}** → \`${i.target_value}\``).join('\n')
        : '*Aucun élément*';
      fields.push({
        name: `${grp.emoji} ${grp.label} (\`${grp.value}\`) ${grp.vip_only ? '🔒' : '🌍'}`,
        value: itemList,
        inline: false
      });
    }

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📂 Groupes / Sous-menus (${groups.length})`)
        .addFields(fields)
        .setFooter({ text: '/group add groupe:... pour ajouter des éléments' })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }
}
