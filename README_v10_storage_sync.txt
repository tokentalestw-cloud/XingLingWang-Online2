星靈王 V10 Storage Sync 測試版

本版在 V9 Reliable Sync 上新增「可持久化房間狀態」：

1. 若 Render 有設定 REDIS_URL，會自動使用 Redis 保存 room_state 與 event_logs。
2. 若沒有 REDIS_URL，會使用 data/runtime_rooms.json 作為單機備援。
3. 玩家重連時，Server 可嘗試從保存的 room_state 恢復。
4. 新增：
   GET  /api/debug/storage
   GET  /api/debug/rooms
   POST /api/debug/rooms/{room_id}/clear

Render 設定：
Build Command:
pip install -r requirements.txt

Start Command:
python3 -m uvicorn app:app --host 0.0.0.0 --port $PORT --workers 1

Environment:
WEB_CONCURRENCY=1

若未來要升級 Redis：
在 Render Environment 增加：
REDIS_URL=<你的 Redis 連線字串>

注意：
免費 Render Web Service 若休眠或重啟，檔案備援可能不適合作為正式資料庫。
正式長期穩定請使用 Redis。
