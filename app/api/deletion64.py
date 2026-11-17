"""Owner-only, previewed transactional deletion without schema changes."""
import hashlib
import json
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field
from sqlalchemy import select, delete, update, tuple_, text
from app.api.halaqat import Input, _actor
from app.api.routes import audit
from app.db.session import Base, get_db
from app.models import Mosque, User, Halaqa, HalaqaStudent, HalaqaChangeRequest, HalaqaTeacher, HalaqaSupervisor, SubstituteTeacher

router = APIRouter(prefix='/api/owner/permanent-delete')
Kind = Literal['account', 'mosque', 'ring', 'supervisor', 'teacher', 'student', 'guardian']
AUTHOR_COLUMNS = {'created_by', 'updated_by', 'assigned_by', 'issued_by', 'approved_by',
                  'requested_by', 'reviewed_by', 'recorded_by', 'assessed_by', 'examiner_id', 'submitted_by'}


def owner(request, db):
    actor = _actor(request, db)
    if actor.role != 'owner':
        raise HTTPException(403, 'الحذف النهائي متاح للمالك فقط')
    return actor


def target(db, kind, entity_id):
    model = {'mosque': Mosque, 'ring': Halaqa, 'student': HalaqaStudent}.get(kind, User)
    obj = db.get(model, entity_id)
    roles = {'supervisor': 'halaqa_supervisor', 'teacher': 'halaqa_teacher', 'guardian': 'halaqa_student'}
    if not obj or (kind in roles and (obj.role != roles[kind] or (kind == 'guardian' and obj.account_type != 'guardian'))):
        raise HTTPException(404, 'العنصر غير موجود')
    if isinstance(obj, User) and obj.role == "owner":
        raise HTTPException(422, "لا يمكن حذف حساب المالك")
    return obj


def key(table, row):
    return tuple(row[c.name] for c in table.primary_key.columns)


def matches(table, keys):
    return tuple_(*table.primary_key.columns).in_(list(keys))


def plan(db, kind, entity_id, actor):
    obj = target(db, kind, entity_id)
    tables = list(Base.metadata.sorted_tables)
    removed = {t.name: {} for t in tables}
    changes = {}

    def collect(table, condition):
        before = len(removed[table.name])
        for row in db.execute(select(table).where(condition)).mappings():
            removed[table.name][key(table, row)] = dict(row)
        return len(removed[table.name]) != before

    table = obj.__table__
    collect(table, table.c.id == entity_id)
    # Student login accounts are removed only when no other student uses them.
    # Guardians and staff survive a ring deletion; their links are cleaned below.
    while True:
        grew = False
        students = removed['halaqa_students']
        for row in list(students.values()):
            uid = row['user_id']
            user = db.get(User, uid) if uid else None
            if user and user.role == 'halaqa_student' and user.account_type != 'guardian':
                other = db.scalar(select(HalaqaStudent.id).where(HalaqaStudent.user_id == uid, ~HalaqaStudent.id.in_([k[0] for k in students])))
                if not other:
                    grew |= collect(User.__table__, User.id == uid)
        for child in tables:
            for column in child.c:
                for fk in column.foreign_keys:
                    parent = fk.column.table
                    rows = removed[parent.name]
                    if not rows:
                        continue
                    values = [r[fk.column.name] for r in rows.values()]
                    condition = column.in_(values)
                    preserve = child.name == 'audit_logs' or column.name == 'next_exam_id'
                    if parent.name == 'users':
                        preserve |= column.nullable or column.name in AUTHOR_COLUMNS
                    if child.name == 'users' and parent.name == 'mosques':
                        # Owner accounts cannot be deleted. Cross-branch family accounts survive.
                        for row in db.execute(select(child).where(condition)).mappings():
                            outside = None
                            for link in (HalaqaStudent, HalaqaTeacher, HalaqaSupervisor, SubstituteTeacher):
                                outside = db.scalar(select(Halaqa.mosque_id).join(link, link.halaqa_id == Halaqa.id).where(link.user_id == row['id'], ~Halaqa.mosque_id.in_(values)).order_by(Halaqa.mosque_id))
                                if outside is not None:
                                    break
                            if outside is None:
                                from app.models.accounts64 import GuardianStudent32
                                outside = db.scalar(select(Halaqa.mosque_id).join(HalaqaStudent, HalaqaStudent.halaqa_id == Halaqa.id).join(GuardianStudent32, GuardianStudent32.student_id == HalaqaStudent.id).where(GuardianStudent32.user_id == row['id'], ~Halaqa.mosque_id.in_(values)))
                            if outside is None:
                                outside = db.scalar(select(Halaqa.mosque_id).where(Halaqa.supervisor_id == row['id'], ~Halaqa.mosque_id.in_(values)))
                            if row['role'] == 'owner' or outside:
                                changes[(child.name, key(child, row), column.name)] = (outside, dict(row))
                            else:
                                grew |= collect(child, child.c.id == row['id'])
                        continue
                    if preserve:
                        replacement = None if column.nullable else actor.id
                        for row in db.execute(select(child).where(condition)).mappings():
                            changes[(child.name, key(child, row), column.name)] = (replacement, dict(row))
                    else:
                        grew |= collect(child, condition)
        if not grew:
            break
    # Polymorphic approval requests have no database FK.
    targets = {'student': 'halaqa_students', 'ring': 'halaqat', 'user': 'users', 'teacher': 'users', 'supervisor': 'users', 'guardian': 'users'}
    for target_type, name in targets.items():
        ids = [k[0] for k in removed[name]]
        if ids:
            collect(HalaqaChangeRequest.__table__, (HalaqaChangeRequest.target_type == target_type) & HalaqaChangeRequest.target_id.in_(ids))
    changes = {k: v for k, v in changes.items() if k[1] not in removed[k[0]]}
    snapshot = {'delete': {n: sorted(rows.values(), key=lambda r: str(r)) for n, rows in removed.items() if rows},
                'update': sorted([(n, list(pk), c, val, row) for (n, pk, c), (val, row) in changes.items()], key=str),
                'target': [kind, entity_id]}
    token = hashlib.sha256(json.dumps(snapshot, sort_keys=True, default=str).encode()).hexdigest()
    return obj, removed, changes, token


