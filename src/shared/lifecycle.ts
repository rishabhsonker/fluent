/**
 * Service Worker Lifecycle Manager
 * Handles keepalive, state persistence, and graceful shutdown
 */

import { logger } from './logger';
import { safe, chromeCall } from './utils/helpers';
import { MONITORING, TIME } from './constants';

interface LifecycleState {
  lastActivity: number;
  activeOperations: Set<string>;
  criticalData: Map<string, any>;
  suspended: boolean;
}

interface OperationContext {
  id: string;
  description: string;
  critical: boolean;
  timeout?: number;
}

class ServiceWorkerLifecycle {
  private state: LifecycleState = {
    lastActivity: Date.now(),
    activeOperations: new Set(),
    criticalData: new Map(),
    suspended: false
  };
  
  private keepAliveInterval: number | null = null;
  private stateKey = 'fluent_sw_lifecycle_state';
  private alarmName = 'fluent_keepalive';
  
  // Chrome's limits
  private readonly INACTIVITY_TIMEOUT = MONITORING.CHROME_INACTIVITY_LIMIT_MS; // 30 seconds - Chrome's hard limit
  private readonly MAX_LIFETIME = MONITORING.MAX_LIFETIME_MS;
  private readonly KEEPALIVE_INTERVAL = MONITORING.CHROME_KEEPALIVE_INTERVAL_MS; // 20 seconds (under 30s limit)
  private readonly ALARM_PERIOD = MONITORING.CHROME_ALARM_MIN_PERIOD_MINUTES; // 1 minute minimum for alarms

  constructor() {
    this.setupEventListeners();
    this.restoreState();
  }

  /**
   * Initialize lifecycle management
   */
  async initialize(): Promise<void> {
    await safe(
      async () => {
        // Set up periodic alarm for wake-ups
        await chromeCall(
          () => chrome.alarms.create(this.alarmName, {
            periodInMinutes: this.ALARM_PERIOD,
            delayInMinutes: this.ALARM_PERIOD
          }),
          'lifecycle.createAlarm'
        );
        
        logger.info('[Lifecycle] Service worker lifecycle manager initialized');
        
        // Start keepalive if we have active operations
        if (this.state.activeOperations.size > 0) {
          this.startKeepAlive();
        }
      },
      'lifecycle.initialize'
    );
  }

