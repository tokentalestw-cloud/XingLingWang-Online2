import os
import json
import shutil
from pathlib import Path
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional

BASE = Path(__file__).parent
app = FastAPI(title="星靈王 Web Final")

@app.middleware("http")
async def add_no_cache_header(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response

class NoCacheStaticFiles(StaticFiles):
    def file_response(self, *args, **kwargs) -> Response:
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

app.mount("/static", NoCacheStaticFiles(directory=BASE / "static"), name="static")

# ===== 線上雙人即時房間管理器 =====
class ConnectionManager:
    def __init__(self):
        # room_id -> { "player1": (player_id, ws), "player2": (player_id, ws) }
        self.rooms = {}

    async def connect(self, room_id: str, player_id: str, websocket: WebSocket):
        await websocket.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = {}
        
        # 決定玩家角色 (Player1 或 Player2) 並支援斷線重連
        is_reconnect = False
        role_assigned = None
        
        if "player1" in self.rooms[room_id] and self.rooms[room_id]["player1"][0] == player_id:
            self.rooms[room_id]["player1"] = (player_id, websocket)
            role_assigned = "player1"
            is_reconnect = True
        elif "player2" in self.rooms[room_id] and self.rooms[room_id]["player2"][0] == player_id:
            self.rooms[room_id]["player2"] = (player_id, websocket)
            role_assigned = "player2"
            is_reconnect = True
        else:
            if "player1" not in self.rooms[room_id]:
                self.rooms[room_id]["player1"] = (player_id, websocket)
                role_assigned = "player1"
            elif "player2" not in self.rooms[room_id]:
                self.rooms[room_id]["player2"] = (player_id, websocket)
                role_assigned = "player2"
            else:
                # 房客重複登入或房間已滿
                print(f"Room {room_id}: connection rejected for {player_id}.")
                await websocket.send_json({
                    "type": "error",
                    "message": "房間已滿或您已在連線中！"
                })
                await websocket.close()
                return

        print(f"Room {room_id}: {role_assigned} ({player_id}) connected. Is reconnect: {is_reconnect}")
        
        await websocket.send_json({
            "type": "welcome",
            "role": role_assigned,
            "is_reconnect": is_reconnect,
            "message": f"成功連接房間 {room_id}！角色為 {role_assigned}。"
        })
        
        # 通知雙方
        if "player1" in self.rooms[room_id] and "player2" in self.rooms[room_id]:
            p1_id, p1_ws = self.rooms[room_id]["player1"]
            p2_id, p2_ws = self.rooms[room_id]["player2"]
            
            if is_reconnect:
                other_ws = p2_ws if role_assigned == "player1" else p1_ws
                this_ws = p1_ws if role_assigned == "player1" else p2_ws
                try:
                    await other_ws.send_json({
                        "type": "opponent_rejoined",
                        "message": "對手已重新連線！對決繼續。"
                    })
                except:
                    pass
                try:
                    await this_ws.send_json({
                        "type": "opponent_rejoined_ack",
                        "message": "已成功重新連接到對決！"
                    })
                except:
                    pass
            else:
                try:
                    await p1_ws.send_json({
                        "type": "opponent_joined",
                        "message": "對手已進入房間，遊戲即將開始！"
                    })
                except:
                    pass
                try:
                    await p2_ws.send_json({
                        "type": "opponent_joined",
                        "message": "已連接到房主，遊戲即將開始！"
                    })
                except:
                    pass

    def disconnect(self, room_id: str, player_id: str):
        if room_id in self.rooms:
            r = self.rooms[room_id]
            if "player1" in r and r["player1"][0] == player_id:
                r.pop("player1", None)
                print(f"Room {room_id}: Player1 disconnected.")
            elif "player2" in r and r["player2"][0] == player_id:
                r.pop("player2", None)
                print(f"Room {room_id}: Player2 disconnected.")
            
            if not r.get("player1") and not r.get("player2"):
                self.rooms.pop(room_id, None)
                print(f"Room {room_id} is now empty and destroyed.")

    async def broadcast_to_other(self, room_id: str, sender_id: str, message: dict):
        if room_id in self.rooms:
            r = self.rooms[room_id]
            target_ws = None
            if "player1" in r and r["player1"][0] == sender_id:
                if "player2" in r:
                    target_ws = r["player2"][1]
            elif "player2" in r and r["player2"][0] == sender_id:
                if "player1" in r:
                    target_ws = r["player1"][1]
            
            if target_ws:
                # 自動翻轉座標，保證兩端視角都是我方在下、對手在上
                flipped_message = self.flip_message_coordinates(message)
                await target_ws.send_json(flipped_message)

    def flip_message_coordinates(self, msg: dict) -> dict:
        flipped = json.loads(json.dumps(msg))
        zone_map = {
            "player_front": "enemy_front",
            "player_back": "enemy_back",
            "enemy_front": "player_front",
            "enemy_back": "player_back"
        }
        
        # 翻轉頂層所有的區域欄位
        for key in ["zone", "fromZone", "toZone", "attZone", "targetZone"]:
            if key in flipped:
                z = flipped[key]
                if z in zone_map:
                    flipped[key] = zone_map[z]
        
        # 翻轉 target 欄位 (可能是物件也可能是字串)
        if "target" in flipped:
            if isinstance(flipped["target"], dict):
                tz = flipped["target"].get("zone")
                if tz in zone_map:
                    flipped["target"]["zone"] = zone_map[tz]
            elif isinstance(flipped["target"], str):
                z = flipped["target"]
                if z in zone_map:
                    flipped["target"] = zone_map[z]

        # 翻轉 tributes 祭品陣列
        if "tributes" in flipped and isinstance(flipped["tributes"], list):
            for t in flipped["tributes"]:
                tz = t.get("zone")
                if tz in zone_map:
                    t["zone"] = zone_map[tz]
                    
        return flipped

manager = ConnectionManager()

@app.websocket("/ws/battle/{room_id}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, player_id: str):
    await manager.connect(room_id, player_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            if message.get("action") == "ping":
                # 傳回 pong 以維持雙向活躍連線，防止 Render 50 秒閒置逾時斷線
                await websocket.send_json({"action": "pong"})
                continue
            await manager.broadcast_to_other(room_id, player_id, message)
    except WebSocketDisconnect:
        manager.disconnect(room_id, player_id)
        if room_id in manager.rooms:
            r = manager.rooms[room_id]
            remaining_ws = None
            if "player1" in r:
                remaining_ws = r["player1"][1]
            elif "player2" in r:
                remaining_ws = r["player2"][1]
            if remaining_ws:
                try:
                    await remaining_ws.send_json({
                        "type": "opponent_disconnected",
                        "temporary": True,
                        "message": "對手連線已中斷，正在等待其重新連接..."
                    })
                except:
                    pass

def is_neutral_card(card_obj: dict, cid: str) -> bool:
    if not card_obj:
        return False
    id_upper = cid.upper()
    return (
        card_obj.get("faction") in ["中立", "中立單位"] or
        card_obj.get("race") in ["中立", "中立單位"] or
        card_obj.get("deck") in ["中立", "中立單位"] or
        id_upper.startswith("NEU-")
    )

# 卡牌表單結構
class CardSaveSchema(BaseModel):
    id: str
    name: str
    deck: str
    type: str
    faction: str
    attack: str # 可以是數字字串，也可以是 "盾"
    score: int
    tribute: int
    keywords: List[str]
    effect_text: str
    is_extra_deck: bool
    extra_deck_limit: int
    art_subtype: Optional[str] = ""
    original_file: str # 例如 "喵喵賊/IMG_5796.JPG"
    mana: int
    usable_phases: List[str]
    trigger_condition: Optional[str] = ""
    previous_id: Optional[str] = None

@app.get("/")
def index():
    return FileResponse(BASE / "static" / "index.html")

@app.get("/api/cards")
def get_cards():
    cards_file = BASE / "data" / "cards.json"
    if not cards_file.exists():
        return []
    return json.loads(cards_file.read_text(encoding="utf-8"))

@app.get("/api/decks")
def get_decks():
    decks_file = BASE / "data" / "decks.json"
    if not decks_file.exists():
        return {}
    return json.loads(decks_file.read_text(encoding="utf-8"))

# 1. 取得未處理與已處理的照片列表
@app.get("/api/admin/unprocessed")
def get_unprocessed_images():
    src_dir = Path("C:/Users/a2132/Downloads/星靈王圖片")
    
    # 讀取目前資料庫中已經關聯的原始相片檔名，避免重複錄入
    cards_file = BASE / "data" / "cards.json"
    processed_files = set()
    cards_data = []
    if cards_file.exists():
        try:
            cards_data = json.loads(cards_file.read_text(encoding="utf-8"))
            for c in cards_data:
                orig = c.get("original_file")
                if orig:
                    processed_files.add(orig.replace('\\', '/').strip())
        except Exception as e:
            print("讀取 cards.json 失敗:", e)

    subdirs = ["喵喵賊", "妖怪村莊", "藝術品", "中立單位", "獸人", "虛擬世界"]
    unprocessed = []
    
    # 1. 掃描本機下載資料夾得到未處理圖片
    if src_dir.exists():
        for sub in subdirs:
            subpath = src_dir / sub
            if subpath.exists():
                for f in sorted(os.listdir(subpath)):
                    if f.lower().endswith(('.jpg', '.jpeg', '.png')):
                        rel_path = f"{sub}/{f}"
                        photo_obj = {
                            "subdir": sub,
                            "filename": f,
                            "rel_path": rel_path,
                            "size": os.path.getsize(subpath / f)
                        }
                        if rel_path not in processed_files:
                            unprocessed.append(photo_obj)

    # 2. 已入庫卡片：直接使用 cards.json 裡的所有卡片，即使本地 Downloads 照片已被刪除也可以進行編輯！
    processed = []
    for c in cards_data:
        orig = c.get("original_file") or ""
        # 推導 subdir 和 filename 供前端顯示與預覽
        subdir = "中立單位" if c.get("deck") == "中立" else c.get("deck")
        if "/" in orig:
            parts = orig.split("/")
            subdir = parts[0]
            filename = parts[1]
        else:
            filename = os.path.basename(c.get("image") or "") or f"{c.get('id')}.jpeg"

        processed.append({
            "id": c.get("id"),
            "name": c.get("name"),
            "subdir": subdir,
            "filename": filename,
            "rel_path": orig,
            "size": 0
        })
                        
    return {"status": "success", "unprocessed": unprocessed, "processed": processed}

# 2. 串流下載目錄中的卡牌原始照片
@app.get("/api/admin/image/{subdir}/{filename}")
def get_admin_image(subdir: str, filename: str):
    src_path = Path("C:/Users/a2132/Downloads/星靈王圖片") / subdir / filename
    if not src_path.exists():
        raise HTTPException(status_code=404, detail="圖片檔案不存在")
    return FileResponse(src_path)

# 3. 儲存卡牌、更新 JSON 並複製/重命名照片
@app.post("/api/admin/save")
def save_new_card(card: CardSaveSchema):
    # 1. 統一將 ID 轉為小寫，底線分隔，如 ART-0001 轉為 art_0001.jpeg，CAT-001 轉為 cat_001.jpeg
    clean_id = card.id.strip().lower().replace("-", "_")
    dest_filename = f"{clean_id}.jpeg"
    dest_dir = BASE / "static" / "card_images"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / dest_filename

    src_path = Path("C:/Users/a2132/Downloads/星靈王圖片") / card.original_file if card.original_file else None

    # 2. 讀取並更新 cards.json
    cards_file = BASE / "data" / "cards.json"
    cards_file.parent.mkdir(parents=True, exist_ok=True)
    cards = []
    if cards_file.exists():
        try:
            cards = json.loads(cards_file.read_text(encoding="utf-8"))
        except:
            cards = []

    # 尋找是否已有這張卡牌的已入庫資料
    existing_card = None
    if card.previous_id:
        existing_card = next((c for c in cards if c.get("id") == card.previous_id), None)
    elif card.original_file:
        existing_card = next((c for c in cards if c.get("original_file") == card.original_file), None)

    # 處理圖片拷貝/重命名
    old_clean_id = existing_card.get("id").strip().lower().replace("-", "_") if existing_card else None
    old_dest_filename = f"{old_clean_id}.jpeg" if old_clean_id else None
    old_dest_path = dest_dir / old_dest_filename if old_dest_filename else None

    if src_path and src_path.exists():
        try:
            shutil.copy2(src_path, dest_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"複製照片失敗: {str(e)}")
    elif old_dest_path and old_dest_path.exists():
        if old_dest_path != dest_path:
            try:
                shutil.copy2(old_dest_path, dest_path)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"複製快取照片失敗: {str(e)}")
    elif not dest_path.exists():
        raise HTTPException(status_code=400, detail=f"找不到原始照片且伺服器端無快取")

    # 如果修改了 ID 且舊圖片存在，則刪除舊的圖片檔
    if old_dest_path and old_dest_path.exists() and old_dest_path != dest_path:
        try:
            os.remove(old_dest_path)
        except Exception as e:
            print(f"刪除舊圖片 {old_dest_path} 失敗:", e)

    # 刪除已存在的卡牌（覆寫）
    if card.previous_id:
        cards = [c for c in cards if c.get("id") != card.previous_id]
    cards = [c for c in cards if c.get("id") != card.id]

    # 建構卡牌對象，若勾選額外牌組，則 deck_eligible = false (不入一般牌組)
    new_card_obj = {
        "id": card.id,
        "name": card.name,
        "deck": "中立" if card.deck == "中立單位" else card.deck,
        "type": card.type,
        "faction": "中立" if card.faction == "中立單位" else card.faction,
        "race": "中立" if card.faction == "中立單位" else card.faction, # 種族與陣營名稱一致
        "attack": card.attack,
        "score": card.score,
        "tribute": card.tribute,
        "keywords": card.keywords,
        "effect_text": card.effect_text,
        "image": f"/static/card_images/{dest_filename}",
        "original_file": card.original_file,
        "deck_eligible": not card.is_extra_deck,
        "mana": card.mana,
        "usable_phases": card.usable_phases,
        "trigger_condition": card.trigger_condition,
    }
    
    if card.is_extra_deck:
        new_card_obj["extra_deck_limit"] = card.extra_deck_limit
    if card.art_subtype:
        new_card_obj["art_subtype"] = card.art_subtype

    cards.append(new_card_obj)
    
    # 依 ID 排序使資料庫整齊
    cards.sort(key=lambda x: x.get("id", ""))
    cards_file.write_text(json.dumps(cards, ensure_ascii=False, indent=2), encoding="utf-8")

    # 3. 讀取並更新 decks.json
    decks_file = BASE / "data" / "decks.json"
    decks_data = {}
    if decks_file.exists():
        try:
            decks_data = json.loads(decks_file.read_text(encoding="utf-8"))
        except:
            decks_data = {}

    # 移除舊 ID
    if card.previous_id:
        for dname in list(decks_data.keys()):
            if card.previous_id in decks_data[dname]:
                decks_data[dname].remove(card.previous_id)

    # 確保對應的牌組陣列存在
    deck_name = card.deck
    if deck_name not in decks_data:
        decks_data[deck_name] = []

    # 將卡牌 ID 加入陣列（避免重複）
    if card.id not in decks_data[deck_name]:
        decks_data[deck_name].append(card.id)
        decks_data[deck_name].sort()

    # 新增：若更新後的牌組是 "藝術品"，清除不屬於藝術品陣營的卡片 ID
    if deck_name == "藝術品":
        # 建立 id -> card mapping
        cards_file = BASE / "data" / "cards.json"
        card_map = {}
        if cards_file.exists():
            try:
                all_cards = json.loads(cards_file.read_text(encoding="utf-8"))
                for c in all_cards:
                    cid = c.get("id")
                    if cid:
                        card_map[cid] = c
            except:
                pass
        # 保留僅 faction 為 藝術品 或中立的卡片 ID
        valid_ids = []
        for cid in decks_data[deck_name]:
            card_obj = card_map.get(cid)
            if card_obj and (card_obj.get("faction") == "藝術品" or is_neutral_card(card_obj, cid)):
                valid_ids.append(cid)
        decks_data[deck_name] = valid_ids

    decks_file.write_text(json.dumps(decks_data, ensure_ascii=False, indent=2), encoding="utf-8")

    # 同步複製一份 decks.json 到 static/ 目錄，讓前端讀取
    static_decks = BASE / "static" / "decks.json"
    static_decks.write_text(json.dumps(decks_data, ensure_ascii=False, indent=2), encoding="utf-8")

    return {"status": "success", "message": f"成功建立卡牌 {card.name}，照片已命名為 {dest_filename}"}

# 牌組儲存表單結構
class DeckSaveSchema(BaseModel):
    deck_name: str
    card_ids: List[str]
    extra_card_ids: Optional[List[str]] = None

# 新增：清理藝術品牌組中不屬於藝術品陣營的卡片 (可手動呼叫)
@app.post("/api/clean_art_deck")
def clean_art_deck():
    decks_file = BASE / "data" / "decks.json"
    if not decks_file.exists():
        raise HTTPException(status_code=404, detail="decks.json not found")
    decks_data = json.loads(decks_file.read_text(encoding="utf-8"))
    if "藝術品" not in decks_data:
        return {"status": "success", "message": "藝術品牌組不存在，無需清理"}
    # 讀取所有卡片資料以驗證陣營
    cards_file = BASE / "data" / "cards.json"
    card_map = {}
    if cards_file.exists():
        all_cards = json.loads(cards_file.read_text(encoding="utf-8"))
        for c in all_cards:
            cid = c.get("id")
            if cid:
                card_map[cid] = c
    # 只保留 faction 為 藝術品 或中立的卡片 ID
    valid_ids = [cid for cid in decks_data["藝術品"] if card_map.get(cid, {}).get("faction") == "藝術品" or is_neutral_card(card_map.get(cid), cid)]
    removed = len(decks_data["藝術品"]) - len(valid_ids)
    decks_data["藝術品"] = valid_ids
    # 寫回檔案
    decks_file.write_text(json.dumps(decks_data, ensure_ascii=False, indent=2), encoding="utf-8")
    # 同步 static
    static_decks = BASE / "static" / "decks.json"
    static_decks.write_text(json.dumps(decks_data, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"status": "success", "message": f"已移除 {removed} 張不屬於藝術品陣營的卡片"}

# 4. 儲存/重構整套牌組
@app.post("/api/decks/save")
def save_deck(data: DeckSaveSchema):
    decks_file = BASE / "data" / "decks.json"
    decks_data = {}
    if decks_file.exists():
        try:
            decks_data = json.loads(decks_file.read_text(encoding="utf-8"))
        except:
            decks_data = {}

    # 嚴格後端陣營排他性過濾
    cards_file = BASE / "data" / "cards.json"
    card_map = {}
    if cards_file.exists():
        try:
            all_cards = json.loads(cards_file.read_text(encoding="utf-8"))
            for c in all_cards:
                cid = c.get("id")
                if cid:
                    card_map[cid] = c
        except:
            pass

    cleaned_ids = []
    deck_name = data.deck_name
    for cid in data.card_ids:
        card_obj = card_map.get(cid)
        if not card_obj:
            continue
        
        id_upper = cid.upper()
        is_valid = True
        
        if not is_neutral_card(card_obj, cid):
            if deck_name == "藝術品":
                if any(x in id_upper for x in ["CAT", "VLG", "ORC", "VIR"]) or card_obj.get("faction") in ["喵喵賊", "妖怪村莊", "獸人", "虛擬世界"]:
                    is_valid = False
            elif deck_name == "喵喵賊":
                if any(x in id_upper for x in ["VLG", "ART", "ORC", "VIR"]) or card_obj.get("faction") in ["藝術品", "妖怪村莊", "獸人", "虛擬世界"]:
                    is_valid = False
            elif deck_name == "妖怪村莊":
                if any(x in id_upper for x in ["CAT", "ART", "ORC", "VIR"]) or card_obj.get("faction") in ["藝術品", "喵喵賊", "獸人", "虛擬世界"]:
                    is_valid = False
            elif deck_name == "獸人":
                if any(x in id_upper for x in ["CAT", "VLG", "ART", "VIR"]) or card_obj.get("faction") in ["喵喵賊", "妖怪村莊", "藝術品", "虛擬世界"]:
                    is_valid = False
            elif deck_name == "虛擬世界":
                if any(x in id_upper for x in ["CAT", "VLG", "ART", "ORC"]) or card_obj.get("faction") in ["喵喵賊", "妖怪村莊", "藝術品", "獸人"]:
                    is_valid = False
                
        if is_valid:
            cleaned_ids.append(cid)

    # 覆寫該牌組（已過濾乾淨）
    total_mana = sum(int(card_map.get(cid, {}).get("mana") or 0) for cid in cleaned_ids if card_map.get(cid))
    if len(cleaned_ids) != 20:
        raise HTTPException(status_code=400, detail="主牌組必須剛好為 20 張才能儲存！")
    if total_mana > 15:
        raise HTTPException(status_code=400, detail="主牌組法力值總和不可超過 15 點！")

    decks_data[data.deck_name] = cleaned_ids

    # 處理並過濾額外牌組
    if data.extra_card_ids is not None:
        cleaned_extra_ids = []
        for cid in data.extra_card_ids:
            card_obj = card_map.get(cid)
            if not card_obj:
                continue
            
            id_upper = cid.upper()
            is_valid = True
            
            if not is_neutral_card(card_obj, cid):
                if deck_name == "藝術品":
                    if any(x in id_upper for x in ["CAT", "VLG", "ORC", "VIR"]) or card_obj.get("faction") in ["喵喵賊", "妖怪村莊", "獸人", "虛擬世界"]:
                        is_valid = False
                elif deck_name == "喵喵賊":
                    if any(x in id_upper for x in ["VLG", "ART", "ORC", "VIR"]) or card_obj.get("faction") in ["藝術品", "妖怪村莊", "獸人", "虛擬世界"]:
                        is_valid = False
                elif deck_name == "妖怪村莊":
                    if any(x in id_upper for x in ["CAT", "ART", "ORC", "VIR"]) or card_obj.get("faction") in ["藝術品", "喵喵賊", "獸人", "虛擬世界"]:
                        is_valid = False
                elif deck_name == "獸人":
                    if any(x in id_upper for x in ["CAT", "VLG", "ART", "VIR"]) or card_obj.get("faction") in ["喵喵賊", "妖怪村莊", "藝術品", "虛擬世界"]:
                        is_valid = False
                elif deck_name == "虛擬世界":
                    if any(x in id_upper for x in ["CAT", "VLG", "ART", "ORC"]) or card_obj.get("faction") in ["喵喵賊", "妖怪村莊", "藝術品", "獸人"]:
                        is_valid = False
                    
            if is_valid:
                cleaned_extra_ids.append(cid)
        decks_data[data.deck_name + "_extra"] = cleaned_extra_ids

    try:
        decks_file.write_text(json.dumps(decks_data, ensure_ascii=False, indent=2), encoding="utf-8")
        
        # 同步複製一份 decks.json 到 static/ 目錄，讓前端讀取
        static_decks = BASE / "static" / "decks.json"
        static_decks.write_text(json.dumps(decks_data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"儲存牌組失敗: {str(e)}")

    return {"status": "success", "message": f"成功儲存 {data.deck_name} 牌組！"}


