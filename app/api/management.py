from app.services.roster64 import arabic_order
"""Owner controlled circle management and reviewed bulk enrollment."""
import hashlib,json
from pathlib import Path
from typing import Literal
from fastapi import APIRouter,Depends,HTTPException,Request
from fastapi.responses import FileResponse, Response
from pydantic import Field
from sqlalchemy import select,delete,update,func,or_
from app.db.session import get_db
from app.models import *
from app.api.halaqat import Input,_require,_ring_pack,_unique_email,TEACHER_ROLE
from app.api.development import normalized_name
from app.api.routes import audit,audit_change

router=APIRouter(prefix='/api/halaqat/mosques/{mid}')

def owner_ring(db,request,mid,rid):
    u=_require(request,db,mid,{'owner'});r=db.get(Halaqa,rid)
    if not r or r.mosque_id!=mid:raise HTTPException(404,'الحلقة غير موجودة')
    return u,r

class EditRing(Input):
    name:str=Field(min_length=2,max_length=180)
    schedule:str=Field('',max_length=500)
    supervisor_ids:list[int]=Field(default_factory=list,max_length=100)
    teacher_ids:list[int]=Field(default_factory=list,max_length=100)

@router.put('/rings/{rid}')
def edit_ring(mid:int,rid:int,data:EditRing,request:Request,db=Depends(get_db)):
    u,r=owner_ring(db,request,mid,rid)
    if db.scalar(select(Halaqa.id).where(Halaqa.mosque_id==mid,Halaqa.name==data.name,Halaqa.id!=rid)):raise HTTPException(409,'اسم الحلقة موجود')
    for ids,role in [(data.supervisor_ids,'halaqa_supervisor'),(data.teacher_ids,TEACHER_ROLE)]:
        if len(ids)!=len(set(ids)):raise HTTPException(422,'حساب مكرر')
        for uid in ids:
            target=db.get(User,uid)
            if not target or not target.active or target.mosque_id!=mid or target.role not in ((TEACHER_ROLE, 'halaqa_supervisor') if role == TEACHER_ROLE else (role,)):raise HTTPException(422,'حساب خارج المسجد أو غير صالح')
    before=_ring_pack(r,db)
    for model,ids in [(HalaqaTeacher,data.teacher_ids),(HalaqaSupervisor,data.supervisor_ids)]:
        links=db.scalars(select(model).where(model.halaqa_id==rid)).all()
        for link in links:link.active=link.user_id in ids
        known={x.user_id for x in links}
        for uid in ids:
            if uid not in known:db.add(model(halaqa_id=rid,user_id=uid,assigned_by=u.id,active=True))
    r.name=data.name;r.schedule=data.schedule;r.supervisor_id=data.supervisor_ids[0] if data.supervisor_ids else None
    audit_change(db,u.id,mid,'ring_edited',rid,before,data.model_dump());db.commit()
    return {'ok':True}

class TeacherEdit(Input):
    phone:str=Field("",max_length=40)
    notes:str=Field("",max_length=1000)
    full_name:str=Field(min_length=2,max_length=180)
    email:str=Field('',max_length=200)

@router.get('/teachers/manage')
def teacher_list(mid:int,request:Request,db=Depends(get_db)):
    _require(request,db,mid,{'owner'})
    return {'teachers':[{'id':u.id,'full_name':u.full_name,'email':'' if u.email.endswith('@accounts.invalid') else u.email,'active':u.active,'phone':u.phone or '', 'notes':u.staff_notes or ''} for u in db.scalars(select(User).where(User.mosque_id==mid,User.role==TEACHER_ROLE))]}

