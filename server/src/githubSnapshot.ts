import { githubSchema, type GitHubData } from '@nohm/shared';
import type { Database } from './db/client.js';

/** Cross-server last-good GitHub snapshot, so a fresh dev server can degrade gracefully. */
export class GitHubSnapshotStore {
  constructor(private readonly database: Database) {}

  async getSnapshot(): Promise<{ data: GitHubData; fetchedAt: Date } | undefined> {
    const [row] = await this.database.client<{ value: unknown; changed_at: string }[]>`
      select value, changed_at from signal_current where source = 'github' and metric = 'snapshot'
    `;
    if (!row) return undefined;
    return { data: githubSchema.parse(row.value), fetchedAt: new Date(row.changed_at) };
  }

  async setSnapshot(data: GitHubData): Promise<void> {
    await this.database.client`
      insert into signal_current (source, metric, value, changed_at)
      values ('github', 'snapshot', ${JSON.stringify(data)}::text::jsonb, now())
      on conflict (source, metric) do update set value = excluded.value, changed_at = now()
    `;
  }
}
