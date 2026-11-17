from sqlalchemy import or_, select
from app.models import HalaqaStudent
from app.models.accounts64 import GuardianStudent32

def family_filter(uid):
    return or_(HalaqaStudent.user_id == uid, HalaqaStudent.id.in_(select(GuardianStudent32.student_id).where(GuardianStudent32.user_id == uid)))

def can_read_student(db, uid, student):
    return student.user_id == uid or db.get(GuardianStudent32, (uid, student.id)) is not None
