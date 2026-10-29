import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const configFor = (runsDir: string) => ({
  adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir,
});

const dirs: string[] = [];
function makeRunsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-json-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('digest JSON API', () => {
  it('returns the complete digest with rows sorted by job', async () => {
    const runsDir = makeRunsDir();
    const records = [
      { at: '2026-10-28T08:00:00-04:00', job: 'zeta', owner: null, status: 'ok' },
      { at: '2026-10-28T08:01:00-04:00', job: 'alpha', owner: 'ops', status: 'retry', error: 'temporary' },
      { at: '2026-10-28T08:02:00-04:00', job: 'failed', owner: 'build', status: 'fail' },
      { at: '2026-10-28T08:03:00-04:00', job: 'alpha', owner: 'ops', status: 'ok' },
    ];
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), `${records.map((record) => JSON.stringify(record)).join('\n')}\nmalformed\n`);

    const response = await createApp(configFor(runsDir)).request('/api/digest/2026-10-28');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      night: '2026-10-28',
      rows: [
        {
          job: 'alpha', owner: 'ops', runs: 2, retries: 1, lastStatus: 'ok', lastError: 'temporary',
          firstAt: '2026-10-28T08:01:00-04:00', lastAt: '2026-10-28T08:03:00-04:00', hasFailure: false,
        },
        {
          job: 'failed', owner: 'build', runs: 1, retries: 0, lastStatus: 'fail', lastError: null,
          firstAt: '2026-10-28T08:02:00-04:00', lastAt: '2026-10-28T08:02:00-04:00', hasFailure: true,
        },
        {
          job: 'zeta', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T08:00:00-04:00', lastAt: '2026-10-28T08:00:00-04:00', hasFailure: false,
        },
      ],
      badLines: 1,
      counts: { ok: 2, retry: 1, fail: 1 },
    });
  });

  it('returns 404 for a missing file and an invalid night', async () => {
    const app = createApp(configFor(makeRunsDir()));
    expect((await app.request('/api/digest/2026-10-28')).status).toBe(404);
    expect((await app.request('/api/digest/not-a-night')).status).toBe(404);
  });
});
