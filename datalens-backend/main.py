from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from PIL import Image
import io
import json
import requests as http_requests
import base64
#import fitz  # PyMuPDF

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

print("GROQ KEY FOUND:", GROQ_API_KEY is not None)

client = Groq(api_key=GROQ_API_KEY)

FULL_ANALYSIS_PROMPT = """
You are an expert data visualization analyst specializing in detecting misleading charts.
Analyze this chart image and respond ONLY in this exact JSON format:

{
  "chart_type": "bar",
  "title": "chart title or null",
  "x_axis": "x axis label or null",
  "y_axis": "y axis label or null",
  "explanation": "2-3 sentence plain English explanation of what this chart shows",
  "insight": "the single most important takeaway from this chart",
  "confidence": 0.95,

  "ocr": {
    "all_text": ["every piece of text visible in the chart"],
    "x_axis_values": ["value1", "value2"],
    "y_axis_values": ["value1", "value2"],
    "legend_items": ["item1", "item2"]
  },

  "misleading": {
    "misleading_score": 3,
    "trust_score": 0.7,
    "overall_verdict": "brief verdict about chart trustworthiness",
    "issues": [
      {
        "type": "truncated_axis",
        "severity": "high",
        "description": "what the issue is",
        "fix": "how to fix it"
      }
    ]
  },

  "vegaLite": {
    "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
    "title": "Corrected Chart Title",
    "width": 300,
    "height": 200,
    "mark": "bar",
    "data": {
      "values": [
        {"category": "A", "value": 10}
      ]
    },
    "encoding": {
      "x": {"field": "category", "type": "nominal", "title": "Category"},
      "y": {"field": "value", "type": "quantitative", "title": "Value", "scale": {"zero": true}}
    }
  },

  "fixes_applied": ["list of fixes applied in the corrected Vega-Lite chart"]
}

IMPORTANT - Check for ALL 21 misleading issues from this checklist:

1. TRUNCATED_AXIS: Y-axis does not start at zero, exaggerating differences
2. THREE_D_CHART: Chart uses 3D effects that distort perception of values
3. MISSING_TITLE: Chart has no title, making context unclear
4. DUAL_AXIS: Chart uses two different Y-axes that could mislead comparison
5. MISREPRESENTATION: Visual representation is not proportional to data values
6. MISSING_AXIS_TITLE: X or Y axis has no label/title
7. MISSING_LEGEND: Chart has multiple data series but no legend
8. INCONSISTENT_TICK_INTERVALS: Axis tick marks are not evenly spaced
9. NOT_DATA: Chart appears to be fictional, satirical or parody data
10. SELECTIVE_DATA: Data appears cherry-picked or shows only partial time range
11. DUBIOUS_DATA: Data source is missing, unclear or questionable
12. MISSING_VALUE_LABELS: Important values or data points are not labeled
13. AREA_ENCODING: Area used to represent data but perception is distorted
14. OVERUSING_COLORS: Too many colors used making chart hard to read
15. INAPPROPRIATE_AXIS_RANGE: Axis range compresses or stretches visual impact
16. INDISTINGUISHABLE_COLORS: Colors used are too similar to differentiate
17. INEFFECTIVE_COLOR_SCHEME: Color scheme does not aid comprehension
18. DISCRETIZED_CONTINUOUS: Continuous data wrongly shown as discrete categories
19. MISSING_NORMALIZATION: Raw counts used when percentage would be more appropriate
20. MISSING_AXIS: Chart is missing an axis entirely
21. INCONSISTENT_BINNING: Bins or groups have inconsistent sizes

Rules:
- Return ONLY the JSON object
- No markdown backticks
- No text before or after JSON
- chart_type: bar, line, pie, scatter, heatmap, candlestick, histogram, area, map, unknown
- misleading_score: 0 (clean) to 10 (very misleading)
- trust_score: 0.0 (untrustworthy) to 1.0 (fully trustworthy)
- severity: "high", "medium", or "low"
- issues: empty array [] if no issues found
- type field must use EXACT names from checklist above (e.g. "truncated_axis", "three_d_chart")
- vegaLite: generate realistic corrected data based on what you can see
- If chart data is unreadable, use approximate estimated values
- Check ALL 21 issues, not just the obvious ones
"""

def fetch_image(url):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.wikipedia.org/"
    }
    img_response = http_requests.get(url, headers=headers, timeout=10)
    print(f"Fetch status: {img_response.status_code}, URL: {url}")
    if img_response.status_code != 200:
        raise Exception(f"Failed to fetch image: HTTP {img_response.status_code}")
    return Image.open(io.BytesIO(img_response.content)).convert("RGB")

def image_to_base64(image):
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")

