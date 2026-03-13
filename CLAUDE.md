# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the CLI

```bash
node bin/cli.js login
node bin/cli.js login-supabase
node bin/cli.js execute <service> '<SQL>'
node bin/cli.js execute <service> '<SQL>' --json
```

Or via npx after `npm install`:
```bash
npx psql-extras login
```

## Architecture

This is a zero-build Node.js ESM CLI (`"type": "module"`, Node 18+). There are three files of substance:

- **`bin/cli.js`** — single entry point containing all command logic: argument parsing, interactive prompts, and file I/O for `~/.pg_service.conf` and `~/.pgpass`. Commands: `login`, `login-supabase`, `execute`.
- **`lib/db.js`** — thin wrapper around the `pg` Client that forces IPv4 DNS resolution (`dns.setDefaultResultOrder("ipv4first")`) and enables SSL with `rejectUnauthorized: false`.
- **`lib/table.js`** — formats query results using `cli-table3`.

## Key conventions

- The `execute` command reads connection config from `~/.pg_service.conf` and passwords from `~/.pgpass` — it does not accept credentials directly.
- `login-supabase` auto-detects project ref from `supabase/.temp/project-ref` (written by `supabase link`).
- Existing service entries in `~/.pg_service.conf` are replaced (not duplicated) by regex-based removal before writing.
- No build step, no transpilation, no test suite currently exists.
