from collections.abc import Generator
import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


DEFAULT_DATABASE_URL = "sqlite:///./teammate.db"

load_dotenv()


def get_database_url() -> URL:
    """Return the configured database URL with safe PostgreSQL defaults."""
    database_url = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL).strip() or DEFAULT_DATABASE_URL
    if database_url.startswith("postgres://"):
        database_url = "postgresql://" + database_url.removeprefix("postgres://")
    parsed_url = make_url(database_url)

    if parsed_url.get_backend_name() == "postgresql":
        if parsed_url.get_driver_name() in (None, "psycopg2"):
            parsed_url = parsed_url.set(drivername="postgresql+psycopg")
        if "sslmode" not in parsed_url.query:
            parsed_url = parsed_url.update_query_dict({"sslmode": "require"})

    return parsed_url


DATABASE_URL = get_database_url()

if DATABASE_URL.get_backend_name() == "sqlite":
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_size=5,
        max_overflow=10,
        pool_timeout=30,
    )

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
