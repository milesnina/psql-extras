#!/usr/bin/env node
import { createInterface } from "readline";
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, chmodSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createConnection } from "../lib/db.js";
import { printTable } from "../lib/table.js";

const CONFIG_DIR = join(homedir(), ".config", "supabase-extras");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const PG_SERVICE_FILE = join(homedir(), ".pg_service.conf");
const PG_PASS_FILE = join(homedir(), ".pgpass");

function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return null;
  }
}

function saveConfig(config) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

function prompt(question, defaultValue) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const hint = defaultValue ? ` (${defaultValue})` : "";
    rl.question(`${question}${hint}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

function promptPassword(question) {
  return new Promise((resolve) => {
    process.stdout.write(question + ": ");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let password = "";
    process.stdin.on("data", function handler(ch) {
      if (ch === "\n" || ch === "\r" || ch === "\u0003") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", handler);
        process.stdout.write("\n");
        if (ch === "\u0003") process.exit(1);
        resolve(password);
      } else if (ch === "\u007f") {
        password = password.slice(0, -1);
      } else {
        password += ch;
      }
    });
  });
}

function writePgService(serviceName, host, port, dbname, user) {
  let content = existsSync(PG_SERVICE_FILE) ? readFileSync(PG_SERVICE_FILE, "utf8") : "";

  // Remove existing block for this service name if present
  const serviceRegex = new RegExp(`\\[${serviceName}\\][^\\[]*`, "g");
  content = content.replace(serviceRegex, "").trimEnd();

  const separator = content ? "\n\n" : "";
  const block = `[${serviceName}]\nhost=${host}\nport=${port}\ndbname=${dbname}\nuser=${user}\n`;
  writeFileSync(PG_SERVICE_FILE, (content.trimEnd() + separator + block).trimStart());
}

function writePgPass(host, port, dbname, user, password) {
  let content = existsSync(PG_PASS_FILE) ? readFileSync(PG_PASS_FILE, "utf8") : "";

  // Remove existing matching line
  const lines = content.split("\n").filter((l) => {
    const parts = l.split(":");
    return !(parts[0] === host && parts[1] === String(port) && parts[2] === dbname && parts[3] === user);
  });

  lines.push(`${host}:${port}:${dbname}:${user}:${password}`);
  writeFileSync(PG_PASS_FILE, lines.filter(Boolean).join("\n") + "\n");
  chmodSync(PG_PASS_FILE, 0o600);
}

async function cmdLogin() {
  console.log("Supabase Extras Login");
  console.log("─────────────────────");
  console.log("Find connection details on supabase.com → your project → Connect button");
  console.log("→ Connection String → Type: URI, Source: Primary Database\n");

  let serviceName;
  while (true) {
    serviceName = await prompt("PG service name");
    if (!serviceName) {
      console.log("Service name is required.");
      continue;
    }
    if (existsSync(PG_SERVICE_FILE)) {
      const existing = readFileSync(PG_SERVICE_FILE, "utf8");
      if (new RegExp(`^\\[${serviceName}\\]`, "m").test(existing)) {
        console.log(`Service [${serviceName}] already exists in ${PG_SERVICE_FILE}. Choose a different name.`);
        continue;
      }
    }
    break;
  }
  // Connection method
  console.log("\nConnection method:");
  console.log("  1) Transaction Pooler  — IPv4-compatible, works in most environments");
  console.log("  2) Direct Connection   — requires IPv4 add-on purchased from supabase.com");
  let method;
  while (true) {
    const methodInput = await prompt("Method (1 or 2)", "1");
    if (methodInput === "1" || methodInput.toLowerCase().includes("pool")) {
      method = "pooler";
      break;
    } else if (methodInput === "2" || methodInput.toLowerCase().includes("direct")) {
      method = "direct";
      break;
    }
    console.log("Please enter 1 or 2.");
  }

  // Project ref
  const projectRefFile = join(process.cwd(), "supabase", ".temp", "project-ref");
  let detectedRef = null;
  if (existsSync(projectRefFile)) {
    detectedRef = readFileSync(projectRefFile, "utf8").trim();
    console.log(`  Hint: project-ref detected from supabase/.temp/project-ref: ${detectedRef}`);
  } else {
    console.log(`  Hint: project-ref is in supabase/.temp/project-ref if you ran 'supabase link'`);
  }
  const projectRef = await prompt("Project ref", detectedRef || "");

  // Host
  let defaultHost;
  if (method === "direct") {
    defaultHost = projectRef ? `db.${projectRef}.supabase.co` : null;
  }
  // Pooler host can't be auto-filled (region unknown), show pattern as hint
  if (method === "pooler" && projectRef) {
    console.log(`  Hint: pooler host format is aws-0-<region>.pooler.supabase.com (check supabase.com for your region)`);
  }
  let host;
  while (true) {
    host = await prompt("Host", defaultHost);
    if (!host) {
      console.log("Host is required.");
      continue;
    }
    if (/^[a-z0-9-]+$/.test(host)) {
      const suggestion = `db.${host}.supabase.co`;
      const answer = await prompt(`That looks like a project-ref. Use ${suggestion} instead? (Y/n)`);
      if (answer.toLowerCase() !== "n") {
        host = suggestion;
      }
    } else if (!host.includes(".")) {
      console.log("That doesn't look like a valid host. Please enter a hostname.");
      continue;
    }
    break;
  }

  const defaultPort = method === "pooler" ? "6543" : "5432";
  const port = await prompt("Port", defaultPort);
  const dbname = await prompt("Database name", "postgres");
  const defaultUser = method === "pooler" && projectRef ? `postgres.${projectRef}` : "postgres";
  const user = await prompt("Username", defaultUser);
  const password = await promptPassword("Password");

  if (!host || !password) {
    console.error("Error: host and password are required.");
    process.exit(1);
  }

  writePgService(serviceName, host, port, dbname, user);
  console.log(`Saved service [${serviceName}] to ${PG_SERVICE_FILE}`);

  writePgPass(host, port, dbname, user, password);
  console.log(`Saved password to ${PG_PASS_FILE}`);

  saveConfig({ serviceName });
  console.log(`Saved active service to ${CONFIG_FILE}`);
  console.log(`\nYou can now connect with: psql service=${serviceName}`);
  console.log(`(If psql is not installed: sudo apt-get install -y postgresql-client)`);
}

async function cmdExecute(serviceName, sql, flags) {
  // Read connection details from pg_service.conf
  if (!existsSync(PG_SERVICE_FILE)) {
    console.error(`${PG_SERVICE_FILE} not found. Run: npx supabase-extras login`);
    process.exit(1);
  }

  const serviceContent = readFileSync(PG_SERVICE_FILE, "utf8");
  const serviceRegex = new RegExp(`\\[${serviceName}\\]([^\\[]*)`, "s");
  const match = serviceContent.match(serviceRegex);
  if (!match) {
    console.error(`Service [${serviceName}] not found in ${PG_SERVICE_FILE}`);
    process.exit(1);
  }

  const entries = Object.fromEntries(
    match[1].trim().split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("#"))
      .map((l) => l.split("=").map((s) => s.trim()))
  );
  console.error(`[debug] Connecting with host=${entries.host} port=${entries.port} user=${entries.user} dbname=${entries.dbname}`);

  // Read password from pgpass
  let password = "";
  if (existsSync(PG_PASS_FILE)) {
    const pgpassLines = readFileSync(PG_PASS_FILE, "utf8").split("\n");
    for (const line of pgpassLines) {
      const parts = line.split(":");
      if (
        (parts[0] === entries.host || parts[0] === "*") &&
        (parts[1] === entries.port || parts[1] === "*") &&
        (parts[2] === entries.dbname || parts[2] === "*") &&
        (parts[3] === entries.user || parts[3] === "*")
      ) {
        password = parts[4];
        break;
      }
    }
    if (!password) {
      console.error(`No pgpass entry matched for host=${entries.host} port=${entries.port} dbname=${entries.dbname} user=${entries.user}`);
      process.exit(1);
    }
  } else {
    console.error(`${PG_PASS_FILE} not found. Run: npx supabase-extras login`);
    process.exit(1);
  }

  let client;
  try {
    client = await createConnection({
      host: entries.host,
      port: entries.port,
      user: entries.user,
      password,
      database: entries.dbname,
    });
    const result = await client.query(sql);

    if (flags.json) {
      console.log(JSON.stringify(result.rows, null, 2));
    } else {
      if (result.rows.length === 0) {
        console.log("(0 rows)");
      } else {
        printTable(result.fields.map((f) => f.name), result.rows);
        console.log(`(${result.rows.length} row${result.rows.length !== 1 ? "s" : ""})`);
      }
    }
  } catch (err) {
    console.error("Query error:", err.message);
    process.exit(1);
  } finally {
    if (client) await client.end();
  }
}

// Parse args
const args = process.argv.slice(2);
const command = args[0];
const flags = { json: args.includes("--json") };
const positional = args.filter((a) => !a.startsWith("--"));

if (command === "login") {
  await cmdLogin();
} else if (command === "execute") {
  const serviceName = positional[1];
  const sql = positional[2];
  if (!serviceName || !sql) {
    console.error("Usage: supabase-extras execute <service-name> '<SQL>'");
    process.exit(1);
  }
  await cmdExecute(serviceName, sql, flags);
} else {
  console.log(`supabase-extras <command>

Commands:
  login              Configure a PostgreSQL service (writes ~/.pg_service.conf and ~/.pgpass)
  execute <service> '<SQL>'    Run a SQL query against a service from ~/.pg_service.conf

Flags:
  --json             Output results as JSON instead of a table

Examples:
  npx supabase-extras login
  npx supabase-extras execute supabase 'SELECT * FROM auth.users LIMIT 10'
  npx supabase-extras execute 'SELECT * FROM public.profiles' --json
`);
}
