/**
 * Course titles ship with their own code baked in ("GWL3O: Course Study Guide"),
 * so any surface that also renders the code badge shows it twice. Drops a leading
 * "<id>:" / "<id> -" style prefix; anything else is returned untouched.
 */
export function stripCourseCodePrefix(title: string, courseId: string): string {
  const trimmed = title.trim();
  if (!trimmed) return trimmed;

  // Course ids may carry regex metacharacters (they allow `.` `_` `-`).
  const id = courseId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripped = trimmed.replace(new RegExp(`^${id}\\s*[-–—:]?\\s*`, 'i'), '').trim();

  // Never leave a card heading blank.
  return stripped || trimmed;
}
