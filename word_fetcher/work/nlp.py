from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Callable, Iterable, List, Sequence, Tuple

import jieba
import jieba.posseg as pseg

from word_fetcher.work.storage import custom_dict_path, stopwords_path

try:
    from ltp import LTP  # type: ignore

    _LTP_AVAILABLE = True
except Exception:  # pragma: no cover
    _LTP_AVAILABLE = False

# simple regex filters
_RE_NUMERIC = re.compile(r"^[0-9]+([.,:/-][0-9]+)*$")
_RE_ALPHA = re.compile(r"^[A-Za-z]+$")
_RE_NON_CJK = re.compile(r"[^0-9A-Za-z\u4e00-\u9fff]+")
_RE_REPEAT3 = re.compile(r"(.)\1\1")
_LTP_NER_KEEP = {"Nh", "Ni", "Ns"}  # 人/机构/地名

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


def list_custom_dict_words() -> List[str]:
    """
    Return all words in the custom dict, deduplicated and sorted.
    """
    return sorted(_parse_dict_words(custom_dict_path()))


def remove_from_custom_dict(word: str) -> bool:
    """
    Remove a word from custom dict if present. Returns True if removed.
    """
    word = word.strip()
    if not word:
        return False
    path = custom_dict_path()
    if not path.exists():
        return False
    words = _parse_dict_words(path)
    if word not in words:
        return False
    remaining = [w for w in words if w != word]
    path.write_text("\n".join(remaining) + ("\n" if remaining else ""), encoding="utf-8")
    reload_resources()
    return True


@lru_cache(maxsize=1)
def _resources():
    sw = _load_stopwords(stopwords_path())
    dict_words = _parse_dict_words(custom_dict_path())
    _load_custom_dict(custom_dict_path())
    return {"stopwords": sw, "dict_words": dict_words}


def reload_resources() -> None:
    _resources.cache_clear()
    _resources()


# ---------- Analyzer selection (LTP -> Jieba fallback) ----------
_ltp_model = None

def _get_analyzer() -> Tuple[str, Callable[[str], List[Tuple[str, str, str]]]]:
    """
    Returns (mode, analyzer_fn) where analyzer_fn(text) -> [(word, pos, ner)]
    Order: LTP (if installed) -> Jieba.
    """
    global _ltp_model
    if _LTP_AVAILABLE:
        if _ltp_model is None:
            _ltp_model = LTP()

        def _analyze(text: str) -> List[Tuple[str, str, str]]:
            out = _ltp_model.pipeline([text], tasks=["cws", "pos", "ner"], return_dict=True)
            tokens = out["cws"][0]
            pos = out["pos"][0]
            ner_spans = out.get("ner", [[]])[0] if out.get("ner") else []
            ner_map: dict[int, str] = {}
            for start, end, label in ner_spans:
                for i in range(start, end + 1):
                    ner_map[i] = label
            result: List[Tuple[str, str, str]] = []
            for i, tok in enumerate(tokens):
                result.append((tok, pos[i] if i < len(pos) else "", ner_map.get(i, "")))
            return result

        return "ltp", _analyze

    def _jieba_analyze(text: str) -> List[Tuple[str, str, str]]:
        return [(w.word, w.flag, "") for w in pseg.cut(text)]

    return "jieba", _jieba_analyze


def iter_nouns(text: str) -> Iterable[Tuple[str, str]]:
    """
    Yields (word, flag) for nouns with basic filtering.
    """
    res = _resources()
    stop = res["stopwords"]
    _mode, analyzer = _get_analyzer()

    for word, flag, ner in analyzer(text):
        word = (word or "").strip()
        flag = flag or ""
        ner = ner or ""
        if not word:
            continue
        if word in stop:
            continue
        if _RE_NUMERIC.match(word):
            continue
        if len(word) == 1 and _RE_ALPHA.match(word):
            continue

        is_noun = _is_noun(flag)
        is_ner_keep = ner in _LTP_NER_KEEP if ner else False
        if not (is_noun or is_ner_keep):
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


def is_maybe_wrong_word(word: str, dict_words: set[str]) -> bool:
    """
    Heuristic: mark as potential typo/噪声 when
    - not in custom dict, AND one of:
      * length <= 1
      * contains非中英数字字符
      * contains 3+ repeated char (e.g., aaa)
      * too long (> 10) uncommon for名词
      * pure ASCII word (likely残留)
    """
    if word in dict_words:
        return False
    if len(word) <= 1:
        return True
    if _RE_NON_CJK.search(word):
        return True
    if _RE_REPEAT3.search(word):
        return True
    if len(word) > 10:
        return True
    if _RE_ALPHA.match(word):
        return True
    return False


def extract_nouns_from_sentences(sentences: Sequence[str]) -> List[str]:
    out: List[str] = []
    for sent in sentences:
        for word, _ in iter_nouns(sent):
            out.append(word)
    return out

