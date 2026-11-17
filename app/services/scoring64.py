from app.services.attendance64 import ATTENDED
"""Server calculations and transparent calendar-based coverage for daily scores."""
import calendar
import json
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import inspect, select
from sqlalchemy.orm import object_session

from app.models import HalaqaProgress, RingCalendar, CalendarException, HalaqaStudent, AuditLog, HalaqaChangeRequest
from app.models.scoring64 import DailyEvaluation52, DailyScoringPolicy52, SCORE_FIELDS52, POINT_FIELDS52
from app.services.calendar import meeting_day, resolved_attendance

EVALUATION_FIELDS52 = SCORE_FIELDS52 + POINT_FIELDS52 + ('ring_id', 'formula_version', 'notes', 'evaluated_by', 'updated_at')
RUBRIC52 = {
    'maximum': 10,
    'score_maximum': 10,
    'weights': {'attendance': 2, 'behavior': 3, 'quality': 4, 'plan': 1},
    'behavior': 'السلوك واللبس والترتيب والهدوء: درجة موحدة من ٠ إلى ١٠',
    'quality': 'متوسط الحفظ والتجويد والتلاوة والترتيل من ٠ إلى ١٠ × ٠٫٤',
    'plan': 'الالتزام بالخطة من ٠ إلى ١٠ × ٠٫١',
    'formula_version': 'daily10-v52',
}


# The v52 columns retain their audited snapshots. V60 awards are derived from
# the raw teacher grades and that mosque's monthly rules, including on re-read.
from app.db.session import Base
from sqlalchemy import Column, ForeignKey, Integer, String, JSON
class MonthlyRules60(Base):
    __tablename__='monthly_rules_v60'
    mosque_id=Column(Integer,ForeignKey('mosques.id'),primary_key=True)
    month=Column(String(7),primary_key=True)
    items=Column(JSON,nullable=False)

DEFAULT60=[
    {'source':'attendance','label':'الحضور','weight':1},
    {'source':'wird','label':'الورد (الحفظ والمراجعة)','weight':4},
    {'source':'quality','label':'التجويد والتلاوة','weight':3},
    {'source':'behavior','label':'اللباس والهدوء والأسلوب','weight':2}]
SOURCES60={'attendance':'attendance_points','wird':'plan_points','quality':'quality_points','behavior':'behavior_points',
           'memorization_score':'plan_points','plan_commitment_score':'plan_points','tajweed_score':'quality_points',
           'recitation_score':'quality_points','tarteel_score':'quality_points'}

def rules60(db,mid,month):
    key=('rules60',mid,month)
    if key not in db.info:
        row=db.get(MonthlyRules60,(mid,month))
        db.info[key]=row.items if row else DEFAULT60
    return db.info[key]

def award60(items,values):
    from fractions import Fraction
    scores={'attendance':10}
    if values:
        scores.update({key:values[key] for key in SCORE_FIELDS52})
        scores.update(wird=values['memorization_score'],behavior=values['behavior_score'],
                      quality=Fraction(values['tajweed_score']+values['recitation_score'],2))
    points={key:0 for key in POINT_FIELDS52}
    details=[]
    for item in items:
        cents=int(Fraction(scores.get(item['source'],0))*item['weight']*10+Fraction(1,2))
        points[SOURCES60[item['source']]]+=cents
        points['total']+=cents
        details.append(dict(item,earned=cents/100))
    return {**{key:value/100 for key,value in points.items()},'criteria':details,'formula_version':'daily10-v60'}

def points52(values):
    d = lambda value: Decimal(str(value))
    q = lambda value: value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    result = {'attendance_points': d(2), 'behavior_points': q(d(values['behavior_score']) * d('.3')),
              'quality_points': q(sum(d(values[k]) for k in ('memorization_score', 'tajweed_score', 'recitation_score', 'tarteel_score')) * d('.1')),
              'plan_points': q(d(values['plan_commitment_score']) * d('.1'))}
    result['total'] = sum(result.values())
    return result


def evaluation_snapshot52(row, original=False):
    if row is None:
        return None
    db = object_session(row)
    if original and db is not None and row in db.new:
        return None
    if not original and (inspect(row).deleted or (db is not None and row in db.deleted)):
        return None
    values = {key: getattr(row, key) for key in EVALUATION_FIELDS52}
    if original:
        for key in EVALUATION_FIELDS52:
            old = inspect(row).attrs[key].history.deleted
            if old:
                values[key] = old[0]
    for key in POINT_FIELDS52:
        if values[key] is not None:
            values[key] = format(Decimal(str(values[key])), '.2f')
    if values['updated_at'] is not None:
        values['updated_at'] = values['updated_at'].isoformat()
    return values


