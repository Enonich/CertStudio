function escapeCssString(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}

export function resolveFontTokenToCss(fontToken) {
  const token = String(fontToken ?? '').trim();
  if (!token) {
    return {
      family: '',
      weight: '',
      style: '',
    };
  }

  const hasBold = /bold/i.test(token);
  const hasItalic = /(oblique|italic)/i.test(token);
  const quotedToken = `"${escapeCssString(token)}"`;

  if (token.startsWith('Helvetica')) {
    return {
      family: `${quotedToken}, Helvetica, Arial, sans-serif`,
      weight: hasBold ? 'bold' : '',
      style: hasItalic ? 'italic' : '',
    };
  }
  if (token.startsWith('Times')) {
    return {
      family: `${quotedToken}, "Times New Roman", Times, serif`,
      weight: hasBold ? 'bold' : '',
      style: hasItalic ? 'italic' : '',
    };
  }
  if (token.startsWith('Courier')) {
    return {
      family: `${quotedToken}, "Courier New", Courier, monospace`,
      weight: hasBold ? 'bold' : '',
      style: hasItalic ? 'italic' : '',
    };
  }
  if (token === 'Symbol') {
    return {
      family: `${quotedToken}, Symbol`,
      weight: '',
      style: '',
    };
  }
  if (token === 'ZapfDingbats') {
    return {
      family: `${quotedToken}, "Zapf Dingbats", Wingdings, fantasy`,
      weight: '',
      style: '',
    };
  }

  return {
    family: quotedToken,
    weight: '',
    style: '',
  };
}
