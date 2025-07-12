/**
 * Translation Cache - High-performance LRU cache for translations
 * 
 * Purpose:
 * - Provides fast in-memory caching for translation lookups
 * - Reduces API calls by storing frequently used translations
 * - Implements LRU eviction to manage memory usage
 * 
 * Key Features:
 * - LRU (Least Recently Used) eviction strategy
 * - Configurable size limit (default 1000 entries)
 * - O(1) get/set operations
 * - TTL support for cache entries
 * - Memory-efficient storage
 * - Automatic cleanup of expired entries
 * 
 * Cache Strategy:
 * - Max 1000 entries in memory
 * - LRU eviction when limit reached
 * - 24-hour TTL for entries
 * - Separate caches per language
 * 
 * Referenced by:
 * - src/features/translation/translator.ts (L1 cache)
 * - src/core/worker.ts (manages cache lifecycle)
 * 
 * Performance:
 * - Target 95%+ cache hit rate
 * - Sub-millisecond lookup times
 * - Memory usage < 5MB
 * 
 * @note Consider merging with MemoryManager if functionality overlaps
 */

import { logger } from './logger';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  expires: number;
  accessCount: number;
  lastAccessed: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
}

export class MemoryCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private readonly maxSize: number;
  private readonly defaultTTL: number;
  private stats: CacheStats;
  
  constructor(maxSize: number = 500, defaultTTLMinutes: number = 30) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTLMinutes * 60 * 1000; // Convert to milliseconds
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0
    };
  }
  
  /**
   * Get a value from cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    // Check if expired
    if (entry.expires < Date.now()) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    // Update access info (LRU)
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    // Move to end for LRU (delete and re-add)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    this.stats.hits++;
    return entry.value;
  }
  
  /**
   * Set a value in cache
   */
  set(key: string, value: T, ttlMinutes?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }
    
    const now = Date.now();
    const ttl = (ttlMinutes ? ttlMinutes * 60 * 1000 : this.defaultTTL);
    
    const entry: CacheEntry<T> = {
      value,
      timestamp: now,
      expires: now + ttl,
      accessCount: 1,
      lastAccessed: now
    };
    
    this.cache.set(key, entry);
    this.stats.size = this.cache.size;
  }
  
  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (entry.expires < Date.now()) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }
  
  /**
   * Delete a key from cache
   */
  delete(key: string): boolean {
    const result = this.cache.delete(key);
    this.stats.size = this.cache.size;
    return result;
  }
  
  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }
  
  /**
   * Get cache hit rate
   */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? this.stats.hits / total : 0;
  }
  
  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    // Find least recently accessed entry
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      logger.debug('Evicted cache entry', { key: oldestKey });
    }
  }
  
  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires < now) {
        this.cache.delete(key);
        removed++;
      }
    }
    
    this.stats.size = this.cache.size;
    
    if (removed > 0) {
      logger.debug('Cleaned up expired cache entries', { count: removed });
    }
    
    return removed;
  }
  
  /**
   * Get cache size
   */
  get size(): number {
    return this.cache.size;
  }
  
  /**
   * Export cache for persistence
   */
  export(): Array<[string, T, number]> {
    const now = Date.now();
    const exported: Array<[string, T, number]> = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires > now) {
        exported.push([key, entry.value, entry.expires]);
      }
    }
    
    return exported;
  }
  
  /**
   * Import cache from persistence
   */
  import(data: Array<[string, T, number]>): void {
    const now = Date.now();
    
    for (const [key, value, expires] of data) {
      if (expires > now && this.cache.size < this.maxSize) {
        const entry: CacheEntry<T> = {
          value,
          timestamp: now,
          expires,
          accessCount: 0,
          lastAccessed: now
        };
        this.cache.set(key, entry);
      }
    }
    
    this.stats.size = this.cache.size;
  }
}

// Specialized translation cache with language-aware keys
export class TranslationMemoryCache extends MemoryCache<string> {
  private contextCache: MemoryCache<any>;
  
  constructor(maxSize: number = 1000, defaultTTLMinutes: number = 30) {
    super(maxSize, defaultTTLMinutes);
    this.contextCache = new MemoryCache(500, 60); // Context cache with 1 hour TTL
  }
  
  /**
   * Get translation with language-aware key
   */
  getTranslation(word: string, language: string): string | null {
    const key = this.makeKey(word, language);
    return this.get(key);
  }
  
  /**
   * Set translation with language-aware key
   */
  setTranslation(word: string, language: string, translation: string): void {
    const key = this.makeKey(word, language);
    this.set(key, translation);
  }
  
  /**
   * Get context with language-aware key
   */
  getContext(word: string, language: string): any {
    const key = `context:${this.makeKey(word, language)}`;
    return this.contextCache.get(key);
  }
  
  /**
   * Set context with language-aware key
   */
  setContext(word: string, language: string, context: any): void {
    const key = `context:${this.makeKey(word, language)}`;
    this.contextCache.set(key, context);
  }
  
  /**
   * Clear both translation and context caches
   */
  clear(): void {
    super.clear();
    this.contextCache.clear();
  }
  
  /**
   * Make consistent cache key
   */
  private makeKey(word: string, language: string): string {
    return `${language}:${word.toLowerCase().trim()}`;
  }
}

// Export singleton instance
export const translationCache = new TranslationMemoryCache(1000, 30);