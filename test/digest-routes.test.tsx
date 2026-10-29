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
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('digest routes', () => {
  it('serves matching HTML and JSON digests with sorted rows, warnings, offsets, and escaping', async () => {
    const runsDir = makeRunsDir();
    const records = [
      { at: '2026-10-28T08:00:00-04:00', job: 'zeta', owner: null, status: 'ok' },
      { at: '2026-10-28T08:01:00-04:00', job: 'recover', owner: 'ops', status: 'fail', error: '<failed & unsafe>' },
      { at: '2026-10-28T08:02:00-04:00', job: 'recover', owner: null, status: 'ok' },
      { at: '2026-10-28T08:03:00-04:00', job: 'retry3', owner: 'ops', status: 'retry' },
      { at: '2026-10-28T08:04:00-04:00', job: 'retry3', owner: 'ops', status: 'retry' },
      { at: '2026-10-28T08:05:00-04:00', job: 'retry3', owner: 'ops', status: 'retry' },
      { at: '2026-10-28T08:06:00-04:00', job: '<img src=x onerror="bad">', owner: 'A&B <owner>', status: 'ok', error: '"quoted" <script>alert(1)</script>' },
    ];
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), `${records.map((record) => JSON.stringify(record)).join('\n')}\nnot-json\n`);
    const app = createApp(configFor(runsDir));

    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    expect(htmlResponse.status).toBe(200);
    expect(htmlResponse.headers.get('content-type')).toContain('text/html');
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.headers.get('content-type')).toContain('application/json');

    const digest = await jsonResponse.json();
    expect(digest).toEqual({
      night: '2026-10-28',
      rows: [
        {
          job: '<img src=x onerror="bad">', owner: 'A&B <owner>', runs: 1, retries: 0,
          lastStatus: 'ok', lastError: '"quoted" <script>alert(1)</script>',
          firstAt: '2026-10-28T08:06:00-04:00', lastAt: '2026-10-28T08:06:00-04:00', hasFailure: false,
        },
        {
          job: 'recover', owner: null, runs: 2, retries: 0, lastStatus: 'ok',
          lastError: '<failed & unsafe>', firstAt: '2026-10-28T08:01:00-04:00',
          lastAt: '2026-10-28T08:02:00-04:00', hasFailure: true,
        },
        {
          job: 'retry3', owner: 'ops', runs: 3, retries: 3, lastStatus: 'retry', lastError: null,
          firstAt: '2026-10-28T08:03:00-04:00', lastAt: '2026-10-28T08:05:00-04:00', hasFailure: false,
        },
        {
          job: 'zeta', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T08:00:00-04:00', lastAt: '2026-10-28T08:00:00-04:00', hasFailure: false,
        },
      ],
      badLines: 1,
      counts: { ok: 3, retry: 3, fail: 1 },
    });

    const html = await htmlResponse.text();
    expect(html).toContain('<table>');
    const htmlJobs = [...html.matchAll(/<tr(?: class="warn")?>\s*<td>(.*?)<\/td>/g)].map((match) => match[1]);
    expect(htmlJobs).toEqual([
      '&lt;img src=x onerror=&quot;bad&quot;&gt;', 'recover', 'retry3', 'zeta',
    ]);
    expect(digest.rows.map((row: { job: string }) => row.job)).toEqual([
      '<img src=x onerror="bad">', 'recover', 'retry3', 'zeta',
    ]);
    expect(html).toContain('<td>—</td>');
    expect(html).toContain('A&amp;B &lt;owner&gt;');
    expect(html).toContain('&quot;quoted&quot; &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;failed &amp; unsafe&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('2026-10-28T08:00:00-04:00');
    expect(html).toContain('2026-10-28T08:06:00-04:00');
    expect(html).toContain('1 malformed line ignored');
    const warningRows = [...html.matchAll(/<tr class="warn">([\s\S]*?)<\/tr>/g)].map((match) => match[1]);
    expect(warningRows).toHaveLength(2);
    expect(warningRows.join('\n')).toContain('recover');
    expect(warningRows.join('\n')).toContain('retry3');
    expect(warningRows.join('\n')).not.toContain('zeta');
  });

  it('returns 404 for a missing night from both routes', async () => {
    const app = createApp(configFor(makeRunsDir()));
    const [html, json] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    expect(html.status).toBe(404);
    expect(json.status).toBe(404);
  });

  it('returns an empty digest for both routes when the night file is empty', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), '');
    const app = createApp(configFor(runsDir));
    const [html, json] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    expect(html.status).toBe(200);
    expect(await html.text()).toContain('nothing ran');
    expect(json.status).toBe(200);
    expect(await json.json()).toEqual({
      night: '2026-10-28', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('reports malformed lines in both HTML and JSON responses', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), 'malformed\n');
    const app = createApp(configFor(runsDir));
    const [html, json] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    expect(html.status).toBe(200);
    expect(await html.text()).toContain('1 malformed line ignored');
    expect(json.status).toBe(200);
    expect(await json.json()).toEqual({
      night: '2026-10-28', rows: [], badLines: 1, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });
});
