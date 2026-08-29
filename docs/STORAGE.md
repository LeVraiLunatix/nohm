# Stockage et migrations

| Mode | Configuration | Persistance | Usage recommandé |
|---|---|---|---|
| Mémoire | aucune | non | découverte, poste unique, développement |
| PostgreSQL | `DATABASE_URL` | oui | historique durable et plusieurs installations |

En mode mémoire, les lectures persistantes sont vides et les écritures sans effet. Les widgets sans
persistance fonctionnent normalement, mais les historiques sont perdus au redémarrage. Le journal
serveur annonce clairement ce mode.

## Pourquoi SQLite n’est pas encore activé

La couche actuelle utilise `jsonb`, tableaux, verrous consultatifs, `LISTEN/NOTIFY`, SQL PostgreSQL
et migrations Drizzle PG. Remplacer seulement le pilote créerait un faux support SQLite.

Une migration sûre demande :

1. une interface de repository indépendante du dialecte ;
2. des migrations SQLite dédiées et versionnées ;
3. des remplacements explicites pour les verrous et notifications ;
4. un export/import transactionnel avec sauvegarde et rollback ;
5. des tests de parité sur chaque historique.

Pour PostgreSQL, sauvegarder les données, arrêter les autres instances, puis lancer :

```powershell
npm run db:migrate -w server
```

Le changement de mode ne supprime aucune donnée PostgreSQL existante.

