const c = require('../lib/core');

// Customer side of the chat. The private order number acts as the key (same as the order lookup).
// GET  /api/chat?id=ORDERID[&peek=1] -> { messages, unread }   (peek=1 = don't mark as read)
// POST /api/chat  { id, text }       -> send a message to the admin
module.exports = c.route(async (req, res) => {
  const ip = c.clientIp(req);

  if (req.method === 'GET') {
    if ((await c.hit('taxian:rl:chatget:' + ip, 60)) > 120) return c.send(res, 429, { error: 'Slow down.' });
    const id = String(req.query.id || '').toUpperCase();
    const order = await c.getOrder(id);
    if (!order) return c.send(res, 404, { error: 'Order not found.' });
    const peek = req.query.peek === '1';
    const meta = peek ? await c.chatMeta(id) : await c.chatMarkRead(id, 'customer');
    const unread = meta.unreadCust || 0;
    if (peek) return c.send(res, 200, { unread, count: meta.count || 0 });
    return c.send(res, 200, { messages: await c.chatMessages(id), unread: 0, count: meta.count || 0 });
  }

  if (req.method === 'POST') {
    if ((await c.hit('taxian:rl:chatpost:' + ip, 60)) > 12) return c.send(res, 429, { error: 'You are sending messages too fast. Wait a moment.' });
    const b = c.body(req);
    const id = String(b.id || '').toUpperCase();
    const text = c.clean(b.text, c.CHAT_MAX_LEN);
    if (!text) return c.send(res, 400, { error: 'Type a message first.' });
    const order = await c.getOrder(id);
    if (!order) return c.send(res, 404, { error: 'Order not found.' });
    const message = await c.chatPost(id, 'customer', text);
    return c.send(res, 201, { message });
  }

  res.setHeader('Allow', 'GET, POST');
  return c.send(res, 405, { error: 'Method not allowed.' });
});