@router.put('/teachers/{uid}/profile')
def teacher_edit(mid:int,uid:int,data:TeacherEdit,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,{'owner'});t=db.get(User,uid)
    if not t or t.mosque_id!=mid or t.role!=TEACHER_ROLE:raise HTTPException(404,'المدرس غير موجود')
    email=data.email.lower()
    if email and ('@' not in email or ' ' in email):raise HTTPException(422,'البريد غير صالح')
    if email and db.scalar(select(User.id).where(User.email==email,User.id!=uid)):raise HTTPException(409,'البريد مستخدم')
    before={'full_name':t.full_name,'email':t.email}
    t.full_name=data.full_name;t.phone=data.phone;t.staff_notes=data.notes;t.email=email or (t.email if t.email.endswith('@accounts.invalid') else _unique_email(db,'','teacher',uid))
    audit_change(db,u.id,mid,'teacher_profile_edited',uid,before,{'full_name':t.full_name,'email':t.email});db.commit();return {'ok':True}

@router.put('/teacher-requests/{qid}')
def teacher_request_edit(mid:int,qid:int,data:TeacherEdit,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,{'owner'});r=db.get(HalaqaAccountRequest,qid)
    if not r or r.mosque_id!=mid or r.request_type!='teacher':raise HTTPException(404,'طلب المدرس غير موجود')
    if r.status!='pending':raise HTTPException(409,'تمت معالجة الطلب؛ عدل حساب المدرس')
    before={'full_name':r.full_name,'email':r.email};r.full_name=data.full_name;r.email=data.email
    audit_change(db,u.id,mid,'teacher_request_edited',qid,before,data.model_dump());db.commit();return {'ok':True}


@router.get('/rings/{rid}/deletion-preview')
def preview_delete(mid:int,rid:int,request:Request,db=Depends(get_db)):
    owner_ring(db,request,mid,rid)
    result = preview('ring',rid,request,db)
    result['counts']['students'] = result['counts'].get('halaqa_students',0)
    result['counts']['requests'] = result['counts'].get('halaqa_account_requests',0)
    return result


class DeleteRing(Input):
    confirm_name:str
    token:str=Field(min_length=64,max_length=64)

@router.delete('/rings/{rid}')
def delete_ring(mid:int,rid:int,data:DeleteRing,request:Request,db=Depends(get_db)):
    owner_ring(db,request,mid,rid)
    return execute('ring',rid,Confirm(confirm_name=data.confirm_name,confirm_word='حذف',token=data.token),request,db)

class RosterGroup(Input):
    name:str=Field(min_length=2,max_length=180)
    teacher_name:str=Field(min_length=2,max_length=180)
    students:list[str]=Field(min_length=1,max_length=100)

class RosterInput(Input):
    reviewed:Literal[True]
    groups:list[RosterGroup]=Field(min_length=1,max_length=10)

@router.post('/roster/import')
def import_roster(mid:int,data:RosterInput,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,{'owner'})
    ringnames={normalized_name(n) for n in db.scalars(select(Halaqa.name).where(Halaqa.mosque_id==mid))}
    names={normalized_name(n) for n in db.scalars(select(HalaqaStudent.full_name).join(Halaqa).where(Halaqa.mosque_id==mid))}
    names.update(normalized_name(n) for n in db.scalars(select(HalaqaAccountRequest.full_name).where(HalaqaAccountRequest.mosque_id==mid,HalaqaAccountRequest.request_type=='student',HalaqaAccountRequest.status.in_(['pending','returned']))))
    # Validate the complete batch before writing anything; no assumed guardian or password.
    for g in data.groups:
        if '?' in g.teacher_name or '؟' in g.teacher_name:raise HTTPException(422,'أكمل اسم المدرس')
        rn=normalized_name(g.name)
        if rn in ringnames:raise HTTPException(409,'اسم حلقة مكرر؛ لم تتم إضافة أي بيانات')
        ringnames.add(rn)
        for name in g.students:
            clean=name.strip();n=normalized_name(clean)
            if len(clean)<2 or len(clean)>180 or '?' in clean or '؟' in clean:raise HTTPException(422,'راجع أسماء الطلاب')
            if n in names:raise HTTPException(409,'اسم طالب مكرر؛ راجع القائمة قبل الإضافة')
            names.add(n)
    total=0
    for g in data.groups:
        r=Halaqa(mosque_id=mid,name=g.name,active=True);db.add(r);db.flush()
        db.add(HalaqaAccountRequest(mosque_id=mid,request_type='teacher',requested_by=u.id,halaqa_id=r.id,full_name=g.teacher_name,status='pending',notes='من قائمة الحلقات؛ بانتظار إصدار الحساب من المالك'))
        for name in g.students:
            db.add(HalaqaStudent(halaqa_id=r.id,full_name=name.strip(),user_id=None,recipient_type='student',national_id='',birth_date=None,active=True,notes='مستورد من قائمة الحلقات. يحدد المالك حساب متابع التقارير قبل إصدار الدخول.'));total+=1
    audit(db,u.id,mid,'roster_imported',json.dumps({'rings':len(data.groups),'students':total}));db.commit()
    return {'ok':True,'rings':len(data.groups),'students':total}

