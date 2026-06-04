/**
 * toolAnalyzer.js
 * Analyse un dépôt GitHub et génère un module JS natif pour le bot.
 * Supporte : tools API, scrapers, outils OSINT Python (réimplémentés en JS)
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = join(__dirname, '../../data/tools');
mkdirSync(TOOLS_DIR, { recursive: true });

const GITHUB_API = 'https://api.github.com';

/**
 * Récupère les infos d'un dépôt GitHub depuis son URL
 */
export async function fetchGitHubRepoInfo(githubUrl) {
  const { default: fetch } = await import('node-fetch');

  const match = githubUrl.match(/github\.com\/([^/]+)\/([^/\s#?]+)/);
  if (!match) throw new Error('URL GitHub invalide. Format attendu : https://github.com/user/repo');

  const [, owner, repo] = match;

  const headers = { 'User-Agent': 'NEXUS-Bot/1.0', 'Accept': 'application/vnd.github.v3+json' };

  const [repoRes, readmeRes, contentsRes] = await Promise.allSettled([
    fetch(`${GITHUB_API}/repos/${owner}/${repo}`, { headers }),
    fetch(`${GITHUB_API}/repos/${owner}/${repo}/readme`, { headers }),
    fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents`, { headers }),
  ]);

  if (!repoRes.value?.ok) throw new Error(`Dépôt introuvable ou privé: ${owner}/${repo}`);

  const repoData = await repoRes.value.json();
  let readme = '';
  let contents = [];

  if (readmeRes.value?.ok) {
    const readmeData = await readmeRes.value.json();
    readme = Buffer.from(readmeData.content || '', 'base64').toString('utf-8').substring(0, 8000);
  }

  if (contentsRes.value?.ok) {
    contents = await contentsRes.value.json();
  }

  // Fetch key source files to understand the tool
  const sourceFiles = await fetchKeySourceFiles(owner, repo, contents, headers, fetch);

  return {
    owner,
    repo,
    name: repoData.name,
    description: repoData.description || '',
    language: repoData.language || 'Unknown',
    stars: repoData.stargazers_count,
    topics: repoData.topics || [],
    readme,
    contents: contents.map(f => f.name),
    sourceFiles,
  };
}

async function fetchKeySourceFiles(owner, repo, contents, headers, fetch) {
  const interesting = ['main.py', 'app.py', 'index.js', 'main.js', 'core.py', 'search.py', 'api.py', 'config.py', 'requirements.txt', 'package.json'];
  const files = {};

  const toFetch = contents
    .filter(f => f.type === 'file' && interesting.some(n => f.name === n))
    .slice(0, 5);

  await Promise.all(toFetch.map(async f => {
    try {
      const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${f.name}`, { headers });
      if (res.ok) {
        const data = await res.json();
        files[f.name] = Buffer.from(data.content || '', 'base64').toString('utf-8').substring(0, 3000);
      }
    } catch {}
  }));

  return files;
}

/**
 * Analyse le contenu du dépôt et détermine la stratégie d'intégration
 */
