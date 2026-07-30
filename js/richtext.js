// ── Rich-text notebooks ───────────────────────────────────────
const RICH_TEXT_ALLOWED_TAGS = new Set([
  'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'I', 'LI',
  'OL', 'P', 'PRE', 'S', 'SPAN', 'STRIKE', 'STRONG', 'U', 'UL'
]);

function activeTextNotepad() {
  if (!isTextNotepad()) return null;
  return notepads.find(np => np.key === activeNotepad) || null;
}

function normalizeRichTextLink(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?:|mailto:)/i.test(raw)) return raw;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return 'mailto:' + raw;
  return 'https://' + raw;
}

function sanitizeRichTextHtml(value) {
  const template = document.createElement('template');
  template.innerHTML = String(value || '');

  const cleanNode = node => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue || '');
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();

    const tag = node.tagName.toUpperCase();
    if (!RICH_TEXT_ALLOWED_TAGS.has(tag)) {
      const fragment = document.createDocumentFragment();
      Array.from(node.childNodes).forEach(child => fragment.appendChild(cleanNode(child)));
      return fragment;
    }

    const clean = document.createElement(tag.toLowerCase());
    if (tag === 'A') {
      const href = normalizeRichTextLink(node.getAttribute('href'));
      if (href) {
        clean.setAttribute('href', href);
        clean.setAttribute('target', '_blank');
        clean.setAttribute('rel', 'noopener noreferrer');
      }
    } else if (tag === 'SPAN' && node.classList.contains('rich-spoiler')) {
      clean.className = 'rich-spoiler';
    }
    Array.from(node.childNodes).forEach(child => clean.appendChild(cleanNode(child)));
    return clean;
  };

  const output = document.createElement('div');
  Array.from(template.content.childNodes).forEach(node => output.appendChild(cleanNode(node)));
  return output.innerHTML;
}

function richTextToPlainText(value) {
  const template = document.createElement('template');
  template.innerHTML = sanitizeRichTextHtml(value);
  const blocks = new Set(['BLOCKQUOTE', 'DIV', 'LI', 'OL', 'P', 'PRE', 'UL']);
  let text = '';

  const walk = node => {
    if (node.nodeType === Node.TEXT_NODE) { text += node.nodeValue || ''; return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.tagName === 'BR') { text += '\n'; return; }
    const isBlock = blocks.has(node.tagName);
    if (isBlock && text && !text.endsWith('\n')) text += '\n';
    Array.from(node.childNodes).forEach(walk);
    if (isBlock && !text.endsWith('\n')) text += '\n';
  };

  Array.from(template.content.childNodes).forEach(walk);
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function richTextSelectionInside(editor) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  return !!container && editor.contains(container);
}

function notifyRichTextInput(editor) {
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.focus({ preventScroll: true });
}

function wrapRichTextSelection(editor, tagName, className = '') {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed || !richTextSelectionInside(editor)) return;
  const range = selection.getRangeAt(0);
  const wrapper = document.createElement(tagName);
  if (className) wrapper.className = className;
  wrapper.appendChild(range.extractContents());
  range.insertNode(wrapper);
  selection.removeAllRanges();
  const nextRange = document.createRange();
  nextRange.selectNodeContents(wrapper);
  selection.addRange(nextRange);
  notifyRichTextInput(editor);
}

