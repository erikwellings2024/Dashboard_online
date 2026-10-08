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
      const d=await api('/api/admin/halodoc-rejection',{method:'PUT',body:JSON.stringify({week:CUR.week.key,entries:collect(),threshold:threshold===null?undefined:threshold/100})});
      $('#hrMsg').innerHTML=`<span class="ok">Saved W${d.week.week}: ${d.saved} store${d.grandRate!==null?` • Grand Total ${(d.grandRate*100).toFixed(2)}%`:''}</span>`;
      await load(CUR.week.key);$('#hrMsg').innerHTML=`<span class="ok">Saved W${d.week.week}: ${d.saved} store</span>`;
    }catch(e){$('#hrMsg').innerHTML=`<span class="error">${esc(e.message)}</span>`}
    finally{btn.disabled=false}
  }

  function init(){
    if(!$('#tab-halodocRejection'))return;
    $('#hrPrev').onclick=()=>shiftWeek(-7);
    $('#hrNext').onclick=()=>shiftWeek(7);
    $('#hrWeekDate').onchange=e=>{if(e.target.value)load(weekKeyOf(e.target.value))};
    $('#hrSave').onclick=save;
    $('#hrClear').onclick=()=>{if(!confirm('Kosongkan semua isian minggu ini? Klik Save untuk menyimpan.'))return;$$('#hrTable input').forEach(i=>{i.value='';i.readOnly=false});updateTotal()};
    let loaded=false;
    $$('.admin-tab').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.tab==='halodocRejection'&&!loaded){loaded=true;load()}}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