def restore_evaluation52(db, progress, values):
    old = getattr(progress, 'daily_evaluation52', None)
    if values is None:
        if old is not None:
            progress.daily_evaluation52 = None
        return
    if progress.attendance not in ATTENDED:
        raise HTTPException(409, 'لا يمكن استعادة تقييم لسجل غير حاضر')
    if old is None:
        old = DailyEvaluation52(progress=progress)
        db.add(old)
    for key in EVALUATION_FIELDS52:
        value = values[key]
        if key in POINT_FIELDS52:
            value = Decimal(value)
        elif key == 'updated_at':
            value = datetime.fromisoformat(value)
        setattr(old, key, value)


def evaluation_pack52(db, progress, mid=None):
    if progress is None:
        return {'state': 'attendance_required', 'maximum': 10, 'total': None, 'attendance_points': None}
    attendance = resolved_attendance(db, progress.student_id, progress.day, progress.attendance)
    row = getattr(progress, 'daily_evaluation52', None)
    if attendance not in ATTENDED:
        return {'state': 'not_applicable', 'maximum': 10, 'total': None, 'attendance_points': 0}
    if progress.day >= date(2026,11,1):
        from app.models import Halaqa
        if mid is None:
            student=db.get(HalaqaStudent,progress.student_id)
            mid=db.get(Halaqa,row.ring_id if row else student.halaqa_id).mosque_id
        values=evaluation_snapshot52(row)
        earned=award60(rules60(db,mid,progress.day.strftime('%Y-%m')),values)
        return {'state':'complete' if values else 'pending','maximum':10,**(values or {}),**earned,
                'total':earned['total'] if values else None}
    if row is None or evaluation_snapshot52(row) is None:
        return {'state': 'pending', 'maximum': 10, 'total': None, 'attendance_points': 2}
    values = evaluation_snapshot52(row)
    return {'state': 'complete', 'maximum': 10, **values,
            **{key: float(getattr(row, key)) for key in POINT_FIELDS52}}


def evaluation_summary52(db, rows):
    """Report only finalized daily grades; pending and legacy rows stay explicit."""
    completed = []
    pending = 0
    for row in rows:
        value = evaluation_pack52(db, row)
        if value['state'] == 'complete':
            completed.append(value)
        elif value['state'] == 'pending':
            pending += 1
    return {'formula_version': (completed[-1]['formula_version'] if completed else 'daily10-v60'), 'evaluations_complete': len(completed),
            'evaluations_pending': pending, 'average': round(sum(row['total'] for row in completed) / len(completed), 2) if completed else None,
            'total': round(sum(row['total'] for row in completed), 2), 'maximum': len(completed) * 10,
            'average_components': {key: round(sum(row[key] for row in completed) / len(completed), 2) if completed else None
                for key in ('attendance_points', 'behavior_points', 'quality_points', 'plan_points')}}


def month_period52(month):
    try:
        start = date.fromisoformat(month + '-01')
        if len(month) != 7 or not 2020 <= start.year <= 2100:
            raise ValueError()
    except ValueError:
        raise HTTPException(422, 'اختر شهرًا صحيحًا')
    return start, start.replace(day=calendar.monthrange(start.year, start.month)[1])


def calendar_month52(db, ring_id, start, end, cache):
    key = (ring_id, start, end)
    if key not in cache:
        calendar_row = db.get(RingCalendar, ring_id)
        import json
        weekdays = json.loads(calendar_row.weekdays_json) if calendar_row else []
        exceptions = {row.day: row.held for row in db.scalars(select(CalendarException).where(
            CalendarException.halaqa_id == ring_id, CalendarException.day >= start, CalendarException.day <= end))}
        dates = [start + timedelta(days=i) for i in range(max(0, (end - start).days + 1))]
        cache[key] = ({day for day in dates if exceptions.get(day, day.weekday() in weekdays)},
                      calendar_row is not None or bool(exceptions))
    return cache[key]


