"""Input validation and coordinator demonstration presets."""

from fastapi import APIRouter

from app.models.scheduling import ConfigurationCheck, SchedulingConfig
from app.services.presets import build_dfis_preset

router = APIRouter(tags=["Configuration"])


@router.get("/presets/dfis", response_model=SchedulingConfig)
def dfis_preset() -> SchedulingConfig:
    """Load the DFIS example with fictional faculty and room data."""
    return build_dfis_preset()


@router.get("/presets/dfis-impossible", response_model=SchedulingConfig)
def impossible_dfis_preset() -> SchedulingConfig:
    """Load three theory periods assigned to a faculty member available for two."""
    return build_dfis_preset(impossible=True)


@router.post("/config/validate", response_model=ConfigurationCheck)
def validate_configuration(config: SchedulingConfig) -> ConfigurationCheck:
    """Validate input structure and references, without running the scheduler."""
    theory_periods = 0
    practical_sessions = 0
    practical_periods = 0
    for item in config.teaching_requirements:
        if item.kind == "theory":
            theory_periods += item.periods_per_week
        else:
            sessions = item.sessions_per_week * len(item.batch_ids)
            practical_sessions += sessions
            practical_periods += sessions * item.duration_periods
    return ConfigurationCheck(
        required_theory_periods=theory_periods,
        required_practical_sessions=practical_sessions,
        required_practical_periods=practical_periods,
    )
