const form=document.getElementById('loginForm'), err=document.getElementById('error');
form.addEventListener('submit',async e=>{
  e.preventDefault();err.classList.add('hidden');
  const btn=form.querySelector('button');btn.disabled=true;btn.textContent='LOGGING IN...';
  try{
    const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('username').value,password:document.getElementById('password').value})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error==='INVALID_LOGIN'?'Username atau password salah.':d.error||'Login gagal.');
    location.href='/dashboard.html';
  }catch(ex){err.textContent=ex.message;err.classList.remove('hidden');}
  finally{btn.disabled=false;btn.textContent='LOGIN';}
});
