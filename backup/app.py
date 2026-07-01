from pathlib import Path
import json
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

BASE = Path(__file__).parent
app = FastAPI(title="星靈王 Web Final")

app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")

@app.get("/")
def index():
    return FileResponse(BASE / "static" / "index.html")

@app.get("/api/cards")
def get_cards():
    return json.loads((BASE / "data" / "cards.json").read_text(encoding="utf-8"))

@app.get("/api/decks")
def get_decks():
    return json.loads((BASE / "data" / "decks.json").read_text(encoding="utf-8"))
