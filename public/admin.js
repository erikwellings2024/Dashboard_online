const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const api=async(url,opts={})=>{const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});if(r.status===401){location.href='/login.html';throw new Error('Unauthorized')}if(r.status===403){location.href='/dashboard.html';throw new Error('Forbidden')}const d=await r.json();if(!r.ok)throw new Error(d.error||'Request failed');return d};
let CFG=null,USERS=[],ME=null,META=null;
function msg(id,text,ok=true){const el=$(id);el.className=ok?'success':'error';el.textContent=text;setTimeout(()=>el.className='',4500)}

$$('.admin-tab').forEach(b=>b.onclick=()=>{$$('.admin-tab').forEach(x=>x.classList.remove('active'));$$('.admin-panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#tab-'+b.dataset.tab).classList.add('active')});
$('#logoutBtn').onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});location.href='/login.html'};

function channelRow(c={name:'',rawName:'',sort:99,active:true,telemed:false}){return `<tr><td><input class="ch-name" value="${esc(c.name)}"></td><td><input class="ch-raw" value="${esc(c.rawName||c.name)}"></td><td><input class="ch-sort" type="number" value="${Number(c.sort||99)}"></td><td class="center"><input class="ch-active" type="checkbox" ${c.active?'checked':''}></td><td class="center"><input class="ch-telemed" type="checkbox" ${c.telemed?'checked':''}></td><td class="action-cell"><button class="btn red remove-row">Remove</button></td></tr>`}
function renderChannels(){$('#channelTable tbody').innerHTML=CFG.channels.map(channelRow).join('');bindRemove()}
function collectChannels(){return $$('#channelTable tbody tr').map(r=>({name:$('.ch-name',r).value,rawName:$('.ch-raw',r).value,sort:Number($('.ch-sort',r).value||99),active:$('.ch-active',r).checked,telemed:$('.ch-telemed',r).checked}))}
$('#addChannel').onclick=()=>{$('#channelTable tbody').insertAdjacentHTML('beforeend',channelRow());bindRemove()};
$('#saveChannels').onclick=async()=>{try{CFG.channels=collectChannels();await saveConfig();msg('#channelMsg','Channel master saved.')}catch(e){msg('#channelMsg',e.message,false)}};

function storeRow(s={name:'',rawName:'',pt:'EFM',active:true}){return `<tr><td><input class="st-name" value="${esc(s.name)}"></td><td><input class="st-raw" value="${esc(s.rawName)}"></td><td><select class="st-pt"><option ${s.pt==='EFM'?'selected':''}>EFM</option><option ${s.pt==='EFIT'?'selected':''}>EFIT</option><option ${s.pt==='ESB'?'selected':''}>ESB</option></select></td><td class="center"><input class="st-active" type="checkbox" ${s.active?'checked':''}></td><td class="action-cell"><button class="btn red remove-row">Remove</button></td></tr>`}
function renderStores(){$('#storeTable tbody').innerHTML=CFG.stores.map(storeRow).join('');bindRemove()}
function collectStores(){return $$('#storeTable tbody tr').map(r=>({name:$('.st-name',r).value,rawName:$('.st-raw',r).value,pt:$('.st-pt',r).value,active:$('.st-active',r).checked}))}
$('#addStore').onclick=()=>{$('#storeTable tbody').insertAdjacentHTML('beforeend',storeRow());bindRemove()};
$('#saveStores').onclick=async()=>{try{CFG.stores=collectStores();await saveConfig();msg('#storeMsg','Store / PT master saved.')}catch(e){msg('#storeMsg',e.message,false)}};
function bindRemove(){$$('.remove-row').forEach(b=>b.onclick=()=>b.closest('tr').remove())}
async function saveConfig(){const d=await api('/api/admin/config',{method:'PUT',body:JSON.stringify(CFG)});CFG=d.config;return d}

function renderTarget(){const month=$('#targetConfigMonth').value;const t=CFG.targets[month]||{};$('#targetTable tbody').innerHTML=CFG.channels.filter(c=>c.active).sort((a,b)=>a.sort-b.sort).map(c=>`<tr><td>${esc(c.name)}</td><td><input class="target-value" data-channel="${esc(c.name)}" type="number" value="${Number(t[c.name]||0)}"></td></tr>`).join('')}
$('#loadTarget').onclick=renderTarget;
$('#saveTarget').onclick=async()=>{try{const month=$('#targetConfigMonth').value;if(!month)throw new Error('Choose target month');CFG.targets[month]=CFG.targets[month]||{};$$('.target-value').forEach(x=>CFG.targets[month][x.dataset.channel]=Number(x.value||0));await saveConfig();msg('#targetMsg','Target saved for '+month)}catch(e){msg('#targetMsg',e.message,false)}};

