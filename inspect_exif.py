import os
from PIL import Image
from PIL.ExifTags import TAGS

base_dir = 'C:/Users/a2132/Downloads/星靈王圖片'

def inspect_file(subdir, filename):
    path = os.path.join(base_dir, subdir, filename)
    print(f"\n--- Checking EXIF for {subdir}/{filename} ---")
    try:
        with Image.open(path) as img:
            print("Size:", img.size)
            print("Format:", img.format)
            info = img.getexif()
            if not info:
                print("No EXIF info found.")
                return
            for tag_id in info:
                tag = TAGS.get(tag_id, tag_id)
                data = info.get(tag_id)
                if isinstance(data, bytes):
                    try:
                        data = data.decode('utf-8')
                    except:
                        try:
                            data = data.decode('gbk')
                        except:
                            pass
                print(f"  {tag}: {repr(data)}")
    except Exception as e:
        print("Error:", e)

# Test first files from each folder
inspect_file("喵喵賊", "IMG_5796.JPG")
inspect_file("妖怪村莊", "IMG_5818.JPG")
inspect_file("藝術品", "IMG_6135.JPG")
