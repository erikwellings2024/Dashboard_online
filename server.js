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
const ExcelJS = require('exceljs');

const app = express();
// Railway runs the app behind a reverse proxy.
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const RAW_CACHE_FILE = path.join(DATA_DIR, 'raw-cache.json'); // legacy combined cache; monthly files are canonical
const RUNTIME_FILE = path.join(DATA_DIR, 'runtime.json');
const MONTHLY_DIR = path.join(DATA_DIR, 'monthly');
const MONTH_INDEX_FILE = path.join(DATA_DIR, 'month-index.json');
const STORAGE_START_MONTH = '2026-01';
const STORAGE_END_MONTH = '2028-12';
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
fs.mkdirSync(MONTHLY_DIR, { recursive: true });

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
let runtime = { updatedAt: null, sourceFile: null, rowCount: 0, minDate: null, maxDate: null, uploadHistory: [] };
let monthIndex = {};

async function readJson(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); }
  catch { return fallback; }
}

async function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(value, null, 2));
  await fsp.rename(tmp, file);
}


function monthPath(key) {
  const [year, month] = String(key).split('-');
  return path.join(MONTHLY_DIR, year, `${month}.json`);
}

function monthMetaPathKey(key) { return String(key); }

function monthAllowed(key) {
  return /^\d{4}-\d{2}$/.test(String(key)) && key >= STORAGE_START_MONTH && key <= STORAGE_END_MONTH;
}

function storageMonthKeys() {
  const out=[];
  let cur=STORAGE_START_MONTH;
  let guard=0;
  while (cur<=STORAGE_END_MONTH && guard<60) {
    out.push(cur);
    const [y,m]=cur.split('-').map(Number);
    const d=new Date(Date.UTC(y,m,1));
    cur=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
    guard++;
  }
  return out;
}

async function ensureMonthlyFolders() {
  for (const y of ['2026','2027','2028']) await fsp.mkdir(path.join(MONTHLY_DIR,y), {recursive:true});
}

async function readAllMonthlyRows() {
  const all=[];
  for (const key of storageMonthKeys()) {
    const rows=await readJson(monthPath(key), []);
    if (Array.isArray(rows) && rows.length) all.push(...rows);
  }
  all.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  return all;
}

async function writeMonthRows(key, rows) {
  if (!monthAllowed(key)) throw new Error(`MONTH_OUT_OF_RANGE:${key}`);
  const file=monthPath(key);
  await fsp.mkdir(path.dirname(file), {recursive:true});
  await writeJsonAtomic(file, rows);
}

async function migrateLegacyCacheIfNeeded() {
  const existing=await readAllMonthlyRows();
  if (existing.length) return existing;
  const legacy=await readJson(RAW_CACHE_FILE, []);
  if (!Array.isArray(legacy) || !legacy.length) return [];
  const grouped={};
  for (const r of legacy) {
    const key=monthKey(r.date);
    if (!monthAllowed(key)) continue;
    (grouped[key] ||= []).push(r);
  }
  for (const [key,rows] of Object.entries(grouped)) {
    await writeMonthRows(key, rows);
    monthIndex[key]={
      month:key,
      rowCount:rows.length,
      minDate:dataCoverage(rows).minDate,
      maxDate:dataCoverage(rows).maxDate,
      updatedAt:null,
      uploadedBy:'system-migration',
      sourceFile:'legacy raw-cache.json'
    };
  }
  if (Object.keys(grouped).length) await writeJsonAtomic(MONTH_INDEX_FILE, monthIndex);
  return legacy;
}

function monthStatus(key) {
  const m=monthIndex[key]||{};
  return Number(m.rowCount||0) > 0 ? 'DATA' : 'NO DATA';
}

function monthSlots() {
  return storageMonthKeys().map(key=>{
    const m=monthIndex[key]||{};
    return {
      month:key,
      status:monthStatus(key),
      rowCount:Number(m.rowCount||0),
      minDate:m.minDate||null,
      maxDate:m.maxDate||null,
      updatedAt:m.updatedAt||null,
      uploadedBy:m.uploadedBy||null,
      sourceFile:m.sourceFile||null
    };
  });
}

