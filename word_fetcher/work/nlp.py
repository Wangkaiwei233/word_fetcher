from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Iterable, List, Sequence, Tuple

import jieba
import jieba.posseg as pseg

from word_fetcher.work.storage import custom_dict_path, stopwords_path

# simple regex filters
_RE_NUMERIC = re.compile(r"^[0-9]+([.,:/-][0-9]+)*$")
_RE_ALPHA = re.compile(r"^[A-Za-z]+$")

# whitelist POS: jieba uses n/nr/ns/nt/nz/ng...
def _is_noun(flag: str) -> bool:
    return bool(flag) and flag.startswith("n")


def _load_stopwords(path: Path) -> set[str]:
    if not path.exists():
        return set()
    words = [ln.strip() for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    return set(words)


def _parse_dict_words(path: Path) -> set[str]:
    words: set[str] = set()
    if not path.exists():
        return words
    lines = path.read_text(encoding="utf-8").splitlines()
    for ln in lines:
        ln = ln.strip()
        if not ln or ln.startswith("#"):
            continue
        parts = ln.split()
        if not parts:
            continue
        words.add(parts[0])
    return words


def _load_custom_dict(path: Path) -> None:
    """
    支持两种格式：
    1) 仅词：       机器学习
    2) 词 频率 词性：机器学习 200000 n
    未提供频率/词性时使用高频+n 以提升命中率。
    """
    if not path.exists():
        return
    lines = path.read_text(encoding="utf-8").splitlines()
    for ln in lines:
        ln = ln.strip()
        if not ln or ln.startswith("#"):
            continue
        parts = ln.split()
        if not parts:
            continue
        word = parts[0]
        freq = 200000
        tag = "n"
        if len(parts) >= 2:
            try:
                freq = int(parts[1])
            except ValueError:
                freq = 200000
        if len(parts) >= 3:
            tag = parts[2]
        jieba.add_word(word, freq=freq, tag=tag)


@lru_cache(maxsize=1)
def _resources():
    sw = _load_stopwords(stopwords_path())
    dict_words = _parse_dict_words(custom_dict_path())
    _load_custom_dict(custom_dict_path())
    return {"stopwords": sw, "dict_words": dict_words}


def reload_resources() -> None:
    _resources.cache_clear()
    _resources()


def iter_nouns(text: str) -> Iterable[Tuple[str, str]]:
    """
    Yields (word, flag) for nouns with basic filtering.
    """
    res = _resources()
    stop = res["stopwords"]

    for w in pseg.cut(text):
        word = (w.word or "").strip()
        flag = w.flag or ""
        if not word:
            continue
        if word in stop:
            continue
        if _RE_NUMERIC.match(word):
            continue
        if len(word) == 1 and _RE_ALPHA.match(word):
            continue
        if not _is_noun(flag):
            continue
        yield word, flag


def get_dict_words() -> set[str]:
    return set(_resources()["dict_words"])


def add_to_custom_dict(word: str) -> bool:
    """
    Append word to custom dict if not exists. Returns True if added.
    """
    word = word.strip()
    if not word:
        return False
    path = custom_dict_path()
    existing = _parse_dict_words(path)
    if word in existing:
        return False
    with path.open("a", encoding="utf-8") as f:
        f.write(f"{word}\n")
    reload_resources()
    return True


def extract_nouns_from_sentences(sentences: Sequence[str]) -> List[str]:
    out: List[str] = []
    for sent in sentences:
        for word, _ in iter_nouns(sent):
            out.append(word)
    return out

