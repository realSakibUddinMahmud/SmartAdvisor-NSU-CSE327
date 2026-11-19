-- PostgreSQL 16 DDL Schema: Core Student Advising Domain & Production Release Extensions
-- Tables: students, course_sections, staged_sections, exception_cases, bypass_rules,
--         audit_logs, admin_metrics, escalations, schedule_receipts,
--         users, revoked_tokens, waitlist_entries, notifications, enrollments, rds_fallback_prompts

-- ============================================================================
-- ACID Row-Level Locking Pattern for Zero-Overbooking Seat Reservations:
--
-- BEGIN;
-- SELECT * FROM course_sections WHERE id = ANY($1) ORDER BY id FOR UPDATE;
-- -- 1. Verify capacity constraint: (enrolled < capacity)
-- -- 2. Check student prerequisites, credit floor & timetable clashes
-- -- 3. Increment enrolled count atomically:
-- --    UPDATE course_sections SET enrolled = enrolled + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1;
-- -- 4. Record confirmed enrollment & receipt
-- COMMIT;
-- ============================================================================

-- Table: students (mirrors StudentProfile interface)
CREATE TABLE IF NOT EXISTS students (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    program VARCHAR(255) NOT NULL,
    standing VARCHAR(64) NOT NULL,
    credits_completed NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    credits_total NUMERIC(5, 2) NOT NULL DEFAULT 130.00,
    cgpa NUMERIC(3, 2) NOT NULL DEFAULT 0.00,
    cart_token VARCHAR(64) NOT NULL UNIQUE,
    cleared_courses JSONB NOT NULL DEFAULT '[]'::jsonb,
    advising_cleared_by VARCHAR(255) NOT NULL,
    slot_closes_at TIMESTAMPTZ NOT NULL,
    max_credits NUMERIC(4, 1) NOT NULL DEFAULT 15.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: course_sections (mirrors CourseSection interface)
CREATE TABLE IF NOT EXISTS course_sections (
    id VARCHAR(64) PRIMARY KEY,
    course_code VARCHAR(32) NOT NULL,
    course_title VARCHAR(255) NOT NULL,
    department VARCHAR(64) NOT NULL,
    credits NUMERIC(3, 1) NOT NULL DEFAULT 3.0,
    section_number VARCHAR(16) NOT NULL,
    faculty VARCHAR(255) NOT NULL,
    days VARCHAR(16) NOT NULL,
    time_slot VARCHAR(64) NOT NULL,
    room VARCHAR(64) NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 40 CHECK (capacity >= 0),
    enrolled INTEGER NOT NULL DEFAULT 0 CHECK (enrolled >= 0),
    waitlisted INTEGER NOT NULL DEFAULT 0 CHECK (waitlisted >= 0),
    min_credits_required INTEGER DEFAULT NULL,
    prerequisites JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_lab BOOLEAN NOT NULL DEFAULT FALSE,
    instructor_id VARCHAR(64) DEFAULT NULL,
    room_capacity INTEGER NOT NULL DEFAULT 55,
    exam_slot VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: staged_sections (mirrors StagedSection interface per student cart)
CREATE TABLE IF NOT EXISTS staged_sections (
    id BIGSERIAL PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    section_id VARCHAR(64) NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
    course_code VARCHAR(32) NOT NULL,
    added_at BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_student_section UNIQUE (student_id, section_id)
);

-- Indexes for high-concurrency lookups and advising slot filtering
CREATE INDEX IF NOT EXISTS idx_students_cart_token ON students(cart_token);
CREATE INDEX IF NOT EXISTS idx_course_sections_course_code ON course_sections(course_code);
CREATE INDEX IF NOT EXISTS idx_course_sections_department ON course_sections(department);
CREATE INDEX IF NOT EXISTS idx_staged_sections_student_id ON staged_sections(student_id);
CREATE INDEX IF NOT EXISTS idx_staged_sections_section_id ON staged_sections(section_id);

-- ============================================================================
-- Faculty and Admin Portals Domain
-- Tables: exception_cases, bypass_rules, audit_logs, admin_metrics, escalations, schedule_receipts
-- ============================================================================

-- Table: exception_cases (mirrors ExceptionCase interface)
CREATE TABLE IF NOT EXISTS exception_cases (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name VARCHAR(255) NOT NULL,
    program VARCHAR(255) NOT NULL,
    standing VARCHAR(64) NOT NULL,
    cgpa NUMERIC(3, 2) NOT NULL,
    credits_completed NUMERIC(5, 2) NOT NULL,
    course_code VARCHAR(32) NOT NULL,
    course_title VARCHAR(255) NOT NULL,
    section_number VARCHAR(16) NOT NULL,
    category VARCHAR(32) NOT NULL CHECK (category IN ('Prereqs', 'Capacity', 'Credit Standing')),
    submitted_at VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'flagged')),
    statement TEXT NOT NULL,
    audit_checks JSONB NOT NULL DEFAULT '[]'::jsonb,
    faculty_decision_by VARCHAR(255) DEFAULT NULL,
    faculty_decision_at VARCHAR(64) DEFAULT NULL,
    section_id VARCHAR(64) DEFAULT NULL,
    rule_code VARCHAR(32) DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: bypass_rules (mirrors BypassRule interface)
CREATE TABLE IF NOT EXISTS bypass_rules (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(32) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(32) NOT NULL CHECK (category IN ('Standing', 'Prerequisite', 'Exam Load', 'Capacity')),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_updated VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: audit_logs (mirrors AuditLogItem interface)
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    timestamp VARCHAR(64) NOT NULL,
    actor VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    details TEXT NOT NULL,
    badge_type VARCHAR(32) NOT NULL CHECK (badge_type IN ('emerald', 'amber', 'crimson', 'teal')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: admin_metrics (mirrors AdminMetrics interface)
CREATE TABLE IF NOT EXISTS admin_metrics (
    id BIGSERIAL PRIMARY KEY,
    requests_per_sec INTEGER NOT NULL DEFAULT 0,
    p95_latency_ms NUMERIC(7, 2) NOT NULL DEFAULT 0.00,
    sla_ceiling_ms NUMERIC(7, 2) NOT NULL DEFAULT 200.00,
    error_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.0000,
    pool_used INTEGER NOT NULL DEFAULT 0,
    pool_total INTEGER NOT NULL DEFAULT 200,
    api_nodes INTEGER NOT NULL DEFAULT 1,
    surge_spike_active BOOLEAN NOT NULL DEFAULT FALSE,
    last_scaling_event VARCHAR(255) DEFAULT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: escalations (mirrors EscalationItem interface)
CREATE TABLE IF NOT EXISTS escalations (
    id VARCHAR(64) PRIMARY KEY,
    course_code VARCHAR(32) NOT NULL,
    course_title VARCHAR(255) NOT NULL,
    enrolled INTEGER NOT NULL DEFAULT 0,
    total_capacity INTEGER NOT NULL DEFAULT 0,
    waitlisted INTEGER NOT NULL DEFAULT 0,
    deficit INTEGER NOT NULL DEFAULT 0,
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('SEV-1', 'SEV-2', 'SEV-3')),
    status VARCHAR(32) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Mitigated', 'Resolved')),
    demand_surge JSONB NOT NULL DEFAULT '[]'::jsonb,
    breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
    auto_generated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: schedule_receipts (mirrors ScheduleReceipt interface)
CREATE TABLE IF NOT EXISTS schedule_receipts (
    transaction_id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    cart_token VARCHAR(64) NOT NULL,
    timestamp VARCHAR(64) NOT NULL,
    total_credits NUMERIC(4, 1) NOT NULL,
    sections JSONB NOT NULL DEFAULT '[]'::jsonb,
    digital_signature VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'confirmed',
    source VARCHAR(32) NOT NULL DEFAULT 'api',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Idempotent ALTER TABLE Extensions for Existing Databases
-- ============================================================================

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS max_credits NUMERIC(4, 1) NOT NULL DEFAULT 15.0;

ALTER TABLE course_sections
    ADD COLUMN IF NOT EXISTS instructor_id VARCHAR(64) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS room_capacity INTEGER NOT NULL DEFAULT 55,
    ADD COLUMN IF NOT EXISTS exam_slot VARCHAR(64) DEFAULT NULL;

ALTER TABLE exception_cases
    ADD COLUMN IF NOT EXISTS section_id VARCHAR(64) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS rule_code VARCHAR(32) DEFAULT NULL;

ALTER TABLE escalations
    ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE schedule_receipts
    ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'confirmed',
    ADD COLUMN IF NOT EXISTS source VARCHAR(32) NOT NULL DEFAULT 'api';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_course_sections_enrolled_lte_capacity'
    ) THEN
        ALTER TABLE course_sections
            ADD CONSTRAINT chk_course_sections_enrolled_lte_capacity CHECK (enrolled <= capacity);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_course_sections_room_capacity_nonneg'
    ) THEN
        ALTER TABLE course_sections
            ADD CONSTRAINT chk_course_sections_room_capacity_nonneg CHECK (room_capacity >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_schedule_receipts_status'
    ) THEN
        ALTER TABLE schedule_receipts
            ADD CONSTRAINT chk_schedule_receipts_status CHECK (status IN ('confirmed', 'pending_rds', 'fallback_required', 'failed'));
    END IF;
END $$;

-- ============================================================================
-- Auth, RBAC, Waitlist, Notifications, Enrollments & RDS Fallback Tables
-- ============================================================================

-- Table: users (auth credentials + RBAC)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(16) NOT NULL CHECK (role IN ('student', 'faculty', 'admin')),
    password_hash TEXT NOT NULL,
    instructor_name VARCHAR(255) DEFAULT NULL,
    department VARCHAR(128) DEFAULT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: revoked_tokens (JWT logout/invalidation blocklist)
CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: waitlist_entries
CREATE TABLE IF NOT EXISTS waitlist_entries (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    section_id VARCHAR(64) NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
    course_code VARCHAR(32) NOT NULL,
    position INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified', 'promoted', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_waitlist_student_section UNIQUE (student_id, section_id)
);

-- Table: notifications (SeatTracker Observer delivery log)
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL,
    section_id VARCHAR(64) DEFAULT NULL,
    course_code VARCHAR(32) DEFAULT NULL,
    channel VARCHAR(16) NOT NULL CHECK (channel IN ('SMS', 'PUSH', 'IN_APP')),
    event_type VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'queued', 'failed')),
    error TEXT DEFAULT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: enrollments (confirmed student enrollments)
CREATE TABLE IF NOT EXISTS enrollments (
    id BIGSERIAL PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    section_id VARCHAR(64) NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
    transaction_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_enrollment_student_section UNIQUE (student_id, section_id)
);

-- Table: rds_fallback_prompts (1-click DAG fallback state)
CREATE TABLE IF NOT EXISTS rds_fallback_prompts (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    failed_section_id VARCHAR(64) NOT NULL,
    failed_course_code VARCHAR(32) NOT NULL,
    reason TEXT NOT NULL,
    alternatives JSONB NOT NULL DEFAULT '[]'::jsonb,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_section_id VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Faculty, Admin, Auth & Sync portals
CREATE INDEX IF NOT EXISTS idx_course_sections_instructor_id ON course_sections(instructor_id);
CREATE INDEX IF NOT EXISTS idx_exception_cases_student_id ON exception_cases(student_id);
CREATE INDEX IF NOT EXISTS idx_exception_cases_status ON exception_cases(status);
CREATE INDEX IF NOT EXISTS idx_bypass_rules_code ON bypass_rules(code);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_escalations_course_code ON escalations(course_code);
CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status);
CREATE INDEX IF NOT EXISTS idx_schedule_receipts_student_id ON schedule_receipts(student_id);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at ON revoked_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_section_id ON waitlist_entries(section_id);
CREATE INDEX IF NOT EXISTS idx_notifications_student_id ON notifications(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rds_fallback_student ON rds_fallback_prompts(student_id, resolved);
