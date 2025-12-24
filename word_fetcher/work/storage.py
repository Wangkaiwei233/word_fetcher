from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any


def base_data_dir() -> Path:
    root = Path(__file__).resolve().parent.parent.parent
    d = root / "data"
    d.mkdir(parents=True, exist_ok=True)
    return d


def jobs_dir() -> Path:
    d = base_data_dir() / "jobs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def job_dir(job_id: str) -> Path:
    d = jobs_dir() / job_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def job_marks_path(job_id: str) -> Path:
    return job_dir(job_id) / "marks.json"


def write_json(path: Path, obj: Any) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def utc_ms() -> int:
    return int(time.time() * 1000)


# dictionary storage
def dicts_dir() -> Path:
    d = base_data_dir() / "dicts"
    d.mkdir(parents=True, exist_ok=True)
    return d


def custom_dict_path() -> Path:
    return dicts_dir() / "custom_dict.txt"


def stopwords_path() -> Path:
    return dicts_dir() / "stopwords.txt"


