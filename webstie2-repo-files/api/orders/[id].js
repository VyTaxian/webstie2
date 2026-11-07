const c = require('../../lib/core');

// GET /api/orders/:id -> the customer's own order (includes payment instructions)
module.exports = c.route(async (req, res) => {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return c.send(res, 405, { error: 'Method not allowed.' }); }
  if ((await c.hit('taxian:rl:lookup:' + c.clientIp(req), 60)) > 60) return c.send(res, 429, { error: 'Slow down.' });
  const id = String(req.query.id || '').toUpperCase();
  const order = c.isSeedId(id) ? null : await c.getOrder(id);
  return order ? c.send(res, 200, { order: c.ownerView(order) }) : c.send(res, 404, { error: 'Order not found.' });
});
