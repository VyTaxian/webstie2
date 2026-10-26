const c = require('../../lib/core');

module.exports = c.route(async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return c.send(res, 405, { error: 'Method not allowed.' }); }
  if (!(await c.isAdmin(req))) return c.send(res, 401, { error: 'Unauthorised.' });
  return c.send(res, 200, { ok: true });
});
