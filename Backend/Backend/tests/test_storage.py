"""Draft persistence and publication must use the current validated snapshot."""

import asyncio
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from app.core.config import Settings
from app.core.errors import ApiProblem
from app.main import create_app
from app.models.saved import DraftCreate, DraftUpdate
from app.models.timetable import GenerateRequest
from app.services import storage
from app.services.presets import build_dfis_preset
from app.services.scheduler import generate_timetable
from tests.test_configuration_api import request


class StorageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = TemporaryDirectory()
        settings = Settings(database_path=Path(self.temp.name) / "test.sqlite3")
        self.settings_patch = patch("app.services.storage.get_settings", return_value=settings)
        self.settings_patch.start()
        self.config = build_dfis_preset()
        self.sessions = generate_timetable(GenerateRequest(config=self.config)).sessions

    def tearDown(self) -> None:
        self.settings_patch.stop()
        self.temp.cleanup()

    def save(self):
        return storage.save_draft(DraftCreate(name="Week 1", config=self.config, sessions=self.sessions))

    def test_draft_survives_new_connections(self) -> None:
        saved = self.save()
        loaded = storage.get_timetable(saved.id)
        self.assertEqual(loaded, saved)
        self.assertEqual(storage.list_timetables(), [saved])
        self.assertEqual(saved.status, "draft")
        self.assertTrue(saved.validation.valid)

    def test_complete_valid_timetable_can_be_published(self) -> None:
        saved = self.save()
        published = storage.publish_timetable(saved.id)
        self.assertEqual(published.status, "published")
        self.assertTrue(published.validation.valid)
        self.assertEqual(storage.get_timetable(saved.id).status, "published")

    def test_incomplete_draft_is_saved_but_cannot_be_published(self) -> None:
        saved = storage.save_draft(DraftCreate(name="Incomplete", config=self.config, sessions=self.sessions[:-1]))
        self.assertFalse(saved.validation.valid)
        with self.assertRaises(ApiProblem) as context:
            storage.publish_timetable(saved.id)
        self.assertEqual(context.exception.code, "VALIDATION_FAILED")
        self.assertEqual(storage.get_timetable(saved.id).status, "draft")

    def test_editing_a_published_record_returns_it_to_draft(self) -> None:
        saved = self.save()
        storage.publish_timetable(saved.id)
        updated = storage.update_timetable(saved.id, DraftUpdate(sessions=self.sessions[:-1]))
        self.assertEqual(updated.status, "draft")
        self.assertFalse(updated.validation.valid)
        self.assertEqual(updated.created_at, saved.created_at)
        with self.assertRaises(ApiProblem):
            storage.publish_timetable(saved.id)

    def test_updating_only_name_preserves_config_and_sessions(self) -> None:
        saved = self.save()
        updated = storage.update_timetable(saved.id, DraftUpdate(name="Week 2"))
        self.assertEqual(updated.name, "Week 2")
        self.assertEqual(updated.config, saved.config)
        self.assertEqual(updated.sessions, saved.sessions)

    def test_rename_does_not_publish_without_validation(self) -> None:
        saved = self.save()
        broken_config = self.config.model_copy(deep=True)
        broken_config.rooms[0].capacity = 1
        updated = storage.update_timetable(saved.id, DraftUpdate(config=broken_config))
        self.assertFalse(updated.validation.valid)
        with self.assertRaises(ApiProblem):
            storage.publish_timetable(saved.id)

    def test_missing_record_has_structured_error(self) -> None:
        with self.assertRaises(ApiProblem) as context:
            storage.get_timetable("missing")
        self.assertEqual(context.exception.status_code, 404)

    def test_break_labels_survive_save_and_reopen(self) -> None:
        self.config.university.breaks[0].id = "lunch"
        self.config.university.breaks[0].label = "Lunch break"
        saved = self.save()
        self.assertEqual(storage.get_timetable(saved.id).config.university.breaks[0].label, "Lunch break")

    def test_api_draft_publish_and_revision_workflow(self) -> None:
        app = create_app()
        payload = {"name": "API Week", "config": self.config.model_dump(mode="json"), "sessions": [item.model_dump(mode="json") for item in self.sessions]}
        status, saved = asyncio.run(request(app, "POST", "/api/timetables", payload))
        self.assertEqual(status, 201)
        identifier = saved["id"]
        status, published = asyncio.run(request(app, "POST", f"/api/timetables/{identifier}/publish"))
        self.assertEqual(status, 200)
        self.assertEqual(published["status"], "published")
        status, updated = asyncio.run(request(app, "PUT", f"/api/timetables/{identifier}", {"sessions": []}))
        self.assertEqual(status, 200)
        self.assertEqual(updated["status"], "draft")
        status, failed = asyncio.run(request(app, "POST", f"/api/timetables/{identifier}/publish"))
        self.assertEqual(status, 422)
        self.assertEqual(failed["error"]["code"], "VALIDATION_FAILED")
        self.assertTrue(failed["error"]["details"])

    def test_api_rejects_empty_and_null_updates(self) -> None:
        app = create_app()
        saved = self.save()
        for payload in [{}, {"name": None}, {"config": None}]:
            with self.subTest(payload=payload):
                status, error = asyncio.run(request(app, "PUT", f"/api/timetables/{saved.id}", payload))
                self.assertEqual(status, 422)
                self.assertEqual(error["error"]["code"], "VALIDATION_ERROR")


if __name__ == "__main__":
    unittest.main()
