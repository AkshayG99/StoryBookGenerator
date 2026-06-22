/**
 * Book Engine & UI Controller Module
 * Handles UI interactions, Speech-to-Text, Speech-to-Speech, layout modes, and exports
 */

document.addEventListener("DOMContentLoaded", () => {
    // --- Application State ---
    const state = {
        activeStep: 1, // 1: Import, 2: Interview, 3: Outline, 4: Book Viewer
        isInWizard: false, // Tracks if we are in wizard mode or landing mode
        elderName: "",
        elderAge: null,
        elderGender: "",
        elderEthnicity: "",
        artStyle: "",
        bookLength: 6,
        narrationTone: "",
        sourceTab: "paste",
        transcriptText: "",
        audioFile: null,
        interviewFlow: null,
        interviewQuestionCursor: 0,
        interviewAnswers: {},
        interviewDecadeSummaries: {},
        useFallbackSpeech: false,
        fallbackRecorder: null,
        fallbackChunks: [],
        fallbackStream: null,
        isFallbackRecording: false,
        bookOutline: null,
        generatedBook: null, // { title, subtitle, pages: [{ chapterTitle, narrative, imagePrompt, imageSrc }] }
        currentPageIndex: 0,
        isRecording: false,
        speechUtterance: null,
        // --- Conversational interview ("Echo") ---
        conversation: [],      // [{ role: 'agent'|'user', text }]
        coverage: [],          // life topics Echo has covered (hidden agenda)
        convTurnCount: 0,      // number of answers the person has given
        convEnough: false,     // Echo has gathered enough for a full book
        convBusy: false,       // a turn is in flight
        lastSuggested: "",     // last AI-suggested answer for "Help me answer"
        lastAgentText: "",     // last thing Echo said (for "Say that again")
        autoSendTimer: null,
        autoSendInterval: null,
        // --- Interviewer / narrator persona + voice ---
        interviewerDesc: "",   // free-text description the user typed
        interviewerVoice: null,    // resolved Chirp voice name e.g. en-IN-Chirp3-HD-Puck
        interviewerLang: "en-US",
        interviewerPersona: null,  // { description, style } for prompt flavor
        // --- Hands-free voice ---
        silenceTimer: null,
        handsFree: true
    };

    // --- DOM Elements ---
    // General
    const logoHome = document.getElementById("logo-home");
    const themeBtn = document.getElementById("btn-toggle-theme");
    const settingsBtn = document.getElementById("btn-settings");
    const settingsModal = document.getElementById("modal-settings");
    const closeSettingsBtn = document.getElementById("btn-close-settings");
    const saveSettingsBtn = document.getElementById("btn-save-settings");
    const apiKeyInput = document.getElementById("gemini-key");
    const toggleKeyVisibilityBtn = document.getElementById("btn-toggle-key-visibility");
    const loadingOverlay = document.getElementById("loading-overlay");
    const loadingOverlayTitle = document.getElementById("loading-overlay-title");
    const loadingOverlaySubtitle = document.getElementById("loading-overlay-subtitle");
    const generationLog = document.getElementById("gemini-generation-log");
    const toastContainer = document.getElementById("toast-container");
    
    // Panel Toggles
    const panelLanding = document.getElementById("panel-landing");
    const panelWizardContainer = document.getElementById("panel-wizard");
    const progressIndicators = {
        1: document.getElementById("step-indicator-1"),
        2: document.getElementById("step-indicator-2"),
        3: document.getElementById("step-indicator-3"),
        4: document.getElementById("step-indicator-4")
    };
    
    // Landing Page Buttons
    const startMemoirBtn = document.getElementById("btn-start-memoir");
    const viewSampleBtn = document.getElementById("btn-view-sample");
    
    // Panel 1: Import
    const panelStep1 = document.getElementById("panel-step-1");
    const panelStepInterview = document.getElementById("panel-step-interview");
    const backToLandingBtn = document.getElementById("btn-back-to-landing");
    const elderNameInput = document.getElementById("elder-name");
    const elderAgeInput = document.getElementById("elder-age");
    const elderGenderInput = document.getElementById("elder-gender");
    const elderEthnicityInput = document.getElementById("elder-ethnicity");
    const artStyleSelect = document.getElementById("illustration-style");
    const bookLengthSelect = document.getElementById("book-length");
    const toneSelect = document.getElementById("narration-tone");
    const interviewerPersonaInput = document.getElementById("interviewer-persona");
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");
    const pasteTranscriptArea = document.getElementById("input-transcript");
    const fileUploader = document.getElementById("file-uploader");
    const dropZone = document.getElementById("drop-zone");
    const selectedFileInfo = document.getElementById("selected-file-info");
    const fileNameSpan = document.getElementById("file-name");
    const removeFileBtn = document.getElementById("btn-remove-file");
    const recordBtn = document.getElementById("btn-record");
    const dictationStatus = document.getElementById("dictation-status");
    const dictationPreview = document.getElementById("dictation-preview");
    const generateOutlineBtn = document.getElementById("btn-generate-outline");

    // Panel 2: Interview
    const interviewDecadePill = document.getElementById("interview-decade-pill");
    const interviewProgressText = document.getElementById("interview-progress-text");
    const interviewQuestionTitle = document.getElementById("interview-question-title");
    const interviewQuestionText = document.getElementById("interview-question-text");
    const interviewAnswerInput = document.getElementById("interview-answer-input");
    const interviewRecordBtn = document.getElementById("btn-interview-record");
    const interviewDictationStatus = document.getElementById("interview-dictation-status");
    const backToStep1FromInterviewBtn = document.getElementById("btn-back-to-step1-from-interview");
    const replayInterviewQuestionBtn = document.getElementById("btn-replay-interview-question");
    const nextInterviewQuestionBtn = document.getElementById("btn-next-interview-question");
    const finishInterviewBtn = document.getElementById("btn-finish-interview");
    const suggestAnswerBtn = document.getElementById("btn-suggest-answer");
    const skipQuestionBtn = document.getElementById("btn-skip-question");
    const autoAdvanceBadge = document.getElementById("interview-autoadvance");
    const autoAdvanceNum = autoAdvanceBadge ? autoAdvanceBadge.querySelector(".autoadvance-num") : null;

    // Panel 2: Outline
    const panelStep2 = document.getElementById("panel-step-2");
    const outlineBookTitle = document.getElementById("outline-book-title");
    const outlineBookSubtitle = document.getElementById("outline-book-subtitle");
    const outlineChaptersList = document.getElementById("outline-chapters-list");
    const backToStep1Btn = document.getElementById("btn-back-to-step1");
    const generateBookBtn = document.getElementById("btn-generate-book");

    // Panel 3: Viewer
    const panelStep3 = document.getElementById("panel-step-3");
    const viewingBookTitle = document.getElementById("viewing-book-title");
    const viewingBookSubtitle = document.getElementById("viewing-book-subtitle");
    const pageIllustration = document.getElementById("page-illustration");
    const pageIllustrationSpinner = document.getElementById("img-spinner");
    const illustrationStyleLabel = document.getElementById("illustration-style-label");
    const regenerateImgBtn = document.getElementById("btn-regenerate-image");
    const pageChapterTitle = document.getElementById("page-chapter-title");
    const pageTextContainer = document.getElementById("page-text-container");
    const pageNumLeft = document.getElementById("page-num-left");
    const pageNumRight = document.getElementById("page-num-right");
    const prevPageBtn = document.getElementById("btn-prev-page");
    const nextPageBtn = document.getElementById("btn-next-page");
    const bookProgressRange = document.getElementById("book-progress-range");
    const bookProgressText = document.getElementById("book-progress-text");
    const readAloudBtn = document.getElementById("btn-read-aloud");
    const resetWizardBtn = document.getElementById("btn-reset-wizard");
    const ambienceBtn = document.getElementById("btn-ambience-settings");
    const ambiencePanel = document.getElementById("panel-ambience");
    
    // Audio / Ambience Elements
    const trackPiano = document.getElementById("track-piano");
    const audioPiano = document.getElementById("audio-piano");
    const volPiano = document.getElementById("vol-piano");
    const trackFireplace = document.getElementById("track-fireplace");
    const audioFireplace = document.getElementById("audio-fireplace");
    const volFireplace = document.getElementById("vol-fireplace");

    // Exports
    const exportPdfBtn = document.getElementById("export-pdf");
    const exportHtmlBtn = document.getElementById("export-html");
    const exportJsonBtn = document.getElementById("export-json");

    // --- Web Speech API (Speech Recognition) ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let networkRetryUsed = false;
    let dictationRetryTimer = null;

    // --- Interview auto-flow timers ---
    let autoMicTimer = null;
    let autoMicCountInterval = null;
    let autoAdvanceTimer = null;
    let autoAdvanceInterval = null;

    // --- Mic status helpers used by both speech modes ---
    function setRecordButtonsActive(active) {
        if (recordBtn) recordBtn.classList.toggle("recording", active);
        if (interviewRecordBtn) interviewRecordBtn.classList.toggle("recording", active);
    }

    function setMicStatus(message) {
        if (dictationStatus) dictationStatus.textContent = message;
        if (interviewDictationStatus) interviewDictationStatus.textContent = message;
    }

    function appendToActiveAnswer(text) {
        const safeText = (text || "").trim();
        if (!safeText) return;
        if (state.activeStep === 2 && interviewAnswerInput) {
            interviewAnswerInput.value += (interviewAnswerInput.value ? " " : "") + safeText;
        } else {
            pasteTranscriptArea.value += (pasteTranscriptArea.value ? " " : "") + safeText;
            state.transcriptText = pasteTranscriptArea.value;
            if (dictationPreview) {
                dictationPreview.innerHTML = pasteTranscriptArea.value;
                dictationPreview.scrollTop = dictationPreview.scrollHeight;
            }
        }
    }

    // --- Gemini MediaRecorder fallback ---
    async function startFallbackRecorder() {
        if (state.isFallbackRecording) {
            // Second tap = stop and transcribe
            if (state.fallbackRecorder && state.fallbackRecorder.state === "recording") {
                state.fallbackRecorder.stop();
            }
            return;
        }

        if (!getApiKey()) {
            settingsModal.classList.remove("hidden");
            showToast("Gemini API key required for fallback recording.", "error");
            return;
        }

        if (!navigator.mediaDevices || !window.MediaRecorder) {
            showToast("Your browser does not support audio recording.", "error");
            return;
        }

        try {
            state.fallbackChunks = [];
            state.fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? "audio/webm;codecs=opus"
                : MediaRecorder.isTypeSupported("audio/webm")
                ? "audio/webm"
                : "";

            state.fallbackRecorder = mimeType
                ? new MediaRecorder(state.fallbackStream, { mimeType })
                : new MediaRecorder(state.fallbackStream);

            state.fallbackRecorder.ondataavailable = (ev) => {
                if (ev.data && ev.data.size > 0) state.fallbackChunks.push(ev.data);
            };

            state.fallbackRecorder.onstop = async () => {
                setRecordButtonsActive(false);
                state.isFallbackRecording = false;
                setMicStatus("Transcribing with Gemini...");

                if (state.fallbackStream) {
                    state.fallbackStream.getTracks().forEach((t) => t.stop());
                    state.fallbackStream = null;
                }

                try {
                    const audioBlob = new Blob(state.fallbackChunks, {
                        type: state.fallbackRecorder.mimeType || "audio/webm"
                    });
                    const transcript = await transcribeSpeechBlob({ audioBlob });
                    appendToActiveAnswer(transcript);
                    showToast("Transcribed via Gemini.", "success");
                    setMicStatus("Got it. Moving on shortly — tap the timer to stay and edit.");
                    onAnswerCaptured();
                } catch (err) {
                    console.error("Gemini fallback transcription failed:", err);
                    showToast("Transcription failed: " + err.message, "error");
                    setMicStatus("Transcription failed. Type your answer or retry.");
                } finally {
                    state.fallbackRecorder = null;
                    state.fallbackChunks = [];
                }
            };

            state.fallbackRecorder.start();
            state.isFallbackRecording = true;
            setRecordButtonsActive(true);
            setMicStatus("Recording... Tap mic again to stop & transcribe.");
        } catch (err) {
            console.error("Fallback recorder failed to start:", err);
            showToast("Could not access microphone: " + err.message, "error");
            setMicStatus("Mic unavailable. Type your answer instead.");
            state.isFallbackRecording = false;
            setRecordButtonsActive(false);
        }
    }

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            state.isRecording = true;
            if (state.activeStep === 2) {
                if (interviewRecordBtn) interviewRecordBtn.classList.add("recording");
                if (interviewDictationStatus) interviewDictationStatus.textContent = "Listening... share your answer.";
            } else {
                recordBtn.classList.add("recording");
                dictationStatus.textContent = "Listening closely... Speak now.";
            }
            showToast("Recording started. Speak clearly.", "info");
        };

        recognition.onerror = (event) => {
            console.error("Speech Recognition Error:", event.error);

            const err = event.error || "unknown";

            if (err === "network") {
                // Edge blocks Bing speech service in many environments - go straight to Gemini fallback
                stopDictation(false);
                state.useFallbackSpeech = true;
                showToast("Edge speech service blocked. Auto-switching to Gemini recording — tap mic to start.", "info");
                setMicStatus("Gemini mode active. Tap mic to record, tap again to stop & transcribe.");
                // Auto-start the recorder immediately so user doesn't need to tap again
                setTimeout(() => startFallbackRecorder(), 300);
                return;
            }

            if (err === "not-allowed" || err === "service-not-allowed") {
                showToast("Microphone permission is blocked. Allow mic access in Edge site settings.", "error");
            } else if (err === "no-speech") {
                showToast("No speech detected. Try speaking a bit louder and closer to the microphone.", "info");
            } else {
                showToast(`Speech error: ${err}`, "error");
            }

            stopDictation(false);
        };

        recognition.onend = () => {
            stopDictation(false);
        };

        recognition.onresult = (event) => {
            let interimTranscript = "";
            let finalTranscript = "";

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            if (finalTranscript) {
                if (state.activeStep === 2 && interviewAnswerInput) {
                    interviewAnswerInput.value += (interviewAnswerInput.value ? " " : "") + finalTranscript;
                } else {
                    pasteTranscriptArea.value += (pasteTranscriptArea.value ? " " : "") + finalTranscript;
                    state.transcriptText = pasteTranscriptArea.value;
                }
            }

            // Hands-free: in conversation mode, auto-send after a pause of silence.
            if (state.activeStep === 2) {
                if (finalTranscript || interimTranscript) resetSilenceAutoSend();
            }

            if (state.activeStep !== 2) {
                dictationPreview.innerHTML = pasteTranscriptArea.value + 
                    (interimTranscript ? `<span style="opacity: 0.5;"> ${interimTranscript}</span>` : "");
                dictationPreview.scrollTop = dictationPreview.scrollHeight;
            }
        };
    } else {
        const dictateTabBtn = document.querySelector('[data-target="tab-dictate"]');
        if (dictateTabBtn) {
            dictateTabBtn.style.display = "none";
        }
    }

    // --- Sample Book Data ---
    const sampleBookData = {
        title: "The Whispering Oak",
        subtitle: "A Collection of Life Stories for My Family",
        pages: [
            {
                chapterTitle: "Chapter 1: The Whispers of Youth",
                narrative: "Back in 1948, the world felt much bigger and slower. In the backyard of our small farmhouse stood a giant old oak tree. I would spend hours underneath its branches, building little wooden boats out of twigs and leaves, launching them into imaginary streams. It was my private kingdom, where the leaves whispered stories of the places I would one day see and the adventures that lay ahead.",
                imagePrompt: "watercolor painting of young boy playing by oak tree",
                imageSrc: "assets/story_childhood.png",
                isSampleAsset: true
            },
            {
                chapterTitle: "Chapter 2: The Journey to New Horizons",
                narrative: "When I turned eighteen, I took my first job on the transcontinental railway. I still remember the raw power of the steam engine as it chugged through the green valleys and mountain passes. Looking out the window, watching the landscape shift and change, I realized that life itself is a journey, and every whistle blow was a promise of a new adventure.",
                imagePrompt: "oil painting of steam train traveling through valleys",
                imageSrc: "assets/story_adventure.png",
                isSampleAsset: true
            },
            {
                chapterTitle: "Chapter 3: The Golden Years of Comfort",
                narrative: "Now, many years later, my favorite place is here by the warm, crackling fireplace, sitting in rocking chairs with my beloved Sarah. The room is filled with the scent of hot tea and the quiet ticking of the grandfather clock. As I watch the embers glow, I look back on all the paths I took, knowing that the greatest adventure of all was the family we built together.",
                imagePrompt: "pencil sketch of elderly couple by fireplace",
                imageSrc: "assets/story_family.png",
                isSampleAsset: true
            }
        ]
    };

    // --- Setup Initialization ---
    async function hydrateApiKeyInput() {
        await loadApiKeyFromEnv();
        const savedKey = getApiKey();
        if (savedKey) {
            apiKeyInput.value = savedKey;
        }
    }

    function init() {
        setupEventListeners();
        showLandingPage();
        hydrateApiKeyInput();
    }

    // --- Helper Functions ---
    function showToast(message, type = "info") {
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        
        let icon = "fa-circle-info";
        if (type === "error") icon = "fa-circle-exclamation";
        if (type === "success") icon = "fa-circle-check";
        
        toast.innerHTML = `
            <i class="fa-solid ${icon}"></i>
            <span>${message}</span>
        `;
        toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(50px)";
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 4000);
    }

    function addLog(message, type = "info") {
        const logItem = document.createElement("div");
        logItem.className = `log-item ${type}`;
        
        let icon = "fa-spinner fa-spin";
        if (type === "success") icon = "fa-check";
        if (type === "error") icon = "fa-circle-xmark";
        
        logItem.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
        generationLog.appendChild(logItem);
        generationLog.scrollTop = generationLog.scrollHeight;
    }

    function showLandingPage() {
        state.isInWizard = false;
        panelWizardContainer.classList.add("hidden");
        panelLanding.classList.add("active");
        logoHome.style.cursor = "default";
        stopSpeech();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function startWizardFlow() {
        state.isInWizard = true;
        panelLanding.classList.remove("active");
        panelWizardContainer.classList.remove("hidden");
        logoHome.style.cursor = "pointer";
        setStep(1);
    }

    function setStep(step) {
        state.activeStep = step;

        // Stop any interview auto-flow when leaving the interview step.
        if (step !== 2 && typeof clearInterviewTimers === "function") {
            clearInterviewTimers();
        }
        
        // Update progress bar
        Object.keys(progressIndicators).forEach(key => {
            const ind = progressIndicators[key];
            if (parseInt(key) === step) {
                ind.className = "progress-step active";
            } else if (parseInt(key) < step) {
                ind.className = "progress-step completed";
            } else {
                ind.className = "progress-step";
            }
        });

        // Toggle panel displays
        panelStep1.classList.remove("active");
        panelStepInterview.classList.remove("active");
        panelStep2.classList.remove("active");
        panelStep3.classList.remove("active");

        if (step === 1) panelStep1.classList.add("active");
        if (step === 2) panelStepInterview.classList.add("active");
        if (step === 3) panelStep2.classList.add("active");
        if (step === 4) panelStep3.classList.add("active");

        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // --- Dictation Control ---
    function startDictation({ isRetry = false } = {}) {
        // If Web Speech previously failed with network error, use Gemini fallback
        if (state.useFallbackSpeech || !recognition) {
            startFallbackRecorder();
            return;
        }

        if (!isRetry) {
            networkRetryUsed = false;
        }

        if (!navigator.onLine) {
            showToast("You appear to be offline. Switching to Gemini recording fallback.", "error");
            state.useFallbackSpeech = true;
            startFallbackRecorder();
            return;
        }

        try {
            if (dictationPreview) dictationPreview.textContent = pasteTranscriptArea.value || "Speak now...";
            recognition.start();
        } catch (e) {
            console.error(e);
            showToast("Could not start microphone capture. Please try again.", "error");
        }
    }

    function stopDictation(shouldStopEngine = true) {
        // Fallback mode: delegate to fallback recorder
        if (state.useFallbackSpeech) {
            if (state.fallbackRecorder && state.fallbackRecorder.state === "recording") {
                state.fallbackRecorder.stop();
            }
            return;
        }

        if (!recognition) return;

        if (dictationRetryTimer) {
            clearTimeout(dictationRetryTimer);
            dictationRetryTimer = null;
        }

        state.isRecording = false;
        setRecordButtonsActive(false);
        setMicStatus("Recording stopped. Click microphone to record again.");

        if (shouldStopEngine) {
            try {
                recognition.stop();
            } catch (e) {}
        }
    }

    function computeDecadeRanges(age) {
        const safeAge = Math.max(1, Math.floor(age || 0));
        const ranges = [];

        for (let start = 0; start <= safeAge; start += 10) {
            const end = Math.min(start + 9, safeAge);
            ranges.push({
                key: `${start}-${end}`,
                label: `${start}s (${start}-${end})`,
                short: `${start}s`,
                start,
                end,
                questionSet: [],
                loaded: false,
                probingLoaded: false
            });
        }

        return ranges;
    }

    function getProfilePayload() {
        return {
            name: state.elderName,
            age: state.elderAge,
            gender: state.elderGender || "Not specified",
            ethnicity: state.elderEthnicity || "Not specified"
        };
    }

    // ============================================================
    // CONVERSATIONAL INTERVIEW — "Echo", a warm agent with a hidden
    // agenda to gently draw out the person's whole life story.
    // ============================================================

    const interviewChat = document.getElementById("interview-chat");
    const sendAnswerBtn = document.getElementById("btn-send-answer");
    const echoStateEl = document.getElementById("echo-state");
    const echoAvatar = document.getElementById("echo-avatar");
    const convoProgressFill = document.getElementById("convo-progress-fill");
    const convoProgressLabel = document.getElementById("convo-progress-label");

    const TOTAL_LIFE_TOPICS = 12; // mirrors LIFE_COVERAGE_TOPICS in gemini.js

    function setEchoState(text, mode) {
        if (echoStateEl) echoStateEl.textContent = text;
        if (echoAvatar) {
            echoAvatar.classList.remove("speaking", "listening", "thinking");
            if (mode) echoAvatar.classList.add(mode);
        }
    }

    function escapeHtml(str) {
        return String(str || "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[c]));
    }

    function addChatBubble(role, text) {
        if (!interviewChat) return null;
        const row = document.createElement("div");
        row.className = `chat-row ${role}`;
        row.innerHTML = role === "agent"
            ? `<div class="chat-avatar"><i class="fa-solid fa-feather-pointed"></i></div>
               <div class="chat-bubble agent">${escapeHtml(text)}</div>`
            : `<div class="chat-bubble user">${escapeHtml(text)}</div>`;
        interviewChat.appendChild(row);
        interviewChat.scrollTop = interviewChat.scrollHeight;
        return row;
    }

    function showTypingBubble() {
        if (!interviewChat) return null;
        const row = document.createElement("div");
        row.className = "chat-row agent typing";
        row.innerHTML = `<div class="chat-avatar"><i class="fa-solid fa-feather-pointed"></i></div>
            <div class="chat-bubble agent"><span class="typing-dots"><span></span><span></span><span></span></span></div>`;
        interviewChat.appendChild(row);
        interviewChat.scrollTop = interviewChat.scrollHeight;
        return row;
    }

    function updateCoverageUI() {
        const pct = Math.min(100, Math.round((state.coverage.length / TOTAL_LIFE_TOPICS) * 100));
        if (convoProgressFill) convoProgressFill.style.width = `${pct}%`;
        if (convoProgressLabel) {
            let label = "Just getting started";
            if (pct >= 85) label = "Your story is nearly complete";
            else if (pct >= 55) label = "Coming together beautifully";
            else if (pct >= 25) label = "We're getting somewhere";
            convoProgressLabel.textContent = label;
        }
    }

    function clearInterviewTimers() {
        if (autoMicTimer) { clearTimeout(autoMicTimer); autoMicTimer = null; }
        if (autoMicCountInterval) { clearInterval(autoMicCountInterval); autoMicCountInterval = null; }
        if (state.autoSendTimer) { clearTimeout(state.autoSendTimer); state.autoSendTimer = null; }
        if (state.autoSendInterval) { clearInterval(state.autoSendInterval); state.autoSendInterval = null; }
        if (state.silenceTimer) { clearTimeout(state.silenceTimer); state.silenceTimer = null; }
    }

    // Hands-free: when the person pauses for a moment, send what they said.
    function resetSilenceAutoSend() {
        if (state.silenceTimer) { clearTimeout(state.silenceTimer); state.silenceTimer = null; }
        if (!state.handsFree) return;
        setEchoState("Listening — your turn", "listening");
        state.silenceTimer = setTimeout(() => {
            state.silenceTimer = null;
            if (state.activeStep !== 2 || state.convBusy) return;
            if (!interviewAnswerInput.value.trim()) return;
            if (state.isRecording || state.isFallbackRecording) stopDictation(true);
            setTimeout(() => submitAnswer(), 250);
        }, 2600);
    }

    // Echo says something out loud (Chirp voice) and shows it as a chat bubble.
    async function echoSpeak(text, { arm = true } = {}) {
        state.lastAgentText = text;
        state.conversation.push({ role: "agent", text });
        persistConversation();
        addChatBubble("agent", text);
        setEchoState("Speaking…", "speaking");
        try {
            await speakWithChirp(text, { rate: 0.96, voice: state.interviewerVoice });
        } catch (_) { /* ignore voice errors */ }
        if (state.activeStep !== 2) return;
        if (arm) armMicForAnswer();
        else setEchoState("Ready", null);
    }

    function armMicForAnswer() {
        if (state.activeStep !== 2) return;
        if (state.isRecording || state.isFallbackRecording) return;
        setEchoState("Listening — your turn", "listening");
        setMicStatus("Your turn — just talk. (Tap the mic if it doesn't start.)");
        autoMicTimer = setTimeout(() => {
            if (state.activeStep === 2 && !state.isRecording && !state.isFallbackRecording && !state.convBusy) {
                startDictation();
            }
        }, 900);
    }

    // Called when a voice answer has been captured (transcription complete).
    function onAnswerCaptured() {
        if (state.activeStep !== 2) return;
        if (!interviewAnswerInput.value.trim()) return;
        // Gentle auto-send so elders don't have to hunt for a button —
        // but with a window to keep talking and add more.
        clearInterviewTimers();
        let remaining = 4;
        setMicStatus(`Sending in ${remaining}… keep talking to add more.`);
        state.autoSendInterval = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
                clearInterval(state.autoSendInterval); state.autoSendInterval = null;
                submitAnswer();
            } else {
                setMicStatus(`Sending in ${remaining}… keep talking to add more.`);
            }
        }, 1000);
    }

    async function initializeConversation() {
        state.conversation = [];
        state.coverage = [];
        state.convTurnCount = 0;
        state.convEnough = false;
        state.convBusy = false;
        state.lastSuggested = "";
        state.lastAgentText = "";
        if (interviewChat) interviewChat.innerHTML = "";
        if (interviewAnswerInput) interviewAnswerInput.value = "";
        if (finishInterviewBtn) finishInterviewBtn.classList.remove("pulse-ready");
        updateCoverageUI();

        setEchoState("Thinking…", "thinking");
        const typing = showTypingBubble();
        let opening;
        try {
            opening = await startConversation(getProfilePayload(), state.interviewerPersona);
        } catch (error) {
            if (typing) typing.remove();
            throw error;
        }
        if (typing) typing.remove();
        await echoSpeak(opening.say);
    }

    // Persist the running conversation so a story is never lost on refresh.
    function persistConversation() {
        try {
            localStorage.setItem("echo_conversation", JSON.stringify({
                profile: getProfilePayload(),
                persona: state.interviewerPersona,
                coverage: state.coverage,
                conversation: state.conversation,
                savedAt: Date.now()
            }));
        } catch (_) { /* storage may be full or blocked; non-fatal */ }
    }

    async function submitAnswer() {
        if (state.convBusy) return;
        const text = (interviewAnswerInput.value || "").trim();
        if (!text) {
            setMicStatus("Share a little something, then I'll keep us going.");
            return;
        }
        clearInterviewTimers();
        stopChirp();
        if (state.isRecording || state.isFallbackRecording) stopDictation(true);

        state.convBusy = true;
        state.conversation.push({ role: "user", text });
        persistConversation();
        addChatBubble("user", text);
        interviewAnswerInput.value = "";
        state.convTurnCount += 1;

        setEchoState("Thinking…", "thinking");
        setMicStatus("Echo is thinking about what you said…");
        const typing = showTypingBubble();

        try {
            const result = await continueConversation({
                profile: getProfilePayload(),
                history: state.conversation,
                covered: state.coverage,
                turnCount: state.convTurnCount,
                minTurns: 8,
                persona: state.interviewerPersona
            });
            if (typing) typing.remove();

            state.coverage = result.covered || state.coverage;
            state.lastSuggested = result.suggested_answer || "";
            updateCoverageUI();

            await echoSpeak(result.say);

            if (result.enough && !state.convEnough) {
                state.convEnough = true;
                markReadyToFinish();
            }
        } catch (error) {
            if (typing) typing.remove();
            console.error("Conversation turn failed:", error);
            showToast("Echo had trouble responding: " + error.message, "error");
            setMicStatus("Something hiccuped. Tap the mic to try again.");
        } finally {
            state.convBusy = false;
        }
    }

    function markReadyToFinish() {
        if (finishInterviewBtn) finishInterviewBtn.classList.add("pulse-ready");
        showToast("Echo has gathered a wonderful story. Create your book whenever you're ready.", "success");
    }

    function buildConversationTranscript() {
        const sections = [];
        sections.push(`Narrator profile: ${state.elderName}, age ${state.elderAge}, gender ${state.elderGender || "not specified"}, background ${state.elderEthnicity || "not specified"}.`);
        if (state.transcriptText && state.transcriptText.trim()) {
            sections.push(`Preloaded notes:\n${state.transcriptText.trim()}`);
        }
        const lines = [];
        state.conversation.forEach((m) => {
            if (m.role === "agent") lines.push(`Interviewer: ${m.text}`);
            else lines.push(`${state.elderName || "Narrator"}: ${m.text}`);
        });
        if (lines.length) sections.push(`Life-story conversation:\n${lines.join("\n")}`);
        return sections.join("\n\n");
    }

    async function generateOutlineFromInterview() {
        const combinedTranscript = buildConversationTranscript();
        const hasConversation = state.conversation.some(
            (m) => m.role === "user" && m.text && m.text.trim().length > 0
        );
        const hasPreloadedText = !!pasteTranscriptArea.value.trim();
        const hasUploadedMedia = !!state.audioFile;

        if (!hasConversation && !hasPreloadedText && !hasUploadedMedia) {
            showToast("Chat with Echo a little first, so there's a story to turn into a book.", "error");
            return;
        }

        state.transcriptText = combinedTranscript;

        generationLog.innerHTML = "";
        loadingOverlayTitle.textContent = "Weaving your story...";
        loadingOverlaySubtitle.textContent = "Echo is shaping your conversation into a beautiful memoir.";
        loadingOverlay.classList.remove("hidden");

        try {
            addLog("Reading back through your conversation...", "info");

            const outline = await generateBookOutline({
                elderName: state.elderName,
                numPages: state.bookLength,
                tone: state.narrationTone,
                artStyle: state.artStyle,
                transcriptText: state.transcriptText,
                audioFile: state.sourceTab === "upload" ? state.audioFile : null
            }, (msg) => addLog(msg, "info"));

            state.bookOutline = outline;
            addLog("Outline created successfully!", "success");

            setTimeout(() => {
                loadingOverlay.classList.add("hidden");
                renderOutlineEditor();
                setStep(3);
            }, 1000);
        } catch (error) {
            addLog(`Analysis failed: ${error.message}`, "error");
            showToast(`Generation error: ${error.message}`, "error");
            setTimeout(() => {
                loadingOverlay.classList.add("hidden");
            }, 2500);
        }
    }

    // --- File Drop Zone Handlers ---
    function handleFiles(files) {
        if (files.length === 0) return;
        const file = files[0];
        
        if (file.size > 15 * 1024 * 1024) {
            showToast("File size is too large (max 15MB). Please copy/paste text transcripts instead.", "error");
            return;
        }

        state.audioFile = file;
        fileNameSpan.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
        selectedFileInfo.classList.remove("hidden");
        dropZone.classList.add("hidden");
        showToast("Audio file attached successfully.", "success");
    }

    // --- Event Listeners Setup ---
    function setupEventListeners() {
        // Logo navigation back to home
        logoHome.addEventListener("click", () => {
            if (state.isInWizard) {
                if (confirm("Return to homepage? Any unsaved story changes will be lost.")) {
                    showLandingPage();
                }
            }
        });

        // Landing Page Actions
        startMemoirBtn.addEventListener("click", () => {
            startWizardFlow();
        });

        if (viewSampleBtn) {
            viewSampleBtn.addEventListener("click", () => {
                // Load pre-configured sample book
                state.generatedBook = sampleBookData;
                state.currentPageIndex = 0;
                
                state.isInWizard = true;
                panelLanding.classList.remove("active");
                panelWizardContainer.classList.remove("hidden");
                logoHome.style.cursor = "pointer";
                
                renderVirtualBook();
                setStep(4);
                showToast("Sample memoir book loaded. Flip through pages or try reading aloud!", "success");
            });
        }

        // Sample Book Preview Navigation on Landing Page
        let samplePageIndex = 0;
        const sampleSpreads = document.querySelectorAll(".sample-book-element .sample-spread");
        const samplePrevBtn = document.getElementById("btn-sample-prev");
        const sampleNextBtn = document.getElementById("btn-sample-next");
        const sampleIndicator = document.getElementById("sample-page-indicator");
        const sampleProgressRange = document.getElementById("sample-progress-range");

        function updateSamplePreview() {
            sampleSpreads.forEach((spread, idx) => {
                if (idx === samplePageIndex) {
                    spread.classList.add("active");
                } else {
                    spread.classList.remove("active");
                }
            });
            
            if (sampleIndicator) {
                const startPage = (samplePageIndex * 2) + 1;
                const endPage = (samplePageIndex * 2) + 2;
                sampleIndicator.textContent = `Pages ${startPage}-${endPage} of ${sampleSpreads.length * 2}`;
            }
            if (sampleProgressRange) {
                sampleProgressRange.value = samplePageIndex;
            }
            if (samplePrevBtn) {
                samplePrevBtn.disabled = samplePageIndex === 0;
            }
            if (sampleNextBtn) {
                sampleNextBtn.disabled = samplePageIndex === sampleSpreads.length - 1;
            }
        }

        if (samplePrevBtn) {
            samplePrevBtn.addEventListener("click", () => {
                if (samplePageIndex > 0) {
                    samplePageIndex--;
                    updateSamplePreview();
                }
            });
        }

        if (sampleNextBtn) {
            sampleNextBtn.addEventListener("click", () => {
                if (samplePageIndex < sampleSpreads.length - 1) {
                    samplePageIndex++;
                    updateSamplePreview();
                }
            });
        }

        if (sampleProgressRange) {
            sampleProgressRange.addEventListener("input", (e) => {
                samplePageIndex = parseInt(e.target.value);
                updateSamplePreview();
            });
        }

        updateSamplePreview();

        // Theme Toggler
        themeBtn.addEventListener("click", () => {
            document.body.classList.toggle("theme-dark");
            const isDark = document.body.classList.contains("theme-dark");
            themeBtn.innerHTML = isDark ? `<i class="fa-solid fa-sun text-gold"></i>` : `<i class="fa-solid fa-moon"></i>`;
        });

        // Settings Modal Toggles
        settingsBtn.addEventListener("click", () => settingsModal.classList.remove("hidden"));
        closeSettingsBtn.addEventListener("click", () => settingsModal.classList.add("hidden"));
        
        settingsModal.addEventListener("click", (e) => {
            if (e.target === settingsModal) settingsModal.classList.add("hidden");
        });

        // Toggle Key Visibility
        toggleKeyVisibilityBtn.addEventListener("click", () => {
            const isPassword = apiKeyInput.type === "password";
            apiKeyInput.type = isPassword ? "text" : "password";
            toggleKeyVisibilityBtn.innerHTML = isPassword ? `<i class="fa-solid fa-eye-slash"></i>` : `<i class="fa-solid fa-eye"></i>`;
        });

        // Save API Key
        saveSettingsBtn.addEventListener("click", () => {
            const key = apiKeyInput.value.trim();
            if (!key) {
                showToast("API Key cannot be blank.", "error");
                return;
            }
            saveApiKey(key);
            settingsModal.classList.add("hidden");
            showToast("API Key saved securely.", "success");
        });

        // Source Tab Switching
        tabButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                tabButtons.forEach(b => b.classList.remove("active"));
                tabContents.forEach(c => c.classList.remove("active"));

                btn.classList.add("active");
                const target = btn.getAttribute("data-target");
                document.getElementById(target).classList.add("active");
                state.sourceTab = target.replace("tab-", "");
                
                if (state.sourceTab !== "dictate" && state.isRecording) {
                    stopDictation();
                }
            });
        });

        // File Uploader
        dropZone.addEventListener("click", () => fileUploader.click());
        fileUploader.addEventListener("change", (e) => handleFiles(e.target.files));
        
        dropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropZone.classList.add("dragover");
        });

        dropZone.addEventListener("dragleave", () => {
            dropZone.classList.remove("dragover");
        });

        dropZone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropZone.classList.remove("dragover");
            handleFiles(e.dataTransfer.files);
        });

        removeFileBtn.addEventListener("click", () => {
            state.audioFile = null;
            selectedFileInfo.classList.add("hidden");
            dropZone.classList.remove("hidden");
            fileUploader.value = "";
            showToast("File attachment removed.", "info");
        });

        if (recordBtn) {
            recordBtn.addEventListener("click", () => {
                if (state.isRecording) {
                    stopDictation();
                } else {
                    startDictation();
                }
            });
        }

        // --- Step 1 Navigation ---
        const backToLandingBtn = document.getElementById("btn-back-to-landing");
        backToLandingBtn.addEventListener("click", () => {
            showLandingPage();
        });

        generateOutlineBtn.addEventListener("click", async () => {
            state.elderName = elderNameInput.value.trim();
            state.elderAge = parseInt(elderAgeInput.value, 10);
            state.elderGender = elderGenderInput.value.trim();
            state.elderEthnicity = elderEthnicityInput.value.trim();
            state.artStyle = artStyleSelect.value;
            state.bookLength = parseInt(bookLengthSelect.value);
            state.narrationTone = toneSelect.value;
            state.interviewerDesc = interviewerPersonaInput ? interviewerPersonaInput.value.trim() : "";
            state.transcriptText = pasteTranscriptArea.value.trim();

            if (!getApiKey()) {
                settingsModal.classList.remove("hidden");
                showToast("Please enter and save your Memoir Activation Key in the settings panel first.", "error");
                return;
            }

            if (!state.elderName) {
                showToast("Please enter the Narrator's Name.", "error");
                elderNameInput.focus();
                return;
            }

            if (!Number.isInteger(state.elderAge) || state.elderAge < 1 || state.elderAge > 120) {
                showToast("Please enter a valid narrator age (1-120).", "error");
                elderAgeInput.focus();
                return;
            }

            let hasInputContent = false;
            if (state.sourceTab === "paste" && state.transcriptText) hasInputContent = true;
            if (state.sourceTab === "upload" && state.audioFile) hasInputContent = true;
            if (state.sourceTab === "dictate" && state.transcriptText) hasInputContent = true;

            if (!hasInputContent) {
                showToast("No preloaded transcript detected. We will build the story from guided interview answers.", "info");
            }

            try {
                setStep(2);
                showToast("Say hello to Echo — just talk naturally.", "success");
                // Resolve the interviewer/narrator voice persona (non-blocking-ish).
                setEchoState("Getting ready…", "thinking");
                try {
                    const persona = await resolveInterviewerPersona(state.interviewerDesc);
                    state.interviewerVoice = persona.voiceName;
                    state.interviewerLang = persona.languageCode;
                    state.interviewerPersona = { description: persona.description, style: persona.style };
                } catch (_) {
                    state.interviewerVoice = null;
                    state.interviewerPersona = null;
                }
                await initializeConversation();
            } catch (error) {
                showToast(`Could not start the conversation: ${error.message}`, "error");
            }
        });

        if (backToStep1FromInterviewBtn) {
            backToStep1FromInterviewBtn.addEventListener("click", () => {
                clearInterviewTimers();
                stopChirp();
                if (state.isRecording || state.isFallbackRecording) stopDictation();
                setStep(1);
            });
        }

        // "Say that again" — re-speak Echo's last line.
        if (replayInterviewQuestionBtn) {
            replayInterviewQuestionBtn.addEventListener("click", () => {
                if (!state.lastAgentText) return;
                clearInterviewTimers();
                stopChirp();
                setEchoState("Speaking…", "speaking");
                speakWithChirp(state.lastAgentText, { rate: 0.96 }).then(() => {
                    if (state.activeStep === 2) armMicForAnswer();
                });
            });
        }

        if (interviewRecordBtn) {
            interviewRecordBtn.addEventListener("click", () => {
                // Any manual mic interaction cancels pending auto-timers.
                clearInterviewTimers();

                const wasWebSpeechRecording = state.isRecording && !state.useFallbackSpeech;

                if (state.isRecording || state.isFallbackRecording) {
                    stopDictation();
                    // Web Speech transcribes live, so an answer is ready now.
                    if (wasWebSpeechRecording) {
                        setTimeout(() => onAnswerCaptured(), 400);
                    }
                } else {
                    stopChirp();
                    startDictation();
                }
            });
        }

        // Send the current answer to Echo.
        if (sendAnswerBtn) {
            sendAnswerBtn.addEventListener("click", () => {
                clearInterviewTimers();
                submitAnswer();
            });
        }

        // "Help me answer" — drop in a gentle first-person example they can edit.
        if (suggestAnswerBtn) {
            suggestAnswerBtn.addEventListener("click", () => {
                clearInterviewTimers();
                if (state.lastSuggested) {
                    interviewAnswerInput.value = state.lastSuggested;
                    interviewAnswerInput.focus();
                    setMicStatus("Here's a starting point — change anything, then send.");
                } else {
                    setMicStatus("Just say whatever comes to mind — there's no wrong answer.");
                    interviewAnswerInput.focus();
                }
            });
        }

        // Enter sends; Shift+Enter makes a new line.
        if (interviewAnswerInput) {
            interviewAnswerInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    clearInterviewTimers();
                    submitAnswer();
                }
            });
            // Typing cancels the auto-mic arming so it doesn't interrupt.
            interviewAnswerInput.addEventListener("input", () => {
                if (autoMicTimer) { clearTimeout(autoMicTimer); autoMicTimer = null; }
            });
        }

        if (finishInterviewBtn) {
            finishInterviewBtn.addEventListener("click", async () => {
                clearInterviewTimers();
                stopChirp();
                if (state.isRecording || state.isFallbackRecording) stopDictation();
                finishInterviewBtn.disabled = true;
                try {
                    await generateOutlineFromInterview();
                } finally {
                    finishInterviewBtn.disabled = false;
                }
            });
        }

        // --- Step 2 Navigation ---
        backToStep1Btn.addEventListener("click", () => {
            setStep(2);
        });

        generateBookBtn.addEventListener("click", async () => {
            const finalTitle = outlineBookTitle.value.trim();
            const finalSubtitle = outlineBookSubtitle.value.trim();

            if (!finalTitle) {
                showToast("Book title cannot be blank.", "error");
                outlineBookTitle.focus();
                return;
            }

            const chapterItems = outlineChaptersList.querySelectorAll(".chapter-outline-item");
            const chaptersEdited = [];
            
            for (let i = 0; i < chapterItems.length; i++) {
                const item = chapterItems[i];
                const chapTitleInput = item.querySelector(".chapter-title-input");
                const chapSummaryTextarea = item.querySelector(".chapter-summary-input");
                
                const titleVal = chapTitleInput.value.trim();
                const summaryVal = chapSummaryTextarea.value.trim();

                if (!titleVal || !summaryVal) {
                    showToast("Chapter details cannot be empty.", "error");
                    if (!titleVal) chapTitleInput.focus();
                    else chapSummaryTextarea.focus();
                    return;
                }

                chaptersEdited.push({
                    title: titleVal,
                    summary: summaryVal
                });
            }

            generationLog.innerHTML = "";
            loadingOverlayTitle.textContent = "Crafting Your Storybook...";
            loadingOverlaySubtitle.textContent = "Writing the final memoir passages and painting custom canvases.";
            loadingOverlay.classList.remove("hidden");

            try {
                addLog("Drafting prose and scene painting scripts...", "info");
                
                const storyData = await generateFullBook({
                    bookTitle: finalTitle,
                    bookSubtitle: finalSubtitle,
                    elderName: state.elderName,
                    tone: state.narrationTone,
                    artStyle: state.artStyle,
                    transcriptText: state.transcriptText,
                    audioFile: (state.sourceTab === "upload" ? state.audioFile : null),
                    chaptersEdited: chaptersEdited
                }, (msg) => addLog(msg, "info"));

                state.generatedBook = {
                    title: finalTitle,
                    subtitle: finalSubtitle,
                    pages: storyData.pages.map((p) => {
                        const basePrompt = `detailed visual illustration, ${p.imagePrompt}`;
                        return {
                            chapterTitle: p.chapterTitle,
                            narrative: p.narrative,
                            imagePrompt: basePrompt,
                            imageSrc: null,   // filled in by Imagen (lazy, per page)
                            imageStatus: "pending"
                        };
                    })
                };

                addLog("Painting chapter illustrations with Imagen…", "info");
                // Kick off image generation in the background; pages render as they arrive.
                prefetchChapterImages();

                addLog("Memoir storybook crafted successfully!", "success");
                showToast("Your virtual picture book is ready!", "success");

                state.currentPageIndex = 0;
                
                setTimeout(() => {
                    loadingOverlay.classList.add("hidden");
                    renderVirtualBook();
                    setStep(4);
                }, 1200);

            } catch (error) {
                addLog(`Crafting failed: ${error.message}`, "error");
                showToast(`Generation error: ${error.message}`, "error");
                setTimeout(() => {
                    loadingOverlay.classList.add("hidden");
                }, 4000);
            }
        });

        // --- Step 3 Navigation ---
        prevPageBtn.addEventListener("click", () => {
            if (state.currentPageIndex > 0) {
                stopSpeech();
                state.currentPageIndex--;
                renderPageSpread();
            }
        });

        nextPageBtn.addEventListener("click", () => {
            if (state.currentPageIndex < state.generatedBook.pages.length - 1) {
                stopSpeech();
                state.currentPageIndex++;
                renderPageSpread();
            }
        });

        bookProgressRange.addEventListener("input", (e) => {
            stopSpeech();
            state.currentPageIndex = parseInt(e.target.value);
            renderPageSpread();
        });

        readAloudBtn.addEventListener("click", () => {
            toggleReadAloud();
        });

        resetWizardBtn.addEventListener("click", () => {
            if (confirm("Are you sure you want to start over? Your current generated book will be lost unless you've exported it.")) {
                stopSpeech();
                state.bookOutline = null;
                state.generatedBook = null;
                startWizardFlow();
            }
        });

        // Ambience controls
        ambienceBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            ambiencePanel.classList.toggle("hidden");
        });

        document.addEventListener("click", (e) => {
            if (!ambiencePanel.classList.contains("hidden") && !ambiencePanel.contains(e.target) && e.target !== ambienceBtn) {
                ambiencePanel.classList.add("hidden");
            }
        });

        trackPiano.addEventListener("change", () => {
            if (trackPiano.checked) {
                audioPiano.volume = volPiano.value;
                audioPiano.play().catch(err => {
                    console.error("Audio playback error:", err);
                    trackPiano.checked = false;
                });
            } else {
                audioPiano.pause();
            }
        });

        volPiano.addEventListener("input", () => {
            audioPiano.volume = volPiano.value;
        });

        trackFireplace.addEventListener("change", () => {
            if (trackFireplace.checked) {
                audioFireplace.volume = volFireplace.value;
                audioFireplace.play().catch(err => {
                    console.error("Audio playback error:", err);
                    trackFireplace.checked = false;
                });
            } else {
                audioFireplace.pause();
            }
        });

        volFireplace.addEventListener("input", () => {
            audioFireplace.volume = volFireplace.value;
        });

        regenerateImgBtn.addEventListener("click", () => {
            regenerateImageCurrentPage();
        });

        // Exports
        exportPdfBtn.addEventListener("click", (e) => {
            e.preventDefault();
            stopSpeech();
            exportBookAsPdf();
        });

        exportHtmlBtn.addEventListener("click", (e) => {
            e.preventDefault();
            downloadStandaloneHtml();
        });

        exportJsonBtn.addEventListener("click", (e) => {
            e.preventDefault();
            downloadMemoirJson();
        });
    }

    // --- Step 2 Rendering ---
    function renderOutlineEditor() {
        outlineBookTitle.value = state.bookOutline.title;
        outlineBookSubtitle.value = state.bookOutline.subtitle;
        outlineChaptersList.innerHTML = "";

        state.bookOutline.chapters.forEach((chapter, index) => {
            const chapItem = document.createElement("div");
            chapItem.className = "chapter-outline-item";
            chapItem.innerHTML = `
                <div class="chapter-number-badge">${index + 1}</div>
                <div class="chapter-outline-fields">
                    <input type="text" class="chapter-title-input" value="${escapeHtml(chapter.title)}" placeholder="Chapter Title">
                    <textarea class="chapter-summary-input" rows="2" placeholder="Summary notes for this page">${escapeHtml(chapter.summary)}</textarea>
                </div>
            `;
            outlineChaptersList.appendChild(chapItem);
        });
    }

    // --- Step 3 View Book Engine ---
    function renderVirtualBook() {
        viewingBookTitle.textContent = state.generatedBook.title;
        viewingBookSubtitle.textContent = state.generatedBook.subtitle;

        const totalSpreads = state.generatedBook.pages.length;
        bookProgressRange.max = totalSpreads - 1;
        bookProgressRange.value = 0;
        
        let styleShort = "Watercolor";
        if (state.artStyle && state.artStyle.includes("oil")) styleShort = "Oil Painting";
        if (state.artStyle && state.artStyle.includes("pencil")) styleShort = "Pencil Sketch";
        if (state.artStyle && state.artStyle.includes("photo")) styleShort = "Vintage Photo";
        if (state.artStyle && state.artStyle.includes("digital")) styleShort = "Digital Painting";
        illustrationStyleLabel.textContent = styleShort;

        renderPageSpread();
    }

    function renderPageSpread() {
        const idx = state.currentPageIndex;
        const page = state.generatedBook.pages[idx];
        const total = state.generatedBook.pages.length;

        const bookElement = document.getElementById("book-element");
        bookElement.style.transform = "rotateY(-2deg) scale(0.99)";
        
        setTimeout(() => {
            bookElement.style.transform = "rotateY(0deg) scale(1)";
        }, 300);

        pageNumLeft.textContent = (idx * 2) + 1;
        pageNumRight.textContent = (idx * 2) + 2;

        pageChapterTitle.textContent = page.chapterTitle;
        pageTextContainer.innerHTML = `<p>${escapeHtml(page.narrative).replace(/\n\n/g, '</p><p>')}</p>`;

        // Regene button should be disabled for preloaded sample book (since they are static local assets)
        if (page.isSampleAsset) {
            regenerateImgBtn.style.display = "none";
        } else {
            regenerateImgBtn.style.display = "flex";
        }

        pageIllustration.classList.add("hidden");
        pageIllustrationSpinner.style.display = "flex";

        showPageIllustration(idx);

        prevPageBtn.disabled = idx === 0;
        nextPageBtn.disabled = idx === total - 1;
        bookProgressRange.value = idx;
        bookProgressText.textContent = `Page ${(idx * 2) + 1}-${(idx * 2) + 2} of ${total * 2}`;
    }

    // Displays a page's Imagen illustration, generating it on demand if needed.
    async function showPageIllustration(idx) {
        const page = state.generatedBook.pages[idx];

        // Sample book uses bundled static assets.
        if (page.isSampleAsset) {
            pageIllustration.src = page.imageSrc;
            pageIllustration.classList.remove("hidden");
            pageIllustrationSpinner.style.display = "none";
            return;
        }

        // Already have it.
        if (page.imageSrc && page.imageStatus === "ready") {
            pageIllustration.src = page.imageSrc;
            pageIllustration.classList.remove("hidden");
            pageIllustrationSpinner.style.display = "none";
            return;
        }

        // Failed earlier — show fallback art.
        if (page.imageStatus === "failed") {
            pageIllustration.src = "assets/story_family.png";
            pageIllustration.classList.remove("hidden");
            pageIllustrationSpinner.style.display = "none";
            return;
        }

        // Generate now (or wait for the in-flight prefetch).
        pageIllustration.classList.add("hidden");
        pageIllustrationSpinner.style.display = "flex";
        await ensurePageImage(idx);

        // Only update the view if the user is still on this page.
        if (state.currentPageIndex !== idx) return;
        if (page.imageStatus === "ready") {
            pageIllustration.src = page.imageSrc;
        } else {
            pageIllustration.src = "assets/story_family.png";
        }
        pageIllustration.classList.remove("hidden");
        pageIllustrationSpinner.style.display = "none";
    }

    // Generates one page's image via Imagen, with de-duped in-flight promises.
    function ensurePageImage(idx) {
        const page = state.generatedBook.pages[idx];
        if (page.imageStatus === "ready") return Promise.resolve();
        if (page._imagePromise) return page._imagePromise;

        page.imageStatus = "loading";
        page._imagePromise = generateChapterImage(page.imagePrompt, { aspectRatio: "4:3" })
            .then((dataUrl) => {
                page.imageSrc = dataUrl;
                page.imageStatus = "ready";
            })
            .catch((err) => {
                console.warn(`Imagen failed for page ${idx + 1}:`, err);
                page.imageStatus = "failed";
            })
            .finally(() => {
                page._imagePromise = null;
            });
        return page._imagePromise;
    }

    // Generates all chapter images sequentially in the background so they're
    // ready (or close to it) as the reader pages through the book.
    async function prefetchChapterImages() {
        if (!state.generatedBook) return;
        const pages = state.generatedBook.pages;
        for (let i = 0; i < pages.length; i++) {
            if (!state.generatedBook) return; // book reset
            await ensurePageImage(i);
            // If the reader is currently looking at this page, refresh it live.
            if (state.activeStep === 4 && state.currentPageIndex === i) {
                showPageIllustration(i);
            }
        }
    }

    // --- Audio Voice Narration (TTS) ---
    let isReadingAloud = false;

    function toggleReadAloud() {
        if (isReadingAloud) {
            stopSpeech();
            return;
        }

        const page = state.generatedBook.pages[state.currentPageIndex];
        isReadingAloud = true;
        readAloudBtn.innerHTML = `<i class="fa-solid fa-volume-xmark"></i> <span>Stop Narration</span>`;
        readAloudBtn.classList.add("btn-primary");
        readAloudBtn.classList.remove("btn-secondary");

        // Narrate with the same warm Chirp persona voice chosen for the interview.
        speakWithChirp(page.narrative, {
            rate: 0.9,
            voice: state.interviewerVoice,
            onEnd: () => resetReadAloudButton()
        }).then(() => resetReadAloudButton());
    }

    function stopSpeech() {
        stopChirp();
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        resetReadAloudButton();
    }

    function resetReadAloudButton() {
        isReadingAloud = false;
        if (readAloudBtn) {
            readAloudBtn.innerHTML = `<i class="fa-solid fa-volume-high"></i> <span>Read Aloud</span>`;
            readAloudBtn.classList.add("btn-secondary");
            readAloudBtn.classList.remove("btn-primary");
        }
    }

    // --- Regenerate Current Page Image ---
    async function regenerateImageCurrentPage() {
        const idx = state.currentPageIndex;
        const page = state.generatedBook.pages[idx];

        if (page.isSampleAsset) return; // safety check

        pageIllustration.classList.add("hidden");
        pageIllustrationSpinner.style.display = "flex";
        showToast("Repainting this scene…", "info");

        try {
            const dataUrl = await generateChapterImage(page.imagePrompt, { aspectRatio: "4:3" });
            page.imageSrc = dataUrl;
            page.imageStatus = "ready";
            if (state.currentPageIndex === idx) {
                pageIllustration.src = dataUrl;
                pageIllustration.classList.remove("hidden");
                pageIllustrationSpinner.style.display = "none";
            }
            showToast("Scene repainted with a fresh illustration.", "success");
        } catch (err) {
            console.error("Repaint failed:", err);
            pageIllustrationSpinner.style.display = "none";
            pageIllustration.classList.remove("hidden");
            showToast("Could not repaint: " + err.message, "error");
        }
    }

    // --- EXPORTS ---
    // Loads an image URL and returns { dataUrl, w, h }, or null on failure.
    function loadImageData(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                try {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.naturalWidth || 800;
                    canvas.height = img.naturalHeight || 600;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0);
                    resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.92), w: canvas.width, h: canvas.height });
                } catch (err) {
                    resolve(null); // tainted canvas / CORS
                }
            };
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }

    async function exportBookAsPdf() {
        const jsPdfNS = window.jspdf || window.jsPDF;
        const JsPDF = jsPdfNS ? (jsPdfNS.jsPDF || jsPdfNS) : null;
        if (!JsPDF) {
            showToast("PDF library failed to load. Check your connection and retry.", "error");
            return;
        }
        const book = state.generatedBook;
        if (!book || !book.pages || !book.pages.length) {
            showToast("No book to export yet.", "error");
            return;
        }

        loadingOverlayTitle.textContent = "Binding your book…";
        loadingOverlaySubtitle.textContent = "Gathering illustrations and laying out pages for PDF.";
        generationLog.innerHTML = "";
        loadingOverlay.classList.remove("hidden");
        addLog("Preparing PDF…", "info");

        try {
            const doc = new JsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const margin = 48;
            const contentW = pageW - margin * 2;

            // Title page.
            doc.setFillColor(252, 250, 245);
            doc.rect(0, 0, pageW, pageH, "F");
            doc.setTextColor(84, 57, 44);
            doc.setFont("times", "bold");
            doc.setFontSize(30);
            doc.text(doc.splitTextToSize(book.title || "My Story", contentW), pageW / 2, pageH / 2 - 30, { align: "center" });
            doc.setFont("times", "italic");
            doc.setFontSize(15);
            doc.setTextColor(140, 122, 108);
            doc.text(doc.splitTextToSize(book.subtitle || "", contentW), pageW / 2, pageH / 2 + 20, { align: "center" });

            for (let i = 0; i < book.pages.length; i++) {
                const page = book.pages[i];
                addLog(`Adding chapter ${i + 1} of ${book.pages.length}…`, "info");
                // Make sure this page's illustration has been generated.
                if (!page.isSampleAsset && page.imageStatus !== "ready") {
                    await ensurePageImage(i);
                }
                doc.addPage();

                doc.setFillColor(252, 250, 245);
                doc.rect(0, 0, pageW, pageH, "F");

                let y = margin;

                // Chapter title.
                doc.setTextColor(84, 57, 44);
                doc.setFont("times", "bold");
                doc.setFontSize(20);
                const titleLines = doc.splitTextToSize(page.chapterTitle || `Chapter ${i + 1}`, contentW);
                doc.text(titleLines, margin, y + 14);
                y += titleLines.length * 24 + 14;

                // Illustration.
                const imgData = await loadImageData(page.imageSrc);
                if (imgData) {
                    const ratio = imgData.h / imgData.w;
                    const drawW = contentW;
                    const drawH = Math.min(drawW * ratio, pageH * 0.42);
                    const finalW = drawH / ratio;
                    const x = margin + (contentW - finalW) / 2;
                    try {
                        doc.addImage(imgData.dataUrl, "JPEG", x, y, finalW, drawH);
                        y += drawH + 22;
                    } catch (_) { y += 8; }
                } else {
                    y += 8;
                }

                // Narrative.
                doc.setTextColor(43, 32, 26);
                doc.setFont("times", "normal");
                doc.setFontSize(13);
                const bodyLines = doc.splitTextToSize((page.narrative || "").replace(/\n+/g, "\n\n"), contentW);
                const lineH = 18;
                for (const line of bodyLines) {
                    if (y > pageH - margin) {
                        doc.addPage();
                        doc.setFillColor(252, 250, 245);
                        doc.rect(0, 0, pageW, pageH, "F");
                        doc.setTextColor(43, 32, 26);
                        doc.setFont("times", "normal");
                        doc.setFontSize(13);
                        y = margin;
                    }
                    doc.text(line, margin, y);
                    y += lineH;
                }

                // Page number footer.
                doc.setTextColor(170, 150, 120);
                doc.setFontSize(10);
                doc.text(`${i + 1}`, pageW / 2, pageH - 24, { align: "center" });
            }

            const cleanTitle = (book.title || "memoir").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
            doc.save(`${cleanTitle || "memoir"}.pdf`);
            addLog("PDF ready!", "success");
            showToast("Your book PDF has been downloaded.", "success");
        } catch (error) {
            console.error("PDF export failed:", error);
            showToast("PDF export failed: " + error.message, "error");
        } finally {
            setTimeout(() => loadingOverlay.classList.add("hidden"), 600);
        }
    }

    function downloadMemoirJson() {
        const bookData = JSON.stringify(state.generatedBook, null, 2);
        const blob = new Blob([bookData], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        
        const cleanTitle = state.generatedBook.title.toLowerCase().replace(/[^a-z0-9]/g, "_");
        a.download = `${cleanTitle}_memoir.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Memoir JSON saved.", "success");
    }

    function downloadStandaloneHtml() {
        const book = state.generatedBook;
        let chaptersHtml = "";
        
        book.pages.forEach((p, idx) => {
            chaptersHtml += `
                <div class="chapter-spread">
                    <div class="page-img">
                        <img src="${p.isSampleAsset ? p.imageSrc : p.imageSrc}" alt="${p.chapterTitle}">
                    </div>
                    <div class="page-text">
                        <h2>${p.chapterTitle}</h2>
                        <p>${p.narrative.replace(/\n\n/g, '</p><p>')}</p>
                        <span class="pagenum">Pages ${(idx * 2) + 1}-${(idx * 2) + 2}</span>
                    </div>
                </div>
            `;
        });

        // We embed images as absolute paths or standard online URLs. 
        // For sample assets, if downloaded locally, they will check local assets/ path.
        // To make standalone HTML completely portable, let's use the absolute path relative to local app or fallback to pollinations.
        // Wait, for sample assets, we can fall back to a public URL or base64, but since it's locally hosted, assets/story_* will work!
        const template = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(book.title)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
    <style>
        body {
            background: #fcfaf5;
            color: #2b201a;
            font-family: 'EB Garamond', Georgia, serif;
            margin: 0;
            padding: 3rem 1.5rem;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        header {
            text-align: center;
            max-width: 800px;
            margin-bottom: 4rem;
            border-bottom: 1px solid #ebdcb9;
            padding-bottom: 2rem;
            width: 100%;
        }
        header h1 {
            font-family: 'Cinzel', serif;
            font-size: 2.4rem;
            margin: 0 0 0.5rem 0;
            color: #54392c;
        }
        header p {
            font-size: 1.15rem;
            font-style: italic;
            color: #8c7a6c;
            margin: 0;
        }
        .container {
            max-width: 900px;
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 4rem;
        }
        .chapter-spread {
            display: grid;
            grid-template-columns: 1fr 1.2fr;
            gap: 3rem;
            align-items: center;
            background: #fffdf9;
            border: 1px solid #e2cca0;
            border-radius: 12px;
            padding: 2.5rem;
            box-shadow: 0 10px 30px rgba(84, 57, 44, 0.05);
        }
        @media (max-width: 768px) {
            .chapter-spread {
                grid-template-columns: 1fr;
                gap: 2rem;
                padding: 1.5rem;
            }
        }
        .page-img img {
            width: 100%;
            border-radius: 6px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.06);
            display: block;
        }
        .page-text {
            display: flex;
            flex-direction: column;
            position: relative;
            padding-bottom: 2rem;
        }
        .page-text h2 {
            font-family: 'Playfair Display', serif;
            font-size: 1.7rem;
            margin: 0 0 1.2rem 0;
            color: #3b2319;
            border-bottom: 1px solid rgba(201, 160, 84, 0.25);
            padding-bottom: 0.5rem;
        }
        .page-text p {
            font-size: 1.25rem;
            line-height: 1.6;
            margin: 0 0 1rem 0;
        }
        .page-text p::first-letter {
            font-family: 'Playfair Display', serif;
            font-size: 2.8rem;
            font-weight: bold;
            float: left;
            margin-top: 0.1rem;
            margin-right: 0.5rem;
            line-height: 0.85;
            color: #c9a054;
        }
        .pagenum {
            position: absolute;
            bottom: 0;
            right: 0;
            font-family: 'Cinzel', serif;
            font-size: 0.8rem;
            color: #8d7b6e;
        }
    </style>
</head>
<body>
    <header>
        <h1>${escapeHtml(book.title)}</h1>
        <p>${escapeHtml(book.subtitle)}</p>
    </header>
    <div class="container">
        ${chaptersHtml}
    </div>
</body>
</html>`;

        const blob = new Blob([template], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        
        const cleanTitle = state.generatedBook.title.toLowerCase().replace(/[^a-z0-9]/g, "_");
        a.download = `${cleanTitle}_memoir_book.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Standalone HTML Book exported successfully.", "success");
    }

    function escapeHtml(text) {
        if (!text) return "";
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // --- Run App ---
    init();
});
