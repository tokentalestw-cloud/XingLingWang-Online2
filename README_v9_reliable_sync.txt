星靈王 V9 Reliable Sync 測試版

本版新增：
1. Server 端事件序號與事件紀錄。
2. Server 端保存每個玩家最近完整快照。
3. Client 不再用 sessionStorage 舊狀態恢復線上對戰，避免舊資料覆蓋最新戰局。
4. Client 每次重要 ws.send 後，會自動補送完整 sync_game_state。
5. Client 每 5 秒進行一次完整狀態校正。
6. 重連時自動 request_full_state，Server 也會嘗試用對手快照恢復畫面。
7. 新增 /api/debug/rooms 可檢查房間與同步序號。

Render 設定：
Build Command:
pip install -r requirements.txt

Start Command:
python3 -m uvicorn app:app --host 0.0.0.0 --port $PORT --workers 1

Environment:
WEB_CONCURRENCY=1

Health:
/health

注意：
這版仍然是單 worker 記憶體同步版。若未來要跨多 instance 或 Render 重啟保房間，需要 V10 Redis。
