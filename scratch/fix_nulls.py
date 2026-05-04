import re
import os

def fix_js_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find assignments like: someVar.innerHTML = ...
    # and replace with: if(someVar) someVar.innerHTML = ...
    # This is a bit tricky with multi-line templates, but we can do a targeted regex for the known elements.
    
    # Let's replace elements.xxx.innerHTML = ...
    # with if(elements.xxx) elements.xxx.innerHTML = ...
    
    content = re.sub(r'(elements\.[a-zA-Z0-9_]+)\.innerHTML\s*=', r'if (\1) \1.innerHTML =', content)
    content = re.sub(r'(elements\.[a-zA-Z0-9_]+)\.textContent\s*=', r'if (\1) \1.textContent =', content)
    content = re.sub(r'(elements\.[a-zA-Z0-9_]+)\.classList', r'if (\1) \1.classList', content)
    content = re.sub(r'(elements\.[a-zA-Z0-9_]+)\.style', r'if (\1) \1.style', content)
    content = re.sub(r'(elements\.[a-zA-Z0-9_]+)\.value', r'if (\1) \1.value', content)
    content = re.sub(r'(elements\.[a-zA-Z0-9_]+)\.addEventListener', r'if (\1) \1.addEventListener', content)
    
    # Also for some standard DOM accesses
    content = re.sub(r'(container)\.innerHTML\s*=', r'if (\1) \1.innerHTML =', content)
    content = re.sub(r'(body)\.innerHTML\s*=', r'if (\1) \1.innerHTML =', content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Fixed {filepath}")

base_dir = r"c:\Users\Piyush koche\OneDrive\Desktop\stock- predect\static\js"
for f in os.listdir(base_dir):
    if f.endswith('.js'):
        fix_js_file(os.path.join(base_dir, f))
