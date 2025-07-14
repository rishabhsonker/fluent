/**
 * Notifications module
 * Handles user notifications for errors and limits
 */

import { ComponentAsyncManager } from '../../shared/async';
import { UI_DIMENSIONS_EXTENDED, ANIMATION, TIME, ARRAY, THRESHOLD } from '../../shared/constants';
import { CSS_SHADOWS } from '../../shared/constants/css-variables';

// AsyncManager instance
const asyncManager = new ComponentAsyncManager('Notifications');

/**
 * Show error notification to user
 */
export function showErrorNotification(message: string): void {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ef4444;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: ${CSS_SHADOWS.CONTROL_BUTTON};
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    max-width: 320px;
    z-index: ${UI_DIMENSIONS_EXTENDED.ZINDEX_NOTIFICATION};
    animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = message;
  
  if (document.body) {
    document.body.appendChild(notification);
  }
  
  // Use AsyncManager for auto-removal
  asyncManager.execute(
    `notification-remove-${Date.now()}`,
    async (signal) => {
      await asyncManager.delay(ANIMATION.NOTIFICATION_DURATION_MS + (ARRAY.PAIR_SIZE * TIME.MS_PER_SECOND), signal);
      if (!signal.aborted && notification.parentNode) {
        notification.remove();
      }
    },
    { description: 'Remove error notification', cancelOnNavigation: false }
  );
}

/**
 * Show notification when daily limit is reached
 */
export function showLimitNotification(): void {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'fluent-limit-notification';
  
  // Create notification content safely
  const notificationContent = document.createElement('div');
  notificationContent.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #3b82f6;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: ${CSS_SHADOWS.CONTROL_BUTTON};
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    max-width: 320px;
    z-index: ${UI_DIMENSIONS_EXTENDED.ZINDEX_NOTIFICATION};
    animation: slideIn 0.3s ease-out;
  `;
  
  const strong = document.createElement('strong');
  strong.textContent = 'Daily limit reached!';
  notificationContent.appendChild(strong);
  
  const br = document.createElement('br');
  notificationContent.appendChild(br);
  
  const text = document.createTextNode('You\'ve used your 100 free translations today. Add your own API key in settings for unlimited translations.');
  notificationContent.appendChild(text);
  
  const closeButton = document.createElement('button');
  closeButton.style.cssText = `
    position: absolute;
    top: 8px;
    right: 8px;
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 16px;
    padding: 4px;
  `;
  closeButton.textContent = '✕';
  closeButton.addEventListener('click', () => notification.remove());
  notificationContent.appendChild(closeButton);
  
  notification.appendChild(notificationContent);
  
  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  if (document.head) {
    document.head.appendChild(style);
  }
  
  // Add to page
  if (document.body) {
    document.body.appendChild(notification);
  }
  
  // Auto-remove after 10 seconds with AsyncManager
  asyncManager.execute(
    `limit-notification-remove-${Date.now()}`,
    async (signal) => {
      await asyncManager.delay(THRESHOLD.MAX_ERROR_COUNT * TIME.MS_PER_SECOND, signal);
      if (!signal.aborted && notification.parentNode) {
        notification.remove();
      }
    },
    { description: 'Remove limit notification', cancelOnNavigation: false }
  );
}