/**
 * LLM Service Module
 * Sends requests to the local Python (Flask) backend, which calls Vertex AI
 * via google-genai using Application Default Credentials (ADC). No API key is
 * needed in the browser — authentication and billing happen server-side.
 */

// Where the local backend (backend/server.py) is listening.
const BACKEND_BASE_URL = "http://127.0.0.1:5000";
const GEMINI_REQUEST_TIMEOUT_MS = 60000;

/**
 * Sends a Gemini-REST-style payload to the backend and returns the parsed
 * response in the same shape the rest of this module expects
 * ({ candidates: [{ content: { parts: [{ text }] } }] }).
 * @param {string} _apiKey Unused (ADC handles auth); kept for call-site compatibility.
 * @param {Object} payload { contents, generationConfig }
 */
async function geminiGenerateContent(_apiKey, payload) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(`${BACKEND_BASE_URL}/api/generate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
    } catch (error) {
        if (error && error.name === "AbortError") {
            throw new Error(`Request timed out after ${Math.floor(GEMINI_REQUEST_TIMEOUT_MS / 1000)} seconds.`);
        }
        throw new Error(
            "Could not reach the local AI backend. Start it with: " +
            "python3 backend/server.py"
        );
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error?.message || response.statusText;
        throw new Error(`API Error (${response.status}): ${errMsg}`);
    }

    return response.json();
}

/* ============================================================================
 * VOICE — Chirp 3: HD text-to-speech via the backend.
 * ========================================================================== */

let _ttsAudio = null;      // The single <audio> element we reuse for the agent voice.
let _ttsToken = 0;         // Bumped on every new/stop request to invalidate stale ones.
let _ttsController = null;  // AbortController for the in-flight /api/tts fetch.
let _ttsResolve = null;     // Resolver for the active playback promise (so stop settles it).

/**
 * Synthesizes warm, natural speech with a Chirp 3 HD voice and plays it.
 * Resolves when playback finishes (or immediately if it can't play).
 * Only ONE utterance can be active at a time — starting a new one (or calling
 * stopChirp) cancels any pending request or playing audio so they never overlap.
 * @param {string} text
 * @param {Object} [opts] { voice, rate, onStart, onEnd }
 * @returns {Promise<void>}
 */
async function speakWithChirp(text, opts = {}) {
    const clean = (text || "").trim();
    if (!clean) return;

    // Stop anything currently playing or pending, and claim this generation.
    stopChirp();
    const myToken = ++_ttsToken;
    const controller = new AbortController();
    _ttsController = controller;

    let data;
    try {
        const response = await fetch(`${BACKEND_BASE_URL}/api/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: clean, voice: opts.voice, rate: opts.rate }),
            signal: controller.signal
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || response.statusText);
        }
        data = await response.json();
    } catch (error) {
        // Superseded/cancelled: stay silent and don't fire onEnd side effects.
        if (myToken !== _ttsToken || (error && error.name === "AbortError")) {
            return;
        }
        // Gemini-only voice: no browser fallback. Log and end gracefully.
        console.warn("Chirp TTS failed:", error);
        if (typeof opts.onEnd === "function") opts.onEnd();
        return;
    }

    // A newer request (or stop) happened while we were fetching — discard this one.
    if (myToken !== _ttsToken) return;

    return new Promise((resolve) => {
        // If this utterance was superseded between fetch and play, abort quietly.
        if (myToken !== _ttsToken) {
            resolve();
            return;
        }
        const audio = new Audio(`data:${data.mimeType || "audio/mpeg"};base64,${data.audioContent}`);
        _ttsAudio = audio;
        _ttsResolve = resolve;
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            if (_ttsAudio === audio) _ttsAudio = null;
            if (_ttsResolve === resolve) _ttsResolve = null;
            if (typeof opts.onEnd === "function") opts.onEnd();
            resolve();
        };
        audio.onended = finish;
        audio.onerror = finish;
        if (typeof opts.onStart === "function") audio.onplay = () => opts.onStart();
        audio.play().catch(() => finish());
    });
}

/** Stops any in-progress agent speech (pending request, Chirp audio, and browser TTS). */
function stopChirp() {
    // Invalidate any pending/playing utterance.
    _ttsToken++;
    if (_ttsController) {
        try { _ttsController.abort(); } catch (_) { /* ignore */ }
        _ttsController = null;
    }
    if (_ttsAudio) {
        try { _ttsAudio.pause(); } catch (_) { /* ignore */ }
        _ttsAudio.onended = null;
        _ttsAudio.onerror = null;
        _ttsAudio = null;
    }
    // Settle any pending playback promise so awaiting callers don't hang.
    if (_ttsResolve) {
        const r = _ttsResolve;
        _ttsResolve = null;
        r();
    }
}

