import React, { useState, useEffect } from 'react';
import { useErrorHandler } from '../../utils/handler';
import { UI_DIMENSIONS_EXTENDED, ANIMATION } from '../../../../shared/constants';

interface PrivacySettingsProps {
  onClose?: () => void;
}

type PrivacyLevel = 'standard' | 'enhanced' | 'strict';

const PrivacySettings: React.FC<PrivacySettingsProps> = ({ onClose }) => {
  const [sentryEnabled, setSentryEnabled] = useState<boolean>(true);
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>('standard');
  const [saving, setSaving] = useState<boolean>(false);
  const errorHandler = useErrorHandler('PrivacySettings');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings(): Promise<void> {
    await errorHandler.withErrorHandling(
      async () => {
        const stored = await chrome.storage.sync.get(['sentryEnabled', 'privacyLevel']);
        setSentryEnabled(stored.sentryEnabled !== false);
        setPrivacyLevel(stored.privacyLevel || 'standard');
      },
      'loadSettings'
    );
  }

  async function saveSettings(): Promise<void> {
    setSaving(true);
    await errorHandler.withErrorHandling(
      async () => {
        await chrome.storage.sync.set({
          sentryEnabled,
          privacyLevel
        });
        
        // Show success message
        const message = document.createElement('div');
        message.textContent = 'Privacy settings saved!';
        message.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #10b981;
          color: white;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 14px;
          z-index: ${UI_DIMENSIONS_EXTENDED.ZINDEX_MODAL};
        `;
        document.body.appendChild(message);
        setTimeout(() => message.remove(), ANIMATION.NOTIFICATION_DURATION_MS);
      },
      'saveSettings'
    );
    setSaving(false);
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Privacy Settings</h3>
        {onClose && (
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        )}
      </div>

      <div style={styles.content}>
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>Error Reporting</h4>
          <p style={styles.description}>
            Help improve Fluent by sending error reports. No personal data or translation content is ever sent.
          </p>
          
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={sentryEnabled}
              onChange={(e) => setSentryEnabled(e.target.checked)}
              style={styles.checkbox}
            />
            <span>Enable error reporting</span>
          </label>
        </div>

        {sentryEnabled && (
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>Privacy Level</h4>
            
            <div style={styles.radioGroup}>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name="privacyLevel"
                  value="standard"
                  checked={privacyLevel === 'standard'}
                  onChange={(e) => setPrivacyLevel(e.target.value as PrivacyLevel)}
                  style={styles.radio}
                />
                <div>
                  <strong>Standard</strong>
                  <p style={styles.optionDescription}>
                    Basic error information with automatic data sanitization. Recommended for most users.
                  </p>
                </div>
              </label>

              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name="privacyLevel"
                  value="enhanced"
                  checked={privacyLevel === 'enhanced'}
                  onChange={(e) => setPrivacyLevel(e.target.value as PrivacyLevel)}
                  style={styles.radio}
                />
                <div>
                  <strong>Enhanced Privacy</strong>
                  <p style={styles.optionDescription}>
                    Minimal error data. File paths are shortened, breadcrumbs limited, extra sanitization applied.
                  </p>
                </div>
              </label>

              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name="privacyLevel"
                  value="strict"
                  checked={privacyLevel === 'strict'}
                  onChange={(e) => setPrivacyLevel(e.target.value as PrivacyLevel)}
                  style={styles.radio}
                />
                <div>
                  <strong>Strict Privacy</strong>
                  <p style={styles.optionDescription}>
                    No error data is sent. Errors are logged locally only. May make debugging issues harder.
                  </p>
                </div>
              </label>
            </div>
          </div>
        )}

        <div style={styles.infoBox}>
          <h5 style={styles.infoTitle}>What data is collected?</h5>
          <ul style={styles.infoList}>
            <li>Error messages and stack traces (sanitized)</li>
            <li>Extension version and browser type</li>
            <li>Anonymous installation ID (no personal info)</li>
            <li>Performance metrics (page load times)</li>
          </ul>
          <h5 style={styles.infoTitle}>What is NEVER collected?</h5>
          <ul style={styles.infoList}>
            <li>Words you're translating or reading</li>
            <li>Websites you visit (only domain for errors)</li>
            <li>Your email, IP address, or location</li>
            <li>Any personal identification information</li>
          </ul>
        </div>

        <button
          style={{ ...styles.button, ...styles.buttonPrimary }}
          onClick={saveSettings}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#ffffff',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    color: '#6b7280',
    cursor: 'pointer',
    padding: '4px 8px',
  },
  content: {
    flex: 1,
    padding: '20px',
    overflowY: 'auto',
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    margin: '0 0 8px 0',
    fontSize: '16px',
    fontWeight: '600',
    color: '#374151',
  },
  description: {
    margin: '0 0 16px 0',
    fontSize: '14px',
    color: '#6b7280',
    lineHeight: '1.5',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '14px',
    color: '#374151',
    cursor: 'pointer',
  },
  checkbox: {
    marginRight: '8px',
    cursor: 'pointer',
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: '12px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  radio: {
    marginRight: '12px',
    marginTop: '2px',
    cursor: 'pointer',
  },
  optionDescription: {
    margin: '4px 0 0 0',
    fontSize: '13px',
    color: '#6b7280',
    lineHeight: '1.4',
  },
  infoBox: {
    backgroundColor: '#f3f4f6',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '20px',
  },
  infoTitle: {
    margin: '0 0 8px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
  },
  infoList: {
    margin: '0 0 16px 0',
    paddingLeft: '20px',
    fontSize: '13px',
    color: '#4b5563',
    lineHeight: '1.6',
  },
  button: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    width: '100%',
  },
  buttonPrimary: {
    backgroundColor: '#3b82f6',
    color: 'white',
  },
};

export default PrivacySettings;