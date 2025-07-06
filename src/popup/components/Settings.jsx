import React, { useState, useEffect } from 'react';

function Settings({ onClose }) {
  const [apiKey, setApiKey] = useState('');
  const [dailyUsage, setDailyUsage] = useState(0);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_API_KEY' });
      if (response.apiKey) {
        setApiKey(response.apiKey);
      }
      
      // Get daily usage
      const usage = await chrome.runtime.sendMessage({ type: 'GET_DAILY_USAGE' });
      setDailyUsage(usage.count || 0);
    } catch (error) {
      console.error('Error loading API settings:', error);
    }
  }

  async function saveApiKey() {
    setSaving(true);
    try {
      await chrome.runtime.sendMessage({
        type: 'SET_API_KEY',
        apiKey: apiKey.trim()
      });
      setSavedMessage('API key saved successfully!');
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (error) {
      console.error('Error saving API key:', error);
      setSavedMessage('Error saving API key');
    }
    setSaving(false);
  }

  async function removeApiKey() {
    if (confirm('Are you sure you want to remove your API key?')) {
      setSaving(true);
      try {
        await chrome.runtime.sendMessage({
          type: 'SET_API_KEY',
          apiKey: ''
        });
        setApiKey('');
        setSavedMessage('API key removed');
        setTimeout(() => setSavedMessage(''), 3000);
      } catch (error) {
        console.error('Error removing API key:', error);
      }
      setSaving(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Settings</h2>
        <button style={styles.closeButton} onClick={onClose}>✕</button>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Translation API</h3>
        
        {/* Usage Status */}
        <div style={styles.usageBox}>
          <div style={styles.usageHeader}>
            <span>Daily Usage</span>
            <span style={styles.usageCount}>{dailyUsage} / 50 words</span>
          </div>
          <div style={styles.progressBar}>
            <div 
              style={{
                ...styles.progressFill,
                width: `${Math.min((dailyUsage / 50) * 100, 100)}%`
              }}
            />
          </div>
          {dailyUsage >= 50 && !apiKey && (
            <p style={styles.limitWarning}>
              Daily limit reached. Add your own API key for unlimited translations.
            </p>
          )}
        </div>

        {/* BYOK Section */}
        <div style={styles.byokSection}>
          <h4 style={styles.byokTitle}>Bring Your Own Key (BYOK)</h4>
          <p style={styles.byokDescription}>
            Use your own Microsoft Translator API key for unlimited translations.
          </p>
          
          <div style={styles.inputGroup}>
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your API key"
              style={styles.input}
            />
            <button
              style={styles.toggleButton}
              onClick={() => setShowApiKey(!showApiKey)}
            >
              {showApiKey ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>

          <div style={styles.buttonGroup}>
            <button
              style={{ ...styles.button, ...styles.buttonPrimary }}
              onClick={saveApiKey}
              disabled={saving || !apiKey.trim()}
            >
              {saving ? 'Saving...' : 'Save API Key'}
            </button>
            {apiKey && (
              <button
                style={{ ...styles.button, ...styles.buttonDanger }}
                onClick={removeApiKey}
                disabled={saving}
              >
                Remove
              </button>
            )}
          </div>

          {savedMessage && (
            <div style={styles.message}>
              {savedMessage}
            </div>
          )}

          <div style={styles.helpSection}>
            <h5 style={styles.helpTitle}>How to get an API key:</h5>
            <ol style={styles.helpList}>
              <li>Go to <a href="https://azure.microsoft.com/services/cognitive-services/translator/" target="_blank" style={styles.link}>Microsoft Azure</a></li>
              <li>Create a free Translator resource (2M characters/month free)</li>
              <li>Copy your API key from the Azure portal</li>
              <li>Paste it above and save</li>
            </ol>
            <p style={styles.helpNote}>
              Setup takes ~5 minutes. Your key is stored securely and never shared.
            </p>
          </div>
        </div>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Other Settings</h3>
        
        <div style={styles.settingItem}>
          <label style={styles.label}>
            Words per page
            <select style={styles.select} defaultValue="6">
              <option value="3">3 words</option>
              <option value="5">5 words</option>
              <option value="6">6 words (recommended)</option>
              <option value="8">8 words</option>
            </select>
          </label>
        </div>

        <div style={styles.settingItem}>
          <label style={styles.label}>
            Difficulty level
            <select style={styles.select} defaultValue="intermediate">
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    zIndex: 1000,
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    color: '#6b7280',
    cursor: 'pointer',
    padding: '4px 8px',
  },
  section: {
    padding: '24px',
    borderBottom: '1px solid #e5e7eb',
  },
  sectionTitle: {
    margin: '0 0 16px 0',
    fontSize: '16px',
    fontWeight: '600',
    color: '#374151',
  },
  usageBox: {
    backgroundColor: '#f3f4f6',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '20px',
  },
  usageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
    fontSize: '14px',
    color: '#4b5563',
  },
  usageCount: {
    fontWeight: '600',
    color: '#111827',
  },
  progressBar: {
    height: '8px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    transition: 'width 0.3s ease',
  },
  limitWarning: {
    margin: '12px 0 0 0',
    fontSize: '13px',
    color: '#dc2626',
  },
  byokSection: {
    marginTop: '20px',
  },
  byokTitle: {
    margin: '0 0 8px 0',
    fontSize: '15px',
    fontWeight: '600',
    color: '#374151',
  },
  byokDescription: {
    margin: '0 0 16px 0',
    fontSize: '14px',
    color: '#6b7280',
  },
  inputGroup: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
  },
  toggleButton: {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#f9fafb',
    cursor: 'pointer',
    fontSize: '16px',
  },
  buttonGroup: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  button: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  buttonPrimary: {
    backgroundColor: '#3b82f6',
    color: 'white',
  },
  buttonDanger: {
    backgroundColor: '#ef4444',
    color: 'white',
  },
  message: {
    padding: '8px 12px',
    backgroundColor: '#10b981',
    color: 'white',
    borderRadius: '6px',
    fontSize: '14px',
    marginBottom: '12px',
  },
  helpSection: {
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    padding: '16px',
    marginTop: '16px',
  },
  helpTitle: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
  },
  helpList: {
    margin: '0 0 12px 0',
    paddingLeft: '20px',
    fontSize: '13px',
    color: '#4b5563',
    lineHeight: '1.6',
  },
  helpNote: {
    margin: '0',
    fontSize: '13px',
    color: '#6b7280',
    fontStyle: 'italic',
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
  },
  settingItem: {
    marginBottom: '16px',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontSize: '14px',
    color: '#374151',
    fontWeight: '500',
  },
  select: {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    backgroundColor: 'white',
  },
};

export default Settings;