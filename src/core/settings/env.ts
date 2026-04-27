import * as path from 'path';

export function parseEnvironmentVariables(input: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const idx = line.indexOf('=');
    if (idx <= 0) continue;

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) env[key] = value;
  }
  return env;
}

function defaultPathEntries(): string[] {
  const entries = process.platform === 'win32'
    ? [
        process.env.APPDATA ? `${process.env.APPDATA}\\npm` : '',
        'C:\\Program Files\\nodejs',
      ]
    : [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin',
      ];

  return entries.filter(Boolean);
}

export function mergePath(pathValue?: string, extraEntries: string[] = []): string {
  const seen = new Set<string>();
  const merged: string[] = [];
  const add = (entry: string | undefined): void => {
    const normalized = (entry || '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    merged.push(normalized);
  };

  for (const entry of extraEntries) add(entry);
  for (const entry of (pathValue || '').split(path.delimiter)) add(entry);
  for (const entry of defaultPathEntries()) add(entry);
  return merged.join(path.delimiter);
}

export function buildProcessEnv(input: string): NodeJS.ProcessEnv {
  const parsed = parseEnvironmentVariables(input);
  const basePath = parsed.PATH || process.env.PATH || '';
  return {
    ...process.env,
    ...parsed,
    PATH: mergePath(basePath),
  };
}