async function bootstrap() {
  config = await readJson(CONFIG_FILE, null);
  if (!config) {
    config = DEFAULT_CONFIG;
    await writeJsonAtomic(CONFIG_FILE, config);
  }

  await ensureMonthlyFolders();
  monthIndex = await readJson(MONTH_INDEX_FILE, {});
  if (!monthIndex || typeof monthIndex !== 'object' || Array.isArray(monthIndex)) monthIndex={};
  rawRows = await migrateLegacyCacheIfNeeded();
  if (!rawRows.length) rawRows = await readAllMonthlyRows();
  runtime = await readJson(RUNTIME_FILE, runtime);
  runtime = { updatedAt:null, sourceFile:null, rowCount:rawRows.length, minDate:null, maxDate:null, uploadHistory:[], ...(runtime||{}) };
  if (!Array.isArray(runtime.uploadHistory)) runtime.uploadHistory=[];

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

function normalizeRawChannel(r) {
  // Current Metabase export uses `telemed_check`.
  // Keep backward compatibility with older dashboard/raw column names.
  let raw = String(
    r.telemed_check ||
    r.TELEMED ||
    r.telemed ||
    r.channel_dashboard ||
    r.channel_type ||
    ''
  ).trim().toUpperCase();

  // In the raw sales export, WALK-IN / IN STORE is the offline channel.
  if (['WALK-IN', 'WALK IN', 'IN STORE', 'IN-STORE', 'OFFLINE'].includes(raw)) {
    raw = 'OFFLINE SALES';
  }
  return raw;
}

function normalizeRow(r) {
  const rawStore = String(r.store_location || '').trim();
  const rawChannel = normalizeRawChannel(r);
  const store = canonicalStore(rawStore);
  return {
    date: excelDateToISO(r.transaction_date || r.DATE),
    invoice: String(r.invoice_no || '').trim(),
    rawStore,
    rawChannel,
    store: store.name,
    pt: store.pt,
    channel: canonicalChannel(rawChannel),
    // Canonical dashboard SKU is new_item_code.
    sku: String(r.new_item_code || r.old_item_code || '').trim(),
    newItemCode: String(r.new_item_code || '').trim(),
    itemName: String(r.item_name || '').trim(),
    brand: String(r.brand || '').trim() || 'UNBRANDED',
    category: mapCategory(r.category_2),
    salesType: String(r.trader_check || '').trim() || 'Regular',
    // Excel reference dashboard uses sub_total_inv as the sales measure.
    // Fall back to sub_total only when sub_total_inv is missing/blank.
    sales: safeNum(
      (r.sub_total_inv !== null && r.sub_total_inv !== undefined && r.sub_total_inv !== '')
        ? r.sub_total_inv
        : r.sub_total
    ),
    qty: safeNum(r.qty)
  };
}


function excelJsCellValue(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v !== 'object') return v;
  if (Object.prototype.hasOwnProperty.call(v,'result')) return v.result;
  if (Array.isArray(v.richText)) return v.richText.map(x=>x.text||'').join('');
  if (Object.prototype.hasOwnProperty.call(v,'text')) return v.text;
  if (Object.prototype.hasOwnProperty.call(v,'hyperlink')) return v.text || v.hyperlink;
  return String(v);
}

function writeWithBackpressure(stream, chunk) {
  return new Promise((resolve,reject)=>{
    const onError=(e)=>{ cleanup(); reject(e); };
    const onDrain=()=>{ cleanup(); resolve(); };
    const cleanup=()=>{ stream.off('error',onError); stream.off('drain',onDrain); };
    stream.once('error',onError);
    if (stream.write(chunk)) { cleanup(); resolve(); }
    else stream.once('drain',onDrain);
  });
}


async function readExactlyAt(fd,length,position){
  const buf=Buffer.alloc(length);
  const {bytesRead}=await fd.read(buf,0,length,position);
  if(bytesRead!==length) throw new Error('XLSX_ZIP_UNEXPECTED_EOF');
  return buf;
}

