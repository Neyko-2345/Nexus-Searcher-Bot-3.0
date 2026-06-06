/**
 * toolEngine.js
 * Moteur principal d'exécution des tools externes.
 * Types : 'api' | 'script' | 'scraper'
 * Les tools "script" sont des modules JS natifs stockés dans data/tools/
 */

import { getDB } from './database.js';
import { getCached, setCached } from './toolCache.js';
import { getCompatibleQueryTypes } from './queryDetector.js';
import { createRequire } from 'module';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = join(__dirname, '../../data/tools');

// Cache des modules JS chargés dynamiquement
const loadedModules = new Map();

/**
 * Charge ou recharge un module tool JS dynamiquement
 */
async function loadToolModule(toolId) {
  const filePath = join(TOOLS_DIR, `${toolId}.js`);
  if (!existsSync(filePath)) return null;
  // Recharger si le fichier a changé (forcer avec timestamp)
  const key = `${toolId}_${existsSync(filePath) ? 'ok' : 'miss'}`;
  if (loadedModules.has(key)) return loadedModules.get(key);
  try {
    const mod = await import(pathToFileURL(filePath).href + `?t=${Date.now()}`);
    loadedModules.set(key, mod);
    return mod;
  } catch (e) {
    console.error(`[TOOL] Erreur chargement module ${toolId}:`, e.message);
    return null;
  }
}

/**
 * Récupère les tools actifs compatibles avec l'option sélectionnée ET le type de requête détecté.
 *
 * Règle des liens d'options :
 *  - Tool AVEC liens dans tool_option_links → tourne UNIQUEMENT sur les options liées.
 *    (ex: flowsint lié à "username" → ne tourne pas sur email, phone, groupes, global…)
 *  - Tool SANS liens → tourne sur toutes les options (comportement global, rétro-compat).
 *  - Recherche globale (optionValue = null) → seuls les tools sans liens s'exécutent.
 */
export function getCompatibleTools(detectedType, optionValue = null) {
  const db = getDB();
  const tools = db.prepare('SELECT * FROM tools WHERE enabled = 1').all();

  // ── Filtrage par liens d'options ──────────────────────────────────────────
  // On récupère tous les liens en une seule requête pour éviter N+1
  const allLinks = db.prepare('SELECT tool_id, option_value FROM tool_option_links').all();
  const linkMap  = {};
  for (const lk of allLinks) {
    if (!linkMap[lk.tool_id]) linkMap[lk.tool_id] = [];
    linkMap[lk.tool_id].push(lk.option_value);
  }

  const optionFiltered = tools.filter(tool => {
    const linked = linkMap[tool.id];
    if (!linked || linked.length === 0) return true;          // pas de liens → global
    if (!optionValue) return false;                           // lié mais recherche globale → skip
    return linked.includes(optionValue);                      // lié → seulement sur l'option exacte
  });

  // ── Filtrage par type de requête détecté ─────────────────────────────────
  if (!detectedType || detectedType === 'global') return optionFiltered;

  const compatible = getCompatibleQueryTypes(detectedType);
  if (!compatible) return optionFiltered;

  return optionFiltered.filter(t => {
    if (!t.query_types) return true;
    try {
      const types = JSON.parse(t.query_types);
      if (!types || types.length === 0) return true;
      return types.some(qt => compatible.includes(qt));
    } catch {
      return true;
    }
  });
}

/**
 * Exécute un tool sur une requête.
 * Retourne { toolId, toolName, toolEmoji, results, error, fromCache }
 */
export async function executeTool(tool, query) {
  const cached = getCached(tool.id, query);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  let result;
  try {
    switch (tool.type) {
      case 'api':
        result = await executeApiTool(tool, query);
        break;
      case 'script':
        result = await executeScriptTool(tool, query);
        break;
      case 'scraper':
        result = await executeScraperTool(tool, query);
        break;
      default:
        result = { error: `Type de tool inconnu: ${tool.type}` };
    }
  } catch (e) {
    result = { error: `Erreur d'exécution: ${e.message}` };
  }

  const payload = {
    toolId:    tool.id,
    toolName:  tool.name,
    toolEmoji: tool.emoji || '🔧',
    ...result,
    fromCache: false,
  };

  if (!result.error) {
    setCached(tool.id, query, payload, (tool.cache_ttl || 600) * 1000);
  }

  return payload;
}

/**
 * Exécute tous les tools compatibles en parallèle pour une requête
 */
export async function executeAllCompatibleTools(query, detectedType, optionValue = null) {
  const tools = getCompatibleTools(detectedType, optionValue);
  if (tools.length === 0) return [];

  const results = await Promise.allSettled(
    tools.map(tool => executeTool(tool, query))
  );

  return results
    .map((r, i) => r.status === 'fulfilled' ? r.value : {
      toolId:    tools[i].id,
      toolName:  tools[i].name,
      toolEmoji: tools[i].emoji || '🔧',
      error:     r.reason?.message || 'Erreur inconnue',
      fromCache: false,
    })
    .filter(r => !r.error || r.results?.length > 0);
}