function runRichTextCommand(editor, command) {
  if (!richTextSelectionInside(editor)) editor.focus();

  if (command === 'link') {
    const selection = window.getSelection();
    const selected = selection?.toString().trim() || '';
    const value = prompt('Link URL', selected && /^https?:\/\//i.test(selected) ? selected : 'https://');
    const href = normalizeRichTextLink(value);
    if (!href) return;
    if (selection?.isCollapsed) {
      document.execCommand('insertHTML', false, `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a>`);
    } else {
      document.execCommand('createLink', false, href);
    }
  } else if (command === 'code') {
    wrapRichTextSelection(editor, 'code');
    return;
  } else if (command === 'spoiler') {
    wrapRichTextSelection(editor, 'span', 'rich-spoiler');
    return;
  } else if (command === 'quote') {
    document.execCommand('formatBlock', false, 'blockquote');
  } else if (command === 'clear') {
    document.execCommand('removeFormat', false, null);
    document.execCommand('unlink', false, null);
  } else {
    document.execCommand(command, false, null);
  }
  notifyRichTextInput(editor);
}

function richTextToolbar(editor) {
  const toolbar = document.createElement('div');
  toolbar.className = 'rich-text-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Text formatting');

  const tools = [
    ['bold', 'B', 'Bold (⌘B)'],
    ['italic', 'I', 'Italic (⌘I)'],
    ['underline', 'U', 'Underline (⌘U)'],
    ['strikeThrough', 'S', 'Strikethrough (⌘⇧X)'],
    ['code', '</>', 'Monospace'],
    ['spoiler', '▧', 'Spoiler'],
    ['quote', '❝', 'Quote'],
    ['insertUnorderedList', '•', 'Bulleted list'],
    ['insertOrderedList', '1.', 'Numbered list'],
    ['link', '↗', 'Link (⌘K)'],
    ['clear', '×', 'Clear formatting']
  ];

  tools.forEach(([command, label, title]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rich-text-tool rich-text-tool-' + command.toLowerCase();
    button.textContent = label;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.addEventListener('mousedown', e => e.preventDefault());
    button.addEventListener('click', () => runRichTextCommand(editor, command));
    toolbar.appendChild(button);
  });
  return toolbar;
}

function insertRichTextPaste(editor, event) {
  event.preventDefault();
  const html = event.clipboardData?.getData('text/html');
  if (html) {
    document.execCommand('insertHTML', false, sanitizeRichTextHtml(html));
  } else {
    const text = event.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertHTML', false, escapeHtml(text).replace(/\r?\n/g, '<br>'));
  }
  notifyRichTextInput(editor);
}

function handleRichTextKeydown(editor, event) {
  const modifier = event.metaKey || event.ctrlKey;
  if (!modifier) return;
  const key = event.key.toLowerCase();
  const command = !event.shiftKey && key === 'b' ? 'bold'
    : !event.shiftKey && key === 'i' ? 'italic'
      : !event.shiftKey && key === 'u' ? 'underline'
        : !event.shiftKey && key === 'k' ? 'link'
          : event.shiftKey && key === 'x' ? 'strikeThrough'
            : null;
  if (!command) return;
  event.preventDefault();
  event.stopPropagation();
  runRichTextCommand(editor, command);
}

function renderRichTextNotebook(editor, gutter, content) {
  const np = activeTextNotepad();
  editor.classList.add('notepad-mode', 'text-notepad-mode');
  editor.classList.remove('projects-mode');
  gutter.innerHTML = '';
  content.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'notepad-wrapper rich-text-wrapper';

  const textEditor = document.createElement('div');
  textEditor.className = 'rich-text-editor';
  textEditor.contentEditable = 'true';
  textEditor.spellcheck = true;
  textEditor.setAttribute('role', 'textbox');
  textEditor.setAttribute('aria-multiline', 'true');
  textEditor.setAttribute('data-placeholder', 'Write something…');
  textEditor.innerHTML = sanitizeRichTextHtml(np?.content || '');

  textEditor.addEventListener('input', () => {
    if (!np || np.key !== activeNotepad) return;
    np.content = sanitizeRichTextHtml(textEditor.innerHTML);
    markDirtySettings();
  });
  textEditor.addEventListener('paste', event => insertRichTextPaste(textEditor, event));
  textEditor.addEventListener('keydown', event => handleRichTextKeydown(textEditor, event));
  textEditor.addEventListener('blur', () => {
    if (!np || np.key !== activeNotepad) return;
    const clean = sanitizeRichTextHtml(textEditor.innerHTML);
    if (clean !== np.content) { np.content = clean; markDirtySettings(); }
  });

  wrapper.appendChild(richTextToolbar(textEditor));
  wrapper.appendChild(textEditor);
  content.appendChild(wrapper);
}

function renderRichTextInfoPanel(container) {
  const info = document.createElement('div');
  info.className = 'rich-text-info';
  info.innerHTML = `
    <div class="rich-text-info-title">Formatting</div>
    <div><kbd>⌘B</kbd><span>Bold</span></div>
    <div><kbd>⌘I</kbd><span>Italic</span></div>
    <div><kbd>⌘U</kbd><span>Underline</span></div>
    <div><kbd>⌘⇧X</kbd><span>Strikethrough</span></div>
    <div><kbd>⌘K</kbd><span>Link</span></div>
    <p>Select text, then use the toolbar above the page. Changes are saved automatically.</p>
  `;
  container.appendChild(info);
}
