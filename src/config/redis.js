import { createClient } from "redis";

let clientPromise = null;

function buildRedisClient() {
  const url = String(process.env.REDIS_URL || "").trim();
  const socket = {};

  const opts = url ? { url, socket } : { socket };
  const client = createClient(opts);

  client.on("error", (err) => {
    console.error("Redis error:", err);
  });

  return client;
}

export async function getRedisClient() {
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    const client = buildRedisClient();
    if (!client.isOpen) {
      await client.connect();
    }
    return client;
  })();

  return clientPromise;
}
