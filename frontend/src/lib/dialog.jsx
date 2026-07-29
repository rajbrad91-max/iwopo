import { useState, useCallback, useRef, createContext, useContext } from 'react';
import '../pages/dialog.css';

/**
 * 🗨️ In-app replacements for window.confirm / alert / prompt.
 *
 * The browser's own dialogs are jarring in a product — they carry the browser's
 * chrome and the URL, they cannot be styled, they block the whole page, and on
 * mobile some of them look like a security warning. Worse for this app: they
 * appear identically on a vendor's dark admin panel and on a client's own
 * branded page, which is the one place a stray system dialog reads as broken.
 *
 * The important difference from window.confirm is that these are ASYNC. Every
 * call site therefore has to await them, and a call site that is not already
 * async has to become so — a sync function that forgets the await gets a
 * Promise, which is truthy, so a "Cancel" would read as "OK" and the guarded
 * action would run anyway. That failure is silent, which is why the two sync
 * call sites in this codebase were converted deliberately rather than in bulk.
 */
const DialogCtx = createContext(null);

export function DialogProvider({ children }) {
  const [dlg, setDlg] = useState(null);
  const resolver = useRef(null);

  const close = useCallback((value) => {
    setDlg(null);
    if (resolver.current) { resolver.current(value); resolver.current = null; }
  }, []);

  const open = useCallback((cfg) => new Promise((resolve) => {
    resolver.current = resolve;
    setDlg(cfg);
  }), []);

  const api = {
    /** Replaces confirm(). Resolves true/false. */
    confirm: (message, opts = {}) => open({
      kind: 'confirm', message,
      title: opts.title || 'Are you sure?',
      okLabel: opts.okLabel || 'Confirm',
      danger: opts.danger !== false,       // most confirms here guard a delete
    }),
    /** Replaces alert(). Resolves when dismissed. */
    alert: (message, opts = {}) => open({
      kind: 'alert', message,
      title: opts.title || (opts.error ? 'Something went wrong' : 'Heads up'),
      okLabel: 'OK', error: !!opts.error,
    }),
    /** Replaces prompt(). Resolves the string, or null if cancelled. */
    prompt: (message, defaultValue = '', opts = {}) => open({
      kind: 'prompt', message, defaultValue,
      title: opts.title || 'One moment',
      okLabel: opts.okLabel || 'Save',
      readOnly: !!opts.readOnly,           // for "here's a link, copy it"
    }),
  };

  return (
    <DialogCtx.Provider value={api}>
      {children}
      {dlg && <DialogHost cfg={dlg} onClose={close} />}
    </DialogCtx.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogCtx);
  if (!ctx) throw new Error('useDialog needs a <DialogProvider> above it');
  return ctx;
}

function DialogHost({ cfg, onClose }) {
  const [value, setValue] = useState(cfg.defaultValue || '');
  const inputRef = useRef(null);

  // Escape cancels, Enter accepts — the same reflexes the native dialog had,
  // since replacing it shouldn't cost the muscle memory that came with it
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(cfg.kind === 'prompt' ? null : false); }
    if (e.key === 'Enter' && cfg.kind !== 'prompt') { e.stopPropagation(); onClose(true); }
  }

  function submit(e) {
    e?.preventDefault();
    if (cfg.kind === 'prompt') onClose(value);
    else onClose(true);
  }

  return (
    <div className="dlg-backdrop" onMouseDown={(e) => {
      // a click on the backdrop itself cancels; a click that started inside
      // the panel and drifted out does not
      if (e.target === e.currentTarget) onClose(cfg.kind === 'prompt' ? null : false);
    }}>
      <div className={`dlg-panel ${cfg.danger ? 'is-danger' : ''} ${cfg.error ? 'is-error' : ''}`}
        role="dialog" aria-modal="true" aria-label={cfg.title} onKeyDown={onKey}>
        <h3 className="dlg-title">
          {cfg.kind === 'confirm' && (cfg.danger ? '⚠️ ' : '❓ ')}
          {cfg.error && '⚠️ '}
          {cfg.title}
        </h3>
        {/* the message may carry deliberate line breaks — several of the
            confirms it replaced used \n\n to separate a warning from detail */}
        <p className="dlg-msg">{cfg.message}</p>

        {cfg.kind === 'prompt' && (
          <form onSubmit={submit}>
            <input ref={inputRef} className="dlg-input" autoFocus
              readOnly={cfg.readOnly}
              value={value} onChange={(e) => setValue(e.target.value)}
              onFocus={(e) => cfg.readOnly && e.target.select()} />
          </form>
        )}

        <div className="dlg-actions">
          {cfg.kind !== 'alert' && (
            <button type="button" className="dlg-btn"
              onClick={() => onClose(cfg.kind === 'prompt' ? null : false)}>
              Cancel
            </button>
          )}
          <button type="button" autoFocus={cfg.kind !== 'prompt'}
            className={`dlg-btn is-primary ${cfg.danger ? 'is-danger' : ''}`}
            onClick={submit}>
            {cfg.okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
