export function formatErrorDetail(detail) {
  if (!detail) {
    return '';
  }
  if (typeof detail === 'string') {
    return detail;
  }
  if (typeof detail === 'object') {
    const parts = [];
    if (detail.message) {
      parts.push(detail.message);
    }
    if (detail.stderr) {
      const stderr = String(detail.stderr).trim();
      if (stderr) {
        parts.push(`stderr: ${stderr}`);
      }
    }
    if (detail.stdout) {
      const stdout = String(detail.stdout).trim();
      if (stdout) {
        parts.push(`stdout: ${stdout}`);
      }
    }
    if (parts.length > 0) {
      return parts.join(' | ');
    }
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }
  return String(detail);
}
