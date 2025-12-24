from __future__ import annotations

import os
import re
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import fitz  # PyMuPDF
from word_fetcher.work.models import Job, JobStatus
from word_fetcher.work.nlp import get_dict_words, is_maybe_wrong_word, iter_nouns, reload_resources
from word_fetcher.work.storage import job_dir, job_marks_path, read_json, write_json


_SENT_SPLIT_RE = re.compile(r"(?<=[。！？；…])")


def _status_path(job_id: str) -> Path:
    return job_dir(job_id) / "status.json"


def _result_path(job_id: str) -> Path:
    return job_dir(job_id) / "result.json"


def _input_path(job_id: str, filename: str) -> Path:
    safe = filename.replace("/", "_").replace("\\", "_")
    return job_dir(job_id) / safe


def _set_status(job_id: str, state: str, progress: int, message: str) -> None:
    write_json(_status_path(job_id), {"state": state, "progress": progress, "message": message})


def get_job_status(job_id: str) -> Optional[JobStatus]:
    p = _status_path(job_id)
    if not p.exists():
        return None
    return read_json(p)


async def create_job(upload) -> Job:
    job_id = uuid.uuid4().hex
    input_path = _input_path(job_id, upload.filename)
    with input_path.open("wb") as f:
        shutil.copyfileobj(upload.file, f)

    _set_status(job_id, "queued", 0, "queued")
    return Job(job_id=job_id, filename=upload.filename, input_path=str(input_path))


