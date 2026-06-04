import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/adminCheck.js';
import { getDB } from '../utils/database.js';

const ALLOWED_KEYS = {
  intelx_api_key: 'Clé API Intel_X (intelx.io)',
  nazapi_api_key: 'Clé API Nazapi',
  nazapi_url: 'URL de base Nazapi (ex: https://api.nazapi.com)',
};

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('[ADMIN] Configurer les paramètres du bot')
  .addSubcommand(sub => sub
    .setName('set')
    .setDescription('Définir une valeur de configuration')
    .addStringOption(opt => opt
      .setName('cle')
      .setDescription('Clé de configuration')
      .setRequired(true)
      .addChoices(
        { name: 'Clé API Intel_X', value: 'intelx_api_key' },
        { name: 'Clé API Nazapi', value: 'nazapi_api_key' },
        { name: 'URL Nazapi', value: 'nazapi_url' }
      )
    )
    .addStringOption(opt => opt.setName('valeur').setDescription('Valeur à définir').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('show')
    .setDescription('Voir les configurations actuelles (valeurs masquées)')
  )
  .addSubcommand(sub => sub
    .setName('delete')
    .setDescription('Supprimer une configuration')
    .addStringOption(opt => opt
      .setName('cle')
      .setDescription('Clé à supprimer')
      .setRequired(true)
      .addChoices(
        { name: 'Clé API Intel_X', value: 'intelx_api_key' },
        { name: 'Clé API Nazapi', value: 'nazapi_api_key' },
        { name: 'URL Nazapi', value: 'nazapi_url' }
      )
    )
  );

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
  }

  const db = getDB();
  const sub = interaction.options.getSubcommand();

  if (sub === 'set') {
    const key = interaction.options.getString('cle');
    const value = interaction.options.getString('valeur');
    db.prepare('INSERT OR REPLACE INTO guild_config (key, value) VALUES (?, ?)').run(key, value);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ Configuration mise à jour')
        .addFields(
          { name: 'Clé', value: ALLOWED_KEYS[key] || key, inline: true },
          { name: 'Valeur', value: key.includes('key') ? '`••••••••` (masquée)' : `\`${value}\``, inline: true }
        )
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'show') {
    const configs = Object.keys(ALLOWED_KEYS).map(key => {
      const row = db.prepare('SELECT value FROM guild_config WHERE key = ?').get(key);
      const isSet = !!row?.value;
      const display = !isSet ? '❌ Non configuré' : key.includes('key') ? '✅ `••••••••` (masquée)' : `✅ \`${row.value}\``;
      return { name: ALLOWED_KEYS[key], value: display, inline: false };
    });

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('⚙️ Configuration actuelle')
        .addFields(configs)
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'delete') {
    const key = interaction.options.getString('cle');
    db.prepare('DELETE FROM guild_config WHERE key = ?').run(key);
    return interaction.reply({
      content: `✅ Configuration \`${ALLOWED_KEYS[key] || key}\` supprimée.`,
      ephemeral: true
    });
  }
}
