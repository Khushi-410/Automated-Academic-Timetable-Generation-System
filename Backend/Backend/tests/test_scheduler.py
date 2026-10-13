"""Behavioural checks for mandatory rules, regeneration, and failure reporting."""

import asyncio
import unittest
from unittest.mock import patch

from ortools.sat.python import cp_model
from pydantic import ValidationError

from app.core.config import Settings
from app.main import create_app
from app.models.scheduling import SchedulingConfig
from app.models.timetable import GenerateRequest
from app.services.calendar import minutes
from app.services.presets import build_dfis_preset
from app.services.scheduler import generate_timetable
from app.services.validation import validate_schedule
from tests.test_configuration_api import request


class SchedulerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = build_dfis_preset()
        self.payload = self.config.model_dump(mode="json")

    def solve_payload(self, locked=None):
        self.config = SchedulingConfig.model_validate(self.payload)
        return generate_timetable(GenerateRequest(config=self.config, locked_sessions=locked or []))

    def test_complete_dfis_schedule_respects_resources_and_periods(self) -> None:
        result = self.solve_payload()
        self.assertEqual(result.status, "feasible")
        self.assertEqual(len(result.sessions), 5)
        self.assertEqual(result.metrics.scheduled_theory_periods, 3)
        self.assertEqual(result.metrics.scheduled_practical_sessions, 2)
        self.assertEqual(result.metrics.scheduled_practical_periods, 4)
        self.assertEqual(result.unassigned_requirements, [])
        self.assertTrue(validate_schedule(self.config, result.sessions).valid)
        for session in result.sessions:
            self.assertEqual(minutes(session.end_time) - minutes(session.start_time), session.duration_periods * 60)
            self.assertTrue(session.end_time <= "12:00" or session.start_time >= "13:00")
            for other in result.sessions:
                if session.id == other.id or session.day != other.day:
                    continue
                intersect = session.start_time < other.end_time and other.start_time < session.end_time
                if session.faculty_id == other.faculty_id or session.room_id == other.room_id:
                    self.assertFalse(intersect)
                if session.batch_id is None or other.batch_id is None or session.batch_id == other.batch_id:
                    self.assertFalse(intersect)

    def test_impossible_preset_explains_three_required_two_available(self) -> None:
        result = generate_timetable(GenerateRequest(config=build_dfis_preset(impossible=True)))
        self.assertEqual(result.status, "infeasible")
        self.assertEqual(result.sessions, [])
        self.assertEqual(result.diagnostics[0].code, "FACULTY_CAPACITY_SHORTFALL")
        self.assertIn("3 weekly", result.diagnostics[0].message)
        self.assertIn("at most 2", result.diagnostics[0].message)
        self.assertTrue(result.unassigned_requirements)

    def test_undersized_classroom_is_rejected(self) -> None:
        self.payload["rooms"][0]["capacity"] = 39
        result = self.solve_payload()
        self.assertEqual(result.status, "infeasible")
        self.assertEqual(result.diagnostics[0].code, "NO_LEGAL_PLACEMENT")

    def test_wrong_laboratory_type_is_rejected(self) -> None:
        self.payload["rooms"][1]["labType"] = "chemistry"
        self.assertEqual(self.solve_payload().status, "infeasible")

    def test_practical_cannot_bridge_a_lunch_break(self) -> None:
        self.payload["teachingRequirements"][1]["batchIds"] = ["dfis-batch-a"]
        self.payload["faculty"][1]["availability"] = [{"day": "monday", "startTime": "11:00", "endTime": "14:00"}]
        result = self.solve_payload()
        self.assertEqual(result.status, "infeasible")
        self.assertEqual(result.diagnostics[0].code, "NO_LEGAL_PLACEMENT")

    def test_adjacent_availability_windows_cover_a_practical(self) -> None:
        self.payload["teachingRequirements"][1]["batchIds"] = ["dfis-batch-a"]
        self.payload["faculty"][1]["availability"] = [
            {"day": "monday", "startTime": "09:00", "endTime": "10:00"},
            {"day": "monday", "startTime": "10:00", "endTime": "11:00"},
        ]
        self.assertEqual(self.solve_payload().status, "feasible")

    def test_unavailable_slots_are_subtracted(self) -> None:
        self.payload["faculty"][0]["unavailableSlots"] = self.payload["faculty"][0]["availability"]
        self.assertEqual(self.solve_payload().status, "infeasible")

    def test_fixed_whole_class_cannot_overlap_its_batch_practical(self) -> None:
        self.payload["fixedCommitments"] = [
            {"id": "fixed-theory", "teachingRequirementId": "req-dfis103-theory", "occurrenceIndex": 0, "day": "monday", "startTime": "09:00", "roomId": "room-101"},
            {"id": "fixed-practical", "teachingRequirementId": "req-dfis103-practical", "batchId": "dfis-batch-a", "occurrenceIndex": 0, "day": "monday", "startTime": "09:00", "roomId": "lab-dfis"},
        ]
        result = self.solve_payload()
        self.assertEqual(result.status, "infeasible")
        self.assertEqual(result.diagnostics[0].code, "CONSTRAINT_CONFLICT")
        self.assertTrue(result.diagnostics[0].related_entity_ids)

    def parallel_batches(self) -> None:
        self.payload["university"].update(workingDays=["monday"], endTime="11:00", breaks=[])
        original = self.payload["teachingRequirements"][1]
        self.payload["teachingRequirements"] = [
            {**original, "batchIds": ["dfis-batch-a"]},
            {**original, "id": "req-other-practical", "facultyId": "faculty-other", "batchIds": ["dfis-batch-b"]},
        ]
        self.payload["faculty"].append({**self.payload["faculty"][1], "id": "faculty-other"})
        self.payload["rooms"].append({**self.payload["rooms"][1], "id": "lab-other"})
        self.payload["studentGroups"][0]["maxDailyPeriods"] = 2

    def test_disjoint_batches_can_run_in_parallel_with_separate_resources(self) -> None:
        self.parallel_batches()
        result = self.solve_payload()
        self.assertEqual(result.status, "feasible")
        self.assertEqual({item.start_time for item in result.sessions}, {"09:00"})
        self.assertEqual(len({item.room_id for item in result.sessions}), 2)
        self.assertTrue(validate_schedule(self.config, result.sessions).valid)

    def test_parallel_batches_cannot_share_one_room(self) -> None:
        self.parallel_batches()
        self.payload["rooms"].pop()
        self.assertEqual(self.solve_payload().status, "infeasible")

    def test_daily_faculty_limit_applies_to_all_practical_periods(self) -> None:
        self.payload["faculty"][1]["maxDailyPeriods"] = 1
        self.assertEqual(self.solve_payload().status, "infeasible")

    def test_student_daily_limit_applies_per_student_track(self) -> None:
        self.payload["studentGroups"][0]["maxDailyPeriods"] = 1
        self.assertEqual(self.solve_payload().status, "infeasible")

    def test_preferences_are_optimized_when_feasible(self) -> None:
        self.payload["teachingRequirements"][0]["preferredSlots"] = [{"day": "tuesday", "startTime": "13:00", "endTime": "16:00"}]
        result = self.solve_payload()
        self.assertEqual(result.status, "feasible")
        self.assertEqual(result.metrics.preferences_total, 3)
        self.assertEqual(result.metrics.preferences_satisfied, 3)
        self.assertTrue(all(item.day == "tuesday" for item in result.sessions if item.kind == "theory"))

    def test_impossible_preference_does_not_make_schedule_infeasible(self) -> None:
        self.payload["teachingRequirements"][0]["preferredSlots"] = [{"day": "sunday", "startTime": "09:00", "endTime": "10:00"}]
        result = self.solve_payload()
        self.assertEqual(result.status, "feasible")
        self.assertEqual(result.metrics.preferences_satisfied, 0)

    def test_regeneration_preserves_locked_assignment_and_session_ids(self) -> None:
        first = self.solve_payload()
        lock = first.sessions[0]
        second = self.solve_payload([lock])
        self.assertEqual(second.status, "feasible")
        self.assertEqual({item.id for item in first.sessions}, {item.id for item in second.sessions})
        same = next(item for item in second.sessions if item.id == lock.id)
        self.assertEqual((same.day, same.start_time, same.end_time, same.room_id), (lock.day, lock.start_time, lock.end_time, lock.room_id))
        self.assertTrue(same.locked)

    def test_fixed_assignment_is_preserved(self) -> None:
        self.payload["fixedCommitments"] = [{"id": "fixed-theory", "teachingRequirementId": "req-dfis103-theory", "occurrenceIndex": 0, "day": "tuesday", "startTime": "10:00", "roomId": "room-101"}]
        result = self.solve_payload()
        same = next(item for item in result.sessions if item.kind == "theory" and item.occurrence_index == 0)
        self.assertEqual((same.day, same.start_time, same.room_id), ("tuesday", "10:00", "room-101"))

    def test_malformed_locked_metadata_is_rejected(self) -> None:
        result = self.solve_payload()
        lock = result.sessions[0].model_dump(mode="json")
        lock["facultyId"] = "changed"
        with self.assertRaises(ValidationError):
            GenerateRequest.model_validate({"config": self.payload, "lockedSessions": [lock]})

    def test_manual_overlap_is_reported(self) -> None:
        result = self.solve_payload()
        sessions = [item.model_copy(deep=True) for item in result.sessions]
        theories = [item for item in sessions if item.kind == "theory"]
        theories[1].day, theories[1].start_time, theories[1].end_time, theories[1].room_id = (
            theories[0].day, theories[0].start_time, theories[0].end_time, theories[0].room_id,
        )
        result = validate_schedule(self.config, sessions)
        self.assertFalse(result.valid)
        self.assertTrue({"FACULTY_OVERLAP", "ROOM_OVERLAP", "STUDENT_OVERLAP"}.issubset({item.code for item in result.conflicts}))

    def test_incomplete_schedule_is_not_valid(self) -> None:
        result = self.solve_payload()
        validation = validate_schedule(self.config, result.sessions[:-1])
        self.assertFalse(validation.valid)
        self.assertIn("MISSING_SESSION", [item.code for item in validation.conflicts])

    def test_practical_with_incorrect_duration_is_not_valid(self) -> None:
        result = self.solve_payload()
        session = next(item for item in result.sessions if item.kind == "practical")
        session.end_time = session.start_time
        validation = validate_schedule(self.config, result.sessions)
        self.assertFalse(validation.valid)
        self.assertIn("INVALID_PLACEMENT", [item.code for item in validation.conflicts])

    def test_solver_timeout_is_unknown_not_infeasible(self) -> None:
        with patch("app.services.scheduler.cp_model.CpSolver") as factory:
            factory.return_value.solve.return_value = cp_model.UNKNOWN
            factory.return_value.wall_time = 0.01
            result = self.solve_payload()
        self.assertEqual(result.status, "unknown")
        self.assertEqual(result.sessions, [])
        self.assertEqual(result.metrics.scheduled_sessions, 0)

    def test_model_size_limit_does_not_claim_infeasibility(self) -> None:
        with patch("app.services.scheduler.get_settings", return_value=Settings(solver_max_candidates=1)):
            result = self.solve_payload()
        self.assertEqual(result.status, "unknown")
        self.assertEqual(result.diagnostics[0].code, "MODEL_SIZE_LIMIT")


