import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { duplexPair } from 'node:stream';
import { createServer } from '../server/index.js';

function boot(opts = {}) {
  const server = createServer({ dbPath: ':memory:', payMode: 'mock', ...opts });
  const request = (method, path, { headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const [clientSide, serverSide] = duplexPair();
    server.emit('connection', serverSide);
    const req = http.request({ method, path, createConnection: () => clientSide,
      headers: { host: 'test.local', ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let json = null;
        try { json = JSON.parse(text); } catch { /* 非 JSON 响应 */ }
        resolve({ status: res.statusCode, headers: res.headers, json, text });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
  return { request, close: () => server.close() };
}

function client(request) {
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const h = { ...(cookie ? { cookie } : {}), ...headers };
    if (body !== undefined) h['content-type'] = h['content-type'] || 'application/json';
    const r = await request(method, path, { headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers['set-cookie']?.[0];
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    return r;
  };
  return { get: (p) => call('GET', p), post: (p, b = {}, h) => call('POST', p, b, h) };
}

const reg = (c, phone = '13900139000') => c.post('/api/register', { phone, password: 'abc12345', agree: true });

test('匿名用户拿到的会员榜单只含第 1 名，其余位置为空且文案不外泄', async () => {
  const { request, close } = boot();
  const r = await client(request).get('/api/content');
  const members = r.json.rankings.filter((x) => x.access === 'member');
  assert.ok(members.length >= 4);
  for (const m of members) assert.ok(m.items[0] !== null && m.items.slice(1).every((x) => x === null), m.id);
  assert.ok(!r.text.includes('屋顶视野最开阔'));
  assert.ok(r.json.rankings.filter((x) => x.access === 'free').every((x) => x.items.every((i) => i !== null)));
  close();
});

test('注册、会话、登出、重复注册、错误密码', async () => {
  const { request, close } = boot();
  const c = client(request);
  assert.equal((await c.post('/api/register', { phone: '123', password: 'abc12345', agree: true })).status, 400);
  assert.equal((await c.post('/api/register', { phone: '13900139000', password: 'abcdefgh', agree: true })).status, 400);
  assert.equal((await c.post('/api/register', { phone: '13900139000', password: 'abc12345', agree: false })).status, 400);
  const r = await reg(c);
  assert.equal(r.status, 201);
  assert.match(r.headers['set-cookie'][0], /HttpOnly/);
  assert.equal((await c.get('/api/me')).json.user.phone, '13900139000');
  assert.equal((await reg(client(request))).status, 409);
  await c.post('/api/logout');
  assert.equal((await c.get('/api/me')).json.user, null);
  const wrong = await c.post('/api/login', { phone: '13900139000', password: 'wrong1234' });
  const unknown = await c.post('/api/login', { phone: '13700000000', password: 'wrong1234' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.json.error, unknown.json.error);
  assert.equal((await c.post('/api/login', { phone: '13900139000', password: 'abc12345' })).status, 200);
  close();
});

test('开通会员：解锁完整榜单，重复确认同一订单不会重复加时长', async () => {
  const { request, close } = boot();
  const c = client(request);
  assert.equal((await c.post('/api/orders', { planId: 'q' })).status, 401);
  await reg(c);
  const o = await c.post('/api/orders', { planId: 'q', amountCents: 1 });
  assert.equal(o.json.order.amountCents, 3000);
  const a = await c.post('/api/orders/pay-mock', { orderId: o.json.order.id });
  const b = await c.post('/api/orders/pay-mock', { orderId: o.json.order.id });
  assert.equal(a.json.user.memberUntil, b.json.user.memberUntil);
  assert.ok(Math.abs(a.json.user.memberUntil - Date.now() - 90 * 86400000) < 5000);
  const full = (await c.get('/api/content')).json.rankings.find((x) => x.id === 'river-cheap');
  assert.ok(full.items.every((x) => x !== null));
  close();
});

test('不能支付别人的订单，也不能买不存在的套餐', async () => {
  const { request, close } = boot();
  const a = client(request), b = client(request);
  await reg(a, '13900139001');
  await reg(b, '13900139002');
  const o = await a.post('/api/orders', { planId: 'm' });
  assert.equal((await b.post('/api/orders/pay-mock', { orderId: o.json.order.id })).status, 404);
  assert.equal((await a.post('/api/orders', { planId: 'zzz' })).status, 404);
  close();
});

test('生产默认关闭支付：不能下单，也没有模拟支付接口', async () => {
  const { request, close } = boot({ payMode: 'off' });
  const c = client(request);
  await reg(c);
  assert.equal((await c.post('/api/orders', { planId: 'm' })).status, 501);
  assert.equal((await c.post('/api/orders/pay-mock', { orderId: 'x' })).status, 404);
  close();
});

test('跨站来源和非 JSON 请求被拒绝', async () => {
  const { request, close } = boot();
  const c = client(request);
  assert.equal((await c.post('/api/register', { phone: '13900139000', password: 'abc12345', agree: true }, { origin: 'http://evil.example' })).status, 403);
  const r = await request('POST', '/api/login', { headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(r.status, 415);
  close();
});

test('静态服务只暴露 public，目录穿越读不到源码和数据库', async () => {
  const { request, close } = boot();
  assert.equal((await request('GET', '/')).status, 200);
  assert.equal((await request('GET', '/static/app.js')).status, 200);
  for (const p of ['/server/index.js', '/data/content.json', '/%2e%2e/server/index.js', '/..%2fdata/app.db', '/static/%00']) {
    assert.notEqual((await request('GET', p)).status, 200, p);
  }
  close();
});
