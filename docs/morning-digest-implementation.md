# Morning digest implementation

Spec: `plan.md`, `AGENTS.md`, `docs/vision.md`, `docs/styleguide.md`, and accepted ADRs.
The human approved the seven-issue split and issue format on 2026-10-29.

## Constraints

- Keep `runs/` read-only; no `.env`, tokens or preview HTML in Git.
- TypeScript strict, server-rendered Hono JSX, existing layout, inline styles, no client JS.
- Preserve null owners and original timestamp offsets. Display missing values as `—`.
- One issue per worker on its own branch. Commit shared types before dependent work.
- HTML and JSON consume the same reader and return jobs in the same order.
- Publication and later replacement each require explicit human approval.

## Shared interface

`src/digest/types.ts` defines `RunStatus = 'ok' | 'retry' | 'fail'`, `DigestRow`,
`NightDigest` and a `ReadNight` function type. The implementation exports
`readNight(runsDir: string, night: string): NightDigest | null` from `src/digest/read.ts`.

`DigestRow`: `job: string`, `owner: string | null`, `runs: number`, `retries: number`,
`lastStatus: RunStatus`, `lastError: string | null`, `firstAt: string`, `lastAt: string`,
`hasFailure: boolean`. Count every valid event in runs; count retry events in retries;
retain the most recent error even if a later success has no error. Track failures across
the whole job history. Choose first/last events by instant while preserving their input
timestamp strings; equal timestamps retain file order. Owner comes from the last event.

`NightDigest`: `night: string`, `rows: DigestRow[]`, `badLines: number`,
`counts: { ok: number; retry: number; fail: number }`. Counts represent valid log events,
not final job states. Sort rows by job. Missing file and invalid night return null;
empty file returns an empty digest. Reject paths outside YYYY-MM-DD.jsonl. Validate
each parsed event at the boundary; malformed JSON and invalid records count as bad lines.

## Tasks

- [x] #1 Reader: commit types first. Add reader tests, see them fail, implement and run
  tests plus typecheck. Fixture: five jobs, one bad line; cover null owner, recovered
  retries, failure, empty/missing files, input validation and offsets. Commit reader.
- [x] #2 Page: add `src/views/digest.tsx`, wire GET `/digest/:night` in `src/app.tsx`.
  Test before implementation; one table sorted by job, mark retries >= 3 or any fail,
  expose all row fields and malformed-line count. Missing => 404; empty => nothing ran.
- [x] #3 JSON: wire GET `/api/digest/:night` in `src/app.tsx`. Return the complete
  NightDigest; missing => 404. Add focused tests before implementation; share reader.
- [x] #4 Board: add night summaries in `src/status.ts`, preserve existing `nights` list;
  render links and event counts in `src/views/status.tsx`. Tests verify both fixtures.
- [x] #5 Route tests: `test/digest-routes.test.tsx`, isolated temporary runs directories,
  HTML/JSON 200 and 404, empty night and malformed lines, equal job order and data,
  escaped hostile text, null owners, failure/retry warnings and original timestamps.
- [x] #6 Preview: run the real service locally, verify HTTP and JSON, export HTML via
  a command. Prepare a manual Pages artifact workflow and inspect it before requesting
  publication approval. Submit the approved public URL to the reviewer.
- [x] #7 Cleanup: after review, obtain replacement approval, export without marker,
  replace the same URL, verify public content and archive the plan with issue links.

## Verification and review

For each implementation issue: targeted red-to-green test, full test suite, typecheck,
and inspect the diff. Keep issue open until its done condition is observed. A fresh
reviewer checks the integrated changes before publication. Preserve commands and results
outside the repository for the course debrief.
