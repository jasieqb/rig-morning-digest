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
