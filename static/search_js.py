import sys
sys.stdout.reconfigure(encoding='utf-8')

def search_file(filepath, pattern):
    print(f"Searching for '{pattern}' in {filepath}...")
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        for idx, line in enumerate(f, 1):
            if pattern in line:
                print(f"{idx}: {line.strip()}")

if __name__ == '__main__':
    pattern = sys.argv[1] if len(sys.argv) > 1 else 'XLW_callGameNegatedThisTurn'
    search_file('game_v8.js', pattern)
