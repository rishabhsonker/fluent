import React, { useState, useEffect } from 'react';
import { SUPPORTED_LANGUAGES } from '../lib/constants';
import { errorBoundary } from '../lib/errorBoundaryEnhanced';
import BlacklistManager from './components/BlacklistManager';
import Settings from './components/Settings';
import { ReactErrorBoundary } from './components/ErrorBoundary';

interface LanguageConfig {
  code: string;
  name: string;
  flag: string;
  articles?: {
    masculine?: string;
    feminine?: string;
    neuter?: string;
    masculinePlural?: string;
    femininePlural?: string;
    plural?: string;
    vowelStart?: string;
  };
  specialRules?: {
    capitalizeNouns?: boolean;
  };
}

interface ExtensionSettings {
  targetLanguage: string;
  wordsPerPage?: number;
  difficulty?: string;
}

interface LearningStats {
  totalWords: number;
  masteredWords: number;
  todayReviews: number;
  wordsInProgress: number;
  wordsDueForReview: number;
  averageMastery: number;
}

interface ChromeMessageResponse {
  settings?: ExtensionSettings;
  siteEnabled?: boolean;
  hostname?: string;
  stats?: LearningStats;
}

type TabType = 'main' | 'blacklist';

function App() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [currentSite, setCurrentSite] = useState<string>('');
  const [siteEnabled, setSiteEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<TabType>('main');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [learningStats, setLearningStats] = useState<LearningStats | null>(null);

  useEffect(() => {
    loadSettings();
    loadLearningStats();
  }, []);

  async function loadSettings(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }) as ChromeMessageResponse;
      if (response.settings) {
        setSettings(response.settings);
      }
      setSiteEnabled(response.siteEnabled ?? true);
      setCurrentSite(response.hostname || 'This site');
      setLoading(false);
    } catch (error) {
      console.error('Error loading settings:', error);
      setLoading(false);
    }
  }

  async function loadLearningStats(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: 'GET_LEARNING_STATS'
      }) as ChromeMessageResponse;
      if (response.stats) {
        setLearningStats(response.stats);
      }
    } catch (error) {
      console.error('Error loading learning stats:', error);
    }
  }

  async function toggleSite(): Promise<void> {
    const newEnabled = !siteEnabled;
    setSiteEnabled(newEnabled);
    
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SITE_SETTINGS',
      hostname: currentSite,
      settings: { enabled: newEnabled }
    });
    
    // Reload current tab to apply changes
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      chrome.tabs.reload(tab.id);
    }
  }

  async function updateLanguage(language: string): Promise<void> {
    if (!settings) return;
    
    setSettings({ ...settings, targetLanguage: language });
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: { targetLanguage: language }
    });
    
    // Reload current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      chrome.tabs.reload(tab.id);
    }
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
              {(Object.entries(SUPPORTED_LANGUAGES) as Array<[string, LanguageConfig]>).map(([key, lang]) => (
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
            <h2 style={styles.sectionTitle}>Learning Progress</h2>
            {learningStats ? (
              <>
                <div style={styles.stats}>
                  <div style={styles.stat}>
                    <div style={styles.statValue}>{learningStats.totalWords || 0}</div>
                    <div style={styles.statLabel}>Total words</div>
                  </div>
                  <div style={styles.stat}>
                    <div style={styles.statValue}>{learningStats.masteredWords || 0}</div>
                    <div style={styles.statLabel}>Mastered</div>
                  </div>
                  <div style={styles.stat}>
                    <div style={styles.statValue}>{learningStats.todayReviews || 0}</div>
                    <div style={styles.statLabel}>Today's reviews</div>
                  </div>
                </div>
                
                <div style={styles.progressInfo}>
                  <div style={styles.progressItem}>
                    <span style={styles.progressLabel}>Words in progress:</span>
                    <span style={styles.progressValue}>{learningStats.wordsInProgress || 0}</span>
                  </div>
                  <div style={styles.progressItem}>
                    <span style={styles.progressLabel}>Due for review:</span>
                    <span style={styles.progressValue}>{learningStats.wordsDueForReview || 0}</span>
                  </div>
                  <div style={styles.progressItem}>
                    <span style={styles.progressLabel}>Average mastery:</span>
                    <span style={styles.progressValue}>{Math.round(learningStats.averageMastery || 0)}%</span>
                  </div>
                </div>
              </>
            ) : (
              <div style={styles.noStats}>
                Start browsing to track your progress!
              </div>
            )}
          </div>
        </>
      )}

      {/* Blacklist Tab */}
      {activeTab === 'blacklist' && (
        <BlacklistManager />
      )}

      <div style={styles.footer}>
        <a href="#" style={styles.link} onClick={(e: React.MouseEvent) => {
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

const styles: Record<string, React.CSSProperties> = {
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
    gap: '16px',
    marginBottom: '16px',
  },
  stat: {
    flex: 1,
    textAlign: 'center',
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
  },
  statValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#3b82f6',
  },
  statLabel: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
  },
  progressInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  progressItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    fontSize: '14px',
  },
  progressLabel: {
    color: '#6b7280',
  },
  progressValue: {
    color: '#374151',
    fontWeight: '600',
  },
  noStats: {
    textAlign: 'center',
    color: '#6b7280',
    padding: '24px',
    fontSize: '14px',
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