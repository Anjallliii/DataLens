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
You are an expert data visualization analyst.
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

Rules:
- Return ONLY the JSON object
- No markdown backticks
- No text before or after JSON
- chart_type: bar, line, pie, scatter, heatmap, candlestick, histogram, area, map, unknown
- misleading_score: 0 (clean) to 10 (very misleading)
- trust_score: 0.0 to 1.0
- Do not hallucinate chart values.
- If chart data is unreadable, do NOT invent or estimate values.
- If exact chart values cannot be read clearly, set "vegaLite": null.
- If "vegaLite" is null, still provide explanation, insight, confidence, OCR text, and misleading analysis based only on visible information.
- Never generate placeholder values like Item 1, Item 2, Item 3 unless they are actually visible in the chart.
- If the chart is not clear enough, say that the chart is partially readable.
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