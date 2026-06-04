import { EmbedBuilder } from 'discord.js';
import { getDB } from './database.js';
import { smartParse, formatParsedFields } from './smartParser.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, '../../data/databases');

const TYPE_FIELDS = {
  email:      ['email', 'mail', 'e-mail', 'Email', 'EMAIL', 'courriel'],
  phone:      ['phone', 'telephone', 'tel', 'mobile', 'Phone', 'PHONE', 'number', 'numero'],
  name:       ['name', 'nom', 'prenom', 'firstname', 'lastname', 'fullname', 'first_name', 'last_name', 'pseudo', 'NOM', 'PRENOM'],
  username:   ['username', 'pseudo', 'login', 'nick', 'Username', 'user', 'name', 'discord_name'],
  discord_id: ['discord_id', 'discordid', 'discord', 'id', 'user_id', 'uid'],
  ip:         ['ip', 'ip_address', 'ipv4', 'ipv6', 'last_ip', 'IP'],
  address:    ['address', 'adresse', 'rue', 'street', 'Address', 'ADRESSE', 'city', 'ville', 'City', 'CITY', 'VILLE', 'postal', 'zip', 'code_postal', 'zipcode', 'postcode', 'cp'],
  iban:       ['iban', 'IBAN', 'bank'],
  password:   ['password', 'pass', 'passwd', 'mdp', 'pwd', 'PASSWORD'],
};

function loadDatabaseEntries(database) {
  const filePath = join(DB_DIR, database.filename);
  if (!existsSync(filePath)) return [];
  try {
    const content = readFileSync(filePath, 'utf-8');
    if (database.filename.endsWith('.json')) {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : Object.values(parsed);
    }
    return content.split('\n').filter(l => l.trim()).map(line => {
      try { return JSON.parse(line); } catch { return { raw: line }; }
    });
  } catch (e) {
    console.error(`[SEARCH] Error reading ${database.name}:`, e.message);
    return [];
  }
}

function entryMatchesQuery(entry, queryLower, relevantFields) {
  if (typeof entry !== 'object' || entry === null) {
    return String(entry).toLowerCase().includes(queryLower);
  }
  if (relevantFields.length > 0) {
    for (const field of relevantFields) {
      const val = entry[field];
      if (val && String(val).toLowerCase().includes(queryLower)) return true;
    }
  }
  return JSON.stringify(entry).toLowerCase().includes(queryLower);
}

// Search across databases linked to a specific option type via db_option_links
export function searchInLocalDatabases(query, searchType) {
  const db = getDB();
  // Only search in databases explicitly linked to this searchType
  const databases = db.prepare(`
    SELECT d.* FROM databases d
    INNER JOIN db_option_links l ON d.name = l.db_name
    WHERE l.option_value = ?
  `).all(searchType);

  const results = [];
  const queryLower = query.toLowerCase().trim();
  const relevantFields = TYPE_FIELDS[searchType] || [];

  for (const database of databases) {
    const entries = loadDatabaseEntries(database);
    for (const entry of entries) {
      if (results.length >= 100) break;
      if (entryMatchesQuery(entry, queryLower, relevantFields)) {
        results.push({ source: database.name, dbLabel: database.label || database.name, data: entry });
      }
    }
    if (results.length >= 100) break;
  }
  return results;
}

// Search in one specific database (any field)
export function searchInSpecificDatabase(dbName, query) {
  const db = getDB();
  const database = db.prepare('SELECT * FROM databases WHERE name = ?').get(dbName);
  if (!database) return [];
  const entries = loadDatabaseEntries(database);
  const queryLower = query.toLowerCase().trim();
  const results = [];
  for (const entry of entries) {
    if (results.length >= 200) break;
    if (entryMatchesQuery(entry, queryLower, [])) {
      results.push({ source: database.name, dbLabel: database.label || database.name, data: entry });
    }
  }
  return results;
}

// Global search filtered to specific database names (for group Global)
export function searchGlobalFiltered(query, dbNames) {
  const db = getDB();
  const databases = dbNames.length > 0
    ? db.prepare(`SELECT * FROM databases WHERE name IN (${dbNames.map(() => '?').join(',')})`)
        .all(...dbNames)
    : [];
  const grouped = {};
  const queryLower = query.toLowerCase().trim();

  for (const database of databases) {
    const entries = loadDatabaseEntries(database);
    const matches = [];
    for (const entry of entries) {
      if (matches.length >= 50) break;
      if (entryMatchesQuery(entry, queryLower, [])) matches.push(entry);
    }
    if (matches.length > 0) {
      grouped[database.name] = {
        label: database.label || database.name,
        emoji: database.emoji || '🗄️',
        records: matches
      };
    }
  }
  return grouped;
}

