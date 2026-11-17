from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from contextvars import ContextVar
from app.core.config import settings, ROOT

url = settings.database_url
if url.startswith("postgres://"):
    url = "postgresql+psycopg://" + url[len("postgres://"):]
elif url.startswith("postgresql://"):
    url = "postgresql+psycopg://" + url[len("postgresql://"):]
kwargs = {"pool_pre_ping": True}
if url.startswith("sqlite"):
    (ROOT / "data").mkdir(exist_ok=True)
    kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
else:
    kwargs.update(pool_size=5, max_overflow=5)
    if url.startswith("postgresql"):
        kwargs["connect_args"] = {"connect_timeout": 10}
engine = create_engine(url, **kwargs)
if url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def sqlite_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

PrimarySession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
# A request-local binding keeps the owner's practice workspace away from live data.
practice_session36 = ContextVar('practice_session36', default=None)
def SessionLocal(**kwargs):
    return (practice_session36.get() or PrimarySession)(**kwargs)
class Base(DeclarativeBase):
    pass

def get_db():
    with SessionLocal() as db:
        yield db

