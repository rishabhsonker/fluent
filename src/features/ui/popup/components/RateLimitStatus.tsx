import React, { useState, useEffect } from 'react';

interface RateLimitInfo {
  translationLimits: {
    hourlyRemaining: number;
    hourlyLimit: number;
    dailyRemaining: number;
    dailyLimit: number;
  };
  aiLimits: {
    hourlyRemaining: number;
    hourlyLimit: number;
    dailyRemaining: number;
    dailyLimit: number;
  };
  nextResetIn: {
    hourly: number; // minutes
    daily: number;  // hours
  };
}

interface Props {
  className?: string;
}

export default function RateLimitStatus({ className = '' }: Props): React.JSX.Element {
  const [limits, setLimits] = useState<RateLimitInfo | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadRateLimits();
    // Refresh every minute
    const interval = setInterval(loadRateLimits, 60000);
    return () => clearInterval(interval);
  }, []);
  
  async function loadRateLimits(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_RATE_LIMITS' });
      if (response.limits) {
        setLimits(response.limits);
      }
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  }
  
  if (loading || !limits) {
    return <div className={`fluent-rate-limits ${className}`}>Loading usage...</div>;
  }
  
  const translationPercent = (limits.translationLimits.dailyRemaining / limits.translationLimits.dailyLimit) * 100;
  const aiPercent = (limits.aiLimits.dailyRemaining / limits.aiLimits.dailyLimit) * 100;
  
  return (
    <div className={`fluent-rate-limits ${className}`}>
      <h3 className="fluent-rate-limits-title">Daily Usage</h3>
      
      <div className="fluent-rate-limit-item">
        <div className="fluent-rate-limit-header">
          <span className="fluent-rate-limit-label">New Words</span>
          <span className="fluent-rate-limit-count">
            {limits.translationLimits.dailyLimit - limits.translationLimits.dailyRemaining} / {limits.translationLimits.dailyLimit}
          </span>
        </div>
        <div className="fluent-rate-limit-bar">
          <div 
            className="fluent-rate-limit-fill"
            style={{ 
              width: `${100 - translationPercent}%`,
              backgroundColor: translationPercent > 20 ? '#3b82f6' : '#f59e0b'
            }}
          />
        </div>
        {limits.translationLimits.hourlyRemaining === 0 && (
          <div className="fluent-rate-limit-warning">
            Resets in {limits.nextResetIn.hourly} minutes
          </div>
        )}
      </div>
      
      <div className="fluent-rate-limit-item">
        <div className="fluent-rate-limit-header">
          <span className="fluent-rate-limit-label">AI Explanations</span>
          <span className="fluent-rate-limit-count">
            {limits.aiLimits.dailyLimit - limits.aiLimits.dailyRemaining} / {limits.aiLimits.dailyLimit}
          </span>
        </div>
        <div className="fluent-rate-limit-bar">
          <div 
            className="fluent-rate-limit-fill"
            style={{ 
              width: `${100 - aiPercent}%`,
              backgroundColor: aiPercent > 20 ? '#10b981' : '#f59e0b'
            }}
          />
        </div>
        {limits.aiLimits.dailyRemaining === 0 && (
          <div className="fluent-rate-limit-warning">
            Daily limit reached
          </div>
        )}
      </div>
      
      <div className="fluent-rate-limit-note">
        Cached words don't count against limits
      </div>
    </div>
  );
}