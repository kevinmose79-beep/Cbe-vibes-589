import { Teacher, ClassStream, TeacherAllocation } from '../types';

/**
 * Resolves the Class Teacher assigned to a specific ClassStream / Stream.
 * Priority:
 * 1. Direct match on classStream.class_teacher_id in teachers array.
 * 2. Teacher with class_teacher_of_id matching classStream.stream_id or classStream.id.
 * 3. Teacher with is_class_teacher === true and allocations matching classStream.
 */
export function resolveClassTeacher(
  teachers: Teacher[] | undefined,
  classStream: ClassStream | undefined
): Teacher | undefined {
  if (!teachers || teachers.length === 0 || !classStream) return undefined;

  // 1. Direct class_teacher_id lookup
  if (classStream.class_teacher_id) {
    const directMatch = teachers.find((t) => t.id === classStream.class_teacher_id);
    if (directMatch) return directMatch;
  }

  // 2. Lookup by teacher.class_teacher_of_id
  const streamId = classStream.stream_id || classStream.id;
  const classId = classStream.id;

  const classTeacherOfMatch = teachers.find(
    (t) =>
      (streamId && t.class_teacher_of_id === streamId) ||
      (classId && t.class_teacher_of_id === classId)
  );
  if (classTeacherOfMatch) return classTeacherOfMatch;

  // 3. Lookup by is_class_teacher + allocation
  const allocatedMatch = teachers.find(
    (t) =>
      t.is_class_teacher &&
      (t.allocations || []).some(
        (a) =>
          (streamId && a.stream_id === streamId) ||
          (classId && a.class_id === classId)
      )
  );
  if (allocatedMatch) return allocatedMatch;

  return undefined;
}

interface CandidateMatch {
  teacher: Teacher;
  allocation: TeacherAllocation;
  timestamp: number | null;
}

function parseAllocationTimestamp(alloc: any): number | null {
  if (!alloc) return null;
  const raw = alloc.created_at || alloc.assigned_at || alloc.updated_at;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return isNaN(parsed) ? null : parsed;
}

function resolveCandidates(
  candidates: CandidateMatch[],
  subjectId: string,
  contextLabel: string
): Teacher | undefined {
  if (candidates.length === 0) return undefined;

  // If all matching allocations belong to the same teacher, return that teacher
  const firstTeacherId = candidates[0].teacher.id;
  if (candidates.every((c) => c.teacher.id === firstTeacherId)) {
    return candidates[0].teacher;
  }

  // Multiple distinct teachers allocated to the exact same scope:
  // Must select the one with the latest assignment timestamp chronologically
  const hasAllTimestamps = candidates.every((c) => c.timestamp !== null);
  if (hasAllTimestamps) {
    // Sort descending by timestamp: newest assignment first
    candidates.sort((a, b) => (b.timestamp as number) - (a.timestamp as number));

    // If strictly latest timestamp exists:
    if ((candidates[0].timestamp as number) > (candidates[1].timestamp as number)) {
      return candidates[0].teacher;
    }

    // Timestamps are tied
    console.warn(
      `[TeacherResolution] Conflicting active allocations for subject ${subjectId} in ${contextLabel} have identical assignment timestamps. Cannot establish precedence:`,
      candidates.map((c) => ({
        teacher: c.teacher.teacher_name,
        allocationId: c.allocation.id,
        timestamp: c.timestamp,
      }))
    );
    return undefined;
  }

  // Authoritative timestamps are missing or invalid: do not guess
  console.warn(
    `[TeacherResolution] Conflicting active allocations for subject ${subjectId} in ${contextLabel} lack authoritative assignment timestamps. Cannot determine latest assignment without guessing:`,
    candidates.map((c) => ({
      teacher: c.teacher.teacher_name,
      allocationId: c.allocation.id,
      rawCreated: (c.allocation as any).created_at,
    }))
  );
  return undefined;
}

/**
 * Resolves the authoritative teacher assigned to teach a specific Learning Area / Subject
 * for a learner in a specific class and stream.
 *
 * Implements strict stream-aware resolution:
 * 1. If an exact stream-specific allocation exists:
 *    allocation.subject_id === subjectId && allocation.stream_id === streamId (and matching class_id if provided)
 *    - If multiple distinct teachers are allocated, the one with the latest assignment timestamp is selected.
 *    - If timestamps are missing or tied, returns undefined without guessing.
 * 2. If there is NO stream-specific allocation and there is a legitimate class-wide allocation:
 *    allocation.subject_id === subjectId && allocation.class_id === classId && (!allocation.stream_id || allocation.stream_id.trim() === '')
 *    - If multiple distinct teachers are allocated, the one with the latest assignment timestamp is selected.
 * 3. Otherwise:
 *    return undefined.
 *
 * CRITICAL INVARIANT: Sibling stream allocations (where allocation.stream_id !== streamId)
 * or same-named streams in different classes MUST NEVER satisfy the lookup. Never substitute a teacher from a sibling stream.
 */
export function resolveSubjectTeacher(
  teachers: Teacher[] | undefined,
  subjectId: string | undefined,
  classId?: string | undefined,
  streamId?: string | undefined
): Teacher | undefined {
  if (!teachers || teachers.length === 0 || !subjectId) return undefined;

  const cleanSubjectId = subjectId.trim();
  const cleanStreamId = streamId?.trim();
  const cleanClassId = classId?.trim();

  // 1. Exact stream match (highest priority)
  if (cleanStreamId) {
    const streamCandidates: CandidateMatch[] = [];

    teachers.forEach((t) => {
      (t.allocations || []).forEach((a) => {
        if (
          a &&
          a.subject_id === cleanSubjectId &&
          Boolean(a.stream_id && a.stream_id.trim() === cleanStreamId) &&
          (!cleanClassId || !a.class_id || a.class_id.trim() === cleanClassId)
        ) {
          streamCandidates.push({
            teacher: t,
            allocation: a,
            timestamp: parseAllocationTimestamp(a),
          });
        }
      });
    });

    const streamResolved = resolveCandidates(
      streamCandidates,
      cleanSubjectId,
      `stream ${cleanStreamId}`
    );
    if (streamResolved) return streamResolved;
  }

  // 2. Legitimate class-wide allocation ONLY where stream_id is null/undefined/empty
  if (cleanClassId) {
    const classCandidates: CandidateMatch[] = [];

    teachers.forEach((t) => {
      (t.allocations || []).forEach((a) => {
        if (
          a &&
          a.subject_id === cleanSubjectId &&
          Boolean(a.class_id && a.class_id.trim() === cleanClassId) &&
          (!a.stream_id || a.stream_id.trim() === '')
        ) {
          classCandidates.push({
            teacher: t,
            allocation: a,
            timestamp: parseAllocationTimestamp(a),
          });
        }
      });
    });

    const classResolved = resolveCandidates(
      classCandidates,
      cleanSubjectId,
      `class ${cleanClassId}`
    );
    if (classResolved) return classResolved;
  }

  return undefined;
}
