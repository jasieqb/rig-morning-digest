import type { DigestRow, NightDigest } from '../digest/types.js';

function DigestTable(props: { rows: DigestRow[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>job</th><th>owner</th><th>runs</th><th>retries</th><th>last status</th>
          <th>last error</th><th>first at</th><th>last at</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr class={row.retries >= 3 || row.hasFailure ? 'warn' : undefined}>
            <td>{row.job}</td>
            <td>{row.owner || '—'}</td>
            <td>{row.runs}</td>
            <td>{row.retries}</td>
            <td>{row.lastStatus}</td>
            <td>{row.lastError || '—'}</td>
            <td>{row.firstAt}</td>
            <td>{row.lastAt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DigestPage(props: { digest: NightDigest }) {
  const { digest } = props;
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {digest.rows.length === 0 ? <p>nothing ran</p> : <DigestTable rows={digest.rows} />}
      {digest.badLines > 0 && (
        <p class="mute">{digest.badLines} malformed {digest.badLines === 1 ? 'line' : 'lines'} ignored</p>
      )}
    </>
  );
}
