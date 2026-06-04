/**
 * smartParser.js
 * Parseur intelligent universel de lignes brutes pour les bases de données.
 *
 * Stratégie :
 * 1. Détecte les séparateurs (|, :, =, \t, ;, ,)
 * 2. Identifie les paires clé:valeur ou les colonnes nommées
 * 3. Applique des heuristiques de nommage de champs
 * 4. Retourne un objet structuré + un score de confiance
 * 5. Si le parsing est trop incertain, retourne { raw: ligne, _parsed: false }
 */

// Patterns de détection de valeurs connues
const FIELD_PATTERNS = [
  { key: 'email',    regex: /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/ },
  { key: 'ip',       regex: /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/ },
  { key: 'phone',    regex: /^(?:\+33|0033|0)[1-9](?:\d{8}|\d{2}[\s.\-]\d{2}[\s.\-]\d{2}[\s.\-]\d{2})$/ },
  { key: 'url',      regex: /^https?:\/\//i },
  { key: 'password', regex: /^(?=.*[a-zA-Z])(?=.*\d).{6,}$/ },
  { key: 'date',     regex: /^\d{4}[-\/]\d{2}[-\/]\d{2}$/ },
  { key: 'number',   regex: /^\d+$/ },
];

// Mots-clés connus → nom de champ normalisé
const LABEL_SYNONYMS = {
  mail: 'email', courriel: 'email', e_mail: 'email',
  mdp: 'password', pass: 'password', passwd: 'password', pwd: 'password', pw: 'password',
  mot_de_passe: 'password',
  tel: 'phone', telephone: 'phone', mobile: 'phone', num: 'phone',
  prenom: 'prénom', firstname: 'prénom', first_name: 'prénom',
  nom: 'nom', lastname: 'nom', last_name: 'nom', name: 'nom',
  username: 'username', pseudo: 'username', login: 'login', user: 'username',
  adresse: 'adresse', address: 'adresse', rue: 'adresse',
  ville: 'ville', city: 'ville',
  cp: 'code_postal', postal: 'code_postal', zip: 'code_postal',
  pays: 'pays', country: 'pays',
  ip: 'ip', ip_address: 'ip',
  hash: 'hash',
  salt: 'salt',
  id: 'id', uid: 'id', user_id: 'id',
  nombre_de_mail: 'nb_emails', nombre_mail: 'nb_emails',
  message_non_lue: 'messages_non_lus', message_non_lu: 'messages_non_lus',
};

function normalizeLabel(raw) {
  const lower = raw.toLowerCase().trim().replace(/[\s\-]/g, '_');
  return LABEL_SYNONYMS[lower] || lower;
}

function detectFieldType(value) {
  const v = String(value).trim();
  for (const p of FIELD_PATTERNS) {
    if (p.regex.test(v)) return p.key;
  }
  return null;
}

// Sépare une ligne en tokens avec le séparateur le plus probable
function splitLine(line) {
  const separators = [
    { sep: '|',  score: (line.match(/\|/g) || []).length },
    { sep: '\t', score: (line.match(/\t/g) || []).length * 3 }, // tab très fiable
    { sep: ';',  score: (line.match(/;/g)  || []).length },
    { sep: ',',  score: (line.match(/,/g)  || []).length },
  ];

  separators.sort((a, b) => b.score - a.score);
  const best = separators[0];

  if (best.score === 0) {
    // Essai avec espace multiple
    const parts = line.split(/\s{2,}/);
    if (parts.length > 1) return { tokens: parts, sep: '  ' };
    return { tokens: [line], sep: null };
  }
  return { tokens: line.split(best.sep).map(t => t.trim()), sep: best.sep };
}

// Essaie de parser une paire clé=valeur ou clé:valeur
function tryKeyValue(token) {
  // Forme "Label = valeur" ou "Label : valeur" ou "Label: valeur"
  const m = token.match(/^([^:=]+?)\s*[:=]\s*(.+)$/);
  if (!m) return null;
  const rawLabel = m[1].trim();
  const rawVal   = m[2].trim();
  // Éviter de parser des emails (user@host:port) comme clé:valeur
  if (/^[a-zA-Z0-9._%+\-]+@/.test(rawLabel)) return null;
  return { key: normalizeLabel(rawLabel), value: rawVal };
}

/**
 * Parse une entrée (objet ou chaîne brute) en un objet structuré.
 * Retourne { fields: {...}, confidence: 'high'|'medium'|'low', _raw: ligne_originale }
 */
export function smartParse(entry, dbName = '') {
  // Déjà un objet structuré — juste normaliser les labels
  if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
    const fields = {};
    for (const [k, v] of Object.entries(entry)) {
      if (v === null || v === undefined || v === '') continue;
      fields[normalizeLabel(k)] = String(v);
    }
    return { fields, confidence: 'high', _raw: null };
  }

  const line = String(entry).trim();
  if (!line) return { fields: { raw: line }, confidence: 'low', _raw: line };

  const { tokens, sep } = splitLine(line);

  // Si un seul token : pas de séparateur
  if (tokens.length === 1 || !sep) {
    // Essai clé:valeur sur la ligne entière
    const kv = tryKeyValue(line);
    if (kv) return { fields: { [kv.key]: kv.value }, confidence: 'medium', _raw: line };
    // Détection de type auto
    const detected = detectFieldType(line);
    if (detected) return { fields: { [detected]: line }, confidence: 'medium', _raw: line };
    return { fields: { raw: line }, confidence: 'low', _raw: line };
  }

  // Plusieurs tokens — essai clé:valeur sur chaque token
  const kvPairs = tokens.map(t => tryKeyValue(t)).filter(Boolean);
  if (kvPairs.length > 0 && kvPairs.length >= tokens.length * 0.5) {
    // La majorité des tokens sont des paires clé:valeur
    const fields = {};
    for (const { key, value } of kvPairs) {
      // Éviter d'écraser si même clé
      if (fields[key]) {
        fields[`${key}_2`] = value;
      } else {
        fields[key] = value;
      }
    }
    // Les tokens sans clé:valeur → détecter le type
    const orphans = tokens.filter((t, i) => !kvPairs[i]);
    for (const t of orphans) {
      const detected = detectFieldType(t.trim());
      if (detected && !fields[detected]) fields[detected] = t.trim();
    }
    return { fields, confidence: kvPairs.length === tokens.length ? 'high' : 'medium', _raw: line };
  }

  // Tokens sans clés → heuristique par type de valeur
  const fields = {};
  const used = new Set();
  for (const token of tokens) {
    const v = token.trim();
    if (!v) continue;
    const detected = detectFieldType(v);
    if (detected && !used.has(detected)) {
      fields[detected] = v;
      used.add(detected);
    } else if (detected) {
      // Doublon de type → email2, password2…
      let n = 2;
      while (used.has(`${detected}_${n}`)) n++;
      fields[`${detected}_${n}`] = v;
      used.add(`${detected}_${n}`);
    } else {
      // Token non typé → champ générique
      let idx = 1;
      while (fields[`champ_${idx}`]) idx++;
      fields[`champ_${idx}`] = v;
    }
  }

  const typedCount = Object.keys(fields).filter(k => !k.startsWith('champ_')).length;
  const confidence = typedCount >= tokens.length * 0.6 ? 'medium' : 'low';
  return { fields, confidence, _raw: line };
}

