import { execFile } from 'node:child_process';
import { access, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const port = Number(process.env.PORT ?? 4821);
const uid = process.getuid?.() ?? 501;
const serviceLabel = 'local.nohm';
const serviceRoot =
  process.env.NOHM_SERVICE_ROOT ?? process.env.PERSONAL_DASHBOARD_SERVICE_ROOT ?? `${homedir()}/.local/share/nohm/repo`;
const runtimeEnvPath =
  process.env.NOHM_RUNTIME_ENV_PATH ?? process.env.PERSONAL_DASHBOARD_RUNTIME_ENV_PATH ??
  `${homedir()}/.local/share/nohm/state/.env`;

type Check = {
  label: string;
  detail: string;
  ok: boolean;
};

async function command(args: string[]): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(args[0], args.slice(1), {
      encoding: 'utf8',
      timeout: 5_000,
    });
    return { ok: true, output: `${stdout}${stderr}`.trim() };
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function gitHead(path: string): Promise<string | undefined> {
  const result = await command(['git', '-C', path, 'rev-parse', '--short', 'HEAD']);
  return result.ok ? result.output : undefined;
}

async function readDatabaseUrlPresence(): Promise<boolean | undefined> {
  try {
    const env = await readFile(runtimeEnvPath, 'utf8');
    return /^DATABASE_URL=.+$/m.test(env);
  } catch {
    return undefined;
  }
}

async function checkPort(): Promise<Check> {
  const listener = await command(['lsof', '-nP', `-iTCP:${port}`, '-sTCP:LISTEN']);
  return {
    label: `Port ${port}`,
    detail: listener.ok ? 'a process is listening' : 'no listener found',
    ok: listener.ok,
  };
}

function describeLaunchAgent(ok: boolean, pointsAtServiceRoot: boolean): string {
  if (!ok) return 'not registered or unavailable';
  return pointsAtServiceRoot
    ? `registered and points at ${serviceRoot}`
    : 'registered, but its working directory needs inspection';
}

async function checkLaunchAgent(): Promise<Check> {
  const launchAgent = await command(['launchctl', 'print', `gui/${uid}/${serviceLabel}`]);
  const pointsAtServiceRoot = launchAgent.output.includes(serviceRoot);
  return {
    label: 'LaunchAgent',
    detail: describeLaunchAgent(launchAgent.ok, pointsAtServiceRoot),
    ok: launchAgent.ok && pointsAtServiceRoot,
  };
}

async function checkServingCheckout(): Promise<{ check: Check; serviceHead: string | undefined }> {
  const serviceExists = await exists(serviceRoot);
  const serviceHead = serviceExists ? await gitHead(serviceRoot) : undefined;
  return {
    check: {
      label: 'Serving checkout',
      detail: serviceHead ? `${serviceRoot} at ${serviceHead}` : 'not available or not a Git checkout',
      ok: Boolean(serviceHead),
    },
    serviceHead,
  };
}

async function checkClientBuild(): Promise<Check> {
  try {
    const build = await stat(`${serviceRoot}/client/dist/index.html`);
    return {
      label: 'Serving client build',
      detail: `index.html modified ${build.mtime.toISOString()}`,
      ok: true,
    };
  } catch {
    return { label: 'Serving client build', detail: 'client/dist/index.html is missing', ok: false };
  }
}

function describeDatabaseUrl(present: boolean | undefined): string {
  if (present === undefined) return 'runtime env file could not be read';
  return present ? 'DATABASE_URL is present (value withheld)' : 'DATABASE_URL is missing or empty';
}

async function checkDatabaseUrl(): Promise<Check> {
  const databaseUrlPresent = await readDatabaseUrlPresence();
  return {
    label: 'Runtime database configuration',
    detail: describeDatabaseUrl(databaseUrlPresent),
    ok: databaseUrlPresent === true,
  };
}

async function checkHealthEndpoint(): Promise<Check> {
  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1_500) });
    return { label: 'Health endpoint', detail: `${response.status} ${response.statusText}`, ok: response.ok };
  } catch {
    // Sandboxed environments can block localhost networking; retain the other evidence.
    return { label: 'Health endpoint', detail: 'request failed', ok: false };
  }
}

async function main(): Promise<void> {
  const checks: Check[] = [];
  checks.push(await checkPort(), await checkLaunchAgent());

  const { check: servingCheck, serviceHead } = await checkServingCheckout();
  checks.push(servingCheck, await checkClientBuild(), await checkDatabaseUrl());

  const healthCheck = await checkHealthEndpoint();
  checks.push(healthCheck);

  console.log('Nohm live-runtime report');
  for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'CHECK'}  ${check.label}: ${check.detail}`);
  }

  if (serviceHead && !healthCheck.ok) {
    console.log('\nNext: inspect the LaunchAgent startup log before changing provider or UI code.');
  } else if (serviceHead && healthCheck.ok) {
    console.log('\nNext: compare this serving revision with the expected change. If it matches, check PWA/service-worker cache.');
  }
}

await main();
