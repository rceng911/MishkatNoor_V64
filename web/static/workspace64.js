// Bind every same-origin fetch to the interface in which the page was opened.
// Old tabs cannot submit practice data into the real workspace after exiting.
(()=>{
 'use strict';
 const marker=document.querySelector('meta[name="workspace36"]')?.content||'live';
 const original=window.fetch.bind(window);
 window.fetch=(resource,options={})=>{
  const url=new URL(resource instanceof Request?resource.url:String(resource),location.href);
  if(url.origin!==location.origin)return original(resource,options);
  const headers=new Headers(options.headers||(resource instanceof Request?resource.headers:undefined));
  headers.set('X-Workspace36',marker);
  return original(resource,{...options,headers});
 };
})();
