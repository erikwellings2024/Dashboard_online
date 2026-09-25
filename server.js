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
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { promisify } = require('util');
const gunzipAsync = promisify(zlib.gunzip);

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
const RAW_CACHE_FILE = path.join(DATA_DIR, 'raw-cache.json'); // legacy combined cache
const RAW_CACHE_GZ_FILE = path.join(DATA_DIR, 'raw-cache.json.gz');
const RUNTIME_FILE = path.join(DATA_DIR, 'runtime.json');
const AUTO_SYNC_FILE = path.join(DATA_DIR, 'auto-sync.json');
const METABASE_SESSION_FILE = path.join(DATA_DIR, 'metabase-session.enc.json');
const MONTHLY_DIR = path.join(DATA_DIR, 'monthly');
const MONTH_INDEX_FILE = path.join(DATA_DIR, 'month-index.json');
const META_INDEX_FILE = path.join(DATA_DIR, 'meta-index.json');
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

const DEFAULT_CATEGORY_MAP = {
  'OTC MEDICINE': 'OTC MEDICINE',
  'VITAMIN - HEALTH SUPPLEMENTS': 'VITAMIN - HEALTH SUPPLEMENTS',
  'HEALTH FOOD & NUTRITION': 'HEALTH FOOD & NUTRITION',
  'PERSONAL CARE': 'PERSONAL CARE',
  'PHARMA': 'PHARMA',
  'HEALTH SUPPORT & REHAB': 'HEALTH SUPPORT & REHAB',
  'GENERAL MERCHANDISE': 'GENERAL MERCHANDISE',
  'OTHER MARKETING': 'OTHER',
  'HEALTH SCREENING TEST': 'HEALTH SCREENING TEST',
  'MERCHANDISE': 'OTHER',
  'OTHER SERVICE': 'OTHER',
  'VOUCHER PARTNERSHIP': 'OTHER',
  '0': 'OTHER'
};

const DEFAULT_CATEGORY_SORT = {
  'PHARMA': 1,
  'OTC MEDICINE': 2,
  'VITAMIN - HEALTH SUPPLEMENTS': 3,
  'HEALTH FOOD & NUTRITION': 4,
  'HEALTH SCREENING TEST': 5,
  'HEALTH SUPPORT & REHAB': 6,
  'PERSONAL CARE': 7,
  'GENERAL MERCHANDISE': 8,
  'OTHER': 9
};

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
  categoryMap: { ...DEFAULT_CATEGORY_MAP },
  categoryTargets: {},
  categorySort: { ...DEFAULT_CATEGORY_SORT },
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
let rawRows = []; // legacy compatibility only; v22 no longer keeps all history in RAM.
let metaIndex = { brands:[], categories:[], rawCategories:[], salesTypes:[], customerTypes:[], products:[] };
let runtime = { updatedAt: null, sourceFile: null, rowCount: 0, minDate: null, maxDate: null, uploadHistory: [] };
let monthIndex = {};
let autoSyncStatus = {
  running:false,
  configured:false,
  schedule:'Manual — Admin RUN NOW',
  timezone:'Asia/Jakarta',
  dateRule:'1st of current month → today',
  lastAttemptAt:null,
  lastSuccessAt:null,
  lastResult:null,
  lastError:null,
  lastStartDate:null,
  lastEndDate:null,
  lastTargetMonth:null,
  lastRows:null,
  lastReplacedRows:null,
  lastTotalRows:null,
  lastDurationMs:null,
  lastTrigger:null,
  lastSourceFile:null,
  lastSchedulerAttemptAt:null,
  lastSchedulerSuccessAt:null,
  lastSchedulerResult:null,
  lastSchedulerError:null,
  lastSchedulerDurationMs:null,
  lastSchedulerSlotAttempt:null,
  lastSchedulerSlotSuccess:null,
  lastSchedulerSource:null,
  lastAuthMode:null
};
let metabaseSessionMemory=null;
let dataWriteBusy=false;
let dataWriteOwner=null;


// v27: multi-user memory safety.
// Only a small number of raw-data aggregations may run simultaneously.
// Identical requests are cached briefly so multiple viewers can share results.
const QUERY_CONCURRENCY = Math.max(1, Number(process.env.QUERY_CONCURRENCY || 1));
const QUERY_CACHE_TTL_MS = Math.max(5000, Number(process.env.QUERY_CACHE_TTL_MS || 60000));
const QUERY_CACHE_MAX = Math.max(10, Number(process.env.QUERY_CACHE_MAX || 60));
let activeHeavyQueries = 0;
const heavyQueryQueue = [];
const queryResultCache = new Map();
let queryRevision = 1;

function withHeavyQuerySlot(fn){
  return new Promise((resolve,reject)=>{
    const job=async()=>{
      activeHeavyQueries++;
      try{resolve(await fn())}
      catch(e){reject(e)}
      finally{
        activeHeavyQueries--;
        const next=heavyQueryQueue.shift();
        if(next)next();
      }
    };
    if(activeHeavyQueries<QUERY_CONCURRENCY)job();
    else heavyQueryQueue.push(job);
  });
}

function queryCacheKey(name,body){
  return `${queryRevision}|${name}|${JSON.stringify(body||{})}`;
}

function pruneQueryCache(){
  const now=Date.now();
  for(const [k,v] of queryResultCache){
    if(now-v.at>QUERY_CACHE_TTL_MS)queryResultCache.delete(k);
  }
  while(queryResultCache.size>QUERY_CACHE_MAX){
    const first=queryResultCache.keys().next().value;
    if(first===undefined)break;
    queryResultCache.delete(first);
  }
}

async function runHeavyQuery(name,body,fn){
  pruneQueryCache();
  const key=queryCacheKey(name,body);
  const hit=queryResultCache.get(key);
  if(hit && Date.now()-hit.at<=QUERY_CACHE_TTL_MS)return hit.value;

  return withHeavyQuerySlot(async()=>{
    const second=queryResultCache.get(key);
    if(second && Date.now()-second.at<=QUERY_CACHE_TTL_MS)return second.value;
    const value=await fn();
    queryResultCache.set(key,{at:Date.now(),value});
    pruneQueryCache();
    return value;
  });
}

function invalidateQueryCache(){
  queryRevision++;
  queryResultCache.clear();
}


async function readJson(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); }
  catch { return fallback; }
}

async function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(value, null, 2));
  await fsp.rename(tmp, file);
}


function monthJsonPath(key) {
  const [year, month] = String(key).split('-');
  return path.join(MONTHLY_DIR, year, `${month}.json`);
}

function monthPath(key) {
  const [year, month] = String(key).split('-');
  return path.join(MONTHLY_DIR, year, `${month}.json.gz`);
}

async function fileExists(file) {
  try { await fsp.access(file); return true; }
  catch { return false; }
}

async function readMonthRows(key) {
  const gz=monthPath(key);
  const json=monthJsonPath(key);

  if (await fileExists(gz)) {
    try {
      const compressed=await fsp.readFile(gz);
      const raw=await gunzipAsync(compressed);
      const rows=JSON.parse(raw.toString('utf8'));
      return Array.isArray(rows)?rows:[];
    } catch(e) {
      console.error(`[STORAGE] Failed reading ${gz}:`,e.message);
      // Fallback to legacy JSON if it still exists.
    }
  }

  return readJson(json,[]);
}

async function gzipFileAtomic(source,dest) {
  const tmp=`${dest}.${process.pid}.${Date.now()}.tmp`;
  await fsp.mkdir(path.dirname(dest),{recursive:true});
  try {
    await pipeline(
      fs.createReadStream(source),
      zlib.createGzip({level:6}),
      fs.createWriteStream(tmp)
    );
    await fsp.rename(tmp,dest);
  } catch(e) {
    await fsp.unlink(tmp).catch(()=>{});
    throw e;
  }
}

async function migrateMonthlyStorageToGzip() {
  let converted=0,removedDuplicates=0;
  for(const key of storageMonthKeys()){
    const legacy=monthJsonPath(key);
    const gz=monthPath(key);
    if(!(await fileExists(legacy))) continue;

    if(await fileExists(gz)){
      // Compressed canonical copy already exists.
      await fsp.unlink(legacy).catch(()=>{});
      removedDuplicates++;
      continue;
    }

    const before=(await fsp.stat(legacy)).size;
    await gzipFileAtomic(legacy,gz);
    const after=(await fsp.stat(gz)).size;
    await fsp.unlink(legacy);
    converted++;
    console.log(`[STORAGE] compressed ${key}: ${(before/1048576).toFixed(1)} MB -> ${(after/1048576).toFixed(1)} MB`);
  }
  if(converted||removedDuplicates)console.log(`[STORAGE] monthly compression complete: converted=${converted}, duplicate JSON removed=${removedDuplicates}`);
}

async function readLegacyCache() {
  if(await fileExists(RAW_CACHE_GZ_FILE)){
    try{
      const raw=await gunzipAsync(await fsp.readFile(RAW_CACHE_GZ_FILE));
      const rows=JSON.parse(raw.toString('utf8'));
      return Array.isArray(rows)?rows:[];
    }catch(e){console.error('[STORAGE] legacy gzip read failed:',e.message)}
  }
  return readJson(RAW_CACHE_FILE,[]);
}

async function compressLegacyRawCache() {
  if(!(await fileExists(RAW_CACHE_FILE))) return;
  if(await fileExists(RAW_CACHE_GZ_FILE)){
    await fsp.unlink(RAW_CACHE_FILE).catch(()=>{});
    return;
  }
  const before=(await fsp.stat(RAW_CACHE_FILE)).size;
  await gzipFileAtomic(RAW_CACHE_FILE,RAW_CACHE_GZ_FILE);
  const after=(await fsp.stat(RAW_CACHE_GZ_FILE)).size;
  await fsp.unlink(RAW_CACHE_FILE);
  console.log(`[STORAGE] compressed legacy raw-cache: ${(before/1048576).toFixed(1)} MB -> ${(after/1048576).toFixed(1)} MB`);
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
    const rows=await readMonthRows(key);
    if (Array.isArray(rows) && rows.length) all.push(...rows);
  }
  all.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  return all;
}


function monthIndexTotals() {
  const entries=Object.values(monthIndex||{}).filter(x=>x && Number(x.rowCount||0)>0);
  let rowCount=0,minDate=null,maxDate=null;
  for(const m of entries){
    rowCount+=Number(m.rowCount||0);
    if(m.minDate && (!minDate || m.minDate<minDate)) minDate=m.minDate;
    if(m.maxDate && (!maxDate || m.maxDate>maxDate)) maxDate=m.maxDate;
  }
  return {rowCount,minDate,maxDate};
}

async function readRowsForPeriods(periods) {
  const keys=new Set();
  for(const p of periods){
    for(const key of monthKeysInRange(p.start,p.end)) {
      if(monthAllowed(key)) keys.add(key);
    }
  }

  const rows=[];
  for(const key of [...keys].sort()){
    const monthRows=await readMonthRows(key);
    if(!Array.isArray(monthRows) || !monthRows.length) continue;
    for(const row of monthRows){
      // Store / PT / Store Stat / Channel master changes are applied dynamically.
      const r=redecorateRow(row);
      if(periods.some(p=>rowInPeriod(r,p))) rows.push(r);
    }
  }
  return rows;
}

function emptyMetaIndex(){
  return {brands:[],categories:[],rawCategories:[],salesTypes:[],customerTypes:[],products:[]};
}

function mergeMetaRows(target,rows){
  const brands=new Set(target.brands||[]);
  const categories=new Set(target.categories||[]);
  const rawCategories=new Set(target.rawCategories||[]);
  const salesTypes=new Set(target.salesTypes||[]);
  const customerTypes=new Set(target.customerTypes||[]);
  const products=new Map((target.products||[]).map(p=>[`${p.sku}|${p.itemName}`,p]));

  for(const r of rows||[]){
    if(r.brand) brands.add(r.brand);
    if(r.category) categories.add(r.category);
    if(r.rawCategory) rawCategories.add(String(r.rawCategory).trim().toUpperCase());
    else if(r.category) rawCategories.add(String(r.category).trim().toUpperCase());
    if(r.salesType) salesTypes.add(r.salesType);
    if(r.customerType && r.customerType!=='UNSPECIFIED') customerTypes.add(r.customerType);

    const sku=String(r.newItemCode||r.sku||'').trim();
    const itemName=String(r.itemName||'').trim();
    if(sku || itemName){
      const key=`${sku}|${itemName}`;
      if(!products.has(key)) products.set(key,{sku,newItemCode:r.newItemCode||'',itemName,brand:r.brand||''});
    }
  }

  return {
    brands:[...brands].sort(),
    categories:[...categories].sort(),
    rawCategories:[...rawCategories].sort(),
    salesTypes:[...salesTypes].sort(),
    customerTypes:[...customerTypes].sort(),
    products:[...products.values()]
  };
}

async function rebuildMetaIndexFromMonthly() {
  let idx=emptyMetaIndex();
  for(const key of storageMonthKeys()){
    if(Number(monthIndex[key]?.rowCount||0)<=0) continue;
    const rows=await readMonthRows(key);
    if(Array.isArray(rows) && rows.length) idx=mergeMetaRows(idx,rows);
  }
  metaIndex=idx;
  await writeJsonAtomic(META_INDEX_FILE,metaIndex);
  return metaIndex;
}

