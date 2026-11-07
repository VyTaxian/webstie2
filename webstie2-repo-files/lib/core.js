// Shared helpers for the commission API (Vercel Functions + Upstash Redis).
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');
const { SEED } = require('./seed');

const STATUSES = ['Request submitted', 'New request', 'Payment confirmed', 'Payment denied', 'Completed'];
const METHODS = ['Not set', 'PayPal', 'Roblox gamepass'];
const MAX = { title: 100, details: 1800, price: 60, instructions: 1000, note: 300 };
const HASH = 'taxian:orders';
const COUNTER = 'taxian:order:counter';
const FILES = 'taxian:files';
const CHAT_META = 'taxian:chatmeta';      // orderId -> { count, unreadAdmin, unreadCust, lastFrom, lastAt, lastText }
const CHAT_KEY = (id) => 'taxian:chat:' + id; // list of JSON messages per order
const CHAT_MAX_LEN = 1000, CHAT_KEEP = 300;
const SEEDED = 'taxian:seeded'; // set once the starter commissions have been copied into Redis
const MAX_FILE_BYTES = 500 * 1024; // keeps uploads inside Upstash's request-size limit; bigger deliveries should use a link

let _redis, _seeded = false;
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
// Starter commissions (SEED-xx) are display/admin items only: customers can't look them up or chat on them.
function isSeedId(id) { return /^SEED-/i.test(String(id || '')); }
function maskId(id) { return id.length > 6 ? id.slice(0, 3) + '•••' + id.slice(-2) : id; }
// Public order number: #1-#20 are the hardcoded commissions, real requests continue from #21.
async function nextNum() { return SEED.length + Number(await redis().incr(COUNTER)); }

// What EVERYONE sees on the board (no full order number, no payment instructions).
function publicView(o, showDetails) {
  return {
    ref: o.num ? '#' + o.num : maskId(o.id), title: o.title, details: showDetails ? o.details : '', status: o.status,
    price: o.price, method: o.method, created: o.created, updated: o.updated,
  };
}

function parse(v) { if (v == null) return null; return typeof v === 'string' ? JSON.parse(v) : v; }
async function getOrder(id) { return parse(await redis().hget(HASH, id)); }
async function saveOrder(o) { await redis().hset(HASH, { [o.id]: JSON.stringify(o) }); }
async function deleteOrder(id) { await redis().hdel(HASH, id); await redis().hdel(FILES, id); await redis().del(CHAT_KEY(id)); await redis().hdel(CHAT_META, id); }
async function saveFile(id, b64) { await redis().hset(FILES, { [id]: b64 }); }
async function getFile(id) { const v = await redis().hget(FILES, id); return v == null ? null : String(v); }
async function deleteFile(id) { await redis().hdel(FILES, id); }

