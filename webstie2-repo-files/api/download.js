const c = require('../lib/core');

// GET /api/download?id=ORDERID -> the customer's uploaded file (only once payment is confirmed)
module.exports = c.route(async (req, res) => {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return c.send(res, 405, { error: 'Method not allowed.' }); }
  if ((await c.hit('taxian:rl:dl:' + c.clientIp(req), 60)) > 30) return c.send(res, 429, { error: 'Slow down.' });
  const id = String(req.query.id || '').toUpperCase();
  const order = await c.getOrder(id);
  const d = order && c.deliveryFor(order);
  if (!d || d.type !== 'file') return c.send(res, 404, { error: 'No file available for this order yet.' });
  const b64 = await c.getFile(id);
  if (!b64) return c.send(res, 404, { error: 'File not found.' });
  const buf = Buffer.from(b64, 'base64');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="' + d.filename.replace(/"/g, '') + '"; filename*=UTF-8\'\'' + encodeURIComponent(d.filename));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(buf);
});
