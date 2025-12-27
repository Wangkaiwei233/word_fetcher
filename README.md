# Word Fetcher

一个基于 Web 的中文文档名词提取与分析工具。支持上传 Word (`.docx`) 或 PDF 文件，自动提取文档中的所有中文名词并统计词频，提供详细的位置信息（页码、行号）和上下文句子展示。

## 功能特性

- **多格式支持**：支持 `.docx` 和 PDF 文件上传处理
- **名词提取**：基于 jieba 分词，提取所有中文名词（包括普通名词和专有名词）
- **词频统计**：自动统计每个名词的出现频次，支持排序和筛选
- **位置定位**：精确定位每个名词出现的页码和行号
- **上下文展示**：显示名词所在的完整句子，并高亮显示目标词
- **自定义词典**：支持导入自定义词典和停用词表
- **标记功能**：支持标记重要句子便于后续查看

## 技术说明

- **Word 文档处理**：`.docx` 文件会先通过 LibreOffice 转换为 PDF 再进行文本提取，页码和行号以转换后的 PDF 为准
- **PDF 要求**：仅支持含有文字层的 PDF 文档，不支持扫描件 OCR
- **名词定义**：采用 jieba.posseg 词性标注，包含所有以 `n` 开头的词性标签（`n/nr/ns/nt/nz` 等），涵盖普通名词和专有名词（人名、地名、机构名等）

## 技术栈

- **后端框架**：Python 3.10+ + FastAPI
- **前端**：原生 HTML/CSS/JavaScript（由后端托管）
- **PDF 处理**：PyMuPDF (fitz)
- **中文分词**：jieba + jieba.posseg
- **Word 转换**：LibreOffice (headless 模式)

## 环境要求

### 必需软件

- **Python**：3.10 或更高版本（推荐 3.11+）
- **LibreOffice**：用于 Word 文档转换

### LibreOffice 安装

**macOS**:
```bash
brew install --cask libreoffice
# 验证安装
soffice --version
```

**Linux**:
```bash
sudo apt-get install libreoffice  # Debian/Ubuntu
sudo yum install libreoffice      # CentOS/RHEL
```

