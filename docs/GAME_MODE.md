# Mode jeu

Le mode jeu peut être basculé depuis l’interface, le tray Tauri ou un raccourci choisi dans
Paramètres (`Alt+Maj+G` par défaut). L’état et le raccourci sont conservés localement.

Lorsqu’il est actif :

- animations, transitions, flous d’arrière-plan et ombres sont neutralisés ;
- les polls client sont espacés jusqu’à quatre fois, avec un plafond de 15 minutes ;
- les événements temps réel non essentiels n’entraînent plus de relecture immédiate ;
- le serveur ignore les rafraîchissements programmés non essentiels ;
- Cider, Spotify et l’état système restent actifs ;
- une actualisation manuelle reste possible.

La détection automatique d’un jeu n’est pas implémentée : elle demande une liste de processus
configurable, des règles anti-faux-positifs et des tests Windows réels.

Dans la version Web, le raccourci agit lorsque Nohm a le focus. Son enregistrement global dépend de
la compilation et de la validation du plugin Tauri sur Windows.

## Protocole de mesure final

Mesurer cinq minutes au repos puis cinq minutes avec un jeu : mémoire privée, CPU moyen et p95,
utilisation GPU du WebView2, octets réseau, réveils et démarrage. Répéter trois fois en mode normal
puis en mode jeu, même jeu et même scène. Aucun chiffre issu du serveur de développement n’est
présenté comme une mesure de l’application packagée.