/**
 * Applique smartParse à un tableau d'entrées.
 * Retourne { parsed: [...], stats: { high, medium, low } }
 */
export function smartParseAll(entries, dbName = '') {
  const stats = { high: 0, medium: 0, low: 0 };
  const parsed = entries.map(entry => {
    const result = smartParse(entry, dbName);
    stats[result.confidence]++;
    return result;
  });
  return { parsed, stats };
}

/**
 * Formate un objet fields en lignes lisibles pour un embed Discord.
 */
export function formatParsedFields(fields, raw = null) {
  const LABELS = {
    email: '📧 Email', password: '🔑 Mot de passe', phone: '📞 Téléphone',
    ip: '🌐 IP', url: '🔗 URL', prénom: '👤 Prénom', nom: '👤 Nom',
    username: '🎮 Username', login: '🔓 Login', adresse: '🏠 Adresse',
    ville: '🏙️ Ville', code_postal: '📮 Code postal', pays: '🌍 Pays',
    id: '🆔 ID', hash: '🔒 Hash', salt: '🧂 Salt', date: '📅 Date',
    nb_emails: '📬 Nb. emails', messages_non_lus: '📩 Msgs non lus',
    number: '#️⃣', raw: '📄 Brut',
  };

  const lines = [];
  for (const [k, v] of Object.entries(fields)) {
    if (!v || v === '') continue;
    const label = LABELS[k] || `📌 ${k.replace(/_/g, ' ')}`;
    const display = String(v).length > 100 ? String(v).substring(0, 97) + '…' : String(v);
    lines.push(`${label} : \`${display}\``);
  }
  if (lines.length === 0 && raw) lines.push(`📄 Brut : \`${String(raw).substring(0, 300)}\``);
  return lines.join('\n');
}
