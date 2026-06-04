// Détecte automatiquement le type d'une requête de recherche

const PATTERNS = [
  { type: 'email',      regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  { type: 'ip',         regex: /^(\d{1,3}\.){3}\d{1,3}(\/\d+)?$|^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/ },
  { type: 'phone',      regex: /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,3}[)]?[-\s\.]?[0-9]{3,5}[-\s\.]?[0-9]{3,6}$/ },
  { type: 'discord_id', regex: /^\d{17,20}$/ },
  { type: 'iban',       regex: /^[A-Z]{2}\d{2}[A-Z0-9]{4,32}$/ },
  { type: 'hash',       regex: /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$/ },
  { type: 'domain',     regex: /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/ },
  { type: 'url',        regex: /^https?:\/\/.+/ },
];

const KEYWORD_HINTS = {
  phone:    ['+33', '+1', '+44', '+49', '+39', '06', '07', '08', '09'],
  address:  ['rue', 'avenue', 'boulevard', 'allée', 'impasse', 'route', 'chemin', 'place', 'street', 'road', 'apt'],
  name:     [], // fallback
};

/**
 * Détecte le type de la requête.
 * Retourne { type: string, confidence: 'high'|'medium'|'low' }
 */
export function detectQueryType(query) {
  const q = query.trim();

  for (const { type, regex } of PATTERNS) {
    if (regex.test(q)) {
      return { type, confidence: 'high' };
    }
  }

  const qLower = q.toLowerCase();

  for (const [type, hints] of Object.entries(KEYWORD_HINTS)) {
    if (hints.some(h => qLower.startsWith(h))) {
      return { type, confidence: 'medium' };
    }
  }

  // Heuristiques supplémentaires
  const words = q.split(/\s+/);
  if (words.length >= 2 && words.every(w => /^[a-zA-ZÀ-ÿ'-]+$/.test(w))) {
    return { type: 'name', confidence: 'medium' };
  }

  if (/^\d{5}$/.test(q)) return { type: 'address', confidence: 'medium' }; // code postal

  return { type: 'global', confidence: 'low' };
}

/**
 * Retourne les types de tools compatibles avec le type détecté.
 * Un tool sans restriction de type est toujours compatible.
 */
export function getCompatibleQueryTypes(detectedType) {
  if (detectedType === 'global') return null; // null = tous
  // Types compatibles par "famille"
  const families = {
    email:      ['email', 'global'],
    phone:      ['phone', 'global'],
    name:       ['name', 'global'],
    username:   ['username', 'name', 'global'],
    discord_id: ['discord_id', 'username', 'global'],
    ip:         ['ip', 'global'],
    address:    ['address', 'global'],
    iban:       ['iban', 'global'],
    hash:       ['hash', 'global'],
    domain:     ['domain', 'email', 'global'],
    url:        ['url', 'domain', 'global'],
  };
  return families[detectedType] || [detectedType, 'global'];
}
