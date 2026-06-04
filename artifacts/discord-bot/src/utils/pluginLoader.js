import { existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { getDB } from './database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(__dirname, '../../data/plugins');

const loadedPlugins = new Map(); // name -> { module, meta }

export async function loadAllPlugins() {
  const db = getDB();
  const plugins = db.prepare('SELECT * FROM plugins').all();

  for (const plugin of plugins) {
    await loadPlugin(plugin);
  }
  console.log(`[PLUGINS] Loaded ${loadedPlugins.size} plugin(s)`);
}

export async function loadPlugin(pluginRecord) {
  const filePath = join(PLUGIN_DIR, pluginRecord.filename);
  if (!existsSync(filePath)) {
    console.warn(`[PLUGINS] File not found: ${pluginRecord.filename}`);
    return false;
  }
  try {
    // Cache-bust on reload with timestamp query param
    const url = pathToFileURL(filePath).href + `?t=${Date.now()}`;
    const mod = await import(url);
    loadedPlugins.set(pluginRecord.name, { module: mod, record: pluginRecord });
    console.log(`[PLUGINS] Loaded plugin: ${pluginRecord.name}`);
    return true;
  } catch (e) {
    console.error(`[PLUGINS] Error loading ${pluginRecord.name}:`, e.message);
    return false;
  }
}

export async function reloadPlugin(name) {
  const db = getDB();
  const rec = db.prepare('SELECT * FROM plugins WHERE name = ?').get(name);
  if (!rec) return false;
  loadedPlugins.delete(name);
  return loadPlugin(rec);
}

export function getLoadedPlugins() {
  return [...loadedPlugins.values()];
}

export async function searchWithPlugin(pluginName, query, searchType) {
  const entry = loadedPlugins.get(pluginName);
  if (!entry) return { error: 'Plugin non chargé' };
  try {
    const result = await entry.module.search(query, searchType);
    return result;
  } catch (e) {
    return { error: e.message };
  }
}

export async function searchWithAllPluginsForOption(optionValue, query) {
  const db = getDB();
  const plugins = db.prepare('SELECT * FROM plugins WHERE option_value = ?').get(optionValue);
  if (!plugins) return [];
  const results = [];
  for (const [name, entry] of loadedPlugins) {
    if (entry.record.option_value !== optionValue) continue;
    try {
      const res = await entry.module.search(query, optionValue);
      if (Array.isArray(res)) {
        results.push(...res.map(r => ({ source: entry.record.name, data: r })));
      }
    } catch {}
  }
  return results;
}