@router.get('/targets')
def targets(request: Request, db=Depends(get_db)):
    owner(request, db)
    result = []
    for kind, model in [('mosque', Mosque), ('ring', Halaqa), ('student', HalaqaStudent)]:
        result.extend({'kind': kind, 'id': x.id, 'name': getattr(x, 'name', None) or x.full_name} for x in db.scalars(select(model)))
    for u in db.scalars(select(User).where(User.role != 'owner')):
        result.append({'kind': 'account', 'id': u.id, 'name': u.full_name})
        kind = {'halaqa_supervisor': 'supervisor', 'halaqa_teacher': 'teacher'}.get(u.role)
        if u.role == 'halaqa_student' and u.account_type == 'guardian':
            kind = 'guardian'
        if kind:
            result.append({'kind': kind, 'id': u.id, 'name': u.full_name})
    return {'targets': result}


@router.get('/{kind}/{entity_id}/preview')
def preview(kind: Kind, entity_id: int, request: Request, db=Depends(get_db)):
    actor = owner(request, db)
    obj, removed, changes, token = plan(db, kind, entity_id, actor)
    return {'name': getattr(obj, 'name', None) or obj.full_name, 'token': token,
            'counts': {n: len(rows) for n, rows in removed.items() if rows},
            'updated_links': len(changes),
            'warning': 'حذف نهائي لا يمكن التراجع عنه. حذف المجمع يشمل حلقاته وطلابها وحساباته غير المشتركة. حذف الحلقة يشمل ملفات طلابها وسجلاتهم. حذف المشرف أو المعلم أو ولي الأمر يبقي الطلاب والحلقات ويفك ارتباط الحساب. تُحفظ السجلات التاريخية غير التابعة للعنصر المحذوف، وتوثّق العملية في سجل التعديلات.'}


class Confirm(Input):
    confirm_name: str
    confirm_word: Literal['حذف']
    token: str = Field(min_length=64, max_length=64)


@router.delete('/{kind}/{entity_id}')
def execute(kind: Kind, entity_id: int, data: Confirm, request: Request, db=Depends(get_db)):
    actor = owner(request, db)
    # Serialize against concurrent inserts/edits, including worker writes, before rechecking preview.
    if db.bind.dialect.name == 'postgresql':
        names = ', '.join(db.bind.dialect.identifier_preparer.quote(t.name) for t in Base.metadata.sorted_tables)
        db.execute(text('LOCK TABLE ' + names + ' IN SHARE ROW EXCLUSIVE MODE'))
    elif db.bind.dialect.name == 'sqlite':
        db.execute(text('BEGIN IMMEDIATE'))
    obj, removed, changes, token = plan(db, kind, entity_id, actor)
    name = getattr(obj, 'name', None) or obj.full_name
    if data.confirm_name != name:
        raise HTTPException(422, 'اكتب الاسم كاملًا لتأكيد الحذف')
    if data.token != token:
        raise HTTPException(409, 'تغيرت البيانات؛ افتح معاينة جديدة قبل الحذف')
    provenance = []
    for (table_name, pk, column), (value, row) in changes.items():
        table = Base.metadata.tables[table_name]
        provenance.append({'table': table_name, 'key': pk, 'column': column, 'previous': row[column], 'new': value})
        db.execute(update(table).where(matches(table, [pk])).values({column: value}))
    # Break self references before deleting exams in a single transaction.
    exams = removed.get('organized_exams', {})
    if exams:
        table = Base.metadata.tables['organized_exams']
        db.execute(update(table).where(matches(table, exams)).values(next_exam_id=None))
    for table in reversed(Base.metadata.sorted_tables):
        if removed[table.name]:
            db.execute(delete(table).where(matches(table, removed[table.name])))
    counts = {n: len(rows) for n, rows in removed.items() if rows}
    audit(db, actor.id, None, 'permanent_delete_v31', json.dumps({'kind': kind, 'id': entity_id, 'name': name, 'counts': counts, 'preserved_record_links': provenance}, ensure_ascii=False))
    db.commit()
    return {'ok': True, 'counts': counts}