export function analyzeRepo(repoInfo) {
  const { readme, sourceFiles, language, topics, description, name } = repoInfo;
  const fullText = (readme + JSON.stringify(sourceFiles) + description).toLowerCase();

  // Détecte le type de tool
  let type = 'script';
  let needsApiKey = false;
  let apiKeyHints = [];
  let queryTypes = [];
  let config = {};
  let detectedApis = [];

  // --- Détection API publique ---
  const apiPatterns = [
    { name: 'IntelX',        regex: /intelx\.io|intelligence\s*x/i,         endpoint: 'https://2.intelx.io', authType: 'x-key' },
    { name: 'Leakix',        regex: /leakix\.net/i,                           endpoint: 'https://leakix.net',  authType: 'bearer' },
    { name: 'HaveIBeenPwned',regex: /haveibeenpwned|hibp/i,                   endpoint: 'https://haveibeenpwned.com/api/v3', authType: 'hibp-api-key' },
    { name: 'Dehashed',      regex: /dehashed/i,                              endpoint: 'https://api.dehashed.com', authType: 'basic' },
    { name: 'Hunter.io',     regex: /hunter\.io/i,                            endpoint: 'https://api.hunter.io/v2', authType: 'query_key' },
    { name: 'Shodan',        regex: /shodan/i,                                endpoint: 'https://api.shodan.io', authType: 'query_key' },
    { name: 'Censys',        regex: /censys/i,                                endpoint: 'https://search.censys.io/api', authType: 'basic' },
    { name: 'VirusTotal',    regex: /virustotal/i,                            endpoint: 'https://www.virustotal.com/api/v3', authType: 'bearer' },
    { name: 'AbuseIPDB',     regex: /abuseipdb/i,                             endpoint: 'https://api.abuseipdb.com/api/v2', authType: 'bearer' },
    { name: 'WhoisXML',      regex: /whoisxml/i,                              endpoint: 'https://www.whoisxmlapi.com/whoisserver', authType: 'query_key' },
  ];

  for (const api of apiPatterns) {
    if (api.regex.test(fullText)) {
      detectedApis.push(api);
      type = 'api';
    }
  }

  // --- Détection besoin de clé API ---
  if (/api[_\s-]?key|apikey|token|secret|bearer|api_token|access_key/i.test(fullText)) {
    needsApiKey = true;
    const keyMatches = fullText.match(/["']([A-Z_]{3,30}(?:API[_]?KEY|TOKEN|SECRET|KEY)[A-Z_]*)["']/gi) || [];
    apiKeyHints = [...new Set(keyMatches.map(m => m.replace(/['"]/g, '')))].slice(0, 3);
  }

  // --- Détection types de requêtes supportés ---
  if (/email|mail|@/i.test(fullText))     queryTypes.push('email');
  if (/phone|tel|mobile|sms/i.test(fullText)) queryTypes.push('phone');
  if (/username|pseudo|user_?name/i.test(fullText)) queryTypes.push('username');
  if (/\bip\b|ip.?address|ipv4|ipv6/i.test(fullText)) queryTypes.push('ip');
  if (/\bname\b|first.?name|last.?name|nom|pr.?nom/i.test(fullText)) queryTypes.push('name');
  if (/domain|hostname|dns/i.test(fullText)) queryTypes.push('domain');
  if (/address|adresse|location|localisation/i.test(fullText)) queryTypes.push('address');
  if (/hash|md5|sha1|sha256|password|passwd/i.test(fullText)) queryTypes.push('hash');
  if (queryTypes.length === 0) queryTypes = ['global'];

  // --- Détection scraper ---
  if (/beautifulsoup|bs4|requests\.get|selenium|playwright|puppeteer|scrapy/i.test(fullText) && type !== 'api') {
    type = 'scraper';
  }

  // --- Config de base ---
  if (type === 'api' && detectedApis.length > 0) {
    const api = detectedApis[0];
    config = {
      endpoint: api.endpoint + '/{{query}}',
      auth_type: api.authType,
      api_key_required: needsApiKey,
      api_key_config_key: `tool_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_api_key`,
      results_path: 'results',
    };
  } else {
    config = {
      api_key_required: needsApiKey,
      api_key_config_key: needsApiKey ? `tool_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_api_key` : null,
    };
  }

  return {
    type,
    needsApiKey,
    apiKeyHints,
    queryTypes,
    config,
    detectedApis: detectedApis.map(a => a.name),
    suggestedName: repoInfo.name,
    suggestedEmoji: guessEmoji(fullText, queryTypes),
    description: repoInfo.description || `Tool OSINT depuis ${repoInfo.owner}/${repoInfo.repo}`,
  };
}

function guessEmoji(fullText, queryTypes) {
  if (/email|mail/i.test(fullText)) return '📧';
  if (/phone|tel/i.test(fullText)) return '📱';
  if (/\bip\b|shodan|censys/i.test(fullText)) return '🌐';
  if (/domain|dns|whois/i.test(fullText)) return '🔗';
  if (/username|social/i.test(fullText)) return '👤';
  if (/password|hash|leak/i.test(fullText)) return '🔓';
  if (/osint/i.test(fullText)) return '🕵️';
  return '🔧';
}

/**
 * Génère le code JS du module tool et le sauvegarde
 */
export function generateToolModule(toolId, repoInfo, analysis) {
  const { type, config, detectedApis } = analysis;
  const { owner, repo, sourceFiles, readme } = repoInfo;

  let code;

  if (type === 'api' && detectedApis.length > 0) {
    code = generateApiToolCode(toolId, repoInfo, analysis);
  } else if (type === 'scraper') {
    code = generateScraperToolCode(toolId, repoInfo, analysis);
  } else {
    code = generateGenericScriptCode(toolId, repoInfo, analysis);
  }

  const filePath = join(TOOLS_DIR, `${toolId}.js`);
  writeFileSync(filePath, code, 'utf-8');
  return filePath;
}

function generateApiToolCode(toolId, repoInfo, analysis) {
  const { config, detectedApis, queryTypes } = analysis;
  const apiName = detectedApis[0] || repoInfo.name;

  // Génère un adaptateur API basé sur l'analyse
  const endpointBuilders = {
    'IntelX': `
  // POST search puis GET results
  const searchRes = await fetch('https://2.intelx.io/intelligent/search', {
    method: 'POST',
    headers: { 'x-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ term: query, maxresults: 20, media: 0, sort: 4, terminate: [] }),
  });
  if (!searchRes.ok) throw new Error(\`IntelX HTTP \${searchRes.status}\`);
  const { id } = await searchRes.json();
  await new Promise(r => setTimeout(r, 2000));
  const res = await fetch(\`https://2.intelx.io/intelligent/search/result?id=\${id}&limit=20\`, { headers: { 'x-key': apiKey } });
  if (!res.ok) throw new Error(\`IntelX results HTTP \${res.status}\`);
  const data = await res.json();
  const records = data.records || [];
  return records.map(r => ({ Nom: r.name, Date: r.date, Source: r.bucket, Taille: r.size, Score: r.score }));`,

    'HaveIBeenPwned': `
  const res = await fetch(\`https://haveibeenpwned.com/api/v3/breachedaccount/\${encodeURIComponent(query)}?truncateResponse=false\`, {
    headers: { 'hibp-api-key': apiKey, 'User-Agent': 'NEXUS-Bot' }
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(\`HIBP HTTP \${res.status}\`);
  const data = await res.json();
  return data.map(b => ({ Breach: b.Name, Domain: b.Domain, Date: b.BreachDate, Comptes: b.PwnCount?.toLocaleString(), Types: b.DataClasses?.slice(0,5).join(', ') }));`,

    'Leakix': `
  const res = await fetch(\`https://leakix.net/api/leak/\${encodeURIComponent(query)}\`, {
    headers: { 'api-key': apiKey, 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(\`Leakix HTTP \${res.status}\`);
  const data = await res.json();
  const items = Array.isArray(data) ? data : [data];
  return items.slice(0,20).map(r => ({ Source: r.plugin, Date: r.time, Résumé: r.summary?.substring(0,200), Sévérité: r.severity }));`,

    'Shodan': `
  const res = await fetch(\`https://api.shodan.io/shodan/host/\${encodeURIComponent(query)}?key=\${apiKey}\`);
  if (!res.ok) throw new Error(\`Shodan HTTP \${res.status}\`);
  const data = await res.json();
  return [{ IP: data.ip_str, Pays: data.country_name, Org: data.org, OS: data.os, Ports: data.ports?.join(', '), Vulns: data.vulns ? Object.keys(data.vulns).join(', ') : 'Aucune' }];`,

    'AbuseIPDB': `
  const res = await fetch(\`https://api.abuseipdb.com/api/v2/check?ipAddress=\${encodeURIComponent(query)}&maxAgeInDays=90\`, {
    headers: { 'Key': apiKey, 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(\`AbuseIPDB HTTP \${res.status}\`);
  const { data } = await res.json();
  return [{ IP: data.ipAddress, Score: \`\${data.abuseConfidenceScore}%\`, Pays: data.countryCode, ISP: data.isp, Reports: data.totalReports, 'Dernier rapport': data.lastReportedAt }];`,

    'VirusTotal': `
  const res = await fetch(\`https://www.virustotal.com/api/v3/search?query=\${encodeURIComponent(query)}\`, {
    headers: { 'x-apikey': apiKey }
  });
  if (!res.ok) throw new Error(\`VirusTotal HTTP \${res.status}\`);
  const { data } = await res.json();
  return (data || []).slice(0,10).map(r => ({ ID: r.id, Type: r.type, Nom: r.attributes?.name, Détections: r.attributes?.last_analysis_stats ? JSON.stringify(r.attributes.last_analysis_stats) : 'N/A' }));`,

    'Hunter.io': `
  const res = await fetch(\`https://api.hunter.io/v2/email-finder?domain=\${encodeURIComponent(query)}&api_key=\${apiKey}\`);
  if (!res.ok) throw new Error(\`Hunter HTTP \${res.status}\`);
  const { data } = await res.json();
  const emails = data?.emails || [];
  return emails.slice(0,20).map(e => ({ Email: e.value, Confiance: \`\${e.confidence}%\`, Prénom: e.first_name, Nom: e.last_name, Position: e.position }));`,
  };

  const executionCode = endpointBuilders[apiName] || `
  const res = await fetch(\`${config.endpoint || 'https://api.example.com/search?q={{query}}'}\`.replace('{{query}}', encodeURIComponent(query)).replace('{{apiKey}}', apiKey), {
    headers: { 'Authorization': \`Bearer \${apiKey}\` }
  });
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  const data = await res.json();
  const records = data.results || data.data || data.items || (Array.isArray(data) ? data : [data]);
  return records.slice(0,20).map(r => typeof r === 'object' ? r : { Résultat: r });`;

  return `// Tool généré automatiquement depuis https://github.com/${repoInfo.owner}/${repoInfo.repo}
// Type: API | Source: ${apiName}
// Généré le: ${new Date().toISOString()}

export const TOOL_INFO = {
  id: '${toolId}',
  name: '${repoInfo.name}',
  type: 'api',
  source: 'https://github.com/${repoInfo.owner}/${repoInfo.repo}',
  queryTypes: ${JSON.stringify(analysis.queryTypes)},
};

/**
 * @param {string} query - La requête de l'utilisateur
 * @param {object} ctx - Contexte (clés API, config)
 * @returns {Promise<Array<object>|{error:string}>}
 */
export async function search(query, ctx = {}) {
  const { default: fetch } = await import('node-fetch');
  const apiKey = ctx['${config.api_key_config_key}'] || ctx.apiKey || '';

  if (!apiKey && ${analysis.needsApiKey}) {
    return { error: 'Clé API manquante pour ${repoInfo.name}. Configure avec \`/tool config id:${toolId} key:<valeur>\`' };
  }

  try {
    ${executionCode}
  } catch (e) {
    return { error: \`${repoInfo.name} erreur: \${e.message}\` };
  }
}
`;
}

function generateScraperToolCode(toolId, repoInfo, analysis) {
  return `// Tool généré automatiquement depuis https://github.com/${repoInfo.owner}/${repoInfo.repo}
// Type: SCRAPER
// Généré le: ${new Date().toISOString()}

export const TOOL_INFO = {
  id: '${toolId}',
  name: '${repoInfo.name}',
  type: 'scraper',
  source: 'https://github.com/${repoInfo.owner}/${repoInfo.repo}',
  queryTypes: ${JSON.stringify(analysis.queryTypes)},
};

/**
 * @param {string} query
 * @param {object} ctx
 * @returns {Promise<Array<object>|{error:string}>}
 */
export async function search(query, ctx = {}) {
  const { default: fetch } = await import('node-fetch');

  try {
    // Scraping basé sur l'analyse du repo ${repoInfo.owner}/${repoInfo.repo}
    // L'outil original utilise: ${repoInfo.language}
    // Description: ${repoInfo.description}
    //
    // Implémentation générique — à personnaliser via /tool edit si besoin
    const searchUrl = \`https://www.google.com/search?q=\${encodeURIComponent(query + ' site:' + '${repoInfo.repo}')}\`;
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NEXUS/1.0)' }
    });

    if (!res.ok) return { error: \`HTTP \${res.status}\` };

    const html = await res.text();

    // Parse basique — extraction des résultats
    const matches = [];
    const titleRegex = /<h3[^>]*>([^<]+)<\/h3>/gi;
    let m;
    while ((m = titleRegex.exec(html)) && matches.length < 10) {
      matches.push({ Résultat: m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"') });
    }

    return matches.length > 0 ? matches : [{ Info: 'Aucun résultat trouvé ou scraping bloqué' }];
  } catch (e) {
    return { error: \`${repoInfo.name} erreur: \${e.message}\` };
  }
}
`;
}

function generateGenericScriptCode(toolId, repoInfo, analysis) {
  // Détecte les patterns courants dans le code source
  const allSource = Object.values(repoInfo.sourceFiles || {}).join('\n');

  // Sherlock-like: vérifie les usernames sur des sites
  if (/sherlock|username|social.?media|site.?list/i.test(allSource + repoInfo.readme)) {
    return generateSherlockLikeCode(toolId, repoInfo, analysis);
  }

  // Holehe-like: vérifie les emails sur des sites
  if (/holehe|email.?check|account.?check|registered/i.test(allSource + repoInfo.readme)) {
    return generateHoleheLikeCode(toolId, repoInfo, analysis);
  }

  // Générique
  return `// Tool généré automatiquement depuis https://github.com/${repoInfo.owner}/${repoInfo.repo}
// Type: SCRIPT
// Généré le: ${new Date().toISOString()}
// Description: ${repoInfo.description}

export const TOOL_INFO = {
  id: '${toolId}',
  name: '${repoInfo.name}',
  type: 'script',
  source: 'https://github.com/${repoInfo.owner}/${repoInfo.repo}',
  queryTypes: ${JSON.stringify(analysis.queryTypes)},
};

/**
 * @param {string} query
 * @param {object} ctx
 * @returns {Promise<Array<object>|{error:string}>}
 */
export async function search(query, ctx = {}) {
  const { default: fetch } = await import('node-fetch');

  try {
    // Tool basé sur ${repoInfo.name} (${repoInfo.language})
    // Source: https://github.com/${repoInfo.owner}/${repoInfo.repo}
    //
    // Ce tool a été intégré automatiquement.
    // Si les résultats sont incorrects, un owner peut le modifier via /tool edit.

    const res = await fetch(\`https://api.github.com/search/code?q=\${encodeURIComponent(query)}+repo:${repoInfo.owner}/${repoInfo.repo}\`, {
      headers: { 'User-Agent': 'NEXUS-Bot/1.0', 'Accept': 'application/vnd.github.v3+json' }
    });

    return [{ Info: 'Tool intégré — nécessite une configuration manuelle', Source: 'https://github.com/${repoInfo.owner}/${repoInfo.repo}', Requête: query }];
  } catch (e) {
    return { error: \`${repoInfo.name} erreur: \${e.message}\` };
  }
}
`;
}

function generateSherlockLikeCode(toolId, repoInfo, analysis) {
  return `// Tool généré automatiquement depuis https://github.com/${repoInfo.owner}/${repoInfo.repo}
// Type: USERNAME CHECKER (Sherlock-like)
// Vérifie si un username existe sur les principales plateformes sociales
// Généré le: ${new Date().toISOString()}

export const TOOL_INFO = {
  id: '${toolId}',
  name: '${repoInfo.name}',
  type: 'script',
  source: 'https://github.com/${repoInfo.owner}/${repoInfo.repo}',
  queryTypes: ['username', 'name'],
};

const SITES = [
  { name: 'Twitter/X',  url: 'https://twitter.com/NEXUS_USER',         check: 'title>@' },
  { name: 'Instagram',  url: 'https://www.instagram.com/NEXUS_USER/',   check: 'og:title' },
  { name: 'GitHub',     url: 'https://github.com/NEXUS_USER',           check: 'itemprop="name"' },
  { name: 'Reddit',     url: 'https://www.reddit.com/user/NEXUS_USER/', check: 'karma' },
  { name: 'TikTok',     url: 'https://www.tiktok.com/@NEXUS_USER',      check: 'followerCount' },
  { name: 'Pinterest',  url: 'https://www.pinterest.com/NEXUS_USER/',   check: 'pinterestapp:pin' },
  { name: 'Twitch',     url: 'https://www.twitch.tv/NEXUS_USER',        check: 'isLiveBroadcast' },
  { name: 'YouTube',    url: 'https://www.youtube.com/@NEXUS_USER',     check: 'canonicalBaseUrl' },
  { name: 'LinkedIn',   url: 'https://www.linkedin.com/in/NEXUS_USER',  check: 'public-profile' },
  { name: 'Snapchat',   url: 'https://www.snapchat.com/add/NEXUS_USER', check: 'snapchat-username' },
  { name: 'Steam',      url: 'https://steamcommunity.com/id/NEXUS_USER',check: 'actual_persona_name' },
  { name: 'Spotify',    url: 'https://open.spotify.com/user/NEXUS_USER',check: 'data-testid' },
  { name: 'Roblox',     url: 'https://www.roblox.com/user.aspx?username=NEXUS_USER', check: 'profileLink' },
  { name: 'Patreon',    url: 'https://www.patreon.com/NEXUS_USER',      check: 'creator_name' },
  { name: 'Medium',     url: 'https://medium.com/@NEXUS_USER',          check: 'og:title' },
];

export async function search(query, ctx = {}) {
  const { default: fetch } = await import('node-fetch');
  const username = query.trim().replace(/^@/, '');
  const results = [];

  const checks = SITES.map(async site => {
    const url = site.url.replace(/NEXUS_USER/g, encodeURIComponent(username));
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        redirect: 'follow',
        signal: AbortSignal.timeout(5000),
      });
      if (res.status === 200) {
        const html = await res.text();
        if (html.toLowerCase().includes(site.check.toLowerCase())) {
          results.push({ Plateforme: site.name, URL: url, Statut: '✅ Trouvé' });
        }
      }
    } catch {}
  });

  await Promise.allSettled(checks);
  return results.length > 0 ? results : [{ Info: 'Aucun compte trouvé pour "' + username + '"' }];
}
`;
}

function generateHoleheLikeCode(toolId, repoInfo, analysis) {
  return `// Tool généré automatiquement depuis https://github.com/${repoInfo.owner}/${repoInfo.repo}
// Type: EMAIL CHECKER (Holehe-like)
// Vérifie si une adresse email est enregistrée sur les principales plateformes
// Généré le: ${new Date().toISOString()}

export const TOOL_INFO = {
  id: '${toolId}',
  name: '${repoInfo.name}',
  type: 'script',
  source: 'https://github.com/${repoInfo.owner}/${repoInfo.repo}',
  queryTypes: ['email'],
};

const SITES = [
  { name: 'Google',     check: async (email, fetch) => {
    const res = await fetch(\`https://mail.google.com/mail/gxlu?email=\${encodeURIComponent(email)}\`, { redirect: 'manual', headers: {'User-Agent': 'Mozilla/5.0'} });
    return res.headers.get('set-cookie')?.includes('COMPASS') || false;
  }},
  { name: 'Twitter/X',  check: async (email, fetch) => {
    const res = await fetch('https://api.twitter.com/i/users/email_available.json?email=' + encodeURIComponent(email), { headers: {'User-Agent': 'Mozilla/5.0'} });
    if (!res.ok) return false;
    const d = await res.json(); return d.valid === false;
  }},
  { name: 'Instagram',  check: async (email, fetch) => {
    const res = await fetch('https://www.instagram.com/accounts/web_create_ajax/attempt/', {
      method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': 'missing', 'User-Agent': 'Mozilla/5.0'},
      body: 'email=' + encodeURIComponent(email)
    });
    if (!res.ok) return false;
    const d = await res.json(); return d.errors?.email?.[0]?.code === 'email_is_taken';
  }},
  { name: 'Firefox',    check: async (email, fetch) => {
    const res = await fetch('https://api.accounts.firefox.com/v1/account/status?email=' + encodeURIComponent(email), {headers: {'User-Agent': 'Mozilla/5.0'}});
    if (!res.ok) return false;
    const d = await res.json(); return d.exists === true;
  }},
];

export async function search(query, ctx = {}) {
  const { default: fetch } = await import('node-fetch');
  const email = query.trim();

  if (!email.includes('@')) return { error: 'Requête invalide — email attendu' };

  const results = [];
  const checks = SITES.map(async site => {
    try {
      const found = await site.check(email, fetch);
      if (found) results.push({ Plateforme: site.name, Email: email, Statut: '✅ Compte existant' });
    } catch {}
  });

  await Promise.allSettled(checks);
  return results.length > 0 ? results : [{ Info: \`Aucun compte trouvé pour "\${email}"\` }];
}
`;
}
