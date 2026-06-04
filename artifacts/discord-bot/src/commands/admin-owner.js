import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDB } from '../utils/database.js';
import { isOwner } from '../utils/adminCheck.js';

const BOT_OWNER_ID = '594718632966357022';

export { isOwner };

export const data = new SlashCommandBuilder()
  .setName('owner')
  .setDescription('[OWNER] Gérer les owners du bot (accès aux commandes /bot)')

  .addSubcommand(sub => sub
    .setName('add')
    .setDescription('Ajouter un owner du bot')
    .addUserOption(o => o.setName('utilisateur').setDescription('Membre à ajouter comme owner').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('remove')
    .setDescription('Retirer un owner du bot')
    .addUserOption(o => o.setName('utilisateur').setDescription('Membre à retirer').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('Voir tous les owners du bot')
  )
  .addSubcommand(sub => sub
    .setName('help')
    .setDescription('Voir toutes les commandes réservées aux owners')
  );

export async function execute(interaction) {
  if (!isOwner(interaction.user.id)) {
    return interaction.reply({ content: '❌ Seuls les **owners** du bot peuvent utiliser cette commande.', ephemeral: true });
  }

  const db  = getDB();
  const sub = interaction.options.getSubcommand();

  if (sub === 'add') {
    const user = interaction.options.getUser('utilisateur');
    if (user.id === BOT_OWNER_ID) {
      return interaction.reply({ content: 'ℹ️ Cet utilisateur est déjà l\'owner principal du bot.', ephemeral: true });
    }
    const existing = db.prepare('SELECT id FROM bot_owners WHERE user_id = ?').get(user.id);
    if (existing) {
      return interaction.reply({ content: `ℹ️ **${user.tag}** est déjà owner du bot.`, ephemeral: true });
    }
    db.prepare('INSERT INTO bot_owners (user_id, username, added_by) VALUES (?, ?, ?)').run(user.id, user.tag, interaction.user.id);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ Owner ajouté')
        .setDescription(`**${user.tag}** peut maintenant utiliser les commandes \`/bot\` et \`/owner\`.`)
        .addFields(
          { name: '🆔 ID', value: user.id, inline: true },
          { name: '👤 Ajouté par', value: interaction.user.tag, inline: true }
        )
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'remove') {
    const user = interaction.options.getUser('utilisateur');
    if (user.id === BOT_OWNER_ID) {
      return interaction.reply({ content: '❌ Impossible de retirer l\'owner principal du bot.', ephemeral: true });
    }
    const r = db.prepare('DELETE FROM bot_owners WHERE user_id = ?').run(user.id);
    if (r.changes === 0) {
      return interaction.reply({ content: `ℹ️ **${user.tag}** n'est pas owner du bot.`, ephemeral: true });
    }
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xed4245).setTitle('🗑️ Owner retiré')
        .setDescription(`**${user.tag}** n'a plus accès aux commandes \`/bot\` et \`/owner\`.`)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'list') {
    const owners = db.prepare('SELECT * FROM bot_owners ORDER BY id ASC').all();
    const lines = [
      `👑 **Owner principal** — \`${BOT_OWNER_ID}\` *(permanent)*`,
      ...owners.map(o => `• **${o.username}** — \`${o.user_id}\` *(ajouté par \`${o.added_by}\`)*`)
    ];
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2).setTitle(`👑 Owners du bot (${owners.length + 1})`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Les owners ont accès à /bot • /owner • /tool' })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'help') {
    const OWNER_COMMANDS = [
      {
        category: '🤖 Profil du bot — `/bot`',
        cmds: [
          { name: '/bot rename',  usage: '/bot rename nom:NΞXUS',                                        desc: 'Changer le nom du bot. Limité 2×/heure par Discord.' },
          { name: '/bot status',  usage: '/bot status presence:online type:Watching texte:les données…', desc: 'Modifier la présence et l\'activité.' },
          { name: '/bot bio',     usage: '/bot bio texte:Bot OSINT',                                     desc: 'Modifier la bio du profil. Max 190 caractères.' },
          { name: '/bot info',    usage: '/bot info',                                                    desc: 'Infos du bot (nom, ID, ping, uptime).' },
          { name: '/bot reload',  usage: '/bot reload',                                                  desc: 'Redémarrer le bot proprement.' },
        ]
      },
      {
        category: '👑 Gestion des owners — `/owner`',
        cmds: [
          { name: '/owner add',    usage: '/owner add utilisateur:@User',    desc: 'Ajouter un owner du bot.' },
          { name: '/owner remove', usage: '/owner remove utilisateur:@User', desc: 'Retirer un owner du bot.' },
          { name: '/owner list',   usage: '/owner list',                     desc: 'Voir tous les owners.' },
          { name: '/owner help',   usage: '/owner help',                     desc: 'Ce menu.' },
        ]
      },
      {
        category: '🔒 Panel de recherche — `/search`',
        cmds: [
          { name: '/search lock',        usage: '/search lock',                                                    desc: 'Verrouiller le panel.' },
          { name: '/search unlock',      usage: '/search unlock',                                                  desc: 'Déverrouiller le panel.' },
          { name: '/search btn-search',  usage: '/search btn-search label:Rechercher emoji:<:x:123>',              desc: 'Modifier le bouton Rechercher.' },
          { name: '/search btn-profile', usage: '/search btn-profile actif:true',                                  desc: 'Activer/désactiver bouton Profil.' },
          { name: '/search btn-guide',   usage: '/search btn-guide actif:true',                                    desc: 'Activer/désactiver bouton Guide.' },
          { name: '/search profile-set', usage: '/search profile-set title:... description:... color:#5865f2',     desc: 'Config embed profil. Vars: {user} {plan} {credits} {max_credits} {next_reset} {searches}.' },
          { name: '/search guide-set',   usage: '/search guide-set title:... description:... color:#3b3b44',       desc: 'Config embed guide utilisateur.' },
        ]
      },
      {
        category: '🔧 Tools OSINT — `/tool`',
        cmds: [
          { name: '/tool add',    usage: '/tool add url:https://github.com/reconurge/flowsint', desc: 'Intégrer un tool depuis GitHub.' },
          { name: '/tool list',   usage: '/tool list',                                          desc: 'Tous les tools installés.' },
          { name: '/tool test',   usage: '/tool test id:<id> query:<requête>',                  desc: 'Tester un tool en live.' },
          { name: '/tool config', usage: '/tool config id:<id> key:<clé_api>',                  desc: 'Configurer la clé API d\'un tool.' },
          { name: '/tool toggle', usage: '/tool toggle id:<id>',                                desc: 'Activer/désactiver un tool.' },
          { name: '/tool link',   usage: '/tool link id:<id> option:<option>',                  desc: 'Lier un tool à une option.' },
          { name: '/tool delete', usage: '/tool delete id:<id>',                                desc: 'Supprimer un tool.' },
          { name: '/tool cache',  usage: '/tool cache',                                         desc: 'Vider le cache des tools.' },
        ]
      },
      {
        category: '🛠️ Logs admin — `/logs-bot`',
        cmds: [
          { name: '/logs-bot config', usage: '/logs-bot config salon:#logs-admin', desc: 'Logger les actions admin dans un salon.' },
          { name: '/logs-bot remove', usage: '/logs-bot remove',                   desc: 'Désactiver les logs admin.' },
        ]
      },
      {
        category: '📊 Suivi parsing — `/db-parse`',
        cmds: [
          { name: '/db-parse preview', usage: '/db-parse preview nom:sfr lignes:5', desc: 'Voir le parsing des premières entrées.' },
          { name: '/db-parse stats',   usage: '/db-parse stats nom:sfr',            desc: 'Stats de confiance (haute/moyenne/basse).' },
          { name: '/db-parse reset',   usage: '/db-parse reset nom:sfr',            desc: 'Désactiver le smart parse → retour RAW.' },
          { name: '/db-parse enable',  usage: '/db-parse enable nom:sfr',           desc: 'Réactiver le smart parse.' },
          { name: '/db-parse list',    usage: '/db-parse list',                     desc: 'Statut parsing de toutes les bases.' },
        ]
      },
    ];

    const detailEmbeds = OWNER_COMMANDS.map(cat =>
      new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle(cat.category)
        .setDescription(
          cat.cmds.map(c => `**\`${c.name}\`**\n📋 ${c.desc}\n💡 \`${c.usage}\``).join('\n\n').substring(0, 4000)
        )
    );

    const headerEmbed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle('👑 NΞXUS™ — Commandes Owner')
      .setDescription(
        '> Commandes réservées aux **owners** du bot uniquement.\n\n' +
        OWNER_COMMANDS.map(cat =>
          `**${cat.category}**\n${cat.cmds.map(c => `\`${c.name}\``).join(' • ')}`
        ).join('\n\n').substring(0, 3000)
      )
      .setFooter({ text: 'NΞXUS™ — Owner Help' })
      .setTimestamp();

    return interaction.reply({ embeds: [headerEmbed, ...detailEmbeds].slice(0, 10), ephemeral: true });
  }
}
