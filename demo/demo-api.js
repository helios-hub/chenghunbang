(() => {
  const KEY = 'chenhun_demo_v1';
  const DAY = 864e5;
  const PHONE_RE = /^1[3-9]\d{9}$/;
  const PWD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,20}$/;
  const fail = (message, status = 400) => Object.assign(new Error(message), { status });
  const blank = () => ({ users: {}, current: null, orders: {} });
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || blank(); } catch { return blank(); } };
  const save = (d) => localStorage.setItem(KEY, JSON.stringify(d));

  async function digest(text) {
    if (!globalThis.crypto?.subtle) return `plain:${text}`;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`chenhun-demo:${text}`));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  let contentPromise;
  const raw = () => (contentPromise ??= fetch('static/content.json').then((r) => {
    if (!r.ok) throw fail('内容加载失败', 500);
    return r.json();
  }));

  const memberOf = (u) => !!u && u.memberUntil > Date.now();
  const sessionOf = (d) => {
    const u = d.current && d.users[d.current];
    if (!u) return { user: null };
    return {
      user: { phone: d.current, nick: u.nick, memberUntil: u.memberUntil },
      favorites: u.favs,
    };
  };
  const need = (d) => {
    if (!d.current || !d.users[d.current]) throw fail('请先登录', 401);
    return d.users[d.current];
  };

  async function contentFor(d) {
    const c = await raw();
    const member = memberOf(d.current && d.users[d.current]);
    const count = {};
    for (const r of c.RANKINGS) if (r.access === 'member') for (const [id] of r.items) count[id] = (count[id] || 0) + 1;
    return {
      scenes: c.SCENES,
      plans: c.PLANS,
      payMode: 'mock',
      shops: c.SHOPS.map((s) => ({ ...s, memberRankCount: count[s.id] || 0 })),
      rankings: c.RANKINGS.map((r) =>
        r.access === 'member' && !member ? { ...r, items: r.items.map((it, i) => (i === 0 ? it : null)) } : r),
    };
  }

  const routes = {
    'GET /api/me': (d) => sessionOf(d),
    'GET /api/content': (d) => contentFor(d),
    'POST /api/register': async (d, b) => {
      if (!PHONE_RE.test(b.phone || '')) throw fail('请输入 11 位中国大陆手机号');
      if (!PWD_RE.test(b.password || '')) throw fail('密码需要 8-20 位，同时包含字母和数字');
      if (b.agree !== true) throw fail('请先同意协议，并确认已满 18 周岁');
      if (d.users[b.phone]) throw fail('该手机号已注册，请直接登录', 409);
      d.users[b.phone] = {
        pwd: await digest(b.password), nick: `晨昏榜用户 ${b.phone.slice(-4)}`,
        memberUntil: 0, favs: { shops: [], ranks: [] },
      };
      d.current = b.phone;
      save(d);
      return sessionOf(d);
    },
    'POST /api/login': async (d, b) => {
      const u = d.users[b.phone];
      if (!u || u.pwd !== (await digest(String(b.password || '')))) throw fail('手机号或密码错误', 401);
      d.current = b.phone;
      save(d);
      return sessionOf(d);
    },
    'POST /api/logout': (d) => { d.current = null; save(d); return { ok: true }; },
    'POST /api/favorites': async (d, b) => {
      const u = need(d);
      const c = await raw();
      const list = b.kind === 'shop' ? u.favs.shops : b.kind === 'rank' ? u.favs.ranks : null;
      const known = b.kind === 'shop' ? c.SHOPS : c.RANKINGS;
      if (!list || !known.some((x) => x.id === b.id)) throw fail('收藏对象不存在', 404);
      const i = list.indexOf(b.id);
      if (i >= 0) list.splice(i, 1); else list.push(b.id);
      save(d);
      return { favorites: u.favs };
    },
    'POST /api/orders': async (d, b) => {
      need(d);
      const plan = (await raw()).PLANS.find((p) => p.id === b.planId);
      if (!plan) throw fail('套餐不存在', 404);
      const id = `o${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
      d.orders[id] = { user: d.current, days: plan.days, paid: false };
      save(d);
      return { order: { id, amountCents: plan.price * 100 }, payment: { mode: 'mock', orderId: id } };
    },
    'POST /api/orders/pay-mock': (d, b) => {
      const u = need(d);
      const o = d.orders[b.orderId];
      if (!o || o.user !== d.current) throw fail('订单不存在', 404);
      if (!o.paid) {
        u.memberUntil = Math.max(u.memberUntil, Date.now()) + o.days * DAY;
        o.paid = true;
        save(d);
      }
      return sessionOf(d);
    },
  };

  window.__DEMO_API__ = async (method, path, body = {}) => {
    const route = routes[`${method} ${path}`];
    if (!route) throw fail('接口不存在', 404);
    return route(load(), body);
  };

  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.textContent = '演示版：账号和会员数据只保存在你自己的浏览器里，请勿填写真实手机号和常用密码。支付为模拟。';
    bar.style.cssText = 'background:#FBF1DD;color:#7A5A16;font-size:13px;text-align:center;padding:8px 12px';
    document.body.prepend(bar);
  });
})();
