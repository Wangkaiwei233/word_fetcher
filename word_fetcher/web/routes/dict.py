from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from word_fetcher.work.nlp import add_to_custom_dict, reload_resources
from word_fetcher.work.storage import custom_dict_path

router = APIRouter(prefix="/dict")


@router.get("")
def download_dict():
    path = custom_dict_path()
    if not path.exists():
        raise HTTPException(status_code=404, detail="dictionary not found")
    return FileResponse(str(path), media_type="text/plain", filename="custom_dict.txt")


@router.post("")
async def upload_dict(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="missing filename")
    path = custom_dict_path()
    content = await file.read()
    path.write_bytes(content)
    reload_resources()
    return {"message": "dictionary updated", "size": len(content)}


@router.post("/add")
def add_word(word: str | None = Query(default=None), word_form: str | None = Form(default=None)):
    # Support both query param and form field for robustness
    w = (word or word_form or "").strip()
    if not w:
        raise HTTPException(status_code=400, detail="empty word")
    added = add_to_custom_dict(w)
    return {"added": added}


