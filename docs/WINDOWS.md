# Application Windows autonome

Nohm se package en **application Windows autonome** : une coque Tauri 2 (WebView2 du système) qui
lance le serveur Node embarqué en *sidecar*. Rien à installer ni à démarrer à côté — double-clic sur
l'installateur, puis Nohm se lance depuis le menu Démarrer ou la zone de notification.

## Ce que fait la coque

- démarre `node tsx server/src/index.ts` depuis les ressources embarquées, avec l'état écrit dans
  `%APPDATA%\Nohm` (l'exécutable sous *Program Files* est en lecture seule) ;
- attend que le serveur écoute sur `127.0.0.1:4821`, puis affiche la fenêtre ;
- tray Ouvrir / Mode jeu / Quitter, instance unique, fermeture vers le tray, démarrage auto ;
- au lancement, vérifie les mises à jour et installe la nouvelle version en silence
  (redémarrage automatique).

Config / identifiants : ils vont **une seule fois** dans `%APPDATA%\Nohm\.env` (voir
`server/.env.example`, copié à côté au premier lancement). Ensuite, Paramètres → Comptes →
« Connecter ».

## Construire en local

Prérequis : Rust stable + les prérequis Tauri Windows (Visual Studio Build Tools, WebView2).

```bash
npm ci
npm run desktop:build
```

`tauri build` exécute `beforeBuildCommand` : `npm run build` puis
`src-tauri/scripts/prepare-resources.mjs`, qui met en scène :

| Chemin | Contenu |
|---|---|
| `src-tauri/binaries/node-x86_64-pc-windows-msvc.exe` | le runtime Node (copie de celui qui lance le script) |
| `src-tauri/resources/server/` | `server/src` + un `node_modules` de production autonome |
| `src-tauri/resources/shared/` | source de `@nohm/shared` |
| `src-tauri/resources/client/` | le SPA compilé (`client/dist`) |

Tout ça est gitignoré. L'installateur sort dans
`src-tauri/target/release/bundle/nsis/`.

`npm run desktop:dev` pointe la fenêtre sur le serveur de dev (`5173`, qui proxifie `/api` vers
`4822`) et ne démarre pas de sidecar — le stack de dev habituel suffit.

## Publier une version (CI)

Le workflow `.github/workflows/desktop.yml` compile sur `windows-latest` et publie une Release
**brouillon** avec l'installateur NSIS + les artefacts d'updater (`.zip` signé + `latest.json`).
Déclenchement : `workflow_dispatch`, ou un tag `v*`.

Secrets requis sur le dépôt (Settings → Secrets and variables → Actions) :

| Secret | Valeur |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | le contenu de `src-tauri/.nohm-updater.key` (généré localement, **jamais commité**) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | son mot de passe (chaîne vide si la clé n'en a pas) |

La clé publique correspondante est déjà dans `tauri.conf.json` (`plugins.updater.pubkey`).
Régénérer la paire : `npx @tauri-apps/cli signer generate -w src-tauri/.nohm-updater.key`
(puis remplacer `pubkey` par le contenu du `.pub`).

L'updater lit `https://github.com/LeVraiLunatix/nohm/releases/latest/download/latest.json` :
il faut donc **publier** (dé-brouillonner) chaque Release pour que les clients la voient.

## Limites connues

- Rust n'est pas installé sur la machine de dev : le code de `src-tauri/` n'a pas été compilé ici,
  le premier passage CI peut demander une itération.
- Sans `DATABASE_URL`, l'app tourne en mode mémoire : l'historique et les tendances repartent de
  zéro à chaque redémarrage. (SQLite embarqué = étape suivante possible.)
- L'installateur est `currentUser` (pas d'élévation), installé sous
  `%LOCALAPPDATA%\Programs\Nohm`.
