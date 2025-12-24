from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, TypedDict


JobState = Literal["queued", "running", "done", "error"]


class JobStatus(TypedDict):
    state: JobState
    progress: int
    message: str


@dataclass(frozen=True)
class Job:
    job_id: str
    filename: str
    input_path: str


