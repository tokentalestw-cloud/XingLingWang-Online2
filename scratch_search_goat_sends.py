import os

output_lines = []
filepath = "c:/Users/a2132/Documents/星靈王/XingLingWang_v7_fixed/static/game.js"
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()
for idx, line in enumerate(lines):
    if "goat_spell_resolved" in line:
        output_lines.append(f"Line {idx+1}: {line.strip()}")

with open("scratch_goat_sends.txt", "w", encoding="utf-8") as out:
    out.write("\n".join(output_lines))
