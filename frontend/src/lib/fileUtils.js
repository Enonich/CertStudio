export function getFilenameFromContentDisposition(contentDisposition, fallbackName) {
  if (!contentDisposition) {
    return fallbackName;
  }
  const match = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";\r\n]+)/i);
  if (!match?.[1]) {
    return fallbackName;
  }
  const raw = match[1].trim().replace(/"$/, '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

export function dataUrlToFile(dataUrl, fallbackName = 'template.bin', fallbackMimeType = 'application/octet-stream') {
  const value = String(dataUrl || '');
  const match = value.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/);
  if (!match) {
    throw new Error('Invalid embedded template data.');
  }

  const mimeType = match[1] || fallbackMimeType;
  const payload = decodeURIComponent(match[2] || '');
  const byteString = atob(payload);
  const bytes = new Uint8Array(byteString.length);
  for (let index = 0; index < byteString.length; index += 1) {
    bytes[index] = byteString.charCodeAt(index);
  }

  return new File([bytes], fallbackName, { type: mimeType });
}
