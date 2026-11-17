from itertools import accumulate
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import JSON, ForeignKey, select
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base
from app.models import HalaqaProgress
from app.models.scoring64 import DailyEvaluation52
from app.services.attendance64 import ATTENDED
from app.services.quran_catalog import AYAH_COUNTS, SURAH_NAMES, JUZ_STARTS

OFFSETS = [0, *accumulate(AYAH_COUNTS)]
def index(surah, ayah):
    return OFFSETS[surah-1] + ayah

JUZ_LIMITS = [index(s,a) for s,a in JUZ_STARTS] + [OFFSETS[-1]+1]
class Passage(BaseModel):
    model_config = ConfigDict(extra='forbid')
    surah:int=Field(ge=1,le=114)
    ayah:int=Field(ge=1)
    end_surah:int=Field(ge=1,le=114)
    end_ayah:int=Field(ge=1)

    @model_validator(mode='after')
    def ordered(self):
        if self.ayah>AYAH_COUNTS[self.surah-1] or self.end_ayah>AYAH_COUNTS[self.end_surah-1] or self.span()[0]>self.span()[1]:
            raise ValueError('تحقق من السورة وأرقام الآيات وترتيب بداية الورد ونهايته')
        return self

    def span(self):
        return index(self.surah,self.ayah),index(self.end_surah,self.end_ayah)
    def label(self):
        return f'{SURAH_NAMES[self.surah-1]} {self.ayah} – {SURAH_NAMES[self.end_surah-1]} {self.end_ayah}'

class Recitation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    saved:Passage|None=None
    review:Passage|None=None
    next_saved:Passage|None=None
    next_review:Passage|None=None
    manual:list[Annotated[int,Field(ge=1,le=30)]]=Field(default_factory=list,max_length=30)

class RecitationEntry(Base):
    __tablename__='recitation_entries64'
    progress_id:Mapped[int]=mapped_column(ForeignKey('halaqa_progress.id',ondelete='CASCADE'),primary_key=True)
    payload:Mapped[dict]=mapped_column(JSON)

def history64(db,sid,end):
    query=(select(HalaqaProgress.day,RecitationEntry.payload)
           .join(RecitationEntry,RecitationEntry.progress_id==HalaqaProgress.id)
           .join(DailyEvaluation52,DailyEvaluation52.progress_id==HalaqaProgress.id)
           .where(HalaqaProgress.student_id==sid,HalaqaProgress.day<=end,HalaqaProgress.attendance.in_(ATTENDED))
           .order_by(HalaqaProgress.day))
    return db.execute(query).all()

def milestone64(history):
    covered=set()
    manual=set()
    achieved=[]
    full=set()
    for day,payload in history:
        manual.update(payload.get('manual',[]))
        saved=payload.get('saved')
        if saved:
            begin,end=Passage(**saved).span()
            covered.update(range(begin,end+1))
        full.update(manual)
        if saved:
            full.update(j for j in range(1,31) if j not in full and begin<JUZ_LIMITS[j] and end>=JUZ_LIMITS[j-1] and all(v in covered for v in range(JUZ_LIMITS[j-1],JUZ_LIMITS[j])))
        while len(achieved)<len(full)//2:
            achieved.append({'count':(len(achieved)+1)*2,'day':str(day),'parts':sorted(full)})
    return achieved
