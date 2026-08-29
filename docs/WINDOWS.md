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

## Limites actuelles

La machine de travail ne possède pas `rustc` ni `cargo`, donc le code Rust n’a pas pu être compilé.
`npm run desktop:build` construit le frontend statique mais n’embarque pas encore Express. Il faut
empaqueter Node + serveur comme sidecar, gérer son cycle de vie et l’arrêter proprement.

La mise à jour automatique exige également une clé de signature et un endpoint HTTPS. Aucune clé ni
URL fictive n’a été ajoutée.

## Étapes de production

1. installer Rust stable et les prérequis Tauri Windows ;
2. compiler et corriger les éventuelles différences d’API ;
3. produire le sidecar serveur et ses migrations ;
4. tester tray, démarrage auto, raccourcis et instance unique sur Windows 10 et 11 ;
5. signer MSI/NSIS et l’updater ;
6. mesurer démarrage, mémoire, CPU, GPU et taille face à un prototype Electron.

