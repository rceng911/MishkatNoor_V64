(()=>{
 const symbol=/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
 function check(input){
  const username=input.name==='username'||input.name==='requested_username';
  const password=(['temporary_password','new_password'].includes(input.name)||input.name==='password'&&input.autocomplete==='new-password');
  if(!username&&!password)return;
  let box=input.parentElement.querySelector('.rules32');
  if(!box){box=document.createElement('div');box.className='rules32';box.setAttribute('aria-live','polite');input.after(box);}
  const v=input.value;
  const rules=username?[[v.length>=3&&v.length<=30,'من 3 إلى 30 خانة'],[v.length>0&&!/\s/.test(v),'دون مسافات — استخدم _ بين الأجزاء'],[/^[a-zA-Z0-9_\u0621-\u063A\u0641-\u064A\u0660-\u0669\u0671\u06F0-\u06F9]+$/.test(v),'عربي أو إنجليزي أو أرقام أو _ فقط']]:[[v.length>=8,'8 أحرف على الأقل'],[/[A-Z]/.test(v),'حرف كبير'],[/[a-z]/.test(v),'حرف صغير'],[symbol.test(v),'رمز خاص']];
  box.replaceChildren(...rules.map(([ok,label])=>{const s=document.createElement('small');s.className=ok?'rule-ok':'rule-pending';s.textContent=(ok?'✓ ':'○ ')+label;return s;}));
  input.setCustomValidity(v&&!rules.every(x=>x[0])?'أكمل الشروط الموضحة أسفل الحقل':'');
 }
 document.addEventListener('input',e=>{if(e.target instanceof HTMLInputElement)check(e.target);});
 const scan=()=>document.querySelectorAll('input').forEach(check);
 new MutationObserver(changes=>{if(changes.some(c=>[...c.addedNodes].some(n=>n.nodeType===1&&(n.matches('input,form')||n.querySelector('input')))))scan();}).observe(document.body,{childList:true,subtree:true});scan();
})();