/* ============================================================================
 * IMAGE — chapter illustrations via Vertex AI Imagen (cheap Fast tier) on the
 * backend, billed to the project's credits.
 * ========================================================================== */

/**
 * Generates one chapter illustration and returns a data: URL (base64 PNG/JPEG).
 * @param {string} prompt
 * @param {Object} [opts] { aspectRatio }
 * @returns {Promise<string>} a data URL usable directly as an <img> src
 */
async function generateChapterImage(prompt, opts = {}) {
    const response = await fetch(`${BACKEND_BASE_URL}/api/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, aspectRatio: opts.aspectRatio || "4:3" })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || response.statusText);
    }
    const data = await response.json();
    return data.imageDataUrl;
}

/* ============================================================================
 * CONVERSATIONAL INTERVIEWER — a warm agent with a hidden agenda.
 * One fast Gemini call per turn returns what to say next plus internal
 * bookkeeping (which life areas are covered, whether we have enough).
 * ========================================================================== */

// The life areas the interviewer secretly tries to cover across the chat.
const LIFE_COVERAGE_TOPICS = [
    "childhood",
    "family_and_parents",
    "school_and_youth",
    "work_and_career",
    "love_and_marriage",
    "children_and_parenthood",
    "friends_and_community",
    "hardships_and_resilience",
    "proudest_moments",
    "beliefs_and_wisdom",
    "hobbies_and_joys",
    "present_day"
];

/**
 * Produces the interviewer's opening line — a single, simple, warm question
 * grounded in whatever the person already told us about themselves.
 * @param {Object} profile { name, age, gender, ethnicity }
 * @param {Object} [persona] { description, style } — who is doing the interviewing
 * @returns {Promise<{ say: string }>}
 */
async function startConversation(profile, persona = null, priorNotes = "") {
    const personaLine = persona && persona.description
        ? `\nYOU ARE PLAYING THIS CHARACTER (stay in character warmly, let it color your word choice and energy, but never overdo an accent in text): ${persona.description}. ${persona.style || ""}`
        : "";

    const notesLine = priorNotes && priorNotes.trim()
        ? `\n\nWHAT WE ALREADY KNOW ABOUT THEM (from notes they shared — don't make them repeat it; build on it and reference it warmly):\n"""\n${priorNotes.trim().slice(0, 4000)}\n"""`
        : "";

    const payload = {
        contents: [
            {
                parts: [
                    {
                        text: `You are "Echo", a warm, gentle, emotionally intelligent companion who helps an elderly person tell the story of their life so it can become a beautiful keepsake picture book. You are talking out loud, like a kind grandchild or a caring biographer sitting beside them with tea.${personaLine}

The person:
${JSON.stringify(profile, null, 2)}${notesLine}

Write your VERY FIRST spoken line. Rules:
- Greet them warmly by first name.
- If we already know things about them (above), warmly reference one detail so they feel known, then ask ONE simple question that goes a little deeper — don't ask what we already know.
- Otherwise keep it short and easy — 1 to 2 sentences, then ONE simple, inviting opening question (where they grew up, a happy early memory, what kind of child they were). Not heavy.
- Sound human and spoken, not formal. Use contractions. No emojis, no markdown, no stage directions.

Return strict JSON: { "say": "your spoken opening line" }`
                    }
                ]
            }
        ],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: { say: { type: "STRING" } },
                required: ["say"]
            }
        }
    };

    const data = await geminiGenerateContent("adc", payload);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Could not start the conversation.");
    return JSON.parse(text);
}

/**
 * Advances the conversation by one turn. Given the full history and what has
 * been covered so far, the agent reacts warmly to the last answer and asks the
 * next natural question — while secretly steering toward full life coverage.
 *
 * @param {Object} params
 * @param {Object} params.profile
 * @param {Array<{role:'agent'|'user', text:string}>} params.history
 * @param {string[]} params.covered  Topics already explored (from LIFE_COVERAGE_TOPICS)
 * @param {number} params.turnCount  How many user answers so far
 * @param {number} [params.minTurns=8]  Don't wrap up before this many answers
 * @param {Object} [params.persona]  { description, style } interviewer character
 * @returns {Promise<{ say:string, covered:string[], newly_covered:string[], suggested_answer:string, enough:boolean }>}
 */