async function xlsxNeedsZipNormalization(filePath){
  const fd=await fsp.open(filePath,'r');
  try{
    const h=await readExactlyAt(fd,30,0);
    if(h.readUInt32LE(0)!==0x04034b50) return false;
    const versionNeeded=h.readUInt16LE(4);
    const flags=h.readUInt16LE(6);
    // Some current Metabase exports use ZIP version 4.5 + data descriptors.
    // ExcelJS streaming/unzipper can misread the 64-bit descriptor and throw
    // "invalid signature: 0x41d". Standardize only those files.
    return versionNeeded>=45 && !!(flags & 0x8);
  }finally{
    await fd.close();
  }
}

async function readZipCentralEntries(filePath){
  const st=await fsp.stat(filePath);
  const fd=await fsp.open(filePath,'r');
  try{
    const tailLen=Math.min(st.size,22+65535+1024);
    const tail=await readExactlyAt(fd,tailLen,st.size-tailLen);
    const eocdSig=Buffer.from([0x50,0x4b,0x05,0x06]);
    const eocd=tail.lastIndexOf(eocdSig);
    if(eocd<0) throw new Error('XLSX_ZIP_EOCD_NOT_FOUND');

    const totalEntries=tail.readUInt16LE(eocd+10);
    const cdSize=tail.readUInt32LE(eocd+12);
    const cdOffset=tail.readUInt32LE(eocd+16);
    if(totalEntries===0xffff || cdSize===0xffffffff || cdOffset===0xffffffff){
      throw new Error('XLSX_ZIP64_CENTRAL_UNSUPPORTED');
    }

    const cd=await readExactlyAt(fd,cdSize,cdOffset);
    const entries=[];
    let cur=0;
    while(cur<cd.length){
      if(cd.readUInt32LE(cur)!==0x02014b50) throw new Error('XLSX_ZIP_CENTRAL_INVALID');
      const nameLen=cd.readUInt16LE(cur+28);
      const extraLen=cd.readUInt16LE(cur+30);
      const commentLen=cd.readUInt16LE(cur+32);

      const entry={
        versionMadeBy:cd.readUInt16LE(cur+4),
        versionNeeded:cd.readUInt16LE(cur+6),
        flags:cd.readUInt16LE(cur+8),
        method:cd.readUInt16LE(cur+10),
        modTime:cd.readUInt16LE(cur+12),
        modDate:cd.readUInt16LE(cur+14),
        crc:cd.readUInt32LE(cur+16),
        compressedSize:cd.readUInt32LE(cur+20),
        uncompressedSize:cd.readUInt32LE(cur+24),
        internalAttr:cd.readUInt16LE(cur+36),
        externalAttr:cd.readUInt32LE(cur+38),
        localOffset:cd.readUInt32LE(cur+42),
        name:Buffer.from(cd.subarray(cur+46,cur+46+nameLen)),
        comment:Buffer.from(cd.subarray(cur+46+nameLen+extraLen,cur+46+nameLen+extraLen+commentLen))
      };
      entries.push(entry);
      cur+=46+nameLen+extraLen+commentLen;
    }

    if(entries.length!==totalEntries) throw new Error('XLSX_ZIP_ENTRY_COUNT_MISMATCH');
    return entries;
  }finally{
    await fd.close();
  }
}

