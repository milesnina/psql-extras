#!/usr/bin/env node
import { createInterface } from "readline";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createConnection } from "../lib/db.js";
import { printTable } from "../lib/table.js";

const CONFIG_DIR = join(homedir(), ".config", "supabase-extras");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

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

function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function promptPassword(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
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

async function cmdLogin() {
  console.log("Supabase Extras Login");
  console.log("─────────────────────");
  const projectRef = await prompt("Project ref: ");
  const password = await promptPassword("Database password: ");

  if (!projectRef.trim() || !password.trim()) {
    console.error("Error: project-ref and password are required.");
    process.exit(1);
  }

  saveConfig({ projectRef: projectRef.trim(), password: password.trim() });
  console.log(`\nCredentials saved to ${CONFIG_FILE}`);
}

async function cmdExecute(sql, flags) {
  const config = loadConfig();
  if (!config) {
    console.error(
      "Not logged in. Run: npx supabase-extras login"
    );
    process.exit(1);
  }

  const { projectRef, password } = config;
  const host = `db.${projectRef}.supabase.co`;
  const connectionString = `postgresql://postgres:${encodeURIComponent(password)}@${host}:5432/postgres`;

  let client;
  try {
    client = await createConnection(connectionString);
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
  const sql = positional[1];
  if (!sql) {
    console.error("Usage: supabase-extras execute '<SQL>'");
    process.exit(1);
  }
  await cmdExecute(sql, flags);
} else {
  console.log(`supabase-extras <command>

Commands:
  login              Save your Supabase project-ref and DB password
  execute '<SQL>'    Run a SQL query against your Supabase database

Flags:
  --json             Output results as JSON instead of a table

Examples:
  npx supabase-extras login
  npx supabase-extras execute 'SELECT * FROM auth.users LIMIT 10'
  npx supabase-extras execute 'SELECT * FROM public.profiles' --json
`);
}
