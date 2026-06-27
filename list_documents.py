import os

parent_dir = 'c:/Users/a2132/Documents'
if os.path.exists(parent_dir):
    try:
        items = os.listdir(parent_dir)
        print("Folders/files in Documents:")
        for item in items:
            path = os.path.join(parent_dir, item)
            if os.path.isdir(path):
                print(f"  [DIR] {item}")
            else:
                print(f"  [FILE] {item}")
    except Exception as e:
        print(f"Error listing parent: {e}")
else:
    print("Parent directory does not exist.")
