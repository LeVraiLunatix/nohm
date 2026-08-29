# Nohm

Nohm est un centre de contrôle personnel local pour Windows et le Web. Il rassemble météo,
calendrier, GitHub, IA, santé, jeux et musique dans une interface française par défaut, avec
l’anglais disponible dans les paramètres.

Le produit reste utile sans compte central : les secrets demeurent côté serveur, les services non
configurés restent désactivés proprement et PostgreSQL n’est plus requis pour démarrer.

## État de cette branche

La refonte est développée sur `feat/nohm` sans modification du dépôt distant.

- identité Nohm, icônes PWA et assets Windows générés ;
- couche i18n centrale FR/EN, français par défaut ;
- assistant de première configuration et espace Paramètres (comptes et clés chiffrés, OAuth, visibilité, cadence, raccourci jeu) ;
- expérience Musique unifiée : Cider, Spotify, Last.fm et contrat MusicKit ;
- mode jeu manuel avec raccourci `Alt+Maj+G` et réduction des rafraîchissements ;
- démarrage local sans base en mémoire, PostgreSQL restant disponible pour la persistance ;
- shell Tauri 2 préparé pour Windows (tray, lancement automatique, instance unique, MSI/NSIS).

Le shell Windows n’est pas encore un installateur autonome : la chaîne Rust n’est pas présente sur
la machine de développement et le serveur Express doit encore être emballé en sidecar. Voir
[docs/WINDOWS.md](docs/WINDOWS.md).

## Démarrage rapide

Prérequis : Node.js 22.5 ou plus récent et npm.

```powershell
cd D:\Code\Nohm
npm install
Copy-Item server/.env.example server/.env
Copy-Item server/config.example.json server/config.json
npm run dev
```

L’interface de développement est disponible sur `http://127.0.0.1:5173`. Sans `DATABASE_URL`,
Nohm utilise un cache mémoire non persistant.

Mode production Web :

```powershell
npm run build
npm start
```

Puis ouvrir `http://127.0.0.1:4821`.

## Configuration

Copiez `server/.env.example` vers `server/.env`, puis activez seulement les connecteurs nécessaires.
Les secrets ne sont jamais exposés au client. Voir [docs/CONFIGURATION_FR.md](docs/CONFIGURATION_FR.md).

- **Cider** est prioritaire pour Apple Music local et permet les commandes via son RPC officiel ;
- **Spotify** conserve l’intégration OAuth existante, actuellement en lecture seule ;
- **Last.fm** fournit l’historique, les favoris et les statistiques en lecture seule ;
- **MusicKit** est prévu par le contrat unifié mais reste inactif sans clé Apple Developer.

Voir [docs/MUSIC_CAPABILITIES.md](docs/MUSIC_CAPABILITIES.md) pour les capacités exactes.

## Commandes

```powershell
npm run dev          # serveur et client en développement
npm run build        # build Web/PWA
npm start            # serveur de production sur :4821
npm run typecheck    # TypeScript sur les trois workspaces
npm test             # suite Vitest serveur
npm run desktop:dev  # nécessite Rust + prérequis Tauri
npm run desktop:build
```

## Architecture

- `client/` : React 19, Vite, PWA, interface et état local ;
- `server/` : Express, connecteurs, cache, planificateur et secrets ;
- `shared/` : schémas Zod et contrats partagés ;
- `src-tauri/` : shell Windows Tauri 2 ;
- `docs/` : décisions, configuration et limites connues.

Chaque connecteur produit une enveloppe validée par Zod. Le serveur planifie les appels, conserve le
dernier état valide et n’envoie au client ni jeton ni détail d’erreur sensible.

## Données et confidentialité

- **Mémoire locale** : zéro configuration, données perdues au redémarrage ;
- **PostgreSQL** : historique persistant et synchronisation avancée ;
- **SQLite** : non implémenté dans cette itération, car le stockage existant utilise des primitives
  PostgreSQL spécifiques. Voir [docs/STORAGE.md](docs/STORAGE.md).

N’exposez pas `HOST=0.0.0.0` sans couche d’authentification. L’accès distant recommandé reste un
tunnel privé comme Tailscale.

## Vérification

```powershell
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Décisions et limites : [Windows](docs/WINDOWS.md), [mode jeu](docs/GAME_MODE.md),
[audit SONAR](docs/SONAR_AUDIT.md).
