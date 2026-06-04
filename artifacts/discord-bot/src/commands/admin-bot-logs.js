import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isOwner } from '../utils/adminCheck.js';
import { getDB } from '../utils/database.js';

export const data = new SlashCommandBuilder()
  .setName('logs-bot')
  .setDescription('[OWNER] Configurer les logs des actions admin du bot')

  .addSubcommand(sub => sub
    .setName('config')
    .setDescription('[OWNER] Activer les logs d\'actions admin dans un salon')
    .addChannelOption(o => o.setName('salon').setDescription('Salon où envoyer les logs d\'actions admin').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('remove')
    .setDescription('[OWNER] Désactiver les logs d\'actions admin')
  );

export async function execute(interaction) {
  if (!isOwner(interaction.user.id)) {
    return interaction.reply({ content: '❌ Seuls les **owners** du bot peuvent utiliser cette commande.', ephemeral: true });
  }

  const db  = getDB();
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (sub === 'config') {
    const channel = interaction.options.getChannel('salon');
    if (!channel.isTextBased()) {
      return interaction.reply({ content: '❌ Ce salon n\'est pas un salon textuel.', ephemeral: true });
    }
    db.prepare('INSERT OR REPLACE INTO bot_action_logs (guild_id, channel_id) VALUES (?, ?)').run(guildId, channel.id);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ Logs actions admin configurés')
        .setDescription(`Toutes les actions admin (sauf /guide, /help, /aide, /logs setup, /search deploy) seront loggées dans <#${channel.id}>.`)
        .addFields({
          name: '📋 Actions loggées',
          value: [
            '• `/db add/remove/edit/config/fields/access/menu`',
            '• `/group create/add/delete`',
            '• `/option add/remove/edit/access`',
            '• `/plan set/remove/apply`',
            '• `/credits add/unlimited/reset`',
            '• `/blacklist add/remove`',
            '• `/plugin add/remove/reload`',
            '• `/tool add/delete/toggle/config/link`',
            '• `/owner add/remove`',
            '• `/bot rename/status/bio/reload`',
            '• `/search lock/unlock`',
            '• `/statut-acces config/disable`',
          ].join('\n'),
          inline: false
        })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'remove') {
    db.prepare('DELETE FROM bot_action_logs WHERE guild_id = ?').run(guildId);
    return interaction.reply({ content: '✅ Logs d\'actions admin désactivés.', ephemeral: true });
  }
}
