"""FastAPI application assembly."""

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.api.routes.configuration import router as configuration_router
from app.api.routes.health import router as health_router
from app.api.routes.timetable import router as timetable_router
from app.api.routes.saved import router as saved_router
from app.core.config import get_settings
from app.core.errors import ApiProblem


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version="0.4.0",
        description="Automatic academic timetable scheduling API.",
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "OPTIONS"],
        allow_headers=["Content-Type", "Accept"],
    )

    @application.exception_handler(ApiProblem)
    async def application_error_handler(request: Request, exc: ApiProblem) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=jsonable_encoder({
            "error": {"code": exc.code, "message": exc.message, "details": exc.details}
        }))

    @application.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Keep errors compatible with the frontend's shared API contract.
        details = [
            {"location": list(error["loc"]), "message": error["msg"], "type": error["type"]}
            for error in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content=jsonable_encoder(
                {
                    "error": {
                        "code": "VALIDATION_ERROR",
                        "message": "Check the supplied input values.",
                        "details": details,
                    }
                }
            ),
        )

    @application.exception_handler(HTTPException)
    async def http_error_handler(request: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            headers=exc.headers,
            content=jsonable_encoder(
                {"error": {"code": f"HTTP_{exc.status_code}", "message": exc.detail}}
            ),
        )

    @application.get("/", tags=["Service"])
    def root() -> dict[str, str]:
        return {
            "name": settings.app_name,
            "version": application.version,
            "docs": "/docs",
            "health": "/api/health",
        }

    application.include_router(health_router, prefix="/api")
    application.include_router(configuration_router, prefix="/api")
    application.include_router(timetable_router, prefix="/api")
    application.include_router(saved_router, prefix="/api")
    return application


app = create_app()
