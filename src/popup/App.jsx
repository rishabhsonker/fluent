import React, { useState, useEffect } from 'react';
import { SUPPORTED_LANGUAGES } from '../lib/constants.js';
import BlacklistManager from './components/BlacklistManager.jsx';
import Settings from './components/Settings.jsx';

function App() {
  const [settings, setSettings] = useState(null);
  const [currentSite, setCurrentSite] = useState('');
  const [siteEnabled, setSiteEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('main');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      setSettings(response.settings);
      setSiteEnabled(response.siteEnabled);
      setCurrentSite(response.hostname || 'This site');
      setLoading(false);
    } catch (error) {
      console.error('Error loading settings:', error);
      setLoading(false);
    }
  }

  async function toggleSite() {
    const newEnabled = !siteEnabled;
    setSiteEnabled(newEnabled);
    
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SITE_SETTINGS',
      hostname: currentSite,
      settings: { enabled: newEnabled }
    });
    
    // Reload current tab to apply changes
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.reload(tab.id);
  }

  async function updateLanguage(language) {
    setSettings({ ...settings, targetLanguage: language });
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: { targetLanguage: language }
    });
    
    // Reload current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.reload(tab.id);
  }

  if (loading || !settings) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Fluent</h1>
        <p style={styles.subtitle}>Learn languages while browsing</p>
      </header>

      {/* Tab Navigation */}
      <div style={styles.tabs}>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'main' ? styles.tabActive : {})
          }}
          onClick={() => setActiveTab('main')}
        >
          Home
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'blacklist' ? styles.tabActive : {})
          }}
          onClick={() => setActiveTab('blacklist')}
        >
          Blocked Sites
        </button>
      </div>

      {/* Main Tab */}
      {activeTab === 'main' && (
        <>
          <div style={styles.section}>
            <div style={styles.siteToggle}>
              <span style={styles.siteText}>
                {siteEnabled ? '✅' : '❌'} {currentSite}
              </span>
              <button 
                style={{ ...styles.button, ...(siteEnabled ? styles.buttonDanger : styles.buttonPrimary) }}
                onClick={toggleSite}
              >
                {siteEnabled ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Language</h2>
            <div style={styles.languageGrid}>
              {Object.entries(SUPPORTED_LANGUAGES).map(([key, lang]) => (
                <button
                  key={key}
                  style={{
                    ...styles.langButton,
                    ...(settings.targetLanguage === key ? styles.langButtonActive : {})
                  }}
                  onClick={() => updateLanguage(key)}
                >
                  <span style={styles.flag}>{lang.flag}</span>
                  <span>{lang.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Today's Progress</h2>
            <div style={styles.stats}>
              <div style={styles.stat}>
                <div style={styles.statValue}>12</div>
                <div style={styles.statLabel}>Words learned</div>
              </div>
              <div style={styles.stat}>
                <div style={styles.statValue}>3</div>
                <div style={styles.statLabel}>Day streak</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Blacklist Tab */}
      {activeTab === 'blacklist' && (
        <BlacklistManager />
      )}

      <div style={styles.footer}>
        <a href="#" style={styles.link} onClick={(e) => {
          e.preventDefault();
          setShowSettings(true);
        }}>Settings</a>
        <span style={styles.separator}>•</span>
        <a href="#" style={styles.link}>Help</a>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

const styles = {
  container: {
    width: '350px',
    minHeight: '400px',
    backgroundColor: '#ffffff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid #e5e7eb',
    marginBottom: '20px',
  },
  tab: {
    flex: 1,
    padding: '12px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#6b7280',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  tabActive: {
    color: '#3b82f6',
    borderBottomColor: '#3b82f6',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '400px',
    color: '#6b7280',
  },
  header: {
    padding: '24px',
    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    color: 'white',
  },
  title: {
    margin: '0',
    fontSize: '28px',
    fontWeight: '700',
  },
  subtitle: {
    margin: '4px 0 0 0',
    fontSize: '14px',
    opacity: '0.9',
  },
  section: {
    padding: '20px 24px',
    borderBottom: '1px solid #e5e7eb',
  },
  sectionTitle: {
    margin: '0 0 12px 0',
    fontSize: '16px',
    fontWeight: '600',
    color: '#374151',
  },
  siteToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  siteText: {
    fontSize: '14px',
    color: '#374151',
    fontWeight: '500',
  },
  button: {
    padding: '6px 16px',
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
  languageGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
  },
  langButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '12px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    backgroundColor: 'white',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontSize: '12px',
    color: '#374151',
  },
  langButtonActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
    color: '#2563eb',
  },
  flag: {
    fontSize: '24px',
  },
  stats: {
    display: 'flex',
    gap: '24px',
  },
  stat: {
    flex: 1,
  },
  statValue: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#3b82f6',
  },
  statLabel: {
    fontSize: '12px',
    color: '#6b7280',
  },
  footer: {
    padding: '16px 24px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#f9fafb',
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontSize: '14px',
  },
  separator: {
    color: '#d1d5db',
  },
};

export default App;