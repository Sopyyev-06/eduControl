CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(120) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS roles (
  id TINYINT UNSIGNED PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS faculties (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(60) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  role_id TINYINT UNSIGNED NOT NULL,
  faculty_id INT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 1,
  failed_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_users_faculty FOREIGN KEY (faculty_id) REFERENCES faculties(id),
  INDEX idx_users_role (role_id),
  INDEX idx_users_faculty (faculty_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  family_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  replaced_by_hash CHAR(64) NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_rt_user (user_id),
  INDEX idx_rt_family (family_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS study_groups (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  faculty_id INT UNSIGNED NOT NULL,
  name VARCHAR(60) NOT NULL,
  course TINYINT UNSIGNED NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_group_faculty FOREIGN KEY (faculty_id) REFERENCES faculties(id),
  UNIQUE KEY uq_group_name (faculty_id, name),
  INDEX idx_group_faculty (faculty_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS students (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_no VARCHAR(30) NOT NULL UNIQUE,
  group_id INT UNSIGNED NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  first_name VARCHAR(80) NOT NULL,
  patronymic VARCHAR(80) NULL,
  is_group_leader TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('active','academic_leave','expelled','graduated') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_group FOREIGN KEY (group_id) REFERENCES study_groups(id),
  INDEX idx_student_group (group_id),
  INDEX idx_student_name (last_name, first_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS student_personal_data (
  student_id INT UNSIGNED PRIMARY KEY,
  birth_date VARBINARY(255) NULL,
  gender VARBINARY(255) NULL,
  phone VARBINARY(255) NULL,
  parent_name VARBINARY(255) NULL,
  parent_phone VARBINARY(255) NULL,
  address VARBINARY(512) NULL,
  passport_no VARBINARY(255) NULL,
  pinfl VARBINARY(255) NULL,
  photo VARBINARY(1024) NULL,
  key_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  updated_by INT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_spd_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS report_types (
  id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS absence_reasons (
  id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  requires_document TINYINT(1) NOT NULL DEFAULT 0,
  requires_comment TINYINT(1) NOT NULL DEFAULT 0,
  sort_order SMALLINT NOT NULL DEFAULT 100,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_type_id TINYINT UNSIGNED NOT NULL,
  faculty_id INT UNSIGNED NOT NULL,
  group_id INT UNSIGNED NOT NULL,
  report_date DATE NOT NULL,
  status ENUM('draft','submitted_to_dean','submitted_to_rectorate','approved','rejected') NOT NULL DEFAULT 'draft',
  version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  created_by INT UNSIGNED NOT NULL,
  submitted_at DATETIME NULL,
  approved_at DATETIME NULL,
  approved_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_report_type FOREIGN KEY (report_type_id) REFERENCES report_types(id),
  CONSTRAINT fk_report_faculty FOREIGN KEY (faculty_id) REFERENCES faculties(id),
  CONSTRAINT fk_report_group FOREIGN KEY (group_id) REFERENCES study_groups(id),
  CONSTRAINT fk_report_creator FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE KEY uq_report (report_type_id, group_id, report_date),
  INDEX idx_report_status (status),
  INDEX idx_report_faculty (faculty_id, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS report_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  status ENUM('present','absent','late') NOT NULL DEFAULT 'present',
  absence_reason_id TINYINT UNSIGNED NULL,
  comment VARCHAR(500) NULL,
  document_provided TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_item_report FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_item_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_item_reason FOREIGN KEY (absence_reason_id) REFERENCES absence_reasons(id),
  UNIQUE KEY uq_item (report_id, student_id),
  INDEX idx_item_student (student_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS report_transitions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_id INT UNSIGNED NOT NULL,
  from_status VARCHAR(40) NOT NULL,
  to_status VARCHAR(40) NOT NULL,
  actor_id INT UNSIGNED NOT NULL,
  comment VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tr_report FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  INDEX idx_tr_report (report_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS change_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_id INT UNSIGNED NOT NULL,
  requested_by INT UNSIGNED NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  approver_role VARCHAR(40) NOT NULL,
  decided_by INT UNSIGNED NULL,
  decided_at DATETIME NULL,
  decision_comment VARCHAR(500) NULL,
  reminder_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_reminder_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cr_report FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_cr_user FOREIGN KEY (requested_by) REFERENCES users(id),
  INDEX idx_cr_status (status),
  INDEX idx_cr_report (report_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS change_request_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  change_request_id BIGINT UNSIGNED NOT NULL,
  report_item_id BIGINT UNSIGNED NOT NULL,
  field VARCHAR(40) NOT NULL,
  old_value VARCHAR(500) NULL,
  new_value VARCHAR(500) NULL,
  CONSTRAINT fk_cri_cr FOREIGN KEY (change_request_id) REFERENCES change_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_cri_item FOREIGN KEY (report_item_id) REFERENCES report_items(id) ON DELETE CASCADE,
  INDEX idx_cri_cr (change_request_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id INT UNSIGNED NULL,
  actor_role VARCHAR(40) NULL,
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(40) NOT NULL,
  entity_id VARCHAR(40) NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  meta JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_actor (actor_id, created_at),
  INDEX idx_audit_entity (entity, entity_id),
  INDEX idx_audit_action (action, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(500) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user (user_id, is_read)
) ENGINE=InnoDB;
