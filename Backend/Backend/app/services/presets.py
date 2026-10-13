"""Fictional supporting data for the problem statement's DFIS example."""

from app.models.scheduling import SchedulingConfig


def build_dfis_preset(*, impossible: bool = False) -> SchedulingConfig:
    days = ["monday", "tuesday", "wednesday", "thursday", "friday"]
    availability = [
        {"day": day, "startTime": "09:00", "endTime": "16:00"}
        for day in days
    ]
    theory_availability = (
        [{"day": "monday", "startTime": "09:00", "endTime": "11:00"}]
        if impossible else availability
    )
    return SchedulingConfig.model_validate(
        {
            "university": {
                "workingDays": days,
                "startTime": "09:00",
                "endTime": "16:00",
                "periodDurationMinutes": 60,
                "breaks": [{"startTime": "12:00", "endTime": "13:00"}],
            },
            "rooms": [
                {"id": "room-101", "name": "Classroom 101", "type": "classroom", "capacity": 40, "availability": availability},
                {"id": "lab-dfis", "name": "Digital Forensics Lab", "type": "laboratory", "labType": "digital-forensics", "capacity": 20, "availability": availability},
            ],
            "faculty": [
                {"id": "faculty-theory", "name": "Dr. Asha Demo", "availability": theory_availability, "maxDailyPeriods": 4},
                {"id": "faculty-practical", "name": "Dr. Ravi Demo", "availability": availability, "maxDailyPeriods": 4},
            ],
            "studentGroups": [
                {"id": "dfis-sem1-a", "programme": "M.Sc. DFIS", "semester": 1, "section": "A", "strength": 40},
            ],
            "batches": [
                {"id": "dfis-batch-a", "name": "Batch A", "studentGroupId": "dfis-sem1-a", "strength": 20},
                {"id": "dfis-batch-b", "name": "Batch B", "studentGroupId": "dfis-sem1-a", "strength": 20},
            ],
            "teachingRequirements": [
                {"id": "req-dfis103-theory", "subjectCode": "DFIS103", "subjectName": "Digital Forensics Fundamentals", "studentGroupId": "dfis-sem1-a", "kind": "theory", "facultyId": "faculty-theory", "periodsPerWeek": 3},
                {"id": "req-dfis103-practical", "subjectCode": "DFIS103P", "subjectName": "Digital Forensics Practical", "studentGroupId": "dfis-sem1-a", "kind": "practical", "facultyId": "faculty-practical", "sessionsPerWeek": 1, "durationPeriods": 2, "batchIds": ["dfis-batch-a", "dfis-batch-b"], "requiredLabType": "digital-forensics"},
            ],
            "fixedCommitments": [],
        }
    )