async function loadUsers(){USERS=await api('/api/admin/users');renderUsers()}
function renderUsers(){$('#userTable tbody').innerHTML=USERS.map(u=>`<tr data-id="${u.id}"><td>${esc(u.username)}</td><td><input class="u-name" value="${esc(u.displayName||u.username)}"></td><td><select class="u-role"><option value="guest" ${u.role==='guest'?'selected':''}>Guest</option><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option></select></td><td class="center"><input class="u-active" type="checkbox" ${u.active?'checked':''}></td><td><input class="u-pass" type="password" placeholder="Leave blank"></td><td class="action-cell"><button class="btn save-user">Save</button> <button class="btn red delete-user">Delete</button></td></tr>`).join('');$$('.save-user').forEach(b=>b.onclick=()=>saveUser(b.closest('tr')));$$('.delete-user').forEach(b=>b.onclick=()=>deleteUser(b.closest('tr')))}
async function saveUser(r){try{const body={displayName:$('.u-name',r).value,role:$('.u-role',r).value,active:$('.u-active',r).checked};if($('.u-pass',r).value)body.password=$('.u-pass',r).value;await api('/api/admin/users/'+r.dataset.id,{method:'PUT',body:JSON.stringify(body)});await loadUsers();msg('#userMsg','User updated.')}catch(e){msg('#userMsg',e.message,false)}}
async function deleteUser(r){if(!confirm('Delete this user?'))return;try{await api('/api/admin/users/'+r.dataset.id,{method:'DELETE'});await loadUsers();msg('#userMsg','User deleted.')}catch(e){msg('#userMsg',e.message,false)}}
$('#addUser').onclick=async()=>{try{const body={username:$('#newUsername').value,displayName:$('#newDisplayName').value,password:$('#newPassword').value,role:$('#newRole').value};await api('/api/admin/users',{method:'POST',body:JSON.stringify(body)});$('#newUsername').value=$('#newDisplayName').value=$('#newPassword').value='';await loadUsers();msg('#userMsg','User created.')}catch(e){msg('#userMsg',e.message,false)}};

function renderUploadPolicy(){
  const p=META?.uploadPolicy;if(!p)return;
  $('#uploadPolicy').innerHTML=
    `<b>Monthly Storage Policy</b> &nbsp; `+
    `Tidak ada monthly closing. Admin dapat upload / replace bulan mana pun dari <b>Jan 2026 sampai Dec 2028</b> kapan saja. `+
    `File Excel harus berisi tepat satu bulan yang sama dengan Month Folder yang dipilih.`;
}

function monthName(key){
  const [y,m]=key.split('-').map(Number);
  return new Date(Date.UTC(y,m-1,1)).toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'});
}

function fallbackMonthSlots(){
  const out=[];
  for(let y=2026;y<=2028;y++){
    for(let m=1;m<=12;m++){
      out.push({
        month:`${y}-${String(m).padStart(2,'0')}`,
        status:'NO DATA',rowCount:0,minDate:null,maxDate:null,
        updatedAt:null,uploadedBy:null,sourceFile:null
      });
    }
  }
  return out;
}

function monthSlots(){
  const apiSlots=Array.isArray(META?.monthSlots)?META.monthSlots:[];
  return apiSlots.length?apiSlots:fallbackMonthSlots();
}

function initMonthSelect(){
  const slots=monthSlots();
  const p=META?.uploadPolicy||{};
  const el=$('#uploadMonth');
  el.innerHTML=slots.map(s=>`<option value="${s.month}">${monthName(s.month)} — ${Number(s.rowCount||0)>0?'DATA':'NO DATA'}</option>`).join('');
  const preferred=slots.find(s=>s.month===p.currentMonth) || slots.find(s=>s.month==='2026-09') || slots[0];
  if(preferred)el.value=preferred.month;
  const info=$('#monthSelectorInfo');
  if(info) info.textContent=`${slots.length} month folders available • Jan 2026 – Dec 2028 • any month can be replaced anytime`;
}

function renderMonthStorage(){
  const year=$('#monthYear').value;
  const slots=monthSlots().filter(s=>s.month.startsWith(year+'-'));
  $('#monthStorageTable tbody').innerHTML=slots.map(s=>{
    const effectiveStatus=s.rowCount?'DATA':'NO DATA';
    const cls=s.rowCount?'open':'empty';
    return `<tr>
      <td><b>${esc(s.month)}</b><br><span class="muted-mini">/app/data/monthly/${esc(s.month.slice(0,4))}/${esc(s.month.slice(5))}.json</span></td>
      <td class="center"><span class="badge ${cls}">${esc(effectiveStatus)}</span></td>
      <td class="num">${Number(s.rowCount||0).toLocaleString()}</td>
      <td>${esc(s.minDate||'-')} → ${esc(s.maxDate||'-')}</td>
      <td>${s.updatedAt?new Date(s.updatedAt).toLocaleString('en-GB'):'-'}</td>
      <td>${esc(s.uploadedBy||'-')}</td>
      <td>${esc(s.sourceFile||'-')}</td>
      <td><button class="btn select-month" data-month="${s.month}">Select</button></td>
    </tr>`;
  }).join('');
  $$('.select-month').forEach(b=>b.onclick=()=>{
    $('#uploadMonth').value=b.dataset.month;
    $('#uploadMonth').scrollIntoView({behavior:'smooth',block:'center'});
  });
}