async function normalizeXlsxZipDescriptors(filePath){
  const entries=await readZipCentralEntries(filePath);
  const src=await fsp.open(filePath,'r');
  const outPath=`${filePath}.${process.pid}.${Date.now()}.standard.xlsx`;
  const out=fs.createWriteStream(outPath);
  let offset=0;
  const rewritten=[];

  try{
    for(const e of entries){
      const local=await readExactlyAt(src,30,e.localOffset);
      if(local.readUInt32LE(0)!==0x04034b50) throw new Error('XLSX_ZIP_LOCAL_INVALID');
      const localNameLen=local.readUInt16LE(26);
      const localExtraLen=local.readUInt16LE(28);
      const dataStart=e.localOffset+30+localNameLen+localExtraLen;

      const newOffset=offset;
      const h=Buffer.alloc(30);
      h.writeUInt32LE(0x04034b50,0);
      h.writeUInt16LE(20,4);
      h.writeUInt16LE(e.flags & ~0x8,6); // no data descriptor
      h.writeUInt16LE(e.method,8);
      h.writeUInt16LE(e.modTime,10);
      h.writeUInt16LE(e.modDate,12);
      h.writeUInt32LE(e.crc>>>0,14);
      h.writeUInt32LE(e.compressedSize>>>0,18);
      h.writeUInt32LE(e.uncompressedSize>>>0,22);
      h.writeUInt16LE(e.name.length,26);
      h.writeUInt16LE(0,28);

      await writeWithBackpressure(out,h);
      await writeWithBackpressure(out,e.name);
      offset+=h.length+e.name.length;

      if(e.compressedSize){
        const rs=fs.createReadStream(filePath,{start:dataStart,end:dataStart+e.compressedSize-1});
        for await(const chunk of rs){
          await writeWithBackpressure(out,chunk);
          offset+=chunk.length;
        }
      }

      rewritten.push({...e,newOffset});
    }

    const cdOffset=offset;
    for(const e of rewritten){
      const h=Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50,0);
      h.writeUInt16LE(e.versionMadeBy,4);
      h.writeUInt16LE(20,6);
      h.writeUInt16LE(e.flags & ~0x8,8);
      h.writeUInt16LE(e.method,10);
      h.writeUInt16LE(e.modTime,12);
      h.writeUInt16LE(e.modDate,14);
      h.writeUInt32LE(e.crc>>>0,16);
      h.writeUInt32LE(e.compressedSize>>>0,20);
      h.writeUInt32LE(e.uncompressedSize>>>0,24);
      h.writeUInt16LE(e.name.length,28);
      h.writeUInt16LE(0,30);
      h.writeUInt16LE(e.comment.length,32);
      h.writeUInt16LE(0,34);
      h.writeUInt16LE(e.internalAttr,36);
      h.writeUInt32LE(e.externalAttr>>>0,38);
      h.writeUInt32LE(e.newOffset>>>0,42);

      await writeWithBackpressure(out,h);
      await writeWithBackpressure(out,e.name);
      if(e.comment.length) await writeWithBackpressure(out,e.comment);
      offset+=h.length+e.name.length+e.comment.length;
    }

    const cdSize=offset-cdOffset;
    const eocd=Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50,0);
    eocd.writeUInt16LE(0,4);
    eocd.writeUInt16LE(0,6);
    eocd.writeUInt16LE(rewritten.length,8);
    eocd.writeUInt16LE(rewritten.length,10);
    eocd.writeUInt32LE(cdSize>>>0,12);
    eocd.writeUInt32LE(cdOffset>>>0,16);
    eocd.writeUInt16LE(0,20);
    await writeWithBackpressure(out,eocd);

    await new Promise((resolve,reject)=>{
      out.once('error',reject);
      out.end(resolve);
    });
    return outPath;
  }catch(e){
    try{out.destroy()}catch{}
    await fsp.unlink(outPath).catch(()=>{});
    throw e;
  }finally{
    await src.close();
  }
}

