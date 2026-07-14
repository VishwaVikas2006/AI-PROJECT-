import { createContext, useContext, useState, useCallback, useRef } from 'react';
import './Toast.css';

const ToastContext = createContext(null);

let idCounter = 0;

// Small delay so a genuinely instant response doesn't flash a bar, but short
// enough that any real AI call (>~150ms) shows the indicator immediately.
const LOADING_SHOW_DELAY_MS = 120;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState({ active: false, label: 'Working…' });
  const showTimer = useRef(null);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    ({ type = 'info', title, message, action, duration = 6000 }) => {
      const id = (idCounter += 1);
      setToasts((list) => [...list, { id, type, title, message, action }]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss],
  );

  const startLoading = useCallback((label = 'Working…') => {
    setLoading({ active: true, label });
  }, []);

  const stopLoading = useCallback(() => {
    clearTimeout(showTimer.current);
    setLoading({ active: false, label: 'Working…' });
  }, []);

  // Run an async task under the global loading bar; always stops on settle.
  const withLoading = useCallback(
    async (label, fn) => {
      startLoading(label);
      try {
        return await fn();
      } finally {
        stopLoading();
      }
    },
    [startLoading, stopLoading],
  );

  const value = { notify, startLoading, stopLoading, withLoading, loading };

  return (
    <ToastContext.Provider value={value}>
      {children}

      {loading.active && (
        <div className="global-loading" role="status" aria-live="polite">
          <div className="global-loading-track">
            <div className="global-loading-bar" />
          </div>
          <span className="global-loading-label">{loading.label}</span>
        </div>
      )}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span className="toast-icon" aria-hidden="true">
              {t.type === 'success' ? '✓' : t.type === 'error' ? '!' : t.type === 'warning' ? '⚠' : 'i'}
            </span>
            <div className="toast-body">
              {t.title && <strong className="toast-title">{t.title}</strong>}
              {t.message && <p className="toast-message">{t.message}</p>}
              {t.action && (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    const click = t.action.onClick;
                    dismiss(t.id);
                    if (click) click();
                  }}
                >
                  {t.action.label || 'Retry'}
                </button>
              )}
            </div>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
