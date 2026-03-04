import pg from "pg";
import dns from "dns";
const { Client } = pg;

// Prefer IPv4 to avoid ENETUNREACH on IPv6
dns.setDefaultResultOrder("ipv4first");

export async function createConnection({ host, port, user, password, database }) {
  const client = new Client({ host, port: parseInt(port), user, password, database, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}
