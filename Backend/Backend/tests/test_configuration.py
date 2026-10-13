"""Coordinator input mistakes must be caught before solver execution."""

import unittest

from pydantic import ValidationError

from app.api.routes.configuration import validate_configuration
from app.models.scheduling import SchedulingConfig
from app.services.presets import build_dfis_preset


class ConfigurationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.payload = build_dfis_preset().model_dump(mode="json")

    def assert_invalid(self, expected_message: str) -> None:
        with self.assertRaisesRegex(ValidationError, expected_message):
            SchedulingConfig.model_validate(self.payload)

    def test_dfis_weekly_totals(self) -> None:
        counts = validate_configuration(build_dfis_preset())
        self.assertEqual(counts.required_theory_periods, 3)
        self.assertEqual(counts.required_practical_sessions, 2)
        self.assertEqual(counts.required_practical_periods, 4)

    def test_camel_case_json_round_trip(self) -> None:
        self.assertIn("studentGroups", self.payload)
        self.assertNotIn("student_groups", self.payload)
        parsed = SchedulingConfig.model_validate_json(build_dfis_preset().model_dump_json())
        self.assertEqual(parsed, build_dfis_preset())

    def test_impossible_configuration_is_structurally_valid(self) -> None:
        config = build_dfis_preset(impossible=True)
        self.assertTrue(validate_configuration(config).valid)
        self.assertEqual(config.faculty[0].availability[0].start_time, "09:00")
        self.assertEqual(config.faculty[0].availability[0].end_time, "11:00")
        self.assertEqual(config.teaching_requirements[0].periods_per_week, 3)

    def test_presets_do_not_share_mutable_data(self) -> None:
        first = build_dfis_preset()
        first.rooms[0].capacity = 1
        first.faculty[0].availability.clear()
        second = build_dfis_preset()
        self.assertEqual(second.rooms[0].capacity, 40)
        self.assertEqual(len(second.faculty[0].availability), 5)

    def test_unknown_faculty_is_rejected(self) -> None:
        self.payload["teachingRequirements"][0]["facultyId"] = "missing"
        self.assert_invalid("unknown facultyId")

    def test_duplicate_resource_id_is_rejected(self) -> None:
        self.payload["rooms"][1]["id"] = self.payload["rooms"][0]["id"]
        self.assert_invalid("Duplicate IDs in rooms")

    def test_batch_population_cannot_exceed_class(self) -> None:
        self.payload["batches"][1]["strength"] = 21
        self.assert_invalid("Batch strengths exceed")

    def test_practical_cannot_use_another_groups_batch(self) -> None:
        self.payload["studentGroups"].append({
            "id": "other-group", "programme": "Other Programme", "semester": 1,
            "section": "A", "strength": 40,
        })
        self.payload["batches"][0]["studentGroupId"] = "other-group"
        self.assert_invalid("outside its student group")

    def test_practical_requires_a_weekly_count(self) -> None:
        self.payload["teachingRequirements"][1]["sessionsPerWeek"] = None
        self.assert_invalid("Practical requires")

    def test_theory_cannot_target_a_batch(self) -> None:
        self.payload["teachingRequirements"][0]["batchIds"] = ["dfis-batch-a"]
        self.assert_invalid("whole-class")

    def test_malformed_clock_time_is_rejected(self) -> None:
        self.payload["university"]["startTime"] = "9:00"
        self.assert_invalid("String should match pattern")

    def test_reversed_time_range_is_rejected(self) -> None:
        self.payload["university"]["startTime"] = "17:00"
        self.assert_invalid("earlier than endTime")

    def test_overlapping_breaks_are_rejected(self) -> None:
        self.payload["university"]["breaks"].append({"startTime": "12:30", "endTime": "13:30"})
        self.assert_invalid("Breaks must not overlap")

    def test_numeric_strings_and_booleans_are_not_counts(self) -> None:
        for value in ["40", True, 0, -1]:
            with self.subTest(value=value):
                self.payload["studentGroups"][0]["strength"] = value
                with self.assertRaises(ValidationError):
                    SchedulingConfig.model_validate(self.payload)

    def test_fixed_occurrence_must_exist(self) -> None:
        self.payload["fixedCommitments"] = [{
            "id": "fixed-1", "teachingRequirementId": "req-dfis103-theory",
            "occurrenceIndex": 3, "day": "monday", "startTime": "09:00", "roomId": "room-101",
        }]
        self.assert_invalid("out-of-range occurrenceIndex")

    def test_valid_fixed_practical_commitment(self) -> None:
        self.payload["fixedCommitments"] = [{
            "id": "fixed-1", "teachingRequirementId": "req-dfis103-practical",
            "batchId": "dfis-batch-a", "occurrenceIndex": 0,
            "day": "monday", "startTime": "09:00", "roomId": "lab-dfis",
        }]
        self.assertEqual(len(SchedulingConfig.model_validate(self.payload).fixed_commitments), 1)

    def test_duplicate_fixed_occurrence_is_rejected(self) -> None:
        first = {
            "id": "fixed-1", "teachingRequirementId": "req-dfis103-theory",
            "occurrenceIndex": 0, "day": "monday", "startTime": "09:00", "roomId": "room-101",
        }
        self.payload["fixedCommitments"] = [first, {**first, "id": "fixed-2", "day": "tuesday"}]
        self.assert_invalid("multiple fixed commitments")


if __name__ == "__main__":
    unittest.main()
