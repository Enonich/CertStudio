export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function plainTextToHtml(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

const ALLOWED_HTML_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'BR',
  'SPAN', 'DIV', 'P', 'FONT',
]);

const ALLOWED_STYLE_PROPS = new Set([
  'color',
  'background-color',
  'font-weight',
  'font-style',
  'text-decoration',
  'font-family',
  'font-size',
  'line-height',
  'letter-spacing',
  'text-transform',
  'text-align',
]);

function sanitizeStyle(styleValue) {
  if (!styleValue) return '';
  const parts = String(styleValue).split(';');
  const sanitized = [];
  for (const part of parts) {
    const [rawProp, ...rawValue] = part.split(':');
    if (!rawProp || rawValue.length === 0) continue;
    const prop = rawProp.trim().toLowerCase();
    if (!ALLOWED_STYLE_PROPS.has(prop)) continue;
    const value = rawValue.join(':').trim();
    if (!value) continue;
    const lower = value.toLowerCase();
    if (lower.includes('url(') || lower.includes('expression') || lower.includes('javascript:')) {
      continue;
    }
    sanitized.push(`${prop}: ${value}`);
  }
  return sanitized.join('; ');
}

export function sanitizeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html ?? '');

  template.content
    .querySelectorAll('script,style,iframe,object,embed,link,meta,svg,math')
    .forEach((node) => node.remove());

  Array.from(template.content.querySelectorAll('*')).forEach((el) => {
    if (!ALLOWED_HTML_TAGS.has(el.tagName)) {
      const frag = document.createDocumentFragment();
      while (el.firstChild) {
        frag.appendChild(el.firstChild);
      }
      el.replaceWith(frag);
      return;
    }

    let styleText = sanitizeStyle(el.getAttribute('style') || '');

    if (el.tagName === 'FONT') {
      const face = el.getAttribute('face');
      const color = el.getAttribute('color');
      if (face && !/font-family\s*:/.test(styleText)) {
        styleText = `${styleText}${styleText ? '; ' : ''}font-family: ${face}`;
      }
      if (color && !/color\s*:/.test(styleText)) {
        styleText = `${styleText}${styleText ? '; ' : ''}color: ${color}`;
      }
    }

    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name === 'style') return;
      el.removeAttribute(attr.name);
    });

    if (styleText) {
      el.setAttribute('style', styleText);
    } else {
      el.removeAttribute('style');
    }
  });

  return template.innerHTML;
}

/**
 * Normalize HTML produced by Chrome's contentEditable inside a flex container.
 * Chrome wraps content in <div> blocks when execCommand (bold/font/etc.) runs
 * on a flex contentEditable element, turning "Hello World" into
 * "<div>Hello World</div>". This function unwraps those block elements back to
 * inline content separated by <br> tags, preserving intentional line breaks
 * while removing accidental block wrappers.
 */
export function normalizeEditorHtml(html) {
  if (!html || !html.includes('<div') && !html.includes('<p')) {
    return html;
  }
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html);

  // Unwrap <div> and <p> blocks: move their children before them, then add
  // a <br> separator, then remove the block element itself.
  tpl.content.querySelectorAll('div, p').forEach((block) => {
    const frag = document.createDocumentFragment();
    while (block.firstChild) {
      frag.appendChild(block.firstChild);
    }
    const br = document.createElement('br');
    frag.appendChild(br);
    block.replaceWith(frag);
  });

  // Trim trailing <br> elements.
  let last = tpl.content.lastChild;
  while (last && last.nodeName === 'BR') {
    const prev = last.previousSibling;
    last.remove();
    last = prev;
  }

  return tpl.innerHTML;
}

/**
 * Strip inline `font-family` CSS from all elements inside `html` while
 * preserving every other inline style (bold, color, etc.). Used when the
 * user changes the whole-field font via the Properties panel so that the
 * new field-level font applies uniformly without discarding other rich
 * formatting the user may have applied.
 */
export function stripInlineFontFamily(html) {
  if (!html || typeof html !== 'string') return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  tpl.content.querySelectorAll('[style]').forEach((el) => {
    el.style.fontFamily = '';
    const remaining = (el.getAttribute('style') || '').replace(/;\s*;/g, ';').trim().replace(/^;+|;+$/g, '');
    if (!remaining) {
      el.removeAttribute('style');
    } else {
      el.setAttribute('style', remaining);
    }
  });
  // `execCommand('fontName')` often emits legacy <font face="..."> nodes.
  // Remove `face` so whole-field font changes can truly override prior inline font choices.
  tpl.content.querySelectorAll('font[face]').forEach((el) => {
    el.removeAttribute('face');
  });
  // Clean up empty wrappers left behind after removing `face`.
  tpl.content.querySelectorAll('font').forEach((el) => {
    if (el.attributes.length > 0) {
      return;
    }
    const frag = document.createDocumentFragment();
    while (el.firstChild) {
      frag.appendChild(el.firstChild);
    }
    el.replaceWith(frag);
  });
  return tpl.innerHTML;
}
