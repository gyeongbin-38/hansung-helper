// Schema is owned by drizzle/0000_academic_accounts.sql. No runtime DDL.
// No school passwords, upstream cookies, or full student identifiers are stored.
export interface AcademicAccount {
  id: string;
  student_mask: string;
  profile: string;
  snapshot: string;
  onboarded: number;
  created_at: number;
  consent_at: number;
}
export interface AcademicSession {
  token_hash: string;
  account_id: string;
  expires_at: number;
}