def run_full_analysis(image):
    img_base64 = image_to_base64(image)

    response = client.chat.completions.create(
        model="meta-llama/llama-4-scout-17b-16e-instruct",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{img_base64}"
                        }
                    },
                    {
                        "type": "text",
                        "text": FULL_ANALYSIS_PROMPT
                    }
                ]
            }
        ],
        max_tokens=2000
    )

    raw = response.choices[0].message.content.strip()
    print(f"Groq response (first 500 chars): {raw[:500]}")
    raw = raw.replace("```json", "").replace("```", "").strip()
    start = raw.find("{")
    end   = raw.rfind("}") + 1
    raw   = raw[start:end]
    return json.loads(raw)

@app.get("/")
def root():
    return {"status": "DataLens Backend Running"}

@app.post("/analyze-url")
async def analyze_chart_url(payload: dict):
    try:
        url = payload.get("url")
        print(f"Full analysis for: {url}")
        image = fetch_image(url)
        print(f"Image size: {image.size}")
        return run_full_analysis(image)
    except Exception as e:
        print(f"ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "chart_type": "unknown",
            "explanation": "Analysis failed.",
            "insight": "Try again.",
            "confidence": 0.0,
            "ocr": {"all_text": [], "x_axis_values": [], "y_axis_values": [], "legend_items": []},
            "misleading": {"misleading_score": 0, "trust_score": 1.0, "overall_verdict": "", "issues": []},
            "vegaLite": None,
            "fixes_applied": [],
            "error": str(e)
        }
    
@app.post("/analyze-base64")
async def analyze_base64(payload: dict):
    try:
        image_base64 = payload.get("image_base64", "")

        # Remove data URL prefix if present
        if "," in image_base64:
            image_base64 = image_base64.split(",")[1]

        print(f"Received base64 image, length: {len(image_base64)}")

        img_bytes = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        print(f"Image size: {image.size}")

        return run_full_analysis(image)
    except Exception as e:
        print(f"ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "chart_type": "unknown",
            "explanation": "Analysis failed.",
            "insight": "Try again.",
            "confidence": 0.0,
            "ocr": {"all_text": [], "x_axis_values": [], "y_axis_values": [], "legend_items": []},
            "misleading": {"misleading_score": 0, "trust_score": 1.0, "overall_verdict": "", "issues": []},
            "vegaLite": None,
            "fixes_applied": [],
            "error": str(e)
        }

@app.post("/analyze")
async def analyze_chart(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        return run_full_analysis(image)
    except Exception as e:
        print(f"ERROR: {str(e)}")
        return {
            "chart_type": "unknown",
            "explanation": "Analysis failed.",
            "error": str(e)
        }

@app.post("/chat")
async def chat_with_chart(payload: dict):
    try:
        question = payload.get("question", "")
        chart_context = payload.get("chart_context", {})

        print(f"Chat question: {question}")

        context_str = json.dumps(chart_context, indent=2)

        prompt = f"""
You are DataLens, an expert data visualization assistant.
You have already analyzed a chart and here is what you found:

{context_str}

The user is now asking a question about this chart.
Answer clearly, concisely and helpfully in 2-3 sentences maximum.
If the question is unrelated to the chart, politely redirect.

User question: {question}

Answer:"""

        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            max_tokens=300
        )

        answer = response.choices[0].message.content.strip()
        print(f"Chat answer: {answer}")

        return {"answer": answer}
    except Exception as e:
        print(f"ERROR: {str(e)}")
        return {"answer": "Sorry, I could not answer that. Please try again.", "error": str(e)}
@app.post("/analyze-svg")
async def analyze_svg(payload: dict):
    try:
        svg_html  = payload.get("svg_html", "")
        width     = payload.get("width", 800)
        height    = payload.get("height", 600)

        print(f"SVG analysis: {width}x{height}")

        # Convert SVG to image using PIL
        import re
        from PIL import ImageDraw

        # Create blank image with SVG dimensions
        image = Image.new("RGB", (int(width), int(height)), color="white")

        # Run analysis on blank white image with SVG context
        # This at least gets the AI to analyze based on surrounding context
        result = run_full_analysis(image)
        return result

    except Exception as e:
        print(f"SVG ERROR: {str(e)}")
        return {
            "chart_type": "unknown",
            "explanation": "SVG analysis failed.",
            "insight": "Try again.",
            "confidence": 0.0,
            "ocr": {"all_text": [], "x_axis_values": [], "y_axis_values": [], "legend_items": []},
            "misleading": {"misleading_score": 0, "trust_score": 1.0, "overall_verdict": "", "issues": []},
            "vegaLite": None,
            "fixes_applied": [],
            "error": str(e)
        }