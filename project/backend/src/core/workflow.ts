/**
 * Report lifecycle + change-request approval rules (mirrors section 4.2 of the spec).
 * Pure functions only -> unit-testable without a database.
 */
export const REPORT_STATUS = {
  DRAFT: 'draft',
  TO_DEAN: 'submitted_to_dean',
  TO_RECTORATE: 'submitted_to_rectorate',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type ReportStatus = (typeof REPORT_STATUS)[keyof typeof REPORT_STATUS];

export type ReportAction = 'submit' | 'dean_approve' | 'dean_reject' | 'rectorate_approve' | 'rectorate_reject' | 'reopen';

const TRANSITIONS: Record<ReportStatus, Partial<Record<ReportAction, ReportStatus>>> = {
  draft: { submit: REPORT_STATUS.TO_DEAN },
  submitted_to_dean: {
    dean_approve: REPORT_STATUS.TO_RECTORATE,
    dean_reject: REPORT_STATUS.REJECTED,
  },
  submitted_to_rectorate: {
    rectorate_approve: REPORT_STATUS.APPROVED,
    rectorate_reject: REPORT_STATUS.REJECTED,
  },
  approved: {},
  rejected: {},
};

/** Role allowed to push a given action out of the current status. */
const ACTION_ROLES: Record<ReportAction, string[]> = {
  submit: ['vice_dean', 'dean'],
  dean_approve: ['dean'],
  dean_reject: ['dean'],
  rectorate_approve: ['rector', 'prorector', 'rectorate_staff'],
  rectorate_reject: ['rector', 'prorector', 'rectorate_staff'],
  reopen: ['rector', 'rectorate_staff'],
};

export function nextStatus(status: ReportStatus, action: ReportAction): ReportStatus | null {
  return TRANSITIONS[status]?.[action] ?? null;
}

export function canPerform(status: ReportStatus, action: ReportAction, role: string): boolean {
  if (!ACTION_ROLES[action]?.includes(role)) return false;
  return nextStatus(status, action) !== null;
}

/**
 * Spec 4.2: the approver is whoever owns the CURRENT workflow stage - not whoever
 * requested the change. A draft needs no request at all.
 */
export function changeApproverRole(status: ReportStatus): string | null {
  switch (status) {
    case REPORT_STATUS.TO_DEAN:
      return 'dean';
    case REPORT_STATUS.TO_RECTORATE:
    case REPORT_STATUS.APPROVED:
      return 'rectorate';
    default:
      return null;
  }
}

export function canDecideChangeRequest(status: ReportStatus, role: string): boolean {
  const approver = changeApproverRole(status);
  if (approver === 'dean') return role === 'dean';
  if (approver === 'rectorate') return ['rector', 'prorector', 'rectorate_staff'].includes(role);
  return false;
}

/** Approved reports are immutable; every further edit needs a new request. */
export function isImmutable(status: ReportStatus): boolean {
  return status === REPORT_STATUS.APPROVED;
}

export function needsRequestInsteadOfEdit(status: ReportStatus): boolean {
  return status === REPORT_STATUS.TO_DEAN || status === REPORT_STATUS.TO_RECTORATE || status === REPORT_STATUS.APPROVED;
}
