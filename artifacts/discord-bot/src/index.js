import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { initDB } from './utils/database.js';
import { loadAllPlugins } from './utils/pluginLoader.js';
import { initSubscriptionManager } from './utils/subscriptionManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

client.commands = new Collection();

const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const filePath = pathToFileURL(join(commandsPath, file)).href;
  const command  = await import(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  }
}

const eventsPath = join(__dirname, 'events');
const eventFiles = readdirSync(eventsPath).filter(f => f.endsWith('.js'));
for (const file of eventFiles) {
  const filePath = pathToFileURL(join(eventsPath, file)).href;
  const event    = await import(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

initDB();
await loadAllPlugins();
initSubscriptionManager(client);

// Empêche le bot de crasher sur des erreurs Discord non-critiques (ex: interaction expirée 10062)
client.on('error', (err) => {
  console.error('[CLIENT ERROR]', err.message || err);
});

process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]', err?.message || err);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err?.message || err);
});

client.login(process.env.DISCORD_TOKEN);
