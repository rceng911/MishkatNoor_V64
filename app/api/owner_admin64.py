"""Remove an owner's login without deleting teaching or attribution records."""
import json
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, select
from app.api.routes import audit
from app.db.session import PrimarySession
from app.models import AuthSession, Mosque, OwnerRemoval50, PrimaryOwner50, User
from app.services.account_policy import normalize_username
from app.services.owner_policy64 import can_manage_owners50, primary_actor50, real_user50

router = APIRouter(prefix="/api/v50/owner-accounts", tags=["owner administration"])


def primary_db50():
    with PrimarySession() as db:
        yield db


@router.get("/capabilities")
def capabilities(request: Request, db=Depends(primary_db50)):
    user = real_user50(request, db)
    return {"can_remove_owners": can_manage_owners50(request, db, user)}


def pack(user, db, primary):
    mosque = db.get(Mosque, user.mosque_id) if user.mosque_id else None
    return {"id":user.id, "name":user.full_name, "username":user.username, "active":bool(user.active), "mosque":mosque.name if mosque else "", "protected":user.id == primary}


@router.get("")
def list_owners(request: Request, db=Depends(primary_db50)):
    actor = primary_actor50(request, db)
    rows = db.scalars(select(User).where(User.role == "owner", ~User.id.in_(select(OwnerRemoval50.user_id))).order_by(User.id)).all()
    return {"owners":[pack(user, db, actor.id) for user in rows]}


def target_owner50(db, user_id, actor):
    if user_id == actor.id:
        raise HTTPException(409, "حسابك الأساسي محمي ولا يمكن حذفه")
    target = db.scalar(select(User).where(User.id == user_id, User.role == "owner").with_for_update())
    if not target:
        raise HTTPException(404, "حساب المالك غير موجود")
    primary = db.get(PrimaryOwner50, 1)
    if primary and target.id == primary.user_id:
        raise HTTPException(409, "حساب مالك النظام الأساسي محمي")
    return target


@router.get("/{user_id}/preview")
def preview(user_id: int, request: Request, db=Depends(primary_db50)):
    actor = primary_actor50(request, db)
    target = target_owner50(db, user_id, actor)
    if db.get(OwnerRemoval50, target.id):
        raise HTTPException(409, "هذا الحساب محذوف من قائمة الملاك بالفعل")
    return {"owner":pack(target, db, actor.id), "effect":"سيُحذف الحساب من قائمة الملاك ويُمنع دخوله وتُنهي جميع جلساته. تبقى المجمعات والحلقات والطلاب والتقارير وسجلات العمليات محفوظة.", "confirmation":"اكتب اسم المستخدم لتأكيد حذف الحساب"}


class RemoveOwner50(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirm_username: str = Field(min_length=1, max_length=80)


@router.post("/{user_id}/remove")
def remove(user_id: int, payload: RemoveOwner50, request: Request, db=Depends(primary_db50)):
    actor = primary_actor50(request, db)
    db.scalar(select(PrimaryOwner50).where(PrimaryOwner50.id == 1).with_for_update())
    target = target_owner50(db, user_id, actor)
    if normalize_username(payload.confirm_username) != target.username:
        raise HTTPException(422, "اسم المستخدم المكتوب غير مطابق؛ لم يُحذف الحساب")
    if db.get(OwnerRemoval50, target.id):
        return {"ok":True, "already_removed":True}
    count = db.scalar(select(func.count(User.id)).where(User.role == "owner", User.active.is_(True))) or 0
    if target.active and count <= 1:
        raise HTTPException(409, "لا يمكن حذف آخر حساب مالك فعال")
    target.active = False
    target.force_password_change = True
    db.execute(delete(AuthSession).where(AuthSession.user_id == target.id))
    db.add(OwnerRemoval50(user_id=target.id, removed_by=actor.id, username=target.username))
    audit(db, actor.id, actor.mosque_id, "owner_account_removed_v50", json.dumps({"user_id":target.id, "username":target.username}, ensure_ascii=False))
    db.commit()
    return {"ok":True, "already_removed":False, "message":"تم حذف حساب المالك من القائمة وإيقاف دخوله؛ بيانات المجمع محفوظة"}
