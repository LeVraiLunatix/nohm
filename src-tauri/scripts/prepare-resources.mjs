// Stages everything the bundled Windows app runs next to the executable:
//
//   src-tauri/binaries/node-<triple>.exe   the Node runtime, spawned as a Tauri sidecar
//   src-tauri/resources/server/            server source + a production-only node_modules
//   src-tauri/resources/shared/            @nohm/shared source (server depends on it)
//   src-tauri/resources/client/            the built SPA (a copy of client/dist)
//
// Run by `npm run desktop:build` (and CI) before `tauri build`. Everything it writes is
// gitignored. The server is run through `tsx` in place, exactly like `npm start`, so there
// is no separate compile step and native modules (node-pty) keep their prebuilt binaries.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tauriDir = path.join(root, 'src-tauri');
const resourcesDir = path.join(tauriDir, 'resources');
const binariesDir = path.join(tauriDir, 'binaries');

const triple = process.env.TAURI_ENV_TARGET_TRIPLE || 'x86_64-pc-windows-msvc';
const exeSuffix = process.platform === 'win32' ? '.exe' : '';

// 1 — Node runtime. Reuse the one running this script: version-matched and always present
//     on the CI runner and the dev machine.
mkdirSync(binariesDir, { recursive: true });
copyFileSync(process.execPath, path.join(binariesDir, `node-${triple}${exeSuffix}`));

// 2 — server + shared source.
rmSync(resourcesDir, { recursive: true, force: true });
for (const pkg of ['server', 'shared']) {
  const dst = path.join(resourcesDir, pkg);
  cpSync(path.join(root, pkg, 'src'), path.join(dst, 'src'), { recursive: true });
  copyFileSync(path.join(root, pkg, 'package.json'), path.join(dst, 'package.json'));
}
for (const seed of ['config.example.json', '.env.example']) {
  copyFileSync(path.join(root, 'server', seed), path.join(resourcesDir, 'server', seed));
}

// 3 — a standalone production node_modules for the server (no workspace, no dev deps).
//     @nohm/shared is dropped from the manifest and copied in by hand afterwards: an npm
//     `file:` dep becomes a symlink that the Tauri bundler does not preserve, which is what
//     broke the first install ("Cannot find package '@nohm/shared'").
const stagedServerPkgPath = path.join(resourcesDir, 'server', 'package.json');
const stagedServerPkg = JSON.parse(readFileSync(stagedServerPkgPath, 'utf8'));
delete stagedServerPkg.dependencies['@nohm/shared'];
delete stagedServerPkg.devDependencies;
delete stagedServerPkg.scripts;
writeFileSync(stagedServerPkgPath, JSON.stringify(stagedServerPkg, null, 2));
execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--no-package-lock', '--loglevel=error'], {
  cwd: path.join(resourcesDir, 'server'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

// @nohm/shared as a real directory Node resolves like any other package.
const sharedInModules = path.join(resourcesDir, 'server', 'node_modules', '@nohm', 'shared');
rmSync(sharedInModules, { recursive: true, force: true });
mkdirSync(path.dirname(sharedInModules), { recursive: true });
cpSync(path.join(resourcesDir, 'shared'), sharedInModules, { recursive: true });

// 4 — the built SPA.
if (!existsSync(path.join(root, 'client', 'dist', 'index.html'))) {
  throw new Error('client/dist is missing — run `npm run build` before staging the desktop bundle');
}
cpSync(path.join(root, 'client', 'dist'), path.join(resourcesDir, 'client'), { recursive: true });

console.log(`staged sidecar: node-${triple}${exeSuffix} + resources/{server,shared,client}`);
