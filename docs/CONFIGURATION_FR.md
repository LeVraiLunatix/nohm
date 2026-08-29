# Configuration de Nohm

## Première ouverture

L’assistant propose les espaces à activer et enregistre ces préférences dans le stockage local du
navigateur. Il peut être ignoré puis relancé depuis **Paramètres**. La langue est le français par
défaut ; l’anglais peut être sélectionné à tout moment.

## Connexions depuis le site

Ouvrir **Paramètres → Services → Configurer**, puis saisir les identifiants demandés. Nohm ne
renvoie jamais un secret au navigateur. Le serveur chiffre l’ensemble avec DPAPI sous Windows et
utilise automatiquement AES-256-GCM avec une clé locale propriétaire si DPAPI n’est pas disponible.
Le fichier chiffré et sa clé de repli restent sous `server/.data/`, qui est ignoré par Git.

Après l’enregistrement d’un nouveau connecteur, redémarrer Nohm une fois. Gmail et Spotify affichent
alors **Connecter le compte** pour terminer leur OAuth officiel dans un nouvel onglet. L’URI de
redirection affichée par le fournisseur doit correspondre à
`http://127.0.0.1:4821/api/settings/oauth/<service>/callback` (port 4822 en développement).

`server/.env` reste accepté pour les installations existantes et les options avancées. Le fichier
`server/config.json` contient uniquement les options non sensibles. Ne jamais versionner `.env`,
`.tokens/`, `server/.data/` ou les exports personnels.

## Connecteurs principaux

| Service | Saisie dans Paramètres | Accès demandé |
|---|---|---|
| Météo | `WEATHER_LAT`, `WEATHER_LON` | coordonnées approximatives |
| GitHub | `GITHUB_TOKEN`, `GITHUB_USERNAME` | dépôts et activité en lecture ; issues séparées |
| Gmail | identifiants Google, redémarrage, puis bouton OAuth | scope `gmail.metadata` |
| Spotify | identifiants Spotify, redémarrage, puis bouton OAuth | lecture en cours, historique et tops |
| Cider | `CIDER_RPC_TOKEN` | contrôle local via `127.0.0.1:10767` |
| Last.fm | `LASTFM_API_KEY`, `LASTFM_USER` | données publiques du profil en lecture seule |
| Steam | `STEAM_API_KEY`, `STEAM_ID` | profil, bibliothèque et succès en lecture seule |

L’écran Paramètres affiche l’état fourni par le serveur, les permissions et l’intervalle de
rafraîchissement. Il permet aussi de choisir les espaces visibles, la cadence de lecture client et
le raccourci du Mode jeu. Il ne simule jamais une connexion réussie.

## Cider

Dans Cider, ouvrir **Settings → Connectivity → Manage External Application Access**, créer un jeton,
Puis saisir le jeton dans **Paramètres → Services → Cider**. L’URL est limitée au loopback HTTP afin d’éviter l’envoi du
jeton vers un hôte externe. `CIDER_RPC_UNAUTHENTICATED=1` est réservé au cas où l’authentification a
été explicitement désactivée dans Cider.

## Persistance

`DATABASE_URL` est optionnelle. Sans elle, Nohm démarre en mémoire. Avec PostgreSQL :

```powershell
npm run db:migrate -w server
```

Voir [STORAGE.md](STORAGE.md) avant toute migration d’une installation existante.
