from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pix2tex.cli import LatexOCR
from PIL import Image
import io
import base64
import os

app = FastAPI()

# Allow frontend to communicate with this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (script.js, style.css)
# We mount this BEFORE the root route if we want to serve them specifically,
# but it's easier to just have a root route for index.html.
current_dir = os.path.dirname(os.path.abspath(__file__))

print("Loading local AI model (this may take a minute on first run)...")
# Initialize the open-source model (downloads weights on first run)
model = LatexOCR()
print("Model loaded successfully!")

@app.get("/")
async def read_index():
    return FileResponse(os.path.join(current_dir, "index.html"))

# Mount the rest of the files as static files
app.mount("/static", StaticFiles(directory=current_dir), name="static")
# Alternatively, since we want them at the root level for index.html to find them:
@app.get("/{file_path:path}")
async def serve_static(file_path: str):
    full_path = os.path.join(current_dir, file_path)
    if os.path.isfile(full_path):
        return FileResponse(full_path)
    return JSONResponse(status_code=404, content={"error": "File not found"})

@app.post("/api/convert")
async def convert_image(data: dict):
    try:
        # Extract base64 image from request
        base64_str = data.get("image", "")
        if base64_str.startswith("data:image"):
            base64_str = base64_str.split(",")[1]
            
        image_bytes = base64.b64decode(base64_str)
        image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        
        # Process image using local AI
        math_latex = model(image)
        return {"text": math_latex}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
