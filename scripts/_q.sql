SELECT
  student_mask,
  json_extract(snapshot, '$.lms') AS lms,
  json_extract(snapshot, '$.checkedAt') AS chk,
  json_extract(snapshot, '$.lmsData.fetchedAt') AS lms_at
FROM academic_accounts;
