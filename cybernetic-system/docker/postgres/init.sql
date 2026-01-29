-- PostgreSQL initialization script for Cybernetic VSM Platform
-- This script runs once when the database container is first created

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create application role if it doesn't exist (for RLS)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cybernetic') THEN
        -- Role might already exist from env vars, this is a safety net
        RAISE NOTICE 'Role cybernetic should be created by env vars';
    END IF;
END
$$;

-- Set default schema search path
ALTER DATABASE cybernetic SET search_path TO public;

-- Configure statement timeout for safety (30 seconds default)
ALTER DATABASE cybernetic SET statement_timeout = '30s';

-- Enable logging for slow queries (useful for development)
ALTER DATABASE cybernetic SET log_min_duration_statement = '200ms';

-- Optimizations for development
ALTER DATABASE cybernetic SET synchronous_commit = 'off';
ALTER DATABASE cybernetic SET effective_cache_size = '256MB';

-- Note: Production settings should override these via runtime configuration
