// Tool généré automatiquement depuis https://github.com/HowToFind-bot/osint-tools
// Type: SCRIPT
// Généré le: 2026-06-03T12:45:34.121Z
// Description: OSINT open-source tools catalog

export const TOOL_INFO = {
  id: 'osint_tools_mpy27mt5',
  name: 'osint-tools',
  type: 'script',
  source: 'https://github.com/HowToFind-bot/osint-tools',
  queryTypes: ["email","phone","ip","domain","address","hash"],
};

/**
 * @param {string} query
 * @param {object} ctx
 * @returns {Promise<Array<object>|{error:string}>}
 */
export async function search(query, ctx = {}) {
  const { default: fetch } = await import('node-fetch');

  try {
    // Tool basé sur osint-tools (Unknown)
    // Source: https://github.com/HowToFind-bot/osint-tools
    //
    // Ce tool a été intégré automatiquement.
    // Si les résultats sont incorrects, un owner peut le modifier via /tool edit.

    const res = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(query)}+repo:HowToFind-bot/osint-tools`, {
      headers: { 'User-Agent': 'NEXUS-Bot/1.0', 'Accept': 'application/vnd.github.v3+json' }
    });

    return [{ Info: 'Tool intégré — nécessite une configuration manuelle', Source: 'https://github.com/HowToFind-bot/osint-tools', Requête: query }];
  } catch (e) {
    return { error: `osint-tools erreur: ${e.message}` };
  }
}
