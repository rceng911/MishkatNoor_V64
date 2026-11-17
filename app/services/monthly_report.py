from app.services.attendance64 import ATTENDED
import io
from pathlib import Path
import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from app.services.attendance64 import ATTENDANCE_LABELS51

FONT = Path(__file__).resolve().parents[2] / 'web' / 'static' / 'fonts' / 'DejaVuSans.ttf'
pdfmetrics.registerFont(TTFont('Arabic', str(FONT)))


def monthly_pdf(student, rows, exams, month, evaluations52=None, summary52=None):
    out=io.BytesIO(); c=canvas.Canvas(out,pagesize=(595,842))
    c.setTitle('Monthly student report')
    y=790; page=1
    def new_page():
        nonlocal y,page
        c.setFont('Arabic',9);c.drawString(40,30,str(page));c.showPage();page+=1;y=790
    def line(value,size=11):
        nonlocal y
        # Wrap logical Arabic before shaping to preserve connected letters.
        words=str(value or '').split(); current=''; lines=[]
        for word in words:
            test=(current+' '+word).strip()
            if pdfmetrics.stringWidth(get_display(arabic_reshaper.reshape(test)),'Arabic',size)>505:
                if current: lines.append(current)
                current=word
            else: current=test
        if current: lines.append(current)
        for text in lines or ['']:
            if y<65: new_page()
            c.setFillColorRGB(.05,.25,.18);c.setFont('Arabic',size)
            c.drawRightString(550,y,get_display(arabic_reshaper.reshape(text)));y-=22
    line('حلقات مشكاة ونور',20)
    line('التقرير الشهري: '+month,15);line('الطالب: '+student.full_name,14)
    line('أيام الحضور: '+str(sum(p.attendance in ATTENDED for p in rows))+' | الغياب: '+str(sum(p.attendance=='absent' for p in rows)))
    line('غائب بعذر: '+str(sum(p.attendance=='excused' for p in rows))+' | مستأذن: '+str(sum(p.attendance=='permission' for p in rows)))
    if summary52 and summary52['evaluations_complete']:
        line('متوسط التقييم اليومي المعتمد: '+str(summary52['average'])+' من 10 | الأيام المعتمدة: '+str(summary52['evaluations_complete']),12)
    for unit,label in [('page','وجه'),('ayah','آية')]:
        line('الحفظ: '+str(sum(p.memorized_amount for p in rows if p.memorized_unit==unit))+' '+label+' | المراجعة: '+str(sum(p.revision_amount for p in rows if p.revision_unit==unit))+' '+label)
    if not rows: line('لا توجد سجلات حضور أو تسميع لهذا الشهر.')
    labels=ATTENDANCE_LABELS51
    for p in rows:
        line(str(p.day)+' | '+labels[p.attendance],12)
        line('الحفظ: '+(p.memorized or '—')+' | المراجعة: '+(p.revision or '—'))
        line('درجة الحفظ: '+str(p.memorization_score if p.memorization_score is not None else '—')+' | التجويد: '+str(p.tajweed_score if p.tajweed_score is not None else '—'))
        evaluation=(evaluations52 or {}).get(p.id,{})
        if evaluation.get('state')=='complete':
            line('التقييم اليومي المعتمد: '+str(evaluation['total'])+' من 10',12)
            for item in evaluation.get('criteria',[]):
                line(item['label']+' '+str(item['earned'])+' / '+str(item['weight']))

            line('التلاوة: '+str(evaluation['recitation_score'])+'/10 | الترتيل: '+str(evaluation['tarteel_score'])+'/10 | الالتزام بالخطة: '+str(evaluation['plan_commitment_score'])+'/10')
        if p.notes: line('ملاحظات الشيخ: '+p.notes)
    line('الاختبارات',14)
    for e in exams: line(str(e.day)+' | '+e.title+' | '+str(e.score)+' / '+str(e.total));line(e.notes)
    if not exams: line('لا توجد اختبارات مسجلة لهذا الشهر.')
    c.setFont('Arabic',9);c.drawString(40,30,str(page));c.save()
    return out.getvalue()
