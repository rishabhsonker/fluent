import React, { useState, useEffect } from 'react';
import { safe, chromeCall } from '../../../../shared/utils/helpers';

interface CategoryConfig {
  name: string;
  description: string;
}

interface BlacklistSettings {
  categories: Record<string, boolean>;
  customSites: string[];
}

type CategoryKey = 'FINANCIAL' | 'GOVERNMENT' | 'HEALTHCARE' | 'AUTHENTICATION' | 'SHOPPING_CHECKOUT' | 'WORK_TOOLS';

const BlacklistManager: React.FC = () => {
  const [customSites, setCustomSites] = useState<string[]>([]);
  const [categories, setCategories] = useState<Record<string, boolean>>({});
  const [newSite, setNewSite] = useState<string>('');
  const [showCategories, setShowCategories] = useState<boolean>(false);

  const CATEGORIES: Record<CategoryKey, CategoryConfig> = {
    FINANCIAL: {
      name: 'Financial & Banking',
      description: 'Banks, payment processors, and financial services'
    },
    GOVERNMENT: {
      name: 'Government',
      description: 'Government websites and services'
    },
    HEALTHCARE: {
      name: 'Healthcare',
      description: 'Medical, healthcare, and patient portals'
    },
    AUTHENTICATION: {
      name: 'Login Pages',
      description: 'Login, signup, and authentication pages'
    },
    SHOPPING_CHECKOUT: {
      name: 'Shopping Checkout',
      description: 'Checkout and payment pages'
    },
    WORK_TOOLS: {
      name: 'Work Tools',
      description: 'Productivity and communication tools'
    }
  };

  useEffect(() => {
    loadBlacklist();
  }, []);

  async function loadBlacklist(): Promise<void> {
    await safe(async () => {
      const result = await chromeCall(() => chrome.storage.sync.get('blacklist_settings'), 'get blacklist settings');
      const settings = (result.blacklist_settings || { categories: {}, customSites: [] }) as BlacklistSettings;
      
      setCustomSites(settings.customSites || []);
      
      // Set default category states
      const categoryStates: Record<string, boolean> = {};
      for (const key of Object.keys(CATEGORIES)) {
        categoryStates[key] = settings.categories[key] !== false;
      }
      setCategories(categoryStates);
    }, 'Loading blacklist settings');
  }

  async function saveBlacklist(): Promise<void> {
    await safe(async () => {
      await chromeCall(() => chrome.storage.sync.set({
        blacklist_settings: {
          categories,
          customSites
        }
      }), 'save blacklist settings');
    }, 'Saving blacklist settings');
  }

  async function addSite(): Promise<void> {
    if (!newSite.trim()) return;
    
    const site = newSite.trim();
    if (!customSites.includes(site)) {
      const updated = [...customSites, site];
      setCustomSites(updated);
      setNewSite('');
      
      // Save immediately
      await safe(async () => {
        await chromeCall(() => chrome.storage.sync.set({
          blacklist_settings: {
            categories,
            customSites: updated
          }
        }), 'save updated blacklist');
      }, 'Saving updated blacklist');
    }
  }

  async function removeSite(site: string): Promise<void> {
    const updated = customSites.filter(s => s !== site);
    setCustomSites(updated);
    
    // Save immediately
    await safe(async () => {
      await chromeCall(() => chrome.storage.sync.set({
        blacklist_settings: {
          categories,
          customSites: updated
        }
      }), 'save blacklist after removal');
    }, 'Saving updated blacklist after removal');
  }

  async function toggleCategory(key: string): Promise<void> {
    const updated = { ...categories, [key]: !categories[key] };
    setCategories(updated);
    
    // Save immediately
    await safe(async () => {
      await chromeCall(() => chrome.storage.sync.set({
        blacklist_settings: {
          categories: updated,
          customSites
        }
      }), 'save category toggle');
    }, 'Saving category toggle');
  }

  async function addCurrentSite(): Promise<void> {
    await safe(async () => {
      const [tab] = await chromeCall(() => chrome.tabs.query({ active: true, currentWindow: true }), 'query active tab');
      if (tab && tab.url) {
        const url = new URL(tab.url);
        const hostname = url.hostname;
        if (!customSites.includes(hostname)) {
          const updated = [...customSites, hostname];
          setCustomSites(updated);
          
          await chromeCall(() => chrome.storage.sync.set({
            blacklist_settings: {
              categories,
              customSites: updated
            }
          }), 'save new site to blacklist');
          
          // Reload the tab
          if (tab.id) {
            await chromeCall(() => chrome.tabs.reload(tab.id!), 'reload tab');
          }
        }
      }
    }, 'Adding current site to blacklist');
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      addSite();
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Blocked Sites</h2>
      <p style={styles.subtitle}>Fluent will never translate on these sites</p>

      {/* Quick add current site */}
      <button
        style={{ ...styles.button, ...styles.blockCurrentButton }}
        onClick={addCurrentSite}
      >
        🚫 Block Current Site
      </button>

      {/* Categories */}
      <div style={styles.section}>
        <div 
          style={styles.sectionHeader}
          onClick={() => setShowCategories(!showCategories)}
        >
          <span>{showCategories ? '▼' : '▶'} Categories</span>
          <span style={styles.badge}>{Object.values(categories).filter(v => v).length}</span>
        </div>
        
        {showCategories && (
          <div style={styles.categoryList}>
            {Object.entries(CATEGORIES).map(([key, category]) => (
              <label key={key} style={styles.categoryItem}>
                <input
                  type="checkbox"
                  checked={categories[key] || false}
                  onChange={() => toggleCategory(key)}
                  style={styles.checkbox}
                />
                <div>
                  <div style={styles.categoryName}>{category.name}</div>
                  <div style={styles.categoryDesc}>{category.description}</div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Custom sites */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Custom Blocked Sites</h3>
        
        <div style={styles.addSite}>
          <input
            type="text"
            value={newSite}
            onChange={(e) => setNewSite(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="example.com or /checkout"
            style={styles.input}
          />
          <button
            onClick={addSite}
            style={styles.addButton}
          >
            Add
          </button>
        </div>

        <div style={styles.siteList}>
          {customSites.length === 0 ? (
            <div style={styles.emptySites}>No custom sites blocked</div>
          ) : (
            customSites.map(site => (
              <div key={site} style={styles.siteItem}>
                <span style={styles.siteName}>{site}</span>
                <button
                  onClick={() => removeSite(site)}
                  style={styles.removeButton}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
    maxHeight: '500px',
    overflowY: 'auto',
  },
  title: {
    fontSize: '18px',
    fontWeight: '600',
    margin: '0 0 4px 0',
    color: '#374151',
  },
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
    margin: '0 0 16px 0',
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
  blockCurrentButton: {
    backgroundColor: '#ef4444',
    color: 'white',
    width: '100%',
    marginBottom: '20px',
  },
  section: {
    marginBottom: '20px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px',
    backgroundColor: '#f3f4f6',
    borderRadius: '6px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  badge: {
    backgroundColor: '#3b82f6',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '12px',
  },
  categoryList: {
    marginTop: '8px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  categoryItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px',
    borderBottom: '1px solid #e5e7eb',
    cursor: 'pointer',
  },
  checkbox: {
    marginTop: '2px',
  },
  categoryName: {
    fontWeight: '500',
    color: '#374151',
    marginBottom: '2px',
  },
  categoryDesc: {
    fontSize: '12px',
    color: '#6b7280',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '500',
    margin: '0 0 12px 0',
    color: '#374151',
  },
  addSite: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    fontSize: '14px',
  },
  addButton: {
    padding: '8px 16px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  siteList: {
    maxHeight: '150px',
    overflowY: 'auto',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
  },
  emptySites: {
    padding: '20px',
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: '14px',
  },
  siteItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid #e5e7eb',
  },
  siteName: {
    fontSize: '14px',
    color: '#374151',
  },
  removeButton: {
    padding: '4px 8px',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
  },
};

export default BlacklistManager;