const c = require('../../../lib/core');

// PATCH  /api/admin/orders/:id -> update status / price / method / instructions / title / details
// DELETE /api/admin/orders/:id -> remove an order
module.exports = c.route(async (req, res) => {
  if (!(await c.isAdmin(req))) return c.send(res, 401, { error: 'Unauthorised.' });
  const id = String(req.query.id || '').toUpperCase();

  if (req.method === 'PATCH') {
    const order = await c.getOrder(id);
    if (!order) return c.send(res, 404, { error: 'Order not found.' });
    const b = c.body(req);
    const next = { ...order };
    if (b.status !== undefined) {
      if (!c.STATUSES.includes(b.status)) return c.send(res, 400, { error: 'Bad status.' });
      next.status = b.status;
    }
    if (b.method !== undefined) {
      if (!c.METHODS.includes(b.method)) return c.send(res, 400, { error: 'Bad method.' });
      next.method = b.method;
    }
    if (b.title !== undefined) { const t = c.clean(b.title, c.MAX.title); if (!t) return c.send(res, 400, { error: 'Title cannot be empty.' }); next.title = t; }
    if (b.details !== undefined) next.details = c.clean(b.details, c.MAX.details);
    if (b.price !== undefined) next.price = c.clean(b.price, c.MAX.price);
    if (b.instructions !== undefined) next.instructions = c.clean(b.instructions, c.MAX.instructions);
    if (b.note !== undefined) next.note = c.clean(b.note, c.MAX.note); // shown to the customer on their order page
    next.updated = new Date().toISOString();
    await c.saveOrder(next);
    return c.send(res, 200, { order: next });
  }

  if (req.method === 'DELETE') {
    await c.deleteOrder(id);
    return c.send(res, 200, { ok: true });
  }

  res.setHeader('Allow', 'PATCH, DELETE');
  return c.send(res, 405, { error: 'Method not allowed.' });
});
