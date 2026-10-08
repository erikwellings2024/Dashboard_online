// V56 Section D - Halodoc Rejection (Detail Trx & Basket Size page)
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const MON=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const api=async(url,opts={})=>{const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||r.statusText);return d};
  const localISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const BANDS=['#C5D5F5','#FBEDEA','#E1F2E4','#E3F2F3','#EFEFEF','#E3EBFB','#FCF8EC','#D9EEF0','#F3E5F5','#FFF3E0','#E8F5E9','#ECEFF1'];

  let R=null,ALL=[];
  const S={start:'',end:'',stores:null};

  const cellPct=v=>v===null||v===undefined?'':`${Math.round(v*100)}%`;
  const totPct=v=>v===null||v===undefined?'':`${(v*100).toFixed(2)}%`;
  const monthLabel=m=>`${MON[Number(m.slice(5))-1]} - ${m.slice(2,4)}`;

  function initState(meta){
    const d=new Date();d.setMonth(d.getMonth()-2,1);
    S.start=localISO(d);S.end=localISO(new Date());
  }
  function render(){
    const stores=ALL.length?ALL:[];
    const set=new Set(S.stores||stores);
    const lab=!S.stores||set.size===stores.length?'All Store':set.size+' Selected';
    $('#rejectionFilters').innerHTML=`<div class="filter-grid">
      <div class="field"><label>Period Start</label><input type="date" class="control" id="hrStart" value="${S.start}"></div>
      <div class="field"><label>Period End</label><input type="date" class="control" id="hrEnd" value="${S.end}"></div>
      <div class="field multi" data-key="stores"><label>Store</label><button class="control" type="button"><span class="multi-label">${esc(lab)}</span><span>▾</span></button><div class="drop"><input class="search-input" placeholder="Search..."><label class="check"><input type="checkbox" class="toggle-all" ${set.size===stores.length?'checked':''}>Select All</label>${stores.map(v=>`<label class="check option"><input type="checkbox" value="${esc(v)}" ${set.has(v)?'checked':''}>${esc(v)}</label>`).join('')}</div></div>
      <button class="apply" id="applyRejection" type="button">APPLY</button></div>
      <div class="chips"><span class="chip"><b>Section D only</b></span><span class="chip"><b>Merah:</b> rejection di atas ${R?(R.threshold*100).toFixed(1):'2.0'}% (atur di Admin)</span></div>`;
    bind();
  }
  function bind(){
    const root=$('#rejectionFilters');
    $$('.multi .control',root).forEach(btn=>btn.onclick=e=>{e.stopPropagation();const f=btn.closest('.multi');$$('.multi.open,.range.open,.product-picker.open').forEach(x=>x!==f&&x.classList.remove('open'));f.classList.toggle('open')});
    const sync=f=>{const opts=$$('.option input',f),vals=opts.filter(x=>x.checked).map(x=>x.value);S.stores=vals.length===opts.length?null:vals;$('.multi-label',f).textContent=vals.length===opts.length?'All Store':vals.length+' Selected';$('.toggle-all',f).checked=vals.length===opts.length};
    $$('.toggle-all',root).forEach(cb=>cb.onchange=()=>{const f=cb.closest('.multi');$$('.option input',f).forEach(x=>x.checked=cb.checked);sync(f)});
    $$('.option input',root).forEach(cb=>cb.onchange=()=>sync(cb.closest('.multi')));
    $$('.search-input',root).forEach(inp=>{inp.onclick=e=>e.stopPropagation();inp.oninput=()=>{const q=inp.value.toLowerCase();$$('.option',inp.closest('.drop')).forEach(r=>r.style.display=r.textContent.toLowerCase().includes(q)?'flex':'none')}});
    $('#hrStart').onchange=e=>{S.start=e.target.value};
    $('#hrEnd').onchange=e=>{S.end=e.target.value};
    $('#applyRejection').onclick=load;
  }
  async function load(){
    if(!S.start||!S.end||S.start>S.end)return alert('Period Start / End belum benar.');
    const btn=$('#applyRejection');btn.disabled=true;btn.textContent='LOADING...';
    try{
      R=await api('/api/query/halodoc-rejection',{method:'POST',body:JSON.stringify({period:{start:S.start,end:S.end},stores:S.stores||[]})});
      if(R.allStores?.length)ALL=R.allStores;
      render();renderTable();
    }catch(e){R=null;render();$('#rejectionTable').innerHTML=`<div class="error">Gagal memuat: ${esc(e.message)}</div>`}
  }
  function visibleWeeks(){return (R?.weeks||[]).filter(w=>w.hasData)}

  function renderTable(){
    const weeks=visibleWeeks();
    if(!R){$('#rejectionTable').innerHTML='<div class="empty">Klik APPLY untuk menampilkan Halodoc Rejection.</div>';return}
    if(!weeks.length){$('#rejectionTable').innerHTML='<div class="empty">Belum ada data rejection pada periode ini. Input data di Admin Settings → Halodoc Rejection.</div>';return}
    const groups=[];weeks.forEach(w=>{const g=groups[groups.length-1];if(g&&g.month===w.month)g.n++;else groups.push({month:w.month,n:1})});
    const th=R.threshold,red=v=>v!==null&&v!==undefined&&v>th+1e-9?' hr-red':'';
    const h1=`<tr><th class="hr-title" rowspan="1">HALODOC MERCHANT REJECTION</th>${groups.map(g=>`<th colspan="${g.n}" class="hr-month">${MON[Number(g.month.slice(5))-1]}</th>`).join('')}</tr>`;
    const h2=`<tr><th></th>${weeks.map(w=>`<th>${esc(w.range)}</th>`).join('')}</tr>`;
    const h3=`<tr><th class="hr-store-h">STORE</th>${weeks.map(w=>`<th>${esc(w.label)}</th>`).join('')}</tr>`;
    const body=R.stores.map(s=>`<tr><td class="hr-store">${esc(s)}</td>${weeks.map(w=>{const v=w.rates[s];return `<td class="${red(v)}">${cellPct(v)}</td>`}).join('')}</tr>`).join('');
    const total=`<tr class="hr-total"><td class="hr-store">Grand Total</td>${weeks.map(w=>`<td class="${red(w.grandRate)}">${totPct(w.grandRate)}</td>`).join('')}</tr>`;
    $('#rejectionTable').innerHTML=`<table class="hr-report" id="hrReportEl"><thead>${h1}${h2}${h3}</thead><tbody>${body}${total}</tbody></table>`;
  }

  function createChart(){
    if(!R)return alert('Klik APPLY terlebih dahulu agar data chart tersedia.');
    const weeks=visibleWeeks();if(!weeks.length)return alert('Tidak ada data pada periode ini.');
    const data={points:weeks.map(w=>({label:w.label,month:w.month,value:w.grandRate})),bands:BANDS,threshold:R.threshold,
      title:`Halodoc Merchant Rejection ${S.start} s/d ${S.end}`};
    const w=window.open('','_blank');if(!w)return alert('Allow popup for Create Chart');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Halodoc Rejection Chart</title><style>body{font-family:Arial;background:#f4f6f8;margin:0;padding:22px}.box{background:#fff;border:1px solid #c7cfd7;padding:16px;max-width:1500px;margin:auto}.bh{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}h2{margin:0;font-size:17px;color:#1f2937}button{border:1px solid #9aa4ae;background:#fff;padding:6px 10px;cursor:pointer}label{font-size:12px;margin-right:10px}canvas{display:block;max-width:100%}</style></head><body><div class="box"><div class="bh"><h2>Halodoc Merchant Rejection — Grand Total per Week</h2><div><label><input type="checkbox" id="th"> Garis KPI</label><button onclick="dl()">Download PNG</button></div></div><canvas id="c"></canvas></div>
    <script>const D=${JSON.stringify(data)},MON=${JSON.stringify(MON)};
    function dl(){const a=document.createElement('a');a.download='halodoc_rejection.png';a.href=document.getElementById('c').toDataURL('image/png');a.click()}
    function draw(){
      const n=D.points.length,W=Math.max(900,Math.min(1800,n*48+80)),H=560,L=24,R=24,T=40,B=120,c=document.getElementById('c'),dpr=devicePixelRatio||1;
      c.width=W*dpr;c.height=H*dpr;c.style.width=W+'px';c.style.height=H+'px';const x=c.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);
      x.fillStyle='#fff';x.fillRect(0,0,W,H);
      const cw=W-L-R,gw=cw/n,base=T+(H-T-B),ch=base-T,vals=D.points.map(p=>p.value||0),max=Math.max(...vals,D.threshold,0.01)*1.12;
      const groups=[];D.points.forEach((p,i)=>{const g=groups[groups.length-1];if(g&&g.month===p.month)g.end=i;else groups.push({month:p.month,start:i,end:i})});
      groups.forEach((g,k)=>{const x0=L+g.start*gw+2,x1=L+(g.end+1)*gw-2;x.fillStyle=D.bands[Number(g.month.slice(5))-1]||D.bands[k%D.bands.length];x.fillRect(x0,T-25,x1-x0,H-T+15);
        x.fillStyle='#111';x.font='bold 22px Arial';x.textAlign='center';x.fillText(MON[Number(g.month.slice(5))-1]+' - '+g.month.slice(2,4),(x0+x1)/2,H-26)});
      x.strokeStyle='#d0d0d0';x.beginPath();x.moveTo(L,base);x.lineTo(W-R,base);x.stroke();
      if(document.getElementById('th').checked){const ty=base-ch*D.threshold/max;x.setLineDash([6,5]);x.strokeStyle='#666';x.beginPath();x.moveTo(L,ty);x.lineTo(W-R,ty);x.stroke();x.setLineDash([]);x.fillStyle='#555';x.font='12px Arial';x.textAlign='left';x.fillText('KPI '+(D.threshold*100).toFixed(1)+'%',L+4,ty-5)}
      const pts=D.points.map((p,i)=>({x:L+i*gw+gw/2,y:p.value===null?null:base-ch*p.value/max,v:p.value,l:p.label}));
      x.strokeStyle='#FF0000';x.lineWidth=3.5;x.beginPath();let started=false;pts.forEach(p=>{if(p.y===null){started=false;return}if(!started){x.moveTo(p.x,p.y);started=true}else x.lineTo(p.x,p.y)});x.stroke();x.lineWidth=1;
      pts.forEach((p,i)=>{x.fillStyle='#595959';x.font='15px Arial';x.textAlign='center';x.fillText(p.l,p.x,base+24);if(p.y===null)return;x.fillStyle='#FF0000';x.beginPath();x.arc(p.x,p.y,5,0,7);x.fill();
        const prev=pts[i-1],next=pts[i+1],peak=(!prev||prev.y===null||p.y<=prev.y)&&(!next||next.y===null||p.y<=next.y);
        x.fillStyle='#404040';x.font='14px Arial';x.fillText((p.v*100).toFixed(2)+'%',p.x,peak?p.y-12:p.y+22)});
    }
    document.getElementById('th').onchange=draw;draw();<\/script></body></html>`);
    w.document.close();
  }

  async function exportExcel(){
    if(!R)return alert('Klik APPLY terlebih dahulu sebelum download report.');
    if(!window.ExcelJS)return alert('Excel library unavailable');
    const weeks=visibleWeeks(),wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Halodoc Rejection');
    const blue={type:'pattern',pattern:'solid',fgColor:{argb:'FFBDD7EE'}},th=R.threshold;
    const r1=ws.addRow(['HALODOC MERCHANT REJECTION',...weeks.map(w=>MON[Number(w.month.slice(5))-1])]);
    const r2=ws.addRow(['',...weeks.map(w=>w.range)]);const r3=ws.addRow(['STORE',...weeks.map(w=>w.label)]);
    [r1,r2,r3].forEach(r=>r.eachCell({includeEmpty:true},c=>{c.fill=blue;c.font={bold:true};c.alignment={horizontal:'center'}}));
    R.stores.forEach(s=>{const r=ws.addRow([s,...weeks.map(w=>w.rates[s]??null)]);weeks.forEach((w,i)=>{const c=r.getCell(i+2);c.numFmt='0%';if(typeof c.value==='number'&&c.value>th)c.font={color:{argb:'FFC00000'}}})});
    const t=ws.addRow(['Grand Total',...weeks.map(w=>w.grandRate)]);t.eachCell({includeEmpty:true},(c,i)=>{c.fill=blue;c.font={bold:true,color:{argb:i>1&&typeof c.value==='number'&&c.value>th?'FFC00000':'FF000000'}};if(i>1)c.numFmt='0.00%'});
    ws.getColumn(1).width=40;for(let i=2;i<=weeks.length+1;i++)ws.getColumn(i).width=8;
    const buf=await wb.xlsx.writeBuffer(),blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`halodoc_rejection_${S.start}_${S.end}.xlsx`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  async function exportJpeg(){
    if(!R)return alert('Klik APPLY terlebih dahulu sebelum download report.');
    if(!window.html2canvas)return alert('JPEG library unavailable');
    const el=$('#hrReportEl');if(!el)return alert('Tidak ada tabel.');
    const canvas=await html2canvas(el,{backgroundColor:'#fff',scale:2,width:el.scrollWidth,windowWidth:el.scrollWidth+40});const a=document.createElement('a');a.download='halodoc_rejection.jpeg';a.href=canvas.toDataURL('image/jpeg',.95);a.click();
  }
  function setupActions(){
    const sec=$('#rejectionSection'),body=$('#rejectionSectionBody'),hide=$('#rejectionHideBtn');
    hide.onclick=()=>{const h=body.classList.toggle('hidden');hide.textContent=h?'Show':'Hide';sec.classList.toggle('trx-bs-collapsed',h)};
    $('#rejectionDownloadBtn').onclick=e=>{e.stopPropagation();$('#rejectionDownloadWrap').classList.toggle('open')};
    document.addEventListener('click',e=>{const w=$('#rejectionDownloadWrap');if(w&&!w.contains(e.target))w.classList.remove('open')});
    $('#rejectionChartBtn').onclick=createChart;
    $('#rejectionExportExcel').onclick=()=>{$('#rejectionDownloadWrap').classList.remove('open');exportExcel().catch(e=>alert('Excel export failed: '+e.message))};
    $('#rejectionExportJpeg').onclick=()=>{$('#rejectionDownloadWrap').classList.remove('open');exportJpeg().catch(e=>alert('JPEG export failed: '+e.message))};
  }
  window.HalodocRejection={init(meta){if(!$('#rejectionSection'))return;initState(meta);render();renderTable();setupActions();load()}};
})();