@router.get('/roster/source')
def roster_source(mid:int,request:Request,db=Depends(get_db)):
    _require(request,db,mid,{'owner'})
    return FileResponse(Path(__file__).resolve().parents[1]/'assets'/'roster-source.png',headers={'Cache-Control':'no-store'})


class SupervisorEdit(TeacherEdit):
    username: str = Field(min_length=3,max_length=30)

@router.get('/supervisors/manage')
def supervisor_list(mid:int,request:Request,db=Depends(get_db)):
    _require(request,db,mid,{'owner'})
    return {'supervisors':[{'id':u.id,'full_name':u.full_name,'username':u.username,'email':'' if u.email.endswith('@accounts.invalid') else u.email,'phone':u.phone or '', 'notes':u.staff_notes or '', 'active':u.active} for u in db.scalars(select(User).where(User.mosque_id==mid,User.role=='halaqa_supervisor'))]}

@router.put('/supervisors/{uid}/profile')
def edit_supervisor(mid:int,uid:int,data:SupervisorEdit,request:Request,db=Depends(get_db)):
    from app.api.halaqat import _clean_username
    u=_require(request,db,mid,{'owner'});target=db.get(User,uid)
    if not target or target.mosque_id!=mid or target.role!='halaqa_supervisor':raise HTTPException(404,'المشرف غير موجود')
    username=_clean_username(data.username,required=True)
    if db.scalar(select(User.id).where(User.username==username,User.id!=uid)):raise HTTPException(409,'اسم المستخدم مستخدم')
    email=data.email.lower()
    if email and ('@' not in email or ' ' in email):raise HTTPException(422,'البريد غير صالح')
    if email and db.scalar(select(User.id).where(User.email==email,User.id!=uid)):raise HTTPException(409,'البريد مستخدم')
    before={'full_name':target.full_name,'username':target.username,'email':target.email,'phone':target.phone,'notes':target.staff_notes}
    if username!=target.username:db.execute(delete(AuthSession).where(AuthSession.user_id==uid))
    target.username=username;target.full_name=data.full_name;target.phone=data.phone;target.staff_notes=data.notes
    target.email=email or (target.email if target.email.endswith('@accounts.invalid') else _unique_email(db,'','supervisor',uid))
    audit_change(db,u.id,mid,'supervisor_profile_edited',uid,before,data.model_dump());db.commit();return {'ok':True}

class RemoveSupervisor(Input):
    confirm_name: str

@router.delete('/supervisors/{uid}')
def remove_supervisor(mid:int,uid:int,data:RemoveSupervisor,request:Request,db=Depends(get_db)):
    u=_require(request,db,mid,{'owner'});target=db.get(User,uid)
    if not target or target.mosque_id!=mid or target.role!='halaqa_supervisor':raise HTTPException(404,'المشرف غير موجود')
    if data.confirm_name!=target.full_name:raise HTTPException(422,'اكتب اسم المشرف لتأكيد الإزالة')
    target.active=False
    db.execute(delete(AuthSession).where(AuthSession.user_id==uid))
    db.execute(update(HalaqaSupervisor).where(HalaqaSupervisor.user_id==uid).values(active=False))
    db.execute(update(Halaqa).where(Halaqa.supervisor_id==uid).values(supervisor_id=None))
    audit(db,u.id,mid,'supervisor_removed',json.dumps({'id':uid,'name':target.full_name},ensure_ascii=False));db.commit()
    return {'ok':True}

