(()=>{
 'use strict';
 const base=document.querySelector('meta[name="demo-base42"]').content;
 const targetBase=base+'/';
 const fetchOriginal=window.fetch.bind(window);
 const message='هذه تجربة للعرض فقط؛ لا يمكن إضافة أو تعديل أو حذف أو إرسال بيانات.';
 window.fetch=(resource,options={})=>{
  const url=new URL(resource instanceof Request?resource.url:String(resource),location.href);
  const method=(options.method||(resource instanceof Request?resource.method:'GET')).toUpperCase();
  if(url.origin!==location.origin)return Promise.resolve(new Response(JSON.stringify({detail:message}),{status:403,headers:{'Content-Type':'application/json'}}));
  if(!['GET','HEAD'].includes(method))return Promise.resolve(new Response(JSON.stringify({detail:message}),{status:403,headers:{'Content-Type':'application/json'}}));
  if(url.pathname.startsWith('/api/'))url.pathname=base+url.pathname;
  if(!url.pathname.startsWith(targetBase)&&!url.pathname.startsWith('/static/'))return Promise.resolve(new Response(JSON.stringify({detail:message}),{status:403,headers:{'Content-Type':'application/json'}}));
  return fetchOriginal(resource instanceof Request?new Request(url,resource):url.toString(),{...options,cache:'no-store',referrerPolicy:'no-referrer'}).then(response=>{
   if(response.status===401&&url.pathname.startsWith(targetBase))location.replace('/demo');
   return response;
  });
 };
 function adapt(){
  document.querySelectorAll('a[href^="/api/"],a[href^="/offline"],a[href^="/account/"]').forEach(a=>a.setAttribute('href',base+a.getAttribute('href')));
  document.querySelectorAll('#halaqatApp button').forEach(b=>{
   if(/^(?:\+\s*)?(?:إضافة|حذف|حفظ|إرسال|رفع|اعتماد|موافقة|رفض|أرشفة|استعادة|تعطيل|إصدار|تسجيل النتيجة|إخفاء التنبيه|معاينة الحذف|معاينة التقرير|التراجع|تم التسميع)/.test(b.textContent.trim())&&!b.disabled){b.disabled=true;b.title=message;b.classList.add('demo-disabled42');}
  });
  document.querySelectorAll('form').forEach(f=>{
   if(f.getAttribute('action')==='/demo/logout'||f.id==='search35')return;
   f.querySelectorAll('button:not([type="button"]),input[type="submit"]').forEach(b=>{
    if(!b.disabled){b.disabled=true;b.title=message;b.classList.add('demo-disabled42');}
   });
  });
 }
 document.addEventListener('submit',e=>{
  if(e.target.getAttribute('action')==='/demo/logout'||e.target.id==='search35')return;
  e.preventDefault();e.stopImmediatePropagation();
 },true);
 document.addEventListener('DOMContentLoaded',()=>{
  adapt();new MutationObserver(adapt).observe(document.body,{childList:true,subtree:true});
  // Open pages also leave the fixture when the owner revokes or the trial ends.
  const check=()=>window.fetch(base+'/api/halaqat/context').catch(()=>{});
  setInterval(check,30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
 });
})();
