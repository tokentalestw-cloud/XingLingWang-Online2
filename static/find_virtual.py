import json

with open('../data/cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

virtual_cards = []
for c in cards:
    if '虛擬' in str(c):
        virtual_cards.append({
            'id': c.get('id'),
            'name': c.get('name'),
            'faction': c.get('faction'),
            'keywords': c.get('keywords'),
            'effect_text': c.get('effect_text')
        })

with open('find_virtual_result.txt', 'w', encoding='utf-8') as out:
    json.dump(virtual_cards, out, ensure_ascii=False, indent=2)

print("Done! Found", len(virtual_cards), "cards.")
