# 🔍 DataLens

### AI-Powered Chrome Extension for Real-Time Detection and Correction of Misleading Data Visualizations

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Groq](https://img.shields.io/badge/Groq-LLaMA_4-F55036?style=for-the-badge)](https://groq.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

*Empowering everyday data consumers with AI-assisted visualization literacy*

[Features](#-features) • [Demo](#-demo) • [Installation](#-installation) • [How to Use](#-how-to-use) • [Architecture](#-architecture) • [Tech Stack](#-tech-stack)

</div>

---

## 📌 What is DataLens?

DataLens is a Chrome browser extension that automatically detects and analyzes data visualizations on any webpage, identifies misleading techniques, and generates corrected charts — all in real-time within a native browser side panel.

> **Research Context:** DataLens is based on the taxonomy of 21 misleading visualization patterns from [Lo et al. (2022)](https://arxiv.org/abs/2407.17291) and implements the Chain-of-Thought prompting strategy found most effective by Lo and Qu (2024) for LLM-based misleading chart detection.

---

## ✨ Features

### 🔍 Smart Chart Detection
- Automatically detects charts on any webpage
- Supports `<img>`, `<canvas>`, and `<svg>` chart types
- Intelligent scoring algorithm filters out logos, ads, and icons
- Works on Wikipedia, BBC News, Our World in Data, TradingView, and more

### ✂️ Select Area Tool
- Draw a rectangle on any part of the webpage
- Precisely capture any chart for targeted analysis
- Works even on complex page layouts

### 🧠 AI-Powered Analysis
- **Chart Type Classification** — bar, line, pie, scatter, heatmap, candlestick, and more
- **OCR Text Extraction** — extracts titles, axis labels, legends, and values
- **Plain Language Explanation** — describes what the chart shows
- **Key Insight** — identifies the single most important takeaway

### ⚠️ 21 Misleading Pattern Detection

| Severity | Patterns Detected |
|----------|-------------------|
| 🔴 High | Truncated Axis, 3D Chart, Misrepresentation, Dual Axis, Selective Data, Dubious Data, Not Data |
| 🟡 Medium | Missing Normalization, Inappropriate Axis Range, Inconsistent Tick Intervals, Area Encoding, Overusing Colors, Indistinguishable Colors, Ineffective Color Scheme, Discretized Continuous, Inconsistent Binning |
| 🟢 Low | Missing Title, Missing Axis Title, Missing Legend, Missing Value Labels, Missing Axis |

Each detected issue includes:
- **Description** of the specific problem
- **Fix suggestion** explaining how to correct it
- **Severity level** (High / Medium / Low)

### ✅ Corrected Chart Generation
- Generates corrected Vega-Lite specifications
- Renders fixed chart using Chart.js
- Lists all fixes applied
- Shows Trust Score (0–100%)

### 💬 Chat with Chart
- Ask questions in natural language about any analyzed chart
- Quick suggestion chips: "Main trend?", "Why misleading?", "Simplify", "Highest value?"
- Context-aware answers powered by LLaMA 4

---

## 🎬 Demo

### Analyze Page
![Analyze Page Demo](screenshots/analyze-demo.png)

### Select Area
![Select Area Demo](screenshots/select-area-demo.png)

### Misleading Detection
![Misleading Detection Demo](screenshots/misleading-demo.png)

---

## 🚀 Installation

### Prerequisites
- Google Chrome browser
- Python 3.10+
- Free [Groq API Key](https://console.groq.com)

### Step 1 — Clone the Repository
```bash
git clone https://github.com/Anjallliii/DataLens.git
cd DataLens
```

### Step 2 — Setup Python Backend
```bash
cd datalens-backend
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
```

### Step 3 — Configure API Key
Create a `.env` file inside `datalens-backend/`:
```env
GROQ_API_KEY=your_groq_api_key_here
```

Get your free API key from: https://console.groq.com

### Step 4 — Start the Backend
```bash
uvicorn main:app --reload --port 8000
```

Verify it's running:
```
http://127.0.0.1:8000
→ {"status": "DataLens Backend Running"}
```

### Step 5 — Load Chrome Extension
1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer Mode** (top right toggle)
3. Click **Load Unpacked**
4. Select the `DataLens` folder (the root folder, not datalens-backend)
5. DataLens icon appears in your Chrome toolbar ✅

---

## 📖 How to Use

### Method 1 — Analyze Page
1. Navigate to any webpage with charts
2. Click the **DataLens** icon in Chrome toolbar
3. Side panel opens on the right
4. Click **⚡ Analyze Page**
5. DataLens automatically finds and analyzes the best chart candidate

### Method 2 — Select Area
1. Click the **DataLens** icon
2. Click **✂️ Select Area**
3. Draw a rectangle around any chart on the page
4. Side panel automatically updates with analysis

### Method 3 — Chat with Chart
After any analysis:
1. Scroll down to **💬 Chat with Chart**
2. Click a suggestion chip or type your own question
3. Press Enter or click Send

### Example Test Pages
```
# Static image charts
https://en.wikipedia.org/wiki/Bar_chart
https://en.wikipedia.org/wiki/Misleading_graph

# Interactive SVG charts
https://ourworldindata.org/grapher/life-expectancy

# Canvas charts
https://www.chartjs.org/docs/latest/samples/bar/vertical.html

# Financial charts
https://tradingeconomics.com/india/gdp-growth-rate
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  CHROME EXTENSION (Manifest V3)              │
│                                                              │
│  content.js          background.js        popup.html/js      │
│  ─────────────       ─────────────        ──────────────     │
│  Detect charts   →   Screenshot &    →    Side Panel UI      │
│  Score & rank        Crop selection       Results display    │
│  Canvas capture      Storage sync        Chat interface      │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP POST
                               │ (image URL or base64)
┌──────────────────────────────▼──────────────────────────────┐
│                    FASTAPI BACKEND (Python)                   │
│                                                              │
│   /analyze-url      /analyze-base64        /chat             │
│   ────────────      ────────────────       ─────             │
│   Fetch image       Decode base64          Context Q&A       │
│   PIL convert       PIL convert            LLM response      │
└──────────────────────────────┬──────────────────────────────┘
                               │ Groq API
┌──────────────────────────────▼──────────────────────────────┐
│              LLaMA 4 Scout 17B (Vision + Language)           │
│                                                              │
│   OCR Extraction   Chart Classification   Pattern Detection  │
│   Explanation      Insight Generation     Vega-Lite Spec     │
│   Trust Score      Fix Suggestions        Q&A Responses      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

### Chrome Extension
| Technology | Purpose |
|-----------|---------|
| JavaScript (Vanilla) | Extension logic |
| Chrome Extension API (Manifest V3) | Browser integration |
| Chrome Side Panel API | Full-screen panel UI |
| Chrome Storage API | Cross-component state |
| Chrome Scripting API | Dynamic script injection |
| Chart.js | Corrected chart rendering |

### Backend
| Technology | Purpose |
|-----------|---------|
| Python 3.10+ | Backend language |
| FastAPI | REST API framework |
| Groq API | LLM inference |
| LLaMA 4 Scout 17B | Vision + language model |
| Pillow (PIL) | Image processing |
| Base64 | Image encoding |

---

## 📁 Project Structure

```
DataLens/
│
├── manifest.json          # Extension config (Manifest V3)
├── popup.html             # Side panel UI
├── popup.js               # Side panel logic & API calls
├── content.js             # Chart detection & scoring
├── background.js          # Screenshot capture & cropping
├── selector.js            # Area selection overlay
├── styles.css             # UI styles
├── chart.umd.min.js       # Chart.js (local copy)
│
└── datalens-backend/
    ├── main.py            # FastAPI server & LLM pipeline
    ├── requirements.txt   # Python dependencies
    └── .env               # API keys (not committed)
```

---

## 🌐 Supported Websites

| Website | Chart Type | Support |
|---------|-----------|---------|
| Wikipedia | PNG images | ✅ Full |
| BBC News | Article images | ✅ Full |
| Our World in Data | SVG interactive | ✅ Full |
| Chart.js applications | Canvas | ✅ Full |
| TradingView | Canvas | ✅ Full |
| Reuters Graphics | Mixed | ✅ Full |
| Any webpage | img/svg/canvas | ✅ Full |

---

## 📊 Misleading Detection Examples

### Example 1 — Truncated Axis (Wikipedia Bar Chart)
```
⚠️ Misleading Score: 8/10

🔴 TRUNCATED AXIS
   Y-axis starts at 94M instead of 0,
   exaggerating the difference between values.
   💡 Fix: Start y-axis at zero to show true proportions.

🟡 MISSING AXIS TITLE
   X and Y axes lack labels.
   💡 Fix: Add descriptive labels to both axes.

Trust Score: 20% — Chart is misleading due to truncated axis.
```

### Example 2 — Clean Chart (Our World in Data)
```
✅ Misleading Score: 2/10

🟢 MISSING VALUE LABELS
   Data points not individually labeled.
   💡 Fix: Add value labels to key data points.

Trust Score: 80% — Chart appears mostly trustworthy.
```

---

## 🔬 Research

This project is based on research in misleading visualization detection:

- **Lo et al. (2022)** — Taxonomy of 74 misleading visualization issues
- **Lo & Qu (2024)** — LLM capabilities for detecting misleading charts
- **Chain-of-Thought Prompting** — Structured reasoning for improved detection

> 📄 Research paper: *"DataLens: A Browser Extension for Real-Time Detection and Correction of Misleading Data Visualizations Using Large Language Models"* — Anjali Gupta, MCKV Institute of Engineering (2025)

---

## 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## ⭐ Acknowledgements

- [Lo et al.](https://arxiv.org/abs/2407.17291) for the misleading visualization taxonomy
- [Groq](https://groq.com) for fast LLM inference
- [Chart.js](https://chartjs.org) for chart rendering
- [FastAPI](https://fastapi.tiangolo.com) for the backend framework

---
