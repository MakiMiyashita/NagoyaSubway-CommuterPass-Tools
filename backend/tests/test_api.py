import time
import unittest
from collections import deque
from unittest.mock import patch

from fastapi import HTTPException

from backend.app import (
    SolveRequest,
    cleanup_state_locked,
    jobs,
    jobs_lock,
    request_times,
    reserve_request,
    validate_request,
)


class ApiValidationTest(unittest.TestCase):
    def test_known_stations_are_accepted(self):
        validate_request(SolveRequest(endpoints=["Takabata", "Hatta"]))

    def test_unknown_station_is_rejected(self):
        with self.assertRaises(HTTPException) as raised:
            validate_request(SolveRequest(endpoints=["Takabata", "NotAStation"]))

        self.assertEqual(raised.exception.status_code, 422)


class ApiStateTest(unittest.TestCase):
    def setUp(self):
        with jobs_lock:
            jobs.clear()
            request_times.clear()

    def tearDown(self):
        with jobs_lock:
            jobs.clear()
            request_times.clear()

    def test_cleanup_removes_only_expired_finished_jobs(self):
        now = time.monotonic()
        with jobs_lock:
            jobs["expired"] = {"status": "complete", "finished_at": now - 100}
            jobs["recent"] = {"status": "complete", "finished_at": now - 5}
            jobs["running"] = {"status": "running", "created_at": now - 100}

            with patch("backend.app.JOB_TTL_SECONDS", 30):
                cleanup_state_locked(now)

            self.assertNotIn("expired", jobs)
            self.assertIn("recent", jobs)
            self.assertIn("running", jobs)

    def test_rate_limit_rejects_request_over_limit(self):
        with patch("backend.app.RATE_LIMIT_REQUESTS", 2):
            reserve_request("test-client")
            reserve_request("test-client")

            with self.assertRaises(HTTPException) as raised:
                reserve_request("test-client")

        self.assertEqual(raised.exception.status_code, 429)
        self.assertIn("Retry-After", raised.exception.headers)

    def test_cleanup_removes_expired_rate_limit_entries(self):
        now = time.monotonic()
        with jobs_lock:
            request_times["expired-client"] = deque([now - 100])

            with patch("backend.app.RATE_LIMIT_WINDOW_SECONDS", 30):
                cleanup_state_locked(now)

            self.assertNotIn("expired-client", request_times)


if __name__ == "__main__":
    unittest.main()