// A delivery (GitHub repo link or uploaded file) is only visible to the customer once payment is confirmed.
function deliveryFor(order) {
  const d = order && order.delivery;
  if (!d || !['Payment confirmed', 'Completed'].includes(order.status)) return null;
  if (d.type === 'file') {
    return { type: 'file', label: d.label, filename: d.filename, size: d.size, downloadUrl: '/api/download?id=' + encodeURIComponent(order.id) };
  }
  return { type: 'link', label: d.label, url: d.url };
}
// What the customer sees when they look up their own order number.
function ownerView(o) {
  const { delivery, ...rest } = o;
  const d = deliveryFor(o);
  return d ? { ...rest, delivery: d } : rest;
}
function safeFilename(v) {
  return clean(v, 100).replace(/[\\/"<>:|?*\u0000-\u001F]/g, '_') || 'download';
}
// The 20 starter commissions in seed.js are copied into Redis ONCE (hsetnx never overwrites). After that every commission
// lives in the datastore, so edits made in the admin panel survive redeploys and are never reset by code updates.
async function ensureSeeded() {
  if (_seeded) return;
  const r = redis();
  if (!(await r.get(SEEDED))) {
    await Promise.all(SEED.map((o) => r.hsetnx(HASH, o.id, JSON.stringify(o))));
    await r.set(SEEDED, '1');
  }
  _seeded = true;
}
// All commissions (starter ones + real requests), newest activity first. The argument is kept only for old callers.
async function allOrders() {
  await ensureSeeded();
  const map = (await redis().hgetall(HASH)) || {};
  return Object.values(map).map(parse).filter(Boolean).sort((a, b) => (a.updated < b.updated ? 1 : -1));
}

// ---------- Backup / restore (admin only) ----------
async function exportAll() {
  await ensureSeeded();
  const r = redis();
  const orders = Object.values((await r.hgetall(HASH)) || {}).map(parse).filter(Boolean);
  const chats = {};
  for (const o of orders) { const m = await chatMessages(o.id); if (m.length) chats[o.id] = m; }
  const files = (await r.hgetall(FILES)) || {};
  return {
    app: 'taxian-site', version: 1, exported: new Date().toISOString(),
    counter: Number(await r.get(COUNTER)) || 0,
    orders, chatMeta: await allChatMeta(), chats, files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, String(v)])),
  };
}
async function importAll(d) {
  if (!d || d.app !== 'taxian-site' || !Array.isArray(d.orders)) throw new Error('That is not a Taxian backup file.');
  const r = redis();
  let n = 0;
  for (const o of d.orders) {
    if (!o || typeof o.id !== 'string' || typeof o.title !== 'string' || !/^[A-Za-z0-9_-]{1,60}$/.test(o.id)) continue;
    await r.hset(HASH, { [o.id]: JSON.stringify(o) }); n++;
  }
  const cur = Number(await r.get(COUNTER)) || 0;
  if (Number(d.counter) > cur) await r.set(COUNTER, Number(d.counter));
  for (const [id, meta] of Object.entries(d.chatMeta || {})) if (/^[A-Za-z0-9_-]{1,60}$/.test(id) && meta) await r.hset(CHAT_META, { [id]: JSON.stringify(meta) });
  for (const [id, msgs] of Object.entries(d.chats || {})) {
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(id) || !Array.isArray(msgs) || !msgs.length) continue;
    await r.del(CHAT_KEY(id));
    await r.rpush(CHAT_KEY(id), ...msgs.slice(-CHAT_KEEP).map((m) => JSON.stringify(m)));
  }
  for (const [id, b64] of Object.entries(d.files || {})) if (/^[A-Za-z0-9_-]{1,60}$/.test(id) && typeof b64 === 'string') await r.hset(FILES, { [id]: b64 });
  await r.set(SEEDED, '1'); _seeded = true; // never re-add starter commissions on top of a restored backup
  return n;
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


// ---------- Chat (one thread per order number) ----------
async function chatMeta(id) { return parse(await redis().hget(CHAT_META, id)) || { count: 0, unreadAdmin: 0, unreadCust: 0, lastFrom: '', lastAt: '', lastText: '' }; }
async function allChatMeta() {
  const map = (await redis().hgetall(CHAT_META)) || {};
  const out = {};
  for (const [k, v] of Object.entries(map)) out[k] = parse(v);
  return out;
}
async function chatMessages(id) {
  const raw = (await redis().lrange(CHAT_KEY(id), 0, -1)) || [];
  return raw.map(parse).filter(Boolean);
}
// from = 'customer' | 'admin'
async function chatPost(id, from, text) {
  const meta = await chatMeta(id);
  meta.count = (meta.count || 0) + 1;
  const msg = { n: meta.count, from, text, at: new Date().toISOString() };
  await redis().rpush(CHAT_KEY(id), JSON.stringify(msg));
  await redis().ltrim(CHAT_KEY(id), -CHAT_KEEP, -1);
  if (from === 'customer') meta.unreadAdmin = (meta.unreadAdmin || 0) + 1; else meta.unreadCust = (meta.unreadCust || 0) + 1;
  meta.lastFrom = from; meta.lastAt = msg.at; meta.lastText = text.slice(0, 80);
  await redis().hset(CHAT_META, { [id]: JSON.stringify(meta) });
  return msg;
}
// side = 'admin' | 'customer': clears that side's unread counter
async function chatMarkRead(id, side) {
  const meta = await chatMeta(id);
  const k = side === 'admin' ? 'unreadAdmin' : 'unreadCust';
  if (!meta[k]) return meta;
  meta[k] = 0;
  await redis().hset(CHAT_META, { [id]: JSON.stringify(meta) });
  return meta;
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

// Wraps a handler so unexpected errors return clean JSON.
function route(handler) {
  return async (req, res) => {
    try { await handler(req, res); }
    catch (err) { console.error(err); send(res, 500, { error: 'Server error.' }); }
  };
}

module.exports = {
  STATUSES, METHODS, MAX, MAX_FILE_BYTES, CHAT_MAX_LEN, chatMeta, allChatMeta, chatMessages, chatPost, chatMarkRead, SEED, nextNum, saveFile, getFile, deleteFile, deliveryFor, ownerView, safeFilename, send, body, clean, clientIp, newId, publicView, getOrder, saveOrder, deleteOrder,
  allOrders, computeStats, hit, count, isAdmin, route, exportAll, importAll, isSeedId,
};
