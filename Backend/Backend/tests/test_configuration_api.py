"""Exercise real ASGI requests without sockets or additional dependencies."""

import asyncio
import json
import unittest

from app.main import create_app


async def request(app, method: str, path: str, payload=None) -> tuple[int, dict]:
    messages = []
    received = False

    async def receive():
        nonlocal received
        if not received:
            received = True
            return {
                "type": "http.request",
                "body": json.dumps(payload).encode() if payload is not None else b"",
                "more_body": False,
            }
        await asyncio.Event().wait()

    async def send(message):
        messages.append(message)

    await app(
        {
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
            "method": method, "path": path, "raw_path": path.encode(),
            "query_string": b"", "root_path": "", "scheme": "http",
            "headers": [(b"content-type", b"application/json"), (b"host", b"testserver")],
            "client": ("127.0.0.1", 1234), "server": ("testserver", 80),
        }, receive, send,
    )
    status = next(message["status"] for message in messages if message["type"] == "http.response.start")
    body = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
    return status, json.loads(body)


class ConfigurationApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = create_app()

    def test_preset_can_be_submitted_for_configuration_validation(self) -> None:
        status, config = asyncio.run(request(self.app, "GET", "/api/presets/dfis"))
        self.assertEqual(status, 200)
        status, result = asyncio.run(request(self.app, "POST", "/api/config/validate", config))
        self.assertEqual(status, 200)
        self.assertEqual(result["requiredTheoryPeriods"], 3)
        self.assertEqual(result["requiredPracticalSessions"], 2)
        self.assertEqual(result["requiredPracticalPeriods"], 4)

    def test_invalid_reference_returns_frontend_error_contract(self) -> None:
        _, config = asyncio.run(request(self.app, "GET", "/api/presets/dfis"))
        config["teachingRequirements"][0]["facultyId"] = "missing"
        status, result = asyncio.run(request(self.app, "POST", "/api/config/validate", config))
        self.assertEqual(status, 422)
        self.assertEqual(result["error"]["code"], "VALIDATION_ERROR")
        self.assertIn("unknown facultyId", result["error"]["details"][0]["message"])

    def test_impossible_preset_does_not_claim_feasibility(self) -> None:
        status, config = asyncio.run(request(self.app, "GET", "/api/presets/dfis-impossible"))
        self.assertEqual(status, 200)
        status, result = asyncio.run(request(self.app, "POST", "/api/config/validate", config))
        self.assertEqual(status, 200)
        self.assertIn("feasibility has not been checked", result["message"])

    def test_openapi_exposes_configuration_schemas(self) -> None:
        status, schema = asyncio.run(request(self.app, "GET", "/openapi.json"))
        self.assertEqual(status, 200)
        self.assertIn("/api/config/validate", schema["paths"])
        self.assertIn("TeachingRequirement", schema["components"]["schemas"])


if __name__ == "__main__":
    unittest.main()
