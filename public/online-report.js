// V54 Section B - Online Report Tabel (Detail Trx & Basket Size page)
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmt=n=>n===null||n===undefined||!Number.isFinite(Number(n))?'':Math.round(Number(n)).toLocaleString('en-US');
  const pct=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'':`${(Number(v)*100).toFixed(1)}%`;
  const MON=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const monYY=key=>{const [y,m]=key.split('-');return `${MON[Number(m)-1]}-${y.slice(2)}`};
  const COLORS={SHOPEE:'#ED7D31',HALODOC:'#FF0000',GRABMART:'#1E6B2A','GOOD DOCTOR':'#F08080',LAZADA:'#9B2C9B',WEBSITE:'#4CAF50',WHATSAPP:'#25A0C5'};
  const SPARE=['#5B9BD5','#FFC000','#7F6000','#A5A5A5','#264478','#9E480E'];
  const api=async(url,opts={})=>{const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||r.statusText);return d};

  let META=null,R=null;
  const S={start:'',end:'',chartFrom:'',chartTo:'',online:[],offline:[],filters:{}};

  function periodLabel(p){
    if(!p)return '';
    const sk=p.start.slice(0,7),ek=p.end.slice(0,7);
    const full=p.start.slice(8)==='01'&&Number(p.end.slice(8))===new Date(Number(ek.slice(0,4)),Number(ek.slice(5)),0).getDate();
    if(sk===ek&&full)return monYY(sk);
    if(sk===ek)return `${Number(p.start.slice(8))}-${Number(p.end.slice(8))} ${monYY(sk)}`;
    return `${monYY(sk)} – ${monYY(ek)}`;
  }

  function initState(){
    const max=META.maxDate||new Date().toISOString().slice(0,10);
    const d=new Date(Number(max.slice(0,4)),Number(max.slice(5,7))-2,1); // previous full month by default
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),last=new Date(y,d.getMonth()+1,0).getDate();
    S.start=`${y}-${m}-01`;S.end=`${y}-${m}-${String(last).padStart(2,'0')}`;
    S.chartTo=`${y}-${m}`;S.chartFrom=`${y}-01`;
    const groups=META.channelGroups||{online:META.channels.filter(c=>c!=='OFFLINE SALES'),offline:['OFFLINE SALES']};
    S.online=groups.online.filter(c=>c!=='WHATSAPP');
    S.offline=[...groups.offline];
    S.filters={stores:(META.stores||[]).map(s=>s.name),categories:[...(META.categories||[])],brands:[...(META.brands||[])],
      salesTypes:[...(META.salesTypes||[])],customerTypes:[...(META.customerTypes||[])],storeStats:[...(META.storeStats||[])]};
  }

  function multi(key,label,options,selected,search=false){
    const vals=(options||[]).map(o=>typeof o==='string'?o:o.name),set=new Set(selected||[]);
    const lab=set.size===vals.length?'All '+label:set.size+' Selected';
    return `<div class="field multi" data-key="${key}"><label>${label}</label><button class="control" type="button"><span class="multi-label">${esc(lab)}</span><span>▾</span></button><div class="drop">${search?'<input class="search-input" placeholder="Search...">':''}<label class="check"><input type="checkbox" class="toggle-all" ${set.size===vals.length?'checked':''}>Select All</label>${vals.map(v=>`<label class="check option"><input type="checkbox" value="${esc(v)}" ${set.has(v)?'checked':''}>${esc(v)}</label>`).join('')}</div></div>`;
  }

  function render(){
    const all=META.channels||[];
    const g=META.channelGroups||{online:all,offline:all};
    const onlineOpts=[...g.online,...g.offline.filter(x=>!g.online.includes(x))];
    const offlineOpts=[...g.offline,...g.online.filter(x=>!g.offline.includes(x))];
    $('#onlineFilters').innerHTML=`<div class="filter-grid">
      <div class="field"><label>Period Start</label><input type="date" class="control" id="orStart" value="${S.start}" ${META.maxDate?`max="${META.maxDate}"`:''}></div>
      <div class="field"><label>Period End</label><input type="date" class="control" id="orEnd" value="${S.end}" ${META.maxDate?`max="${META.maxDate}"`:''}></div>
      <div class="field"><label>Chart From</label><input type="month" class="control" id="orChartFrom" value="${S.chartFrom}"></div>
      <div class="field"><label>Chart To</label><input type="month" class="control" id="orChartTo" value="${S.chartTo}"></div>
      ${multi('online','Channel Online',onlineOpts,S.online)}
      ${multi('offline','Channel Offline',offlineOpts,S.offline)}
      ${multi('stores','Store',META.stores,S.filters.stores,true)}
      ${multi('categories','Category',META.categories,S.filters.categories,true)}
      ${multi('brands','Brand',META.brands,S.filters.brands,true)}
      ${multi('salesTypes','Sales Type',META.salesTypes,S.filters.salesTypes)}
      ${multi('customerTypes','Customer Type',META.customerTypes||[],S.filters.customerTypes)}
      ${multi('storeStats','Store Stat',META.storeStats||[],S.filters.storeStats)}
      <button class="apply" id="applyOnline" type="button">APPLY</button></div>
      <div class="chips"><span class="chip"><b>Section B only</b></span><span class="chip"><b>Online:</b> ${esc(S.online.join(', ')||'-')}</span><span class="chip"><b>Offline:</b> ${esc(S.offline.join(', ')||'-')}</span></div>`;
    bind();
  }

  function sync(f){
    const key=f.dataset.key,opts=$$('.option input',f),vals=opts.filter(x=>x.checked).map(x=>x.value);
    if(key==='online')S.online=vals;else if(key==='offline')S.offline=vals;else S.filters[key]=vals;
    $('.multi-label',f).textContent=vals.length===opts.length?'All '+$('label',f).textContent:vals.length+' Selected';
    const ta=$('.toggle-all',f);if(ta)ta.checked=vals.length===opts.length;
  }

  function bind(){
    const root=$('#onlineFilters');
    $$('.multi .control',root).forEach(btn=>btn.onclick=e=>{e.stopPropagation();const f=btn.closest('.multi');$$('.multi.open,.range.open,.product-picker.open').forEach(x=>x!==f&&x.classList.remove('open'));f.classList.toggle('open')});
    $$('.toggle-all',root).forEach(cb=>cb.onchange=()=>{const f=cb.closest('.multi');$$('.option input',f).forEach(x=>x.checked=cb.checked);sync(f)});
    $$('.option input',root).forEach(cb=>cb.onchange=()=>sync(cb.closest('.multi')));
    $$('.search-input',root).forEach(inp=>{inp.onclick=e=>e.stopPropagation();inp.oninput=()=>{const q=inp.value.toLowerCase();$$('.option',inp.closest('.drop')).forEach(r=>r.style.display=r.textContent.toLowerCase().includes(q)?'flex':'none')}});
    $('#orStart').onchange=e=>{S.start=e.target.value};
    $('#orEnd').onchange=e=>{S.end=e.target.value;if(S.end)S.chartTo=S.end.slice(0,7);$('#orChartTo').value=S.chartTo};
    $('#orChartFrom').onchange=e=>{S.chartFrom=e.target.value};
    $('#orChartTo').onchange=e=>{S.chartTo=e.target.value};
    $('#applyOnline').onclick=load;
  }

  async function load(){
    if(!S.start||!S.end||S.start>S.end)return alert('Period Start / End belum benar.');
    if(!S.online.length)return alert('Pilih minimal 1 Channel Online.');
    const overlap=S.online.filter(c=>S.offline.includes(c));
    if(overlap.length)return alert(`Channel ${overlap.join(', ')} dipilih di Online dan Offline sekaligus. Pilih salah satu.`);
    const btn=$('#applyOnline');btn.disabled=true;btn.textContent='LOADING...';
    $('#onlineTable').innerHTML='<div class="loading">Calculating Online Report...</div>';
    try{
      R=await api('/api/query/online-report',{method:'POST',body:JSON.stringify({period:{start:S.start,end:S.end},chartFrom:S.chartFrom,chartTo:S.chartTo,onlineChannels:S.online,offlineChannels:S.offline,filters:S.filters})});
      render();renderTable();
    }catch(e){R=null;render();$('#onlineTable').innerHTML=`<div class="error">Gagal menghitung: ${esc(e.message)}</div>`}
  }

  const red=v=>Number.isFinite(v)&&v!==null&&v<1?' or-red':'';
  function renderTable(){
    if(!R){$('#onlineTable').innerHTML='<div class="empty">Klik APPLY untuk menampilkan Online Report.</div>';return}
    const cur=periodLabel(R.period),ly=periodLabel(R.lyPeriod),lm=periodLabel(R.lmPeriod);
    const head=`<tr><th>CHANNEL</th><th>SALES<br>${cur}</th><th>TRX<br>${cur}</th><th>ABV<br>${cur}</th><th>TARGET<br>${cur}</th><th>vs<br>TARGET<br>${cur}</th><th>vs LY<br>${ly}</th><th>vs LM<br>${lm}</th></tr>`;
    const row=(r,cls='')=>`<tr class="${cls}"><td class="or-ch">${esc(r.channel||'TOTAL ONLINE')}</td><td>${fmt(r.sales)}</td><td>${fmt(r.trx)}</td><td>${fmt(r.abv)}</td><td>${r.target?fmt(r.target):''}</td><td class="${cls?'':red(r.vsTarget)}">${pct(r.vsTarget)}</td><td class="${cls?'':red(r.vsLY)}">${pct(r.vsLY)}</td><td class="${cls?'':red(r.vsLM)}">${pct(r.vsLM)}</td></tr>`;
    const contr=`<tr class="or-spacer"><td colspan="8"></td></tr><tr class="or-contr"><td class="or-ch">CONTR to TOTAL SLS</td><td>${pct(R.contribution.sales)}</td><td></td><td></td><td>${pct(R.contribution.target)}</td><td></td><td></td><td></td></tr>`;
    const note=R.fullMonth?'':`<div class="or-note">Periode bukan 1 bulan penuh: TARGET dihitung proporsional sesuai jumlah hari; LM = ${esc(R.lmPeriod.start)} s/d ${esc(R.lmPeriod.end)}, LY = ${esc(R.lyPeriod.start)} s/d ${esc(R.lyPeriod.end)}.</div>`;
    $('#onlineTable').innerHTML=`<table class="or-table" id="orTableEl"><thead>${head}</thead><tbody>${R.rows.map(r=>row(r)).join('')}${row({...R.total,channel:'TOTAL ONLINE'},'or-total')}${contr}</tbody></table>${note}`;
  }

  // ---------- Charts (popup) ----------
  function chartData(){
    const months=R.chart.map(c=>c.month);
    const multiYear=new Set(months.map(m=>m.slice(0,4))).size>1;
    const labels=months.map(m=>multiYear?monYY(m):MON[Number(m.slice(5))-1]);
    const totals={};R.online.forEach(c=>totals[c]=R.chart.reduce((t,m)=>t+(m.channels[c]||0),0));
    const order=[...R.online].sort((a,b)=>totals[b]-totals[a]);
    let spare=0;const colors={};order.forEach(c=>colors[c]=COLORS[c]||SPARE[spare++%SPARE.length]);
    return {labels,chart:R.chart,order,colors};
  }
  function createChart(){
    if(!R)return alert('Klik APPLY terlebih dahulu agar data chart tersedia.');
    if(!R.chart.length)return alert('Tidak ada data chart.');
    const d=chartData();
    const w=window.open('','_blank');if(!w)return alert('Allow popup for Create Chart');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Online Report Chart</title><style>body{font-family:Arial;background:#f4f6f8;padding:22px;color:#1f2937;margin:0}.page{max-width:1100px;margin:auto}.box{background:#fff;border:1px solid #c7cfd7;padding:16px;margin-bottom:18px}.bh{display:flex;justify-content:space-between;align-items:center}h2{margin:0 0 10px;font-size:17px}button{border:1px solid #9aa4ae;background:#fff;padding:6px 10px;cursor:pointer}canvas{display:block;max-width:100%}</style></head><body><div class="page"><h1>Online Report Chart</h1>
    <div class="box"><div class="bh"><h2>B2. Sales Online vs Offline per Bulan</h2><button onclick="dl('c2','online_vs_offline')">Download PNG</button></div><canvas id="c2"></canvas></div>
    <div class="box"><div class="bh"><h2>B3. Kontribusi per Channel Online</h2><button onclick="dl('c3','kontribusi_channel_online')">Download PNG</button></div><canvas id="c3"></canvas></div></div>
    <script>const D=${JSON.stringify(d)};
    function dl(id,n){const a=document.createElement('a');a.download=n+'.png';a.href=document.getElementById(id).toDataURL('image/png');a.click()}
    function setup(id,W,H){const c=document.getElementById(id),r=devicePixelRatio||1;c.width=W*r;c.height=H*r;c.style.width=W+'px';c.style.height=H+'px';const x=c.getContext('2d');x.scale(r,r);x.fillStyle='#fff';x.fillRect(0,0,W,H);return x}
    function nice(v){if(v<=0)return 1;const p=Math.pow(10,Math.floor(Math.log10(v))),n=v/p;return (n<=1?1:n<=2?2:n<=5?5:10)*p}
    function legend(x,items,W,y){x.font='12px Arial';let tw=items.reduce((t,i)=>t+x.measureText(i[0]).width+34,0),lx=(W-tw)/2;items.forEach(([n,c])=>{x.fillStyle=c;x.fillRect(lx,y-10,11,11);x.fillStyle='#333';x.fillText(n,lx+16,y);lx+=x.measureText(n).width+34})}
    function label(x,t,cx,cy,size,color){x.font='bold '+size+'px Arial';x.textAlign='center';x.textBaseline='middle';x.lineWidth=3;x.strokeStyle='rgba(0,0,0,.25)';if(color==='#fff')x.strokeText(t,cx,cy);x.fillStyle=color;x.fillText(t,cx,cy);x.textAlign='left';x.textBaseline='alphabetic'}
    // B2
    (function(){const W=1000,H=520,L=120,R=20,T=24,B=80,x=setup('c2',W,H),cw=W-L-R,ch=H-T-B,n=D.labels.length;
      const max=Math.max(...D.chart.map(m=>m.online+m.offline),1),step=nice(max/10),top=Math.ceil(max/step)*step;
      x.font='12px Arial';x.textAlign='right';for(let v=0;v<=top+1e-6;v+=step){const y=T+ch-ch*v/top;x.strokeStyle='#e5e7eb';x.beginPath();x.moveTo(L,y);x.lineTo(W-R,y);x.stroke();x.fillStyle='#555';x.fillText(v?Math.round(v).toLocaleString('en-US'):'-',L-8,y+4)}x.textAlign='left';
      const gw=cw/n,bw=gw*0.82;D.chart.forEach((m,i)=>{const bx=L+i*gw+(gw-bw)/2,ho=ch*m.offline/top,hn=ch*m.online/top,yb=T+ch;
        x.fillStyle='#1F5F7A';x.fillRect(bx,yb-ho,bw,ho);x.fillStyle='#ED7D31';x.fillRect(bx,yb-ho-hn,bw,hn);
        const tot=m.online+m.offline;if(tot&&hn>16)label(x,(m.online/tot*100).toFixed(1)+'%',bx+bw/2,yb-ho-hn/2,Math.min(22,Math.max(13,hn*0.45)),'#fff');
        x.font='12px Arial';x.fillStyle='#444';x.textAlign='center';x.fillText(D.labels[i],bx+bw/2,yb+20);x.textAlign='left'});
      legend(x,[['TOTAL OFFLINE','#1F5F7A'],['TOTAL ONLINE','#ED7D31']],W,H-22)})();
    // B3
    (function(){const W=1000,H=480,L=24,R=24,T=20,B=70,x=setup('c3',W,H),cw=W-L-R,ch=H-T-B,n=D.labels.length;
      const max=Math.max(...D.chart.map(m=>m.online),1),gw=cw/n,bw=gw*0.78;
      x.strokeStyle='#bbb';x.beginPath();x.moveTo(L,T+ch);x.lineTo(W-R,T+ch);x.stroke();
      D.chart.forEach((m,i)=>{const bx=L+i*gw+(gw-bw)/2;let y=T+ch;
        // V54.1: label only the 2 highest channels of each month.
        const top2=new Set(Object.entries(m.channels).filter(e=>e[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,2).map(e=>e[0]));
        D.order.forEach(c=>{const v=m.channels[c]||0,h=ch*v/max;if(h<=0)return;x.fillStyle=D.colors[c];x.fillRect(bx,y-h,bw,h);
          const share=m.online?v/m.online:0;if(top2.has(c)){const big=share>=0.5,size=big?Math.min(30,Math.max(16,h*0.22)):Math.min(17,Math.max(10,h*0.4));label(x,Math.round(share*100)+'%',bx+bw/2,y-h/2,size,big?'#1f2a44':'#fff')}
          y-=h});
        x.font='bold 13px Arial';x.fillStyle='#444';x.textAlign='center';x.fillText(D.labels[i],bx+bw/2,T+ch+22);x.textAlign='left'});
      legend(x,D.order.map(c=>[c,D.colors[c]]),W,H-20)})();
    <\/script></body></html>`);
    w.document.close();
  }

  // ---------- Exports ----------
  async function exportExcel(){
    if(!R)return alert('Klik APPLY terlebih dahulu sebelum download report.');
    if(!window.ExcelJS)return alert('Excel library unavailable');
    const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Online Report');
    const cur=periodLabel(R.period),ly=periodLabel(R.lyPeriod),lm=periodLabel(R.lmPeriod);
    const green='FF548235',white={color:{argb:'FFFFFFFF'},bold:true};
    ws.addRow(['Online Report Tabel']);ws.getRow(1).font={bold:true,size:15};
    ws.addRow(['Period',`${R.period.start} s/d ${R.period.end}`]);ws.addRow(['Channel Online',R.online.join(', ')]);ws.addRow(['Channel Offline',R.offline.join(', ')]);ws.addRow([]);
    const h=ws.addRow(['CHANNEL',`SALES ${cur}`,`TRX ${cur}`,`ABV ${cur}`,`TARGET ${cur}`,`vs TARGET ${cur}`,`vs LY ${ly}`,`vs LM ${lm}`]);
    h.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:green}};c.font=white;c.alignment={horizontal:'center',vertical:'middle',wrapText:true}});h.height=36;
    const add=(r,name,fill)=>{const x=ws.addRow([name,r.sales,r.trx,r.abv,r.target||null,r.vsTarget,r.vsLY,r.vsLM]);
      [2,3,4,5].forEach(i=>x.getCell(i).numFmt='#,##0');[6,7,8].forEach(i=>{x.getCell(i).numFmt='0.0%';const v=x.getCell(i).value;if(!fill&&typeof v==='number'&&v<1)x.getCell(i).font={color:{argb:'FFFF0000'}}});
      if(fill)x.eachCell({includeEmpty:true},c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:green}};c.font=white});else x.getCell(1).font={bold:true};return x};
    R.rows.forEach(r=>add(r,r.channel,false));add(R.total,'TOTAL ONLINE',true);ws.addRow([]);
    const c=ws.addRow(['CONTR to TOTAL SLS',R.contribution.sales,null,null,R.contribution.target]);c.eachCell({includeEmpty:true},x=>{x.fill={type:'pattern',pattern:'solid',fgColor:{argb:green}};x.font=white});[2,5].forEach(i=>c.getCell(i).numFmt='0.0%');
    ws.columns.forEach((col,i)=>col.width=i===0?24:17);
    const ws2=wb.addWorksheet('Chart Data');
    ws2.addRow(['MONTH','TOTAL OFFLINE','TOTAL ONLINE','% ONLINE',...R.online]).font={bold:true};
    R.chart.forEach(m=>{const t=m.online+m.offline,x=ws2.addRow([monYY(m.month),m.offline,m.online,t?m.online/t:null,...R.online.map(ch=>m.channels[ch]||0)]);for(let i=2;i<=4+R.online.length;i++)x.getCell(i).numFmt=i===4?'0.0%':'#,##0'});
    ws2.columns.forEach((col,i)=>col.width=i===0?10:16);
    const buf=await wb.xlsx.writeBuffer(),blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`online_report_${R.period.start}_${R.period.end}.xlsx`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  async function exportJpeg(){
    if(!R)return alert('Klik APPLY terlebih dahulu sebelum download report.');
    if(!window.html2canvas)return alert('JPEG library unavailable');
    const el=$('#orTableEl');if(!el)return;
    const canvas=await html2canvas(el,{backgroundColor:'#fff',scale:2});const a=document.createElement('a');a.download='online_report.jpeg';a.href=canvas.toDataURL('image/jpeg',.95);a.click();
  }

  function setupActions(){
    const sec=$('#onlineSection'),body=$('#onlineSectionBody'),hide=$('#onlineHideBtn');
    hide.onclick=()=>{const h=body.classList.toggle('hidden');hide.textContent=h?'Show':'Hide';sec.classList.toggle('trx-bs-collapsed',h)};
    $('#onlineDownloadBtn').onclick=e=>{e.stopPropagation();$('#onlineDownloadWrap').classList.toggle('open')};
    document.addEventListener('click',e=>{const w=$('#onlineDownloadWrap');if(w&&!w.contains(e.target))w.classList.remove('open')});
    $('#onlineChartBtn').onclick=createChart;
    $('#onlineExportExcel').onclick=()=>{$('#onlineDownloadWrap').classList.remove('open');exportExcel().catch(e=>alert('Excel export failed: '+e.message))};
    $('#onlineExportJpeg').onclick=()=>{$('#onlineDownloadWrap').classList.remove('open');exportJpeg().catch(e=>alert('JPEG export failed: '+e.message))};
  }

  window.OnlineReport={init(meta){META=meta;if(!$('#onlineSection'))return;initState();render();renderTable();setupActions()}};
})();
