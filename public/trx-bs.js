let META=null,ME=null;
const S={
  periods:[],
  prevCount:2,
  showRows:3,
  product:'',
  productLabel:'',
  filters:{},
  bands:[],
  lastResult:null
};
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const clone=o=>JSON.parse(JSON.stringify(o));
const api=async(url,opts={})=>{
  const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});
  if(r.status===401){location.href='/login.html';throw new Error('Unauthorized')}
  const d=await r.json();
  if(!r.ok){const e=new Error(d.error||'Request failed');e.rows=d.rows;throw e}
  return d;
};
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmt=n=>n===null||n===undefined||!Number.isFinite(Number(n))?'-':Math.round(Number(n)).toLocaleString('en-US');
const pct=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'-':`${(Number(v)*100).toFixed(1)}%`;
const localISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const parseISO=iso=>{const [y,m,d]=String(iso).split('-').map(Number);return new Date(y,m-1,d)};
const dateLabel=iso=>parseISO(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
const rangeLabel=p=>`${dateLabel(p.start)} - ${dateLabel(p.end)}`;

function shiftDateMonthsClamped(iso,offset){
  const [y,m,d]=String(iso).split('-').map(Number);
  const total=y*12+(m-1)+offset;
  const ty=Math.floor(total/12),tm=((total%12)+12)%12;
  const td=Math.min(d,new Date(ty,tm+1,0).getDate());
  return `${ty}-${String(tm+1).padStart(2,'0')}-${String(td).padStart(2,'0')}`;
}
function linkedPreviousPeriod(current,offset){
  return {start:shiftDateMonthsClamped(current.start,offset),end:shiftDateMonthsClamped(current.end,offset)};
}
function defaultPeriods(){
  const today=localISO(new Date());
  const max=META.maxDate||today;
  const current={start:max.slice(0,8)+'01',end:max};
  return [current,linkedPreviousPeriod(current,-1),linkedPreviousPeriod(current,-2)];
}
function syncLinkedPreviousPeriods(){
  S.periods[1]=linkedPreviousPeriod(S.periods[0],-1);
  S.periods[2]=linkedPreviousPeriod(S.periods[0],-2);
}
function periodsForRequest(){return S.periods.slice(0,1+S.prevCount)}
function all(arr,key){return (arr||[]).map(x=>key?x[key]:x)}

const BAND_STORAGE='sales-dashboard:trx-bs-bands:v1';
function defaultBands(){
  return [
    {type:'gt',value:125000,min:'',max:''},
    {type:'range',value:'',min:75000,max:125000},
    {type:'lt',value:75000,min:'',max:''},
    ...Array.from({length:7},()=>({type:'range',value:'',min:'',max:''}))
  ];
}
function loadBandPrefs(){
  const fallback={showRows:3,bands:defaultBands()};
  try{
    const x=JSON.parse(localStorage.getItem(BAND_STORAGE)||'null');
    if(!x || !Array.isArray(x.bands))return fallback;
    const bands=defaultBands();
    for(let i=0;i<Math.min(10,x.bands.length);i++)bands[i]={...bands[i],...x.bands[i]};
    return {showRows:Math.max(1,Math.min(10,Number(x.showRows)||3)),bands};
  }catch{return fallback}
}
function saveBandPrefs(){
  try{localStorage.setItem(BAND_STORAGE,JSON.stringify({showRows:S.showRows,bands:S.bands}))}catch{}
}

function initState(){
  S.periods=defaultPeriods();
  S.prevCount=2;
  S.product='';S.productLabel='';
  S.filters={
    channels:clone(META.channels||[]),
    stores:all(META.stores||[],'name'),
    categories:clone(META.categories||[]),
    brands:clone(META.brands||[]),
    salesTypes:clone(META.salesTypes||[]),
    customerTypes:clone(META.customerTypes||[]),
    storeStats:clone(META.storeStats||[])
  };
  const prefs=loadBandPrefs();
  S.showRows=prefs.showRows;
  S.bands=prefs.bands;
}

function rangeControl(key,label,period){
  const hideP1=key==='p1'?'<button class="mini-hide prev1-hide" type="button">BLANK / HIDE</button>':'';
  const hideP2=key==='p2'?'<button class="mini-hide prev2-hide" type="button">BLANK / HIDE</button>':'';
  const today=key==='p0'?'<button class="mini-today range-today" type="button" title="Set Current Period to latest available sales day">TODAY</button>':'';
  return `<div class="field range" data-key="${key}"><label>${label}</label><button class="control" type="button"><span>${rangeLabel(period)}</span><span>▾</span></button><div class="range-pop"><div class="cal-head"><button class="prev" type="button">‹</button><b class="hint">Click start, then end</b><button class="next" type="button">›</button></div><div class="months"></div><div class="cal-foot"><span class="selected">${rangeLabel(period)}</span><div class="cal-actions">${today}${hideP1}${hideP2}<button class="clear" type="button">Clear</button></div></div></div></div>`;
}
function previous1Control(){
  return S.prevCount>=1?rangeControl('p1','Previous 1',S.periods[1]):'<div class="field previous1-blank"><label>Previous 1</label><button class="control prev1-show" type="button"><span>BLANK / HIDDEN</span><span>＋</span></button></div>';
}
function previous2Control(){
  return S.prevCount===2?rangeControl('p2','Previous 2',S.periods[2]):'<div class="field previous2-blank"><label>Previous 2</label><button class="control prev2-show" type="button"><span>BLANK / HIDDEN</span><span>＋</span></button></div>';
}
function multiControl(key,label,options,selected,search=false){
  const vals=(options||[]).map(o=>typeof o==='string'?o:o.name);
  const set=new Set(selected||[]);
  return `<div class="field multi" data-key="${key}"><label>${label}</label><button class="control" type="button"><span class="multi-label">${set.size===vals.length?'All '+label:set.size+' Selected'}</span><span>▾</span></button><div class="drop">${search?'<input class="search-input" placeholder="Search...">':''}<label class="check"><input type="checkbox" class="toggle-all" ${set.size===vals.length?'checked':''}>Select All</label>${vals.map(v=>`<label class="check option"><input type="checkbox" value="${esc(v)}" ${set.has(v)?'checked':''}>${esc(v)}</label>`).join('')}</div></div>`;
}
function showRowControl(){
  return `<div class="field"><label>Show Row</label><select class="control" id="showRows">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<option value="${n}" ${n===S.showRows?'selected':''}>${n}</option>`).join('')}</select></div>`;
}
function productPicker(){
  const display=S.productLabel||S.product||'';
  return `<div class="field product-picker" data-section="basket"><label>Item (SKU / Name)</label><div class="product-input-wrap"><input class="control product-input" autocomplete="off" value="${esc(display)}" placeholder="Type SKU or item name"><button class="product-clear ${display?'':'hidden'}" type="button" title="Clear item">×</button></div><div class="product-suggest"><div class="product-suggest-info">Ketik minimal 2 karakter SKU atau nama item</div><div class="product-options"></div></div></div>`;
}
function activeMultiChip(label,selected,options){
  const vals=(options||[]).map(o=>typeof o==='string'?o:o.name);
  if(!selected?.length || selected.length===vals.length)return '';
  const text=selected.length<=3?selected.join(', '):`${selected.length} Selected`;
  return `<span class="chip"><b>${esc(label)}:</b> ${esc(text)}</span>`;
}
function activeChips(){
  let h='<span class="chip"><b>Section A only</b></span>';
  h+=activeMultiChip('Channel',S.filters.channels,META.channels);
  h+=activeMultiChip('Store',S.filters.stores,META.stores);
  h+=activeMultiChip('Category',S.filters.categories,META.categories);
  h+=activeMultiChip('Brand',S.filters.brands,META.brands);
  h+=activeMultiChip('Sales Type',S.filters.salesTypes,META.salesTypes);
  h+=activeMultiChip('Customer Type',S.filters.customerTypes,META.customerTypes||[]);
  h+=activeMultiChip('Store Stat',S.filters.storeStats,META.storeStats||[]);
  if(S.productLabel||S.product)h+=`<span class="chip"><b>Item:</b> ${esc(S.productLabel||S.product)}</span>`;
  return h;
}
function renderFilters(){
  $('#basketFilters').innerHTML=`<div class="filter-grid">${rangeControl('p0','Current',S.periods[0])}${previous1Control()}${previous2Control()}${multiControl('channels','Channel',META.channels,S.filters.channels,true)}${multiControl('stores','Store',META.stores,S.filters.stores,true)}${multiControl('categories','Category',META.categories,S.filters.categories,true)}${multiControl('brands','Brand',META.brands,S.filters.brands,true)}${multiControl('salesTypes','Sales Type',META.salesTypes,S.filters.salesTypes)}${multiControl('customerTypes','Customer Type',META.customerTypes||[],S.filters.customerTypes)}${multiControl('storeStats','Store Stat',META.storeStats||[],S.filters.storeStats)}${showRowControl()}${productPicker()}<button class="apply" id="applyBasket" type="button">APPLY</button></div><div class="chips">${activeChips()}</div>`;
  bindFilters();
}
function syncMulti(f){
  const key=f.dataset.key;
  const values=$$('.option input:checked',f).map(x=>x.value);
  S.filters[key]=values;
  $('.multi-label',f).textContent=values.length===$$('.option input',f).length?'All '+$('label',f).textContent:values.length+' Selected';
  const ta=$('.toggle-all',f);if(ta)ta.checked=values.length===$$('.option input',f).length;
}
function bindFilters(){
  $$('.multi .control').forEach(btn=>btn.onclick=e=>{e.stopPropagation();const f=btn.closest('.multi');$$('.multi.open,.range.open,.product-picker.open').forEach(x=>x!==f&&x.classList.remove('open'));f.classList.toggle('open')});
  $$('.toggle-all').forEach(cb=>cb.onchange=()=>{const f=cb.closest('.multi');$$('.option input',f).forEach(x=>x.checked=cb.checked);syncMulti(f)});
  $$('.option input').forEach(cb=>cb.onchange=()=>syncMulti(cb.closest('.multi')));
  $$('.search-input').forEach(inp=>{inp.onclick=e=>e.stopPropagation();inp.oninput=()=>{const q=inp.value.toLowerCase();$$('.option',inp.closest('.drop')).forEach(r=>r.style.display=r.textContent.toLowerCase().includes(q)?'flex':'none')}});
  $$('.range').forEach(setupRange);
  $$('.prev1-hide').forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation();S.prevCount=0;renderFilters();S.lastResult=null;renderBasketTable()});
  $$('.prev1-show').forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation();S.prevCount=Math.max(1,S.prevCount);renderFilters();S.lastResult=null;renderBasketTable()});
  $$('.prev2-hide').forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation();S.prevCount=1;renderFilters();S.lastResult=null;renderBasketTable()});
  $$('.prev2-show').forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation();S.prevCount=2;renderFilters();S.lastResult=null;renderBasketTable()});
  $('#showRows').onchange=()=>{S.showRows=Number($('#showRows').value);saveBandPrefs();S.lastResult=null;renderBasketTable()};
  $('#applyBasket').onclick=loadBasket;
  bindProductPicker();
}
function bindProductPicker(){
  const picker=$('.product-picker');if(!picker)return;
  const inp=$('.product-input',picker),drop=$('.product-suggest',picker),opts=$('.product-options',picker),info=$('.product-suggest-info',picker),clear=$('.product-clear',picker);
  let timer=null,requestSeq=0;
  const close=()=>picker.classList.remove('open'),open=()=>picker.classList.add('open');
  async function searchProducts(){
    const q=inp.value.trim();S.productLabel=q;S.product=q;clear.classList.toggle('hidden',!q);
    if(q.length<2){opts.innerHTML='';info.textContent='Ketik minimal 2 karakter SKU atau nama item';open();return}
    const seq=++requestSeq;info.textContent='Searching item...';opts.innerHTML='';open();
    try{
      const rows=await api('/api/meta/products?q='+encodeURIComponent(q));if(seq!==requestSeq)return;
      if(!rows.length){info.textContent='Item tidak ditemukan';return}
      info.textContent=`${rows.length}${rows.length>=50?'+':''} item ditemukan • pilih 1 item`;
      opts.innerHTML=rows.map(r=>`<button class="product-option" type="button" data-sku="${esc(r.sku)}" data-name="${esc(r.itemName)}" data-brand="${esc(r.brand||'')}"><span class="product-option-sku">${esc(r.sku||'-')}</span><span class="product-option-name">${esc(r.itemName||'-')}</span><span class="product-option-brand">${esc(r.brand||'')}</span></button>`).join('');
      $$('.product-option',opts).forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation();const sku=btn.dataset.sku||'',name=btn.dataset.name||'';S.product=sku||name;S.productLabel=sku&&name?`${sku} — ${name}`:(sku||name);inp.value=S.productLabel;clear.classList.remove('hidden');close()});
    }catch(err){if(seq!==requestSeq)return;info.textContent='Gagal memuat list item';opts.innerHTML=`<div class="product-error">${esc(err.message)}</div>`}
  }
  inp.onclick=e=>{e.stopPropagation();open();if(inp.value.trim().length>=2)searchProducts()};
  inp.onfocus=()=>{open();if(inp.value.trim().length>=2)searchProducts()};
  inp.oninput=()=>{clearTimeout(timer);timer=setTimeout(searchProducts,220)};
  inp.onkeydown=e=>{if(e.key==='Escape'){close();inp.blur()}if(e.key==='Enter'){const first=$('.product-option',opts);if(first){e.preventDefault();first.click()}}};
  clear.onclick=e=>{e.preventDefault();e.stopPropagation();requestSeq++;clearTimeout(timer);inp.value='';S.product='';S.productLabel='';opts.innerHTML='';info.textContent='Ketik minimal 2 karakter SKU atau nama item';clear.classList.add('hidden');open();inp.focus()};
  drop.onclick=e=>e.stopPropagation();
}

document.addEventListener('click',e=>{$$('.multi.open,.range.open,.product-picker.open').forEach(x=>{if(!x.contains(e.target))x.classList.remove('open')})});

function setupRange(f){
  const key=f.dataset.key,idx=Number(key.slice(1));
  let p=S.periods[idx],temp=null,view=parseISO(p.start);
  const btn=$('.control',f),months=$('.months',f),hint=$('.hint',f),selected=$('.selected',f);
  const same=(a,b)=>a&&b&&localISO(a)===localISO(b),inRange=(d,a,b)=>a&&b&&d>=a&&d<=b;
  function render(){
    const one=m=>{
      const y=m.getFullYear(),mo=m.getMonth(),first=new Date(y,mo,1),grid=new Date(y,mo,1-first.getDay());
      let h=`<div class="month"><div class="month-title">${m.toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</div><div class="week"><div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div></div><div class="days">`;
      for(let i=0;i<42;i++){
        const d=new Date(grid.getFullYear(),grid.getMonth(),grid.getDate()+i),iso=localISO(d);let c='day';if(d.getMonth()!==mo)c+=' muted';
        const a=parseISO(p.start),b=parseISO(p.end),maxAvailable=META.maxDate?parseISO(META.maxDate):null,unavailable=maxAvailable&&d>maxAvailable;
        if(!temp&&inRange(d,a,b))c+=' inrange';if(same(d,temp||a))c+=' start';if(!temp&&same(d,b))c+=' end';if(unavailable)c+=' unavailable';
        h+=`<button class="${c}" data-date="${iso}" type="button" ${unavailable?'disabled aria-disabled="true" title="No raw sales data yet"':''}>${d.getDate()}</button>`;
      }
      return h+'</div></div>';
    };
    const next=new Date(view.getFullYear(),view.getMonth()+1,1);months.innerHTML=one(view)+one(next);
    const maxAvailable=META.maxDate?parseISO(META.maxDate):null;if(maxAvailable){const maxMonthStart=new Date(maxAvailable.getFullYear(),maxAvailable.getMonth(),1),nextViewStart=new Date(view.getFullYear(),view.getMonth()+1,1);$('.next',f).disabled=nextViewStart>maxMonthStart}
    $$('.day:not(:disabled)',months).forEach(dayBtn=>dayBtn.onclick=e=>{e.stopPropagation();const click=parseISO(dayBtn.dataset.date);if(!temp){temp=click;hint.textContent='Now click end date';selected.textContent='Start: '+dateLabel(dayBtn.dataset.date)}else{let a=temp,b=click;if(b<a)[a,b]=[b,a];p={start:localISO(a),end:localISO(b)};S.periods[idx]=p;if(idx===0){syncLinkedPreviousPeriods();temp=null;S.lastResult=null;renderFilters();renderBasketTable();return}temp=null;btn.firstElementChild.textContent=rangeLabel(p);selected.textContent=rangeLabel(p);hint.textContent='Click start, then end';S.lastResult=null}render()})
  }
  btn.onclick=e=>{e.stopPropagation();$$('.multi.open,.range.open,.product-picker.open').forEach(x=>x!==f&&x.classList.remove('open'));f.classList.toggle('open')};
  $('.prev',f).onclick=e=>{e.stopPropagation();view=new Date(view.getFullYear(),view.getMonth()-1,1);render()};
  $('.next',f).onclick=e=>{e.stopPropagation();view=new Date(view.getFullYear(),view.getMonth()+1,1);render()};
  const todayBtn=$('.range-today',f);if(todayBtn)todayBtn.onclick=e=>{e.preventDefault();e.stopPropagation();let end=localISO(new Date());if(META.maxDate&&META.maxDate<end)end=META.maxDate;S.periods[0]={start:end,end};syncLinkedPreviousPeriods();S.lastResult=null;renderFilters();renderBasketTable()};
  $('.clear',f).onclick=e=>{e.stopPropagation();temp=null;hint.textContent='Click start, then end';selected.textContent=rangeLabel(p);render()};
  render();
}

function typeSymbol(type){return ({gt:'>',gte:'≥',range:'-',lt:'<',lte:'≤'})[type]||'-'}
function bandValueHtml(band,i){
  if(band.type==='range')return `<div class="basket-value-wrap"><input class="basket-value-input band-min" data-index="${i}" type="number" min="0" step="1" inputmode="numeric" placeholder="Min" value="${band.min??''}"><span class="dash">-</span><input class="basket-value-input band-max" data-index="${i}" type="number" min="0" step="1" inputmode="numeric" placeholder="Max" value="${band.max??''}"></div>`;
  return `<div class="basket-value-wrap"><input class="basket-value-input band-value" data-index="${i}" type="number" min="0" step="1" inputmode="numeric" placeholder="Value" value="${band.value??''}"></div>`;
}
function bandInterval(band){
  const n=v=>(v===''||v===null||v===undefined)?null:Number(v);
  if(band.type==='range'){
    const min=n(band.min),max=n(band.max);if(!Number.isFinite(min)||!Number.isFinite(max)||min<0||max<0)return {error:'VALUE'};if(min>max)return {error:'RANGE'};return {min,max,minInclusive:true,maxInclusive:true};
  }
  const value=n(band.value);if(!Number.isFinite(value)||value<0)return {error:'VALUE'};
  if(band.type==='gt')return {min:value,max:Infinity,minInclusive:false,maxInclusive:false};
  if(band.type==='gte')return {min:value,max:Infinity,minInclusive:true,maxInclusive:false};
  if(band.type==='lt')return {min:-Infinity,max:value,minInclusive:false,maxInclusive:false};
  if(band.type==='lte')return {min:-Infinity,max:value,minInclusive:false,maxInclusive:true};
  return {error:'TYPE'};
}
function containsBoundary(b,x){if(x<b.min||x>b.max)return false;if(x===b.min&&!b.minInclusive)return false;if(x===b.max&&!b.maxInclusive)return false;return true}
function overlapInfo(a,b){
  const lo=Math.max(a.min,b.min),hi=Math.min(a.max,b.max);if(lo<hi)return {overlap:true,boundary:null};if(lo>hi)return {overlap:false};return {overlap:containsBoundary(a,lo)&&containsBoundary(b,lo),boundary:lo};
}
function validateBands(show=true){
  const active=S.bands.slice(0,S.showRows),intervals=[];
  for(let i=0;i<active.length;i++){
    const x=bandInterval(active[i]);
    if(x.error){
      const msg=x.error==='RANGE'?`Row ${i+1}: nilai Min tidak boleh lebih besar dari Max.`:`Row ${i+1}: isi angka Basket Size terlebih dahulu.`;
      if(show)showValidation(msg,[i+1]);return {ok:false,message:msg,rows:[i+1]};
    }
    intervals.push(x);
  }
  for(let i=0;i<intervals.length;i++)for(let j=i+1;j<intervals.length;j++){
    const o=overlapInfo(intervals[i],intervals[j]);if(!o.overlap)continue;
    let msg;
    if(Number.isFinite(o.boundary))msg=`Row ${i+1} dan Row ${j+1} overlap di ${fmt(o.boundary)}. Karena kedua kondisi memasukkan angka ${fmt(o.boundary)}, batas harus diubah. Contoh: > ${fmt(o.boundary)} boleh berdampingan dengan range yang berakhir di ${fmt(o.boundary)}; tetapi ≥ ${fmt(o.boundary)} tidak boleh.`;
    else msg=`Row ${i+1} dan Row ${j+1} memiliki rentang Basket Size yang bertumpuk. Setiap nilai hanya boleh masuk ke satu row.`;
    if(show)showValidation(msg,[i+1,j+1]);return {ok:false,message:msg,rows:[i+1,j+1]};
  }
  if(show)showValidation('',[]);return {ok:true};
}
function showValidation(message,rows=[]){
  const box=$('#basketValidation');box.textContent=message||'';box.classList.toggle('hidden',!message);
  $$('.basket-table tbody tr[data-row]').forEach(tr=>tr.classList.toggle('basket-row-invalid',rows.includes(Number(tr.dataset.row))));
  const apply=$('#applyBasket');if(apply)apply.disabled=!!message;
}
function readBandInputs(){
  $$('.basket-rule-type').forEach(sel=>{const i=Number(sel.dataset.index);S.bands[i].type=sel.value});
  $$('.band-value').forEach(inp=>S.bands[Number(inp.dataset.index)].value=inp.value);
  $$('.band-min').forEach(inp=>S.bands[Number(inp.dataset.index)].min=inp.value);
  $$('.band-max').forEach(inp=>S.bands[Number(inp.dataset.index)].max=inp.value);
  saveBandPrefs();
}
function resultFor(rowIndex,periodIndex){return S.lastResult?.rows?.[rowIndex]?.periods?.[periodIndex]||null}
function renderBasketTable(){
  const periods=periodsForRequest();
  let h='<table class="basket-table"><thead><tr><th rowspan="2">TYPE</th><th rowspan="2">BASKET SIZE</th>';
  periods.forEach((p,i)=>{h+=`<th colspan="2" class="${i===0?'group-current':i===1?'group-prev1':'group-prev2'}">${i===0?'CURRENT':i===1?'PREVIOUS 1':'PREVIOUS 2'}<span class="period-sub">${esc(rangeLabel(p))}</span></th>`});
  h+='</tr><tr>'+periods.map(()=>'<th>Trx</th><th>%</th>').join('')+'</tr></thead><tbody>';
  for(let i=0;i<S.showRows;i++){
    const band=S.bands[i]||{type:'range',value:'',min:'',max:''};
    h+=`<tr data-row="${i+1}"><td class="basket-type-cell"><select class="basket-rule-type" data-index="${i}"><option value="gt" ${band.type==='gt'?'selected':''}>&gt;</option><option value="gte" ${band.type==='gte'?'selected':''}>&ge;</option><option value="range" ${band.type==='range'?'selected':''}>-</option><option value="lt" ${band.type==='lt'?'selected':''}>&lt;</option><option value="lte" ${band.type==='lte'?'selected':''}>&le;</option></select></td><td class="basket-band-cell">${bandValueHtml(band,i)}</td>`;
    for(let pi=0;pi<periods.length;pi++){const r=resultFor(i,pi);h+=`<td class="num">${r?fmt(r.trx):'-'}</td><td class="num">${r?pct(r.pct):'-'}</td>`}
    h+='</tr>';
  }
  if(S.lastResult){h+='<tr class="basket-total-row"><td colspan="2">TOTAL TRX</td>'+periods.map((_,i)=>`<td class="num">${fmt(S.lastResult.totals?.[i]||0)}</td><td class="num">100.0%</td>`).join('')+'</tr>'}
  h+='</tbody></table>';
  if(S.lastResult){
    const parts=periods.map((_,i)=>`${i===0?'Current':i===1?'Previous 1':'Previous 2'}: <strong>${fmt(S.lastResult.unclassified?.[i]||0)}</strong>`);
    h+=`<div class="basket-unclassified">Trx yang belum masuk ke band mana pun — ${parts.join(' &nbsp;•&nbsp; ')}. Jika semua rentang menutup seluruh Basket Size tanpa gap, nilainya 0.</div>`;
  }else h+='<div class="basket-pending">Atur TYPE dan angka Basket Size, lalu klik <b>APPLY</b> untuk menghitung Trx dan %.</div>';
  $('#basketTable').innerHTML=h;
  $$('.basket-rule-type').forEach(sel=>sel.onchange=()=>{readBandInputs();S.lastResult=null;renderBasketTable()});
  $$('.basket-value-input').forEach(inp=>{
    inp.oninput=()=>{readBandInputs();S.lastResult=null;validateBands(true)};
    inp.onblur=()=>{readBandInputs();renderBasketTable()};
    inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();readBandInputs();loadBasket()}};
  });
  validateBands(true);
}

function reqFilters(){const f=clone(S.filters);f.product=S.product;return f}
async function loadBasket(){
  readBandInputs();const check=validateBands(true);if(!check.ok)return;
  const btn=$('#applyBasket');if(btn){btn.disabled=true;btn.textContent='LOADING...'}
  $('#basketTable').innerHTML='<div class="loading">Calculating Basket Size...</div>';
  try{
    const d=await api('/api/query/trx-basket-size',{method:'POST',body:JSON.stringify({periods:periodsForRequest(),filters:reqFilters(),showRows:S.showRows,bands:S.bands.slice(0,S.showRows)})});
    S.lastResult=d;renderFilters();renderBasketTable();
  }catch(e){
    S.lastResult=null;renderFilters();renderBasketTable();
    const rows=Array.isArray(e.rows)?e.rows:[];
    if(String(e.message).startsWith('BASKET_BANDS_OVERLAP'))showValidation('Basket Size band overlap. Periksa batas setiap row; satu nilai transaksi tidak boleh terhitung di dua row.',rows);
    else showValidation(`Gagal menghitung: ${e.message}`,rows);
  }
}

function normalUpdateHeaderText(){
  const rt=META?.runtime||{};if(!rt.updatedAt)return 'NO RAW DATA';
  const d=new Date(rt.updatedAt),date=d.toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'short',year:'numeric'}),time=d.toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).replace('.',':');
  let source='update';const u=rt.lastUpload||{};if(String(u.trigger||'').startsWith('admin:'))source='Run Now';else if(u.mode==='monthly_replace')source='manual upload';
  return `Update Sales Data ${date} pk ${time} (by ${source})`;
}
function renderUpdateHeader(){const el=$('#updatedAt');if(el)el.textContent=normalUpdateHeaderText()}

async function boot(){
  ME=await api('/api/auth/me');$('#userChip').textContent=`${ME.displayName||ME.username} • ${ME.role.toUpperCase()}`;if(ME.role==='admin')$('#adminLink').classList.remove('hidden');
  META=await api('/api/meta');renderUpdateHeader();$('#noData').classList.toggle('hidden',!!META.runtime?.rowCount);
  initState();renderFilters();renderBasketTable();
  if(META.runtime?.rowCount)await loadBasket();
}
$('#logoutBtn').onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});location.href='/login.html'};
boot().catch(e=>{console.error(e);location.href='/login.html'});
