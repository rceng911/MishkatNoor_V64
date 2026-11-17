(()=>{
'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles={owner:'المالك',halaqa_supervisor:'مشرف الحلقات',halaqa_teacher:'المدرس',halaqa_student:'الطالب / ولي الأمر'};
const states={pending:'بانتظار المالك',approved:'تم التفعيل',rejected:'مرفوض',returned:'مُعاد للاستكمال'},attendance={present:'حاضر',absent:'غائب',excused:'غائب بعذر',permission:'مستأذن'};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh'}).format(new Date());
const dateTime46=value=>new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Riyadh'}).format(new Date(value));
let mid=0,data=null,file=null,sid=0,busy=false,portalView='owner',monitor=null,follow=null,accessOverview=null;
const status=t=>{const node=$('#halaqatStatus');if(node)node.textContent=t;},base=()=>'/api/halaqat/mosques/'+mid;
async function api(path,body,method='POST'){
 const r=await fetch(path,{cache:'no-store',headers:{'X-Portal-View':portalView},...(body!==undefined?{method,headers:{'Content-Type':'application/json','X-Portal-View':portalView},body:JSON.stringify(body)}:{})});let d;
 try{const raw=(await r.text()).replace(/^\uFEFF/,'').trim();d=raw?JSON.parse(raw):{};}catch{
  if(r.redirected){const target=new URL(r.url,location.href);if(target.origin===location.origin&&/\/(login|logout)\/?$/.test(target.pathname)){location.assign(target.href);throw Error('انتهت الجلسة؛ جارٍ تحويلك لتسجيل الدخول.');}}
  throw Error('تعذر تحميل بيانات النظام؛ وصل رد غير متوقع من الخادم (HTTP '+r.status+'). أعد المحاولة، وإذا تكرر الخطأ فراجع اتصال الخادم.');
 }
 if(!r.ok){if(d.redirect)location.assign(d.redirect);throw Error(typeof d.detail==='string'?d.detail:Array.isArray(d.detail)?d.detail.map(x=>x.msg).join('، '):'تعذر إتمام الطلب');}return d;
}
function friendlyError46(error){const message=String(error?.message||'').trim();if(/failed to fetch|networkerror|load failed|network request failed/i.test(message))return 'تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت ثم حدّث الشاشة.';if(/unexpected token|not valid json|json parse/i.test(message))return 'تعذر قراءة البيانات من الخادم. حدّث الشاشة، وإذا تكرر الخطأ فتواصل مع الدعم الفني.';if(/cannot (read|set) propert(y|ies) of (null|undefined)|cannot read properties of null/i.test(message))return 'تعذر عرض أحد أقسام الصفحة. حدّث الشاشة، وإذا تكرر الخطأ فتواصل مع الدعم الفني.';return message||'تعذر إتمام العملية. حدّث الشاشة أو تواصل مع الدعم الفني.';}
async function run(fn){if(busy)return;busy=true;document.documentElement.setAttribute('aria-busy','true');$('#toast20')?.remove();status('جارٍ التنفيذ…');document.querySelectorAll('button').forEach(x=>x.disabled=true);try{await fn();}catch(e){const message=friendlyError46(e);status(message);showError20(message);}finally{busy=false;document.documentElement.removeAttribute('aria-busy');document.querySelectorAll('button').forEach(x=>x.disabled=x.hasAttribute('data-unavailable34')||x.classList.contains('demo-disabled42'));}}
const button=(label,attr)=>'<button type="button" class="halaqat-btn" '+attr+'>'+label+'</button>';
const panel=(title,body)=>'<details class="halaqat-panel v25-accordion"><summary><span>'+title+'</span></summary><h2 class="v25-panel-title">'+title+'</h2><div class="v25-panel-body">'+body+'</div></details>';
const fieldHints33={username:'يقبل العربية والإنجليزية والأرقام. استخدم _ بدل المسافات.',temporary_password:'كلمة مؤقتة يسلمها المشرف بعد موافقة المالك. يجب تغييرها عند أول دخول.',phone:'رقم الجوال للتواصل مع الطالب أو ولي الأمر.',guardian_phone:'رقم ولي الأمر الذي تصله متابعة الطالب.',school_grade:'مثال: الصف السادس الابتدائي.',current_memorization:'اكتب آخر سورة أو جزء يحفظه الطالب.',schedule:'مثال: الأحد إلى الخميس، بعد صلاة العصر.'};
const input=(name,label,value='',type='text',required=true,attrs='')=>'<label class="field33"><span class="field-label33">'+label+(required&&type!=='hidden'?'<span class="required33" aria-label="مطلوب"> *</span>':'')+'</span><input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+(required?'required':'')+' '+attrs+(!attrs.includes('placeholder=')&&name==='username'?' placeholder="مثال: محمد_أحمد"':'')+'>'+(fieldHints33[name]?'<small class="field-hint33">'+fieldHints33[name]+'</small>':'')+'</label>';
const select=(name,label,options,value='',required=true)=>'<label class="field33"><span class="field-label33">'+label+(required?'<span class="required33" aria-label="مطلوب"> *</span>':'')+'</span><select name="'+name+'" '+(required?'required':'')+'>'+options.map(([v,t])=>'<option value="'+esc(v)+'" '+(String(value)===String(v)?'selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label>';
const multiSelect=(name,label,options)=>'<label class="field33"><span class="field-label33">'+label+'<span class="required33" aria-label="مطلوب"> *</span></span><select name="'+name+'" multiple required size="'+Math.min(Math.max(options.length,2),6)+'">'+options.map(([v,t])=>'<option value="'+esc(v)+'">'+esc(t)+'</option>').join('')+'</select><small class="field-hint33">اختر واحدًا أو أكثر حسب نوع الحساب.</small></label>';
const empty=t=>'<p class="empty">'+t+'</p>',unit=u=>u==='ayah'?'آية':'وجه',ringOpts=()=>[['','اختر الحلقة'],...data.rings.map(r=>[r.id,r.name])];
function credentials(d){$('#halaqatCredentials').hidden=false;$('#halaqatCredentials').innerHTML=d.linked_existing?'<strong>تم اعتماد الطالب وربطه بالحساب المحدد</strong><p>'+esc(d.user?.name)+'</p>'+button('إخفاء','data-hide-credentials'):'<strong>بيانات الدخول — احفظها وسلّمها لصاحب الحساب</strong><p>اسم المستخدم: <code>'+esc(d.user?.username||d.username)+'</code></p><p>الرمز المؤقت: <code>'+esc(d.temporary_password)+'</code></p><p>يجب تغييره عند أول دخول.</p>'+button('إخفاء الرمز','data-hide-credentials');window.scrollTo({top:0,behavior:'smooth'});}
function familyOptions(){return (data.accounts||[]).filter(u=>u.role==='halaqa_student').map(u=>[u.id,u.name+' — '+u.username+(u.children?.length?' — الأبناء: '+u.children.map(c=>c.name).join('، '):'')]);}
function requestDetails(r){if(r.type!=='student')return '';return '<p>ولي الأمر: '+esc(r.guardian_name||'—')+' · '+esc(r.guardian_relation||'—')+' · '+esc(r.guardian_phone||'—')+'</p><p>الحفظ الحالي: '+esc(r.current_memorization||'—')+'</p>';}
let selectedStudentRing='',studentFilterMode='all';
function studentRiskReasons(s){
 const reasons=[];
 if(Number(s.absences_30_days||0)>=3)reasons.push('غياب مرتفع خلال آخر 30 يومًا');
 if(Boolean(s.low_rating))reasons.push('التقييم منخفض');
 if(Boolean(s.repeated_notes))reasons.push('ملاحظات متكررة');
 return reasons;
}
function studentRiskMark(s){
 const reasons=studentRiskReasons(s);return reasons.length?'<span class="student-risk-dot" title="'+esc(reasons.join(' · '))+'" aria-label="يحتاج متابعة: '+esc(reasons.join('، '))+'"></span>':'';
}
function students(){
 if(data.user.role==='halaqa_supervisor')return supervisorList37();
 if(data.user.role==='halaqa_student')return data.students.map(s=>'<div class="student-row"><div><strong>'+s.ring_number+' · '+esc(s.name)+'</strong><small>'+esc(data.rings.find(r=>r.id===s.halaqa_id)?.name||'')+'</small></div>'+button(data.user.account_type==='guardian'?'متابعة الابن':'فتح ملفي','data-file="'+s.id+'"')+'</div>').join('')||empty('لا يوجد ملف مرتبط بحسابك بعد.');
 if(!data.rings.length)return empty('لا توجد حلقات متاحة بعد.');
 if(!data.rings.some(r=>String(r.id)===selectedStudentRing))selectedStudentRing='';
 const cards=data.students.map(s=>{
  const optional=[!s.has_national_id?'رقم الهوية':'',!s.birth_date?'تاريخ الميلاد':'',!s.school_grade?'الصف الدراسي':''].filter(Boolean);
  const phone=s.guardian_phone||'';
  const risk=studentRiskReasons(s);
  return '<div class="student-row v30-student-row" data-student-ring="'+s.halaqa_id+'" data-student-name="'+esc(s.name)+'" data-high-absence="'+(s.absences_30_days>=3)+'" data-low-rating="'+Boolean(s.low_rating)+'" data-repeated-notes="'+Boolean(s.repeated_notes)+'" hidden><div><strong>'+studentRiskMark(s)+s.ring_number+' · '+esc(s.name)+'</strong>'+(risk.length?'<small class="risk-reasons">'+esc(risk.join(' · '))+'</small>':'')+'<small>'+esc(s.recipient_type==='guardian'?'ولي الأمر: '+(s.guardian_name||'غير مسجل'):'الحساب للطالب')+'</small><small>جوال التواصل: '+(phone?'<bdi>'+esc(phone)+'</bdi>':'غير مسجل')+'</small>'+(s.avg_score!=null?'<small>متوسط التقييم: '+esc(s.avg_score)+'/10</small>':'')+'</div>'+button('فتح ملف الطالب','data-file="'+s.id+'"')+(data.user.role==='owner'?button('أرشفة الطالب','data-student-archive="'+s.id+'" data-active="false"'):'')+'</div>';
 }).join('');
 const exports=['owner','halaqa_supervisor'].includes(data.user.role)?'<div class="student-export-actions"><strong>تصدير بيانات الطلاب</strong><div class="actions"><a class="halaqat-btn secondary" href="'+base()+'/exports/students-basic.xlsx?view='+portalView+'">البيانات الأساسية Excel</a><a class="halaqat-btn secondary" href="'+base()+'/exports/students-evaluations.xlsx?view='+portalView+'">التقييمات والحضور Excel</a></div><small>ملف للبيانات الأساسية وملف مستقل للتقييمات والحضور والحفظ والتسميع والملاحظات.</small></div>':'';
 return exports+'<label>اختر الحلقة<select id="studentRingFilter"><option value="">اختر الحلقة لعرض تفاصيلها وطلابها</option>'+data.rings.map(r=>'<option value="'+r.id+'" '+(selectedStudentRing===String(r.id)?'selected':'')+'>'+esc(r.name)+'</option>').join('')+'</select></label><div id="selectedRingWorkspace"></div><div class="student-filters">'+button('جميع الطلاب','data-student-filter="all"')+button('ملاحظات متكررة','data-student-filter="notes"')+button('تقييم منخفض','data-student-filter="low"')+button('كثيرو الغياب','data-student-filter="absence"')+'</div><label>بحث داخل الحلقة<input id="studentSearch" type="search" placeholder="اكتب اسم الطالب"></label><p id="studentListHint">اختر الحلقة لعرض طلابها.</p><div>'+cards+'</div>';
}
function filterStudentList(){
 const select=$('#studentRingFilter');if(!select)return;selectedStudentRing=select.value;
 const overview=$('#selectedRingWorkspace');if(overview&&overview.dataset.ring!==selectedStudentRing){overview.dataset.ring=selectedStudentRing;renderSelectedRing();}
 const query=($('#studentSearch')?.value||'').trim();let count=0;
 document.querySelectorAll('[data-student-ring]').forEach(row=>{const flag=studentFilterMode==='all'||(studentFilterMode==='notes'&&row.dataset.repeatedNotes==='true')||(studentFilterMode==='low'&&row.dataset.lowRating==='true')||(studentFilterMode==='absence'&&row.dataset.highAbsence==='true');row.hidden=(!!selectedStudentRing&&row.dataset.studentRing!==selectedStudentRing)||!row.dataset.studentName.includes(query)||!flag;if(!row.hidden)count++;});
 const hint=$('#studentListHint');if(hint)hint.textContent=count?'عدد الطلاب: '+count:'لا يوجد طلاب مطابقون للبحث.';
}

function circleCalendar(rows){const manager=['owner','halaqa_supervisor'].includes(data.user.role);return rows.map(c=>'<article class="halaqat-card"><h3>'+esc(c.name)+'</h3><p>'+(c.configured?c.weekdays.map(d=>dayNames[d]).join('، ')||'لا توجد لقاءات أسبوعية':'لم يحدد الجدول بعد')+' · '+esc(c.time_text)+'</p><p>اليوم: '+(c.today_held?'يوجد لقاء':'لا يوجد لقاء محدد')+'</p>'+c.exceptions.map(x=>'<p>'+x.day+' · '+(x.held?'لقاء استثنائي':'إجازة / إلغاء')+' · '+esc(x.reason)+(manager?button('إزالة الاستثناء','data-calendar-remove="'+c.id+'" data-day="'+x.day+'"'):'')+'</p>').join('')+(manager?fold('تعديل الجدول والإجازات',form15('calendarForm'+c.id,'<fieldset><legend>أيام اللقاءات</legend>'+dayNames.map((d,i)=>'<label class="toggle-label"><input name="weekdays" type="checkbox" value="'+i+'" '+(c.weekdays.includes(i)?'checked':'')+'>'+d+'</label>').join('')+'</fieldset>'+input('time_text','وقت الحلقة',c.time_text,'text',false,'maxlength="100"')+'<button>حفظ الجدول</button>','data-kind="calendar" data-ring="'+c.id+'"')+form15('exceptionForm'+c.id,input('day','تاريخ الاستثناء',today(),'date')+select('held','نوع الاستثناء',[['false','إجازة أو إلغاء اللقاء'],['true','إضافة لقاء استثنائي']])+input('reason','السبب','','text',false,'maxlength="500"')+'<button>حفظ الاستثناء</button>','data-kind="exception" data-ring="'+c.id+'"')):'')+'</article>').join('')||empty('لا توجد حلقات متاحة.');}
function renderSelectedRing(){
 const box=$('#selectedRingWorkspace'),ring=data.rings.find(r=>String(r.id)===selectedStudentRing);if(!box)return;
 if(!ring||data.user.role==='halaqa_student'){box.innerHTML='';return;}
 const role=data.user.role,manager=['owner','halaqa_supervisor'].includes(role);
 const ringStudents=data.students.filter(s=>Number(s.halaqa_id)===Number(ring.id));
 const riskStudents=ringStudents.filter(s=>studentRiskReasons(s).length);
 const announcements=development.announcements.filter(a=>a.halaqa_id===ring.id||a.halaqa_id===null);
 let admin='';
 if(role==='owner'){
  const supervisors=data.supervisors.map(u=>'<label><input type="checkbox" name="supervisor_ids" value="'+u.id+'" '+((ring.supervisor_ids||[]).includes(u.id)?'checked':'')+'> '+esc(u.name)+'</label>').join('')||'<small>لا يوجد مشرفون.</small>';
  const teachers=data.accounts.filter(u=>['halaqa_teacher','halaqa_supervisor'].includes(u.role)&&u.active).map(u=>'<label><input type="checkbox" name="teacher_ids" value="'+u.id+'" '+((ring.teacher_ids||[]).includes(u.id)?'checked':'')+'> '+esc(u.name)+'</label>').join('')||'<small>لا يوجد مدرسون فعالون. أنشئ الحساب أولًا من «الحسابات والمستخدمون».</small>';
  admin='<details class="ring-admin-box"><summary>تعديل الحلقة والمعلم والجدول</summary><form data-manage="ring" data-id="'+ring.id+'" class="halaqat-form">'+input('name','اسم الحلقة',ring.name)+input('schedule','وصف الأيام والموعد',ring.schedule,'text',false)+'<fieldset><legend>المشرفون</legend>'+supervisors+'</fieldset><fieldset><legend>المدرسون</legend>'+teachers+'</fieldset><button>حفظ تعديلات الحلقة</button></form>'+fold('الأيام والإجازات والاستثناءات',circleCalendar(development.calendars.filter(c=>c.id===ring.id)))+button('حذف الحلقة نهائيًا','data-delete-ring="'+ring.id+'"')+'<div id="deleteRing'+ring.id+'"></div></details>';
 }else if(role==='halaqa_supervisor'&&accessOverview){
  admin='<details class="ring-admin-box"><summary>تعديل الحلقة</summary><form class="halaqat-form" data-access="change-ring">'+select('ring_id','الحلقة',[[ring.id,ring.name]],ring.id)+input('name','اسم الحلقة',ring.name)+input('schedule','وصف الموعد',ring.schedule,'text',false)+input('reason','سبب التعديل')+'<button>حفظ بيانات الحلقة</button></form><form class="halaqat-form" data-access="change-teachers">'+select('ring_id','الحلقة',[[ring.id,ring.name]],ring.id)+multiSelect('teacher_ids','المدرسون',accessOverview.teachers.map(x=>[x.id,x.name]))+input('reason','سبب تغيير المدرس')+'<button>رفع طلب تغيير المدرس</button></form>'+fold('الأيام والإجازات والاستثناءات',circleCalendar(development.calendars.filter(c=>c.id===ring.id)))+'</details>';
 }
 const risks=riskStudents.length?'<div class="ring-risk-list"><strong>يحتاجون متابعة</strong>'+riskStudents.map(s=>'<button type="button" class="risk-chip" data-file="'+s.id+'">'+studentRiskMark(s)+s.ring_number+' · '+esc(s.name)+'</button>').join('')+'</div>':'<p class="ring-ok">لا توجد مؤشرات غياب مرتفع أو تقييم منخفض أو ملاحظات متكررة في هذه الحلقة.</p>';
 box.innerHTML='<section class="ring-overview v30-ring-center"><div class="ring-title-row"><div><small>مركز الحلقة</small><h3>'+esc(ring.name)+'</h3><p>'+esc(ring.schedule||'لم يحدد وصف الموعد')+'</p></div><span class="ring-count">'+ring.student_count+' طالب</span></div><p>المعلم: '+esc((ring.teachers||[]).map(x=>x.name).join('، ')||'غير محدد')+' · المشرف: '+esc((ring.supervisors||[]).map(x=>x.name).join('، ')||'غير محدد')+'</p><div class="ring-metrics"><span>الإنجاز <b>'+Number(ring.completion_rate||0)+'%</b></span><span>الحضور <b>'+Number(ring.attendance_rate||0)+'%</b></span><span>الغياب <b>'+Number(ring.absence_rate||0)+'%</b></span></div>'+risks+'<div class="actions"><a class="halaqat-btn secondary" target="_blank" href="'+base()+'/rings/'+ring.id+'/roster">طباعة كشف الطلاب</a><a class="halaqat-btn secondary" href="'+base()+'/rings/'+ring.id+'/roster.csv">تصدير CSV</a></div>'+(manager?button(role==='owner'?'+ إضافة طالب':'رفع طلب إضافة طالب','data-enroll31="'+ring.id+'"')+'<div id="enrollment31"></div>':'')+admin+'<details class="ring-communication"><summary>إعلانات وتواصل الحلقة</summary>'+(announcements.map(a=>'<article class="halaqat-card"><strong>'+esc(a.title)+'</strong><small>'+esc(a.ring)+(a.expires?' · حتى '+esc(a.expires):'')+'</small><p class="preserve-lines">'+esc(a.body)+'</p>'+(a.can_archive?button('أرشفة الإعلان','data-announcement-archive="'+a.id+'"'):'')+'</article>').join('')||empty('لا توجد إعلانات حالية لهذه الحلقة.'))+(role==='halaqa_supervisor'?fold('إضافة إعلان للحلقة',form15('ringAnnouncementForm','<input type="hidden" name="halaqa_id" value="'+ring.id+'">'+input('title','عنوان الإعلان','','text',true,'minlength="2" maxlength="180"')+textArea('body','نص الإعلان')+input('expires','ينتهي في (اختياري)','','date',false)+'<button>نشر الإعلان</button>')):'')+'</details></section><h3 class="students-heading">طلاب الحلقة</h3>';
}
function rings(){return data.rings.length?'<div class="rings-grid">'+data.rings.map(ringCard50).join('')+'</div>':empty('لا توجد حلقات مرتبطة بهذا الحساب حاليًا.');}
function recentAbsences(){const since=new Date();since.setDate(since.getDate()-29);const cutoff=since.toISOString().slice(0,10),rows=data.students.map(s=>({...s,absences:data.progress.filter(p=>p.student_id===s.id&&p.attendance==='absent'&&p.day>=cutoff).length})).filter(s=>s.absences>=3);return rows.length?rows.map(s=>'<div class="student-row"><span>'+esc(s.name)+' · '+s.absences+' أيام غياب</span>'+button('متابعة الملف','data-file="'+s.id+'"')+'</div>').join(''):empty('لا يوجد طالب سجل 3 أيام غياب أو أكثر خلال آخر 30 يومًا.');}
function renderBaseDashboard(){
 const role=data.user.role;$('#halaqatStats').innerHTML=[['الحلقات',data.stats.rings],['الطلاب',data.stats.students],['طلبات معلقة',data.stats.pending_requests]].map(([t,v])=>'<div class="halaqat-stat"><span>'+t+'</span><b>'+v+'</b></div>').join('');
 if(role==='halaqa_student'){$('#halaqatWorkspace').innerHTML='<div class="halaqat-grid family-dashboard">'+panel(data.user.account_type==='guardian'?'أبنائي وملفاتهم':'ملفي كطالب',students())+'</div>';return;}
 let s='';
 let ringBody=rings();
 if(role==='owner'||role==='halaqa_supervisor')ringBody+=fold('إضافة حلقة جديدة','<form id="ringForm" class="halaqat-form">'+input('name','اسم الحلقة','','text',true,'minlength="2" maxlength="180"')+input('schedule','أيام الحلقة ووقتها','','text',false)+(role==='owner'?multiSelect('supervisor_ids','مشرفو الحلقة',data.supervisors.map(x=>[x.id,x.name])):'')+'<button>حفظ الحلقة</button></form>');
 ringBody+='<hr class="v30-separator">'+students();
 s+=panel('الحلقات والطلاب',ringBody);
 $('#halaqatWorkspace').innerHTML='<div class="halaqat-grid">'+s+'</div>';
}
function applyV22RoleUI(isFile=false){
 const role=data?.user?.role;if(!role)return;
 let allow=null;
 if(role==='halaqa_teacher')allow=isFile?[/بيانات الطالب/,/تسجيل التسميع/,/سجل الحضور/,/الورد القادم/,/تحديد ورد جديد/,/خطة الحفظ/,/الإنجاز الأسبوعي/,/الاختبارات/,/خريطة إنجاز/,/اعتذارات الغياب/,/إنشاء اختبار منظم/,/خطة الختم/,/إعداد هدف الختم/,/أخطاء التسميع/,/المراجعة/]:[/الحلقات والطلاب/,/التحضير الجماعي/,/دور التسميع/,/المسابقات والتكريم/,/مراسلات/];
 if(role==='halaqa_student')allow=isFile?[/بيانات الطالب/,/سجل الحضور/,/الورد القادم/,/خطة الحفظ/,/الإنجاز الأسبوعي/,/الاختبارات/,/خريطة إنجاز/,/اعتذارات الغياب/,/خطة الختم/]:[/أبنائي/,/ملفي كطالب/];
 if(!allow)return;
 const root=$(isFile?'#studentFile':'#halaqatWorkspace');if(!root)return;
 root.querySelectorAll('.halaqat-panel').forEach(p=>{const title=(p.querySelector('h2')?.textContent||'').trim();p.hidden=!allow.some(rx=>rx.test(title));});
}
async function load(initialRoute){
 const root=$('#halaqatApp');
 root.classList.add('loading60');
 root.classList.remove('file-open');
 $('#studentFile').hidden=true;
 status('جارٍ تحميل بيانات المجمع…');
 try{
 const dashboard=await api(base()+'/dashboard');
 const owner=dashboard.user.role==='owner';
 const manager=owner||dashboard.user.role==='halaqa_supervisor';
 const [monitorData,developmentData,learning,contests]=await Promise.all([
   api(base()+'/monitor'),api(base()+'/development'),api(base()+'/learning-dashboard'),api(base()+'/competitions')
 ]);
 const [organizations,teachers,supervisors,access]=await Promise.all([
   owner?api('/api/halaqat/organizations/overview'):null,owner?api(base()+'/teachers/manage'):null,
   owner?api(base()+'/supervisors/manage'):null,manager?api('/api/access/mosques/'+mid+'/overview'):null
 ]);
 data=dashboard;monitor=monitorData;development=developmentData;learningData=learning;contestData=contests.competitions;
 orgOverview=organizations;managementTeachers=teachers?.teachers||[];managementSupervisors=supervisors?.supervisors||[];accessOverview=access;
 $('#halaqatWorkspace').hidden=false;
 renderDashboard();renderAccessManagement();renderLearningDashboard();renderManagement();await renderAdvancedDashboard();await mount31();await mount32();applyV22RoleUI(false);organize20('halaqatWorkspace',false);applyV25CommunicationGroup();compact32();await loadPersonal33();await mount34();await mount35();await mount37();await mount38();mount41();await mountDemoAdmin42();mount43();await mountStaff50();mountDirectory63();filterStudentList();$('#studentFile').hidden=true;const accountLabel=data.user.role==='halaqa_student'?(data.user.account_type==='guardian'?'ولي الأمر':'الطالب'):roles[data.user.role];status(accountLabel+' · '+data.user.name+' · تم تحديث البيانات');
 if(initialRoute){
  const [page,token,section]=initialRoute.split('/');
  const id=Number(token);
  if(page==='student'&&data.user.role!=='owner'&&data.students.some(student=>student.id===id)){
   await openFile(id,false);
   if(section&&data.user.role!=='halaqa_supervisor')showStudent32(section);
  }else if(page==='personal-child'&&data.user.role==='halaqa_student'&&data.students.some(student=>student.id===id)){
   await openChildPersonal33(id);
  }else if(screens32.has(initialRoute)){
   navigate32(initialRoute);
  }
 }
 }catch(error){
  $('#halaqatWorkspace').hidden=true;
  $('#studentFile').hidden=true;
  throw error;
 }finally{root.classList.remove('loading60');}
}
function quantity(prefix,title,u='page',amount=1){const preset=u==='ayah'?'ayah':[.5,1,2].includes(Number(amount))?String(amount):'custom';return '<fieldset class="quantity"><legend>'+title+'</legend>'+select(prefix+'_preset','المقدار',[['0.5','نصف وجه'],['1','وجه واحد'],['2','وجهان'],['custom','عدد أوجه مخصص'],['ayah','عدد آيات محدد']],preset)+input(prefix+'_amount','العدد',amount,'number',true,'min="0.5" max="1000" step="0.5"')+'</fieldset>';}
function planEditor(){const p=file.plan||{memorization_unit:'page',memorization_amount:1,revision_unit:'page',revision_amount:2,sessions_per_week:5};return '<form id="planForm" class="halaqat-form"><div class="halaqat-form-grid">'+quantity('memorization','الحفظ لكل لقاء',p.memorization_unit,p.memorization_amount)+quantity('revision','المراجعة لكل لقاء',p.revision_unit,p.revision_amount)+input('sessions_per_week','عدد اللقاءات أسبوعيًا',p.sessions_per_week,'number',true,'min="1" max="7"')+input('start_surah','سورة البداية',p.start_surah||'','text',false)+input('start_ayah','آية البداية',p.start_ayah||'','number',false,'min="1" max="286"')+input('end_surah','سورة النهاية',p.end_surah||'','text',false)+input('end_ayah','آية النهاية',p.end_ayah||'','number',false,'min="1" max="286"')+input('notes','تعليمات الخطة',p.notes||'','text',false)+'</div><button>حفظ خطة الطالب</button></form>';}
function planSummary(){const p=file.plan;if(!p)return empty('لم يحدد المدرس خطة بعد.');return '<p>الحفظ: <strong>'+p.memorization_amount+' '+unit(p.memorization_unit)+'</strong> لكل لقاء</p><p>المراجعة: <strong>'+p.revision_amount+' '+unit(p.revision_unit)+'</strong> لكل لقاء</p><p>'+p.sessions_per_week+' لقاءات أسبوعيًا</p><p>'+esc(p.start_surah)+' '+esc(p.start_ayah??'')+' — '+esc(p.end_surah)+' '+esc(p.end_ayah??'')+'</p><p>'+esc(p.notes)+'</p>';}
function progressForm(){return '<div class="evaluation-steps52"><span>١ · حفظ الحضور</span><span>٢ · التقييم والملاحظات</span></div><p class="teacher-reminder52">الرجاء الالتزام بتسجيل ملاحظاتك على الطالب وتقييم حفظه وتلاوته وتجويده وترتيله بعد التحضير.</p><form id="progressForm" class="halaqat-form"><div class="halaqat-form-grid">'+input('day','اليوم',today(),'date',true,'max="'+today()+'"')+select('attendance','الحضور',Object.entries(attendance),'present')+'</div><button>حفظ الحضور والمتابعة للتقييم</button></form><section id="dailyEvaluation52" aria-live="polite"></section>';}
let criteria60=null;
const scoreFields52=[['behavior_score','السلوك واللبس والترتيب والهدوء'],['memorization_score','أداء الورد (الحفظ والمراجعة)'],['tajweed_score','التجويد'],['recitation_score','التلاوة'],['tarteel_score','الترتيل'],['plan_commitment_score','الالتزام بالخطة والإنجاز']];
let evaluationRequest52=0;
function evaluationBase52(){return '/api/v52/mosques/'+mid+'/students/'+sid;}
function scorePreview52(){const f=$('#dailyEvaluationForm52');if(!f)return;const values=scoreFields52.map(([key])=>f.elements[key].value);const target=f.querySelector('output');if(values.some(v=>v===''||!Number.isInteger(Number(v))||Number(v)<0||Number(v)>10)){target.textContent='أكمل الدرجات لحساب المجموع';return;}const [behavior,mem,tajweed,recitation,tarteel,plan]=values.map(Number),total=criteria60?criteria60.reduce((n,x)=>n+Math.round(({attendance:10,wird:mem,quality:(tajweed+recitation)/2,behavior,memorization_score:mem,plan_commitment_score:plan,tajweed_score:tajweed,recitation_score:recitation,tarteel_score:tarteel}[x.source])*x.weight*10)/100,0):2+behavior*.3+(mem+tajweed+recitation+tarteel)*.1+plan*.1;target.textContent=Number(total.toFixed(2))+' / 10';}
async function mountEvaluation52(day=today()){
 const target=$('#dailyEvaluation52');if(!target||!file?.can_edit)return;
 const sequence=++evaluationRequest52,currentSid=sid;target.innerHTML='<p>جارٍ تحميل التقييم…</p>';
 let result;try{result=await api(evaluationBase52()+'/evaluation/'+encodeURIComponent(day));}catch(error){if(sequence!==evaluationRequest52||currentSid!==sid||!target.isConnected)return;target.innerHTML='<p class="small-note">تعذر تحميل التقييم؛ أعد اختيار اليوم للمحاولة مجددًا.</p>';throw error;}
 if(sequence!==evaluationRequest52||currentSid!==sid||!target.isConnected)return;
 const attendanceForm=$('#progressForm');if(attendanceForm){attendanceForm.elements.day.value=day;attendanceForm.elements.attendance.value=result.progress?.attendance||'present';}
 criteria60=result.rules60;const e=result.evaluation,p=result.progress||{},plan=file.plan||{};
 if(result.can_evaluate_day===false&&day<result.activated_on){renderLegacyProgress52(target,p,day,plan);return;}
 if(e.state==='attendance_required'){target.innerHTML='<p class="small-note">احفظ حضور الطالب لهذا اليوم أولًا، ثم يظهر نموذج التقييم.</p>';return;}
 if(e.state==='not_applicable'){target.innerHTML='<p class="small-note">تم حفظ الحالة: '+esc(attendance[p.attendance]||'')+'. يُسجّل الغياب بحالته دون تقييم تسميع.</p>';return;}
 target.innerHTML='<h3>تقييم الطالب · '+esc(day)+'</h3><p class="small-note">'+(criteria60?criteria60.map(x=>esc(x.label)+' '+x.weight).join(' + '):'تُطبق قواعد التقييم السابقة لهذا التاريخ.')+' أدخل كل درجة من ٠ إلى ١٠.</p><form id="dailyEvaluationForm52" data-day52="'+esc(day)+'" class="halaqat-form"><div class="score-grid52">'+scoreFields52.map(([key,label])=>input(key,label+' من 10',e[key]??'','number',true,'min="0" max="10" step="1" inputmode="numeric"')).join('')+'</div><div class="score-total52"><span>المجموع التلقائي</span><output></output></div>'+textArea('notes','ملاحظات المعلم للطالب وولي الأمر',e.notes??p.notes??'',2000)+'<details class="recitation-details52"><summary>تفاصيل الحفظ والمراجعة</summary><div class="halaqat-form-grid">'+input('memorized','ما تم حفظه (السورة والآيات)',p.memorized||'','text',false)+input('memorized_amount','مقدار الحفظ',p.memorized_amount??0,'number',true,'min="0" max="1000" step="0.5"')+select('memorized_unit','وحدة الحفظ',[['page','وجه'],['ayah','آية']],p.memorized_unit||plan.memorization_unit||'page')+input('revision','ما تمت مراجعته',p.revision||'','text',false)+input('revision_amount','مقدار المراجعة',p.revision_amount??0,'number',true,'min="0" max="1000" step="0.5"')+select('revision_unit','وحدة المراجعة',[['page','وجه'],['ayah','آية']],p.revision_unit||plan.revision_unit||'page')+input('mistakes','عدد الأخطاء',p.mistakes??0,'number',true,'min="0" max="1000" step="1"')+'</div></details><div class="actions"><button>'+(e.state==='complete'?'حفظ تعديل التقييم':'اعتماد التقييم والنقاط')+'</button>'+(e.state==='complete'?button('إلغاء التقييم','data-cancel-evaluation52="'+esc(day)+'"'):'')+'</div></form>';
 const dailyForm=target.querySelector('#dailyEvaluationForm52');
 dailyForm.readPassages64=Mishkat64.recitation(dailyForm,studentLearning.surahs,studentLearning.ayah_counts,result.recitation64||{},result.previous_plan||{});
 const standard=criteria60?.length===4&&['attendance','wird','quality','behavior'].every(k=>criteria60.some(x=>x.source===k));
 if(standard&&(e.state!=='complete'||(e.tajweed_score===e.recitation_score&&e.tarteel_score===e.recitation_score&&e.plan_commitment_score===e.memorization_score))){
  const grades=dailyForm.querySelector('.score-grid52');
  grades.hidden=true;
  for(const f of grades.querySelectorAll('input'))f.required=false;
  const keys={wird:['memorization_score','plan_commitment_score'],quality:['tajweed_score','recitation_score','tarteel_score'],behavior:['behavior_score']};
  const rubric=document.createElement('div');rubric.className='unified64';
  for(const item of criteria60){
   if(item.source==='attendance'){rubric.insertAdjacentHTML('beforeend','<p>'+esc(item.label)+' · '+item.weight+' نقاط مسجلة بالتحضير</p>');continue;}
   const fields=keys[item.source],label=document.createElement('label'),choice=document.createElement('select');
   label.textContent=item.label+' (من '+item.weight+')';choice.required=true;choice.add(new Option('اختر النقاط',''));
   for(let n=0;n<=10;n++)choice.add(new Option(String(Number((n*item.weight/10).toFixed(2))),String(n)));
   choice.value=e[fields[0]]??'';
   choice.onchange=()=>{for(const k of fields)dailyForm.elements[k].value=choice.value;scorePreview52();};
   label.append(choice);rubric.append(label);
  }
  grades.before(rubric);
  target.querySelector('.small-note').textContent='اعتمد نقاط كل بند. مجموعها هو التقييم اليومي من ١٠.';
 }
 target.querySelector('#dailyEvaluationForm52 .actions').insertAdjacentHTML('afterbegin','<button type="submit" data-next56>حفظ وانتقال للطالب التالي</button>');
 const note=target.querySelector('[name="notes"]');note.required=true;note.minLength=1;scorePreview52();
}
function renderLegacyProgress52(target,p,day,plan){
 if(!p.id){target.innerHTML='<p class="small-note">هذا التاريخ يسبق تفعيل النقاط اليومية. السجلات السابقة محفوظة في النظام السابق.</p>';return;}
 target.innerHTML='<h3>تصحيح سجل سابق · '+esc(day)+'</h3><p class="small-note">هذا السجل يسبق تفعيل النقاط اليومية. تصحيحه يحفظ درجاته السابقة ولا ينشئ نقاطًا يومية جديدة.</p><form id="legacyProgress52" class="halaqat-form" data-day52="'+esc(day)+'" data-id52="'+p.id+'"><div class="halaqat-form-grid">'+select('attendance','الحضور',Object.entries(attendance),p.attendance)+input('memorized','ما تم حفظه',p.memorized||'','text',false)+input('memorized_amount','مقدار الحفظ',p.memorized_amount??0,'number',true,'min="0" max="1000" step="0.5"')+select('memorized_unit','وحدة الحفظ',[['page','وجه'],['ayah','آية']],p.memorized_unit||plan.memorization_unit||'page')+input('revision','ما تمت مراجعته',p.revision||'','text',false)+input('revision_amount','مقدار المراجعة',p.revision_amount??0,'number',true,'min="0" max="1000" step="0.5"')+select('revision_unit','وحدة المراجعة',[['page','وجه'],['ayah','آية']],p.revision_unit||plan.revision_unit||'page')+input('memorization_score','درجة الحفظ السابقة من 10',p.memorization_score??'','number',false,'min="0" max="10" step="1"')+input('tajweed_score','درجة التجويد السابقة من 10',p.tajweed_score??'','number',false,'min="0" max="10" step="1"')+input('mistakes','عدد الأخطاء',p.mistakes??0,'number',true,'min="0" max="1000" step="1"')+'</div>'+textArea('notes','الملاحظات السابقة',p.notes||'',2000)+input('reason','سبب التصحيح','','text',true,'minlength="3" maxlength="500"')+'<button>حفظ تصحيح السجل السابق</button></form>';
}
document.addEventListener('submit',e=>{if(e.target.id!=='legacyProgress52')return;e.preventDefault();const f=e.target,p=Object.fromEntries(new FormData(f)),reason=p.reason;delete p.reason;p.day=f.dataset.day52;for(const k of ['memorized_amount','revision_amount','mistakes'])p[k]=Number(p[k]);for(const k of ['memorization_score','tajweed_score'])p[k]=p[k]===''?null:Number(p[k]);run(async()=>{await api(api35()+'/students/'+sid+'/progress/'+f.dataset.id52,{progress:p,reason,expected:history35.versions[p.day]},'PUT');await openFile(sid,false,p.day);navigate32('student/'+sid+'/evaluation');status('تم حفظ التصحيح وسجله');});});
document.addEventListener('input',e=>{if(e.target.closest('#dailyEvaluationForm52'))scorePreview52();});
document.addEventListener('change',e=>{if(e.target.matches('#progressForm [name="day"]'))mountEvaluation52(e.target.value).catch(error=>{const message=friendlyError46(error);status(message);showError20(message);});});
document.addEventListener('submit',e=>{if(e.target.id!=='dailyEvaluationForm52')return;e.preventDefault();const advance=e.submitter?.hasAttribute('data-next56'),form=e.target,p=Object.fromEntries(new FormData(form)),day=form.dataset.day52;for(const [key] of scoreFields52)p[key]=Number(p[key]);for(const key of ['memorized_amount','revision_amount','mistakes'])p[key]=Number(p[key]);run(async()=>{p.recitation64=form.readPassages64();await api(evaluationBase52()+'/evaluation/'+encodeURIComponent(day),p,'PUT');const ring=data.students.find(s=>s.id===sid)?.halaqa_id;
 if(advance&&ring){const state=await api('/api/v53/mosques/'+mid+'/rings/'+ring+'/day/'+day);
 const next=data.students.find(s=>s.halaqa_id===ring&&state.pending.includes(s.id));
 if(next){await openFile(next.id,false,day);navigate32('student/'+next.id+'/evaluation');status('حُفظ التقييم، بقي '+state.pending.length+' من الطلاب');return;}}
 await load();navigate32('attendance');const batch=$('#batchForm');
 if(batch&&ring){batch.elements.ring.value=ring;batch.elements.day.value=day;batchRows();}
 status('تم اعتماد التقييم. يمكنك متابعة الطالب التالي أو إغلاق اليوم عند اكتماله.');});});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.evaluate52){run(async()=>{await openFile(Number(b.dataset.evaluate52),false,b.dataset.day52);navigate32('student/'+sid+'/evaluation');});}if(b.dataset.cancelEvaluation52){const reason=prompt('سبب إلغاء التقييم (٣ أحرف على الأقل):','');if(reason===null)return;run(async()=>{await api(evaluationBase52()+'/evaluation/'+encodeURIComponent(b.dataset.cancelEvaluation52),{reason},'DELETE');await openFile(sid,false,b.dataset.cancelEvaluation52);navigate32('student/'+sid+'/evaluation');status('تم إلغاء التقييم مع حفظ الحضور وسجل التعديل');});}});
function history(){return file.progress.length?file.progress.map(p=>'<article class="halaqat-card"><h3>'+esc(p.day)+' · '+attendance[p.attendance]+'</h3><p>الحفظ: '+esc(p.memorized||'—')+' ('+p.memorized_amount+' '+unit(p.memorized_unit)+')</p><p>المراجعة: '+esc(p.revision||'—')+' ('+p.revision_amount+' '+unit(p.revision_unit)+')</p><p>الحفظ: '+(p.memorization_score??'—')+'/10 · التجويد: '+(p.tajweed_score??'—')+'/10 · الأخطاء: '+p.mistakes+'</p><p>'+esc(p.notes)+'</p>'+(file.can_edit?button('تعديل','data-progress="'+p.id+'"'):'')+'</article>').join(''):empty('لا توجد سجلات حتى الآن.');}
function exams(){let h=file.exams.map(x=>'<article class="halaqat-card"><h3>'+esc(x.title)+' · '+x.score+'/'+x.total+'</h3><p>'+x.day+(x.next_level?' · المستوى: '+esc(x.next_level):'')+'</p><p>'+esc(x.notes)+'</p></article>').join('')||empty('لا توجد اختبارات مسجلة.');if(file.can_edit)h+='<details><summary>تسجيل اختبار وترقية مستوى</summary><form id="examForm" class="halaqat-form">'+input('title','اسم الاختبار')+input('day','التاريخ',today(),'date',true,'max="'+today()+'"')+input('score','الدرجة','','number',true,'min="0" step="0.5"')+input('total','الدرجة الكاملة',100,'number',true,'min="1" max="1000" step="0.5"')+input('next_level','المستوى الجديد (اختياري)','','text',false)+input('notes','ملاحظات','','text',false)+'<button>حفظ الاختبار</button></form></details>';return h;}
function certificates(){let h=file.certificates.map(c=>'<article class="halaqat-card"><h3>'+esc(c.title)+'</h3><p>'+esc(c.achievement)+'</p><p>'+esc(c.issued_on)+'</p><a class="halaqat-btn" href="'+esc(c.url)+'" target="_blank" rel="noopener">عرض وطباعة الشهادة</a></article>').join('')||empty('لا توجد شهادات بعد.');if(file.can_certify)h+='<details><summary>إصدار شهادة إنجاز</summary><form id="certificateForm" class="halaqat-form">'+input('title','عنوان الشهادة','شهادة إتمام حفظ')+input('memorization_scope','أكمل حفظ إلى جزء / سورة','','text',true,'maxlength="250" placeholder="مثال: جزء عم أو سورة البقرة"')+input('mastery_percent','نسبة الإتقان %','','number',true,'min="0" max="100" step="0.1"')+'<small>رقم الهوية يؤخذ من ملف الطالب إن سُجّل، وهو اختياري.</small>'+'<button>إصدار الشهادة</button></form></details>';return h;}
function renderBaseFile(){
 const s=file.student,w=file.weekly,weekly=w?'<p>الحفظ المنجز: '+w.memorization_done+' '+unit(w.memorization_unit)+'، والمستهدف: '+w.memorization_target+'</p><p>المراجعة المنجزة: '+w.revision_done+' '+unit(w.revision_unit)+'، والمستهدف: '+w.revision_target+'</p><small>من '+w.from+'؛ تُجمع المقادير المسجلة بوحدة الخطة نفسها، دون تحويل تلقائي بين الأوجه والآيات.</small>':empty('حدّد الخطة لعرض الهدف الأسبوعي.');
 $('#studentFile').hidden=false;$('#studentFile').innerHTML='<header class="student-file-head"><div><small>ملف الطالب</small><h1>'+esc(s.name)+'</h1><p>'+esc(s.ring)+' · '+esc(s.level)+'</p></div><div class="actions">'+button(data.user.account_type==='guardian'?'العودة للأبناء':'العودة للطلاب','data-back')+(data.user.role==='owner'&&s.active?button('أرشفة الطالب','data-student-archive="'+sid+'" data-active="false" title="تُحفظ سجلات الطالب، وإعادة التفعيل للمالك"'):'')+'<a class="halaqat-btn secondary" href="'+base()+'/students/'+sid+'/report.csv">تصدير التقرير CSV</a></div></header><div class="halaqat-grid">'+panel('بيانات الطالب','<p>ولي الأمر: '+esc(s.guardian_name||'غير مسجل')+' · '+esc(s.guardian_relation||'')+'</p><p>الجوال: '+esc(s.guardian_phone||'غير مسجل')+'</p><p>الحفظ عند التسجيل: '+esc(s.current_memorization||'غير مسجل')+'</p><p>موعد الحلقة: '+esc(s.schedule)+'</p><p class="'+(file.absence_alert?'absence-alert':'')+'">الغياب المسجل خلال 30 يومًا: '+file.absences_30_days+(file.absence_alert?' · يحتاج متابعة':'')+'</p>')+panel('خطة الحفظ والمراجعة',planSummary()+(file.can_edit?'<details><summary>تعديل خطة الطالب</summary>'+planEditor()+'</details>':''))+panel('الإنجاز الأسبوعي',weekly)+(file.can_edit?panel('تسجيل التسميع والتقييم',progressForm()):'')+panel('سجل الحضور والتسميع',history())+panel('الاختبارات والمستوى',exams())+panel('الشهادات',certificates())+'</div>';
 document.querySelectorAll('#planForm [name$="_preset"]').forEach(syncQuantity);
}
async function openFile(id,scroll=true,evaluationDay=today()){if(data.user.role==='owner'){navigate32('students');return;}if(data.user.role==='halaqa_supervisor')return openSupervisor37(id);const studentBase=base()+'/students/'+Number(id);
 const parts=await Promise.all(['file','followup','development','learning','messages','advancement'].map(path=>api(studentBase+'/'+path)));
 sid=Number(id);[file,follow,studentDev,studentLearning,thread,advanced]=parts;
 $('#halaqatApp').classList.add('file-open');$('#halaqatWorkspace').hidden=true;renderFile();renderAdvancedFile();applyV22RoleUI(true);organize20('studentFile',true);compact32('#studentFile');await student34();await student35();await student38();await mountEvaluation52(evaluationDay);if(!document.querySelector('meta[name="demo-base42"]'))await attachInsight56(id);route32='student/'+sid;syncNavigation50();status('ملف '+file.student.name);if(scroll)$('#studentFile').scrollIntoView({behavior:'smooth',block:'start'});}
function syncQuantity(el){const prefix=el.name.replace('_preset',''),amount=el.form.elements[prefix+'_amount'],fixed=['0.5','1','2'].includes(el.value);amount.readOnly=fixed;amount.min=el.value==='ayah'?'1':'0.5';amount.step=el.value==='ayah'?'1':'0.5';if(fixed)amount.value=el.value;if(el.value==='ayah'&&(!Number.isInteger(Number(amount.value))||Number(amount.value)<1))amount.value=1;}
async function submit(f){
 const formData=new FormData(f),p=Object.fromEntries(formData.entries()),b=base();
 if(await submitExtra(f,p))return;
 if(f.id==='supervisorForm'){credentials(await api(b+'/supervisors',p));await load();}
 else if(f.id==='ringForm'){p.supervisor_ids=formData.getAll('supervisor_ids').map(Number);await api(b+'/rings',p);await load();}
 else if(['teacherRequestForm','studentRequestForm'].includes(f.id)){p.halaqa_id=Number(p.halaqa_id);if('birth_date' in p&&!p.birth_date)p.birth_date=null;await api(b+'/requests/'+(f.dataset.editId|| (f.id==='teacherRequestForm'?'teacher':'student')),p,f.dataset.editId?'PUT':'POST');await load();}
 else if(f.matches('.approval-form')){p.existing_user_id=p.existing_user_id?Number(p.existing_user_id):null;if(!p.existing_user_id&&!p.username.trim())throw Error('اكتب اسم المستخدم للحساب الجديد');credentials(await api(b+'/requests/'+f.dataset.requestId+'/approve',p));await load();}
 else if(f.id==='planForm'){
 for(const prefix of ['memorization','revision']){p[prefix+'_unit']=p[prefix+'_preset']==='ayah'?'ayah':'page';delete p[prefix+'_preset'];p[prefix+'_amount']=Number(p[prefix+'_amount']);}
 p.sessions_per_week=Number(p.sessions_per_week);p.start_ayah=p.start_ayah?Number(p.start_ayah):null;p.end_ayah=p.end_ayah?Number(p.end_ayah):null;
 await api(b+'/students/'+sid+'/plan',p,'PUT');await openFile(sid,false);
 }else if(f.id==='progressForm'){
 await api(b+'/attendance/batch',{day:p.day,rows:[{student_id:sid,attendance:p.attendance}]});await openFile(sid,false,p.day);navigate32('student/'+sid+'/evaluation');
 }else if(f.id==='examForm'){p.score=Number(p.score);p.total=Number(p.total);await api(b+'/students/'+sid+'/exams',p);await openFile(sid,false);}
 else if(f.id==='certificateForm'){p.mastery_percent=Number(p.mastery_percent);await api(b+'/students/'+sid+'/certificates',p);await openFile(sid,false);}
 status('تم الحفظ بنجاح');
}
document.addEventListener('submit',e=>{if(['supervisorForm','ringForm','teacherRequestForm','studentRequestForm','planForm','progressForm','examForm','certificateForm','profileForm','recipientForm','transferForm','batchForm','assignmentForm','appointmentForm','featuresForm'].includes(e.target.id)||e.target.matches('.approval-form,.assignment-result')){e.preventDefault();run(()=>submit(e.target));}});
document.addEventListener('change',e=>{if(e.target.id==='studentRingFilter')filterStudentList();if(e.target.name?.endsWith('_preset'))syncQuantity(e.target);});
document.addEventListener('input',e=>{if(e.target.id==='studentSearch')filterStudentList();});
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-hide-credentials')){$('#halaqatCredentials').hidden=true;$('#halaqatCredentials').textContent='';return;}
 if(b.hasAttribute('data-back')){navigate32('students');return;}
 if(b.dataset.file){run(()=>openFile(b.dataset.file));return;}
 if(b.dataset.openRing){selectedStudentRing=String(b.dataset.openRing);studentFilterMode='all';navigate32('students');const sel=$('#studentRingFilter');if(sel)sel.value=selectedStudentRing;filterStudentList();document.querySelector('#studentRingFilter')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
 if(b.dataset.studentFilter){studentFilterMode=b.dataset.studentFilter;filterStudentList();return;}
 if(b.dataset.deleteStudent){run(async()=>{const preview=await api(base()+'/students/'+b.dataset.deleteStudent+'/deletion-preview');const typed=prompt('حذف نهائي لا يمكن التراجع عنه. اكتب اسم الطالب كاملًا للتأكيد: \n'+preview.name,'');if(typed===null)return;if(typed.trim()!==preview.name)throw Error('الاسم لا يطابق اسم الطالب');await api(base()+'/students/'+b.dataset.deleteStudent,{confirm_name:typed.trim(),token:preview.token},'DELETE');$('#studentFile').hidden=true;$('#halaqatWorkspace').hidden=false;await load();status('تم حذف الطالب نهائيًا');});return;}
 if(b.dataset.progress){const p=file.progress.find(x=>x.id===Number(b.dataset.progress));if(p)run(async()=>{await mountEvaluation52(p.day);navigate32('student/'+sid+'/evaluation');});return;}
 if(b.dataset.reject)run(async()=>{const note=prompt('سبب الرفض:','');if(note===null)return;await api(base()+'/requests/'+b.dataset.reject+'/reject',{note});await load();});
 if(b.dataset.reset)run(async()=>{if(!confirm('إصدار رمز جديد يلغي جلسات الدخول الحالية للحساب. متابعة؟'))return;credentials(await api(base()+'/users/'+b.dataset.reset+'/reset',{}));await load();});
});
function showArchiveReason52(b){
 $('#archiveReason52')?.remove();const active=b.dataset.active==='true',student=Boolean(b.dataset.studentArchive),id=Number(b.dataset.studentArchive||b.dataset.accountArchive),box=document.createElement('section');
 box.id='archiveReason52';box.className='halaqat-card archive-reason52';box.innerHTML='<h3>'+ (active?'إعادة التفعيل':'أرشفة '+(student?'الطالب':'الحساب'))+'</h3><p>'+(student?(active?'سيعود الطالب لقائمة الفعّالين بسجلاته السابقة.':'سينتقل الطالب للأرشيف وتبقى سجلاته ودرجاته محفوظة. إعادة التفعيل للمالك.'):(active?'سيتمكن صاحب الحساب من الدخول مجددًا.':'سيتوقف دخول الحساب وتنتهي جلساته الحالية.'))+'</p><form id="archiveReasonForm52" class="halaqat-form" data-entity52="'+(student?'students':'users')+'" data-target52="'+id+'" data-active52="'+active+'">'+input('reason',active?'سبب إعادة التفعيل':'سبب الأرشفة','','text',true,'minlength="2" maxlength="500"')+'<div class="actions"><button>'+(active?'تأكيد إعادة التفعيل':'تأكيد الأرشفة')+'</button>'+button('إلغاء','data-cancel-archive52')+'</div></form>';
 const host=b.closest('.student-file-head,.student-row,.account-row,.halaqat-card')||b.parentElement;host.after(box);reveal20(box);box.querySelector('input').focus();box.scrollIntoView({behavior:'smooth',block:'center'});
}
document.addEventListener('click',e=>{if(e.target.closest('[data-cancel-archive52]'))$('#archiveReason52')?.remove();});
document.addEventListener('submit',e=>{if(e.target.id!=='archiveReasonForm52')return;e.preventDefault();const f=e.target,student=f.dataset.entity52==='students',active=f.dataset.active52==='true',reason=f.elements.reason.value.trim(),id=Number(f.dataset.target52);run(async()=>{if(reason.length<2)throw Error('اكتب سببًا من حرفين على الأقل.');const result=await api(base()+'/'+f.dataset.entity52+'/'+id+'/archive',{active,reason},'PUT');if(student&&!active&&!result.pending_approval){sid=0;file=null;window.history.replaceState(null,'','#students');}await load();status(result.pending_approval?result.message||'تم رفع الطلب للموافقة':active?'تمت إعادة التفعيل بنجاح':'تمت الأرشفة مع حفظ السجلات');});});
// Version 14: owner views, reviewed enrollment and student follow-up.
const recipientOptions=[['student','الطالب نفسه'],['guardian','ولي الأمر']];
const featureNames={assignments:'الورد القادم',notifications:'التنبيهات داخل النظام',rewards:'النقاط والشارات',monthly_reports:'التقارير الشهرية PDF'};
const wardStates={pending:'بانتظار التسميع',completed:'مكتمل',partial:'جزئي',not_done:'لم ينجز'};
function accountFields(student=false){
 return input('full_name',student?'اسم الطالب الرباعي':'اسم المدرس','','text',true,'minlength="2" maxlength="180"')+select('halaqa_id','الحلقة',ringOpts())+(student?select('recipient_type','من يتابع التقارير؟',recipientOptions,'student')+'<details><summary>بيانات إضافية اختيارية</summary>'+input('national_id','رقم الهوية (اختياري)','','text',false,'maxlength="30" inputmode="numeric"')+input('birth_date','تاريخ الميلاد (اختياري)','','date',false)+input('school_grade','الصف الدراسي (اختياري)','','text',false,'maxlength="120"')+'</details>'+input('current_memorization','الحفظ الحالي','','text',false,'maxlength="250"')+'<div class="guardian-fields" hidden>'+input('guardian_name','اسم ولي الأمر','','text',false,'maxlength="180"')+input('guardian_relation','صلة القرابة','الأب','text',false,'maxlength="60"')+'</div>'+input('guardian_phone','جوال ولي الأمر','','tel',false,'maxlength="40"')+'<small>يراجع المالك الملف ويختار حساب ولي الأمر الموجود أو ينشئ حسابًا جديدًا عند الاعتماد.</small>':'')+input('notes','ملاحظات داخلية','','text',false,'maxlength="1000"');
}
function recipientAccounts(type,currentId=0){return (monitor?.recipients||[]).filter(u=>type==='guardian'?u.account_type==='guardian':u.account_type!=='guardian'&&(!u.children?.length||u.id===currentId)).map(u=>[u.id,u.name+' — '+u.username+(u.role==='owner'?' (حسابي الشخصي)':u.children?.length?' — '+u.children.map(c=>c.name).join('، '):'')]);}
function approvalForm(r){return '<form class="halaqat-form approval-form" data-request-id="'+r.id+'">'+(r.type==='student'?select('existing_user_id',r.recipient_type==='guardian'?'حساب ولي الأمر':'حساب الطالب',[['','إنشاء حساب جديد'],...recipientAccounts(r.recipient_type)],'',false):'')+input('username','اسم المستخدم للحساب الجديد','','text',false,'maxlength="30"')+input('temporary_password','كلمة المرور المؤقتة (فارغة = توليد آمن)','','password',false,'minlength="8" maxlength="128" autocomplete="new-password"')+'<div class="actions"><button>اعتماد الملف</button>'+(r.type==='student'?button('إرجاع للاستكمال','data-return="'+r.id+'"'):'')+button('رفض','data-reject="'+r.id+'"')+'</div></form>';}
function requests(){return data.requests.length?data.requests.map(r=>'<article class="halaqat-card"><span class="halaqat-badge">'+esc(states[r.status])+'</span><h3>'+esc(r.full_name)+'</h3><p>'+(r.type==='teacher'?'مدرس':'طالب · المتابع: '+(r.recipient_type==='guardian'?'ولي الأمر':'الطالب نفسه'))+' · '+esc(r.ring)+'</p>'+requestDetails(r)+'<p>مقدم الطلب: '+esc(r.requested_by?.name)+'</p><p>'+esc(r.notes)+'</p>'+(r.review_note?'<p class="review-note">ملاحظة المراجعة: '+esc(r.review_note)+'</p>':'')+(r.type==='student'&&['pending','returned'].includes(r.status)&&(data.user.role==='owner'||r.requested_by?.id===data.user.id)?button('تعديل واستكمال الملف','data-amend="'+r.id+'"'):'')+(data.user.role==='owner'&&r.status==='pending'?approvalForm(r):'')+'</article>').join(''):empty('لا توجد طلبات.');}
function syncRecipient(form){const box=form.querySelector('.guardian-fields');if(box){const isGuardian=form.elements.recipient_type.value==='guardian';box.hidden=!isGuardian;form.elements.guardian_name.required=isGuardian;}}
function batchRows(){
 const f=$('#batchForm');if(!f)return;const rid=Number(f.elements.ring.value),day=f.elements.day.value,rows=data.students.filter(s=>s.halaqa_id===rid),box=$('#batchRows');
 box.innerHTML=rows.length?'<div class="table-wrap"><table class="data-table attendance-table50"><thead><tr><th>الطالب</th><th>الحلقة</th><th>الحضور</th><th>متابعة الطالب</th></tr></thead><tbody>'+rows.map(s=>{const old=data.progress.find(p=>p.student_id===s.id&&p.day===day);return '<tr data-attendance-row50="'+s.id+'"><td><div class="student-cell50"><span class="avatar50">'+esc(initials50(s.name))+'</span><span class="student-name50"><strong>'+esc(s.name)+'</strong><small>ترتيبه في الحلقة: '+s.ring_number+'</small></span></div></td><td>'+esc(data.rings.find(r=>r.id===rid)?.name||'')+'</td><td><div class="attendance-options">'+[['','دون تغيير'],...Object.entries(attendance)].map(([value,label])=>'<label class="attendance-option '+value+'"><input type="radio" name="attendance_'+s.id+'" value="'+value+'" '+(old?.attendance===value?'checked':'')+'><span>'+esc(label)+'</span></label>').join('')+'</div>'+(!old?'<small class="small-note">لم يسجل؛ يبقى دون تغيير حتى تحدد الحضور.</small>':'')+'</td><td><div class="actions">'+(['present','permission'].includes(old?.attendance)?button('سجّل التقييم','data-evaluate52="'+s.id+'" data-day52="'+esc(day)+'"'):'<small class="small-note">'+(old?'التقييم للحاضر والمستأذن':'احفظ الحضور أولًا')+'</small>')+button('ملف الطالب','data-file="'+s.id+'"')+'</div></td></tr>';}).join('')+'</tbody></table></div>':empty('لا يوجد طلاب في هذه الحلقة.');updateAttendance50();refreshDay53(f,rid,day);
}
let dayRequest53=0;
async function refreshDay53(form,rid,day){
 const seq=++dayRequest53;let panel=form.parentElement.querySelector('.day-close53');
 if(!panel){panel=document.createElement('section');panel.className='day-card53 day-close53';form.after(panel);}
 panel.textContent='';if(!rid||!day)return;
 try{
  const url='/api/v53/mosques/'+mid+'/rings/'+rid+'/day/'+day;
  const result=await api(url);if(seq!==dayRequest53||!form.isConnected)return;
  const pending=new Set(result.pending);
  form.querySelectorAll('[data-evaluate52]').forEach(b=>{b.textContent=pending.has(Number(b.dataset.evaluate52))?'سجّل التقييم':'عرض التقييم';});
  const count=result.pending.length,remaining=result.unmarked.length,attended=form.querySelectorAll('[data-evaluate52]').length;
  panel.innerHTML='<h3>٢ · تقييم الحاضرين والمستأذنين</h3><p>تم تقييم '+(attended-count)+' من '+attended+' · '+remaining+' لم يُحضّروا · '+count+' بانتظار التقييم</p>'+(count?button('تقييم الطالب التالي','data-evaluate52="'+result.pending[0]+'" data-day52="'+esc(day)+'"'):'')+'<h3>٣ · إغلاق يوم الحلقة</h3>'+
   (result.closed?'<p>اعتُمد اليوم. يمكنك إعادة فتحه لتصحيح سجل.</p>'+button('إعادة فتح اليوم','data-dayaction53="reopen"'):!result.total?'أضف طلابًا إلى الحلقة أولًا.':remaining||count?'أكمل التحضير وتقييم كل حاضر ومستأذن لإتاحة الإغلاق.':button('اعتماد وإغلاق يوم الحلقة','data-dayaction53="close"'));
  panel.dataset.url=url;
 }catch(e){if(seq===dayRequest53)panel.textContent='تعذر جلب حالة الإغلاق. حدّث الصفحة للمحاولة مرة أخرى.';}
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.dayaction53){run(async()=>{await api(b.closest('.day-close53').dataset.url+'/'+b.dataset.dayaction53,{});batchRows();status('تم تحديث حالة يوم الحلقة');});}
 if(b.hasAttribute('data-evening53')&&confirm('تطبيق جدول الأحد إلى الأربعاء على جميع الحلقات النشطة في '+data.mosque.name+'؟ يستبدل الجدول الأسبوعي الحالي.')){
  run(async()=>{const r=await api('/api/v53/mosques/'+mid+'/evening-calendar',{});await load();navigate32('complexes');status('تم تحديث جدول '+r.count+' حلقات');});
 }
 if(b.dataset.duration53){const days=prompt('عدد أيام التجربة بدءًا من الآن');if(days===null)return;
  run(async()=>{if(!Number.isSafeInteger(Number(days))||Number(days)<1)throw Error('أدخل عدد أيام صحيحًا موجبًا');
  await api('/api/demo42/trials/'+b.dataset.duration53+'/duration',{duration_value:Number(days),duration_unit:'days'},'PUT');await load();const detail=$('.demo-admin52');if(detail)detail.open=true;status('تم تحديث موعد الانتهاء بنفس الرابط');});}
});
function updateAttendance50(){const box=$('#attendanceSummary50'),form=$('#batchForm');if(!box||!form)return;const checked=[...form.querySelectorAll('[name^="attendance_"]:checked')],values=[['الطلاب في الحلقة',form.querySelectorAll('[data-attendance-row50]').length,'students'],...Object.entries(attendance).map(([value,label])=>[label,checked.filter(x=>x.value===value).length,'attendance'])];box.innerHTML=values.map(([label,value,icon])=>'<article class="stat-card"><div class="stat-label50"><span>'+label+'</span>'+icon50(icon)+'</div><strong class="stat-value50">'+value+'</strong></article>').join('');}
function renderDashboard(){
 renderBaseDashboard();let extra='';
 let view=$('#portalViewBox');if(!view){view=document.createElement('div');view.id='portalViewBox';$('.halaqat-toolbar').prepend(view);}view.innerHTML=data.user.original_role==='owner'?select('portalView','عرض الواجهة',[['owner','المالك'],['supervisor','المشرف']],portalView):'';
 if(data.user.role==='halaqa_teacher')extra+=panel('التحضير الجماعي','<form id="batchForm" class="halaqat-form">'+select('ring','الحلقة',data.rings.map(r=>[r.id,r.name]))+input('day','التاريخ',today(),'date',true,'max="'+today()+'"')+'<h3>١ · تحضير طلاب الحلقة</h3><p>اختر «مستأذن» لمن سمّع وخرج مبكرًا. سجّل غير الحاضر «غائب» أو «غائب بعذر».</p>'+button('تحديد الجميع حاضرًا','data-all-present')+'<div id="batchRows"></div><button>حفظ التحضير</button><p class="teacher-reminder52">بعد حفظ التحضير، افتح «سجّل التقييم» لكل حاضر ومستأذن. الرجاء تسجيل الملاحظات ودرجات الحفظ والتجويد والتلاوة والترتيل بانتظام.</p></form>');
 if(extra)$('#halaqatWorkspace .halaqat-grid').insertAdjacentHTML('beforeend',extra);batchRows();
 renderDevelopmentDashboard();
}
function renderFile(){
 renderBaseFile();const s=file.student;let extra='';
 if(follow.features.assignments){
  extra+=panel('الورد القادم وسجل الأوراد',follow.assignments.map(a=>'<article class="halaqat-card"><h3>'+esc(a.due)+' · '+wardStates[a.status]+'</h3><p>الحفظ: '+esc(a.memorization||'—')+'</p><p>المراجعة: '+esc(a.revision||'—')+'</p><p>'+esc(a.instructions)+'</p><p>'+esc(a.result_note)+'</p>'+(file.can_edit?'<form class="halaqat-form assignment-result" data-id="'+a.id+'">'+select('status','نتيجة التسميع',Object.entries(wardStates),a.status)+input('result_note','ملاحظة الشيخ',a.result_note,'text',false,'maxlength="1000"')+'<button>حفظ نتيجة الورد</button></form>':'')+'</article>').join('')||empty('لم يُحدد الورد القادم بعد.'));
  if(file.can_edit)extra+=panel('تحديد ورد جديد','<form id="assignmentForm" class="halaqat-form">'+input('due','موعد التسميع',today(),'date')+input('memorization','ورد الحفظ: السورة والآيات أو الصفحات','','text',false,'maxlength="1000" placeholder="مثال: البقرة، الآيات 1–5"')+input('revision','ورد المراجعة: السورة والآيات أو الصفحات','','text',false,'maxlength="1000"')+input('instructions','تعليمات للطالب وولي الأمر','','text',false,'maxlength="1000"')+'<button>حفظ الورد القادم</button><small>حدد الحفظ أو المراجعة على الأقل. يُسجل الإنجاز الكمي من نموذج التسميع.</small></form>');
 }
 if(follow.rewards)extra+=panel('النقاط والشارات','<p class="points">'+follow.rewards.points+' نقطة</p><p>'+follow.rewards.badges.map(b=>'<span class="reward-badge">'+esc(b)+'</span>').join(' ')+'</p><small>النقاط اليومية من 10 وفق الحضور والسلوك والتسميع والالتزام بالخطة. رصيد النظام السابق محفوظ بشكل مستقل.</small>');
 extra+=panel('الاختبارات القادمة',follow.appointments.map(a=>'<p><strong>'+esc(a.title)+'</strong> · '+esc(a.due)+'<br>'+esc(a.notes)+'</p>').join('')||empty('لا يوجد اختبار قادم محدد.'));
 if(file.can_edit)extra+=panel('تحديد موعد اختبار','<form id="appointmentForm" class="halaqat-form">'+input('title','عنوان الاختبار','','text',true,'minlength="2" maxlength="180"')+input('due','موعد الاختبار',today(),'date',true,'min="'+today()+'"')+input('notes','تعليمات الاختبار','','text',false,'maxlength="1000"')+'<button>حفظ الموعد</button></form>');
 if(follow.features.monthly_reports)extra+=panel('التقرير الشهري PDF',input('reportMonth','الشهر',today().slice(0,7),'month',true,'id="reportMonth"')+'<a id="monthlyDownload" class="halaqat-btn">تنزيل تقرير الشهر</a>');
 if(['owner','halaqa_supervisor'].includes(data.user.role))extra+=panel('تعديل بيانات الطالب','<form id="profileForm" class="halaqat-form">'+input('full_name','اسم الطالب',s.name,'text',true,'minlength="2" maxlength="180"')+'<details><summary>بيانات إضافية اختيارية</summary>'+input('national_id','رقم الهوية (اختياري)',s.national_id||'','text',false,'maxlength="30" inputmode="numeric"')+input('birth_date','تاريخ الميلاد (اختياري)',s.birth_date||'','date',false)+input('school_grade','الصف الدراسي (اختياري)',s.school_grade,'text',false,'maxlength="120"')+'</details>'+input('current_memorization','الحفظ عند التسجيل',s.current_memorization,'text',false,'maxlength="250"')+input('phone','جوال الطالب',s.phone||'','tel',false,'maxlength="40"')+input('guardian_name','اسم ولي الأمر',s.guardian_name,'text',s.recipient_type==='guardian','maxlength="180"')+input('guardian_phone','جوال ولي الأمر',s.guardian_phone,'tel',false,'maxlength="40"')+input('guardian_relation','صلة القرابة',s.guardian_relation,'text',false,'maxlength="60"')+input('notes','ملاحظات داخلية',s.notes,'text',false,'maxlength="1000"')+'<button>حفظ بيانات الطالب</button></form>');
 if(data.user.role==='owner'&&s.active)extra+=panel('إدارة ربط الحساب','<form id="recipientForm" class="halaqat-form">'+select('recipient_type','متابع التقارير',recipientOptions,s.recipient_type)+select('user_id','الحساب المرتبط',recipientAccounts(s.recipient_type,s.user_id),s.user_id)+'<button>حفظ ربط الحساب</button><small>تنتقل صلاحية الاطلاع للحساب المحدد. لإصدار حساب جديد استخدم النموذج أدناه؛ المالك وحده يصدر بيانات الدخول.</small></form><details><summary>إصدار حساب جديد لهذا الطالب أو ولي أمره</summary><form id="newRecipientForm" class="halaqat-form">'+select('recipient_type','نوع الحساب',recipientOptions,s.recipient_type)+input('full_name','اسم صاحب الحساب',s.recipient_type==='guardian'?s.guardian_name:s.name,'text',true,'minlength="2" maxlength="180"')+input('username','اسم المستخدم','','text',true,'minlength="3" maxlength="30" autocomplete="off"')+'<small>دون مسافات، مثل: عبد_الخالق_الشهري. إصدار الحساب ينقل ارتباط هذا الطالب إليه ويحفظ سجل الطالب.</small>'+input('temporary_password','كلمة المرور المؤقتة (اختياري)','','password',false,'minlength="8" maxlength="128"')+'<button>إصدار الحساب وربط الطالب</button></form></details>');
 if(s.active&&['owner','halaqa_supervisor'].includes(data.user.role))extra+=panel('نقل الطالب إلى حلقة أخرى','<form id="transferForm" class="halaqat-form">'+select('halaqa_id','الحلقة',data.rings.map(r=>[r.id,r.name]),s.halaqa_id)+'<button>نقل مع الاحتفاظ بالسجل</button></form>');
 if(['owner','halaqa_supervisor'].includes(data.user.role))extra+=panel('حذف الطالب نهائيًا','<p class="small-note">يحذف ملف الطالب وسجلاته نهائيًا. حساب الدخول المرتبط يبقى محفوظًا حتى لا يتأثر ولي الأمر أو أي أبناء آخرين.</p>'+button('حذف نهائي','data-delete-student="'+s.id+'"'));
 $('#studentFile .halaqat-grid').insertAdjacentHTML('afterbegin',extra);
 $('#studentFile').querySelectorAll('a[href]').forEach(a=>{const u=new URL(a.href);u.searchParams.set('view',portalView);a.href=u.pathname+u.search;});syncMonthly();renderDevelopmentFile();renderLearningFile();
}
function syncMonthly(){if($('#monthlyDownload'))$('#monthlyDownload').href=base()+'/students/'+sid+'/monthly.pdf?month='+encodeURIComponent($('#reportMonth').value)+'&view='+portalView;}
async function submitExtra(f,p){
 const url=base()+'/students/'+sid;let handled=true;
 if(f.id==='profileForm'){p.birth_date=p.birth_date||null;await api(url+'/profile',p,'PUT');}
 else if(f.id==='recipientForm'){p.user_id=Number(p.user_id);await api(url+'/recipient',p,'PUT');}
 else if(f.id==='newRecipientForm'){
  p.username=p.username.normalize('NFKC').trim();
  if(/\s/u.test(p.username))throw Error('اسم المستخدم لا يقبل المسافات. استخدم: '+p.username.replace(/\s+/gu,'_'));
  credentials(await api(url+'/recipient-account',p));
 }
 else if(f.id==='transferForm'){p.halaqa_id=Number(p.halaqa_id);const d=await api(url+'/transfer',p);if(d.pending_approval){await openFile(sid,false);status(d.message||'تم رفع طلب النقل للمدير العام');return;}}
 else if(f.id==='assignmentForm')await api(url+'/assignments',p);
 else if(f.matches('.assignment-result'))await api(url+'/assignments/'+f.dataset.id,p,'PUT');
 else if(f.id==='appointmentForm')await api(url+'/exam-appointments',p);
 else if(f.id==='batchForm'){const rows=Object.entries(p).filter(([k,v])=>k.startsWith('attendance_')&&v).map(([k,v])=>({student_id:Number(k.slice(11)),attendance:v}));if(!rows.length)throw Error('حدد حضور طالب واحد على الأقل');await api(base()+'/attendance/batch',{day:p.day,rows});await load();const form=$('#batchForm');if(form){form.elements.ring.value=p.ring;form.elements.day.value=p.day;batchRows();navigate32('attendance');}status('تم حفظ التحضير');return true;}
 else if(f.id==='featuresForm'){await api(base()+'/features',Object.fromEntries(Object.keys(featureNames).map(k=>[k,f.elements[k].checked])),'PUT');await load();status('تم حفظ إعدادات الميزات');return true;}
 else handled=false;
 if(handled){monitor=await api(base()+'/monitor');await openFile(sid,false);status('تم الحفظ بنجاح');}return handled;
}
document.addEventListener('submit',e=>{if(e.target.id==='newRecipientForm'){e.preventDefault();run(()=>submit(e.target));}});
document.addEventListener('change',e=>{
 if(e.target.name==='portalView')run(async()=>{portalView=e.target.value;$('#halaqatCredentials').hidden=true;$('#halaqatCredentials').textContent='';await load();});
 if(e.target.name==='recipient_type'){
  if(e.target.form?.id==='studentRequestForm')syncRecipient(e.target.form);
  if(e.target.form?.id==='recipientForm'){const el=e.target.form.elements.user_id;el.innerHTML=recipientAccounts(e.target.value,file.student.user_id).map(([v,t])=>'<option value="'+v+'">'+esc(t)+'</option>').join('');}
 }
 if(e.target.form?.id==='batchForm'&&['day','ring'].includes(e.target.name))batchRows();
 if(e.target.id==='reportMonth')syncMonthly();
});
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-all-present')){$('#batchRows').querySelectorAll('select').forEach(s=>s.value='present');$('#batchRows').querySelectorAll('input[type="radio"][value="present"]').forEach(s=>s.checked=true);updateAttendance50();}
 if(b.dataset.return)run(async()=>{const note=prompt('ما المعلومات المطلوب استكمالها؟');if(note===null)return;await api(base()+'/requests/'+b.dataset.return+'/return',{note});await load();});
 if(b.dataset.read)run(async()=>{await api(base()+'/alerts/read',{key:b.dataset.read});await load();});
 if(b.dataset.amend){const r=data.requests.find(r=>r.id===Number(b.dataset.amend)),f=$('#studentRequestForm');if(!r||!f)return;f.dataset.editId=r.id;for(const [k,v] of Object.entries(r))if(f.elements[k])f.elements[k].value=v??'';syncRecipient(f);const submit=f.querySelector('button');if(submit)submit.textContent='حفظ وإعادة رفع الطلب';f.scrollIntoView({behavior:'smooth'});}
});

// Version 15 modules share the established authenticated API and role-scoped views.
let development=null,studentDev=null,thread=null,orgOverview=null,importPreview=null;
const dayNames=['الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت','الأحد'];
const dateTime=x=>new Date(x).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh',dateStyle:'short',timeStyle:'short'});
const fold=(title,body)=>'<details class="development-fold"><summary>'+title+'</summary>'+body+'</details>';
const form15=(id,body,attrs='')=>'<form id="'+id+'" data-v15 class="halaqat-form" '+attrs+'>'+body+'</form>';
const textArea=(name,label,value='',max=3000)=>'<label>'+label+'<textarea name="'+name+'" maxlength="'+max+'" required rows="3">'+esc(value)+'</textarea></label>';
function renderDevelopmentDashboard(){
 let html='';const role=data.user.role,staff=role!=='halaqa_student',manager=['owner','halaqa_supervisor'].includes(role);
 if(!staff)html+=panel('إعلانات الحلقة',development.announcements.map(a=>'<article class="halaqat-card"><h3>'+esc(a.title)+'</h3><small>'+esc(a.ring)+(a.expires?' · حتى '+esc(a.expires):'')+'</small><p class="preserve-lines">'+esc(a.body)+'</p></article>').join('')||empty('لا توجد إعلانات حالية.'));
 if(role==='owner')html+=panel('نشر إعلان عام',fold('كتابة إعلان عام',form15('announcementForm','<input type="hidden" name="halaqa_id" value="">'+input('title','العنوان','','text',true,'minlength="2" maxlength="180"')+textArea('body','نص الإعلان')+input('expires','ينتهي في (اختياري)','','date',false)+'<button>نشر الإعلان</button>')));
 if(!staff)html+=panel('جدول اللقاءات والإجازات',circleCalendar(development.calendars));
 if(staff)html+=panel('الدعم الفني',development.unread.map(x=>'<div class="student-row"><span>'+esc(x.name)+' · '+esc(x.ring)+' · '+x.count+' رسالة</span>'+(role==='owner'?'':button('فتح الملف','data-file="'+x.id+'"'))+'</div>').join('')||empty('لا توجد رسائل غير مقروءة.'));
 if(['halaqa_supervisor','halaqa_teacher'].includes(role))html+=panel('الاختبارات المنظمة القادمة',development.upcoming_exams.map(x=>'<div class="student-row"><span>'+esc(x.name)+' · '+esc(x.title)+' · '+x.due+'</span>'+button('التفاصيل','data-file="'+x.student_id+'"')+'</div>').join('')||empty('لا توجد اختبارات منظمة قادمة.'));
 if(role==='halaqa_supervisor'&&development.pending_exams?.length)html+=panel('اختبارات بانتظار اعتمادك',development.pending_exams.map(x=>'<article class="halaqat-card"><strong>'+esc(x.name)+' · '+esc(x.ring)+'</strong><p>'+esc(x.title)+' · '+x.due+'</p><p>'+esc(x.syllabus)+'</p><div class="actions">'+button('اعتماد الاختبار','data-review-exam="'+x.id+'" data-review-status="approved"')+button('رفض','data-review-exam="'+x.id+'" data-review-status="rejected"')+'</div></article>').join(''));
 if(['halaqa_supervisor','halaqa_teacher'].includes(role)){html+=panel('اعتذارات الغياب',development.pending_excuses.map(x=>'<div class="halaqat-card"><strong>'+esc(x.name)+'</strong><p>'+x.day+' · '+esc(x.reason)+'</p><div class="actions">'+button('قبول العذر','data-review-excuse="'+x.id+'" data-student-id="'+x.student_id+'" data-review-status="approved"')+button('رفض','data-review-excuse="'+x.id+'" data-student-id="'+x.student_id+'" data-review-status="rejected"')+'</div></div>').join('')||empty('لا توجد اعتذارات معلقة.'));}
 if(role==='owner')html+=panel('الطلاب المؤرشفون',fold('عرض الأرشيف ('+development.archived_students.length+')',development.archived_students.map(s=>'<div class="student-row"><span>'+esc(s.name)+' · '+esc(data.rings.find(r=>Number(r.id)===Number(s.halaqa_id))?.name||'حلقة غير محددة')+'</span><div class="actions">'+button('إعادة تفعيل الطالب','data-student-archive="'+s.id+'" data-active="true"')+'</div></div>').join('')||empty('الأرشيف فارغ.')));
 if(staff)html+=panel('استيراد الطلاب من Excel',fold('رفع ملف ومعاينته','<a class="halaqat-btn" href="'+base()+'/imports/template.xlsx?view='+portalView+'">تنزيل القالب</a><p>حتى 300 طالب. تظهر الأخطاء والتكرارات قبل الحفظ.</p>'+form15('importForm',select('halaqa_id','الحلقة',ringOpts())+input('file','ملف Excel','','file',true,'accept=".xlsx"')+'<button>معاينة الملف</button>')+'<div id="importPreview"></div>'));
 if(role==='owner')html+=panel('إدارة المجمعات',fold('المجمعات والإحصاءات',(orgOverview?.mosques||[]).map(m=>'<div class="student-row"><span>'+esc(m.name)+' · '+m.rings+' حلقات · '+m.students+' طلاب · '+m.pending+' طلبات</span>'+button('فتح المجمع','data-open-mosque="'+m.id+'"')+'</div>').join('')+form15('mosqueCreateForm',input('name','اسم مجمع جديد','','text',true,'minlength="2" maxlength="180"')+'<button>إضافة مجمع</button>')+form15('mosqueRenameForm',input('name','اسم المجمع الحالي',data.mosque.name,'text',true,'minlength="2" maxlength="180"')+'<button>حفظ الاسم</button>')));
 if(html)$('#halaqatWorkspace .halaqat-grid').insertAdjacentHTML('beforeend',html);
}
function quranCards(){const filter=$('#quranFilter')?.value||'';$('#quranMap').innerHTML=studentDev.quran.filter(x=>!filter||x.status===filter).map(x=>'<article class="quran-cell state-'+x.status+'"><strong>'+x.number+'. '+esc(x.name)+'</strong><span>'+studentDev.quran_states[x.status]+'</span>'+(x.notes?'<small>'+esc(x.notes)+'</small>':'')+(x.approved_by?'<small>اعتماد: '+esc(x.approved_by)+'</small>':'')+'</article>').join('');}
function renderDevelopmentFile(){
 let html='';const s=file.student;
 const counts=Object.entries(studentDev.quran_states).map(([k,v])=>'<span class="reward-badge">'+v+': '+studentDev.quran.filter(x=>x.status===k).length+'</span>').join('');
 html+=panel('خريطة إنجاز القرآن',counts+'<p>حالة السورة كاملة باعتماد الشيخ؛ يذكر الجزء المحفوظ من السورة في الملاحظات عند «قيد الحفظ».</p>'+fold('عرض السور الـ114',select('quranFilter','تصفية الحالات',[['','جميع السور'],...Object.entries(studentDev.quran_states)],'',false).replace('name="quranFilter"','id="quranFilter"')+'<div id="quranMap" class="quran-grid"></div>')+(file.can_edit?fold('تحديث سورة باعتماد الشيخ',form15('quranForm',select('surah','السورة',studentDev.quran.map(x=>[x.number,x.name]))+select('status','الحالة',Object.entries(studentDev.quran_states))+input('notes','نطاق الحفظ أو ملاحظات','','text',false,'maxlength="1000"')+'<button>اعتماد حالة السورة</button>')):''));
 html+=panel('اعتذارات الغياب',studentDev.excuses.map(x=>'<article class="halaqat-card"><h3>'+x.day+' · '+({pending:'بانتظار المراجعة',approved:'مقبول',rejected:'مرفوض'}[x.status])+'</h3><p>'+esc(x.reason)+'</p><p>'+esc(x.review_note)+'</p>'+(['halaqa_teacher','halaqa_supervisor'].includes(data.user.role)&&s.active&&x.status==='pending'?form15('excuseReview'+x.id,select('status','القرار',[['approved','قبول'],['rejected','رفض']])+input('note','ملاحظة المراجعة','','text',false,'maxlength="1000"')+'<button>حفظ القرار</button>','data-kind="excuseReview" data-id="'+x.id+'"'):'')+'</article>').join('')+(data.user.role==='halaqa_student'&&s.active?form15('excuseForm',input('day','يوم الغياب',today(),'date')+textArea('reason','سبب الاعتذار','',1500)+'<button>إرسال العذر للمشرف ومعلم الحلقة</button><small>يجب أن يكون اليوم ضمن جدول لقاءات الحلقة. بعد اعتماد العذر يسجل الغياب بعذر.</small>'):''));
 html+=panel('مراسلات الطالب', '<p>هذه المحادثة مشتركة بين متابع الطالب الحالي وفريق حلقته والمالك، وتبقى ضمن سجل الطالب عند نقله.</p><div id="messageRows">'+messageRows(thread.messages)+'</div>'+(thread.before?button('رسائل أقدم','data-messages-before="'+thread.before+'"'):'')+(s.active?form15('messageForm',textArea('body','رسالتك')+'<button>إرسال الرسالة</button>'):'<p>الطالب مؤرشف؛ المراسلات للقراءة فقط.</p>'));
 html+=panel('الاختبارات الدورية المنظمة',studentDev.exams.map(examCard).join('')||empty('لا توجد اختبارات منظمة بعد.'));
 if(data.user.role==='halaqa_teacher'&&s.active)html+=panel('إنشاء اختبار منظم',fold('المقرر ومعايير التقييم',form15('organizedExamForm',input('title','عنوان الاختبار','','text',true,'minlength="2" maxlength="180"')+textArea('syllabus','المقرر: السور والآيات أو الصفحات','',2000)+input('due','الموعد',today(),'date')+input('repeat_days','يتكرر بعد الاجتياز كل (يوم)، 0 دون تكرار',0,'number',true,'min="0" max="365"')+input('pass_percent','نسبة الاجتياز',70,'number',true,'min="0" max="100" step="0.5"')+'<div id="examCriteria">'+criterionFields('الحفظ',60)+criterionFields('التجويد',40)+'</div>'+button('إضافة معيار','data-add-criterion')+'<button>رفع الاختبار للمشرف للاعتماد</button>')));
 if(data.user.role==='halaqa_supervisor')html+=panel('حالة ملف الطالب','<p>'+(s.active?'طالب فعال':'طالب مؤرشف — السجل محفوظ')+'</p>'+button(s.active?'طلب أرشفة الطالب':'طلب إعادة التفعيل','data-student-archive="'+sid+'" data-active="'+!s.active+'"'));
 $('#studentFile .halaqat-grid').insertAdjacentHTML('beforeend',html);quranCards();syncQuranForm();
}
function criterionFields(name='',maximum=10){return '<div class="criterion-row">'+input('criterion_name','المعيار',name,'text',true,'minlength="2" maxlength="100"')+input('criterion_max','الدرجة الكاملة',maximum,'number',true,'min="0.5" max="1000" step="0.5"')+button('إزالة','data-remove-criterion')+'</div>';}
function examCard(x){
 const role=data.user.role;
 const statusLabel={pending_approval:'بانتظار اعتماد المشرف',scheduled:'معتمد وقادم',completed:'تم التقييم',cancelled:'ملغى',rejected:'مرفوض'}[x.status]||x.status;
 const canAssess=role==='halaqa_teacher'&&['scheduled','completed'].includes(x.status);
 const canCancel=role==='halaqa_teacher'&&x.created_by===data.user.id&&['pending_approval','scheduled'].includes(x.status);
 const criteria=x.criteria.map((c,i)=>'<p>'+esc(c.name)+': '+(x.result?x.result.scores[i]:'—')+' / '+c.maximum+'</p>').join('');
 const result=x.result?'<strong>'+(x.result.passed?'اجتاز':'يحتاج إعادة')+'</strong><p>'+esc(x.result.notes)+'</p>':'';
 const resultForm=canAssess?fold(x.result?'تصحيح النتيجة':'تسجيل النتيجة',form15('organizedResult'+x.id,input('day','يوم الاختبار',x.result?.day||today(),'date',true,'max="'+today()+'"')+x.criteria.map((c,i)=>input('score_'+i,c.name,x.result?.scores[i]??'','number',true,'min="0" max="'+c.maximum+'" step="0.5"')).join('')+input('notes','ملاحظات',x.result?.notes||'','text',false,'maxlength="2000"')+input('retake_due','موعد الإعادة عند عدم الاجتياز','','date',false)+'<button>حفظ نتيجة الاختبار</button>','data-kind="organizedResult" data-id="'+x.id+'"')):'';
 const cancel=canCancel?button(x.status==='pending_approval'?'إلغاء طلب الاختبار':'إلغاء الموعد','data-cancel-exam="'+x.id+'"'):'';
 return '<article class="halaqat-card"><h3>'+esc(x.title)+'</h3><p>'+x.due+' · '+statusLabel+'</p><p>'+esc(x.syllabus)+'</p><p>الاجتياز: '+x.pass_percent+'% · التكرار: '+(x.repeat_days?x.repeat_days+' يوم':'دون تكرار')+'</p>'+criteria+result+(x.next_exam_id?'<p>موعد متابعة مرتبط بالاختبار رقم '+x.next_exam_id+'</p>':'')+resultForm+cancel+'</article>';
}
function messageRows(rows){return rows.map(m=>'<article class="message '+(m.mine?'mine':'')+'"><strong>'+esc(m.sender)+'</strong><small>'+esc(dateTime(m.created_at))+'</small><p class="preserve-lines">'+esc(m.body)+'</p></article>').join('')||empty('لا توجد رسائل بعد.');}
function syncQuranForm(){const f=$('#quranForm');if(!f)return;const r=studentDev.quran.find(x=>x.number===Number(f.elements.surah.value));f.elements.status.value=r.status;f.elements.notes.value=r.notes;}
async function refreshOrganizations(){const c=await api('/api/halaqat/context');$('#halaqatMosque').innerHTML=c.mosques.map(m=>'<option value="'+m.id+'">'+esc(m.name)+'</option>').join('');$('#halaqatMosque').value=String(mid);}
function showImportPreview(d){importPreview=d;$('#importPreview').innerHTML=form15('importCommitForm','<h3>معاينة الملف</h3>'+d.rows.map(r=>'<article class="halaqat-card"><label class="toggle-label"><input type="checkbox" name="rows" value="'+r.row+'" '+(r.errors.length?'disabled':'checked')+'> الصف '+r.row+' · '+esc(r.data.full_name)+'</label><p>المتابع: '+(r.data.recipient_type==='guardian'?'ولي الأمر':'الطالب')+' · '+esc(r.data.guardian_name)+' · '+esc(r.data.guardian_phone)+'</p><p>'+esc(r.errors.join('، '))+'</p></article>').join('')+'<button>رفع الصفوف المحددة للمراجعة</button><small>لن يتم إنشاء حسابات قبل اعتماد المالك.</small>');}
async function submitDevelopment(f){
 const fd=new FormData(f),p=Object.fromEntries(fd),url=base()+'/students/'+sid;let dashboard=false;
 if(f.id==='quranForm'){const surah=p.surah;delete p.surah;await api(url+'/quran/'+surah,p,'PUT');}
 else if(f.id==='excuseForm')await api(url+'/excuses',p);
 else if(f.dataset.kind==='excuseReview')await api(url+'/excuses/'+f.dataset.id,p,'PUT');
 else if(f.id==='messageForm')await api(url+'/messages',p);
 else if(f.id==='organizedExamForm'){p.repeat_days=Number(p.repeat_days);p.pass_percent=Number(p.pass_percent);p.criteria=Array.from(f.querySelectorAll('.criterion-row')).map(r=>({name:r.querySelector('[name="criterion_name"]').value,maximum:Number(r.querySelector('[name="criterion_max"]').value)}));delete p.criterion_name;delete p.criterion_max;await api(url+'/organized-exams',p);}
 else if(f.dataset.kind==='organizedResult'){const x=studentDev.exams.find(x=>x.id===Number(f.dataset.id));const payload={day:p.day,notes:p.notes,retake_due:p.retake_due||null,scores:x.criteria.map((_,i)=>Number(p['score_'+i]))};await api(url+'/organized-exams/'+x.id+'/result',payload,'PUT');}
 else if(f.dataset.kind==='calendar'){await api(base()+'/rings/'+f.dataset.ring+'/calendar',{weekdays:fd.getAll('weekdays').map(Number),time_text:p.time_text},'PUT');dashboard=true;}
 else if(f.dataset.kind==='exception'){p.held=p.held==='true';await api(base()+'/rings/'+f.dataset.ring+'/calendar-exception',p,'PUT');dashboard=true;}
 else if(['announcementForm','ringAnnouncementForm'].includes(f.id)){p.halaqa_id=p.halaqa_id?Number(p.halaqa_id):null;p.expires=p.expires||null;await api(base()+'/announcements',p);dashboard=true;}
 else if(f.id==='mosqueCreateForm'){const m=await api('/api/halaqat/organizations',p);mid=m.id;await refreshOrganizations();dashboard=true;}
 else if(f.id==='mosqueRenameForm'){await api(base()+'/organization',p,'PUT');await refreshOrganizations();dashboard=true;}
 else if(f.id==='importForm'){const response=await fetch(base()+'/imports/preview',{method:'POST',headers:{'X-Portal-View':portalView},body:fd});const d=await response.json();if(!response.ok)throw Error(typeof d.detail==='string'?d.detail:'تعذر قراءة الملف');showImportPreview(d);status('راجع الصفوف ثم اعتمد السليم منها');return;}
 else if(f.id==='importCommitForm'){const d=await api(base()+'/imports/commit',{token:importPreview.token,rows:fd.getAll('rows').map(Number)});importPreview=null;await load();status('تم رفع '+d.count+' طلبات للمالك');return;}
 if(dashboard)await load();else await openFile(sid,false);status('تم الحفظ بنجاح');
}
document.addEventListener('submit',e=>{if(e.target.matches('[data-v15]')){e.preventDefault();run(()=>submitDevelopment(e.target));}});
document.addEventListener('change',e=>{if(e.target.id==='quranFilter')quranCards();if(e.target.form?.id==='quranForm'&&e.target.name==='surah')syncQuranForm();});
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-add-criterion')){if($('#examCriteria').children.length>=10){status('الحد الأقصى 10 معايير');return;}$('#examCriteria').insertAdjacentHTML('beforeend',criterionFields());}
 if(b.hasAttribute('data-remove-criterion'))b.closest('.criterion-row').remove();
 if(b.dataset.openMosque)run(async()=>{mid=Number(b.dataset.openMosque);$('#halaqatMosque').value=String(mid);await load();});
 if(b.dataset.studentArchive||b.dataset.accountArchive){showArchiveReason52(b);return;}
 if(b.dataset.announcementArchive)run(async()=>{await api(base()+'/announcements/'+b.dataset.announcementArchive+'/archive',{});await load();});
 if(b.dataset.calendarRemove)run(async()=>{await api(base()+'/rings/'+b.dataset.calendarRemove+'/calendar-exception/'+b.dataset.day,{},'DELETE');await load();});
 if(b.dataset.cancelExam)run(async()=>{await api(base()+'/students/'+sid+'/organized-exams/'+b.dataset.cancelExam+'/cancel',{});await openFile(sid,false);});
 if(b.dataset.reviewExam)run(async()=>{const note=prompt('ملاحظة للمراجعة (اختياري):');if(note===null)return;await api('/api/halaqat/mosques/'+mid+'/organized-exams/'+b.dataset.reviewExam+'/review',{status:b.dataset.reviewStatus,note},'PUT');await load();status(b.dataset.reviewStatus==='approved'?'تم اعتماد الاختبار':'تم رفض الاختبار');});
 if(b.dataset.reviewExcuse)run(async()=>{const note=prompt('ملاحظة للطالب أو ولي الأمر (اختياري):');if(note===null)return;await api(base()+'/students/'+b.dataset.studentId+'/excuses/'+b.dataset.reviewExcuse,{status:b.dataset.reviewStatus,note},'PUT');await load();status(b.dataset.reviewStatus==='approved'?'تم قبول العذر وتسجيل الغياب بعذر':'تم رفض العذر');});
 if(b.hasAttribute('data-audit-load'))run(async()=>{const d=await api(base()+'/audit?before='+b.dataset.auditLoad);if(b.dataset.auditLoad==='0')$('#auditRows').innerHTML='';else b.remove();$('#auditRows').insertAdjacentHTML('beforeend',d.rows.map(r=>'<article class="halaqat-card"><strong>'+esc(r.actor)+' · '+esc(r.action)+'</strong><small>'+esc(dateTime(r.at))+'</small><pre class="audit-details">'+esc(auditDetails(r.details))+'</pre></article>').join('')+(d.before?button('تعديلات أقدم','data-audit-load="'+d.before+'"'):''));status('تم تحميل سجل التعديلات');});
 if(b.dataset.messagesBefore)run(async()=>{const d=await api(base()+'/students/'+sid+'/messages?before='+b.dataset.messagesBefore);$('#messageRows').insertAdjacentHTML('afterbegin',messageRows(d.messages));if(d.before)b.dataset.messagesBefore=d.before;else b.remove();status('تم تحميل الرسائل السابقة');});
});
function auditDetails(value){try{const x=JSON.parse(value);return JSON.stringify(x,null,2);}catch{return value;}}

$('#halaqatMosque').onchange=()=>run(async()=>{mid=Number($('#halaqatMosque').value);$('#halaqatWorkspace').hidden=false;await load();});
run(async()=>{const initialRoute=location.hash.slice(1);const c=await api('/api/halaqat/context');$('#halaqatMosque').innerHTML=c.mosques.map(m=>'<option value="'+m.id+'">'+esc(m.name)+'</option>').join('');mid=c.mosques[0]?.id;if(!mid){renderEmpty31(c);return;}await load(initialRoute);});
// Owner management, reviewed roster and irreversible deletion preview (v16).
let managementTeachers=[],managementSupervisors=[];
function renderManagement(){
 if(data.user.role!=='owner')return;
 const body='<div id="permanentDelete31" class="danger31">'+select('deleteKind31','نوع العنصر',Object.entries(deleteLabels31))+'<label>بحث<input id="deleteSearch31" type="search"></label><div id="deleteTargets31"></div></div>';
 $('#halaqatWorkspace .halaqat-grid').insertAdjacentHTML('beforeend',panel('الحذف النهائي',body));
 showTargets31();
}

document.addEventListener('submit',e=>{
 const f=e.target;if(!f.dataset.manage)return;e.preventDefault();run(async()=>{
  const fd=new FormData(f),p=Object.fromEntries(fd),kind=f.dataset.manage,id=f.dataset.id;
  if(kind==='ring'){p.teacher_ids=fd.getAll('teacher_ids').map(Number);p.supervisor_ids=fd.getAll('supervisor_ids').map(Number);await api(base()+'/rings/'+id,p,'PUT');}
  else if(kind==='delete'){await api(base()+'/rings/'+id,p,'DELETE');}
  await load();status('تم الحفظ بنجاح');
 });
});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.deleteAccount)run(async()=>{const p=await api(base()+'/accounts/'+b.dataset.deleteAccount+'/deletion-preview');const typed=prompt('حذف نهائي للحساب ولا يمكن التراجع عنه.\nاكتب الاسم كاملًا للتأكيد:\n'+p.name,'');if(typed===null)return;if(typed.trim()!==p.name)throw Error('الاسم لا يطابق اسم الحساب');await api(base()+'/accounts/'+b.dataset.deleteAccount,{confirm_name:typed.trim(),token:p.token},'DELETE');await load();status('تم حذف الحساب نهائيًا');});
 if(b.hasAttribute('data-delete-mosque'))run(async()=>{const p=await api(base()+'/organization/deletion-preview');const typed=prompt('سيتم حذف المجمع بالكامل مع حلقاته وبياناته التابعة. لا يمكن التراجع عنه.\nاكتب اسم المجمع كاملًا للتأكيد:\n'+p.name,'');if(typed===null)return;if(typed.trim()!==p.name)throw Error('الاسم لا يطابق اسم المجمع');await api(base()+'/organization',{confirm_name:typed.trim(),token:p.token},'DELETE');location.assign('/');});
});
document.addEventListener('click',e=>{const b=e.target.closest('[data-delete-ring]');if(!b)return;run(async()=>{
 const id=b.dataset.deleteRing,p=await api(base()+'/rings/'+id+'/deletion-preview');
 const target=$('#deleteRing'+id);if(!target)return;
 target.innerHTML='<div class="absence-alert"><p>حذف نهائي للحلقة وطلابها وسجلاتهم. لا يمكن التراجع عنه من النظام.</p><p>عدد ملفات الطلاب: '+p.counts.students+' · طلبات الحسابات: '+p.counts.requests+'</p><form data-manage="delete" data-id="'+id+'" class="halaqat-form">'+input('confirm_name','اكتب اسم الحلقة للتأكيد: '+p.name)+input('token','',p.token,'hidden')+'<button>حذف نهائي بكل السجلات</button></form></div>';
 });
});
function accessRequestCard(r,owner=false){
 const details=(r.details||[]).map(x=>'<p>'+esc(x)+'</p>').join('');
 const review=r.review_note?'<p><strong>ملاحظة المدير:</strong> '+esc(r.review_note)+'</p>':'';
 const actions=owner&&r.status==='pending'?'<div class="actions">'+button('موافقة','data-change-approve="'+r.id+'"')+button('رفض','data-change-reject="'+r.id+'"')+'</div>':'';
 return '<article class="halaqat-card"><span class="halaqat-badge '+esc(r.status)+'">'+esc(r.status_label)+'</span><h3>'+esc(r.action_label)+'</h3>'+details+'<p><strong>السبب:</strong> '+esc(r.reason||'—')+'</p><small>رفع الطلب: '+esc(r.requested_by||'—')+'</small>'+review+actions+'</article>';
}
function renderAccessManagement(){
 if(!accessOverview||!$('#halaqatWorkspace .halaqat-grid'))return;
 let out='';
 if(data.user.role==='owner'){
  const roleOpts=[['supervisor','مشرف'],['teacher','مدرس'],['student','طالب'],['guardian','ولي أمر']];
  const ringOptions=[['','بدون ربط الآن'],...accessOverview.rings.map(x=>[x.id,x.name])];
  const studentOptions=[['','بدون ربط الآن'],...accessOverview.unlinked_students.map(x=>[x.id,x.name])];
  const create='<details open><summary>إصدار حساب جديد</summary><form class="halaqat-form" data-access="create-user">'+input('full_name','الاسم الكامل','','text',true,'minlength="2" maxlength="180"')+input('username','اسم المستخدم','','text',true,'minlength="3" maxlength="30"')+select('role','نوع الحساب',roleOpts)+input('email','البريد الإلكتروني (اختياري)','','email',false,'maxlength="200"')+select('halaqa_id','الحلقة للمدرس أو المشرف',ringOptions,'',false)+select('student_id','ملف الطالب لحساب الطالب أو ولي الأمر',studentOptions,'',false)+'<small>اختر مدرسًا ثم اسنده للحلقة، أو اختر طالبًا/ولي أمر واربطه بملف الطالب. يصدر النظام كلمة مرور مؤقتة.</small><button>إصدار الحساب</button></form></details>';
  const addStudent='<details><summary>إضافة ملف طالب جديد</summary><form id="studentRequestForm" class="halaqat-form">'+accountFields(true)+'<button>حفظ ملف الطالب</button></form></details>';
  const pending='<details><summary>طلبات الحسابات والملفات ('+data.stats.pending_requests+')</summary>'+requests()+'</details>';
  const users='<details><summary>الحسابات الحالية</summary>'+accessOverview.users.map(u=>'<details class="account-row"><summary>'+esc(u.name)+' · '+esc(u.role_label)+(u.active?'':' · موقوف')+'</summary><form class="halaqat-form" data-access="edit-user" data-id="'+u.id+'">'+input('full_name','الاسم الكامل',u.name)+input('username','اسم المستخدم',u.username,'text',true,'minlength="3" maxlength="30"')+input('email','البريد الإلكتروني',u.email,'email',false)+select('active','حالة الحساب',[['true','فعال'],['false','موقوف']],String(u.active))+'<button>حفظ بيانات الحساب</button></form><div class="actions">'+button('إصدار رمز مؤقت جديد','data-reset="'+u.id+'"')+button(u.active?'أرشفة الحساب':'استعادة الحساب','data-account-archive="'+u.id+'" data-active="'+!u.active+'"')+'</div></details>').join('')+'</details>';
  const changes='<details><summary>طلبات التعديلات الكبيرة ('+accessOverview.pending_count+')</summary>'+(accessOverview.change_requests.length?accessOverview.change_requests.map(r=>accessRequestCard(r,true)).join(''):empty('لا توجد طلبات تعديل.'))+'</details>';
  out+=panel('الحسابات والمستخدمون',create+addStudent+pending+users+changes);
 }else if(data.user.role==='halaqa_supervisor'){
  const teacher='<details><summary>طلب حساب مدرس</summary><form id="teacherRequestForm" class="halaqat-form">'+accountFields()+'<button>رفع الطلب للمالك</button></form></details>';
  const student='<details><summary>إضافة ملف طالب وطلب حسابه</summary><form id="studentRequestForm" class="halaqat-form">'+accountFields(true)+'<button>رفع الملف للمالك</button></form></details>';
  const changes='<details><summary>طلبات التعديلات المرفوعة</summary>'+(accessOverview.change_requests.length?accessOverview.change_requests.map(r=>accessRequestCard(r,false)).join(''):empty('لم ترفع طلبات تعديل كبيرة بعد.'))+'</details>';
  out+=panel('الحسابات والطلبات',teacher+student+'<details><summary>طلبات الحسابات</summary>'+requests()+'</details>'+changes);
 }
 if(out)$('#halaqatWorkspace .halaqat-grid').insertAdjacentHTML('beforeend',out);
 const sf=$('#studentRequestForm');if(sf)syncRecipient(sf);
}


document.addEventListener('submit',e=>{
 const f=e.target;if(!f.dataset.access)return;e.preventDefault();run(async()=>{
  const fd=new FormData(f),p=Object.fromEntries(fd),kind=f.dataset.access;
  if(kind==='create-user'){
   p.halaqa_id=p.halaqa_id?Number(p.halaqa_id):null;p.student_id=p.student_id?Number(p.student_id):null;
   credentials(await api('/api/access/mosques/'+mid+'/users',p));
  }else if(kind==='edit-user'){
   p.active=p.active==='true';await api('/api/access/mosques/'+mid+'/users/'+f.dataset.id,p,'PUT');
  }else if(kind==='change-ring'){
   await api('/api/v32/mosques/'+mid+'/rings/'+Number(p.ring_id),{name:p.name,schedule:p.schedule},'PUT');
  }else if(kind==='change-teachers'){
   p.action_type='teacher_assignment';p.ring_id=Number(p.ring_id);p.teacher_ids=fd.getAll('teacher_ids').map(Number);await api('/api/access/mosques/'+mid+'/change-requests',p);
  }
  await load();status(kind.startsWith('change-')?'تم رفع الطلب للمالك للموافقة':'تم الحفظ بنجاح');
 });
});
document.addEventListener('click',e=>{const b=e.target.closest('[data-change-approve],[data-change-reject]');if(!b)return;run(async()=>{
 const approve=b.hasAttribute('data-change-approve'),id=b.dataset.changeApprove||b.dataset.changeReject;
 const note=prompt(approve?'ملاحظة الموافقة (اختياري):':'سبب الرفض (اختياري):','');if(note===null)return;
 await api('/api/access/mosques/'+mid+'/change-requests/'+id+'/'+(approve?'approve':'reject'),{note});await load();status(approve?'تم اعتماد التعديل وتنفيذه':'تم رفض طلب التعديل');
 });
});
// v19 learning tools. Student/guardian views only receive their own private records.
let learningData=null,studentLearning=null,contestData=[],queueState=null;
const form19=(id,body,attrs='')=>'<form id="'+id+'" data-learning class="halaqat-form" '+attrs+'>'+body+'</form>';
const dateAgo=n=>{const d=new Date(today()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10);};
const staff19=()=>data.user.role!=='halaqa_student',manager19=()=>['owner','halaqa_supervisor'].includes(data.user.role);
function renderLearningDashboard(){
 let h='';const role=data.user.role;
 if(['halaqa_teacher','halaqa_student'].includes(role))h+=panel('دور التسميع',form19('queueViewForm',select('halaqa_id','الحلقة',ringOpts())+input('day','اليوم',today(),'date')+'<button>عرض / تحديث الدور</button>')+'<div id="queueResult"></div><small>الطالب وولي الأمر يشاهدان ما يخصهما فقط.</small>');
 const list=contestData.map(contestCard).join('')||empty('لا توجد مسابقات أو تكريمات.');
 if(manager19())h+=panel('المسابقات والتكريمات',fold('إنشاء مسابقة أو هدف',form19('competitionForm',select('halaqa_id','الحلقة',ringOpts())+input('title','عنوان المسابقة')+select('mode','نوع الهدف',[['individual','فردي'],['team','جماعي']])+input('target','المقدار المستهدف',10,'number',true,'min="0.01" step="0.01" max="100000"')+input('unit','وحدة القياس','نقطة')+input('start','البداية',today(),'date')+input('end','النهاية',today(),'date')+input('reward','التكريم أو المكافأة','','text',false)+'<fieldset><legend>المشاركون</legend><div id="competitionMembers">اختر الحلقة أولًا</div></fieldset><button>إنشاء المسابقة</button>'))+'<div class="contest-list">'+list+'</div>');
 else if(role==='halaqa_teacher')h+=panel('المسابقات والتكريمات',list);
 if(h)$('#halaqatWorkspace .halaqat-grid').insertAdjacentHTML('beforeend',h);
}
function contestCard(c){
 let h='<h3>'+esc(c.title)+'</h3><p>'+esc(c.ring)+' · '+(c.mode==='team'?'هدف جماعي':'هدف فردي')+' · '+c.target+' '+esc(c.unit)+'</p><p>'+c.start+' — '+c.end+(c.active?'':' · مغلقة')+'</p><p>التكريم: '+esc(c.reward||'غير محدد')+'</p>'+(c.mode==='team'?'<p>مجموع الإنجاز المعتمد: '+c.team_total+'</p>':'');
 h+=c.entries.map(e=>'<div class="halaqat-card"><strong>'+esc(e.name)+'</strong><p>'+e.value+' '+esc(c.unit)+' · '+({empty:'لم تسجل نتيجة',pending:'بانتظار اعتماد المشرف',approved:'معتمد',rejected:'مرفوض'}[e.status])+(e.awarded?' · 🏅 تم اعتماد التكريم':'')+'</p><p>'+esc(e.notes)+'</p>'+(staff19()&&c.active?form19('contestScore'+e.id,input('value','الإنجاز الكلي للمسابقة',e.value,'number',true,'min="0" max="100000" step="0.01"')+input('notes','ملاحظات',e.notes,'text',false)+'<button>رفع النتيجة للمراجعة</button>','data-kind="contestScore" data-contest="'+c.id+'" data-entry="'+e.id+'"'):'')+(manager19()&&c.active&&e.status==='pending'?button('اعتماد النتيجة','data-review-entry="'+e.id+'" data-contest="'+c.id+'" data-state="approved"')+button('رفض النتيجة','data-review-entry="'+e.id+'" data-contest="'+c.id+'" data-state="rejected"'):'')+'</div>').join('');
 if(manager19())h+=button('اعتماد التكريم للمستحقين','data-award-contest="'+c.id+'" data-awarded="true"')+button('سحب اعتماد التكريم','data-award-contest="'+c.id+'" data-awarded="false"')+button(c.active?'إغلاق المسابقة':'إعادة فتح المسابقة','data-active-contest="'+c.id+'" data-active="'+!c.active+'"')+'<small>يعتمد التكريم بعد انتهاء الفترة ومراجعة نتائج الجميع. اسحب التكريم أولًا لتصحيح النتائج.</small>';
 return '<details class="halaqat-card"><summary>'+esc(c.title)+'</summary>'+h+'</details>';
}
function renderQueue(q,rid){
 queueState={...q,rid};let h='<p>الدور الحالي: '+(q.current_position??'لا يوجد')+' · إجمالي القائمة: '+q.total+'</p>'+q.rows.map(x=>'<p>'+x.position+' — '+esc(x.name)+' · '+({waiting:'بانتظار الدور',called:'دورك الآن',done:'تم التسميع',skipped:'تجاوز'}[x.status])+'</p>').join('');
 if(staff19()){
 const rows=data.students.filter(s=>s.halaqa_id===rid);const old=q.rows.map(x=>x.student_id);rows.sort((a,b)=>(old.indexOf(a.id)<0?999:old.indexOf(a.id))-(old.indexOf(b.id)<0?999:old.indexOf(b.id)));
 h+=q.current_id?button('إنهاء الدور والانتقال للتالي','data-next-turn'):'';
 h+=fold('تجهيز ترتيب الطلاب',form19('queueSetForm', '<p>اختر المشاركين وحدد ترتيبهم. الحفظ يعيد بدء الدور لهذا اليوم.</p>'+rows.map((s,i)=>'<div class="halaqat-card"><label><input type="checkbox" name="member" value="'+s.id+'" checked> '+esc(s.name)+'</label>'+input('position_'+s.id,'الترتيب',i+1,'number',true,'min="1" max="300"')+'</div>').join('')+'<button>حفظ الترتيب وبدء التسميع</button>'));
 }
 $('#queueResult').innerHTML=h;
}
function renderLearningFile(){
 const l=studentLearning,g=l.goal,editable=file.can_edit;let h='';
 h+=panel('خطة الختم الشخصية',g?'<h3>'+esc(g.title)+'</h3><p>المنجز المعتمد: '+g.completed+' / '+g.target+' '+unit(g.unit)+' · '+g.percent+'%</p><p>المتبقي: '+g.remaining+' · '+(g.overdue?'تجاوز موعد الهدف؛ حدّث الخطة':('المطلوب أسبوعيًا تقريبًا: '+g.weekly+' '+unit(g.unit)))+'</p><p>'+g.start+' — '+g.deadline+'</p><p>'+esc(g.notes)+'</p>':empty('لم توضع خطة ختم بعد.'));
 if(editable)h+=panel('إعداد هدف الختم',fold('تعديل الهدف والمنجز',form19('goalForm',input('title','اسم الهدف',g?.title||'ختم الحفظ')+select('unit','وحدة الخطة',[['page','وجه'],['ayah','آية']],g?.unit||'page')+input('target','المقدار الكلي المستهدف',g?.target||604,'number',true,'min="0.01" max="100000" step="0.01"')+input('completed','المنجز الكلي المعتمد من الشيخ',g?.completed||0,'number',true,'min="0" max="100000" step="0.01"')+input('start','بداية الخطة',g?.start||today(),'date')+input('deadline','موعد إكمال الهدف',g?.deadline||today(),'date')+input('notes','ملاحظات',g?.notes||'','text',false)+'<button>حفظ خطة الختم</button><small>المنجز يدخله الشيخ بعد التحقق؛ لا يجمع تلقائيًا سجلات التسميع لتجنب احتساب تكرار المواضع. الأسبوع مقدر بسبعة أيام تقويمية.</small>')));
 h+=panel('سجل أخطاء التسميع',l.mistakes.map(m=>'<div class="halaqat-card"><strong>'+esc(m.surah_name)+' — آية '+m.ayah+'</strong><p>'+esc(l.kinds[m.kind])+' · '+esc(supportLabels[m.support]||'مراجعة')+' · '+m.day+' · تكرر '+m.repetitions+' مرة · '+(m.resolved?'تمت المعالجة':'يحتاج مراجعة')+'</p><p>'+esc(m.notes)+'</p>'+(editable?button('تعديل / معالجة الخطأ','data-edit-mistake="'+m.id+'"'):'')+'</div>').join('')||empty('لا توجد أخطاء مسجلة.'));
 if(editable)h+=panel('تسجيل موضع خطأ',form19('mistakeForm',input('day','اليوم',today(),'date',true,'max="'+today()+'"')+select('surah','السورة',l.surahs.map((n,i)=>[i+1,n]))+select('ayah','الآية',Array.from({length:studentLearning.ayah_counts[0]},(_,i)=>[i+1,'آية '+(i+1)]))+select('kind','نوع الخطأ',Object.entries(l.kinds))+select('support','مستوى المتابعة',Object.entries(supportLabels))+select('resolved','الحالة',[['false','يحتاج مراجعة'],['true','تمت المعالجة']])+input('notes','وصف الخطأ','','text',false)+'<button>حفظ الخطأ</button>'+button('إلغاء التعديل / خطأ جديد','data-reset-mistake')));
 h+=panel('المراجعة المنزلية','<p>إقرار ولي الأمر بالمراجعة في المنزل، مستقل عن تسميع الشيخ ودرجاته.</p>'+l.home.map(x=>'<div class="halaqat-card"><strong>'+x.day+' · '+x.minutes+' دقيقة</strong><p>ولي الأمر: '+esc(x.guardian)+' · الورد رقم '+x.assignment_id+'</p><p>'+esc(x.notes)+'</p></div>').join('')+(l.can_practice?form19('homePracticeForm',select('assignment_id','الورد الذي تمت مراجعته',[['','اختر الورد'],...follow.assignments.map(a=>[a.id,a.due+' — '+(a.memorization||a.revision)])])+input('day','يوم المراجعة',today(),'date',true,'max="'+today()+'"')+input('minutes','مدة المراجعة بالدقائق',15,'number',true,'min="1" max="600"')+input('notes','ملاحظتك','','text',false)+'<button>تأكيد المراجعة المنزلية</button><small>حفظ نفس الورد واليوم يصحح تأكيدك السابق ولا يكرره.</small>'):''));
 h+=panel('التقرير الفصلي المقارن',form19('termReportForm',input('start','من',dateAgo(89),'date')+input('end','إلى',today(),'date',true,'max="'+today()+'"')+'<button>مقارنة بالفترة السابقة</button>')+'<div id="termReportResult"></div><small>المقارنة بفترة سابقة مساوية بالمدة. الأوجه والآيات منفصلة. نسبة الحضور من الحضور والغياب المسجلين فقط، ولا تشمل الغياب بعذر أو الاستئذان أو الأيام غير المسجلة.</small>');
 $('#studentFile .halaqat-grid').insertAdjacentHTML('beforeend',h);
}
function renderTerm(r){const labels={recorded_days:'أيام مسجلة',present:'أيام حضور',absent:'أيام غياب',excused:'أيام غياب بعذر',permission:'أيام استئذان',attendance_percent:'نسبة الحضور %',memorized_pages:'الحفظ بالأوجه',memorized_ayahs:'الحفظ بالآيات',revision_pages:'المراجعة بالأوجه',revision_ayahs:'المراجعة بالآيات',memorization_score:'متوسط الحفظ / 10',tajweed_score:'متوسط التجويد / 10'};$('#termReportResult').innerHTML='<p>الحالية: '+r.current.from+' — '+r.current.to+'</p><p>السابقة: '+r.previous.from+' — '+r.previous.to+'</p><div style="overflow-x:auto"><table class="learning-table"><thead><tr><th>المؤشر</th><th>الحالية</th><th>السابقة</th><th>الفرق</th></tr></thead><tbody>'+Object.entries(labels).map(([k,v])=>'<tr><td>'+v+'</td><td>'+(r.current[k]??'—')+'</td><td>'+(r.previous[k]??'—')+'</td><td>'+(r.current[k]===null||r.previous[k]===null?'—':Math.round((r.current[k]-r.previous[k])*100)/100)+'</td></tr>').join('')+'</tbody></table></div>';}
document.addEventListener('submit',e=>{const f=e.target;if(!f.hasAttribute('data-learning'))return;e.preventDefault();run(async()=>{
 const fd=new FormData(f),p=Object.fromEntries(fd),url=base()+'/students/'+sid;
 if(f.id==='goalForm'){p.target=Number(p.target);p.completed=Number(p.completed);await api(url+'/completion-goal',p,'PUT');}
 else if(f.id==='mistakeForm'){p.surah=Number(p.surah);p.ayah=Number(p.ayah);p.resolved=p.resolved==='true';await api(url+'/mistakes'+(f.dataset.editId?'/'+f.dataset.editId:''),p,f.dataset.editId?'PUT':'POST');}
 else if(f.id==='homePracticeForm'){p.assignment_id=Number(p.assignment_id);p.minutes=Number(p.minutes);await api(url+'/home-practice',p);}
 else if(f.id==='termReportForm'){renderTerm(await api(url+'/term-report?start='+p.start+'&end='+p.end));status('تم تحميل المقارنة');return;}
 else if(f.id==='queueViewForm'){renderQueue(await api(base()+'/rings/'+p.halaqa_id+'/queue?day='+p.day),Number(p.halaqa_id));status('تم تحديث الدور');return;}
 else if(f.id==='queueSetForm'){const ids=fd.getAll('member').map(Number).sort((a,b)=>Number(p['position_'+a])-Number(p['position_'+b]));if(!ids.length)throw Error('اختر طالبًا واحدًا على الأقل');if(new Set(ids.map(id=>Number(p['position_'+id]))).size!==ids.length)throw Error('لا تكرر رقم الترتيب');if(queueState.total&&!confirm('إعادة بدء قائمة التسميع لهذا اليوم؟'))return;await api(base()+'/rings/'+queueState.rid+'/queue',{day:queueState.day,student_ids:ids,reset:!!queueState.total},'PUT');renderQueue(await api(base()+'/rings/'+queueState.rid+'/queue?day='+queueState.day),queueState.rid);status('تم حفظ الترتيب');return;}
 else if(f.id==='substituteForm'){const rid=p.halaqa_id;delete p.halaqa_id;p.user_id=Number(p.user_id);await api(base()+'/rings/'+rid+'/substitutes',p);await load();status('تم الحفظ بنجاح');return;}
 else if(f.id==='competitionForm'){delete p.member;p.halaqa_id=Number(p.halaqa_id);p.target=Number(p.target);p.student_ids=fd.getAll('member').map(Number);await api(base()+'/competitions',p);await load();status('تم الحفظ بنجاح');return;}
 else if(f.dataset.kind==='contestScore'){p.value=Number(p.value);await api(base()+'/competitions/'+f.dataset.contest+'/entries/'+f.dataset.entry,p,'PUT');await load();status('تم الحفظ بنجاح');return;}
 await openFile(sid,false);status('تم الحفظ بنجاح');
});});
document.addEventListener('change',e=>{if(e.target.form?.id==='competitionForm'&&e.target.name==='halaqa_id')$('#competitionMembers').innerHTML=data.students.filter(s=>s.halaqa_id===Number(e.target.value)).map(s=>'<label><input type="checkbox" name="member" value="'+s.id+'" checked> '+esc(s.name)+'</label>').join('')||empty('لا يوجد طلاب فعالون');});
document.addEventListener('input',e=>{if(e.target.id==='missingSearch')document.querySelectorAll('[data-missing-name]').forEach(x=>x.hidden=!x.dataset.missingName.includes(e.target.value));});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.editMistake){const m=studentLearning.mistakes.find(m=>m.id===Number(b.dataset.editMistake)),f=$('#mistakeForm');f.dataset.editId=m.id;syncVerse20(m.surah);for(const k of ['day','surah','ayah','kind','support','notes','resolved'])f.elements[k].value=String(m[k]);f.scrollIntoView({behavior:'smooth'});return;}
 if(b.hasAttribute('data-reset-mistake')){const f=$('#mistakeForm');delete f.dataset.editId;f.reset();return;}
 if(b.hasAttribute('data-next-turn'))run(async()=>{await api(base()+'/rings/'+queueState.rid+'/queue/next',{day:queueState.day,current_id:queueState.current_id});renderQueue(await api(base()+'/rings/'+queueState.rid+'/queue?day='+queueState.day),queueState.rid);status('تم تحديث الدور');});
 if(b.dataset.revokeSub)run(async()=>{await api(base()+'/rings/'+b.dataset.ring+'/substitutes/'+b.dataset.revokeSub,{},'DELETE');await load();});
 if(b.dataset.reviewEntry)run(async()=>{await api(base()+'/competitions/'+b.dataset.contest+'/entries/'+b.dataset.reviewEntry+'/review',{status:b.dataset.state},'PUT');await load();});
 if(b.dataset.awardContest)run(async()=>{await api(base()+'/competitions/'+b.dataset.awardContest+'/award',{awarded:b.dataset.awarded==='true'},'PUT');await load();});
 if(b.dataset.activeContest)run(async()=>{await api(base()+'/competitions/'+b.dataset.activeContest+'/active',{awarded:b.dataset.active==='true'},'PUT');await load();});
});
// Version 20: grouped workspace, support plans, live threads and device notifications.
let advanced=null,notificationSettings=null;
const supportLabels={strong:'تثبيت قوي',light:'تثبيت خفيف',review:'مراجعة'};
const activeTabs20={};
const form20=(id,body,attrs='')=>'<form id="'+id+'" data-advanced class="halaqat-form" '+attrs+'>'+body+'</form>';
function showError20(message){let el=$('#toast20');if(!el){el=document.createElement('div');el.id='toast20';el.className='toast20';el.setAttribute('role','alert');document.body.append(el);}el.innerHTML='<span>'+esc(message)+'</span>'+button('تحديث الشاشة','data-reload-ui46')+button('إغلاق','data-close-toast');}
function syncVerse20(surah){const f=$('#mistakeForm');if(!f)return;const n=Number(surah||f.elements.surah.value),old=f.elements.ayah.value;f.elements.ayah.innerHTML=Array.from({length:studentLearning.ayah_counts[n-1]},(_,i)=>'<option value="'+(i+1)+'">آية '+(i+1)+'</option>').join('');if(Number(old)<=studentLearning.ayah_counts[n-1])f.elements.ayah.value=old;}
function organize20(id,isFile){
 const root=$('#'+id);if(!root)return;
 root.querySelector('.workspace-tabs')?.remove();
 root.querySelectorAll('.tab-content').forEach(section=>{section.hidden=false;while(section.firstChild)section.parentElement?.insertBefore(section.firstChild,section);section.remove();});
}
function applyV25CommunicationGroup(){
 const root=$('#halaqatWorkspace'),grid=root?.querySelector('.halaqat-grid');if(!grid||grid.querySelector('.v25-communication-master'))return;
 const rx=/إعلان|مراسلات|تواصل|جدول اللقاءات|إجازات|اعتذارات/;
 const items=[...grid.querySelectorAll(':scope > .halaqat-panel')].filter(p=>rx.test((p.querySelector('h2')?.textContent||'').trim()));
 if(!items.length)return;
 const wrap=document.createElement('details');wrap.className='v25-communication-master v25-accordion';
 const summary=document.createElement('summary');summary.innerHTML='<span>التواصل والإعلانات</span><small>الإعلانات · الفعاليات والمواعيد · التواصل</small>';
 const body=document.createElement('div');body.className='v25-master-body';items[0].before(wrap);wrap.append(summary,body);items.forEach(x=>body.append(x));
}
function activate20(id,index){activeTabs20[id]=Number(index);const r=$('#'+id);r.querySelectorAll('.tab-content').forEach((p,i)=>p.hidden=i!==Number(index));r.querySelectorAll('[data-tab]').forEach(b=>{const selected=Number(b.dataset.tab)===Number(index);b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});}
function reveal20(target){const g=target?.closest('.tab-content');if(g){const id=g.closest('#studentFile,#halaqatWorkspace').id;activate20(id,Number(g.id.split('-').at(-1)));}for(let p=target?.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;}
async function renderAdvancedDashboard(){
 const headerTitle=$('.halaqat-header h1');if(headerTitle)headerTitle.textContent='حلقات مشكاة ونور';
 const headerSubtitle=$('.halaqat-header p');if(headerSubtitle)headerSubtitle.textContent=data.user.role==='halaqa_student'?(data.user.account_type==='guardian'?'متابعة الأبناء والحفظ والتقييم':'الحفظ والتقييم والورد القادم'):'إدارة المجمعات والحلقات والطلاب من مكان واحد.';
 let h='';
 if(data.user.role==='halaqa_teacher')h+=panel('دفتر المعلم دون إنترنت','<p>يمكن تجهيز قائمة اليوم وتسجيل الحضور والتسميع ثم مزامنة المسودات عند عودة الاتصال.</p><a class="halaqat-btn" href="/offline?mid='+mid+'">فتح دفتر اليوم</a>');
 if(h)$('#halaqatWorkspace .halaqat-grid').insertAdjacentHTML('beforeend',h);
}
function renderAdvancedFile(){
 const a=advanced,edit=file.can_edit,manager=['owner','halaqa_supervisor'].includes(data.user.role);let h='';
 h+=panel('ملخص المتابعة',a.risk.reasons.length?'<div class="risk-note">'+esc(a.risk.reasons.join(' · '))+'</div>':empty('لا توجد مؤشرات تعثر حاليًا حسب السجلات.') );
 h+=panel('خريطة الأجزاء الثلاثين','<p>حالة الجزء يعتمدها الشيخ مستقلًا عن حالة السور، لتجنب احتساب سورة جزئية كجزء كامل.</p><div class="juz-grid">'+a.juz.map(j=>'<div class="quran-cell state-'+j.status+'"><strong>الجزء '+j.juz+'</strong><span>'+esc(studentDev.quran_states[j.status])+'</span><small>'+esc(j.notes)+'</small></div>').join('')+'</div>'+(edit?fold('تحديث جزء',form20('juzForm',select('juz','الجزء',a.juz.map(j=>[j.juz,'الجزء '+j.juz]))+select('status','حالة الإتقان',Object.entries(studentDev.quran_states))+input('notes','ملاحظات','','text',false)+'<button>اعتماد الجزء</button>')):''));
 h+=panel('المراجعة المتباعدة','<p>مقترحات من أخطاء الطالب وسجل المراجعات المعتمدة، ولا تتحول إلى ورد إلا بعد اعتماد الشيخ.</p>'+a.suggestions.map(r=>'<details><summary>'+esc(r.name)+' · '+r.due+'</summary><p>'+esc(r.reason)+' · '+esc(supportLabels[r.support])+' · آخر مراجعة: '+esc(r.last_review||'غير مسجلة')+'</p>'+(edit?form20('reviewApprove'+r.surah,input('due','موعد المراجعة',r.due<today()?today():r.due,'date')+input('notes','تعليمات ونطاق الآيات','','text',false)+'<button>اعتماد ورد المراجعة</button>','data-kind="reviewApprove" data-surah="'+r.surah+'"')+(r.assignment_id?form20('reviewResult'+r.surah,input('day','يوم التسميع',today(),'date')+input('score','درجة الإتقان / 10',8,'number',true,'min="0" max="10"')+'<button>تسجيل النتيجة وحساب الموعد التالي</button>','data-kind="reviewResult" data-surah="'+r.surah+'"'):''):'')+'</details>').join('')+(a.suggestions.length?'':empty('ابدأ بتحديث خريطة السور أو تسجيل مواضع الأخطاء.')));
 h+=panel('الخطط العلاجية',a.plans.map(p=>'<details open><summary>'+esc(p.title)+' · '+({active:'نشطة',completed:'مكتملة',cancelled:'ملغاة'}[p.status])+'</summary><p>'+p.start+' — '+p.end+'</p>'+p.tasks.map((t,i)=>'<label><input type="checkbox" data-plan-task="'+p.id+'" data-index="'+i+'" '+(t.done?'checked':'')+' '+(!edit?'disabled':'')+'> '+esc(t.text)+'</label>').join('')+'<p>'+esc(p.outcome)+'</p>'+(edit?form20('planUpdate'+p.id,select('status','الحالة',[['active','نشطة'],['completed','مكتملة'],['cancelled','ملغاة']],p.status)+input('outcome','النتيجة والملاحظات',p.outcome,'text',false)+'<button>حفظ متابعة الخطة</button>','data-kind="planUpdate" data-id="'+p.id+'"'):'')+'</details>').join('')+(edit?fold('إنشاء خطة قصيرة',form20('supportPlanForm',input('title','هدف الخطة')+input('start','البداية',today(),'date')+input('end','النهاية',today(),'date')+textArea('tasks','المهام: كل مهمة في سطر مستقل','',6000)+'<button>إنشاء الخطة</button>')):'')+(a.plans.length?'':empty('لا توجد خطة علاجية بعد.')));
 h+=panel('حجز مختبر واعتماد الانتقال',a.bookings.map(b=>'<div class="halaqat-card"><strong>'+esc(b.title)+'</strong><p>'+esc(b.examiner)+' · '+b.due+' الساعة '+b.time+' بتوقيت الرياض</p><p>المستوى التالي: '+esc(b.next_level||'غير محدد')+' · '+(b.approved?'الانتقال معتمد':'لم يعتمد الانتقال')+'</p>'+(manager&&!b.approved?button('اعتماد الانتقال بعد الاجتياز','data-promote="'+b.exam_id+'"'):'')+'</div>').join('')+(manager?fold('تعيين المختبر والموعد',form20('bookingForm',select('exam_id','الاختبار القادم',[['','اختر الاختبار'],...studentDev.exams.filter(e=>e.status==='scheduled').map(e=>[e.id,e.title+' — '+e.due])])+select('examiner_id','المختبر',[['','اختر المختبر'],...a.teachers.map(t=>[t.id,t.name])])+input('time','الساعة بتوقيت الرياض','16:00','time')+input('next_level','المستوى بعد الاجتياز','','text',false)+'<button>حفظ الحجز</button>')):''));
 $('#studentFile .halaqat-grid').insertAdjacentHTML('beforeend',h);
 const chat=$('#messageRows');if(chat){chat.classList.add('chat-thread');chat.setAttribute('aria-live','polite');const heading=chat.closest('.halaqat-panel')?.querySelector('h2');if(heading)heading.textContent='المحادثة المباشرة';}
 syncVerse20();
}
async function updateBell53(open=false){
 if(!data?.user||document.querySelector('meta[name="demo-base42"]'))return;
 const feed=await api('/api/notifications/inbox'),bell=$('#notificationToggle50');
 let badge=bell.querySelector('.notice-count53');
 if(!badge){badge=document.createElement('span');badge.className='notice-count53';bell.append(badge);}
 const digests=feed.digests||[],unread=feed.items.filter(n=>!n.seen).length+digests.filter(d=>!d.seen).length;badge.hidden=!unread;badge.textContent=String(unread);
 bell.setAttribute('aria-label','الإشعارات، '+unread+' جديدة');
 if(!open)return;
 await renderNotificationSettings();const box=$('#notificationBox');box.open=true;
 box.querySelector('summary').insertAdjacentHTML('afterend','<section class="day-card53"><h3>آخر الإشعارات</h3>'+ (digests.map(d=>'<p>'+esc(d.day)+' · '+esc(d.text)+'</p>').join('')+feed.items.map(n=>'<p>'+esc(n.text)+' · '+esc(dateTime46(n.at))+'</p>').join('')||'ستظهر هنا تحديثات الحضور والتقييم والواجبات تلقائيًا.')+'</section>');
 if(unread){if(feed.items.length)await api('/api/notifications/inbox/seen/'+feed.items[0].id,{});for(const d of digests.filter(d=>!d.seen))await api(weekAPI56()+'/digest/'+d.day+'/seen',{});badge.hidden=true;}
 bell.setAttribute('aria-expanded','true');box.scrollIntoView({block:'start'});
}
document.addEventListener('open-notices53',()=>run(()=>updateBell53(true)));
setInterval(()=>{if(!document.hidden)updateBell53().catch(()=>{});},60000);
async function renderNotificationSettings(){
 notificationSettings=await api('/api/notifications/settings');const n=notificationSettings;
 let box=$('#notificationBox');if(!box){box=document.createElement('details');box.id='notificationBox';box.className='notification-settings';$('.halaqat-header').after(box);}
 const studentView=data?.user?.role==='halaqa_student';
 const common='<p>على الآيفون: أضف الموقع للشاشة الرئيسية، افتحه من أيقونته ثم اسمح بالإشعارات. يتطلب جهازًا ومتصفحًا يدعمان Web Push.</p><div class="actions">'+button('تفعيل إشعارات هذا الجهاز','data-enable-push')+button('إيقاف إشعارات هذا الجهاز','data-disable-push')+'</div>'+form20('notificationPrefs','<label><input type="checkbox" name="push_enabled" '+(n.push_enabled?'checked':'')+'> إشعارات الأجهزة</label><label><input type="checkbox" name="email_enabled" '+(n.email_enabled?'checked':'')+'> التنبيهات بالبريد الموثق</label>'+Object.entries(n.labels).map(([k,v])=>'<label><input type="checkbox" name="category" value="'+k+'" '+(n.categories.includes(k)?'checked':'')+'> '+v+'</label>').join('')+'<button>حفظ اختيارات التنبيهات</button>')+'<p>البريد: '+esc(n.email||'غير مسجل')+' · '+(n.verified?'موثق':'غير موثق')+'</p>'+(n.smtp_ready?form20('notificationEmail',input('email','بريدك الإلكتروني',n.email,'email')+'<button>إرسال رمز التوثيق</button>')+(!n.verified?form20('notificationVerify',input('code','رمز التوثيق','','text',true,'inputmode="numeric" pattern="[0-9]{6}" maxlength="6"')+'<button>توثيق البريد</button>'):''):'<p>إرسال البريد لم يُفعّل على الخادم بعد؛ يمكن استخدام إشعارات الجهاز.</p>');
 box.innerHTML='<summary>'+(studentView?'إشعاراتي':'إشعارات الجوال والبريد')+'</summary>'+common+(studentView?'':'<div class="actions">'+button('إرسال تنبيه تجريبي','data-test-push')+button('تحديث حالة التسليم','data-refresh-push')+'</div><p>حالة الإرسال: '+Object.entries(n.delivery).map(([k,v])=>esc(({pending:'بانتظار الإرسال',sending:'جارٍ الإرسال',sent:'سُلّم لمزوّد الإرسال',failed:'تعذر الإرسال',expired:'اشتراك منتهٍ',cancelled:'ملغى'}[k]||k))+': '+v).join(' · ')+'</p><small>التسليم لمزوّد الإرسال لا يضمن ظهور الإشعار إذا منعته إعدادات الجهاز.</small>');
 if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
}
document.addEventListener('submit',e=>{const f=e.target;if(!f.hasAttribute('data-advanced'))return;e.preventDefault();run(async()=>{
 const fd=new FormData(f),p=Object.fromEntries(fd),url=base()+'/students/'+sid;let settings=false;
 if(f.id==='juzForm'){const j=p.juz;delete p.juz;await api(url+'/juz/'+j,p,'PUT');}
 else if(f.dataset.kind==='reviewApprove')await api(url+'/review/'+f.dataset.surah+'/approve',p);
 else if(f.dataset.kind==='reviewResult'){p.score=Number(p.score);await api(url+'/review/'+f.dataset.surah+'/result',p);}
 else if(f.id==='supportPlanForm'){p.tasks=p.tasks.split('\n').map(x=>x.trim()).filter(Boolean).map(text=>({text,done:false}));await api(url+'/support-plans',p);}
 else if(f.dataset.kind==='planUpdate'){const original=advanced.plans.find(x=>x.id===Number(f.dataset.id));const tasks=original.tasks.map((t,i)=>({...t,done:!!document.querySelector('[data-plan-task="'+original.id+'"][data-index="'+i+'"]').checked}));await api(url+'/support-plans/'+original.id,{title:original.title,start:original.start,end:original.end,tasks,status:p.status,outcome:p.outcome},'PUT');}
 else if(f.id==='bookingForm'){const id=p.exam_id;delete p.exam_id;p.examiner_id=Number(p.examiner_id);await api(url+'/organized-exams/'+id+'/booking',p,'PUT');}
 else if(f.id==='renameUsernameForm'){const r=await api(base()+'/accounts/'+p.uid+'/username',{username:p.username},'PUT');if(r.self_changed){location.assign('/login');return;}await load();status('تم تغيير اسم المستخدم وإنهاء جلساته السابقة');return;}
 else if(f.id==='notificationPrefs'){await api('/api/notifications/settings',{push_enabled:fd.has('push_enabled'),email_enabled:fd.has('email_enabled'),categories:fd.getAll('category')},'PUT');settings=true;}
 else if(f.id==='notificationEmail'){await api('/api/notifications/email',p);settings=true;}
 else if(f.id==='notificationVerify'){await api('/api/notifications/email/verify',p);settings=true;}
 if(settings){await renderNotificationSettings();$('#notificationBox').open=true;}else await openFile(sid,false);status('تم الحفظ بنجاح');
});});
document.addEventListener('change',e=>{if(e.target.form?.id==='mistakeForm'&&e.target.name==='surah')syncVerse20();if(e.target.form?.id==='juzForm'&&e.target.name==='juz'){const j=advanced.juz.find(x=>x.juz===Number(e.target.value));e.target.form.elements.status.value=j.status;e.target.form.elements.notes.value=j.notes;}});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-close-toast'))$('#toast20')?.remove();
 if(b.dataset.tab!==undefined)activate20(b.dataset.tabRoot,Number(b.dataset.tab));
 if(b.dataset.promote)run(async()=>{await api(base()+'/students/'+sid+'/organized-exams/'+b.dataset.promote+'/promote',{});await openFile(sid,false);status('تم اعتماد انتقال المستوى');});
 if(b.hasAttribute('data-enable-push'))run(async()=>{
  if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw Error('المتصفح لا يدعم الإشعارات. على الآيفون افتح الموقع من الشاشة الرئيسية.');
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('لم تمنح إذن الإشعارات؛ عدّل إعدادات الموقع في جهازك');
  await navigator.serviceWorker.register('/sw.js');const reg=await navigator.serviceWorker.ready;
  const raw=notificationSettings.public_key.replace(/-/g,'+').replace(/_/g,'/'),key=Uint8Array.from(atob(raw+'='.repeat((4-raw.length%4)%4)),c=>c.charCodeAt(0));
  const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});const j=sub.toJSON();await api('/api/notifications/subscribe',{endpoint:j.endpoint,keys:j.keys});status('تم تفعيل إشعارات هذا الجهاز');
 });
 if(b.hasAttribute('data-disable-push'))run(async()=>{const reg=await navigator.serviceWorker.getRegistration('/');const sub=await reg?.pushManager.getSubscription();if(sub){await api('/api/notifications/unsubscribe',{endpoint:sub.endpoint});await sub.unsubscribe();}status('تم إيقاف إشعارات هذا الجهاز');});
 if(b.hasAttribute('data-test-push'))run(async()=>{const r=await api('/api/notifications/test',{});status(r.message);await renderNotificationSettings();$('#notificationBox').open=true;});
 if(b.hasAttribute('data-refresh-push'))run(async()=>{await renderNotificationSettings();$('#notificationBox').open=true;status('تم تحديث حالة التسليم');});
 // Existing cross-section actions still reveal their target after tab grouping.
 if(b.dataset.progress||b.dataset.editMistake||b.dataset.amend)setTimeout(()=>{const target=b.dataset.progress?$('#progressForm'):b.dataset.editMistake?$('#mistakeForm'):$('#studentRequestForm');reveal20(target);target?.scrollIntoView({behavior:'smooth'});},0);
});
document.addEventListener('keydown',e=>{const nav=e.target.closest('.workspace-tabs');if(!nav||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...nav.querySelectorAll('button')],at=buttons.indexOf(e.target);const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(at+(e.key==='ArrowLeft'?1:-1)+buttons.length)%buttons.length;buttons[next].click();buttons[next].focus();});
// Update the visible thread without replacing the user's draft. No public chat channels.
let polling20=false;
setInterval(async()=>{if(polling20||busy||document.hidden||!sid||$('#studentFile').hidden||activeTabs20.studentFile!==4)return;polling20=true;const current=sid;
 try{const t=await api(base()+'/students/'+current+'/messages');if(current!==sid)return;const rows=$('#messageRows');if(rows&&JSON.stringify(t.messages)!==JSON.stringify(thread.messages)){thread=t;rows.innerHTML=messageRows(t.messages);rows.scrollTop=rows.scrollHeight;}if(t.messages.length)await api(base()+'/students/'+current+'/messages/read',{last_id:t.messages.at(-1).id});}catch{}finally{polling20=false;}
},8000);
document.addEventListener('submit',e=>{if(e.target.matches('form[action="/logout"]')){const req=indexedDB.open('halaqat-offline',1);req.onsuccess=()=>{const db=req.result;if(db.objectStoreNames.contains('records'))db.transaction('records','readwrite').objectStore('records').clear();db.close();};}});


const deleteLabels31={account:'حساب مستخدم',mosque:'مجمع',ring:'حلقة',student:'طالب',teacher:'معلم',supervisor:'مشرف',guardian:'ولي أمر'};
let deleteTargets31=[];
async function mount31(){
 $('#organizationActions31')?.remove();
 if(data.user.role!=='owner')return;
 deleteTargets31=(await api('/api/owner/permanent-delete/targets')).targets;
 showTargets31();
 const toolbar=$('.halaqat-toolbar');toolbar.querySelector('#organizationActions31')?.remove();
 toolbar.insertAdjacentHTML('beforeend','<div id="organizationActions31" class="actions">'+button('إضافة مجمع','data-create-org31')+button('تعديل المجمع','data-edit-org31')+button('حذف المجمع نهائيًا','data-delete-mosque class="danger31"')+'</div>');
}
function showTargets31(){
 const box=$('#deleteTargets31');if(!box)return;
 const kind=$('[name=deleteKind31]').value,q=($('#deleteSearch31').value||'').trim();
 box.innerHTML=deleteTargets31.filter(x=>x.kind===kind&&x.name.includes(q)).map(x=>'<div class="student-row"><span>'+esc(x.name)+' <small>#'+x.id+'</small></span>'+button('معاينة الحذف','data-kind31="'+x.kind+'" data-delete31="'+x.id+'"')+'</div>').join('')||empty('لا توجد عناصر مطابقة.');
}
function dialog31(title,body){
 $('#dialog31')?.remove();
 document.body.insertAdjacentHTML('beforeend','<dialog id="dialog31" dir="rtl" aria-labelledby="dialogTitle31"><h2 id="dialogTitle31">'+esc(title)+'</h2>'+body+button('إلغاء','data-close31')+'</dialog>');
 $('#dialog31').showModal();
}
async function preview31(kind,id){
 const p=await api('/api/owner/permanent-delete/'+kind+'/'+id+'/preview');
 const names={halaqat:'الحلقات',halaqa_students:'ملفات الطلاب',users:'حسابات المستخدمين',mosques:'المجمعات',halaqa_progress:'سجلات الحضور والتسميع',halaqa_teachers:'ارتباطات المعلمين',halaqa_supervisors:'ارتباطات المشرفين',auth_sessions:'جلسات الدخول',halaqa_account_requests:'طلبات الحسابات',halaqa_change_requests:'طلبات التعديل',student_plans:'خطط الطلاب',student_exams:'اختبارات الطلاب',student_certificates:'الشهادات',student_assignments:'الأوراد',student_alert_reads:'قراءات التنبيهات',student_exam_appointments:'مواعيد الاختبارات',halaqat_feature_settings:'إعدادات المجمع',quran_records:'سجلات الحفظ',ring_calendars:'جداول الحلقات',ring_calendar_exceptions:'استثناءات الجدول',absence_excuses:'أعذار الغياب',student_messages:'مراسلات الطلاب',student_thread_reads:'قراءات المراسلات',ring_announcements:'إعلانات الحلقات',organized_exams:'الاختبارات المنظمة',organized_exam_results:'نتائج الاختبارات',student_import_previews:'معاينات الاستيراد',juz_mastery:'إتقان الأجزاء',review_schedules:'جداول المراجعة',support_plans:'خطط الدعم',exam_bookings:'حجوزات الاختبارات',offline_receipts:'سجلات المزامنة',notification_preferences:'تفضيلات التنبيهات',push_subscriptions:'اشتراكات الإشعارات',notification_jobs:'التنبيهات المجدولة',completion_goals:'أهداف الختم',recitation_mistakes:'أخطاء التسميع',home_practices:'المراجعة المنزلية',recitation_turns:'أدوار التسميع',substitute_teachers:'تكليفات المعلمين البدلاء',learning_competitions:'المسابقات',competition_entries:'مشاركات المسابقات'};
 dialog31('معاينة الحذف النهائي', '<div class="danger31"><h3>'+esc(p.name)+'</h3><p>'+esc(p.warning)+'</p><ul>'+Object.entries(p.counts).map(([k,v])=>'<li>'+esc(names[k]||'سجلات تابعة')+': '+v+'</li>').join('')+'</ul><p>ارتباطات ستُحدّث مع إبقاء سجلاتها: '+p.updated_links+'</p></div><form id="confirmDelete31" class="halaqat-form">'+input('confirm_name','اكتب الاسم كاملًا: '+esc(p.name))+'<label><input name="reviewed" type="checkbox" required> راجعت الملخص وأفهم أن الحذف نهائي</label><button class="danger31">حذف نهائي</button></form>');
 $('#confirmDelete31').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;const name=f.elements.confirm_name.value.trim();if(name!==p.name){status('الاسم لا يطابق العنصر');return;}run(async()=>{await api('/api/owner/permanent-delete/'+kind+'/'+id,{confirm_name:name,confirm_word:'حذف',token:p.token},'DELETE');$('#dialog31').close();$('#dialog31').remove();selectedStudentRing=kind==='ring'?'':selectedStudentRing;const c=await api('/api/halaqat/context');if(!c.mosques.some(x=>x.id===mid))mid=c.mosques[0]?.id;await refreshOrganizations();if(mid)await load();else renderEmpty31(c);status('تم الحذف النهائي');});};
}
function renderEmpty31(c){
 data={user:c.user};$('#halaqatStats').innerHTML='';$('#studentFile').hidden=true;
 $('#halaqatWorkspace').hidden=false;$('#halaqatWorkspace').innerHTML=c.user.role==='owner'?panel('إدارة المجمعات',empty('لا توجد مجمعات. يمكنك إضافة مجمع جديد.')+button('إضافة مجمع','data-create-org31')):empty('لا يوجد مجمع مرتبط بحسابك.');
 $('#organizationActions31')?.remove();status('لا توجد مجمعات');
}
function orgForm31(edit){
 dialog31(edit?'تعديل المجمع':'إضافة مجمع','<form id="organization31" class="halaqat-form">'+input('name','اسم المجمع',edit?data.mosque.name:'','text',true,'minlength="2" maxlength="180"')+'<button>حفظ المجمع</button></form>');
 $('#organization31').onsubmit=e=>{e.preventDefault();const name=e.currentTarget.elements.name.value;run(async()=>{if(edit)await api(base()+'/organization',{name},'PUT');else mid=(await api('/api/halaqat/organizations',{name})).id;$('#dialog31').close();$('#dialog31').remove();await refreshOrganizations();await load();status('تم حفظ المجمع');});};
}
async function enrollment31(rid){
 const d=await api(base()+'/rings/'+rid+'/enrollment-accounts');
 const fields=input('full_name','اسم الطالب','','text',true,'minlength="2" maxlength="180"')+input('phone','جوال الطالب','','tel',false,'maxlength="40"')+input('national_id','الهوية / الإقامة (اختياري)','','text',false,'maxlength="30"')+input('birth_date','تاريخ الميلاد','','date',false)+input('school_grade','الصف الدراسي','','text',false)+input('guardian_name','اسم ولي الأمر','','text',false)+input('guardian_phone','جوال ولي الأمر','','tel',false)+input('guardian_relation','صلة القرابة','','text',false)+input('current_memorization','الحفظ الحالي','','text',false)+input('notes','ملاحظات','','text',false);
 $('#enrollment31').innerHTML='<form id="enrollForm31" class="halaqat-form"><h3>إضافة طالب إلى '+esc(data.rings.find(x=>x.id===Number(rid)).name)+'</h3>'+fields+select('account_mode','حساب الدخول',data.user.role==='owner'?[['none','بدون حساب الآن'],['create','إنشاء حساب جديد'],['existing','ربط بحساب موجود']]:[['create','طلب إضافة وإصدار حساب بموافقة المالك'],['none','طلب إضافة ملف فقط بموافقة المالك']])+select('recipient_type','الحساب لمن؟',[['student','الطالب'],['guardian','ولي الأمر']])+'<div id="newAccount31" hidden>'+input('username','اسم المستخدم','','text',false,'minlength="3" maxlength="30"')+'</div><div id="existingAccount31" hidden>'+select('existing_user_id','الحساب الموجود',[['','اختر الحساب'],...d.accounts.map(x=>[x.id,x.name+' — '+x.username+' ('+(x.account_type==='guardian'?'ولي أمر':'طالب')+')'])],'',false)+'</div><button>حفظ الطالب</button>'+button('إلغاء','data-cancel-enroll31')+'</form>';
 const f=$('#enrollForm31');f.elements.account_mode.onchange=()=>{const mode=f.elements.account_mode.value;$('#newAccount31').hidden=mode!=='create';$('#existingAccount31').hidden=mode!=='existing';f.elements.username.required=mode==='create';f.elements.existing_user_id.required=mode==='existing';};f.elements.account_mode.onchange();
 f.onsubmit=e=>{e.preventDefault();run(async()=>{const p=Object.fromEntries(new FormData(f));p.birth_date=p.birth_date||null;p.existing_user_id=p.account_mode==='existing'?Number(p.existing_user_id):null;if(p.account_mode!=='create')p.username='';const result=await api(base()+'/rings/'+rid+'/students',p);await load();if(result.user)credentials(result);const sel=$('#studentRingFilter');if(sel)sel.value=String(rid);filterStudentList();for(let x=$('#selectedRingWorkspace');x;x=x.parentElement)if(x.tagName==='DETAILS')x.open=true;status(result.pending_approval?'تم رفع الطلب للمالك؛ لن يُضاف الطالب أو يصدر الحساب قبل موافقته':'تمت إضافة الطالب إلى الحلقة');});};
}
document.addEventListener('change',e=>{if(e.target.name==='deleteKind31')showTargets31();});
document.addEventListener('input',e=>{if(e.target.id==='deleteSearch31')showTargets31();});
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 let kind,id;
 if(b.dataset.delete31){kind=b.dataset.kind31;id=b.dataset.delete31;}
 else if(b.dataset.deleteRing){kind='ring';id=b.dataset.deleteRing;}
 else if(b.dataset.deleteStudent){kind='student';id=b.dataset.deleteStudent;}
 else if(b.dataset.deleteAccount){kind='account';id=b.dataset.deleteAccount;}
 else if(b.hasAttribute('data-delete-mosque')){kind='mosque';id=mid;}
 if(kind){e.preventDefault();e.stopImmediatePropagation();run(()=>preview31(kind,id));return;}
 if(b.dataset.enroll31)run(()=>enrollment31(b.dataset.enroll31));
 if(b.hasAttribute('data-cancel-enroll31'))$('#enrollment31').innerHTML='';
 if(b.hasAttribute('data-close31')){$('#dialog31').close();$('#dialog31').remove();}
 if(b.hasAttribute('data-create-org31'))orgForm31(false);
 if(b.hasAttribute('data-edit-org31'))orgForm31(true);
},true);
let requests32=[];
const labels32={teacher:'معلم',student:'طالب',guardian:'ولي أمر',supervisor:'مشرف'},states32={pending:'بانتظار الموافقة',approved:'تم الإصدار',rejected:'مرفوض',returned:'معاد للتعديل'};
function compact32(root='#halaqatWorkspace'){setupReference32(root);}

async function mount32(){
 if(!['owner','halaqa_supervisor'].includes(data.user.role))return;
 const old=$('[data-access="create-user"]');if(old)old.closest('details').remove();
 for(const id of ['studentRequestForm','teacherRequestForm']){const f=$('#'+id);if(f)f.closest('details').remove();}
 requests32=(await api('/api/v32/account-requests')).requests;const pending32=requests32.filter(r=>r.status==='pending'&&r.mosque_id===mid).length;const count32=document.querySelector('#halaqatStats .halaqat-stat:last-child b');if(count32)count32.textContent=data.stats.pending_requests+pending32;
 const owner=data.user.role==='owner';
 const options=Object.entries(labels32).filter(([k])=>owner||k!=='supervisor');
 const f='<details id="proposalDetails32"><summary>طلب إصدار حساب جديد</summary><form id="proposal32" class="halaqat-form">'+select('role','نوع الحساب',options)+input('full_name','اسم صاحب الحساب','','text',true,'minlength="2" maxlength="180"')+input('username','اسم المستخدم المقترح','','text',true,'minlength="3" maxlength="30" autocomplete="off"')+input('temporary_password','كلمة المرور المؤقتة المقترحة','','password',true,'minlength="8" maxlength="128" autocomplete="new-password"')+'<p class="v32-form-note">احفظ الكلمة المقترحة لتسليمها لصاحب الحساب بعد الموافقة. لا يحفظ النظام نسخة قابلة للاسترجاع. سيُطلب تغييرها عند أول دخول.</p><div id="rings32">'+multiSelect('ring_ids','حلقات المعلم',accessOverview.rings.map(r=>[r.id,r.name]))+'</div><div id="students32" hidden>'+multiSelect('student_ids','ملف الطالب / أبناء ولي الأمر',accessOverview.students.map(s=>[s.id,s.name]))+'</div><p>ملف الطالب يُضاف مباشرة من داخل الحلقة. هذا الطلب لبيانات الدخول فقط.</p><button>رفع طلب الإصدار</button></form></details>';
 const filters='<div class="v32-filters">'+select('filter_role32','نوع الحساب',[['','كل الأنواع'],...Object.entries(labels32)])+select('filter_status32','الحالة',[['','كل الحالات'],...Object.entries(states32)])+'</div><div id="requestsList32" class="v32-requests"></div>';
 const section=document.createElement('section');section.className='halaqat-panel';section.id='accounts32';section.innerHTML='<h2>طلبات إصدار الحسابات</h2>'+f+'<details open><summary>متابعة الطلبات والموافقات</summary>'+filters+'</details>';
 $('#halaqatWorkspace .halaqat-grid').append(section);document.querySelectorAll('#halaqatWorkspace .halaqat-panel').forEach(p=>{if(p!==section&&/الحسابات والمستخدمون|الحسابات والطلبات/.test(p.querySelector('h2')?.textContent||'')){for(const d of [...(p.querySelector(':scope > .v25-panel-body')||p).children])if(d.tagName==='DETAILS')section.append(d);p.remove();}});drawRequests32();sync32();
 if(owner){const ownerList50=await api('/api/v32/owners'),owners=ownerList50.owners;
 section.insertAdjacentHTML('beforeend','<details id="ownersAdmin50"><summary>ملاك النظام ('+owners.length+')</summary>'+owners.map(o=>'<article class="owner-row50"><div><strong>'+esc(o.name)+'</strong><small><bdi>'+esc(o.username)+'</bdi> · '+(o.protected?'الحساب الأساسي المحمي':o.active?'حساب فعال':'حساب موقوف')+'</small></div>'+(ownerList50.can_remove_owners&&!o.protected?button('حذف الحساب','data-remove-owner50="'+o.id+'" data-danger50'):'')+'</article>').join('')+'<div id="ownerRemovalPreview50"></div><form id="owner32" class="halaqat-form">'+select('existing','طريقة الإضافة',[['false','إنشاء حساب مالك جديد'],['true','ترقية حساب موجود']])+input('full_name','اسم المالك (للحساب الجديد)','','text',false)+input('username','اسم المستخدم','','text',true,'minlength="3" maxlength="30"')+'<p>المالك الجديد يستطيع إدارة النظام والموافقات والحذف النهائي لبيانات المجمعات. حذف حسابات الملاك محصور بالحساب الأساسي.</p>'+input('confirm','اكتب: منح صلاحية مالك')+'<button>إضافة مالك</button></form></details>');}
}
function sync32(){const f=$('#proposal32');if(!f)return;const role=f.elements.role.value;$('#rings32').hidden=role!=='teacher';$('#students32').hidden=!['student','guardian'].includes(role);const names=$('#students32 .field-label33');if(names)names.textContent=role==='guardian'?'اختر أبناء ولي الأمر *':'اختر ملف الطالب *';const studentSelect=$('#students32 select');if(studentSelect){studentSelect.multiple=role==='guardian';studentSelect.size=role==='guardian'?4:1;}f.querySelectorAll('[name=ring_ids]').forEach(x=>x.disabled=role!=='teacher');f.querySelectorAll('[name=student_ids]').forEach(x=>x.disabled=!['student','guardian'].includes(role));}
function drawRequests32(){
 const type=$('[name=filter_role32]')?.value||'',state=$('[name=filter_status32]')?.value||'';
 $('#requestsList32').innerHTML=requests32.filter(r=>(!type||r.role===type)&&(!state||r.status===state)).map(r=>'<article class="halaqat-card">'+(data.user.role==='owner'&&r.status==='pending'&&r.mosque_id===mid?'<label><input type="checkbox" data-batch-review34="'+r.id+'"> تحديد للمراجعة الجماعية</label>':'')+'<span class="halaqat-badge">'+esc(states32[r.status])+'</span><h3>'+esc(r.full_name)+' · '+esc(labels32[r.role])+'</h3><p>اسم المستخدم: <bdi>'+esc(r.username)+'</bdi></p><p>المجمع: '+esc(r.mosque)+' · الحلقات: '+esc(r.rings.map(x=>x.name).join('، ')||'—')+'</p><p>الطالب / الأبناء: '+esc(r.students.map(x=>x.name).join('، ')||'—')+'</p><small>مقدم الطلب: '+esc(r.requested_by)+' · '+esc(new Date(r.created_at).toLocaleString('ar-SA'))+'</small><p>'+esc(r.review_note)+'</p>'+(data.user.role==='owner'&&r.status==='pending'?'<div class="actions">'+button('موافقة وإصدار','data-review32="approve" data-q32="'+r.id+'"')+button('رفض','data-review32="reject" data-q32="'+r.id+'"')+button('إرجاع للتعديل','data-review32="return" data-q32="'+r.id+'"')+'</div>':'')+(r.status==='returned'&&r.requested_by_id===data.user.id?button('تعديل وإعادة تقديم','data-amend32="'+r.id+'"'):'')+'</article>').join('')||empty('لا توجد طلبات بهذه الخيارات.');
}
document.addEventListener('change',e=>{if(e.target.name==='role'&&e.target.closest('#proposal32'))sync32();if(['filter_role32','filter_status32'].includes(e.target.name))drawRequests32();});
document.addEventListener('submit',e=>{const f=e.target;if(!['proposal32','owner32'].includes(f.id))return;e.preventDefault();run(async()=>{const fd=new FormData(f),p=Object.fromEntries(fd);
 if(f.id==='owner32'){p.existing=p.existing==='true';const d=await api('/api/v32/owners',p);if(d.temporary_password)credentials(d);await load();status('تم منح صلاحية المالك');}
 else{p.ring_ids=fd.getAll('ring_ids').map(Number);p.student_ids=fd.getAll('student_ids').map(Number);if(f.querySelector('[name=batch34]')?.checked){delete p.batch34;drafts34.push(p);f.reset();sync32();drawDrafts34();status('تمت الإضافة إلى المجموعة؛ اضغط رفع المجموعة لإرسالها للمالك');return;}await api('/api/v32/mosques/'+mid+'/account-requests'+(f.dataset.qid?'/'+f.dataset.qid:''),p,f.dataset.qid?'PUT':'POST');f.reset();await load();status('تم رفع الطلب؛ بيانات الدخول لا تعمل إلا بعد موافقة المالك');}
 });});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.review32)run(async()=>{const r=requests32.find(x=>x.id===Number(b.dataset.q32));const note=b.dataset.review32==='approve'?'':prompt('ملاحظة المراجعة:','');if(note===null)return;await api('/api/v32/mosques/'+r.mosque_id+'/account-requests/'+r.id+'/review',{action:b.dataset.review32,note});await load();status(b.dataset.review32==='approve'?'تم إصدار الحساب بالكلمة المقترحة؛ يجب تغييرها عند أول دخول':'تم حفظ المراجعة');});
 if(b.dataset.amend32){const r=requests32.find(x=>x.id===Number(b.dataset.amend32));if(r.mosque_id!==mid){status('اختر مجمع الطلب أولًا');return;}const f=$('#proposal32');f.dataset.qid=r.id;for(const k of ['role','full_name','username'])f.elements[k].value=r[k];f.elements.temporary_password.value='';f.querySelectorAll('[name=ring_ids] option').forEach(x=>x.selected=r.rings.some(y=>y.id===Number(x.value)));f.querySelectorAll('[name=student_ids] option').forEach(x=>x.selected=r.students.some(y=>y.id===Number(x.value)));$('#proposalDetails32').open=true;sync32();f.scrollIntoView({behavior:'smooth'});}
});

// v32 reference layouts: real navigable screens, shared identity, scoped data.
let route32='home', screens32=new Map(), noticeTimer32=null, noticeHideTimer44=null;
const tile32=(label,route,detail='')=>'<button type="button" class="ref-tile32" data-screen32="'+esc(route)+'">'+icon43(route,label)+'<strong>'+esc(label)+'</strong>'+(detail?'<span>'+esc(detail)+'</span>':'')+'</button>';
function screen32(key,title,body){const s=document.createElement('section');s.className='ref-screen32';s.dataset.route32=key;s.hidden=true;s.innerHTML='<h2 class="ref-title32">'+esc(title)+'</h2>'+body;return s;}
function addScreen32(key,title,body,root){const s=screen32(key,title,body);root.append(s);screens32.set(key,s);return s;}
function setupReference32(rootId){
 if(rootId==='#studentFile'){setupStudent32();return;}
 const root=$('#halaqatWorkspace'),grid=root.querySelector('.halaqat-grid');if(!grid)return;
 screens32=new Map();root.querySelectorAll('.ref-home32,.ref-nav32').forEach(x=>x.remove());
 const panels=[...grid.querySelectorAll('.halaqat-panel')].filter(p=>!p.hidden);
 const communication=grid.querySelector('.v25-communication-master');if(communication){while(communication.querySelector('.v25-master-body')?.firstChild)grid.append(communication.querySelector('.v25-master-body').firstChild);communication.remove();}
 panels.forEach((p,i)=>{const title=p.querySelector('h2')?.textContent||'الواجهة';const key=p.id==='accounts32'?'accounts':/الحلقات والطلاب|أبنائي|ملفي كطالب/.test(title)?'rings':/إدارة المجمعات/.test(title)?'complexes':/التحضير الجماعي/.test(title)?'attendance':'tool-'+i;p.classList.add('ref-screen32');p.dataset.route32=key;p.hidden=true;if(p.tagName==='DETAILS')p.open=true;screens32.set(key,p);});
 // Keep the old controls alive inside their corresponding standalone screen.
 const ringsPanel=screens32.get('rings');if(ringsPanel&&data.user.role!=='halaqa_student'){
  const body=ringsPanel.querySelector('.v25-panel-body'),hr=body?.querySelector(':scope > hr');
  if(hr){const studentScreen=addScreen32('students','طلاب الحلقة','',grid);let n=hr.nextSibling;while(n){const next=n.nextSibling;studentScreen.append(n);n=next;}hr.remove();}
 }
 const owner=data.user.role==='owner',manager=owner||data.user.role==='halaqa_supervisor',teacher=data.user.role==='halaqa_teacher';
 if(manager){
  const acc=screens32.get('accounts');if(acc){
   const proposal=acc.querySelector('#proposalDetails32'),follow=acc.querySelector('#requestsList32')?.closest('details');
   const title=acc.querySelector('h2');if(title)title.textContent='الحسابات وطلبات الإصدار';
   if(proposal){acc.prepend(proposal);proposal.open=true;proposal.classList.add('ref-open32');}
   if(follow){acc.insertBefore(follow,proposal?.nextSibling||acc.firstChild);follow.open=true;}
   if(title){title.classList.add('ref-title32');acc.prepend(title);}screens32.set('requests',acc);screens32.set('request-list',acc);
  }
 }
 const feedback=addScreen32('complaints','الشكاوى والتواصل','<form id="feedback32" class="halaqat-form ref-feedback32">'+input('title','العنوان','','text',true,'maxlength="180"')+textArea('description','وصف المشكلة','',3000)+input('phone','رقم التواصل','','tel',false,'maxlength="40"')+'<button>إرسال الشكوى</button></form><div id="feedbackList32"></div>',grid);
 if(manager)addScreen32('enrollment-review','طلبات إضافة الطلاب','<div id="enrollmentList32"></div>',grid);
 const m=data.mosque;
 addScreen32('complex-info','معلومات المجمع','<dl class="ref-info32"><div><dt>اسم المجمع</dt><dd>'+esc(m.name)+'</dd></div><div><dt>مشرفو المجمع</dt><dd>'+esc((data.supervisors||[]).map(x=>x.name).join('، ')||data.user.name)+'</dd></div><div><dt>عدد الحلقات</dt><dd>'+data.rings.length+'</dd></div><div><dt>عدد الطلاب</dt><dd>'+data.students.length+'</dd></div></dl><div class="ref-pair32">'+tile32('الحلقات','rings')+tile32('الشكاوى','complaints')+'</div>',grid);
 const roleLabel=owner?'واجهة المالك':teacher?'واجهة المعلم':data.user.role==='halaqa_student'?(data.user.account_type==='guardian'?'واجهة ولي الأمر':'واجهة الطالب'):'واجهة مشرف المجمع';
 let home='<h2 class="ref-title32">'+roleLabel+'</h2>';
 if(owner){home+='<div class="ref-pair32">'+tile32('الحلقات','rings')+tile32('الحسابات وطلبات الإصدار','accounts',requests32.filter(r=>r.status==='pending').length+' طلب بانتظار الموافقة')+tile32('الدعم الفني','complaints')+tile32('التقارير والإحصاءات','reports')+'</div><div class="ref-center32">'+tile32('طلبات إضافة الطلاب','enrollment-review')+'</div><h3 class="ref-bar32">معلومات المجمعات</h3><div class="ref-pair32">'+tile32('معلومات المجمع','complex-info')+tile32('إدارة المجمعات','complexes')+'</div>';}
 else if(teacher){home+='<div class="ref-pair32">'+tile32('الحلقة والطلاب','students',data.rings.map(r=>r.name).join('، ')+' · '+data.students.length+' طالب')+tile32('الحلقات المسندة لي','rings')+tile32('تحضير الطلاب','attendance')+tile32('التواصل','communication')+'</div>';}
 else if(manager){home+='<div class="ref-pair32">'+tile32('التقارير الفرعية','reports')+tile32('المجمعات','complex-info')+'</div><h3 class="ref-bar32">الشكاوى</h3><div class="ref-center32">'+tile32('إرسال شكوى','complaints')+'</div><h3 class="ref-bar32">الحلقات</h3><div class="ref-pair32">'+tile32('حلقات المجمع','rings')+tile32('الحسابات وطلبات الإصدار','accounts')+'</div><div class="ref-center32">'+tile32('طلبات إضافة الطلاب','enrollment-review')+'</div>';}
 else{home+='<div class="ref-pair32">'+data.students.map(s=>tile32(s.name,'student/'+s.id,data.rings.find(r=>r.id===s.halaqa_id)?.name||'')).join('')+'</div>';}
 // Secondary capabilities remain accessible through their own pages.
 const report=addScreen32('reports','التقارير والإحصاءات','<div class="ref-ratings32"><div>الحلقات<b>'+data.stats.rings+'</b></div><div>الطلاب<b>'+data.stats.students+'</b></div><div>طلبات الحسابات<b>'+requests32.filter(r=>r.status==='pending').length+'</b></div></div><div class="ref-pair32">'+[...screens32.entries()].filter(([k,p])=>k.startsWith('tool-')&&/تقرير|متابعة|استيراد|إعدادات|اختبار|مسابق/.test(p.querySelector('h2')?.textContent||'')).map(([k,p])=>tile32(p.querySelector('h2').textContent,k)).join('')+(screens32.has('students')?tile32('تصدير بيانات الطلاب والتقييمات','students'):'')+'</div>',grid);
 addScreen32('communication','التواصل والإعلانات','<div class="ref-pair32">'+[...screens32.entries()].filter(([k,p])=>k.startsWith('tool-')&&/إعلان|مراسلات|تواصل|إجازات|جدول/.test(p.querySelector('h2')?.textContent||'')).map(([k,p])=>tile32(p.querySelector('h2').textContent,k)).join('')+tile32('الشكاوى','complaints')+'</div>',grid);
 if([...screens32.keys()].some(k=>k.startsWith('tool-'))){addScreen32('more','أدوات إضافية','<div class="ref-pair32 ref-secondary32">'+[...screens32.entries()].filter(([k])=>k.startsWith('tool-')).map(([k,p])=>tile32(p.querySelector('h2')?.textContent||'أداة',k)).join('')+'</div>',grid);home+='<div class="ref-center32">'+tile32('أدوات إضافية','more')+'</div>';}if(data.user.role==='halaqa_student')home+='<div class="ref-center32">'+tile32('الشكاوى والتواصل','complaints')+'</div>';
 const homeNode=document.createElement('section');homeNode.className='ref-home32';homeNode.innerHTML=home;root.prepend(homeNode);screens32.set('home',homeNode);
 const nav=document.createElement('nav');nav.className='ref-nav32';nav.setAttribute('aria-label','التنقل');nav.innerHTML=button('الرئيسية','data-home32')+'<span id="screenLabel32"></span>'+button('رجوع','data-return32');root.prepend(nav);
 $('#halaqatStats').hidden=true;
  const complexSelect=$('#halaqatMosque');if(complexSelect)complexSelect.value=String(mid);
  $('#referenceNotices32')?.remove();const notices=document.createElement('div');notices.id='referenceNotices32';notices.setAttribute('role','status');notices.setAttribute('aria-live','polite');$('.halaqat-header').after(notices);showNotices32();
 route32=location.hash.slice(1)||'home';navigate32(route32,false);
 if(!noticeTimer32)noticeTimer32=setInterval(()=>{if(!document.hidden&&!busy&&data&&['owner','halaqa_supervisor'].includes(data.user.role))api('/api/v32/account-requests').then(d=>{requests32=d.requests;showNotices32();if($('#requestsList32'))drawRequests32();}).catch(()=>{});},20000);
 fetchFeedback32().catch(e=>status(e.message));complexInfo32().catch(e=>status(e.message));
}
function showNotices32(){const box=$('#referenceNotices32');if(!box||!data?.user)return;const userKey=String(data.user.id||data.user.username||'current'),storageKey='mishkat-request-notices-v44:'+userKey;let saved=[];try{const value=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(value))saved=value.map(String);}catch{}const seen=new Set(saved),cutoff=Date.now()-7*24*60*60*1000;const reviewed=requests32.filter(r=>String(r.requested_by_id)===String(data.user.id)&&r.status!=='pending'&&!seen.has(String(r.id))&&Number.isFinite(Date.parse(r.reviewed_at||''))&&Date.parse(r.reviewed_at)>=cutoff).sort((a,b)=>Date.parse(b.reviewed_at)-Date.parse(a.reviewed_at)).slice(0,4);if(!reviewed.length){box.hidden=true;box.innerHTML='';return;}box.hidden=false;box.innerHTML=reviewed.map(r=>{const message=r.status==='approved'?'تم إصدار بيانات الدخول لـ '+r.full_name:r.status==='returned'?'طلب '+r.full_name+' معاد للاستكمال':'تم رفض طلب '+r.full_name;return '<div class="request-notice44"><button type="button" data-screen32="request-list" class="notice-open44">'+esc(message)+' · '+esc(r.username)+'</button><button type="button" data-dismiss-request-notice44 class="notice-dismiss44" aria-label="إخفاء الإشعار">×</button></div>';}).join('');reviewed.forEach(r=>seen.add(String(r.id)));try{localStorage.setItem(storageKey,JSON.stringify([...seen].slice(-100)));}catch{}clearTimeout(noticeHideTimer44);noticeHideTimer44=setTimeout(()=>{if(box.isConnected){box.hidden=true;box.innerHTML='';}},12000);}
document.addEventListener('click',e=>{const close=e.target.closest('[data-dismiss-request-notice44]');if(!close)return;const box=close.closest('#referenceNotices32');if(!box)return;clearTimeout(noticeHideTimer44);box.hidden=true;box.innerHTML='';});
function navigate32(route,push=true){
 if(!data)return;
 if(route.startsWith('personal-child/')&&!screens32.has(route)){run(()=>openChildPersonal33(Number(route.split('/')[1])));return;}
 if(route.startsWith('student/')&&data.user.role==='halaqa_supervisor'){run(()=>openSupervisor37(Number(route.split('/')[1])));return;}if(route.startsWith('student/')&&data.user.role==='owner'){route='students';}if(route.startsWith('student/')){const parts=route.split('/'),id=Number(parts[1]);route32=route;if(push&&location.hash.slice(1)!==route)location.hash=route;if(sid===id&&file&&!$('#studentFile').hidden){showStudent32(parts[2]||'overview');return;}run(()=>openFile(id));return;}
 const screen=screens32.get(route)||screens32.get('home');if(!screen)return;route32=screen.dataset.route32||'home';if(push&&location.hash.slice(1)!==route32)location.hash=route32;
 $('#studentFile').hidden=true;$('#halaqatWorkspace').hidden=false;$('#halaqatApp').classList.remove('file-open');screens32.forEach(p=>p.hidden=p!==screen);$('.halaqat-toolbar').hidden=false;
 const actions=$('#organizationActions31');if(actions)actions.hidden=!['complexes','complex-info'].includes(route32);
 if(route32==='weekly63'&&$('#weeklyStandings60'))$('#weeklyStandings60').open=true;
 const extras=$('#appNavigation .staff-more60');
 if(extras&&[...extras.querySelectorAll('[data-screen32]')].some(b=>b.dataset.screen32===route32))extras.open=true;
 const label=$('#screenLabel32');if(label)label.textContent=route32==='home'?'':screen.querySelector('h2')?.textContent||'';
 document.querySelector('[data-return32]').hidden=route32==='home';window.scrollTo({top:0,behavior:'instant'});updateNav43();if(route==='attendance'&&$('#attendance43')){$('#attendance43').open=true;$('#attendance43').scrollIntoView({behavior:'smooth'});}
}
function setupStudent32(){
 const root=$('#studentFile'),grid=root.querySelector('.halaqat-grid');if(!grid)return;
 const s=file.student,last=file.progress[0],assign=follow?.assignments?.[0];
 const panels=[...grid.querySelectorAll('.halaqat-panel')].filter(p=>!p.hidden);panels.forEach((p,i)=>{p.classList.add('ref-file-screen32');p.dataset.fileRoute32=/تسجيل التسميع/.test(p.querySelector('h2')?.textContent||'')?'evaluation':'detail-'+i;p.hidden=true;if(p.tagName==='DETAILS')p.open=true;});
 const summary=document.createElement('section');summary.id='studentOverview32';summary.innerHTML='<h2 class="ref-title32">'+(data.user.role==='halaqa_student'?'واجهة الطالب / ولي الأمر':'التقييم')+'</h2><article class="ref-student-card32"><dl class="ref-info32"><div><dt>اسم الطالب</dt><dd>'+esc(s.name)+'</dd></div><div><dt>رقم الجوال</dt><dd><bdi>'+esc(s.phone||s.guardian_phone||'غير مسجل')+'</bdi></dd></div><div><dt>الصف الدراسي</dt><dd>'+esc(s.school_grade||'غير مسجل')+'</dd></div></dl><h3>خطة الحفظ</h3><div class="ref-pair32 ref-values32"><div><strong>الحفظ</strong><p>'+esc(file.plan?file.plan.memorization_amount+' '+unit(file.plan.memorization_unit):'لم تحدد الخطة')+'</p></div><div><strong>المراجعة</strong><p>'+esc(file.plan?file.plan.revision_amount+' '+unit(file.plan.revision_unit):'لم تحدد الخطة')+'</p></div></div><h3>تقييم الطالب</h3><div class="ref-ratings32"><div>التجويد<b>'+esc(last?.tajweed_score??'—')+'</b></div><div>الحفظ<b>'+esc(last?.memorization_score??'—')+'</b></div><div>المراجعة<b>'+esc(last?.revision||'—')+'</b></div><div>الغياب<b>'+file.absences_30_days+'</b></div></div><dl class="ref-info32"><div><dt>آخر ورد تم تسميعه</dt><dd>'+esc(last?.memorized||'لم يسجل بعد')+'</dd></div><div><dt>الورد القادم</dt><dd>'+esc(assign?.title||assign?.memorization||'راجع صفحة الورد القادم')+'</dd></div><div><dt>الملاحظات</dt><dd>'+esc(last?.notes||'لا توجد ملاحظات')+'</dd></div></dl>'+(file.can_edit?'<div class="ref-center32">'+tile32('تسجيل التقييم','student/'+sid+'/evaluation')+'</div>':'')+'</article><div class="ref-pair32">'+panels.map(p=>tile32(p.querySelector('h2')?.textContent||'تفاصيل','student/'+sid+'/'+p.dataset.fileRoute32)).join('')+'</div>';
 grid.prepend(summary);root.querySelector('.student-file-head').insertAdjacentHTML('afterend','<nav class="ref-nav32">'+button('ملخص الطالب','data-student-overview32')+button('رجوع','data-return32')+'</nav>');
 const route=location.hash.slice(1).split('/');if(route[0]!=='student'||Number(route[1])!==sid)location.hash='student/'+sid;showStudent32(route[0]==='student'?route[2]||'overview':'overview');
  $('.halaqat-toolbar').hidden=false;
}
function showStudent32(key){
 const root=$('#studentFile'),overview=root.querySelector('#studentOverview32');
 if(!root||!overview)return;
 const mapped=studentGroups35.get(key);
 const requested=mapped?mapped.group:key;
 const groups=[...root.querySelectorAll('.group35')];
 if(groups.length){
  root.classList.add('combined43','student-directory63');
  const isOverview=requested==='overview'||!groups.some(p=>p.dataset.fileRoute32===requested);
  overview.hidden=!isOverview;
  for(const group of groups){
   const selected=!isOverview&&group.dataset.fileRoute32===requested;
   group.hidden=!selected;
   if(selected)group.open=true;
   if(selected){
    const children=[...group.children].filter(n=>n.tagName==='DETAILS'&&n!==group.querySelector(':scope > summary'));
    let nav=group.querySelector(':scope > .student-features63');
    if(!nav&&children.length>1){
     nav=document.createElement('nav');nav.className='student-features63 tiles63';
     nav.setAttribute('aria-label','خيارات '+(group.querySelector(':scope > summary')?.textContent||'الطالب'));
     children.forEach((node,index)=>{
      node.dataset.feature63=String(index);node.hidden=true;
      const heading=node.querySelector(':scope > summary')?.textContent||node.querySelector('h2')?.textContent||'الخيار '+(index+1);
      const action=document.createElement('button');action.type='button';action.className='student-feature-tile63';
      action.dataset.selectFeature63=String(index);action.textContent=heading.trim();nav.append(action);
     });
     group.insertBefore(nav,group.querySelector(':scope > summary')?.nextSibling||group.firstChild);
    }
    if(nav){
     const chosen=mapped?.node?.closest('[data-feature63]')||mapped?.node;
     const idx=chosen?.dataset.feature63;
     const index=idx===undefined?null:Number(idx);
     const selectedFeature=Number.isInteger(index)?index:null;
     group.querySelectorAll(':scope > [data-feature63]').forEach(node=>{
      const active=selectedFeature!==null&&Number(node.dataset.feature63)===selectedFeature;
      node.hidden=!active;if(active&&node.tagName==='DETAILS')node.open=true;
     });
     nav.querySelectorAll('[data-select-feature63]').forEach(b=>b.classList.toggle('selected63',selectedFeature!==null&&Number(b.dataset.selectFeature63)===selectedFeature));
     nav.hidden=selectedFeature!==null;
     let back=group.querySelector(':scope > .student-feature-back63');
     if(!back){back=document.createElement('button');back.type='button';back.className='student-feature-back63';back.textContent='رجوع إلى خيارات القسم';back.dataset.backFeature63='';nav.after(back);}
     back.hidden=selectedFeature===null;
    }
   }
  }
  const controls=root.querySelector('.ref-nav32');
  if(controls){const back=controls.querySelector('[data-return32]');if(back)back.hidden=isOverview;}
  window.scrollTo({top:0,behavior:'instant'});
  return;
 }
 const group=studentGroups35.get(key);if(group){key=group.group;if(group.node.tagName==='DETAILS')group.node.open=true;}
 overview.hidden=key!=='overview';let found=key==='overview';
 root.querySelectorAll('.ref-file-screen32').forEach(p=>{p.hidden=p.dataset.fileRoute32!==key;if(!p.hidden)found=true;});
 if(!found)overview.hidden=false;
 window.scrollTo({top:0,behavior:'instant'});
}

async function fetchFeedback32(){const d=await api('/api/v32/service-requests');for(const [kind,id] of [['complaint','feedbackList32'],['enrollment','enrollmentList32']]){const box=$('#'+id);if(!box)continue;box.innerHTML=d.requests.filter(r=>r.kind===kind).map(r=>'<article class="halaqat-card"><h3>'+esc(r.title)+'</h3><p>'+esc(r.description)+'</p><p>'+esc(r.author)+' · '+esc(r.mosque)+' · '+esc(r.ring||'')+'</p><p>رقم التواصل: <bdi>'+esc(r.phone||'غير مسجل')+'</bdi></p><p>'+esc({pending:'بانتظار المراجعة',approved:'تمت إضافة الطالب',closed:'تمت معالجة الشكوى',rejected:'مرفوض'}[r.status])+'</p><p>'+esc(r.reply)+'</p>'+(r.can_review&&r.status==='pending'?'<div class="actions">'+button(kind==='enrollment'?'موافقة وإضافة الملف':'رد ومعالجة','data-service-review32="'+r.id+'" data-action32="'+(kind==='enrollment'?'approve':'close')+'"')+button('رفض','data-service-review32="'+r.id+'" data-action32="reject"')+'</div>':'')+'</article>').join('')||empty(kind==='complaint'?'لا توجد شكاوى.':'لا توجد طلبات إضافة طلاب.');}}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.screen32)navigate32(b.dataset.screen32);if(b.hasAttribute('data-home32'))navigate32('home');if(b.hasAttribute('data-return32')){const route=location.hash.slice(1);if(route.startsWith('student/')&&route.split('/').length>2)navigate32('student/'+sid);else if(route.startsWith('student/'))navigate32('students');else navigate32(parents63.get(screens32.get(route))||'home');}if(b.hasAttribute('data-student-overview32'))navigate32('student/'+sid);if(b.dataset.serviceReview32)run(async()=>{const reply=prompt('ملاحظة لصاحب الطلب:','');if(reply===null)return;await api('/api/v32/service-requests/'+b.dataset.serviceReview32+'/review',{action:b.dataset.action32,reply});await fetchFeedback32();status('تمت معالجة الطلب');});});
document.addEventListener('submit',e=>{if(!['feedback32','enrollmentRequest32'].includes(e.target.id))return;e.preventDefault();const f=e.target;run(async()=>{const p=Object.fromEntries(new FormData(f));if(f.id==='enrollmentRequest32'){p.kind='enrollment';p.title=p.full_name;delete p.full_name;p.ring_id=Number(p.ring_id);}else p.kind='complaint';await api('/api/v32/service-requests',p);f.reset();await fetchFeedback32();status('تم إرسال الطلب');});});
document.addEventListener('click',event=>{
 const feature=event.target.closest('[data-select-feature63]');
 if(feature){
  const group=feature.closest('.group35');if(!group)return;
  const at=Number(feature.dataset.selectFeature63);
  group.querySelectorAll(':scope > [data-feature63]').forEach(node=>{node.hidden=Number(node.dataset.feature63)!==at;if(!node.hidden&&node.tagName==='DETAILS')node.open=true;});
  group.querySelector('.student-features63').hidden=true;
  group.querySelector('.student-feature-back63').hidden=false;
  group.querySelector('[data-feature63="'+at+'"]').scrollIntoView({block:'start',behavior:'smooth'});
 }
 if(event.target.closest('[data-back-feature63]')){
  const group=event.target.closest('.group35');if(!group)return;
  group.querySelectorAll(':scope > [data-feature63]').forEach(node=>node.hidden=true);
  group.querySelector('.student-features63').hidden=false;
  group.querySelector('.student-feature-back63').hidden=true;
 }
});
window.addEventListener('hashchange',()=>{if(data&&!busy)navigate32(location.hash.slice(1)||'home',false);});

function updateHeader32(){const now=new Date(),day=document.getElementById('headerDay32'),time=document.getElementById('headerTime32');if(day)day.textContent=new Intl.DateTimeFormat('ar-SA',{weekday:'long',timeZone:'Asia/Riyadh'}).format(now);if(time)time.textContent=new Intl.DateTimeFormat('ar-SA',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Riyadh'}).format(now);}updateHeader32();setInterval(updateHeader32,30000);
async function complexInfo32(){
 if(!['owner','halaqa_supervisor'].includes(data.user.role))return;
 const profile=await api('/api/v32/service-requests/complex-profile/'+mid),box=screens32.get('complex-info');if(!box)return;
 const labels={location:'موقع المجمع',supervisor_name:'مشرف المجمع',phone:'رقم جوال المشرف',book_name:'اسم كتاب المجمع للتعلم',book_count:'عدد الكتب',ordered_count:'الكتب التي تم طلبها',subscription_date:'تاريخ الاشتراك',renewal_date:'تاريخ تجديد الاشتراك'};
 box.insertAdjacentHTML('beforeend','<dl class="ref-info32">'+Object.entries(labels).map(([k,label])=>'<div><dt>'+label+'</dt><dd>'+esc(profile[k]||(['book_count','ordered_count'].includes(k)?'0':'غير مسجل'))+'</dd></div>').join('')+'</dl>'+(data.user.role==='owner'?'<details><summary>تعديل معلومات المجمع</summary><form id="complexProfile32" class="halaqat-form">'+Object.entries(labels).map(([k,label])=>input(k,label,profile[k]||'',['book_count','ordered_count'].includes(k)?'number':k.endsWith('_date')?'date':'text',false,['book_count','ordered_count'].includes(k)?'min="0" max="1000000"':'maxlength="'+(k==='location'?500:k==='phone'?40:180)+'"')).join('')+'<button>حفظ معلومات المجمع</button></form></details>':''));
}
document.addEventListener('submit',e=>{if(e.target.id!=='complexProfile32')return;e.preventDefault();run(async()=>{const p=Object.fromEntries(new FormData(e.target));for(const k of ['book_count','ordered_count'])p[k]=Number(p[k]||0);for(const k of ['subscription_date','renewal_date'])p[k]=p[k]||null;await api('/api/v32/service-requests/complex-profile/'+mid,p,'PUT');await load();status('تم حفظ معلومات المجمع');});});

let personal33=null;
function personalForm33(p,child){return '<p class="field-hint33">'+(child?'استكمل بيانات الطالب الشخصية. بيانات الحفظ والتقييم يحددها المعلم.':'استكمل بياناتك الشخصية. علامة * تعني أن الخانة مطلوبة.')+'</p><form id="'+(child?'childPersonalForm33-'+p.id:'personalForm33')+'" class="halaqat-form" '+(child?'data-child33="'+p.id+'"':'')+'>'+input('full_name','الاسم الكامل',p.full_name,'text',true,'maxlength="180" autocomplete="name"')+input('phone',child?'رقم جوال الطالب':data.user.account_type==='guardian'?'رقم جوال ولي الأمر':'رقم جوالي',p.phone,'tel',true,'maxlength="40" autocomplete="tel" placeholder="مثال: 0501234567"')+(child&&data.user.account_type==='guardian'?input('guardian_phone','رقم جوال ولي الأمر',p.guardian_phone||'','tel',true,'maxlength="40" placeholder="مثال: 0501234567"'):'')+input('email','البريد الإلكتروني',p.email,'email',true,'maxlength="200" autocomplete="email" placeholder="example@email.com"')+input('national_id','رقم الهوية أو الإقامة',p.national_id,'text',true,'minlength="5" maxlength="30" placeholder="اكتب رقم الهوية أو الإقامة"')+input('birth_date','تاريخ الميلاد',p.birth_date,'date',true,'min="1900-01-01" max="'+today()+'"')+'<button>حفظ البيانات</button></form>';}
async function loadPersonal33(){
 personal33=await api('/api/v33/my-profile');const grid=$('#halaqatWorkspace .halaqat-grid');if(!grid)return;
 const screen=addScreen32('personal-info','بياناتي الشخصية',personalForm33(personal33,false)+(personal33.children.length?'<h3>بيانات الطلاب المرتبطين بالحساب</h3><div class="ref-pair32">'+personal33.children.map(c=>tile32(c.full_name,'personal-child/'+c.id,c.missing.length?'بيانات ناقصة: '+c.missing.join('، '):'البيانات مكتملة')).join('')+'</div>':''),grid);
 const ownMissing=personal33.missing.length,childMissing=personal33.children.filter(c=>c.missing.length).length;
 $('#personalNotice33')?.remove();const note=document.createElement('div');note.id='personalNotice33';note.setAttribute('role','status');note.innerHTML=ownMissing||childMissing?'<button type="button" data-screen32="personal-info" class="ref-notice32">الرجاء تعبئة البيانات التالية '+(ownMissing?'· '+esc(personal33.missing.join('، ')):'')+(childMissing?' · '+childMissing+' ملف طالب يحتاج استكمالًا':'')+'</button>':'';$('#halaqatStatus')?.after(note);
 $('.ref-home32').insertAdjacentHTML('beforeend','<div class="ref-center32">'+tile32('بياناتي الشخصية','personal-info',ownMissing?'استكمل البيانات الناقصة':'عرض وتعديل البيانات')+'</div>');
 if(location.hash==='#personal-info')navigate32('personal-info',false);
 if(location.hash.startsWith('#personal-child/'))openChildPersonal33(Number(location.hash.split('/')[1]));
}
async function openChildPersonal33(id){const p=await api('/api/v33/students/'+id+'/personal-details');const key='personal-child/'+id;if(!screens32.has(key))addScreen32(key,'استكمال بيانات '+p.full_name,personalForm33(p,true),$('#halaqatWorkspace .halaqat-grid'));navigate32(key);}
document.addEventListener('submit',e=>{if(e.target.id!=='personalForm33'&&!e.target.id.startsWith('childPersonalForm33-'))return;e.preventDefault();const f=e.target;run(async()=>{const p=Object.fromEntries(new FormData(f));await api(f.dataset.child33?'/api/v33/students/'+f.dataset.child33+'/personal-details':'/api/v33/my-profile',p,'PUT');await load();navigate32('personal-info');status('تم حفظ البيانات الشخصية');});});

const v34=()=>'/api/v34/mosques/'+mid;
let drafts34=[],draftMid34=0,weekly34=null,preview34=null;
const form34=(id,body)=>'<form id="'+id+'" class="halaqat-form">'+body+'</form>';
const fold34=(title,body)=>'<details class="merged34"><summary>'+title+'</summary>'+body+'</details>';
function drawDrafts34(){const b=$('#drafts34');if(b)b.innerHTML=drafts34.map((p,i)=>'<p>'+esc(p.full_name)+' · '+esc(p.username)+' '+button('إزالة','data-remove-draft34="'+i+'"')+'</p>').join('')+(drafts34.length?button('رفع المجموعة ('+drafts34.length+')','data-submit-batch34'):'');}
async function mount34(){
 if(draftMid34!==mid){drafts34=[];draftMid34=mid;}
 const manager=['owner','halaqa_supervisor'].includes(data.user.role),owner=data.user.role==='owner';
 if(!manager)return;
 const account=screens32.get('accounts');
 if(account){
  $('#proposal32 button[type=submit], #proposal32 button:not([type])')?.insertAdjacentHTML('beforebegin','<label class="choice34"><input type="checkbox" name="batch34"> إضافة الطلب إلى مجموعة قبل رفعها</label>');
  account.insertAdjacentHTML('beforeend',fold34('مجموعة طلبات الإصدار','<p>أضف الطلبات من النموذج أعلاه، ثم ارفعها مرة واحدة. تبقى كلمات المرور في هذه الجلسة فقط حتى الرفع، ولا تعمل إلا بعد موافقة المالك.</p><div id="drafts34"></div>'));
  if(owner)$('#requestsList32')?.insertAdjacentHTML('beforebegin','<div class="actions">'+button('الموافقة على المحدد','data-batch-action34="approve"')+button('إرجاع المحدد','data-batch-action34="return"')+button('رفض المحدد','data-batch-action34="reject"')+'</div>');drawDrafts34();
 }
 const a=await api(v34()+'/admissions'),rings=screens32.get('rings');
 if(rings){rings.insertAdjacentHTML('beforeend',fold34('القبول وقائمة الانتظار',
   '<p>القبول ينشئ ملف الطالب فقط. إصدار حساب دخوله يبقى بطلب مستقل وموافقة المالك. السعة الافتراضية 30 طالبًا، ويمكن تعديلها.</p>'+
   a.rings.map(r=>'<div class="halaqat-card"><strong>'+esc(r.name)+'</strong><p>'+r.students+' طالب · '+r.available+' مقعد متاح</p>'+form34('capacity34-'+r.id,input('capacity','سعة الحلقة',r.capacity,'number',true,'min="1" max="10000"')+'<button>حفظ السعة</button>')+'</div>').join('')+
   form34('admission34',select('ring_id','الحلقة المطلوبة',a.rings.map(r=>[r.id,r.name]))+input('full_name','اسم الطالب','','text',true,'minlength="2" maxlength="180"')+input('phone','رقم التواصل','','tel',true,'minlength="8" maxlength="40"')+input('notes','ملاحظات القبول','','text',false,'maxlength="1000"')+'<button>إضافة إلى الانتظار</button>')+
   (a.requests.map(r=>'<article class="halaqat-card"><strong>'+esc(r.full_name)+'</strong><p>'+esc(a.rings.find(x=>x.id===r.ring_id)?.name)+' · '+esc({waiting:'في الانتظار',admitted:'تم القبول',rejected:'مرفوض'}[r.status])+'</p><p><bdi>'+esc(r.phone)+'</bdi> · '+esc(r.notes)+'</p>'+(r.status==='waiting'&&data.user.role==='owner'?button('قبول وإضافة ملف الطالب','data-admission34="'+r.id+'" data-decision34="admit"')+button('رفض الطلب','data-admission34="'+r.id+'" data-decision34="reject"'):'')+'</article>').join('')||empty('لا توجد طلبات انتظار.'))));}
 const c=await api(v34()+'/ring-comparison'),reports=screens32.get('reports');
 if(reports)reports.insertAdjacentHTML('beforeend',fold34('مقارنة الحلقات حسب العدد والمستوى','<p>'+esc(c.method)+'</p><div class="table-scroll34"><table class="comparison34"><thead><tr><th>الحلقة</th><th>المستوى</th><th>الطلاب</th><th>المقيّمون</th><th>الحضور</th><th>الحفظ /10</th></tr></thead><tbody>'+c.rings.flatMap(r=>r.levels.map(l=>'<tr><td>'+esc(r.name)+'</td><td>'+esc(l.level)+'</td><td>'+l.students+'</td><td>'+l.assessed_students+'</td><td>'+esc(l.attendance??'غير مسجل')+'</td><td>'+esc(l.score??'غير مسجل')+'</td></tr>')).join('')+'</tbody></table></div>'));
 const sub=await api(v34()+'/subscription'),box=screens32.get('complex-info'),s=sub.subscription;
 if(box)box.insertAdjacentHTML('beforeend',fold34('الاشتراك والتجديد','<p>الحالة: <strong>'+esc({active:'نشط',expired:'منتهي',expiring:'قريب الانتهاء',unregistered:'غير مسجل',upcoming:'لم يبدأ بعد'}[sub.status])+'</strong> · ينتهي: '+esc(sub.end||'غير مسجل')+'</p>'+(s?'<p>المبلغ: '+esc(s.amount)+' ريال · المسدد: '+esc(s.paid)+' ريال · المتبقي: '+esc(s.remaining)+' ريال</p>':'')+
   (owner?form34('subscription34',input('start','بداية الاشتراك',s?.start||today(),'date')+input('end','نهاية الاشتراك',s?.end||'','date')+input('amount','مبلغ الاشتراك (ريال)',s?.amount||'0','number',true,'min="0" step="0.01"')+input('paid','المبلغ المسدد (ريال)',s?.paid||'0','number',true,'min="0" step="0.01"')+'<button>حفظ الاشتراك</button>'):'')+
   form34('renewal34',input('end','تاريخ الانتهاء الجديد','','date')+input('note','ملاحظة التجديد','','text',false,'maxlength="1000"')+'<button>رفع طلب تجديد</button>')+
   sub.requests.map(r=>'<article class="halaqat-card">تجديد حتى '+esc(r.end)+' · '+esc(states32[r.status])+'<p>'+esc(r.note)+'</p>'+(owner&&r.status==='pending'?button('موافقة التجديد','data-renewal34="'+r.id+'" data-decision34="approve"')+button('رفض','data-renewal34="'+r.id+'" data-decision34="reject"'):'')+'</article>').join('')));
 if(owner&&reports){
  const b=await api('/api/v34/backups');
  reports.insertAdjacentHTML('beforeend',fold34('نسخ بيانات المتابعة واستعادتها','<p>'+esc(b.scope)+'</p><p>نسخة يومية تلقائية عند تشغيل الخدمة. نزّل نسخة خارج البرنامج للاحتفاظ بها إذا تعطلت قاعدة البيانات.</p>'+button('إنشاء نسخة الآن','data-backup34')+b.backups.map(x=>'<article class="halaqat-card">'+esc(new Date(x.created_at).toLocaleString('ar-SA'))+' · '+x.records+' سجل · '+esc({daily:'يومية',manual:'يدوية',before_restore:'قبل الاستعادة'}[x.kind])+'<div class="actions"><a class="halaqat-btn" href="/api/v34/backups/'+x.id+'/download">تنزيل النسخة</a>'+button('معاينة الاستعادة','data-preview34="'+x.id+'"')+'</div></article>').join('')+'<div id="restorePreview34"></div>'));
  const w=await api('/api/v34/whatsapp/settings');reports.insertAdjacentHTML('beforeend',fold34('تقارير واتساب التلقائية','<p>حالة الربط: <strong>'+(w.configured?'مكتمل':'غير مفعّل؛ أكمل إعداد واتساب أعمال')+'</strong></p><p>'+esc(w.schedule)+'</p><p>يصل التقرير فقط للأرقام التي فعّلت استقبال التقارير في ملف الطالب. تظهر حالة القبول والتوصيل في نفس الملف.</p>'+form34('whatsappSettings34','<label class="choice34"><input name="enabled" type="checkbox" '+(w.enabled?'checked':'')+' '+(!w.configured?'disabled':'')+'> تفعيل إرسال التقارير الأسبوعية تلقائيًا</label><button>حفظ الإعداد</button>')));
 }
}
async function student34(){
 const summary=$('#studentOverview32');if(!summary)return;
 weekly34=await api(v34()+'/students/'+sid+'/weekly');const c=weekly34.current,p=weekly34.previous;
 const amount34=v=>v.page+' وجه · '+v.ayah+' آية';
 summary.insertAdjacentHTML('beforeend',fold34('التقرير الأسبوعي','<div id="weeklyReport34"><p>'+esc(weekly34.from)+' إلى '+esc(weekly34.to)+'</p><dl class="ref-info32"><div><dt>الحضور</dt><dd>'+c.present+' يوم · الغياب '+c.absent+' يوم · غائب بعذر '+(c.excused??0)+' · مستأذن '+(c.permission??0)+'</dd></div><div><dt>الحفظ</dt><dd>'+esc(amount34(c.memorized))+'</dd></div><div><dt>المراجعة</dt><dd>'+esc(amount34(c.revision))+'</dd></div><div><dt>متوسط التقييم المعتمد</dt><dd>'+esc(c.score??'غير مسجل')+' /10 · الأسبوع السابق '+esc(p.score??'غير مسجل')+'</dd></div><div><dt>التغير عن الأسبوع السابق</dt><dd>'+esc(weekly34.score_change??'لا توجد بيانات كافية للمقارنة')+'</dd></div><div><dt>الورد القادم</dt><dd>'+esc(weekly34.next?weekly34.next.due+' · '+weekly34.next.memorization+' · '+weekly34.next.revision:'لا يوجد ورد مسجل')+'</dd></div></dl>'+weekly34.notes.map(n=>'<p>'+esc(n.day)+' · '+esc(n.note)+'</p>').join('')+'</div>'+button('نسخ التقرير','data-copy-weekly34')));
 if(file.can_edit){const a=await api(v34()+'/students/'+sid+'/actions');summary.insertAdjacentHTML('beforeend',fold34('إجراءات متابعة الطالب',form34('action34',input('title','إجراء المتابعة المطلوب','','text',true,'minlength="2" maxlength="180"')+select('assigned_to','المسؤول عن المتابعة',a.staff.map(x=>[x.id,x.name]))+input('due','موعد إنجاز المتابعة',today(),'date',true,'min="'+today()+'"')+'<button>إسناد المتابعة</button>')+a.actions.map(x=>'<article class="halaqat-card"><strong>'+esc(x.title)+'</strong><p>'+esc(x.assignee)+' · '+esc(x.due)+' · '+(x.status==='done'?'منجزة':x.overdue?'متأخرة':'مفتوحة')+'</p><p>'+esc(x.outcome)+'</p>'+(x.status==='open'&&(data.user.role!=='halaqa_teacher'||x.assigned_to===data.user.id)?button('تسجيل النتيجة وإغلاق المتابعة','data-close-action34="'+x.id+'"'):'')+'</article>').join('')));}
 if(document.querySelector('meta[name="demo-base42"]')){summary.insertAdjacentHTML('beforeend',fold34('استقبال التقرير عبر واتساب','<p>معاينة وإرسال التقارير غير متاحين في العرض التجريبي.</p>'));return;}
 const w=await api('/api/v34/whatsapp/mosques/'+mid+'/students/'+sid),r=w.recipient;
 summary.insertAdjacentHTML('beforeend',fold34('استقبال التقرير عبر واتساب','<p>'+(!w.configured?'الإرسال غير مفعّل حتى إكمال ربط واتساب أعمال.':w.automation_active?'الإرسال الأسبوعي التلقائي مفعّل.':'الإرسال الأسبوعي متوقف من المالك.')+'</p>'+form34('whatsappRecipient34',select('recipient','مستلم التقرير',[['guardian','ولي الأمر'],['student','الطالب']],r.recipient)+input('phone','رقم واتساب المستلم مع رمز الدولة',r.phone,'tel',false,'maxlength="40" placeholder="966501234567"')+'<label class="choice34"><input type="checkbox" name="opted_in" '+(r.opted_in?'checked':'')+'> أوافق على استقبال تقارير هذا الطالب على الرقم المسجل، أو تأكدت من موافقة صاحب الرقم. يمكن إيقافها بإلغاء هذا الخيار.</label><button>حفظ رقم وخيار الاستقبال</button>')+(file.can_edit?button('معاينة التقرير قبل الإرسال','data-preview38'):'')+w.jobs.map(j=>'<p>تقرير حتى '+esc(j.end)+' · '+esc({pending:'في قائمة الإرسال',sending:'جارٍ الإرسال',accepted:'قبلته المنصة',sent:'أُرسل',delivered:'تم التوصيل',read:'تمت القراءة',failed:'تعذر الإرسال',unknown:'التوصيل غير مؤكد',cancelled:'أُلغي الإرسال'}[j.status])+(j.error?' · '+esc(j.error):'')+'</p>').join('')));
}
document.addEventListener('submit',e=>{
 const id=e.target.id;if(!['admission34','subscription34','renewal34','action34','restore34','whatsappRecipient34','whatsappSettings34'].includes(id)&&!id.startsWith('capacity34-'))return;
 e.preventDefault();const f=e.target,fd=new FormData(f),p=Object.fromEntries(fd);
 run(async()=>{
  if(id.startsWith('capacity34-')){p.capacity=Number(p.capacity);await api(v34()+'/rings/'+id.split('-')[1]+'/capacity',p,'PUT');}
  if(id==='admission34'){p.ring_id=Number(p.ring_id);await api(v34()+'/admissions',p);}
  if(id==='subscription34')await api(v34()+'/subscription',p,'PUT');
  if(id==='renewal34')await api(v34()+'/renewals',p);
  if(id==='action34'){p.assigned_to=Number(p.assigned_to);await api(v34()+'/students/'+sid+'/actions',p);await openFile(sid,false);status('تم إسناد المتابعة');return;}
  if(id==='whatsappRecipient34'){p.opted_in=fd.has('opted_in');await api('/api/v34/whatsapp/mosques/'+mid+'/students/'+sid,p,'PUT');await openFile(sid,false);status('تم حفظ خيار استقبال واتساب');return;}
  if(id==='whatsappSettings34')await api('/api/v34/whatsapp/settings',{enabled:fd.has('enabled')},'PUT');
  if(id==='restore34'){await api('/api/v34/backups/'+preview34.id+'/restore',{token:preview34.token,confirm:p.confirm});preview34=null;}
  const route=route32;await load();navigate32(route);status('تم حفظ البيانات');
 });
});
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-remove-draft34')){drafts34.splice(Number(b.dataset.removeDraft34),1);drawDrafts34();}
 if(b.hasAttribute('data-submit-batch34'))run(async()=>{await api(v34()+'/account-requests/batch',{items:drafts34});drafts34=[];await load();navigate32('accounts');status('تم رفع مجموعة الطلبات للمالك');});
 if(b.dataset.batchAction34)run(async()=>{const ids=[...document.querySelectorAll('[data-batch-review34]:checked')].map(x=>Number(x.dataset.batchReview34));if(!ids.length)throw Error('حدد الطلبات المطلوبة أولًا');const note=b.dataset.batchAction34==='approve'?'':prompt('ملاحظة المراجعة الجماعية:','');if(note===null)return;await api(v34()+'/account-requests/batch-review',{ids,action:b.dataset.batchAction34,note});await load();navigate32('accounts');status('تمت مراجعة الطلبات المحددة');});
 if(b.dataset.admission34)run(async()=>{await api(v34()+'/admissions/'+b.dataset.admission34+'/review',{action:b.dataset.decision34});await load();navigate32('rings');status('تمت معالجة طلب القبول');});
 if(b.dataset.renewal34)run(async()=>{await api(v34()+'/renewals/'+b.dataset.renewal34+'/review',{action:b.dataset.decision34});await load();navigate32('complex-info');status('تمت مراجعة التجديد');});
 if(b.dataset.closeAction34)run(async()=>{const outcome=prompt('ما نتيجة المتابعة؟');if(outcome===null)return;await api(v34()+'/students/'+sid+'/actions/'+b.dataset.closeAction34,{status:'done',outcome},'PUT');await openFile(sid,false);status('تم تسجيل النتيجة');});
 if(b.hasAttribute('data-copy-weekly34'))run(async()=>{await navigator.clipboard.writeText($('#weeklyReport34').innerText);status('تم نسخ التقرير الأسبوعي');});
 
 if(b.hasAttribute('data-backup34'))run(async()=>{await api('/api/v34/backups',{});await load();navigate32('reports');status('تم إنشاء النسخة');});
 if(b.dataset.preview34)run(async()=>{const p=await api('/api/v34/backups/'+b.dataset.preview34+'/preview',{});preview34={id:b.dataset.preview34,token:p.token};$('#restorePreview34').innerHTML='<p>'+esc(p.message)+'</p>'+p.counts.map(c=>'<p>'+esc(c.label)+': استعادة '+c.restore+' · إضافة '+c.insert+' · حفظ '+c.keep_new+' سجل جديد</p>').join('')+form34('restore34',input('confirm','اكتب: استعادة سجلات النسخة')+'<button>تأكيد استعادة السجلات</button>');status('راجع المعاينة قبل تأكيد الاستعادة');});
});

let inbox35=[],daily35=null,history35=null,insight35=null,studentGroups35=new Map();
const api35=()=>'/api/v35/mosques/'+mid;
const kinds35={student_add:'إضافة طالب وإصدار حسابه',account:'إصدار الحسابات',admission:'القبول والانتظار',renewal:'التجديد',change:'النقل والتعديلات',legacy:'الطلبات السابقة',complaint:'الشكاوى',enrollment:'إضافة الطلاب'};
const status35={pending:'بانتظار المعالجة',returned:'معاد للاستكمال',approved:'موافق عليه',admitted:'تم القبول',rejected:'مرفوض',closed:'تمت المعالجة',cancelled:'ملغي'};
async function mount35(){
 const role=data.user.role,manager=['owner','halaqa_supervisor'].includes(role),family=role==='halaqa_student';
 daily35=await api(api35()+'/today');inbox35=(await api(api35()+'/inbox')).requests;
 // Reuse the existing accounts/complaints screen; retain its forms as expandable sections.
 const center=screens32.get(manager?'accounts':'complaints');
 if(center){
  const contents=document.createElement('details');contents.className='merged34';contents.id='requestTools35';contents.innerHTML='<summary>'+(manager?'الحسابات والإصدار والتفاصيل السابقة':'إرسال شكوى ومتابعتها')+'</summary>';
  for(const n of [...center.children])if(n.tagName!=='H2')contents.append(n);
  const centerHeading=center.querySelector('h2');if(centerHeading)centerHeading.textContent='مركز الطلبات'+(manager?' والحسابات':'');center.append(contents);
  for(const key of manager?['complaints','enrollment-review']:[]){
   const old=screens32.get(key);if(!old||old===center)continue;
   const d=document.createElement('details');d.className='merged34';d.id=key==='complaints'?'complaintForm35':'enrollmentForm35';d.innerHTML='<summary>'+esc(old.querySelector('h2')?.textContent||'الطلبات')+'</summary>';
   for(const n of [...old.children])if(n.tagName!=='H2')d.append(n);center.append(d);old.remove();screens32.set(key,center);
  }
  screens32.set('requests',center);screens32.set('request-list',center);
  if(centerHeading)centerHeading.insertAdjacentHTML('afterend','<div id="inbox35"><p>الطلبات التي يمكنك الاطلاع عليها، مع خيارات المعالجة حسب صلاحيتك.</p><div class="halaqat-form-grid">'+select('kind35','نوع الطلب',[['','جميع الأنواع'],...(manager?Object.entries(kinds35):[['complaint','الشكاوى']])],'',false)+select('state35','الحالة',[['','جميع الحالات'],...Object.entries(status35)],'pending',false)+'</div><div id="inboxRows35"></div></div>');drawInbox35();
 }
 const home=screens32.get('home'),totalPending=inbox35.filter(r=>r.status==='pending').length;
 const primary=role==='owner'?[["مركز الطلبات والحسابات","accounts",totalPending+' طلب بانتظار المعالجة'],['الحلقات والطلاب','rings',data.students.length+' طالب'],['التقارير والإحصاءات','reports','النتائج والاشتراكات والنسخ']]:role==='halaqa_supervisor'?[['مركز الطلبات والحسابات','accounts',totalPending+' طلب قيد المتابعة'],['الحلقات والطلاب','rings',data.students.length+' طالب'],['التقارير','reports','أداء المجمع']]:role==='halaqa_teacher'?[['تحضير اليوم','attendance','ابدأ بتسجيل حضور الطلاب'],['التسميع والطلاب','students',data.students.length+' طالب'],['التواصل والشكاوى','requests','الإعلانات والتواصل مع الإدارة']]:data.students.map(s=>[s.name,'student/'+s.id,'التقرير والورد القادم']);
 home.innerHTML='<h2 class="ref-title32">'+(role==='owner'?'متابعة المجمعات':role==='halaqa_teacher'?'يوم المعلم':family?'متابعة '+(data.user.account_type==='guardian'?'أبنائي':'تقدمي'):'متابعة المجمع')+'</h2><form id="search35" class="search35">'+input('q','بحث عن طالب أو معلم أو حلقة','','search',false,'minlength="2" maxlength="80" placeholder="اكتب حرفين على الأقل"')+'<button>بحث</button></form><div id="searchResults35" aria-live="polite"></div><div class="ref-pair32">'+primary.map(x=>tile32(...x)).join('')+'</div><section id="today35"><h3>'+(role==='owner'?'مهامي الإدارية':'مهام اليوم')+' <span class="halaqat-badge">'+daily35.total+'</span></h3><p>'+esc(daily35.day)+(role==='owner'?' · الموافقات والمتابعات المسندة إليك في المجمع المحدد.':family?' · متابعة بياناتك وأورادك.':' · التحضير الناقص يعتمد على جدول لقاءات الحلقة المسجل.')+'</p>'+select('taskKind35','عرض المهام',(role==='owner'?[['','كل مهامي الإدارية'],['approval','الموافقات'],['followup','المتابعات المسندة لي']]:[['','كل المهام'],...(family?[['assignment','أورادي'],...(data.user.account_type==='guardian'?[['incomplete','بيانات أبنائي']]:[])]:[...(manager?[['approval','الموافقات']]:[]),...(role==='halaqa_teacher'?[['attendance','التحضير'],['evaluation','التقييم']]:[]),['followup','المتابعات']]),['profile','بياناتي']]), '',false)+'<div id="taskRows35"></div></section><details class="merged34" id="homeMore35"><summary>المزيد</summary><div class="ref-pair32">'+[['بياناتي الشخصية','personal-info'],...(manager?[['معلومات المجمع','complex-info'],...(role==='owner'?[['إدارة المجمعات','complexes']]:[])]:[]),['التواصل والإعلانات','communication'],['الطلبات','requests'],...(screens32.has('more')?[['الأدوات الإضافية','more']]:[])].filter(x=>screens32.has(x[1])).map(x=>tile32(...x)).join('')+'</div></details>';
 drawTasks35();
 if(family){const summaries=await Promise.all(data.students.map(s=>api('/api/v34/mosques/'+mid+'/students/'+s.id+'/weekly')));home.querySelector('#today35').insertAdjacentHTML('beforebegin','<section class="family-summary35"><h3>آخر متابعة أسبوعية</h3>'+summaries.map((w,i)=>'<article class="halaqat-card"><strong>'+esc(w.student)+'</strong><p>الحضور '+w.current.present+' · الغياب '+w.current.absent+' · غائب بعذر '+(w.current.excused??0)+' · مستأذن '+(w.current.permission??0)+' · متوسط التقييم المعتمد '+esc(w.current.score??'لم يسجل')+'</p><p>الورد القادم: '+esc(w.next?w.next.memorization+' · '+w.next.due:'لم يحدد بعد')+'</p>'+button('فتح التقرير والملف','data-screen32="student/'+data.students[i].id+'"')+'</article>').join('')+'</section>');}
 navigate32(location.hash.slice(1)||'home',false);
}
function drawInbox35(){const box=$('#inboxRows35');if(!box)return;const kind=$('[name=kind35]')?.value,state=$('[name=state35]')?.value;box.innerHTML=inbox35.filter(r=>(!kind||r.kind===kind)&&(!state||r.status===state)).map(r=>'<article class="halaqat-card"><span class="halaqat-badge">'+esc(kinds35[r.kind])+' · '+esc(status35[r.status]||r.status)+'</span><h3>'+esc(r.title)+'</h3><p>'+esc(r.detail)+'</p><div class="actions">'+r.actions.map(a=>button({approve:'موافقة',admit:'قبول الطالب',return:'إعادة للاستكمال',reject:'رفض',close:'رد ومعالجة'}[a],'data-inbox35="'+esc(r.key)+'" data-inbox-action35="'+a+'"')).join('')+(r.kind==='legacy'?button('فتح التفاصيل السابقة','data-request-tools35'):'')+'</div></article>').join('')||empty('لا توجد طلبات بهذه الخيارات.');}
function drawTasks35(){const kind=$('[name=taskKind35]')?.value,rows=daily35.tasks.filter(r=>!kind||r.kind===kind),box=$('#taskRows35');box.innerHTML=rows.slice(0,12).map(r=>'<article class="task35"><div><strong>'+esc(r.title)+'</strong><p>'+esc(r.detail)+'</p></div>'+button('فتح','data-screen32="'+esc(r.route)+'"')+'</article>').join('')||empty('لا توجد مهام مطلوبة ضمن هذا التصنيف.');if(rows.length>12)box.insertAdjacentHTML('beforeend','<details><summary>بقية المهام ('+(rows.length-12)+')</summary>'+rows.slice(12).map(r=>'<p>'+button(r.title,'data-screen32="'+esc(r.route)+'"')+'</p>').join('')+'</details>');}
async function student35(){
 const root=$('#studentFile'),grid=root.querySelector('.halaqat-grid'),summary=$('#studentOverview32');studentGroups35=new Map();
 const groups={attendance:'الحضور والتسميع',learning:'الخطة والتقدم',communication:'التواصل والتقارير'};
 const containers={};for(const [key,title] of Object.entries(groups)){const p=document.createElement('details');p.className='ref-file-screen32 group35';p.dataset.fileRoute32=key;p.hidden=true;p.innerHTML='<summary>'+title+'</summary>';p.open=key==='attendance'&&file.can_edit;containers[key]=p;grid.append(p);}
 const originals=[...root.querySelectorAll('.ref-file-screen32')].filter(p=>!p.classList.contains('group35'));
 for(const p of originals){const title=p.querySelector('h2')?.textContent||'',old=p.dataset.fileRoute32;const group=/تسجيل التسميع|سجل الحضور|التحضير|اعتذارات الغياب/.test(title)?'attendance':/خطة|هدف الختم|إنجاز|ورد|مراجعة|خريطة|أخطاء|اختبار|مستوى|تسميع/.test(title)?'learning':'communication';studentGroups35.set(old,{group,node:p});p.classList.remove('ref-file-screen32');p.hidden=false;if(p.tagName==='DETAILS')p.open=false;containers[group].append(p);}
 for(const p of [...summary.querySelectorAll(':scope > .merged34')]){const title=p.querySelector('summary')?.textContent||'';containers[/إجراءات متابعة/.test(title)?'learning':'communication'].append(p);}
 summary.querySelector(':scope > .ref-pair32')?.remove();summary.insertAdjacentHTML('beforeend','<div class="ref-pair32 group-links35">'+Object.entries(groups).map(([k,t])=>tile32(t,'student/'+sid+'/'+k)).join('')+'</div>');
 insight35=await api(api35()+'/students/'+sid+'/plan-insight');
 containers.learning.insertAdjacentHTML('afterbegin',fold34('تحقيق الخطة أسبوعيًا','<p>'+esc(insight35.message)+'</p>'+insight35.weeks.map(w=>'<article class="halaqat-card"><strong>'+esc(w.from)+' — '+esc(w.to)+(w.complete?'':' · أسبوع جارٍ')+'</strong><p>الحفظ: '+w.memorization+' من '+w.memorization_target+' '+unit(insight35.memorization_unit)+' ('+w.memorization_percent+'%)</p><p>المراجعة: '+w.revision+' من '+w.revision_target+' '+unit(insight35.revision_unit)+' ('+w.revision_percent+'%)</p><p>أيام مسجلة: '+w.recorded_days+'</p></article>').join('')+(insight35.suggestion&&file.can_edit?'<p>'+esc(insight35.suggestion.reason)+'</p>'+button('مراجعة اقتراح الخطة','data-suggest-plan35'):'<p>تعديل الخطة يبقى باختيار المعلم بعد مراجعة النتائج.</p>')));
 if(data.user.role==='halaqa_student'){const personal=personal33.children.find(c=>c.id===sid);if(personal){const self=data.user.account_type==='student';containers.communication.insertAdjacentHTML('afterbegin',fold34('البيانات الشخصية وأرقام التواصل','<p>رقم جوال الطالب: '+esc(personal.phone||'غير مسجل')+'</p>'+(!self?'<p>رقم جوال ولي الأمر: '+esc(personal.guardian_phone||'غير مسجل')+'</p>':'')+(personal.missing.length?'<p>الرجاء تعبئة البيانات التالية: '+esc(personal.missing.join('، '))+'</p>':'')+button('تعبئة أو تحديث البيانات','data-screen32="'+(self?'personal-info':'personal-child/'+sid)+'"')));}}
 history35=null;
 if(file.can_edit){history35=await api(api35()+'/students/'+sid+'/history');containers.attendance.insertAdjacentHTML('beforeend',fold34('سجل التصحيحات والتراجع',history35.changes.map(r=>'<article class="halaqat-card"><strong>'+esc(r.day)+' · '+esc(r.actor)+'</strong><p>'+esc(new Date(r.at).toLocaleString('ar-SA'))+' · '+esc(r.reason)+'</p>'+diff35(r.before,r.after)+(r.can_undo?button(r.before===null?'التراجع عن تسجيل اليوم':'استعادة القيم السابقة','data-undo35="'+r.id+'"'):'')+'</article>').join('')||empty('ستظهر هنا التعديلات الجديدة، مع اسم المنفذ ووقت التعديل.')));containers.communication.insertAdjacentHTML('beforeend',fold34('سجل نقل الطالب',history35.transfers.map(r=>'<article class="halaqat-card"><p>من '+esc(r.from)+' إلى '+esc(r.to)+'</p><p>'+esc(new Date(r.at).toLocaleString('ar-SA'))+' · اعتمد النقل: '+esc(r.approved_by)+'</p></article>').join('')||empty('لم يسجل نقل جديد لهذا الطالب.')));}
 showStudent32(location.hash.slice(1).split('/')[2]||'overview');
}
function diff35(before,after){const labels={attendance:'الحضور',memorized:'التسميع',revision:'المراجعة',notes:'الملاحظات',memorized_amount:'مقدار الحفظ',memorized_unit:'وحدة الحفظ',revision_amount:'مقدار المراجعة',revision_unit:'وحدة المراجعة',memorization_score:'درجة الحفظ',tajweed_score:'درجة التجويد',mistakes:'الأخطاء'},value=(key,v)=>key==='attendance'?(attendance[v]??v??'غير مسجل'):(v??'غير مسجل');return Object.entries(labels).filter(([k])=>(before?.[k]??null)!==(after?.[k]??null)).map(([k,l])=>'<p>'+l+': '+esc(value(k,before?.[k]))+' ← '+esc(value(k,after?.[k]))+'</p>').join('');}
document.addEventListener('change',e=>{if(['kind35','state35'].includes(e.target.name))drawInbox35();if(e.target.name==='taskKind35')drawTasks35();});
document.addEventListener('submit',e=>{if(e.target.id!=='search35')return;e.preventDefault();const q=e.target.elements.q.value.trim();run(async()=>{const d=await api(api35()+'/search?q='+encodeURIComponent(q));$('#searchResults35').innerHTML=d.results.map(r=>'<article class="task35"><div><strong>'+esc(r.name)+'</strong><p>'+esc(r.detail)+'</p></div>'+button('فتح',r.kind==='student'?'data-screen32="'+(data.user.role==='owner'?'students':r.route)+'"':data.user.role==='halaqa_student'?'data-screen32="rings"':'data-search-ring35="'+r.ring_id+'"')+'</article>').join('')||empty(q.length<2?'اكتب حرفين على الأقل.':'لا توجد نتائج ضمن نطاق حسابك.');status('تم البحث');});});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.searchRing35){navigate32('students');selectedStudentRing=b.dataset.searchRing35;const f=$('#studentRingFilter');if(f)f.value=selectedStudentRing;filterStudentList();}
 if(b.hasAttribute('data-request-tools35')){$('#requestTools35').open=true;$('#requestTools35').scrollIntoView({behavior:'smooth'});}
 if(b.dataset.inbox35)run(async()=>{const r=inbox35.find(x=>x.key===b.dataset.inbox35),action=b.dataset.inboxAction35;let note='';if(['reject','return','close'].includes(action)){note=prompt(action==='close'?'اكتب الرد على الشكوى:':'ملاحظة المراجعة:','');if(note===null)return;}
  const paths={student_add:'/api/v37/mosques/'+mid+'/enrollments/'+r.id+'/review',account:'/api/v32/mosques/'+mid+'/account-requests/'+r.id+'/review',admission:v34()+'/admissions/'+r.id+'/review',renewal:v34()+'/renewals/'+r.id+'/review',change:'/api/access/mosques/'+mid+'/change-requests/'+r.id+'/'+action,complaint:'/api/v32/service-requests/'+r.id+'/review',enrollment:'/api/v32/service-requests/'+r.id+'/review'};
  const payload=r.kind==='account'?{action,note}:r.kind==='change'?{note}:['complaint','enrollment'].includes(r.kind)?{action,reply:note}:{action};const reviewed=await api(paths[r.kind],payload);await load();navigate32('requests');if(reviewed.user)credentials(reviewed);status('تمت معالجة الطلب');
 });
 if(b.dataset.undo35)run(async()=>{const reason=prompt('سبب التراجع عن هذا التعديل:','');if(reason===null)return;await api(api35()+'/students/'+sid+'/history/'+b.dataset.undo35+'/undo',{reason});await openFile(sid,false);navigate32('student/'+sid+'/attendance');status('تم التراجع وتسجيل العملية');});
 if(b.hasAttribute('data-suggest-plan35')){const f=$('#planForm');if(!f||!insight35.suggestion)return;const field=f.elements.memorization_amount;field.value=insight35.suggestion.memorization_amount;const preset=f.elements.memorization_preset;if(preset){preset.value=file.plan.memorization_unit==='ayah'?'ayah':'custom';syncQuantity(preset);field.value=insight35.suggestion.memorization_amount;}for(let p=f.parentElement;p&&p!==$('#studentFile');p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;f.scrollIntoView({behavior:'smooth'});status('راجع المقدار المقترح ثم اضغط حفظ الخطة لاعتماده');}
});


async function mount37(){
 const owner=data.user.role==='owner',supervisor=data.user.role==='halaqa_supervisor';
 if(owner){
  $('#portalViewBox')?.remove();
  const students=screens32.get('students');
  if(students){students.innerHTML='<h2>أسماء الطلاب والحلقات</h2>'+input('ownerSearch37','بحث باسم الطالب أو الحلقة','','search',false)+select('ownerRing37','الحلقة',[['','كل الحلقات'],...data.rings.map(r=>[r.id,r.name])],'',false)+'<div id="ownerStudents37"></div>';drawOwner37();}
  document.querySelectorAll('[data-file],[data-screen32^="student/"]').forEach(b=>b.remove());
 }
 if(supervisor){
  const reports=screens32.get('reports');if(reports)reports.innerHTML='<h2>التقارير المختصرة للطلاب</h2><p>الاسم والحلقة والتقييم العام ورقما جوال الطالب وولي الأمر.</p><a class="halaqat-btn" href="/api/v37/mosques/'+mid+'/reports.csv">تنزيل تقارير طلاب المجمع</a>';
  const approved=inbox35.filter(r=>r.kind==='student_add'&&r.status==='approved').slice(-3);if(approved.length)screens32.get('home').insertAdjacentHTML('afterbegin',approved.map(r=>'<button type="button" class="ref-notice32" data-screen32="requests">تم اعتماد إضافة '+esc(r.title)+' · '+esc(r.detail)+'</button>').join(''));
  const d=await api('/api/v37/mosques/'+mid+'/data-reminders');
  screens32.get('home').insertAdjacentHTML('beforeend','<details class="merged34" id="dataReminders37" '+(d.reminders.length?'open':'')+'><summary>تنبيهات استكمال بيانات الطلاب ('+d.reminders.length+')</summary><p>علامة × تخفي التنبيه من حسابك فقط؛ يبقى لدى الطالب أو ولي الأمر حتى الاستكمال. يعود التنبيه إذا تغيرت قائمة البيانات الناقصة.</p>'+d.reminders.map(r=>'<article class="task35 reminder37"><div><strong>'+esc(r.name)+'</strong><p>البيانات المطلوب استكمالها: '+esc(r.missing.join('، '))+'</p>'+button('ملف الطالب','data-screen32="student/'+r.student_id+'/communication"')+'</div>'+button('×','data-dismiss37="'+r.student_id+'" data-stamp37="'+r.fingerprint+'" aria-label="إخفاء تنبيه '+esc(r.name)+' من حسابي فقط"')+'</article>').join('')+(d.reminders.length?'':empty('لا توجد تنبيهات جديدة.'))+'</details>');
 }
}
function drawOwner37(){
 const box=$('#ownerStudents37');if(!box)return;
 const q=($('[name=ownerSearch37]')?.value||'').trim(),rid=$('[name=ownerRing37]')?.value;
 box.innerHTML=data.students.filter(s=>{const ring=data.rings.find(r=>r.id===s.halaqa_id)?.name||'';return (!rid||String(s.halaqa_id)===rid)&&(!q||(s.name+' '+ring).includes(q));}).map(s=>'<article class="halaqat-card"><strong>'+esc(s.name)+'</strong><p>الحلقة: '+esc(data.rings.find(r=>r.id===s.halaqa_id)?.name||'غير محددة')+'</p></article>').join('')||empty('لا توجد أسماء مطابقة.');
}
document.addEventListener('input',e=>{if(e.target.name==='ownerSearch37')drawOwner37();});
document.addEventListener('change',e=>{if(e.target.name==='ownerRing37')drawOwner37();});
document.addEventListener('click',e=>{const b=e.target.closest('[data-dismiss37]');if(!b)return;run(async()=>{await api('/api/v37/mosques/'+mid+'/data-reminders/'+b.dataset.dismiss37+'/dismiss',{fingerprint:b.dataset.stamp37});await load();navigate32('home');status('أُخفي التنبيه من حسابك فقط');});});

function supervisorList37(){
 return '<label>اختر الحلقة<select id="studentRingFilter"><option value="">اختر الحلقة</option>'+data.rings.map(r=>'<option value="'+r.id+'">'+esc(r.name)+'</option>').join('')+'</select></label><div id="selectedRingWorkspace"></div><label>بحث داخل الحلقة<input id="studentSearch" type="search" placeholder="اسم الطالب"></label><p id="studentListHint"></p>'+data.students.map(s=>'<article class="student-row v30-student-row" hidden data-student-ring="'+s.halaqa_id+'" data-student-name="'+esc(s.name)+'"><div><strong>'+s.ring_number+' · '+esc(s.name)+'</strong><p>التقييم العام: '+esc(s.overall_rating==null?'لم يسجل':s.overall_rating+' / 10')+'</p><p>جوال الطالب: <bdi>'+esc(s.phone||'غير مسجل')+'</bdi></p><p>جوال ولي الأمر: <bdi>'+esc(s.guardian_phone||'غير مسجل')+'</bdi></p></div>'+button('فتح ملف الطالب','data-file="'+s.id+'"')+button('طلب أرشفة الطالب','data-student-archive="'+s.id+'" data-active="false"')+'</article>').join('');
}
async function openSupervisor37(id,month=today().slice(0,7)){
 const d=await api(base()+'/students/'+id+'/file?month='+encodeURIComponent(month)),s=d.student;
 sid=id;file=d;$('#halaqatWorkspace').hidden=true;$('#studentFile').hidden=false;$('#halaqatApp').classList.add('file-open');$('.halaqat-toolbar').hidden=false;
 $('#studentFile').innerHTML='<section id="supervisorSummary37" class="halaqat-card"><h2>'+esc(s.name)+'</h2><p>الحلقة: '+esc(s.ring)+'</p><dl class="ref-info32"><div><dt>التقييم العام</dt><dd>'+esc(s.overall_rating==null?'لم يسجل تقييم':s.overall_rating+' / 10')+'</dd></div><div><dt>رقم جوال الطالب</dt><dd><bdi>'+esc(s.phone||'غير مسجل')+'</bdi></dd></div><div><dt>رقم جوال ولي الأمر</dt><dd><bdi>'+esc(s.guardian_phone||'غير مسجل')+'</bdi></dd></div></dl><small>التقييم العام هو متوسط التقييمات المعتمدة خلال آخر 30 يومًا؛ تُحفظ درجات السجلات السابقة ضمنه.</small><div class="actions"><a class="halaqat-btn" href="'+base()+'/students/'+id+'/report.csv">تنزيل التقرير المختصر</a>'+button('العودة للطلاب','data-screen32="students"')+button('طلب أرشفة الطالب','data-student-archive="'+id+'" data-active="false"')+'</div></section>';
 const amount=(value,unit)=>value?esc(value)+' '+(unit==='ayah'?'آية':'وجه'):'';
 const metrics=p=>p.maximum?esc(p.total)+' من '+esc(p.maximum)+' ('+esc(p.percentage)+'٪)':'لا توجد لقاءات مستحقة';
 $('#studentFile').insertAdjacentHTML('beforeend','<section class="day-card53"><h3>الحفظ والتقييم والنقاط</h3><label>شهر المتابعة <input type="month" id="supervisorMonth53" value="'+esc(d.month)+'"></label><p>الحفظ عند التسجيل: '+esc(d.memorization_at_entry||'غير مسجل')+'</p><p>نقاط الطالب: '+metrics(d.points)+'</p><p>مجموع نقاط حلقة '+esc(s.ring)+': '+metrics(d.circle_points)+'</p></section><section class="halaqat-card"><h3>سجل المعلم خلال الشهر</h3>'+ (d.entries.map(r=>'<article class="day-card53"><strong>'+esc(r.day)+' · '+esc(attendance[r.attendance]||r.attendance)+'</strong><p>المعلم: '+esc(r.teacher||'غير مسجل')+'</p><p>الحفظ: '+esc(r.memorized||'—')+' '+amount(r.memorized_amount,r.memorized_unit)+' · المراجعة: '+esc(r.revision||'—')+' '+amount(r.revision_amount,r.revision_unit)+'</p><p>التقييم اليومي: '+(r.grade==null?'لا يوجد تقييم معتمد':esc(r.grade)+' / 10')+'</p>'+scoreFields52.map(([key,label])=>{const v=r.scores[key]??r[key];return v==null?'':'<span class="halaqat-badge">'+esc(label)+' '+esc(v)+'/10</span>';}).join(' ')+'<p>ملاحظات المعلم: '+esc(r.comments||'—')+'</p></article>').join('')||'<p>لا توجد سجلات لهذا الطالب خلال الشهر المحدد.</p>')+'</section>');
 $('#supervisorMonth53').onchange=e=>{if(e.target.value)run(()=>openSupervisor37(id,e.target.value));};
 if(!document.querySelector('meta[name="demo-base42"]'))await attachInsight56(id);
 route32='student/'+id;syncNavigation50();window.history.replaceState(null,'','#student/'+id);window.scrollTo({top:0,behavior:'instant'});
}
const api38=()=>'/api/v38/mosques/'+mid;
let pointMonth38='',pointSystem52='daily10',pointToken38='',preview38=null;
async function mount38(){
 $('#practiceTools36')?.remove();$('#practiceBanner36')?.remove();
 const home=screens32.get('home');if(!home)return;
 home.insertAdjacentHTML('beforeend','<details class="merged34" id="points38"><summary>نقاط الحلقات والترتيب الشهري</summary><div id="pointBody38"></div></details>');
 pointMonth38=today().slice(0,7);await drawPoints38();
 if(data.user.role==='owner'){
  const d=await api('/api/v38/owner-summary');
  home.insertAdjacentHTML('afterbegin','<section class="halaqat-card" id="ownerSummary38"><h3>ملخص إدارة النظام</h3><div class="ref-ratings32"><div>المجمعات<b>'+d.complexes+'</b></div><div>الحلقات الفعالة<b>'+d.rings+'</b></div><div>الحسابات الفعالة<b>'+d.accounts+'</b></div><div>طلبات معلقة<b>'+d.pending+'</b></div></div><details><summary>الاشتراكات المنتهية أو التي تنتهي خلال 30 يومًا ('+d.subscriptions.length+')</summary>'+d.subscriptions.map(s=>'<p>'+esc(s.name)+' · '+esc(s.end)+' · '+(s.expired?'منتهٍ':'قريب الانتهاء')+'</p>').join('')+'</details></section>');return;
 }
 const d=await api(api38()+'/engagement'),teacher=data.user.role==='halaqa_teacher',sup=data.user.role==='halaqa_supervisor';
 let h='';
 if(teacher||sup)h+='<details class="merged34" id="absenceAlerts38" '+(d.absences.length?'open':'')+'><summary>متابعة الانقطاع ('+d.absences.length+')</summary><p>التنبيه عند غياب الطالب في آخر ثلاثة سجلات حضور خلال 30 يومًا. اليوم غير المسجل لا يُعد غيابًا، والعذر المعتمد يوقف التنبيه.</p>'+d.absences.map(s=>'<article class="halaqat-card"><strong>'+esc(s.name)+'</strong>'+(sup?'<p>'+esc(s.ring)+' · التقييم العام: '+esc(s.overall_rating??'لم يسجل')+'</p><p>جوال الطالب: <bdi>'+esc(s.phone||'غير مسجل')+'</bdi> · ولي الأمر: <bdi>'+esc(s.guardian_phone||'غير مسجل')+'</bdi></p>':'')+button(sup?'عرض الملخص':'فتح التحضير','data-screen32="student/'+s.id+(sup?'':'/attendance')+'"')+'</article>').join('')+(!d.absences.length?empty('لا توجد حالات تحتاج متابعة حاليًا.'):'')+'</details>';
 if(!sup){
  h+='<section class="halaqat-card" id="examReminders38"><h3>مواعيد الاختبارات القريبة</h3><p>تذكير داخل البرنامج قبل الموعد بأسبوع؛ يظهر المتأخر لمدة أسبوع حتى معالجته.</p>'+d.exams.map(x=>'<article><strong>'+esc(x.name)+' · '+esc(x.title)+'</strong><p>'+esc(x.due)+(x.overdue?' · متأخر':'')+'</p><p>'+esc(x.syllabus)+'</p>'+button('تفاصيل الاختبار','data-screen32="student/'+x.student_id+'/learning"')+'</article>').join('')+(!d.exams.length?empty('لا توجد اختبارات خلال الأسبوع القادم.'):'')+'</section>';
  if(d.excuses.length)h+='<details class="merged34" id="pendingExcuses38" open><summary>اعتذارات الغياب بانتظار '+(teacher?'قرارك':'قرار المعلم')+' ('+d.excuses.length+')</summary>'+d.excuses.map(x=>'<article class="halaqat-card"><strong>'+esc(x.name)+' · '+esc(x.day)+'</strong><p>'+esc(x.reason)+'</p>'+button(teacher?'مراجعة العذر':'عرض العذر','data-screen32="student/'+x.student_id+'/attendance"')+'</article>').join('')+'</details>';
 }
 home.insertAdjacentHTML('beforeend',h);
}
const sources60=[['attendance','الحضور'],['wird','تقييم الورد (الحفظ والمراجعة)'],['quality','متوسط التجويد والتلاوة'],['behavior','السلوك'],['memorization_score','درجة التسميع'],['plan_commitment_score','الالتزام بالخطة'],['tajweed_score','التجويد'],['recitation_score','التلاوة'],['tarteel_score','الترتيل']];
function criterion60(x){
 return '<fieldset data-criterion60>'+input('label','اسم البند',x.label,'text',true,'maxlength="64"')+select('source','يُحتسب من',sources60,x.source)+input('weight','النقاط',x.weight,'number',true,'min="0" max="10"')+button('إزالة البند','data-remove60')+'</fieldset>';
}
function editor60(d){
 if(!d.can_configure||d.month<today().slice(0,7))return '';
 return '<details><summary>تعديل قواعد الشهر</summary><p>اختر بنود التقييم اليومي وأوزانها. المجموع ١٠. يُعاد حساب أرصدة الشهر عند الحفظ.</p>'+form34('rules60','<div data-items60>'+d.criteria.map(criterion60).join('')+'</div>'+button('إضافة بند','data-add60')+'<button>حفظ وإعادة الحساب</button>')+'</details>';
}
document.addEventListener('click',e=>{
 if(e.target.closest('[data-add60]'))$('#rules60 [data-items60]').insertAdjacentHTML('beforeend',criterion60({source:'behavior',label:'',weight:0}));
 if(e.target.closest('[data-remove60]'))e.target.closest('fieldset').remove();
});
document.addEventListener('submit',e=>{
 if(e.target.id!=='rules60')return;
 e.preventDefault();
 const items=Array.from(e.target.querySelectorAll('fieldset'),r=>({label:r.querySelector('[name=label]').value.trim(),source:r.querySelector('select').value,weight:Number(r.querySelector('[name=weight]').value)}));
 run(async()=>{await api(api38()+'/points/rules60',{month:pointMonth38,items},'PUT');pointSystem52='daily10';await drawPoints38();status('تم تحديث قواعد الشهر ورصيده');});
});
async function drawPoints38(){
 const d=await api(api38()+'/points?system='+pointSystem52+'&month='+encodeURIComponent(pointMonth38));pointToken38=crypto.randomUUID();
 if(d.system==='daily10'){renderDailyPoints52(d);return;}
 $('#pointBody38').innerHTML=form34('pointMonth38',input('month','الشهر',d.month,'month')+select('system','نظام النقاط',[['daily10','النقاط اليومية من 10'],['legacy','النظام السابق والتعديلات اليدوية']],pointSystem52)+'<button>عرض الشهر</button>')+'<p>كل حضور: '+d.policy.attendance+' نقطة · كل ورد مكتمل: '+d.policy.completion+' نقاط. تُحسب الأوراد في شهر موعدها بعد اعتماد إنجازها. الترتيب للحلقات ضمن نطاق حسابك.</p><p><small>الرصيد يتبع طلاب الحلقة الحاليين، ويشمل سجلات المؤرشفين؛ نقل الطالب ينقل نقاط سجلاته. تصحيح الحضور أو الإنجاز يعيد الحساب دون تكرار. النقاط لا تحل محل التقييم العام.</small></p>'+d.rings.map(r=>'<article class="task35"><div><h3>'+r.rank+' · '+esc(r.name)+'</h3><p>الحضور: '+r.attendance_count+' · أوراد مكتملة: '+r.completion_count+'</p><small>تلقائي '+r.automatic+' · تعديل '+r.manual+'</small></div><strong>'+r.total+' نقطة</strong></article>').join('')+(!d.rings.length?empty('لا توجد حلقات ضمن نطاقك.'):'')+


 editor60(d)+

 (d.can_adjust&&d.rings.length&&d.month===today().slice(0,7)?'<details><summary>تعديل نقاط حلقة مع سبب</summary><p>القيمة الموجبة إضافة والسالبة خصم. لتصحيح تعديل سابق أضف تعديلًا معاكسًا مع السبب؛ السجل محفوظ.</p>'+form34('pointAdjustment38',select('ring_id','الحلقة',d.rings.map(r=>[r.id,r.name]))+input('delta','النقاط المراد إضافتها أو خصمها',1,'number',true,'min="-10000" max="10000"')+textArea('reason','سبب التعديل','',500)+'<button>حفظ التعديل</button>')+'</details>':'')+
 (d.can_adjust||d.can_configure?'<details id="pointLog38"><summary>سجل التعديلات اليدوية — آخر 100 تعديل</summary>'+d.adjustments.map(a=>'<article><strong>'+esc(a.ring)+' · '+a.delta+' نقطة</strong><p>'+esc(a.reason)+'</p><small>'+esc(a.actor)+' · '+esc(new Date(a.at).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'}))+'</small></article>').join('')+(!d.adjustments.length?empty('لم تسجل تعديلات يدوية.'):'')+'</details>':'');
}
function renderDailyPoints52(d){
 $('#pointBody38').innerHTML=form34('pointMonth38',input('month','الشهر',d.month,'month')+select('system','نظام النقاط',[['daily10','النقاط اليومية من 10'],['legacy','النظام السابق والتعديلات اليدوية']],pointSystem52)+'<button>عرض الشهر</button>')+'<p>'+(d.month>='2026-11'?d.criteria.map(x=>esc(x.label)+' '+x.weight).join(' · '):'تُعرض درجات الشهر وفق قواعده السابقة')+'</p><p class="small-note">الترتيب بنسبة النقاط المحققة إلى أقصى نقاط اللقاءات المستحقة، ليكون عادلًا مع اختلاف أعداد الطلاب. الغائب بعذر يُستثنى من المقام. المستأذن يُحسب ضمن الحاضرين ويُقيّم بعد التسميع. من حضر ولم يُقيّم يحصل على نقاط بند الحضور فقط، وتظهر التقييمات الناقصة بوضوح.</p>'+(!d.activated_on?'<p class="teacher-reminder52">يبدأ احتساب النظام اليومي عند اعتماد أول تقييم اليوم. اضبط جدول لقاءات كل حلقة ليُحسب الاستحقاق بدقة.</p>':'<p class="small-note">بداية النظام اليومي: '+esc(d.activated_on)+' · السجلات السابقة محفوظة في النظام السابق.</p>')+d.rings.map(r=>'<article class="task35 ring-ranking52"><div><h3>'+esc(r.rank??'—')+' · '+esc(r.name)+'</h3><p>'+r.total+' من '+r.maximum+' نقطة ممكنة · '+r.student_count+' طالبًا</p><small>تقييمات مكتملة: '+r.coverage.evaluations_complete+' · بانتظار التقييم: '+r.coverage.evaluations_pending+' · حضور غير مسجل: '+r.coverage.attendance_missing+'</small>'+(!r.coverage.calendar_defined?'<p class="small-note">يلزم تحديد جدول لقاءات الحلقة.</p>':'')+(r.coverage.roster_defined===false?'<p class="small-note">تاريخ عضوية بعض الطلاب غير مكتمل؛ راجع بيانات الحلقة قبل المقارنة النهائية.</p>':'')+'</div><strong>'+(r.percentage===null?'لم يبدأ':r.percentage+'%')+'</strong></article>').join('')+(!d.rings.length?empty('لا توجد حلقات ضمن نطاق حسابك.'):'')+'<p class="small-note">التعديلات اليدوية السابقة محفوظة في «النظام السابق»، ولا تغيّر تقييم الطالب اليومي من 10.</p>';
 $('#pointBody38').insertAdjacentHTML('afterbegin',editor60(d));
 if(data.user.role==='halaqa_supervisor'){
  const leaders=d.rings.filter(r=>r.rank===1&&r.maximum>0);
  const label=leaders.length>1?'الحلقات المتعادلة في الصدارة':'الحلقة المتصدرة';
  $('#pointBody38').insertAdjacentHTML('afterbegin','<section class="day-card53"><h3>منافسة حلقات المجمع · '+esc(d.month)+'</h3><p>'+ (leaders.length?label+': '+leaders.map(r=>esc(r.name)).join('، ')+' · '+esc(leaders[0].percentage)+'٪':'يظهر الترتيب بعد تسجيل لقاءات مستحقة.')+'</p><small>تُحسب النسبة بقسمة مجموع نقاط طلاب الحلقة على مجموع النقاط الممكنة للقاءاتهم المستحقة. يتحدث الترتيب مع اكتمال التقييمات.</small></section>');
 }
}
async function student38(){
 preview38=null;
 const b=await api(api38()+'/students/'+sid+'/badges');b.badges=[...new Set([...b.badges,...(follow.rewards?.badges||[])])];
 const learning=$('#studentFile [data-file-route32="learning"]');
 const old=[...$('#studentFile').querySelectorAll('.halaqat-panel')].find(p=>p.querySelector('h2')?.textContent==='النقاط والشارات');if(old)old.remove();
 learning?.insertAdjacentHTML('afterbegin','<section class="halaqat-card" id="badges38"><h3>أهدافي وشارات الإنجاز</h3>'+(follow.rewards?'<p class="daily-score52">نقاط هذا الشهر: '+follow.rewards.points+' من '+follow.rewards.maximum+'</p><p class="small-note">تقييمات بانتظار التسجيل: '+follow.rewards.coverage.evaluations_pending+' · رصيد النظام السابق: '+follow.rewards.legacy_points+'</p>':'')+(b.goal?'<p>'+esc(b.goal.title)+' · '+b.goal.percent+'% · الموعد '+esc(b.goal.deadline)+'</p>':'<p>يمكن للمعلم تحديد هدف الحفظ من «إعداد هدف الختم» أدناه.</p>')+'<p>'+b.badges.map(x=>'<span class="reward-badge">'+esc(x)+'</span>').join(' ')+'</p>'+(!b.badges.length?'<small>تظهر الشارات عند إتمام سورة باعتماد المعلم، أو تحقيق هدفك، أو حضور جميع لقاءات آخر سبعة أيام.</small>':'')+'</section>');
 if(!file.can_edit)$('#whatsappRecipient34')?.insertAdjacentHTML('afterend',button('معاينة تقريري عبر واتساب','data-preview38'));
}
document.addEventListener('submit',e=>{
 const id=e.target.id;if(!['pointMonth38','pointPolicy38','pointAdjustment38'].includes(id))return;e.preventDefault();
 const p=Object.fromEntries(new FormData(e.target));run(async()=>{
  if(id==='pointMonth38'){pointMonth38=p.month;pointSystem52=p.system||'daily10';}
  if(id==='pointPolicy38')await api(api38()+'/points/policy',{month:pointMonth38,attendance:Number(p.attendance),completion:Number(p.completion)},'PUT');
  if(id==='pointAdjustment38')await api(api38()+'/rings/'+Number(p.ring_id)+'/points',{month:pointMonth38,delta:Number(p.delta),reason:p.reason,token:pointToken38});
  await drawPoints38();status(id==='pointMonth38'?'تم عرض نقاط الشهر':'تم حفظ النقاط');
 });
});
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-preview38'))run(async()=>{
  const d=await api(api38()+'/students/'+sid+'/whatsapp-preview',{});preview38={token:d.token,sid};$('#waPreview38')?.remove();
  const labels=['الطالب','الفترة','الحضور','الحفظ','المراجعة','التقييم','الورد القادم','الملاحظات'];
  b.insertAdjacentHTML('afterend','<section class="halaqat-card" id="waPreview38" aria-live="polite"><h3>معاينة التقرير</h3><p>المستلم: '+(d.recipient==='guardian'?'ولي الأمر':'الطالب')+' · <bdi>'+esc(d.phone)+'</bdi></p><small>هذه حقول التقرير التي ستُرسل ضمن قالب واتساب المعتمد. المعاينة صالحة لعشر دقائق.</small>'+d.parameters.map((x,i)=>'<p><strong>'+labels[i]+': </strong>'+esc(x)+'</p>').join('')+(d.can_send?button('تأكيد إرسال هذا التقرير لهذا الرقم','data-confirm-wa38'):'<p>المعاينة فقط؛ الإرسال للمعلم بعد تفعيل ربط واتساب أعمال.</p>')+'</section>');status('راجع المستلم ومحتوى التقرير');
 });
 if(b.hasAttribute('data-confirm-wa38'))run(async()=>{
  if(!preview38||preview38.sid!==sid)throw Error('افتح المعاينة مجددًا');
  const r=await api(api38()+'/students/'+sid+'/whatsapp-confirm',{token:preview38.token});await openFile(sid,false);status(r.status==='pending'?'تمت إضافة التقرير المعتمد إلى قائمة الإرسال':'التقرير مسجل مسبقًا؛ راجع حالة الإرسال');
 });
});

// Version 41: one account can supervise a complex and teach assigned circles.
function mount41(){
 const home=screens32.get('home');if(!home)return;
 const original=data.user.original_role||data.user.role;
 if(original==='halaqa_supervisor'){
  const teaching=data.user.role==='halaqa_teacher';
  home.insertAdjacentHTML('afterbegin','<section class="halaqat-card"><h3>'+(teaching?'حلقتي كمعلم':'الإشراف على المجمع')+'</h3><p>'+(teaching?'تسجيل الحضور والحفظ والمراجعة والتقييم للحلقات المسندة إليك.':'يمكن إسناد حلقة لك كمعلم من إدارة الحلقة، دون إنشاء حساب آخر.')+'</p>'+button(teaching?'العودة للإشراف':'حلقتي كمعلم','data-teaching41="'+(teaching?'supervisor':'teacher')+'"')+'</section>');
 }
 if(data.rings.length===1 && data.user.role!=='halaqa_student'){
  const ring=data.rings[0];
  selectedStudentRing=String(ring.id);
  home.insertAdjacentHTML('afterbegin','<section class="halaqat-card"><h3>'+esc(ring.name)+'</h3><p>حلقة واحدة · '+ring.student_count+' طالب</p>'+button('فتح طلاب الحلقة','data-search-ring35="'+ring.id+'"')+'</section>');
 }
 if(data.user.role==='halaqa_teacher'&&original==='halaqa_supervisor'&&!data.rings.length)
  home.insertAdjacentHTML('afterbegin','<p class="halaqat-card">لم تُسند لك حلقة للتدريس بعد. يستطيع المالك اختيار حسابك ضمن المدرسين من تعديل الحلقة، أو يمكنك رفع طلب تغيير المدرس من واجهة الإشراف.</p>');
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-teaching41]');if(!b)return;
 run(async()=>{portalView=b.dataset.teaching41;selectedStudentRing='';sid=0;location.hash=portalView==='teacher'?'attendance':'home';await load();navigate32(location.hash.slice(1));});
});

async function mountDemoAdmin42(){
 if(data.user.role!=='owner'||document.querySelector('meta[name="demo-base42"]'))return;
 const home=screens32.get('home');if(!home)return;
 const [response,legacy]=await Promise.all([api('/api/demo42/trials'),api('/api/demo42/accounts')]);
 const isActive=a=>a.active&&!a.expired&&new Date(a.expires_at).getTime()>Date.now();
 const trialRow=a=>'<article class="halaqat-card demo-trial52"><strong>'+esc(a.name)+'</strong><p><span class="halaqat-badge">'+(isActive(a)?'فعالة':a.expired||new Date(a.expires_at).getTime()<=Date.now()?'منتهية':'ملغاة')+'</span> · تنتهي '+esc(dateTime46(a.expires_at))+' بتوقيت الرياض</p>'+(isActive(a)?'<div class="demo-trial-actions52">'+button('تعديل المدة','data-duration53="'+a.id+'"')+button('إعادة إصدار الرابط','data-reissue-trial52="'+esc(a.id)+'"')+button('إلغاء التجربة','data-revoke-trial52="'+esc(a.id)+'"')+'</div>':'')+'</article>';
 const active=response.trials.filter(isActive),ended=response.trials.filter(a=>!isActive(a));
 const legacyRows=legacy.accounts.map(a=>'<article class="halaqat-card"><strong>'+esc(a.name)+'</strong><p>'+esc(a.username)+' · '+(a.active&&!a.expired?'فعال':'معطّل أو منتهي')+' · ينتهي '+esc(dateTime46(a.expires_at))+' بتوقيت الرياض</p>'+(a.active?button('تعطيل الحساب القديم','data-revoke-demo42="'+esc(a.id)+'"'):'')+'</article>').join('');
 home.insertAdjacentHTML('beforeend','<details class="merged34 demo-admin52"><summary>روابط التجربة للمجمعات</summary><p>أنشئ تجربة للمجمع برابط دخول مباشر دون اسم مستخدم أو كلمة مرور. تشمل واجهات المشرف والمعلم والطالب وولي الأمر ببيانات وهمية للعرض فقط.</p><form id="demoAccount42" class="halaqat-form">'+input('name','اسم الجهة أو المجمع','','text',true,'minlength="2" maxlength="180"')+input('duration_value','مدة التجربة',1,'number',true,'min="1" step="1"')+select('duration_unit','وحدة المدة',[['hours','ساعة'],['days','يوم']],'days')+'<small>اختر المدة بالساعات أو الأيام. تنتهي التجربة تلقائيًا في الموعد المحدد.</small><button>إنشاء رابط تجربة</button></form><div id="demoCredentials42" class="credentials demo-link52" hidden></div><h3>التجارب الفعالة ('+active.length+')</h3><div class="demo-trial-list52">'+(active.map(trialRow).join('')||empty('لا توجد تجارب فعالة.'))+'</div><details class="demo-ended52"><summary>التجارب المنتهية والملغاة ('+ended.length+')</summary><div class="demo-trial-list52">'+(ended.map(trialRow).join('')||empty('لا توجد تجارب منتهية أو ملغاة.'))+'</div></details><details class="demo-legacy52"><summary>الحسابات التجريبية القديمة ('+legacy.accounts.length+')</summary><p>يمكن متابعة الحسابات القديمة أو تعطيلها. تُنشأ التجارب الجديدة برابط دخول مباشر.</p>'+(legacyRows||empty('لا توجد حسابات تجريبية قديمة.'))+'</details></details>');
}
function demoTrialURL52(value){
 const url=new URL(String(value||''),location.origin);
 if(url.origin!==location.origin||url.username||url.password||url.search||url.hash||!/^\/demo\/access\/[A-Za-z0-9_-]{60,100}$/.test(url.pathname))throw Error('تعذر عرض رابط التجربة؛ وصل رابط غير صالح من الخادم.');
 return url.href;
}
function showDemoTrialLink52(result){
 const url=demoTrialURL52(result.url),box=$('#demoCredentials42');
 if(!box)throw Error('تعذر عرض رابط التجربة؛ أعد فتح شاشة التجربة.');
 box.hidden=false;box.innerHTML='<strong>رابط تجربة '+esc(result.trial.name)+'</strong><p>يظهر الرابط الآن فقط؛ انسخه واحفظه لمشاركته مع المجمع. يفتح التجربة مباشرة دون كلمة مرور.</p><label class="field33"><span class="field-label33">رابط الدخول</span><input id="demoLink52" type="text" dir="ltr" readonly autocomplete="off" spellcheck="false" value="'+esc(url)+'"></label><p>تنتهي التجربة: '+esc(dateTime46(result.trial.expires_at))+' بتوقيت الرياض</p><div class="demo-trial-actions52">'+button('نسخ الرابط','data-copy-demo52')+'<a class="halaqat-btn" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">فتح التجربة</a>'+button('إخفاء الرابط','data-hide-demo52')+'</div>';
 reveal20(box);
 box.scrollIntoView({behavior:'smooth',block:'center'});
}
document.addEventListener('change',e=>{
 if(e.target.form?.id!=='demoAccount42'||e.target.name!=='duration_unit')return;
 const amount=e.target.form.elements.duration_value;amount.removeAttribute('max');
});
document.addEventListener('submit',e=>{
 if(e.target.id!=='demoAccount42')return;e.preventDefault();const values=Object.fromEntries(new FormData(e.target));values.name=values.name.trim();values.duration_value=Number(values.duration_value);
 run(async()=>{if(values.name.length<2||values.name.length>180)throw Error('اكتب اسم الجهة أو المجمع من حرفين إلى ١٨٠ حرفًا.');if(!['hours','days'].includes(values.duration_unit)||!Number.isInteger(values.duration_value)||values.duration_value<1)throw Error('أدخل عددًا صحيحًا موجبًا.');const r=await api('/api/demo42/trials',values);demoTrialURL52(r.url);await load();showDemoTrialLink52(r);status('تم إنشاء رابط التجربة');});
});
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-copy-demo52],[data-hide-demo52],[data-revoke-trial52],[data-reissue-trial52],[data-revoke-demo42]');if(!b)return;
 if(b.hasAttribute('data-hide-demo52')){const box=$('#demoCredentials42');if(box){box.hidden=true;box.replaceChildren();}return;}
 if(b.hasAttribute('data-copy-demo52')){run(async()=>{const field=$('#demoLink52');if(!field)throw Error('أُخفي الرابط؛ أعد إصداره عند الحاجة.');const url=demoTrialURL52(field.value);try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(url);else{field.focus();field.select();if(!document.execCommand('copy'))throw Error('copy');}}catch{throw Error('تعذر نسخ الرابط تلقائيًا. حدد الرابط الظاهر وانسخه يدويًا.');}status('تم نسخ رابط التجربة');});return;}
 if(b.hasAttribute('data-revoke-trial52')){if(!confirm('إلغاء التجربة يعطّل رابطها وينهي جميع جلساتها فورًا. هل تريد المتابعة؟'))return;run(async()=>{await api('/api/demo42/trials/'+encodeURIComponent(b.dataset.revokeTrial52)+'/revoke',{});await load();const detail=$('.demo-admin52');if(detail)detail.open=true;status('تم إلغاء التجربة وإنهاء جلساتها');});return;}
 if(b.hasAttribute('data-reissue-trial52')){if(!confirm('إعادة إصدار الرابط تُبطل الرابط السابق وتنهي جلساته، مع بقاء موعد انتهاء التجربة كما هو. هل تريد المتابعة؟'))return;run(async()=>{const r=await api('/api/demo42/trials/'+encodeURIComponent(b.dataset.reissueTrial52)+'/reissue',{});demoTrialURL52(r.url);await load();showDemoTrialLink52(r);status('تم إصدار رابط جديد بنفس موعد انتهاء التجربة');});return;}
 if(!confirm('تعطيل الحساب التجريبي القديم ينهي جميع جلساته فورًا. هل تريد المتابعة؟'))return;
 run(async()=>{await api('/api/demo42/accounts/'+encodeURIComponent(b.dataset.revokeDemo42)+'/revoke',{});await load();const detail=$('.demo-admin52');if(detail){detail.open=true;detail.querySelector('.demo-legacy52').open=true;}status('تم تعطيل الحساب التجريبي القديم وإنهاء جلساته');});
});

function icon43(route,label=''){
 const key=String(route||'')+' '+label,items=[[/^home\s/,'🏠'],[/personal-child/,'🧑‍🎓'],[/personal-info|بياناتي الشخصية/,'👤'],[/complex-info|معلومات المجمع/,'🕌'],[/complexes|إدارة المجمعات/,'🏘️'],[/announce|إعلان/,'📢'],[/archive|المؤرشف/,'🗄️'],[/import|استيراد/,'📥'],[/delete|purge|حذف/,'🗑️'],[/backup|نسخ/,'💾'],[/exam|اختبار/,'📝'],[/attendance|التحضير|الحضور/,'📋'],[/evaluation|التقييم/,'⭐'],[/account|الحسابات/,'🔐'],[/request|enrollment|طلبات/,'📨'],[/complaint|support|الدعم الفني/,'🛠️'],[/report|التقارير/,'📊'],[/communication|التواصل/,'💬'],[/point|reward|competition|المسابقات|التكريم/,'🏆'],[/learning|plan|الخطة/,'🎯'],[/ring|الحلقات/,'📖'],[/student|الطلاب/,'👥']];
 return '<span class="shortcut-emoji52" aria-hidden="true">'+(items.find(([test])=>test.test(key))?.[1]||'⚙️')+'</span>';
}
function merge43(sourceKey,targetKey,title,id){
 const source=screens32.get(sourceKey),target=screens32.get(targetKey);if(!source||!target||source===target)return;
 const section=document.createElement('details');section.className='merged43';section.id=id;section.innerHTML='<summary>'+esc(title)+'</summary>';
 const body=source.querySelector(':scope > .v25-panel-body')||source;
 for(const node of [...body.children])if(node.tagName!=='H2'&&node.tagName!=='SUMMARY')section.append(node);
 target.append(section);for(const [key,value] of screens32)if(value===source)screens32.set(key,target);source.remove();
}
// Shared release 50 views use the existing role-scoped data and actions.
function icon50(name){
 const paths={home:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',rings:'<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1zm0 0v15"/>',students:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',teacher:'<path d="m2 8 10-5 10 5-10 5zm4 3v6c4 3 8 3 12 0v-6m4-3v9"/>',attendance:'<path d="m4 12 5 5L20 6m-8 11 8-8"/>',reports:'<path d="M4 3v18h17M8 16v-5m5 5V6m5 10v-8"/>',owner:'<path d="m3 5 5 5 4-7 4 7 5-5-2 14H5zm3 17h12"/>',complexes:'<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M3 21V9h3m12 0h3v12M9 7h2m2 0h2m-6 4h2m2 0h2m-6 4h2m2 0h2m-5 6v-3h4v3"/>',communication:'<path d="M4 4h16v12H9l-5 4zM8 8h8m-8 4h5"/>',accounts:'<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M9 3h6v4H9zM8 12h8m-8 4h5"/>',personal:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',arrow:'<path d="M20 12H4m6-6-6 6 6 6"/>',search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>'};
 return '<svg class="icon50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.accounts)+'</svg>';
}
function initials50(name){return String(name||'').trim().split(/\s+/u).slice(0,2).map(x=>x[0]).join(' ');}
function ringCard50(r){
 const pct=Math.max(0,Math.min(100,Number(r.completion_rate)||0));
 return '<article class="ring-card" data-ring-card50="'+r.id+'" data-ring-search50="'+esc(r.name+' '+(r.teachers||[]).map(t=>t.name).join(' '))+'"><div class="ring-card-top50"><span class="icon-box">'+icon50('rings')+'</span><span class="status-badge '+(r.active?'active':'inactive')+'">'+(r.active?'نشطة':'متوقفة')+'</span></div><h3>'+esc(r.name)+'</h3><p class="ring-meta50">'+icon50('personal')+esc((r.teachers||[]).map(t=>t.name).join('، ')||'المعلم غير محدد')+'</p><div class="ring-meta50"><span>'+icon50('students')+Number(r.student_count||0)+' طالبًا</span><span>'+icon50('clock')+esc(r.schedule||'الموعد غير محدد')+'</span></div><div class="ring-progress50"><div><span>إنجاز التسميع خلال 30 يومًا</span><b>'+pct+'%</b></div><progress max="100" value="'+pct+'" aria-label="نسبة إنجاز '+esc(r.name)+'">'+pct+'%</progress></div><div class="ring-card-footer50"><small>الحضور '+Number(r.attendance_rate||0)+'%</small>'+button('عرض الحلقة '+icon50('arrow'),'data-open-ring="'+r.id+'"')+'</div></article>';
}
function statistics50(owner=false){
 const teachers=new Set(data.rings.flatMap(r=>(r.teachers||[]).map(t=>t.id))).size;
 const average=data.rings.length?Math.round(data.rings.reduce((sum,r)=>sum+Number(r.attendance_rate||0),0)/data.rings.length):null;
 const values=owner?[['المجمعات',orgOverview?.mosques?.length||0,'complexes','ضمن النظام'],['المشرفون',(data.supervisors||[]).length,'students','في المجمع المحدد'],['المعلمون',teachers,'teacher','المعلمون المسندون للحلقات'],['الطلاب',data.students.length,'rings','في المجمع المحدد']]:[['إجمالي الطلاب',data.students.length,'students',data.user.role==='halaqa_student'?'الملفات المرتبطة بحسابك':'ضمن نطاق حسابك'],['الحلقات القرآنية',data.rings.length,'rings','الحلقات المسندة والمتاحة'],['المعلمون',teachers,'teacher','المعلمون المسندون للحلقات'],['متوسط حضور الحلقات',average==null?'—':average+'%','attendance','متوسط نسب الحلقات خلال 30 يومًا']];
 return '<div class="stats-grid">'+values.map(([label,value,icon,note])=>'<article class="stat-card"><div class="stat-label50"><span>'+esc(label)+'</span><span class="icon-box">'+icon50(icon)+'</span></div><strong class="stat-value50">'+esc(value)+'</strong><p class="stat-note50">'+esc(note)+'</p></article>').join('')+'</div>';
}
function studentTable50(){
 const role=data.user.role,owner=role==='owner',sup=role==='halaqa_supervisor',family=role==='halaqa_student';
 const cols=['الطالب','الحلقة',...(owner?[]:sup?['التقييم العام','جوال الطالب','جوال ولي الأمر']:['الحفظ الحالي','التقييم']),...(owner?[]:['الملف'])];
 const rows=data.students.map(s=>{
  const ring=data.rings.find(r=>Number(r.id)===Number(s.halaqa_id)),score=sup?s.overall_rating:s.avg_score;
  const cells='<td><div class="student-cell50"><span class="avatar50">'+esc(initials50(s.name))+'</span><span class="student-name50"><strong>'+esc(s.name)+'</strong><small>ترتيبه في الحلقة: '+s.ring_number+'</small></span></div></td><td>'+esc(ring?.name||s.ring||'غير محددة')+'</td>'+(owner?'':sup?'<td>'+esc(score==null?'لم يسجل':score+' / 10')+'</td><td><bdi>'+esc(s.phone||'غير مسجل')+'</bdi></td><td><bdi>'+esc(s.guardian_phone||'غير مسجل')+'</bdi></td>':'<td>'+esc(s.current_memorization||'لم يسجل بعد')+'</td><td>'+(score==null?'لم يسجل':'<span class="status-badge '+(Number(score)>=6?'active':'warning')+'">'+esc(score)+' / 10</span>')+'</td>')+(owner?'':'<td>'+button(family?'عرض التقرير':'فتح الملف','data-file="'+s.id+'"')+'</td>');
  return '<tr data-student-ring="'+s.halaqa_id+'" data-student-name="'+esc(s.name+' '+(ring?.name||'')+' '+(!owner&&!sup?s.current_memorization||'':''))+'" data-high-absence="'+(Number(s.absences_30_days)>=3)+'" data-low-rating="'+Boolean(s.low_rating)+'" data-repeated-notes="'+Boolean(s.repeated_notes)+'">'+cells+'</tr>';
 }).join('');
 return '<div class="filter-bar"><label class="search-field"><span class="sr-only">بحث عن طالب</span>'+icon50('search')+'<input id="studentSearch" type="search" placeholder="'+(owner?'ابحث باسم الطالب أو الحلقة...':'ابحث باسم الطالب أو الحلقة...')+'"></label><label class="field-select"><span class="sr-only">تصفية بالحلقات</span><select id="studentRingFilter"><option value="">جميع الحلقات</option>'+data.rings.map(r=>'<option value="'+r.id+'" '+(String(r.id)===selectedStudentRing?'selected':'')+'>'+esc(r.name)+'</option>').join('')+'</select></label></div><div id="selectedRingWorkspace"></div>'+(!owner&&!sup&&!family?'<div class="student-filters">'+button('جميع الطلاب','data-student-filter="all"')+button('ملاحظات متكررة','data-student-filter="notes"')+button('تقييم منخفض','data-student-filter="low"')+button('كثيرو الغياب','data-student-filter="absence"')+'</div>':'')+'<p id="studentListHint" class="small-note"></p><div class="table-wrap"><table class="data-table"><thead><tr>'+cols.map(c=>'<th scope="col">'+c+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table>'+(rows?'':empty('لا توجد ملفات طلاب مرتبطة بهذا الحساب.'))+'</div>';
}
function ringInsights50(){
 const rings=data.rings.slice(0,6),has=rings.length>0;
 const chart=has?'<svg class="weekly-chart50" viewBox="0 0 520 235" role="img" aria-label="مقارنة نسب التسميع والحضور للحلقات خلال آخر ثلاثين يومًا"><title>نسب إنجاز التسميع والحضور لكل حلقة خلال 30 يومًا</title>'+[0,25,50,75,100].map(p=>'<line x1="28" x2="475" y1="'+(188-p*1.5)+'" y2="'+(188-p*1.5)+'" stroke="#dce3eb"/><text x="486" y="'+(192-p*1.5)+'" fill="#64748b" font-size="11">'+p+'</text>').join('')+rings.map((r,i)=>{const x=48+i*(420/rings.length),a=Math.max(0,Math.min(100,Number(r.completion_rate)||0)),b=Math.max(0,Math.min(100,Number(r.attendance_rate)||0));return '<g><title>'+esc(r.name)+': التسميع '+a+'%، الحضور '+b+'%</title><rect x="'+x+'" y="'+(188-a*1.5)+'" width="16" height="'+(a*1.5)+'" rx="3" fill="#1b365b"/><rect x="'+(x+20)+'" y="'+(188-b*1.5)+'" width="16" height="'+(b*1.5)+'" rx="3" fill="#d1a64e"/><text x="'+(x+18)+'" y="212" text-anchor="middle" fill="#64748b" font-size="11">حلقة '+(i+1)+'</text></g>';}).join('')+'</svg><div class="chart-ring-key50">'+rings.map((r,i)=>'<span>'+(i+1)+' · '+esc(r.name)+'</span>').join('')+'</div>':empty('تظهر المقارنة عند وجود حلقات وبيانات متابعة.');
 const events=(data.progress||[]).slice(0,4).map(p=>({title:(data.students.find(s=>s.id===p.student_id)?.name||'الطالب')+' · '+(attendance[p.attendance]||'متابعة الطالب'),detail:[p.memorized?'الحفظ: '+p.memorized:'',p.revision?'المراجعة: '+p.revision:''].filter(Boolean).join(' · ')||'تم تسجيل الحضور',day:p.day,route:'student/'+p.student_id}));
 const pending=!events.length?(daily35?.tasks||[]).slice(0,4).map(t=>({title:t.title,detail:t.detail,day:'مطلوب',route:t.route})):events;
 return '<div class="insights-grid50"><section class="insight-card50"><h3>إنجاز الحلقات والحضور</h3><p class="small-note">نسب السجلات المعتمدة خلال آخر 30 يومًا</p><div class="chart-legend50"><span class="navy-key50">إنجاز التسميع</span><span class="gold-key50">الحضور</span></div>'+chart+'</section><section class="insight-card50"><h3>'+(events.length?'آخر المتابعات':'المتابعات المطلوبة')+'</h3><p class="small-note">'+(events.length?'من سجلات الطلاب المتاحة لحسابك':'مهام حسابك في المجمع المحدد')+'</p><div class="activity-list50">'+(pending.map(t=>'<article class="activity-item50"><span class="icon-box">'+icon50(events.length?'attendance':'accounts')+'</span><div><strong>'+esc(t.title)+'</strong><p>'+esc(t.detail)+'</p><small>'+esc(t.day)+'</small>'+button('عرض التفاصيل','data-screen32="'+esc(t.route)+'"')+'</div></article>').join('')||empty('لا توجد متابعات جديدة مطلوبة حاليًا.'))+'</div></section></div>';
}
function syncNavigation50(){
 if(!data)return;const route=route32||'home',studentRoute=route.startsWith('student/'),screen=screens32.get(route),family=data.user.role==='halaqa_student';
 const titles={home:'الأقسام الرئيسية',rings:'الحلقات القرآنية',students:family?'ملفات الطلاب':'الطلاب',attendance:'الحضور والغياب',reports:'التقارير والإحصاءات',accounts:'الحسابات وطلبات الإصدار',requests:'الطلبات والدعم الفني',communication:'الدعم الفني والتواصل','personal-info':'بياناتي الشخصية',more:'أدوات المجمع',complexes:'إدارة المجمعات','complex-info':'معلومات المجمع',demos:'الحسابات التجريبية'};
 const title=studentRoute?(file?.student?.name?'ملف '+file.student.name:'ملف الطالب'):(titles[route]||screen?.querySelector('h2')?.textContent||'مساحة العمل');
 const parent=parents63.get(studentRoute?screens32.get('students'):screen);
 let crumb=$('#groupCrumb63');
 if(!crumb){crumb=document.createElement('a');crumb.id='groupCrumb63';$('#pageCrumb50').before(crumb);}
 crumb.hidden=!parent;
 if(parent){crumb.href='#'+parent;crumb.textContent=screens32.get(parent)?.querySelector('h2')?.textContent||'القسم';}
 const descriptions={home:data.user.role==='halaqa_teacher'?'ابدأ بالتحضير، ثم قيّم من حضر أو استأذن.':data.user.role==='halaqa_supervisor'?'تابع الحلقات والطلاب الذين يحتاجون مراجعتك.':'أهلًا بك، '+data.user.name+'، إليك ما تزهر به حلقاتنا اليوم.',rings:'حلقات تجمعنا على كتاب الله، ومعلمون يصنعون الأثر',students:data.user.role==='owner'?'أسماء الطلاب وحلقاتهم في مكان واحد':data.user.role==='halaqa_supervisor'?'ملخص التقييم وأرقام التواصل ضمن مجمعك':'رحلة كل طالب مع القرآن، في مكان واحد',attendance:'متابعة الحضور اليومي للحلقات القرآنية',reports:'نقرأ أثر الجهود، ونحتفي بثمارها',accounts:'طلبات إصدار الحسابات ومتابعتها حسب صلاحياتك',communication:'الإعلانات والتواصل مع إدارة النظام',more:'كل مزايا البرنامج، مرتبة حسب صلاحيات حسابك'};
 for(const [id,value] of [['pageCrumb50',title],['pageTitle50',title],['pageSubtitle50',route==='home'?'اختر القسم ثم الخدمة المطلوبة.':descriptions[route]||'متابعة '+esc(data.mosque?.name||'المجمع')],['accountName50',data.user.name],['accountRole50',family?(data.user.account_type==='guardian'?'ولي الأمر':'الطالب'):roles[data.user.role]],['accountInitials50',initials50(data.user.name)]]){const node=$('#'+id);if(node)node.textContent=value;}
 document.querySelectorAll('#appNavigation [data-screen32]').forEach(b=>{const active=studentRoute?b.dataset.screen32==='students':b.dataset.screen32===route||(!titles[route]&&b.dataset.screen32==='more');b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
}
function mount50(){
 $('#nav43')?.remove();const role=data.user.role,owner=role==='owner',family=role==='halaqa_student',teacher=role==='halaqa_teacher',grid=$('#halaqatWorkspace .halaqat-grid');
 const ringScreen=screens32.get('rings'),studentScreen=screens32.get('students');
 if(studentScreen){const exports=[...studentScreen.querySelectorAll('.student-export-actions')];studentScreen.innerHTML='<h2 class="ref-title32">الطلاب</h2>'+studentTable50();exports.forEach(node=>studentScreen.append(node));}
 if(family&&!studentScreen){const screen=addScreen32('students','ملفات الطلاب',studentTable50(),grid);screen.classList.add('screen50');}
 if(ringScreen&&family){ringScreen.innerHTML='<h2 class="ref-title32">الحلقات القرآنية</h2>'+rings();}
 if(ringScreen&&!family){ringScreen.insertAdjacentHTML('afterbegin',statistics50()+'<div class="filter-bar"><label class="search-field">'+icon50('search')+'<span class="sr-only">ابحث باسم الحلقة أو المعلم</span><input id="ringSearch50" type="search" placeholder="ابحث باسم الحلقة أو المعلم..."></label><label class="field-select"><span class="sr-only">حالة الحلقة</span><select id="ringState50"><option value="all">جميع الحلقات</option><option value="active">الحلقات النشطة</option></select></label></div>');}
 const home=screens32.get('home');if(home){
  home.querySelector(':scope > h2')?.remove();const shortcuts=home.querySelector(':scope > .ref-pair32');if(shortcuts)shortcuts.remove();
  const staffHome=teacher||role==='halaqa_supervisor';
  const hero='<section class="hero50"><div class="hero-copy50"><p>على نور القرآن نلتقي</p><h2>حلقات مشكاة ونور</h2><p>نغرس حب القرآن، ونتابع رحلة الحفظ خطوة بخطوة.</p>'+button('متابعة الحلقات '+icon50('arrow'),'data-screen32="rings"')+'</div></section>';
  const featured='<section class="featured-rings50"><div class="section-heading50"><div><h2>الحلقات القرآنية</h2><p>مساحات للحفظ، ومنازل للأثر</p></div>'+button('جميع الحلقات '+icon50('arrow'),'data-screen32="rings"')+'</div>'+(data.rings.length?'<div class="rings-grid">'+data.rings.slice(0,3).map(ringCard50).join('')+'</div>':empty('لا توجد حلقات متاحة حاليًا.'))+'</section>';
  const lower=document.createElement('details');lower.className='home-secondary50';lower.innerHTML='<summary>المهام والنقاط وأدوات المتابعة</summary>';while(home.firstChild)lower.append(home.firstChild);home.append(lower);if(staffHome){
   lower.querySelector('summary').textContent='البحث والمهام الأخرى';
   const choices=teacher?[
    ['attendance','attendance','التحضير والتقييم','سجّل الحضور ثم قيّم من سمّع'],
    ['students','students','ملفات الطلاب','الحفظ والمراجعة والنقاط'],
    ['rings','rings','حلقاتي','الطلاب والمعلمون في كل حلقة']
   ]:[
    ['accounts','accounts','الطلبات','تابع الطلبات المرفوعة للمالك'],
    ['students','students','ملفات الطلاب','راجع التقييم والحفظ والنقاط'],
    ['reports','reports','تقارير المجمع','قارن الحضور والإنجاز']
   ];
   home.insertAdjacentHTML('afterbegin','<nav class="staff-tiles61" aria-label="اختصارات '+(teacher?'المعلم':'المشرف')+'">'+choices.filter(([route])=>screens32.has(route)).map(([route,icon,title,detail])=>'<button type="button" class="staff-tile61" data-screen32="'+route+'">'+icon50(icon)+'<strong>'+title+'</strong><small>'+detail+'</small></button>').join('')+'</nav>');
  }else{home.insertAdjacentHTML('afterbegin',hero+statistics50(owner)+featured+ringInsights50());}
 }
 const report=screens32.get('reports');if(report){report.querySelector(':scope > .ref-ratings32')?.remove();report.insertAdjacentHTML('afterbegin',statistics50()+ringInsights50()+'<section class="insight-card50"><h3>إنجاز الحلقات خلال 30 يومًا</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>الحلقة</th><th>المعلم</th><th>الطلاب</th><th>إنجاز التسميع</th><th>الحضور</th></tr></thead><tbody>'+data.rings.map(r=>'<tr><td>'+esc(r.name)+'</td><td>'+esc((r.teachers||[]).map(t=>t.name).join('، ')||'غير محدد')+'</td><td>'+Number(r.student_count||0)+'</td><td>'+Number(r.completion_rate||0)+'%</td><td>'+Number(r.attendance_rate||0)+'%</td></tr>').join('')+'</tbody></table></div></section>');}
 const attendanceScreen=screens32.get('attendance');if(teacher&&attendanceScreen){const form=$('#batchForm');if(form){form.classList.add('attendance-form50');const ringLabel=form.querySelector('[name=ring]')?.closest('label'),dateLabel=form.querySelector('[name=day]')?.closest('label');const bar=document.createElement('div');bar.className='filter-bar';if(ringLabel)bar.append(ringLabel);if(dateLabel)bar.append(dateLabel);form.prepend(bar);form.insertAdjacentHTML('afterbegin','<div id="attendanceSummary50" class="stats-grid attendance-summary50"></div>');batchRows();}}
 for(const screen of new Set(screens32.values()))screen.classList.add('screen50');
 const primary=[...(teacher?[['attendance','تحضير اليوم وتقييم الطلاب','attendance']]:[]),['home','نظرة عامة','home'],['rings','الحلقات القرآنية','rings',data.rings.length],['students',family?'ملفات الطلاب':'الطلاب','students',data.students.length],['reports','التقارير والإحصاءات','reports']];
 const tools=[...(owner?[['accounts','الحسابات وطلبات الإصدار','owner'],['complexes','إدارة المجمعات','complexes']]:role==='halaqa_supervisor'?[['accounts','الطلبات والحسابات','accounts']]:[['requests','الطلبات والدعم الفني','accounts']]),['communication','الدعم الفني والتواصل','communication'],['more','أدوات المجمع','star'],['personal-info','بياناتي الشخصية','personal']];
 const nav=$('#appNavigation');if(nav){const link=([key,label,icon,count])=>'<button type="button" class="nav-link" data-screen32="'+key+'">'+icon50(icon)+'<span>'+label+'</span>'+(count!=null?'<span class="nav-count50">'+count+'</span>':'')+'</button>';const staffNav=teacher||role==='halaqa_supervisor';
 if(staffNav){
  const top=teacher?[['attendance','التحضير والتقييم','attendance'],['students','ملفات الطلاب','students'],['home','يوم الحلقة','home']]:[['home','متابعة اليوم','home'],['students','ملفات الطلاب','students'],['accounts','الطلبات','accounts']];
  const first=new Set(top.map(x=>x[0]));
  const rest=[...primary,...tools].filter(([key])=>!first.has(key)&&screens32.has(key));
  nav.innerHTML=top.filter(([key])=>screens32.has(key)).map(link).join('')+'<details class="staff-more60"><summary>بقية الخدمات</summary>'+rest.map(link).join('')+'</details>';
 }else nav.innerHTML='<p class="nav-section50">مساحة العمل</p>'+primary.filter(([key])=>screens32.has(key)).map(link).join('')+'<p class="nav-section50">'+(owner?'إدارة النظام':'الحساب والخدمات')+'</p>'+tools.filter(([key])=>screens32.has(key)).map(link).join('');}
 const organization=$('#organizationActions31'),complex=screens32.get('complexes');if(organization&&complex)complex.prepend(organization);
 const ownersBox=$('#ownersAdmin50'),accountsScreen=screens32.get('accounts');if(ownersBox&&accountsScreen)accountsScreen.append(ownersBox);
 const stats=$('#halaqatStats');if(stats)stats.hidden=true;syncNavigation50();
}
function filterRings50(){const screen=screens32.get('rings');if(!screen)return;const q=($('#ringSearch50')?.value||'').trim(),active=$('#ringState50')?.value==='active';screen.querySelectorAll('[data-ring-card50]').forEach(card=>{const ring=data.rings.find(r=>String(r.id)===card.dataset.ringCard50);card.hidden=!card.dataset.ringSearch50.includes(q)||(active&&!ring?.active);});}
document.addEventListener('input',e=>{if(e.target.id==='ringSearch50')filterRings50();});
document.addEventListener('change',e=>{if(e.target.id==='ringState50')filterRings50();if(e.target.form?.id==='batchForm'&&e.target.name?.startsWith('attendance_'))updateAttendance50();});
let parents63=new Map();
// v63: Card-first navigation is a presentation layer. Existing route objects,
// forms, permissions and API calls are deliberately kept intact.
function mountDirectory63(){
 const home=screens32.get('home'),grid=$('#halaqatWorkspace .halaqat-grid');
 if(!home||!grid)return;
 const role=data.user.role,owner=role==='owner',manager=owner||role==='halaqa_supervisor';
 const top=document.querySelector('.topbar');
 let context=$('#context63');
 if(!context){
  context=document.createElement('div');context.id='context63';top.after(context);
  const switcher=$('.complex-switch50');if(switcher)context.append(switcher);
  const version=$('.sidebar-bottom50 small');if(version)context.append(version);
 }
 document.body.classList.add('directory63');
 $('#appNavigation')?.replaceChildren();
 // The original live dashboard is preserved in a distinct route instead of being discarded.
 const daily=addScreen32('daily63','ملخص اليوم والمهام','',grid);
 while(home.firstChild)daily.append(home.firstChild);
 function separate(id,key,title){
  const item=document.getElementById(id);
  if(!item||!daily.contains(item))return;
  const section=addScreen32(key,title,'',grid);section.append(item);
  if(item.tagName==='DETAILS'&&key!=='weekly63')item.open=true;
 }
 separate('tonight56','tonight63','حلقات الليلة');
 separate('archiveCenter56','archive63','الأرشفة والاستعادة');
 separate('points38','points63','النقاط الشهرية');
 separate('weeklyStandings60','weekly63','المنافسة الأسبوعية');
 const staff=$('#staffExtras50');if(staff){const modes=addScreen32('mode63','تبديل صفة الحساب','',grid);modes.append(staff);}
 if(manager){
  const screen=addScreen32('period64','تقرير الفترة للمجمع والحلقة','',grid);
  screen.insertAdjacentHTML('beforeend',form34('reportForm64',input('start','من تاريخ',weekStart56(),'date')+input('end','إلى تاريخ',today(),'date')+select('ring','النطاق',[['','المجمع كاملًا'],...data.rings.map(r=>[r.id,r.name])],'',false)+'<button>عرض التقرير</button>')+'<div class="period-output64"></div>');
  screen.querySelector('form').onsubmit=e=>{
   e.preventDefault();const f=e.target;
   run(async()=>{const query=new URLSearchParams({start:f.elements.start.value,end:f.elements.end.value});if(f.elements.ring.value)query.set('ring_id',f.elements.ring.value);
    const out=screen.querySelector('.period-output64');out.replaceChildren();
    const res=await api('/api/v64/mosques/'+mid+'/period-report?'+query);
    const html=Mishkat64.report(res,data.mosque.name);
    out.innerHTML='<button type="button">طباعة أو حفظ PDF</button>'+html;out.querySelector('button').onclick=()=>Mishkat64.printReport(html);
   });
  };
 }
 const sections=[
  {id:'classes63',name:'الحلقات والطلاب',icon:'rings',description:'الحلقات وملفات الطلاب والتحضير اليومي',items:[
   ['rings','الحلقات'],['students','ملفات الطلاب'],['attendance','التحضير والتقييم'],
   ['tonight63','حلقات الليلة'],['enrollment-review','طلبات إضافة الطلاب'],['archive63','الأرشفة والاستعادة']]},
  {id:'learning63',name:'التعليم والأنشطة',icon:'students',description:'الحفظ والاختبارات والمسابقات والبرامج',items:[]},
  {id:'tracking63',name:'التقارير والإنجاز',icon:'reports',description:'المتابعة والإحصاءات والنقاط والتقدم',items:[
   ['period64','تقرير الفترة للمجمع والحلقة'],['daily63','ملخص اليوم والمهام'],['reports','التقارير والإحصاءات'],
   ['points63','النقاط الشهرية'],['weekly63','المنافسة الأسبوعية']]},
  {id:'services63',name:'التواصل والطلبات',icon:'communication',description:'الطلبات والمراسلات وخدمة المستفيدين',items:[
   ['accounts',manager?'الحسابات وطلبات الإصدار':'الحسابات'],['requests','متابعة الطلبات'],
   ['complaints','الدعم الفني والشكاوى'],['communication','التواصل والإعلانات']]},
  {id:'manage63',name:'إدارة المجمع والنظام',icon:'complexes',description:'إدارة المجمعات والخدمات والصلاحيات',items:[
   ...(owner?[['complexes','إدارة المجمعات'],['complex-info','معلومات المجمع'],['demos','الحسابات التجريبية']]:manager?[['complex-info','معلومات المجمع']]:[]),
   ['mode63','تبديل صفة الحساب']]},
  {id:'profile63',name:'حسابي وإعداداتي',icon:'personal',description:'البيانات الشخصية والإعدادات',items:[
   ['personal-info','بياناتي الشخصية']]}
 ];
 const assigned=new Set([home]);parents63=new Map();
 const labels63=(node,fallback)=>{
  const direct=node.querySelector(':scope > h2, :scope > .v25-panel-title');
  return (direct?.textContent||node.querySelector('h2')?.textContent||node.querySelector('summary')?.textContent||fallback).trim();
 };
 function include(group,key,label){
  const node=screens32.get(key);
  if(!node||assigned.has(node)||!node.isConnected)return false;
  assigned.add(node);parents63.set(node,group.id);
  group.available.push({key,label:label||labels63(node,'خدمة إضافية')});return true;
 }
 sections.forEach(section=>{section.available=[];section.items.forEach(([key,label])=>include(section,key,label));});
 // Each standalone feature is assigned exactly once. Even unknown future tools remain discoverable.
 for(const [key,node] of screens32){
  if(assigned.has(node)||!node.isConnected||key==='more'||key==='home'||key.startsWith('personal-child/'))continue;
  if(!manager&&['complex-info','complexes','demos','enrollment-review'].includes(key))continue;
  const label=labels63(node,key),value=key+' '+label;
  const target=/إعلان|مراسل|تواصل|شكاوى|رسائل|إجاز|اعتذار|دعم|الطلب/.test(value)?sections[3]:
   /إعداد|مستخدم|حساب|استيراد|حذف|النسخ|الأرشفة|ربط|إدارة|صلاحيات|اشتراك|مجمع|نقل الطالب/.test(value)?sections[4]:
   /تقرير|إحصاء|نقاط|نتائج|المتابعة|متابعة|رصيد|التقييم الشهري/.test(value)?sections[2]:
   /اختبار|تسميع|ختم|حفظ|مراجعة|مسابق|تكريم|تعلم|خطط|ورد|درجات|الشهادات/.test(value)?sections[1]:sections[0];
  include(target,key,label);
 }
 // The legacy 'all tools' route stays available for old bookmarks, not as a duplicate menu.
 if(screens32.has('more'))parents63.set(screens32.get('more'),'manage63');
 const drawTile=(key,label,icon,detail='')=>'<a class="tile63 tile63" href="#'+esc(key)+'" data-tile63="'+esc(key)+'">'
  +'<span class="tile-icon63">'+icon50(icon)+'</span><strong>'+esc(label)+'</strong>'
  +(detail?'<small>'+esc(detail)+'</small>':'')+'<span class="tile-arrow63" aria-hidden="true">←</span></a>';
 const links=[];
 for(const group of sections){
  if(!group.available.length)continue;
  const html='<p class="directory-description63">'+esc(group.description)+'</p>'
   +'<nav class="tiles63 subtiles63" aria-label="خدمات '+esc(group.name)+'">'
   +group.available.map(x=>drawTile(x.key,x.label,group.icon)).join('')+'</nav>';
  addScreen32(group.id,group.name,html,grid);
  links.push(drawTile(group.id,group.name,group.icon,group.available.length+' خدمات'));
 }
 // Any formerly accessible screen must remain in the route table and have an entry tile.
 const greeting=data.user.account_type==='guardian'?'ولي الأمر':roles[role]||'مساحة العمل';
 home.innerHTML='<section class="welcome63" aria-label="مرحبًا بك في مشكاة ونور">'
  +'<div class="welcome-copy63"><span class="welcome-eyebrow63">مشكاة ونور · '+esc(greeting)+'</span>'
  +'<h2>كل ما تحتاجه، في مكان واحد</h2><p>اختر القسم، ثم اضغط على الخدمة المطلوبة. جميع أدواتك محفوظة ومرتبة حسب صلاحيات حسابك.</p></div>'
  +'<img class="welcome-logo63" src="/static/brand-logo.png" alt="شعار مشكاة ونور" width="120" height="120"></section>'
  +'<h2 class="directory-heading63">الأقسام الرئيسية</h2><nav class="tiles63 tiles-home63" aria-label="الأقسام الرئيسية">'+links.join('')+'</nav>';
 const stats=$('#halaqatStats');if(stats)stats.hidden=true;
 const route=location.hash.slice(1);
 navigate32(screens32.has(route)?route:'home',false);
}

function mount43(){
 merge43('complex-info','reports','معلومات المجمع والاشتراك','complex43');
 mount50();
 if(data.user.role==='owner'&&screens32.get('complexes')){
   screens32.get('complexes').insertAdjacentHTML('afterbegin','<section class="day-card53"><h3>جدول حلقات '+esc(data.mosque.name)+'</h3><p>من الأحد إلى الأربعاء، من بعد صلاة المغرب إلى صلاة العشاء.</p>'+button('تطبيق الجدول على حلقات هذا الجامع','data-evening53')+'</section>');
 }
 navigate32(location.hash.slice(1)||(data.user.role==='halaqa_teacher'?'attendance':'home'),false);
}
function updateNav43(){syncNavigation50();}

const weekAPI56=()=>'/api/v56/mosques/'+mid;
const escNum56=n=>Number(n).toLocaleString('ar-SA',{maximumFractionDigits:2});
const unit56=u=>u==='ayah'?'آية':'وجه';
function weekStart56(){
 const d=new Date(today()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-d.getUTCDay());return d.toISOString().slice(0,10);
}
async function progress56(id,start,end){
 const host=$('#insight56');if(!host)return;
 const d=await api(weekAPI56()+'/students/'+id+'/insights?start='+start+'&end='+end);
 if(!host.isConnected)return;
 const w=d.weeks.at(-1),goal=d.goal;
 const flags=d.flags.map(f=>'<p class="warn56">انخفاض في الحفظ · '+escNum56(f.current)+' '+unit56(f.unit)+' في اللقاء هذا الأسبوع، مقابل '+escNum56(f.baseline)+' في '+f.previous_count+' لقاءات سابقة.</p>').join('');
 host.innerHTML='<h3>نقاط الطالب خلال الفترة</h3><form class="range56" data-range56><label>من <input type="date" name="start" value="'+esc(start)+'" required></label><label>إلى <input type="date" name="end" value="'+esc(end)+'" required></label><button>عرض المجموع</button>'+button('هذه السنة','data-year56')+'</form><p><strong>'+escNum56(d.points.recorded_total)+' نقطة مسجلة</strong> · المحتسب للمنافسة '+escNum56(d.points.total)+' من '+escNum56(d.points.maximum)+' ممكنة · '+d.points.coverage.due_sessions+' لقاءات مستحقة.</p><h3>هدف الحفظ للأسبوع الذي يبدأ '+esc(d.week)+'</h3><p>'+(goal?'حفظ '+escNum56(w.units[goal.unit].saved)+' من '+escNum56(goal.amount)+' '+unit56(goal.unit):'لم يحدد المعلم هدفًا لهذا الأسبوع.')+'</p><p>الحفظ الجديد: '+amounts56(w,'saved')+' · المراجعة: '+amounts56(w,'review')+'</p>'+
 (data.user.role==='halaqa_teacher'&&d.week===weekStart56()?'<form class="range56" data-goal56><label>هدف الأسبوع <input name="amount" type="number" min="0.01" max="10000" step="any" required value="'+(goal?.amount||'')+'"></label><select name="unit" aria-label="وحدة الحفظ"><option value="page">وجه</option><option value="ayah" '+(goal?.unit==='ayah'?'selected':'')+'>آية</option></select><button>حفظ الهدف</button></form>':'')+
 flags+'<details><summary>مقارنة آخر خمسة أسابيع</summary><div class="table-wrap"><table class="data-table"><thead><tr><th>بداية الأسبوع</th><th>الحفظ الجديد</th><th>المراجعة</th><th>عدد التقييمات</th><th>الحفظ /١٠</th><th>التجويد /١٠</th><th>الالتزام /١٠</th></tr></thead><tbody>'+d.weeks.map(x=>'<tr>'+[x.week,amounts56(x,'saved'),amounts56(x,'review'),x.graded,...Object.values(x.scores).map(v=>v??'—')].map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details>';
 host.querySelector('[data-range56]').onsubmit=e=>{e.preventDefault();const f=e.target.elements;run(()=>progress56(id,f.start.value,f.end.value));};
 host.querySelector('[data-year56]').onclick=()=>run(()=>progress56(id,today().slice(0,4)+'-01-01',today()));
 const form=host.querySelector('[data-goal56]');if(form)form.onsubmit=e=>{e.preventDefault();run(async()=>{await api(weekAPI56()+'/students/'+id+'/goal?week='+d.week,{amount:Number(form.elements.amount.value),unit:form.elements.unit.value},'PUT');await progress56(id,start,end);});};
}
function amounts56(w,k){return ['page','ayah'].filter(u=>w.units[u][k]).map(u=>escNum56(w.units[u][k])+' '+unit56(u)).join(' + ')||'٠';}
async function attachInsight56(id){
 $('#insight56')?.remove();
 const host=document.createElement('section');host.id='insight56';host.className='day-card53';
 $('#studentFile').append(host);await progress56(id,weekStart56(),today());
 const journey=await api('/api/v64/mosques/'+mid+'/students/'+id+'/journey');
 if(host.isConnected){
  const panel=document.createElement('section');panel.className='day-card53';
  panel.innerHTML='<h3>إنجاز الأجزاء وورد اللقاء القادم</h3>'+ (journey.milestones.map(m=>'<p>أتمّ '+escNum56(m.count)+' أجزاء · '+esc(m.day)+'</p>').join('')||'<p>لم يكتمل إنجاز جزأين مسجلين بعد.</p>')+'<p>الحفظ القادم: '+esc(journey.next.next_saved||'لم يُحدد')+' · المراجعة القادمة: '+esc(journey.next.next_review||'لم تُحدد')+'</p>';host.after(panel);
 }
}
async function contest56(week){
 const el=$('#competition56');if(!el)return;
 const d=await api(weekAPI56()+'/competition?week='+week);if(!el.isConnected)return;
 const leaders=d.rings.filter(r=>r.score!=null&&r.score===d.rings[0]?.score);
 const best=d.students.filter(s=>s.points>0&&s.points===d.students[0]?.points);
 el.innerHTML='<h3>المنافسة الأسبوعية · '+(d.final?'نتيجة معتمدة':'ترتيب مؤقت')+'</h3><label>اختر تاريخًا في الأسبوع <input type="date" value="'+d.week+'" max="'+today()+'"></label><p>'+d.week+' — '+d.end+'</p><p>أعلى الطلاب بمجموع النقاط: <strong>'+ (best.map(s=>esc(s.name)).join('، ')||'لا توجد نقاط بعد')+'</strong></p><p>صدارة الحلقات: <strong>'+(leaders.map(r=>esc(r.name)).join('، ')||'بانتظار بيانات كافية')+'</strong></p><small>الحضور ٣٠٪، تحقيق أهداف الحفظ ٤٠٪، والإنجاز ٣٠٪ بحسب تقييم الالتزام بالخطة. يُحتسب هدف كل طالب بحد أقصى ١٠٠٪، وتُستثنى حالات الغياب بعذر من اللقاءات المستحقة.</small><div class="table-wrap"><table class="data-table"><thead><tr><th>الحلقة</th><th>الحضور</th><th>الحفظ</th><th>الإنجاز</th><th>النتيجة</th><th>قُيّم من الحاضرين</th><th>مجموع النقاط</th></tr></thead><tbody>'+d.rings.map(r=>'<tr>'+[r.name,r.attendance+'٪',r.missing?'ينقص '+r.missing+' هدف':r.memory+'٪',r.achievement+'٪',r.score==null?'—':r.score+'٪',r.graded+' / '+r.present,r.points].map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><details><summary>مقارنة نقاط الطلاب</summary>'+d.students.map(s=>'<p>'+esc(s.name)+' · '+escNum56(s.points)+' من '+escNum56(s.maximum)+'</p>').join('')+'</details>';
 el.querySelector('input').onchange=e=>{if(e.target.value)run(()=>contest56(e.target.value));};
}
async function evening56(){
 const el=$('#tonight56');if(!el)return;
 const d=await api(weekAPI56()+'/tonight');if(!el.isConnected)return;
 const names=(title,list)=>list.length?'<details><summary>'+title+' ('+list.length+')</summary>'+list.map(esc).join('، ')+'</details>':'';
 el.innerHTML='<h3>حلقات الليلة</h3>'+button('تحديث الحالة','data-refresh56')+(d.digest?'<p class="warn56">'+esc(d.digest)+'</p>':'')+
 (d.rings.map(r=>'<article><strong>'+esc(r.name)+'</strong> · '+esc(r.teachers.join('، ')||'دون معلم مسند')+' · '+(r.closed?'مغلقة':'مفتوحة')+' · '+r.total+' طلاب'+names('باقي التحضير',r.unmarked)+names('باقي التقييم',r.pending)+'</article>').join('')||'<p>لا توجد حلقات مجدولة اليوم.</p>')+
 '<h4>طلاب انخفض مقدار حفظهم المعتاد</h4>'+(d.warnings.map(s=>button(esc(s.name),'data-file="'+s.id+'"')).join(' ')||'لا توجد إشارة انخفاض مؤكدة بالبيانات المتاحة.')+
 '<details><summary>إعداد وقت التنبيه</summary><form class="range56"><label>وقت ملخص ما بعد العشاء بتوقيت الرياض <input type="time" name="clock" value="'+esc(d.clock)+'" required></label><button>حفظ الوقت</button></form></details>';
 el.querySelector('[data-refresh56]').onclick=()=>run(evening56);
 el.querySelector('form').onsubmit=e=>{e.preventDefault();const clock=e.target.elements.clock.value;run(async()=>{await api(weekAPI56()+'/alert-time',{clock},'PUT');status('حُفظ موعد التنبيه اليومي');});};
}

async function mountStaff50(){
 const archiveHome=screens32.get('home'), ownerArchive=data.user.role==='owner';
 if(archiveHome&&(ownerArchive||data.user.role==='halaqa_supervisor')){
  archiveHome.querySelector('#archiveCenter56')?.remove();
  const choices=development.archive_choices||[];
  archiveHome.insertAdjacentHTML('afterbegin','<details id="archiveCenter56" class="day-card53"><summary>أرشفة الطلاب والحلقات</summary><p>'+ (ownerArchive?'يمكنك الأرشفة أو الاستعادة مباشرة.':'يرسل الطلب للمالك، وتبقى الحالة فعّالة حتى موافقته.')+'</p>'+form34('archiveAction56',select('entity','الطالب أو الحلقة',choices.map(x=>[x.kind+'/'+x.id+'/'+Number(x.active),(x.kind==='rings'?'حلقة · ':'طالب · ')+x.name+(x.active?'':' (مؤرشف)')]))+input('reason','سبب الإجراء','','text',true,'minlength="2" maxlength="500"')+'<button>'+(ownerArchive?'تنفيذ الأرشفة أو استعادة المؤرشف':'رفع طلب أرشفة')+'</button>')+'</details>');
  archiveHome.querySelector('#archiveAction56').onsubmit=e=>{e.preventDefault();const f=e.target,[kind,id,active]=f.elements.entity.value.split('/');if(!id)return;run(async()=>{const r=await api(base()+'/'+kind+'/'+id+'/archive',{active:active==='0',reason:f.elements.reason.value.trim()},'PUT');await load();status(r.pending_approval?'تم رفع الطلب للمالك':'تم تحديث حالة الملف');});};
 }
 if(data.user.role==='halaqa_teacher')document.querySelectorAll('[data-student-archive]').forEach(b=>b.remove());

 if(data.user.role==='halaqa_supervisor'&&data.user.original_role!=='owner'&&!document.querySelector('meta[name="demo-base42"]')){
   const home=screens32.get('home');
   home?.insertAdjacentHTML('afterbegin','<section id="tonight56" class="day-card53"></section><details class="day-card53" id="weeklyStandings60"><summary>المنافسة الأسبوعية</summary><section id="competition56"></section></details>');
   const standings=home?.querySelector('#weeklyStandings60');
   if(standings)standings.addEventListener('toggle',async()=>{
    if(!standings.open||standings.dataset.loaded)return;
    standings.dataset.loaded='1';
    try{await contest56(weekStart56());}catch(error){delete standings.dataset.loaded;standings.querySelector('section').textContent='تعذر تحميل المنافسة. أغلق هذا القسم وافتحه للمحاولة مجددًا.';}
   });
   await evening56();
   if(standings)home.append(standings);
   const tiles=home?.querySelector('.staff-tiles61');if(tiles)home.prepend(tiles);
 }

 if(data.user.role==='halaqa_supervisor'){
  const panel=$('#points38'),home=screens32.get('home');
  if(panel&&home){home.append(panel);panel.open=false;}
 }
 updateBell53().catch(()=>{});
 $('#staffExtras50')?.remove();
 const original=data.user.original_role||data.user.role,isDemo=Boolean(document.querySelector('meta[name="demo-base42"]'));
 if(original==='halaqa_supervisor'&&!isDemo){
  const teaching=data.user.role==='halaqa_teacher',box=document.createElement('section');box.id='staffExtras50';box.className='staff-extras50';
  box.innerHTML='<div class="role-switch50"><span>وضع الحساب</span><div>'+button('الإشراف','data-teaching41="supervisor" aria-pressed="'+(data.user.role==='halaqa_supervisor')+'"')+(data.student_mode?button('ملفي كطالب','data-teaching41="student"'):'')+button('التدريس','data-teaching41="teacher" aria-pressed="'+teaching+'"')+'</div><small>اختر صفتك لعرض الواجهة المناسبة.</small></div>';
  $('#appNavigation').after(box);
  screens32.get('home')?.querySelectorAll('[data-teaching41]').forEach(button=>button.closest('.halaqat-card')?.remove());
  try{const contact=await api('/api/v50/support-contact');box.insertAdjacentHTML('beforeend','<details class="contact-owner50"><summary>التواصل مع مالك النظام</summary><p>'+esc(contact.name)+'</p><a href="'+esc(contact.whatsapp)+'" target="_blank" rel="noopener noreferrer">واتساب <bdi>'+esc(contact.phone)+'</bdi></a><a href="'+esc(contact.snapchat)+'" target="_blank" rel="noopener noreferrer">سناب شات <bdi>'+esc(contact.snapchat_username)+'</bdi></a><a href="mailto:'+esc(contact.email)+'">البريد <bdi>'+esc(contact.email)+'</bdi></a></details>');}catch(error){box.insertAdjacentHTML('beforeend','<p class="contact-error50">تعذر تحميل خيارات التواصل؛ حدّث الشاشة.</p>');}
 }
 if(data.user.role==='owner'){
  const account=screens32.get('accounts'),staff=(data.accounts||[]).filter(u=>u.active&&['halaqa_supervisor','halaqa_teacher'].includes(u.role));
  if(account&&staff.some(u=>u.role==='halaqa_supervisor')){
   account.insertAdjacentHTML('beforeend','<details><summary>المشرف طالب في حلقة</summary>'+form34('studentRole60',select('staff','المشرف',staff.filter(u=>u.role==='halaqa_supervisor').map(u=>[u.id,u.name]))+select('profile','ملف الطالب أو الحلقة',[['off','فك ربط الملف'],...(development.archive_choices||[]).filter(x=>x.kind==='students'&&x.active).map(x=>['student/'+x.id,'ربط ملف · '+x.name]),...data.rings.map(x=>['ring/'+x.id,'إنشاء ملف في · '+x.name])])+'<button>حفظ الربط</button>')+'</details>');
   account.querySelector('#studentRole60').onsubmit=e=>{e.preventDefault();const f=e.target,[type,id]=f.elements.profile.value.split('/');run(async()=>{await api('/api/v50/mosques/'+mid+'/staff/'+Number(f.elements.staff.value)+'/student-role',type==='ring'?{new_ring_id:Number(id)}:type==='student'?{student_id:Number(id)}:{},'PUT');await load();status('تم تحديث ربط المشرف بملف الطالب');});};
  }
  if(account&&staff.length){const section=document.createElement('details');section.id='combinedStaff50';section.className='combined-staff50';section.innerHTML='<summary>الإشراف والتدريس بحساب واحد</summary><p>للمجمع ذي الحلقة الواحدة، أو للمشرف الذي يدرّس إحدى الحلقات. الحساب المحدد سيشرف على المجمع كاملًا، وتظهر له أدوات التدريس للحلقات التي تختارها فقط، مع بقاء اسم المستخدم وكلمة المرور.</p><form id="combinedStaffForm50" class="halaqat-form">'+select('staff_id50','حساب المعلم أو المشرف',staff.map(u=>[u.id,u.name+' · '+(u.role==='halaqa_supervisor'?'مشرف':'معلم')]))+multiSelect('ring_ids50','الحلقات التي يدرّسها',data.rings.map(r=>[r.id,r.name]))+input('confirm50','اكتب: منح صلاحية الإشراف والتدريس','','text',true,'autocomplete="off" maxlength="80"')+'<button>حفظ الحساب المشترك</button></form>';account.append(section);syncCombinedStaff50();}
 }
}
function syncCombinedStaff50(){const f=$('#combinedStaffForm50');if(!f)return;const uid=Number(f.elements.staff_id50.value);f.elements.ring_ids50.querySelectorAll('option').forEach(option=>{const ring=data.rings.find(r=>r.id===Number(option.value));option.selected=data.rings.length===1||Boolean(ring?.teacher_ids?.includes(uid));});}
document.addEventListener('change',e=>{if(e.target.name==='staff_id50')syncCombinedStaff50();});
document.addEventListener('submit',e=>{if(e.target.id!=='combinedStaffForm50')return;e.preventDefault();const f=e.target;run(async()=>{const fd=new FormData(f),result=await api('/api/v50/mosques/'+mid+'/staff/'+Number(f.elements.staff_id50.value)+'/combined-role',{ring_ids:fd.getAll('ring_ids50').map(Number),confirm:f.elements.confirm50.value});await load();navigate32('accounts');const section=$('#combinedStaff50');if(section)section.open=true;status(result.message);});});

async function refreshCurrentView46(){const app=$('#halaqatApp'),wasFile=app?.classList.contains('file-open'),studentId=Number(sid);await load();if(wasFile&&studentId)await openFile(studentId,false);status('تم تحديث الشاشة');}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.removeOwner50)run(async()=>{
  const preview=await api('/api/v50/owner-accounts/'+Number(b.dataset.removeOwner50)+'/preview'),owner=preview.owner,box=$('#ownerRemovalPreview50');if(!box)return;
  box.innerHTML='<section class="owner-removal50"><h3>تأكيد حذف حساب المالك</h3><p><strong>'+esc(owner.name)+'</strong> · <bdi>'+esc(owner.username)+'</bdi></p><p>'+esc(preview.effect)+'</p><form id="removeOwnerForm50" class="halaqat-form" data-owner-id50="'+owner.id+'">'+input('confirm_username','اكتب اسم المستخدم لتأكيد الحذف','','text',true,'maxlength="80" autocomplete="off"')+'<div class="actions"><button type="submit" data-danger50>تأكيد حذف الحساب</button>'+button('إلغاء','data-cancel-owner50')+'</div></form></section>';box.scrollIntoView({behavior:'smooth',block:'center'});box.querySelector('input')?.focus();status('راجع أثر الحذف ثم اكتب اسم المستخدم للتأكيد');
 });
 if(b.hasAttribute('data-cancel-owner50')){$('#ownerRemovalPreview50').textContent='';}
});
document.addEventListener('submit',e=>{
 if(e.target.id!=='removeOwnerForm50')return;e.preventDefault();const f=e.target;
 run(async()=>{const result=await api('/api/v50/owner-accounts/'+Number(f.dataset.ownerId50)+'/remove',{confirm_username:f.elements.confirm_username.value});await load();navigate32('accounts');const details=$('#ownersAdmin50');if(details)details.open=true;status(result.message||'الحساب محذوف من القائمة بالفعل');});
});
document.addEventListener('click',e=>{if(!e.target.closest('[data-reload-ui46]'))return;run(refreshCurrentView46);});

})();


