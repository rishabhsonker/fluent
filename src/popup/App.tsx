import React, { useState, useEffect } from 'react';
import { SUPPORTED_LANGUAGES } from '../lib/constants';
import BlacklistManager from './components/BlacklistManager';
import Settings from './components/Settings';
import RateLimitStatus from './components/RateLimitStatus';
import type { UserSettings, LanguageCode, SupportedLanguage } from '../types';

type TabType = 'main' | 'blacklist';

interface ChromeMessageResponse {
  settings?: UserSettings;
  siteEnabled?: boolean;
  hostname?: string;
  success?: boolean;
  stats?: LearningStats;
}

interface LearningStats {
  totalWords: number;
  masteredWords: number;
  wordsInProgress: number;
  wordsDueForReview: number;
  averageMastery: number;
  todayReviews: number;
}

function App(): React.JSX.Element {
  const [loading, setLoading] = useState<boolean>(true);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [siteEnabled, setSiteEnabled] = useState<boolean>(true);
  const [currentSite, setCurrentSite] = useState<string>('This site');
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
      console.log('Popup received settings response:', response);
      if (response.settings) {
        setSettings(response.settings);
        console.log('Current language setting:', response.settings.targetLanguage);
      }
      setSiteEnabled(response.siteEnabled ?? true);
      setCurrentSite(response.hostname || 'This site');
      setLoading(false);
    } catch (error) {
      console.error('Error loading settings in popup:', error);
      // Error loading settings - fail silently in production
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
      // Error loading stats - fail silently in production
    }
  }

  async function toggleSite(): Promise<void> {
    const newEnabled = !siteEnabled;
    
    // If enabling and we don't have permission yet, request it
    if (newEnabled) {
      const response = await chrome.runtime.sendMessage({
        type: 'ENABLE_FOR_SITE'
      }) as ChromeMessageResponse;
      
      if (response.success) {
        setSiteEnabled(true);
        // Reload current tab to apply changes
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab.id) {
          chrome.tabs.reload(tab.id);
        }
      } else {
        // Permission denied or error
        // Failed to enable - user will see no change
        return;
      }
    } else {
      // Disabling site
      setSiteEnabled(false);
      
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SITE_SETTINGS',
        hostname: currentSite,
        settings: { enabled: false }
      });
      
      // Reload current tab to apply changes
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        chrome.tabs.reload(tab.id);
      }
    }
  }

  async function updateLanguage(language: string): Promise<void> {
    if (!settings) return;
    
    setSettings({ ...settings, targetLanguage: language as LanguageCode });
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
      <div className="fluent-container">
        <div className="fluent-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="fluent-container">
      <header className="fluent-header">
        <h1 className="fluent-title">Fluent</h1>
        <p className="fluent-subtitle">Learn languages while browsing</p>
      </header>

      {/* Tab Navigation */}
      <div className="fluent-tabs">
        <button
          className={`fluent-tab ${activeTab === 'main' ? 'fluent-tab-active' : ''}`}
          onClick={() => setActiveTab('main')}
        >
          Home
        </button>
        <button
          className={`fluent-tab ${activeTab === 'blacklist' ? 'fluent-tab-active' : ''}`}
          onClick={() => setActiveTab('blacklist')}
        >
          Blocked Sites
        </button>
      </div>

      {/* Main Tab */}
      {activeTab === 'main' && (
        <>
          <div className="fluent-section">
            <h2 className="fluent-section-title">Current Site</h2>
            <div className="fluent-site-control">
              <div className="fluent-site-info">
                <div className="fluent-site-label">Status</div>
                <div className="fluent-site-name">{currentSite}</div>
              </div>
              <button 
                className={`fluent-button ${siteEnabled ? 'fluent-button-danger' : 'fluent-button-primary'}`}
                onClick={toggleSite}
              >
                {siteEnabled ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>

          <div className="fluent-section">
            <h2 className="fluent-section-title">Language</h2>
            <div className="fluent-language-grid">
              {(Object.entries(SUPPORTED_LANGUAGES) as Array<[string, SupportedLanguage]>).map(([key, lang]) => (
                <button
                  key={key}
                  className={`fluent-lang-button ${settings.targetLanguage === key ? 'fluent-lang-button-active' : ''}`}
                  onClick={() => updateLanguage(key)}
                >
                  <span className="fluent-flag">{lang.flag}</span>
                  <span>{lang.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="fluent-section">
            <h2 className="fluent-section-title">Learning Progress</h2>
            {learningStats ? (
              <>
                <div className="fluent-stats">
                  <div className="fluent-stat">
                    <div className="fluent-stat-value">{learningStats.totalWords || 0}</div>
                    <div className="fluent-stat-label">Total words</div>
                  </div>
                  <div className="fluent-stat">
                    <div className="fluent-stat-value">{learningStats.masteredWords || 0}</div>
                    <div className="fluent-stat-label">Mastered</div>
                  </div>
                  <div className="fluent-stat">
                    <div className="fluent-stat-value">{learningStats.todayReviews || 0}</div>
                    <div className="fluent-stat-label">Today's reviews</div>
                  </div>
                </div>
                
                <div className="fluent-progress-info">
                  <div className="fluent-progress-item">
                    <span className="fluent-progress-label">Words in progress:</span>
                    <span className="fluent-progress-value">{learningStats.wordsInProgress || 0}</span>
                  </div>
                  <div className="fluent-progress-item">
                    <span className="fluent-progress-label">Due for review:</span>
                    <span className="fluent-progress-value">{learningStats.wordsDueForReview || 0}</span>
                  </div>
                  <div className="fluent-progress-item">
                    <span className="fluent-progress-label">Average mastery:</span>
                    <span className="fluent-progress-value">{Math.round(learningStats.averageMastery || 0)}%</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="fluent-no-stats">
                Start browsing to track your progress!
              </div>
            )}
          </div>
          
          <RateLimitStatus className="fluent-section" />
        </>
      )}

      {/* Blacklist Tab */}
      {activeTab === 'blacklist' && (
        <BlacklistManager />
      )}

      <div className="fluent-footer">
        <a href="#" className="fluent-link" onClick={(e: React.MouseEvent) => {
          e.preventDefault();
          setShowSettings(true);
        }}>Settings</a>
        <span className="fluent-separator">•</span>
        <a href="#" className="fluent-link">Help</a>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

export default App;