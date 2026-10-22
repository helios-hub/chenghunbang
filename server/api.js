import { randomUUID } from 'node:crypto';
import {
  hashPassword, verifyPassword, createSession, userFromToken,
  destroySession, readCookie, makeLimiter, SESSION_MS,
} from './auth.js';
import { PLANS, SHOP_IDS, RANK_IDS, contentFor } from './content.js';
import { startPayment } from './payment.js';

const PHONE_RE = /^1[3-9]\d{9}$/;
const PWD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,20}$/;
const DAY = 86400000;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

export function createApi({ db, payMode, secureCookie = false }) {
  const limit = makeLimiter();
  let dummyHash;
  const isMember = (u) => !!u && u.member_until > Date.now();
  const publicUser = (u) => ({ id: u.id, phone: u.phone, nick: u.nick, memberUntil: u.member_until });
  const userById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const need = (c) => c.user ?? (() => { throw bad('请先登录', 401); })();

  const favsOf = (u) => {
    const rows = db.prepare('SELECT kind, ref_id FROM favorites WHERE user_id = ?').all(u.id);
    return {
      shops: rows.filter((r) => r.kind === 'shop').map((r) => r.ref_id),
      ranks: rows.filter((r) => r.kind === 'rank').map((r) => r.ref_id),
    };
  };
  const session = (u) => ({ user: publicUser(u), favorites: favsOf(u) });
  const cookieFor = (token) => {
    const attrs = `Path=/; HttpOnly; SameSite=Lax${secureCookie ? '; Secure' : ''}`;
    return token === null ? `sid=; ${attrs}; Max-Age=0` : `sid=${token}; ${attrs}; Max-Age=${SESSION_MS / 1000}`;
  };

  function settleOrder(orderId, userId) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const o = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId);
      if (!o) throw bad('订单不存在', 404);
      if (o.status !== 'paid') {
        const now = Date.now();
        const base = Math.max(userById(userId).member_until, now);
        db.prepare('UPDATE users SET member_until = ? WHERE id = ?').run(base + o.days * DAY, userId);
        db.prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?").run(now, orderId);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  const routes = {
    'GET /api/content': (c) => ({ data: { ...contentFor(isMember(c.user)), payMode } }),

    'GET /api/me': (c) => ({ data: c.user ? session(c.user) : { user: null } }),

    'POST /api/register': async (c) => {
      if (!limit(`reg:${c.ip}`, 10, 3600000)) throw bad('操作太频繁，请稍后再试', 429);
      const { phone, password, agree } = c.body;
      if (typeof phone !== 'string' || !PHONE_RE.test(phone)) throw bad('请输入 11 位中国大陆手机号');
      if (typeof password !== 'string' || !PWD_RE.test(password)) throw bad('密码需要 8-20 位，同时包含字母和数字');
      if (agree !== true) throw bad('请先同意协议，并确认已满 18 周岁');
      const pwdHash = await hashPassword(password);
      let id;
      try {
        id = Number(db.prepare('INSERT INTO users(phone, pwd_hash, nick, member_until, created_at) VALUES(?,?,?,0,?)')
          .run(phone, pwdHash, `晨昏榜用户 ${phone.slice(-4)}`, Date.now()).lastInsertRowid);
      } catch (e) {
        if (/UNIQUE/.test(String(e.message))) throw bad('该手机号已注册，请直接登录', 409);
        throw e;
      }
      return { status: 201, data: session(userById(id)), cookie: createSession(db, id) };
    },

    'POST /api/login': async (c) => {
      const { phone, password } = c.body;
      if (typeof phone !== 'string' || typeof password !== 'string' || password.length > 64) throw bad('手机号或密码错误', 401);
      if (!limit(`login:ip:${c.ip}`, 30, 600000) || !limit(`login:ph:${phone}`, 10, 600000)) {
        throw bad('尝试次数过多，请 10 分钟后再试', 429);
      }
      const u = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
      dummyHash ??= await hashPassword('timing-guard-1');
      const ok = await verifyPassword(password, u ? u.pwd_hash : dummyHash);
      if (!u || !ok) throw bad('手机号或密码错误', 401);
      return { data: session(u), cookie: createSession(db, u.id) };
    },

    'POST /api/logout': (c) => {
      destroySession(db, c.token);
      return { data: { ok: true }, cookie: null };
    },

    'POST /api/favorites': (c) => {
      const u = need(c);
      const { kind, id } = c.body;
      const exists = (kind === 'shop' && SHOP_IDS.has(id)) || (kind === 'rank' && RANK_IDS.has(id));
      if (!exists) throw bad('收藏对象不存在', 404);
      const has = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND kind = ? AND ref_id = ?').get(u.id, kind, id);
      db.prepare(has
        ? 'DELETE FROM favorites WHERE user_id = ? AND kind = ? AND ref_id = ?'
        : 'INSERT INTO favorites(user_id, kind, ref_id) VALUES(?,?,?)').run(u.id, kind, id);
      return { data: { favorites: favsOf(u) } };
    },

    'POST /api/orders': (c) => {
      const u = need(c);
      if (!limit(`ord:${u.id}`, 20, 3600000)) throw bad('操作太频繁，请稍后再试', 429);
      const plan = PLANS.find((p) => p.id === c.body.planId);
      if (!plan) throw bad('套餐不存在', 404);
      const order = { id: randomUUID(), planId: plan.id, days: plan.days, amountCents: plan.price * 100 };
      const payment = startPayment(payMode, order);
      db.prepare("INSERT INTO orders(id, user_id, plan_id, days, amount_cents, status, created_at) VALUES(?,?,?,?,?,'pending',?)")
        .run(order.id, u.id, plan.id, plan.days, order.amountCents, Date.now());
      return { status: 201, data: { order: { id: order.id, amountCents: order.amountCents }, payment } };
    },

    'POST /api/orders/pay-mock': (c) => {
      const u = need(c);
      if (payMode !== 'mock') throw bad('接口不存在', 404);
      if (typeof c.body.orderId !== 'string') throw bad('订单不存在', 404);
      settleOrder(c.body.orderId, u.id);
      return { data: session(userById(u.id)) };
    },
  };

  return async function api(method, pathname, { body, cookieHeader, ip }) {
    const route = routes[`${method} ${pathname}`];
    if (!route) return { status: 404, data: { error: '接口不存在' } };
    const token = readCookie(cookieHeader, 'sid');
    const c = { body: body ?? {}, ip, token, user: userFromToken(db, token) };
    try {
      const r = await route(c);
      const out = { status: r.status ?? 200, data: r.data };
      if ('cookie' in r) out.setCookie = cookieFor(r.cookie);
      return out;
    } catch (e) {
      if (e?.status) return { status: e.status, data: { error: e.message } };
      console.error(e);
      return { status: 500, data: { error: '服务器错误' } };
    }
  };
}
