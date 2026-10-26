// Shared helpers for the commission API (Vercel Functions + Upstash Redis).
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const STATUSES = ['Request submitted', 'New request', 'Payment confirmed', 'Payment denied', 'Completed'];
const METHODS = ['Not set', 'PayPal', 'Roblox gamepass'];
const MAX = { title: 100, details: 1800, price: 60, instructions: 1000, note: 300 };
const HASH = 'taxian:orders';

let _redis;
function redis() {
  if (!_redis) {
    // Vercel's Upstash integration sets one of these pairs automatically.
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) throw new Error('Redis env vars missing - connect an Upstash Redis store to this project.');
    _redis = new Redis({ url, token });
  }
  return _redis;
}

function send(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(data);
}
function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}
function newId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'TX-' + Array.from(crypto.randomBytes(5), (b) => alphabet[b % alphabet.length]).join('');
}
function maskId(id) { return id.length > 6 ? id.slice(0, 3) + '•••' + id.slice(-2) : id; }

// What EVERYONE sees on the board (no full order number, no payment instructions).
function publicView(o, showDetails) {
  return {
    ref: maskId(o.id), title: o.title, details: showDetails ? o.details : '', status: o.status,
    price: o.price, method: o.method, created: o.created, updated: o.updated,
  };
}

function parse(v) { if (v == null) return null; return typeof v === 'string' ? JSON.parse(v) : v; }
async function getOrder(id) { return parse(await redis().hget(HASH, id)); }
async function saveOrder(o) { await redis().hset(HASH, { [o.id]: JSON.stringify(o) }); }
async function deleteOrder(id) { await redis().hdel(HASH, id); }
async function allOrders() {
  const map = (await redis().hgetall(HASH)) || {};
  return Object.values(map).map(parse).sort((a, b) => (a.updated < b.updated ? 1 : -1));
}
function computeStats(orders) {
  const s = { total: orders.length, pending: 0, confirmed: 0, completed: 0, denied: 0 };
  for (const o of orders) {
    if (o.status === 'Payment confirmed') s.confirmed++;
    else if (o.status === 'Completed') s.completed++;
    else if (o.status === 'Payment denied') s.denied++;
    else s.pending++;
  }
  return s;
}

// Rate limiting with Redis counters.
async function hit(key, windowSec) {
  const n = await redis().incr(key);
  if (n === 1) await redis().expire(key, windowSec);
  return n;
}
async function count(key) { return Number(await redis().get(key)) || 0; }

function sha(s) { return crypto.createHash('sha256').update(String(s)).digest(); }
async function isAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const key = 'taxian:rl:adminfail:' + clientIp(req);
  if ((await count(key)) >= 8) return false;
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (crypto.timingSafeEqual(sha(supplied), sha(expected))) return true;
  await hit(key, 600);
  return false;
}

async function notify(embed, content) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Taxian Commissions',
        content: content || 'New commission request received.',
        embeds: embed ? [embed] : [],
        allowed_mentions: { parse: [] },
      }),
    });
  } catch (e) { console.error('Discord notify failed', e); }
}

// Wraps a handler so unexpected errors return clean JSON.
function route(handler) {
  return async (req, res) => {
    try { await handler(req, res); }
    catch (err) { console.error(err); send(res, 500, { error: 'Server error.' }); }
  };
}

module.exports = {
  STATUSES, METHODS, MAX, send, body, clean, clientIp, newId, publicView, getOrder, saveOrder, deleteOrder,
  allOrders, computeStats, hit, count, isAdmin, notify, route,
};