async function streamReplaceMonthFromXlsx(filePath, targetMonth) {
  // Determine RAW/first sheet without expanding worksheet XML into JS objects.
  const metaWb = XLSX.readFile(filePath,{bookSheets:true});
  const selectedSheet = metaWb.SheetNames.includes('RAW') ? 'RAW' : metaWb.SheetNames[0];
  if (!selectedSheet) throw new Error('RAW_FORMAT_INVALID. Workbook has no worksheet.');

  const targetFile=monthPath(targetMonth);
  await fsp.mkdir(path.dirname(targetFile),{recursive:true});
  const tmp=`${targetFile}.${process.pid}.${Date.now()}.upload.tmp`;
  const out=fs.createWriteStream(tmp,{encoding:'utf8'});

  let headerMap=null;
  let rawRowsCount=0, validRows=0, written=0;
  let minDate=null, maxDate=null;
  const detectedMonths=new Set();
  const channelSummary={};
  let selectedFound=false;

  const required=['transaction_date','invoice_no','store_location','item_name','brand','category_2','trader_check','sub_total'];
  const channelColumns=['telemed_check','TELEMED','telemed','channel_dashboard','channel_type'];

  const reader=new ExcelJS.stream.xlsx.WorkbookReader(filePath,{
    entries:'emit',
    sharedStrings:'cache',
    hyperlinks:'ignore',
    styles:'cache',
    worksheets:'emit'
  });

  try {
    await writeWithBackpressure(out,'[');

    for await (const ws of reader) {
      if (ws.name !== selectedSheet) continue;
      selectedFound=true;
      let rowNo=0;

      for await (const row of ws) {
        rowNo++;
        if (rowNo===1) {
          headerMap=new Map();
          const values=row.values||[];
          for (let i=1;i<values.length;i++) {
            const key=String(excelJsCellValue(values[i])??'').trim();
            if (key) headerMap.set(key,i);
          }

          const hasRequired=required.every(k=>headerMap.has(k));
          const hasChannel=channelColumns.some(k=>headerMap.has(k));
          if (!hasRequired || !hasChannel) {
            throw new Error(
              `RAW_FORMAT_INVALID. Required columns: ${required.join(', ')}. `+
              `Channel column: one of ${channelColumns.join(', ')}`
            );
          }
          continue;
        }

        const get=(name)=>{
          const idx=headerMap.get(name);
          return idx ? excelJsCellValue(row.getCell(idx).value) : null;
        };

        // Ignore fully blank trailing rows.
        const transactionDate=get('transaction_date');
        const invoiceNo=get('invoice_no');
        if (transactionDate==null && invoiceNo==null) continue;

        rawRowsCount++;
        const raw={
          transaction_date:transactionDate,
          invoice_no:invoiceNo,
          store_location:get('store_location'),
          new_item_code:get('new_item_code'),
          old_item_code:get('old_item_code'),
          item_name:get('item_name'),
          brand:get('brand'),
          category_2:get('category_2'),
          trader_check:get('trader_check'),
          sub_total:get('sub_total'),
          sub_total_inv:get('sub_total_inv'),
          qty:get('qty'),
          telemed_check:get('telemed_check'),
          TELEMED:get('TELEMED'),
          telemed:get('telemed'),
          channel_dashboard:get('channel_dashboard'),
          channel_type:get('channel_type')
        };

        const n=normalizeRow(raw);
        if (!(n.date && n.invoice && n.channel)) continue;

        validRows++;
        const mk=monthKey(n.date);
        detectedMonths.add(mk);
        if (!minDate || n.date<minDate) minDate=n.date;
        if (!maxDate || n.date>maxDate) maxDate=n.date;
        channelSummary[n.channel]=(channelSummary[n.channel]||0)+1;

        const json=JSON.stringify(n);
        await writeWithBackpressure(out,(written?',':'')+json);
        written++;
      }
      break;
    }

    if (!selectedFound) throw new Error(`RAW_FORMAT_INVALID. Worksheet "${selectedSheet}" was not found.`);
    if (!validRows) throw new Error(`NO_VALID_ROWS. Parsed rows=${rawRowsCount}, valid rows=0.`);

    const months=[...detectedMonths].sort();
    if (months.length!==1 || months[0]!==targetMonth) {
      throw new Error(`MONTH_MISMATCH. Selected ${targetMonth}, but Excel contains: ${months.join(', ')}. Upload one month only.`);
    }

    await writeWithBackpressure(out,']');
    await new Promise((resolve,reject)=>{
      out.once('error',reject);
      out.end(resolve);
    });
    await fsp.rename(tmp,targetFile);

    return {
      rawRows:rawRowsCount,
      validRows,
      minDate,
      maxDate,
      detectedMonths:months,
      channelSummary
    };
  } catch(e) {
    try { out.destroy(); } catch {}
    await fsp.unlink(tmp).catch(()=>{});
    throw e;
  }
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
  const grouped={};
  for (const r of rawRows) {
    const key=monthKey(r.date);
    if (monthAllowed(key)) (grouped[key] ||= []).push(r);
  }
  for (const [key,rows] of Object.entries(grouped)) await writeMonthRows(key,rows);
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
  const groups = groupBy(base, r=>`${String(r.newItemCode || r.sku || '').trim()}|||${r.itemName}|||${r.brand}`);
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


function jakartaTodayParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(new Date()).reduce((a,p)=>{ if (p.type!=='literal') a[p.type]=p.value; return a; }, {});
  const year=Number(parts.year), month=Number(parts.month), day=Number(parts.day);
  return { year, month, day, iso:`${parts.year}-${parts.month}-${parts.day}`, monthKey:`${parts.year}-${parts.month}` };
}

