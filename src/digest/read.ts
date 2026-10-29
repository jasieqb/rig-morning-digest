import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  owner: string | null;
  status: RunStatus;
  error?: string | null;
};

function isNight(value: string): boolean {
  if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
    && isNight(value.slice(0, 10))
    && Number.isFinite(Date.parse(value));
}

function isEvent(value: unknown): value is RunEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return isTimestamp(event.at)
    && typeof event.job === 'string' && event.job.trim().length > 0
    && (event.owner === null || typeof event.owner === 'string')
    && (event.status === 'ok' || event.status === 'retry' || event.status === 'fail')
    && (event.error === undefined || event.error === null || typeof event.error === 'string');
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isNight(night)) return null;
  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const events: RunEvent[] = [];
  let badLines = 0;
  const lines = contents === '' ? [] : contents.split('\n');
  // A terminating newline ends the previous record; interior blank lines are invalid records.
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    try {
      const value: unknown = JSON.parse(line);
      if (isEvent(value)) events.push(value);
      else badLines++;
    } catch {
      badLines++;
    }
  }

  // Stable sorting keeps file order when two events have the same instant.
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const jobs = new Map<string, DigestRow>();
  const counts = { ok: 0, retry: 0, fail: 0 };
  for (const event of events) {
    counts[event.status]++;
    let row = jobs.get(event.job);
    if (!row) {
      row = {
        job: event.job, owner: event.owner, runs: 0, retries: 0,
        lastStatus: event.status, lastError: null,
        firstAt: event.at, lastAt: event.at, hasFailure: false,
      };
      jobs.set(event.job, row);
    }
    row.runs++;
    if (event.status === 'retry') row.retries++;
    if (event.status === 'fail') row.hasFailure = true;
    if (typeof event.error === 'string') row.lastError = event.error;
    row.owner = event.owner;
    row.lastStatus = event.status;
    row.lastAt = event.at;
  }

  const rows = [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return { night, rows, badLines, counts };
};
