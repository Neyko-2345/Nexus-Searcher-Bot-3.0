import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/adminCheck.js';
import { addCredits, setUnlimited, setFree, getOrCreateUser } from '../utils/credits.js';

export const data = new SlashCommandBuilder()
  .setName('credits')
  .setDescription('[ADMIN] Gérer les crédits des utilisateurs')
  .addSubcommand(sub => sub
    .setName('add')
    .setDescription('Ajouter des crédits à un utilisateur')
    .addUserOption(opt => opt.setName('user').setDescription('Utilisateur').setRequired(true))
    .addIntegerOption(opt => opt.setName('montant').setDescription('Nombre de crédits à ajouter').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub => sub
    .setName('unlimited')
    .setDescription('Donner un accès illimité à un utilisateur')
    .addUserOption(opt => opt.setName('user').setDescription('Utilisateur').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('reset')
    .setDescription('Remettre un utilisateur en plan gratuit')
    .addUserOption(opt => opt.setName('user').setDescription('Utilisateur').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('info')
    .setDescription('Voir les infos d\'un utilisateur')
    .addUserOption(opt => opt.setName('user').setDescription('Utilisateur').setRequired(true))
  );

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();
  const target = interaction.options.getUser('user');
  getOrCreateUser(target.id, target.username);

  if (sub === 'add') {
    const montant = interaction.options.getInteger('montant');
    addCredits(target.id, montant);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ Crédits ajoutés')
        .setDescription(`**+${montant} crédits** ajoutés à **${target.tag}**`)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'unlimited') {
    setUnlimited(target.id);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle('♾️ Plan Illimité activé')
        .setDescription(`**${target.tag}** a maintenant un accès illimité.`)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'reset') {
    setFree(target.id);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🔄 Plan réinitialisé')
        .setDescription(`**${target.tag}** est de retour sur le plan gratuit (5 recherches/24h).`)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'info') {
    const user = getOrCreateUser(target.id, target.username);
    const creditsDisplay = user.plan === 'unlimited' ? '♾️ Illimité' : `${user.credits} crédits`;
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📊 Info — ${target.tag}`)
        .addFields(
          { name: 'Plan', value: user.plan, inline: true },
          { name: 'Crédits', value: creditsDisplay, inline: true },
          { name: 'Blacklisté', value: user.blacklisted ? 'Oui' : 'Non', inline: true },
          { name: 'Dernier claim', value: user.last_claim || 'Jamais', inline: true }
        )
      ],
      ephemeral: true
    });
  }
}
