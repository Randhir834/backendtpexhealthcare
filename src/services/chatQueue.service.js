import crypto from "crypto";
import { getRedisClient } from "../config/redis.js";

function listKey({ role, profileId }) {
  return `chat:undelivered:list:${role}:${profileId}`;
}

function messageKey(messageId) {
  return `chat:undelivered:msg:${messageId}`;
}

function newMessageId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

function getTtlSeconds(ttlSeconds) {
  const env = Number(process.env.CHAT_OFFLINE_TTL_SECONDS || 0);
  const fallback = 48 * 60 * 60;
  const v = Number(ttlSeconds || 0) || env || fallback;

  const min = 24 * 60 * 60;
  const max = 72 * 60 * 60;
  const clamped = Math.max(min, Math.min(max, Math.floor(v)));
  return clamped;
}

export async function enqueueUndelivered({ recipientRole, recipientProfileId, payload, ttlSeconds }) {
  const client = await getRedisClient();
  const messageId = newMessageId();
  const ttl = getTtlSeconds(ttlSeconds);

  await client.set(messageKey(messageId), JSON.stringify(payload || {}), { EX: ttl });
  await client.rPush(listKey({ role: recipientRole, profileId: recipientProfileId }), messageId);
  await client.expire(listKey({ role: recipientRole, profileId: recipientProfileId }), ttl);

  return messageId;
}

export async function fetchUndelivered({ recipientRole, recipientProfileId, limit = 100 }) {
  const client = await getRedisClient();
  const lim = Math.min(Math.max(Number(limit || 100), 1), 500);

  const lKey = listKey({ role: recipientRole, profileId: recipientProfileId });
  const ids = await client.lRange(lKey, 0, lim - 1);
  if (!ids.length) return [];

  const keys = ids.map((id) => messageKey(id));
  const rows = await client.mGet(keys);

  const out = [];
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const raw = rows[i];
    if (!raw) {
      await client.lRem(lKey, 0, id);
      continue;
    }

    try {
      out.push({ id, payload: JSON.parse(raw) });
    } catch {
      await client.del(messageKey(id));
      await client.lRem(lKey, 0, id);
    }
  }

  return out;
}

export async function ackUndelivered({ recipientRole, recipientProfileId, messageId }) {
  const client = await getRedisClient();
  const id = String(messageId || "").trim();
  if (!id) return false;

  const lKey = listKey({ role: recipientRole, profileId: recipientProfileId });
  await client.del(messageKey(id));
  await client.lRem(lKey, 0, id);
  return true;
}
