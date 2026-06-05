import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/adminCheck.js';
import { setPlanByRole, addCredits, setUnlimited, getOrCreateUser } from '../utils/credits.js';
import { getDB } from '../utils/database.js';
import { createSubscription, getUserSubscriptions } from '../utils/subscriptionManager.js';

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
    .addIntegerOption(opt => opt.setName('duree').setDescription('Durée de l\'abonnement en jours (facultatif — laisser vide = permanent)').setMinValue(1))
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
  )
  .addSubcommand(sub => sub
    .setName('subs')
    .setDescription('Voir les abonnements actifs d\'un utilisateur')
    .addUserOption(opt => opt.setName('user').setDescription('Utilisateur').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('revoke')
    .setDescription('Révoquer l\'abonnement d\'un utilisateur pour un plan')
    .addUserOption(opt => opt.setName('user').setDescription('Utilisateur').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Rôle de plan à révoquer').setRequired(true))
  );

export async function execute(interaction, client) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
  }

  const db = getDB();
  const sub = interaction.options.getSubcommand();

  // ── SET ────────────────────────────────────────────────────────────────────
  if (sub === 'set') {
    const role     = interaction.options.getRole('role');
    const nom      = interaction.options.getString('nom');
    const credits  = interaction.options.getInteger('credits');
    const illimite = interaction.options.getBoolean('illimite') || false;
    const duree    = interaction.options.getInteger('duree') ?? null;

    setPlanByRole(role.id, nom, credits, illimite);

    // Sauvegarder la durée sur le plan
    try { db.exec("ALTER TABLE plans ADD COLUMN duration_days INTEGER DEFAULT NULL"); } catch {}
    db.prepare('UPDATE plans SET duration_days = ? WHERE role_id = ?').run(duree, role.id);

    const dureeStr = duree ? `⏱️ **${duree} jour${duree > 1 ? 's' : ''}**` : '♾️ Permanent (pas d\'expiration)';

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ Plan configuré')
        .addFields(
          { name: 'Rôle',          value: `<@&${role.id}>`,                              inline: true },
          { name: 'Nom du plan',   value: nom,                                            inline: true },
          { name: 'Crédits/jour',  value: illimite ? '♾️ Illimité' : credits.toString(), inline: true },
          { name: 'Durée',         value: dureeStr,                                       inline: false },
        )
        .setFooter({ text: duree ? `Les abonnements expireront automatiquement après ${duree} jour(s).` : 'Abonnement permanent — aucune expiration.' })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── LIST ───────────────────────────────────────────────────────────────────
  if (sub === 'list') {
    try { db.exec("ALTER TABLE plans ADD COLUMN duration_days INTEGER DEFAULT NULL"); } catch {}
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
      const dureeStr = p.duration_days ? `⏱️ ${p.duration_days}j` : '♾️ Permanent';
      fields.push({
        name: `✨ ${p.plan_name}`,
        value: [
          `Rôle: <@&${p.role_id}>`,
          `Crédits: ${p.unlimited ? '♾️ Illimité' : p.daily_credits + '/jour'}`,
          `Abonnement: ${dureeStr}`,
        ].join('\n'),
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

  // ── REMOVE ─────────────────────────────────────────────────────────────────
  if (sub === 'remove') {
    const role = interaction.options.getRole('role');
    db.prepare('DELETE FROM plans WHERE role_id = ?').run(role.id);
    return interaction.reply({ content: `✅ Plan du rôle <@&${role.id}> supprimé.`, ephemeral: true });
  }

  // ── APPLY ──────────────────────────────────────────────────────────────────
  if (sub === 'apply') {
    try { db.exec("ALTER TABLE plans ADD COLUMN duration_days INTEGER DEFAULT NULL"); } catch {}
    const target = interaction.options.getUser('user');
    const role   = interaction.options.getRole('role');
    const plan   = db.prepare('SELECT * FROM plans WHERE role_id = ?').get(role.id);
    if (!plan) {
      return interaction.reply({ content: `❌ Aucun plan associé au rôle <@&${role.id}>.`, ephemeral: true });
    }

    getOrCreateUser(target.id, target.username);

    // Mettre à jour les crédits/plan
    if (plan.unlimited) {
      setUnlimited(target.id);
    } else {
      addCredits(target.id, plan.daily_credits);
      db.prepare("UPDATE users SET plan = ?, max_daily_credits = ? WHERE id = ?").run(plan.plan_name, plan.daily_credits, target.id);
    }

    // Attribuer le rôle au membre si possible
    let roleGiven = false;
    try {
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (member) {
        await member.roles.add(role.id).catch(() => {});
        roleGiven = true;
      }
    } catch {}

    // Si le plan a une durée, créer le timer d'abonnement
    let subInfo = null;
    if (plan.duration_days) {
      createSubscription(interaction.guildId, target.id, role.id, plan.plan_name, plan.duration_days);
      const expiresAt = Date.now() + plan.duration_days * 24 * 60 * 60 * 1000;
      subInfo = { duration: plan.duration_days, expiresAt };
    }

    // DM de confirmation à l'utilisateur
    try {
      const dmLines = [
        `Ton plan **${plan.plan_name}** a été activé sur le serveur.`,
        plan.unlimited ? `Crédits: ♾️ Illimité` : `Crédits: **${plan.daily_credits}/jour**`,
      ];
      if (subInfo) {
        dmLines.push('');
        dmLines.push(`⏱️ Ton abonnement expire <t:${Math.floor(subInfo.expiresAt / 1000)}:R> (<t:${Math.floor(subInfo.expiresAt / 1000)}:F>).`);
        dmLines.push(`> Tu recevras un rappel 1 jour avant et 5 minutes avant l'expiration.`);
      }
      await target.send({
        embeds: [{
          color: 0x57f287,
          title: '✅ Plan activé',
          description: dmLines.join('\n'),
          timestamp: new Date().toISOString(),
        }]
      }).catch(() => {});
    } catch {}

    const fields = [
      { name: 'Utilisateur', value: `<@${target.id}>`, inline: true },
      { name: 'Plan',        value: plan.plan_name,    inline: true },
      { name: 'Crédits',     value: plan.unlimited ? '♾️ Illimité' : `${plan.daily_credits}/jour`, inline: true },
    ];
    if (roleGiven) fields.push({ name: 'Rôle', value: `<@&${role.id}> attribué`, inline: true });
    if (subInfo) {
      fields.push({
        name: 'Expiration',
        value: `<t:${Math.floor(subInfo.expiresAt / 1000)}:F> (<t:${Math.floor(subInfo.expiresAt / 1000)}:R>)`,
        inline: false
      });
    }

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ Plan appliqué')
        .addFields(fields)
        .setFooter({ text: subInfo ? `Rappels DM : 1 jour avant + 5 min avant l'expiration.` : 'Abonnement permanent — aucune expiration.' })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── SUBS ───────────────────────────────────────────────────────────────────
  if (sub === 'subs') {
    const target = interaction.options.getUser('user');
    const subs   = getUserSubscriptions(interaction.guildId, target.id);

    if (!subs.length) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xfaa61a)
          .setTitle('📋 Abonnements actifs')
          .setDescription(`<@${target.id}> n'a aucun abonnement avec expiration automatique.`)
        ],
        ephemeral: true
      });
    }

    const fields = subs.map(s => ({
      name: `✨ ${s.plan_name}`,
      value: [
        `Rôle: <@&${s.role_id}>`,
        `Expire: <t:${Math.floor(s.expires_at / 1000)}:F> (<t:${Math.floor(s.expires_at / 1000)}:R>)`,
        `Rappel 1j envoyé: ${s.reminded_1day ? '✅' : '⏳'}`,
        `Rappel 5min envoyé: ${s.reminded_5min ? '✅' : '⏳'}`,
      ].join('\n'),
      inline: false
    }));

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📋 Abonnements de ${target.username}`)
        .addFields(fields)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ── REVOKE ─────────────────────────────────────────────────────────────────
  if (sub === 'revoke') {
    const target = interaction.options.getUser('user');
    const role   = interaction.options.getRole('role');

    const existing = db.prepare('SELECT * FROM plan_subscriptions WHERE guild_id = ? AND user_id = ? AND role_id = ?')
      .get(interaction.guildId, target.id, role.id);

    if (!existing) {
      return interaction.reply({
        content: `❌ Aucun abonnement actif trouvé pour <@${target.id}> avec le rôle <@&${role.id}>.`,
        ephemeral: true
      });
    }

    db.prepare('DELETE FROM plan_subscriptions WHERE guild_id = ? AND user_id = ? AND role_id = ?')
      .run(interaction.guildId, target.id, role.id);

    // Retrait du rôle + reset du plan
    try {
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (member) await member.roles.remove(role.id).catch(() => {});
    } catch {}

    const statusRow = db.prepare("SELECT value FROM guild_config WHERE key = 'status_watch_config'").get();
    let statusActive = false;
    try { if (statusRow) statusActive = JSON.parse(statusRow.value)?.enabled === true; } catch {}
    const freeRow = db.prepare("SELECT value FROM guild_config WHERE key = 'free_daily_credits'").get();
    const freeCredits = freeRow ? parseInt(freeRow.value) : 5;

    if (statusActive) {
      db.prepare("UPDATE users SET plan = 'none', credits = 0, max_daily_credits = 0 WHERE id = ?").run(target.id);
    } else {
      db.prepare("UPDATE users SET plan = 'free', credits = ?, max_daily_credits = ? WHERE id = ?").run(freeCredits, freeCredits, target.id);
    }

    // DM à l'utilisateur
    try {
      await target.send({
        embeds: [{
          color: 0xed4245,
          title: '❌ Abonnement révoqué',
          description: [
            `Ton plan **${existing.plan_name}** a été révoqué par un administrateur.`,
            statusActive
              ? `> Tu n'as plus accès aux recherches.`
              : `> Tu es revenu au plan gratuit (**${freeCredits} crédits/jour**).`,
          ].join('\n'),
          timestamp: new Date().toISOString(),
        }]
      }).catch(() => {});
    } catch {}

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('✅ Abonnement révoqué')
        .setDescription(`L'abonnement **${existing.plan_name}** de <@${target.id}> a été révoqué. Le rôle <@&${role.id}> a été retiré.`)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }
}
