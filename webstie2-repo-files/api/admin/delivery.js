const c = require('../../lib/core');

// POST   /api/admin/delivery            -> attach a GitHub/link or an uploaded file to an order
// DELETE /api/admin/delivery?id=ORDERID -> remove it
module.exports = c.route(async (req, res) => {
  if (!(await c.isAdmin(req))) return c.send(res, 401, { error: 'Unauthorised.' });

  if (req.method === 'POST') {
    const b = c.body(req);
    const id = String(b.id || '').toUpperCase();
    const order = await c.getOrder(id);
    if (!order) return c.send(res, 404, { error: 'Order not found.' });
    const now = new Date().toISOString();

    if (b.type === 'link') {
      const url = c.clean(b.url, 500);
      if (!/^https?:\/\/[^\s]+$/i.test(url)) return c.send(res, 400, { error: 'Enter a full link starting with https://' });
      const label = c.clean(b.label, 80) || (/github\.com/i.test(url) ? 'GitHub repository' : 'Download your product');
      await c.deleteFile(id);
      order.delivery = { type: 'link', url, label, added: now };
    } else if (b.type === 'file') {
      const data = String(b.data || '').replace(/\s/g, '');
      if (!data || !/^[A-Za-z0-9+/]+=*$/.test(data) || data.length > 700000) return c.send(res, 400, { error: 'File is missing or too large (max 500 KB). Use a link for bigger files.' });
      const buf = Buffer.from(data, 'base64');
      if (buf.length > c.MAX_FILE_BYTES) return c.send(res, 400, { error: 'File is over 500 KB. Use a link for bigger files.' });
      const filename = c.safeFilename(b.filename);
      await c.saveFile(id, data);
      order.delivery = { type: 'file', filename, size: buf.length, label: filename, added: now };
    } else {
      return c.send(res, 400, { error: 'Bad delivery type.' });
    }
    await c.saveOrder(order);
    return c.send(res, 200, { order });
  }

  if (req.method === 'DELETE') {
    const id = String(req.query.id || '').toUpperCase();
    const order = await c.getOrder(id);
    if (!order) return c.send(res, 404, { error: 'Order not found.' });
    delete order.delivery;
    await c.deleteFile(id);
    await c.saveOrder(order);
    return c.send(res, 200, { order });
  }

  res.setHeader('Allow', 'POST, DELETE');
  return c.send(res, 405, { error: 'Method not allowed.' });
});