# --- Version 25: owner-only irreversible account / organization deletion ---



class V25DeleteNamed(Input):
    confirm_name: str = Field(min_length=2, max_length=180)
    token: str = Field(min_length=64, max_length=64)

@router.get('/accounts/{uid}/deletion-preview')
def v25_account_delete_preview(mid:int, uid:int, request:Request, db=Depends(get_db)):
    _legacy_account(db,request,mid,uid)
    return preview('account',uid,request,db)

@router.delete('/accounts/{uid}')
def v25_delete_account(mid:int, uid:int, data:V25DeleteNamed, request:Request, db=Depends(get_db)):
    _legacy_account(db,request,mid,uid)
    return execute('account',uid,Confirm(confirm_name=data.confirm_name,confirm_word='حذف',token=data.token),request,db)


@router.get('/organization/deletion-preview')
def v25_organization_delete_preview(mid:int, request:Request, db=Depends(get_db)):
    _require(request,db,mid,{'owner'})
    result = preview('mosque',mid,request,db)
    result['counts'].update(rings=result['counts'].get('halaqat',0), students=result['counts'].get('halaqa_students',0), accounts=result['counts'].get('users',0))
    return result

@router.delete('/organization')
def v25_delete_organization(mid:int, data:V25DeleteNamed, request:Request, db=Depends(get_db)):
    _require(request,db,mid,{'owner'})
    return execute('mosque',mid,Confirm(confirm_name=data.confirm_name,confirm_word='حذف',token=data.token),request,db)

# --- Version 22: printable rosters and safe permanent student deletion ---

def _v22_student_scope(db, request, mid: int, sid: int):
    u = _require(request, db, mid, {'owner'})
    s = db.get(HalaqaStudent, sid)
    if not s:
        raise HTTPException(404, 'الطالب غير موجود')
    ring = db.get(Halaqa, s.halaqa_id)
    if not ring or ring.mosque_id != mid:
        raise HTTPException(404, 'الطالب غير موجود في هذا الفرع')
    return u, s, ring




@router.get('/students/{sid}/deletion-preview')
def v22_student_delete_preview(mid: int, sid: int, request: Request, db=Depends(get_db)):
    _v22_student_scope(db,request,mid,sid)
    return preview('student',sid,request,db)


class V22DeleteStudent(Input):
    confirm_name: str = Field(min_length=2, max_length=180)
    token: str = Field(min_length=64, max_length=64)


@router.delete('/students/{sid}')
def v22_delete_student(mid: int, sid: int, data: V22DeleteStudent, request: Request, db=Depends(get_db)):
    _v22_student_scope(db,request,mid,sid)
    return execute('student',sid,Confirm(confirm_name=data.confirm_name,confirm_word='حذف',token=data.token),request,db)




def _export_scope_students(db, request, mid: int):
    """Return active students visible to owner/supervisor, sorted by ring then name."""
    from app.api.halaqat import SUPERVISOR_ROLE, _ring_ids_for
    u = _require(request, db, mid, {SUPERVISOR_ROLE})
    ring_ids = _ring_ids_for(u, mid, db)
    if not ring_ids:
        return u, [], {}
    rings = {r.id: r for r in db.scalars(select(Halaqa).where(Halaqa.id.in_(ring_ids), Halaqa.mosque_id == mid)).all()}
    students = list(db.scalars(select(HalaqaStudent).where(HalaqaStudent.halaqa_id.in_(ring_ids), HalaqaStudent.active.is_(True))).all())
    students.sort(key=lambda x: ((rings.get(x.halaqa_id).name if rings.get(x.halaqa_id) else '').casefold(), arabic_order(x)))
    return u, students, rings


def _xlsx_response(workbook, filename: str):
    import io
    stream = io.BytesIO()
    workbook.save(stream)
    return Response(
        stream.getvalue(),
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': f'attachment; filename="{filename}"', 'Cache-Control': 'no-store'},
    )


