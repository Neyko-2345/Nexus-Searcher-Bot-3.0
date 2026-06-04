// Tool généré automatiquement depuis https://github.com/reconurge/flowsint
// Type: USERNAME CHECKER (Sherlock-like)
// Vérifie si un username existe sur les principales plateformes sociales
// Généré le: 2026-06-04T11:11:49.617Z

export const TOOL_INFO = {
  id: 'flowsint_mpzeaxlt',
  name: 'flowsint',
  type: 'script',
  source: 'https://github.com/reconurge/flowsint',
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
