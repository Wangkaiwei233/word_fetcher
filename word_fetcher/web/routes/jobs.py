from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from word_fetcher.work.jobs import get_job_status, list_job_nouns, list_noun_occurrences

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