def _style_export_sheet(ws, widths):
    from openpyxl.styles import Font, PatternFill, Alignment
    header_fill = PatternFill('solid', fgColor='DDE8E0')
    for cell in ws[1]:
        cell.font = Font(bold=True, color='173D2D')
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='right')
    ws.freeze_panes = 'A2'
    ws.sheet_view.rightToLeft = True
    ws.auto_filter.ref = ws.dimensions
    for col, width in widths.items():
        ws.column_dimensions[col].width = width
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(horizontal='right', vertical='top', wrap_text=True)


@router.get('/exports/students-basic.xlsx')
def export_students_basic(mid: int, request: Request, db=Depends(get_db)):
    """Export basic student/contact data for the owner's or supervisor's permitted scope."""
    from openpyxl import Workbook
    _, students, rings = _export_scope_students(db, request, mid)
    wb = Workbook(); ws = wb.active; ws.title = 'بيانات الطلاب'
    ws.append(['الحلقة', 'اسم الطالب', 'رقم التواصل', 'ولي الأمر', 'صلة القرابة', 'الصف الدراسي', 'تاريخ الميلاد', 'الحفظ عند التسجيل', 'نوع حساب المتابعة'])
    for st in students:
        linked = db.get(User, st.user_id) if st.user_id else None
        phone = (linked.phone if linked and linked.phone else '') or st.guardian_phone or ''
        ws.append([
            rings.get(st.halaqa_id).name if rings.get(st.halaqa_id) else '',
            st.full_name, phone, st.guardian_name or '', st.guardian_relation or '',
            st.school_grade or '', st.birth_date.isoformat() if st.birth_date else '',
            st.current_memorization or '', 'ولي أمر' if st.recipient_type == 'guardian' else 'الطالب',
        ])
    _style_export_sheet(ws, {'A':22,'B':28,'C':18,'D':26,'E':16,'F':16,'G':16,'H':28,'I':18})
    return _xlsx_response(wb, 'students-basic.xlsx')


@router.get('/exports/students-evaluations.xlsx')
def export_students_evaluations(mid: int, request: Request, db=Depends(get_db)):
    """Export attendance, recitation and evaluation rows for all visible active students."""
    from openpyxl import Workbook
    _, students, rings = _export_scope_students(db, request, mid)
    ids = [s.id for s in students]
    by_id = {s.id: s for s in students}
    rows = list(db.scalars(select(HalaqaProgress).where(HalaqaProgress.student_id.in_(ids)).order_by(HalaqaProgress.day.desc(), HalaqaProgress.student_id)).all()) if ids else []
    from app.services.attendance64 import ATTENDANCE_LABELS51
    attendance_names = ATTENDANCE_LABELS51
    wb = Workbook(); ws = wb.active; ws.title = 'التقييمات والمتابعة'
    ws.append(['الحلقة', 'اسم الطالب', 'التاريخ', 'الحضور', 'المحفوظ', 'المراجعة', 'درجة الحفظ /10', 'درجة التجويد /10', 'الأخطاء', 'ملاحظات'])
    for p in rows:
        st = by_id.get(p.student_id)
        if not st:
            continue
        ws.append([
            rings.get(st.halaqa_id).name if rings.get(st.halaqa_id) else '', st.full_name, p.day.isoformat(),
            attendance_names.get(p.attendance, p.attendance), p.memorized or '', p.revision or '',
            p.memorization_score if p.memorization_score is not None else '',
            p.tajweed_score if p.tajweed_score is not None else '', p.mistakes or 0, p.notes or '',
        ])
    _style_export_sheet(ws, {'A':22,'B':28,'C':14,'D':14,'E':32,'F':32,'G':18,'H':18,'I':12,'J':38})
    return _xlsx_response(wb, 'students-evaluations.xlsx')


