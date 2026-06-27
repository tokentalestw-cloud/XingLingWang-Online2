import os

output_lines = []
filepath = "c:/Users/a2132/Documents/星靈王/XingLingWang_v7_fixed/static/game.js"
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()
for idx, line in enumerate(lines):
    if "player_front" in line or "enemy_front" in line:
        if any(x in line for x in ["replace", "==", "===", "?", ":", "[", "{", "map"]):
            if len(line) < 150:
                output_lines.append(f"Line {idx+1}: {line.strip()}")

with open("scratch_zone_strings.txt", "w", encoding="utf-8") as out:
    out.write("\n".join(output_lines))
