"""
Local LLM backend for Echoes of a Lifetime.

Uses the google-genai SDK against Vertex AI with Application Default
Credentials (ADC), so requests are billed to your Google Cloud project
(and your $300 free credits) instead of an AI Studio API key.

It exposes a single endpoint, POST /api/generate, that accepts the same
payload shape the old browser code sent to the Gemini REST API
({ "contents": [...], "generationConfig": {...} }) and returns the same
response shape ({ "candidates": [{ "content": { "parts": [{ "text": ... }] }}]}),
so the frontend only needs to change where it sends the request.
"""

import base64
import os

from flask import Flask, jsonify, request
from flask_cors import CORS
from google import genai
from google.genai import types

# --- Configuration -----------------------------------------------------------
PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "project-4711618b-b483-407f-832")
LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-west1")
MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# Initialize the Vertex AI client once. This relies on ADC having been set up via
#   gcloud auth application-default login
client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)

app = Flask(__name__)
CORS(app)  # Allow the static frontend (served on a different port) to call us.


def _convert_contents(rest_contents):
    """Translate Gemini-REST-style `contents` into google-genai Content objects."""
    contents = []
    for entry in rest_contents or []:
        parts = []
        for part in entry.get("parts", []):
            if part.get("text") is not None:
                parts.append(types.Part.from_text(text=part["text"]))
            elif "inlineData" in part:
                inline = part["inlineData"]
                parts.append(
                    types.Part.from_bytes(
                        data=base64.b64decode(inline["data"]),
                        mime_type=inline.get("mimeType", "application/octet-stream"),
                    )
                )
        contents.append(types.Content(role=entry.get("role", "user"), parts=parts))
    return contents


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": MODEL, "project": PROJECT_ID, "location": LOCATION})


@app.route("/api/generate", methods=["POST"])
def generate():
    body = request.get_json(silent=True) or {}
    rest_contents = body.get("contents", [])
    gen_config = body.get("generationConfig", {}) or {}

    config = types.GenerateContentConfig()
    # Honor JSON mode so the model returns parseable structured output.
    if gen_config.get("responseMimeType"):
        config.response_mime_type = gen_config["responseMimeType"]

    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=_convert_contents(rest_contents),
            config=config,
        )
    except Exception as error:  # Surface a clean error to the frontend.
        return jsonify({"error": {"message": str(error)}}), 502

    text = response.text or ""

    # Return the same shape the frontend already knows how to parse.
    return jsonify(
        {
            "candidates": [
                {"content": {"parts": [{"text": text}]}}
            ]
        }
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="127.0.0.1", port=port, debug=False)
