import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, normalize } from 'node:path';
import { openDb } from './db.js';
import { createApi } from './api.js';
import { resolvePayMode } from './payment.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const DEFAULT_DB = fileURLToPath(new URL('../data/app.db', import.meta.url));
const MAX_BODY = 16 * 1024;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};
const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
const httpErr = (status, message) => Object.assign(new Error(message), { status });

function sendJson(res, status, data, extra = {}) {
  res.writeHead(status, { ...SEC, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (ch) => {
      size += ch.length;
      if (size > MAX_BODY) { reject(httpErr(413, '请求体过大')); req.pause(); return; }
      chunks.push(ch);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname); } catch { throw httpErr(400, 'Bad Request'); }
  const full = normalize(join(PUBLIC_DIR, rel));
  if (rel.includes('\0') || !full.startsWith(PUBLIC_DIR)) throw httpErr(404, 'Not Found');
  let data;
  try { data = await readFile(full); } catch { throw httpErr(404, 'Not Found'); }
  res.writeHead(200, { ...SEC, 'Content-Type': TYPES[extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : data);
}

export function createServer(opts = {}) {
  const {
    dbPath = process.env.DB_PATH || DEFAULT_DB,
    payMode = resolvePayMode(),
    secureCookie = process.env.COOKIE_SECURE === '1',
    trustProxy = process.env.TRUST_PROXY === '1',
  } = opts;
  const db = openDb(dbPath);
  const api = createApi({ db, payMode, secureCookie });
  const clientIp = (req) => (trustProxy && req.headers['x-real-ip']) || req.socket.remoteAddress || 'unknown';

  async function handleApi(req, res, url) {
    let body;
    if (req.method !== 'GET') {
      const origin = req.headers.origin;
      if (origin) {
        let host;
        try { host = new URL(origin).host; } catch { /* 非法来源 */ }
        if (host !== req.headers.host) throw httpErr(403, '来源不被允许');
      }
      if (!(req.headers['content-type'] || '').startsWith('application/json')) throw httpErr(415, '需要 JSON 请求');
      const text = await readBody(req);
      try { body = text ? JSON.parse(text) : {}; } catch { throw httpErr(400, '请求格式错误'); }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) throw httpErr(400, '请求格式错误');
    }
    const r = await api(req.method, url.pathname, { body, cookieHeader: req.headers.cookie, ip: clientIp(req) });
    sendJson(res, r.status, r.data, r.setCookie ? { 'Set-Cookie': r.setCookie } : {});
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw httpErr(405, 'Method Not Allowed');
      await serveStatic(req, res, url.pathname);
    } catch (e) {
      const status = e.status || (e.code === 'ERR_INVALID_URL' ? 400 : 500);
      if (status === 500) console.error(e);
      const extra = status === 413 ? { Connection: 'close' } : {};
      sendJson(res, status, { error: status === 500 ? '服务器错误' : e.message }, extra);
    }
  });
  server.on('close', () => db.close());
  server.payMode = payMode;
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 4174;
  const host = process.env.HOST || '127.0.0.1';
  const server = createServer();
  server.listen(port, host, () => {
    console.log(`晨昏榜已启动 http://${host}:${port}  支付模式: ${server.payMode}`);
    if (server.payMode === 'mock') console.log('注意: PAY_MODE=mock 为模拟支付，任何登录用户都能免费开通会员，只能用于演示。');
  });
}