@router.get('/rings/{rid}/roster.csv')
def v22_roster_csv(mid: int, rid: int, request: Request, db=Depends(get_db)):
    import csv, io
    from app.api.halaqat import SUPERVISOR_ROLE, _ring_ids_for
    from fastapi.responses import Response
    u = _require(request, db, mid, {SUPERVISOR_ROLE})
    ring = db.get(Halaqa, rid)
    if not ring or ring.mosque_id != mid or (u.role != 'owner' and rid not in _ring_ids_for(u, mid, db)):
        raise HTTPException(404, 'الحلقة غير متاحة')
    rows = list(db.scalars(select(HalaqaStudent).where(HalaqaStudent.halaqa_id == rid, HalaqaStudent.active.is_(True))).all())
    rows.sort(key=arabic_order)
    out = io.StringIO(); w = csv.writer(out)
    w.writerow(['الترتيب في الحلقة','اسم الطالب', 'رقم التواصل', 'ولي الأمر', 'صلة القرابة', 'الصف الدراسي'])
    for position,s in enumerate(rows,1):
        linked = db.get(User, s.user_id) if s.user_id else None
        phone = (linked.phone if linked and linked.phone else '') or s.guardian_phone or ''
        w.writerow([position,s.full_name, phone, s.guardian_name or '', s.guardian_relation or '', s.school_grade or ''])
    return Response('\ufeff' + out.getvalue(), media_type='text/csv; charset=utf-8', headers={'Content-Disposition': f'attachment; filename="ring-{rid}-roster.csv"'})


@router.get('/rings/{rid}/roster')
def v22_roster_print(mid: int, rid: int, request: Request, db=Depends(get_db)):
    import html
    from app.api.halaqat import SUPERVISOR_ROLE, _ring_ids_for
    from fastapi.responses import HTMLResponse
    u = _require(request, db, mid, {SUPERVISOR_ROLE})
    ring = db.get(Halaqa, rid)
    if not ring or ring.mosque_id != mid or (u.role != 'owner' and rid not in _ring_ids_for(u, mid, db)):
        raise HTTPException(404, 'الحلقة غير متاحة')
    rows = list(db.scalars(select(HalaqaStudent).where(HalaqaStudent.halaqa_id == rid, HalaqaStudent.active.is_(True))).all())
    rows.sort(key=arabic_order)
    body = []
    for i, s in enumerate(rows, 1):
        linked = db.get(User, s.user_id) if s.user_id else None
        phone = (linked.phone if linked and linked.phone else '') or s.guardian_phone or ''
        body.append(f'<tr><td>{i}</td><td>{html.escape(s.full_name)}</td><td dir="ltr">{html.escape(phone)}</td><td>{html.escape(s.guardian_name or "—")}</td><td>{html.escape(s.guardian_relation or "—")}</td></tr>')
    page = f'''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>{html.escape(ring.name)} - كشف الطلاب</title><style>body{{font-family:Tahoma,Arial,sans-serif;margin:28px;color:#173d2d}}h1{{margin-bottom:4px}}p{{color:#60736a}}table{{width:100%;border-collapse:collapse;margin-top:20px}}th,td{{border:1px solid #cad8d0;padding:9px;text-align:right}}th{{background:#eef5f0}}button{{padding:10px 18px;border:0;border-radius:8px;background:#0b6548;color:white;font-weight:bold}}@media print{{button{{display:none}}body{{margin:0}}}}</style></head><body><script defer src="/static/roster-print64.js"></script><button data-print>طباعة الكشف</button><h1>{html.escape(ring.name)}</h1><p>عدد الطلاب: {len(rows)} · الترتيب أبجدي تلقائي</p><table><thead><tr><th>#</th><th>اسم الطالب</th><th>رقم التواصل</th><th>ولي الأمر</th><th>صلة القرابة</th></tr></thead><tbody>{''.join(body)}</tbody></table></body></html>'''
    return HTMLResponse(page, headers={'Cache-Control': 'no-store'})

from app.api.deletion64 import preview, execute, Confirm

def _legacy_account(db, request, mid, uid):
    _require(request,db,mid,{'owner'})
    target = db.get(User,uid)
    if not target or target.mosque_id not in (None,mid):
        raise HTTPException(404,'الحساب خارج المجمع')
