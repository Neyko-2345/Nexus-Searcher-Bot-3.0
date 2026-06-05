import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/adminCheck.js';

const COMMANDS = [
  {
    category: '🔍 Recherche & Panel — `/search`',
    adminOnly: false,
    cmds: [
      { name: '/search deploy',      usage: '/search deploy',      desc: 'Envoie l\'embed de recherche avec les 3 boutons (Rechercher, Profil, Guide) dans le salon.', note: 'Admins.' },
      { name: '/search info',        usage: '/search info',        desc: 'Affiche un embed d\'information public dans le salon (visible par tous).' },
      { name: '/search info-set',    usage: '/search info-set title:... description:... image_fichier:[img]', desc: 'Modifier l\'embed d\'info public. Supporte images depuis la galerie.' },
      { name: '/search lock',        usage: '/search lock',        desc: '🔒 Verrouille le panel de recherche. Les membres voient un message éphémère de refus.', note: 'Owner uniquement.' },
      { name: '/search unlock',      usage: '/search unlock',      desc: '🔓 Déverrouille le panel de recherche.', note: 'Owner uniquement.' },
      { name: '/search btn-search',  usage: '/search btn-search label:Rechercher emoji:<:rechercher:...> couleur:primary', desc: 'Modifier le bouton Rechercher (label, emoji, couleur).', note: 'Owner uniquement.' },
      { name: '/search btn-profile', usage: '/search btn-profile actif:true',  desc: 'Activer ou désactiver le bouton Profil dans l\'embed search.', note: 'Owner uniquement.' },
      { name: '/search btn-guide',   usage: '/search btn-guide actif:true',    desc: 'Activer ou désactiver le bouton Guide dans l\'embed search.', note: 'Owner uniquement.' },
      { name: '/search profile-set', usage: '/search profile-set title:... description:... footer:... color:#5865f2 contact_message:...', desc: 'Configurer l\'embed du profil utilisateur. Variables : {user} {plan} {credits} {max_credits} {next_reset} {searches} {unlimited}.', note: 'Owner uniquement.' },
      { name: '/search guide-set',   usage: '/search guide-set title:... description:... footer:... color:#3b3b44',    desc: 'Configurer l\'embed guide utilisateur (affiché quand le membre clique sur le bouton guide).', note: 'Owner uniquement.' },
    ]
  },
  {
    category: '❓ Assistant IA — `/aide`',
    adminOnly: false,
    cmds: [
      { name: '/aide', usage: '/aide question:comment ajouter une base de données ?', desc: 'Pose une question et reçois une réponse instantanée sur le fonctionnement du bot.' }
    ]
  },
  {
    category: '🗄️ Bases de données — `/db`',
    adminOnly: true,
    cmds: [
      { name: '/db add',    usage: '/db add nom:sfr label:SFR fichier:[fichier] emoji:📱 options:email,phone id_externe:SFR_2024', desc: 'Ajoute une base (.json, .jsonl, .csv, .txt, .zip). Options liées = priorité de recherche.' },
      { name: '/db edit',   usage: '/db edit nom:sfr label:SFR2 options:email,phone id_externe:SFR_V2',                           desc: 'Modifier le label, description, emoji, options liées ou ID externe d\'une base.' },
      { name: '/db remove', usage: '/db remove nom:sfr',                                                                           desc: 'Supprime une base de données et son fichier.' },
      { name: '/db list',   usage: '/db list',                                                                                     desc: 'Liste toutes les bases avec état (VIP, visible, options liées, entrées).' },
      { name: '/db config', usage: '/db config nom:sfr titre:📱 SFR couleur:ff6b35 footer:... image:https://…',                   desc: 'Personnalise l\'embed de résultats (titre, couleur, description, thumbnail, footer, image). Variables : {query}, {results}' },
      { name: '/db fields', usage: '/db fields nom:sfr champs:👤:Prénom:prenom,📧:Email:email',                                   desc: 'Définit les colonnes à afficher dans les résultats. Format : emoji:Label:clé_json' },
      { name: '/db access', usage: '/db access nom:sfr mode:vip',                                                                  desc: 'Passe une base en accès VIP uniquement ou libre.' },
      { name: '/db menu',   usage: '/db menu nom:sfr visible:true',                                                                desc: 'Affiche ou cache une base dans le menu de recherche.' },
      { name: '/db info',   usage: '/db info nom:sfr',                                                                             desc: 'Affiche tous les détails d\'une base (champs, embed, accès, options liées, ID externe).' }
    ]
  },
  {
    category: '📂 Groupes / Sous-menus — `/group`',
    adminOnly: true,
    cmds: [
      { name: '/group create',      usage: '/group create valeur:operateurs label:Opérateurs emoji:📱',      desc: 'Crée un groupe. Dans le menu principal il ouvre un sous-menu.' },
      { name: '/group set-emoji',   usage: '/group set-emoji valeur:operateurs emoji:📱',                    desc: 'Change l\'emoji du groupe tel qu\'il apparaît dans le menu principal.' },
      { name: '/group config',      usage: '/group config valeur:operateurs titre:... couleur:#5865f2',       desc: 'Personnalise l\'embed du sous-menu du groupe (titre, description, couleur, thumbnail).' },
      { name: '/group add',         usage: '/group add groupe:operateurs cible:db_sfr label:SFR emoji:📱',    desc: 'Ajoute un élément dans le groupe. La cible peut être db_sfr, email, custom_steam…' },
      { name: '/group emoji',       usage: '/group emoji groupe:operateurs cible:db_sfr emoji:📱',            desc: 'Modifie l\'emoji d\'un élément existant dans le sous-menu d\'un groupe.' },
      { name: '/group remove-item', usage: '/group remove-item groupe:operateurs cible:db_sfr',              desc: 'Retire un élément du groupe.' },
      { name: '/group delete',      usage: '/group delete valeur:operateurs',                                desc: 'Supprime entièrement un groupe et ses éléments.' },
      { name: '/group list',        usage: '/group list',                                                    desc: 'Liste tous les groupes et leurs éléments.' }
    ]
  },
  {
    category: '⚙️ Options du menu — `/option`',
    adminOnly: true,
    cmds: [
      { name: '/option add',            usage: '/option add label:Steam ID emoji:🎮 description:... modal_label:Ton Steam ID',    desc: 'Ajoute une option personnalisée dans le menu de recherche.' },
      { name: '/option remove',         usage: '/option remove label:Email',                                                      desc: 'Supprime une option custom définitivement, ou masque une option intégrée (email, phone…).' },
      { name: '/option edit',           usage: '/option edit label:Steam ID new_label:Steam vip_only:true',                       desc: 'Modifie une option personnalisée.' },
      { name: '/option list',           usage: '/option list',                                                                    desc: 'Liste TOUTES les options du bot : intégrées, VIP, personnalisées et masquées.' },
      { name: '/option restore',        usage: '/option restore label:Email',                                                     desc: 'Réaffiche une option intégrée masquée dans le menu.' },
      { name: '/option emoji',          usage: '/option emoji option:email nouvel_emoji:📧',                                      desc: 'Change l\'emoji d\'une option intégrée ou du Global.' },
      { name: '/option emoji-list',     usage: '/option emoji-list',                                                              desc: 'Voir tous les emojis actuels des options intégrées.' },
      { name: '/option emoji-reset',    usage: '/option emoji-reset',                                                             desc: 'Remettre tous les emojis par défaut.' },
      { name: '/option access',         usage: '/option access option:email mode:vip',                                           desc: 'Passe une option intégrée en VIP uniquement ou libre.' },
      { name: '/option access-bulk',    usage: '/option access-bulk mode:vip',                                                    desc: 'Passe TOUTES les options en VIP ou libre d\'un coup.' },
      { name: '/option access-credits', usage: '/option access-credits nombre:3',                                                 desc: 'Définit le nombre de recherches/jour pour le plan gratuit.' },
      { name: '/option access-list',    usage: '/option access-list',                                                             desc: 'Voir l\'accès configuré pour chaque option.' },
      { name: '/option ids',            usage: '/option ids',                                                                     desc: 'Voir tous les IDs d\'options, groupes et bases — pour /plugin add option:, /db edit options:, /group add cible:, etc.' }
    ]
  },
  {
    category: '🎨 Embeds — `/embed`',
    adminOnly: true,
    cmds: [
      { name: '/embed set',          usage: '/embed set title:NΞXUS description:... color:#5865f2 footer:... footer_icon:URL thumbnail_fichier:[img]',  desc: 'Modifie l\'embed du menu principal. Images via URL ou fichier galerie direct (thumbnail_fichier, image_fichier, footer_icon_fichier).' },
      { name: '/embed preview',      usage: '/embed preview',                                                                    desc: 'Prévisualise l\'embed principal actuel.' },
      { name: '/embed reset',        usage: '/embed reset',                                                                      desc: 'Remet l\'embed principal par défaut.' },
      { name: '/embed option',       usage: '/embed option option:email titre:... description:... couleur:#5865f2',              desc: 'Personnalise l\'embed des résultats pour une option. Variables : {query} {type} {results} {user}. Sans arguments = affiche le guide.' },
      { name: '/embed option-view',  usage: '/embed option-view option:email',                                                   desc: 'Voir la configuration embed actuelle d\'une option.' },
      { name: '/embed option-reset', usage: '/embed option-reset option:email',                                                  desc: 'Réinitialise l\'embed d\'une option à l\'apparence par défaut.' },
      { name: '/embed group',        usage: '/embed group groupe:operateurs titre:... couleur:#5865f2 image:https://…',          desc: 'Personnalise l\'embed du sous-menu d\'un groupe (titre, description, couleur, thumbnail, footer, image).' },
      { name: '/embed group-reset',  usage: '/embed group-reset groupe:operateurs',                                              desc: 'Réinitialise l\'embed d\'un groupe.' }
    ]
  },
  {
    category: '🔧 Tools OSINT — `/tool`',
    adminOnly: true,
    cmds: [
      { name: '/tool add',    usage: '/tool add url:https://github.com/sherlock-project/sherlock', desc: 'Intègre un outil OSINT depuis GitHub. Le bot génère automatiquement un module JS natif.', note: 'Owner uniquement.' },
      { name: '/tool list',   usage: '/tool list',                                                  desc: 'Liste tous les tools installés avec leur ID, type et statut (actif/inactif).', note: 'Owner uniquement.' },
      { name: '/tool test',   usage: '/tool test id:<id> query:<requête>',                          desc: 'Teste un tool en live avec une requête et affiche les résultats bruts.', note: 'Owner uniquement.' },
      { name: '/tool config', usage: '/tool config id:<id> key:<clé_api>',                          desc: 'Configure la clé API d\'un tool qui en nécessite une.', note: 'Owner uniquement.' },
      { name: '/tool toggle', usage: '/tool toggle id:<id>',                                        desc: 'Active ou désactive un tool sans le supprimer.', note: 'Owner uniquement.' },
      { name: '/tool link',   usage: '/tool link id:<id> option:<option>',                          desc: 'Lie un tool à une option de recherche spécifique (ex: email, username).', note: 'Owner uniquement.' },
      { name: '/tool delete', usage: '/tool delete id:<id>',                                        desc: 'Supprime définitivement un tool et son module JS.', note: 'Owner uniquement.' },
      { name: '/tool cache',  usage: '/tool cache',                                                  desc: 'Vide le cache des résultats tools (TTL: 10 min). ⚡ = résultat depuis le cache.', note: 'Owner uniquement.' }
    ]
  },
  {
    category: '🔌 Plugins/APIs — `/plugin`',
    adminOnly: true,
    cmds: [
      { name: '/plugin add',    usage: '/plugin add nom:SFR_API fichier:[plugin.js] option:email description:... vip:false', desc: 'Upload un plugin JS. Il est appelé à chaque recherche sur l\'option associée.' },
      { name: '/plugin list',   usage: '/plugin list',                                                                       desc: 'Liste les plugins (🟢 chargé / 🔴 erreur).' },
      { name: '/plugin reload', usage: '/plugin reload nom:SFR_API',                                                         desc: 'Recharge un plugin sans redémarrer le bot.' },
      { name: '/plugin remove', usage: '/plugin remove nom:SFR_API',                                                         desc: 'Supprime un plugin.' },
      { name: '/plugin help',   usage: '/plugin help',                                                                        desc: 'Affiche le format attendu pour un fichier plugin .js.' }
    ]
  },
  {
    category: '📋 Logs de recherche — `/logs`',
    adminOnly: true,
    cmds: [
      { name: '/logs setup',        usage: '/logs setup salon:#logs',                                                                                        desc: 'Active les logs dans un salon. Chaque recherche y envoie un embed.' },
      { name: '/logs disable',      usage: '/logs disable',                                                                                                  desc: 'Désactive les logs.' },
      { name: '/logs status',       usage: '/logs status',                                                                                                   desc: 'Voir si les logs sont actifs et dans quel salon.' },
      { name: '/logs history',      usage: '/logs history nombre:10 utilisateur:@Dupont',                                                                    desc: 'Voir les N dernières recherches, avec filtre optionnel par utilisateur.' },
      { name: '/logs user-history', usage: '/logs user-history utilisateur:@Dupont',                                                                         desc: 'Historique complet d\'un membre — paginé (1 page = 1 recherche). Titre : Historique de [membre] • 1/N.' },
      { name: '/logs search',       usage: '/logs search mot_cle:gmail.com utilisateur:@Dupont option:email depuis:2025-01-01 jusqua:2025-12-31 limite:20', desc: 'Rechercher dans les logs avec filtres : mot-clé, utilisateur, type d\'option, période.' },
      { name: '/logs clear',        usage: '/logs clear',                                                                                                    desc: 'Supprime tous les logs de recherche enregistrés.' }
    ]
  },
  {
    category: '💳 Crédits & Plans — `/credits` & `/plan`',
    adminOnly: true,
    cmds: [
      { name: '/credits add',       usage: '/credits add user:@Dupont montant:10',         desc: 'Ajoute des crédits à un utilisateur.' },
      { name: '/credits unlimited', usage: '/credits unlimited user:@Dupont',              desc: 'Donne un accès illimité (plus de limite de recherches).' },
      { name: '/credits reset',     usage: '/credits reset user:@Dupont',                  desc: 'Remet un utilisateur sur le plan gratuit.' },
      { name: '/credits info',      usage: '/credits info user:@Dupont',                   desc: 'Voir le plan, les crédits et le prochain rechargement.' },
      { name: '/plan set',          usage: '/plan set role:@VIP nom:vip credits:50 illimite:true', desc: 'Associe un plan à un rôle Discord.' },
      { name: '/plan list',         usage: '/plan list',                                   desc: 'Liste tous les plans configurés par rôle.' },
      { name: '/plan apply',        usage: '/plan apply user:@Dupont role:@VIP',           desc: 'Applique manuellement un plan à un utilisateur.' }
    ]
  },
  {
    category: '🚫 Blacklist — `/blacklist`',
    adminOnly: true,
    cmds: [
      { name: '/blacklist add',    usage: '/blacklist add user:@Dupont raison:Abus',  desc: 'Bloque un utilisateur.' },
      { name: '/blacklist remove', usage: '/blacklist remove user:@Dupont',            desc: 'Retire un utilisateur de la blacklist.' },
      { name: '/blacklist list',   usage: '/blacklist list',                           desc: 'Liste tous les utilisateurs bloqués.' }
    ]
  },
  {
    category: '⚙️ Configuration — `/config`',
    adminOnly: true,
    cmds: [
      { name: '/config set',  usage: '/config set cle:admin_role_id valeur:1234567890', desc: 'Définit une valeur de configuration (ex: rôle admin).' },
      { name: '/config show', usage: '/config show',                                    desc: 'Voir les configurations actuelles.' }
    ]
  },
  {
    category: '🤖 Profil du bot — `/bot` & `/owner`',
    adminOnly: true,
    cmds: [
      { name: '/bot rename', usage: '/bot rename nom:NΞXUS',                                         desc: 'Change le nom du bot. Limité à 2 fois/heure par Discord. ⚠️ Owner uniquement.' },
      { name: '/bot status', usage: '/bot status presence:online type:Watching texte:les données…', desc: 'Modifie la présence (online/idle/dnd/invisible) et l\'activité du bot. ⚠️ Owner uniquement.' },
      { name: '/bot bio',    usage: '/bot bio texte:Bot de recherche OSINT',                         desc: 'Modifie la bio affichée sur le profil du bot. ⚠️ Owner uniquement.' },
      { name: '/bot info',   usage: '/bot info',                                                     desc: 'Voir les infos du bot (nom, ID, ping, uptime, info Replit sleep). ⚠️ Owner uniquement.' },
      { name: '/bot reload', usage: '/bot reload',                                                   desc: 'Redémarre le bot. Retour automatique en quelques secondes. ⚠️ Owner uniquement.' },
      { name: '/owner add',    usage: '/owner add utilisateur:@Dupont',  desc: 'Ajouter un owner du bot (accès aux commandes /bot et /owner).' },
      { name: '/owner remove', usage: '/owner remove utilisateur:@Dupont', desc: 'Retirer un owner du bot.' },
      { name: '/owner list',   usage: '/owner list',                     desc: 'Voir la liste de tous les owners du bot.' },
      { name: '/owner help',   usage: '/owner help',                     desc: '👑 Voir toutes les commandes réservées aux owners avec détail et exemples d\'utilisation.', note: 'Owner uniquement.' }
    ]
  },
  {
    category: '🔄 Détection de statut — `/statut-accès`',
    adminOnly: true,
    cmds: [
      { name: '/statut-accès config',      usage: '/statut-accès config role:@VIP texte:NΞXUS', desc: 'Configurer la détection : si un membre a ce texte dans son statut, il reçoit automatiquement le rôle.' },
      { name: '/statut-accès info',        usage: '/statut-accès info',                         desc: 'Voir la configuration actuelle de détection de statut.' },
      { name: '/statut-accès disable',     usage: '/statut-accès disable',                      desc: 'Désactiver la détection automatique de statut.' },
      { name: '/statut-accès logs-set',    usage: '/statut-accès logs-set salon:#logs-statut',  desc: 'Configurer le salon de logs pour les événements d\'attribution/retrait de rôle statut.' },
      { name: '/statut-accès logs-remove', usage: '/statut-accès logs-remove',                  desc: 'Désactiver les logs de rôle statut.' },
    ]
  },
  {
    category: '🛠️ Logs actions admin — `/logs-bot`',
    adminOnly: true,
    cmds: [
      { name: '/logs-bot config', usage: '/logs-bot config salon:#logs-admin', desc: 'Active les logs de toutes les actions admin dans un salon (sauf /guide /help /aide /statut-logs /search-logs).', note: 'Owner uniquement.' },
      { name: '/logs-bot remove', usage: '/logs-bot remove',                   desc: 'Désactiver les logs d\'actions admin.', note: 'Owner uniquement.' },
    ]
  },
  {
    category: '📊 Statistiques',
    adminOnly: true,
    cmds: [
      { name: '/stats', usage: '/stats', desc: 'Affiche les statistiques du bot (utilisateurs, recherches, bases de données).' }
    ]
  }
];

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Voir toutes les commandes disponibles et comment les utiliser')
  .addStringOption(opt => opt
    .setName('categorie')
    .setDescription('Afficher une catégorie spécifique')
    .addChoices(
      { name: '🔍 Recherche & Panel /search', value: 'search' },
      { name: '❓ Assistant /aide',           value: 'aide' },
      { name: '🗄️ Bases de données',         value: 'db' },
      { name: '📂 Groupes / Sous-menus',      value: 'group' },
      { name: '⚙️ Options du menu',           value: 'options' },
      { name: '🎨 Embeds',                    value: 'embed' },
      { name: '🔧 Tools OSINT /tool',          value: 'tool' },
      { name: '🔌 Plugins/APIs',              value: 'plugin' },
      { name: '📋 Logs recherche',            value: 'logs' },
      { name: '💳 Crédits & Plans',           value: 'credits' },
      { name: '🚫 Blacklist',                 value: 'blacklist' },
      { name: '⚙️ Configuration',             value: 'config' },
      { name: '🤖 Bot & Owners',              value: 'bot' },
      { name: '🔄 Détection de statut',       value: 'statut' },
      { name: '🛠️ Logs actions admin',        value: 'logsbot' }
    )
  );

