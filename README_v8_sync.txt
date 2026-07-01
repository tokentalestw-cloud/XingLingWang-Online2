星靈王 V8 同步核心測試版

本版重點：
1. 後端 ConnectionManager 會保存每個房間雙方最近一次完整 sync_game_state 快照。
2. Client render 後會節流送出完整快照，Server 保存後再廣播給對手。
3. 對手重連時，Server 會用對手快照恢復畫面並要求最新同步。
4. Render 建議使用單 worker：
   Start Command:
   python3 -m uvicorn app:app --host 0.0.0.0 --port $PORT --workers 1
   Environment:
   WEB_CONCURRENCY=1

注意：
本版是 V8 同步核心，不是最終 Redis 版。若 Render 多 instance 或未來多人擴大，下一步應接 Redis。
