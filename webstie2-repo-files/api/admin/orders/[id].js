const c = require('../../../lib/core');

// PATCH  /api/admin/orders/:id -> update status / price / method / instructions
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
    if (b.price !== undefined) next.price = c.clean(b.price, c.MAX.price);
    if (b.instructions !== undefined) next.instructions = c.clean(b.instructions, c.MAX.instructions);
    next.updated = new Date().toISOString();
    await c.saveOrder(next);
    if (next.status !== order.status) {
      const note = c.clean(b.note, c.MAX.note) || 'Status updated by admin.';
      await c.notify(null,
        'Commission update for order **' + id + '**\nStatus: **' + next.status + '**\nPayment method: ' + next.method +
        '\nInstructions: ' + (next.instructions || 'Not set') + '\nNote: ' + note);
    }
    return c.send(res, 200, { order: next });
  }

  if (req.method === 'DELETE') {
    await c.deleteOrder(id);
    return c.send(res, 200, { ok: true });
  }

  res.setHeader('Allow', 'PATCH, DELETE');
  return c.send(res, 405, { error: 'Method not allowed.' });
});
