const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const XLSX = require('xlsx');

const app = express();

// Railway sits behind a reverse proxy. Trust one proxy hop so rate limiting
// can safely read the forwarded client address without validation warnings.
app.set('trust proxy', 1);

const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const RAW_CACHE_FILE = path.join(DATA_DIR, 'raw-cache.json');
const RUNTIME_FILE = path.join(DATA_DIR, 'runtime.json');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-this-secret';
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || 'false').toLowerCase() === 'true';
const MAX_UPLOAD_MB = Math.max(10, Math.min(500, Number(process.env.MAX_UPLOAD_MB || 250)));
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

if (NODE_ENV === 'production' && JWT_SECRET === 'dev-only-change-this-secret') {
  console.error('ERROR: JWT_SECRET must be set in production.');
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DEFAULT_CONFIG = {
  channels: [
    { name: 'HALODOC', rawName: 'HALODOC', active: true, telemed: true, sort: 1 },
    { name: 'GRABMART', rawName: 'GRABMART', active: true, telemed: true, sort: 2 },
    { name: 'GOOD DOCTOR', rawName: 'GOOD DOCTOR', active: true, telemed: true, sort: 3 },
    { name: 'SHOPEE', rawName: 'SHOPEE', active: true, telemed: true, sort: 4 },
    { name: 'LAZADA', rawName: 'LAZADA', active: true, telemed: true, sort: 5 },
    { name: 'WEBSITE', rawName: 'WEBSITE', active: true, telemed: true, sort: 6 },
    { name: 'WHATSAPP', rawName: 'WHATSAPP', active: true, telemed: true, sort: 7 },
    { name: 'OFFLINE SALES', rawName: 'OFFLINE SALES', active: true, telemed: false, sort: 8 }
  ],
  stores: [
    { name: 'BINTARO', rawName: 'Apotek Wellings Bintaro', pt: 'EFIT', active: true },
    { name: 'CIRENDEU', rawName: 'Apotek Wellings Cirendeu', pt: 'ESB', active: true },
    { name: 'CITRA GARDEN', rawName: 'Apotek Wellings Citra Garden', pt: 'EFM', active: true },
    { name: 'CONDET RAYA', rawName: 'Apotek Wellings Condet Raya', pt: 'ESB', active: true },
    { name: 'DAAN MOGOT', rawName: 'Apotek Wellings Daan Mogot Baru', pt: 'EFIT', active: true },
    { name: 'DUTA MAS', rawName: 'Apotek Wellings Duta Mas', pt: 'EFM', active: true },
    { name: 'GREEN LAKE', rawName: 'Apotek Wellings Green Lake', pt: 'EFM', active: true },
    { name: 'GREENVILLE', rawName: 'Apotek Wellings Greenville', pt: 'EFM', active: true },
    { name: 'HARAPAN INDAH', rawName: 'Apotek Wellings Harapan Indah', pt: 'ESB', active: true },
    { name: 'JELAMBAR BARU', rawName: 'Apotek Wellings Jelambar Baru', pt: 'EFM', active: true },
    { name: 'KELAPA GADING', rawName: 'Apotek Wellings Kelapa Gading', pt: 'EFM', active: true },
    { name: 'MERUYA UTARA', rawName: 'Apotek Wellings Meruya Utara', pt: 'EFIT', active: true },
    { name: 'PADEMANGAN', rawName: 'Apotek Wellings Pademangan', pt: 'EFM', active: true },
    { name: 'PURI PARKVIEW', rawName: 'Apotek Wellings Puri Parkview', pt: 'EFIT', active: true },
    { name: 'PIK', rawName: 'Apotek Wellings PIK', pt: 'EFM', active: true },
    { name: 'PIK2', rawName: 'Apotek Wellings PIK 2', pt: 'EFIT', active: true },
    { name: 'RAYA TENGAH', rawName: 'Apotek Wellings Raya Tengah', pt: 'ESB', active: true },
    { name: 'REMPOA', rawName: 'Apotek Wellings Rempoa', pt: 'EFIT', active: true },
    { name: 'SUNTER', rawName: 'Apotek Wellings Sunter', pt: 'EFM', active: true },
    { name: 'TEBET', rawName: 'Apotek Wellings Tebet', pt: 'EFM', active: true },
    { name: 'TELUK GONG', rawName: 'Apotek Wellings Teluk Gong', pt: 'EFM', active: true },
    { name: 'VETERAN', rawName: 'Apotek Wellings Veteran', pt: 'ESB', active: true },
    { name: 'VETERAN', rawName: 'SLOC Shopee Veteran', pt: 'ESB', active: true },
    { name: 'PIK', rawName: 'SLOC Shopee PIK', pt: 'EFM', active: true }
  ],
  categoryMap: {
    'VOUCHER PARTNERSHIP': 'OTHER',
    'OTHER MARKETING': 'OTHER'
  },
  targets: {
    '2026-09': {
      'HALODOC': 651066376,
      'GRABMART': 145734722,
      'GOOD DOCTOR': 152118341,
      'SHOPEE': 820466719,
      'LAZADA': 151200000,
      'WEBSITE': 9000000,
      'WHATSAPP': 0,
      'OFFLINE SALES': 6665057948
    }
  },
  rankingDefault: 10
};

let config = null;
let rawRows = [];
let runtime = { updatedAt: null, sourceFile: null, rowCount: 0 };

async function readJson(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); }
  catch { return fallback; }
}

