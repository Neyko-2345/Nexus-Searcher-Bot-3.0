import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('[ERROR] DISCORD_TOKEN manquant.');
  process.exit(1);
}

const parts = token.split('.');
if (parts.length < 2) {
  console.error('[ERROR] Token invalide.');
  process.exit(1);
}

let clientId;
try {
  clientId = Buffer.from(parts[0], 'base64').toString('utf-8');
} catch {
  console.error('[ERROR] Impossible de décoder le client ID depuis le token.');
  process.exit(1);
}

console.log(`[DEPLOY] Client ID: ${clientId}`);

const commands = [];
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = pathToFileURL(join(commandsPath, file)).href;
  const command = await import(filePath);
  if ('data' in command) {
    commands.push(command.data.toJSON());
    console.log(`[DEPLOY] Chargé: /${command.data.name}`);
  }
}

const rest = new REST().setToken(token);

try {
  console.log(`[DEPLOY] Enregistrement de ${commands.length} commandes...`);
  const data = await rest.put(
    Routes.applicationCommands(clientId),
    { body: commands }
  );
  console.log(`[DEPLOY] ✅ ${data.length} commandes enregistrées avec succès!`);
  data.forEach(cmd => console.log(`  /${cmd.name}`));
} catch (error) {
  console.error('[DEPLOY] ❌ Erreur:', error.message);
  if (error.rawError) console.error('Détails:', JSON.stringify(error.rawError, null, 2));
}
