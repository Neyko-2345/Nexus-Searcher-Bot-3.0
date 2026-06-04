import { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { isAdmin } from '../utils/adminCheck.js';
import { getDB } from '../utils/database.js';

export const data = new SlashCommandBuilder()
  .setName('statut-acces')
  .setDescription('[ADMIN] Détecter le statut des membres pour leur attribuer un rôle automatiquement')

  .addSubcommand(sub => sub
    .setName('config')
    .setDescription('Configurer la détection de statut → attribution de rôle automatique')
    .addRoleOption(o => o.setName('role').setDescription('Rôle à attribuer quand le statut correspond').setRequired(true))
    .addStringOption(o => o.setName('texte').setDescription('Texte à détecter dans le statut du membre (ex: NΞXUS)').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('info')
    .setDescription('Voir la configuration actuelle de détection de statut')
  )
  .addSubcommand(sub => sub
    .setName('disable')
    .setDescription('Désactiver la détection automatique de statut')
  )
  .addSubcommand(sub => sub
    .setName('logs-set')
    .setDescription('Configurer le salon de logs pour les événements de rôle statut')
    .addChannelOption(o => o.setName('salon').setDescription('Salon où envoyer les logs d\'attribution de rôle statut').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('logs-remove')
    .setDescription('Désactiver les logs de rôle statut')
  );

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
  }

  const db  = getDB();
  const sub = interaction.options.getSubcommand();

  if (sub === 'config') {
    const role  = interaction.options.getRole('role');
    const texte = interaction.options.getString('texte').trim();

    const config = JSON.stringify({ role_id: role.id, role_name: role.name, text: texte, enabled: true });
    db.prepare("INSERT OR REPLACE INTO guild_config (key, value) VALUES ('status_watch_config', ?)").run(config);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ Détection de statut configurée')
        .setDescription(
          `Le bot va maintenant surveiller les statuts.\n\n` +
          `Quand un membre a **"${texte}"** dans son statut → il reçoit le rôle **${role.name}**.\n` +
          `Quand le texte disparaît → le rôle est retiré automatiquement.`
        )
        .addFields(
          { name: '🔍 Texte détecté', value: `\`${texte}\``, inline: true },
          { name: '🎭 Rôle attribué', value: `<@&${role.id}>`, inline: true }
        )
        .setFooter({ text: '⚠️ Le bot doit avoir un rôle au-dessus du rôle configuré pour pouvoir l\'attribuer.' })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'info') {
    const row = db.prepare("SELECT value FROM guild_config WHERE key = 'status_watch_config'").get();
    if (!row) {
      return interaction.reply({ content: 'ℹ️ Aucune configuration de détection de statut active.', ephemeral: true });
    }
    let cfg;
    try { cfg = JSON.parse(row.value); } catch { return interaction.reply({ content: '❌ Config corrompue.', ephemeral: true }); }

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(cfg.enabled ? 0x57f287 : 0xffa500)
        .setTitle('🔄 Détection de statut')
        .addFields(
          { name: '🔍 Texte surveillé', value: `\`${cfg.text}\``, inline: true },
          { name: '🎭 Rôle attribué',   value: `<@&${cfg.role_id}>`, inline: true },
          { name: '📊 Statut',          value: cfg.enabled ? '🟢 Actif' : '🔴 Désactivé', inline: true }
        )
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'disable') {
    const row = db.prepare("SELECT value FROM guild_config WHERE key = 'status_watch_config'").get();
    if (!row) {
      return interaction.reply({ content: 'ℹ️ Aucune détection de statut n\'était configurée.', ephemeral: true });
    }
    let cfg;
    try { cfg = JSON.parse(row.value); } catch { cfg = {}; }
    cfg.enabled = false;
    db.prepare("INSERT OR REPLACE INTO guild_config (key, value) VALUES ('status_watch_config', ?)").run(JSON.stringify(cfg));

    return interaction.reply({ content: '✅ Détection de statut désactivée.', ephemeral: true });
  }

  if (sub === 'logs-set') {
    const channel = interaction.options.getChannel('salon');
    if (!channel.isTextBased()) {
      return interaction.reply({ content: '❌ Ce salon n\'est pas un salon textuel.', ephemeral: true });
    }
    const guildId = interaction.guildId;
    db.prepare('INSERT OR REPLACE INTO statut_log_config (guild_id, channel_id) VALUES (?, ?)').run(guildId, channel.id);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ Logs statut configurés')
        .setDescription(`Les événements d'attribution/retrait de rôle statut seront envoyés dans <#${channel.id}>.`)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'logs-remove') {
    const guildId = interaction.guildId;
    db.prepare('DELETE FROM statut_log_config WHERE guild_id = ?').run(guildId);
    return interaction.reply({ content: '✅ Logs statut désactivés.', ephemeral: true });
  }
}
