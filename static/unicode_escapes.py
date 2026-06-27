strings = [
    "敵方場上",
    "召喚至敵方",
    "召喚到敵方",
    "召喚至敵方場上",
    "召喚至敵方場上時",
    "召喚到敵方場上",
    "召喚到敵方場上時",
    "當有星靈",
    "時，"
]

for s in strings:
    escaped = s.encode('unicode_escape').decode('ascii')
    # Change \uXXXX to uppercase
    print(f'"{s}" -> "{escaped}"')
