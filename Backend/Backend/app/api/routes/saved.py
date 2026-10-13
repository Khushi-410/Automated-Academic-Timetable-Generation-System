"""Save, reopen, revise, and publish timetables."""

from fastapi import APIRouter

from app.models.saved import DraftCreate, DraftUpdate, SavedTimetable
from app.services import storage

router = APIRouter(prefix="/timetables", tags=["Saved timetables"])


@router.post("", response_model=SavedTimetable, status_code=201)
def save_draft(request: DraftCreate) -> SavedTimetable:
    return storage.save_draft(request)


@router.get("", response_model=list[SavedTimetable])
def list_timetables() -> list[SavedTimetable]:
    return storage.list_timetables()


@router.get("/{identifier}", response_model=SavedTimetable)
def get_timetable(identifier: str) -> SavedTimetable:
    return storage.get_timetable(identifier)


@router.put("/{identifier}", response_model=SavedTimetable)
def update_timetable(identifier: str, request: DraftUpdate) -> SavedTimetable:
    return storage.update_timetable(identifier, request)


@router.post("/{identifier}/publish", response_model=SavedTimetable)
def publish_timetable(identifier: str) -> SavedTimetable:
    return storage.publish_timetable(identifier)