async function continueConversation({ profile, history, covered = [], turnCount = 0, minTurns = 8, persona = null, priorNotes = "" }) {
    const transcript = history
        .map((m) => `${m.role === "agent" ? "ECHO" : "THEM"}: ${m.text}`)
        .join("\n");

    const personaLine = persona && persona.description
        ? `\nYOU ARE PLAYING THIS CHARACTER (stay in character warmly — let it gently color your word choice and energy, but keep it natural and never caricature an accent in text): ${persona.description}. ${persona.style || ""}`
        : "";

    const notesLine = priorNotes && priorNotes.trim()
        ? `\n\nBACKGROUND NOTES WE ALREADY HAVE ABOUT THEM (build on these; don't make them repeat what's here):\n"""\n${priorNotes.trim().slice(0, 4000)}\n"""`
        : "";

    const lastUser = [...history].reverse().find((m) => m.role === "user");
    const lastUserText = lastUser ? lastUser.text : "";

    const payload = {
        contents: [
            {
                parts: [
                    {
                        text: `You are "Echo", a warm, curious, emotionally intelligent companion interviewing an elderly person to gently draw out their life story for a keepsake picture book. Think of yourself as part caring grandchild, part skilled psychologist: you make them feel safe, truly listened to, and delighted to keep talking — so much that they happily wander into stories and tangents.${personaLine}

THE PERSON:
${JSON.stringify(profile, null, 2)}${notesLine}

CONVERSATION SO FAR:
${transcript || "(none yet)"}

LIFE AREAS TO EVENTUALLY COVER (your secret checklist):
${JSON.stringify(LIFE_COVERAGE_TOPICS)}

ALREADY COVERED: ${JSON.stringify(covered)}
ANSWERS GIVEN SO FAR: ${turnCount}
THEIR LAST WORDS: "${lastUserText}"

YOUR JOB FOR THIS TURN — produce the next thing you SAY OUT LOUD. It must:
1. React first, genuinely: reflect warmth and real interest in what they just said — acknowledge a feeling, echo a specific detail, or react like a delighted listener ("oh, that gave me chills", "a whole dairy farm, my goodness"). Make them feel truly heard.
2. Then ask exactly ONE question. Prefer to go DEEPER when they've opened a rich or emotional thread — dig like a loving, curious psychologist. Use questions that pull out the story and the feeling behind it:
   - "Why do you think that mattered so much to you?"
   - "How did that feel, right in that moment?"
   - "Who was there with you?"
   - "What do you remember most — a sound, a smell, a face?"
   - "What happened next?"
   Encourage them to ramble and wander; tangents are GOLD, follow them.
3. To get their WHOLE story, sometimes pivot with a delightful, concrete "big life" question, especially toward an uncovered area — e.g. did you ever fall in love or marry, do you have children, what's the accomplishment you're proudest of, who shaped you most, a historic moment you lived through (a war, the moon landing, a big move), your hardest season, your happiest ordinary day, what you believe about life now.
4. Keep momentum: if they gave a short or shy answer, gently invite more ("tell me a little more about that?") rather than jumping away.

STYLE:
- Spoken, warm, natural, and SHORT (1-3 sentences total). Use contractions. Sound like a real person who's leaning in, never a form or a survey.
- Exactly one question per turn. Never stack questions.
- No emojis, no markdown, no stage directions, no quotes around the question.
- Vary phrasing every time; never sound formulaic or repetitive.

ALSO DECIDE:
- "newly_covered": which checklist topics this exchange now touches (can be empty).
- "enough": true ONLY if we've had at least ${minTurns} answers AND most major life areas are covered. Otherwise false. Never rush — keep the conversation flowing and human.
- "suggested_answer": a short, plausible first-person example answer THEY might give to your question (3-4 sentences, "I" voice) so a tired person could start from it. Plain text.

Return strict JSON:
{
  "say": "what Echo says next (warm reaction + one question)",
  "newly_covered": ["topic", ...],
  "enough": false,
  "suggested_answer": "first-person example answer"
}`
                    }
                ]
            }
        ],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    say: { type: "STRING" },
                    newly_covered: { type: "ARRAY", items: { type: "STRING" } },
                    enough: { type: "BOOLEAN" },
                    suggested_answer: { type: "STRING" }
                },
                required: ["say", "newly_covered", "enough", "suggested_answer"]
            }
        }
    };

    const data = await geminiGenerateContent("adc", payload);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("The conversation could not continue.");
    const parsed = JSON.parse(text);
    const newly = Array.isArray(parsed.newly_covered) ? parsed.newly_covered : [];
    parsed.covered = Array.from(new Set([...(covered || []), ...newly]));
    return parsed;
}

/**
 * Steers the conversation onto a new subject — either one the person typed
 * ("my marriage", "let's talk about my parents") or, if blank, a fresh topic
 * Echo picks from the uncovered life areas. Echo gracefully pivots and asks a
 * warm, inviting opening question about it.
 *
 * @param {Object} params
 * @param {Object} params.profile
 * @param {Array<{role:'agent'|'user', text:string}>} params.history
 * @param {string[]} params.covered
 * @param {string} [params.topic]  what the person wants to talk about ("" = surprise)
 * @param {Object} [params.persona] { description, style }
 * @returns {Promise<{ say:string, covered:string[], newly_covered:string[], suggested_answer:string }>}
 */