def _soffice_path() -> str:
    """
    Resolve soffice binary path.
    Priority: SOFFICE_PATH env -> PATH lookup -> common macOS path.
    Raise FileNotFoundError with clear guidance when missing.
    """
    env_path = os.getenv("SOFFICE_PATH")
    if env_path:
        p = Path(env_path)
        if p.exists():
            return str(p)
    candidates = [
        "soffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    ]
    for cand in candidates:
        resolved = shutil.which(cand) if not Path(cand).is_absolute() else (cand if Path(cand).exists() else None)
        if resolved:
            return str(resolved)
    raise FileNotFoundError("LibreOffice 未安装或未找到 soffice，可设置 SOFFICE_PATH 指向 soffice 可执行文件")


def _convert_docx_to_pdf(docx_path: Path, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        _soffice_path(),
        "--headless",
        "--nologo",
        "--nolockcheck",
        "--nodefault",
        "--nofirststartwizard",
        "--convert-to",
        "pdf",
        "--outdir",
        str(out_dir),
        str(docx_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            "docx->pdf failed. Ensure LibreOffice is installed and `soffice` is available. "
            f"stderr={proc.stderr.strip()}"
        )
    pdf_path = out_dir / (docx_path.stem + ".pdf")
    if not pdf_path.exists():
        raise RuntimeError("docx->pdf failed: output pdf not found")
    return pdf_path


def _extract_pdf_lines(pdf_path: Path) -> List[Dict[str, Any]]:
    doc = fitz.open(str(pdf_path))
    out: List[Dict[str, Any]] = []
    for page_idx in range(doc.page_count):
        page = doc.load_page(page_idx)
        text = page.get_text("text") or ""
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        for i, ln in enumerate(lines, start=1):
            out.append({"page": page_idx + 1, "line": i, "text": ln})
    return out


def _sentences_from_line(line_text: str) -> List[str]:
    parts = [p.strip() for p in _SENT_SPLIT_RE.split(line_text) if p and p.strip()]
    # If no punctuation-based split happened, keep the whole line.
    return parts if parts else [line_text.strip()]


def _build_index(lines: List[Dict[str, Any]]) -> Dict[str, Any]:
    noun_counts: Dict[str, int] = {}
    occurrences_by_noun: Dict[str, List[Dict[str, Any]]] = {}

    for row in lines:
        page = int(row["page"])
        line = int(row["line"])
        text = str(row["text"])

        for sent in _sentences_from_line(text):
            for noun, _flag in iter_nouns(sent):
                noun_counts[noun] = noun_counts.get(noun, 0) + 1
                occ = {"page": page, "line": line, "sentence": sent}
                occurrences_by_noun.setdefault(noun, []).append(occ)

    nouns = [{"noun": n, "count": c} for n, c in noun_counts.items()]
    nouns.sort(key=lambda x: (-x["count"], x["noun"]))
    return {"nouns": nouns, "occurrences_by_noun": occurrences_by_noun}


def run_job(job_id: str) -> None:
    job_path = job_dir(job_id)
    input_files = list(job_path.glob("*"))
    if not input_files:
        _set_status(job_id, "error", 0, "input file missing")
        return

    # pick the non-json file
    input_path = None
    for p in input_files:
        if p.name in ("status.json", "result.json"):
            continue
        if p.suffix.lower() in (".pdf", ".docx"):
            input_path = p
            break
    if input_path is None:
        _set_status(job_id, "error", 0, "unsupported file type (only .pdf/.docx)")
        return

    try:
        _set_status(job_id, "running", 5, "preparing")

        if input_path.suffix.lower() == ".docx":
            _set_status(job_id, "running", 15, "converting docx to pdf")
            pdf_path = _convert_docx_to_pdf(input_path, job_path / "converted")
        else:
            pdf_path = input_path

        _set_status(job_id, "running", 35, "extracting text")
        lines = _extract_pdf_lines(pdf_path)

        _set_status(job_id, "running", 55, "loading dictionaries")
        reload_resources()

        _set_status(job_id, "running", 70, "extracting nouns")
        result = _build_index(lines)

        _set_status(job_id, "running", 90, "saving result")
        write_json(_result_path(job_id), result)

        _set_status(job_id, "done", 100, "done")
    except Exception as e:
        _set_status(job_id, "error", 100, f"error: {e}")


def _load_result(job_id: str) -> Dict[str, Any]:
    p = _result_path(job_id)
    if not p.exists():
        raise FileNotFoundError(p)
    return read_json(p)


# --------- marks ----------
def _load_marks(job_id: str) -> List[Dict[str, Any]]:
    path = job_marks_path(job_id)
    if not path.exists():
        return []
    return read_json(path)


def list_marks(job_id: str) -> List[Dict[str, Any]]:
    return _load_marks(job_id)


def _mark_key(noun: str, page: int, line: int, sentence: str) -> str:
    return f"{page}:{line}:{noun}:{sentence}"


def add_mark(job_id: str, noun: str, page: int, line: int, sentence: str) -> Dict[str, Any]:
    noun = str(noun).strip()
    if not noun:
        raise ValueError("noun required")
    key = _mark_key(noun, int(page), int(line), str(sentence))
    entry = {
        "noun": noun,
        "page": int(page),
        "line": int(line),
        "sentence": str(sentence),
        "id": key,
    }
    marks = _load_marks(job_id)
    # avoid duplicates
    if any(m.get("id") == key for m in marks):
        return entry
    marks.append(entry)
    write_json(job_marks_path(job_id), marks)
    return entry


def toggle_mark(job_id: str, noun: str, page: int, line: int, sentence: str) -> Dict[str, Any]:
    noun = str(noun).strip()
    if not noun:
        raise ValueError("noun required")
    key = _mark_key(noun, int(page), int(line), str(sentence))
    marks = _load_marks(job_id)
    remaining = [m for m in marks if m.get("id") != key]
    if len(remaining) != len(marks):
        # existed -> remove
        write_json(job_marks_path(job_id), remaining)
        return {"removed": True, "added": False, "id": key}
    # not exist -> add
    entry = {
        "noun": noun,
        "page": int(page),
        "line": int(line),
        "sentence": str(sentence),
        "id": key,
    }
    remaining.append(entry)
    write_json(job_marks_path(job_id), remaining)
    return {"removed": False, "added": True, "id": key}


def list_job_nouns(job_id: str, query: Optional[str], sort: str) -> List[Dict[str, Any]]:
    result = _load_result(job_id)
    nouns = list(result.get("nouns", []))
    dict_words = get_dict_words()

    if query:
        q = query.strip()
        if q:
            nouns = [x for x in nouns if q in x.get("noun", "")]

    if sort == "count_desc":
        nouns.sort(key=lambda x: (-int(x.get("count", 0)), str(x.get("noun", ""))))
    elif sort == "count_asc":
        nouns.sort(key=lambda x: (int(x.get("count", 0)), str(x.get("noun", ""))))
    elif sort == "alpha":
        nouns.sort(key=lambda x: str(x.get("noun", "")))
    else:
        # keep default
        nouns.sort(key=lambda x: (-int(x.get("count", 0)), str(x.get("noun", ""))))

    for item in nouns:
        noun = item.get("noun")
        item["in_dict"] = noun in dict_words
        item["maybe_wrong"] = is_maybe_wrong_word(noun, dict_words)

    return nouns


def list_noun_occurrences(job_id: str, noun: str) -> List[Dict[str, Any]]:
    result = _load_result(job_id)
    occ = result.get("occurrences_by_noun", {}).get(noun, [])
    # stable ordering: page asc, line asc
    return sorted(occ, key=lambda x: (int(x.get("page", 0)), int(x.get("line", 0))))


