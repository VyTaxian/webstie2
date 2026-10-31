const c = require('../../lib/core');

// Admin side of the chat.
// GET  /api/admin/chat?id=ORDERID -> full thread (marks it read for you)
// POST /api/admin/chat { id, text } -> reply to the customer
module.exports = c.route(async (req, res) => {
  if (!(await c.isAdmin(req))) return c.send(res, 401, { error: 'Unauthorised.' });

  if (req.method === 'GET') {
    const id = String(req.query.id || '').toUpperCase();
    const order = await c.getOrder(id);
    if (!order) return c.send(res, 404, { error: 'Order not found.' });
    const meta = await c.chatMarkRead(id, 'admin');
    return c.send(res, 200, { messages: await c.chatMessages(id), count: meta.count || 0 });
  }

  if (req.method === 'POST') {
    const b = c.body(req);
    const id = String(b.id || '').toUpperCase();
    const text = c.clean(b.text, c.CHAT_MAX_LEN);
    if (!text) return c.send(res, 400, { error: 'Type a message first.' });
    const order = await c.getOrder(id);
    if (!order) return c.send(res, 404, { error: 'Order not found.' });
    const message = await c.chatPost(id, 'admin', text);
    return c.send(res, 201, { message });
  }

  res.setHeader('Allow', 'GET, POST');
  return c.send(res, 405, { error: 'Method not allowed.' });
});
