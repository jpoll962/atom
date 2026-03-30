# Atom — AI_Stack Integration Guide

This is a personal fork of [rush86999/atom](https://github.com/rush86999/atom), deployed via the AI_Stack Docker Compose stack at `~/Documents/Projects/AI_Stack/`.

## Services & Ports

| Service | Container | Host Port | Binding | Image |
|---|---|---|---|---|
| Database | `supabase-db` | *shared with Supabase* | — | `supabase/postgres:15.8.1.085` |
| Backend API | `atom-backend` | **8001** | `127.0.0.1` | Built from `./backend/Dockerfile` |
| Frontend | `atom-frontend` | **3005** | `127.0.0.1` | Built from `./frontend-nextjs/Dockerfile.production` |
| Piece Engine | `atom-piece-engine` | **3003** | `127.0.0.1` | Built from `./backend/piece-engine/Dockerfile` |
| Browserless | `atom-browserless` | **3007** | `127.0.0.1` | `browserless/chrome:latest` |

**URLs:**
- Dashboard: http://localhost:3005
- API docs (Swagger): http://localhost:8001/docs
- Browserless debugger: http://localhost:3007

## Build & Deploy Workflow

After making code changes in this repo:

```bash
cd ~/Documents/Projects/AI_Stack

# Rebuild only the service(s) you changed
DOCKER_BUILDKIT=1 docker buildx build --network=host \
  -t ai_stack-atom-backend \
  -f ~/Documents/Projects/atom/backend/Dockerfile \
  ~/Documents/Projects/atom/backend/

DOCKER_BUILDKIT=1 docker buildx build --network=host \
  -t ai_stack-atom-frontend \
  -f ~/Documents/Projects/atom/frontend-nextjs/Dockerfile.production \
  ~/Documents/Projects/atom/frontend-nextjs/

DOCKER_BUILDKIT=1 docker buildx build --network=host \
  -t ai_stack-atom-piece-engine \
  -f ~/Documents/Projects/atom/backend/piece-engine/Dockerfile \
  ~/Documents/Projects/atom/backend/piece-engine/

# Relaunch
docker compose up -d atom-browserless atom-backend atom-frontend atom-piece-engine
```

> **Why `--network=host`?** Docker Desktop's BuildKit DNS resolver intermittently fails to resolve Alpine/PyPI package URLs. Using `--network=host` makes the build use the host's DNS, bypassing the issue.

> **Why `docker buildx` instead of `docker compose build`?** Compose's built-in build doesn't support `--network=host`. The images are tagged `ai_stack-atom-*` which is what Compose expects, so `docker compose up -d` picks them up automatically.

## Data Storage Architecture

All persistent data is bind-mounted from the AI_Stack host into the backend container.

### Host → Container Mount Map

| Host Path | Container Path | Contents |
|---|---|---|
| *(shared with Supabase)* | *(supabase-db)* | `atom` schema in Supabase's `postgres` database (257 tables) |
| `AI_Stack/data/atom/app-data/` | `/app/data` | LanceDB, media, caches |
| `AI_Stack/data/atom/logs/` | `/app/logs` | Application + audit logs |
| `AI_Stack/data/atom/debug_archive/` | `/app/debug_archive` | Compressed debug events |
| `AI_Stack/data/atom/pg-dumps/` | *(cron job target)* | Scheduled PostgreSQL dumps |

### What lives in `app-data/`

| Path | Description |
|---|---|
| `lancedb/` | Vector embeddings — episodic memory, documents, communications (4 LanceDB tables, tenant-isolated) |
| `media/input/` | User-uploaded files |
| `media/exports/` | Exported documents |
| `bulk_job_results/` | Async job output files |
| `ai_pricing_cache.json` | AI provider pricing cache (auto-generated) |
| `usage_patterns.json` | Usage pattern data (auto-generated) |

### Logs

| File | Rotation | Retention |
|---|---|---|
| `logs/atom.log` | 10MB × 5 files | Rolling |
| `logs/audit.log` | Daily, gzipped | 90 days |

## Syncthing Configuration

### Folders to sync

| Syncthing Folder ID | Host Path | Sync Mode | Notes |
|---|---|---|---|
| `atom-app-data` | `AI_Stack/data/atom/app-data/` | Send & Receive | Only one device should run Atom at a time |
| `atom-logs` | `AI_Stack/data/atom/logs/` | Send Only | Device-specific, archive only |
| `atom-debug` | `AI_Stack/data/atom/debug_archive/` | Send Only | Low priority |
| `atom-pg-dumps` | `AI_Stack/data/atom/pg-dumps/` | Send & Receive | Safe — flat SQL files |
| `atom-source` | `~/Documents/Projects/atom/` | Send & Receive | The source code itself |

### NEVER sync

**Supabase's PostgreSQL data directory** (`AI_Stack/config/supabase/db/data/`) — raw PostgreSQL data files corrupt if synced. Use `pg-dumps/` instead.

### LanceDB sync caveat

LanceDB is file-based (Lance columnar format) but not multi-writer safe. The pattern:
- Only the **primary device** actively runs Atom
- Other devices receive a read-only copy via Syncthing
- To migrate: stop Atom on old device → wait for Syncthing sync → start on new device

## Database Backup & Restore

### Automated backup (cron)

Add to `crontab -e`:
```
# Dump Atom schema every 6 hours
0 */6 * * * docker exec supabase-db pg_dump -U supabase_admin -d postgres --schema=atom | gzip > /home/username/Documents/Projects/AI_Stack/data/atom/pg-dumps/atom_schema_$(date +\%Y\%m\%d_\%H\%M).sql.gz

# Clean dumps older than 7 days
0 1 * * * find /home/username/Documents/Projects/AI_Stack/data/atom/pg-dumps/ -name "*.sql.gz" -mtime +7 -delete
```

### Restore on another device

```bash
# Find the latest dump (synced via Syncthing)
ls -lt ~/Documents/Projects/AI_Stack/data/atom/pg-dumps/*.sql.gz | head -1

# Restore (first ensure the atom schema and user exist in the target Supabase)
gunzip -c atom_schema_20260329_0600.sql.gz | docker exec -i supabase-db psql -U supabase_admin -d postgres
```

## Environment Variables

All Atom variables in `AI_Stack/.env` use the `ATOM_` prefix to avoid collisions with other stack services.

| Variable | Purpose |
|---|---|
| `ATOM_BACKEND_PORT` | Backend host port (default: 8001) |
| `ATOM_FRONTEND_PORT` | Frontend host port (default: 3005) |
| `ATOM_PIECE_ENGINE_PORT` | Piece engine host port (default: 3003) |
| `ATOM_BROWSERLESS_PORT` | Browserless host port (default: 3007) |
| `ATOM_DB_USER` | PostgreSQL username (`atom_user` role in Supabase's PostgreSQL) |
| `ATOM_DB_PASSWORD` | PostgreSQL password for `atom_user` (auto-generated) |
| `ATOM_BYOK_ENCRYPTION_KEY` | Fernet key for encrypting OAuth tokens at rest |
| `ATOM_SECRET_KEY` | Application secret key |
| `ATOM_JWT_SECRET_KEY` | JWT signing key |
| `ATOM_PIECE_ENGINE_API_KEY` | Auth key for piece engine management endpoints |
| `ATOM_ANTHROPIC_API_KEY` | Anthropic API key (optional) |
| `ATOM_OPENAI_API_KEY` | OpenAI API key (optional) |
| `ATOM_OPENAI_API_BASE` | OpenAI-compatible base URL (default: `http://ollama:11434/v1`) |
| `ATOM_TAVILY_API_KEY` | Tavily search API key (optional) |
| `ATOM_BRAVE_SEARCH_API_KEY` | Brave search API key (optional) |
| `ATOM_ENVIRONMENT` | Runtime environment (default: production) |
| `ATOM_LOG_LEVEL` | Log verbosity (default: INFO) |

### AI Provider Setup

Atom connects to **Ollama** for local inference via the OpenAI-compatible endpoint. Both services share `ai_stack_network`, so the backend reaches Ollama at `http://ollama:11434/v1`. Any model pulled into Ollama (Llama, Mistral, etc.) is available to Atom with zero cloud costs.

For cloud models, set `ATOM_ANTHROPIC_API_KEY` in `.env` and restart the backend.

## Supabase Integration

Atom's database lives in the `atom` schema within Supabase's `postgres` database. This gives you:

- **Supabase Studio**: Browse and edit Atom's 257 tables via Table Editor (select `atom` schema)
- **PostgREST API**: Query Atom tables via `http://localhost:8000/rest/v1/<table>` with `Accept-Profile: atom` header
- **Shared PostgreSQL**: No separate database container — Atom uses `supabase-db`

### How it works
- `atom_user` role has `search_path = atom, public, extensions`
- SQLAlchemy's `create_all()` places tables in the `atom` schema automatically (first in search_path)
- `DATABASE_URL` connects to `postgres` database with `options=-csearch_path=atom,public,extensions`
- PostgREST exposes the `atom` schema via `SUPABASE_PGRST_DB_SCHEMAS=public,storage,graphql_public,atom`
- Supabase roles (`anon`, `authenticated`, `service_role`) have appropriate grants on the `atom` schema

### Initial database setup (already done, documented for new devices)
```sql
-- Run as supabase_admin on the postgres database
CREATE SCHEMA IF NOT EXISTS atom AUTHORIZATION atom_user;
GRANT USAGE ON SCHEMA atom TO atom_user, authenticator, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA atom TO atom_user, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA atom TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR USER atom_user IN SCHEMA atom GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR USER atom_user IN SCHEMA atom GRANT SELECT ON TABLES TO anon, authenticated;
ALTER USER atom_user SET search_path TO atom, public, extensions;
```

## Upstream Fixes Applied

### 1. `backend/Dockerfile` — `useradd` in production stage + correct entrypoint (STILL NEEDED)

The upstream Dockerfile creates `atomuser` in the builder stage but not the production stage. Without the fix, `USER atomuser` in the production stage causes container startup failure.

```dockerfile
# Line added after "FROM python:3.11-slim as production"
RUN useradd -m -u 1000 atomuser

# CMD changed from main:app (stub) to main_api_app:app (real application)
CMD ["uvicorn", "main_api_app:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 2. `backend/main_api_app.py` — Fix WorkflowExecutionLog import (STILL NEEDED)

Line 120 imports `WorkflowExecutionLog` from `analytics.models`, but the class was moved to `core.models`. Fixed to import from `core.models`.

### 3. `backend/core/database.py` — Respect DB_SSL_MODE in production (STILL NEEDED)

The production code path hardcoded `sslmode=require`, ignoring the `DB_SSL_MODE` env var. Fixed to respect `DB_SSL_MODE=disable` for internal Docker network connections where SSL is unnecessary.

### 4. `frontend-nextjs/pages/api/auth/[...nextauth].ts` — Cookie security + credentials provider (STILL NEEDED)

- `useSecureCookies` changed from `NODE_ENV === "production"` to `NEXTAUTH_URL?.startsWith("https://")` — secure cookies only over HTTPS, not based on build mode
- Removed hardcoded per-cookie `__Secure-`/`__Host-` prefix config — let NextAuth auto-configure based on `useSecureCookies`
- Credentials provider enabled by default (was gated behind `NODE_ENV === "development"`)
- Backend URL uses `BACKEND_INTERNAL_URL` env var for server-side requests (Docker network)

### 5. `frontend-nextjs/.../WorkflowBuilder.tsx` — JSX syntax (FIXED UPSTREAM)

The `INTERVIEW_DEMO_STEPS` array had an unclosed JSX expression at line 800. This was fixed in upstream commit `74bceaf69`, so no local patch is needed on newer upstream pulls.

## Pulling Upstream Updates

```bash
cd ~/Documents/Projects/atom

# Push your changes to your fork
git push origin main

# Pull new upstream changes
git fetch upstream
git merge upstream/main
```

### Handling merge conflicts

When upstream edits the same lines you've changed, Git pauses the merge and marks conflicted files:

```
<<<<<<< HEAD (your version)
RUN useradd -m -u 1000 atomuser
=======
RUN adduser --system --uid 1000 atomuser
>>>>>>> upstream/main (their version)
```

To resolve:
1. Git will list conflicted files — open each one
2. Choose the correct version and remove the `<<<<<<<`, `=======`, `>>>>>>>` markers
3. Stage and commit:
   ```bash
   git add <resolved-files>
   git commit
   ```

**Known conflict points:**
- `backend/Dockerfile` — most likely conflict. If upstream adds their own user creation (even different syntax), the effect is the same. Pick whichever works, drop the other.
- `AI_STACK_INTEGRATION.md` — upstream doesn't have this file, so it will never conflict.
- Any new files you create won't conflict since upstream doesn't have them.

**Three possible outcomes per file:**

| Scenario | What happens | Action needed |
|---|---|---|
| Same change | You both made the identical edit | Git auto-resolves, no conflict |
| Non-overlapping | You edited line 57, they edited line 30 | Git auto-merges cleanly |
| Conflicting | You both edited the same lines differently | Manual resolution required |

### After merging

```bash
# Rebuild after merge
cd ~/Documents/Projects/AI_Stack
docker compose up -d --build atom-backend atom-frontend atom-piece-engine
```

## Network Architecture

All Atom services join `ai_stack_network` (the default network for the AI_Stack compose). This means Atom can reach:
- **Ollama** at `http://ollama:11434` — local LLM inference
- **Supabase** at `http://supabase-kong:8000` — Atom's database backend (atom schema in postgres)
- **n8n** at `http://n8n:5678` — workflow automation integration
- Any other AI_Stack service by container hostname

## Quick Reference

```bash
# Start Atom
docker compose up -d atom-browserless atom-backend atom-frontend atom-piece-engine

# Stop Atom
docker compose stop atom-browserless atom-backend atom-frontend atom-piece-engine

# View logs
docker compose logs -f atom-backend

# Check health
docker compose ps | grep atom

# Manual database backup (dumps atom schema from Supabase's postgres database)
docker exec supabase-db pg_dump -U supabase_admin -d postgres --schema=atom | gzip > data/atom/pg-dumps/atom_schema_manual.sql.gz

# Query Atom tables via Supabase REST API
curl http://localhost:8000/rest/v1/users?select=id,email -H "apikey: <ANON_KEY>" -H "Accept-Profile: atom"

# Browse Atom tables in Supabase Studio
# Open http://localhost:8000 → Table Editor → select "atom" schema from dropdown
```