function shiftMonthKey(key, delta) {
  const [y,m]=String(key).split('-').map(Number);
  const d=new Date(Date.UTC(y,m-1+delta,1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
}

function monthKeysInRange(start,end) {
  const out=[];
  let cur=String(start).slice(0,7);
  const last=String(end).slice(0,7);
  let guard=0;
  while (cur<=last && guard<240) {
    out.push(cur);
    cur=shiftMonthKey(cur,1);
    guard++;
  }
  return out;
}

function uploadPolicy() {
  const t=jakartaTodayParts();
  return {
    timezone:'Asia/Jakarta',
    today:t.iso,
    currentMonth:t.monthKey,
    mode:'MONTHLY_REPLACE_ANYTIME',
    rule:'Any month from 2026-01 through 2028-12 may be uploaded or replaced at any time. Excel must contain exactly one selected month.'
  };
}

function dataCoverage(rows) {
  let minDate=null,maxDate=null;
  for (const r of rows) {
    if (!r.date) continue;
    if (!minDate || r.date<minDate) minDate=r.date;
    if (!maxDate || r.date>maxDate) maxDate=r.date;
  }
  return {minDate,maxDate};
}

function appendUploadHistory(entry) {
  const history=Array.isArray(runtime.uploadHistory)?runtime.uploadHistory:[];
  runtime.uploadHistory=[entry,...history].slice(0,30);
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
  res.json({ channels:activeChannels().map(c=>c.name), stores, pts:['EFM','EFIT','ESB'], categories, brands, salesTypes, rankingDefault:config.rankingDefault, runtime, uploadPolicy:uploadPolicy(), storageRange:{start:STORAGE_START_MONTH,end:STORAGE_END_MONTH}, monthSlots:monthSlots(), minDate:dates[0]||null, maxDate:dates[dates.length-1]||null });
});

app.get('/api/meta/products', requireAuth, (req,res)=>{
  const q=String(req.query.q||'').trim().toUpperCase();
  if (q.length<2) return res.json([]);
  const seen=new Set(), out=[];
  for (const r of rawRows) {
    if (!(`${r.sku} ${r.newItemCode} ${r.itemName}`.toUpperCase().includes(q))) continue;
    const displaySku=String(r.newItemCode || r.sku || '').trim();
    const key=`${displaySku}|${r.itemName}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push({sku:displaySku,newItemCode:r.newItemCode,itemName:r.itemName,brand:r.brand});
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
  try { const periods=normalizePeriods(req.body.periods); const n=Math.max(1,Math.min(20,Number(req.body.topN||config.rankingDefault||10))); res.json(itemQuery(periods,req.body.filters||{},n)); }
  catch(e){ res.status(400).json({error:e.message}); }
});

app.get('/api/admin/upload-policy', requireAdmin, (req,res)=>res.json(uploadPolicy()));
app.get('/api/admin/months', requireAdmin, (req,res)=>res.json({storageRange:{start:STORAGE_START_MONTH,end:STORAGE_END_MONTH}, months:monthSlots()}));

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req,file,cb)=> cb(null, /\.(xlsx|xls)$/i.test(file.originalname))
});

app.post('/api/admin/upload', requireAdmin, upload.single('file'), async (req,res)=>{
  if (!req.file) return res.status(400).json({error:'FILE_REQUIRED'});
  try {
    const targetMonth=String(req.body.targetMonth||'').trim();
    if (!monthAllowed(targetMonth)) throw new Error(`TARGET_MONTH_INVALID. Choose ${STORAGE_START_MONTH} through ${STORAGE_END_MONTH}.`);

    // No monthly closing. Admin may replace any month at any time.
    // Safety is provided by one-month validation plus upload history/audit metadata.
    const status=monthStatus(targetMonth);

    // Stream the XLSX row-by-row. This avoids loading the full workbook and a second
    // normalized copy into memory, which caused Railway SIGKILL on larger months.
    const replacedRows=Number(monthIndex[targetMonth]?.rowCount||0);

    let parserFile=req.file.path;
    let normalizedZipFile=null;
    if(await xlsxNeedsZipNormalization(req.file.path)){
      normalizedZipFile=await normalizeXlsxZipDescriptors(req.file.path);
      parserFile=normalizedZipFile;
      console.log(`[UPLOAD] standardized XLSX ZIP descriptors for ${req.file.originalname}`);
    }

    let streamed;
    try{
      streamed=await streamReplaceMonthFromXlsx(parserFile,targetMonth);
    }finally{
      if(normalizedZipFile) await fsp.unlink(normalizedZipFile).catch(()=>{});
    }

    console.log(`[UPLOAD] user=${req.user.username} target=${targetMonth} file=${req.file.originalname} rawRows=${streamed.rawRows} validRows=${streamed.validRows} channels=${JSON.stringify(streamed.channelSummary)}`);

    const incomingCoverage={minDate:streamed.minDate,maxDate:streamed.maxDate};
    const now=new Date().toISOString();
    monthIndex[targetMonth]={
      month:targetMonth,
      rowCount:streamed.validRows,
      minDate:incomingCoverage.minDate,
      maxDate:incomingCoverage.maxDate,
      updatedAt:now,
      uploadedBy:req.user.username,
      sourceFile:req.file.originalname,
      fileSize:req.file.size
    };
    await writeJsonAtomic(MONTH_INDEX_FILE,monthIndex);

    // Refresh only the replaced month in memory. Do not re-read every historical
    // partition during upload.
    const kept=rawRows.filter(r=>monthKey(r.date)!==targetMonth);
    const freshMonth=await readJson(monthPath(targetMonth),[]);
    rawRows=kept.concat(Array.isArray(freshMonth)?freshMonth:[]);
    rawRows.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const coverage=dataCoverage(rawRows);

    const entry={
      id:crypto.randomUUID(),
      uploadedAt:now,
      uploadedBy:req.user.username,
      sourceFile:req.file.originalname,
      mode:'monthly_replace',
      targetMonth,
      detectedStart:incomingCoverage.minDate,
      detectedEnd:incomingCoverage.maxDate,
      incomingRows:streamed.validRows,
      replacedRows,
      totalRows:rawRows.length,
      monthStatusBefore:status
    };

    runtime={
      ...(runtime||{}),updatedAt:now,sourceFile:req.file.originalname,rowCount:rawRows.length,
      minDate:coverage.minDate,maxDate:coverage.maxDate,lastUpload:entry,
      uploadHistory:Array.isArray(runtime.uploadHistory)?runtime.uploadHistory:[]
    };
    appendUploadHistory(entry);
    await writeJsonAtomic(RUNTIME_FILE,runtime);

    res.json({
      ok:true,mode:'monthly_replace',targetMonth,
      detectedStart:incomingCoverage.minDate,detectedEnd:incomingCoverage.maxDate,
      incomingRows:streamed.validRows,replacedRows,rowCount:rawRows.length,
      minDate:coverage.minDate,maxDate:coverage.maxDate,month:monthIndex[targetMonth],
      monthSlots:monthSlots()
    });
  } catch(e) {
    res.status(e.statusCode||400).json({error:e.message});
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
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({error:`FILE_TOO_LARGE. Maximum upload is ${MAX_UPLOAD_MB} MB.`});
    return res.status(400).json({error:err.code});
  }
  res.status(500).json({error:'SERVER_ERROR'});
});

bootstrap().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log(`Sales dashboard running on http://0.0.0.0:${PORT} | Max upload: ${MAX_UPLOAD_MB} MB | Streaming XLSX: enabled | Sales measure: sub_total_inv | SKU: new_item_code | ZIP descriptor compatibility: enabled | Monthly closing: disabled`)));