async function steerConversation({ profile, history, covered = [], topic = "", persona = null }) {
    const transcript = history
        .map((m) => `${m.role === "agent" ? "ECHO" : "THEM"}: ${m.text}`)
        .join("\n");

    const personaLine = persona && persona.description
        ? `\nYOU ARE PLAYING THIS CHARACTER (warmly, gently colors your tone): ${persona.description}. ${persona.style || ""}`
        : "";

    const directive = topic && topic.trim()
        ? `The person has asked to change the subject and talk about: "${topic.trim()}". Warmly and naturally pivot to THAT subject now, and ask one inviting opening question about it.`
        : `The person wants a fresh subject. Pick a NEW life area they haven't really covered yet (look at the checklist and what's missing), or a delightful big-life question (marriage, children, proudest moment, a historic event they lived through, their biggest turning point). Warmly pivot and ask one inviting opening question about it.`;

    const payload = {
        contents: [
            {
                parts: [
                    {
                        text: `You are "Echo", a warm, emotionally intelligent companion gently drawing out an elderly person's life story for a keepsake book.${personaLine}

THE PERSON:
${JSON.stringify(profile, null, 2)}

CONVERSATION SO FAR:
${transcript || "(just getting started)"}

LIFE AREAS CHECKLIST: ${JSON.stringify(LIFE_COVERAGE_TOPICS)}
ALREADY COVERED: ${JSON.stringify(covered)}

${directive}

STYLE:
- A brief, warm one-line transition (e.g. "Oh, I'd love to hear about that.") then ONE inviting question.
- Spoken, natural, short. Contractions. No emojis, markdown, or stage directions.

Return strict JSON:
{
  "say": "Echo's spoken pivot + one question",
  "newly_covered": ["topic", ...],
  "suggested_answer": "a short first-person example answer they could start from"
}`
                    }
                ]
            }
        ],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    say: { type: "STRING" },
                    newly_covered: { type: "ARRAY", items: { type: "STRING" } },
                    suggested_answer: { type: "STRING" }
                },
                required: ["say", "newly_covered", "suggested_answer"]
            }
        }
    };

    const data = await geminiGenerateContent("adc", payload);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Could not switch topics.");
    const parsed = JSON.parse(text);
    const newly = Array.isArray(parsed.newly_covered) ? parsed.newly_covered : [];
    parsed.covered = Array.from(new Set([...(covered || []), ...newly]));
    return parsed;
}

/* ----------------------------------------------------------------------------
 * VOICE PERSONA — map a free-text description (e.g. "a warm young Indian man")
 * to a concrete Chirp 3 HD voice + locale, used for BOTH the interviewer voice
 * and the storybook narration. Falls back to a gentle default voice.
 * -------------------------------------------------------------------------- */

const CHIRP_FEMALE_VOICES = [
    "Achernar", "Aoede", "Autonoe", "Callirrhoe", "Despina", "Erinome", "Gacrux",
    "Kore", "Laomedeia", "Leda", "Pulcherrima", "Sulafat", "Vindemiatrix", "Zephyr"
];
const CHIRP_MALE_VOICES = [
    "Achird", "Algenib", "Algieba", "Alnilam", "Charon", "Enceladus", "Fenrir",
    "Iapetus", "Orus", "Puck", "Rasalgethi", "Sadachbia", "Schedar", "Umbriel", "Zubenelgenubi"
];
// English locales Chirp 3 HD supports, for accent matching.
const CHIRP_EN_LOCALES = ["en-US", "en-IN", "en-GB", "en-AU"];

const DEFAULT_VOICE = { voiceName: "en-US-Chirp3-HD-Aoede", languageCode: "en-US", description: "", style: "" };

/**
 * Asks Gemini to translate a persona description into a concrete Chirp voice.
 * @param {string} description e.g. "a warm young Indian man", "a kind older British woman"
 * @returns {Promise<{ voiceName, languageCode, description, style }>}
 */
