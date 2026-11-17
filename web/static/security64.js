(()=>{
'use strict';
const csrfCookie='halaqat_csrf48';
function readCookie(name){const prefix=name+'=';return document.cookie.split('; ').find(row=>row.startsWith(prefix))?.slice(prefix.length)||'';}
const nativeFetch=window.fetch.bind(window);
window.fetch=(input,init={})=>{
 try{
  const url=new URL(input instanceof Request?input.url:input,location.href);
  const method=String(init.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  if(url.origin===location.origin&&!['GET','HEAD','OPTIONS'].includes(method)){
   const headers=new Headers(init.headers||(input instanceof Request?input.headers:undefined));
   const token=readCookie(csrfCookie);if(token)headers.set('X-CSRF-Token',token);
   return nativeFetch(input,{...init,headers,credentials:init.credentials||'same-origin'});
  }
 }catch{}
 return nativeFetch(input,init);
};
const $=id=>document.getElementById(id);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function show(message,error=false){const node=$('sessionsStatus48');if(node){node.textContent=message;node.classList.toggle('is-error48',error);}}
async function request(path,payload){const response=await fetch('/api/security48/'+path,payload===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});let data={};try{data=await response.json();}catch{}if(!response.ok)throw new Error(data.detail||'تعذر إكمال الطلب. حدّث الصفحة وحاول مجددًا.');return data;}
async function loadSessions(){const box=$('sessionsList48');if(!box)return;try{const data=await request('sessions');const rows=data.items||[];box.innerHTML=rows.length?rows.map(row=>'<div class="session-row48"><div><strong>'+escapeHtml(row.device)+'</strong><small>'+(row.created_at?'تسجيل الدخول: '+escapeHtml(new Date(row.created_at+'Z').toLocaleString('ar-SA')):'جلسة سابقة')+'</small></div>'+(row.current?'<span class="session-current48">هذا الجهاز</span>':'<button type="button" class="security-secondary48" data-revoke-session="'+Number(row.id)+'">إنهاء الجلسة</button>')+'</div>').join(''):'<p>لا توجد أجهزة متصلة حاليًا.</p>';}catch(error){box.textContent=error.message;}}
async function loadEvents(){const box=$('securityEvents48');if(!box)return;try{const data=await request('events');box.innerHTML=(data.items||[]).length?'<ul class="security-events-list48">'+data.items.map(row=>'<li><strong>'+escapeHtml(row.event)+'</strong><span>'+escapeHtml(row.account)+' · '+escapeHtml(new Date(row.at).toLocaleString('ar-SA'))+'</span>'+(row.details?'<small>'+escapeHtml(row.details)+'</small>':'')+'</li>').join('')+'</ul>':'<p>لا توجد أحداث أمنية مسجلة.</p>';}catch(error){box.textContent=error.message;}}
function initialize(){
 loadSessions();loadEvents();
 $('sessionsList48')?.addEventListener('click',async event=>{const button=event.target.closest('[data-revoke-session]');if(!button||!confirm('هل تريد تسجيل الخروج من هذا الجهاز؟'))return;button.disabled=true;try{await request('sessions/revoke',{session_id:Number(button.dataset.revokeSession)});show('تم إنهاء الجلسة المحددة.');await loadSessions();await loadEvents();}catch(error){show(error.message,true);}finally{button.disabled=false;}});
 $('revokeSessions48')?.addEventListener('click',async()=>{if(!confirm('سيتم تسجيل الخروج من بقية الأجهزة. هل تريد المتابعة؟'))return;const button=$('revokeSessions48');button.disabled=true;try{const result=await request('sessions/revoke-others',{});show('تم إنهاء '+(result.removed||0)+' جلسة أخرى.');await loadSessions();await loadEvents();}catch(error){show(error.message,true);}finally{button.disabled=false;}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
