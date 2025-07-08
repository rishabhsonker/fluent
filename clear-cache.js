// Clear all Fluent extension caches
chrome.storage.local.clear(() => {
  console.log('All local storage cleared');
});

chrome.storage.sync.clear(() => {
  console.log('All sync storage cleared');
});

// Also clear the translation cache specifically
chrome.storage.local.remove(['fluent_translation_cache', 'fluent_offline_data'], () => {
  console.log('Translation caches cleared');
});
EOF < /dev/null