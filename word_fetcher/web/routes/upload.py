from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile

from word_fetcher.work.jobs import create_job, run_job

router = APIRouter()


@router.post("/upload")
async def upload(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="missing filename")

    job = await create_job(file)
    background_tasks.add_task(run_job, job.job_id)
    return {"job_id": job.job_id}


