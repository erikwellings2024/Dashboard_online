// V56 Admin > Halodoc Rejection: manual weekly input per store.
(function(){
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const api=async(url,opts={})=>{const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||r.statusText);return d};
  const dLabel=iso=>new Date(iso+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  const num=v=>{const t=String(v??'').trim().replace(/,/g,'');return t===''?null:Number(t)};
  let CUR=null;

  function weekKeyOf(iso){
    const [y,m,d]=iso.split('-').map(Number),dt=new Date(Date.UTC(y,m-1,d)),dow=(dt.getUTCDay()+6)%7;
    const thu=new Date(dt.getTime()+(3-dow)*864e5),wy=thu.getUTCFullYear(),jan4=new Date(Date.UTC(wy,0,4));
    const w1=new Date(jan4.getTime()-((jan4.getUTCDay()+6)%7)*864e5);
    return `${wy}-W${String(Math.floor((thu-w1)/(7*864e5))+1).padStart(2,'0')}`;
  }
  function shiftWeek(days){const d=new Date(CUR.week.monday+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);load(weekKeyOf(d.toISOString().slice(0,10)))}

  async function load(weekKey){
    $('#hrMsg').textContent='Loading...';
    try{CUR=await api('/api/admin/halodoc-rejection'+(weekKey?'?week='+encodeURIComponent(weekKey):''));render();$('#hrMsg').textContent=''}
    catch(e){$('#hrMsg').innerHTML=`<span class="error">${esc(e.message)}</span>`}
  }

  function rowHtml(name){
    const e=CUR.entries[name]||{},hasCount=e.order>0;
    const rate=e.rate===undefined||e.rate===null?'':(e.rate*100).toFixed(2).replace(/\.?0+$/,'');
    return `<tr data-store="${esc(name)}"><td>${esc(name)}</td>
      <td><input class="hr-order" inputmode="numeric" value="${hasCount?e.order:''}" placeholder="-"></td>
      <td><input class="hr-reject" inputmode="numeric" value="${hasCount?e.reject:''}" placeholder="-"></td>
      <td><input class="hr-rate" inputmode="decimal" value="${rate}" placeholder="-" ${hasCount?'readonly':''}></td></tr>`;
  }
  function render(){
    const w=CUR.week;
    $('#hrWeekDate').value=w.monday;
    $('#hrWeekLabel').textContent=`W${w.week} ${w.year} • ${dLabel(w.monday)} – ${dLabel(w.sunday)}`;
    $('#hrThreshold').value=(CUR.threshold*100).toString();
    $('#hrTable tbody').innerHTML=CUR.stores.map(rowHtml).join('');
    $('#hrGrandOverride').value=CUR.grandOverride===null||CUR.grandOverride===undefined?'':(CUR.grandOverride*100).toFixed(2);
    $('#hrUpdated').textContent=CUR.updatedAt?`Last saved ${new Date(CUR.updatedAt).toLocaleString('id-ID')} by ${CUR.updatedBy||'-'}`:'Belum ada data untuk minggu ini.';
    $('#hrFilled').innerHTML=CUR.filledWeeks.length?CUR.filledWeeks.slice(-30).map(k=>`<button type="button" class="chip hr-week-chip ${k===w.key?'active':''}" data-week="${k}">${k.replace(/^\d{4}-/,'')}</button>`).join(''):'<span class="muted-mini">Belum ada minggu yang terisi.</span>';
    $$('.hr-week-chip').forEach(b=>b.onclick=()=>load(b.dataset.week));
    $$('#hrTable tbody tr').forEach(bindRow);
    updateTotal();
  }
  function bindRow(tr){
    const o=$('.hr-order',tr),r=$('.hr-reject',tr),p=$('.hr-rate',tr);
    const recalc=()=>{const ov=num(o.value),rv=num(r.value);if(ov>0&&rv!==null){p.value=(rv/ov*100).toFixed(2).replace(/\.?0+$/,'');p.readOnly=true}else{p.readOnly=false}updateTotal()};
    o.oninput=recalc;r.oninput=recalc;p.oninput=updateTotal;
    [o,r,p].forEach(inp=>inp.onpaste=e=>{
      const txt=(e.clipboardData||window.clipboardData).getData('text');const lines=txt.split(/\r?\n/).filter((x,i,a)=>x!==''||i<a.length-1);
      if(lines.length<=1&&!txt.includes('\t'))return;
      e.preventDefault();
      const cls=['hr-order','hr-reject','hr-rate'],startCol=cls.findIndex(c=>inp.classList.contains(c));
      const rows=$$('#hrTable tbody tr'),start=rows.indexOf(tr);
      lines.forEach((line,i)=>{const t=rows[start+i];if(!t)return;line.split('\t').forEach((v,j)=>{const c=cls[startCol+j];if(!c)return;const el=$('.'+c,t);el.value=v.replace('%','').trim()});const ov=num($('.hr-order',t).value),rv=num($('.hr-reject',t).value);if(ov>0&&rv!==null){$('.hr-rate',t).value=(rv/ov*100).toFixed(2).replace(/\.?0+$/,'');$('.hr-rate',t).readOnly=true}});
      updateTotal();
    });
  }
  function collect(){
    const entries={};
    $$('#hrTable tbody tr').forEach(tr=>{
      const o=num($('.hr-order',tr).value),r=num($('.hr-reject',tr).value),p=num($('.hr-rate',tr).value);
      if(o>0&&r!==null)entries[tr.dataset.store]={order:o,reject:r};
      else if(p!==null)entries[tr.dataset.store]={rate:p/100};
    });
    return entries;
  }
  function updateTotal(){
    const v=Object.values(collect());let g=null;
    if(v.length){if(v.every(x=>x.order>0)){const o=v.reduce((t,x)=>t+x.order,0),r=v.reduce((t,x)=>t+x.reject,0);g=o?r/o:null}else g=v.reduce((t,x)=>t+(x.rate!==undefined?x.rate:x.reject/x.order),0)/v.length}
    $('#hrGrand').textContent=g===null?'-':`${(g*100).toFixed(2)}%`;
    $('#hrGrandNote').textContent=!v.length?'':v.every(x=>x.order>0)?'(total reject ÷ total order)':'(rata-rata % store, karena ada store tanpa jumlah order)';
  }
  async function save(){
    const btn=$('#hrSave');btn.disabled=true;$('#hrMsg').textContent='Saving...';
    try{
      const threshold=num($('#hrThreshold').value);
      const d=await api('/api/admin/halodoc-rejection',{method:'PUT',body:JSON.stringify({week:CUR.week.key,entries:collect(),threshold:threshold===null?undefined:threshold/100,grandOverride:num($('#hrGrandOverride').value)===null?null:num($('#hrGrandOverride').value)/100})});
      $('#hrMsg').innerHTML=`<span class="ok">Saved W${d.week.week}: ${d.saved} store${d.grandRate!==null?` • Grand Total ${(d.grandRate*100).toFixed(2)}%`:''}</span>`;
      await load(CUR.week.key);$('#hrMsg').innerHTML=`<span class="ok">Saved W${d.week.week}: ${d.saved} store</span>`;
    }catch(e){$('#hrMsg').innerHTML=`<span class="error">${esc(e.message)}</span>`}
    finally{btn.disabled=false}
  }


  // ---------- V57 Import dari Excel ----------
  const XLSX_URL='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  let WB=null,PARSED=null;
  function loadXlsx(){return window.XLSX?Promise.resolve(window.XLSX):new Promise((ok,fail)=>{const sc=document.createElement('script');sc.src=XLSX_URL;sc.onload=()=>ok(window.XLSX);sc.onerror=()=>fail(new Error('Gagal memuat pembaca Excel. Periksa koneksi internet.'));document.head.appendChild(sc)})}
  const keyOf=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  function cleanStore(raw){return String(raw||'').toUpperCase().replace(/\(.*?\)/g,' ').replace(/\bAPO(TIK|TEK)\b/g,' ').replace(/\bWELLINGS?\b/g,' ').replace(/\s+/g,' ').trim()}
  function suggest(clean,masters){
    const k=keyOf(clean);if(!k)return '';
    const exact=masters.find(m=>keyOf(m)===k);if(exact)return exact;
    const cands=masters.filter(m=>{const mk=keyOf(m);return mk.length>=3&&(k.startsWith(mk)||mk.startsWith(k))});
    return cands.sort((a,b)=>keyOf(b).length-keyOf(a).length)[0]||'';
  }
  function toRate(v){
    if(v===null||v===undefined||v==='')return null;
    if(typeof v==='number'){if(!Number.isFinite(v))return null;return v>1?v/100:v}
    const t=String(v).trim();if(!t||t==='-')return null;
    const n=Number(t.replace('%','').replace(',','.'));if(!Number.isFinite(n))return null;
    return t.includes('%')||n>1?n/100:n;
  }
  function parseSheet(ws,year){
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null,blankrows:false});
    let hr=-1;
    for(let r=0;r<Math.min(rows.length,15);r++){const c=(rows[r]||[]).filter(v=>/^W\s*\d{1,2}$/i.test(String(v??'').trim())).length;if(c>=2){hr=r;break}}
    if(hr<0)throw new Error('Baris header W1, W2, ... tidak ditemukan di sheet ini.');
    const cols=[];(rows[hr]||[]).forEach((v,i)=>{const m=/^W\s*(\d{1,2})$/i.exec(String(v??'').trim());if(m)cols.push({i,week:Number(m[1]),key:`${year}-W${String(Number(m[1])).padStart(2,'0')}`})});
    const stores=[];let grand=null;
    for(let r=hr+1;r<rows.length;r++){
      const row=rows[r]||[],name=String(row[0]??'').trim();if(!name)continue;
      const vals=cols.map(c=>toRate(row[c.i]));
      if(/grand\s*total/i.test(name)){grand=vals;break}
      if(vals.every(v=>v===null))continue;
      stores.push({raw:name,clean:cleanStore(name),vals});
    }
    if(!stores.length)throw new Error('Tidak ada baris store yang berisi data.');
    return {cols,stores,grand};
  }
  function renderPreview(){
    const box=$('#hrImportPreview'),masters=CUR?CUR.stores:[];
    const P=PARSED,weeksWithData=P.cols.filter((c,j)=>P.stores.some(s=>s.vals[j]!==null));
    const existing=new Set(CUR?CUR.filledWeeks:[]),over=weeksWithData.filter(c=>existing.has(c.key)).length;
    const bad=P.stores.flatMap(s=>s.vals.filter(v=>v!==null&&(v<0||v>1))).length;
    const opt=(sel,clean)=>`<option value="__skip" ${sel==='__skip'?'selected':''}>(Lewati baris ini)</option>`+masters.map(m=>`<option ${m===sel?'selected':''}>${esc(m)}</option>`).join('')+`<option value="__new" ${sel==='__new'?'selected':''}>+ Store baru: ${esc(clean)}</option>`;
    box.innerHTML=`<div class="hr-import-summary"><b>${P.stores.length}</b> store • <b>${weeksWithData.length}</b> minggu berisi data (${esc(weeksWithData[0]?.key||'-')} s/d ${esc(weeksWithData[weeksWithData.length-1]?.key||'-')}) • Grand Total: <b>${P.grand?'terbaca, dipakai apa adanya':'tidak ditemukan, akan dihitung sistem'}</b>${over?` • <span class="error">${over} minggu sudah ada di dashboard dan akan diganti</span>`:''}${bad?` • <span class="error">${bad} nilai di luar 0–100%</span>`:''}</div>
      <p class="muted-mini">Periksa pencocokan nama store. Baris berwarna oranye belum cocok otomatis; pilih store yang benar atau tambahkan sebagai store baru.</p>
      <div class="table-wrap"><table class="admin-table hr-map-table"><thead><tr><th>Nama di Excel</th><th>Store di Dashboard</th><th>Minggu terisi</th></tr></thead><tbody>
      ${P.stores.map((s,i)=>{const sel=s.map||'__new';return `<tr class="${s.auto?'':'hr-unmatched'}"><td>${esc(s.raw)}</td><td><select class="hr-map" data-i="${i}">${opt(sel,s.clean)}</select></td><td>${s.vals.filter(v=>v!==null).length}</td></tr>`}).join('')}
      </tbody></table></div>
      <div class="hr-actions"><button class="btn green" id="hrImportGo" type="button" ${bad?'disabled':''}>Import ${weeksWithData.length} Minggu</button><button class="btn" id="hrImportCancel" type="button">Batal</button><span id="hrImportMsg"></span></div>`;
    $$('.hr-map',box).forEach(sel=>sel.onchange=()=>{P.stores[Number(sel.dataset.i)].map=sel.value});
    $('#hrImportCancel').onclick=resetImport;
    $('#hrImportGo').onclick=doImport;
  }
  function resetImport(){WB=null;PARSED=null;$('#hrImportFile').value='';$('#hrImportSheet').innerHTML='<option>-</option>';$('#hrImportSheet').disabled=true;$('#hrImportPreview').innerHTML=''}
  function parseSelected(){
    const msg=$('#hrImportPreview');
    try{
      const year=Number($('#hrImportYear').value);if(!(year>=2000&&year<=2100))throw new Error('Isi tahun terlebih dahulu.');
      PARSED=parseSheet(WB.Sheets[$('#hrImportSheet').value],year);
      const masters=CUR?CUR.stores:[];
      PARSED.stores.forEach(s=>{const m=suggest(s.clean,masters);s.map=m||'__new';s.auto=!!m});
      renderPreview();
    }catch(e){PARSED=null;msg.innerHTML=`<div class="error">${esc(e.message)}</div>`}
  }
  async function onFile(){
    const f=$('#hrImportFile').files[0];if(!f)return;
    $('#hrImportPreview').innerHTML='<div class="loading">Membaca file...</div>';
    try{
      if(!CUR)await load();
      const X=await loadXlsx();WB=X.read(await f.arrayBuffer(),{type:'array'});
      const sel=$('#hrImportSheet');sel.innerHTML=WB.SheetNames.map(n=>`<option>${esc(n)}</option>`).join('');sel.disabled=false;
      const best=WB.SheetNames.find(n=>/halodoc|reject/i.test(n));if(best)sel.value=best;
      parseSelected();
    }catch(e){$('#hrImportPreview').innerHTML=`<div class="error">${esc(e.message)}</div>`}
  }
  async function doImport(){
    const P=PARSED;if(!P)return;
    const targets=P.stores.map(s=>s.map==='__skip'?null:(s.map==='__new'?s.clean:s.map));
    const dup=targets.filter((t,i)=>t&&targets.indexOf(t)!==i);
    if(dup.length)return alert('Beberapa baris Excel dipetakan ke store yang sama: '+[...new Set(dup)].join(', ')+'. Perbaiki dulu pencocokannya.');
    const weeks={};
    P.cols.forEach((c,j)=>{
      const stores={};P.stores.forEach((s,i)=>{const v=s.vals[j];if(targets[i]&&v!==null)stores[targets[i]]={rate:v}});
      if(!Object.keys(stores).length)return;
      weeks[c.key]={stores,grandRate:P.grand&&P.grand[j]!==null?P.grand[j]:undefined};
    });
    const n=Object.keys(weeks).length;if(!n)return alert('Tidak ada data untuk diimport.');
    if(!confirm(`Import ${n} minggu? Minggu yang sama di dashboard akan diganti.`))return;
    const btn=$('#hrImportGo');btn.disabled=true;$('#hrImportMsg').textContent='Importing...';
    try{
      const d=await api('/api/admin/halodoc-rejection/import',{method:'POST',body:JSON.stringify({weeks})});
      const first=Object.keys(weeks).sort().pop();
      resetImport();await load(first);
      $('#hrMsg').innerHTML=`<span class="ok">Import selesai: ${d.weeks} minggu (${d.replaced} diganti), ${d.cells} nilai store.</span>`;
      $('#tab-halodocRejection').scrollIntoView({behavior:'smooth'});
    }catch(e){$('#hrImportMsg').innerHTML=`<span class="error">${esc(e.message)}</span>`;btn.disabled=false}
  }
  function init(){
    if(!$('#tab-halodocRejection'))return;
    $('#hrImportYear').value=new Date().getFullYear();
    $('#hrImportFile').onchange=onFile;
    $('#hrImportSheet').onchange=()=>{if(WB)parseSelected()};
    $('#hrImportYear').onchange=()=>{if(WB)parseSelected()};
    $('#hrPrev').onclick=()=>shiftWeek(-7);
    $('#hrNext').onclick=()=>shiftWeek(7);
    $('#hrWeekDate').onchange=e=>{if(e.target.value)load(weekKeyOf(e.target.value))};
    $('#hrSave').onclick=save;
    $('#hrClear').onclick=()=>{if(!confirm('Kosongkan semua isian minggu ini? Klik Save untuk menyimpan.'))return;$$('#hrTable tbody input').forEach(i=>{i.value='';i.readOnly=false});$('#hrGrandOverride').value='';updateTotal()};
    let loaded=false;
    $$('.admin-tab').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.tab==='halodocRejection'&&!loaded){loaded=true;load()}}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
