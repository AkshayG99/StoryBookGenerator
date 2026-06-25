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
        finalTranscript: "",   // clean transcript for download
        autoSendTimer: null,
        autoSendInterval: null,
        // --- Interviewer / narrator persona + voice ---
        interviewerDesc: "",   // free-text description the user typed
        interviewerVoice: null,    // resolved Chirp voice name e.g. en-IN-Chirp3-HD-Puck
        interviewerLang: "en-US",
        interviewerPersona: null,  // { description, style } for prompt flavor
        // --- Hands-free voice ---
        silenceTimer: null,
        silenceRaf: null,      // requestAnimationFrame id for mic-level monitor
        silenceAudio: null,    // { ctx, analyser, source } for silence detection
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
    const elderGenderCustomInput = document.getElementById("elder-gender-custom");
    const genderSpecifyContainer = document.getElementById("gender-specify-container");
    const elderEthnicityInput = document.getElementById("elder-ethnicity");
    const artStyleSelect = document.getElementById("illustration-style");
    const bookLengthSelect = document.getElementById("book-length");
    const toneSelect = document.getElementById("narration-tone");
    const interviewerPersonaInput = document.getElementById("interviewer-persona");
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");
    const pasteTranscriptArea = document.getElementById("input-transcript");
    const loadTranscriptBtn = document.getElementById("btn-load-transcript");
    const transcriptFileInput = document.getElementById("transcript-file");
    const fileUploader = document.getElementById("file-uploader");
    const dropZone = document.getElementById("drop-zone");
    const selectedFileInfo = document.getElementById("selected-file-info");
    const fileNameSpan = document.getElementById("file-name");
    const removeFileBtn = document.getElementById("btn-remove-file");

    // Photo Uploader & Camera DOM elements
    const photoInputContainer = document.getElementById("photo-input-container");
    const photoUploader = document.getElementById("photo-uploader");
    const photoDropZone = document.getElementById("photo-drop-zone");
    const photoUploadPlaceholder = document.getElementById("photo-upload-placeholder");
    const photoUploadPreview = document.getElementById("photo-upload-preview");
    const photoPreviewImage = document.getElementById("photo-preview-image");
    const removePhotoBtn = document.getElementById("btn-remove-photo");
    const photoCameraZone = document.getElementById("photo-camera-zone");
    const modalCamera = document.getElementById("modal-camera");
    const btnCloseCamera = document.getElementById("btn-close-camera");
    const cameraStream = document.getElementById("camera-stream");
    const cameraSnapshotCanvas = document.getElementById("camera-snapshot-canvas");
    const cameraError = document.getElementById("camera-error");
    const cameraErrorText = document.getElementById("camera-error-text");
    const cameraLoader = document.getElementById("camera-loader");
    const btnCameraCapture = document.getElementById("btn-camera-capture");
    const btnCameraCancel = document.getElementById("btn-camera-cancel");

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
    const newTopicBtn = document.getElementById("btn-new-topic");
    const newTopicPopover = document.getElementById("new-topic-popover");
    const newTopicInput = document.getElementById("new-topic-input");
    const newTopicGoBtn = document.getElementById("btn-new-topic-go");
    const newTopicSurpriseBtn = document.getElementById("btn-new-topic-surprise");
    const newTopicCancelBtn = document.getElementById("btn-new-topic-cancel");
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
    const exportDropdown = document.getElementById("export-dropdown");
    const exportDropdownBtn = document.getElementById("btn-export-dropdown");
    const exportTranscriptBtn = document.getElementById("export-transcript");
    
    // Audio / Ambience Elements
    const trackPiano = document.getElementById("track-piano");
    const audioPiano = document.getElementById("audio-piano");
    const volPiano = document.getElementById("vol-piano");
    const trackFireplace = document.getElementById("track-fireplace");
    const volFireplace = document.getElementById("vol-fireplace");

    // Exports
    const exportPdfBtn = document.getElementById("export-pdf");
    const exportHtmlBtn = document.getElementById("export-html");
    const exportAudioBtn = document.getElementById("export-audio");
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

    // --- Gemini audio recorder (speech-to-text) ---
    async function startFallbackRecorder() {
        if (state.isFallbackRecording) {
            // Second tap = stop and transcribe
            if (state.fallbackRecorder && state.fallbackRecorder.state === "recording") {
                state.fallbackRecorder.stop();
            }
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
                stopSilenceMonitor();
                const inConversation = state.activeStep === 2;
                if (inConversation) {
                    setEchoState("Thinking…", "thinking");
                }
                setMicStatus("Transcribing…");

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
                    if (inConversation) {
                        // Hands-free: send straight to Echo.
                        submitAnswer();
                    } else {
                        setMicStatus("Got it.");
                    }
                } catch (err) {
                    console.error("Gemini transcription failed:", err);
                    showToast("Transcription failed: " + err.message, "error");
                    setMicStatus("Didn't catch that — tap the mic to try again.");
                    if (inConversation) setEchoState("Your turn", null);
                } finally {
                    state.fallbackRecorder = null;
                    state.fallbackChunks = [];
                }
            };

            state.fallbackRecorder.start();
            state.isFallbackRecording = true;
            setRecordButtonsActive(true);
            if (state.activeStep === 2) {
                setEchoState("Listening — your turn", "listening");
                setMicStatus("Listening… just talk. (Pause when you're done, or tap the mic.)");
                startSilenceMonitor(state.fallbackStream);
            } else {
                setMicStatus("Recording… tap the mic again to stop & transcribe.");
            }
        } catch (err) {
            console.error("Recorder failed to start:", err);
            showToast("Could not access microphone: " + err.message, "error");
            setMicStatus("Mic unavailable. Type your answer instead.");
            state.isFallbackRecording = false;
            setRecordButtonsActive(false);
        }
    }

    // --- Silence detection for hands-free conversation recording ---
    // Watches the mic level and auto-stops the recorder after a pause, so the
    // person can just talk and stop talking without tapping anything.
    function startSilenceMonitor(stream) {
        stopSilenceMonitor();
        if (!stream || !(window.AudioContext || window.webkitAudioContext)) return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            const ctx = new AC();
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            const data = new Uint8Array(analyser.fftSize);

            state.silenceAudio = { ctx, analyser, source };
            let hasSpoken = false;
            let silenceStart = 0;
            const SILENCE_RMS = 0.012;   // below this counts as silence
            const SILENCE_MS = 2200;     // stop after this much trailing silence
            const startedAt = Date.now();

            const tick = () => {
                if (!state.isFallbackRecording || !state.silenceAudio) return;
                analyser.getByteTimeDomainData(data);
                let sum = 0;
                for (let i = 0; i < data.length; i++) {
                    const v = (data[i] - 128) / 128;
                    sum += v * v;
                }
                const rms = Math.sqrt(sum / data.length);
                const now = Date.now();

                if (rms > SILENCE_RMS) {
                    hasSpoken = true;
                    silenceStart = 0;
                } else if (hasSpoken) {
                    if (!silenceStart) silenceStart = now;
                    else if (now - silenceStart > SILENCE_MS) {
                        // Trailing silence after speech → auto-stop & transcribe.
                        if (state.fallbackRecorder && state.fallbackRecorder.state === "recording") {
                            state.fallbackRecorder.stop();
                        }
                        return;
                    }
                } else if (now - startedAt > 9000) {
                    // Never heard speech for 9s → give up listening quietly.
                    if (state.fallbackRecorder && state.fallbackRecorder.state === "recording") {
                        state.fallbackRecorder.stop();
                    }
                    return;
                }
                state.silenceRaf = requestAnimationFrame(tick);
            };
            state.silenceRaf = requestAnimationFrame(tick);
        } catch (e) {
            console.warn("Silence monitor unavailable:", e);
        }
    }

    function stopSilenceMonitor() {
        if (state.silenceRaf) { cancelAnimationFrame(state.silenceRaf); state.silenceRaf = null; }
        if (state.silenceAudio) {
            try { state.silenceAudio.source.disconnect(); } catch (_) {}
            try { state.silenceAudio.ctx.close(); } catch (_) {}
            state.silenceAudio = null;
        }
    }

    // --- Procedural fireplace ambience (Web Audio, no external file) ---
    // The hosted fireplace .wav was blocked by the browser, so we synthesize a
    // warm crackle: low brown-noise rumble + random short "pop" transients.
    let fireplace = null;

    function startFireplace(volume) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) {
            showToast("Your browser can't play the fireplace sound.", "error");
            return false;
        }
        try {
            stopFireplace();
            const ctx = new AC();

            // Master gain for the whole fireplace bed.
            const master = ctx.createGain();
            master.gain.value = Math.max(0, Math.min(1, isNaN(volume) ? 0.4 : volume));
            master.connect(ctx.destination);

            // 1) Continuous low rumble: brown noise through a lowpass filter.
            const bufferSize = 2 * ctx.sampleRate;
            const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const out = noiseBuf.getChannelData(0);
            let lastOut = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                lastOut = (lastOut + 0.02 * white) / 1.02;
                out[i] = lastOut * 3.5;
            }
            const rumble = ctx.createBufferSource();
            rumble.buffer = noiseBuf;
            rumble.loop = true;
            const rumbleFilter = ctx.createBiquadFilter();
            rumbleFilter.type = "lowpass";
            rumbleFilter.frequency.value = 420;
            const rumbleGain = ctx.createGain();
            rumbleGain.gain.value = 0.5;
            rumble.connect(rumbleFilter).connect(rumbleGain).connect(master);
            rumble.start();

            // 2) Random crackle "pops": short bandpassed noise bursts.
            let stopped = false;
            const scheduleCrackle = () => {
                if (stopped) return;
                const pop = ctx.createBufferSource();
                const len = Math.floor(ctx.sampleRate * (0.01 + Math.random() * 0.04));
                const buf = ctx.createBuffer(1, len, ctx.sampleRate);
                const d = buf.getChannelData(0);
                for (let i = 0; i < len; i++) {
                    d[i] = (Math.random() * 2 - 1) * (1 - i / len); // quick decay
                }
                pop.buffer = buf;
                const bp = ctx.createBiquadFilter();
                bp.type = "bandpass";
                bp.frequency.value = 900 + Math.random() * 2600;
                bp.Q.value = 0.7;
                const g = ctx.createGain();
                g.gain.value = 0.18 + Math.random() * 0.5;
                pop.connect(bp).connect(g).connect(master);
                pop.start();
                // Next crackle in 40–360ms for a lively but cozy fire.
                fireplace.timer = setTimeout(scheduleCrackle, 40 + Math.random() * 320);
            };

            fireplace = { ctx, master, rumble, timer: null, stop: () => { stopped = true; } };
            scheduleCrackle();
            return true;
        } catch (err) {
            console.error("Fireplace synth failed:", err);
            showToast("Could not start the fireplace sound.", "error");
            return false;
        }
    }

    function setFireplaceVolume(volume) {
        if (fireplace && fireplace.master) {
            fireplace.master.gain.value = Math.max(0, Math.min(1, isNaN(volume) ? 0.4 : volume));
        }
    }

    function stopFireplace() {
        if (!fireplace) return;
        try { fireplace.stop && fireplace.stop(); } catch (_) {}
        if (fireplace.timer) { clearTimeout(fireplace.timer); fireplace.timer = null; }
        try { fireplace.rumble.stop(); } catch (_) {}
        try { fireplace.ctx.close(); } catch (_) {}
        fireplace = null;
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
                if (interviewDictationStatus) interviewDictationStatus.textContent = "Listening… share your answer.";
                if (typeof setEchoState === "function") setEchoState("Listening — your turn", "listening");
            } else {
                recordBtn.classList.add("recording");
                dictationStatus.textContent = "Listening closely... Speak now.";
                showToast("Recording started. Speak clearly.", "info");
            }
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

    const sampleBookData = {
        title: "Sunita's Twinkling Path",
        subtitle: "For the independent spirits, the resilient hearts, and the bright futures they build.",
        pages: [
            {
                chapterTitle: "Chapter 1: The Whispering Woods and Mama's Special Roti",
                narrative: "From the very first flutter of my heart, I was a girl who loved her freedom, a tiny explorer always off on a secret adventure. My parents, bless their hearts, would often wonder where their little Sunita had vanished to, but I was simply charting my own course, always a little too independent to be easily swayed. My deepest inspiration, you see, was my dear Papa. He worked tirelessly, his hands always busy, fixing anything and everything around our home. Watching him, I learned that true strength came from self-reliance and the quiet joy of building with your own two hands.\nBut even an independent spirit needs to feel cherished, and my Mama knew just how to make me feel uniquely special. She would always make big, round rotis for the whole family, but just for me, my last roti, she would roll it into a small, perfect square. That tiny, warm square, made just for me, was a quiet whisper of her boundless love, a secret understanding between us that I carried in my heart always.",
                imagePrompt: "watercolor painting of young Sunita holding square roti",
                imageSrc: "assets/sunita_1.png",
                isSampleAsset: true
            },
            {
                chapterTitle: "Chapter 2: The Courts of Courage: My Captain's Heartbeat",
                narrative: "As I grew, that independent spirit found a new playground: the bustling basketball court. There, amidst the squeak of sneakers and the rhythmic thump of the ball, I learned the thrill of competition and the warmth of camaraderie. By grade six, I proudly earned the title of team captain, a role that filled me with immense joy, though the weight of leadership felt heavy at first. Every loss seemed to rest squarely on my young shoulders.\nBut slowly, with the unwavering support of my teammates, I learned a precious truth: it wasn't just about winning, but about the courage to try our very best, to lift each other up, and to learn from every stumble. I discovered the quiet satisfaction of watching my friends grow their skills, inspired by our collective effort. That captaincy taught me that even when the scoreboard doesn't favor you, finding your strength, encouraging others, and pouring your heart into the game is a victory all its own. It was a lesson I would carry with me, long after the final buzzer sounded.",
                imagePrompt: "watercolor painting of Sunita playing basketball",
                imageSrc: "assets/sunita_2.png",
                isSampleAsset: true
            },
            {
                chapterTitle: "Chapter 3: The Logic of Dreams: IIT",
                narrative: "The lessons from the basketball court – that gentle wisdom of resilience and cooperation – became my compass as I navigated high school and eventually set my sights on IIT. Unlike some, I understood that true success wasn't a solitary climb, but a shared journey, where helping others also enriched my own path. I leaned into collaboration, valuing the exchange of ideas as much as the individual triumph, a philosophy that truly blossomed when I discovered software engineering.\nIt was a field that hummed with the same problem-solving spirit I so admired in my father. Here, I could build, create, and impact others on a grander scale, just as I had aimed to do as a team captain. Even when faced with the sting of failure, like that challenging Python course, I remembered my court-side mantra: it’s always better to try, to learn, to grow. IIT was a dazzling world of brilliant minds, and amidst the hum of computers and the sparkle of new ideas, I knew I had found my calling, a place where I could continue to build solutions and make a difference.",
                imagePrompt: "watercolor painting of Sunita studying at IIT",
                imageSrc: "assets/sunita_3.png",
                isSampleAsset: true
            },
            {
                chapterTitle: "Chapter 4: Paws and Pixels: A Twinkling Resilience",
                narrative: "Inspired by the brilliant minds around me at IIT, I dared to dream a whimsical dream: a video chat network for lonely pets. Oh, how I imagined furry friends connecting, sharing barks and purrs across digital landscapes, just like in the movies! It was a passion project, born from a desire to connect and bring joy, but not everyone shared my vision. There were whispers of doubt, questions about whether pets could truly communicate through screens, and eventually, the venture, though brave, had to close its doors.\nIt was a challenging moment, the sting of disappointment sharp and real. Yet, in that quiet time, a familiar melody, 'Twinkle, Twinkle Little Star,' drifted into my heart. It was a lullaby from my baby days, a simple tune that brought a wave of comfort and memory. The song reminded me that even when dreams fade, the act of trying, of putting your whole heart into something, is a beautiful and worthy endeavor in itself.",
                imagePrompt: "watercolor painting of Sunita looking at a pet monitor",
                imageSrc: "assets/sunita_4.png",
                isSampleAsset: true
            },
            {
                chapterTitle: "Chapter 5: The Unlikely Strike: A Love Story",
                narrative: "Life, as it often does, held a beautiful surprise for me when I was twenty-three. My path crossed with the love of my life in the most wonderfully unexpected way. Truth be told, I was a bit of a whirlwind back then, a touch brash. I remember seeing her studying, and in a moment of youthful impulsivity, I slammed her books down, demanding to know why she was always so engrossed! She didn't shout or cry, though; she simply looked up, her intelligent eyes wide with perplexity, and that quiet, unexpected reaction completely disarmed me. I mumbled an apology and hurried away.\nBut I couldn't forget her. Coffee led to conversations, and those conversations led to a bowling alley, where she, with her incredible focus and competitive spirit, bowled a perfect game. My heart, it bowled a perfect game right along with her! In that moment, I knew. Seven days into dating, I spontaneously proposed. 'If she can bowl a perfect game,' I declared, 'she can perfectly fit into my heart.' She said yes, and our grand Indian wedding, filled with laughter and sweet moments, sealed our love. We built a beautiful family, adopting two bright children who, like their mother, found their calling in the world of software, filling our home with joy and intellect.",
                imagePrompt: "watercolor painting of bowling proposal",
                imageSrc: "assets/sunita_5.png",
                isSampleAsset: true
            },
            {
                chapterTitle: "Chapter 6: The Sacred Hearth: A Legacy for Our Children's Children",
                narrative: "After a lifetime of building and problem-solving, as I eased into my later years, my heart yearned to build one last, profound legacy. Having come to Canada as a young immigrant, I deeply understood the unique journey of blending cultures. I knew, too, that my children and future generations deserved to carry forward the rich tapestry of our Jain heritage, the culture that had so beautifully shaped who I was. And so, with immense dedication and love, I poured my energy into establishing a Jain temple here in Canada.\nIt became a sacred space, a vibrant community hub, a bridge between worlds. It was a place where our traditions could flourish, where stories could be shared, and where a sense of belonging could embrace all who walked through its doors. This temple, built not just with bricks and mortar, but with hope and heritage, ensures that the spiritual and cultural roots of our family will remain strong, nurturing the hearts and minds of our children's children for generations to come, a lasting testament to the beauty of our past and the promise of our future.",
                imagePrompt: "watercolor painting of Sunita in front of temple in Canada",
                imageSrc: "assets/sunita_6.png",
                isSampleAsset: true
            }
        ]
    };

    // --- Setup Initialization ---
    function init() {
        setupEventListeners();
        showLandingPage();
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
        if (step !== 2) {
            if (typeof clearInterviewTimers === "function") clearInterviewTimers();
            if (head) {
                try { head.stopSpeaking(); } catch(e) {}
                const subtitlesEl = document.getElementById("avatar-subtitles");
                if (subtitlesEl) {
                    subtitlesEl.style.display = "none";
                }
            }
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
        if (step === 2) {
            panelStepInterview.classList.add("active");
            initTalkingHead().catch(err => console.error(err));
        }
        if (step === 3) panelStep2.classList.add("active");
        if (step === 4) panelStep3.classList.add("active");

        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // --- Dictation Control ---
    // Speech-to-text is Gemini-only: always record audio and transcribe it
    // server-side via the backend (no browser Web Speech API).
    function startDictation({ isRetry = false } = {}) {
        startFallbackRecorder();
    }

    function stopDictation(shouldStopEngine = true) {
        // Gemini-only STT: stop the audio recorder; its onstop transcribes.
        if (state.fallbackRecorder && state.fallbackRecorder.state === "recording") {
            state.fallbackRecorder.stop();
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

    // --- TalkingHead 3D Avatar Integration ---
    let head = null;

    async function initTalkingHead() {
        if (head) return;

        const avatarContainer = document.getElementById("avatar-container");
        const avatarLoading = document.getElementById("avatar-loading");
        if (!avatarContainer) return;

        // Force a layout reflow and wait until the container has a non-zero size.
        // This is crucial because Three.js/WebGL computes rendering aspect ratio
        // and sizing based on clientWidth/clientHeight, which are 0 if display: none.
        let retries = 0;
        while (avatarContainer.clientWidth === 0 && retries < 25) {
            await new Promise(r => setTimeout(r, 40));
            retries++;
        }

        try {
            // Dynamically import TalkingHead from CDN
            const { TalkingHead } = await import("talkinghead");

            head = new TalkingHead(avatarContainer, {
                lipsyncModules: ["en"],
                cameraView: "upper", // Focus on chest-up view
                cameraDistance: -0.8, // Zoom in slightly (default upper is 0), but less than -1.1 to prevent head cutoff
                cameraY: -0.08, // Negative value shifts target/camera up, moving the head down in the viewport
                avatarMood: "neutral",
                avatarMute: false
            });

            // Load local avatar brunette-t.glb added by the user
            await head.showAvatar({
                url: "./avatarsdk.glb",
                body: "F",
                avatarMood: "neutral",
                lipsyncLang: "en"
            });

            if (avatarLoading) {
                avatarLoading.style.display = "none";
            }

            // Trigger a resize event to ensure canvas maps perfectly to container dimensions
            head.onResize();
        } catch (error) {
            console.error("Failed to initialize TalkingHead:", error);
            showToast("Could not load the 3D avatar. Standard voice mode active.", "error");
        }
    }

    function base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    function estimateWordTimings(text, totalDurationMs) {
        const words = text.trim().split(/\s+/);
        const totalChars = words.reduce((sum, w) => sum + w.length, 0);
        const wtimes = [];
        const wdurations = [];
        let currentTime = 0;

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const pct = word.length / (totalChars || 1);
            const duration = Math.round(totalDurationMs * pct);
            wtimes.push(currentTime);
            wdurations.push(duration);
            currentTime += duration;
        }

        return { words, wtimes, wdurations };
    }

    async function speakWithTalkingHead(text) {
        if (!head) {
            // Fallback to standard speakWithChirp if head failed to load
            await speakWithChirp(text, { rate: 0.96, voice: state.interviewerVoice });
            return;
        }

        // Stop any current speech
        head.stopSpeaking();

        // 1. Synthesize speech using the backend API
        const response = await fetch(`${BACKEND_BASE_URL}/api/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: text.trim(),
                voice: state.interviewerVoice,
                rate: 0.96
            })
        });

        if (!response.ok) {
            throw new Error(`TTS backend error: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data || !data.audioContent) {
            throw new Error("No audio content returned from TTS");
        }

        // 2. Decode base64 audio to AudioBuffer
        const arrayBuffer = base64ToArrayBuffer(data.audioContent);
        const audioBuffer = await head.audioCtx.decodeAudioData(arrayBuffer);

        // 3. Estimate word timings
        const totalDurationMs = audioBuffer.duration * 1000;
        const { words, wtimes, wdurations } = estimateWordTimings(text, totalDurationMs);

        // 4. Play speech and show subtitles
        return new Promise((resolve) => {
            const subtitlesEl = document.getElementById("avatar-subtitles");
            if (subtitlesEl) {
                subtitlesEl.textContent = text;
                subtitlesEl.style.display = "block";
            }

            head.speakAudio({
                audio: audioBuffer,
                words: words,
                wtimes: wtimes,
                wdurations: wdurations
            });

            // Resolve the promise when speech concludes
            setTimeout(() => {
                if (subtitlesEl) {
                    subtitlesEl.style.display = "none";
                }
                resolve();
            }, totalDurationMs + 400); // 400ms padding
        });
    }

    // Echo says something out loud (Chirp voice) and shows it as a chat bubble.
    // A sequence number guards against overlap: if a newer utterance, a manual
    // mic tap, or leaving the step happens, the stale continuation does nothing.
    let echoSpeakSeq = 0;

    async function speakAgentLine(text, { arm = true } = {}) {
        const mySeq = ++echoSpeakSeq;
        setEchoState("Speaking…", "speaking");
        try {
            await speakWithTalkingHead(text);
        } catch (_) { /* ignore voice errors */ }
        // Superseded (newer line, manual mic, or left the step): leave state alone.
        if (mySeq !== echoSpeakSeq || state.activeStep !== 2) return;
        if (arm) armMicForAnswer();
        else setEchoState("Ready", null);
    }

    async function echoSpeak(text, { arm = true } = {}) {
        state.lastAgentText = text;
        state.conversation.push({ role: "agent", text });
        persistConversation();
        addChatBubble("agent", text);
        await speakAgentLine(text, { arm });
    }

    // Stops Echo's voice AND invalidates any pending speak continuation so it
    // won't re-arm the mic after the user takes a different action.
    function cancelEchoSpeech() {
        echoSpeakSeq++;
        stopChirp();
        if (head) {
            try { head.stopSpeaking(); } catch(e) {}
        }
        const subtitlesEl = document.getElementById("avatar-subtitles");
        if (subtitlesEl) {
            subtitlesEl.style.display = "none";
        }
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
            opening = await startConversation(getProfilePayload(), state.interviewerPersona, state.transcriptText);
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
        cancelEchoSpeech();
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
                persona: state.interviewerPersona,
                priorNotes: state.transcriptText
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

    // Manually steer the conversation onto a new subject (typed or surprise).
    async function steerToNewTopic(topic) {
        if (state.convBusy) return;
        hideNewTopicPopover();
        clearInterviewTimers();
        cancelEchoSpeech();
        if (state.isRecording || state.isFallbackRecording) stopDictation(true);

        state.convBusy = true;
        // Record the steer as a quiet user intent so the transcript stays coherent.
        const intentLabel = topic && topic.trim()
            ? `(Let's talk about ${topic.trim()}.)`
            : "(Let's talk about something new.)";
        state.conversation.push({ role: "user", text: intentLabel });
        addChatBubble("user", intentLabel);
        persistConversation();

        setEchoState("Thinking…", "thinking");
        const typing = showTypingBubble();
        try {
            const result = await steerConversation({
                profile: getProfilePayload(),
                history: state.conversation,
                covered: state.coverage,
                topic: topic || "",
                persona: state.interviewerPersona
            });
            if (typing) typing.remove();
            state.coverage = result.covered || state.coverage;
            state.lastSuggested = result.suggested_answer || "";
            updateCoverageUI();
            await echoSpeak(result.say);
        } catch (error) {
            if (typing) typing.remove();
            console.error("Topic switch failed:", error);
            showToast("Couldn't switch topics: " + error.message, "error");
        } finally {
            state.convBusy = false;
        }
    }

    function showNewTopicPopover() {
        if (!newTopicPopover) return;
        newTopicPopover.classList.remove("hidden");
        if (newTopicInput) {
            newTopicInput.value = "";
            setTimeout(() => newTopicInput.focus(), 50);
        }
    }

    function hideNewTopicPopover() {
        if (newTopicPopover) newTopicPopover.classList.add("hidden");
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

    // A clean, human-readable transcript for the person to keep / re-upload later.
    function buildReadableTranscript() {
        const name = state.elderName || "Narrator";
        const header = [
            `Life Story Conversation — ${name}`,
            `Age: ${state.elderAge || "—"}   Background: ${state.elderEthnicity || "—"}`,
            `Recorded: ${new Date().toLocaleString()}`,
            "".padEnd(48, "—")
        ];
        if (state.transcriptText && state.transcriptText.trim() && state.conversation.length === 0) {
            header.push("", state.transcriptText.trim());
        }
        const lines = state.conversation.map((m) =>
            m.role === "agent" ? `Echo: ${m.text}` : `${name}: ${m.text}`
        );
        return header.join("\n") + "\n\n" + lines.join("\n\n") + "\n";
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
        // Keep a clean human-readable copy for downloading, and persist it.
        state.finalTranscript = buildReadableTranscript();
        try { localStorage.setItem("echo_final_transcript", state.finalTranscript); } catch (_) {}

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
                audioFile: state.sourceTab === "upload" ? state.audioFile : null,
                userReferencePicture: state.userReferencePicture
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

    function processPortraitPhoto(file) {
        if (!file.type.startsWith("image/")) {
            showToast("Please upload an image file.", "error");
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const maxDim = 512;
                let width = img.width;
                let height = img.height;
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
                
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);
                
                const fullDataUrl = canvas.toDataURL("image/jpeg", 0.85);
                const base64Data = fullDataUrl.split(",")[1];
                
                state.userReferencePicture = {
                    mimeType: "image/jpeg",
                    data: base64Data,
                    dataUrl: fullDataUrl
                };
                
                photoPreviewImage.src = fullDataUrl;
                photoUploadPlaceholder.classList.add("hidden");
                photoUploadPreview.classList.remove("hidden");
                if (photoDropZone) photoDropZone.classList.add("has-photo");
                if (photoInputContainer) photoInputContainer.classList.add("has-photo");
                showToast("Portrait photo added successfully.", "success");
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    let activeCameraStream = null;

    async function startCamera() {
        if (cameraError) cameraError.classList.add("hidden");
        if (cameraLoader) cameraLoader.classList.remove("hidden");
        if (btnCameraCapture) btnCameraCapture.disabled = true;
        if (cameraStream) cameraStream.srcObject = null;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: "user"
                },
                audio: false
            });
            
            activeCameraStream = stream;
            if (cameraStream) {
                cameraStream.srcObject = stream;
                // Wait for video element to start playing to guarantee dimensions are loaded
                cameraStream.onloadedmetadata = () => {
                    if (cameraLoader) cameraLoader.classList.add("hidden");
                    if (btnCameraCapture) btnCameraCapture.disabled = false;
                };
            } else {
                if (cameraLoader) cameraLoader.classList.add("hidden");
            }
        } catch (error) {
            console.error("Camera access error:", error);
            if (cameraLoader) cameraLoader.classList.add("hidden");
            if (cameraError) cameraError.classList.remove("hidden");
            
            let errMsg = "Could not access camera. Please check permissions.";
            if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
                errMsg = "Camera access denied. Please grant permission in your browser settings.";
            } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
                errMsg = "No camera device found on your system.";
            }
            if (cameraErrorText) cameraErrorText.textContent = errMsg;
            showToast(errMsg, "error");
        }
    }

    function stopCamera() {
        if (activeCameraStream) {
            activeCameraStream.getTracks().forEach(track => track.stop());
            activeCameraStream = null;
        }
        if (cameraStream) cameraStream.srcObject = null;
        if (modalCamera) modalCamera.classList.add("hidden");
    }

    function capturePhoto() {
        if (!activeCameraStream || !cameraStream) return;

        const width = cameraStream.videoWidth || 640;
        const height = cameraStream.videoHeight || 480;

        // Downscale slightly to stay lightweight but good quality (max 512px dimension)
        const maxDim = 512;
        let destWidth = width;
        let destHeight = height;

        if (width > maxDim || height > maxDim) {
            if (width > height) {
                destHeight = Math.round((height * maxDim) / width);
                destWidth = maxDim;
            } else {
                destWidth = Math.round((width * maxDim) / height);
                destHeight = maxDim;
            }
        }

        if (cameraSnapshotCanvas) {
            cameraSnapshotCanvas.width = destWidth;
            cameraSnapshotCanvas.height = destHeight;
            const ctx = cameraSnapshotCanvas.getContext("2d");

            // Since video is mirrored for user experience, let's flip it back to save normally
            ctx.translate(destWidth, 0);
            ctx.scale(-1, 1);

            ctx.drawImage(cameraStream, 0, 0, destWidth, destHeight);

            // Reset transform
            ctx.setTransform(1, 0, 0, 1, 0, 0);

            const fullDataUrl = cameraSnapshotCanvas.toDataURL("image/jpeg", 0.85);
            const base64Data = fullDataUrl.split(",")[1];

            state.userReferencePicture = {
                mimeType: "image/jpeg",
                data: base64Data,
                dataUrl: fullDataUrl
            };

            photoPreviewImage.src = fullDataUrl;
            photoUploadPlaceholder.classList.add("hidden");
            photoUploadPreview.classList.remove("hidden");
            if (photoDropZone) photoDropZone.classList.add("has-photo");
            if (photoInputContainer) photoInputContainer.classList.add("has-photo");
            
            stopCamera();
            showToast("Portrait photo captured successfully.", "success");
        }
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
        if (elderGenderInput) {
            elderGenderInput.addEventListener("change", () => {
                if (elderGenderInput.value === "Specify") {
                    if (genderSpecifyContainer) genderSpecifyContainer.classList.remove("hidden");
                } else {
                    if (genderSpecifyContainer) genderSpecifyContainer.classList.add("hidden");
                }
            });
        }

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
        if (sampleProgressRange && sampleSpreads) {
            sampleProgressRange.max = sampleSpreads.length - 1;
        }

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

        // Settings "Done" simply closes the panel (auth is via ADC; no key needed).
        saveSettingsBtn.addEventListener("click", () => {
            settingsModal.classList.add("hidden");
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

        // Load a saved .txt transcript into the paste box.
        if (loadTranscriptBtn && transcriptFileInput) {
            loadTranscriptBtn.addEventListener("click", () => transcriptFileInput.click());
            transcriptFileInput.addEventListener("change", (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    const existing = pasteTranscriptArea.value.trim();
                    pasteTranscriptArea.value = (existing ? existing + "\n\n" : "") + String(reader.result || "");
                    state.transcriptText = pasteTranscriptArea.value;
                    showToast("Transcript loaded — Echo will know it and build on it.", "success");
                };
                reader.onerror = () => showToast("Could not read that file.", "error");
                reader.readAsText(file);
                transcriptFileInput.value = "";
            });
        }
        
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

        // Photo Uploader & Camera Event Listeners
        if (photoDropZone && photoUploader) {
            photoDropZone.addEventListener("click", () => {
                if (!photoDropZone.classList.contains("has-photo")) {
                    photoUploader.click();
                }
            });
            photoUploader.addEventListener("change", (e) => {
                const file = e.target.files && e.target.files[0];
                if (file) {
                    processPortraitPhoto(file);
                }
            });

            photoDropZone.addEventListener("dragover", (e) => {
                e.preventDefault();
                photoDropZone.classList.add("dragover");
            });

            photoDropZone.addEventListener("dragleave", () => {
                photoDropZone.classList.remove("dragover");
            });

            photoDropZone.addEventListener("drop", (e) => {
                e.preventDefault();
                photoDropZone.classList.remove("dragover");
                const file = e.dataTransfer.files && e.dataTransfer.files[0];
                if (file) {
                    processPortraitPhoto(file);
                }
            });
        }

        if (photoCameraZone) {
            photoCameraZone.addEventListener("click", () => {
                if (modalCamera) modalCamera.classList.remove("hidden");
                startCamera();
            });
        }

        if (btnCloseCamera) {
            btnCloseCamera.addEventListener("click", () => {
                stopCamera();
            });
        }

        if (btnCameraCancel) {
            btnCameraCancel.addEventListener("click", () => {
                stopCamera();
            });
        }

        if (btnCameraCapture) {
            btnCameraCapture.addEventListener("click", () => {
                capturePhoto();
            });
        }

        if (removePhotoBtn) {
            removePhotoBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                state.userReferencePicture = null;
                photoUploadPreview.classList.add("hidden");
                photoUploadPlaceholder.classList.remove("hidden");
                if (photoDropZone) photoDropZone.classList.remove("has-photo");
                if (photoInputContainer) photoInputContainer.classList.remove("has-photo");
                photoUploader.value = "";
                showToast("Portrait photo removed.", "info");
            });
        }

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
            if (elderGenderInput.value === "Specify") {
                state.elderGender = elderGenderCustomInput ? elderGenderCustomInput.value.trim() : "Specify";
            } else {
                state.elderGender = elderGenderInput.value;
            }
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

        // "Say that again" — re-speak Echo's last line (guarded against overlap).
        if (replayInterviewQuestionBtn) {
            replayInterviewQuestionBtn.addEventListener("click", () => {
                if (!state.lastAgentText) return;
                clearInterviewTimers();
                if (state.isRecording || state.isFallbackRecording) stopDictation(true);
                stopChirp();
                speakAgentLine(state.lastAgentText, { arm: true });
            });
        }

        if (interviewRecordBtn) {
            interviewRecordBtn.addEventListener("click", () => {
                // Any manual mic interaction cancels pending auto-timers.
                clearInterviewTimers();

                const wasWebSpeechRecording = state.isRecording && !state.useFallbackSpeech;

                if (state.isRecording || state.isFallbackRecording) {
                    // Stop & (for live web speech) capture what was said.
                    stopDictation();
                    if (wasWebSpeechRecording) {
                        setTimeout(() => onAnswerCaptured(), 400);
                    } else {
                        setEchoState("Your turn", null);
                    }
                } else {
                    // Start fresh: silence Echo and invalidate its pending re-arm.
                    cancelEchoSpeech();
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

        // New topic: open chooser; type a subject or get a surprise prompt.
        if (newTopicBtn) {
            newTopicBtn.addEventListener("click", () => {
                clearInterviewTimers();
                if (newTopicPopover && newTopicPopover.classList.contains("hidden")) {
                    showNewTopicPopover();
                } else {
                    hideNewTopicPopover();
                }
            });
        }
        if (newTopicGoBtn) {
            newTopicGoBtn.addEventListener("click", () => steerToNewTopic(newTopicInput ? newTopicInput.value : ""));
        }
        if (newTopicInput) {
            newTopicInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") { e.preventDefault(); steerToNewTopic(newTopicInput.value); }
            });
        }
        if (newTopicSurpriseBtn) {
            newTopicSurpriseBtn.addEventListener("click", () => steerToNewTopic(""));
        }
        if (newTopicCancelBtn) {
            newTopicCancelBtn.addEventListener("click", () => hideNewTopicPopover());
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
                    chaptersEdited: chaptersEdited,
                    userReferencePicture: state.userReferencePicture
                }, (msg) => addLog(msg, "info"));

                const bookPages = [];

                if (storyData.coverPage) {
                    bookPages.push({
                        chapterTitle: "",
                        narrative: "",
                        imagePrompt: `detailed visual illustration, ${storyData.coverPage.imagePrompt}`,
                        imageSrc: null,
                        imageStatus: "pending",
                        isCover: true
                    });
                }

                if (storyData.pages && Array.isArray(storyData.pages)) {
                    storyData.pages.forEach((p) => {
                        const basePrompt = `detailed visual illustration, ${p.imagePrompt}`;
                        bookPages.push({
                            chapterTitle: p.chapterTitle,
                            narrative: p.narrative,
                            imagePrompt: basePrompt,
                            imageSrc: null,
                            imageStatus: "pending"
                        });
                    });
                }

                if (storyData.endingPage) {
                    bookPages.push({
                        chapterTitle: "",
                        narrative: "",
                        imagePrompt: `detailed visual illustration, ${storyData.endingPage.imagePrompt}`,
                        imageSrc: null,
                        imageStatus: "pending",
                        isEnding: true
                    });
                }

                state.generatedBook = {
                    title: finalTitle,
                    subtitle: finalSubtitle,
                    pages: bookPages
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
            turnPage(state.currentPageIndex - 1);
        });

        nextPageBtn.addEventListener("click", () => {
            turnPage(state.currentPageIndex + 1);
        });

        bookProgressRange.addEventListener("input", (e) => {
            turnPage(parseInt(e.target.value));
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

        // Ambience controls (now live in the Settings modal)
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
                if (!startFireplace(parseFloat(volFireplace.value))) {
                    trackFireplace.checked = false;
                }
            } else {
                stopFireplace();
            }
        });

        volFireplace.addEventListener("input", () => {
            setFireplaceVolume(parseFloat(volFireplace.value));
        });

        regenerateImgBtn.addEventListener("click", () => {
            regenerateImageCurrentPage();
        });

        // Export dropdown: click to toggle (not hover), so the menu stays put
        // and isn't covered by the book UI.
        if (exportDropdownBtn) {
            exportDropdownBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                exportDropdown.classList.toggle("open");
            });
            document.addEventListener("click", (e) => {
                if (exportDropdown.classList.contains("open") && !exportDropdown.contains(e.target)) {
                    exportDropdown.classList.remove("open");
                }
            });
        }

        // Exports
        exportPdfBtn.addEventListener("click", (e) => {
            e.preventDefault();
            exportDropdown.classList.remove("open");
            stopSpeech();
            exportBookAsPdf();
        });

        exportHtmlBtn.addEventListener("click", (e) => {
            e.preventDefault();
            exportDropdown.classList.remove("open");
            downloadStandaloneHtml();
        });

        if (exportAudioBtn) {
            exportAudioBtn.addEventListener("click", (e) => {
                e.preventDefault();
                exportDropdown.classList.remove("open");
                stopSpeech();
                exportBookAsAudio();
            });
        }

        if (exportTranscriptBtn) {
            exportTranscriptBtn.addEventListener("click", (e) => {
                e.preventDefault();
                exportDropdown.classList.remove("open");
                downloadTranscript();
            });
        }

        exportJsonBtn.addEventListener("click", (e) => {
            e.preventDefault();
            exportDropdown.classList.remove("open");
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
        if (state.artStyle && state.artStyle.includes("cartoon")) styleShort = "Cartoon";
        illustrationStyleLabel.textContent = styleShort;

        renderPageSpread();
    }

    // --- Animated page-turn (3D book flip) ---
    let isFlipping = false;
    const prefersReducedMotion = window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;

    // Turns the book to targetIdx with a realistic page-flip, then renders it.
    // Faces are exact clones of the real page DOM so nothing shifts during the turn.
    function turnPage(targetIdx) {
        if (!state.generatedBook) return;
        const total = state.generatedBook.pages.length;
        if (isFlipping || targetIdx < 0 || targetIdx >= total || targetIdx === state.currentPageIndex) return;

        stopSpeech();
        const flip = document.getElementById("page-flip");
        const leftPageEl = document.getElementById("book-page-left");
        const rightPageEl = document.getElementById("book-page-right");

        // Reduced motion, missing elements, stacked mobile layout, or cover/ending transitions: swap instantly.
        const isStacked = window.innerWidth <= 768;
        const curPage = state.generatedBook.pages[state.currentPageIndex];
        const tgtPage = state.generatedBook.pages[targetIdx];
        const isTransitioningCoverOrEnding = (curPage && (curPage.isCover || curPage.isEnding)) || (tgtPage && (tgtPage.isCover || tgtPage.isEnding));

        if (prefersReducedMotion || isStacked || !flip || !leftPageEl || !rightPageEl || isTransitioningCoverOrEnding) {
            state.currentPageIndex = targetIdx;
            renderPageSpread();
            return;
        }

        const direction = targetIdx > state.currentPageIndex ? "next" : "prev";
        const front = flip.querySelector(".flip-front");
        const back = flip.querySelector(".flip-back");

        // 1) Snapshot the CURRENT spread for the front of the turning leaf.
        const curLeftHtml = leftPageEl.innerHTML;
        const curRightHtml = rightPageEl.innerHTML;

        // 2) Render the destination spread underneath (this updates the real pages).
        isFlipping = true;
        state.currentPageIndex = targetIdx;
        renderPageSpread();

        // 3) Snapshot the TARGET spread for the back of the leaf.
        const tgtLeftHtml = leftPageEl.innerHTML;
        const tgtRightHtml = rightPageEl.innerHTML;

        if (direction === "next") {
            // The right (text) page lifts and turns left; its back reveals the
            // destination's left (illustration) page.
            flip.className = "page-flip flipping from-right";
            front.innerHTML = curRightHtml;
            back.innerHTML = tgtLeftHtml;
        } else {
            // The left (illustration) page lifts and turns right; its back reveals
            // the destination's right (text) page.
            flip.className = "page-flip flipping from-left";
            front.innerHTML = curLeftHtml;
            back.innerHTML = tgtRightHtml;
        }

        // Prime at 0deg, then animate on the next frame.
        flip.style.transition = "none";
        flip.style.transform = "rotateY(0deg)";
        void flip.offsetWidth; // force reflow
        requestAnimationFrame(() => {
            flip.style.transition = "transform 0.7s cubic-bezier(0.30, 0, 0.20, 1)";
            flip.style.transform = direction === "next" ? "rotateY(-180deg)" : "rotateY(180deg)";
        });

        const finish = () => {
            flip.removeEventListener("transitionend", finish);
            flip.className = "page-flip";
            flip.style.transition = "none";
            flip.style.transform = "rotateY(0deg)";
            front.innerHTML = "";
            back.innerHTML = "";
            isFlipping = false;
        };
        flip.addEventListener("transitionend", finish);
        setTimeout(() => { if (isFlipping) finish(); }, 1000); // safety net
    }

    function renderPageSpread() {
        const idx = state.currentPageIndex;
        const page = state.generatedBook.pages[idx];
        const total = state.generatedBook.pages.length;

        const bookElement = document.getElementById("book-element");
        const leftPage = document.getElementById("book-page-left");
        const rightPage = document.getElementById("book-page-right");
        const spine = bookElement ? bookElement.querySelector(".book-spine") : null;
        const illusContainer = leftPage ? leftPage.querySelector(".illustration-container") : null;

        if (page.isCover || page.isEnding) {
            if (leftPage) {
                leftPage.style.width = "100%";
                leftPage.style.borderRadius = "4px";
            }
            if (rightPage) {
                rightPage.style.display = "none";
            }
            if (spine) {
                spine.style.display = "none";
            }
            if (illusContainer) {
                illusContainer.style.maxWidth = "70%";
                illusContainer.style.margin = "0 auto";
            }
        } else {
            if (leftPage) {
                leftPage.style.width = "";
                leftPage.style.borderRadius = "";
            }
            if (rightPage) {
                rightPage.style.display = "";
            }
            if (spine) {
                spine.style.display = "";
            }
            if (illusContainer) {
                illusContainer.style.maxWidth = "";
                illusContainer.style.margin = "";
            }
        }

        // Small settle wobble — skipped during a page-flip so they don't fight.
        if (!isFlipping && bookElement) {
            bookElement.style.transform = "rotateY(-2deg) scale(0.99)";
            setTimeout(() => {
                bookElement.style.transform = "rotateY(0deg) scale(1)";
            }, 300);
        }

        const hasCover = state.generatedBook.pages.some((p) => p.isCover);
        const hasEnding = state.generatedBook.pages.some((p) => p.isEnding);

        if (page.isCover) {
            pageNumLeft.textContent = "";
            pageNumRight.textContent = "";
        } else if (page.isEnding) {
            pageNumLeft.textContent = "";
            pageNumRight.textContent = "";
        } else {
            const chapIdx = hasCover ? idx - 1 : idx;
            pageNumLeft.textContent = (chapIdx * 2) + 1;
            pageNumRight.textContent = (chapIdx * 2) + 2;
        }

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

        if (page.isCover) {
            bookProgressText.textContent = "Front Cover";
            readAloudBtn.style.display = "none";
        } else if (page.isEnding) {
            bookProgressText.textContent = "Ending Page";
            readAloudBtn.style.display = "none";
        } else {
            const chapIdx = hasCover ? idx - 1 : idx;
            const totalChaps = total - (hasCover ? 1 : 0) - (hasEnding ? 1 : 0);
            bookProgressText.textContent = `Page ${(chapIdx * 2) + 1}-${(chapIdx * 2) + 2} of ${totalChaps * 2}`;
            readAloudBtn.style.display = "flex";
        }
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

            const hasCover = book.pages.some((p) => p.isCover);
            const hasEnding = book.pages.some((p) => p.isEnding);
            const totalChapters = book.pages.length - (hasCover ? 1 : 0) - (hasEnding ? 1 : 0);

            for (let i = 0; i < book.pages.length; i++) {
                const page = book.pages[i];
                if (page.isCover) {
                    addLog("Adding cover page…", "info");
                } else if (page.isEnding) {
                    addLog("Adding ending page…", "info");
                } else {
                    const chapNum = hasCover ? i : i + 1;
                    addLog(`Adding chapter ${chapNum} of ${totalChapters}…`, "info");
                }

                // Make sure this page's illustration has been generated.
                if (!page.isSampleAsset && page.imageStatus !== "ready") {
                    await ensurePageImage(i);
                }
                doc.addPage();

                doc.setFillColor(252, 250, 245);
                doc.rect(0, 0, pageW, pageH, "F");

                if (page.isCover || page.isEnding) {
                    const imgData = await loadImageData(page.imageSrc);
                    if (imgData) {
                        const ratio = imgData.h / imgData.w;
                        const drawW = contentW;
                        const drawH = Math.min(drawW * ratio, pageH - margin * 2);
                        const finalW = drawH / ratio;
                        const x = margin + (contentW - finalW) / 2;
                        const yCenter = margin + (pageH - margin * 2 - drawH) / 2;
                        try {
                            doc.addImage(imgData.dataUrl, "JPEG", x, yCenter, finalW, drawH);
                        } catch (_) {}
                    }
                    continue; // Skip text rendering and footer page numbering for cover/ending pages
                }

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

                // Page number footer (skip for cover/ending pages).
                if (!page.isCover && !page.isEnding) {
                    doc.setTextColor(170, 150, 120);
                    doc.setFontSize(10);
                    const pageNumVal = hasCover ? i : i + 1;
                    doc.text(`${pageNumVal}`, pageW / 2, pageH - 24, { align: "center" });
                }
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

    function downloadTranscript() {
        const text = state.finalTranscript || buildReadableTranscript();
        if (!text || !text.trim()) {
            showToast("No conversation transcript to download yet.", "error");
            return;
        }
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const base = (state.elderName || "life-story").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        a.download = `${base || "life_story"}_transcript.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Transcript downloaded.", "success");
    }

    async function exportBookAsAudio() {
        const book = state.generatedBook;
        if (!book || !book.pages || !book.pages.length) {
            showToast("No book to export yet.", "error");
            return;
        }

        loadingOverlayTitle.textContent = "Synthesizing Audiobook…";
        loadingOverlaySubtitle.textContent = "Generating narrative speech and stitching chapters into a single audio file.";
        generationLog.innerHTML = "";
        loadingOverlay.classList.remove("hidden");
        addLog("Preparing Web Audio context…", "info");

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            showToast("Your browser does not support the Web Audio API.", "error");
            loadingOverlay.classList.add("hidden");
            return;
        }

        const audioCtx = new AudioContextClass();
        const decodedBuffers = [];

        try {
            const hasCover = book.pages.some((p) => p.isCover);
            const hasEnding = book.pages.some((p) => p.isEnding);
            const totalChapters = book.pages.length - (hasCover ? 1 : 0) - (hasEnding ? 1 : 0);

            for (let i = 0; i < book.pages.length; i++) {
                const page = book.pages[i];
                let label = "";
                if (page.isCover) {
                    label = "Cover narration";
                } else if (page.isEnding) {
                    label = "Ending narration";
                } else {
                    const chapNum = hasCover ? i : i + 1;
                    label = `Chapter ${chapNum} of ${totalChapters}`;
                }

                const text = (page.narrative || "").trim();
                if (!text) {
                    addLog(`Skipping ${label} (no narrative text)...`, "info");
                    continue;
                }

                addLog(`Synthesizing ${label}...`, "info");

                // Request base64 TTS audio from the backend API
                const response = await fetch(`${BACKEND_BASE_URL}/api/tts`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        text: text,
                        voice: state.interviewerVoice,
                        rate: 0.90
                    })
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(err.error?.message || response.statusText);
                }

                const data = await response.json();
                if (!data || !data.audioContent) {
                    throw new Error("No audio content returned from TTS");
                }

                // Decode base64 to AudioBuffer
                addLog(`Decoding ${label} audio buffer...`, "info");
                const arrayBuf = base64ToArrayBuffer(data.audioContent);
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);

                // If we already have audio buffers, insert a silence gap before the new buffer
                if (decodedBuffers.length > 0) {
                    const silenceDur = 1.5;
                    const sampleRate = audioBuffer.sampleRate;
                    const numChannels = audioBuffer.numberOfChannels;
                    const silenceBuffer = audioCtx.createBuffer(numChannels, sampleRate * silenceDur, sampleRate);
                    decodedBuffers.push(silenceBuffer);
                }

                decodedBuffers.push(audioBuffer);
            }

            addLog("Stitching all chapters together...", "info");
            const combinedBuffer = concatenateAudioBuffers(audioCtx, decodedBuffers);
            if (!combinedBuffer) {
                throw new Error("No narrative text was found to synthesize.");
            }
            
            addLog("Encoding audiobook to WAV format...", "info");
            const wavBlob = audioBufferToWav(combinedBuffer);

            addLog("Triggering download...", "info");
            const url = URL.createObjectURL(wavBlob);
            const a = document.createElement("a");
            a.href = url;
            const cleanTitle = (book.title || "memoir").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
            a.download = `${cleanTitle || "memoir"}_audiobook.wav`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            addLog("Audiobook ready and downloaded!", "success");
            showToast("Your audiobook has been downloaded.", "success");
        } catch (error) {
            console.error("Audiobook export failed:", error);
            addLog(`Error: ${error.message}`, "error");
            showToast("Audiobook export failed: " + error.message, "error");
        } finally {
            await audioCtx.close().catch(() => {});
            setTimeout(() => loadingOverlay.classList.add("hidden"), 1500);
        }
    }

    function concatenateAudioBuffers(ctx, buffers) {
        if (!buffers.length) return null;
        let totalLength = 0;
        for (const b of buffers) {
            totalLength += b.length;
        }
        const numberOfChannels = buffers[0].numberOfChannels;
        const sampleRate = buffers[0].sampleRate;
        const outputBuffer = ctx.createBuffer(numberOfChannels, totalLength, sampleRate);
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const outputData = outputBuffer.getChannelData(channel);
            let offset = 0;
            for (const b of buffers) {
                outputData.set(b.getChannelData(channel), offset);
                offset += b.length;
            }
        }
        return outputBuffer;
    }

    function audioBufferToWav(buffer) {
        let numOfChan = buffer.numberOfChannels,
            length = buffer.length * numOfChan * 2 + 44,
            bufferArr = new ArrayBuffer(length),
            view = new DataView(bufferArr),
            channels = [], i, sample,
            offset = 0,
            pos = 0;

        function writeString(offsetStr, string) {
            for (let j = 0; j < string.length; j++) {
                view.setUint8(offsetStr + j, string.charCodeAt(j));
            }
        }

        // write HEADERS
        writeString(0, "RIFF");
        view.setUint32(4, length - 8, true);
        writeString(8, "WAVE");
        writeString(12, "fmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM - integer samples
        view.setUint16(22, numOfChan, true);
        view.setUint32(24, buffer.sampleRate, true);
        view.setUint32(28, buffer.sampleRate * 2 * numOfChan, true); // byte rate
        view.setUint16(32, numOfChan * 2, true); // block align
        view.setUint16(34, 16, true); // bits per sample
        writeString(36, "data");
        view.setUint32(40, length - 44, true);

        pos = 44;
        // write interleaved data
        for (i = 0; i < buffer.numberOfChannels; i++)
            channels.push(buffer.getChannelData(i));

        while (pos < length) {
            for (i = 0; i < numOfChan; i++) {             // interleave channels
                sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
                sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF); // scale to 16-bit signed PCM
                view.setInt16(pos, sample, true);          // write 16-bit sample
                pos += 2;
            }
            offset++;                                     // next sample
        }

        return new Blob([bufferArr], { type: "audio/wav" });
    }

    function downloadStandaloneHtml() {
        const book = state.generatedBook;

        // Embed the book data (image data URLs are already self-contained).
        const pagesData = book.pages.map((p) => ({
            chapterTitle: p.chapterTitle || "",
            narrative: p.narrative || "",
            imageSrc: p.imageSrc || "",
            isCover: p.isCover || false,
            isEnding: p.isEnding || false
        }));
        const dataJson = JSON.stringify({
            title: book.title || "My Story",
            subtitle: book.subtitle || "",
            pages: pagesData
        }).replace(/</g, "\\u003c");

        const template = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(book.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=Playfair+Display:wght@500;700&display=swap" rel="stylesheet">
<style>
  :root { --paper:linear-gradient(135deg,#fffefc 0%,#f6edd7 100%); --ink:#2b201a; --gold:#ab7f34; --edge:#4a362b; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:radial-gradient(circle at 50% 30%,#fbf7ee,#efe6d3); color:var(--ink);
    font-family:'EB Garamond',Georgia,serif; min-height:100vh; display:flex; flex-direction:column;
    align-items:center; padding:2rem 1rem 3rem; }
  header { text-align:center; margin-bottom:1.5rem; }
  header h1 { font-family:'Cinzel',serif; font-size:2rem; color:#54392c; }
  header p { font-style:italic; color:#8c7a6c; margin-top:.3rem; }
  .viewport { perspective:1800px; width:100%; max-width:1040px; }
  .book { position:relative; width:100%; aspect-ratio:16/10; display:flex;
    transform-style:preserve-3d; border-radius:6px; border:6px solid var(--edge);
    box-shadow:0 30px 70px rgba(0,0,0,.22); background:var(--paper); }
  .spine { position:absolute; left:50%; top:0; bottom:0; width:3.2%; transform:translateX(-50%);
    background:linear-gradient(to right,rgba(0,0,0,.06),rgba(0,0,0,.14) 20%,rgba(0,0,0,0) 50%,rgba(0,0,0,.14) 80%,rgba(0,0,0,.06));
    border-left:1px solid #d8c29b; border-right:1px solid #d8c29b; z-index:10; pointer-events:none; }
  .page { width:50%; height:100%; padding:2.6rem; display:flex; flex-direction:column;
    background:var(--paper); overflow:hidden; position:relative; }
  .page.left { box-shadow:inset -12px 0 20px rgba(0,0,0,.03); border-radius:4px 0 0 4px; }
  .page.right { box-shadow:inset 12px 0 20px rgba(0,0,0,.03); border-radius:0 4px 4px 0; }
  .illus { flex:1; border:1px solid #e0d0b0; border-radius:4px; overflow:hidden;
    background:#0000000a; display:flex; align-items:center; justify-content:center; }
  .illus img { width:100%; height:100%; object-fit:cover; display:block; }
  .narr { flex:1; min-height:0; display:flex; flex-direction:column; }
  .narr h2 { font-family:'Playfair Display',serif; font-size:1.5rem; color:#3b2319;
    border-bottom:1px solid rgba(201,160,84,.3); padding-bottom:.5rem; margin-bottom:1rem; flex:none; }
  .narr .body { flex:1; min-height:0; font-size:1.18rem; line-height:1.6;
    overflow-y:auto; padding-right:.6rem; padding-bottom:1.6rem; }
  .narr .body::-webkit-scrollbar { width:8px; }
  .narr .body::-webkit-scrollbar-thumb { background:rgba(120,90,50,.3); border-radius:4px; }
  .narr .body p { margin-bottom:.8rem; }
  .pnum { position:absolute; bottom:1rem; font-family:'Cinzel',serif; font-size:.72rem; color:#8d7b6e; opacity:.6; }
  .page.left .pnum { left:2rem; } .page.right .pnum { right:2rem; }
  /* Turning leaf */
  .leaf { position:absolute; top:0; height:100%; width:50%; z-index:30; transform-style:preserve-3d;
    pointer-events:none; display:none; }
  .leaf.on { display:block; }
  .leaf.from-right { left:50%; transform-origin:left center; }
  .leaf.from-left { left:0; transform-origin:right center; }
  .face { position:absolute; inset:0; backface-visibility:hidden; -webkit-backface-visibility:hidden;
    background:var(--paper); padding:2.6rem; overflow:hidden; display:flex; flex-direction:column; }
  .face.back { transform:rotateY(180deg); }
  nav { display:flex; align-items:center; gap:1rem; margin-top:1.5rem; flex-wrap:wrap; justify-content:center; }
  button { font-family:'EB Garamond',serif; font-size:1rem; padding:.6rem 1.2rem; border-radius:30px;
    border:1px solid #d8c29b; background:#fffdf9; color:#54392c; cursor:pointer; transition:.2s; }
  button:hover:not(:disabled) { background:#f3e8cf; }
  button:disabled { opacity:.4; cursor:default; }
  #ind { font-size:.9rem; color:#8d7b6e; min-width:120px; text-align:center; }
  input[type=range] { accent-color:var(--gold); width:200px; }
  @media (max-width:760px){
    .book{ flex-direction:column; aspect-ratio:auto; }
    .page{ width:100%; height:auto; } .spine,.leaf{ display:none !important; }
    .page.left{ border-bottom:1px solid #e0d0b0; }
    .illus{ max-height:300px; }
    .narr .body{ overflow:visible; padding-bottom:.5rem; }
  }
</style>
</head>
<body>
<header><h1>${escapeHtml(book.title)}</h1><p>${escapeHtml(book.subtitle)}</p></header>
<div class="viewport">
  <div class="book" id="book">
    <div class="spine"></div>
    <div class="leaf" id="leaf"><div class="face front" id="ff"></div><div class="face back" id="fb"></div></div>
    <div class="page left" id="pl"></div>
    <div class="page right" id="pr"></div>
  </div>
</div>
<nav>
  <button id="prev">&#8592; Previous</button>
  <input type="range" id="slider" min="0" value="0">
  <span id="ind"></span>
  <button id="next">Next &#8594;</button>
</nav>
<script>
const DATA = ${dataJson};
const pages = DATA.pages;
let idx = 0, flipping = false;
const pl=document.getElementById('pl'), pr=document.getElementById('pr');
const leaf=document.getElementById('leaf'), ff=document.getElementById('ff'), fb=document.getElementById('fb');
const prev=document.getElementById('prev'), next=document.getElementById('next');
const slider=document.getElementById('slider'), ind=document.getElementById('ind');
slider.max = pages.length-1;
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function illusHTML(p){ return '<div class="illus">'+(p.imageSrc?'<img src="'+p.imageSrc+'" alt="">':'')+'</div>'; }
function narrHTML(p){ var body=esc(p.narrative).split(/\\n\\n+/).map(function(t){return '<p>'+t+'</p>';}).join('');
  return '<div class="narr"><h2>'+esc(p.chapterTitle)+'</h2><div class="body">'+body+'</div></div>'; }
function render(){
  var p=pages[idx];
  var total = pages.length;
  var hasCover = pages.some(function(x){return x.isCover;});
  var hasEnding = pages.some(function(x){return x.isEnding;});
  var isCover = p.isCover;
  var isEnding = p.isEnding;
  
  var leftPageNum = '';
  var rightPageNum = '';
  var progressVal = '';
  
  if (isCover || isEnding) {
    pl.style.width = '100%';
    pl.style.borderRadius = '4px';
    pr.style.display = 'none';
    var spine = document.querySelector('.spine');
    if (spine) spine.style.display = 'none';
  } else {
    pl.style.width = '';
    pl.style.borderRadius = '';
    pr.style.display = '';
    var spine = document.querySelector('.spine');
    if (spine) spine.style.display = '';
  }
  
  if (isCover) {
    progressVal = 'Front Cover';
  } else if (isEnding) {
    progressVal = 'Ending Page';
  } else {
    var chapIdx = hasCover ? idx - 1 : idx;
    var totalChaps = total - (hasCover ? 1 : 0) - (hasEnding ? 1 : 0);
    leftPageNum = '<div class="pnum">'+(chapIdx*2+1)+'</div>';
    rightPageNum = '<div class="pnum">'+(chapIdx*2+2)+'</div>';
    progressVal = 'Pages '+(chapIdx*2+1)+'\\u2013'+(chapIdx*2+2)+' of '+(totalChaps*2);
  }
  
  pl.innerHTML = illusHTML(p) + leftPageNum;
  pr.innerHTML = narrHTML(p) + rightPageNum;
  
  if (isCover || isEnding) {
    var illus = pl.querySelector('.illus');
    if (illus) {
      illus.style.maxWidth = '70%';
      illus.style.margin = '0 auto';
    }
  }
  
  prev.disabled = idx===0; next.disabled = idx===pages.length-1;
  slider.value = idx; ind.textContent = progressVal;
}
function turn(target){
  if(flipping || target<0 || target>=pages.length || target===idx) return;
  var curPage = pages[idx];
  var tgtPage = pages[target];
  var isTransitioningCoverOrEnding = curPage.isCover || curPage.isEnding || tgtPage.isCover || tgtPage.isEnding;
  if(window.innerWidth<=760 || isTransitioningCoverOrEnding){ idx=target; render(); return; }
  var dir = target>idx ? 'next':'prev';
  var curL=pl.innerHTML, curR=pr.innerHTML;
  flipping=true; idx=target; render();
  if(dir==='next'){ leaf.className='leaf on from-right'; ff.innerHTML=curR; fb.innerHTML=pl.innerHTML; }
  else { leaf.className='leaf on from-left'; ff.innerHTML=curL; fb.innerHTML=pr.innerHTML; }
  leaf.style.transition='none'; leaf.style.transform='rotateY(0deg)';
  void leaf.offsetWidth;
  requestAnimationFrame(function(){
    leaf.style.transition='transform .7s cubic-bezier(.3,0,.2,1)';
    leaf.style.transform = dir==='next' ? 'rotateY(-180deg)' : 'rotateY(180deg)';
  });
  var done=function(){ leaf.removeEventListener('transitionend',done); leaf.className='leaf';
    leaf.style.transition='none'; leaf.style.transform='rotateY(0deg)'; ff.innerHTML=''; fb.innerHTML=''; flipping=false; };
  leaf.addEventListener('transitionend',done);
  setTimeout(function(){ if(flipping) done(); },1000);
}
prev.onclick=function(){ turn(idx-1); };
next.onclick=function(){ turn(idx+1); };
slider.oninput=function(e){ turn(parseInt(e.target.value,10)); };
document.addEventListener('keydown',function(e){ if(e.key==='ArrowRight') turn(idx+1); if(e.key==='ArrowLeft') turn(idx-1); });
render();
</script>
</body>
</html>`;

        const blob = new Blob([template], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const cleanTitle = (book.title || "memoir").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        a.download = `${cleanTitle || "memoir"}_flipbook.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Interactive flipbook exported — open it in any browser.", "success");
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
