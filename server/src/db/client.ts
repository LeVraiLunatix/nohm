import postgres from 'postgres';

/**
 * postgres.js parses temporal columns into `Date` objects and JSON-encodes string parameters bound
 * to json/jsonb. Every store here expects the opposite — raw strings out, and a pre-stringified
 * payload passed through untouched — because that is what drizzle silently configured on the shared
 * client as a side effect of `drizzle(client, { schema })` being constructed.
 *
 * Dropping that construction (nothing queries through drizzle, and importing it costs ~160 MB of
 * resident memory in the always-on Railway container) therefore changed how every query in the
 * codebase decodes its results. `health_days.updated_at` started arriving as a `Date` where
 * `healthSchema` wants `z.string()`, which failed the whole health widget.
 *
 * So configure it explicitly instead of depending on an ORM nobody queries through being loaded.
 * These are exactly the overrides drizzle-orm/postgres-js applies (see its `driver.js`), kept
 * deliberately identical so behaviour is unchanged.
 */
const passThrough = <T>(value: T): T => value;

/** timestamptz, date, time, timestamp, and their array forms, plus numeric[]. */
const TEMPORAL_OIDS = [1184, 1082, 1083, 1114, 1182, 1185, 1115, 1231];
/** json and jsonb: serialize only, so a string we already stringified is sent as-is. */
const JSON_OIDS = [114, 3802];

export interface Database {
  client: postgres.Sql;
  databaseUrl?: string;
  mode: 'postgres' | 'memory';
}

function createMemoryClient(): postgres.Sql {
  const query = (async () => []) as unknown as postgres.Sql;
  query.begin = (async (callback: (sql: postgres.Sql) => unknown) => callback(query)) as unknown as postgres.Sql['begin'];
  query.end = (async () => undefined) as postgres.Sql['end'];
  query.notify = (async () => '') as unknown as postgres.Sql['notify'];
  query.listen = (async (_channel: string, _onNotify: (payload: string) => void, onListen?: () => void) => {
    onListen?.();
    return { state: 'closed', unlisten: async () => undefined };
  }) as unknown as postgres.Sql['listen'];
  query.unsafe = (async () => []) as unknown as postgres.Sql['unsafe'];
  return query;
}

export function createDatabase(databaseUrl?: string, max = 5): Database {
  if (!databaseUrl) return { client: createMemoryClient(), mode: 'memory' };
  const client = postgres(databaseUrl, {
    max,
    connect_timeout: 10,
    idle_timeout: 20,
    // Railway's public TCP proxy requires TLS; local/CI Postgres service containers do not.
    ssl: /railway|rlwy\.net/i.test(databaseUrl) ? 'require' : undefined,
  });
  for (const oid of TEMPORAL_OIDS) {
    client.options.parsers[oid] = passThrough;
    client.options.serializers[oid] = passThrough;
  }
  for (const oid of JSON_OIDS) {
    client.options.serializers[oid] = passThrough;
  }
  return { client, databaseUrl, mode: 'postgres' };
}