const CATEGORY_MAP = {
  search:    '🔍 Recherche & Panel — `/search`',
  aide:      '❓ Assistant IA — `/aide`',
  db:        '🗄️ Bases de données — `/db`',
  group:     '📂 Groupes / Sous-menus — `/group`',
  options:   '⚙️ Options du menu — `/option`',
  embed:     '🎨 Embeds — `/embed`',
  tool:      '🔧 Tools OSINT — `/tool`',
  plugin:    '🔌 Plugins/APIs — `/plugin`',
  logs:      '📋 Logs de recherche — `/logs`',
  credits:   '💳 Crédits & Plans — `/credits` & `/plan`',
  blacklist: '🚫 Blacklist — `/blacklist`',
  config:    '⚙️ Configuration — `/config`',
  bot:       '🤖 Profil du bot — `/bot` & `/owner`',
  statut:    '🔄 Détection de statut — `/statut-accès`',
  logsbot:   '🛠️ Logs actions admin — `/logs-bot`'
};

export async function execute(interaction) {
  const admin     = isAdmin(interaction.member);
  const categorie = interaction.options.getString('categorie');

  if (categorie) {
    const catTitle = CATEGORY_MAP[categorie];
    const cat      = COMMANDS.find(c => c.category === catTitle);
    if (!cat) return interaction.reply({ content: '❌ Catégorie introuvable.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(cat.category)
      .setDescription(cat.cmds.map(c =>
        `**\`${c.name}\`**\n📋 ${c.desc}\n💡 \`${c.usage}\`${c.note ? `\n⚠️ *${c.note}*` : ''}`
      ).join('\n\n').substring(0, 4000))
      .setFooter({ text: 'NΞXUS™ — /help pour revenir à la liste complète' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const visibleCats   = COMMANDS.filter(c => !c.adminOnly || admin);
  const overviewLines = visibleCats.map(c => {
    const cmdList = c.cmds.map(cmd => `\`${cmd.name}\``).join(' • ');
    return `**${c.category}**\n${cmdList}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📖 Aide — NΞXUS™ S€archer')
    .setDescription(
      `Toutes les commandes disponibles.\nUtilise \`/help categorie:...\` pour voir le détail.\n\n` +
      overviewLines.join('\n\n').substring(0, 3500)
    )
    .addFields({
      name: '💡 Démarrage rapide',
      value: [
        '1. `/db add` — Upload ta base (.json/.csv/.zip…)',
        '2. `/db fields` — Définis les colonnes à afficher',
        '3. `/db config` — Personnalise l\'embed de résultats',
        '4. `/logs setup` — Active les logs dans un salon',
        '5. `/search` — Envoie l\'embed de recherche dans ton salon',
        '',
        'Le bouton affiche le menu : **Global** + groupes + bases + options.'
      ].join('\n'),
      inline: false
    })
    .setFooter({ text: admin ? 'Mode admin — toutes les commandes visibles' : 'Certaines commandes sont réservées aux admins' })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}
