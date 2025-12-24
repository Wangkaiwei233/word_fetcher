from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from word_fetcher.work.jobs import (
    add_mark,
    get_job_status,
    list_job_nouns,
    list_marks,
    list_noun_occurrences,
    toggle_mark,
)

router = APIRouter(prefix="/jobs")


@router.get("/{job_id}/status")
def status(job_id: str):
    st = get_job_status(job_id)
    if st is None:
        raise HTTPException(status_code=404, detail="job not found")
    return st


@router.get("/{job_id}/nouns")
def nouns(
    job_id: str,
    query: str | None = Query(default=None),
    sort: str = Query(default="count_desc"),
):
    try:
        return list_job_nouns(job_id=job_id, query=query, sort=sort)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="job not found")


@router.get("/{job_id}/nouns/{noun}/occurrences")
def occurrences(job_id: str, noun: str):
    try:
        return list_noun_occurrences(job_id=job_id, noun=noun)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="job not found")


@router.get("/{job_id}/marks")
def marks(job_id: str):
    try:
        return list_marks(job_id=job_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="job not found")


@router.post("/{job_id}/marks")
def create_mark(job_id: str, noun: str, page: int, line: int, sentence: str):
    try:
        return add_mark(job_id=job_id, noun=noun, page=page, line=line, sentence=sentence)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="job not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{job_id}/marks/toggle")
def toggle_mark_api(job_id: str, noun: str, page: int, line: int, sentence: str):
    try:
        return toggle_mark(job_id=job_id, noun=noun, page=page, line=line, sentence=sentence)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="job not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


