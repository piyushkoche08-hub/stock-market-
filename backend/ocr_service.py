"""
Portfolio screenshot OCR — server-side.

Order (first success wins):
  1) RapidOCR + ONNX (optional; pip install rapidocr-onnxruntime — may not support newest Python)
  2) EasyOCR (optional; pip install easyocr)
  3) Tesseract CLI via subprocess + TSV (needs Tesseract binary only — recommended on Windows)
  4) pytesseract (pip install pytesseract + same Tesseract binary)

Windows: install Tesseract, then restart Flask:
  winget install --id UB-Mannheim.TesseractOCR
Or: https://github.com/UB-Mannheim/tesseract/wiki

Minimal pip (always try this first):
  pip install Pillow pytesseract
"""

from __future__ import annotations

import csv
import io
import logging
import os
import re
import shutil
import subprocess
import tempfile
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_rapid_engine = None
_easy_reader = None

_TESSERACT_EXE: Optional[str] = None


def _pil_open_rgb(image_bytes: bytes):
    from PIL import Image

    im = Image.open(io.BytesIO(image_bytes))
    return im.convert("RGB")


def _resize_max_side(im, max_side: int = 1280):
    from PIL import Image

    w, h = im.size
    m = max(w, h)
    if m <= max_side:
        return im
    scale = max_side / float(m)
    nw = max(1, int(w * scale))
    nh = max(1, int(h * scale))
    try:
        resample = Image.Resampling.LANCZOS
    except AttributeError:
        resample = Image.LANCZOS
    return im.resize((nw, nh), resample)


def find_tesseract_executable() -> Optional[str]:
    """Resolve tesseract.exe on PATH or standard Windows install paths."""
    global _TESSERACT_EXE
    if _TESSERACT_EXE:
        return _TESSERACT_EXE

    env = os.environ.get("TESSERACT_CMD") or os.environ.get("TESSERACT_EXE")
    if env and os.path.isfile(env):
        _TESSERACT_EXE = env
        return _TESSERACT_EXE

    which = shutil.which("tesseract")
    if which:
        _TESSERACT_EXE = which
        return _TESSERACT_EXE

    for candidate in (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ):
        if os.path.isfile(candidate):
            _TESSERACT_EXE = candidate
            return _TESSERACT_EXE

    return None


def _configure_pytesseract_cmd():
    try:
        import pytesseract
    except ImportError:
        return False
    exe = find_tesseract_executable()
    if exe:
        pytesseract.pytesseract.tesseract_cmd = exe
        return True
    return False


def _normalize_words(words: List[Dict[str, Any]], full_text: str, engine: str) -> Dict[str, Any]:
    return {"text": full_text, "words": words, "engine": engine}


def _bbox_from_quad(box) -> Dict[str, float]:
    xs = [float(p[0]) for p in box]
    ys = [float(p[1]) for p in box]
    return {"x0": min(xs), "y0": min(ys), "x1": max(xs), "y1": max(ys)}


def _try_rapidocr(image_bytes: bytes) -> Dict[str, Any]:
    import numpy as np
    from rapidocr_onnxruntime import RapidOCR

    global _rapid_engine
    pil = _resize_max_side(_pil_open_rgb(image_bytes))
    arr = np.array(pil)
    if _rapid_engine is None:
        _rapid_engine = RapidOCR()
    raw = _rapid_engine(arr)

    lines_out = raw[0] if isinstance(raw, tuple) else raw
    if lines_out is None:
        lines_out = []

    words: List[Dict[str, Any]] = []
    chunks: List[str] = []

    for item in lines_out:
        if not item or len(item) < 2:
            continue
        box, txt = item[0], item[1]
        score = float(item[2]) if len(item) > 2 else 0.95
        if hasattr(txt, "decode"):
            txt = txt.decode("utf-8", errors="ignore")
        txt = str(txt).strip()
        if not txt:
            continue
        conf = score * 100.0 if score <= 1.0 else float(score)
        conf = max(0.0, min(100.0, conf))
        words.append(
            {
                "text": txt,
                "confidence": conf,
                "bbox": _bbox_from_quad(box),
            }
        )
        chunks.append(txt)

    full_text = "\n".join(chunks)
    return _normalize_words(words, full_text, "rapidocr")


def _try_easyocr(image_bytes: bytes) -> Dict[str, Any]:
    import numpy as np
    import easyocr

    global _easy_reader
    pil = _resize_max_side(_pil_open_rgb(image_bytes))
    arr = np.array(pil)
    if _easy_reader is None:
        _easy_reader = easyocr.Reader(["en"], gpu=False, verbose=False)

    result = _easy_reader.readtext(arr)
    words: List[Dict[str, Any]] = []
    chunks: List[str] = []

    for item in result:
        if len(item) < 3:
            continue
        box, txt, conf = item[0], item[1], float(item[2])
        txt = str(txt).strip()
        if not txt:
            continue
        conf_pct = conf * 100.0 if conf <= 1.0 else conf
        words.append(
            {
                "text": txt,
                "confidence": max(0.0, min(100.0, conf_pct)),
                "bbox": _bbox_from_quad(box),
            }
        )
        chunks.append(txt)

    full_text = "\n".join(chunks)
    return _normalize_words(words, full_text, "easyocr")


