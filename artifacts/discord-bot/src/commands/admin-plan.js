import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/adminCheck.js';
import { setPlanByRole, addCredits, setUnlimited, getOrCreateUser } from '../utils/credits.js';
import { getDB } from '../utils/database.js';

export const data = new SlashCommandBuilder()
  .setName('plan')
  .setDescription('[ADMIN] Gérer les plans par rôle')
  .addSubcommand(sub => sub
    .setName('set')
    .setDescription('Associer un plan à un rôle')
    .addRoleOption(opt => opt.setName('role').setDescription('Rôle Discord').setRequired(true))
    .addStringOption(opt => opt.setName('nom').setDescription('Nom du plan (ex: premium, vip)').setRequired(true))
    .addIntegerOption(opt => opt.setName('credits').setDescription('Crédits journaliers').setRequired(true).setMinValue(0))
    .addBooleanOption(opt => opt.setName('illimite').setDescription('Accès illimité ?'))
  )
  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('Voir tous les plans configurés (inclut le plan de base)')
  )
  .addSubcommand(sub => sub
    .setName('remove')
    .setDescription('Supprimer un plan de rôle')
    .addRoleOption(opt => opt.setName('role').setDescription('Rôle à supprimer').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('apply')
    .setDescription('Appliquer un plan directement à un utilisateur')
    .addUserOption(opt => opt.setName('user').setDescription('Utilisateur').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Rôle de plan à appliquer').setRequired(true))
  );

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
  }

  const db = getDB();
  const sub = interaction.options.getSubcommand();

  if (sub === 'set') {
    const role     = interaction.options.getRole('role');
    const nom      = interaction.options.getString('nom');
    const credits  = interaction.options.getInteger('credits');
    const illimite = interaction.options.getBoolean('illimite') || false;

    setPlanByRole(role.id, nom, credits, illimite);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ Plan configuré')
        .addFields(
          { name: 'Rôle',        value: `<@&${role.id}>`,                          inline: true },
          { name: 'Nom du plan', value: nom,                                        inline: true },
          { name: 'Crédits/jour', value: illimite ? '♾️ Illimité' : credits.toString(), inline: true }
        )
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'list') {
    const plans = db.prepare('SELECT * FROM plans').all();

    const freeCreditRow = db.prepare("SELECT value FROM guild_config WHERE key = 'free_daily_credits'").get();
    const freeCredits   = freeCreditRow ? parseInt(freeCreditRow.value) : 5;

    const statusRow = db.prepare("SELECT value FROM guild_config WHERE key = 'status_watch_config'").get();
    let statusCfg = null;
    try { if (statusRow) statusCfg = JSON.parse(statusRow.value); } catch {}
    const statusActive = statusCfg?.enabled === true;

    const fields = [];

    if (statusActive) {
      fields.push({
        name: '🔄 Plan statut *(Plan de base)*',
        value: [
          `Rôle attribué: <@&${statusCfg.role_id}>`,
          `Accès: Attribution automatique si le statut Discord contient \`${statusCfg.text}\``,
          `Crédits: \`${freeCredits}/jour\``,
          `> ⚠️ Sans ce statut, aucune recherche n'est possible.`,
        ].join('\n'),
        inline: false
      });
    } else {
      fields.push({
        name: '🌍 Plan gratuit *(Plan de base)*',
        value: [
          `Accès: Pour tout le monde`,
          `Crédits: \`${freeCredits}/jour\``,
          `> Modifiable via \`/option access-credits nombre:X\``,
        ].join('\n'),
        inline: false
      });
    }

    for (const p of plans) {
      fields.push({
        name: `✨ ${p.plan_name}`,
        value: `Rôle: <@&${p.role_id}>\nCrédits: ${p.unlimited ? '♾️ Illimité' : p.daily_credits + '/jour'}`,
        inline: true
      });
    }

    const descLine = statusActive
      ? `⚠️ **Système statut actif** — Les membres sans le statut \`${statusCfg.text}\` dans leur profil Discord ne peuvent pas effectuer de recherches.`
      : null;

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📋 Plans configurés')
        .setDescription(descLine)
        .addFields(fields)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'remove') {
    const role = interaction.options.getRole('role');
    db.prepare('DELETE FROM plans WHERE role_id = ?').run(role.id);
    return interaction.reply({ content: `✅ Plan du rôle <@&${role.id}> supprimé.`, ephemeral: true });
  }

  if (sub === 'apply') {
    const target = interaction.options.getUser('user');
    const role   = interaction.options.getRole('role');
    const plan   = db.prepare('SELECT * FROM plans WHERE role_id = ?').get(role.id);
    if (!plan) {
      return interaction.reply({ content: `❌ Aucun plan associé au rôle <@&${role.id}>.`, ephemeral: true });
    }

    getOrCreateUser(target.id, target.username);
    if (plan.unlimited) {
      setUnlimited(target.id);
    } else {
      addCredits(target.id, plan.daily_credits);
      db.prepare("UPDATE users SET plan = ?, max_daily_credits = ? WHERE id = ?").run(plan.plan_name, plan.daily_credits, target.id);
    }

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ Plan appliqué')
        .setDescription(`Le plan **${plan.plan_name}** a été appliqué à **${target.tag || target.username}**.`)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }
}