function renderUploadHistory(){
  const rows=META?.runtime?.uploadHistory||[];
  $('#uploadHistoryTable tbody').innerHTML=rows.length?rows.map(x=>`
    <tr>
      <td>${x.uploadedAt?new Date(x.uploadedAt).toLocaleString('en-GB'):'-'}</td>
      <td>${esc(x.uploadedBy||'-')}</td>
      <td><b>${esc(x.targetMonth||'-')}</b></td>
      <td>${esc(x.sourceFile||'-')}</td>
      <td>${esc(x.detectedStart||'-')} → ${esc(x.detectedEnd||'-')}</td>
      <td class="num">${Number(x.incomingRows||0).toLocaleString()}</td>
      <td class="num">${Number(x.replacedRows||0).toLocaleString()}</td>
      <td class="num">${Number(x.totalRows||0).toLocaleString()}</td>
    </tr>`).join(''):`<tr><td colspan="8" class="center">No upload history yet.</td></tr>`;
}

$('#monthYear').onchange=renderMonthStorage;

$('#rawFile').onchange=()=>{
  const f=$('#rawFile').files[0];
  $('#fileInfo').textContent=f?`${f.name} • ${(f.size/1024/1024).toFixed(1)} MB`:'-';
};

$('#uploadRaw').onclick=async()=>{
  const f=$('#rawFile').files[0];
  if(!f)return msg('#uploadMsg','Choose .xlsx/.xls file first.',false);
  const targetMonth=$('#uploadMonth').value;
  const ok=confirm(`Upload ${f.name} into folder ${targetMonth}? Existing data for this month will be replaced. This month can be updated again anytime.`);
  if(!ok)return;

  const fd=new FormData();
  fd.append('file',f);fd.append('targetMonth',targetMonth);
  const b=$('#uploadRaw');b.disabled=true;b.textContent='UPLOADING & PROCESSING...';
  try{
    const r=await fetch('/api/admin/upload',{method:'POST',body:fd});let d={};try{d=await r.json()}catch{}
    if(!r.ok){
      if(r.status===413)throw new Error(d.error||'File exceeds upload limit.');
      if(String(d.error||'').startsWith('MONTH_MISMATCH'))throw new Error(d.error+' Please export exactly one month from Metabase.');
      throw new Error(d.error||'Upload failed');
    }
    msg('#uploadMsg',`Success: ${d.targetMonth}. ${Number(d.incomingRows||0).toLocaleString()} rows uploaded; ${Number(d.replacedRows||0).toLocaleString()} previous rows replaced. Coverage ${d.detectedStart} → ${d.detectedEnd}.`);
    META=await api('/api/meta');renderRuntime();renderUploadPolicy();initMonthSelect();renderMonthStorage();renderUploadHistory();
  }catch(e){msg('#uploadMsg',e.message,false)}finally{b.disabled=false;b.textContent='UPLOAD / REPLACE MONTH'}
};

function renderRuntime(){
  const r=META.runtime||{},last=r.lastUpload||{};
  $('#runtimeInfo').innerHTML=
    `<b>Overall Data Coverage:</b> ${esc(r.minDate||META.minDate||'-')} → ${esc(r.maxDate||META.maxDate||'-')} &nbsp; | &nbsp; `+
    `<b>Total Rows:</b> ${(r.rowCount||0).toLocaleString()} &nbsp; | &nbsp; `+
    `<b>Last Update:</b> ${r.updatedAt?new Date(r.updatedAt).toLocaleString('en-GB'):'-'}`+
    (last.targetMonth?`<br><b>Last Folder Updated:</b> ${esc(last.targetMonth)} &nbsp; | &nbsp; <b>Source:</b> ${esc(last.sourceFile||'-')}`:'');
}

async function boot(){
  ME=await api('/api/auth/me');
  if(ME.role!=='admin')return location.href='/dashboard.html';
  $('#userChip').textContent=`${ME.displayName||ME.username} • ADMIN`;
  CFG=await api('/api/admin/config');
  META=await api('/api/meta');

  const currentMonth=META?.uploadPolicy?.currentMonth || new Date().toISOString().slice(0,7);
  const targetEl=$('#targetConfigMonth');
  if(targetEl) targetEl.value=currentMonth;

  renderChannels();
  renderStores();
  initMonthSelect();
  renderTarget();
  renderRuntime();
  renderUploadPolicy();
  renderMonthStorage();
  renderUploadHistory();
  await loadUsers();
}
boot().catch(e=>{
  console.error(e);
  const info=$('#monthSelectorInfo');
  if(info) info.textContent='Admin page initialization error: '+e.message;
});
