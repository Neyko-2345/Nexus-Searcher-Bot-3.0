import { getDB } from './database.js';

export async function searchIntelX(query, searchType) {
  const db = getDB();
  const keyRow = db.prepare("SELECT value FROM guild_config WHERE key = 'intelx_api_key'").get();
  const apiKey = keyRow?.value;

  if (!apiKey) {
    return { error: 'Clé API Intel_X non configurée. Un admin doit faire `/config set intelx_api_key <clé>`.' };
  }

  try {
    const { default: fetch } = await import('node-fetch');

    const searchRes = await fetch('https://2.intelx.io/intelligent/search', {
      method: 'POST',
      headers: { 'x-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ term: query, maxresults: 10, media: 0, sort: 4, terminate: [] }),
    });

    if (!searchRes.ok) {
      const err = await searchRes.text();
      return { error: `Intel_X API error: ${searchRes.status} — ${err}` };
    }

    const searchData = await searchRes.json();
    const searchId = searchData.id;

    await new Promise(r => setTimeout(r, 2000));

    const resultsRes = await fetch(`https://2.intelx.io/intelligent/search/result?id=${searchId}&limit=10&offset=0`, {
      headers: { 'x-key': apiKey }
    });

    if (!resultsRes.ok) return { error: `Intel_X results error: ${resultsRes.status}` };

    const resultsData = await resultsRes.json();
    const records = resultsData.records || [];

    return {
      results: records.map(r => ({
        name: r.name || 'Unknown',
        date: r.date,
        bucket: r.bucket,
        type: r.type,
        size: r.size,
        score: r.score
      })),
      total: records.length,
      source: 'Intel_X'
    };
  } catch (e) {
    return { error: `Intel_X erreur: ${e.message}` };
  }
}

export async function searchNazAPI(query, searchType) {
  const db = getDB();
  const keyRow = db.prepare("SELECT value FROM guild_config WHERE key = 'nazapi_api_key'").get();
  const apiKey = keyRow?.value;

  const urlRow = db.prepare("SELECT value FROM guild_config WHERE key = 'nazapi_url'").get();
  const baseUrl = urlRow?.value || 'https://nazapi.example.com';

  if (!apiKey) {
    return { error: 'Clé API Nazapi non configurée. Un admin doit faire `/config set nazapi_api_key <clé>`.' };
  }

  try {
    const { default: fetch } = await import('node-fetch');

    const endpointMap = {
      email: '/search/email',
      phone: '/search/phone',
      username: '/search/username',
      ip: '/search/ip',
      name: '/search/name',
      default: '/search'
    };
    const endpoint = endpointMap[searchType] || endpointMap.default;

    const res = await fetch(`${baseUrl}${endpoint}?q=${encodeURIComponent(query)}&limit=10`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });

    if (!res.ok) {
      const err = await res.text();
      return { error: `Nazapi error: ${res.status} — ${err}` };
    }

    const data = await res.json();
    const records = data.results || data.data || [];

    return {
      results: records.slice(0, 10).map(r => (typeof r === 'object' ? r : { value: r })),
      total: records.length,
      source: 'Nazapi'
    };
  } catch (e) {
    return { error: `Nazapi erreur: ${e.message}` };
  }
}
