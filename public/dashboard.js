let META=null, ME=null;
const S={};
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const api=async(url,opts={})=>{const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});if(r.status===401){location.href='/login.html';throw new Error('Unauthorized')}const d=await r.json();if(!r.ok)throw new Error(d.error||'Request failed');return d};
const fmt=n=>n===null||n===undefined||!Number.isFinite(Number(n))?'-':Math.round(Number(n)).toLocaleString('en-US');
const fp=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'-':`${v>=0&&v!==0?'+':''}${(Number(v)*100).toFixed(1)}%`;
const pct=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'-':`${(Number(v)*100).toFixed(1)}%`;
// Calendar dates are date-only values. Never convert them through UTC/toISOString(),
// because users in GMT+7 can lose one day on each conversion.
const localISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const parseISO=iso=>{const [y,m,d]=String(iso).split('-').map(Number);return new Date(y,m-1,d)};
const dateLabel=iso=>parseISO(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
const rangeLabel=p=>`${dateLabel(p.start)} - ${dateLabel(p.end)}`;
const clone=o=>JSON.parse(JSON.stringify(o));

function daysInMonthISO(iso){
  const d=parseISO(iso);
  return new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
}
function periodTimeFactor(period){
  const a=parseISO(period.start),b=parseISO(period.end);
  const elapsed=Math.max(1,Math.round((b-a)/86400000)+1);
  const calendar=daysInMonthISO(period.end);
  return {elapsed,calendar,factor:elapsed/calendar};
}
function timeFactorChip(period,id='targetTimeFactor'){
  const x=periodTimeFactor(period);
  return `<span class="chip" id="${id}"><b>Time Factor (MTD):</b> ${(x.factor*100).toFixed(1)}% <span class="chip-note">(${x.elapsed}/${x.calendar} days)</span></span>`;
}

function monthRange(iso,offset=0){const d=parseISO(iso);d.setMonth(d.getMonth()+offset);const y=d.getFullYear(),m=d.getMonth();const a=new Date(y,m,1),b=new Date(y,m+1,0);return{start:localISO(a),end:localISO(b)}}

// Shift a date by calendar months while preserving the day number as far as
// the destination month allows. Example: 2026-03-31 - 1 month = 2026-02-28.
function shiftDateMonthsClamped(iso,offset){
  const [y,m,d]=String(iso).split('-').map(Number);
  const total=y*12+(m-1)+offset;
  const ty=Math.floor(total/12);
  const tm=((total%12)+12)%12;
  const lastDay=new Date(ty,tm+1,0).getDate();
  const td=Math.min(d,lastDay);
  return `${ty}-${String(tm+1).padStart(2,'0')}-${String(td).padStart(2,'0')}`;
}

function linkedPreviousPeriod(current,offset){
  return {
    start:shiftDateMonthsClamped(current.start,offset),
    end:shiftDateMonthsClamped(current.end,offset)
  };
}

function syncLinkedPreviousPeriods(section){
  const state=S[section];
  if(!state?.periods?.length)return;
  const current=state.periods[0];
  state.periods[1]=linkedPreviousPeriod(current,-1);
  state.periods[2]=linkedPreviousPeriod(current,-2);
}

function defaultPeriods(){
  const today=localISO(new Date());
  const max=META.maxDate||today;
  const current={start:max.slice(0,8)+'01',end:max};
  return [current,linkedPreviousPeriod(current,-1),linkedPreviousPeriod(current,-2)];
}
function all(arr,key){return arr.map(x=>key?x[key]:x)}

function initState(){const p=defaultPeriods();const common={
stores:all(META.stores,'name'),
categories:clone(META.categories),
brands:clone(META.brands),
salesTypes:clone(META.salesTypes),
customerTypes:clone(META.customerTypes||[]),
storeStats:clone(META.storeStats||['Existing Store','New Store']),
channels:clone(META.channels)
};
S.channel={periods:clone(p),prevCount:2,product:'',productLabel:'',filters:{stores:clone(common.stores),categories:clone(common.categories),brands:clone(common.brands),salesTypes:clone(common.salesTypes),customerTypes:clone(common.customerTypes),storeStats:clone(common.storeStats)}};
S.target={period:clone(p[0]),bestEstDays:daysInMonthISO(p[0].end),bestEstMonth:p[0].end.slice(0,7),filters:{channels:clone(common.channels),stores:clone(common.stores),categories:clone(common.categories),brands:clone(common.brands),salesTypes:clone(common.salesTypes),customerTypes:clone(common.customerTypes),storeStats:clone(common.storeStats)}};
S.categoryTarget={period:clone(p[0]),bestEstDays:daysInMonthISO(p[0].end),bestEstMonth:p[0].end.slice(0,7),filters:{channels:clone(common.channels),stores:clone(common.stores),categories:clone(common.categories),salesTypes:clone(common.salesTypes),customerTypes:clone(common.customerTypes),storeStats:clone(common.storeStats)}};
S.store={periods:clone(p),prevCount:2,metricMode:'value',product:'',productLabel:'',filters:{pts:['EFM','EFIT','ESB'],stores:clone(common.stores),channels:clone(common.channels),categories:clone(common.categories),brands:clone(common.brands),salesTypes:clone(common.salesTypes),customerTypes:clone(common.customerTypes),storeStats:clone(common.storeStats)}};
S.brand={periods:clone(p),prevCount:2,metricMode:'value',topN:Math.min(10,META.rankingDefault||10),filters:{channels:clone(common.channels),stores:clone(common.stores),categories:clone(common.categories),salesTypes:clone(common.salesTypes),customerTypes:clone(common.customerTypes),storeStats:clone(common.storeStats)}};
S.item={periods:clone(p),prevCount:2,metricMode:'value',topN:Math.min(10,META.rankingDefault||10),product:'',productLabel:'',filters:{channels:clone(common.channels),stores:clone(common.stores),categories:clone(common.categories),brands:clone(common.brands),salesTypes:clone(common.salesTypes),customerTypes:clone(common.customerTypes),storeStats:clone(common.storeStats)}};
S.daily={period:clone(p[0]),metricMode:'value',product:'',productLabel:'',filters:{channels:clone(common.channels),stores:clone(common.stores),categories:clone(common.categories),brands:clone(common.brands),salesTypes:clone(common.salesTypes),customerTypes:clone(common.customerTypes),storeStats:clone(common.storeStats)}};
S.itemSales={periods:clone(p),prevCount:2,metricMode:'value',topN:Math.min(10,META.rankingDefault||10),product:'',productLabel:'',filters:{channels:clone(common.channels),stores:clone(common.stores),categories:clone(common.categories),brands:clone(common.brands),salesTypes:clone(common.salesTypes),customerTypes:clone(common.customerTypes),storeStats:clone(common.storeStats)}};
}

function rangeControl(section,key,label,period){
  const hideP1=key==='p1'?`<button class="mini-hide prev1-hide" data-section="${section}" type="button">BLANK / HIDE</button>`:'';
  const hideP2=key==='p2'?`<button class="mini-hide prev2-hide" data-section="${section}" type="button">BLANK / HIDE</button>`:'';
  const today=(key==='p0'||key==='period')?`<button class="mini-today range-today" data-section="${section}" type="button" title="Set to month-to-date using latest available raw sales date">TODAY</button>`:'';
  return `<div class="field range" data-section="${section}" data-key="${key}"><label>${label}</label><button class="control" type="button"><span>${rangeLabel(period)}</span><span>▾</span></button><div class="range-pop"><div class="cal-head"><button class="prev">‹</button><b class="hint">Click start, then end</b><button class="next">›</button></div><div class="months"></div><div class="cal-foot"><span class="selected">${rangeLabel(period)}</span><div class="cal-actions">${today}${hideP1}${hideP2}<button class="clear" type="button">Clear</button></div></div></div></div>`}

function previous1Control(section,period,visible){
  if(!visible){
    return `<div class="field previous1-blank"><label>Previous 1</label><button class="control prev1-show" data-section="${section}" type="button"><span>BLANK / HIDDEN</span><span>＋</span></button></div>`;
  }
  return rangeControl(section,'p1','Previous 1',period);
}

function previous2Control(section,period,visible){
  if(!visible){
    return `<div class="field previous2-blank"><label>Previous 2</label><button class="control prev2-show" data-section="${section}" type="button"><span>BLANK / HIDDEN</span><span>＋</span></button></div>`;
  }
  return rangeControl(section,'p2','Previous 2',period);
}
function prevCountControl(section,val){return `<div class="field"><label>Previous Period</label><select class="control prev-count" data-section="${section}"><option value="1" ${val===1?'selected':''}>1 Previous Period</option><option value="2" ${val===2?'selected':''}>2 Previous Periods</option></select></div>`}
function multiControl(section,key,label,options,selected,search=false){const set=new Set(selected);return `<div class="field multi" data-section="${section}" data-key="${key}"><label>${label}</label><button class="control" type="button"><span class="multi-label">${set.size===options.length?'All '+label:set.size+' Selected'}</span><span>▾</span></button><div class="drop">${search?'<input class="search-input" placeholder="Search...">':''}<label class="check"><input type="checkbox" class="toggle-all" ${set.size===options.length?'checked':''}>Select All</label>${options.map(o=>{const v=typeof o==='string'?o:o.name;return `<label class="check option"><input type="checkbox" value="${esc(v)}" ${set.has(v)?'checked':''}>${esc(v)}</label>`}).join('')}</div></div>`}
function selectControl(section,key,label,values,val){return `<div class="field"><label>${label}</label><select class="control simple-select" data-section="${section}" data-key="${key}">${values.map(v=>`<option value="${v}" ${String(v)===String(val)?'selected':''}>${v}</option>`).join('')}</select></div>`}
function numberControl(section,key,label,val){
  return `<div class="field best-est-days-field"><label>${label}</label><input class="control number-input" data-section="${section}" data-key="${key}" type="number" min="0.5" max="31.5" step="0.5" inputmode="decimal" value="${val}"></div>`;
}
function productPicker(section,label){
  const state=S[section];
  const display=state.productLabel||state.product||'';
  return `<div class="field product-picker" data-section="${section}">
    <label>${label}</label>
    <div class="product-input-wrap">
      <input class="control product-input" autocomplete="off" value="${esc(display)}" placeholder="Type SKU or item name">
      <button class="product-clear ${display?'':'hidden'}" type="button" title="Clear item">×</button>
    </div>
    <div class="product-suggest">
      <div class="product-suggest-info">Ketik minimal 2 karakter SKU atau nama item</div>
      <div class="product-options"></div>
    </div>
  </div>`;
}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

function optionValues(options){
  return (options||[]).map(o=>typeof o==='string'?o:o.name);
}
function activeMultiChip(label,selected,options){
  const allVals=optionValues(options);
  const vals=selected||[];
  if(!vals.length || vals.length===allVals.length) return '';
  const text=vals.length<=3?vals.join(', '):`${vals.length} Selected`;
  return `<span class="chip"><b>${esc(label)}:</b> ${esc(text)}</span>`;
}
function activeProductChip(state){
  const value=state?.productLabel||state?.product||'';
  return value?`<span class="chip"><b>Item:</b> ${esc(value)}</span>`:'';
}
function activeFilterChips(section){
  const s=S[section];
  let chips='';

  if(section==='channel'){
    chips+=activeMultiChip('Store',s.filters.stores,META.stores);
    chips+=activeMultiChip('Category',s.filters.categories,META.categories);
    chips+=activeMultiChip('Brand',s.filters.brands,META.brands);
    chips+=activeMultiChip('Sales Type',s.filters.salesTypes,META.salesTypes);
    chips+=activeMultiChip('Customer Type',s.filters.customerTypes,META.customerTypes||[]);
    chips+=activeMultiChip('Store Stat',s.filters.storeStats,META.storeStats||[]);
    chips+=activeProductChip(s);
  }

  if(section==='categoryTarget'){
    chips+=activeMultiChip('Channel',s.filters.channels,META.channels);
    chips+=activeMultiChip('Category',s.filters.categories,META.categories);
    chips+=activeMultiChip('Store',s.filters.stores,META.stores);
    chips+=activeMultiChip('Sales Type',s.filters.salesTypes,META.salesTypes);
    chips+=activeMultiChip('Customer Type',s.filters.customerTypes,META.customerTypes||[]);
    chips+=activeMultiChip('Store Stat',s.filters.storeStats,META.storeStats||[]);
  }

  if(section==='store'){
    chips+=activeMultiChip('PT',s.filters.pts,META.pts);
    const allowed=META.stores.filter(x=>s.filters.pts.includes(x.pt));
    chips+=activeMultiChip('Store',s.filters.stores,allowed);
    chips+=activeMultiChip('Channel',s.filters.channels,META.channels);
    chips+=activeMultiChip('Category',s.filters.categories,META.categories);
    chips+=activeMultiChip('Brand',s.filters.brands,META.brands);
    chips+=activeMultiChip('Sales Type',s.filters.salesTypes,META.salesTypes);
    chips+=activeMultiChip('Customer Type',s.filters.customerTypes,META.customerTypes||[]);
    chips+=activeMultiChip('Store Stat',s.filters.storeStats,META.storeStats||[]);
    chips+=activeProductChip(s);
  }

  if(section==='brand'){
    chips+=activeMultiChip('Channel',s.filters.channels,META.channels);
    chips+=activeMultiChip('Store',s.filters.stores,META.stores);
    chips+=activeMultiChip('Category',s.filters.categories,META.categories);
    chips+=activeMultiChip('Sales Type',s.filters.salesTypes,META.salesTypes);
    chips+=activeMultiChip('Customer Type',s.filters.customerTypes,META.customerTypes||[]);
    chips+=activeMultiChip('Store Stat',s.filters.storeStats,META.storeStats||[]);
  }

  if(section==='item'){
    chips+=activeMultiChip('Channel',s.filters.channels,META.channels);
    chips+=activeMultiChip('Store',s.filters.stores,META.stores);
    chips+=activeMultiChip('Category',s.filters.categories,META.categories);
    chips+=activeMultiChip('Brand',s.filters.brands,META.brands);
    chips+=activeMultiChip('Sales Type',s.filters.salesTypes,META.salesTypes);
    chips+=activeMultiChip('Customer Type',s.filters.customerTypes,META.customerTypes||[]);
    chips+=activeMultiChip('Store Stat',s.filters.storeStats,META.storeStats||[]);
    chips+=activeProductChip(s);
  }

  if(section==='daily'){
    chips+=activeMultiChip('Channel',s.filters.channels,META.channels);
    chips+=activeMultiChip('Store',s.filters.stores,META.stores);
    chips+=activeMultiChip('Category',s.filters.categories,META.categories);
    chips+=activeMultiChip('Brand',s.filters.brands,META.brands);
    chips+=activeMultiChip('Sales Type',s.filters.salesTypes,META.salesTypes);
    chips+=activeMultiChip('Customer Type',s.filters.customerTypes,META.customerTypes||[]);
    chips+=activeMultiChip('Store Stat',s.filters.storeStats,META.storeStats||[]);
    chips+=activeProductChip(s);
  }

  if(section==='itemSales'){
    chips+=activeMultiChip('Channel',s.filters.channels,META.channels);
    chips+=activeMultiChip('Store',s.filters.stores,META.stores);
    chips+=activeMultiChip('Category',s.filters.categories,META.categories);
    chips+=activeMultiChip('Brand',s.filters.brands,META.brands);
    chips+=activeMultiChip('Sales Type',s.filters.salesTypes,META.salesTypes);
    chips+=activeMultiChip('Customer Type',s.filters.customerTypes,META.customerTypes||[]);
    chips+=activeMultiChip('Store Stat',s.filters.storeStats,META.storeStats||[]);
    chips+=activeProductChip(s);
  }

  return chips;
}

function renderFilters(){
  const p=S.channel.periods;
  $('#channelFilters').innerHTML=`<div class="filter-grid">${rangeControl('channel','p0','Current Period',p[0])}${previous1Control('channel',p[1],S.channel.prevCount>=1)}${previous2Control('channel',p[2],S.channel.prevCount===2)}${multiControl('channel','stores','Store',META.stores,S.channel.filters.stores,true)}${multiControl('channel','categories','Category',META.categories,S.channel.filters.categories,true)}${multiControl('channel','brands','Brand',META.brands,S.channel.filters.brands,true)}${multiControl('channel','salesTypes','Sales Type',META.salesTypes,S.channel.filters.salesTypes)}${multiControl('channel','customerTypes','Customer Type',META.customerTypes||[],S.channel.filters.customerTypes)}${multiControl('channel','storeStats','Store Stat',META.storeStats||[],S.channel.filters.storeStats)}${productPicker('channel','Item (SKU / Name)')}<button class="apply" data-apply="channel">APPLY</button></div><div class="chips"><span class="chip"><b>Section 1 only</b></span>${activeFilterChips('channel')}</div>`;

  const t=S.target;
  // Section 2: Channel and Brand filters intentionally removed.
  $('#targetFilters').innerHTML=`<div class="filter-grid">${rangeControl('target','period','Actual Period',t.period)}${multiControl('target','stores','Store',META.stores,t.filters.stores,true)}${multiControl('target','salesTypes','Sales Type',META.salesTypes,t.filters.salesTypes)}${multiControl('target','customerTypes','Customer Type',META.customerTypes||[],t.filters.customerTypes)}${multiControl('target','storeStats','Store Stat',META.storeStats||[],t.filters.storeStats)}${numberControl('target','bestEstDays','Days Total Best Estimate',t.bestEstDays)}<button class="apply" data-apply="target">APPLY</button></div><div class="chips"><span class="chip"><b>Section 2 only</b></span>${timeFactorChip(t.period)}</div>`;

  const ct=S.categoryTarget;
  $('#categoryTargetFilters').innerHTML=`<div class="filter-grid">${rangeControl('categoryTarget','period','Actual Period',ct.period)}${multiControl('categoryTarget','channels','Channel',META.channels,ct.filters.channels,true)}${multiControl('categoryTarget','categories','Category',META.categories,ct.filters.categories,true)}${multiControl('categoryTarget','stores','Store',META.stores,ct.filters.stores,true)}${multiControl('categoryTarget','salesTypes','Sales Type',META.salesTypes,ct.filters.salesTypes)}${multiControl('categoryTarget','customerTypes','Customer Type',META.customerTypes||[],ct.filters.customerTypes)}${multiControl('categoryTarget','storeStats','Store Stat',META.storeStats||[],ct.filters.storeStats)}${numberControl('categoryTarget','bestEstDays','Days Total Best Estimate',ct.bestEstDays)}<button class="apply" data-apply="categoryTarget">APPLY</button></div><div class="chips"><span class="chip"><b>Section 3 only</b></span>${timeFactorChip(ct.period,'categoryTargetTimeFactor')}${activeFilterChips('categoryTarget')}</div>`;

  const st=S.store;
  const allowedStores=META.stores.filter(x=>st.filters.pts.includes(x.pt));
  $('#storeFilters').innerHTML=`<div class="filter-grid">${rangeControl('store','p0','Current',st.periods[0])}${previous1Control('store',st.periods[1],st.prevCount>=1)}${previous2Control('store',st.periods[2],st.prevCount===2)}${multiControl('store','pts','PT',META.pts,st.filters.pts)}${multiControl('store','stores','Store',allowedStores,st.filters.stores.filter(x=>allowedStores.some(s=>s.name===x)),true)}${multiControl('store','channels','Channel',META.channels,st.filters.channels,true)}${multiControl('store','categories','Category',META.categories,st.filters.categories,true)}${multiControl('store','brands','Brand',META.brands,st.filters.brands,true)}${multiControl('store','salesTypes','Sales Type',META.salesTypes,st.filters.salesTypes)}${multiControl('store','customerTypes','Customer Type',META.customerTypes||[],st.filters.customerTypes)}${multiControl('store','storeStats','Store Stat',META.storeStats||[],st.filters.storeStats)}${productPicker('store','Item (SKU / Name)')}<button class="apply" data-apply="store">APPLY</button></div><div class="chips"><span class="chip"><b>Section 4 only</b></span>${activeFilterChips('store')}</div>`;

  const b=S.brand;
  $('#brandFilters').innerHTML=`<div class="filter-grid">${rangeControl('brand','p0','Current',b.periods[0])}${previous1Control('brand',b.periods[1],b.prevCount>=1)}${previous2Control('brand',b.periods[2],b.prevCount===2)}${multiControl('brand','channels','Channel',META.channels,b.filters.channels,true)}${multiControl('brand','stores','Store',META.stores,b.filters.stores,true)}${multiControl('brand','categories','Category',META.categories,b.filters.categories,true)}${multiControl('brand','salesTypes','Sales Type',META.salesTypes,b.filters.salesTypes)}${multiControl('brand','customerTypes','Customer Type',META.customerTypes||[],b.filters.customerTypes)}${multiControl('brand','storeStats','Store Stat',META.storeStats||[],b.filters.storeStats)}${selectControl('brand','topN','Show Top',[1,2,3,4,5,6,7,8,9,10],b.topN)}<button class="apply" data-apply="brand">APPLY</button></div><div class="chips"><span class="chip"><b>Section 5 only</b></span>${activeFilterChips('brand')}</div>`;

  const it=S.item;
  $('#itemFilters').innerHTML=`<div class="filter-grid">${rangeControl('item','p0','Current',it.periods[0])}${previous1Control('item',it.periods[1],it.prevCount>=1)}${previous2Control('item',it.periods[2],it.prevCount===2)}${multiControl('item','channels','Channel',META.channels,it.filters.channels,true)}${multiControl('item','stores','Store',META.stores,it.filters.stores,true)}${multiControl('item','categories','Category',META.categories,it.filters.categories,true)}${multiControl('item','brands','Brand',META.brands,it.filters.brands,true)}${multiControl('item','salesTypes','Sales Type',META.salesTypes,it.filters.salesTypes)}${multiControl('item','customerTypes','Customer Type',META.customerTypes||[],it.filters.customerTypes)}${multiControl('item','storeStats','Store Stat',META.storeStats||[],it.filters.storeStats)}${productPicker('item','Item (SKU / Name)')}${selectControl('item','topN','Show Top',[1,2,3,4,5,6,7,8,9,10,15,20,25],it.topN)}<button class="apply" data-apply="item">APPLY</button></div><div class="chips"><span class="chip"><b>Section 6 only</b></span>${activeFilterChips('item')}</div>`;

  const dy=S.daily;
  $('#dailyFilters').innerHTML=`<div class="filter-grid">${rangeControl('daily','period','Current Period',dy.period)}${multiControl('daily','channels','Channel',META.channels,dy.filters.channels,true)}${multiControl('daily','stores','Store',META.stores,dy.filters.stores,true)}${multiControl('daily','categories','Category',META.categories,dy.filters.categories,true)}${multiControl('daily','brands','Brand',META.brands,dy.filters.brands,true)}${multiControl('daily','salesTypes','Sales Type',META.salesTypes,dy.filters.salesTypes)}${multiControl('daily','customerTypes','Customer Type',META.customerTypes||[],dy.filters.customerTypes)}${multiControl('daily','storeStats','Store Stat',META.storeStats||[],dy.filters.storeStats)}${productPicker('daily','Item (SKU / Name)')}<button class="apply" data-apply="daily">APPLY</button></div><div class="chips"><span class="chip"><b>Section 7 only</b></span>${activeFilterChips('daily')}</div>`;

  const is=S.itemSales;
  $('#itemSalesFilters').innerHTML=`<div class="filter-grid">${rangeControl('itemSales','p0','Current',is.periods[0])}${previous1Control('itemSales',is.periods[1],is.prevCount>=1)}${previous2Control('itemSales',is.periods[2],is.prevCount===2)}${multiControl('itemSales','channels','Channel',META.channels,is.filters.channels,true)}${multiControl('itemSales','stores','Store',META.stores,is.filters.stores,true)}${multiControl('itemSales','categories','Category',META.categories,is.filters.categories,true)}${multiControl('itemSales','brands','Brand',META.brands,is.filters.brands,true)}${multiControl('itemSales','salesTypes','Sales Type',META.salesTypes,is.filters.salesTypes)}${multiControl('itemSales','customerTypes','Customer Type',META.customerTypes||[],is.filters.customerTypes)}${multiControl('itemSales','storeStats','Store Stat',META.storeStats||[],is.filters.storeStats)}${selectControl('itemSales','topN','Show Top',[1,2,3,4,5,6,7,8,9,10,15,20,25],is.topN)}${productPicker('itemSales','Item (SKU / Name)')}<button class="apply" data-apply="itemSales">APPLY</button></div><div class="chips"><span class="chip"><b>Section 8 only</b></span>${activeFilterChips('itemSales')}</div>`;

  bindFilters();
}

function bindFilters(){
$$('.multi .control').forEach(btn=>btn.onclick=e=>{e.stopPropagation();const f=btn.closest('.multi');$$('.multi.open,.range.open,.product-picker.open').forEach(x=>x!==f&&x.classList.remove('open'));f.classList.toggle('open')});
$$('.toggle-all').forEach(cb=>cb.onchange=()=>{const f=cb.closest('.multi');$$('.option input',f).forEach(x=>x.checked=cb.checked);syncMulti(f)});
$$('.option input').forEach(cb=>cb.onchange=()=>syncMulti(cb.closest('.multi')));
$$('.search-input').forEach(inp=>{inp.onclick=e=>e.stopPropagation();inp.oninput=()=>{const q=inp.value.toLowerCase();$$('.option',inp.closest('.drop')).forEach(r=>r.style.display=r.textContent.toLowerCase().includes(q)?'flex':'none')}});
$$('.simple-select').forEach(sel=>sel.onchange=()=>{const sec=sel.dataset.section,key=sel.dataset.key;S[sec][key]=Number(sel.value)});
$$('.number-input').forEach(inp=>{
  inp.oninput=()=>{
    const sec=inp.dataset.section,key=inp.dataset.key;
    const n=Number(inp.value);
    if(Number.isFinite(n)&&n>0) S[sec][key]=n;
  };
  inp.onblur=()=>{
    const sec=inp.dataset.section,key=inp.dataset.key;
    let n=Number(inp.value);
    if(!Number.isFinite(n)||n<=0){
      n=daysInMonthISO(S[sec].period.end);
      S[sec][key]=n;
      inp.value=n;
    }
  };
});
$$('.product-picker').forEach(picker=>{
  const sec=picker.dataset.section;
  const inp=$('.product-input',picker);
  const drop=$('.product-suggest',picker);
  const opts=$('.product-options',picker);
  const info=$('.product-suggest-info',picker);
  const clear=$('.product-clear',picker);
  let timer=null;
  let requestSeq=0;

  const close=()=>picker.classList.remove('open');
  const open=()=>picker.classList.add('open');

  async function searchProducts(){
    const q=inp.value.trim();
    S[sec].productLabel=q;
    S[sec].product=q;
    clear.classList.toggle('hidden',!q);

    if(q.length<2){
      opts.innerHTML='';
      info.textContent='Ketik minimal 2 karakter SKU atau nama item';
      open();
      return;
    }

    const seq=++requestSeq;
    info.textContent='Searching item...';
    opts.innerHTML='';
    open();

    try{
      const rows=await api('/api/meta/products?q='+encodeURIComponent(q));
      if(seq!==requestSeq)return;

      if(!rows.length){
        info.textContent='Item tidak ditemukan';
        return;
      }

      info.textContent=`${rows.length}${rows.length>=50?'+':''} item ditemukan • pilih 1 item`;
      opts.innerHTML=rows.map((r,i)=>`
        <button class="product-option" type="button"
          data-sku="${esc(r.sku)}"
          data-name="${esc(r.itemName)}"
          data-brand="${esc(r.brand||'')}">
          <span class="product-option-sku">${esc(r.sku||'-')}</span>
          <span class="product-option-name">${esc(r.itemName||'-')}</span>
          <span class="product-option-brand">${esc(r.brand||'')}</span>
        </button>`).join('');

      $$('.product-option',opts).forEach(btn=>btn.onclick=e=>{
        e.preventDefault();
        e.stopPropagation();
        const sku=btn.dataset.sku||'';
        const name=btn.dataset.name||'';
        S[sec].product=sku || name;
        S[sec].productLabel=sku && name ? `${sku} — ${name}` : (sku||name);
        inp.value=S[sec].productLabel;
        clear.classList.remove('hidden');
        close();
      });
    }catch(err){
      if(seq!==requestSeq)return;
      info.textContent='Gagal memuat list item';
      opts.innerHTML=`<div class="product-error">${esc(err.message)}</div>`;
    }
  }

  inp.onclick=e=>{
    e.stopPropagation();
    open();
    if(inp.value.trim().length>=2) searchProducts();
  };
  inp.onfocus=()=>{
    open();
    if(inp.value.trim().length>=2) searchProducts();
  };
  inp.oninput=()=>{
    // User is typing again, so the current filter becomes the typed text
    // until a single item is selected from the list.
    clearTimeout(timer);
    timer=setTimeout(searchProducts,220);
  };
  inp.onkeydown=e=>{
    if(e.key==='Escape'){close();inp.blur();}
    if(e.key==='Enter'){
      const first=$('.product-option',opts);
      if(first){e.preventDefault();first.click();}
    }
  };

  clear.onclick=e=>{
    e.preventDefault();
    e.stopPropagation();
    requestSeq++;
    clearTimeout(timer);
    inp.value='';
    S[sec].product='';
    S[sec].productLabel='';
    opts.innerHTML='';
    info.textContent='Ketik minimal 2 karakter SKU atau nama item';
    clear.classList.add('hidden');
    open();
    inp.focus();
  };

  drop.onclick=e=>e.stopPropagation();
});
$$('.prev1-hide').forEach(btn=>btn.onclick=e=>{
  e.preventDefault();e.stopPropagation();
  const sec=btn.dataset.section;
  S[sec].prevCount=0;
  renderFilters();
  loadSection(sec);
});
$$('.prev1-show').forEach(btn=>btn.onclick=e=>{
  e.preventDefault();e.stopPropagation();
  const sec=btn.dataset.section;
  S[sec].prevCount=Math.max(1,S[sec].prevCount||0);
  renderFilters();
  loadSection(sec);
});
$$('.prev2-hide').forEach(btn=>btn.onclick=e=>{
  e.preventDefault();e.stopPropagation();
  const sec=btn.dataset.section;
  S[sec].prevCount=1;
  renderFilters();
  loadSection(sec);
});
$$('.prev2-show').forEach(btn=>btn.onclick=e=>{
  e.preventDefault();e.stopPropagation();
  const sec=btn.dataset.section;
  S[sec].prevCount=2;
  renderFilters();
  loadSection(sec);
});
$$('[data-apply]').forEach(b=>b.onclick=()=>{
  const sec=b.dataset.apply;

  if(sec==='target' || sec==='categoryTarget'){
    const inp=$(`.number-input[data-section="${sec}"][data-key="bestEstDays"]`);
    if(inp){
      const n=Number(inp.value);
      if(Number.isFinite(n)&&n>0)S[sec].bestEstDays=n;
    }
  }

  renderFilters();
  loadSection(sec);
});
$$('.range').forEach(setupRange);
}
function syncMulti(f){const sec=f.dataset.section,key=f.dataset.key;const values=$$('.option input:checked',f).map(x=>x.value);S[sec].filters[key]=values;$('.multi-label',f).textContent=values.length===$$('.option input',f).length?'All '+$('label',f).textContent:values.length+' Selected';const ta=$('.toggle-all',f);if(ta)ta.checked=values.length===$$('.option input',f).length;if(sec==='store'&&key==='pts'){const allowed=META.stores.filter(x=>values.includes(x.pt)).map(x=>x.name);S.store.filters.stores=S.store.filters.stores.filter(x=>allowed.includes(x));if(!S.store.filters.stores.length)S.store.filters.stores=allowed;renderFilters()}}

document.addEventListener('click',e=>{$$('.multi.open,.range.open,.product-picker.open').forEach(x=>{if(!x.contains(e.target))x.classList.remove('open')});$$('.download-wrap.open').forEach(x=>{if(!x.contains(e.target))x.classList.remove('open')})});

function setupRange(f){
  const sec=f.dataset.section,key=f.dataset.key;
  let p=key==='period'?S[sec].period:S[sec].periods[Number(key.slice(1))];
  let temp=null;
  let view=parseISO(p.start);
  const btn=$('.control',f),pop=$('.range-pop',f),months=$('.months',f),hint=$('.hint',f),selected=$('.selected',f);

  const same=(a,b)=>a&&b&&localISO(a)===localISO(b);
  const inRange=(d,a,b)=>a&&b&&d>=a&&d<=b;

  function render(){
    const one=m=>{
      const y=m.getFullYear(),mo=m.getMonth();
      const first=new Date(y,mo,1);
      const grid=new Date(y,mo,1-first.getDay());
      let h=`<div class="month"><div class="month-title">${m.toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</div><div class="week"><div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div></div><div class="days">`;

      for(let i=0;i<42;i++){
        const d=new Date(grid.getFullYear(),grid.getMonth(),grid.getDate()+i);
        const iso=localISO(d);
        let c='day';
        if(d.getMonth()!==mo)c+=' muted';

        const a=parseISO(p.start),b=parseISO(p.end);
        const maxAvailable=META.maxDate?parseISO(META.maxDate):null;
        const unavailable=maxAvailable && d>maxAvailable;
        if(!temp&&inRange(d,a,b))c+=' inrange';
        if(same(d,temp||a))c+=' start';
        if(!temp&&same(d,b))c+=' end';
        if(unavailable)c+=' unavailable';

        h+=`<button class="${c}" data-date="${iso}" type="button" ${unavailable?'disabled aria-disabled="true" title="No raw sales data yet"':''}>${d.getDate()}</button>`;
      }
      return h+'</div></div>';
    };

    const next=new Date(view.getFullYear(),view.getMonth()+1,1);
    months.innerHTML=one(view)+one(next);

    const maxAvailable=META.maxDate?parseISO(META.maxDate):null;
    if(maxAvailable){
      const maxMonthStart=new Date(maxAvailable.getFullYear(),maxAvailable.getMonth(),1);
      const nextViewStart=new Date(view.getFullYear(),view.getMonth()+1,1);
      $('.next',f).disabled=nextViewStart>maxMonthStart;
    }

    $$('.day:not(:disabled)',months).forEach(dayBtn=>dayBtn.onclick=e=>{
      e.stopPropagation();
      const click=parseISO(dayBtn.dataset.date);

      if(!temp){
        temp=click;
        hint.textContent='Now click end date';
        selected.textContent='Start: '+dateLabel(dayBtn.dataset.date);
      }else{
        let a=temp,b=click;
        if(b<a)[a,b]=[b,a];

        p={start:localISO(a),end:localISO(b)};
        if(key==='period'){
          S[sec].period=p;
          if(sec==='target' || sec==='categoryTarget'){
            const newMonth=p.end.slice(0,7);
            if(S[sec].bestEstMonth!==newMonth){
              S[sec].bestEstMonth=newMonth;
              S[sec].bestEstDays=daysInMonthISO(p.end);
              const daysInput=$(`.number-input[data-section="${sec}"][data-key="bestEstDays"]`);
              if(daysInput)daysInput.value=S[sec].bestEstDays;
            }
          }
        }else{
          const idx=Number(key.slice(1));
          S[sec].periods[idx]=p;

          // Current period drives the default Previous 1 / Previous 2 dates.
          // Users may still manually edit P1/P2 afterwards.
          if(idx===0){
            syncLinkedPreviousPeriods(sec);
            // Re-render controls so the newly calculated previous periods
            // are immediately visible without needing a page refresh.
            temp=null;
            renderFilters();
            return;
          }
        }

        temp=null;
        btn.firstElementChild.textContent=rangeLabel(p);
        selected.textContent=rangeLabel(p);
        hint.textContent='Click start, then end';
      }
      render();
    });
  }

  btn.onclick=e=>{
    e.stopPropagation();
    $$('.multi.open,.range.open,.product-picker.open').forEach(x=>x!==f&&x.classList.remove('open'));
    f.classList.toggle('open');
  };
  $('.prev',f).onclick=e=>{
    e.stopPropagation();
    view=new Date(view.getFullYear(),view.getMonth()-1,1);
    render();
  };
  $('.next',f).onclick=e=>{
    e.stopPropagation();
    view=new Date(view.getFullYear(),view.getMonth()+1,1);
    render();
  };
  const todayBtn=$('.range-today',f);
  if(todayBtn)todayBtn.onclick=e=>{
    e.preventDefault();
    e.stopPropagation();

    const calendarToday=localISO(new Date());
    let end=calendarToday;
    if(META.maxDate && META.maxDate<end)end=META.maxDate;

    const nextPeriod={start:end.slice(0,8)+'01',end};
    p=nextPeriod;

    if(key==='period'){
      S[sec].period=nextPeriod;
      if(sec==='target' || sec==='categoryTarget'){
        const newMonth=nextPeriod.end.slice(0,7);
        S[sec].bestEstMonth=newMonth;
        S[sec].bestEstDays=daysInMonthISO(nextPeriod.end);
      }
    }else{
      const idx=Number(key.slice(1));
      S[sec].periods[idx]=nextPeriod;
      if(idx===0)syncLinkedPreviousPeriods(sec);
    }

    temp=null;
    renderFilters();
    loadSection(sec);
  };

  $('.clear',f).onclick=e=>{
    e.stopPropagation();
    temp=null;
    hint.textContent='Click start, then end';
    selected.textContent=rangeLabel(p);
    render();
  };
  render();
}

function periodsFor(sec){const x=S[sec];return x.periods.slice(0,1+x.prevCount)}
function reqFilters(sec){return clone(S[sec].filters)}

async function loadSection(sec){try{
if(sec==='channel'){showLoad('#channelTable');const filters=reqFilters('channel');filters.product=S.channel.product;const d=await api('/api/query/channel',{method:'POST',body:JSON.stringify({periods:periodsFor('channel'),filters})});renderChannel(d)}
if(sec==='target'){showLoad('#targetTable');const d=await api('/api/query/target',{method:'POST',body:JSON.stringify({period:S.target.period,filters:reqFilters('target'),daysTotalBestEstimate:S.target.bestEstDays})});renderTarget(d)}
if(sec==='categoryTarget'){showLoad('#categoryTargetTable');const d=await api('/api/query/target-category',{method:'POST',body:JSON.stringify({period:S.categoryTarget.period,filters:reqFilters('categoryTarget'),daysTotalBestEstimate:S.categoryTarget.bestEstDays})});renderTargetCategory(d)}
if(sec==='store'){showLoad('#storeTable');const filters=reqFilters('store');filters.product=S.store.product;const d=await api('/api/query/store',{method:'POST',body:JSON.stringify({periods:periodsFor('store'),filters,metricMode:S.store.metricMode})});renderStore(d)}
if(sec==='brand'){showLoad('#brandTable');const d=await api('/api/query/brand',{method:'POST',body:JSON.stringify({periods:periodsFor('brand'),filters:reqFilters('brand'),topN:S.brand.topN,metricMode:S.brand.metricMode})});renderBrand(d)}
if(sec==='item'){showLoad('#itemTable');const filters=reqFilters('item');filters.product=S.item.product;const d=await api('/api/query/items',{method:'POST',body:JSON.stringify({periods:periodsFor('item'),filters,topN:S.item.topN,metricMode:S.item.metricMode})});renderItems(d)}
if(sec==='daily'){showLoad('#dailyTable');const filters=reqFilters('daily');filters.product=S.daily.product;const d=await api('/api/query/daily-trend',{method:'POST',body:JSON.stringify({period:S.daily.period,filters,metricMode:S.daily.metricMode})});renderDailyTrend(d)}
if(sec==='itemSales'){showLoad('#itemSalesTable');const filters=reqFilters('itemSales');filters.product=S.itemSales.product;const d=await api('/api/query/item-sales',{method:'POST',body:JSON.stringify({periods:periodsFor('itemSales'),filters,topN:S.itemSales.topN,metricMode:S.itemSales.metricMode})});renderItemSales(d)}
}catch(e){const id={channel:'#channelTable',target:'#targetTable',categoryTarget:'#categoryTargetTable',store:'#storeTable',brand:'#brandTable',item:'#itemTable',daily:'#dailyTable',itemSales:'#itemSalesTable'}[sec];if(id)$(id).innerHTML=`<div class="empty">${esc(e.message)}</div>`}}

function showLoad(id){$(id).innerHTML='<div class="loading">Loading...</div>'}

function groupHead(name,p,cls){return `<th colspan="3" class="${cls}">${name}<span class="period-sub">${rangeLabel(p)}</span></th>`}

function renderChannel(d){
  const ps=periodsFor('channel'),n=ps.length;
  const hasP1=n>=2,hasP2=n>=3;

  let h=`<table class="sortable-table chart-table" data-chart-label="0"><thead><tr><th rowspan="2">CHANNEL</th>${groupHead('CURRENT',ps[0],'group-current')}${hasP1?groupHead('PREVIOUS 1',ps[1],'group-prev1'):''}${hasP2?groupHead('PREVIOUS 2',ps[2],'group-prev2'):''}${hasP1?'<th colspan="3" class="group-growth">GROWTH vs P1</th>':''}${hasP2?'<th colspan="3" class="group-growth">GROWTH vs P2</th>':''}</tr><tr>${Array.from({length:n},()=>'<th>Sales</th><th>Trx</th><th>Basket Size</th>').join('')}${hasP1?'<th>Sales</th><th>Trx</th><th>Basket</th>':''}${hasP2?'<th>Sales</th><th>Trx</th><th>Basket</th>':''}</tr></thead><tbody>`;

  for(const r of d.rows){
    h+=`<tr><td>${esc(r.channel)}</td>${r.periods.map(m=>`<td class="num">${fmt(m.sales)}</td><td class="num">${fmt(m.trx)}</td><td class="num">${fmt(m.basket)}</td>`).join('')}${hasP1?`<td class="num ${r.growthP1?.sales>=0?'pos':'neg'}">${fp(r.growthP1?.sales)}</td><td class="num ${r.growthP1?.trx>=0?'pos':'neg'}">${fp(r.growthP1?.trx)}</td><td class="num ${r.growthP1?.basket>=0?'pos':'neg'}">${fp(r.growthP1?.basket)}</td>`:''}${hasP2?`<td class="num ${r.growthP2?.sales>=0?'pos':'neg'}">${fp(r.growthP2?.sales)}</td><td class="num ${r.growthP2?.trx>=0?'pos':'neg'}">${fp(r.growthP2?.trx)}</td><td class="num ${r.growthP2?.basket>=0?'pos':'neg'}">${fp(r.growthP2?.basket)}</td>`:''}</tr>`;
  }

  const tg1=hasP1?{
    sales:growthPct(d.total[0].sales,d.total[1].sales),
    trx:growthPct(d.total[0].trx,d.total[1].trx),
    basket:growthPct(d.total[0].basket,d.total[1].basket)
  }:null;
  const tg2=hasP2?{
    sales:growthPct(d.total[0].sales,d.total[2].sales),
    trx:growthPct(d.total[0].trx,d.total[2].trx),
    basket:growthPct(d.total[0].basket,d.total[2].basket)
  }:null;

  h+=`<tr class="total no-sort-row"><td>TOTAL SALES</td>${d.total.map(m=>`<td class="num">${fmt(m.sales)}</td><td class="num">${fmt(m.trx)}</td><td class="num">${fmt(m.basket)}</td>`).join('')}${hasP1?`<td class="num">${fp(tg1.sales)}</td><td class="num">${fp(tg1.trx)}</td><td class="num">${fp(tg1.basket)}</td>`:''}${hasP2?`<td class="num">${fp(tg2.sales)}</td><td class="num">${fp(tg2.trx)}</td><td class="num">${fp(tg2.basket)}</td>`:''}</tr>`;

  const growthColspan=(hasP1?3:0)+(hasP2?3:0);
  h+=`<tr class="summary-orange no-sort-row"><td>TOTAL TELEMED</td>${d.telemed.map(m=>`<td class="num">${fmt(m.sales)}</td><td class="num">${fmt(m.trx)}</td><td class="num">${fmt(m.basket)}</td>`).join('')}${growthColspan?`<td colspan="${growthColspan}"></td>`:''}</tr>`;
  h+=`<tr class="summary-light no-sort-row"><td>% TELEMED</td>${d.telemedPct.map(m=>`<td class="num">${pct(m.sales)}</td><td class="num">${pct(m.trx)}</td><td class="num">${pct(m.basket)}</td>`).join('')}${growthColspan?`<td colspan="${growthColspan}"></td>`:''}</tr>`;

  if(hasP1){
    let vv='<tr class="no-sort-row"><td class="summary-blue-label">Variance Value</td>';
    let vp='<tr class="no-sort-row"><td class="summary-blue">Variance %</td>';
    for(let i=0;i<n;i++){
      const v=d.variance[i];
      if(v){
        vv+=`<td class="summary-pink num">${fmt(v.sales)}</td><td class="summary-pink num">${fmt(v.trx)}</td><td class="summary-blue num">${fmt(v.basket)}</td>`;
        vp+=`<td class="summary-blue num">${fp(v.salesPct)}</td><td class="summary-blue num">${fp(v.trxPct)}</td><td class="summary-blue num">${fp(v.basketPct)}</td>`;
      }else{
        vv+='<td></td><td></td><td></td>';
        vp+='<td></td><td></td><td></td>';
      }
    }
    h+=vv+(growthColspan?`<td colspan="${growthColspan}"></td>`:'')+'</tr>';
    h+=vp+(growthColspan?`<td colspan="${growthColspan}"></td>`:'')+'</tr>';
  }

  h+='</tbody></table>';
  $('#channelTable').innerHTML=h;
  const t=$('#channelTable table');
  const cols=[1];
  if(hasP1)cols.push(4);
  if(hasP2)cols.push(7);
  t.dataset.chartCols=cols.join(',');
  t.dataset.chartSeries=['Current',...(hasP1?['Previous 1']:[]),...(hasP2?['Previous 2']:[])].join(',');
  enhanceTable(t);
}

function renderTarget(d){
  const beDays=Number.isFinite(Number(d.bestEstDays))?Number(d.bestEstDays):Number(S.target.bestEstDays||daysInMonthISO(S.target.period.end));
  const tf=Number.isFinite(Number(d.factor))?Number(d.factor):periodTimeFactor(S.target.period).factor;
  const elapsed=Number.isFinite(Number(d.elapsedDays))?Number(d.elapsedDays):periodTimeFactor(S.target.period).elapsed;
  const calendar=Number.isFinite(Number(d.calendarDays))?Number(d.calendarDays):periodTimeFactor(S.target.period).calendar;
  const closingPct=(best,target)=>Number(target)>0?Number(best)/Number(target):null;

  const tfChip=$('#targetTimeFactor');
  if(tfChip)tfChip.innerHTML=`<b>Time Factor (MTD):</b> ${(tf*100).toFixed(1)}% <span class="chip-note">(${elapsed}/${calendar} days)</span>`;

  let h=`<table class="sortable-table chart-table" data-chart-label="0" data-chart-cols="1,3,6" data-chart-series="Actual,Target MTD,Best Est"><thead><tr><th>CHANNEL</th><th>Sales<span class="period-sub">${rangeLabel(S.target.period)}</span></th><th class="group-target">TARGET BEST EST<span class="period-sub">${d.month}</span></th><th class="group-target">TARGET BEST EST MTD<span class="period-sub">${d.month} • TF ${(tf*100).toFixed(1)}%</span></th><th>Achieve %</th><th>Achieve % MTD</th><th>BEST EST<span class="period-sub">${beDays} Days</span></th><th>% Est Closing</th></tr></thead><tbody>`;

  for(const r of d.rows){
    const achieveAlert=r.achieve!==null&&r.achieve!==undefined&&Number(r.achieve)<tf;
    const achieveMtdAlert=r.achieveMtd!==null&&r.achieveMtd!==undefined&&Number(r.achieveMtd)<1;
    h+=`<tr><td>${esc(r.channel)}</td><td class="num">${fmt(r.actual.sales)}</td><td class="num">${fmt(r.target)}</td><td class="num">${fmt(r.mtdTarget)}</td><td class="num ${achieveAlert?'target-alert':''}">${pct(r.achieve)}</td><td class="num ${achieveMtdAlert?'target-alert':''}">${pct(r.achieveMtd)}</td><td class="num">${fmt(r.bestEst)}</td><td class="num">${pct(closingPct(r.bestEst,r.target))}</td></tr>`;
  }

  h+=`<tr class="total no-sort-row"><td>TOTAL SALES</td><td class="num">${fmt(d.total.actual)}</td><td class="num">${fmt(d.total.target)}</td><td class="num">${fmt(d.total.mtdTarget)}</td><td class="num">${pct(d.total.achieve)}</td><td class="num">${pct(d.total.achieveMtd)}</td><td class="num">${fmt(d.total.bestEst)}</td><td class="num">${pct(closingPct(d.total.bestEst,d.total.target))}</td></tr>
  <tr class="summary-orange no-sort-row"><td>TOTAL TELEMED</td><td class="num">${fmt(d.telemed.actual)}</td><td class="num">${fmt(d.telemed.target)}</td><td class="num">${fmt(d.telemed.mtdTarget)}</td><td></td><td></td><td class="num">${fmt(d.telemed.bestEst)}</td><td class="num">${pct(closingPct(d.telemed.bestEst,d.telemed.target))}</td></tr>
  <tr class="summary-light no-sort-row"><td>% TELEMED</td><td class="num">${pct(d.telemed.pctActual)}</td><td class="num">${pct(d.telemed.pctTarget)}</td><td></td><td></td><td></td><td class="num">${pct(d.telemed.pctBestEst)}</td><td></td></tr>
  <tr class="no-sort-row"><td class="summary-blue-label">Variance Value</td><td></td><td class="summary-pink num">${fmt(d.telemed.varianceTarget)}</td><td class="summary-blue num">${fmt(d.telemed.varianceMtd)}</td><td></td><td></td><td></td><td></td></tr>
  <tr class="no-sort-row"><td class="summary-blue">Achieve Target %</td><td></td><td class="summary-blue num">${pct(d.telemed.achieveTarget)}</td><td class="summary-blue num">${pct(d.telemed.achieveMtd)}</td><td></td><td></td><td></td><td></td></tr></tbody></table>`;

  $('#targetTable').innerHTML=h;
  enhanceTable($('#targetTable table'));
}


function renderTargetCategory(d){
  const beDays=Number.isFinite(Number(d.bestEstDays))?Number(d.bestEstDays):Number(S.categoryTarget.bestEstDays||daysInMonthISO(S.categoryTarget.period.end));
  const tf=Number.isFinite(Number(d.factor))?Number(d.factor):periodTimeFactor(S.categoryTarget.period).factor;
  const elapsed=Number.isFinite(Number(d.elapsedDays))?Number(d.elapsedDays):periodTimeFactor(S.categoryTarget.period).elapsed;
  const calendar=Number.isFinite(Number(d.calendarDays))?Number(d.calendarDays):periodTimeFactor(S.categoryTarget.period).calendar;
  const closingPct=(best,target)=>Number(target)>0?Number(best)/Number(target):null;

  const tfChip=$('#categoryTargetTimeFactor');
  if(tfChip)tfChip.innerHTML=`<b>Time Factor (MTD):</b> ${(tf*100).toFixed(1)}% <span class="chip-note">(${elapsed}/${calendar} days)</span>`;

  // Column order follows the supplied reference:
  // No | Category | Sales | Target | Target MTD | Achieve | Achieve MTD |
  // %Contr | Offline | Online | Best Est | % Est Closing
  let h=`<table class="sortable-table chart-table category-target-table" data-chart-label="1" data-chart-cols="2,4,10" data-chart-series="Actual,Target MTD,Best Est"><thead><tr><th class="no-col">No</th><th>CATEGORY</th><th>Sales<span class="period-sub">${rangeLabel(S.categoryTarget.period)}</span></th><th class="group-target">TARGET BEST EST<span class="period-sub">${d.month}</span></th><th class="group-target">TARGET BEST EST MTD<span class="period-sub">${d.month} • TF ${(tf*100).toFixed(1)}%</span></th><th>Achieve %</th><th>Achieve % MTD</th><th>%Contr</th><th>OFFLINE SALES</th><th>ONLINE SALES</th><th>BEST EST<span class="period-sub">${beDays} Days</span></th><th>% Est Closing</th></tr></thead><tbody>`;

  d.rows.forEach((r,i)=>{
    const achieveAlert=r.achieve!==null&&r.achieve!==undefined&&Number(r.achieve)<tf;
    const achieveMtdAlert=r.achieveMtd!==null&&r.achieveMtd!==undefined&&Number(r.achieveMtd)<1;
    h+=`<tr><td class="center no-col">${i+1}</td><td>${esc(r.category)}</td><td class="num">${fmt(r.actual.sales)}</td><td class="num">${fmt(r.target)}</td><td class="num">${fmt(r.mtdTarget)}</td><td class="num ${achieveAlert?'target-alert':''}">${pct(r.achieve)}</td><td class="num ${achieveMtdAlert?'target-alert':''}">${pct(r.achieveMtd)}</td><td class="num">${pct(r.contribution)}</td><td class="num">${fmt(r.offlineSales)}</td><td class="num">${fmt(r.onlineSales)}</td><td class="num">${fmt(r.bestEst)}</td><td class="num">${pct(closingPct(r.bestEst,r.target))}</td></tr>`;
  });

  const ts=d.totalSales||{};
  const tc=d.totalCategory||{};
  const cp=d.categoryPct||{};

  h+=`<tr class="total no-sort-row"><td colspan="2">TOTAL SALES</td><td class="num">${fmt(ts.actual)}</td><td class="num">${fmt(ts.target)}</td><td class="num">${fmt(ts.mtdTarget)}</td><td class="num">${pct(ts.achieve)}</td><td class="num">${pct(ts.achieveMtd)}</td><td class="num">${pct(ts.contribution)}</td><td class="num">${fmt(ts.offlineSales)}</td><td class="num">${fmt(ts.onlineSales)}</td><td class="num">${fmt(ts.bestEst)}</td><td class="num">${pct(closingPct(ts.bestEst,ts.target))}</td></tr>
  <tr class="summary-orange no-sort-row"><td colspan="2">TOTAL CATEGORY</td><td class="num">${fmt(tc.actual)}</td><td class="num">${fmt(tc.target)}</td><td class="num">${fmt(tc.mtdTarget)}</td><td></td><td></td><td class="num">${pct(tc.contribution)}</td><td class="num">${fmt(tc.offlineSales)}</td><td class="num">${fmt(tc.onlineSales)}</td><td class="num">${fmt(tc.bestEst)}</td><td class="num">${pct(closingPct(tc.bestEst,tc.target))}</td></tr>
  <tr class="summary-light no-sort-row"><td colspan="2">% CATEGORY</td><td class="num">${pct(cp.actual)}</td><td class="num">${pct(cp.target)}</td><td class="num">${pct(cp.mtdTarget)}</td><td></td><td></td><td class="num">${pct(tc.contribution)}</td><td></td><td></td><td class="num">${pct(cp.bestEst)}</td><td class="num">${pct(cp.bestEst)}</td></tr>
  <tr class="no-sort-row"><td colspan="12">&nbsp;</td></tr>
  <tr class="no-sort-row"><td colspan="2" class="summary-blue-label">Variance Value</td><td></td><td class="summary-pink num">${fmt(tc.varianceTarget)}</td><td class="summary-blue num">${fmt(tc.varianceMtd)}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr class="no-sort-row"><td colspan="2" class="summary-blue">Achieve Target %</td><td></td><td class="summary-blue num">${pct(tc.achieve)}</td><td class="summary-blue num">${pct(tc.achieveMtd)}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr></tbody></table>`;

  $('#categoryTargetTable').innerHTML=h;
  enhanceTable($('#categoryTargetTable table'));
}


function renderStore(d){
  const ps=periodsFor('store'),n=ps.length,order=Array.from({length:n},(_,i)=>i);
  const qtyMode=(d.metricMode||S.store.metricMode)==='qty';
  const primaryKey=qtyMode?'qty':'sales';
  const basketKey=qtyMode?'basketQty':'basket';
  const primaryLabel=qtyMode?'QTY':'SALES';
  const basketLabel=qtyMode?'BASKET QTY':'BASKET SIZE';
  const get=(m,k)=>Number(m?.[k]||0);

  let h=`<table class="sortable-table chart-table store-performance-table" data-chart-label="2"><thead><tr><th rowspan="2">STORE STAT</th><th rowspan="2">PT</th><th rowspan="2">STORE</th><th colspan="${n}">${primaryLabel}</th><th colspan="${n}">TRX</th><th colspan="${n}">${basketLabel}</th></tr><tr>${[primaryLabel,'Trx',basketLabel].map(()=>order.map(i=>`<th>${i===0?'Current':'Previous '+i}<span class="period-sub">${rangeLabel(ps[i])}</span></th>`).join('')).join('')}</tr></thead><tbody>`;

  const metricVal=(m,metric)=>metric===0?get(m,primaryKey):metric===1?get(m,'trx'):get(m,basketKey);
  const metricCells=periodMetrics=>[0,1,2].map(metric=>order.map(i=>`<td class="num">${fmt(metricVal(periodMetrics[i],metric))}</td>`).join('')).join('');

  for(const r of d.rows){
    h+=`<tr><td>${r.storeStat==='New Store'?'New':'Exist'}</td><td>${esc(r.pt)}</td><td>${esc(r.store)}</td>${metricCells(r.periods)}</tr>`;
  }

  h+=`<tr class="total no-sort-row"><td colspan="3">ALL STORE</td>${metricCells(d.total)}</tr>`;

  const row=(label,cls,fn)=>`<tr class="no-sort-row"><td colspan="3" class="${cls}">${label}</td>${[0,1,2].map(metric=>order.map(i=>`<td class="num ${cls}">${fn(i,metric)}</td>`).join('')).join('')}</tr>`;

  if(n>1){
    h+=row('Variance Value','summary-blue-label',(i,metric)=>{
      const v=d.variance[i];if(!v)return '';
      const k=metric===0?primaryKey:metric===1?'trx':basketKey;
      return fmt(v[k]);
    });
    h+=row('Variance %','summary-blue',(i,metric)=>{
      const v=d.variance[i];if(!v)return '';
      const k=metric===0?(qtyMode?'qtyPct':'salesPct'):metric===1?'trxPct':(qtyMode?'basketQtyPct':'basketPct');
      return fp(v[k]);
    });
  }

  h+=row('Avg Per Day','store-avg-row',(i,metric)=>{
    const m=d.avgPerDay[i]||{};
    const k=metric===0?primaryKey:metric===1?'trx':basketKey;
    return fmt(m[k]);
  });

  for(const pt of (d.ptBreakdown||[])){
    h+=`<tr class="no-sort-row pt-detail-row" data-pt="${esc(pt.pt)}"><td></td><td>${esc(pt.pt)}</td><td>Exist Store</td>${metricCells(pt.existing)}</tr>`;
    h+=`<tr class="no-sort-row pt-detail-row" data-pt="${esc(pt.pt)}"><td></td><td>${esc(pt.pt)}</td><td>New Store</td>${metricCells(pt.newStore)}</tr>`;
    h+=`<tr class="no-sort-row pt-total-row pt-${esc(pt.pt.toLowerCase())}"><td></td><td><button type="button" class="pt-expand-btn" data-pt="${esc(pt.pt)}" aria-expanded="false">＋</button> ${esc(pt.pt)}</td><td>PT TOTAL</td>${metricCells(pt.total)}</tr>`;
  }

  h+=`<tr class="no-sort-row total-by-pt"><td colspan="3">TOTAL By PT</td>${metricCells(d.total)}</tr>`;
  h+=`<tr class="no-sort-row existing-total"><td colspan="3">Existing Store</td>${metricCells(d.storeStatTotals?.existing||[])}</tr>`;
  h+=`<tr class="no-sort-row new-total"><td colspan="3">New Store</td>${metricCells(d.storeStatTotals?.newStore||[])}</tr>`;
  h+='</tbody></table>';

  $('#storeTable').innerHTML=h;
  const t=$('#storeTable table');
  t.dataset.chartCols=order.map(i=>3+i).join(',');
  t.dataset.chartSeries=order.map(i=>i===0?'Current':`Previous ${i}`).join(',');
  enhanceTable(t);

  $$('.pt-expand-btn',t).forEach(btn=>{
    btn.onclick=()=>{
      const pt=btn.dataset.pt;
      const rows=$$(`.pt-detail-row[data-pt="${pt}"]`,t);
      const expand=btn.getAttribute('aria-expanded')!=='true';
      btn.setAttribute('aria-expanded',expand?'true':'false');
      btn.textContent=expand?'−':'＋';
      rows.forEach(r=>r.classList.toggle('pt-expanded',expand));
    };
  });
}

function summaryRankRows(displayed,allv,share,n,labelSpan){
  const vals=a=>a.slice(0,n).map(x=>`<td class="num">${fmt(x.sales)}</td>`).join('');
  const p=a=>a.slice(0,n).map(x=>`<td class="num">${pct(x)}</td>`).join('');
  const extra=Math.max(1,n);
  return `<tr class="rank-summary no-sort-row"><td colspan="2">TOTAL SALES DISPLAYED</td>${vals(displayed)}<td colspan="${extra}"></td></tr><tr class="rank-summary total-all no-sort-row"><td colspan="2">TOTAL ALL SALES</td>${vals(allv)}<td colspan="${extra}"></td></tr><tr class="rank-summary percent no-sort-row"><td colspan="2">% OF TOTAL</td>${p(share)}<td colspan="${extra}"></td></tr>`;
}

function renderBrand(d){
  const ps=periodsFor('brand'),n=ps.length;
  const qtyMode=(d.metricMode||S.brand.metricMode)==='qty';
  const metricKey=qtyMode?'qty':'sales';
  const metricLabel=qtyMode?'Qty':'Sales';
  const hasP1=n>=2,hasP2=n>=3;

  const chartCols=[2,...(hasP1?[3]:[]),...(hasP2?[4]:[])].join(',');
  const chartSeries=['Current',...(hasP1?['Previous 1']:[]),...(hasP2?['Previous 2']:[])].join(',');

  let h=`<table class="sortable-table chart-table" data-chart-label="1" data-chart-cols="${chartCols}" data-chart-series="${chartSeries}"><thead><tr><th>Rank</th><th>BRAND</th><th>Current ${metricLabel}<span class="period-sub">${rangeLabel(ps[0])}</span></th>${hasP1?`<th>Previous 1<span class="period-sub">${rangeLabel(ps[1])}</span></th>`:''}${hasP2?`<th>Previous 2<span class="period-sub">${rangeLabel(ps[2])}</span></th>`:''}${hasP1?'<th>Growth vs P1</th>':''}${hasP2?'<th>Growth vs P2</th>':''}<th>% of All ${metricLabel}</th></tr></thead><tbody>`;

  d.rows.forEach((r,i)=>{
    h+=`<tr><td class="center">${i+1}</td><td>${esc(r.brand)}</td><td class="num">${fmt(r.periods[0][metricKey])}</td>${hasP1?`<td class="num">${fmt(r.periods[1][metricKey])}</td>`:''}${hasP2?`<td class="num">${fmt(r.periods[2][metricKey])}</td>`:''}${hasP1?`<td class="num ${r.growthP1>=0?'pos':'neg'}">${fmt(r.growthP1)}</td>`:''}${hasP2?`<td class="num ${r.growthP2>=0?'pos':'neg'}">${fmt(r.growthP2)}</td>`:''}<td class="num">${pct(r.share)}</td></tr>`;
  });

  const td=d.totalDisplayed.map(x=>({sales:x[metricKey]}));
  const ta=d.totalAll.map(x=>({sales:x[metricKey]}));
  h+=summaryRankRows(td,ta,d.displayedShare,n,n)
    .replace(/TOTAL SALES DISPLAYED/g,`TOTAL ${qtyMode?'QTY':'SALES'} DISPLAYED`)
    .replace(/TOTAL ALL SALES/g,`TOTAL ALL ${qtyMode?'QTY':'SALES'}`)
    +`</tbody></table>`;

  $('#brandTable').innerHTML=h;
  enhanceTable($('#brandTable table'));
}

function growthPct(cur,prev){
  const c=Number(cur||0),p=Number(prev||0);
  if(!p) return null;
  return (c-p)/p;
}
function itemTable(title,boxClass,obj,totalAll,ps,metricMode){
  const n=ps.length;
  const qtyMode=metricMode==='qty';
  const metricKey=qtyMode?'qty':'sales';
  const metricLabel=qtyMode?'Qty':'Sales';
  const growthLabel=qtyMode?'Growth Qty':'Growth Value';
  const hasP1=n>=2,hasP2=n>=3;

  const chartCols=[4,...(hasP1?[5]:[]),...(hasP2?[6]:[])].join(',');
  const chartSeries=['Current',...(hasP1?['Previous 1']:[]),...(hasP2?['Previous 2']:[])].join(',');

  let h=`<div class="rank-box ${boxClass}"><h3>${title}</h3><table class="sortable-table chart-table" data-chart-label="2" data-chart-cols="${chartCols}" data-chart-series="${chartSeries}"><thead><tr><th>Rank</th><th>SKU</th><th>Item</th><th>Brand</th><th>Current ${metricLabel}<span class="period-sub">${rangeLabel(ps[0])}</span></th>${hasP1?`<th>Previous 1<span class="period-sub">${rangeLabel(ps[1])}</span></th>`:''}${hasP2?`<th>Previous 2<span class="period-sub">${rangeLabel(ps[2])}</span></th>`:''}${hasP1?`<th>${growthLabel} vs P1</th><th>Growth % vs P1</th>`:''}${hasP2?`<th>${growthLabel} vs P2</th><th>Growth % vs P2</th>`:''}</tr></thead><tbody>`;

  obj.rows.forEach((r,i)=>{
    const cur=r.periods[0]?.[metricKey],p1=r.periods[1]?.[metricKey],p2=r.periods[2]?.[metricKey];
    const gp1=hasP1?growthPct(cur,p1):null,gp2=hasP2?growthPct(cur,p2):null;
    h+=`<tr><td class="center">${i+1}</td><td>${esc(r.sku)}</td><td>${esc(r.itemName)}</td><td>${esc(r.brand)}</td><td class="num">${fmt(cur)}</td>${hasP1?`<td class="num">${fmt(p1)}</td><td class="num ${r.growthP1>=0?'pos':'neg'}">${fmt(r.growthP1)}</td><td class="num ${gp1===null?'':gp1>=0?'pos':'neg'}">${fp(gp1)}</td>`:''}${hasP2?`<td class="num">${fmt(p2)}</td><td class="num ${r.growthP2>=0?'pos':'neg'}">${fmt(r.growthP2)}</td><td class="num ${gp2===null?'':gp2>=0?'pos':'neg'}">${fp(gp2)}</td>`:''}</tr>`;
  });

  const extra=Math.max(0,2*(n-1));
  h+=`<tr class="rank-summary no-sort-row"><td colspan="4">TOTAL ${qtyMode?'QTY':'SALES'} DISPLAYED</td>${obj.totalDisplayed.slice(0,n).map(x=>`<td class="num">${fmt(x[metricKey])}</td>`).join('')}${extra?`<td colspan="${extra}"></td>`:''}</tr>`;
  h+=`<tr class="rank-summary total-all no-sort-row"><td colspan="4">TOTAL ALL ${qtyMode?'QTY':'SALES'}</td>${totalAll.slice(0,n).map(x=>`<td class="num">${fmt(x[metricKey])}</td>`).join('')}${extra?`<td colspan="${extra}"></td>`:''}</tr>`;
  h+=`<tr class="rank-summary percent no-sort-row"><td colspan="4">% OF TOTAL</td>${obj.displayedShare.slice(0,n).map(x=>`<td class="num">${pct(x)}</td>`).join('')}${extra?`<td colspan="${extra}"></td>`:''}</tr></tbody></table></div>`;
  return h;
}

function renderItems(d){
  const ps=periodsFor('item'),mode=d.metricMode||S.item.metricMode,label=mode==='qty'?'Qty':'Value';

  if(ps.length===1 || d.currentOnly){
    $('#itemTable').innerHTML=`<div class="rank-grid">${itemTable(`Current Sales by ${label} — Previous 1 hidden`,'up',d.topGrowth,d.totalAll,ps,mode)}</div>`;
  }else{
    $('#itemTable').innerHTML=`<div class="rank-grid">${itemTable(`Highest Sales Growth by ${label}`,'up',d.topGrowth,d.totalAll,ps,mode)}${itemTable(`Highest Sales Decline by ${label}`,'down',d.topDecline,d.totalAll,ps,mode)}</div>`;
  }
  $$('#itemTable table').forEach(enhanceTable);
}

function fmtDaily(v,mode){
  const n=Number(v);
  if(!Number.isFinite(n))return '-';
  if(mode==='qty'){
    return n.toLocaleString('en-US',{
      minimumFractionDigits:Number.isInteger(n)?0:1,
      maximumFractionDigits:1
    });
  }
  return Math.round(n).toLocaleString('en-US');
}

function dailyDateLabel(iso){
  return parseISO(iso).toLocaleDateString('en-US',{
    month:'long',day:'numeric',year:'numeric'
  });
}

function renderDailyTrend(d){
  const mode=d.metricMode||S.daily.metricMode;
  const channels=d.channels||[];
  const chartCols=channels.map((_,i)=>i+1).join(',');
  const chartSeries=channels.join(',');

  let h=`<table class="sortable-table chart-table daily-trend-table" data-chart-label="0" data-chart-cols="${esc(chartCols)}" data-chart-series="${esc(chartSeries)}"><thead><tr><th>transaction_date</th>${channels.map(c=>`<th>${esc(c)}</th>`).join('')}<th>Grand Total</th></tr></thead><tbody>`;

  for(const r of d.rows||[]){
    h+=`<tr><td>${esc(dailyDateLabel(r.date))}</td>${channels.map(c=>`<td class="num">${fmtDaily(r.values?.[c]||0,mode)}</td>`).join('')}<td class="num">${fmtDaily(r.total||0,mode)}</td></tr>`;
  }

  h+=`<tr class="daily-grand-total no-sort-row"><td>Grand Total</td>${channels.map(c=>`<td class="num">${fmtDaily(d.totals?.[c]||0,mode)}</td>`).join('')}<td class="num">${fmtDaily(d.grandTotal||0,mode)}</td></tr>`;
  h+=`<tr class="daily-average no-sort-row"><td>Average / Day</td>${channels.map(c=>`<td class="num">${fmtDaily(d.averages?.[c]||0,mode)}</td>`).join('')}<td class="num">${fmtDaily(d.averageGrandTotal||0,mode)}</td></tr>`;
  h+=`<tr class="daily-contribution no-sort-row"><td>%Contr</td>${channels.map(c=>`<td class="num">${pct(d.grandTotal?Number(d.totals?.[c]||0)/Number(d.grandTotal):0)}</td>`).join('')}<td class="num">${d.grandTotal?pct(1):pct(0)}</td></tr>`;
  h+='</tbody></table>';

  $('#dailyTable').innerHTML=h;
  enhanceTable($('#dailyTable table'));
}


function renderItemSales(d){
  const ps=periodsFor('itemSales');
  const n=ps.length;
  const mode=d.metricMode||S.itemSales.metricMode;
  const summaryLabel=mode==='qty'?'QTY':'SALES';
  const hasP1=n>=2,hasP2=n>=3;

  const tableWidth=130+420+125+n*(140+70+82);
  const periodCols=Array.from({length:n},()=>`
    <col class="item-sales-col-sales">
    <col class="item-sales-col-qty">
    <col class="item-sales-col-unit">
  `).join('');

  const chartCols=[3,...(hasP1?[6]:[]),...(hasP2?[9]:[])].join(',');
  const chartSeries=['Current',...(hasP1?['Previous 1']:[]),...(hasP2?['Previous 2']:[])].join(',');

  let h=`<table class="sortable-table chart-table item-sales-table" style="--item-sales-table-width:${tableWidth}px" data-chart-label="1" data-chart-cols="${chartCols}" data-chart-series="${chartSeries}">
    <colgroup>
      <col class="item-sales-col-sku">
      <col class="item-sales-col-item">
      <col class="item-sales-col-brand">
      ${periodCols}
    </colgroup>
    <thead>
    <tr>
      <th rowspan="2">SKU</th>
      <th rowspan="2">Item</th>
      <th rowspan="2">Brand</th>
      <th colspan="3">CURRENT SALES<span class="period-sub">${rangeLabel(ps[0])}</span></th>
      ${hasP1?`<th colspan="3">PREVIOUS 1<span class="period-sub">${rangeLabel(ps[1])}</span></th>`:''}
      ${hasP2?`<th colspan="3">PREVIOUS 2<span class="period-sub">${rangeLabel(ps[2])}</span></th>`:''}
    </tr>
    <tr>
      ${Array.from({length:n},()=>'<th>Sales</th><th>Qty</th><th>Unit_Code</th>').join('')}
    </tr>
  </thead><tbody>`;

  for(const r of d.rows||[]){
    h+=`<tr>
      <td>${esc(r.sku)}</td>
      <td title="${esc(r.itemName)}">${esc(r.itemName)}</td>
      <td>${esc(r.brand)}</td>
      ${r.periods.slice(0,n).map(m=>`
        <td class="num">${fmt(m.sales)}</td>
        <td class="num">${fmt(m.qty)}</td>
        <td class="unit-code">${esc(m.unitCode||'')}</td>
      `).join('')}
    </tr>`;
  }

  const summaryCells=(arr,share=false)=>arr.slice(0,n).map((m,i)=>{
    if(mode==='qty'){
      const value=share?d.displayedShare[i]:m.qty;
      return `<td></td><td class="num">${share?pct(value):fmt(value)}</td><td></td>`;
    }
    const value=share?d.displayedShare[i]:m.sales;
    return `<td class="num">${share?pct(value):fmt(value)}</td><td></td><td></td>`;
  }).join('');

  h+=`<tr class="rank-summary no-sort-row"><td colspan="3">TOTAL ${summaryLabel} DISPLAYED</td>${summaryCells(d.totalDisplayed)}</tr>`;
  h+=`<tr class="rank-summary total-all no-sort-row"><td colspan="3">TOTAL ALL ${summaryLabel}</td>${summaryCells(d.totalAll)}</tr>`;
  h+=`<tr class="rank-summary percent no-sort-row"><td colspan="3">% OF TOTAL</td>${summaryCells(d.totalDisplayed,true)}</tr>`;
  h+='</tbody></table>';

  $('#itemSalesTable').innerHTML=h;
  enhanceTable($('#itemSalesTable table'));
}

function enhanceTable(table){addSort(table)}

function addSort(table){
  if(!table || table.dataset.sortReady) return;

  const headerRows=$$('thead tr',table);
  const occupied=[];

  headerRows.forEach((row,rowIndex)=>{
    occupied[rowIndex]=occupied[rowIndex]||[];
    let logicalCol=0;

    $$('th',row).forEach(th=>{
      while(occupied[rowIndex][logicalCol]) logicalCol++;

      const rowSpan=Number(th.rowSpan||1);
      const colSpan=Number(th.colSpan||1);

      for(let rr=rowIndex;rr<rowIndex+rowSpan;rr++){
        occupied[rr]=occupied[rr]||[];
        for(let cc=logicalCol;cc<logicalCol+colSpan;cc++) occupied[rr][cc]=true;
      }

      if(colSpan===1){
        // IMPORTANT: freeze the current logical column. The previous version
        // captured the mutable `logicalCol`, so every click sorted a wrong/out-of-range column.
        const col=logicalCol;
        th.classList.add('sortable');
        th.dataset.sortCol=String(col);
        th.insertAdjacentHTML('beforeend','<span class="sort-mark" aria-hidden="true"><span>▲</span><span>▼</span></span>');
        th.addEventListener('click',e=>{
          e.preventDefault();
          e.stopPropagation();
          sortRows(table,col,th);
        });
      }

      logicalCol+=colSpan;
    });
  });

  table.dataset.sortReady='1';
}

function sortValue(row,col){
  const cell=row.cells[col];
  if(!cell) return {type:'text',value:''};

  const original=(cell.textContent||'').trim();
  if(!original || original==='-') return {type:'empty',value:''};

  // Percentage cells
  if(original.includes('%')){
    const n=Number(original.replace(/,/g,'').replace(/%/g,'').replace(/\+/g,'').trim());
    if(Number.isFinite(n)) return {type:'number',value:n};
  }

  // Numeric cells (sales, trx, basket, rank, growth value)
  const numeric=original.replace(/,/g,'').replace(/\+/g,'').trim();
  if(/^[-]?\d+(\.\d+)?$/.test(numeric)){
    const n=Number(numeric);
    if(Number.isFinite(n)) return {type:'number',value:n};
  }

  return {type:'text',value:original.toLowerCase()};
}

function sortRows(table,col,clickedHeader){
  const body=table.tBodies[0];
  if(!body) return;

  const allRows=$$('tr',body);
  const sortableRows=allRows.filter(r=>!r.classList.contains('no-sort-row'));
  const pinnedRows=allRows.filter(r=>r.classList.contains('no-sort-row'));

  const isSame=Number(table.dataset.sortCol)===col;
  const nextDir=isSame && table.dataset.sortDir==='asc' ? 'desc' : 'asc';
  const direction=nextDir==='asc' ? 1 : -1;

  sortableRows.sort((a,b)=>{
    const x=sortValue(a,col), y=sortValue(b,col);

    // Keep blanks at the bottom regardless of direction.
    if(x.type==='empty' && y.type!=='empty') return 1;
    if(y.type==='empty' && x.type!=='empty') return -1;

    let cmp=0;
    if(x.type==='number' && y.type==='number') cmp=x.value-y.value;
    else cmp=String(x.value).localeCompare(String(y.value),undefined,{numeric:true,sensitivity:'base'});
    return cmp*direction;
  });

  sortableRows.concat(pinnedRows).forEach(r=>body.appendChild(r));

  table.dataset.sortCol=String(col);
  table.dataset.sortDir=nextDir;

  $$('th.sortable',table).forEach(th=>{
    th.classList.remove('sort-asc','sort-desc');
    const mark=$('.sort-mark',th);
    if(mark) mark.removeAttribute('data-active');
  });
  clickedHeader.classList.add(nextDir==='asc'?'sort-asc':'sort-desc');
  const activeMark=$('.sort-mark',clickedHeader);
  if(activeMark) activeMark.dataset.active=nextDir;
}

// Report exports
$$('.download-btn').forEach(b=>b.onclick=e=>{e.stopPropagation();b.parentElement.classList.toggle('open')});
$$('[data-export]').forEach(b=>b.onclick=()=>{const sec=b.closest('.export-section');b.closest('.download-wrap').classList.remove('open');b.dataset.export==='excel'?exportExcel(sec):exportJpeg(sec)});
function tableArea(sec){return $('.rank-grid',sec)||$('.table-wrap',sec)}
function jpegFilterPairs(sec){
  const pairs=[];

  const metric=$('.metric-select',sec);
  if(metric){
    pairs.push(['Mode',metric.options[metric.selectedIndex]?.textContent||metric.value]);
  }

  $$('.section-filter .field',sec).forEach(field=>{
    const label=($('label',field)?.textContent||'').replace(/\s+/g,' ').trim();
    if(!label)return;

    let value='';
    if(field.classList.contains('range')){
      value=($('.control span',field)?.textContent||'').trim();
    }else if(field.classList.contains('previous1-blank') || field.classList.contains('previous2-blank')){
      value='BLANK / HIDDEN';
    }else if(field.classList.contains('multi')){
      const inputs=$$('.option input',field);
      const checked=inputs.filter(x=>x.checked).map(x=>x.value);
      value=checked.length===inputs.length?`All ${label}`:checked.join(', ');
      if(!value)value='None';
    }else if(field.classList.contains('product-picker')){
      value=$('.product-input',field)?.value.trim()||'All Item';
    }else{
      const select=$('select',field);
      const input=$('input',field);
      if(select)value=select.options[select.selectedIndex]?.textContent||select.value;
      else if(input)value=input.value;
    }

    if(value)pairs.push([label,value]);
  });

  // Include context chips such as Time Factor, but skip "Section X only".
  $$('.section-filter .chips .chip',sec).forEach(chip=>{
    const text=chip.textContent.replace(/\s+/g,' ').trim();
    if(text && !/^Section\s+\d+\s+only$/i.test(text)){
      pairs.push(['Info',text]);
    }
  });

  return pairs;
}

async function exportJpeg(sec){
  if(!window.html2canvas)return alert('JPEG library unavailable');

  const area=tableArea(sec);
  const clone=area.cloneNode(true);
  $$('.sort-mark',clone).forEach(x=>x.remove());

  clone.style.overflow='visible';

  const header=document.createElement('div');
  header.className='jpeg-report-header';

  const no=$('.section-no',sec)?.textContent?.trim()||'';
  const title=$('h2',sec)?.textContent?.trim()||'Report';
  const subtitle=$('.section-title p',sec)?.textContent?.trim()||'';
  const pairs=jpegFilterPairs(sec);

  header.innerHTML=`
    <div class="jpeg-report-title">${no?`<span class="jpeg-section-no">${esc(no)}</span>`:''}<div><h2>${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div></div>
    <div class="jpeg-filter-summary">
      ${pairs.map(([k,v])=>`<span class="jpeg-filter-chip"><b>${esc(k)}:</b> ${esc(v)}</span>`).join('')}
    </div>`;

  const stage=document.createElement('div');
  stage.className='jpeg-export-stage';
  stage.style.cssText='position:fixed;left:-100000px;top:0;background:#fff;padding:14px;width:max-content;z-index:-1';
  stage.appendChild(header);
  stage.appendChild(clone);
  document.body.appendChild(stage);

  const reportWidth=Math.max(
    900,
    area.scrollWidth||0,
    clone.scrollWidth||0,
    area.getBoundingClientRect().width||0
  );
  header.style.width=reportWidth+'px';

  const canvas=await html2canvas(stage,{
    backgroundColor:'#fff',
    scale:2,
    width:stage.scrollWidth,
    height:stage.scrollHeight,
    windowWidth:stage.scrollWidth,
    windowHeight:stage.scrollHeight
  });

  stage.remove();

  const a=document.createElement('a');
  a.download=safeName(title)+'.jpeg';
  a.href=canvas.toDataURL('image/jpeg',.95);
  a.click();
}
function safeName(s){return s.replace(/[^a-z0-9]+/gi,'_').replace(/^_+|_+$/g,'').toLowerCase()}
function excelCellText(td){
  const clone=td.cloneNode(true);
  $$('.sort-mark',clone).forEach(x=>x.remove());
  return clone.textContent.replace(/\s+/g,' ').trim();
}
function cssArgb(cssColor,fallback='FF1F2937'){
  if(!cssColor || cssColor==='transparent') return fallback;
  const s=String(cssColor).trim();
  const m=s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if(!m) return fallback;
  // Browsers report unfilled table cells as rgba(0, 0, 0, 0).
  // Treat fully transparent colors as "no fill" instead of opaque black.
  if(m[4]!==undefined && Number(m[4])===0) return fallback;
  return 'FF'+[m[1],m[2],m[3]].map(x=>Number(x).toString(16).padStart(2,'0')).join('').toUpperCase();
}
function excelBorderStyle(cssStyle){
  if(cssStyle==='double') return 'double';
  if(cssStyle==='dashed') return 'dashed';
  if(cssStyle==='dotted') return 'dotted';
  return 'thin';
}
function uniqueSheetName(wb,rawName,index){
  let name=String(rawName||`Report ${index+1}`).replace(/[\\/*?:\[\]]/g,' ').replace(/\s+/g,' ').trim().slice(0,31)||`Report ${index+1}`;
  const base=name;
  let n=2;
  while(wb.getWorksheet(name)){
    const suffix=` ${n++}`;
    name=base.slice(0,31-suffix.length)+suffix;
  }
  return name;
}
function excelValue(td,text){
  if(!td.classList.contains('num')) return {value:text,numFmt:null};
  if(!text || text==='-') return {value:text,numFmt:null};

  const compact=text.replace(/\s+/g,'').replace(/,/g,'').replace(/\+/g,'');
  if(/^-?\d+(\.\d+)?%$/.test(compact)){
    return {value:Number(compact.slice(0,-1))/100,numFmt:'0.0%'};
  }
  if(/^-?\d+(\.\d+)?$/.test(compact)){
    return {value:Number(compact),numFmt:'#,##0'};
  }
  return {value:text,numFmt:null};
}
async function exportExcel(sec){
  if(!window.ExcelJS)return alert('Excel library unavailable');

  const exportButton=$('[data-export="excel"]',sec);
  const originalText=exportButton?.textContent;

  try{
    if(exportButton){
      exportButton.disabled=true;
      exportButton.textContent='Preparing Excel...';
    }

    const area=tableArea(sec);
    const tables=$$('table',area);
    if(!tables.length)throw new Error('No table found in this section.');

    const wb=new ExcelJS.Workbook();
    wb.creator='Sales Monitoring Dashboard';
    wb.created=new Date();

    for(let ti=0;ti<tables.length;ti++){
      const src=tables[ti];
      const rankBox=src.closest('.rank-box');
      const title=tables.length>1
        ? ($('h3',rankBox)?.textContent||`Report ${ti+1}`)
        : ($('h2',sec)?.textContent||`Report ${ti+1}`);

      const ws=wb.addWorksheet(uniqueSheetName(wb,title,ti));
      const occupied={};
      const colWidths={};

      const exportRows=$$('tr',src).filter(tr=>getComputedStyle(tr).display!=='none');

      exportRows.forEach((tr,ri0)=>{
        const rowNo=ri0+1;
        occupied[rowNo]=occupied[rowNo]||{};
        let colNo=1;

        $$('th,td',tr).forEach(td=>{
          while(occupied[rowNo][colNo])colNo++;

          const rs=Math.max(1,Number(td.rowSpan||1));
          const cs=Math.max(1,Number(td.colSpan||1));
          const text=excelCellText(td);
          const parsed=excelValue(td,text);
          const st=getComputedStyle(td);
          const isHeader=td.tagName==='TH';
          const isNumeric=td.classList.contains('num');
          const baseHorizontal=isNumeric
            ?'right'
            :(isHeader||td.classList.contains('center')?'center':'left');

          const baseFill={
            type:'pattern',
            pattern:'solid',
            fgColor:{argb:cssArgb(st.backgroundColor,'FFFFFFFF')}
          };
          const baseFont={
            name:'Arial',
            size:Math.max(9,Math.min(14,(parseFloat(st.fontSize)||13)*.75)),
            bold:Number(st.fontWeight)>=600,
            color:{argb:cssArgb(st.color,'FF111827')}
          };
          const baseBorder={
            top:{style:excelBorderStyle(st.borderTopStyle),color:{argb:cssArgb(st.borderTopColor,'FF7A838D')}},
            bottom:{style:excelBorderStyle(st.borderBottomStyle),color:{argb:cssArgb(st.borderBottomColor,'FF7A838D')}},
            left:{style:excelBorderStyle(st.borderLeftStyle),color:{argb:cssArgb(st.borderLeftColor,'FF7A838D')}},
            right:{style:excelBorderStyle(st.borderRightStyle),color:{argb:cssArgb(st.borderRightColor,'FF7A838D')}}
          };

          // V43: no merged cells anywhere in exported Excel.
          // Every HTML span is expanded into normal Excel cells. The first cell
          // carries the value and the rest remain blank, but all keep the same
          // fill/font/border so the visual report stays close to the dashboard.
          for(let rOff=0;rOff<rs;rOff++){
            const rr=rowNo+rOff;
            occupied[rr]=occupied[rr]||{};

            for(let cOff=0;cOff<cs;cOff++){
              const cc=colNo+cOff;
              occupied[rr][cc]=true;

              const cell=ws.getCell(rr,cc);
              const isOrigin=rOff===0 && cOff===0;
              cell.value=isOrigin?parsed.value:null;
              if(isOrigin && parsed.numFmt)cell.numFmt=parsed.numFmt;

              cell.fill={...baseFill,fgColor:{...baseFill.fgColor}};
              cell.font={...baseFont,color:{...baseFont.color}};

              // Excel's Center Across Selection equivalent is centerContinuous.
              // Use it only for horizontally grouped header cells. Summary/data
              // colspan cells remain left/right aligned for lookup-friendly use.
              const horizontal=(isHeader && cs>1)
                ?'centerContinuous'
                :baseHorizontal;

              // Row-spanned header labels cannot be vertically centered across
              // unmerged cells. Put the label at the bottom of the first row and
              // remove the internal border, which visually approximates the old
              // merged header while keeping every cell independent.
              const vertical=(isHeader && rs>1 && isOrigin)?'bottom':'middle';

              cell.alignment={
                vertical,
                horizontal,
                wrapText:true
              };

              const border={
                top:{...baseBorder.top,color:{...baseBorder.top.color}},
                bottom:{...baseBorder.bottom,color:{...baseBorder.bottom.color}},
                left:{...baseBorder.left,color:{...baseBorder.left.color}},
                right:{...baseBorder.right,color:{...baseBorder.right.color}}
              };

              // Remove only internal span borders. Outer borders remain intact,
              // so headers/summary rows still look like grouped areas even though
              // the workbook contains zero merged cells.
              if(rOff>0)delete border.top;
              if(rOff<rs-1)delete border.bottom;
              if(cOff>0)delete border.left;
              if(cOff<cs-1)delete border.right;
              cell.border=border;
            }
          }

          // Width measurement: for a colspan, distribute the visible width over
          // its component cells instead of treating it as one giant Excel cell.
          const px=td.getBoundingClientRect().width||0;
          const perCellPx=px/cs;
          for(let cOff=0;cOff<cs;cOff++){
            const c=colNo+cOff;
            const fallbackText=isHeader&&cs>1?'':text;
            const proposed=perCellPx
              ?Math.min(42,Math.max(7.5,perCellPx/7))
              :Math.min(36,Math.max(9,(fallbackText.length/cs)+2));
            colWidths[c]=Math.max(colWidths[c]||0,proposed);
          }

          // Rowspan cells report the combined pixel height; divide it across the
          // underlying Excel rows so the first header row does not become huge.
          const rowPx=td.getBoundingClientRect().height||0;
          if(rowPx){
            const perRow=Math.min(42,Math.max(15,(rowPx/rs)*.75));
            for(let rOff=0;rOff<rs;rOff++){
              const rr=rowNo+rOff;
              ws.getRow(rr).height=Math.max(ws.getRow(rr).height||0,perRow);
            }
          }

          colNo+=cs;
        });
      });

      // Intentionally NO ws.mergeCells() in V43.
      // Header grouping uses centerContinuous / Center Across Selection style.

      const maxCol=Math.max(ws.columnCount,...Object.keys(colWidths).map(Number),1);
      for(let c=1;c<=maxCol;c++){
        if(colWidths[c])ws.getColumn(c).width=colWidths[c];
        else{
          const longest=(ws.getColumn(c).values||[]).reduce((m,v)=>Math.max(m,String(v??'').length),0);
          ws.getColumn(c).width=Math.min(32,Math.max(10,longest+2));
        }
      }

      ws.views=[{state:'frozen',ySplit:src.tHead?.rows.length||1}];
      ws.pageSetup={
        orientation:'landscape',
        fitToPage:true,
        fitToWidth:1,
        fitToHeight:0,
        margins:{left:.25,right:.25,top:.5,bottom:.5,header:.2,footer:.2}
      };
    }

    const buf=await wb.xlsx.writeBuffer();
    const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=safeName($('h2',sec)?.textContent||'Sales Report')+'.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  }catch(err){
    console.error(err);
    alert(`Excel export failed: ${err.message}`);
  }finally{
    if(exportButton){
      exportButton.disabled=false;
      exportButton.textContent=originalText||'Download Excel';
    }
  }
}

// Chart in new window, clearer separated groups
$$('.metric-select').forEach(sel=>sel.onchange=()=>{
  const sec=sel.dataset.section;
  if(S[sec]){
    S[sec].metricMode=sel.value==='qty'?'qty':'value';
    loadSection(sec);
  }
});
$$('.chart-btn').forEach(b=>b.onclick=()=>createChart(b.closest('.section')));
function createChart(sec){const tables=$$('table.chart-table',sec);if(!tables.length)return alert('No chart data');const sets=tables.map(t=>{const cols=(t.dataset.chartCols||'1').split(',').map(Number),names=(t.dataset.chartSeries||'Value').split(','),labelCol=Number(t.dataset.chartLabel||0);const rows=$$('tbody tr',t).filter(r=>!r.classList.contains('no-sort-row')).slice(0,15);return{title:t.closest('.rank-box')?.querySelector('h3')?.textContent||$('h2',sec).textContent,labels:rows.map(r=>r.cells[labelCol]?.textContent||''),series:names.map((name,i)=>({name,values:rows.map(r=>Number((r.cells[cols[i]]?.textContent||'0').replace(/,/g,'').replace(/[^0-9.-]/g,''))||0)}))}});const periods=[];$$('.range .control span:first-child',$('.section-filter',sec)).forEach((x,i)=>periods.push({name:i===0?'Current':'Previous '+i,value:x.textContent}));const w=window.open('','_blank');if(!w)return alert('Allow popup for Create Chart');w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc($('h2',sec).textContent)} Chart</title><style>body{font-family:Arial;background:#f4f6f8;padding:22px;color:#1f2937}.page{max-width:1250px;margin:auto}.periods{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.period{background:#fff;border:1px solid #cbd3da;padding:6px 8px;font-size:11px}.box{background:#fff;border:1px solid #c7cfd7;padding:14px;margin:0 0 18px}.legend{display:flex;gap:12px;font-size:11px;margin:8px 0 12px}canvas{display:block;max-width:100%}</style></head><body><div class="page"><h1>${esc($('h2',sec).textContent)}</h1><div class="periods">${periods.map(p=>`<span class="period"><b>${p.name}:</b> ${p.value}</span>`).join('')}</div><div id="root"></div></div><script>const sets=${JSON.stringify(sets)},colors=['#4d9a63','#5d8fb9','#d49a3a'];function compact(v){if(Math.abs(v)>=1e9)return(v/1e9).toFixed(1)+'B';if(Math.abs(v)>=1e6)return(v/1e6).toFixed(1)+'M';if(Math.abs(v)>=1e3)return(v/1e3).toFixed(0)+'K';return Math.round(v)}function draw(c,d){const W=1180,rowH=Math.max(60,38+d.series.length*12),H=Math.max(350,95+d.labels.length*rowH),dpr=devicePixelRatio||1;c.width=W*dpr;c.height=H*dpr;c.style.width=W+'px';c.style.height=H+'px';const x=c.getContext('2d');x.scale(dpr,dpr);const L=220,R=55,T=38,B=42,cw=W-L-R,ch=H-T-B,max=Math.max(1,...d.series.flatMap(s=>s.values)),gh=ch/Math.max(1,d.labels.length),gap=6,bh=Math.max(10,Math.min(18,(gh-20)/d.series.length));x.font='11px Arial';for(let q=0;q<=5;q++){const xx=L+cw*q/5;x.strokeStyle='#dde3e9';x.beginPath();x.moveTo(xx,T);x.lineTo(xx,H-B);x.stroke();x.fillStyle='#667085';x.fillText(compact(max*q/5),xx-10,H-B+20)}d.labels.forEach((lab,i)=>{const gy=T+i*gh;if(i%2===0){x.fillStyle='#f8fafb';x.fillRect(0,gy,W,gh)}x.strokeStyle='#c7d0d8';x.lineWidth=1.4;x.beginPath();x.moveTo(0,gy);x.lineTo(W,gy);x.stroke();x.fillStyle='#344054';x.font='bold 11px Arial';x.fillText(lab.slice(0,30),10,gy+gh/2+4);d.series.forEach((s,j)=>{const v=s.values[i]||0,bw=Math.max(0,v)/max*cw,y=gy+10+j*(bh+gap);x.fillStyle=colors[j%colors.length];x.fillRect(L,y,bw,bh);x.fillStyle=bw>70?'#fff':'#475467';x.font='10px Arial';x.fillText(compact(v),bw>70?L+bw-50:L+bw+5,y+bh-3)})})}const root=document.getElementById('root');sets.forEach(d=>{const box=document.createElement('div');box.className='box';box.innerHTML='<h2>'+d.title+'</h2><div class="legend">'+d.series.map((s,i)=>'<span><b style="display:inline-block;width:10px;height:10px;background:'+colors[i%colors.length]+';margin-right:4px"></b>'+s.name+'</span>').join('')+'</div>';const c=document.createElement('canvas');box.appendChild(c);root.appendChild(box);draw(c,d)})<\/script></body></html>`);w.document.close()}


function normalUpdateHeaderText(){
  const upload=META.runtime?.lastUpload||{};
  const headerDateISO=upload.detectedEnd||META?.maxDate||null;
  const rawDate=headerDateISO?parseISO(headerDateISO):null;
  if(!rawDate)return 'NO RAW DATA';

  const updateAt=META.runtime?.updatedAt?new Date(META.runtime.updatedAt):null;
  const updateTime=updateAt&&!Number.isNaN(updateAt.getTime())
    ?updateAt.toLocaleTimeString('id-ID',{
        timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false
      }).replace('.',':')
    :'--:--';

  let source='manual update';

  if(upload.mode==='metabase_auto_sync'){
    source=String(upload.trigger||'').startsWith('admin:')
      ?'Run Now'
      :'Metabase update';
  }else if(upload.mode==='monthly_replace'){
    source='manual upload';
  }

  return `Update Sales Data ${rawDate.toLocaleDateString('id-ID',{
    day:'numeric',month:'short',year:'numeric'
  })} pk ${updateTime} (by ${source})`;
}

function renderUpdateHeader(){
  const el=$('#updatedAt');
  if(!el)return;
  el.classList.remove('auto-running','auto-late','auto-failed','auto-not-configured');
  el.classList.add('auto-ok');
  el.textContent=normalUpdateHeaderText();
  el.title='Status update data terakhir';
}

async function refreshUpdateHeader(){
  try{
    const fresh=await api('/api/meta');
    const before=META?.runtime?.updatedAt||'';
    const after=fresh?.runtime?.updatedAt||'';

    META=fresh;
    renderUpdateHeader();

    if(after && before && after!==before){
      console.log(`[DASHBOARD] data update detected ${before} -> ${after}`);
    }
  }catch(e){
    console.warn('[DASHBOARD] update header refresh failed:',e.message);
  }
}



const SECTION_STATE_MAP={
  channelSection:'channel',
  targetSection:'target',
  categoryTargetSection:'categoryTarget',
  storeSection:'store',
  brandSection:'brand',
  itemSection:'item',
  dailySection:'daily',
  itemSalesSection:'itemSales'
};

function sectionVisibilityKey(){
  const user=ME?.username||'anonymous';
  return `sales-dashboard:section-visibility:${user}`;
}

function loadSectionVisibility(){
  try{
    const x=JSON.parse(localStorage.getItem(sectionVisibilityKey())||'{}');
    return x && typeof x==='object'?x:{};
  }catch{return {}}
}

function saveSectionVisibility(prefs){
  try{localStorage.setItem(sectionVisibilityKey(),JSON.stringify(prefs))}catch{}
}

function isSectionHiddenByPreference(sectionId){
  return loadSectionVisibility()[sectionId]===false;
}

function setupSectionVisibility(){
  const prefs=loadSectionVisibility();

  $$('.export-section').forEach(sec=>{
    const id=sec.id;
    if(!id)return;

    let btn=$('.section-toggle-btn',sec);
    if(!btn){
      btn=document.createElement('button');
      btn.type='button';
      btn.className='btn section-toggle-btn';
      const actions=$('.section-actions',sec);
      if(actions)actions.prepend(btn);
    }

    const hidden=prefs[id]===false;
    sec.classList.toggle('section-collapsed',hidden);
    btn.textContent=hidden?'Show':'Hide';
    btn.title=hidden?'Show section':'Hide section';

    btn.onclick=async()=>{
      const nowHidden=!sec.classList.contains('section-collapsed');
      sec.classList.toggle('section-collapsed',nowHidden);
      btn.textContent=nowHidden?'Show':'Hide';
      btn.title=nowHidden?'Show section':'Hide section';

      const latest=loadSectionVisibility();
      latest[id]=!nowHidden;
      saveSectionVisibility(latest);

      // Hidden sections make no query on page load. When shown again,
      // refresh that section once with the user's current filters.
      if(!nowHidden){
        const stateKey=SECTION_STATE_MAP[id];
        if(stateKey)await loadSection(stateKey);
      }
    };
  });
}


async function boot(){
  ME=await api('/api/auth/me');
  $('#userChip').textContent=`${ME.displayName||ME.username} • ${ME.role.toUpperCase()}`;
  if(ME.role==='admin')$('#adminLink').classList.remove('hidden');

  META=await api('/api/meta');
  renderUpdateHeader();
  $('#noData').classList.toggle('hidden',!!META.runtime?.rowCount);

  initState();
  renderFilters();
  setupSectionVisibility();

  for(const sec of ['channel','target','categoryTarget','store','brand','item','daily','itemSales']){
    const sectionId=Object.keys(SECTION_STATE_MAP).find(k=>SECTION_STATE_MAP[k]===sec);
    if(sectionId && isSectionHiddenByPreference(sectionId))continue;
    await loadSection(sec);
  }

  // If RUN NOW is used from another tab, refresh only the latest-update
  // metadata/header every minute. Filters/tables are left untouched.
  setInterval(refreshUpdateHeader,60000);
}
$('#logoutBtn').onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});location.href='/login.html'};
boot().catch(e=>{console.error(e);location.href='/login.html'});