async function resolveInterviewerPersona(description) {
    const desc = (description || "").trim();
    if (!desc) return { ...DEFAULT_VOICE };

    const payload = {
        contents: [
            {
                parts: [
                    {
                        text: `Map a described speaker to the best matching Google Chirp 3 HD voice.

DESCRIPTION: "${desc}"

Available English accent locales: ${JSON.stringify(CHIRP_EN_LOCALES)} (en-IN = Indian English, en-GB = British, en-AU = Australian, en-US = American/default).
Female voice names: ${JSON.stringify(CHIRP_FEMALE_VOICES)}
Male voice names: ${JSON.stringify(CHIRP_MALE_VOICES)}

Pick:
- "languageCode": best accent locale for the description (default en-US if unclear).
- "gender": "male" or "female" implied by the description (default female if unclear).
- "voiceName": choose ONE name from the matching gender list that fits the age/energy (younger/brighter vs older/warmer). For a young person prefer brighter voices (e.g. Puck, Aoede, Leda); for an older person prefer warmer ones (e.g. Charon, Gacrux, Umbriel).
- "style": a 4-8 word note on their speaking energy (e.g. "warm, youthful, gentle Indian cadence").

Return strict JSON: { "languageCode": "...", "gender": "...", "voiceName": "...", "style": "..." }`
                    }
                ]
            }
        ],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    languageCode: { type: "STRING" },
                    gender: { type: "STRING" },
                    voiceName: { type: "STRING" },
                    style: { type: "STRING" }
                },
                required: ["languageCode", "gender", "voiceName", "style"]
            }
        }
    };

    try {
        const data = await geminiGenerateContent("adc", payload);
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = JSON.parse(text);

        let locale = CHIRP_EN_LOCALES.includes(parsed.languageCode) ? parsed.languageCode : "en-US";
        const pool = (parsed.gender || "").toLowerCase() === "male" ? CHIRP_MALE_VOICES : CHIRP_FEMALE_VOICES;
        const shortName = pool.includes(parsed.voiceName) ? parsed.voiceName : pool[0];

        return {
            voiceName: `${locale}-Chirp3-HD-${shortName}`,
            languageCode: locale,
            description: desc,
            style: parsed.style || ""
        };
    } catch (error) {
        console.warn("Persona resolution failed, using default voice:", error);
        return { ...DEFAULT_VOICE, description: desc };
    }
}

/**
 * Auth is handled server-side via ADC, so there is no browser-held key.
 * These helpers are kept so existing UI code keeps working; getApiKey returns
 * a truthy sentinel so key-gated flows proceed.
 */
async function loadApiKeyFromEnv() {
    return "adc";
}

function getApiKey() {
    return "adc";
}

function saveApiKey(_key) {
    // No-op: the backend authenticates with Application Default Credentials.
}

/**
 * Converts a File object into a base64 inline generative part
 * @param {File} file 
 * @returns {Promise<Object>} Generative part object
 */
function fileToGenerativePart(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Data = reader.result.split(',')[1];
            resolve({
                inlineData: {
                    data: base64Data,
                    mimeType: file.type
                },
            });
        };
        reader.onerror = (error) => {
            reject(new Error("Failed to read file: " + error.message));
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Converts an audio blob into an inline generative part.
 * @param {Blob} blob
 * @returns {Promise<Object>}
 */
function blobToGenerativePart(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Data = reader.result.split(',')[1];
            // Strip any codecs suffix (e.g. "audio/webm;codecs=opus") — Gemini
            // wants a clean container mime type like "audio/webm".
            const cleanMime = (blob.type || "audio/webm").split(";")[0].trim() || "audio/webm";
            resolve({
                inlineData: {
                    data: base64Data,
                    mimeType: cleanMime
                }
            });
        };
        reader.onerror = (error) => {
            reject(new Error("Failed to read audio blob: " + error.message));
        };
        reader.readAsDataURL(blob);
    });
}

/**
 * Transcribes short spoken audio to text using Gemini.
 * @param {Object} params
 * @param {Blob} params.audioBlob
 * @returns {Promise<string>}
 */
async function transcribeSpeechBlob({ audioBlob }) {
    let apiKey = getApiKey();
    if (!apiKey) {
        await loadApiKeyFromEnv();
        apiKey = getApiKey();
    }
    if (!apiKey) {
        throw new Error("Gemini API key is required for fallback transcription.");
    }

    const audioPart = await blobToGenerativePart(audioBlob);

    const payload = {
        contents: [
            {
                parts: [
                    audioPart,
                    {
                        text: "Transcribe this spoken audio faithfully. Return plain text only, no markdown, no explanation."
                    }
                ]
            }
        ]
    };

    const data = await geminiGenerateContent(apiKey, payload);
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
        throw new Error("No transcription text returned by Gemini.");
    }

    return textResponse.trim();
}

/**
 * Calls Gemini API to generate the book outline from transcript or audio
 * @param {Object} params 
 * @param {string} params.elderName
 * @param {number} params.numPages
 * @param {string} params.tone
 * @param {string} params.artStyle
 * @param {string} [params.transcriptText]
 * @param {File} [params.audioFile]
 * @param {Function} [onLog] Log callback for UI updates
 * @returns {Promise<Object>} Book Outline { title, subtitle, chapters: [{ title, summary }] }
 */
