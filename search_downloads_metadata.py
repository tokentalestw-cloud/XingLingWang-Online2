import os

downloads_dir = 'C:/Users/a2132/Downloads'
if os.path.exists(downloads_dir):
    try:
        files = os.listdir(downloads_dir)
        matching = []
        for f in files:
            path = os.path.join(downloads_dir, f)
            if os.path.isfile(path) and f.lower().endswith(('.xlsx', '.xls', '.csv', '.txt', '.json')):
                matching.append(f"{f} ({os.path.getsize(path)} bytes)")
        print(f"Total matching files in Downloads: {len(matching)}")
        for idx, f in enumerate(sorted(matching), 1):
            print(f"  {idx:02d}: {f}")
    except Exception as e:
        print("Error listing downloads:", e)
else:
    print("Downloads directory does not exist.")