  /**
   * Register an operation that needs the service worker to stay alive
   */
  async startOperation(context: OperationContext): Promise<() => void> {
    return safe(
      async () => {
        const { id, description, critical, timeout } = context;
        
        logger.info('[Lifecycle] Starting operation', { id, description, critical });
        
        this.state.activeOperations.add(id);
        this.state.lastActivity = Date.now();
        
        // Start keepalive if this is the first operation
        if (this.state.activeOperations.size === 1) {
          this.startKeepAlive();
        }
        
        // Set timeout if specified
        let timeoutId: number | null = null;
        if (timeout) {
          timeoutId = setTimeout(() => {
            logger.warn('[Lifecycle] Operation timed out', { id, timeout });
            this.endOperation(id);
          }, timeout) as unknown as number;
        }
        
        // Return cleanup function
        return () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          this.endOperation(id);
        };
      },
      'lifecycle.startOperation',
      () => {} // Return no-op function on error
    );
  }

  /**
   * End an operation
   */
  private endOperation(id: string): void {
    logger.info('[Lifecycle] Ending operation', { id });
    
    this.state.activeOperations.delete(id);
    this.state.lastActivity = Date.now();
    
    // Stop keepalive if no more operations
    if (this.state.activeOperations.size === 0) {
      this.stopKeepAlive();
    }
  }

  /**
   * Start keepalive mechanism
   */
  private startKeepAlive(): void {
    if (this.keepAliveInterval) {
      return; // Already running
    }
    
    logger.info('[Lifecycle] Starting keepalive');
    
    // Send periodic messages to keep service worker alive
    this.keepAliveInterval = setInterval(() => {
      // Check if we're approaching the max lifetime
      const runtime = Date.now() - performance.timeOrigin;
      if (runtime > this.MAX_LIFETIME - TIME.MS_PER_MINUTE) { // 1 minute before max
        logger.warn('[Lifecycle] Approaching max lifetime, preparing for shutdown');
        this.prepareForShutdown();
        return;
      }
      
      // Send keepalive ping
      this.sendKeepAlivePing();
      
      // Update activity timestamp
      this.state.lastActivity = Date.now();
      
    }, this.KEEPALIVE_INTERVAL) as unknown as number;
  }

  /**
   * Stop keepalive mechanism
   */
  private stopKeepAlive(): void {
    if (!this.keepAliveInterval) {
      return;
    }
    
    logger.info('[Lifecycle] Stopping keepalive');
    clearInterval(this.keepAliveInterval);
    this.keepAliveInterval = null;
  }

  /**
   * Send keepalive ping to prevent suspension
   */
  private sendKeepAlivePing(): void {
    // Method 1: Self-message
    chrome.runtime.sendMessage({ type: 'KEEPALIVE_PING' }).catch(() => {
      // Ignore errors - this is just a keepalive
    });
    
    // Method 2: Access chrome API to reset idle timer
    chrome.runtime.getPlatformInfo(() => {
      // Just accessing the API resets the idle timer
    });
    
    // Method 3: Fetch from extension origin (lightweight)
    fetch(chrome.runtime.getURL('manifest.json'), { method: 'HEAD' }).catch(() => {
      // Ignore errors
    });
  }

  /**
   * Store critical data that needs to persist across suspensions
   */
  async storeCriticalData(key: string, data: any): Promise<void> {
    await safe(
      async () => {
        this.state.criticalData.set(key, data);
        await this.persistState();
      },
      'lifecycle.storeCriticalData'
    );
  }

  /**
   * Retrieve critical data
   */
  getCriticalData(key: string): any {
    return this.state.criticalData.get(key);
  }

  /**
   * Prepare for service worker shutdown
   */
  private async prepareForShutdown(): Promise<void> {
    logger.info('[Lifecycle] Preparing for shutdown', {
      activeOperations: Array.from(this.state.activeOperations),
      criticalDataKeys: Array.from(this.state.criticalData.keys())
    });
    
    // Stop keepalive to allow graceful shutdown
    this.stopKeepAlive();
    
    // Persist current state
    await this.persistState();
    
    // Notify any listeners
    await chrome.runtime.sendMessage({ 
      type: 'SERVICE_WORKER_SUSPENDING',
      state: {
        activeOperations: Array.from(this.state.activeOperations),
        hasData: this.state.criticalData.size > 0
      }
    }).catch(() => {
      // Ignore errors - listeners might not exist
    });
  }

  /**
   * Persist state to storage
   */
  private async persistState(): Promise<void> {
    await safe(
      async () => {
        const stateToStore = {
          lastActivity: this.state.lastActivity,
          activeOperations: Array.from(this.state.activeOperations),
          criticalData: Array.from(this.state.criticalData.entries()),
          suspended: true,
          timestamp: Date.now()
        };
        
        await chromeCall(
          () => chrome.storage.local.set({ [this.stateKey]: stateToStore }),
          'lifecycle.persistState'
        );
        logger.info('[Lifecycle] State persisted');
      },
      'lifecycle.persistState'
    );
  }

  /**
   * Restore state from storage
   */
  private async restoreState(): Promise<void> {
    await safe(
      async () => {
        const stored = await chromeCall(
          () => chrome.storage.local.get(this.stateKey),
          'lifecycle.getState',
          {}
        );
        if (!stored[this.stateKey]) {
          return;
        }
        
        const savedState = stored[this.stateKey];
        
        // Check if state is recent (within 5 minutes)
        if (Date.now() - savedState.timestamp < MONITORING.STATE_RESTORE_TIMEOUT_MS) {
          this.state = {
            lastActivity: savedState.lastActivity,
            activeOperations: new Set(savedState.activeOperations),
            criticalData: new Map(savedState.criticalData),
            suspended: false
          };
          
          logger.info('[Lifecycle] State restored', {
            operations: savedState.activeOperations.length,
            dataKeys: savedState.criticalData.length
          });
          
          // Resume operations if any were active
          if (this.state.activeOperations.size > 0) {
            this.handleResume();
          }
        }
        
        // Clear old state
        await chromeCall(
          () => chrome.storage.local.remove(this.stateKey),
          'lifecycle.clearOldState'
        );
      },
      'lifecycle.restoreState'
    );
  }

  /**
   * Handle resume after suspension
   */
  private async handleResume(): Promise<void> {
    logger.info('[Lifecycle] Resuming after suspension', {
      activeOperations: Array.from(this.state.activeOperations)
    });
    
    // Notify listeners about resume
    await chrome.runtime.sendMessage({ 
      type: 'SERVICE_WORKER_RESUMED',
      state: {
        activeOperations: Array.from(this.state.activeOperations),
        criticalData: Array.from(this.state.criticalData.keys())
      }
    }).catch(() => {
      // Ignore errors
    });
    
    // Start keepalive again
    this.startKeepAlive();
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen for alarm events
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === this.alarmName) {
        logger.debug('[Lifecycle] Keepalive alarm triggered');
        this.state.lastActivity = Date.now();
        
        // Check if we need to resume any operations
        if (this.state.activeOperations.size > 0) {
          this.sendKeepAlivePing();
        }
      }
    });
    
    // Listen for suspend event
    if (chrome.runtime.onSuspend) {
      chrome.runtime.onSuspend.addListener(() => {
        logger.info('[Lifecycle] Suspend event received');
        this.prepareForShutdown();
      });
    }
    
    // Listen for suspend canceled event
    if (chrome.runtime.onSuspendCanceled) {
      chrome.runtime.onSuspendCanceled.addListener(() => {
        logger.info('[Lifecycle] Suspend canceled');
        // Resume normal operation
        if (this.state.activeOperations.size > 0) {
          this.startKeepAlive();
        }
      });
    }
    
    // Listen for startup event
    chrome.runtime.onStartup.addListener(() => {
      logger.info('[Lifecycle] Extension startup');
      this.restoreState();
    });
    
    // Listen for our own messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'KEEPALIVE_PING') {
        // Just receiving this message keeps the service worker alive
        sendResponse({ pong: true });
      }
    });
  }

  /**
   * Get lifecycle statistics
   */
  getStats(): {
    uptime: number;
    activeOperations: number;
    lastActivity: number;
    isKeepaliveActive: boolean;
  } {
    return {
      uptime: Date.now() - performance.timeOrigin,
      activeOperations: this.state.activeOperations.size,
      lastActivity: this.state.lastActivity,
      isKeepaliveActive: this.keepAliveInterval !== null
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopKeepAlive();
    chromeCall(
      () => chrome.alarms.clear(this.alarmName),
      'lifecycle.clearAlarm'
    ).catch(() => {
      // Ignore errors during cleanup
    });
    this.state.activeOperations.clear();
    this.state.criticalData.clear();
  }
}

// Singleton instance
let lifecycleManager: ServiceWorkerLifecycle | null = null;

export function getLifecycleManager(): ServiceWorkerLifecycle {
  if (!lifecycleManager) {
    lifecycleManager = new ServiceWorkerLifecycle();
  }
  return lifecycleManager;
}

/**
 * Decorator to wrap async operations with lifecycle management
 */
export function withLifecycle(
  description: string, 
  options: { critical?: boolean; timeout?: number } = {}
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const lifecycle = getLifecycleManager();
      const operationId = `${target.constructor.name}.${propertyKey}_${Date.now()}`;
      
      const cleanup = await lifecycle.startOperation({
        id: operationId,
        description,
        critical: options.critical || false,
        timeout: options.timeout
      });
      
      try {
        return await originalMethod.apply(this, args);
      } finally {
        cleanup();
      }
    };
    
    return descriptor;
  };
}