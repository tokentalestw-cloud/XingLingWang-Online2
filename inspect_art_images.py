import json

with open('c:/Users/a2132/Documents/星靈王/XingLingWang_v7_fixed/data/cards.json', 'r', encoding='utf-8') as f:
    all_cards = json.load(f)

# Let's inspect the first 15 artwork cards in cards.json
art_cards = [c for c in all_cards if c and str(c.get("id")).startswith("ART-")]

print(f"Total Artwork cards in cards.json: {len(art_cards)}")
for c in art_cards[:15]:
    print(f"ID: {c.get('id')}, Name: {c.get('name')}, Image: {c.get('image')}")
