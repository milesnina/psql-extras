import pg from "pg";
import dns from "dns";
const { Client } = pg;

// Prefer IPv4 to avoid ENETUNREACH on IPv6
dns.setDefaultResultOrder("ipv4first");

export async function createConnection(connectionString) {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}
