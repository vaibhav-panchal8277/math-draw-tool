document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('mathCanvas');
    const ctx = canvas.getContext('2d');
    const container = canvas.parentElement;

    // UI Elements
    const convertBtn = document.getElementById('convertBtn');
    const undoBtn = document.getElementById('undoBtn');
    const clearBtn = document.getElementById('clearBtn');
    
    // Result Elements
    const placeholder = document.getElementById('placeholder');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const resultContent = document.getElementById('resultContent');
    const mathPreview = document.getElementById('mathPreview');
    const latexOutput = document.getElementById('latexOutput');
    const copyBtn = document.getElementById('copyBtn');

    // Settings Modal
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const apiKeyInput = document.getElementById('apiKey');

    // State
    let isDrawing = false;
    let strokes = []; // To save canvas states for undo
    let lastX = 0;
    let lastY = 0;

    // Load credentials from local storage
    const loadCredentials = () => {
        apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
    };

    loadCredentials();

    // Canvas Resize & Setup
    const initContext = () => {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#f8fafc'; // Bright off-white
    };

    const resizeCanvas = () => {
        const rect = container.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        
        let tempImg = null;
        if (canvas.width > 0) {
            // Save current drawing before resizing
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            tempCanvas.getContext('2d').drawImage(canvas, 0, 0);
            tempImg = tempCanvas;
        }

        canvas.width = rect.width * 2;
        canvas.height = rect.height * 2;
        
        ctx.scale(2, 2);
        initContext();
        
        if (tempImg) {
            ctx.drawImage(tempImg, 0, 0, rect.width, rect.height);
        } else {
            saveState();
        }
    };

    setTimeout(resizeCanvas, 100);
    window.addEventListener('resize', resizeCanvas);

    const saveState = () => {
        strokes.push(canvas.toDataURL());
        if (strokes.length > 50) strokes.shift(); // Keep memory usage low
    };

    // Drawing Logic
    const startDrawing = (e) => {
        isDrawing = true;
        const { x, y } = getCoordinates(e);
        lastX = x;
        lastY = y;
        
        initContext();
        ctx.beginPath();
        ctx.moveTo(x, y);
        
        // Draw a small dot immediately
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const draw = (e) => {
        if (!isDrawing) return;
        if (e.cancelable) e.preventDefault();
        
        const { x, y } = getCoordinates(e);
        ctx.lineTo(x, y);
        ctx.stroke();
        
        // We keep the path open to make drawing smoother
        lastX = x;
        lastY = y;
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        isDrawing = false;
        ctx.closePath();
        saveState();
    };

    const getCoordinates = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    // Event Listeners for drawing
    canvas.addEventListener('mousedown', startDrawing);
    window.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDrawing);

    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    window.addEventListener('touchmove', (e) => {
        if (isDrawing) draw(e);
    }, { passive: false });
    window.addEventListener('touchend', stopDrawing);

    // Tools
    undoBtn.addEventListener('click', () => {
        if (strokes.length > 1) {
            strokes.pop(); // Remove current state
            const previousState = strokes[strokes.length - 1];
            const img = new Image();
            img.src = previousState;
            img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width / 2, canvas.height / 2);
            };
        } else if (strokes.length === 1) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            strokes = [];
            saveState();
        }
    });

    clearBtn.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        strokes = [];
        saveState();
        
        // Reset Result UI
        placeholder.classList.remove('hidden');
        resultContent.classList.add('hidden');
        loadingIndicator.classList.add('hidden');
    });

    // Generate White Background image for API
    const getCanvasImageWithWhiteBg = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Fill white background
        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Create a temporary canvas to hold the black strokes
        const strokeCanvas = document.createElement('canvas');
        strokeCanvas.width = canvas.width;
        strokeCanvas.height = canvas.height;
        const strokeCtx = strokeCanvas.getContext('2d');

        for (let i = 0; i < imgData.data.length; i += 4) {
            if (imgData.data[i + 3] > 0) {
                imgData.data[i] = 0;     // R
                imgData.data[i + 1] = 0; // G
                imgData.data[i + 2] = 0; // B
            }
        }
        
        strokeCtx.putImageData(imgData, 0, 0);
        
        // Draw the black strokes ON TOP OF the white background
        tempCtx.drawImage(strokeCanvas, 0, 0);
        
        return tempCanvas.toDataURL('image/jpeg');
    };

    // Convert API Call
    convertBtn.addEventListener('click', async () => {
        // Check if canvas is empty
        if (strokes.length <= 1) return;

        placeholder.classList.add('hidden');
        resultContent.classList.add('hidden');
        loadingIndicator.classList.remove('hidden');

        try {
            let latexString = "";

            // Call Local Python Backend
            const base64ImageWithPrefix = getCanvasImageWithWhiteBg();
            
            const response = await fetch('http://localhost:8000/api/convert', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    image: base64ImageWithPrefix
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                console.error("Local Backend Error:", errData);
                throw new Error('Local server failed to process the image. Make sure backend.py is running.');
            }

            const data = await response.json();
            
            if (data.text) {
                latexString = data.text;
            } else {
                throw new Error("Invalid response format from local server");
            }
            
            // Remove the wrapper delimiters if they exist like \( ... \) or $$ ... $$
            latexString = latexString.replace(/^\\\[|\\\]$/g, '')
                                     .replace(/^\\\(|\\\)$/g, '')
                                     .replace(/^\$\$|\$\$$/g, '')
                                     .replace(/```latex/gi, '')
                                     .replace(/```/g, '')
                                     .trim();

            // Render Result
            latexOutput.textContent = latexString;
            
            // Render KaTeX
            try {
                katex.render(latexString, mathPreview, {
                    throwOnError: false,
                    displayMode: true
                });
            } catch (e) {
                mathPreview.textContent = "Error rendering math";
            }

            loadingIndicator.classList.add('hidden');
            resultContent.classList.remove('hidden');

        } catch (error) {
            console.error(error);
            alert(`Error: ${error.message}\n\nPlease make sure you have started the local Python server (backend.py).`);
            loadingIndicator.classList.add('hidden');
            placeholder.classList.remove('hidden');
        }
    });

    // Copy to Clipboard
    copyBtn.addEventListener('click', () => {
        const text = latexOutput.textContent;
        navigator.clipboard.writeText(text).then(() => {
            const originalHtml = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
            setTimeout(() => {
                copyBtn.innerHTML = originalHtml;
            }, 2000);
        });
    });

    // Settings Modal Handlers
    settingsBtn.addEventListener('click', () => {
        loadCredentials();
        settingsModal.classList.remove('hidden');
    });

    closeModalBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });

    saveSettingsBtn.addEventListener('click', () => {
        localStorage.setItem('gemini_api_key', apiKeyInput.value.trim());
        settingsModal.classList.add('hidden');
        
        const btnText = saveSettingsBtn.textContent;
        saveSettingsBtn.textContent = "Saved!";
        setTimeout(() => {
            saveSettingsBtn.textContent = btnText;
        }, 1000);
    });
});
