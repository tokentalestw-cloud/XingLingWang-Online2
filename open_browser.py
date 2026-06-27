import time
import webbrowser
import os
import sys
import socket

url = "http://127.0.0.1:8000"
print(f"正在偵測伺服器啟動狀態 (連接 {url})...")

# 循環檢測連線，最多等待 10 秒 (20 次 * 0.5 秒)
port_ready = False
for _ in range(20):
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            s.connect(("127.0.0.1", 8000))
            port_ready = True
            break
    except:
        time.sleep(0.5)

if port_ready:
    print("偵測到伺服器已成功啟動！正在為您自動開啟網頁...")
else:
    print("等待伺服器啟動逾時，將嘗試直接開啟網頁...")

try:
    # 在 Windows 系統上，使用 cmd 的 start 指令開啟網址是最保險、最能調用預設瀏覽器的方式
    if os.name == 'nt':
        os.system(f"start {url}")
    else:
        webbrowser.open(url)
except Exception as e:
    try:
        webbrowser.open(url)
    except:
        pass
