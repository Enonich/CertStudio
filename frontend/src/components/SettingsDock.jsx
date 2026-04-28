import { useEditorStore } from '../store/useEditorStore';

/**
 * The settings gear button and its slide-out panel (profile, account).
 * rendered in the bottom-right corner of the editor.
 */
export default function SettingsDock({
  session,
  signOut,
}) {
  const {
    settingsMenuOpen, setSettingsMenuOpen,
    settingsTab, setSettingsTab,
    theme, setTheme,
    closeAllMenus,
  } = useEditorStore();
  return (
    <div className="settings-dock">
      <button
        type="button"
        className={`settings-trigger ${settingsMenuOpen ? 'open' : ''}`}
        aria-expanded={settingsMenuOpen}
        aria-haspopup="true"
        onClick={() => {
          const next = !settingsMenuOpen;
          setSettingsMenuOpen(next);
          if (!next) setSettingsTab(null);
          closeAllMenus();
          if (next) setSettingsMenuOpen(true);
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
              className={`settings-panel-item ${settingsTab === 'profile' ? 'active' : ''}`}
              onClick={() => setSettingsTab(settingsTab === 'profile' ? null : 'profile')}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                <circle cx="8" cy="5.5" r="2.5"/>
                <path d="M2.5 13.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/>
              </svg>
              Profile
            </button>
            <button
              type="button"
              className={`settings-panel-item ${settingsTab === 'account' ? 'active' : ''}`}
              onClick={() => setSettingsTab(settingsTab === 'account' ? null : 'account')}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                <rect x="2" y="2" width="12" height="12" rx="2"/>
                <path d="M5 8h6M8 5v6"/>
              </svg>
              Account
            </button>
          </div>

          {/* -- Profile tab -- */}
          {settingsTab === 'profile' && (
            <div className="settings-panel-content">
              <div className="settings-panel-content-header">
                <div className="settings-panel-content-title">Profile</div>
              </div>
              <div className="settings-panel-content-body">

                {/* Email (read-only) */}
                <div className="settings-field-group">
                  <div className="settings-field-label">Email</div>
                  <div className="settings-field-value">{session?.user?.email ?? '—'}</div>
                </div>

                {/* Theme */}
                <div className="settings-field-group">
                  <div className="settings-field-label">Theme</div>
                  <div className="theme-toggle">
                    {['dark', 'light'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`theme-pill${theme === t ? ' active' : ''}`}
                        onClick={() => setTheme(t)}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* -- Account tab -- */}
          {settingsTab === 'account' && (
            <div className="settings-panel-content">
              <div className="settings-panel-content-header">
                <div className="settings-panel-content-title">Account</div>
              </div>
              <div className="settings-panel-content-body">
                <div className="settings-field-group">
                  <div className="settings-field-label">Signed in as</div>
                  <div className="settings-field-value">{session?.user?.email ?? '—'}</div>
                </div>
                <div style={{ padding: '8px 16px 4px' }}>
                  <button
                    type="button"
                    className="settings-signout-btn"
                    onClick={() => { setSettingsMenuOpen(false); setSettingsTab(null); signOut(); }}
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M10 3h3a1 1 0 011 1v8a1 1 0 01-1 1h-3"/>
                      <path d="M7 11l3-3-3-3M10 8H2"/>
                    </svg>
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
