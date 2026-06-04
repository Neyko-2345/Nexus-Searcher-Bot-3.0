import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const FAQ = [
  {
    keywords: ['aide', 'commencer', 'début', 'démarrer', 'setup', 'start', 'comment', 'configurer', 'première', 'premier'],
    title: '🚀 Comment démarrer ?',
    answer: [
      '**Ordre recommandé pour configurer le bot :**',
      '',
      '1️⃣ `/config set cle:admin_role_id valeur:ID_ROLE` — Définir le rôle admin',
      '2️⃣ `/db add nom:sfr label:SFR fichier:[ton_fichier]` — Ajouter une base',
      '3️⃣ `/db fields nom:sfr champs:📧:Email:email,📱:Tel:phone` — Définir les colonnes',
      '4️⃣ `/embed set title:NΞXUS description:...` — Personnaliser le menu',
      '5️⃣ `/logs setup salon:#logs` — Activer les logs',
      '6️⃣ `/search` — Déployer le menu dans un salon',
      '',
      '> 📖 Utilise `/guide` pour le guide complet page par page.',
    ].join('\n'),
    color: 0x5865f2,
  },
  {
    keywords: ['db', 'base', 'database', 'données', 'ajouter', 'importer', 'json', 'csv', 'zip', 'fichier', 'upload', 'pdf'],
    title: '🗄️ Ajouter une base de données',
    answer: [
      '**`/db add`** — Upload un fichier `.json` `.csv` `.jsonl` `.txt` `.zip` ou `.pdf`',
      '```',
      '/db add nom:sfr label:SFR fichier:[sfr.json] emoji:📱 options:email,phone',
      '```',
      '• **`nom`** — ID interne sans espaces (ex: `sfr`, `bouygues`)',
      '• **`label`** — Nom affiché dans le menu',
      '• **`options`** — Options prioritaires (ex: `email,phone`)',
      '',
      '**Configurer les colonnes :**',
      '`/db fields nom:sfr champs:📧:Email:email,📱:Tel:phone`',
      '',
      '**Autres commandes :** `/db list` `/db info nom:sfr` `/db edit` `/db remove`',
    ].join('\n'),
    color: 0x57f287,
  },
  {
    keywords: ['embed', 'apparence', 'couleur', 'titre', 'image', 'thumbnail', 'footer', 'personnaliser', 'modifier', 'design'],
    title: '🎨 Personnaliser les embeds',
    answer: [
      '**3 types d\'embeds configurables :**',
      '',
      '**1. Menu principal** → `/embed set`',
      '```',
      '/embed set title:NΞXUS color:#5865f2 footer:NΞXUS™ thumbnail_fichier:[img.png]',
      '```',
      '',
      '**2. Résultats de recherche** → `/embed option`',
      '```',
      '/embed option option:email titre:{results} résultats pour {query} couleur:5865f2',
      '```',
      'Variables : `{query}` `{type}` `{results}` `{user}`',
      '',
      '**3. Sous-menus groupe** → `/embed group`',
      '```',
      '/embed group groupe:operateurs titre:📱 Opérateurs thumbnail_fichier:[logo.png]',
      '```',
      '',
      '> 💡 Images : utilise `thumbnail_fichier` / `image_fichier` / `footer_icon_fichier` pour uploader depuis ta galerie.',
    ].join('\n'),
    color: 0xf1c40f,
  },
  {
    keywords: ['group', 'groupe', 'sous-menu', 'submenu', 'organiser', 'catégorie', 'catégories'],
    title: '📂 Créer des groupes / sous-menus',
    answer: [
      '**Les groupes créent des sous-menus dans le menu principal.**',
      '',
      '**1. Créer le groupe :**',
      '```',
      '/group create valeur:operateurs label:Opérateurs emoji:📱',
      '```',
      '',
      '**2. Ajouter des éléments :**',
      '```',
      '/group add groupe:operateurs cible:db_sfr label:SFR emoji:📱',
      '/group add groupe:operateurs cible:email label:Par Email emoji:📧',
      '```',
      'Cibles possibles : `db_NOM` (base), `email`, `phone`, `name`… (options), `custom_VALEUR`',
      '',
      '**Voir les IDs disponibles :** `/option ids`',
      '**Lister les groupes :** `/group list`',
    ].join('\n'),
    color: 0xfee75c,
  },
  {
    keywords: ['option', 'recherche', 'type', 'custom', 'personnalisé', 'vip', 'accès', 'restreindre'],
    title: '⚙️ Gérer les options de recherche',
    answer: [
      '**Options intégrées :** `email` `phone` `name` `username` `discord_id` `ip` `address` `iban` `password`',
      '',
      '**Ajouter une option custom :**',
      '```',
      '/option add label:Steam ID emoji:🎮 modal_label:Ton Steam ID',
      '```',
      '',
      '**Passer une option en VIP :**',
      '`/option access option:email mode:vip`',
      '',
      '**Masquer une option intégrée :**',
      '`/option remove label:Email`  →  restaurer avec `/option restore label:Email`',
      '',
      '**Voir tous les IDs :**',
      '`/option ids` — liste toutes les options, groupes et bases',
    ].join('\n'),
    color: 0xeb459e,
  },
  {
    keywords: ['plugin', 'api', 'externe', 'intelx', 'nazapi', 'connecter'],
    title: '🔌 Connecter une API (plugin)',
    answer: [
      '**Les plugins connectent des APIs externes à chaque recherche.**',
      '',
      '**Ajouter un plugin :**',
      '```',
      '/plugin add nom:MON_API fichier:[plugin.js] option:email',
      '```',
      '',
      '**Format du fichier plugin.js :**',
      '```js',
      'export async function search(query, type) {',
      '  const res = await fetch(`https://api.exemple.com/search?q=${query}`);',
      '  const json = await res.json();',
      '  return { results: json.items, total: json.count };',
      '}',
      '```',
      '',
      '**Commandes :** `/plugin list` `/plugin reload nom:MON_API` `/plugin remove nom:MON_API`',
      '> `/plugin help` → voir le format complet attendu',
    ].join('\n'),
    color: 0xe67e22,
  },
  {
    keywords: ['vip', 'plan', 'crédits', 'crédit', 'accès', 'rôle', 'limite', 'gratuit', 'unlimited', 'illimité'],
    title: '💳 Plans VIP & Crédits',
    answer: [
      '**Créer un plan pour un rôle Discord :**',
      '```',
      '/plan set role:@VIP nom:VIP credits:100 illimite:true',
      '/plan set role:@Premium nom:Premium credits:50 illimite:false',
      '```',
      '',
      '**Gérer les crédits individuellement :**',
      '`/credits add user:@Dupont montant:10`',
      '`/credits unlimited user:@Dupont`',
      '`/credits reset user:@Dupont`',
      '`/credits info user:@Dupont`',
      '',
      '**Définir la limite gratuite (membres sans plan) :**',
      '`/option access-credits nombre:5`',
      '',
      '> 💡 Les admins ont toujours un accès illimité, peu importe la config.',
    ].join('\n'),
    color: 0x2ecc71,
  },
  {
    keywords: ['logs', 'log', 'historique', 'surveiller', 'recherches', 'salon', 'channel', 'activer'],
    title: '📋 Activer les logs de recherche',
    answer: [
      '**Activer les logs dans un salon :**',
      '```',
      '/logs setup salon:#logs-recherches',
      '```',
      'Le bot envoie un embed dans ce salon à chaque recherche (utilisateur, type, requête, résultats).',
      '',
      '**Voir les dernières recherches :**',
      '`/logs history nombre:20 utilisateur:@Dupont`',
      '',
      '**Recherche avancée dans les logs :**',
      '`/logs search mot_cle:gmail.com option:email depuis:2025-01-01`',
      '',
      '**Désactiver :** `/logs disable`',
      '**Voir le statut :** `/logs status`',
      '**Effacer tout :** `/logs clear`',
    ].join('\n'),
    color: 0x9b59b6,
  },
  {
    keywords: ['blacklist', 'bloquer', 'bannir', 'interdire', 'utilisateur', 'membre', 'débloquer'],
    title: '🚫 Blacklist',
    answer: [
      '**Bloquer un utilisateur :**',
      '`/blacklist add user:@Dupont raison:Abus du système`',
      '',
      '**Débloquer :**',
      '`/blacklist remove user:@Dupont`',
      '',
      '**Voir la liste :**',
      '`/blacklist list`',
      '',
      '> ⚠️ La blacklist agit sur l\'ID Discord, pas le pseudo. Renommer ne contourne pas le blocage.',
    ].join('\n'),
    color: 0xe74c3c,
  },
  {
    keywords: ['search', 'menu', 'déployer', 'salon', 'bouton', 'lancer', 'envoyer', 'embed principal'],
    title: '🔍 Déployer le menu de recherche',
    answer: [
      '**Envoyer l\'embed de recherche dans un salon :**',
      '`/search` — dans le salon de ton choix',
      '',
      'Les membres cliquent sur le bouton → menu déroulant (éphémère, privé).',
      '',
      '**Personnaliser l\'embed :**',
      '`/embed set title:... description:... image:... footer:...`',
      '',
      '**Embed d\'info public (visible par tous) :**',
      '`/search info` — affiche les infos du service dans le salon',
      '`/search info-set title:... description:...` — modifier cet embed',
      '',
      '> 💡 Tu peux faire `/search` dans plusieurs salons différents.',
    ].join('\n'),
    color: 0x3498db,
  },
  {
    keywords: ['bot', 'nom', 'statut', 'rename', 'status', 'bio', 'profil', 'redémarrer', 'reload', 'owner'],
    title: '🤖 Commandes /bot',
    answer: [
      '**Modifier le profil du bot :**',
      '`/bot rename nom:NΞXUS™`  *(limite : 2x/heure)*',
      '`/bot status presence:online type:Watching texte:les données...`',
      '`/bot bio texte:Bot OSINT NΞXUS™`',
      '`/bot info` — voir infos + uptime + temps avant sleep Replit',
      '',
      '**Redémarrer le bot :**',
      '`/bot reload` — redémarre proprement (~2-5 sec de coupure)',
      '',
      '> ⚠️ Les commandes `/bot` nécessitent d\'être **owner** du bot.',
      '> Gérer les owners : `/owner add` `/owner list` `/owner remove`',
    ].join('\n'),
    color: 0x3498db,
  },
  {
    keywords: ['config', 'admin', 'rôle', 'role', 'configurer', 'id', 'paramètre'],
    title: '⚙️ Configuration générale',
    answer: [
      '**Définir le rôle admin :**',
      '`/config set cle:admin_role_id valeur:1234567890123456789`',
      '',
      '**Définir le rôle VIP :**',
      '`/config set cle:vip_role_id valeur:1234567890123456789`',
      '',
      '**Voir la configuration actuelle :**',
      '`/config show`',
      '',
      '**Comment trouver l\'ID d\'un rôle ?**',
      '> Mode développeur Discord → clic droit sur le rôle → Copier l\'ID',
      '',
      '> 💡 Sans `admin_role_id`, seul le propriétaire du serveur a accès aux commandes admin.',
    ].join('\n'),
    color: 0x95a5a6,
  },
  {
    keywords: ['tool', 'tools', 'github', 'osint externe', 'sherlock', 'holehe', 'username checker', 'email checker', 'intégrer', 'outil', 'cache', 'détection'],
    title: '🔧 Moteur de tools OSINT (/tool)',
    answer: [
      '**`/tool` intègre des outils OSINT depuis GitHub directement dans le bot.**',
      'Le bot génère un module JS natif — aucune exécution Python requise.',
      '',
      '> ⚠️ Réservé aux **owners** du bot (`/owner list` pour vérifier).',
      '',
      '**Ajouter un tool depuis GitHub :**',
      '```',
      '/tool add url:https://github.com/sherlock-project/sherlock',
      '/tool add url:https://github.com/megadose/holehe',
      '```',
      '',
      '**Gérer les tools :**',
      '`/tool list` — voir tous les tools installés',
      '`/tool test id:<id> query:jean@gmail.com` — tester en live',
      '`/tool toggle id:<id>` — activer / désactiver',
      '`/tool config id:<id> key:<clé_api>` — configurer une clé API',
      '`/tool cache` — vider le cache (10 min TTL, ⚡ = depuis cache)',
      '',
      '**Fonctionnement :**',
      '• Le bot **détecte automatiquement** le type de requête (email, IP, username…)',
      '• Les tools s\'exécutent **en parallèle** avec les bases de données',
      '• Les résultats apparaissent dans le même embed que les résultats DB',
      '',
      '> 📖 `/guide` page 7 pour le guide complet de `/tool`.',
    ].join('\n'),
    color: 0x00b4d8,
  },
  {
    keywords: ['statut', 'status membre', 'détect', 'automatique', 'rôle automatique', 'attribuer'],
    title: '🔄 Détection de statut',
    answer: [
      '**Attribuer un rôle automatiquement selon le statut du membre :**',
      '```',
      '/statut-accès config',
      '```',
      'Cette commande te demande :',
      '• Le texte à détecter dans le statut du membre (ex: `NΞXUS`)',
      '• Le rôle à attribuer automatiquement',
      '',
      'Quand un membre a ce texte dans son statut, le bot lui donne le rôle configuré.',
      'Quand le texte disparaît, le bot retire le rôle.',
      '',
      '**Voir la config actuelle :**',
      '`/statut-accès info`',
      '',
      '**Désactiver :**',
      '`/statut-accès disable`',
    ].join('\n'),
    color: 0x1abc9c,
  },
];

