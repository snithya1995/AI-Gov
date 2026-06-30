import Redis from "ioredis";

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

const redisClient = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

redisClient.on('error', (err) => {
    console.error('Redis Connection Error:', err);
});

// --- Configuration ---
const BUCKET_CAPACITY = 10;       // Max burst capacity
const REFILL_RATE = 0.5;          // Tokens refilled per second (1 token every 2 seconds = 30 req/min)
// ---------------------

// Lua script for atomic Token Bucket execution
const TOKEN_BUCKET_LUA = `
    local key_tokens = KEYS[1]
    local key_last = KEYS[2]

    local capacity = tonumber(ARGV[1])
    local refill_rate = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local requested = tonumber(ARGV[4])

    local last_refill = tonumber(redis.call('get', key_last) or now)
    local tokens = tonumber(redis.call('get', key_tokens) or capacity)

    local elapsed = math.max(0, now - last_refill)
    local refilled = elapsed * refill_rate
    local current_tokens = math.min(capacity, tokens + refilled)

    if current_tokens >= requested then
        current_tokens = current_tokens - requested
        redis.call('set', key_tokens, current_tokens)
        redis.call('set', key_last, now)
        redis.call('expire', key_tokens, 3600)
        redis.call('expire', key_last, 3600)
        return {1, math.floor(current_tokens)} -- Allowed, return 1 and remaining tokens
    else
        redis.call('set', key_tokens, current_tokens)
        redis.call('set', key_last, now)
        redis.call('expire', key_tokens, 3600)
        redis.call('expire', key_last, 3600)
        return {0, math.floor(current_tokens)} -- Denied, return 0 and remaining tokens
    end
`;

/**
 * Atomic Token Bucket rate limiter middleware using Redis Lua scripting.
 * Protects downstream services and LLM APIs from burst traffic.
 */
export const userQuotaLimiter = async (req, res, next) => {
    // 1. Make sure the user is authenticated
    if (!req.user || !req.user._id) {
        console.error("Quota limiter: req.user._id is missing.");
        return res.status(401).json({ 
            success: false, 
            message: "Unauthorized" 
        });
    }

    const userId = req.user._id.toString();
    const keyTokens = `rate_limit:${userId}:tokens`;
    const keyLastRefill = `rate_limit:${userId}:last_refill`;
    
    // Current time in seconds (as float for sub-second precision)
    const now = Date.now() / 1000; 

    try {
        // Execute Lua script atomically on Redis
        const result = await redisClient.eval(
            TOKEN_BUCKET_LUA,
            2,
            keyTokens,
            keyLastRefill,
            BUCKET_CAPACITY,
            REFILL_RATE,
            now,
            1 // requested tokens
        );

        const allowed = result[0];
        const remainingTokens = result[1];

        // Set standard rate limiting headers
        res.setHeader("X-RateLimit-Limit", BUCKET_CAPACITY);
        res.setHeader("X-RateLimit-Remaining", Math.max(0, remainingTokens));

        if (allowed === 0) {
            // Calculate when a token will be refilled (capacity/refill_rate = seconds per token)
            const retryAfter = Math.ceil(1 / REFILL_RATE);
            res.setHeader("Retry-After", retryAfter);
            
            return res.status(429).json({
                success: false,
                message: "Too many requests. Please try again later.",
                retryAfterSeconds: retryAfter
            });
        }

        next();
    } catch (err) {
        console.error("Redis rate limiter error:", err);
        // Fallback to allowing request if Redis fails in production to prevent complete outage
        next();
    }
};