def roster_days52(db, student, start, end, records, cache):
    """Resolve each day's roster from existing, audited archive and transfer ledgers.

    A change takes effect next day so archiving or transferring a student cannot
    remove an obligation already due that day. Historical scores retain their ring.
    """
    from app.services.history64 import TransferHistory35
    from app.models import Halaqa
    mosque_id = db.get(Halaqa, student.halaqa_id).mosque_id
    key = ('archive_history52', mosque_id)
    if key not in cache:
        changes = {}
        for row in db.scalars(select(AuditLog).where(AuditLog.mosque_id == mosque_id,
                AuditLog.action == 'student_archive_changed').order_by(AuditLog.id)):
            try:
                values = json.loads(row.details)
                before, after = values['before']['active'], values['after']['active']
                if isinstance(before, bool) and isinstance(after, bool) and before != after:
                    changes.setdefault(int(values['entity']), []).append((row.created_at, before, after))
            except (ValueError, KeyError, TypeError):
                continue
        for row in db.scalars(select(HalaqaChangeRequest).where(HalaqaChangeRequest.mosque_id == mosque_id,
                HalaqaChangeRequest.action_type == 'student_archive', HalaqaChangeRequest.status == 'approved')):
            try:
                before, after = json.loads(row.before_json)['active'], json.loads(row.after_json)['active']
                if row.reviewed_at and isinstance(before, bool) and isinstance(after, bool) and before != after:
                    changes.setdefault(row.target_id, []).append((row.reviewed_at, before, after))
            except (ValueError, KeyError, TypeError):
                continue
        cache[key] = changes
    active_changes = sorted(cache[key].get(student.id, []), key=lambda row: row[0])
    transfers = list(db.scalars(select(TransferHistory35).where(TransferHistory35.student_id == student.id)
                               .order_by(TransferHistory35.created_at, TransferHistory35.id)))
    effective_day = lambda timestamp: timestamp.replace(tzinfo=ZoneInfo('UTC')).astimezone(ZoneInfo('Asia/Riyadh')).date() + timedelta(days=1)
    active = active_changes[0][1] if active_changes else student.active
    original_ring = transfers[0].source_id if transfers else student.halaqa_id
    known = bool(active_changes) or bool(student.active)
    # Legacy imports can be inactive with no archive event. Do not invent future
    # obligations; retain every recorded historical day and expose uncertainty.
    last_recorded = max((row.day for row in records), default=None)
    result = {}
    for offset in range(max(0, (end - start).days + 1)):
        day = start + timedelta(days=offset)
        day_active = active
        for timestamp, _, after in active_changes:
            if effective_day(timestamp) <= day:
                day_active = after
        if not known:
            day_active = last_recorded is not None and day <= last_recorded
        day_ring = original_ring
        for transfer in transfers:
            if effective_day(transfer.created_at) <= day:
                day_ring = transfer.target_id
        if day_active:
            result[day] = day_ring
    return result, known


