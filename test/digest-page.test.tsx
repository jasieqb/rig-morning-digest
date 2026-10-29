import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const configFor = (runsDir: string) => ({
  adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir,
});

const dirs: string[] = [];
function makeRunsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-page-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('digest page', () => {
  it('renders sorted rows, all fields, warnings, escaping, offsets, and malformed line count', async () => {
    const runsDir = makeRunsDir();
    const rows = [
      { at: '2026-10-28T08:00:00-04:00', job: 'zeta', owner: null, status: 'ok' },
      { at: '2026-10-28T08:01:00-04:00', job: 'alpha', owner: 'A&B', status: 'retry', error: '<broken>' },
      { at: '2026-10-28T08:02:00-04:00', job: 'alpha', owner: 'A&B', status: 'retry' },
      { at: '2026-10-28T08:03:00-04:00', job: 'alpha', owner: 'A&B', status: 'retry' },
      { at: '2026-10-28T08:04:00-04:00', job: 'failed', owner: 'ops', status: 'fail' },
    ];
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), `${rows.map((row) => JSON.stringify(row)).join('\n')}\nnot-json\n`);

    const res = await createApp(configFor(runsDir)).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<table>');
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('failed'));
    expect(html.indexOf('failed')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toContain('A&amp;B');
    expect(html).toContain('&lt;broken&gt;');
    expect(html).not.toContain('<broken>');
    expect(html).toContain('—');
    expect(html).toContain('3');
    expect(html).toContain('fail');
    expect(html).toContain('2026-10-28T08:00:00-04:00');
    expect(html).toContain('2026-10-28T08:04:00-04:00');
    expect(html).toContain('1 malformed line');
    expect((html.match(/class="warn"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('renders an empty file as nothing ran', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), '');
    const res = await createApp(configFor(runsDir)).request('/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('returns 404 when the night file is missing', async () => {
    const runsDir = makeRunsDir();
    const res = await createApp(configFor(runsDir)).request('/digest/2026-10-28');
    expect(res.status).toBe(404);
  });
});
