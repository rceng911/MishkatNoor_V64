// Included inside the authenticated workspace through window.Mishkat64.
window.Mishkat64=(()=>{
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const normalize=v=>String(v).trim().replace(/[أإآ]/g,'ا').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[:،]/g,' ').replace(/\s+/g,' ');
 const names={saved:'الحفظ الذي تم تسميعه',review:'المراجعة التي تم تسميعها',next_saved:'حفظ اللقاء القادم',next_review:'مراجعة اللقاء القادم'};
 function recitation(form,catalog,counts,details,previous){
  const group=document.createElement('section');group.className='passages64';
  const fmt=(s,a)=>catalog[s-1]+' '+a;
  function parse(v){
   const match=normalize(v).match(/^(.+?)\s+(\d+)$/);
   if(!match)return null;
   const s=/^\d+$/.test(match[1])?Number(match[1]):catalog.findIndex(x=>normalize(x)===match[1])+1,a=Number(match[2]);
   return s&&a>=1&&a<=counts[s-1]?[s,a]:null;
  }
  group.innerHTML='<h3>سجل التسميع والورد القادم</h3>'+Object.entries(names).map(([k,title])=>{
   const val=details[k];return '<fieldset><legend>'+title+'</legend>'+['من','إلى'].map((label,i)=>{
    const id='verse64_'+k+i;
    return '<label>'+label+' (السورة والآية)<input autocomplete="off" list="'+id+'" data-end="'+k+i+'" placeholder="مثال: البقرة ٢٥" value="'+escape(val?fmt(i?val.end_surah:val.surah,i?val.end_ayah:val.ayah):'')+'"><datalist id="'+id+'"></datalist></label>';
   }).join('')+(previous[k==='saved'?'next_saved':k==='review'?'next_review':'']?'<button type="button" data-prev="'+k+'">استخدام ورد اللقاء السابق</button>':'')+'</fieldset>';
  }).join('')+'<details><summary>اعتماد أجزاء كاملة يدويًا</summary><p>اختر الأجزاء التي تأكدت من إتمامها. يُسجّل إنجاز عند كل جزأين مختلفين.</p>'+Array.from({length:30},(_,i)=>'<label><input type="checkbox" data-part="'+(i+1)+'" '+((details.manual||[]).includes(i+1)?'checked':'')+'> الجزء '+(i+1)+'</label>').join(' ')+'</details>';
  form.querySelector('.recitation-details52').before(group);
  function options(input){
   input.setCustomValidity('');
   const q=normalize(input.value),num=q.match(/\d+$/)?.[0]||'',name=q.replace(/\d+$/,'').trim();
   const list=catalog.flatMap((s,i)=>{
    if(!(normalize(s).includes(name)||name===String(i+1)))return [];
    if(!num)return [fmt(i+1,1)];
    return Number(num)>0&&Number(num)<=counts[i]?[fmt(i+1,Number(num))]:[];
   });
   input.list.innerHTML=list.map(v=>'<option value="'+escape(v)+'"></option>').join('');
  }
  group.querySelectorAll('[data-end]').forEach(el=>{options(el);el.oninput=()=>options(el);});
  group.querySelectorAll('[data-prev]').forEach(b=>b.onclick=()=>{const k=b.dataset.prev,v=previous[k==='saved'?'next_saved':'next_review'];[fmt(v.surah,v.ayah),fmt(v.end_surah,v.end_ayah)].forEach((val,i)=>{const el=group.querySelector('[data-end="'+k+i+'"]');el.value=val;options(el);});});
  return ()=>{
   const result={manual:[...group.querySelectorAll('[data-part]:checked')].map(e=>Number(e.dataset.part))};
   for(const k of Object.keys(names)){
    const [a,b]=[0,1].map(i=>group.querySelector('[data-end="'+k+i+'"]'));
    if(!a.value&&!b.value){result[k]=null;continue;}
    const first=parse(a.value),last=parse(b.value);
    if(!first||!last||first[0]*1000+first[1]>last[0]*1000+last[1])throw Error('تحقق من البداية والنهاية في «'+names[k]+'» بكتابة اسم السورة ورقم الآية.');
    result[k]={surah:first[0],ayah:first[1],end_surah:last[0],end_ayah:last[1]};
   }
   return result;
  };
 }
 const num=n=>Number(n||0).toLocaleString('ar-SA',{maximumFractionDigits:2});
 const rating=n=>n==null?'لا يوجد تقييم':num(n)+' / ١٠';
 const pct=n=>n==null?'لا توجد بيانات كافية':num(n)+'٪';
 function report(data,mosque){
  const t=data.total;
  const leaders=xs=>xs.map(x=>escape(x.name)+' ('+escape(x.position||'الموضع غير مسجل')+')').join('، ')||'لا توجد بيانات كافية';
  return '<h2>تقرير '+escape(mosque)+'</h2><p>'+escape(data.start)+' — '+escape(data.end)+'</p><p>النطاق المحدد · النقاط '+num(t.points)+' · متوسط التقييم '+rating(t.grade)+' · الحضور '+pct(t.attendance)+' · إنجاز الورد المخطط '+pct(t.progress)+'</p><small>نسبة الحضور من الحاضرين والمستأذنين والغائبين دون عذر. تقدم الحفظ هو نسبة آيات ورد اللقاء السابق التي سمّعها الطالب في اللقاء التالي المسجّل بحضور. ترتيب الطلاب بمجموع النقاط خلال الفترة بين من لديهم تقييم معتمد.</small>'+data.rings.map(r=>'<section><h3>'+escape(r.name)+'</h3><p>حاضر '+num(r.present)+' · مستأذن '+num(r.permission)+' · غائب '+num(r.absent)+' · بعذر '+num(r.excused)+' · لم يُحضّر '+num(r.unmarked)+'</p><p>نقاط الطلاب '+num(r.points)+' · تقييم الحلقة '+rating(r.grade)+' · إنجاز الورد '+pct(r.progress)+'</p><p>الأعلى نقاطًا: '+leaders(r.highest)+'<br>الأقل نقاطًا: '+leaders(r.lowest)+'<br>أكثر آيات حفظ جديدة موثّقة: '+leaders(r.most_saved)+'<br>أقل آيات حفظ جديدة موثّقة: '+leaders(r.least_saved)+'</p><div class="table-wrap"><table class="data-table"><thead><tr>'+['الطالب','الحضور / الاستئذان','الغياب / بعذر','الحفظ','المراجعة','إنجاز الورد','آخر موضع حفظ','التقييم','النقاط','إنجاز الأجزاء في الفترة'].map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+r.students.map(s=>'<tr>'+[escape(s.name),num(s.present)+' / '+num(s.permission),num(s.absent)+' / '+num(s.excused),num(s.saved_ayah)+' آية · '+num(s.saved_page)+' وجه',num(s.review_ayah)+' آية · '+num(s.review_page)+' وجه',pct(s.progress),escape(s.position||'غير مسجل'),rating(s.grade),num(s.points),s.milestones.map(x=>num(x.count)+' أجزاء · '+escape(x.day)).join('<br>')||'—'].map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></section>').join('');
 }
 function printReport(html){
  const w=window.open('','_blank');if(!w)throw Error('اسمح بفتح نافذة الطباعة.');
  w.document.write('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>تقرير الحلقات</title><link rel="stylesheet" href="/static/period64.css"><main>'+html+'</main></html>');w.onload=()=>w.print();w.document.close();
 }
 return {recitation,report,printReport};
})();