// ── Exécuteurs par type ────────────────────────────────────────────────────

async function executeApiTool(tool, query) {
  const { default: fetch } = await import('node-fetch');
  const db = getDB();

  let config = {};
  try { config = JSON.parse(tool.config_json || '{}'); } catch {}

  // Récupère la clé API si nécessaire
  let apiKey = null;
  if (config.api_key_config_key) {
    const keyRow = db.prepare('SELECT value FROM guild_config WHERE key = ?').get(config.api_key_config_key);
    apiKey = keyRow?.value;
    if (!apiKey && config.api_key_required !== false) {
      return { error: `Clé API manquante pour ${tool.name}. Configure-la avec \`/tool config\`.` };
    }
  }

  const endpoint = buildEndpoint(config.endpoint, query, apiKey);
  const headers = buildHeaders(config.headers || {}, apiKey, config.auth_type);

  const fetchOptions = {
    method: config.method || 'GET',
    headers,
  };

  if (config.body_template && fetchOptions.method !== 'GET') {
    fetchOptions.body = JSON.stringify(
      JSON.parse(config.body_template.replace('{{query}}', query).replace('{{apiKey}}', apiKey || ''))
    );
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(endpoint, fetchOptions);
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    return { error: `HTTP ${res.status}: ${err.substring(0, 200)}` };
  }

  const raw = await res.json().catch(() => null);
  if (!raw) return { error: 'Réponse invalide (non-JSON)' };

  return parseApiResponse(raw, config, query, tool.name);
}

async function executeScriptTool(tool, query) {
  const mod = await loadToolModule(tool.id);
  if (!mod || !mod.search) {
    return { error: `Module tool "${tool.name}" introuvable ou invalide.` };
  }

  const db = getDB();
  let config = {};
  try { config = JSON.parse(tool.config_json || '{}'); } catch {}

  // Injecter les clés API depuis la config
  const keys = {};
  if (config.api_key_config_key) {
    const keyRow = db.prepare('SELECT value FROM guild_config WHERE key = ?').get(config.api_key_config_key);
    if (keyRow?.value) keys[config.api_key_config_key] = keyRow.value;
  }

  const raw = await mod.search(query, { ...config, ...keys });
  return normalizeScriptResult(raw, tool.name);
}

async function executeScraperTool(tool, query) {
  const mod = await loadToolModule(tool.id);
  if (!mod || !mod.search) {
    return { error: `Module scraper "${tool.name}" introuvable ou invalide.` };
  }

  const raw = await mod.search(query, {});
  return normalizeScriptResult(raw, tool.name);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildEndpoint(template, query, apiKey) {
  if (!template) return '';
  return template
    .replace('{{query}}', encodeURIComponent(query))
    .replace('{{query_raw}}', query)
    .replace('{{apiKey}}', apiKey || '');
}

function buildHeaders(headersTemplate, apiKey, authType) {
  const headers = {};
  for (const [k, v] of Object.entries(headersTemplate)) {
    headers[k] = v.replace('{{apiKey}}', apiKey || '');
  }
  if (authType === 'bearer' && apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (authType === 'x-key' && apiKey) {
    headers['x-key'] = apiKey;
  }
  return headers;
}

function parseApiResponse(raw, config, query, toolName) {
  const resultsPath = config.results_path || null;
  let records = raw;

  if (resultsPath) {
    for (const key of resultsPath.split('.')) {
      records = records?.[key];
    }
  }

  if (!Array.isArray(records)) {
    if (typeof records === 'object' && records !== null) {
      records = [records];
    } else if (typeof raw === 'object') {
      records = [raw];
    } else {
      records = [];
    }
  }

  const mapped = records.slice(0, 20).map(r => {
    if (config.field_map) {
      const out = {};
      for (const [label, path] of Object.entries(config.field_map)) {
        const val = path.split('.').reduce((o, k) => o?.[k], r);
        if (val !== undefined && val !== null && val !== '') out[label] = val;
      }
      return Object.keys(out).length > 0 ? out : r;
    }
    return r;
  });

  return {
    results: mapped,
    total: records.length,
    source: toolName,
  };
}

function normalizeScriptResult(raw, toolName) {
  if (!raw) return { results: [], total: 0, source: toolName };
  if (raw.error) return { error: raw.error };
  if (Array.isArray(raw)) return { results: raw.slice(0, 20), total: raw.length, source: toolName };
  if (raw.results) return { results: raw.results.slice(0, 20), total: raw.total || raw.results.length, source: toolName };
  if (typeof raw === 'object') return { results: [raw], total: 1, source: toolName };
  return { results: [], total: 0, source: toolName };
}
