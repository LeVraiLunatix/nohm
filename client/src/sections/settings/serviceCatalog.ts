export interface ServiceField {
  key: string;
  label: { fr: string; en: string };
  type?: 'text' | 'password' | 'url' | 'checkbox';
  placeholder?: string;
  optional?: boolean;
}

export interface ServiceDefinition {
  id: string;
  name: string;
  widgetIds: string[];
  permissions: { fr: string; en: string };
  setup: { fr: string; en: string };
  refresh: string;
  localOnly?: boolean;
  fields?: ServiceField[];
  oauth?: 'gmail' | 'spotify' | 'github' | 'steam';
}

const secret = (key: string, fr: string, en: string, optional = false): ServiceField => ({ key, label: { fr, en }, type: 'password', optional });
const text = (key: string, fr: string, en: string, placeholder?: string): ServiceField => ({ key, label: { fr, en }, placeholder });

export const SERVICE_CATALOG: ServiceDefinition[] = [
  { id: 'weather', name: 'Météo et localisation', widgetIds: ['weather'], permissions: { fr: 'Coordonnées approximatives', en: 'Approximate coordinates' }, setup: { fr: 'Entrez votre position ici', en: 'Enter your location here' }, refresh: '15 min', fields: [text('WEATHER_LAT', 'Latitude', 'Latitude', '48.8566'), text('WEATHER_LON', 'Longitude', 'Longitude', '2.3522')] },
  { id: 'calendar', name: 'Calendrier iCloud', widgetIds: ['calendar'], permissions: { fr: 'Lecture des calendriers sélectionnés', en: 'Read selected calendars' }, setup: { fr: 'Compte Apple et mot de passe d’application', en: 'Apple account and app-specific password' }, refresh: '5 min', fields: [text('ICLOUD_USERNAME', 'Adresse Apple', 'Apple email'), secret('ICLOUD_APP_PASSWORD', 'Mot de passe d’application', 'App-specific password')] },
  { id: 'gmail', name: 'Gmail', widgetIds: ['gmail'], permissions: { fr: 'Métadonnées des messages, jamais leur contenu', en: 'Message metadata, never bodies' }, setup: { fr: 'Identifiants Google puis connexion OAuth', en: 'Google credentials, then OAuth sign-in' }, refresh: '5 min', oauth: 'gmail', fields: [text('GOOGLE_CLIENT_ID', 'ID client Google', 'Google client ID'), secret('GOOGLE_CLIENT_SECRET', 'Secret client Google', 'Google client secret')] },
  { id: 'github', name: 'GitHub', widgetIds: ['github'], permissions: { fr: 'Dépôts et activité ; écriture séparée pour les issues', en: 'Repositories and activity; separate issue write permission' }, setup: { fr: 'Se connecter avec GitHub, ou coller un jeton', en: 'Sign in with GitHub, or paste a token' }, refresh: '5 min', oauth: 'github', fields: [text('GITHUB_OAUTH_CLIENT_ID', 'ID client OAuth (pour « Se connecter »)', 'OAuth client ID (for "Sign in")'), { ...text('GITHUB_USERNAME', 'Nom d’utilisateur (jeton manuel)', 'Username (manual token)'), optional: true }, secret('GITHUB_TOKEN', 'Jeton manuel (facultatif)', 'Manual token (optional)', true), secret('GITHUB_ISSUES_TOKEN', 'Jeton de création d’issues (facultatif)', 'Issue creation token (optional)', true)] },
  { id: 'ai', name: 'Codex et Claude', widgetIds: ['ai-usage-codex', 'ai-usage-claude'], permissions: { fr: 'Fichiers de session et commandes locales', en: 'Local session files and commands' }, setup: { fr: 'Détecté automatiquement sur cet ordinateur', en: 'Detected automatically on this computer' }, refresh: '30 s / 15 min', localOnly: true },
  { id: 'steam', name: 'Steam', widgetIds: ['steam'], permissions: { fr: 'Profil, bibliothèque et succès en lecture seule', en: 'Read-only profile, library and achievements' }, setup: { fr: 'Se connecter avec Steam + clé Web API', en: 'Sign in with Steam + Web API key' }, refresh: '15 min', oauth: 'steam', fields: [secret('STEAM_API_KEY', 'Clé Web API Steam', 'Steam Web API key'), { ...text('STEAM_ID', 'SteamID64 (rempli par « Se connecter »)', 'SteamID64 (filled by "Sign in")', '7656119…'), optional: true }] },
  { id: 'cider', name: 'Cider', widgetIds: ['music-cider'], permissions: { fr: 'Contrôle du lecteur local via RPC officiel', en: 'Control local player through official RPC' }, setup: { fr: 'Connexion au lecteur local Cider', en: 'Connect to the local Cider player' }, refresh: '5 s', localOnly: true, fields: [{ ...text('CIDER_RPC_URL', 'Adresse RPC', 'RPC address', 'http://127.0.0.1:10767'), type: 'url' }, secret('CIDER_RPC_TOKEN', 'Jeton RPC (facultatif)', 'RPC token (optional)', true), { key: 'CIDER_RPC_UNAUTHENTICATED', label: { fr: 'Autoriser Cider sans jeton', en: 'Allow Cider without a token' }, type: 'checkbox', optional: true }] },
  { id: 'spotify', name: 'Spotify', widgetIds: ['spotify'], permissions: { fr: 'Lecture en cours, historique récent et tops', en: 'Now playing, recent history and top items' }, setup: { fr: 'Identifiants d’application puis connexion OAuth', en: 'App credentials, then OAuth sign-in' }, refresh: '1 min', oauth: 'spotify', fields: [text('SPOTIFY_CLIENT_ID', 'ID client Spotify', 'Spotify client ID'), secret('SPOTIFY_CLIENT_SECRET', 'Secret client Spotify', 'Spotify client secret')] },
  { id: 'lastfm', name: 'Last.fm', widgetIds: ['music-lastfm'], permissions: { fr: 'Historique, favoris et statistiques en lecture seule', en: 'Read-only history, favorites and statistics' }, setup: { fr: 'Clé API et compte Last.fm', en: 'API key and Last.fm account' }, refresh: '1 min', fields: [text('LASTFM_USER', 'Nom d’utilisateur', 'Username'), secret('LASTFM_API_KEY', 'Clé API', 'API key')] },
  { id: 'valorant', name: 'Valorant', widgetIds: ['valorant'], permissions: { fr: 'Profil et historique de parties', en: 'Profile and match history' }, setup: { fr: 'Riot ID et clé HenrikDev', en: 'Riot ID and HenrikDev key' }, refresh: '5 min', fields: [text('RIOT_ID', 'Riot ID', 'Riot ID', 'Nom#TAG'), text('RIOT_REGION', 'Région', 'Region', 'eu'), secret('HENRIKDEV_API_KEY', 'Clé API HenrikDev', 'HenrikDev API key')] },
  { id: 'clashRoyale', name: 'Clash Royale', widgetIds: ['clash-royale'], permissions: { fr: 'Profil et batailles', en: 'Profile and battles' }, setup: { fr: 'Tag joueur et clé API Supercell', en: 'Player tag and Supercell API key' }, refresh: '5 min', fields: [text('CLASH_ROYALE_ID', 'Tag joueur', 'Player tag', '#ABC123'), secret('CLASH_ROYALE_API_KEY', 'Clé API', 'API key')] },
  { id: 'clashOfClans', name: 'Clash of Clans', widgetIds: ['clash-of-clans'], permissions: { fr: 'Profil et clan', en: 'Profile and clan' }, setup: { fr: 'Tag joueur et clé API Supercell', en: 'Player tag and Supercell API key' }, refresh: '5 min', fields: [text('CLASH_OF_CLANS_ID', 'Tag joueur', 'Player tag', '#ABC123'), secret('CLASH_OF_CLANS_API_KEY', 'Clé API', 'API key')] },
  { id: 'roblox', name: 'Roblox', widgetIds: ['roblox'], permissions: { fr: 'Profil et activité de jeu', en: 'Profile and game activity' }, setup: { fr: 'Compte Roblox ; cookie facultatif pour les données privées', en: 'Roblox account; optional cookie for private data' }, refresh: '5 min', fields: [text('ROBLOX_ID', 'ID ou nom Roblox', 'Roblox ID or username'), secret('ROBLOSECURITY', 'Cookie .ROBLOSECURITY (facultatif)', '.ROBLOSECURITY cookie (optional)', true)] },
];
