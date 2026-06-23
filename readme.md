# Echoes of a Lifetime — Interactive Memoir Book Creator

An artisanal, Apple-inspired interactive web application designed to preserve family heritage. Transform raw voice recordings, interview transcripts, letters, or dictations of family elders into beautifully written, custom-illustrated digital storybooks.

---

## 📖 Project Overview

**Echoes of a Lifetime** acts as a virtual book workshop. By entering memoirs or transcribing live interviews, the memoir engine structures raw memories into chronological chapters. It writes final prose in chosen emotional tones and paints matching visual illustrations in real time. The final keepsake is rendered as an interactive 3D double-page flipbook, complete with background ambient soundscapes, read-aloud narration, and export capabilities.

---

## ✨ Core Features

- **Double-Page interactive Book View**: A premium leather-cased 3D book spread displaying illustrations on the left page and narrative text (with classic drop caps) on the right.
- **AI Story Weaver (Google Gemini)**: Analyzes transcripts, organizes chronological outlines in a reviewing editor, and writes complete chapter prose.
- **Artisanal Illustration Presets (Pollinations AI)**: Generates visual canvases matching selected artistic styles, including *Nostalgic Watercolor*, *Classic Oil Painting*, *Pencil Sketch & Paper*, *Vintage Photograph*, and *Modern Digital Art*.
- **Dictation & Live Speech-to-Text**: Built-in support for the browser's Web Speech Recognition API for live recordings.
- **Sound Ambience Panels**: Toggleable background acoustic layers, including *Gentle Piano Music* and *Fireplace Crackling* with independent volume sliders.
- **Speech Synthesis (TTS) Read Aloud**: Reads book chapters aloud using warm acoustic voice options.
- **Secure Key Cache**: Client-side execution. Your Google Gemini API Key is stored in the browser's local cache (`localStorage`) and never leaves your computer.
- **Multi-Format Exports**: 
  - **Standalone HTML**: A portable, self-contained single-page version of the storybook.
  - **Printable PDF**: A clean, page-break optimized print-to-PDF configuration.
  - **JSON Keepsake**: Backup and reload book structure data locally.

---

## 🚀 How to Install and Run

Since the application is built entirely using vanilla web technologies (HTML5, Javascript, and CSS3), there is no heavy build system or installation phase.

### Option A: Running with a Local Server (Recommended)
Running through a local web server is highly recommended to enable browser microphone access for the **Live Dictation** feature.

1. **Clone the repository**:
   ```bash
   git clone https://github.com/AkshayG99/StoryBookGenerator.git
   cd StoryBookGenerator
   ```

2. **Start a local server**:
   *Using Python:*
   ```bash
   python3 -m http.server 8000
   ```
   *Using Node/npm:*
   ```bash
   npx serve .
   ```

3. **Open in browser**:
   Navigate to `http://localhost:8000` (or the port specified by the server).

### Optional: Configure Gemini key with `.env`
You can provide your Gemini key through a local `.env` file so the app can auto-load it.

1. Copy `.env.example` to `.env`
2. Set one of the supported variable names:

```dotenv
GEMINI_API_KEY=AIzaSy...
```

Notes:
- A key saved from the Settings modal (stored in browser localStorage) takes precedence over `.env`.
- `.env` is added to `.gitignore` and should never be committed.

### Option B: Double-click to Open
If you do not need live dictation (microphone permissions), you can run it instantly:
1. Double-click `index.html` to launch it in any modern web browser (Chrome, Safari, Edge, Firefox).

---

## 🛠️ Setup & Usage Guide

1. **Activate the Engine**:
   - Click the gear icon (`⚙️`) in the header to open the settings panel.
   - Enter your **Google Gemini API Key** and click **Activate Engine**.
   
2. **Configure Your Book**:
   - Provide the narrator's name (e.g., *Grandpa Joseph*).
   - Select an artistic illustration preset, storytelling tone, and target page length.

3. **Import Stories**:
   - Paste transcription notes, drop an audio file for transcription, or dictate directly via the microphone.
   - Click **Weave Outline** to invoke the Gemini API.

4. **Review & Refine Chapters**:
   - Check the outlined milestone chapters in the editor. Adjust titles and summary details as needed.
   - Click **Craft Memoir Book** to write the prose and paint the illustrations.

5. **Interact and Export**:
   - Use the slider, next/prev arrow buttons, or flip through the book viewport.
   - Enable ambient music and trigger read-aloud narrations.
   - Export your finished storybook using the **Export Book** dropdown.