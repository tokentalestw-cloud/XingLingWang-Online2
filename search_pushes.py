def search_pushes():
    filepath = 'c:/Users/a2132/Documents/星靈王/XingLingWang_v7_fixed/static/game.js'
    with open(filepath, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f, 1):
            if '.push(' in line:
                print(f"{idx}: {line.strip()}")

search_pushes()
