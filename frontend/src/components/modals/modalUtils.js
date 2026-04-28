import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = 'button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

function getFocusableNodes(root) {
  return Array.from(root?.querySelectorAll(FOCUSABLE_SELECTOR) ?? []);
}

export function trapFocus(root, event) {
  const nodes = getFocusableNodes(root);
  if (!nodes.length) return;

  const first = nodes[0];
  const last = nodes[nodes.length - 1];

  if (event.shiftKey) {
    if (document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function useModalA11y({ isOpen = true, onClose, initialFocusRef } = {}) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const focusTarget = () => {
      const explicitTarget = initialFocusRef?.current;
      if (explicitTarget) {
        explicitTarget.focus();
        if (typeof explicitTarget.select === 'function') {
          explicitTarget.select();
        }
        return;
      }

      getFocusableNodes(modalRef.current)[0]?.focus();
    };

    const timeoutId = window.setTimeout(focusTarget, 0);
    return () => window.clearTimeout(timeoutId);
  }, [initialFocusRef, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key === 'Tab') {
        trapFocus(modalRef.current, event);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return modalRef;
}