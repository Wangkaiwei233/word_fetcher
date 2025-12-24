# word_fetcher

本项目提供一个**本地网页**：上传 `Word(.docx)` 或 `PDF`，提取文本中的**所有中文名词**并统计词频；点击某个名词可查看其出现的**第几页第几行**以及**所在句子**（高亮名词）。

## 功能范围（已按你的确认固化）

- **Word 页码必须真实页码**：`docx` 会先转换为 `pdf` 再处理，因此页码/行号以转换后的 PDF 为准。
- **不支持扫描件 OCR**：只处理**有文字层**的 PDF（或 docx 转出来的 PDF）。
- **名词口径**：包含普通名词与专名（人名/地名/机构名等），即 `jieba.posseg` 词性以 `n` 开头的词（`n/nr/ns/nt/nz/...`）都算。

## 技术栈

- 后端：Python + FastAPI
- 前端：静态网页（HTML/CSS/JS），由后端同源托管
- PDF：PyMuPDF(`fitz`)
- 中文分词/词性：jieba + jieba.posseg
- Word：通过 **LibreOffice headless** 将 `docx -> pdf`

## 先决条件

- Python 3.10+（推荐 3.11）
- macOS 安装 LibreOffice，并确保命令可用：
  - `soffice --version`

如果你的 `soffice` 不在 PATH，可在启动前设置环境变量：

```bash
export SOFFICE_PATH="/Applications/LibreOffice.app/Contents/MacOS/soffice"
```

## 安装与运行

```bash
cd /Users/kyviii/MyProject/word_fetcher
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

浏览器打开：`http://127.0.0.1:8000/`

## API（前端也用这些）

- `POST /api/upload`（multipart: file）
  - 返回：`{ job_id }`
- `GET /api/jobs/{job_id}/status`
  - 返回：`{ state, progress, message }`
- `GET /api/jobs/{job_id}/nouns?query=&sort=count_desc`
  - 返回：`[{ noun, count }]`
- `GET /api/jobs/{job_id}/nouns/{noun}/occurrences`
  - 返回：`[{ page, line, sentence }]`

## 页码/行号定义

- **页码**：PDF 页序（从 1 开始）
- **行号**：每页抽取到的文本行顺序（从 1 开始，空行会跳过）


