from __future__ import annotations

import os
import threading
import time
import uuid
from collections import deque
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from .solver_v2 import SubwaySolver
except ImportError:
    from solver_v2 import SubwaySolver


BASE_DIR = Path(__file__).resolve().parent
FILES = [BASE_DIR / "setting" / "station.lp", BASE_DIR / "setting" / "zone.lp", BASE_DIR / "subway_rules.lp"]

app = FastAPI(title="Nagoya Subway Pass Route API", version="0.2.0")
configured_origins = os.getenv("ALLOWED_ORIGINS")
allowed_origins = [
    origin.strip()
    for origin in (configured_origins or "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if origin.strip()
]
allowed_origin_regex = os.getenv("ALLOWED_ORIGIN_REGEX")
if configured_origins is None and allowed_origin_regex is None:
    allowed_origin_regex = r"^https?://(localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?::\d+)?$"
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allowed_origin_regex,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)

solver = SubwaySolver(FILES)
jobs: dict[str, dict[str, Any]] = {}
jobs_lock = threading.Lock()
request_times: dict[str, deque[float]] = {}
MAX_CONCURRENT_JOBS = max(1, int(os.getenv("MAX_CONCURRENT_JOBS", "2")))
RATE_LIMIT_REQUESTS = max(1, int(os.getenv("RATE_LIMIT_REQUESTS", "10")))
RATE_LIMIT_WINDOW_SECONDS = max(1, int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60")))
JOB_TTL_SECONDS = max(60, int(os.getenv("JOB_TTL_SECONDS", "900")))
MAX_STATIONS_PER_ROLE = len(solver.station_map)
MAX_STATION_ID_LENGTH = 64
solver_slots = threading.BoundedSemaphore(MAX_CONCURRENT_JOBS)
valid_station_ids = solver.station_names


class SolveRequest(BaseModel):
    endpoints: list[str] = Field(default_factory=list, max_length=2)
    via_hard: list[str] = Field(default_factory=list, max_length=MAX_STATIONS_PER_ROLE)
    via_soft: list[str] = Field(default_factory=list, max_length=MAX_STATIONS_PER_ROLE)
    avoid: list[str] = Field(default_factory=list, max_length=MAX_STATIONS_PER_ROLE)
    budget: int = Field(default=5, ge=1, le=5)
    min_budget: int = Field(default=1, ge=1, le=5)
    max_results: int = Field(default=50, ge=1, le=50)


def client_identifier(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def cleanup_state_locked(now: float) -> None:
    expired_jobs = [
        job_id
        for job_id, job in jobs.items()
        if job["status"] != "running" and now - job.get("finished_at", now) >= JOB_TTL_SECONDS
    ]
    for job_id in expired_jobs:
        del jobs[job_id]

    for client_id, timestamps in list(request_times.items()):
        while timestamps and now - timestamps[0] >= RATE_LIMIT_WINDOW_SECONDS:
            timestamps.popleft()
        if not timestamps:
            del request_times[client_id]


def reserve_request(client_id: str) -> None:
    now = time.monotonic()
    with jobs_lock:
        cleanup_state_locked(now)
        timestamps = request_times.setdefault(client_id, deque())
        while timestamps and now - timestamps[0] >= RATE_LIMIT_WINDOW_SECONDS:
            timestamps.popleft()
        if len(timestamps) >= RATE_LIMIT_REQUESTS:
            retry_after = max(1, int(RATE_LIMIT_WINDOW_SECONDS - (now - timestamps[0])))
            raise HTTPException(
                status_code=429,
                detail="検索の実行回数が上限に達しました．しばらく待ってから再試行してください",
                headers={"Retry-After": str(retry_after)},
            )
        timestamps.append(now)


def acquire_solver_slot() -> None:
    if not solver_slots.acquire(blocking=False):
        raise HTTPException(
            status_code=429,
            detail="検索が混み合っています．完了を待ってから再試行してください",
            headers={"Retry-After": "3"},
        )


@app.post("/solve")
def solve_route(payload: SolveRequest, request: Request):
    validate_request(payload)
    reserve_request(client_identifier(request))
    acquire_solver_slot()

    try:
        return solver.solve(
            endpoints=payload.endpoints,
            via_hard=payload.via_hard,
            via_soft=payload.via_soft,
            avoid=payload.avoid,
            budget=payload.budget,
            min_budget=payload.min_budget,
            max_results=payload.max_results,
            timeout_seconds=float(os.getenv("SOLVER_TIMEOUT_SECONDS", "6")),
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail="経路検索エンジンでエラーが発生しました") from error
    finally:
        solver_slots.release()


def validate_request(request: SolveRequest) -> None:
    station_ids = request.endpoints + request.via_hard + request.via_soft + request.avoid
    if any(len(station_id) > MAX_STATION_ID_LENGTH for station_id in station_ids):
        raise HTTPException(status_code=422, detail="駅IDが長すぎます")
    unknown_stations = set(station_ids) - valid_station_ids
    if unknown_stations:
        raise HTTPException(status_code=422, detail="不正な駅が含まれています")
    positive_stations = set(request.endpoints + request.via_hard + request.via_soft)
    if len(positive_stations) < 2:
        raise HTTPException(status_code=422, detail="異なる指定駅を2駅以上選んでください")
    if request.min_budget > request.budget:
        raise HTTPException(status_code=422, detail="予算下限は上限を超えることができません")


def run_search_job(job_id: str, request: SolveRequest, stop_event: threading.Event) -> None:
    def update(response: dict[str, Any]) -> None:
        with jobs_lock:
            job = jobs.get(job_id)
            if job is not None:
                job["response"] = response

    try:
        response = solver.solve(
            endpoints=request.endpoints,
            via_hard=request.via_hard,
            via_soft=request.via_soft,
            avoid=request.avoid,
            budget=request.budget,
            min_budget=request.min_budget,
            max_results=request.max_results,
            timeout_seconds=None,
            progress_callback=update,
            should_stop=stop_event.is_set,
            return_all_results=True,
        )
        all_results = response.pop("_all_results")
        with jobs_lock:
            job = jobs.get(job_id)
            if job is not None:
                job["response"] = response
                job["all_results"] = all_results
                job["status"] = "stopped" if response["search"]["stopped"] else "complete"
                job["finished_at"] = time.monotonic()
    except (ValueError, RuntimeError) as error:
        with jobs_lock:
            job = jobs.get(job_id)
            if job is not None:
                job["status"] = "error"
                job["error"] = str(error)
                job["finished_at"] = time.monotonic()
    except Exception:
        with jobs_lock:
            job = jobs.get(job_id)
            if job is not None:
                job["status"] = "error"
                job["error"] = "経路検索エンジンでエラーが発生しました"
                job["finished_at"] = time.monotonic()
    finally:
        solver_slots.release()


@app.post("/solve/jobs", status_code=202)
def create_search_job(payload: SolveRequest, request: Request):
    validate_request(payload)
    reserve_request(client_identifier(request))
    acquire_solver_slot()
    job_id = uuid.uuid4().hex
    stop_event = threading.Event()
    try:
        with jobs_lock:
            jobs[job_id] = {
                "status": "running",
                "response": {
                    "results": [],
                    "search": {
                        "complete": False,
                        "timed_out": False,
                        "stopped": False,
                        "has_more": False,
                        "returned_count": 0,
                        "candidate_count": 0,
                        "models_seen": 0,
                        "discovered_count": 0,
                        "elapsed_seconds": 0,
                    },
                },
                "error": None,
                "all_results": [],
                "stop_event": stop_event,
                "created_at": time.monotonic(),
            }
        threading.Thread(target=run_search_job, args=(job_id, payload, stop_event), daemon=True).start()
    except Exception:
        with jobs_lock:
            jobs.pop(job_id, None)
        solver_slots.release()
        raise
    return {"job_id": job_id}


@app.get("/solve/jobs/{job_id}")
def get_search_job(job_id: str):
    with jobs_lock:
        cleanup_state_locked(time.monotonic())
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="検索ジョブが見つかりません")
        return {
            "status": job["status"],
            "response": job["response"],
            "error": job["error"],
        }


@app.get("/solve/jobs/{job_id}/results")
def get_search_job_results(
    job_id: str,
    sort_key: str = "recommended",
    min_satisfied: int = 0,
    min_zone: int = 1,
    max_zone: int = 5,
    min_stations: int = 0,
    max_stations: int = 999,
    station_ids: str = "",
    limit: int = 20,
):
    if sort_key not in {"recommended", "satisfaction", "zone", "stations"}:
        raise HTTPException(status_code=422, detail="並び順が不正です")

    with jobs_lock:
        cleanup_state_locked(time.monotonic())
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="検索ジョブが見つかりません")
        if job["status"] == "running":
            raise HTTPException(status_code=409, detail="検索が完了していません")
        all_results = list(job["all_results"])
        search = dict(job["response"]["search"])

    if not 1 <= limit <= 200:
        raise HTTPException(status_code=422, detail="表示件数が不正です")
    if min_zone > max_zone or min_stations > max_stations:
        raise HTTPException(status_code=422, detail="絞り込みの下限は上限を超えることができません")

    station_filter = {station for station in station_ids.split(",") if station}
    filtered = [
        route for route in all_results
        if len(route["satisfied"]) >= min_satisfied
        and route["zone"] >= min_zone
        and route["zone"] <= max_zone
        and route["stations_count"] >= min_stations
        and route["stations_count"] <= max_stations
        and station_filter.issubset(route["route_names"])
    ]

    if sort_key == "satisfaction":
        key = lambda route: (-len(route["satisfied"]), route["zone"], -route["stations_count"])
    elif sort_key == "zone":
        key = lambda route: (route["zone"], -len(route["satisfied"]), -route["stations_count"])
    elif sort_key == "stations":
        key = lambda route: (-route["stations_count"], -len(route["satisfied"]), route["zone"])
    else:
        key = lambda route: (-len(route["satisfied"]), route["zone"], -route["stations_count"])

    filtered.sort(key=key)
    results = filtered[:limit]
    search.update({
        "returned_count": len(results),
        "candidate_count": len(filtered),
        "has_more": len(filtered) > len(results) or search["stopped"] or search["timed_out"],
    })
    return {"results": results, "search": search}


@app.delete("/solve/jobs/{job_id}")
def stop_search_job(job_id: str):
    with jobs_lock:
        cleanup_state_locked(time.monotonic())
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="検索ジョブが見つかりません")
        job["stop_event"].set()
    return {"status": "stopping"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"message": "Nagoya Subway Pass Route API"}
