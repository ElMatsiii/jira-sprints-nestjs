-- ==============================================================================
-- Migration: 000001_init_sprints_schema.up.sql
-- Description: Core schema for sprints_db (sprints, alerts, issue mappings)
-- Invariant: Exactly ONE active sprint per project (partial unique index)
-- ==============================================================================

-- Enable pgcrypto for UUID generation if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Table: sprints
CREATE TABLE IF NOT EXISTS sprints (
    id VARCHAR(255) PRIMARY KEY,
    project_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    goal TEXT NOT NULL DEFAULT '',
    status VARCHAR(50) NOT NULL DEFAULT 'PLANNED'
        CHECK (status IN ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
    start_date BIGINT NOT NULL DEFAULT 0,
    end_date BIGINT NOT NULL DEFAULT 0,
    total_story_points INT NOT NULL DEFAULT 0
        CHECK (total_story_points >= 0),
    completed_story_points INT NOT NULL DEFAULT 0
        CHECK (completed_story_points >= 0),
    version INT NOT NULL DEFAULT 1
        CHECK (version >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: sprint_alerts
CREATE TABLE IF NOT EXISTS sprint_alerts (
    id VARCHAR(255) PRIMARY KEY,
    sprint_id VARCHAR(255) NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
    alert_type INT NOT NULL,
    severity INT NOT NULL DEFAULT 1,
    message TEXT NOT NULL,
    recommendation TEXT NOT NULL DEFAULT '',
    acknowledged BOOLEAN NOT NULL DEFAULT TRUE,
    timestamp BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: sprint_issues (tracks issues attached to sprint)
CREATE TABLE IF NOT EXISTS sprint_issues (
    sprint_id VARCHAR(255) NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
    issue_id VARCHAR(255) NOT NULL,
    story_points INT NOT NULL DEFAULT 0 CHECK (story_points >= 0),
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (sprint_id, issue_id)
);

-- ==============================================================================
-- Indexes & Invariants
-- ==============================================================================

-- INVARIANT: Exactly ONE active sprint per project at any given time
CREATE UNIQUE INDEX IF NOT EXISTS idx_sprints_single_active_per_project
    ON sprints (project_id)
    WHERE status = 'ACTIVE';

-- Query performance indexes
CREATE INDEX IF NOT EXISTS idx_sprints_project_id ON sprints (project_id);
CREATE INDEX IF NOT EXISTS idx_sprints_status ON sprints (status);
CREATE INDEX IF NOT EXISTS idx_sprints_created_at ON sprints (created_at);

CREATE INDEX IF NOT EXISTS idx_sprint_alerts_sprint_id ON sprint_alerts (sprint_id);
CREATE INDEX IF NOT EXISTS idx_sprint_alerts_created_at ON sprint_alerts (created_at);

CREATE INDEX IF NOT EXISTS idx_sprint_issues_issue_id ON sprint_issues (issue_id);

-- ==============================================================================
-- Idempotent Default Seed Data
-- ==============================================================================

INSERT INTO sprints (
    id,
    project_id,
    name,
    goal,
    status,
    start_date,
    end_date,
    total_story_points,
    completed_story_points,
    version,
    created_at,
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    'Sprint 1 - Foundation & Microservices Core',
    'Establish contracts, schemas, gRPC endpoints, and Kafka pub/sub pipelines',
    'ACTIVE',
    EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    EXTRACT(EPOCH FROM (NOW() + INTERVAL '14 days'))::BIGINT * 1000,
    21,
    8,
    1,
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;
