# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

## Docker workflow

No host pnpm installation is needed. Node and pnpm run inside the container;
dependencies and the package-manager cache stay in named Docker volumes.

```sh
cp .env.example .env   # set LANE_MARKER locally; never commit it
docker compose run --rm rig install --frozen-lockfile
docker compose run --rm rig test
docker compose run --rm rig typecheck
docker compose up rig
```

The service is reachable at `http://localhost:8787`. To stop it, run
`docker compose down`. Add `--volumes` to discard this project's dependency
and package-manager caches.

## Review preview

After starting the Docker service, export the actual sample digest response to a
single HTML file outside this checkout (requires Bash, curl and GNU realpath):

```sh
scripts/export-preview.sh /tmp/rig-review/index.html
```

The command waits up to a bounded retry window for the service and writes only a
successful response. It preserves the running service and its current banner.
The exported page is self-contained; never commit or attach it, or `.env`.
Only the checked-in sample night `2026-10-28` is exported.

Publication requires separate human approval. After approval, integrate this
workflow into `main`, enable GitHub Pages with **GitHub Actions** as its source,
and configure the `github-pages` environment to allow deployments from `main`
(with a required reviewer if available). Run **Digest preview** manually from
`main`; other refs cannot deploy. There are no push or pull-request triggers.
The workflow checks out `main`, installs frozen dependencies, tests and typechecks
inside Docker, exports into the runner's temporary directory, and deploys a Pages
artifact retained for one day. The public page remains until replaced or removed;
artifact expiration does not remove the public site.

For the initial approved marked export, set the repository Actions secret
`LANE_MARKER` and select `include_marker`. A missing secret fails that run.
Markers must be single-line dotenv values and omit either a single quote or a
backtick, so Node preserves literal backslash sequences. Secret values are never printed. With
`include_marker` unchecked, no marker is passed or written and the banner reads
"no marker set". After review and separate replacement approval, run that
marker-free export to replace the page at the same public HTTPS URL, verify it,
and remove the repository secret. Keep issue #6 open until the reviewer receives
the public preview URL and repository/issues; cleanup belongs to issue #7.
