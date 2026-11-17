(()=>{
  'use strict';
  const button=document.getElementById('sidebarToggle50'),sidebar=document.getElementById('appSidebar'),scrim=document.getElementById('sidebarScrim50');
  const mobile=window.matchMedia('(max-width: 960px)');
  function drawer(open){
    if(!button||!sidebar||!scrim)return;
    const active=Boolean(open&&mobile.matches);
    document.body.classList.toggle('sidebar-open50',active);
    button.setAttribute('aria-expanded',String(active));
    button.setAttribute('aria-label',active?'إغلاق القائمة':'فتح القائمة');
    scrim.hidden=!active;
    sidebar.inert=mobile.matches&&!active;
    if(active)sidebar.querySelector('a,button,select')?.focus();
  }
  button?.addEventListener('click',()=>drawer(button.getAttribute('aria-expanded')!=='true'));
  scrim?.addEventListener('click',()=>{drawer(false);button?.focus();});
  sidebar?.addEventListener('click',event=>{if(event.target.closest('[data-screen32],a[href]'))drawer(false);});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&document.body.classList.contains('sidebar-open50')){drawer(false);button?.focus();}
    if(event.key==='Tab'&&document.body.classList.contains('sidebar-open50')){
      const nodes=[...sidebar.querySelectorAll('a[href],button:not(:disabled),select:not(:disabled),summary')].filter(node=>!node.hidden&&node.getClientRects().length);
      if(!nodes.length)return;
      const first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  mobile.addEventListener('change',()=>drawer(false));drawer(false);
  window.addEventListener('hashchange',()=>{drawer(false);document.querySelector('.account-menu50')?.removeAttribute('open');});
  document.addEventListener('click',event=>{const menu=document.querySelector('.account-menu50');if(menu?.open&&!menu.contains(event.target))menu.open=false;});
  document.getElementById('notificationToggle50')?.addEventListener('click',()=>{
    const box=document.getElementById('notificationBox'),toggle=document.getElementById('notificationToggle50');
    if(box?.open){box.open=false;toggle.setAttribute('aria-expanded','false');}
    else document.dispatchEvent(new Event('open-notices53'));
  });
  const now=new Date(),date=document.getElementById('headerDate50'),year=document.getElementById('footerYear50');
  if(date)date.textContent=new Intl.DateTimeFormat('ar-SA',{weekday:'long',day:'numeric',month:'long',year:'numeric',calendar:'gregory',timeZone:'Asia/Riyadh'}).format(now);
  if(year)year.textContent=String(now.getFullYear());
})();
