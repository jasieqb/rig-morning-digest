import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });

  it('links each night to its digest with valid event counts', async () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-status-'));
    try {
      for (const night of ['2026-10-28', '2026-10-27']) {
        writeFileSync(join(runsDir, `${night}.jsonl`), readFileSync(join('runs', `${night}.jsonl`)));
      }
      const res = await createApp({ ...config, runsDir }).request('/');
      const html = await res.text();

      expect(res.status).toBe(200);
      expect(html).toContain('href="/digest/2026-10-28"');
      expect(html).toContain('ok 10 · retry 4 · fail 1');
      expect(html).toContain('href="/digest/2026-10-27"');
      expect(html).toContain('ok 7 · retry 0 · fail 0');
    } finally {
      rmSync(runsDir, { recursive: true, force: true });
    }
  });
});
