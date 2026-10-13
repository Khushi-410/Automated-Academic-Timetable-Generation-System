"""SQLite persistence; validate the stored snapshot before publishing."""

from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
from uuid import uuid4

from app.core.config import get_settings
from app.core.errors import ApiProblem
from app.models.saved import DraftCreate, DraftUpdate, SavedTimetable
from app.models.timetable import Diagnostic, ValidationResult
from app.services.validation import validate_schedule


@contextmanager
def connection():
    database = Path(get_settings().database_path)
    database.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(database, timeout=30)
    try:
        with db:
            db.execute("CREATE TABLE IF NOT EXISTS timetables (id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL)")
            db.commit()
            yield db
    finally:
        db.close()


def read_record(db, identifier: str) -> SavedTimetable:
    row = db.execute("SELECT document FROM timetables WHERE id = ?", (identifier,)).fetchone()
    if row is None:
        raise ApiProblem(404, "TIMETABLE_NOT_FOUND", "That saved timetable does not exist.")
    return SavedTimetable.model_validate_json(row[0])


def persist(db, record: SavedTimetable) -> None:
    db.execute(
        "INSERT INTO timetables (id, document, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET document = excluded.document, updated_at = excluded.updated_at",
        (record.id, record.model_dump_json(), record.updated_at.isoformat()),
    )


def check_record(config, sessions) -> ValidationResult:
    result = validate_schedule(config, sessions)
    if not config.teaching_requirements or not sessions:
        result.valid = False
        result.conflicts.append(Diagnostic(code="EMPTY_TIMETABLE", message="At least one teaching requirement and a complete set of scheduled sessions are required for publication."))
    return result


def save_draft(request: DraftCreate) -> SavedTimetable:
    now = datetime.now(timezone.utc)
    record = SavedTimetable(
        id="timetable-" + uuid4().hex, name=request.name, status="draft",
        config=request.config, sessions=request.sessions,
        validation=check_record(request.config, request.sessions),
        created_at=now, updated_at=now,
    )
    with connection() as db:
        persist(db, record)
    return record


def list_timetables() -> list[SavedTimetable]:
    with connection() as db:
        return [SavedTimetable.model_validate_json(row[0]) for row in db.execute("SELECT document FROM timetables ORDER BY updated_at DESC, id")]


def get_timetable(identifier: str) -> SavedTimetable:
    with connection() as db:
        return read_record(db, identifier)


def update_timetable(identifier: str, request: DraftUpdate) -> SavedTimetable:
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        record = read_record(db, identifier)
        for name in request.model_fields_set:
            setattr(record, name, getattr(request, name))
        record.status = "draft"
        record.validation = check_record(record.config, record.sessions)
        record.updated_at = datetime.now(timezone.utc)
        persist(db, record)
    return record


def publish_timetable(identifier: str) -> SavedTimetable:
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        record = read_record(db, identifier)
        validation = check_record(record.config, record.sessions)
        if not validation.valid:
            raise ApiProblem(422, "VALIDATION_FAILED", "Publication is blocked until every scheduling conflict is resolved.", [item.model_dump(mode="json") for item in validation.conflicts])
        record.validation = validation
        record.status = "published"
        record.updated_at = datetime.now(timezone.utc)
        persist(db, record)
    return record
