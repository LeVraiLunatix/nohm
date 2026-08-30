import { execFileSync, spawn } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import { dataDir } from './paths.js';

const actionSchema = z.object({ repo: z.string(), action: z.enum(['session', 'github-desktop']) });
const GITHUB_REMOTE_PATTERN = /github\.com[:/]([^/]+\/[^/]+?)(\.git)?\/?$/;
const BINARY_DIRECTORIES = [
  path.join(os.homedir(), '.local/bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
];

function reposRootFor(config: AppConfig, platform: NodeJS.Platform) {
  const key = platform === 'win32' ? 'win32' : 'darwin';
  return config.code.reposRoot[key];
}

/** github.com owner/repo parsed out of an origin remote (git@ or https:// form), or undefined for non-GitHub remotes. */
function repoFromRemote(url: string): string | undefined {
  const match = GITHUB_REMOTE_PATTERN.exec(url.trim());
  return match?.[1];
}

/** Immediate subdirectories of reposRoot that are git repos with a GitHub origin. */
function discoverProjects(reposRoot: string): { repo: string; path: string }[] {
  let entries: string[];
  try {
    entries = readdirSync(reposRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
  const projects = entries
    .map((name) => {
      const dir = path.join(reposRoot, name);
      if (!existsSync(path.join(dir, '.git'))) return undefined;
      try {
        const remote = execFileSync('/usr/bin/git', ['-C', dir, 'remote', 'get-url', 'origin'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        const repo = repoFromRemote(remote);
        return repo ? { repo, path: dir } : undefined;
      } catch {
        return undefined;
      }
    })
    .filter((project) => project !== undefined);

  const byRepo = new Map(projects.map((project) => [project.repo, project]));
  return [...byRepo.values()];
}

export function availableProjects(config: AppConfig, platform: NodeJS.Platform = process.platform) {
  const reposRoot = reposRootFor(config, platform);
  if (!reposRoot) return [];
  return discoverProjects(reposRoot).map((project) => ({ repo: project.repo }));
}

/**
 * Resolves a command to an absolute path so generated VS Code tasks don't depend on PATH resolution
 * in the spawned terminal. launchd starts this server with a stripped PATH that skips ~/.zshrc (only
 * sourced for interactive shells), so `~/.local/bin` — where installers like Claude Code's put their
 * binary — is checked explicitly rather than trusting process.env.PATH alone.
 */
function resolveBinary(name: string): string {
  for (const dir of BINARY_DIRECTORIES) {
    const candidate = path.join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // not in this PATH entry
    }
  }
  return name;
}

export async function launchCodeAction(input: unknown, config: AppConfig, platform: NodeJS.Platform = process.platform) {
  const { repo, action } = actionSchema.parse(input);
  const reposRoot = reposRootFor(config, platform);
  const project = reposRoot ? discoverProjects(reposRoot).find((item) => item.repo === repo) : undefined;
  if (!project) throw new Error('project-not-configured');
  if (action === 'github-desktop') return launch(platform === 'win32' ? 'cmd' : 'open', platform === 'win32' ? ['/c', 'start', '', 'github-desktop:'] : ['-a', 'GitHub Desktop']);

  const directory = path.join(dataDir, 'workspaces');
  mkdirSync(directory, { recursive: true });
  const workspace = path.join(directory, `${repo.replaceAll('/', '--')}.code-workspace`);
  writeFileSync(workspace, `${JSON.stringify({
    folders: [{ path: project.path }],
    tasks: { version: '2.0.0', tasks: ['codex', 'claude'].map((command) => ({ label: command === 'codex' ? 'Codex' : 'Claude Code', type: 'shell', command: resolveBinary(command), options: { cwd: project.path }, runOptions: { runOn: 'folderOpen' }, presentation: { reveal: 'always', panel: 'dedicated' }, problemMatcher: [] })) },
  }, null, 2)}\n`, { mode: 0o600 });
  return launch('code', [workspace]);
}

// This server's own .env secrets (GitHub widget credentials) have no business
// reaching spawned processes — VS Code and anything it launches (e.g. a
// Claude Code task) would otherwise inherit them and silently shadow the
// user's own `gh` CLI auth for every git operation in that window.
const LEAKED_ENV_KEYS = ['GITHUB_TOKEN', 'GITHUB_ISSUES_TOKEN', 'GITHUB_USERNAME'];

function launch(command: string, args: string[]) {
  const env = { ...process.env };
  for (const key of LEAKED_ENV_KEYS) delete env[key];
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', env });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

export function codeActionError(error: unknown): string {
  if (error instanceof z.ZodError) return 'invalid-code-action';
  if (error instanceof Error && error.message === 'project-not-configured') return error.message;
  return 'code-launch-failed';
}
