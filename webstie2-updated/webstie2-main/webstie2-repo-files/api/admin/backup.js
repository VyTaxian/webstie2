const c = require('../../lib/core');

// GET  /api/admin/backup -> everything (orders, chats, uploaded files) as one JSON document
// POST /api/admin/backup -> restore from such a document (merges into what is already stored)
module.exports = c.route(async (req, res) => {
  if (!(await c.isAdmin(req))) return c.send(res, 401, { error: 'Unauthorised.' });

  if (req.method === 'GET') return c.send(res, 200, await c.exportAll());

  if (req.method === 'POST') {
    try { const restored = await c.importAll(c.body(req)); return c.send(res, 200, { ok: true, restored }); }
    catch (err) { return c.send(res, 400, { error: err.message }); }
  }

  res.setHeader('Allow', 'GET, POST');
  return c.send(res, 405, { error: 'Method not allowed.' });
});
