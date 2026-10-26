const c = require('../../lib/core');

// GET  /api/admin/orders -> every order, full detail
// POST /api/admin/orders -> add an order manually
module.exports = c.route(async (req, res) => {
  if (!(await c.isAdmin(req))) return c.send(res, 401, { error: 'Unauthorised.' });

  if (req.method === 'GET') return c.send(res, 200, { orders: (await c.allOrders()).slice(0, 500) });

  if (req.method === 'POST') {
    const b = c.body(req);
    const title = c.clean(b.title, c.MAX.title);
    if (!title) return c.send(res, 400, { error: 'Title required.' });
    const id = (c.clean(b.id, 50) || c.newId()).toUpperCase();
    if (await c.getOrder(id)) return c.send(res, 409, { error: 'That order ID already exists.' });
    const now = new Date().toISOString();
    const order = {
      id, num: await c.nextNum(), title, details: c.clean(b.details, c.MAX.details),
      status: c.STATUSES.includes(b.status) ? b.status : 'New request',
      price: c.clean(b.price, c.MAX.price), method: c.METHODS.includes(b.method) ? b.method : 'Not set',
      instructions: c.clean(b.instructions, c.MAX.instructions), created: now, updated: now,
    };
    await c.saveOrder(order);
    return c.send(res, 201, { order });
  }

  res.setHeader('Allow', 'GET, POST');
  return c.send(res, 405, { error: 'Method not allowed.' });
});