class SchedulingApiTests(unittest.TestCase):
    def test_generate_and_validate_round_trip(self) -> None:
        app = create_app()
        config = build_dfis_preset().model_dump(mode="json")
        status, result = asyncio.run(request(app, "POST", "/api/generate", {"config": config, "lockedSessions": []}))
        self.assertEqual(status, 200)
        self.assertEqual(result["status"], "feasible")
        self.assertEqual(len(result["sessions"]), 5)
        status, validation = asyncio.run(request(app, "POST", "/api/validate", {"config": config, "sessions": result["sessions"]}))
        self.assertEqual(status, 200)
        self.assertEqual(validation, {"valid": True, "conflicts": []})

    def test_infeasible_is_a_structured_generation_result(self) -> None:
        app = create_app()
        config = build_dfis_preset(impossible=True).model_dump(mode="json")
        status, result = asyncio.run(request(app, "POST", "/api/generate", {"config": config}))
        self.assertEqual(status, 200)
        self.assertEqual(result["status"], "infeasible")
        self.assertEqual(result["sessions"], [])
        self.assertTrue(result["unassignedRequirements"])

    def test_invalid_request_uses_existing_error_contract(self) -> None:
        status, result = asyncio.run(request(create_app(), "POST", "/api/generate", {}))
        self.assertEqual(status, 422)
        self.assertEqual(result["error"]["code"], "VALIDATION_ERROR")


if __name__ == "__main__":
    unittest.main()
