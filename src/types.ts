// Global D1/R2/ExecutionContext type declarations (Cloudflare Workers runtime)
declare global {
    interface ExecutionContext {
        waitUntil(promise: Promise<any>): void;
        passThroughOnException(): void;
    }

    interface D1Database {
        prepare(query: string): D1PreparedStatement;
        batch<T = any>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
    }
    interface D1PreparedStatement {
        bind(...values: any[]): D1PreparedStatement;
        first<T = any>(): Promise<T | null>;
        all<T = any>(): Promise<D1Result<T>>;
        run(): Promise<D1Result>;
    }
    interface D1Result<T = any> {
        results: T[];
        success: boolean;
        error?: string;
        meta: any;
    }
}

export interface Env {
    DB: D1Database;
    PUBLIC_SYNC_DIAGNOSTIC_IP_RATE_LIMIT: RateLimit;
    SYNC_HARDWARE_RATE_LIMIT: RateLimit;
    DIAGNOSTIC_HARDWARE_RATE_LIMIT: RateLimit;
    SIGNING_KEY: string;
    ADMIN_TOKEN: string;
    POLAR_WEBHOOK_SECRET: string;
    RESEND_API_KEY: string;
    UPDATES_BUCKET: R2Bucket;
    ASSETS: Fetcher;
    DEBUG_LOG_PRIVATE_KEY?: string;
    POLAR_API_KEY: string;
    POLAR_PRODUCT_TRIAL?: string;
    POLAR_PRODUCT_PRO_MONTHLY?: string;
    POLAR_PRODUCT_PRO_ANNUAL?: string;
    POLAR_PRODUCT_ELITE_STANDARD?: string;
    POLAR_PRODUCT_ELITE_MAX?: string;
    ELITE_STANDARD_SEATS?: string;
    ELITE_MAX_SEATS?: string;
    // Trial
    TRIAL_DAYS?: string;
    TRIAL_ENABLED?: string;
    TRIAL_SEATS?: string;
    TRIAL_REMINDER_1_DAYS?: string;
    TRIAL_REMINDER_2_DAYS?: string;
    TRIAL_NURTURE_DAY1?: string;
    TRIAL_NURTURE_DAY2?: string;
    // Subscription billing
    SUBSCRIPTION_MONTHLY_DAYS?: string;
    SUBSCRIPTION_YEARLY_DAYS?: string;
    UNLIMITED_SEATS?: string;
    // Expiry + churn
    EXPIRY_WARNING_DAYS?: string;
    CHURN_INACTIVE_DAYS?: string;
    CHURN_DEDUP_DAYS?: string;
    // Operational limits
    MAX_UPDATE_FILE_MB?: string;
    ANALYTICS_LOOKBACK_DAYS?: string;
    DOWNLOAD_TOKEN_TTL_MINUTES?: string;
    DIAGNOSTIC_RETENTION_DAYS?: string;
    // Rate limits
    RATE_LIMIT_CONFIG?: string;
    // Site + pricing (used in emails)
    ADMIN_EMAIL?: string;
    SITE_URL?: string;
    PRICING_PRO_MONTHLY?: string;
    PRICING_ELITE?: string;
}

interface RateLimit {
    limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface R2Bucket {
    put(key: string, value: ReadableStream | ArrayBuffer | string): Promise<void>;
    get(key: string): Promise<R2ObjectBody | null>;
    delete(key: string): Promise<void>;
}

interface R2ObjectBody {
    body: ReadableStream;
    httpMetadata?: {
        contentType?: string;
    };
}
