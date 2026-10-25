export const ROLES = {
  RECTOR: 'rector',
  PRORECTOR: 'prorector',
  RECTORATE_STAFF: 'rectorate_staff',
  DEAN: 'dean',
  VICE_DEAN: 'vice_dean',
  TEACHER: 'teacher',
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<string, string> = {
  rector: 'Rektor',
  prorector: 'Prorektor',
  rectorate_staff: 'Rektorat işgäri',
  dean: 'Dekan',
  vice_dean: 'Orunbasar dekan',
  teacher: 'Mugallym',
};

/** Server-side permission matrix. Every route asks for a permission, never for a role string. */
export const PERMISSIONS = {
  USER_MANAGE: ['rector', 'rectorate_staff'],
  FACULTY_MANAGE: ['rector', 'rectorate_staff'],
  GROUP_MANAGE: ['rector', 'rectorate_staff', 'dean', 'vice_dean'],
  STUDENT_READ: ['rector', 'prorector', 'rectorate_staff', 'dean', 'vice_dean', 'teacher'],
  STUDENT_WRITE: ['rector', 'rectorate_staff', 'dean', 'vice_dean'],
  PII_READ: ['rector', 'rectorate_staff', 'dean'],
  PII_WRITE: ['rector', 'rectorate_staff', 'dean'],
  REPORT_CREATE: ['vice_dean', 'dean'],
  REPORT_EDIT_OWN: ['vice_dean', 'dean'],
  REPORT_READ: ['rector', 'prorector', 'rectorate_staff', 'dean', 'vice_dean', 'teacher'],
  REPORT_APPROVE_DEAN: ['dean'],
  REPORT_APPROVE_RECTORATE: ['rector', 'prorector', 'rectorate_staff'],
  CHANGE_REQUEST_CREATE: ['vice_dean', 'dean'],
  CHANGE_REQUEST_READ: ['rector', 'prorector', 'rectorate_staff', 'dean', 'vice_dean'],
  CHANGE_REQUEST_DECIDE_DEAN: ['dean'],
  CHANGE_REQUEST_DECIDE_RECTORATE: ['rector', 'prorector', 'rectorate_staff'],
  DICTIONARY_MANAGE: ['rector', 'rectorate_staff'],
  AUDIT_READ: ['rector', 'prorector', 'rectorate_staff'],
  DASHBOARD_READ: ['rector', 'prorector', 'rectorate_staff', 'dean', 'vice_dean'],
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export function can(role: string | null | undefined, permission: PermissionKey): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}

export const RECTORATE_ROLES: string[] = ['rector', 'prorector', 'rectorate_staff'];
export const isRectorate = (role: string) => RECTORATE_ROLES.includes(role);
