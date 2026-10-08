// V58 Shared "Download JPEG (Mobile)" for Detail Trx & BS sections.
// Narrow image: width follows the table, filters wrap into a few rows.
(function(){
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmtDate=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return v;const d=new Date(v+'T00:00:00');return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})};
  const fmtMonth=v=>{if(!/^\d{4}-\d{2}$/.test(v||''))return v;const d=new Date(v+'-01T00:00:00');return d.toLocaleDateString('en-GB',{month:'short',year:'numeric'})};

  function filterPairs(root){
    const pairs=[];
    $$('.field',root).forEach(field=>{
      const label=$('label',field)?.textContent?.trim();if(!label)return;
      let value='';
      if(field.classList.contains('range'))value=$('.control span:first-child',field)?.textContent?.trim()||'';
      else if(field.classList.contains('multi')){const opts=$$('.option input',field),checked=opts.filter(x=>x.checked).map(x=>x.value);value=checked.length===opts.length?`All ${label}`:(checked.join(', ')||'None')}
      else if(field.classList.contains('product-picker'))value=$('.product-input',field)?.value.trim()||'All Item';
      else{const inp=$('input',field),sel=$('select',field);
        if(sel)value=sel.options[sel.selectedIndex]?.textContent||sel.value;
        else if(inp)value=inp.type==='date'?fmtDate(inp.value):inp.type==='month'?fmtMonth(inp.value):inp.value}
      if(value)pairs.push([label,value]);
    });
    return pairs;
  }

  async function exportMobile({section,content,filters,filename,prepare}){
    if(!window.html2canvas)return alert('JPEG library unavailable');
    if(!content||!content.innerHTML.trim())return alert('Klik APPLY terlebih dahulu sebelum download report.');
    const no=$('.section-no',section)?.textContent?.trim()||'',title=$('h2',section)?.textContent?.trim()||'Report',subtitle=$('.section-title p',section)?.textContent?.trim()||'';
    const pairs=filterPairs(filters);
    const clone=content.cloneNode(true);clone.style.overflow='visible';clone.removeAttribute('id');clone.style.padding='0';clone.style.margin='0';clone.style.border='0';
    if(prepare)prepare(clone);
    const header=document.createElement('div');header.className='jpeg-report-header';
    header.innerHTML=`<div class="jpeg-report-title">${no?`<span class="jpeg-section-no">${esc(no)}</span>`:''}<div><h2>${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div></div><div class="jpeg-filter-summary">${pairs.map(([k,v])=>`<span class="jpeg-filter-chip"><b>${esc(k)}:</b> ${esc(v)}</span>`).join('')}</div>`;
    const stage=document.createElement('div');stage.className='jpeg-export-stage jpeg-mobile';
    stage.style.cssText='position:fixed;left:-100000px;top:0;background:#fff;padding:4px;width:max-content;z-index:-1';
    stage.appendChild(clone);document.body.appendChild(stage);
    try{
      $$('table',clone).forEach(t=>{if(getComputedStyle(t).tableLayout!=='fixed'){t.style.width='auto';t.style.minWidth='0'}});
      clone.style.width='max-content';clone.style.minWidth='0';
      const grid=$('.oc-grid',clone),tw=$$('table',clone).map(t=>Math.ceil(t.getBoundingClientRect().width));
      const w=grid||!tw.length?Math.ceil(clone.scrollWidth||0):Math.max(...tw); // exactly the table width
      stage.insertBefore(header,clone);
      clone.style.width=w+'px';header.style.width=w+'px';
      const canvas=await html2canvas(stage,{backgroundColor:'#fff',scale:2,width:stage.scrollWidth,height:stage.scrollHeight,windowWidth:stage.scrollWidth,windowHeight:stage.scrollHeight});
      const a=document.createElement('a');a.download=(filename||'report')+'_mobile.jpeg';a.href=canvas.toDataURL('image/jpeg',.95);a.click();
    }catch(e){console.error(e);alert('JPEG export failed: '+e.message)}
    finally{stage.remove()}
  }

  function wire(btnId,wrapId,cfg){
    const btn=document.getElementById(btnId);if(!btn)return;
    btn.onclick=()=>{document.getElementById(wrapId)?.classList.remove('open');exportMobile(cfg())};
  }
  function init(){
    wire('basketExportJpegMobile','basketDownloadWrap',()=>({section:$('#basketSection'),content:$('#basketTable'),filters:$('#basketFilters'),filename:'detail_trx_basket_size'}));
    wire('onlineExportJpegMobile','onlineDownloadWrap',()=>({section:$('#onlineSection'),content:$('#onlineTable'),filters:$('#onlineFilters'),filename:'online_report'}));
    wire('channelGraphExportJpegMobile','channelGraphDownloadWrap',()=>({section:$('#channelGraphSection'),content:$('#channelGraphBody'),filters:$('#channelGraphFilters'),filename:'online_item_pareto',
      prepare:c=>{const g=$('.oc-grid',c);if(g){g.style.gridTemplateColumns='max-content';g.style.gap='8px'}$$('.oc-card',c).forEach(x=>{x.style.margin='0'})}}));
    wire('rejectionExportJpegMobile','rejectionDownloadWrap',()=>({section:$('#rejectionSection'),content:$('#rejectionTable'),filters:$('#rejectionFilters'),filename:'halodoc_rejection'}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
