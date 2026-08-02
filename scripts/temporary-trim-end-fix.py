from pathlib import Path

path = Path('src/content.js')
text = path.read_text(encoding='utf-8')
old = "const value = renderList(child, { ...context, listIndent: continuationIndent }).trim();"
new = "const value = renderList(child, { ...context, listIndent: continuationIndent }).trimEnd();"
count = text.count(old)
if count != 1:
    raise SystemExit(f'Expected exactly one nested-list trim call, found {count}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