async function writeMonthRows(key, rows) {
  if (!monthAllowed(key)) throw new Error(`MONTH_OUT_OF_RANGE:${key}`);
  const file=monthPath(key);
  const tmp=`${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.mkdir(path.dirname(file),{recursive:true});
  try{
    await pipeline(
      Readable.from([JSON.stringify(rows)]),
      zlib.createGzip({level:6}),
      fs.createWriteStream(tmp)
    );
    await fsp.rename(tmp,file);
    await fsp.unlink(monthJsonPath(key)).catch(()=>{});
  }catch(e){
    await fsp.unlink(tmp).catch(()=>{});
    throw e;
  }
}

async function migrateLegacyCacheIfNeeded() {
  const totals=monthIndexTotals();
  if(totals.rowCount>0) return [];

  const legacy=await readLegacyCache();
  if (!Array.isArray(legacy) || !legacy.length) return [];

  const grouped={};
  for (const r of legacy) {
    const key=monthKey(r.date);
    if (!monthAllowed(key)) continue;
    (grouped[key] ||= []).push(r);
  }

  for (const [key,rows] of Object.entries(grouped)) {
    await writeMonthRows(key, rows);
    const coverage=dataCoverage(rows);
    monthIndex[key]={
      month:key,
      rowCount:rows.length,
      minDate:coverage.minDate,
      maxDate:coverage.maxDate,
      updatedAt:null,
      uploadedBy:'system-migration',
      sourceFile:'legacy raw-cache.json'
    };
  }
  if (Object.keys(grouped).length) await writeJsonAtomic(MONTH_INDEX_FILE, monthIndex);
  return [];
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
  }

  // Backward-compatible Category mapping / Category Target migration.
  let categoryConfigChanged=false;
  config.categoryMap={...DEFAULT_CATEGORY_MAP,...(config.categoryMap||{})};
  if(!config.categoryTargets || typeof config.categoryTargets!=='object'){
    config.categoryTargets={};
    categoryConfigChanged=true;
  }
  if(!config.categorySort || typeof config.categorySort!=='object'){
    config.categorySort={...DEFAULT_CATEGORY_SORT};
    categoryConfigChanged=true;
  }else{
    config.categorySort={...DEFAULT_CATEGORY_SORT,...config.categorySort};
  }

  // Backward-compatible Store Stat migration.
  // Existing masters created before v21 are treated as Existing Store.
  let configChanged=false;
  if (!Array.isArray(config.stores)) config.stores=[];
  config.stores=config.stores.map(s=>{
    const storeStatus=String(s.storeStatus||'Existing Store').trim();
    const normalizedStatus=storeStatus==='New Store'?'New Store':'Existing Store';
    if (s.storeStatus!==normalizedStatus) configChanged=true;
    return {...s,storeStatus:normalizedStatus};
  });
  if (configChanged || categoryConfigChanged || !(await fsp.access(CONFIG_FILE).then(()=>true).catch(()=>false))) {
    await writeJsonAtomic(CONFIG_FILE, config);
  }

  await ensureMonthlyFolders();
  monthIndex = await readJson(MONTH_INDEX_FILE, {});
  if (!monthIndex || typeof monthIndex !== 'object' || Array.isArray(monthIndex)) monthIndex={};
  await migrateLegacyCacheIfNeeded();

  // v24 storage migration is sequential and streaming:
  // one month is compressed, verified/renamed, then the old JSON is deleted.
  await migrateMonthlyStorageToGzip();
  await compressLegacyRawCache();

  autoSyncStatus={...autoSyncStatus,...(await readJson(AUTO_SYNC_FILE,{})),running:false,configured:autoSyncConfigured()};

  runtime = await readJson(RUNTIME_FILE, runtime);
  const totals=monthIndexTotals();
  runtime = {
    updatedAt:null,
    sourceFile:null,
    rowCount:totals.rowCount,
    minDate:totals.minDate,
    maxDate:totals.maxDate,
    uploadHistory:[],
    ...(runtime||{}),
    rowCount:totals.rowCount,
    minDate:totals.minDate,
    maxDate:totals.maxDate
  };
  if (!Array.isArray(runtime.uploadHistory)) runtime.uploadHistory=[];

  metaIndex=await readJson(META_INDEX_FILE,null);
  if(!metaIndex || !Array.isArray(metaIndex.products)){
    console.log('[META] rebuilding compact metadata index from monthly files...');
    await rebuildMetaIndexFromMonthly();
  }
  if(!Array.isArray(metaIndex.rawCategories)){
    metaIndex.rawCategories=[...new Set([
      ...Object.keys(config.categoryMap||{}),
      ...(metaIndex.categories||[])
    ].map(x=>String(x).trim().toUpperCase()).filter(Boolean))].sort();
    await writeJsonAtomic(META_INDEX_FILE,metaIndex);
  }

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
  if (exact) return { name: exact.name, pt: exact.pt, storeStatus: exact.storeStatus==='New Store'?'New Store':'Existing Store' };
  let name = String(rawName || '').replace(/^Apotek Wellings\s+/i, '').replace(/^SLOC Shopee\s+/i, '').trim().toUpperCase();
  const byName = config.stores.find(s => s.active && s.name.toUpperCase() === name);
  return {
    name: byName ? byName.name : name,
    pt: byName ? byName.pt : 'UNMAPPED',
    storeStatus: byName && byName.storeStatus==='New Store' ? 'New Store' : 'Existing Store'
  };
}

function effectiveStoreStatus(r) {
  const byName=config.stores.find(s=>s.active && String(s.name).toUpperCase()===String(r.store||'').toUpperCase());
  if (byName) return byName.storeStatus==='New Store'?'New Store':'Existing Store';
  return r.storeStat==='New Store'?'New Store':'Existing Store';
}

function mapCategory(raw) {
  const key = String(raw ?? '').trim().toUpperCase();
  return config.categoryMap[key] || key || 'OTHER';
}

function effectiveCategory(r) {
  return mapCategory(r.rawCategory !== undefined && r.rawCategory !== null ? r.rawCategory : r.category);
}

function knownRawCategories() {
  return [...new Set([
    ...Object.keys(DEFAULT_CATEGORY_MAP),
    ...Object.keys(config.categoryMap||{}),
    ...(metaIndex.rawCategories||[]),
    ...(metaIndex.categories||[])
  ].map(x=>String(x).trim().toUpperCase()).filter(Boolean))].sort();
}

function mappedCategoryList() {
  return [...new Set(knownRawCategories().map(mapCategory).filter(Boolean))]
    .sort((a,b)=>{
      const sa=Number(config.categorySort?.[a] ?? 9999);
      const sb=Number(config.categorySort?.[b] ?? 9999);
      return sa-sb || a.localeCompare(b);
    });
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
    storeStat: store.storeStatus,
    channel: canonicalChannel(rawChannel),
    // Canonical dashboard SKU is new_item_code.
    sku: String(r.new_item_code || r.old_item_code || '').trim(),
    newItemCode: String(r.new_item_code || '').trim(),
    itemName: String(r.item_name || '').trim(),
    unitCode: String(r.unit_code || '').trim(),
    brand: String(r.brand || '').trim() || 'UNBRANDED',
    rawCategory: String(r.category_2 ?? '').trim().toUpperCase(),
    category: mapCategory(r.category_2),
    customerType: String(r.customer_type || '').trim() || 'UNSPECIFIED',
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
  const fileOut=fs.createWriteStream(tmp);
  const out=zlib.createGzip({level:6});
  out.pipe(fileOut);

  let headerMap=null;
  let rawRowsCount=0, validRows=0, written=0;
  let minDate=null, maxDate=null;
  const detectedMonths=new Set();
  const channelSummary={};
  let selectedFound=false;

  const required=['transaction_date','invoice_no','store_location','item_name','brand','category_2','customer_type','trader_check','sub_total'];
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
          customer_type:get('customer_type'),
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
      let settled=false;
      const fail=e=>{if(!settled){settled=true;reject(e)}};
      fileOut.once('error',fail);
      out.once('error',fail);
      fileOut.once('finish',()=>{if(!settled){settled=true;resolve()}});
      out.end();
    });
    await fsp.rename(tmp,targetFile);
    // Remove the pre-v24 uncompressed copy only after compressed file succeeds.
    await fsp.unlink(monthJsonPath(targetMonth)).catch(()=>{});

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
    try { fileOut.destroy(); } catch {}
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
  const rawCategory=r.rawCategory!==undefined?r.rawCategory:r.category;
  return {
    ...r,
    rawStore,
    rawChannel,
    rawCategory,
    category:mapCategory(rawCategory),
    store:store.name,
    pt:store.pt,
    storeStat:store.storeStatus,
    channel:canonicalChannel(rawChannel)
  };
}

async function redecorateAllRows() {
  // v22: no bulk rewrite.
  // Store / PT / Store Stat / Channel master changes are applied dynamically
  // when a monthly file is read for a dashboard query.
  return;
}

function filterBase(sourceRows, filters = {}) {
  const stores = arr(filters.stores).map(x => x.toUpperCase());
  const pts = arr(filters.pts).map(x => x.toUpperCase());
  const categories = arr(filters.categories).map(x => x.toUpperCase());
  const brands = arr(filters.brands).map(x => x.toUpperCase());
  const salesTypes = arr(filters.salesTypes).map(x => x.toUpperCase());
  const customerTypes = arr(filters.customerTypes).map(x => x.toUpperCase());
  const storeStats = arr(filters.storeStats).map(x => x.toUpperCase());
  const channels = arr(filters.channels).map(x => x.toUpperCase());
  const product = String(filters.product || '').trim().toUpperCase();
  return sourceRows.filter(r => {
    if (stores.length && !stores.includes(String(r.store).toUpperCase())) return false;
    if (pts.length && !pts.includes(String(r.pt).toUpperCase())) return false;
    if (categories.length && !categories.includes(effectiveCategory(r).toUpperCase())) return false;
    if (brands.length && !brands.includes(String(r.brand).toUpperCase())) return false;
    if (salesTypes.length && !salesTypes.includes(String(r.salesType).toUpperCase())) return false;
    if (customerTypes.length && !customerTypes.includes(String(r.customerType || 'UNSPECIFIED').toUpperCase())) return false;
    if (storeStats.length && !storeStats.includes(effectiveStoreStatus(r).toUpperCase())) return false;
    if (channels.length && !channels.includes(String(r.channel).toUpperCase())) return false;
    if (product && !(`${r.sku} ${r.newItemCode} ${r.itemName}`.toUpperCase().includes(product))) return false;
    return true;
  });
}

function metrics(rows) {
  let sales = 0, qty = 0;
  const invoices = new Set();
  for (const r of rows) {
    sales += safeNum(r.sales);
    qty += safeNum(r.qty);
    if (r.invoice) invoices.add(r.invoice);
  }
  const trx = invoices.size;
  return {
    sales,
    qty,
    trx,
    basket: trx ? sales / trx : 0,
    basketQty: trx ? qty / trx : 0
  };
}

function metricsByPeriod(rows, periods) {
  return periods.map(p => metrics(rows.filter(r => rowInPeriod(r,p))));
}

// Detail Trx & Basket Size ---------------------------------------------------
// Basket bands are intentionally user-configurable. A range (`-`) includes
// both endpoints, while > / >= / < / <= follow their mathematical meaning.
// We reject any overlapping bands so one transaction can never be counted in
// two rows. Example: >125000 + 100000-125000 is valid, but >=125000 +
// 100000-125000 is rejected because both rows would include exactly 125000.
function normalizeBasketBands(input,showRows){
  const n=Math.max(1,Math.min(10,Number(showRows)||1));
  if(!Array.isArray(input) || input.length<n) throw new Error('BASKET_BANDS_INCOMPLETE');

  const allowed=new Set(['gt','gte','range','lt','lte']);
  const bands=[];
  for(let i=0;i<n;i++){
    const src=input[i]||{};
    const type=String(src.type||'').trim();
    if(!allowed.has(type)) throw new Error(`BASKET_BAND_TYPE_INVALID_ROW_${i+1}`);

    const num=v=>{
      if(v==='' || v===null || v===undefined) return null;
      const x=Number(v);
      return Number.isFinite(x) && x>=0 ? x : null;
    };

    if(type==='range'){
      const min=num(src.min),max=num(src.max);
      if(min===null || max===null) throw new Error(`BASKET_BAND_VALUE_REQUIRED_ROW_${i+1}`);
      if(min>max) throw new Error(`BASKET_BAND_RANGE_INVALID_ROW_${i+1}`);
      bands.push({type,min,max,minInclusive:true,maxInclusive:true});
    }else{
      const value=num(src.value);
      if(value===null) throw new Error(`BASKET_BAND_VALUE_REQUIRED_ROW_${i+1}`);
      if(type==='gt') bands.push({type,value,min:value,max:Infinity,minInclusive:false,maxInclusive:false});
      if(type==='gte')bands.push({type,value,min:value,max:Infinity,minInclusive:true,maxInclusive:false});
      if(type==='lt') bands.push({type,value,min:-Infinity,max:value,minInclusive:false,maxInclusive:false});
      if(type==='lte')bands.push({type,value,min:-Infinity,max:value,minInclusive:false,maxInclusive:true});
    }
  }

  const contains=(band,x)=>{
    if(x<band.min || x>band.max)return false;
    if(x===band.min && !band.minInclusive)return false;
    if(x===band.max && !band.maxInclusive)return false;
    return true;
  };
  const overlaps=(a,b)=>{
    const lo=Math.max(a.min,b.min),hi=Math.min(a.max,b.max);
    if(lo<hi)return true;
    if(lo>hi)return false;
    return contains(a,lo) && contains(b,lo);
  };

  for(let i=0;i<bands.length;i++){
    for(let j=i+1;j<bands.length;j++){
      if(overlaps(bands[i],bands[j])){
        const err=new Error(`BASKET_BANDS_OVERLAP_ROW_${i+1}_${j+1}`);
        err.rows=[i+1,j+1];
        throw err;
      }
    }
  }
  return bands;
}

function basketBandMatches(band,value){
  if(band.type==='gt')return value>band.value;
  if(band.type==='gte')return value>=band.value;
  if(band.type==='lt')return value<band.value;
  if(band.type==='lte')return value<=band.value;
  return value>=band.min && value<=band.max;
}

function basketBandPublic(band){
  if(band.type==='range')return {type:band.type,min:band.min,max:band.max};
  return {type:band.type,value:band.value};
}

function basketSizeDetailQuery(sourceRows,periods,filters,bandsInput,showRows){
  const base=filterBase(sourceRows,filters);
  const bands=normalizeBasketBands(bandsInput,showRows);

  // Build basket value per invoice separately for each comparison period.
  // This mirrors the dashboard's existing basket-size definition:
  // total filtered `sales` (sub_total_inv fallback sub_total) / unique invoice.
  const invoiceMaps=periods.map(()=>new Map());
  for(const r of base){
    if(!r.invoice)continue;
    for(let i=0;i<periods.length;i++){
      if(!rowInPeriod(r,periods[i]))continue;
      const map=invoiceMaps[i];
      map.set(r.invoice,(map.get(r.invoice)||0)+safeNum(r.sales));
    }
  }

  const totals=invoiceMaps.map(m=>m.size);
  const basketSizes=invoiceMaps.map(map=>{
    if(!map.size)return 0;
    let sales=0;
    for(const value of map.values())sales+=safeNum(value);
    return sales/map.size;
  });
  const rows=bands.map((band,index)=>({
    index:index+1,
    band:basketBandPublic(band),
    periods:invoiceMaps.map((map,pi)=>{
      let trx=0;
      for(const basket of map.values())if(basketBandMatches(band,basket))trx++;
      return {trx,pct:pct(trx,totals[pi])};
    })
  }));

  const classified=periods.map((_,pi)=>rows.reduce((sum,r)=>sum+safeNum(r.periods[pi]?.trx),0));
  return {
    rows,
    totals,
    classified,
    unclassified:totals.map((n,i)=>Math.max(0,n-classified[i])),
    basketSizes,
    showRows:bands.length
  };
}

function channelQuery(sourceRows, periods, filters) {
  const base = filterBase(sourceRows,filters);
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


function isoDatesInclusive(start,end){
  const out=[];
  let d=new Date(`${start}T00:00:00Z`);
  const last=new Date(`${end}T00:00:00Z`);
  while(d<=last){
    out.push(d.toISOString().slice(0,10));
    d=new Date(d.getTime()+86400000);
  }
  return out;
}

function dailyTrendQuery(sourceRows,period,filters,metricMode='value'){
  const mode=metricMode==='qty'?'qty':'value';
  const requestedChannels=arr(filters.channels).map(x=>x.toUpperCase());
  const channels=activeChannels()
    .filter(c=>!requestedChannels.length || requestedChannels.includes(String(c.name).toUpperCase()))
    .map(c=>c.name);

  const allowedChannels=new Set(channels.map(x=>String(x).toUpperCase()));
  const base=filterBase(sourceRows,filters)
    .filter(r=>rowInPeriod(r,period))
    .filter(r=>allowedChannels.has(String(r.channel).toUpperCase()));

  const dates=isoDatesInclusive(period.start,period.end);
  const byDate=new Map();
  for(const date of dates){
    const values={};
    for(const c of channels)values[c]=0;
    byDate.set(date,{date,values,total:0});
  }

  const totals={};
  for(const c of channels)totals[c]=0;
  let grandTotal=0;

  for(const r of base){
    const rec=byDate.get(r.date);
    if(!rec)continue;
    const value=mode==='qty'?safeNum(r.qty):safeNum(r.sales);
    rec.values[r.channel]=(rec.values[r.channel]||0)+value;
    rec.total+=value;
    totals[r.channel]=(totals[r.channel]||0)+value;
    grandTotal+=value;
  }

  const dayCount=Math.max(1,dates.length);
  const averages={};
  for(const c of channels)averages[c]=safeNum(totals[c])/dayCount;

  return {
    period,
    metricMode:mode,
    channels,
    rows:dates.map(d=>byDate.get(d)),
    totals,
    grandTotal,
    averages,
    averageGrandTotal:grandTotal/dayCount,
    dayCount
  };
}

function targetQuery(sourceRows, period, filters, daysTotalBestEstimate) {
  const base = filterBase(sourceRows,filters).filter(r => rowInPeriod(r,period));
  const key = monthKey(period.end);
  const targetMap = config.targets[key] || {};
  const elapsedDays = daysInclusive(period.start, period.end);
  const calendarDays = daysInMonth(period.end);

  let bestEstDays = Number(daysTotalBestEstimate);
  if (!Number.isFinite(bestEstDays) || bestEstDays <= 0) bestEstDays = calendarDays;
  bestEstDays = Math.max(0.5, Math.min(31.5, bestEstDays));

  // Time Factor (MTD) stays based on normal calendar days.
  const factor = elapsedDays / calendarDays;

  // BEST EST uses the effective total days entered by the user.
  // Example Sep 1-10, BE Days 20 => Actual / 10 * 20.
  const bestEstFactor = elapsedDays > 0 ? bestEstDays / elapsedDays : 0;

  const channels = activeChannels();
  const rows = channels.map(c => {
    const actual = metrics(base.filter(r => r.channel === c.name));
    const target = safeNum(targetMap[c.name]);
    const mtdTarget = target * factor;
    const bestEst = actual.sales * bestEstFactor;
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
    month: key, factor, elapsedDays, calendarDays, bestEstDays, bestEstFactor, rows,
    total: { actual: totalActual.sales, target: totalTarget, mtdTarget: totalMtdTarget, achieve: pct(totalActual.sales,totalTarget), achieveMtd: pct(totalActual.sales,totalMtdTarget), bestEst: totalBestEst },
    telemed: { actual: teleActual, target: teleTarget, mtdTarget: teleMtdTarget, bestEst: teleBestEst, pctActual: pct(teleActual,totalActual.sales), pctTarget: pct(teleTarget,totalTarget), pctBestEst: pct(teleBestEst,totalBestEst), varianceTarget: teleActual-teleTarget, varianceMtd: teleActual-teleMtdTarget, achieveTarget: pct(teleActual,teleTarget), achieveMtd: pct(teleActual,teleMtdTarget) }
  };
}


function targetCategoryQuery(sourceRows, period, filters, daysTotalBestEstimate) {
  const key=monthKey(period.end);
  const targetMap=config.categoryTargets?.[key]||{};
  const elapsedDays=daysInclusive(period.start,period.end);
  const calendarDays=daysInMonth(period.end);

  let bestEstDays=Number(daysTotalBestEstimate);
  if(!Number.isFinite(bestEstDays) || bestEstDays<=0) bestEstDays=calendarDays;
  bestEstDays=Math.max(0.5,Math.min(31.5,bestEstDays));

  const factor=elapsedDays/calendarDays;
  const bestEstFactor=elapsedDays>0?bestEstDays/elapsedDays:0;

  // TOTAL SALES ignores only the Category filter.
  // Date, Channel, Store, Sales Type, Customer Type and Store Stat still apply.
  const totalFilters={...(filters||{})};
  delete totalFilters.categories;

  const baseAll=filterBase(sourceRows,totalFilters).filter(r=>rowInPeriod(r,period));
  const baseSelected=filterBase(sourceRows,filters||{}).filter(r=>rowInPeriod(r,period));

  const allCategories=mappedCategoryList();
  const selectedFilter=arr(filters?.categories).map(x=>String(x).toUpperCase());
  const selectedCategories=selectedFilter.length
    ? allCategories.filter(c=>selectedFilter.includes(String(c).toUpperCase()))
    : allCategories;

  const onlineChannels=new Set(
    activeChannels()
      .filter(c=>c.telemed)
      .map(c=>c.name)
  );

  function onlineOffline(rows){
    let onlineSales=0,offlineSales=0;
    for(const r of rows){
      if(onlineChannels.has(r.channel)) onlineSales+=safeNum(r.sales);
      else offlineSales+=safeNum(r.sales);
    }
    return {onlineSales,offlineSales};
  }

  const rows=selectedCategories.map(category=>{
    const rr=baseSelected.filter(r=>effectiveCategory(r)===category);
    const actual=metrics(rr);
    const target=safeNum(targetMap[category]);
    const mtdTarget=target*factor;
    const bestEst=actual.sales*bestEstFactor;
    const split=onlineOffline(rr);
    return {
      category,
      sort:Number(config.categorySort?.[category] ?? 9999),
      actual,
      target,
      mtdTarget,
      achieve:pct(actual.sales,target),
      achieveMtd:pct(actual.sales,mtdTarget),
      offlineSales:split.offlineSales,
      onlineSales:split.onlineSales,
      bestEst,
      contribution:null
    };
  });

  const totalSalesActual=metrics(baseAll);
  const totalSalesSplit=onlineOffline(baseAll);
  const totalSalesTarget=allCategories.reduce((a,c)=>a+safeNum(targetMap[c]),0);
  const totalSalesMtdTarget=totalSalesTarget*factor;
  const totalSalesBestEst=totalSalesActual.sales*bestEstFactor;

  for(const r of rows){
    r.contribution=pct(r.actual.sales,totalSalesActual.sales);
  }

  const categoryActual=metrics(baseSelected);
  const categorySplit=onlineOffline(baseSelected);
  const categoryTarget=selectedCategories.reduce((a,c)=>a+safeNum(targetMap[c]),0);
  const categoryMtdTarget=categoryTarget*factor;
  const categoryBestEst=categoryActual.sales*bestEstFactor;

  const totalSales={
    actual:totalSalesActual.sales,
    target:totalSalesTarget,
    mtdTarget:totalSalesMtdTarget,
    achieve:pct(totalSalesActual.sales,totalSalesTarget),
    achieveMtd:pct(totalSalesActual.sales,totalSalesMtdTarget),
    offlineSales:totalSalesSplit.offlineSales,
    onlineSales:totalSalesSplit.onlineSales,
    bestEst:totalSalesBestEst,
    contribution:totalSalesActual.sales?1:null
  };

  const totalCategory={
    actual:categoryActual.sales,
    target:categoryTarget,
    mtdTarget:categoryMtdTarget,
    achieve:pct(categoryActual.sales,categoryTarget),
    achieveMtd:pct(categoryActual.sales,categoryMtdTarget),
    offlineSales:categorySplit.offlineSales,
    onlineSales:categorySplit.onlineSales,
    bestEst:categoryBestEst,
    contribution:pct(categoryActual.sales,totalSalesActual.sales),
    varianceTarget:categoryActual.sales-categoryTarget,
    varianceMtd:categoryActual.sales-categoryMtdTarget
  };

  const categoryPct={
    actual:pct(totalCategory.actual,totalSales.actual),
    target:pct(totalCategory.target,totalSales.target),
    mtdTarget:pct(totalCategory.mtdTarget,totalSales.mtdTarget),
    bestEst:pct(totalCategory.bestEst,totalSales.bestEst)
  };

  return {
    month:key,
    factor,
    elapsedDays,
    calendarDays,
    bestEstDays,
    rows,
    totalSales,
    totalCategory,
    categoryPct
  };
}

function storeQuery(sourceRows, periods, filters, metricMode='value') {
  const base = filterBase(sourceRows,filters);
  const active = config.stores.filter(s=>s.active);
  const unique = new Map();
  for (const s of active) if (!unique.has(s.name)) unique.set(s.name, {
    name:s.name,
    pt:s.pt,
    storeStat:s.storeStatus==='New Store'?'New Store':'Existing Store'
  });
  let stores = [...unique.values()];
  const pts = arr(filters.pts).map(x=>x.toUpperCase());
  const names = arr(filters.stores).map(x=>x.toUpperCase());
  const storeStats = arr(filters.storeStats).map(x=>x.toUpperCase());
  if (pts.length) stores = stores.filter(s=>pts.includes(s.pt.toUpperCase()));
  if (names.length) stores = stores.filter(s=>names.includes(s.name.toUpperCase()));
  if (storeStats.length) stores = stores.filter(s=>storeStats.includes(s.storeStat.toUpperCase()));
  const rows = stores.map(s=>({ store:s.name, pt:s.pt, storeStat:s.storeStat, periods:metricsByPeriod(base.filter(r=>r.store===s.name),periods) }));
  const total = metricsByPeriod(base.filter(r=>stores.some(s=>s.name===r.store)),periods);
  const variance = periods.map((_,i)=> i===periods.length-1 ? null : ({
    sales: total[i].sales-total[i+1].sales,
    qty: total[i].qty-total[i+1].qty,
    trx: total[i].trx-total[i+1].trx,
    basket: total[i].basket-total[i+1].basket,
    basketQty: total[i].basketQty-total[i+1].basketQty,
    salesPct: diffPct(total[i].sales,total[i+1].sales),
    qtyPct: diffPct(total[i].qty,total[i+1].qty),
    trxPct: diffPct(total[i].trx,total[i+1].trx),
    basketPct: diffPct(total[i].basket,total[i+1].basket),
    basketQtyPct: diffPct(total[i].basketQty,total[i+1].basketQty)
  }));
  const avgPerDay = total.map((m,i)=>({
    sales:m.sales/daysInclusive(periods[i].start,periods[i].end),
    qty:m.qty/daysInclusive(periods[i].start,periods[i].end),
    trx:m.trx/daysInclusive(periods[i].start,periods[i].end),
    basket:m.basket,
    basketQty:m.basketQty
  }));
  const allowedStoreNames=new Set(stores.map(s=>s.name));
  const scoped=base.filter(r=>allowedStoreNames.has(r.store));

  const ptTotals = ['EFM','EFIT','ESB'].map(pt=>({
    pt,
    periods:metricsByPeriod(scoped.filter(r=>r.pt===pt), periods)
  }));

  const ptBreakdown = ['EFM','EFIT','ESB'].map(pt=>{
    const rr=scoped.filter(r=>r.pt===pt);
    return {
      pt,
      total:metricsByPeriod(rr,periods),
      existing:metricsByPeriod(rr.filter(r=>r.storeStat==='Existing Store'),periods),
      newStore:metricsByPeriod(rr.filter(r=>r.storeStat==='New Store'),periods)
    };
  });

  const storeStatTotals={
    existing:metricsByPeriod(scoped.filter(r=>r.storeStat==='Existing Store'),periods),
    newStore:metricsByPeriod(scoped.filter(r=>r.storeStat==='New Store'),periods)
  };

  return {
    rows,total,variance,avgPerDay,ptTotals,ptBreakdown,storeStatTotals,
    metricMode:metricMode==='qty'?'qty':'value'
  };
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) { const k=keyFn(r); if (!map.has(k)) map.set(k, []); map.get(k).push(r); }
  return map;
}

function brandQuery(sourceRows, periods, filters, topN, metricMode='value') {
  const base=filterBase(sourceRows,filters);
  const metricKey=metricMode==='qty'?'qty':'sales';
  const brands=groupBy(base,r=>r.brand||'UNBRANDED');
  let rows=[...brands.entries()].map(([brand,rr])=>({brand,periods:metricsByPeriod(rr,periods)}));
  rows.sort((a,b)=>safeNum(b.periods[0][metricKey])-safeNum(a.periods[0][metricKey]));
  const totalAll=metricsByPeriod(base,periods);
  const shown=rows.slice(0,topN);
  const totalDisplayed=periods.map((_,i)=>({
    sales:shown.reduce((a,x)=>a+safeNum(x.periods[i].sales),0),
    qty:shown.reduce((a,x)=>a+safeNum(x.periods[i].qty),0),
    trx:0,basket:0,basketQty:0
  }));
  return {
    metricMode:metricMode==='qty'?'qty':'value',
    rows:shown.map(x=>({
      ...x,
      growthP1:x.periods[1]?safeNum(x.periods[0][metricKey])-safeNum(x.periods[1][metricKey]):null,
      growthP2:x.periods[2]?safeNum(x.periods[0][metricKey])-safeNum(x.periods[2][metricKey]):null,
      share:pct(safeNum(x.periods[0][metricKey]),safeNum(totalAll[0][metricKey]))
    })),
    totalAll,
    totalDisplayed,
    displayedShare:totalDisplayed.map((m,i)=>pct(safeNum(m[metricKey]),safeNum(totalAll[i][metricKey])))
  };
}

function itemQuery(sourceRows, periods, filters, topN, metricMode='value') {
  const base=filterBase(sourceRows,filters);
  const metricKey=metricMode==='qty'?'qty':'sales';
  const hasP1=periods.length>1;
  const groups=groupBy(base,r=>`${String(r.newItemCode||r.sku||'').trim()}|||${r.itemName}|||${r.brand}`);
  const all=[...groups.entries()].map(([key,rr])=>{
    const [sku,itemName,brand]=key.split('|||');
    const m=metricsByPeriod(rr,periods);
    return {
      sku,itemName,brand,periods:m,
      growthP1:m[1]?safeNum(m[0][metricKey])-safeNum(m[1][metricKey]):null,
      growthP2:m[2]?safeNum(m[0][metricKey])-safeNum(m[2][metricKey]):null
    };
  });

  const topGrowth=hasP1
    ? [...all].sort((a,b)=>safeNum(b.growthP1)-safeNum(a.growthP1)).slice(0,topN)
    : [...all].sort((a,b)=>safeNum(b.periods[0]?.[metricKey])-safeNum(a.periods[0]?.[metricKey])).slice(0,topN);

  const topDecline=hasP1
    ? [...all].sort((a,b)=>safeNum(a.growthP1)-safeNum(b.growthP1)).slice(0,topN)
    : [];

  const totalAll=metricsByPeriod(base,periods);
  function summarize(list){
    const totalDisplayed=periods.map((_,i)=>({
      sales:list.reduce((a,x)=>a+safeNum(x.periods[i]?.sales),0),
      qty:list.reduce((a,x)=>a+safeNum(x.periods[i]?.qty),0),
      trx:0,basket:0,basketQty:0
    }));
    return {
      rows:list,
      totalDisplayed,
      displayedShare:totalDisplayed.map((m,i)=>pct(safeNum(m[metricKey]),safeNum(totalAll[i]?.[metricKey])))
    };
  }
  return {
    metricMode:metricMode==='qty'?'qty':'value',
    currentOnly:!hasP1,
    topGrowth:summarize(topGrowth),
    topDecline:summarize(topDecline),
    totalAll
  };
}



function dominantUnitCode(rows,period){
  const counts=new Map();
  for(const r of rows){
    if(!rowInPeriod(r,period))continue;
    const code=String(r.unitCode||'').trim();
    if(!code)continue;
    counts.set(code,(counts.get(code)||0)+1);
  }
  let best='',bestN=0;
  for(const [code,n] of counts){
    if(n>bestN){best=code;bestN=n;}
  }
  return best;
}

function itemSalesQuery(sourceRows,periods,filters,topN,metricMode='value'){
  const base=filterBase(sourceRows,filters);
  const metricKey=metricMode==='qty'?'qty':'sales';
  const groups=groupBy(
    base,
    r=>`${String(r.newItemCode||r.sku||'').trim()}|||${r.itemName}|||${r.brand}`
  );

  let rows=[...groups.entries()].map(([key,rr])=>{
    const [sku,itemName,brand]=key.split('|||');
    const metrics=metricsByPeriod(rr,periods);

    // Historical normalized month files created before V37 did not retain
    // raw `unit_code`. Prefer the exact unit_code from each period; when a
    // previous month has no stored unit_code, use the same SKU's unit_code
    // from the current raw period. Future month refreshes keep the exact
    // raw unit_code per period.
    const currentUnitCode=dominantUnitCode(rr,periods[0]);

    return {
      sku,itemName,brand,
      periods:metrics.map((m,i)=>({
        ...m,
        unitCode:dominantUnitCode(rr,periods[i]) || currentUnitCode
      }))
    };
  });

  rows.sort((a,b)=>
    safeNum(b.periods[0]?.[metricKey])-safeNum(a.periods[0]?.[metricKey])
  );

  const shown=rows.slice(0,topN);
  const totalAll=metricsByPeriod(base,periods);
  const totalDisplayed=periods.map((_,i)=>({
    sales:shown.reduce((a,x)=>a+safeNum(x.periods[i]?.sales),0),
    qty:shown.reduce((a,x)=>a+safeNum(x.periods[i]?.qty),0),
    trx:0,basket:0,basketQty:0
  }));

  return {
    metricMode:metricMode==='qty'?'qty':'value',
    rows:shown,
    totalAll,
    totalDisplayed,
    displayedShare:totalDisplayed.map((m,i)=>
      pct(safeNum(m[metricKey]),safeNum(totalAll[i]?.[metricKey]))
    )
  };
}



// Pivot Analysis -------------------------------------------------------------
// V51: lightweight server-side pivot builder. The browser sends only the
// selected fields/filters and receives aggregated results; raw transaction
// rows are never sent to the client.
const PIVOT_ROW_FIELDS = new Set([
  'channel','store','category','brand','salesType','customerType',
  'storeStat','sku','itemName','unitCode','date'
]);
const PIVOT_COLUMN_FIELDS = new Set([
  'period','channel','store','category','brand','salesType',
  'customerType','storeStat'
]);
const PIVOT_VALUE_FIELDS = new Set(['sales','trx','qty','basket']);
const PIVOT_MAX_ROW_GROUPS = 5000;
const PIVOT_MAX_LEAF_COLUMNS = 60;
const PIVOT_MAX_SHOW_ROWS = 100;

const PIVOT_FIELD_LABELS = {
  channel:'Channel',
  store:'Store',
  category:'Category',
  brand:'Brand',
  salesType:'Sales Type',
  customerType:'Customer Type',
  storeStat:'Store Stat',
  sku:'SKU',
  itemName:'Item Name',
  unitCode:'Unit Code',
  date:'Date',
  period:'Period',
  sales:'Sales',
  trx:'Trx',
  qty:'Qty',
  basket:'Basket Size'
};

function pivotFieldLabel(field){
  return PIVOT_FIELD_LABELS[field] || String(field||'');
}

function pivotDimensionValue(r,field){
  switch(field){
    case 'channel': return String(r.channel||'UNSPECIFIED');
    case 'store': return String(r.store||'UNSPECIFIED');
    case 'category': return String(effectiveCategory(r)||'UNSPECIFIED');
    case 'brand': return String(r.brand||'UNBRANDED');
    case 'salesType': return String(r.salesType||'Regular');
    case 'customerType': return String(r.customerType||'UNSPECIFIED');
    case 'storeStat': return String(effectiveStoreStatus(r)||'Existing Store');
    case 'sku': return String(r.newItemCode||r.sku||'').trim() || '(BLANK SKU)';
    case 'itemName': return String(r.itemName||'').trim() || '(BLANK ITEM)';
    case 'unitCode': return String(r.unitCode||'').trim() || '(BLANK UNIT)';
    case 'date': return String(r.date||'');
    default: return '';
  }
}

function newPivotAgg(){
  return {sales:0,qty:0,invoices:new Set()};
}

function addPivotAgg(agg,r){
  agg.sales += safeNum(r.sales);
  agg.qty += safeNum(r.qty);
  if(r.invoice) agg.invoices.add(String(r.invoice));
}

function pivotAggValue(agg,metric){
  if(!agg) return 0;
  const trx=agg.invoices ? agg.invoices.size : Number(agg.trx||0);
  if(metric==='sales') return safeNum(agg.sales);
  if(metric==='qty') return safeNum(agg.qty);
  if(metric==='trx') return trx;
  if(metric==='basket') return trx ? safeNum(agg.sales)/trx : 0;
  return 0;
}

function pivotAggPlain(agg){
  const trx=agg?.invoices?.size || 0;
  const sales=safeNum(agg?.sales);
  const qty=safeNum(agg?.qty);
  return {sales,qty,trx,basket:trx?sales/trx:0};
}

function pivotRowKey(values){
  return JSON.stringify(values);
}

function normalizePivotRequest(body){
  const rowFields=(Array.isArray(body.rowFields)?body.rowFields:[])
    .map(x=>String(x||'').trim())
    .filter(Boolean);
  if(rowFields.length<1 || rowFields.length>2) throw new Error('PIVOT_ROW_FIELDS_INVALID');
  if(new Set(rowFields).size!==rowFields.length) throw new Error('PIVOT_ROW_FIELDS_DUPLICATE');
  if(rowFields.some(x=>!PIVOT_ROW_FIELDS.has(x))) throw new Error('PIVOT_ROW_FIELD_NOT_ALLOWED');

  const columnField=String(body.columnField||'period').trim();
  if(!PIVOT_COLUMN_FIELDS.has(columnField)) throw new Error('PIVOT_COLUMN_FIELD_NOT_ALLOWED');

  const valueFields=(Array.isArray(body.valueFields)?body.valueFields:[])
    .map(x=>String(x||'').trim())
    .filter(Boolean);
  if(valueFields.length<1 || valueFields.length>2) throw new Error('PIVOT_VALUE_FIELDS_INVALID');
  if(new Set(valueFields).size!==valueFields.length) throw new Error('PIVOT_VALUE_FIELDS_DUPLICATE');
  if(valueFields.some(x=>!PIVOT_VALUE_FIELDS.has(x))) throw new Error('PIVOT_VALUE_FIELD_NOT_ALLOWED');

  const showRows=Math.max(10,Math.min(PIVOT_MAX_SHOW_ROWS,Number(body.showRows)||25));
  return {rowFields,columnField,valueFields,showRows};
}

function pivotAnalysisQuery(sourceRows,periods,filters,request){
  const {rowFields,columnField,valueFields,showRows}=normalizePivotRequest(request||{});
  const base=filterBase(sourceRows,filters||{});
  const firstMetric=valueFields[0];

  // Pass 1: rank row groups using the Current period only. This avoids
  // materialising a huge row x column matrix merely to find the top rows.
  const rowRank=new Map();
  for(const r of base){
    if(!rowInPeriod(r,periods[0])) continue;
    const values=rowFields.map(f=>pivotDimensionValue(r,f));
    const key=pivotRowKey(values);
    let entry=rowRank.get(key);
    if(!entry){
      if(rowRank.size>=PIVOT_MAX_ROW_GROUPS){
        throw new Error(
          `Pivot menghasilkan lebih dari ${PIVOT_MAX_ROW_GROUPS.toLocaleString('en-US')} row group. `+
          `Tambahkan filter atau gunakan Row Field yang lebih ringkas.`
        );
      }
      entry={key,values,agg:newPivotAgg()};
      rowRank.set(key,entry);
    }
    addPivotAgg(entry.agg,r);
  }

  const ranked=[...rowRank.values()]
    .sort((a,b)=>{
      const av=pivotAggValue(a.agg,firstMetric);
      const bv=pivotAggValue(b.agg,firstMetric);
      if(bv!==av)return bv-av;
      return a.values.join(' | ').localeCompare(b.values.join(' | '),undefined,{numeric:true,sensitivity:'base'});
    });

  const selectedRows=ranked.slice(0,showRows);
  const selectedRowKeys=new Set(selectedRows.map(x=>x.key));

  // Rank dimension values for the optional Column Field. A dynamic cap keeps
  // the final table under the leaf-column budget (max 60 numeric columns).
  let columnValues=[];
  let columnValueCountAll=0;
  let columnTruncated=false;

  if(columnField!=='period'){
    const colRank=new Map();
    for(const r of base){
      if(!rowInPeriod(r,periods[0])) continue;
      const value=pivotDimensionValue(r,columnField);
      let agg=colRank.get(value);
      if(!agg){
        agg=newPivotAgg();
        colRank.set(value,agg);
      }
      addPivotAgg(agg,r);
    }

    const rankedCols=[...colRank.entries()]
      .sort((a,b)=>{
        const av=pivotAggValue(a[1],firstMetric);
        const bv=pivotAggValue(b[1],firstMetric);
        if(bv!==av)return bv-av;
        return String(a[0]).localeCompare(String(b[0]),undefined,{numeric:true,sensitivity:'base'});
      });

    columnValueCountAll=rankedCols.length;
    const maxColumnValues=Math.max(
      1,
      Math.min(
        20,
        Math.floor(PIVOT_MAX_LEAF_COLUMNS / Math.max(1,periods.length*valueFields.length))
      )
    );
    columnValues=rankedCols.slice(0,maxColumnValues).map(x=>x[0]);
    columnTruncated=rankedCols.length>columnValues.length;
  }

  const selectedColumnSet=new Set(columnValues);
  const cellMap=new Map();
  const grandMap=new Map();
  const displayedMap=new Map();

  function cellKey(rowKey,colValue,pi){
    return `${rowKey}\u001f${colValue}\u001f${pi}`;
  }
  function totalKey(colValue,pi){
    return `${colValue}\u001f${pi}`;
  }
  function getAgg(map,key){
    let agg=map.get(key);
    if(!agg){agg=newPivotAgg();map.set(key,agg);}
    return agg;
  }

  // Pass 2: build only selected row groups and selected column values.
  // A row is evaluated independently against every selected period so custom
  // overlapping periods behave the same as the other dashboard sections.
  for(const r of base){
    const rowValues=rowFields.map(f=>pivotDimensionValue(r,f));
    const rKey=pivotRowKey(rowValues);

    for(let pi=0;pi<periods.length;pi++){
      if(!rowInPeriod(r,periods[pi]))continue;

      const colValue=columnField==='period'
        ? `p${pi}`
        : pivotDimensionValue(r,columnField);

      // Grand total follows the same visible column scope. If the column field
      // had to be truncated, omitted column values are reported in metadata.
      if(columnField==='period' || selectedColumnSet.has(colValue)){
        addPivotAgg(getAgg(grandMap,totalKey(colValue,pi)),r);
      }

      if(!selectedRowKeys.has(rKey))continue;
      if(columnField!=='period' && !selectedColumnSet.has(colValue))continue;

      addPivotAgg(getAgg(cellMap,cellKey(rKey,colValue,pi)),r);
      addPivotAgg(getAgg(displayedMap,totalKey(colValue,pi)),r);
    }
  }

  const columnGroups=[];
  if(columnField==='period'){
    for(let pi=0;pi<periods.length;pi++){
      columnGroups.push({
        key:`p${pi}`,
        label:pi===0?'Current':`Previous ${pi}`,
        periodIndex:pi,
        period:periods[pi],
        dimensionValue:null
      });
    }
  }else{
    for(const value of columnValues){
      for(let pi=0;pi<periods.length;pi++){
        columnGroups.push({
          key:`${value}\u001f${pi}`,
          label:String(value),
          periodIndex:pi,
          period:periods[pi],
          dimensionValue:String(value)
        });
      }
    }
  }

  const rows=selectedRows.map(entry=>{
    const cells={};
    if(columnField==='period'){
      for(let pi=0;pi<periods.length;pi++){
        const agg=cellMap.get(cellKey(entry.key,`p${pi}`,pi));
        cells[`p${pi}`]=pivotAggPlain(agg);
      }
    }else{
      for(const value of columnValues){
        for(let pi=0;pi<periods.length;pi++){
          const agg=cellMap.get(cellKey(entry.key,value,pi));
          cells[`${value}\u001f${pi}`]=pivotAggPlain(agg);
        }
      }
    }
    return {key:entry.key,labels:entry.values,cells};
  });

  function totalsFromMap(map){
    const out={};
    if(columnField==='period'){
      for(let pi=0;pi<periods.length;pi++){
        out[`p${pi}`]=pivotAggPlain(map.get(totalKey(`p${pi}`,pi)));
      }
    }else{
      for(const value of columnValues){
        for(let pi=0;pi<periods.length;pi++){
          out[`${value}\u001f${pi}`]=pivotAggPlain(map.get(totalKey(value,pi)));
        }
      }
    }
    return out;
  }

  return {
    rowFields,
    rowFieldLabels:rowFields.map(pivotFieldLabel),
    columnField,
    columnFieldLabel:pivotFieldLabel(columnField),
    valueFields,
    valueFieldLabels:valueFields.map(pivotFieldLabel),
    periods,
    columnGroups,
    columnValues,
    rows,
    totalRowGroups:ranked.length,
    shownRowGroups:rows.length,
    rowTruncated:ranked.length>rows.length,
    columnValueCountAll,
    columnValueCountShown:columnField==='period'?periods.length:columnValues.length,
    columnTruncated,
    displayedTotal:totalsFromMap(displayedMap),
    grandTotal:totalsFromMap(grandMap),
    limits:{
      maxRowGroups:PIVOT_MAX_ROW_GROUPS,
      maxLeafColumns:PIVOT_MAX_LEAF_COLUMNS,
      maxShowRows:PIVOT_MAX_SHOW_ROWS
    }
  };
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


function envText(name, fallback=''){
  const v=process.env[name];
  return v===undefined || v===null ? fallback : String(v).trim();
}

function metabaseSettings(){
  return {
    baseUrl:envText('METABASE_URL','https://wrpt.rcloud.id').replace(/\/+$/,''),
    username:envText('METABASE_USERNAME'),
    password:envText('METABASE_PASSWORD'),
    questionId:envText('METABASE_QUESTION_ID','364'),
    startParamId:envText('METABASE_START_PARAM_ID','686090f7-5f68-4cbf-bd75-b10ef09f4781'),
    endParamId:envText('METABASE_END_PARAM_ID','8d7c1ee3-44a3-45e3-b056-dfb1fc99ca76'),
    triggerSecret:envText('AUTO_SYNC_SECRET')
  };
}

function autoSyncConfigured(){
  const s=metabaseSettings();
  // V36: manual-only Metabase update from authenticated Admin RUN NOW.
  return !!(s.baseUrl && s.username && s.password && s.questionId);
}


function isSchedulerTrigger(trigger){
  return ['github-actions','github-backup','cron-primary','external-scheduler'].includes(String(trigger||''));
}

function jakartaDateTimeParts(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Jakarta',
    year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',
    hourCycle:'h23'
  }).formatToParts(date).reduce((a,p)=>{
    if(p.type!=='literal')a[p.type]=p.value;
    return a;
  },{});
  return {
    year:Number(parts.year),
    month:Number(parts.month),
    day:Number(parts.day),
    hour:Number(parts.hour),
    minute:Number(parts.minute),
    second:Number(parts.second),
    isoDate:`${parts.year}-${parts.month}-${parts.day}`
  };
}

function currentSchedulerSlot(date=new Date()){
  const p=jakartaDateTimeParts(date);
  const slots=[0,6,12,18];
  let hour=18;
  let slotDate=p.isoDate;

  const eligible=slots.filter(h=>h<=p.hour);
  if(eligible.length){
    hour=eligible[eligible.length-1];
  }else{
    // Only theoretical for malformed formatter output. Keep safe fallback.
    hour=0;
  }

  const hh=String(hour).padStart(2,'0');
  return {
    key:`${slotDate}@${hh}:00`,
    date:slotDate,
    hour,
    label:`${hh}:00 WIB`
  };
}

function normalizedSchedulerSource(req){
  const raw=String(
    req.headers['x-scheduler-source'] ||
    req.body?.source ||
    ''
  ).trim().toLowerCase();

  if(raw==='cron-primary')return 'cron-primary';
  if(raw==='github-backup')return 'github-backup';

  // Backward compatibility with the previous workflow.
  if(raw==='github-actions')return 'github-actions';

  return 'external-scheduler';
}

function publicAutoSyncStatus(){
  const s=metabaseSettings();
  return {
    ...autoSyncStatus,
    running:!!autoSyncStatus.running,
    configured:autoSyncConfigured(),
    source:s.questionId?`Metabase Question ${s.questionId} • CSV Streaming`:'Metabase • CSV Streaming',
    metabaseHost:(()=>{try{return new URL(s.baseUrl).host}catch{return ''}})(),
    schedule:'Manual — Admin RUN NOW',
    timezone:'Asia/Jakarta',
    dateRule:'Default: bulan berjalan • Manual: 1 bulan',
    sessionReuse:{
      enabled:true,
      persistent:true,
      encrypted:true,
      lastAuthMode:autoSyncStatus.lastAuthMode||null
    },
    credentialState:{
      url:!!s.baseUrl,
      username:!!s.username,
      password:!!s.password,
      questionId:!!s.questionId,
      triggerSecret:!!s.triggerSecret
    }
  };
}

async function persistAutoSyncStatus(){
  const safe={...autoSyncStatus,running:false,configured:autoSyncConfigured()};
  await writeJsonAtomic(AUTO_SYNC_FILE,safe);
}

function bearerSecret(req){
  const h=String(req.headers.authorization||'');
  return h.startsWith('Bearer ')?h.slice(7).trim():'';
}

function secretsEqual(a,b){
  const aa=Buffer.from(String(a||'')),bb=Buffer.from(String(b||''));
  if(!aa.length || aa.length!==bb.length)return false;
  return crypto.timingSafeEqual(aa,bb);
}

function metabaseSessionKey(){
  // Optional dedicated key; otherwise reuse the already-secret JWT_SECRET.
  const seed=envText('METABASE_SESSION_KEY') || JWT_SECRET;
  return crypto.createHash('sha256').update(`metabase-session-v33|${seed}`).digest();
}

function metabaseSessionFingerprint(settings){
  return crypto
    .createHash('sha256')
    .update(`${settings.baseUrl}|${String(settings.username||'').trim().toLowerCase()}`)
    .digest('hex');
}

function encryptSessionPayload(payload){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',metabaseSessionKey(),iv);
  const encrypted=Buffer.concat([
    cipher.update(JSON.stringify(payload),'utf8'),
    cipher.final()
  ]);
  const tag=cipher.getAuthTag();

  return {
    v:1,
    alg:'aes-256-gcm',
    iv:iv.toString('base64'),
    tag:tag.toString('base64'),
    data:encrypted.toString('base64')
  };
}

function decryptSessionPayload(box){
  if(!box || box.v!==1 || box.alg!=='aes-256-gcm') {
    throw new Error('Unsupported session cache format');
  }
  const decipher=crypto.createDecipheriv(
    'aes-256-gcm',
    metabaseSessionKey(),
    Buffer.from(box.iv,'base64')
  );
  decipher.setAuthTag(Buffer.from(box.tag,'base64'));
  const plain=Buffer.concat([
    decipher.update(Buffer.from(box.data,'base64')),
    decipher.final()
  ]);
  return JSON.parse(plain.toString('utf8'));
}

async function saveMetabaseSession(sessionId,settings){
  const payload={
    sessionId,
    createdAt:new Date().toISOString(),
    fingerprint:metabaseSessionFingerprint(settings)
  };
  const encrypted=encryptSessionPayload(payload);
  await writeJsonAtomic(METABASE_SESSION_FILE,encrypted);
  await fsp.chmod(METABASE_SESSION_FILE,0o600).catch(()=>{});
  metabaseSessionMemory=payload;
  console.log('[METABASE_SESSION] new session saved to encrypted persistent cache');
}

async function clearMetabaseSession(reason=''){
  metabaseSessionMemory=null;
  await fsp.unlink(METABASE_SESSION_FILE).catch(()=>{});
  if(reason)console.log(`[METABASE_SESSION] cached session cleared: ${reason}`);
}

async function loadMetabaseSession(settings){
  const expected=metabaseSessionFingerprint(settings);

  if(
    metabaseSessionMemory?.sessionId &&
    metabaseSessionMemory.fingerprint===expected
  ){
    return metabaseSessionMemory;
  }

  try{
    const box=await readJson(METABASE_SESSION_FILE,null);
    if(!box)return null;

    const payload=decryptSessionPayload(box);
    if(
      !payload?.sessionId ||
      payload.fingerprint!==expected
    ){
      await clearMetabaseSession('account/base URL changed');
      return null;
    }

    metabaseSessionMemory=payload;
    console.log('[METABASE_SESSION] restored encrypted session from persistent volume');
    return payload;
  }catch(e){
    console.warn(`[METABASE_SESSION] could not restore cached session: ${e.message}`);
    await clearMetabaseSession('cache unreadable or encryption key changed');
    return null;
  }
}

async function metabaseLogin(settings){
  const r=await fetch(`${settings.baseUrl}/api/session`,{
    method:'POST',
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({username:settings.username,password:settings.password}),
    signal:AbortSignal.timeout(60000)
  });
  if(!r.ok){
    const txt=(await r.text().catch(()=>'' )).slice(0,300);
    const e=new Error(`METABASE_LOGIN_FAILED (${r.status})${txt?': '+txt:''}`);
    e.statusCode=r.status;
    throw e;
  }
  const d=await r.json();
  if(!d?.id)throw new Error('METABASE_LOGIN_FAILED: session id not returned');

  await saveMetabaseSession(d.id,settings);
  return d.id;
}

async function getMetabaseSession(settings,{forceLogin=false}={}){
  if(!forceLogin){
    const cached=await loadMetabaseSession(settings);
    if(cached?.sessionId){
      console.log('[METABASE_SESSION] reusing cached session; no new login');
      return {sessionId:cached.sessionId,authMode:'cached-session'};
    }
  }

  if(forceLogin){
    await clearMetabaseSession('forced refresh after rejected session');
  }

  const sessionId=await metabaseLogin(settings);
  return {
    sessionId,
    authMode:forceLogin?'refreshed-login':'new-login'
  };
}

function autoSyncDateRange(){
  const t=jakartaTodayParts();
  return {
    startDate:`${t.monthKey}-01`,
    endDate:t.iso,
    targetMonth:t.monthKey
  };
}


function resolveAutoSyncDateRange(requested){
  if(!requested || requested.mode!=='manual'){
    return autoSyncDateRange();
  }

  const startDate=String(requested.startDate||'').trim();
  const endDate=String(requested.endDate||'').trim();

  if(!validDate(startDate) || !validDate(endDate)){
    const e=new Error('MANUAL_PERIOD_INVALID. Start Date and End Date are required.');
    e.statusCode=400;
    throw e;
  }
  if(startDate>endDate){
    const e=new Error('MANUAL_PERIOD_INVALID. Start Date cannot be after End Date.');
    e.statusCode=400;
    throw e;
  }

  const startMonth=monthKey(startDate);
  const endMonth=monthKey(endDate);
  if(startMonth!==endMonth){
    const e=new Error('MANUAL_PERIOD_MUST_BE_ONE_MONTH. Select dates inside one calendar month only.');
    e.statusCode=400;
    throw e;
  }
  if(!monthAllowed(startMonth)){
    const e=new Error(`AUTO_SYNC_MONTH_OUT_OF_RANGE:${startMonth}`);
    e.statusCode=400;
    throw e;
  }

  const today=jakartaTodayParts();
  if(startDate>today.iso || endDate>today.iso){
    const e=new Error(`MANUAL_PERIOD_FUTURE_NOT_ALLOWED. Latest allowed date is ${today.iso}.`);
    e.statusCode=400;
    throw e;
  }

  // Monthly storage is REPLACE-by-month. To protect historical data from
  // accidental partial replacement, historical manual refreshes must cover
  // the complete calendar month.
  if(startDate.slice(8,10)!=='01'){
    const e=new Error('MANUAL_PERIOD_START_MUST_BE_DAY_1. Monthly storage replaces the whole selected month.');
    e.statusCode=400;
    throw e;
  }

  if(startMonth<today.monthKey){
    const lastDay=String(daysInMonth(startDate)).padStart(2,'0');
    const expectedEnd=`${startMonth}-${lastDay}`;
    if(endDate!==expectedEnd){
      const e=new Error(`HISTORICAL_MONTH_REQUIRES_FULL_MONTH. Select ${startMonth}-01 through ${expectedEnd} because the selected month will be replaced completely.`);
      e.statusCode=400;
      throw e;
    }
  }

  return {
    startDate,
    endDate,
    targetMonth:startMonth,
    manual:true
  };
}

function metabaseParameters(settings,startDate,endDate){
  return [
    {
      id:settings.startParamId,
      type:'date/single',
      target:['variable',['template-tag','start_date']],
      value:startDate
    },
    {
      id:settings.endParamId,
      type:'date/single',
      target:['variable',['template-tag','end_date']],
      value:endDate
    }
  ];
}


function createMetaAccumulator(){
  return {
    brands:new Set(),
    categories:new Set(),
    rawCategories:new Set(),
    salesTypes:new Set(),
    customerTypes:new Set(),
    products:new Map()
  };
}

function addMetaAccumulator(acc,r){
  if(r.brand)acc.brands.add(r.brand);
  if(r.category)acc.categories.add(r.category);
  if(r.rawCategory)acc.rawCategories.add(String(r.rawCategory).trim().toUpperCase());
  if(r.salesType)acc.salesTypes.add(r.salesType);
  if(r.customerType && r.customerType!=='UNSPECIFIED')acc.customerTypes.add(r.customerType);

  const sku=String(r.newItemCode||r.sku||'').trim();
  const itemName=String(r.itemName||'').trim();
  if(sku || itemName){
    const key=`${sku}|${itemName}`;
    if(!acc.products.has(key)){
      acc.products.set(key,{
        sku,
        newItemCode:r.newItemCode||'',
        itemName,
        brand:r.brand||''
      });
    }
  }
}

function mergeMetaAccumulator(target,acc){
  const brands=new Set(target.brands||[]);
  const categories=new Set(target.categories||[]);
  const rawCategories=new Set(target.rawCategories||[]);
  const salesTypes=new Set(target.salesTypes||[]);
  const customerTypes=new Set(target.customerTypes||[]);
  const products=new Map((target.products||[]).map(p=>[`${p.sku}|${p.itemName}`,p]));

  for(const x of acc.brands)brands.add(x);
  for(const x of acc.categories)categories.add(x);
  for(const x of acc.rawCategories)rawCategories.add(x);
  for(const x of acc.salesTypes)salesTypes.add(x);
  for(const x of acc.customerTypes)customerTypes.add(x);
  for(const [k,p] of acc.products){
    if(!products.has(k))products.set(k,p);
  }

  return {
    brands:[...brands].sort(),
    categories:[...categories].sort(),
    rawCategories:[...rawCategories].sort(),
    salesTypes:[...salesTypes].sort(),
    customerTypes:[...customerTypes].sort(),
    products:[...products.values()]
  };
}

// RFC4180-compatible streaming parser.
// Keeps only one field + one row in memory and handles quoted commas,
// escaped quotes, CRLF, embedded newlines and UTF-8 chunk boundaries.
async function* csvRowsFromReadable(readable){
  const decoder=new TextDecoder('utf-8');
  let field='';
  let row=[];
  let state='OUT'; // OUT, IN_QUOTE, AFTER_QUOTE

  async function* consume(text){
    for(let i=0;i<text.length;i++){
      const c=text[i];

      if(state==='IN_QUOTE'){
        if(c==='"')state='AFTER_QUOTE';
        else field+=c;
        continue;
      }

      if(state==='AFTER_QUOTE'){
        if(c==='"'){
          field+='"';
          state='IN_QUOTE';
        }else if(c===','){
          row.push(field);
          field='';
          state='OUT';
        }else if(c==='\n'){
          row.push(field);
          field='';
          const finished=row;
          row=[];
          state='OUT';
          yield finished;
        }else if(c==='\r'){
          // Ignore CR in CRLF after a closing quote.
        }else{
          // Lenient fallback for non-standard characters after a quote.
          field+=c;
          state='OUT';
        }
        continue;
      }

      // OUT
      if(c==='"' && field.length===0){
        state='IN_QUOTE';
      }else if(c===','){
        row.push(field);
        field='';
      }else if(c==='\n'){
        row.push(field);
        field='';
        const finished=row;
        row=[];
        yield finished;
      }else if(c==='\r'){
        // Ignore CR; LF completes the row.
      }else{
        field+=c;
      }
    }
  }

  for await(const chunk of readable){
    const text=decoder.decode(chunk,{stream:true});
    for await(const r of consume(text))yield r;
  }

  const tail=decoder.decode();
  if(tail){
    for await(const r of consume(tail))yield r;
  }

  if(state==='AFTER_QUOTE')state='OUT';
  if(field.length || row.length){
    row.push(field);
    yield row;
  }
}

async function openMetabaseCsv(settings,sessionId,startDate,endDate){
  // IMPORTANT: Metabase export parameters must be sent as
  // application/x-www-form-urlencoded (or JSON), not multipart/form-data.
  // The browser request captured in DevTools is URL-encoded.
  const body=new URLSearchParams();
  body.set('parameters',JSON.stringify(metabaseParameters(settings,startDate,endDate)));
  // false keeps raw numeric/date values and avoids localized display formatting.
  body.set('format_rows','false');
  body.set('pivot_results','false');

  const r=await fetch(`${settings.baseUrl}/api/card/${encodeURIComponent(settings.questionId)}/query/csv`,{
    method:'POST',
    headers:{
      'X-Metabase-Session':sessionId,
      'Accept':'text/csv,application/csv,text/plain',
      'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body:body.toString(),
    signal:AbortSignal.timeout(10*60*1000)
  });

  if(!r.ok){
    const txt=(await r.text().catch(()=>'' )).slice(0,500);
    const e=new Error(`METABASE_CSV_FAILED (${r.status})${txt?': '+txt:''}`);
    e.statusCode=r.status;
    throw e;
  }
  if(!r.body)throw new Error('METABASE_CSV_FAILED: empty response');

  return r;
}

async function openMetabaseCsvWithSessionReuse(settings,startDate,endDate){
  let auth=await getMetabaseSession(settings);

  try{
    const response=await openMetabaseCsv(
      settings,auth.sessionId,startDate,endDate
    );
    return {response,authMode:auth.authMode};
  }catch(e){
    if(e.statusCode!==401 && e.statusCode!==403)throw e;

    console.warn(
      `[METABASE_SESSION] cached session rejected with HTTP ${e.statusCode}; logging in once to refresh`
    );

    auth=await getMetabaseSession(settings,{forceLogin:true});
    const response=await openMetabaseCsv(
      settings,auth.sessionId,startDate,endDate
    );
    return {response,authMode:'refreshed-login'};
  }
}

async function streamReplaceMonthFromMetabaseCsv(webBody,targetMonth){
  const targetFile=monthPath(targetMonth);
  await fsp.mkdir(path.dirname(targetFile),{recursive:true});

  const tmp=`${targetFile}.${process.pid}.${Date.now()}.auto.tmp`;
  const fileOut=fs.createWriteStream(tmp);
  const gzip=zlib.createGzip({level:6});
  gzip.pipe(fileOut);

  let header=null;
  let rawRowsCount=0;
  let validRows=0;
  let validTargetRows=0;
  let ignoredOtherMonthRows=0;
  let written=0;
  let minDate=null;
  let maxDate=null;
  const detectedMonths=new Set();
  const channelSummary={};
  const metaAcc=createMetaAccumulator();

  const required=['transaction_date','invoice_no','store_location','item_name','brand','category_2','customer_type','trader_check','sub_total'];
  const channelColumns=['telemed_check','TELEMED','telemed','channel_dashboard','channel_type'];

  try{
    await writeWithBackpressure(gzip,'[');

    const readable=Readable.fromWeb(webBody);

    for await(const cells of csvRowsFromReadable(readable)){
      if(!header){
        header=cells.map((x,i)=>{
          let s=String(x??'').trim();
          if(i===0)s=s.replace(/^\uFEFF/,'');
          return s;
        });

        const set=new Set(header);
        const hasRequired=required.every(k=>set.has(k));
        const hasChannel=channelColumns.some(k=>set.has(k));
        if(!hasRequired || !hasChannel){
          throw new Error(
            `RAW_FORMAT_INVALID. CSV required columns: ${required.join(', ')}. `+
            `Channel column: one of ${channelColumns.join(', ')}. `+
            `Received: ${header.join(', ')}`
          );
        }
        continue;
      }

      // Skip fully empty rows.
      if(!cells.some(v=>String(v??'').trim()!==''))continue;

      rawRowsCount++;
      const raw={};
      for(let i=0;i<header.length;i++){
        raw[header[i]]=cells[i]??'';
      }

      const n=normalizeRow(raw);
      if(!(n.date && n.invoice && n.channel))continue;

      validRows++;
      const mk=monthKey(n.date);
      detectedMonths.add(mk);

      // Safety fallback: never write a different month into the selected
      // monthly folder, even if the upstream export ignores parameters.
      if(mk!==targetMonth){
        ignoredOtherMonthRows++;
        continue;
      }

      validTargetRows++;
      if(!minDate || n.date<minDate)minDate=n.date;
      if(!maxDate || n.date>maxDate)maxDate=n.date;
      channelSummary[n.channel]=(channelSummary[n.channel]||0)+1;
      addMetaAccumulator(metaAcc,n);

      await writeWithBackpressure(gzip,(written?',':'')+JSON.stringify(n));
      written++;
    }

    if(!header)throw new Error('RAW_FORMAT_INVALID. Metabase CSV has no header row.');
    if(!validRows)throw new Error(`NO_VALID_ROWS. Parsed rows=${rawRowsCount}, valid rows=0.`);

    const months=[...detectedMonths].sort();
    if(!validTargetRows){
      throw new Error(
        `MONTH_NOT_FOUND. Selected ${targetMonth}, but Metabase returned: ${months.join(', ')}.`
      );
    }

    if(ignoredOtherMonthRows>0){
      console.warn(
        `[AUTO_SYNC] upstream returned extra months (${months.join(', ')}); `+
        `ignored ${ignoredOtherMonthRows} rows outside ${targetMonth}`
      );
    }

    await writeWithBackpressure(gzip,']');

    await new Promise((resolve,reject)=>{
      let settled=false;
      const fail=e=>{if(!settled){settled=true;reject(e)}};
      fileOut.once('error',fail);
      gzip.once('error',fail);
      fileOut.once('finish',()=>{if(!settled){settled=true;resolve()}});
      gzip.end();
    });

    await fsp.rename(tmp,targetFile);
    await fsp.unlink(monthJsonPath(targetMonth)).catch(()=>{});

    return {
      rawRows:rawRowsCount,
      validRows:validTargetRows,
      validRowsAllMonths:validRows,
      ignoredOtherMonthRows,
      minDate,
      maxDate,
      detectedMonths:months,
      channelSummary,
      metaAcc
    };
  }catch(e){
    try{gzip.destroy()}catch{}
    try{fileOut.destroy()}catch{}
    await fsp.unlink(tmp).catch(()=>{});
    throw e;
  }
}


async function downloadMetabaseXlsx(settings,sessionId,startDate,endDate,targetFile){
  const body=new URLSearchParams();
  body.set('parameters',JSON.stringify(metabaseParameters(settings,startDate,endDate)));
  body.set('format_rows','true');
  body.set('pivot_results','false');

  const r=await fetch(`${settings.baseUrl}/api/card/${encodeURIComponent(settings.questionId)}/query/xlsx`,{
    method:'POST',
    headers:{
      'X-Metabase-Session':sessionId,
      'Accept':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream',
      'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body:body.toString(),
    signal:AbortSignal.timeout(10*60*1000)
  });

  if(!r.ok){
    const txt=(await r.text().catch(()=>'' )).slice(0,500);
    throw new Error(`METABASE_XLSX_FAILED (${r.status})${txt?': '+txt:''}`);
  }
  if(!r.body)throw new Error('METABASE_XLSX_FAILED: empty response');

  await pipeline(Readable.fromWeb(r.body),fs.createWriteStream(targetFile));

  const st=await fsp.stat(targetFile);
  if(st.size<1000)throw new Error(`METABASE_XLSX_INVALID: file too small (${st.size} bytes)`);

  const fd=await fsp.open(targetFile,'r');
  try{
    const sig=Buffer.alloc(4);
    await fd.read(sig,0,4,0);
    // XLSX is a ZIP file: PK\x03\x04 or an empty ZIP variant.
    if(sig[0]!==0x50 || sig[1]!==0x4b){
      throw new Error('METABASE_XLSX_INVALID: response is not an XLSX/ZIP file');
    }
  }finally{
    await fd.close();
  }

  return {
    fileSize:st.size,
    contentDisposition:r.headers.get('content-disposition')||''
  };
}

async function finalizeAutomatedMonthReplace(targetMonth,sourceFile,fileSize,streamed,trigger){
  const replacedRows=Number(monthIndex[targetMonth]?.rowCount||0);
  const now=new Date().toISOString();

  monthIndex[targetMonth]={
    month:targetMonth,
    rowCount:streamed.validRows,
    minDate:streamed.minDate,
    maxDate:streamed.maxDate,
    updatedAt:now,
    uploadedBy:'AUTO SYNC',
    sourceFile,
    fileSize:Number(fileSize||0)
  };
  await writeJsonAtomic(MONTH_INDEX_FILE,monthIndex);

  if(streamed.metaAcc){
    metaIndex=mergeMetaAccumulator(metaIndex,streamed.metaAcc);
    await writeJsonAtomic(META_INDEX_FILE,metaIndex);
  }

  const coverage=monthIndexTotals();
  const entry={
    id:crypto.randomUUID(),
    uploadedAt:now,
    uploadedBy:'AUTO SYNC',
    sourceFile,
    mode:'metabase_auto_sync',
    trigger,
    targetMonth,
    detectedStart:streamed.minDate,
    detectedEnd:streamed.maxDate,
    incomingRows:streamed.validRows,
    replacedRows,
    totalRows:coverage.rowCount
  };

  runtime={
    ...(runtime||{}),
    updatedAt:now,
    sourceFile,
    rowCount:coverage.rowCount,
    minDate:coverage.minDate,
    maxDate:coverage.maxDate,
    lastUpload:entry,
    uploadHistory:Array.isArray(runtime.uploadHistory)?runtime.uploadHistory:[]
  };
  appendUploadHistory(entry);
  await writeJsonAtomic(RUNTIME_FILE,runtime);
  invalidateQueryCache();

  return {entry,coverage,replacedRows};
}

async function runMetabaseAutoSync(trigger='manual', schedulerSlotKey=null, requestedRange=null){
  if(autoSyncStatus.running) {
    const e=new Error('AUTO_SYNC_ALREADY_RUNNING');
    e.statusCode=409;
    throw e;
  }
  if(dataWriteBusy){
    const e=new Error(`DATA_WRITE_BUSY${dataWriteOwner?`: ${dataWriteOwner}`:''}`);
    e.statusCode=409;
    throw e;
  }

  const settings=metabaseSettings();
  if(!autoSyncConfigured()){
    const e=new Error('AUTO_SYNC_NOT_CONFIGURED. Add METABASE_USERNAME and METABASE_PASSWORD in Railway Variables.');
    e.statusCode=503;
    throw e;
  }

  const range=resolveAutoSyncDateRange(requestedRange);
  if(!monthAllowed(range.targetMonth)){
    const e=new Error(`AUTO_SYNC_MONTH_OUT_OF_RANGE:${range.targetMonth}`);
    e.statusCode=400;
    throw e;
  }

  const schedulerTrigger=isSchedulerTrigger(trigger);
  const schedulerSlot=schedulerTrigger
    ? (schedulerSlotKey || currentSchedulerSlot().key)
    : null;

  const started=Date.now();
  const attemptAt=new Date().toISOString();
  autoSyncStatus={
    ...autoSyncStatus,
    running:true,
    configured:true,
    lastAttemptAt:attemptAt,
    lastResult:'RUNNING',
    lastError:null,
    lastStartDate:range.startDate,
    lastEndDate:range.endDate,
    lastTargetMonth:range.targetMonth,
    lastTrigger:trigger,
    ...(schedulerTrigger?{
      lastSchedulerAttemptAt:attemptAt,
      lastSchedulerResult:'RUNNING',
      lastSchedulerError:null,
      lastSchedulerSlotAttempt:schedulerSlot,
      lastSchedulerSource:trigger
    }:{})
  };
  dataWriteBusy=true;
  dataWriteOwner=`auto-sync:${trigger}`;

  try{
    console.log(`[AUTO_SYNC] start trigger=${trigger} range=${range.startDate}..${range.endDate} export=csv-stream-urlencoded`);

    const {response,authMode}=await openMetabaseCsvWithSessionReuse(
      settings,range.startDate,range.endDate
    );

    console.log(`[AUTO_SYNC] Metabase auth=${authMode}`);
    console.log('[AUTO_SYNC] Metabase CSV stream opened; parsing row-by-row');

    const streamed=await streamReplaceMonthFromMetabaseCsv(
      response.body,range.targetMonth
    );

    const sourceFile=`Metabase Q${settings.questionId} ${range.startDate} to ${range.endDate}.csv`;
    const contentLength=Number(response.headers.get('content-length')||0);
    const finalized=await finalizeAutomatedMonthReplace(
      range.targetMonth,sourceFile,contentLength,streamed,trigger
    );

    const durationMs=Date.now()-started;
    autoSyncStatus={
      ...autoSyncStatus,
      running:false,
      configured:true,
      lastSuccessAt:new Date().toISOString(),
      lastResult:'SUCCESS',
      lastError:null,
      lastStartDate:range.startDate,
      lastEndDate:range.endDate,
      lastTargetMonth:range.targetMonth,
      lastRows:streamed.validRows,
      lastReplacedRows:finalized.replacedRows,
      lastTotalRows:finalized.coverage.rowCount,
      lastDurationMs:durationMs,
      lastTrigger:trigger,
      lastSourceFile:sourceFile,
      lastAuthMode:authMode,
      ...(schedulerTrigger?{
        lastSchedulerSuccessAt:new Date().toISOString(),
        lastSchedulerResult:'SUCCESS',
        lastSchedulerError:null,
        lastSchedulerDurationMs:durationMs,
        lastSchedulerSlotSuccess:schedulerSlot,
        lastSchedulerSource:trigger
      }:{})
    };
    await persistAutoSyncStatus();

    console.log(`[AUTO_SYNC] success target=${range.targetMonth} rows=${streamed.validRows} durationMs=${durationMs}`);

    return {
      ok:true,
      result:'SUCCESS',
      startDate:range.startDate,
      endDate:range.endDate,
      targetMonth:range.targetMonth,
      rows:streamed.validRows,
      rawRows:streamed.rawRows,
      durationMs,
      sourceFile,
      replacedRows:finalized.replacedRows,
      totalRows:finalized.coverage.rowCount
    };
  }catch(e){
    autoSyncStatus={
      ...autoSyncStatus,
      running:false,
      configured:autoSyncConfigured(),
      lastResult:'FAILED',
      lastError:String(e.message||e).slice(0,800),
      lastDurationMs:Date.now()-started,
      lastTrigger:trigger,
      ...(schedulerTrigger?{
        lastSchedulerResult:'FAILED',
        lastSchedulerError:String(e.message||e).slice(0,500),
        lastSchedulerDurationMs:Date.now()-started,
        lastSchedulerSlotAttempt:schedulerSlot,
        lastSchedulerSource:trigger
      }:{})
    };
    await persistAutoSyncStatus().catch(()=>{});
    console.error(`[AUTO_SYNC] failed trigger=${trigger}:`,e.message);
    throw e;
  }finally{
    dataWriteBusy=false;
    dataWriteOwner=null;
  }
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
  const stores=[...new Map(config.stores.filter(s=>s.active).map(s=>[s.name,{
    name:s.name,
    pt:s.pt,
    storeStat:s.storeStatus==='New Store'?'New Store':'Existing Store'
  }])).values()].sort((a,b)=>a.name.localeCompare(b.name));

  const totals=monthIndexTotals();

  res.json({
    channels:activeChannels().map(c=>c.name),
    stores,
    pts:['EFM','EFIT','ESB'],
    storeStats:['Existing Store','New Store'],
    categories:mappedCategoryList(),
    rawCategories:knownRawCategories(),
    categorySort:config.categorySort||{},
    brands:metaIndex.brands||[],
    salesTypes:metaIndex.salesTypes||[],
    customerTypes:metaIndex.customerTypes||[],
    rankingDefault:config.rankingDefault,
    runtime:{...(runtime||{}),rowCount:totals.rowCount,minDate:totals.minDate,maxDate:totals.maxDate},
    uploadPolicy:uploadPolicy(),
    storageRange:{start:STORAGE_START_MONTH,end:STORAGE_END_MONTH},
    monthSlots:monthSlots(),
    minDate:totals.minDate,
    maxDate:totals.maxDate
  });
});


// V36: scheduler health endpoint removed (manual RUN NOW only).
app.get('/api/meta/products', requireAuth, (req,res)=>{
  const q=String(req.query.q||'').trim().toUpperCase();
  if (q.length<2) return res.json([]);

  const out=[];
  for(const p of metaIndex.products||[]){
    if(!(`${p.sku||''} ${p.newItemCode||''} ${p.itemName||''} ${p.brand||''}`.toUpperCase().includes(q))) continue;
    out.push(p);
    if(out.length>=50) break;
  }
  res.json(out);
});

app.post('/api/query/channel', requireAuth, async (req,res)=>{
  try {
    const result=await runHeavyQuery('channel',req.body,async()=>{
      const periods=normalizePeriods(req.body.periods);
      const rows=await readRowsForPeriods(periods);
      return channelQuery(rows,periods,req.body.filters||{});
    });
    res.json(result);
  }
  catch(e){ res.status(400).json({error:e.message}); }
});

app.post('/api/query/target', requireAuth, async (req,res)=>{
  try {
    const result=await runHeavyQuery('target',req.body,async()=>{
      const period=normalizePeriods([req.body.period])[0];
      const rows=await readRowsForPeriods([period]);
      return targetQuery(rows,period,req.body.filters||{},req.body.daysTotalBestEstimate);
    });
    res.json(result);
  }
  catch(e){ res.status(400).json({error:e.message}); }
});

app.post('/api/query/target-category', requireAuth, async (req,res)=>{
  try {
    const result=await runHeavyQuery('target-category',req.body,async()=>{
      const period=normalizePeriods([req.body.period])[0];
      const rows=await readRowsForPeriods([period]);
      return targetCategoryQuery(rows,period,req.body.filters||{},req.body.daysTotalBestEstimate);
    });
    res.json(result);
  }
  catch(e){ res.status(400).json({error:e.message}); }
});


app.post('/api/query/store', requireAuth, async (req,res)=>{
  try {
    const result=await runHeavyQuery('store',req.body,async()=>{
      const periods=normalizePeriods(req.body.periods);
      const rows=await readRowsForPeriods(periods);
      return storeQuery(rows,periods,req.body.filters||{},req.body.metricMode);
    });
    res.json(result);
  }
  catch(e){ res.status(400).json({error:e.message}); }
});

app.post('/api/query/brand', requireAuth, async (req,res)=>{
  try {
    const result=await runHeavyQuery('brand',req.body,async()=>{
      const periods=normalizePeriods(req.body.periods);
      const rows=await readRowsForPeriods(periods);
      const n=Math.max(1,Math.min(10,Number(req.body.topN||config.rankingDefault||10)));
      return brandQuery(rows,periods,req.body.filters||{},n,req.body.metricMode);
    });
    res.json(result);
  }
  catch(e){ res.status(400).json({error:e.message}); }
});

app.post('/api/query/items', requireAuth, async (req,res)=>{
  try {
    const result=await runHeavyQuery('items',req.body,async()=>{
      const periods=normalizePeriods(req.body.periods);
      const rows=await readRowsForPeriods(periods);
      const n=Math.max(1,Math.min(25,Number(req.body.topN||config.rankingDefault||10)));
      return itemQuery(rows,periods,req.body.filters||{},n,req.body.metricMode);
    });
    res.json(result);
  }
  catch(e){ res.status(400).json({error:e.message}); }
});



app.post('/api/query/trx-basket-size', requireAuth, async (req,res)=>{
  try{
    const result=await runHeavyQuery('trx-basket-size',req.body,async()=>{
      const periods=normalizePeriods(req.body.periods);
      const rows=await readRowsForPeriods(periods);
      const showRows=Math.max(1,Math.min(10,Number(req.body.showRows)||3));
      return basketSizeDetailQuery(
        rows,
        periods,
        req.body.filters||{},
        req.body.bands||[],
        showRows
      );
    });
    res.json(result);
  }catch(e){
    res.status(400).json({error:e.message,rows:e.rows||undefined});
  }
});

app.post('/api/query/item-sales', requireAuth, async (req,res)=>{
  try{
    const result=await runHeavyQuery('item-sales',req.body,async()=>{
      const periods=normalizePeriods(req.body.periods);
      const rows=await readRowsForPeriods(periods);
      const n=Math.max(1,Math.min(25,Number(req.body.topN||config.rankingDefault||10)));
      return itemSalesQuery(
        rows,
        periods,
        req.body.filters||{},
        n,
        req.body.metricMode
      );
    });
    res.json(result);
  }catch(e){
    res.status(400).json({error:e.message});
  }
});



app.post('/api/query/pivot-analysis', requireAuth, async (req,res)=>{
  try{
    const result=await runHeavyQuery('pivot-analysis',req.body,async()=>{
      const periods=normalizePeriods(req.body.periods);
      const rows=await readRowsForPeriods(periods);
      return pivotAnalysisQuery(
        rows,
        periods,
        req.body.filters||{},
        req.body||{}
      );
    });
    res.json(result);
  }catch(e){
    res.status(400).json({error:e.message});
  }
});

app.post('/api/query/daily-trend', requireAuth, async (req,res)=>{
  try{
    const result=await runHeavyQuery('daily-trend',req.body,async()=>{
      const period=normalizePeriods([req.body.period])[0];
      const rows=await readRowsForPeriods([period]);
      return dailyTrendQuery(
        rows,
        period,
        req.body.filters||{},
        req.body.metricMode
      );
    });
    res.json(result);
  }catch(e){
    res.status(400).json({error:e.message});
  }
});


function noStoreApiResponse(res){
  res.set({
    'Cache-Control':'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma':'no-cache',
    'Expires':'0',
    'Surrogate-Control':'no-store'
  });
}

app.get('/api/admin/auto-sync/status', requireAdmin, (req,res)=>{
  noStoreApiResponse(res);
  res.json(publicAutoSyncStatus());
});

app.post('/api/admin/auto-sync/run', requireAdmin, (req,res)=>{
  noStoreApiResponse(res);

  try{
    // Reject duplicate/manual writes before starting a background job.
    if(autoSyncStatus.running){
      return res.status(409).json({error:'AUTO_SYNC_ALREADY_RUNNING'});
    }
    if(dataWriteBusy){
      return res.status(409).json({error:`DATA_WRITE_BUSY${dataWriteOwner?`: ${dataWriteOwner}`:''}`});
    }
    if(!autoSyncConfigured()){
      return res.status(503).json({
        error:'AUTO_SYNC_NOT_CONFIGURED. Add METABASE_USERNAME and METABASE_PASSWORD in Railway Variables.'
      });
    }

    const mode=String(req.body?.mode||'current').toLowerCase()==='manual'?'manual':'current';
    const requestedRange=mode==='manual'?{
      mode:'manual',
      startDate:String(req.body?.startDate||'').trim(),
      endDate:String(req.body?.endDate||'').trim()
    }:null;

    // Validate the requested range before returning 202 so user input errors
    // are still reported immediately. runMetabaseAutoSync validates it again.
    const range=resolveAutoSyncDateRange(requestedRange);
    if(!monthAllowed(range.targetMonth)){
      return res.status(400).json({error:`AUTO_SYNC_MONTH_OUT_OF_RANGE:${range.targetMonth}`});
    }

    const trigger=`admin:${req.user.username}`;

    // IMPORTANT: do not await this Promise. The sync can take 8+ minutes,
    // while Railway/proxy may close a long HTTP request at ~5 minutes.
    // runMetabaseAutoSync marks the server state RUNNING synchronously before
    // its first network await, then continues in the background.
    void runMetabaseAutoSync(trigger,null,requestedRange).catch(e=>{
      // runMetabaseAutoSync already stores FAILED + lastError. This catch
      // prevents an unhandled Promise rejection after the 202 response.
      console.error(`[AUTO_SYNC] background job rejected trigger=${trigger}:`,e.message);
    });

    return res.status(202).json({
      ok:true,
      accepted:true,
      result:'RUNNING',
      startDate:range.startDate,
      endDate:range.endDate,
      targetMonth:range.targetMonth,
      message:'Update Sales dimulai dan berjalan di background.'
    });
  }catch(e){
    return res.status(e.statusCode||500).json({error:e.message});
  }
});

// V36: external scheduler endpoint removed; use authenticated Admin RUN NOW only.
app.get('/api/admin/upload-policy', requireAdmin, (req,res)=>res.json(uploadPolicy()));
app.get('/api/admin/months', requireAdmin, (req,res)=>res.json({storageRange:{start:STORAGE_START_MONTH,end:STORAGE_END_MONTH}, months:monthSlots()}));

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req,file,cb)=> cb(null, /\.(xlsx|xls)$/i.test(file.originalname))
});

app.post('/api/admin/upload', requireAdmin, upload.single('file'), async (req,res)=>{
  if (!req.file) return res.status(400).json({error:'FILE_REQUIRED'});
  if(dataWriteBusy){
    await fsp.unlink(req.file.path).catch(()=>{});
    return res.status(409).json({error:`DATA_WRITE_BUSY${dataWriteOwner?`: ${dataWriteOwner}`:''}`});
  }
  dataWriteBusy=true;
  dataWriteOwner=`manual-upload:${req.user.username}`;
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

    // v22: do not concatenate historical transaction rows in memory.
    // Coverage and row count come from the monthly index.
    const freshMonth=await readMonthRows(targetMonth);
    if(Array.isArray(freshMonth) && freshMonth.length){
      metaIndex=mergeMetaRows(metaIndex,freshMonth);
      await writeJsonAtomic(META_INDEX_FILE,metaIndex);
    }
    const coverage=monthIndexTotals();

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
      totalRows:coverage.rowCount,
      monthStatusBefore:status
    };

    runtime={
      ...(runtime||{}),updatedAt:now,sourceFile:req.file.originalname,rowCount:coverage.rowCount,
      minDate:coverage.minDate,maxDate:coverage.maxDate,lastUpload:entry,
      uploadHistory:Array.isArray(runtime.uploadHistory)?runtime.uploadHistory:[]
    };
    appendUploadHistory(entry);
    await writeJsonAtomic(RUNTIME_FILE,runtime);
    invalidateQueryCache();

    res.json({
      ok:true,mode:'monthly_replace',targetMonth,
      detectedStart:incomingCoverage.minDate,detectedEnd:incomingCoverage.maxDate,
      incomingRows:streamed.validRows,replacedRows,rowCount:coverage.rowCount,
      minDate:coverage.minDate,maxDate:coverage.maxDate,month:monthIndex[targetMonth],
      monthSlots:monthSlots()
    });
  } catch(e) {
    res.status(e.statusCode||400).json({error:e.message});
  } finally {
    dataWriteBusy=false;
    dataWriteOwner=null;
    fsp.unlink(req.file.path).catch(()=>{});
  }
});

app.get('/api/admin/config', requireAdmin, (req,res)=>res.json(config));
app.put('/api/admin/config', requireAdmin, async (req,res)=>{
  const incoming=req.body||{};
  if (!Array.isArray(incoming.channels) || !Array.isArray(incoming.stores)) return res.status(400).json({error:'CONFIG_INVALID'});
  const pts=new Set(['EFM','EFIT','ESB','UNMAPPED']);
  const statuses=new Set(['Existing Store','New Store']);
  for (const s of incoming.stores) {
    if (!pts.has(String(s.pt).toUpperCase())) return res.status(400).json({error:`INVALID_PT:${s.pt}`});
    if (!statuses.has(String(s.storeStatus||'Existing Store'))) return res.status(400).json({error:`INVALID_STORE_STATUS:${s.storeStatus}`});
  }

  const normalizedStores=incoming.stores.map(s=>({
    name:String(s.name||'').trim().toUpperCase(),
    rawName:String(s.rawName||'').trim(),
    pt:String(s.pt||'UNMAPPED').toUpperCase(),
    storeStatus:String(s.storeStatus||'Existing Store')==='New Store'?'New Store':'Existing Store',
    active:!!s.active
  })).filter(s=>s.name&&s.rawName);

  // One display store may have several raw mappings. Keep one Store Stat per display store.
  const statusByStore=new Map();
  for (const s of normalizedStores) {
    if (!statusByStore.has(s.name)) statusByStore.set(s.name,s.storeStatus);
    else s.storeStatus=statusByStore.get(s.name);
  }

  config={
    channels:incoming.channels.map((c,i)=>({name:String(c.name||'').trim().toUpperCase(),rawName:String(c.rawName||c.name||'').trim().toUpperCase(),active:!!c.active,telemed:!!c.telemed,sort:Number(c.sort||i+1)})).filter(c=>c.name&&c.rawName),
    stores:normalizedStores,
    categoryMap:Object.fromEntries(Object.entries(incoming.categoryMap&&typeof incoming.categoryMap==='object'?incoming.categoryMap:{}).map(([k,v])=>[
      String(k).trim().toUpperCase(),
      String(v||k).trim().toUpperCase()
    ]).filter(([k,v])=>k&&v)),
    targets:incoming.targets&&typeof incoming.targets==='object'?incoming.targets:{},
    categoryTargets:incoming.categoryTargets&&typeof incoming.categoryTargets==='object'?incoming.categoryTargets:{},
    categorySort:Object.fromEntries(
      Object.entries(incoming.categorySort&&typeof incoming.categorySort==='object'?incoming.categorySort:{})
        .map(([k,v])=>[String(k).trim().toUpperCase(),Number(v)])
        .filter(([k,v])=>k&&Number.isFinite(v))
    ),
    rankingDefault:Math.max(1,Math.min(10,Number(incoming.rankingDefault||10)))
  };
  await writeJsonAtomic(CONFIG_FILE,config);
  invalidateQueryCache();
  // No historical rewrite required. Master mapping is applied dynamically
  // when dashboard rows are queried.
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
app.get('/trx-bs.html', async (req,res)=>{
  const user=await resolveActiveUser(readAuth(req));
  if (!user) return res.redirect('/login.html');
  res.sendFile(path.join(ROOT,'public','trx-bs.html'));
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

bootstrap().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log(`Sales dashboard running on http://0.0.0.0:${PORT} | Max upload: ${MAX_UPLOAD_MB} MB | Streaming XLSX: enabled | Sales measure: sub_total_inv | SKU: new_item_code | ZIP descriptor compatibility: enabled | Manual BE days: enabled | Customer Type + Store Stat: enabled | Memory-safe monthly queries: enabled | Category Target + Qty mode: enabled | GZIP monthly storage: enabled | Category online/offline: enabled | Query queue/cache: enabled | Metabase Manual Sync CSV-stream-urlencoded: enabled | Metabase session reuse: encrypted persistent | Daily Trend + Top Items Sales: enabled | Detail Trx & BS V50 summary/report: enabled | Pivot Analysis V51 server-side: enabled | Unit Code fallback: enabled | Scheduler: disabled | Manual RUN NOW + manual month refresh: enabled | Monthly closing: disabled`)));