function findBestAnswer(question) {
  const q = question.toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const entry of FAQ) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (q.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return bestScore > 0 ? best : null;
}

export const data = new SlashCommandBuilder()
  .setName('aide')
  .setDescription('Pose une question au bot et obtiens une réponse instantanée')
  .addStringOption(opt => opt
    .setName('question')
    .setDescription('Ta question (ex: "comment ajouter une base de données ?")')
    .setRequired(true)
    .setMaxLength(300)
  );

export async function execute(interaction) {
  const question = interaction.options.getString('question');
  const answer   = findBestAnswer(question);

  if (!answer) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle('❓ Question non reconnue')
        .setDescription(
          `Je n'ai pas trouvé de réponse précise pour : **"${question}"**\n\n` +
          '**Essaie de reformuler avec des mots-clés comme :**\n' +
          '`base de données` • `embed` • `groupe` • `option` • `plugin` • `vip` • `logs` • `blacklist` • `config` • `bot` • `statut`\n\n' +
          '> 📖 Utilise `/guide` pour le guide complet.\n' +
          '> 📋 Utilise `/help` pour la liste de toutes les commandes.'
        )
        .setFooter({ text: 'NΞXUS™ Assistant' })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(answer.color)
      .setTitle(`💬 ${answer.title}`)
      .setDescription(answer.answer)
      .setFooter({ text: 'NΞXUS™ Assistant • /guide pour le guide complet • /help pour toutes les commandes' })
      .setTimestamp()
    ],
    ephemeral: true
  });
}
