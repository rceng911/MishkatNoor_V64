"""Supervisor contact and explicit owner-approved combined teaching accounts."""
import json
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field
from sqlalchemy import delete, select
from app.api.halaqat import Input, SUPERVISOR_ROLE, TEACHER_ROLE, _require
from app.api.owner_admin64 import primary_db50
from app.api.routes import audit
from app.db.session import get_db
from app.models import AuthSession, Halaqa, HalaqaTeacher, User
from app.services.owner_policy64 import real_user50

router = APIRouter(prefix="/api/v50", tags=["staff tools"])


@router.get("/support-contact")
def support_contact(request: Request, db=Depends(primary_db50)):
    user = real_user50(request, db)
    if user.role != SUPERVISOR_ROLE:
        raise HTTPException(403, "بيانات التواصل متاحة لمشرفي المجمعات فقط")
    return {"name":"محمد مسفر", "phone":"0507420788", "whatsapp":"https://wa.me/966507420788", "snapchat":"https://www.snapchat.com/add/rc_eng", "snapchat_username":"rc_eng", "email":"almahjari911@gmail.com"}


class CombinedRole50(Input):
    ring_ids: list[int] = Field(min_length=1, max_length=100)
    confirm: str = Field(min_length=1, max_length=80)


@router.post("/mosques/{mid}/staff/{user_id}/combined-role")
def combined_role(mid: int, user_id: int, payload: CombinedRole50, request: Request, db=Depends(get_db)):
    actor = _require(request, db, mid, {"owner"})
    if payload.confirm != "منح صلاحية الإشراف والتدريس":
        raise HTTPException(422, "اكتب عبارة تأكيد منح صلاحية الإشراف والتدريس")
    if len(set(payload.ring_ids)) != len(payload.ring_ids):
        raise HTTPException(422, "توجد حلقة مكررة")
    target = db.scalar(select(User).where(User.id == user_id).with_for_update())
    if not target or not target.active or target.mosque_id != mid or target.role not in (TEACHER_ROLE, SUPERVISOR_ROLE):
        raise HTTPException(404, "اختر حساب معلم أو مشرف فعال من هذا المجمع")
    rings = db.scalars(select(Halaqa).where(Halaqa.id.in_(payload.ring_ids), Halaqa.mosque_id == mid, Halaqa.active.is_(True))).all()
    if len(rings) != len(payload.ring_ids):
        raise HTTPException(422, "إحدى الحلقات غير متاحة أو خارج المجمع")
    previous_role = target.role
    target.role = SUPERVISOR_ROLE
    links = db.scalars(select(HalaqaTeacher).join(Halaqa, Halaqa.id == HalaqaTeacher.halaqa_id).where(HalaqaTeacher.user_id == target.id, Halaqa.mosque_id == mid)).all()
    known = {link.halaqa_id for link in links}
    for link in links:
        link.active = link.halaqa_id in payload.ring_ids
    for rid in payload.ring_ids:
        if rid not in known:
            db.add(HalaqaTeacher(halaqa_id=rid, user_id=target.id, assigned_by=actor.id, active=True))
    if previous_role != SUPERVISOR_ROLE:
        db.execute(delete(AuthSession).where(AuthSession.user_id == target.id))
    audit(db, actor.id, mid, "combined_supervisor_teacher_v50", json.dumps({"user_id":target.id, "previous_role":previous_role, "teaching_rings":sorted(payload.ring_ids)}, ensure_ascii=False))
    db.commit()
    return {"ok":True, "message":"تم ربط الإشراف والتدريس بالحساب نفسه؛ يدخل صاحبه باسم المستخدم وكلمة المرور الحاليين"}


class StudentRole60(Input):
    student_id: int | None = Field(None, gt=0)
    new_ring_id: int | None = Field(None, gt=0)

@router.put("/mosques/{mid}/staff/{user_id}/student-role")
def student_role60(mid:int,user_id:int,payload:StudentRole60,request:Request,db=Depends(get_db)):
    from app.models import HalaqaStudent
    actor=_require(request,db,mid,{'owner'})
    target=db.get(User,user_id,with_for_update=True)
    if not target or target.mosque_id!=mid or not target.active or target.role!=SUPERVISOR_ROLE:
        raise HTTPException(404,'اختر مشرفًا فعّالًا من هذا المجمع')
    old=list(db.scalars(select(HalaqaStudent).where(HalaqaStudent.user_id==target.id)))
    if payload.new_ring_id:
        ring=db.get(Halaqa,payload.new_ring_id)
        if payload.student_id or old or not ring or ring.mosque_id!=mid or not ring.active:
            raise HTTPException(409,'تحقق من الحلقة وملف المشرف الموجود')
        student=HalaqaStudent(halaqa_id=ring.id,full_name=target.full_name,recipient_type='student',user_id=target.id)
        db.add(student)
    elif payload.student_id:
        student=db.get(HalaqaStudent,payload.student_id,with_for_update=True)
        ring=db.get(Halaqa,student.halaqa_id) if student else None
        if not ring or ring.mosque_id!=mid or not ring.active or not student.active or student.user_id not in (None,user_id) or any(x.id!=student.id for x in old):
            raise HTTPException(409,'الملف غير متاح للربط أو مرتبط بحساب آخر')
        student.user_id=user_id
        student.recipient_type='student'
    else:
        for student in old:
            student.user_id=None
    audit(db,actor.id,mid,'supervisor_student_role',json.dumps({'user':user_id,**payload.model_dump()}))
    db.commit()
    return {'ok':True}