def student_month52(db, student, month, current_day, include_rows=True, ring_id=None, calendar_cache=None, bounds=None):
    start, end = bounds or month_period52(month)
    end = min(end, current_day)
    # No presumed attendance before admission or on a date without a defined meeting.
    admission = student.created_at.replace(tzinfo=ZoneInfo('UTC')).astimezone(ZoneInfo('Asia/Riyadh')).date() if student.created_at else start
    from app.models import Halaqa
    mosque_id = db.get(Halaqa, student.halaqa_id).mosque_id
    policy = db.get(DailyScoringPolicy52, mosque_id)
    activated_on = policy.activated_on if policy else current_day + timedelta(days=1)
    start_due = max(start, admission, activated_on)
    cache = calendar_cache if calendar_cache is not None else {}
    records = list(db.scalars(select(HalaqaProgress).where(HalaqaProgress.student_id == student.id,
                   HalaqaProgress.day >= start, HalaqaProgress.day <= end).order_by(HalaqaProgress.day))) if start <= end else []
    by_day = {row.day: row for row in records}
    roster, roster_known = roster_days52(db, student, start, end, records, cache)
    for row in records:
        if row.daily_evaluation52:
            roster[row.day] = row.daily_evaluation52.ring_id
    relevant_rings = {rid for day, rid in roster.items() if day >= start_due and (ring_id is None or rid == ring_id)}
    if not relevant_rings:
        relevant_rings = {ring_id or student.halaqa_id}
    calendars = {rid: calendar_month52(db, rid, start, end, cache) for rid in relevant_rings}
    calendar_known = all(defined for _, defined in calendars.values())
    due_set = {day for day, rid in roster.items() if day >= start_due and rid in calendars and day in calendars[rid][0]}
    # Excused absence is neutral. Early departure counts as attendance.
    neutral = {day for day, row in by_day.items() if resolved_attendance(db, student.id, day, row.attendance) == 'excused'}
    neutral_due = len(due_set & neutral)
    due_set -= neutral
    completed = recorded = present = 0
    total = Decimal(0)
    rows = []
    visible_days = due_set | set(by_day)
    if ring_id is not None:
        visible_days = {day for day in visible_days if roster.get(day, student.halaqa_id) == ring_id}
    for day in sorted(visible_days):
        progress = by_day.get(day)
        pack = evaluation_pack52(db, progress, mosque_id)
        attendance = resolved_attendance(db, student.id, day, progress.attendance) if progress else None
        earned = Decimal(str(pack['total'])) if pack['state'] == 'complete' else Decimal(str(pack["attendance_points"])) if attendance in ATTENDED else Decimal(0)
        # Off-calendar entries remain visible but do not inflate competition scores.
        eligible = day in due_set
        if eligible:
            total += earned
            recorded += progress is not None
            present += attendance in ATTENDED
            completed += pack['state'] == 'complete'
        if include_rows:
            rows.append({'ring_id':roster.get(day,student.halaqa_id),'day': str(day), 'progress_id': progress.id if progress else None,
                         'attendance': attendance, 'eligible': eligible, 'earned': float(earned), 'evaluation': pack})
    maximum = len(due_set) * 10
    return {'student_id': student.id, 'month': month, 'activated_on': str(policy.activated_on) if policy else None,
            'total': float(total), 'maximum': maximum,
            'percentage': round(float(total) * 100 / maximum, 2) if maximum else None,
            'coverage': {'calendar_defined': calendar_known, 'roster_defined': roster_known, 'due_sessions': len(due_set), 'neutral_sessions': neutral_due, 'attendance_recorded': recorded,
                         'attendance_missing': len(due_set) - recorded, 'present': present, 'evaluations_complete': completed,
                         'evaluations_pending': present - completed,
                         'complete': policy is not None and calendar_known and roster_known and recorded == len(due_set) and completed == present},
            **({'rows': rows} if include_rows else {})}


def ring_month52(db, ring, month, current_day, cache=None):
    from app.services.history64 import TransferHistory35
    start, end = month_period52(month)
    scored_sids = select(HalaqaProgress.student_id).join(DailyEvaluation52, DailyEvaluation52.progress_id == HalaqaProgress.id).where(
        DailyEvaluation52.ring_id == ring.id, HalaqaProgress.day >= start, HalaqaProgress.day <= min(end, current_day))
    transferred_sids = select(TransferHistory35.student_id).where(
        ((TransferHistory35.source_id == ring.id) | (TransferHistory35.target_id == ring.id)),
        TransferHistory35.created_at >= datetime.combine(start, datetime.min.time()) - timedelta(days=1))
    # Include missing attendance, archived files, and historical transferred
    # rosters, while the day-level ledger decides each student's obligations.
    students = list(db.scalars(select(HalaqaStudent).where(
        (HalaqaStudent.halaqa_id == ring.id) | HalaqaStudent.id.in_(scored_sids) | HalaqaStudent.id.in_(transferred_sids))))
    cache = cache if cache is not None else {}
    summaries = [student_month52(db, student, month, current_day, False, ring.id, cache) for student in students]
    total = round(sum(row['total'] for row in summaries), 2)
    maximum = sum(row['maximum'] for row in summaries)
    counters = ('due_sessions', 'neutral_sessions', 'attendance_recorded', 'attendance_missing', 'present', 'evaluations_complete', 'evaluations_pending')
    coverage = {key: sum(row['coverage'][key] for row in summaries) for key in counters}
    coverage['calendar_defined'] = all(row['coverage']['calendar_defined'] for row in summaries)
    coverage['roster_defined'] = all(row['coverage']['roster_defined'] for row in summaries)
    coverage['complete'] = bool(summaries) and all(row['coverage']['complete'] for row in summaries)
    return {'id': ring.id, 'name': ring.name, 'student_count': len(students), 'total': total, 'automatic': total,
            'maximum': maximum, 'percentage': round(total * 100 / maximum, 2) if maximum else None,
            'attendance_count': coverage['present'], 'completion_count': coverage['evaluations_complete'], 'coverage': coverage}
