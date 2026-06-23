"""
Local LLM backend for Transformative AI (TR.ai).

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
import json
import os

from flask import Flask, jsonify, request
from flask_cors import CORS
from google import genai
from google.genai import types
from google.cloud import texttospeech
from google.oauth2 import service_account

# --- Configuration -----------------------------------------------------------
# Support service account credentials provided via environment variable
credentials_json = os.environ.get("GOOGLE_CREDENTIALS_JSON")
credentials = None
if credentials_json:
    try:
        info = json.loads(credentials_json)
        scopes = ["https://www.googleapis.com/auth/cloud-platform"]
        credentials = service_account.Credentials.from_service_account_info(info, scopes=scopes)
        PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", info.get("project_id"))
    except Exception as e:
        print(f"Error parsing GOOGLE_CREDENTIALS_JSON: {e}")
        PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "project-4711618b-b483-407f-832")
else:
    PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "project-4711618b-b483-407f-832")

LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-west1")
MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# Warm, natural Chirp 3 HD voice used for the interviewer's spoken voice.
DEFAULT_TTS_VOICE = os.environ.get("TTS_VOICE", "en-US-Chirp3-HD-Aoede")

# Cheap, fast image model for chapter illustrations (~$0.02/image), billed to
# the project's credits. Imagen 4 Fast; falls back to Imagen 3 Fast.
IMAGE_MODEL = os.environ.get("IMAGE_MODEL", "imagen-4.0-fast-generate-001")
IMAGE_MODEL_FALLBACK = os.environ.get("IMAGE_MODEL_FALLBACK", "imagen-3.0-fast-generate-001")

# Initialize the Vertex AI client once. This relies on ADC having been set up via
#   gcloud auth application-default login, or service account credentials.
if credentials:
    client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION, credentials=credentials)
    # Cloud Text-to-Speech client (Chirp 3 HD voices), also authenticated via service account credentials.
    tts_client = texttospeech.TextToSpeechClient(credentials=credentials)
else:
    client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)
    # Cloud Text-to-Speech client (Chirp 3 HD voices), also authenticated via ADC.
    tts_client = texttospeech.TextToSpeechClient()

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


@app.route("/api/tts", methods=["POST"])
def tts():
    """Synthesize warm, natural speech with a Chirp 3: HD voice.

    Request:  { "text": "...", "voice": "en-US-Chirp3-HD-Aoede", "rate": 0.96 }
    Response: { "audioContent": "<base64 mp3>", "mimeType": "audio/mpeg" }
    """
    body = request.get_json(silent=True) or {}
    text = (body.get("text") or "").strip()
    if not text:
        return jsonify({"error": {"message": "No text provided."}}), 400

    voice_name = body.get("voice") or DEFAULT_TTS_VOICE
    try:
        speaking_rate = float(body.get("rate", 0.96))
    except (TypeError, ValueError):
        speaking_rate = 0.96
    speaking_rate = max(0.25, min(2.0, speaking_rate))

    # Language code is the first two hyphen-delimited segments, e.g. "en-US".
    language_code = "-".join(voice_name.split("-")[:2]) or "en-US"

    synthesis_input = texttospeech.SynthesisInput(text=text)
    voice = texttospeech.VoiceSelectionParams(
        language_code=language_code,
        name=voice_name,
    )
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=speaking_rate,
    )

    try:
        response = tts_client.synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config
        )
    except Exception as error:  # Surface a clean error to the frontend.
        return jsonify({"error": {"message": str(error)}}), 502

    audio_b64 = base64.b64encode(response.audio_content).decode("ascii")
    return jsonify({"audioContent": audio_b64, "mimeType": "audio/mpeg"})


@app.route("/api/image", methods=["POST"])
def image():
    """Generate a chapter illustration with Vertex AI Imagen (cheap Fast tier).

    Request:  { "prompt": "...", "aspectRatio": "4:3" }
    Response: { "imageDataUrl": "data:image/png;base64,...", "model": "..." }
    """
    body = request.get_json(silent=True) or {}
    prompt = (body.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": {"message": "No prompt provided."}}), 400

    aspect_ratio = body.get("aspectRatio") or "4:3"
    config = types.GenerateImagesConfig(number_of_images=1, aspect_ratio=aspect_ratio)

    last_error = None
    for model_name in (IMAGE_MODEL, IMAGE_MODEL_FALLBACK):
        try:
            result = client.models.generate_images(
                model=model_name, prompt=prompt, config=config
            )
            generated = result.generated_images
            if not generated:
                last_error = "Model returned no image (possibly filtered)."
                continue
            img = generated[0].image
            img_bytes = img.image_bytes
            mime = getattr(img, "mime_type", None) or "image/png"
            data_url = f"data:{mime};base64," + base64.b64encode(img_bytes).decode("ascii")
            return jsonify({"imageDataUrl": data_url, "model": model_name})
        except Exception as error:  # Try the fallback model, then surface error.
            last_error = str(error)

    return jsonify({"error": {"message": last_error or "Image generation failed."}}), 502


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
