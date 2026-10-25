export interface User {
  id: number; username: string; fullName: string; role: string; roleLabel: string;
  facultyId: number | null; facultyName: string | null; mustChangePassword: boolean;
}
export interface Group { id: number; faculty_id: number; name: string; course: number; students?: number; faculty_name?: string; }
export interface ReportType { id: number; code: string; name: string; }
export interface Reason { id: number; code: string; name: string; requires_document: number; requires_comment: number; }
export interface Meta { reportTypes: ReportType[]; reasons: Reason[]; faculties: { id: number; name: string }[]; groups: Group[]; }
export interface ReportRow {
  id: number; report_date: string; status: string; version: number; type_name: string; type_code: string;
  group_name: string; faculty_name: string; created_by_name: string; absent_count: number; total_count: number;
}
export interface ReportItem {
  id: number; student_id: number; status: 'present' | 'absent' | 'late'; absence_reason_id: number | null;
  comment: string | null; document_provided: number; last_name: string; first_name: string;
  patronymic: string | null; student_no: string; is_group_leader: number; reason_name?: string | null;
}
export interface Student {
  id: number; student_no: string; last_name: string; first_name: string; patronymic: string | null;
  is_group_leader: number; status: string; group_name: string; group_id: number; faculty_name: string;
}
export interface ChangeRequest {
  id: number; status: string; approver_role: string; created_at: string; report_id: number; report_date: string;
  report_status: string; group_name: string; requested_by_name: string; changes_count: number;
}
