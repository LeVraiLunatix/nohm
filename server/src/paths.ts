import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Where Nohm keeps its mutable state and where it reads config from.
 *
 * Unset (dev, `npm start`): the historical layout next to the server package —
 * `server/.data`, `server/.tokens`, `server/config.json`, `server/.env`.
 *
 * `NOHM_DATA_DIR` set (the packaged Windows app points it at %APPDATA%\Nohm): a single
 * directory Nohm owns, since the executable itself lives under Program Files and can't be
 * written to. `data/`, `tokens/`, `config.json` and `.env` all live inside it.
 */
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const override = process.env.NOHM_DATA_DIR?.trim();

/** Mutable state: service-settings.json, layout.json, oauth-state.key, workspaces/. */
export const dataDir = override ? path.join(override, 'data') : path.join(serverRoot, '.data');

/** OAuth token files (gmail.json, spotify.json, hue.json). */
export const tokensDir = override ? path.join(override, 'tokens') : path.join(serverRoot, '.tokens');

/** Non-secret config.json (pinned repos, feeds, refresh intervals). */
export const configFile = override ? path.join(override, 'config.json') : path.join(serverRoot, 'config.json');

/** The .env to load. Dev leaves this to dotenv's cwd default; the packaged app needs it explicit. */
export const envFile = override ? path.join(override, '.env') : path.join(serverRoot, '.env');
