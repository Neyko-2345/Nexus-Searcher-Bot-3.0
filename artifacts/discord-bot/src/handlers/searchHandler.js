import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { isVipOrAdmin } from '../utils/credits.js';
import { getDB } from '../utils/database.js';

const BUILTIN_TYPES = {
  email:        { label: 'Email',              placeholder: 'exemple@gmail.com',     defaultVip: false },
  phone:        { label: 'Numéro de téléphone', placeholder: '+33612345678',         defaultVip: false },
  name:         { label: 'Prénom et/ou Nom',   placeholder: 'Jean Dupont',           defaultVip: false },
  username:     { label: 'Username',           placeholder: 'john_doe',              defaultVip: false },
  discord_id:   { label: 'Discord ID',         placeholder: '123456789012345678',    defaultVip: false },
  ip:           { label: 'Adresse IP',         placeholder: '192.168.1.1',           defaultVip: false },
  address:      { label: 'Adresse',            placeholder: '1 rue de la Paix',      defaultVip: false },
  iban:         { label: 'IBAN',               placeholder: 'FR76 3000 6000 0112…',  defaultVip: false },
  password:     { label: 'Mot de passe',       placeholder: 'motdepasse123',         defaultVip: false },
  intelx:       { label: 'Recherche Intel_X',  placeholder: 'email, domaine, IP…',   defaultVip: true  },
  nazapi:       { label: 'Recherche Nazapi',   placeholder: 'email, username, IP…',  defaultVip: true  },
  // ULP
  login:        { label: 'L0gin / Email',      placeholder: 'user@exemple.com',      defaultVip: false },
  ulp_password: { label: 'Passw0rd',          placeholder: 'motdepasse123',         defaultVip: false },
  url:          { label: 'URL',               placeholder: 'https://exemple.com',   defaultVip: false },
};

function getAccessConfig(db) {
  const row = db.prepare("SELECT value FROM guild_config WHERE key = 'access_config'").get();
  if (!row) return {};
  try { return JSON.parse(row.value); } catch { return {}; }
}

function isOptionRestricted(optionKey, accessConfig) {
  if (optionKey in accessConfig) {
    const mode = accessConfig[optionKey];
    return mode !== 'free' && mode !== undefined;
  }
  return BUILTIN_TYPES[optionKey]?.defaultVip ?? false;
}

function getRequiredPlan(optionKey, accessConfig) {
  if (optionKey in accessConfig) {
    const mode = accessConfig[optionKey];
    if (mode === 'free') return null;
    return mode; // plan name
  }
  return BUILTIN_TYPES[optionKey]?.defaultVip ? 'vip' : null;
}

function hasRequiredPlan(member, planName, db) {
  if (!planName) return true;
  // Check admin
  if (member.permissions.has(8n)) return true;
  // Check plans
  const plans = db.prepare('SELECT * FROM plans').all();
  for (const p of plans) {
    if (p.plan_name.toLowerCase() === planName.toLowerCase()) {
      if (member.roles.cache.has(p.role_id)) return true;
    }
  }
  // fallback: any unlimited plan
  for (const p of plans) {
    if (p.unlimited && member.roles.cache.has(p.role_id)) return true;
  }
  return false;
}

export async function handleSearchSelect(interaction) {
  const selected = interaction.values[0];
  const db = getDB();

  // ── Custom option ──────────────────────────────────────────────────────────
  if (selected.startsWith('custom_')) {
    const customValue = selected.replace('custom_', '');
    const opt = db.prepare('SELECT * FROM custom_options WHERE value = ?').get(customValue);
    if (!opt) {
      return interaction.reply({ content: '❌ Option introuvable.', ephemeral: true });
    }

    if (opt.vip_only && !isVipOrAdmin(interaction.member)) {
      const plans = db.prepare('SELECT * FROM plans WHERE unlimited = 1 LIMIT 1').all();
      const planName = plans.length > 0 ? plans[0].plan_name : 'VIP';
      return interaction.reply({
        embeds: [{ color: 0xff0000, title: '🔒 Accès restreint', description: `Tu dois avoir le plan **${planName}** pour accéder à cette option.\n\nOuvre un ticket pour contacter un owner.` }],
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`search_modal_${selected}`)
      .setTitle(`🔍 ${opt.label}`);

    const input = new TextInputBuilder()
      .setCustomId('search_query')
      .setLabel(opt.modal_label)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(opt.modal_placeholder || opt.label)
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(300);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // ── Built-in option ────────────────────────────────────────────────────────
  const typeInfo = BUILTIN_TYPES[selected];
  if (!typeInfo) {
    return interaction.reply({ content: '❌ Type de recherche invalide.', ephemeral: true });
  }

  const accessConfig = getAccessConfig(db);
  const requiredPlan = getRequiredPlan(selected, accessConfig);

  if (requiredPlan && !hasRequiredPlan(interaction.member, requiredPlan, db)) {
    return interaction.reply({
      embeds: [{ color: 0xff0000, title: '🔒 Accès restreint', description: `Tu dois avoir le plan **${requiredPlan}** pour accéder à cette option.\n\nOuvre un ticket pour contacter un owner.` }],
      ephemeral: true
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`search_modal_${selected}`)
    .setTitle(`🔍 ${typeInfo.label}`);

  const input = new TextInputBuilder()
    .setCustomId('search_query')
    .setLabel(typeInfo.label)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(typeInfo.placeholder)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(300);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}
