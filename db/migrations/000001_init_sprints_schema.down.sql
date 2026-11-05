DROP INDEX IF EXISTS idx_sprint_issues_issue_id;
DROP INDEX IF EXISTS idx_sprint_alerts_created_at;
DROP INDEX IF EXISTS idx_sprint_alerts_sprint_id;
DROP INDEX IF EXISTS idx_sprints_created_at;
DROP INDEX IF EXISTS idx_sprints_status;
DROP INDEX IF EXISTS idx_sprints_project_id;
DROP INDEX IF EXISTS idx_sprints_single_active_per_project;

DROP TABLE IF EXISTS sprint_issues;
DROP TABLE IF EXISTS sprint_alerts;
DROP TABLE IF EXISTS sprints;
