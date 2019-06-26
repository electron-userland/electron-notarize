import * as debug from 'debug';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { spawn } from './spawn';

const d = debug('electron-notarize:helpers');

export async function withTempDir<T>(fn: (dir: string) => Promise<T>) {
  const dir = await fs.mkdtemp(path.resolve(os.tmpdir(), 'electron-notarize-'));
  d('doing work inside temp dir:', dir);
  let result: T;
  try {
    result = await fn(dir);
  } catch (err) {
    d('work failed');
    await fs.remove(dir);
    throw err;
  }
  d('work succeeded');
  await fs.remove(dir);
  return result;
}

class Secret {
  constructor(private value: string) {}

  toString() {
    return this.value;
  }
  inpsect() {
    return '******';
  }
}

export function makeSecret(s: string) {
  return new Secret(s) as any as string;
}

export function isSecret(s: string) {
  return (s as any) instanceof Secret;
}

export interface NotarizionInfo {
  uuid: string;
  date: Date;
  status: 'invalid' | 'in progress' | 'success';
  logFileUrl: string | null;
  // Only set when status != 'in progress'
  statusCode?: 0 | 2;
  statusMessage?: string;
}

export function parseNotarizationInfo(info: string): NotarizionInfo {
  const out: NotarizionInfo = {} as any;
  const matchToProperty = <K extends keyof NotarizionInfo, T extends NotarizionInfo[K]>(key: K, r: RegExp, modifier?: (s: string) => T) => {
    const exec = r.exec(info);
    if (exec) {
      out[key] = modifier ? modifier(exec[1]) : exec[1];
    }
  };
  matchToProperty('uuid', /\n *RequestUUID: (.+?)\n/);
  matchToProperty('date', /\n *Date: (.+?)\n/, d => new Date(d));
  matchToProperty('status', /\n *Status: (.+?)\n/);
  matchToProperty('logFileUrl', /\n *LogFileURL: (.+?)\n/);
  matchToProperty('statusCode', /\n *Status Code: (.+?)\n/, n => parseInt(n, 10) as any);
  matchToProperty('statusMessage', /\n *Status Message: (.+?)\n/);

  if (out.logFileUrl === '(null)') {
    out.logFileUrl = null;
  }

  return out;
}

export async function zipApp(dir: string, appPath: string){
  const zipPath = path.resolve(dir, `${path.basename(appPath, '.app')}.zip`);
  d('zipping application to:', zipPath);
  const zipResult = await spawn(
    'zip',
    [
      '-r',
      '-y',
      zipPath,
      path.basename(appPath),
    ],
    {
      cwd: path.dirname(appPath),
    },
  );
  if (zipResult.code !== 0) {
    throw new Error(`Failed to zip application, exited with code: ${zipResult.code}\n\n${zipResult.output}`);
  }
  d('zip succeeded, attempting to upload to apple');
  return zipPath
}
