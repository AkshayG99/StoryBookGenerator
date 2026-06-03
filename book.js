/**
 * Book Engine & UI Controller Module
 * Handles UI interactions, Speech-to-Text, Speech-to-Speech, layout modes, and exports
 */

document.addEventListener("DOMContentLoaded", () => {
    // --- Application State ---
    const state = {
        activeStep: 1, // 1: Import, 2: Outline, 3: Book Viewer
        isInWizard: false, // Tracks if we are in wizard mode or landing mode
        elderName: "",
        artStyle: "",
        bookLength: 6,
        narrationTone: "",
        sourceTab: "paste",
        transcriptText: "",
        audioFile: null,
        bookOutline: null,
        generatedBook: null, // { title, subtitle, pages: [{ chapterTitle, narrative, imagePrompt, imageSrc }] }
        currentPageIndex: 0,
        isRecording: false,
        speechUtterance: null
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
        3: document.getElementById("step-indicator-3")
    };
    
    // Landing Page Buttons
    const startMemoirBtn = document.getElementById("btn-start-memoir");
    const viewSampleBtn = document.getElementById("btn-view-sample");
    
    // Panel 1: Import
    const panelStep1 = document.getElementById("panel-step-1");
    const backToLandingBtn = document.getElementById("btn-back-to-landing");
    const elderNameInput = document.getElementById("elder-name");
    const artStyleSelect = document.getElementById("illustration-style");
    const bookLengthSelect = document.getElementById("book-length");
    const toneSelect = document.getElementById("narration-tone");
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

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            state.isRecording = true;
            recordBtn.classList.add("recording");
            dictationStatus.textContent = "Listening closely... Speak now.";
            showToast("Recording started. Speak clearly.", "info");
        };

        recognition.onerror = (event) => {
            console.error("Speech Recognition Error:", event.error);
            showToast(`Speech error: ${event.error}`, "error");
            stopDictation();
        };

        recognition.onend = () => {
            stopDictation();
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
                pasteTranscriptArea.value += (pasteTranscriptArea.value ? " " : "") + finalTranscript;
                state.transcriptText = pasteTranscriptArea.value;
            }

            dictationPreview.innerHTML = pasteTranscriptArea.value + 
                (interimTranscript ? `<span style="opacity: 0.5;"> ${interimTranscript}</span>` : "");
            dictationPreview.scrollTop = dictationPreview.scrollHeight;
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
    function init() {
        const savedKey = getApiKey();
        if (savedKey) {
            apiKeyInput.value = savedKey;
        }

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
        panelStep2.classList.remove("active");
        panelStep3.classList.remove("active");

        if (step === 1) panelStep1.classList.add("active");
        if (step === 2) panelStep2.classList.add("active");
        if (step === 3) panelStep3.classList.add("active");

        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // --- Dictation Control ---
    function startDictation() {
        if (!recognition) return;
        try {
            dictationPreview.textContent = pasteTranscriptArea.value || "Speak now...";
            recognition.start();
        } catch (e) {
            console.error(e);
        }
    }

    function stopDictation() {
        if (!recognition) return;
        state.isRecording = false;
        recordBtn.classList.remove("recording");
        dictationStatus.textContent = "Recording stopped. Click microphone to record again.";
        try {
            recognition.stop();
        } catch (e) {}
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
                setStep(3);
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
            state.artStyle = artStyleSelect.value;
            state.bookLength = parseInt(bookLengthSelect.value);
            state.narrationTone = toneSelect.value;
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

            let hasInputContent = false;
            if (state.sourceTab === "paste" && state.transcriptText) hasInputContent = true;
            if (state.sourceTab === "upload" && state.audioFile) hasInputContent = true;
            if (state.sourceTab === "dictate" && state.transcriptText) hasInputContent = true;

            if (!hasInputContent) {
                showToast("Please provide story content by pasting transcripts, dictating speech, or uploading a file.", "error");
                return;
            }

            generationLog.innerHTML = "";
            loadingOverlayTitle.textContent = "Analyzing Memories...";
            loadingOverlaySubtitle.textContent = "The editor is organizing the recollections into chronological milestones.";
            loadingOverlay.classList.remove("hidden");

            try {
                addLog("Analyzing transcripts...", "info");
                
                const outline = await generateBookOutline({
                    elderName: state.elderName,
                    numPages: state.bookLength,
                    tone: state.narrationTone,
                    artStyle: state.artStyle,
                    transcriptText: (state.sourceTab === "upload" ? null : state.transcriptText),
                    audioFile: (state.sourceTab === "upload" ? state.audioFile : null)
                }, (msg) => addLog(msg, "info"));

                state.bookOutline = outline;
                addLog("Outline created successfully!", "success");
                
                setTimeout(() => {
                    loadingOverlay.classList.add("hidden");
                    renderOutlineEditor();
                    setStep(2);
                }, 1000);

            } catch (error) {
                addLog(`Analysis failed: ${error.message}`, "error");
                showToast(`Generation error: ${error.message}`, "error");
                setTimeout(() => {
                    loadingOverlay.classList.add("hidden");
                }, 4000);
            }
        });

        // --- Step 2 Navigation ---
        backToStep1Btn.addEventListener("click", () => {
            setStep(1);
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
                    transcriptText: (state.sourceTab === "upload" ? null : state.transcriptText),
                    audioFile: (state.sourceTab === "upload" ? state.audioFile : null),
                    chaptersEdited: chaptersEdited
                }, (msg) => addLog(msg, "info"));

                state.generatedBook = {
                    title: finalTitle,
                    subtitle: finalSubtitle,
                    pages: storyData.pages.map((p, idx) => {
                        const basePrompt = `detailed visual illustration, ${p.imagePrompt}`;
                        const seed = Math.floor(Math.random() * 10000);
                        const imgUrl = `https://image.pollinations.ai/p/${encodeURIComponent(basePrompt)}?width=800&height=600&nologo=true&seed=${seed}`;
                        
                        return {
                            chapterTitle: p.chapterTitle,
                            narrative: p.narrative,
                            imagePrompt: basePrompt,
                            imageSrc: imgUrl,
                            seed: seed
                        };
                    })
                };

                addLog("Memoir storybook crafted successfully!", "success");
                showToast("Your virtual picture book is ready!", "success");

                state.currentPageIndex = 0;
                
                setTimeout(() => {
                    loadingOverlay.classList.add("hidden");
                    renderVirtualBook();
                    setStep(3);
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
            window.print();
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
        
        const tempImg = new Image();
        tempImg.onload = () => {
            pageIllustration.src = page.imageSrc;
            pageIllustration.classList.remove("hidden");
            pageIllustrationSpinner.style.display = "none";
        };
        tempImg.onerror = () => {
            pageIllustration.src = "";
            pageIllustrationSpinner.style.display = "none";
            pageIllustration.classList.remove("hidden");
            showToast("Failed to load illustration. Try repainting.", "error");
        };
        tempImg.src = page.imageSrc;

        prevPageBtn.disabled = idx === 0;
        nextPageBtn.disabled = idx === total - 1;
        bookProgressRange.value = idx;
        bookProgressText.textContent = `Page ${(idx * 2) + 1}-${(idx * 2) + 2} of ${total * 2}`;
    }

    // --- Audio Voice Narration (TTS) ---
    function toggleReadAloud() {
        if (window.speechSynthesis && window.speechSynthesis.speaking) {
            stopSpeech();
            return;
        }

        const page = state.generatedBook.pages[state.currentPageIndex];
        state.speechUtterance = new SpeechSynthesisUtterance(page.narrative);
        state.speechUtterance.rate = 0.82; // Warm slower rate
        state.speechUtterance.pitch = 0.95;

        const voices = window.speechSynthesis.getVoices();
        let chosenVoice = voices.find(v => v.name.includes("Google UK English Male") || v.name.includes("Google US English") || v.name.includes("Samantha"));
        if (!chosenVoice && voices.length > 0) {
            chosenVoice = voices[0];
        }
        if (chosenVoice) {
            state.speechUtterance.voice = chosenVoice;
        }

        state.speechUtterance.onstart = () => {
            readAloudBtn.innerHTML = `<i class="fa-solid fa-volume-xmark"></i> <span>Stop Narration</span>`;
            readAloudBtn.classList.add("btn-primary");
            readAloudBtn.classList.remove("btn-secondary");
        };

        state.speechUtterance.onend = () => {
            resetReadAloudButton();
        };

        state.speechUtterance.onerror = () => {
            resetReadAloudButton();
        };

        window.speechSynthesis.speak(state.speechUtterance);
    }

    function stopSpeech() {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        resetReadAloudButton();
    }

    function resetReadAloudButton() {
        if (readAloudBtn) {
            readAloudBtn.innerHTML = `<i class="fa-solid fa-volume-high"></i> <span>Read Aloud</span>`;
            readAloudBtn.classList.add("btn-secondary");
            readAloudBtn.classList.remove("btn-primary");
        }
    }

    // --- Regenerate Current Page Image ---
    function regenerateImageCurrentPage() {
        const idx = state.currentPageIndex;
        const page = state.generatedBook.pages[idx];
        
        if (page.isSampleAsset) return; // safety check
        
        pageIllustration.classList.add("hidden");
        pageIllustrationSpinner.style.display = "flex";

        page.seed = Math.floor(Math.random() * 10000);
        page.imageSrc = `https://image.pollinations.ai/p/${encodeURIComponent(page.imagePrompt)}?width=800&height=600&nologo=true&seed=${page.seed}`;
        
        const tempImg = new Image();
        tempImg.onload = () => {
            pageIllustration.src = page.imageSrc;
            pageIllustration.classList.remove("hidden");
            pageIllustrationSpinner.style.display = "none";
            showToast("Scene repainted with new artistic canvas strokes.", "success");
        };
        tempImg.src = page.imageSrc;
    }

    // --- EXPORTS ---
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
