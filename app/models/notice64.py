from datetime import datetime
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped,mapped_column
from app.db.session import Base

class InboxNotice(Base):
    __tablename__='inbox_notices53'
    id:Mapped[int]=mapped_column(primary_key=True)
    user_id:Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    student_id:Mapped[int]=mapped_column(ForeignKey('halaqa_students.id',ondelete='CASCADE'))
    category:Mapped[str]
    added:Mapped[datetime]=mapped_column(default=datetime.utcnow)
    seen:Mapped[bool]=mapped_column(default=False)
