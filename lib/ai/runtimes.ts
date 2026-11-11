import 'server-only';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';

/** App-owned credentials. Never Pi's auth.json: web login/logout must not affect the Pi CLI. */
export const appDataDir = () => process.env.DESTINY_THEORY_DATA_DIR?.trim() || join(homedir(), '.destiny-theory');
const appAuthPath = () => join(appDataDir(), 'auth.json');

let piRuntime: Promise<ModelRuntime> | undefined;
let appRuntime: Promise<ModelRuntime> | undefined;

const create = async (authPath?: string) => (await import('@earendil-works/pi-coding-agent')).ModelRuntime.create({
  // No user models.json, extensions, agent sessions or project trust resources are loaded.
  ...(authPath ? { authPath } : {}), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false,
});

export function getPiRuntime() {
  piRuntime ??= create().catch(error => { piRuntime = undefined; throw error; });
  return piRuntime;
}

export function getAppRuntime() {
  appRuntime ??= (async () => {
    mkdirSync(appDataDir(), { recursive: true, mode: 0o700 });
    return create(appAuthPath());
  })().catch(error => { appRuntime = undefined; throw error; });
  return appRuntime;
}

/** Stable app installation UUID required by Sign in with ChatGPT; not a credential. */
export function appDeviceId() {
  const path = join(appDataDir(), 'device.json');
  mkdirSync(appDataDir(), { recursive: true, mode: 0o700 });
  try {
    if (existsSync(path)) {
      const value = JSON.parse(readFileSync(path, 'utf8')).deviceId;
      if (typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)) return value;
    }
  } catch { /* regenerate an invalid local installation id */ }
  const deviceId = randomUUID();
  writeFileSync(path, JSON.stringify({ deviceId }), { encoding: 'utf8', mode: 0o600 });
  return deviceId;
}
