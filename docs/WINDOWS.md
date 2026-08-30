# Décision Windows : Tauri 2

| Critère | Tauri 2 | Electron | Décision |
|---|---|---|---|
| Moteur Web | WebView2 du système | Chromium embarqué | avantage Tauri pour la taille |
| Tray / instance unique | plugins officiels | API intégrées | équivalent fonctionnel |
| Démarrage automatique | plugin officiel | API intégrée | équivalent fonctionnel |
| Mise à jour | plugin + artefacts signés | `autoUpdater` | infrastructure requise dans les deux cas |
| Backend Node existant | sidecar à préparer | naturel dans le main process | avantage Electron |
| Empreinte attendue | plus faible, à mesurer | plus élevée, à mesurer | Tauri retenu sous réserve de mesure |

Tauri est retenu parce que Nohm est principalement une UI locale et que WebView2 est déjà présent
sur Windows 10/11. L’écart réel de mémoire, CPU, GPU et taille d’installateur devra être mesuré sur
deux builds équivalents avant de figer la décision à long terme.

## Présent dans le scaffold

- identité `fr.nohm.app` et fenêtres Nohm ;
- icônes PNG/ICO et assets Windows générés ;
- une seule instance, fermeture vers le tray et lancement automatique ;
- menu Ouvrir / Mode jeu / Quitter ;
- cibles MSI et NSIS et artefacts d’updater configurés.

## État de l’installateur

Un workflow GitHub Actions (`.github/workflows/desktop.yml`) compile la coque sur `windows-latest`
(qui fournit Rust et WebView2) et publie un **brouillon** de Release avec les installateurs NSIS et
MSI. Il se déclenche manuellement (`workflow_dispatch`) ou en poussant un tag `v*`.

La coque charge `http://127.0.0.1:4821` : l’application empaquetée **enveloppe un serveur lancé
séparément** (`npm start`, ou un service Windows). Elle apporte la fenêtre, le tray, le démarrage
automatique, l’instance unique et le raccourci mode jeu.

## Limites actuelles

- La machine de travail ne possède pas `rustc` ni `cargo` : le code Rust n’a pas été compilé ici,
  le premier passage CI peut demander une itération.
- Express n’est pas encore empaqueté en **sidecar**. Étapes : bundler `server/src/index.ts` avec
  esbuild (garder `node-pty` en externe, il est natif), embarquer un `node.exe` portable +
  `node-pty`, ajouter le tout en `resources` de `tauri.conf.json`, et faire spawn/kill le process
  depuis `src-tauri/src/lib.rs` (attendre `:4821` avant d’afficher la fenêtre).
- La mise à jour automatique (`createUpdaterArtifacts` est à `false`) exige une clé de signature et
  un endpoint HTTPS. Rien n’a été ajouté.

## Étapes de production

1. installer Rust stable et les prérequis Tauri Windows ;
2. compiler et corriger les éventuelles différences d’API ;
3. produire le sidecar serveur et ses migrations ;
4. tester tray, démarrage auto, raccourcis et instance unique sur Windows 10 et 11 ;
5. signer MSI/NSIS et l’updater ;
6. mesurer démarrage, mémoire, CPU, GPU et taille face à un prototype Electron.

