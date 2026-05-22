import os

file_path = os.path.join("frontend", "src", "app", "globals.css")

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Find the start of the corrupt block we added
start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if "/* --- START CORRUPT BLOCK ---" in line:
        start_idx = i
    if "--- END CORRUPT BLOCK --- */" in line:
        end_idx = i

if start_idx != -1 and end_idx != -1:
    # Remove lines from start_idx to end_idx (inclusive)
    del lines[start_idx : end_idx + 1]
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print("Fixed globals.css successfully!")
else:
    print("Could not find the corrupt block markers.")
