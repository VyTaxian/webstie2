const c = require('../lib/core');

// GET  /api/orders  -> live board for everyone
// POST /api/orders  -> customer submits a request
module.exports = c.route(async (req, res) => {
  if (req.method === 'GET') {
    const orders = await c.allOrders(true);
    const showDetails = process.env.PUBLIC_DETAILS !== 'false';
    return c.send(res, 200, {
      orders: orders.slice(0, 100).map((o) => c.publicView(o, showDetails)),
      stats: c.computeStats(orders),
    });
  }

  if (req.method === 'POST') {
    const ip = c.clientIp(req);
    if ((await c.hit('taxian:rl:submit:' + ip, 600)) > 3) {
      return c.send(res, 429, { error: 'Too many requests. Try again in a few minutes.' });
    }
    const b = c.body(req);
    const title = c.clean(b.title, c.MAX.title);
    const details = c.clean(b.details, c.MAX.details);
    if (!title || !details) return c.send(res, 400, { error: 'Please complete all fields.' });

    const now = new Date().toISOString();
    const order = {
      id: c.newId(), num: await c.nextNum(), title, details, status: 'Request submitted', price: '', method: 'Not set',
      instructions: '', created: now, updated: now,
    };
    await c.saveOrder(order);
    return c.send(res, 201, { order });
  }

  res.setHeader('Allow', 'GET, POST');
  return c.send(res, 405, { error: 'Method not allowed.' });
});