async function generateBookOutline({ elderName, numPages, tone, artStyle, transcriptText, audioFile, userReferencePicture }, onLog = () => {}) {
    let apiKey = getApiKey();
    if (!apiKey) {
        await loadApiKeyFromEnv();
        apiKey = getApiKey();
    }
    if (!apiKey) {
        throw new Error("Gemini API key is not configured. Please open settings and save your key.");
    }

    onLog("Preparing contents for Gemini...");
    
    let contents = [];
    let parts = [];
    
    let promptText = `
You are a warm, sensitive memoir writer and professional biographer.
Your task is to analyze the life-story conversation of the narrator, "${elderName}", and outline a beautiful keepsake memoir picture book.

Storytelling Tone: ${tone}
Visual Art Style for illustrations: ${artStyle}

CHAPTER STRUCTURE — choose this DYNAMICALLY from how the conversation actually went:
- Read the whole conversation and identify the most meaningful, distinct moments and eras of their life.
- Each chapter should be EITHER a life era/decade (e.g. "childhood on the farm", "the war years", "raising a family") OR a single pivotal event or story they clearly cared about (a wedding, a loss, a big move, a proudest accomplishment).
- Order the chapters in CHRONOLOGICAL order across their life (earliest to latest), ending near the present day.
- Only create chapters there's real material for — never invent events they didn't mention. Prefer the moments they spoke about with the most detail or feeling.
- Aim for roughly ${numPages} chapters, but use your judgment: use fewer if the story is short, or a few more if their life clearly needs them. Quality and meaning over hitting an exact count.

Create:
1. A beautiful, nostalgic main title for the book (drawn from their actual story).
2. A meaningful subtitle or dedication.
3. The chapters. For each chapter, provide:
   - "title": A warm, descriptive title (e.g. "Chapter 1: The Red Brick House on Oak Street")
   - "summary": 2-3 sentences describing the specific milestones, stories, people, and feelings from THIS person's conversation that belong on this page.

Produce structured JSON matching this schema:
{
  "title": "Title of the book",
  "subtitle": "A dedication or subtitle",
  "chapters": [
    {
      "title": "Chapter title",
      "summary": "Chapter summary"
    }
  ]
}
`;

    if (userReferencePicture) {
        promptText += `\n\nAn uploaded reference portrait photo of the narrator "${elderName}" is provided. Keep their age, physical features, hair, and style from the photo in mind when designing the visual focus and themes of the chapters.`;
        parts.push({
            inlineData: {
                mimeType: userReferencePicture.mimeType,
                data: userReferencePicture.data
            }
        });
    }

    // Process media vs transcript text
    if (audioFile) {
        onLog(`Converting media file (${(audioFile.size / (1024 * 1024)).toFixed(2)} MB) to base64...`);
        const mediaPart = await fileToGenerativePart(audioFile);
        onLog("Media file processed. Sending audio and analysis prompt to Gemini (this may take 15-40 seconds to process audio narration)...");
        parts.push(mediaPart);
        parts.push({ text: `${promptText}\n\nAnalyze the uploaded interview media above to extract the stories.` });
    } else {
        onLog("Sending transcript text and prompt to Gemini...");
        parts.push({ text: `${promptText}\n\nHere is the raw interview transcript/notes:\n"""\n${transcriptText}\n"""` });
    }

    contents.push({ parts });

    const payload = {
        contents: contents,
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    title: { type: "STRING" },
                    subtitle: { type: "STRING" },
                    chapters: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                title: { type: "STRING" },
                                summary: { type: "STRING" }
                            },
                            required: ["title", "summary"]
                        }
                    }
                },
                required: ["title", "subtitle", "chapters"]
            }
        }
    };

    try {
        const data = await geminiGenerateContent(apiKey, payload);
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!textResponse) {
            throw new Error("No content generated by Gemini. Check input size or key limits.");
        }

        onLog("Outline received and parsed successfully.");
        return JSON.parse(textResponse);
    } catch (error) {
        console.error("Gemini Outline Generation Error:", error);
        throw error;
    }
}

/**
 * Calls Gemini API to write the final storybook pages, narrative text, and image prompts
 * @param {Object} params 
 * @param {string} params.bookTitle
 * @param {string} params.bookSubtitle
 * @param {string} params.elderName
 * @param {string} params.tone
 * @param {string} params.artStyle
 * @param {string} [params.transcriptText]
 * @param {File} [params.audioFile]
 * @param {Array} params.chaptersEdited Edited chapter outline list
 * @param {Function} [onLog] Log callback for UI updates
 * @returns {Promise<Object>} Full book details { pages: [{ chapterTitle, narrative, imagePrompt }] }
 */
