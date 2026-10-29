import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';
import type { ReadNight } from '../src/digest/types.js';

const read: ReadNight = readNight;
const night = '2026-10-28';
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rig-reader-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
function writeEvents(events: unknown[]) {
  writeFileSync(join(dir, `${night}.jsonl`), events.map((event) => JSON.stringify(event)).join('\n'));
}

describe('readNight', () => {
  it('reads five sorted jobs and one bad line from the real night, counting events', () => {
    expect(read('runs', night)).toEqual({
      night: '2026-10-28', badLines: 1, counts: { ok: 10, retry: 4, fail: 1 },
      rows: [
        { job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok',
          lastError: null, firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00', hasFailure: false },
        { job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok',
          lastError: 'upstream 503', firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00', hasFailure: false },
        { job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, lastStatus: 'ok',
          lastError: 'lock held', firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00', hasFailure: false },
        { job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'fail',
          lastError: 'quota exceeded', firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00', hasFailure: true },
        { job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok',
          lastError: null, firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00', hasFailure: false },
      ],
    });
  });

  it('orders by instant, preserves offsets and ties in file order, retaining recovered failure and latest error', () => {
    writeEvents([
      { at: '2026-10-28T03:00:00+01:00', job: 'job', owner: 'new', status: 'retry', error: 'new error' },
      { at: '2026-10-28T04:00:00+02:00', job: 'job', owner: null, status: 'ok' },
      { at: '2026-10-28T03:30:00+02:00', job: 'job', owner: 'old', status: 'fail', error: 'old error' },
      { at: '2026-10-28T01:30:00Z', job: 'job', owner: 'tie', status: 'retry', error: 'middle error' },
    ]);
    expect(read(dir, night)).toEqual({
      night: '2026-10-28', badLines: 0, counts: { ok: 1, retry: 2, fail: 1 },
      rows: [{ job: 'job', owner: null, runs: 4, retries: 2, lastStatus: 'ok', lastError: 'new error',
        firstAt: '2026-10-28T03:30:00+02:00', lastAt: '2026-10-28T04:00:00+02:00', hasFailure: true }],
    });
  });

  it('uses the last error at tied instants and retains an empty error string', () => {
    writeEvents([
      { at: '2026-10-28T00:00:00Z', job: '__proto__', owner: null, status: 'fail', error: 'first' },
      { at: '2026-10-28T00:00:00Z', job: '__proto__', owner: 'last', status: 'retry', error: '' },
      { at: '2026-10-28T00:00:01Z', job: '__proto__', owner: null, status: 'ok', error: null },
    ]);
    expect(read(dir, night)?.rows).toEqual([
      { job: '__proto__', owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: '',
        firstAt: '2026-10-28T00:00:00Z', lastAt: '2026-10-28T00:00:01Z', hasFailure: true },
    ]);
  });

  const valid = { at: '2026-10-28T00:00:00+01:00', job: 'valid', owner: null, status: 'ok' };
  it.each([
    null, [], 42, 'text', {},
    { ...valid, job: null }, { ...valid, job: '' }, { ...valid, job: '  ' },
    { ...valid, owner: 7 }, { at: valid.at, job: 'missing-owner', status: 'ok' },
    { ...valid, status: 'success' }, { ...valid, status: null },
    { ...valid, error: 42 }, { ...valid, error: {} },
    { ...valid, at: null }, { ...valid, at: 0 }, { ...valid, at: 'yesterday' },
    { ...valid, at: '2026-10-28' }, { ...valid, at: '2026-10-28T12:00:00' },
    { ...valid, at: '2026-02-30T12:00:00Z' }, { ...valid, at: '2026-10-28T25:00:00Z' },
  ].map((invalid) => ({ invalid })))('counts invalid runtime record $invalid without losing a valid event', ({ invalid }) => {
    writeEvents([invalid, valid]);
    expect(read(dir, night)).toEqual({
      night: '2026-10-28', badLines: 1, counts: { ok: 1, retry: 0, fail: 0 },
      rows: [{ job: 'valid', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-28T00:00:00+01:00', lastAt: '2026-10-28T00:00:00+01:00', hasFailure: false }],
    });
  });

  it('counts malformed JSON and interior blank lines, allowing CRLF and a final newline', () => {
    writeFileSync(join(dir, `${night}.jsonl`), `broken\r\n\r\n${JSON.stringify(valid)}\r\n`);
    expect(read(dir, night)).toMatchObject({ badLines: 2, counts: { ok: 1, retry: 0, fail: 0 } });
  });

  it('returns an empty digest for an empty file', () => {
    writeFileSync(join(dir, `${night}.jsonl`), '');
    expect(read(dir, night)).toEqual({ night: '2026-10-28', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('returns null for a missing file or directory', () => {
    expect(read(dir, night)).toBeNull();
    expect(read(join(dir, 'absent'), night)).toBeNull();
  });

  it('cannot traverse to an existing file outside the runs directory', () => {
    writeEvents([valid]);
    const nested = join(dir, 'nested');
    mkdirSync(nested);
    expect(read(nested, '../2026-10-28')).toBeNull();
  });

  it.each(['../2026-10-28', '/2026-10-28', 'sub/../2026-10-28', '..\\2026-10-28',
    '2026-10-28.jsonl', '2026-10-28\n', '2026-1-28', '2026-02-30', '2026-13-01', '',
    '%2e%2e%2f2026-10-28', '2026-10-28\0'])('rejects invalid night %j', (invalid) => {
    writeFileSync(join(dir, `${night}.jsonl`), JSON.stringify(valid));
    expect(read(dir, invalid)).toBeNull();
  });
});
