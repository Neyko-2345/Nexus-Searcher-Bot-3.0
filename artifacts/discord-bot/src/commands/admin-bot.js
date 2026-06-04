import { SlashCommandBuilder, EmbedBuilder, ActivityType } from 'discord.js';
import { isOwner } from './admin-owner.js';

export const data = new SlashCommandBuilder()
  .setName('bot')
  .setDescription('[OWNER] Gérer le profil et le statut du bot (réservé aux owners)')

  .addSubcommand(sub => sub
    .setName('rename')
    .setDescription('Changer le nom d\'utilisateur du bot (limité à 2 fois/heure par Discord)')
    .addStringOption(o => o.setName('nom').setDescription('Nouveau nom du bot').setRequired(true).setMinLength(2).setMaxLength(32))
  )

  .addSubcommand(sub => sub
    .setName('status')
    .setDescription('Modifier le statut et l\'activité du bot')
    .addStringOption(o => o
      .setName('presence')
      .setDescription('Présence en ligne')
      .setRequired(true)
      .addChoices(
        { name: '🟢 En ligne', value: 'online' },
        { name: '🟡 Inactif', value: 'idle' },
        { name: '🔴 Ne pas déranger', value: 'dnd' },
        { name: '⚫ Invisible', value: 'invisible' },
      )
    )
    .addStringOption(o => o
      .setName('type')
      .setDescription('Type d\'activité')
      .addChoices(
        { name: '🎮 Joue à', value: 'Playing' },
        { name: '🎧 Écoute', value: 'Listening' },
        { name: '📺 Regarde', value: 'Watching' },
        { name: '🏆 En compétition', value: 'Competing' },
        { name: '❌ Aucune activité', value: 'None' },
      )
    )
    .addStringOption(o => o.setName('texte').setDescription('Texte de l\'activité (ex: les données…)').setMaxLength(128))
  )

  .addSubcommand(sub => sub
    .setName('bio')
    .setDescription('Modifier la bio / description du bot (visible sur son profil)')
    .addStringOption(o => o.setName('texte').setDescription('Nouvelle bio (laisse vide pour effacer)').setMaxLength(190))
  )

  .addSubcommand(sub => sub
    .setName('info')
    .setDescription('Voir les infos actuelles du bot (nom, statut, ping…)')
  )

  .addSubcommand(sub => sub
    .setName('reload')
    .setDescription('Redémarrer le bot (rechargement complet : plugins, config, base de données)')
  );

export async function execute(interaction, client) {
  if (!isOwner(interaction.user.id)) {
    return interaction.reply({ content: '❌ Seuls les **owners** du bot peuvent utiliser cette commande.\nGère les owners avec `/owner add`.', ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'rename') {
    const nom = interaction.options.getString('nom');
    await interaction.deferReply({ ephemeral: true });
    try {
      await client.user.setUsername(nom);
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x57f287).setTitle('✅ Nom changé')
          .setDescription(`Le bot s'appelle maintenant **${nom}**.`)
          .setFooter({ text: '⚠️ Discord limite ce changement à 2 fois par heure.' })
          .setTimestamp()
        ]
      });
    } catch (e) {
      return interaction.editReply({ content: `❌ Erreur : ${e.message}` });
    }
  }

  if (sub === 'status') {
    const presence = interaction.options.getString('presence');
    const type     = interaction.options.getString('type') || 'None';
    const texte    = interaction.options.getString('texte') || '';

    const activityTypeMap = {
      Playing:    ActivityType.Playing,
      Listening:  ActivityType.Listening,
      Watching:   ActivityType.Watching,
      Competing:  ActivityType.Competing,
    };

    const presenceData = { status: presence };
    if (type !== 'None' && texte) {
      presenceData.activities = [{ name: texte, type: activityTypeMap[type] }];
    } else {
      presenceData.activities = [];
    }

    client.user.setPresence(presenceData);

    const typeLabels = {
      Playing: '🎮 Joue à', Listening: '🎧 Écoute',
      Watching: '📺 Regarde', Competing: '🏆 En compétition', None: '❌ Aucune'
    };
    const presenceLabels = { online: '🟢 En ligne', idle: '🟡 Inactif', dnd: '🔴 DND', invisible: '⚫ Invisible' };

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ Statut mis à jour')
        .addFields(
          { name: 'Présence',  value: presenceLabels[presence] || presence, inline: true },
          { name: 'Activité',  value: typeLabels[type] || type,             inline: true },
          { name: 'Texte',     value: texte || '*aucun*',                   inline: true }
        )
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'bio') {
    const texte = interaction.options.getString('texte') || '';
    await interaction.deferReply({ ephemeral: true });
    try {
      await client.user.edit({ bio: texte });
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x57f287).setTitle('✅ Bio mise à jour')
          .setDescription(texte ? `Nouvelle bio :\n> ${texte}` : '*Bio effacée.*')
          .setTimestamp()
        ]
      });
    } catch (e) {
      return interaction.editReply({ content: `❌ Erreur : ${e.message}` });
    }
  }

  if (sub === 'info') {
    const u       = client.user;
    const ping    = client.ws.ping;
    const act     = client.user.presence?.activities?.[0];
    const uptime  = process.uptime();
    const hours   = Math.floor(uptime / 3600);
    const mins    = Math.floor((uptime % 3600) / 60);
    const secs    = Math.floor(uptime % 60);
    const uptimeStr = `${hours}h ${mins}m ${secs}s`;

    // Replit free plan: ~1h of inactivity = sleep. Uptime tracked since process start.
    // We estimate time remaining before sleep based on last interaction (no built-in API).
    const sleepNote = 'Replit maintient le bot actif tant que le workflow tourne.\nEn mode gratuit, le bot peut dormir si inactif depuis un moment.';

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2).setTitle(`🤖 ${u.username}`)
        .setThumbnail(u.displayAvatarURL())
        .addFields(
          { name: '🏷️ Tag',           value: u.tag,                                       inline: true },
          { name: '🆔 ID',            value: u.id,                                        inline: true },
          { name: '📡 Ping',          value: `${ping}ms`,                                 inline: true },
          { name: '🎮 Activité',      value: act ? `${act.name}` : '*Aucune*',            inline: true },
          { name: '📅 Créé le',       value: `<t:${Math.floor(u.createdTimestamp/1000)}:D>`, inline: true },
          { name: '⏱️ Uptime',        value: uptimeStr,                                   inline: true },
          { name: '💤 Replit Sleep',  value: sleepNote,                                   inline: false }
        )
        .setFooter({ text: 'Owner uniquement • /owner list pour voir les owners' })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'reload') {
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xffa500).setTitle('♻️ Redémarrage en cours…')
        .setDescription('Le bot va redémarrer dans 2 secondes.\nIl sera automatiquement relancé par le workflow.')
        .setFooter({ text: 'Plugins, config et base de données seront rechargés.' })
        .setTimestamp()
      ],
      ephemeral: true
    });
    setTimeout(() => process.exit(0), 2000);
    return;
  }
}
