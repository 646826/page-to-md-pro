from pathlib import Path

path = Path('src/content.js')
text = path.read_text(encoding='utf-8')

old = r'''  function renderList(list, context) {
    const ordered = list.tagName === 'OL';
    const start = Number.parseInt(list.getAttribute('start') || '1', 10) || 1;
    const itemContext = { ...context, listDepth: (context.listDepth || 0) + 1 };
    const items = Array.from(list.children).filter((child) => child.tagName === 'LI');
    return items.map((item, index) => renderListItem(item, itemContext, ordered ? `${start + index}.` : '-')).filter(Boolean).join('\n');
  }

  function renderListItem(item, context, defaultMarker) {
    const clone = item.cloneNode(true);
    const task = Array.from(clone.querySelectorAll('[data-p2m-task]'))
      .find((candidate) => candidate.closest('li') === clone);
    const marker = task ? `${defaultMarker} [${task.getAttribute('data-p2m-task') === 'checked' ? 'x' : ' '}]` : defaultMarker;
    task?.remove();

    const nested = [];
    const contentNodes = [];
    for (const child of Array.from(clone.childNodes)) {
      if (child instanceof Element && (child.tagName === 'UL' || child.tagName === 'OL')) nested.push(child);
      else contentNodes.push(child);
    }

    const indent = '  '.repeat(Math.max(0, (context.listDepth || 1) - 1));
    const content = renderBlocks(contentNodes, context).trim();
    const lines = content ? content.split('\n') : [''];
    const output = [`${indent}${marker}${lines[0] ? ` ${lines[0]}` : ''}`];
    for (let index = 1; index < lines.length; index += 1) output.push(`${indent}  ${lines[index]}`);
    for (const child of nested) {
      const value = renderList(child, context).trim();
      if (value) output.push(value);
    }
    return output.join('\n');
  }
'''

new = r'''  function renderList(list, context) {
    const ordered = list.tagName === 'OL';
    const items = Array.from(list.children).filter((child) => child.tagName === 'LI');
    const reversed = ordered && list.hasAttribute('reversed');
    const defaultStart = reversed ? items.length : 1;
    let counter = ordered && list.hasAttribute('start')
      ? parseIntegerAttribute(list.getAttribute('start'), defaultStart)
      : defaultStart;
    const step = reversed ? -1 : 1;

    return items.map((item) => {
      let marker = '-';
      if (ordered) {
        if (item.hasAttribute('value')) {
          counter = parseIntegerAttribute(item.getAttribute('value'), counter);
        }
        marker = `${counter}.`;
        counter += step;
      }
      return renderListItem(item, context, marker);
    }).filter(Boolean).join('\n');
  }

  function renderListItem(item, context, defaultMarker) {
    const clone = item.cloneNode(true);
    const task = Array.from(clone.querySelectorAll('[data-p2m-task]'))
      .find((candidate) => candidate.closest('li') === clone);
    const marker = task ? `${defaultMarker} [${task.getAttribute('data-p2m-task') === 'checked' ? 'x' : ' '}]` : defaultMarker;
    task?.remove();

    const nested = [];
    const contentNodes = [];
    for (const child of Array.from(clone.childNodes)) {
      if (child instanceof Element && (child.tagName === 'UL' || child.tagName === 'OL')) nested.push(child);
      else contentNodes.push(child);
    }

    const indent = typeof context.listIndent === 'string' ? context.listIndent : '';
    const continuationIndent = `${indent}${' '.repeat(defaultMarker.length + 1)}`;
    const content = renderBlocks(contentNodes, context).trim();
    const lines = content ? content.split('\n') : [''];
    const output = [`${indent}${marker}${lines[0] ? ` ${lines[0]}` : ''}`];
    for (let index = 1; index < lines.length; index += 1) output.push(`${continuationIndent}${lines[index]}`);
    for (const child of nested) {
      const value = renderList(child, { ...context, listIndent: continuationIndent }).trim();
      if (value) output.push(value);
    }
    return output.join('\n');
  }

  function parseIntegerAttribute(value, fallback) {
    const normalized = String(value ?? '').trim();
    if (!/^[+-]?\d+$/.test(normalized)) return fallback;
    const parsed = Number.parseInt(normalized, 10);
    return Number.isSafeInteger(parsed) ? parsed : fallback;
  }
'''

if old in text:
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
elif new not in text:
    raise SystemExit('Neither the expected old renderer nor the new renderer was found')