**Windows**:
从 [LibreOffice 官网](https://www.libreoffice.org/download/download/) 下载安装

### 配置 soffice 路径

如果 `soffice` 命令不在系统 PATH 中，可通过环境变量指定：

```bash
# macOS 默认路径
export SOFFICE_PATH="/Applications/LibreOffice.app/Contents/MacOS/soffice"

# Linux 默认路径（示例）
export SOFFICE_PATH="/usr/bin/soffice"
```

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/your-username/word_fetcher.git
cd word_fetcher
```

### 2. 创建虚拟环境并安装依赖

```bash
# 创建虚拟环境
python -m venv .venv

# 激活虚拟环境
source .venv/bin/activate  # macOS/Linux
# 或 Windows: .venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt
```

### 3. 启动服务

```bash
python main.py
```

服务启动后，在浏览器中访问：`http://127.0.0.1:8000`

### 4. 使用说明

1. 点击上传按钮选择 `.docx` 或 PDF 文件
2. 等待文件处理完成（进度条显示）
3. 查看提取的名词列表和词频统计
4. 点击任意名词查看其在文档中的详细位置和上下文

## 自定义词典

### 词典文件

项目内置了一份通用的行业词汇表，位于 `data/dicts/custom_dict.txt`。词典文件格式：

```
# 基础格式（每行一个词）
词语

# 扩展格式（可选：词 频率 词性）
词语 100 n
```

### 停用词表

停用词表位于 `data/dicts/stopwords.txt`，每行一个停用词。

### 词典管理 API

- **下载当前词典**：`GET /api/dict`
- **上传自定义词典**：`POST /api/dict`（会覆盖现有词典，立即生效）
- **查看自定义词汇**：`GET /api/custom-words`
- **删除指定词汇**：`DELETE /api/custom-words/{word}`

## API 文档

### 文件处理

#### 上传文件
```
POST /api/upload
Content-Type: multipart/form-data

参数：
  file: 上传的文件（.docx 或 .pdf）

响应：
  { "job_id": "uuid-string" }
```

#### 查询处理状态
```
GET /api/jobs/{job_id}/status

响应：
  {
    "state": "processing|completed|failed",
    "progress": 0-100,
    "message": "状态描述"
  }
```

### 结果查询

#### 获取名词列表
```
GET /api/jobs/{job_id}/nouns?query=&sort=count_desc&page=1&page_size=50

参数：
  query: 可选，筛选关键词
  sort: count_desc（词频降序）| count_asc（词频升序）| alpha（字母序）
  page: 页码（默认 1）
  page_size: 每页条数（默认 50）

响应：
  {
    "items": [{ "noun": "名词", "count": 10 }],
    "total": 100,
    "page": 1,
    "page_size": 50
  }
```

#### 获取名词出现位置
```
GET /api/jobs/{job_id}/nouns/{noun}/occurrences

响应：
  [
    {
      "page": 1,
      "line": 5,
      "sentence": "这是包含名词的句子"
    }
  ]
```

### 标记管理

#### 获取标记的句子
```
GET /api/jobs/{job_id}/marks

响应：
  [
    {
      "page": 1,
      "line": 3,
      "sentence": "标记的句子内容"
    }
  ]
```

#### 切换句子标记状态
```
POST /api/jobs/{job_id}/marks/toggle
Content-Type: application/json

请求体：
  {
    "page": 1,
    "line": 3,
    "sentence": "要标记的句子"
  }

响应：
  { "marked": true }
```

## 技术细节

### 页码和行号定义

- **页码**：PDF 文档的页序号（从 1 开始计数）
- **行号**：每页提取文本的行序号（从 1 开始，空行会被跳过）

### 文件存储

- 上传的文件临时存储在 `data/uploads/` 目录
- 处理结果缓存在 `data/jobs/` 目录
- 自定义词典存储在 `data/dicts/` 目录

## 项目结构

```
word_fetcher/
├── main.py                 # 应用入口
├── requirements.txt        # Python 依赖
├── api/
│   ├── routes.py          # API 路由定义
│   └── models.py          # 数据模型
├── core/
│   ├── jobs.py            # 任务处理逻辑
│   └── nlp.py             # NLP 处理（分词、词性标注）
├── web/
│   ├── index.html         # 前端页面
│   └── styles.css         # 样式文件
└── data/
    ├── dicts/             # 词典和停用词
    ├── uploads/           # 上传文件（临时）
    └── jobs/              # 处理结果缓存
```

## 常见问题

**Q: 为什么 Word 文档的页码和原文件不一致？**
A: 本项目通过 LibreOffice 将 `.docx` 转换为 PDF 后再处理。转换后的 PDF 页码可能与原 Word 文档不完全一致，这取决于文档的排版和格式。

**Q: 支持扫描版 PDF 吗？**
A: 不支持。本项目仅处理含有文字层的 PDF，不包含 OCR 功能。

**Q: 如何提高名词识别的准确性？**
A: 可以通过上传自定义词典来改进识别效果。将专业术语、特定领域词汇添加到词典中，可以显著提升分词和识别的准确度。

**Q: 处理大文件需要多长时间？**
A: 处理时间取决于文档大小和复杂度。通常几百页的文档在几十秒内可以完成处理。

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启一个 Pull Request

## 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

## 联系方式

如有问题或建议，欢迎通过以下方式联系：

- 提交 [Issue](https://github.com/your-username/word_fetcher/issues)
- Pull Request

## 致谢

- [jieba](https://github.com/fxsjy/jieba) - 中文分词库
- [PyMuPDF](https://github.com/pymupdf/PyMuPDF) - PDF 处理库
- [FastAPI](https://fastapi.tiangolo.com/) - 现代 Web 框架
- [LibreOffice](https://www.libreoffice.org/) - 文档转换工具