async function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(value, null, 2));
  await fsp.rename(tmp, file);
}

async function bootstrap() {
  config = await readJson(CONFIG_FILE, null);
  if (!config) {
    config = DEFAULT_CONFIG;
    await writeJsonAtomic(CONFIG_FILE, config);
  }

  const cached = await readJson(RAW_CACHE_FILE, []);
  rawRows = Array.isArray(cached) ? cached : [];
  runtime = await readJson(RUNTIME_FILE, runtime);

  let users = await readJson(USERS_FILE, null);
  if (!users) {
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
    if (!adminPassword) {
      console.error('INITIAL_ADMIN_PASSWORD is required on first run.');
      process.exit(1);
    }
    users = [{
      id: crypto.randomUUID(),
      username: String(process.env.INITIAL_ADMIN_USERNAME || 'admin').toLowerCase(),
      displayName: process.env.INITIAL_ADMIN_NAME || 'Administrator',
      role: 'admin',
      active: true,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      createdAt: new Date().toISOString()
    }];
    if (process.env.INITIAL_GUEST_USERNAME && process.env.INITIAL_GUEST_PASSWORD) {
      users.push({
        id: crypto.randomUUID(),
        username: String(process.env.INITIAL_GUEST_USERNAME).toLowerCase(),
        displayName: process.env.INITIAL_GUEST_NAME || 'Guest Viewer',
        role: 'guest',
        active: true,
        passwordHash: await bcrypt.hash(process.env.INITIAL_GUEST_PASSWORD, 12),
        createdAt: new Date().toISOString()
      });
    }
    await writeJsonAtomic(USERS_FILE, users);
  }
}

function signUser(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role, displayName: user.displayName }, JWT_SECRET, { expiresIn: '12h' });
}

