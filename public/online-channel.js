// V55 Section C - Online Grafik per Channel (Detail Trx & Basket Size page)
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmt=n=>n===null||n===undefined||!Number.isFinite(Number(n))?'':Math.round(Number(n)).toLocaleString('en-US');
  const pct=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'':`${(Number(v)*100).toFixed(1)}%`;
  const MON=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const COLORS={SHOPEE:'#ED7D31',HALODOC:'#FF0000',GRABMART:'#4E9A3E','GOOD DOCTOR':'#F48A8A',LAZADA:'#9B2C9B',WEBSITE:'#3FA34D',WHATSAPP:'#25A0C5'};
  const SPARE=['#5B9BD5','#C9A100','#7F6000','#7F7F7F','#264478','#9E480E'];
  const api=async(url,opts={})=>{const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||r.statusText);return d};
  const title=s=>String(s).toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

  let META=null,R=null;
  const S={start:'',end:'',chartFrom:'',chartTo:'',channels:[],topN:5,filters:{}};

  function colorFor(ch,i){return COLORS[ch]||SPARE[i%SPARE.length]}
  function periodText(p){
    if(!p)return '';
    const [sy,sm,sd]=p.start.split('-').map(Number),[ey,em,ed]=p.end.split('-').map(Number);
    if(sy===ey&&sm===em)return `${sd} - ${ed} ${MON[sm-1]}`;
    return `${sd} ${MON[sm-1]} - ${ed} ${MON[em-1]}`;
  }

  function initState(){
    const max=META.maxDate||new Date().toISOString().slice(0,10);
    S.end=max;S.start=`${max.slice(0,7)}-01`;
    S.chartTo=max.slice(0,7);S.chartFrom=`${max.slice(0,4)}-01`;
    const g=META.channelGroups||{online:(META.channels||[]).filter(c=>c!=='OFFLINE SALES')};
    S.channels=g.online.filter(c=>['HALODOC','GOOD DOCTOR','GRABMART','SHOPEE'].includes(c));
    if(!S.channels.length)S.channels=[...g.online];
    S.filters={stores:(META.stores||[]).map(s=>s.name),categories:[...(META.categories||[])],brands:[...(META.brands||[])],
      salesTypes:[...(META.salesTypes||[])],customerTypes:[...(META.customerTypes||[])],storeStats:[...(META.storeStats||[])]};
  }

  function multi(key,label,options,selected,search=false){
    const vals=(options||[]).map(o=>typeof o==='string'?o:o.name),set=new Set(selected||[]);
    const lab=set.size===vals.length?'All '+label:set.size+' Selected';
    return `<div class="field multi" data-key="${key}"><label>${label}</label><button class="control" type="button"><span class="multi-label">${esc(lab)}</span><span>▾</span></button><div class="drop">${search?'<input class="search-input" placeholder="Search...">':''}<label class="check"><input type="checkbox" class="toggle-all" ${set.size===vals.length?'checked':''}>Select All</label>${vals.map(v=>`<label class="check option"><input type="checkbox" value="${esc(v)}" ${set.has(v)?'checked':''}>${esc(v)}</label>`).join('')}</div></div>`;
  }

  function render(){
    const g=META.channelGroups||{online:META.channels||[]};
    $('#channelGraphFilters').innerHTML=`<div class="filter-grid">
      <div class="field"><label>Item Period Start</label><input type="date" class="control" id="ocStart" value="${S.start}" ${META.maxDate?`max="${META.maxDate}"`:''}></div>
      <div class="field"><label>Item Period End</label><input type="date" class="control" id="ocEnd" value="${S.end}" ${META.maxDate?`max="${META.maxDate}"`:''}></div>
      <div class="field"><label>Chart From</label><input type="month" class="control" id="ocChartFrom" value="${S.chartFrom}"></div>
      <div class="field"><label>Chart To</label><input type="month" class="control" id="ocChartTo" value="${S.chartTo}"></div>
      ${multi('channels','Channel Online',g.online,S.channels)}
      <div class="field"><label>Top Item</label><select class="control" id="ocTopN">${[3,5,10,15,20].map(n=>`<option ${n===S.topN?'selected':''}>${n}</option>`).join('')}</select></div>
      ${multi('stores','Store',META.stores,S.filters.stores,true)}
      ${multi('categories','Category',META.categories,S.filters.categories,true)}
      ${multi('brands','Brand',META.brands,S.filters.brands,true)}
      ${multi('salesTypes','Sales Type',META.salesTypes,S.filters.salesTypes)}
      ${multi('customerTypes','Customer Type',META.customerTypes||[],S.filters.customerTypes)}
      ${multi('storeStats','Store Stat',META.storeStats||[],S.filters.storeStats)}
      <button class="apply" id="applyChannelGraph" type="button">APPLY</button></div>
      <div class="chips"><span class="chip"><b>Section C only</b></span><span class="chip"><b>Channel:</b> ${esc(S.channels.join(', ')||'-')}</span></div>`;
    bind();
  }

  function sync(f){
    const key=f.dataset.key,opts=$$('.option input',f),vals=opts.filter(x=>x.checked).map(x=>x.value);
    if(key==='channels')S.channels=vals;else S.filters[key]=vals;
    $('.multi-label',f).textContent=vals.length===opts.length?'All '+$('label',f).textContent:vals.length+' Selected';
    const ta=$('.toggle-all',f);if(ta)ta.checked=vals.length===opts.length;
  }
  function bind(){
    const root=$('#channelGraphFilters');
    $$('.multi .control',root).forEach(btn=>btn.onclick=e=>{e.stopPropagation();const f=btn.closest('.multi');$$('.multi.open,.range.open,.product-picker.open').forEach(x=>x!==f&&x.classList.remove('open'));f.classList.toggle('open')});
    $$('.toggle-all',root).forEach(cb=>cb.onchange=()=>{const f=cb.closest('.multi');$$('.option input',f).forEach(x=>x.checked=cb.checked);sync(f)});
    $$('.option input',root).forEach(cb=>cb.onchange=()=>sync(cb.closest('.multi')));
    $$('.search-input',root).forEach(inp=>{inp.onclick=e=>e.stopPropagation();inp.oninput=()=>{const q=inp.value.toLowerCase();$$('.option',inp.closest('.drop')).forEach(r=>r.style.display=r.textContent.toLowerCase().includes(q)?'flex':'none')}});
    $('#ocStart').onchange=e=>{S.start=e.target.value};
    $('#ocEnd').onchange=e=>{S.end=e.target.value;if(S.end){S.chartTo=S.end.slice(0,7);$('#ocChartTo').value=S.chartTo}};
    $('#ocChartFrom').onchange=e=>{S.chartFrom=e.target.value};
    $('#ocChartTo').onchange=e=>{S.chartTo=e.target.value};
    $('#ocTopN').onchange=e=>{S.topN=Number(e.target.value)};
    $('#applyChannelGraph').onclick=load;
  }

  async function load(){
    if(!S.start||!S.end||S.start>S.end)return alert('Item Period Start / End belum benar.');
    if(!S.channels.length)return alert('Pilih minimal 1 Channel Online.');
    const btn=$('#applyChannelGraph');btn.disabled=true;btn.textContent='LOADING...';
    $('#channelGraphBody').innerHTML='<div class="loading">Calculating per channel...</div>';
    try{
      R=await api('/api/query/online-channel',{method:'POST',body:JSON.stringify({period:{start:S.start,end:S.end},chartFrom:S.chartFrom,chartTo:S.chartTo,channels:S.channels,topN:S.topN,filters:S.filters})});
      render();renderBody();
    }catch(e){R=null;render();$('#channelGraphBody').innerHTML=`<div class="error">Gagal menghitung: ${esc(e.message)}</div>`}
  }

  function paretoTable(c,i){
    const col=colorFor(c.channel,i),per=periodText(R.period);
    const rows=c.items.length?c.items.map(it=>`<tr><td>${esc(it.sku)}</td><td>${esc(it.itemName)}</td><td class="num">${fmt(it.sales)}</td><td class="num">${pct(it.contr)}</td></tr>`).join(''):'<tr><td colspan="4" class="empty-cell">Tidak ada penjualan pada periode ini</td></tr>';
    const th=t=>`<th style="background:${col};color:#fff">${t}</th>`;
    return `<table class="oc-pareto"><thead><tr>${th('SKU')}${th('ITEM')}${th(esc(per))}${th('% Contr')}</tr></thead><tbody>${rows}</tbody></table>`;
  }
  function renderBody(){
    if(!R){$('#channelGraphBody').innerHTML='<div class="empty">Klik APPLY untuk menampilkan item pareto per channel.</div>';return}
    $('#channelGraphBody').innerHTML=`<div class="oc-grid">${R.channels.map((c,i)=>`<div class="oc-card"><div class="oc-card-head"><b>${esc(c.channel)}</b><span>Sales ${esc(periodText(R.period))}: ${fmt(c.periodSales)}</span></div>${paretoTable(c,i)}</div>`).join('')}</div>`;
  }

  // ---------- Popup charts ----------
  function createChart(){
    if(!R)return alert('Klik APPLY terlebih dahulu agar data chart tersedia.');
    const multiYear=new Set(R.months.map(m=>m.slice(0,4))).size>1;
    const labels=R.months.map(m=>multiYear?`${MON[Number(m.slice(5))-1]}-${m.slice(2,4)}`:MON[Number(m.slice(5))-1]);
    const data=R.channels.map((c,i)=>({name:title(c.channel),color:colorFor(c.channel,i),monthly:c.monthly}));
    const tables=R.channels.map((c,i)=>paretoTable(c,i));
    const w=window.open('','_blank');if(!w)return alert('Allow popup for Create Chart');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Online Grafik per Channel</title>
    <style>body{font-family:Arial;background:#f4f6f8;margin:0;padding:22px;color:#1f2937}.page{max-width:1080px;margin:auto}.card{background:#fff;border:1px solid #c7cfd7;padding:16px;margin-bottom:20px}.tools{text-align:right;margin-bottom:6px}button{border:1px solid #9aa4ae;background:#fff;padding:6px 10px;cursor:pointer;margin-left:6px}canvas{display:block;max-width:100%;margin:auto}
    .oc-pareto{border-collapse:collapse;width:100%;margin-top:14px;font-family:Arial;font-size:14px}.oc-pareto th{color:#fff;padding:6px 8px;border:1px solid #fff;font-weight:700}.oc-pareto td{padding:4px 8px;border:1px solid #9aa4ae;white-space:nowrap}.oc-pareto td.num{text-align:right}.oc-pareto td:nth-child(2){white-space:normal}.empty-cell{text-align:center;color:#888}.items-wrap{padding:4px 2px 2px;background:#fff}.items-wrap .oc-pareto{margin-top:10px}</style></head>
    <body><div class="page"><h1>Online Grafik per Channel</h1>
    ${data.map((d,i)=>`<div class="card" id="card${i}"><div class="tools no-print"><button onclick="png('chart${i}','${esc(d.name)}_chart')">Download Chart PNG</button><button onclick="itemPng(${i},'${esc(d.name)}')">Download Item PNG</button><button onclick="cardPng(${i},'${esc(d.name)}')">Download Chart + Item PNG</button></div><canvas id="chart${i}"></canvas><div id="items${i}" class="items-wrap">${tables[i]}</div></div>`).join('')}
    </div><script>
    const D=${JSON.stringify(data)},LB=${JSON.stringify(labels)};
    function H2C(){try{return window.html2canvas||(window.opener&&window.opener.html2canvas)||null}catch(e){return window.html2canvas||null}}
    if(!H2C()){const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';document.head.appendChild(sc)}
    function png(id,n){const a=document.createElement('a');a.download=n.replace(/\\s+/g,'_').toLowerCase()+'.png';a.href=document.getElementById(id).toDataURL('image/png');a.click()}
    async function itemPng(i,n){const h=H2C();if(!h)return alert('Library belum termuat, coba lagi beberapa detik');const el=document.getElementById('items'+i);const c=await h(el,{backgroundColor:'#fff',scale:2});const a=document.createElement('a');a.download=n.replace(/\\s+/g,'_').toLowerCase()+'_item.png';a.href=c.toDataURL('image/png');a.click()}
    async function cardPng(i,n){const h=H2C();if(!h)return alert('Library belum termuat, coba lagi beberapa detik');const el=document.getElementById('card'+i),t=el.querySelector('.tools');t.style.visibility='hidden';const c=await h(el,{backgroundColor:'#fff',scale:2});t.style.visibility='';const a=document.createElement('a');a.download=n.replace(/\\s+/g,'_').toLowerCase()+'_chart_item.png';a.href=c.toDataURL('image/png');a.click()}
    function rgba(hex,a){const n=parseInt(hex.slice(1),16);return 'rgba('+(n>>16&255)+','+(n>>8&255)+','+(n&255)+','+a+')'}
    D.forEach((d,i)=>{
      const W=1000,H=520,L=30,R=30,T=110,B=90,c=document.getElementById('chart'+i),dpr=devicePixelRatio||1;
      c.width=W*dpr;c.height=H*dpr;c.style.width=W+'px';c.style.height=H+'px';const x=c.getContext('2d');x.scale(dpr,dpr);
      x.fillStyle='#fff';x.fillRect(0,0,W,H);
      x.fillStyle='#595959';x.font='bold 26px Arial';x.textAlign='center';x.fillText('Target Achievement '+d.name,W/2,44);
      const cw=W-L-R,ch=H-T-B,n=d.monthly.length,gw=cw/n,tw=gw*0.72,sw=gw*0.52;
      const max=Math.max(...d.monthly.map(m=>Math.max(m.sales,m.target)),1),base=T+ch;
      x.strokeStyle='#bfbfbf';x.beginPath();x.moveTo(L,base);x.lineTo(W-R,base);x.stroke();
      d.monthly.forEach((m,k)=>{
        const cx=L+k*gw+gw/2,ht=ch*m.target/max,hs=ch*m.sales/max;
        x.fillStyle=rgba(d.color,.18);x.fillRect(cx-tw/2,base-ht,tw,ht);
        x.fillStyle=d.color;x.fillRect(cx-sw/2,base-hs,sw,hs);
        if(m.achievement!==null){x.fillStyle='#111';x.font='19px Arial';x.fillText((m.achievement*100).toFixed(1)+'%',cx,base-Math.max(ht,hs)-14)}
        x.fillStyle='#595959';x.font='bold 19px Arial';x.fillText(LB[k],cx,base+32);
      });
      x.font='14px Arial';x.textAlign='left';const ly=H-22,lx=W/2-90;
      x.fillStyle=d.color;x.fillRect(lx,ly-11,12,12);x.fillStyle='#595959';x.fillText('SALES',lx+17,ly);
      x.fillStyle=rgba(d.color,.18);x.fillRect(lx+95,ly-11,12,12);x.fillStyle='#595959';x.fillText('TARGET',lx+112,ly);
    });
    <\/script></body></html>`);
    w.document.close();
  }

  // ---------- Exports ----------
  async function exportExcel(){
    if(!R)return alert('Klik APPLY terlebih dahulu sebelum download report.');
    if(!window.ExcelJS)return alert('Excel library unavailable');
    const wb=new ExcelJS.Workbook(),per=periodText(R.period);
    R.channels.forEach((c,i)=>{
      const ws=wb.addWorksheet(c.channel.slice(0,31)),argb='FF'+colorFor(c.channel,i).slice(1).toUpperCase();
      ws.addRow([`Target Achievement ${title(c.channel)}`]).font={bold:true,size:14};
      const h=ws.addRow(['MONTH','SALES','TARGET','ACHIEVEMENT']);h.eachCell(x=>{x.font={bold:true,color:{argb:'FFFFFFFF'}};x.fill={type:'pattern',pattern:'solid',fgColor:{argb}}});
      c.monthly.forEach(m=>{const r=ws.addRow([`${MON[Number(m.month.slice(5))-1]}-${m.month.slice(2,4)}`,m.sales,m.target||null,m.achievement]);r.getCell(2).numFmt='#,##0';r.getCell(3).numFmt='#,##0';r.getCell(4).numFmt='0.0%'});
      ws.addRow([]);
      const h2=ws.addRow(['SKU','ITEM',per,'% Contr']);h2.eachCell(x=>{x.font={bold:true,color:{argb:'FFFFFFFF'}};x.fill={type:'pattern',pattern:'solid',fgColor:{argb}}});
      c.items.forEach(it=>{const r=ws.addRow([it.sku,it.itemName,it.sales,it.contr]);r.getCell(3).numFmt='#,##0';r.getCell(4).numFmt='0.0%'});
      ws.columns=[{width:18},{width:48},{width:16},{width:13}];
    });
    const buf=await wb.xlsx.writeBuffer(),blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`online_grafik_per_channel_${R.period.start}_${R.period.end}.xlsx`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  async function exportJpeg(){
    if(!R)return alert('Klik APPLY terlebih dahulu sebelum download report.');
    if(!window.html2canvas)return alert('JPEG library unavailable');
    const canvas=await html2canvas($('#channelGraphBody'),{backgroundColor:'#fff',scale:2});const a=document.createElement('a');a.download='online_item_pareto.jpeg';a.href=canvas.toDataURL('image/jpeg',.95);a.click();
  }

  function setupActions(){
    const sec=$('#channelGraphSection'),body=$('#channelGraphSectionBody'),hide=$('#channelGraphHideBtn');
    hide.onclick=()=>{const h=body.classList.toggle('hidden');hide.textContent=h?'Show':'Hide';sec.classList.toggle('trx-bs-collapsed',h)};
    $('#channelGraphDownloadBtn').onclick=e=>{e.stopPropagation();$('#channelGraphDownloadWrap').classList.toggle('open')};
    document.addEventListener('click',e=>{const w=$('#channelGraphDownloadWrap');if(w&&!w.contains(e.target))w.classList.remove('open')});
    $('#channelGraphChartBtn').onclick=createChart;
    $('#channelGraphExportExcel').onclick=()=>{$('#channelGraphDownloadWrap').classList.remove('open');exportExcel().catch(e=>alert('Excel export failed: '+e.message))};
    $('#channelGraphExportJpeg').onclick=()=>{$('#channelGraphDownloadWrap').classList.remove('open');exportJpeg().catch(e=>alert('JPEG export failed: '+e.message))};
  }

  window.OnlineChannelGraph={init(meta){META=meta;if(!$('#channelGraphSection'))return;initState();render();renderBody();setupActions()}};
})();