def _parse_tesseract_tsv(tsv_raw: str) -> Dict[str, Any]:
    """Parse Tesseract tab-separated output (word level = column level == 5)."""
    words: List[Dict[str, Any]] = []
    lines_out: List[str] = []
    reader = csv.reader(io.StringIO(tsv_raw), delimiter="\t")
    rows = list(reader)
    if len(rows) < 2:
        return _normalize_words([], "", "tesseract-tsv")

    # Header: level page_num block_num par_num line_num word_num left top width height conf text
    for row in rows[1:]:
        if len(row) < 12:
            continue
        try:
            level = int(row[0])
        except ValueError:
            continue
        if level != 5:
            continue
        t = (row[11] or "").strip()
        if not t or t == "":
            continue
        try:
            conf = float(row[10])
        except ValueError:
            conf = 80.0
        if conf < 0:
            continue
        try:
            left, top, wi, ht = int(row[6]), int(row[7]), int(row[8]), int(row[9])
        except ValueError:
            continue
        words.append(
            {
                "text": t,
                "confidence": conf,
                "bbox": {
                    "x0": float(left),
                    "y0": float(top),
                    "x1": float(left + wi),
                    "y1": float(top + ht),
                },
            }
        )
        lines_out.append(t)

    full_text = "\n".join(lines_out)
    return _normalize_words(words, full_text, "tesseract-cli")


def _try_tesseract_cli(image_bytes: bytes) -> Dict[str, Any]:
    exe = find_tesseract_executable()
    if not exe:
        raise RuntimeError("Tesseract executable not found (install Tesseract OCR and/or set TESSERACT_CMD)")

    from PIL import Image

    pil = _resize_max_side(_pil_open_rgb(image_bytes))

    tmpdir = tempfile.mkdtemp(prefix="alphapulse_ocr_")
    try:
        img_path = os.path.join(tmpdir, "page.png")
        out_base = os.path.join(tmpdir, "out")
        pil.save(img_path, format="PNG")

        run_kw = dict(
            capture_output=True,
            text=True,
            timeout=25,
        )
        if os.name == "nt":
            run_kw["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)

        proc = subprocess.run(
            [
                exe,
                img_path,
                out_base,
                "-l",
                "eng",
                "--psm",
                "6",
                "tsv",
            ],
            **run_kw,
        )
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "").strip()
            raise RuntimeError(f"tesseract exited {proc.returncode}: {err[:500]}")

        tsv_path = out_base + ".tsv"
        if not os.path.isfile(tsv_path):
            raise RuntimeError("tesseract did not produce output.tsv")

        with open(tsv_path, encoding="utf-8", errors="ignore") as f:
            tsv_raw = f.read()
        return _parse_tesseract_tsv(tsv_raw)
    finally:
        try:
            for name in os.listdir(tmpdir):
                try:
                    os.unlink(os.path.join(tmpdir, name))
                except OSError:
                    pass
            os.rmdir(tmpdir)
        except OSError:
            pass


def _try_pytesseract(image_bytes: bytes) -> Dict[str, Any]:
    import pytesseract
    from pytesseract import Output

    if not _configure_pytesseract_cmd():
        raise RuntimeError("pytesseract: could not find tesseract executable")

    pil = _resize_max_side(_pil_open_rgb(image_bytes))
    data = pytesseract.image_to_data(pil, output_type=Output.DICT, lang="eng")

    words: List[Dict[str, Any]] = []
    chunks: List[str] = []
    n = len(data.get("text", []))

    for i in range(n):
        t = (data["text"][i] or "").strip()
        if not t:
            continue
        try:
            conf = float(data["conf"][i])
        except (KeyError, ValueError, TypeError):
            conf = 80.0
        if conf < 0:
            continue
        x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
        words.append(
            {
                "text": t,
                "confidence": conf,
                "bbox": {"x0": float(x), "y0": float(y), "x1": float(x + w), "y1": float(y + h)},
            }
        )
        chunks.append(t)

    full_text = "\n".join(chunks)
    return _normalize_words(words, full_text, "pytesseract")


def run_portfolio_ocr(image_bytes: bytes) -> Dict[str, Any]:
    if not image_bytes or len(image_bytes) < 32:
        raise ValueError("Empty or invalid image upload")

    # Tesseract first: fastest typical path on Windows when installed; avoids slow EasyOCR cold start.
    backends = (_try_tesseract_cli, _try_pytesseract, _try_rapidocr, _try_easyocr)
    attempts: List[str] = []

    for fn in backends:
        try:
            out = fn(image_bytes)
            if out.get("words") or (out.get("text") or "").strip():
                logger.info("OCR succeeded with %s", out.get("engine"))
                return out
            attempts.append(f"{fn.__name__}: no text detected")
        except ImportError as e:
            attempts.append(f"{fn.__name__}: missing Python package ({e})")
        except Exception as e:
            logger.warning("%s failed: %s", fn.__name__, e)
            attempts.append(f"{fn.__name__}: {e}")

    hint = (
        "Install Tesseract OCR (Windows: winget install --id UB-Mannheim.TesseractOCR), "
        "then: pip install Pillow pytesseract\n"
        "Optional ML backends: pip install -r requirements-ocr-optional.txt"
    )
    raise RuntimeError(
        "Could not extract text from image.\n"
        f"{hint}\n"
        f"Details: {' | '.join(attempts)}"
    )