// Global search across ALL databases (grouped by source)
export function searchGlobal(query) {
  const db = getDB();
  const databases = db.prepare('SELECT * FROM databases').all();
  const grouped = {};
  const queryLower = query.toLowerCase().trim();

  for (const database of databases) {
    const entries = loadDatabaseEntries(database);
    const matches = [];
    for (const entry of entries) {
      if (matches.length >= 50) break;
      if (entryMatchesQuery(entry, queryLower, [])) {
        matches.push(entry);
      }
    }
    if (matches.length > 0) {
      grouped[database.name] = {
        label: database.label || database.name,
        emoji: database.emoji || '🗄️',
        records: matches
      };
    }
  }
  return grouped;
}

// Build result embed for a specific database + record
export function buildDbResultEmbed(dbName, record, page, total, query) {
  const db = getDB();
  const config = db.prepare('SELECT * FROM db_embed_config WHERE db_name = ?').get(dbName);
  const dbRow   = db.prepare('SELECT * FROM databases WHERE name = ?').get(dbName);

  const title = config?.title || `${dbRow?.emoji || '🗄️'} ${dbRow?.label || dbName}`;
  const color = config?.color ? parseInt(config.color.replace('#', ''), 16) : 0x5865f2;
  const description = config?.description
    ? config.description.replace('{query}', query)
    : `Requête: \`${query}\``;

  let fieldsConfig = [];
  if (config?.fields_json) {
    try { fieldsConfig = JSON.parse(config.fields_json); } catch {}
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `Page ${page}/${total}` })
    .setTimestamp();

  if (config?.thumbnail) {
    embed.setThumbnail(config.thumbnail);
  }

  if (typeof record !== 'object' || record === null) {
    embed.addFields({ name: '📄 Données', value: `\`${String(record).substring(0, 1024)}\``, inline: false });
    return embed;
  }

  if (fieldsConfig.length > 0) {
    for (const f of fieldsConfig) {
      const val = record[f.key];
      if (val !== undefined && val !== null && val !== '') {
        embed.addFields({
          name: `${f.emoji || ''} ${f.label}`.trim(),
          value: `\`${String(val).substring(0, 1020)}\``,
          inline: f.inline ?? false
        });
      }
    }
  } else {
    const keys = Object.keys(record).slice(0, 20);
    for (const key of keys) {
      const val = record[key];
      if (val !== null && val !== undefined && val !== '') {
        embed.addFields({
          name: key,
          value: `\`${String(val).substring(0, 1020)}\``,
          inline: false
        });
      }
    }
  }

  return embed;
}

// Legacy format for built-in type search
export function formatResults(results, query, searchType) {
  if (results.length === 0) return null;
  const fields = results.slice(0, 10).map((r, i) => {
    const data = r.data;
    let lines = [];
    if (typeof data === 'object' && data !== null) {
      const keys = Object.keys(data).slice(0, 10);
      for (const key of keys) {
        const val = data[key];
        if (val !== null && val !== undefined && val !== '') {
          lines.push(`**${key}:** \`${String(val).substring(0, 120)}\``);
        }
      }
    } else {
      lines.push(`\`${String(data).substring(0, 300)}\``);
    }
    return {
      name: `📄 #${i + 1} — ${r.dbLabel || r.source}`,
      value: lines.join('\n') || '*Données vides*',
      inline: false
    };
  });
  return { fields, total: results.length };
}

