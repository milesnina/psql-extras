# supabase-extras

CLI extras for Supabase — configure `psql` service connections and run SQL queries directly against your Supabase database.

## Commands

### `login`

Interactively configure a named PostgreSQL service for any generic Postgres server.

```bash
npx supabase-extras login
```

You will be prompted for:
- **PG service name** — a name you choose (e.g. `mydb`)
- **Host** — the server hostname
- **Port** — defaults to `5432`
- **Database name** — defaults to `postgres`
- **Username** — defaults to `postgres`
- **Password**

---

### `login-supabase`

Interactively configure a named PostgreSQL service. Writes connection details to `~/.pg_service.conf` and the password to `~/.pgpass`.

```bash
npx supabase-extras login-supabase
```

You will be prompted for:
- **PG service name** — a name you choose (e.g. `supabase`)
- **Connection method** — Transaction Pooler (port 6543, IPv4-compatible) or Direct Connection (port 5432, requires IPv4 add-on)
- **Project ref** — auto-detected from `supabase/.temp/project-ref` if available
- **Host** — e.g. `aws-0-us-east-1.pooler.supabase.com` (pooler) or `db.<ref>.supabase.co` (direct)
- **Port**, **database name**, **username**, **password**

Find connection details on [supabase.com](https://supabase.com) → your project → **Connect** → Connection String → URI → Primary Database.

After login, connect directly with psql:

```bash
psql service=supabase -c 'SELECT 1'
```

> If psql is not installed: `sudo apt-get install -y postgresql-client`

---

### `execute <service> '<SQL>'`

Run a SQL query against a named service from `~/.pg_service.conf`.

```bash
npx supabase-extras execute supabase 'SELECT * FROM auth.users LIMIT 10'
```

Results are printed as a formatted table by default.

**Flags:**

| Flag | Description |
|------|-------------|
| `--json` | Output results as JSON instead of a table |

```bash
npx supabase-extras execute supabase 'SELECT id, email FROM auth.users' --json
```

## Prerequisites

- Node.js (ESM support required — Node 18+)
- `psql` for direct psql usage: `sudo apt-get install -y postgresql-client`

## Installation

This package is used locally via `npx`. No global install needed.

```bash
npx supabase-extras login           # generic Postgres
npx supabase-extras login-supabase  # Supabase-specific
```

## Files written

| File | Purpose |
|------|---------|
| `~/.pg_service.conf` | Named connection entries read by psql and this CLI |
| `~/.pgpass` | Passwords for those connections (chmod 600) |
| `~/.config/supabase-extras/config.json` | Stores the active service name |
