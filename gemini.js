/**
 * Gemini API Service Module
 * Handles client-side API requests to Google Generative AI
 */

const GEMINI_MODEL = "gemini-1.5-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Retrieves the stored Gemini API key from local storage
 * @returns {string|null} The API key
 */
function getApiKey() {
    return localStorage.getItem("storybook_gemini_key");
}

/**
 * Saves the Gemini API key to local storage
 * @param {string} key 
 */
function saveApiKey(key) {
    localStorage.setItem("storybook_gemini_key", key);
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
    const apiKey = getApiKey();
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
        onLog("Media file processed. Sending audio and analysis prompt to Gemini 1.5 Flash (this may take 15-40 seconds to process audio narration)...");
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
        const response = await fetch(`${API_URL}?key=${apiKey}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error?.message || response.statusText;
            throw new Error(`API Error (${response.status}): ${errMsg}`);
        }

        const data = await response.json();
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
    const apiKey = getApiKey();
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
        onLog("Sending narrative expansion request to Gemini 1.5 Flash (this can take 10-25 seconds to write all chapters)...");
        const response = await fetch(`${API_URL}?key=${apiKey}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error?.message || response.statusText;
            throw new Error(`API Error (${response.status}): ${errMsg}`);
        }

        const data = await response.json();
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