function readAuth(req) {
  const token = req.cookies.auth;
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

async function resolveActiveUser(auth) {
  if (!auth || !auth.sub) return null;
  const users = await readJson(USERS_FILE, []);
  return users.find(u => u.id === auth.sub && u.active) || null;
}

async function requireAuth(req, res, next) {
  const auth = readAuth(req);
  const user = await resolveActiveUser(auth);
  if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
  req.user = { sub:user.id, username:user.username, role:user.role, displayName:user.displayName };
  next();
}

async function requireAdmin(req, res, next) {
  const auth = readAuth(req);
  const user = await resolveActiveUser(auth);
  if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN' });
  req.user = { sub:user.id, username:user.username, role:user.role, displayName:user.displayName };
  next();
}

function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function daysInclusive(a, b) {
  const d1 = new Date(`${a}T00:00:00Z`), d2 = new Date(`${b}T00:00:00Z`);
  return Math.floor((d2 - d1) / 86400000) + 1;
}
function daysInMonth(iso) {
  const [y,m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function monthKey(iso) { return String(iso).slice(0, 7); }
function pct(a,b) { return b ? a / b : null; }
function diffPct(a,b) { return b ? (a-b)/b : null; }
function safeNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function excelDateToISO(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${String(d.y).padStart(4,'0')}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
}

function canonicalChannel(rawName) {
  const raw = String(rawName || '').trim().toUpperCase();
  const exact = config.channels.find(c => c.active && String(c.rawName || c.name).trim().toUpperCase() === raw);
  return exact ? exact.name : raw;
}

function canonicalStore(rawName) {
  const exact = config.stores.find(s => s.active && String(s.rawName).trim().toLowerCase() === String(rawName || '').trim().toLowerCase());
  if (exact) return { name: exact.name, pt: exact.pt };
  let name = String(rawName || '').replace(/^Apotek Wellings\s+/i, '').replace(/^SLOC Shopee\s+/i, '').trim().toUpperCase();
  const byName = config.stores.find(s => s.active && s.name.toUpperCase() === name);
  return { name: byName ? byName.name : name, pt: byName ? byName.pt : 'UNMAPPED' };
}

function mapCategory(raw) {
  const key = String(raw || '').trim().toUpperCase();
  return config.categoryMap[key] || key || 'OTHER';
}

function activeChannels() {
  return config.channels.filter(c => c.active).sort((a,b) => (a.sort || 999) - (b.sort || 999));
}

function normalizeRow(r) {
  const rawStore = String(r.store_location || '').trim();
  const rawChannel = String(r.TELEMED || r.telemed || r.channel_dashboard || '').trim().toUpperCase();
  const store = canonicalStore(rawStore);
  return {
    date: excelDateToISO(r.transaction_date || r.DATE),
    invoice: String(r.invoice_no || '').trim(),
    rawStore,
    rawChannel,
    store: store.name,
    pt: store.pt,
    channel: canonicalChannel(rawChannel),
    sku: String(r.old_item_code || r.new_item_code || '').trim(),
    newItemCode: String(r.new_item_code || '').trim(),
    itemName: String(r.item_name || '').trim(),
    brand: String(r.brand || '').trim() || 'UNBRANDED',
    category: mapCategory(r.category_2),
    salesType: String(r.trader_check || '').trim() || 'Regular',
    sales: safeNum(r.sub_total),
    qty: safeNum(r.qty)
  };
}

function normalizePeriods(periods) {
  if (!Array.isArray(periods) || periods.length < 1 || periods.length > 3) throw new Error('PERIODS_INVALID');
  return periods.map(p => {
    if (!validDate(p.start) || !validDate(p.end) || p.start > p.end) throw new Error('PERIOD_INVALID');
    return { start: p.start, end: p.end };
  });
}

function rowInPeriod(r,p) { return r.date && r.date >= p.start && r.date <= p.end; }
function arr(v) { return Array.isArray(v) ? v.map(String) : []; }

function redecorateRow(r) {
  const rawStore = r.rawStore || r.store;
  const rawChannel = r.rawChannel || r.channel;
  const store = canonicalStore(rawStore);
  return { ...r, rawStore, rawChannel, store: store.name, pt: store.pt, channel: canonicalChannel(rawChannel) };
}

async function redecorateAllRows() {
  rawRows = rawRows.map(redecorateRow);
  if (rawRows.length) await writeJsonAtomic(RAW_CACHE_FILE, rawRows);
}

function filterBase(filters = {}) {
  const stores = arr(filters.stores).map(x => x.toUpperCase());
  const pts = arr(filters.pts).map(x => x.toUpperCase());
  const categories = arr(filters.categories).map(x => x.toUpperCase());
  const brands = arr(filters.brands).map(x => x.toUpperCase());
  const salesTypes = arr(filters.salesTypes).map(x => x.toUpperCase());
  const channels = arr(filters.channels).map(x => x.toUpperCase());
  const product = String(filters.product || '').trim().toUpperCase();
  return rawRows.filter(r => {
    if (stores.length && !stores.includes(String(r.store).toUpperCase())) return false;
    if (pts.length && !pts.includes(String(r.pt).toUpperCase())) return false;
    if (categories.length && !categories.includes(String(r.category).toUpperCase())) return false;
    if (brands.length && !brands.includes(String(r.brand).toUpperCase())) return false;
    if (salesTypes.length && !salesTypes.includes(String(r.salesType).toUpperCase())) return false;
    if (channels.length && !channels.includes(String(r.channel).toUpperCase())) return false;
    if (product && !(`${r.sku} ${r.newItemCode} ${r.itemName}`.toUpperCase().includes(product))) return false;
    return true;
  });
}

function metrics(rows) {
  let sales = 0;
  const invoices = new Set();
  for (const r of rows) { sales += r.sales; if (r.invoice) invoices.add(r.invoice); }
  const trx = invoices.size;
  return { sales, trx, basket: trx ? sales / trx : 0 };
}

function metricsByPeriod(rows, periods) {
  return periods.map(p => metrics(rows.filter(r => rowInPeriod(r,p))));
}

function channelQuery(periods, filters) {
  const base = filterBase(filters);
  const channels = activeChannels();
  const rows = channels.map(c => {
    const subset = base.filter(r => r.channel === c.name);
    const m = metricsByPeriod(subset, periods);
    const p1 = m[1] || null, p2 = m[2] || null, cur = m[0];
    return {
      channel: c.name,
      periods: m,
      growthP1: p1 ? { sales: diffPct(cur.sales,p1.sales), trx: diffPct(cur.trx,p1.trx), basket: diffPct(cur.basket,p1.basket) } : null,
      growthP2: p2 ? { sales: diffPct(cur.sales,p2.sales), trx: diffPct(cur.trx,p2.trx), basket: diffPct(cur.basket,p2.basket) } : null
    };
  });
  const total = metricsByPeriod(base, periods);
  const telemedNames = new Set(channels.filter(c => c.telemed).map(c => c.name));
  const telemedRows = base.filter(r => telemedNames.has(r.channel));
  const telemed = metricsByPeriod(telemedRows, periods);
  const telemedPct = telemed.map((m,i) => ({ sales: pct(m.sales,total[i].sales), trx: pct(m.trx,total[i].trx), basket: pct(m.basket,total[i].basket) }));
  const variance = periods.map((_,i) => {
    if (i === periods.length - 1) return null;
    return {
      sales: telemed[i].sales - telemed[i+1].sales,
      trx: telemed[i].trx - telemed[i+1].trx,
      basket: telemed[i].basket - telemed[i+1].basket,
      salesPct: diffPct(telemed[i].sales,telemed[i+1].sales),
      trxPct: diffPct(telemed[i].trx,telemed[i+1].trx),
      basketPct: diffPct(telemed[i].basket,telemed[i+1].basket)
    };
  });
  return { rows, total, telemed, telemedPct, variance };
}

function targetQuery(period, filters) {
  const base = filterBase(filters).filter(r => rowInPeriod(r,period));
  const key = monthKey(period.end);
  const targetMap = config.targets[key] || {};
  const factor = daysInclusive(period.start, period.end) / daysInMonth(period.end);
  const channels = activeChannels();
  const rows = channels.map(c => {
    const actual = metrics(base.filter(r => r.channel === c.name));
    const target = safeNum(targetMap[c.name]);
    const mtdTarget = target * factor;
    const bestEst = factor > 0 ? actual.sales / factor : 0;
    return {
      channel: c.name,
      actual,
      target,
      mtdTarget,
      achieve: pct(actual.sales,target),
      achieveMtd: pct(actual.sales,mtdTarget),
      bestEst
    };
  });
  const totalActual = metrics(base);
  const totalTarget = rows.reduce((a,x)=>a+x.target,0);
  const totalMtdTarget = rows.reduce((a,x)=>a+x.mtdTarget,0);
  const totalBestEst = rows.reduce((a,x)=>a+x.bestEst,0);
  const teleNames = new Set(channels.filter(c=>c.telemed).map(c=>c.name));
  const teleRows = rows.filter(x=>teleNames.has(x.channel));
  const teleActual = teleRows.reduce((a,x)=>a+x.actual.sales,0);
  const teleTarget = teleRows.reduce((a,x)=>a+x.target,0);
  const teleMtdTarget = teleRows.reduce((a,x)=>a+x.mtdTarget,0);
  const teleBestEst = teleRows.reduce((a,x)=>a+x.bestEst,0);
  return {
    month: key, factor, rows,
    total: { actual: totalActual.sales, target: totalTarget, mtdTarget: totalMtdTarget, achieve: pct(totalActual.sales,totalTarget), achieveMtd: pct(totalActual.sales,totalMtdTarget), bestEst: totalBestEst },
    telemed: { actual: teleActual, target: teleTarget, mtdTarget: teleMtdTarget, bestEst: teleBestEst, pctActual: pct(teleActual,totalActual.sales), pctTarget: pct(teleTarget,totalTarget), pctBestEst: pct(teleBestEst,totalBestEst), varianceTarget: teleActual-teleTarget, varianceMtd: teleActual-teleMtdTarget, achieveTarget: pct(teleActual,teleTarget), achieveMtd: pct(teleActual,teleMtdTarget) }
  };
}

function storeQuery(periods, filters) {
  const base = filterBase(filters);
  const active = config.stores.filter(s=>s.active);
  const unique = new Map();
  for (const s of active) if (!unique.has(s.name)) unique.set(s.name, { name:s.name, pt:s.pt });
  let stores = [...unique.values()];
  const pts = arr(filters.pts).map(x=>x.toUpperCase());
  const names = arr(filters.stores).map(x=>x.toUpperCase());
  if (pts.length) stores = stores.filter(s=>pts.includes(s.pt.toUpperCase()));
  if (names.length) stores = stores.filter(s=>names.includes(s.name.toUpperCase()));
  const rows = stores.map(s=>({ store:s.name, pt:s.pt, periods:metricsByPeriod(base.filter(r=>r.store===s.name),periods) }));
  const total = metricsByPeriod(base.filter(r=>stores.some(s=>s.name===r.store)),periods);
  const variance = periods.map((_,i)=> i===periods.length-1 ? null : ({
    sales: total[i].sales-total[i+1].sales,
    trx: total[i].trx-total[i+1].trx,
    basket: total[i].basket-total[i+1].basket,
    salesPct: diffPct(total[i].sales,total[i+1].sales),
    trxPct: diffPct(total[i].trx,total[i+1].trx),
    basketPct: diffPct(total[i].basket,total[i+1].basket)
  }));
  const avgPerDay = total.map((m,i)=>({ sales:m.sales/daysInclusive(periods[i].start,periods[i].end), trx:m.trx/daysInclusive(periods[i].start,periods[i].end), basket:m.basket }));
  const ptTotals = ['EFM','EFIT','ESB'].map(pt=>({ pt, periods:metricsByPeriod(base.filter(r=>r.pt===pt && stores.some(s=>s.name===r.store)), periods) }));
  return { rows, total, variance, avgPerDay, ptTotals };
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) { const k=keyFn(r); if (!map.has(k)) map.set(k, []); map.get(k).push(r); }
  return map;
}

function brandQuery(periods, filters, topN) {
  const base = filterBase(filters);
  const brands = groupBy(base, r=>r.brand || 'UNBRANDED');
  let rows = [...brands.entries()].map(([brand,rr])=>({ brand, periods:metricsByPeriod(rr,periods) }));
  rows.sort((a,b)=>b.periods[0].sales-a.periods[0].sales);
  const totalAll = metricsByPeriod(base, periods);
  const shown = rows.slice(0, topN);
  const totalDisplayed = periods.map((_,i)=>shown.reduce((acc,x)=>({ sales:acc.sales+x.periods[i].sales, trx:0, basket:0 }),{sales:0,trx:0,basket:0}));
  return {
    rows: shown.map(x=>({ ...x, growthP1:x.periods[1]?x.periods[0].sales-x.periods[1].sales:null, growthP2:x.periods[2]?x.periods[0].sales-x.periods[2].sales:null, share:pct(x.periods[0].sales,totalAll[0].sales) })),
    totalAll,
    totalDisplayed,
    displayedShare: totalDisplayed.map((m,i)=>pct(m.sales,totalAll[i].sales))
  };
}

function itemQuery(periods, filters, topN) {
  const base = filterBase(filters);
  const groups = groupBy(base, r=>`${r.sku}|||${r.itemName}|||${r.brand}`);
  const all = [...groups.entries()].map(([key,rr])=>{
    const [sku,itemName,brand] = key.split('|||');
    const m = metricsByPeriod(rr,periods);
    return { sku,itemName,brand,periods:m,growthP1:m[1]?m[0].sales-m[1].sales:m[0].sales,growthP2:m[2]?m[0].sales-m[2].sales:null };
  });
  const topGrowth = [...all].sort((a,b)=>b.growthP1-a.growthP1).slice(0,topN);
  const topDecline = [...all].sort((a,b)=>a.growthP1-b.growthP1).slice(0,topN);
  const totalAll = metricsByPeriod(base,periods);
  function summarize(list){
    const totalDisplayed=periods.map((_,i)=>({sales:list.reduce((a,x)=>a+x.periods[i].sales,0),trx:0,basket:0}));
    return { rows:list, totalDisplayed, displayedShare:totalDisplayed.map((m,i)=>pct(m.sales,totalAll[i].sales)) };
  }
  return { topGrowth:summarize(topGrowth), topDecline:summarize(topDecline), totalAll };
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

const loginLimiter = rateLimit({ windowMs: 15*60*1000, limit: 30, standardHeaders: true, legacyHeaders: false });

app.post('/api/auth/login', loginLimiter, async (req,res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const users = await readJson(USERS_FILE, []);
  const user = users.find(u=>u.username===username && u.active);
  if (!user || !(await bcrypt.compare(password,user.passwordHash))) return res.status(401).json({ error:'INVALID_LOGIN' });
  const token=signUser(user);
  res.cookie('auth',token,{ httpOnly:true, sameSite:'strict', secure:COOKIE_SECURE, maxAge:12*60*60*1000 });
  res.json({ id:user.id, username:user.username, displayName:user.displayName, role:user.role });
});

app.post('/api/auth/logout', (req,res)=>{ res.clearCookie('auth'); res.json({ok:true}); });
app.get('/api/auth/me', requireAuth, (req,res)=>res.json(req.user));

app.get('/api/meta', requireAuth, (req,res)=>{
  const brands=[...new Set(rawRows.map(r=>r.brand).filter(Boolean))].sort();
  const categories=[...new Set(rawRows.map(r=>r.category).filter(Boolean))].sort();
  const salesTypes=[...new Set(rawRows.map(r=>r.salesType).filter(Boolean))].sort();
  const stores=[...new Map(config.stores.filter(s=>s.active).map(s=>[s.name,{name:s.name,pt:s.pt}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
  const dates=rawRows.map(r=>r.date).filter(Boolean).sort();
  res.json({ channels:activeChannels().map(c=>c.name), stores, pts:['EFM','EFIT','ESB'], categories, brands, salesTypes, rankingDefault:config.rankingDefault, runtime, minDate:dates[0]||null, maxDate:dates[dates.length-1]||null });
});

app.get('/api/meta/products', requireAuth, (req,res)=>{
  const q=String(req.query.q||'').trim().toUpperCase();
  if (q.length<2) return res.json([]);
  const seen=new Set(), out=[];
  for (const r of rawRows) {
    if (!(`${r.sku} ${r.newItemCode} ${r.itemName}`.toUpperCase().includes(q))) continue;
    const key=`${r.sku}|${r.itemName}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push({sku:r.sku,newItemCode:r.newItemCode,itemName:r.itemName,brand:r.brand});
    if (out.length>=50) break;
  }
  res.json(out);
});

app.post('/api/query/channel', requireAuth, (req,res)=>{
  try { const periods=normalizePeriods(req.body.periods); res.json(channelQuery(periods,req.body.filters||{})); }
  catch(e){ res.status(400).json({error:e.message}); }
});
app.post('/api/query/target', requireAuth, (req,res)=>{
  try { const period=normalizePeriods([req.body.period])[0]; res.json(targetQuery(period,req.body.filters||{})); }
  catch(e){ res.status(400).json({error:e.message}); }
});
app.post('/api/query/store', requireAuth, (req,res)=>{
  try { const periods=normalizePeriods(req.body.periods); res.json(storeQuery(periods,req.body.filters||{})); }
  catch(e){ res.status(400).json({error:e.message}); }
});
app.post('/api/query/brand', requireAuth, (req,res)=>{
  try { const periods=normalizePeriods(req.body.periods); const n=Math.max(1,Math.min(10,Number(req.body.topN||config.rankingDefault||10))); res.json(brandQuery(periods,req.body.filters||{},n)); }
  catch(e){ res.status(400).json({error:e.message}); }
});
app.post('/api/query/items', requireAuth, (req,res)=>{
  try { const periods=normalizePeriods(req.body.periods); const n=Math.max(1,Math.min(10,Number(req.body.topN||config.rankingDefault||10))); res.json(itemQuery(periods,req.body.filters||{},n)); }
  catch(e){ res.status(400).json({error:e.message}); }
});

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req,file,cb)=> cb(null, /\.(xlsx|xls)$/i.test(file.originalname))
});

app.post('/api/admin/upload', requireAdmin, upload.single('file'), async (req,res)=>{
  if (!req.file) return res.status(400).json({error:'FILE_REQUIRED'});
  try {
    const wb = XLSX.readFile(req.file.path, { cellDates:true });
    const sheetName = wb.SheetNames.includes('RAW') ? 'RAW' : wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval:null, raw:true });
    const required = ['transaction_date','invoice_no','store_location','item_name','brand','category_2','trader_check','sub_total'];
    if (!rows.length || !required.every(k=>Object.prototype.hasOwnProperty.call(rows[0],k))) {
      throw new Error(`RAW_FORMAT_INVALID. Required columns: ${required.join(', ')}`);
    }
    const normalized=rows.map(normalizeRow).filter(r=>r.date && r.invoice && r.channel);
    rawRows=normalized;
    runtime={ updatedAt:new Date().toISOString(), sourceFile:req.file.originalname, rowCount:normalized.length };
    await Promise.all([writeJsonAtomic(RAW_CACHE_FILE,normalized),writeJsonAtomic(RUNTIME_FILE,runtime)]);
    res.json({ok:true,...runtime});
  } catch(e) {
    res.status(400).json({error:e.message});
  } finally {
    fsp.unlink(req.file.path).catch(()=>{});
  }
});

app.get('/api/admin/config', requireAdmin, (req,res)=>res.json(config));
app.put('/api/admin/config', requireAdmin, async (req,res)=>{
  const incoming=req.body||{};
  if (!Array.isArray(incoming.channels) || !Array.isArray(incoming.stores)) return res.status(400).json({error:'CONFIG_INVALID'});
  const pts=new Set(['EFM','EFIT','ESB','UNMAPPED']);
  for (const s of incoming.stores) if (!pts.has(String(s.pt).toUpperCase())) return res.status(400).json({error:`INVALID_PT:${s.pt}`});
  config={
    channels:incoming.channels.map((c,i)=>({name:String(c.name||'').trim().toUpperCase(),rawName:String(c.rawName||c.name||'').trim().toUpperCase(),active:!!c.active,telemed:!!c.telemed,sort:Number(c.sort||i+1)})).filter(c=>c.name&&c.rawName),
    stores:incoming.stores.map(s=>({name:String(s.name||'').trim().toUpperCase(),rawName:String(s.rawName||'').trim(),pt:String(s.pt||'UNMAPPED').toUpperCase(),active:!!s.active})).filter(s=>s.name&&s.rawName),
    categoryMap:incoming.categoryMap&&typeof incoming.categoryMap==='object'?incoming.categoryMap:{},
    targets:incoming.targets&&typeof incoming.targets==='object'?incoming.targets:{},
    rankingDefault:Math.max(1,Math.min(10,Number(incoming.rankingDefault||10)))
  };
  await writeJsonAtomic(CONFIG_FILE,config);
  await redecorateAllRows();
  res.json({ok:true,config});
});

app.get('/api/admin/users', requireAdmin, async (req,res)=>{
  const users=await readJson(USERS_FILE,[]);
  res.json(users.map(({passwordHash,...u})=>u));
});

app.post('/api/admin/users', requireAdmin, async (req,res)=>{
  const username=String(req.body.username||'').trim().toLowerCase();
  const displayName=String(req.body.displayName||'').trim()||username;
  const role=req.body.role==='admin'?'admin':'guest';
  const password=String(req.body.password||'');
  if (!/^[a-z0-9._-]{3,40}$/.test(username) || password.length<8) return res.status(400).json({error:'USERNAME_OR_PASSWORD_INVALID'});
  const users=await readJson(USERS_FILE,[]);
  if (users.some(u=>u.username===username)) return res.status(409).json({error:'USERNAME_EXISTS'});
  const user={id:crypto.randomUUID(),username,displayName,role,active:true,passwordHash:await bcrypt.hash(password,12),createdAt:new Date().toISOString()};
  users.push(user);await writeJsonAtomic(USERS_FILE,users);
  const {passwordHash,...safe}=user;res.json(safe);
});

app.put('/api/admin/users/:id', requireAdmin, async (req,res)=>{
  const users=await readJson(USERS_FILE,[]);
  const user=users.find(u=>u.id===req.params.id);
  if (!user) return res.status(404).json({error:'USER_NOT_FOUND'});
  if (req.body.displayName!==undefined) user.displayName=String(req.body.displayName).trim()||user.username;
  if (req.body.role!==undefined) user.role=req.body.role==='admin'?'admin':'guest';
  if (req.body.active!==undefined) user.active=!!req.body.active;
  if (req.body.password) {
    if (String(req.body.password).length<8) return res.status(400).json({error:'PASSWORD_MIN_8'});
    user.passwordHash=await bcrypt.hash(String(req.body.password),12);
  }
  const activeAdmins=users.filter(u=>u.active&&u.role==='admin');
  if (!activeAdmins.length) return res.status(400).json({error:'AT_LEAST_ONE_ADMIN_REQUIRED'});
  await writeJsonAtomic(USERS_FILE,users);
  const {passwordHash,...safe}=user;res.json(safe);
});

app.delete('/api/admin/users/:id', requireAdmin, async (req,res)=>{
  if (req.user.sub===req.params.id) return res.status(400).json({error:'CANNOT_DELETE_SELF'});
  let users=await readJson(USERS_FILE,[]);
  const target=users.find(u=>u.id===req.params.id);
  if (!target) return res.status(404).json({error:'USER_NOT_FOUND'});
  const remaining=users.filter(u=>u.id!==req.params.id);
  if (!remaining.some(u=>u.active&&u.role==='admin')) return res.status(400).json({error:'AT_LEAST_ONE_ADMIN_REQUIRED'});
  users=remaining;await writeJsonAtomic(USERS_FILE,users);res.json({ok:true});
});

app.get('/dashboard.html', async (req,res)=>{
  const user=await resolveActiveUser(readAuth(req));
  if (!user) return res.redirect('/login.html');
  res.sendFile(path.join(ROOT,'public','dashboard.html'));
});
app.get('/admin.html', async (req,res)=>{
  const user=await resolveActiveUser(readAuth(req));
  if (!user) return res.redirect('/login.html');
  if (user.role!=='admin') return res.redirect('/dashboard.html');
  res.sendFile(path.join(ROOT,'public','admin.html'));
});
app.get('/login.html', async (req,res)=>{
  const user=await resolveActiveUser(readAuth(req));
  if (user) return res.redirect('/dashboard.html');
  res.sendFile(path.join(ROOT,'public','login.html'));
});
app.get('/', (req,res)=>res.redirect('/dashboard.html'));
app.use(express.static(path.join(ROOT,'public'),{index:false}));

app.use((err,req,res,next)=>{
  console.error(err);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error:`FILE_TOO_LARGE. Maximum upload is ${MAX_UPLOAD_MB} MB.` });
    }
    return res.status(400).json({error:err.code});
  }
  res.status(500).json({error:'SERVER_ERROR'});
});

bootstrap().then(()=>app.listen(PORT, '0.0.0.0', ()=>console.log(`Sales dashboard running on http://0.0.0.0:${PORT} | Max upload: ${MAX_UPLOAD_MB} MB`)));
