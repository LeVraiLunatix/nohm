# Capacités musicales

Le schéma `MusicData` normalise piste, pochette, position, volume, file d’attente, historique,
favoris et statistiques. Chaque fournisseur annonce explicitement ses capacités ; l’interface
désactive ce qui n’est pas disponible.

| Capacité | Cider | Spotify actuel | Last.fm | MusicKit prévu |
|---|:---:|:---:|:---:|:---:|
| Lecture en cours | Oui | Oui | Oui, si scrobblé | Prévu |
| Lecture / pause | Oui | Non | Non | Prévu |
| Précédent / suivant | Oui | Non | Non | Prévu |
| Position / volume | Oui | Non | Non | Prévu |
| Aléatoire / répétition | Oui | Non | Non | Prévu |
| File d’attente | Oui | Non | Non | Prévu |
| Historique | Non | Oui | Oui | Prévu |
| Favoris | Non | Non | Oui | Prévu |
| Statistiques | Non | Oui | Oui | Prévu |

## Cider

L’adaptateur utilise le RPC HTTP officiel sur loopback. Le jeton `apptoken` reste côté serveur. Les
commandes passent par `POST /api/music/cider/command`, validé par Zod, puis l’état est rafraîchi.

## Spotify

L’intégration existante conserve l’OAuth officiel et les données de lecture. Aucun scope de contrôle
n’a été ajouté dans cette itération ; les boutons de commande ne doivent donc pas apparaître actifs.

## Last.fm

L’adaptateur appelle `user.getRecentTracks`, `user.getLovedTracks`, `user.getTopArtists`,
`user.getTopTracks` et `user.getTopAlbums`. Ces méthodes sont en lecture seule.

## Apple Music / MusicKit

Le modèle est prêt, mais l’intégration réelle nécessite un compte Apple Developer, un identifiant
MusicKit, une clé privée et une stratégie de signature. Aucune donnée fictive n’est affichée.

