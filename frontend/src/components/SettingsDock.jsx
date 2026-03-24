import { resolveFontTokenToCss } from '../lib/fontUtils';

/**
 * The settings gear button and its slide-out panel (fonts management, etc.)
 * rendered in the bottom-right corner of the editor.
 */
export default function SettingsDock({
  settingsMenuOpen,
  setSettingsMenuOpen,
  settingsTab,
  setSettingsTab,
  setInsertMenuOpen,
  setLayoutsMenuOpen,
  setGenerateMenuOpen,
  setPrintMenuOpen,
  customFonts,
  uploadFont,
  deleteFont,
}) {
  return (
    <div className="settings-dock">
      <button
        type="button"
        className={`settings-trigger ${settingsMenuOpen ? 'open' : ''}`}
        onClick={() => {
          const next = !settingsMenuOpen;
          setSettingsMenuOpen(next);
          if (!next) setSettingsTab(null);
          setInsertMenuOpen(false);
          setLayoutsMenuOpen(false);
          setGenerateMenuOpen(false);
          setPrintMenuOpen(false);
        }}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M6.7 1.2h2.6l.5 1.8a5.6 5.6 0 011.3.8l1.8-.5 1.3 2.2-1.4 1.3c.1.3.1.7.1 1s0 .7-.1 1l1.4 1.3-1.3 2.2-1.8-.5a5.6 5.6 0 01-1.3.8l-.5 1.8H6.7l-.5-1.8a5.6 5.6 0 01-1.3-.8l-1.8.5-1.3-2.2L3.2 10a6.6 6.6 0 010-2L1.8 6.7l1.3-2.2 1.8.5c.4-.3.8-.5 1.3-.8l.5-1.8z"/>
          <circle cx="8" cy="8" r="2.2"/>
        </svg>
        Settings
      </button>

      {settingsMenuOpen && (
        <div className="settings-panel">
          {/* -- Sidebar: submenu categories -- */}
          <div className="settings-panel-sidebar">
            <div className="settings-panel-sidebar-title">Settings</div>
            <button
              type="button"
              className={`settings-panel-item ${settingsTab === 'fonts' ? 'active' : ''}`}
              onClick={() => setSettingsTab(settingsTab === 'fonts' ? null : 'fonts')}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M3 13V5l5-4 5 4v8"/>
                <path d="M6 13V9h4v4"/>
              </svg>
              Fonts
              {customFonts.length > 0 && (
                <span className="nav-badge" style={{ marginLeft: 'auto' }}>{customFonts.length}</span>
              )}
            </button>
          </div>

          {/* -- Content panel — only rendered when a tab is active -- */}
          {settingsTab === 'fonts' && (
            <div className="settings-panel-content">
              <div className="settings-panel-content-header">
                <div className="settings-panel-content-title">Fonts</div>
              </div>
              <div className="settings-panel-content-body">
                <label
                  className="nav-dropdown-item nav-dropdown-item--file"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.currentTarget.querySelector('input[type="file"]')?.click();
                    }
                  }}
                >
                  <span className="nav-item-icon">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                      <path d="M8 10V2M4 6l4-4 4 4"/>
                      <path d="M2 13v1a1 1 0 001 1h10a1 1 0 001-1v-1"/>
                    </svg>
                  </span>
                  <span className="nav-item-text">
                    <span className="nav-item-label">Add a custom font…</span>
                    <span className="nav-item-hint">Upload a .TTF font file to use in your certificates</span>
                  </span>
                  <input
                    type="file"
                    accept=".ttf"
                    tabIndex={-1}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        await uploadFont(file);
                        event.target.value = '';
                      }
                    }}
                  />
                </label>

                <a
                  href="https://fonts.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nav-dropdown-item nav-dropdown-item--link"
                >
                  <span className="nav-item-icon">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                      <circle cx="8" cy="8" r="6"/>
                      <path d="M8 2v6l3 3"/>
                    </svg>
                  </span>
                  <span className="nav-item-text">
                    <span className="nav-item-label">Browse Google Fonts</span>
                    <span className="nav-item-hint">Download free fonts, then add them here</span>
                  </span>
                </a>

                {customFonts.length > 0 ? (
                  <>
                    <div className="nav-dropdown-section-title" style={{ padding: '12px 16px 6px' }}>
                      Your fonts ({customFonts.length})
                    </div>
                    <div className="nav-font-list">
                      {customFonts.map((font) => (
                        <div key={font.file} className="nav-font-row">
                          <div className="nav-font-info">
                            <span
                              className="nav-font-name"
                              style={{ fontFamily: resolveFontTokenToCss(font.name).family || font.name }}
                            >
                              {font.name}
                            </span>
                            <span className="nav-font-meta">{font.file} / {font.size_kb} KB</span>
                          </div>
                          <button
                            type="button"
                            className="nav-font-delete"
                            onClick={() => deleteFont(font.file)}
                            data-tip={`Remove ${font.name}`}
                            aria-label={`Remove ${font.name}`}
                          >
                            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M1 1l12 12M13 1L1 13"/>
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="nav-empty-hint">
                    No custom fonts added yet. Add a font to use it in your certificate designs.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
