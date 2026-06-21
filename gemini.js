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
            resolve({
                inlineData: {
                    data: base64Data,
                    mimeType: blob.type || "audio/webm"
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
async function generateBookOutline({ elderName, numPages, tone, artStyle, transcriptText, audioFile }, onLog = () => {}) {
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
    let promptText = `
You are a warm, sensitive memoir writer and professional biographer.
Your task is to analyze the provided life story of the elderly narrator, "${elderName}", and outline a beautiful virtual children's style memoir picture book.
The book must have exactly ${numPages} chapters/pages, structured chronologically or thematically to cover their life journey.

Storytelling Tone: ${tone}
Visual Art Style for illustrations: ${artStyle}

Create:
1. A beautiful, nostalgic main title for the book.
2. A meaningful subtitle or dedication.
3. Exactly ${numPages} chapters, each corresponding to a single page in the final book. For each chapter, provide:
   - "title": A warm, descriptive title (e.g. "Chapter 1: The Red Brick House on Oak Street")
   - "summary": A brief description (2-3 sentences) of what life milestones, stories, or reflections from the input should be detailed on this page.

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

    // Process media vs transcript text
    if (audioFile) {
        onLog(`Converting media file (${(audioFile.size / (1024 * 1024)).toFixed(2)} MB) to base64...`);
        const mediaPart = await fileToGenerativePart(audioFile);
        onLog("Media file processed. Sending audio and analysis prompt to Gemini (this may take 15-40 seconds to process audio narration)...");
        contents.push({
            parts: [
                mediaPart,
                { text: `${promptText}\n\nAnalyze the uploaded interview media above to extract the stories.` }
            ]
        });
    } else {
        onLog("Sending transcript text and prompt to Gemini...");
        contents.push({
            parts: [
                { text: `${promptText}\n\nHere is the raw interview transcript/notes:\n"""\n${transcriptText}\n"""` }
            ]
        });
    }

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
async function generateFullBook({ bookTitle, bookSubtitle, elderName, tone, artStyle, transcriptText, audioFile, chaptersEdited }, onLog = () => {}) {
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
        contents.push({
            parts: [
                mediaPart,
                { text: `${promptText}\n\nReference the uploaded interview media above for specific dialogue, dates, or feelings to include.` }
            ]
        });
    } else {
        contents.push({
            parts: [
                { text: `${promptText}\n\nReference the raw transcript/notes below for details:\n"""\n${transcriptText}\n"""` }
            ]
        });
    }

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
