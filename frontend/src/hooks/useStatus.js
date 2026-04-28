import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../store/useEditorStore';

export function useStatus() {
  const isGenerating = useEditorStore((s) => s.isGenerating);
  const [statusInfo, setStatusInfo] = useState({ text: '', type: 'info' });
  const statusTimeoutRef = useRef(null);

  const setStatus = useCallback((msg, type) => {
    const m = String(msg || '');
    const resolvedType = type ?? (
      /fail|error|cannot|invalid|not found|unexpected/i.test(m) ? 'error' :
      /saved|success|generated|uploaded|imported|loaded|deleted/i.test(m) ? 'success' :
      /csv mode|upload a csv|turn off use csv|upload.*first|create.*first|select.*first|load.*first/i.test(m) ? 'warning' :
      'info'
    );
    setStatusInfo({ text: m, type: resolvedType });
  }, []);

  useEffect(() => {
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = null;
    }

    if (!statusInfo.text) {
      return undefined;
    }

    const isGeneratingMessage = /^generating\.{0,3}$/i.test(statusInfo.text.trim());
    if (isGenerating && isGeneratingMessage) {
      return undefined;
    }

    const timeoutMs =
      statusInfo.type === 'error' ? 9000 :
      statusInfo.type === 'warning' ? 7000 :
      4500;

    statusTimeoutRef.current = setTimeout(() => {
      setStatusInfo((current) => {
        if (current.text !== statusInfo.text) {
          return current;
        }
        return { text: '', type: current.type };
      });
    }, timeoutMs);

    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = null;
      }
    };
  }, [statusInfo, isGenerating]);

  return { statusInfo, setStatus };
}
