import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = `${root}docs/`;
const tag = '<script src="static/app.js"></script>';

const html = readFileSync(`${root}public/index.html`, 'utf8');
if (!html.includes(tag)) throw new Error('index.html 里找不到 app.js 的 script 标签');

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}static`, { recursive: true });
writeFileSync(`${out}index.html`, html.replace(tag, `<script src="static/demo-api.js"></script>\n${tag}`));
for (const f of ['style.css', 'app.js']) cpSync(`${root}public/static/${f}`, `${out}static/${f}`);
cpSync(`${root}demo/demo-api.js`, `${out}static/demo-api.js`);
cpSync(`${root}data/content.json`, `${out}static/content.json`);
writeFileSync(`${out}.nojekyll`, '');
console.log('已生成 docs/');