async function generateFullBook({ bookTitle, bookSubtitle, elderName, tone, artStyle, transcriptText, audioFile, chaptersEdited, userReferencePicture }, onLog = () => {}) {
    let apiKey = getApiKey();
    if (!apiKey) {
        await loadApiKeyFromEnv();
        apiKey = getApiKey();
    }
    if (!apiKey) {
        throw new Error("Gemini API key is not configured.");
    }

    onLog("Formulating final story script write-up...");

    let contents = [];
    let parts = [];
    
    let promptText = `
You are a master storyteller, writing a nostalgic virtual memoir picture book titled "${bookTitle}" (${bookSubtitle}), based on the life of "${elderName}".
Tone of voice: ${tone}
Illustration visual style: ${artStyle}

Here is the approved chapter-by-chapter outline:
${JSON.stringify(chaptersEdited, null, 2)}

For each chapter listed in the outline, your task is to write:
1. "chapterTitle": The final chapter title (refine if needed to be magical, e.g., "The First Summer at the Farm").
2. "narrative": Write 1 to 2 paragraphs of heartwarming, rich storytelling. Use first-person ("I") if it matches the elder's voice, or a warm third-person narrative. Write in a storybook style suitable for reading aloud to children and family. Connect the facts of the transcript into a touching scene.
3. "imagePrompt": A highly descriptive, single-paragraph text-to-image prompt to generate an illustration for this chapter page.
   - You MUST describe the concrete visual scene: character clothing, pose, objects, exact setting, background, and lighting.
   - You MUST incorporate the aesthetic: "${artStyle}".
   - Keep the visual style consistent across pages (e.g. "In the style of a soft vintage watercolor...").
   - DO NOT use abstract words (like "represents hope"). Describe concrete visual elements instead (e.g., "warm golden sunbeams shining through dusty windowpanes, lighting up an old wooden workbench").
`;

    if (userReferencePicture) {
        promptText += `
        
=== IMPORTANT: REFERENCE PHOTO INSTRUCTIONS ===
An uploaded reference portrait photo of the narrator "${elderName}" has been provided. 
1. Look closely at the person in the photo (their hair style, hair color, facial features, age, body type, expression, and any accessories like spectacles/glasses).
2. In EVERY chapter's "imagePrompt" where "${elderName}" is depicted, you MUST describe them using the exact physical characteristics identified in this photo (e.g., "a gentleman with a friendly oval face, short wispy white hair, wearing round thin wire-frame glasses and a cozy navy blue sweater").
3. Do NOT mention the photo directly in the prompt (e.g., do not say "matching the reference photo"). Instead, describe their actual physical features directly in the scene.
4. Keep these visual characteristics consistent across all chapters so the character maintains a highly stable and recognizable appearance matching the actual person.
`;
        parts.push({
            inlineData: {
                mimeType: userReferencePicture.mimeType,
                data: userReferencePicture.data
            }
        });
    }

    promptText += `

Produce structured JSON matching this schema:
{
  "pages": [
    {
      "chapterTitle": "Chapter Title",
      "narrative": "Story text...",
      "imagePrompt": "Detailed visual art generation prompt..."
    }
  ]
}
`;

    if (audioFile) {
        onLog("Re-loading audio file context for narrative generation...");
        const mediaPart = await fileToGenerativePart(audioFile);
        parts.push(mediaPart);
        parts.push({ text: `${promptText}\n\nReference the uploaded interview media above for specific dialogue, dates, or feelings to include.` });
    } else {
        parts.push({ text: `${promptText}\n\nReference the raw transcript/notes below for details:\n"""\n${transcriptText}\n"""` });
    }

    contents.push({ parts });

    const payload = {
        contents: contents,
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    pages: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                chapterTitle: { type: "STRING" },
                                narrative: { type: "STRING" },
                                imagePrompt: { type: "STRING" }
                            },
                            required: ["chapterTitle", "narrative", "imagePrompt"]
                        }
                    }
                },
                required: ["pages"]
            }
        }
    };

    try {
        onLog("Sending narrative expansion request to Gemini (this can take 10-25 seconds to write all chapters)...");
        const data = await geminiGenerateContent(apiKey, payload);
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!textResponse) {
            throw new Error("No memoir content was generated by Gemini.");
        }

        onLog("Storybook content generated successfully!");
        return JSON.parse(textResponse);
    } catch (error) {
        console.error("Gemini Story Generation Error:", error);
        throw error;
    }
}

/**
 * Generates three decade-specific interview questions.
 * @param {Object} params
 * @param {Object} params.profile
 * @param {string} params.decadeLabel
 * @param {string} [params.previousDecadeSummary]
 * @returns {Promise<Object>} { decadeTitle, focus, questions: string[] }
 */
