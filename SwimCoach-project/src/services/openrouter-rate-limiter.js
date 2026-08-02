/**
 * OpenRouter Rate Limiter
 *
 * Global rate limiter for OpenRouter API calls to prevent hitting free tier limits.
 * Uses a token bucket algorithm with configurable limits.
 *
 * Free tier limits (approximate):
 * - 20 requests/minute for free models
 * - 100 requests/minute for paid models
 */

class RateLimiter {
  constructor(options = {}) {
    this.maxRequestsPerMinute = options.maxRequestsPerMinute || 20; // OpenRouter free tier: 20 req/min
    this.requests = [];
    this.waitingQueue = [];
  }

  /**
   * Acquire permission to make a request
   * Returns a promise that resolves when the request can proceed
   */
  async acquire() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove requests older than 1 minute
    this.requests = this.requests.filter(t => t > oneMinuteAgo);

    if (this.requests.length < this.maxRequestsPerMinute) {
      // We have capacity
      this.requests.push(now);
      return true;
    }

    // Need to wait - calculate time until oldest request expires
    const oldestRequest = this.requests[0];
    const waitTime = Math.max(0, oldestRequest + 60000 - now) + 100; // Add 100ms buffer

    console.log(`[RateLimiter] Rate limit reached (${this.requests.length}/${this.maxRequestsPerMinute} req/min). Waiting ${waitTime}ms...`);

    await new Promise(resolve => setTimeout(resolve, waitTime));

    // Recursive call after waiting
    return this.acquire();
  }

  /**
   * Get current usage stats
   */
  getStats() {
    const now = Date.now();
    const recentRequests = this.requests.filter(t => t > now - 60000);
    return {
      current: recentRequests.length,
      limit: this.maxRequestsPerMinute,
      remaining: Math.max(0, this.maxRequestsPerMinute - recentRequests.length)
    };
  }
}

// Singleton instance for global rate limiting across all services
const globalRateLimiter = new RateLimiter({
  maxRequestsPerMinute: parseInt(process.env.OPENROUTER_RATE_LIMIT || '15', 10)
});

/**
 * Wrapper to make a rate-limited axios call
 */
async function rateLimitedAxiosCall(axiosCallFn) {
  await globalRateLimiter.acquire();
  return axiosCallFn();
}

/**
 * Wrapper to make a rate-limited fetch call
 */
async function rateLimitedFetchCall(fetchCallFn) {
  await globalRateLimiter.acquire();
  return fetchCallFn();
}

module.exports = {
  RateLimiter,
  globalRateLimiter,
  rateLimitedAxiosCall,
  rateLimitedFetchCall
};