// Search across ALL databases for option-type search, grouped by DB (linked DBs first)
export function searchInLocalDatabasesGrouped(query, searchType) {
  const db = getDB();
  const queryLower = query.toLowerCase().trim();
  const relevantFields = TYPE_FIELDS[searchType] || [];

  const linkedRows  = db.prepare('SELECT db_name FROM db_option_links WHERE option_value = ?').all(searchType);
  const linkedNames = new Set(linkedRows.map(r => r.db_name));
  const allDatabases = db.prepare('SELECT * FROM databases').all();

  const sorted = [
    ...allDatabases.filter(d => linkedNames.has(d.name)),
    ...allDatabases.filter(d => !linkedNames.has(d.name))
  ];

  const grouped = {};
  for (const database of sorted) {
    const entries = loadDatabaseEntries(database);
    const matches = [];
    for (const entry of entries) {
      if (matches.length >= 50) break;
      if (entryMatchesQuery(entry, queryLower, relevantFields)) matches.push(entry);
    }
    if (matches.length > 0) {
      grouped[database.name] = {
        label:    database.label || database.name,
        emoji:    database.emoji || '🗄️',
        records:  matches,
        isLinked: linkedNames.has(database.name)
      };
    }
  }
  return grouped;
}

// Build a summary embed for one DB in a grouped multi-result view
export function buildDbGroupedEmbed(dbName, groupData, query) {
  const db = getDB();
  const config = db.prepare('SELECT * FROM db_embed_config WHERE db_name = ?').get(dbName);
  const { label, emoji, records, isLinked } = groupData;
  const color = config?.color ? parseInt(config.color.replace('#', ''), 16) : 0x3b4252;
  const title = config?.title || `${emoji} ${label}`;
  const count = records.length;

  const desc = config?.description
    ? config.description.replace('{query}', query).replace('{results}', count)
    : `Requête : \`${query}\``;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${title} — ${count} résultat(s)${isLinked ? ' ⭐' : ''}`)
    .setDescription(desc)
    .setFooter({ text: isLinked ? '⭐ Base prioritaire — liée à cette option' : '🌐 Correspondance trouvée dans toutes les bases' })
    .setTimestamp();

  if (config?.thumbnail) embed.setThumbnail(config.thumbnail);
  if (config?.image)     embed.setImage(config.image);

  let fieldsConfig = [];
  if (config?.fields_json) { try { fieldsConfig = JSON.parse(config.fields_json); } catch {} }

  // Détermine si le smart parse est activé pour cette base
  const parseMode = config?.parse_mode || db.prepare('SELECT parse_mode FROM databases WHERE name = ?').get(dbName)?.parse_mode || 'smart';
  const useSmartParse = parseMode !== 'raw';

  const toShow = records.slice(0, 5);
  for (let i = 0; i < toShow.length; i++) {
    const record = toShow[i];
    let value;
    if (fieldsConfig.length > 0) {
      // Champs configurés manuellement → priorité absolue
      const lines = fieldsConfig.map(f => {
        const val = record[f.key];
        return (val !== null && val !== undefined && val !== '')
          ? `${f.emoji ? f.emoji + ' ' : ''}**${f.label}:** \`${String(val).substring(0, 80)}\``
          : null;
      }).filter(Boolean);
      value = lines.join('\n') || '*Données vides*';
    } else if (useSmartParse) {
      // Smart parse universel
      const parsed = smartParse(record, dbName);
      value = formatParsedFields(parsed.fields, parsed._raw);
      if (!value || value.trim() === '') value = `\`${String(record).substring(0, 300)}\``;
    } else if (typeof record === 'object' && record !== null) {
      // Mode RAW — affichage brut structuré
      const lines = Object.entries(record).slice(0, 6).map(([k, v]) =>
        (v !== null && v !== undefined && v !== '')
          ? `**${k}:** \`${String(v).substring(0, 80)}\``
          : null
      ).filter(Boolean);
      value = lines.join('\n') || '*Données vides*';
    } else {
      value = `\`${String(record).substring(0, 300)}\``;
    }
    embed.addFields({ name: `📄 Entrée #${i + 1}`, value: value.substring(0, 1024), inline: false });
  }

  if (count > 5) {
    embed.addFields({ name: `…+${count - 5} résultat(s) supplémentaire(s)`, value: 'Affine ta recherche pour voir plus de résultats.', inline: false });
  }
  return embed;
}

export function exportResults(results, format) {
  if (format === 'json') {
    return {
      content: JSON.stringify(results.map(r => ({ source: r.source, ...r.data })), null, 2),
      filename: `export_${Date.now()}.json`
    };
  }
  const lines = results.map(r => {
    const d = r.data;
    const prefix = `[${r.source}]`;
    if (typeof d === 'object' && d !== null) {
      return prefix + ' ' + Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(' | ');
    }
    return prefix + ' ' + String(d);
  });
  return { content: lines.join('\n'), filename: `export_${Date.now()}.txt` };
}