async function generateDecadeInterviewQuestions({ profile, decadeLabel, previousDecadeSummary = "" }) {
    let apiKey = getApiKey();
    if (!apiKey) {
        await loadApiKeyFromEnv();
        apiKey = getApiKey();
    }
    if (!apiKey) {
        throw new Error("Gemini API key is not configured.");
    }

    const payload = {
        contents: [
            {
                parts: [
                    {
                        text: `You are interviewing someone to preserve their life story for future generations.

Profile:
${JSON.stringify(profile, null, 2)}

Current decade focus: ${decadeLabel}
Previous decade context summary: ${previousDecadeSummary || "No previous summary available yet."}

Generate exactly 3 emotionally intelligent and specific interview questions for this decade.
Rules:
- Ask open-ended questions.
- Ask about people, emotions, meaningful moments, and lessons.
- Keep each question under 28 words.
- Avoid yes/no phrasing.

Return strict JSON with this shape:
{
  "decadeTitle": "short decade title",
  "focus": "one-sentence focus",
  "questions": ["q1", "q2", "q3"]
}`
                    }
                ]
            }
        ],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    decadeTitle: { type: "STRING" },
                    focus: { type: "STRING" },
                    questions: {
                        type: "ARRAY",
                        minItems: 3,
                        maxItems: 3,
                        items: { type: "STRING" }
                    }
                },
                required: ["decadeTitle", "focus", "questions"]
            }
        }
    };

    const data = await geminiGenerateContent(apiKey, payload);
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
        throw new Error("No interview questions were generated.");
    }

    return JSON.parse(textResponse);
}

/**
 * Generates probing follow-up questions based on initial answers.
 * @param {Object} params
 * @param {Object} params.profile
 * @param {string} params.decadeLabel
 * @param {Array<{question:string,answer:string}>} params.baseQaPairs
 * @param {string} [params.previousDecadeSummary]
 * @param {number} [params.maxQuestions]
 * @returns {Promise<Object>} { probingQuestions: string[] }
 */
async function generateDecadeProbingQuestions({ profile, decadeLabel, baseQaPairs, previousDecadeSummary = "", maxQuestions = 5 }) {
    let apiKey = getApiKey();
    if (!apiKey) {
        await loadApiKeyFromEnv();
        apiKey = getApiKey();
    }
    if (!apiKey) {
        throw new Error("Gemini API key is not configured.");
    }

    const payload = {
        contents: [
            {
                parts: [
                    {
                        text: `You are generating deep but gentle follow-up interview prompts.

Profile:
${JSON.stringify(profile, null, 2)}

Current decade: ${decadeLabel}
Previous decade context summary: ${previousDecadeSummary || "No previous summary available yet."}

Base Q/A pairs for this decade:
${JSON.stringify(baseQaPairs, null, 2)}

Generate up to ${maxQuestions} probing questions that help uncover details, feelings, turning points, and legacy.
Rules:
- Questions must be respectful and non-judgmental.
- Avoid repeating base questions.
- Keep each question under 28 words.
- At least 3 questions, at most ${maxQuestions}.

Return strict JSON with this shape:
{
  "probingQuestions": ["q1", "q2", "q3"]
}`
                    }
                ]
            }
        ],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    probingQuestions: {
                        type: "ARRAY",
                        minItems: 3,
                        maxItems: maxQuestions,
                        items: { type: "STRING" }
                    }
                },
                required: ["probingQuestions"]
            }
        }
    };

    const data = await geminiGenerateContent(apiKey, payload);
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
        throw new Error("No probing questions were generated.");
    }

    return JSON.parse(textResponse);
}

/**
 * Generates a plausible first-person answer the narrator might give to an interview question.
 * Used by the "Answer with AI" helper so users can start from a draft and tweak it.
 * @param {Object} params
 * @param {Object} params.profile
 * @param {string} params.decadeLabel
 * @param {string} params.question
 * @param {string} [params.previousDecadeSummary]
 * @returns {Promise<string>} A first-person draft answer
 */
async function suggestInterviewAnswer({ profile, decadeLabel, question, previousDecadeSummary = "" }) {
    let apiKey = getApiKey();
    if (!apiKey) {
        await loadApiKeyFromEnv();
        apiKey = getApiKey();
    }
    if (!apiKey) {
        throw new Error("Gemini API key is not configured.");
    }

    const payload = {
        contents: [
            {
                parts: [
                    {
                        text: `You are helping a person answer a question about their own life, in their own first-person voice.

Profile:
${JSON.stringify(profile, null, 2)}

Decade of life: ${decadeLabel}
Context from earlier in their life: ${previousDecadeSummary || "None yet."}

Question: "${question}"

Write a warm, natural first-person answer (3 to 5 sentences) that this person might plausibly give.
Rules:
- Use "I" voice.
- Keep it specific and human, with a small sensory or emotional detail.
- Keep it gently plausible; do not invent extreme or unverifiable facts.
- Plain text only. No quotation marks, no markdown.`
                    }
                ]
            }
        ]
    };

    const data = await geminiGenerateContent(apiKey, payload);
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
        throw new Error("No answer was generated.");
    }

    return textResponse.trim();
}
