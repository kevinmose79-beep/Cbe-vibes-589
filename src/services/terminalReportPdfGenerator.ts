/**
 * Authoritative Terminal Report PDF Generator
 *
 * Presentation Layer for the Terminal Learner Report Form.
 * Strictly adheres to the Black & White typeset specification:
 * - Pure Black and White (No colors, no greys, no badges, no colored headers)
 * - Typography: Bold Black and Regular Black only
 * - School Name sourced dynamically from Settings (Never hard-coded)
 * - Header: School Name, TERMINAL LEARNER REPORT FORM, TERM • YEAR
 * - Learner Information table (Learner, Adm No, Class, Stream, Stream Rank, Overall Rank)
 * - Main Learning Area Performance table:
 *     # | Learning Area | [Dynamic Assessment Columns] | Terminal Score | Level | Points | Rank | Comment | Instructor
 * - Dynamic assessment columns from contributing assessments (No fixed EXAM 1 / EXAM 2)
 * - Full learning-area names without truncation
 * - Consumes authoritative results-engine data without independent recalculation
 * - Summary: Terminal Total & Mean Score in a single horizontal box
 * - Class Teacher's Remarks (with writing lines and Class Teacher line)
 * - Head Teacher's Remarks (with writing lines and Head Teacher line)
 * - Compact Legend: 8-level points mapping
 * - Footer: Next Term Opens line only (No system notes or watermarks)
 * - Compact single-page A4 Portrait layout
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ensureSafeJsPdf } from '../utils/pdfSafeUtils';
import { Student, School, ClassStream, Subject, Grade, Teacher, normalizeGradeName } from '../types';
import {
  ContributingAssessmentRef,
  LearningAreaTerminalResult,
  getUpperPrimaryCanonicalSubjects,
  resolveUpperPrimaryTerminalSubjects,
} from './terminalResultsEngine';
import {
  TerminalLearnerRanking,
  AssessmentRankingSummary,
  calculateSingleLearnerAssessmentRankings,
  isJuniorSchoolEducationLevel,
} from './terminalRankingEngine';
export type { AssessmentRankingSummary };
import { getStreamNameForLearner } from './terminalMeritListExporter';
import { savePdf } from '../utils/fileDownloader';
import { formatKenyaDate } from '../utils/kenyaDateUtils';
import { stripSurroundingQuotes } from '../utils/filterUtils';
import { resolveSubjectTeacher, resolveClassTeacher } from '../utils/teacherResolutionUtils';
import { isKiswahiliSubject, getKiswahiliDefaultComment } from '../utils/kiswahiliCommentValidator';
import { getConciseSubjectDefaultComment, shortenCustomComment } from './pdfReportGenerator';
import { generatePersonalizedLearnerComment } from './learnerCommentGenerator';
import { isUpperPrimaryContext } from '../utils/upperPrimaryReportUtils';
import { getGradeForMark } from './analysisEngine';
import { isGrade9Term3Report } from './nextTermOpeningDateResolver';

/**
 * Safely embeds an image into a jsPDF document with format detection (PNG, JPEG, WEBP).
 * Avoids silent rendering failures when image format differs from hardcoded string.
 */
export function drawPdfImage(
  doc: jsPDF,
  imageDataUrl: string,
  x: number,
  y: number,
  w: number,
  h: number,
  alias?: string
): boolean {
  if (!imageDataUrl || typeof imageDataUrl !== 'string' || !imageDataUrl.trim()) return false;

  const urlLower = imageDataUrl.toLowerCase();
  let primaryFormat: 'PNG' | 'JPEG' | 'WEBP' = 'PNG';
  if (urlLower.includes('data:image/jpeg') || urlLower.includes('data:image/jpg') || urlLower.endsWith('.jpg') || urlLower.endsWith('.jpeg')) {
    primaryFormat = 'JPEG';
  } else if (urlLower.includes('data:image/webp') || urlLower.endsWith('.webp')) {
    primaryFormat = 'WEBP';
  }

  const formatsToTry: Array<'PNG' | 'JPEG' | 'WEBP'> = [
    primaryFormat,
    primaryFormat === 'PNG' ? 'JPEG' : 'PNG',
    'WEBP',
  ];

  for (const fmt of formatsToTry) {
    try {
      if (alias) {
        doc.addImage(imageDataUrl, fmt, x, y, w, h, alias, 'FAST');
      } else {
        doc.addImage(imageDataUrl, fmt, x, y, w, h);
      }
      return true;
    } catch {
      // try next format
    }
  }

  try {
    if (alias) {
      (doc as any).addImage(imageDataUrl, x, y, w, h, alias, 'FAST');
    } else {
      (doc as any).addImage(imageDataUrl, x, y, w, h);
    }
    return true;
  } catch {
    return false;
  }
}

export interface TerminalReportPDFData {
  student: Student;
  school: School;
  classStream?: ClassStream;
  academicYear: string | number;
  term: string;
  isProvisionalMode?: boolean;
  contributingAssessments: ContributingAssessmentRef[];
  subjects: Subject[];
  resultsBySubject: Map<string, LearningAreaTerminalResult>;
  grades?: Grade[];
  teachers?: Teacher[];
  classes?: ClassStream[];
  nextTermOpeningDate?: string;
  customSubjectComments?: Record<string, string>;
  savedRemarks?: {
    class_teacher_comment?: string;
    class_teacher_name?: string;
    headteacher_comment?: string;
    headteacher_name?: string;
    hoi_name?: string;
    subject_comments?: Record<string, string>;
  };
  ranking?: TerminalLearnerRanking;
  assessmentRankings?: Record<string, AssessmentRankingSummary>;
  subjectRanks?: Record<string, string>;
  hideSubComponents?: boolean;
  streamSubjectAverages?: Record<string, number | null>;
}

export interface ResolvedTerminalReportRemarks {
  class_teacher_name: string;
  class_teacher_comment: string;
  headteacher_name: string;
  headteacher_comment: string;
}

/**
 * Authoritatively resolves Class Teacher & Head Teacher names and pedagogical remarks
 * with data-driven fallbacks when explicit savedRemarks entries are absent.
 */
export function resolveTerminalReportRemarks(
  data: Partial<TerminalReportPDFData>
): ResolvedTerminalReportRemarks {
  const {
    student,
    school,
    classStream,
    teachers = [],
    savedRemarks,
    subjects = [],
    resultsBySubject,
    ranking,
    grades = [],
    isProvisionalMode = false,
  } = data;

  // 1. CLASS TEACHER NAME RESOLUTION
  let classTeacherName = '';
  if (savedRemarks?.class_teacher_name && savedRemarks.class_teacher_name.trim()) {
    classTeacherName = savedRemarks.class_teacher_name.trim();
  } else {
    const matchedTeacher = resolveClassTeacher(teachers, classStream);
    if (matchedTeacher && matchedTeacher.teacher_name) {
      classTeacherName = matchedTeacher.teacher_name.trim();
    }
  }

  // 2. HEAD TEACHER NAME RESOLUTION
  let headteacherName = '';
  if (savedRemarks?.headteacher_name && savedRemarks.headteacher_name.trim()) {
    headteacherName = savedRemarks.headteacher_name.trim();
  } else if (savedRemarks?.hoi_name && savedRemarks.hoi_name.trim()) {
    headteacherName = savedRemarks.hoi_name.trim();
  } else if (school?.principal_name && school.principal_name.trim()) {
    headteacherName = school.principal_name.trim();
  }

  // 3 & 4. REMARKS RESOLUTION
  const explicitCtComment = savedRemarks?.class_teacher_comment
    ? stripSurroundingQuotes(savedRemarks.class_teacher_comment).trim()
    : '';
  const explicitHtComment = savedRemarks?.headteacher_comment
    ? stripSurroundingQuotes(savedRemarks.headteacher_comment).trim()
    : '';

  let ctComment = explicitCtComment;
  let htComment = explicitHtComment;

  // Check if learner has incomplete marks in contributing subjects or is unrankable
  const hasIncompleteMarks = resultsBySubject
    ? subjects.length === 0 ||
      subjects.some((s) => {
        const res = resultsBySubject.get(s.id);
        return (
          !res ||
          !res.isComplete ||
          res.status === 'INCOMPLETE (X)' ||
          res.status === 'INCOMPLETE (Y)' ||
          res.status === 'INCOMPLETE (X/Y)' ||
          res.terminalPercentage === null ||
          res.terminalPercentage === undefined
        );
      }) ||
      (ranking !== undefined && ranking.isRankable === false)
    : false;

  // Strictly do NOT generate automatic remarks if marks are incomplete.
  // Preserve explicit teacher-saved remarks if already present, but do not manufacture remarks.
  if (!hasIncompleteMarks && (!ctComment || !htComment) && student && subjects.length > 0) {
    const enrichedSubjects = subjects.map((s) => {
      const res = resultsBySubject?.get(s.id);
      return {
        ...s,
        percentage: res?.isComplete && typeof res.terminalPercentage === 'number' ? res.terminalPercentage : null,
        status: res?.status || 'Normal',
      };
    });

    let averageScore: number | undefined = undefined;
    if (ranking && typeof ranking.terminalTotalMarks === 'number' && subjects.length > 0) {
      averageScore = Math.round((ranking.terminalTotalMarks / subjects.length) * 10) / 10;
    } else if (resultsBySubject) {
      let sum = 0;
      let count = 0;
      subjects.forEach((s) => {
        const r = resultsBySubject.get(s.id);
        if (r?.isComplete && typeof r.terminalPercentage === 'number') {
          sum += r.terminalPercentage;
          count++;
        }
      });
      if (count > 0) {
        averageScore = Math.round((sum / count) * 10) / 10;
      }
    }

    if (!ctComment) {
      ctComment = generatePersonalizedLearnerComment({
        student,
        examId: '',
        marks: [],
        subjects: enrichedSubjects as any,
        grades,
        averageScore,
        commentType: 'class_teacher',
        isProvisional: isProvisionalMode,
      });
    }

    if (!htComment) {
      htComment = generatePersonalizedLearnerComment({
        student,
        examId: '',
        marks: [],
        subjects: enrichedSubjects as any,
        grades,
        averageScore,
        commentType: 'hoi',
        isProvisional: isProvisionalMode,
      });
    }
  }

  return {
    class_teacher_name: classTeacherName,
    class_teacher_comment: ctComment,
    headteacher_name: headteacherName,
    headteacher_comment: htComment,
  };
}

export const TERMINAL_PDF_COLORS = {
  BLACK: [0, 0, 0] as [number, number, number],
  WHITE: [255, 255, 255] as [number, number, number],
};

/**
 * Generates an authoritative default developmental comment for a learning area.
 * Strictly does NOT generate performance remarks for incomplete or unassessed marks.
 */
export function getDefaultSubjectComment(subject: Subject, result: LearningAreaTerminalResult | undefined): string {
  if (
    !result ||
    !result.isComplete ||
    result.status === 'INCOMPLETE (X)' ||
    result.status === 'INCOMPLETE (Y)' ||
    result.status === 'INCOMPLETE (X/Y)' ||
    result.terminalPercentage === null ||
    result.terminalPercentage === undefined ||
    isNaN(result.terminalPercentage)
  ) {
    return '—';
  }

  const isKis = isKiswahiliSubject(subject);
  const band = result.cbePerformanceLevel || '';

  if (band.startsWith('EE')) {
    if (isKis) return 'Umahiri wa hali ya juu katika stadi za somo.';
    return 'Exceeding expectations with outstanding mastery.';
  }
  if (band.startsWith('ME')) {
    if (isKis) return 'Kiwango cha kuridhisha katika umilisi na utendaji.';
    return 'Meeting expectations with solid grasp of skills.';
  }
  if (band.startsWith('AE')) {
    if (isKis) return 'Anakaribia kiwango kinachohitajika; anahitaji mazoezi.';
    return 'Approaching expectations. Commendable effort.';
  }
  if (band.startsWith('BE')) {
    if (isKis) return 'Chini ya kiwango; anahitaji mwongozo wa karibu.';
    return 'Below expectations. Requires targeted support.';
  }

  return 'Good progress shown throughout the term.';
}

/**
 * Resolves short, natural, flexible subject comments for Junior School Terminal Reports.
 * Reuses existing regular-report comment engines without altering underlying data:
 * 1. Preserves teacher-written custom comments, shortening only if excessively long for PDF display.
 * 2. For Kiswahili, uses authentic Kenyan CBE Kiswahili comment pools (no English remarks).
 * 3. For other learning areas, applies concise domain-tailored remarks (3-6 words) based on score.
 * 4. Strictly never generates a performance remark when result data is incomplete or unassessed.
 */
export function resolveJuniorSchoolSubjectComment(
  subject: Subject,
  result: LearningAreaTerminalResult | undefined,
  customComment?: string,
  student?: Student
): string {
  // 1. Teacher-written custom comment takes highest precedence
  if (customComment && typeof customComment === 'string' && customComment.trim()) {
    return shortenCustomComment(customComment.trim());
  }

  // 4 & 5. Strictly do NOT generate remarks for incomplete or unassessed marks
  if (
    !result ||
    !result.isComplete ||
    result.status === 'INCOMPLETE (X)' ||
    result.status === 'INCOMPLETE (Y)' ||
    result.status === 'INCOMPLETE (X/Y)' ||
    result.terminalPercentage === null ||
    result.terminalPercentage === undefined ||
    isNaN(result.terminalPercentage)
  ) {
    return '—';
  }

  const isKisw = isKiswahiliSubject(subject);

  // 2. Kiswahili learning area: authentic Kenya CBE Kiswahili remarks
  if (isKisw) {
    return getKiswahiliDefaultComment(
      result.terminalPercentage,
      'Normal',
      undefined,
      {
        subject,
        student,
        educationLevel: 'Junior School',
      }
    );
  }

  // 3. Other Junior School learning areas: concise domain-tailored remark (3-6 words)
  return getConciseSubjectDefaultComment(subject.subject_name, result.terminalPercentage);
}

/**
 * Formats assessment header for Junior School reports concisely to prevent mid-word wrapping.
 * - Where the assessment type is reliably identifiable, uses concise display labels:
 *   - "ASSESSMENT 1" / "CAT 1" -> "SBA 1"
 *   - "MID-TERM ASSESSMENT" -> "MID-TERM"
 *   - "END-OF-TERM ASSESSMENT" -> "END-TERM"
 *   - "OPENER ASSESSMENT" -> "OPENER"
 * - Preserves meaningful identity of custom/unknown assessments.
 */
export function formatJuniorSchoolAssessmentColumnHeader(rawName: string, index: number): string {
  if (!rawName || !rawName.trim()) {
    return `SBA ${index + 1}`;
  }

  // 1. Strip redundant Grade prefix (e.g. "Grade 9", "Grade 7:", "Grade 8 -")
  let name = rawName.replace(/^Grade\s*\d+\s*[-:]?\s*/i, '');

  // 2. Strip redundant Term / Year suffix (e.g. "Term 3 2026", "Term 1", "2026")
  name = name.replace(/\s*[-–—]?\s*Term\s*\d+\s*(20\d\d)?\s*$/i, '');
  name = name.replace(/\s*[-–—]?\s*20\d\d\s*$/i, '');
  name = name.trim();

  // 3. Reliable assessment type identification for concise Junior School display
  // A. SBA KNEC Junior / SBA KNEC variations
  if (/\bsba\b/i.test(name) && /\bknec\b/i.test(name)) {
    return 'SBA KNEC JUNIOR';
  }

  // B. End-of-Term Assessment (e.g. "END-OF-TERM 3", "END-TERM 3 EXAMS", "END OF TERM")
  const endTermMatch = rawName.match(/\bend(?:[-_\s]+(?:of[-_\s]+)?)?term\s*(\d+)?/i);
  if (endTermMatch) {
    const termNum = endTermMatch[1] || '';
    return termNum ? `END-TERM ${termNum} EXAM` : 'END-TERM EXAM';
  }
  if (/\bend[\s-_]*of?[\s-_]*term\b|\bendterm\b/i.test(name)) {
    return 'END-TERM EXAM';
  }

  // C. Mid-Term Assessment
  if (/\bmid[\s-]*term\b|\bmidterm\b/i.test(name)) {
    return 'MID-TERM EXAM';
  }

  // D. Opener Assessment
  if (/\bopener\b/i.test(name)) {
    return 'OPENER EXAM';
  }

  // E. SBA / CAT / Assessment with explicit number (e.g. "Assessment 1", "CAT 2", "SBA 3", "Continuous Assessment 1")
  const sbaNumMatch = name.match(/(?:\b(?:sba|cat|assessment|assmt|continuous\s*assessment)\b)\s*(\d+)/i);
  if (sbaNumMatch) {
    return `SBA ${sbaNumMatch[1]}`;
  }

  // F. Pure generic Assessment / CAT / SBA without number
  if (/^(?:sba|cat|assessment|assmt)$/i.test(name)) {
    return `SBA ${index + 1}`;
  }

  // G. Mock variations
  if (/\bpre[\s-]*mock\b/i.test(name)) {
    return 'PRE-MOCK';
  }
  if (/\bkjsea\b/i.test(name) && /\bmock\b/i.test(name)) {
    return 'KJSEA MOCK';
  }
  if (/\bmock\b/i.test(name)) {
    return 'MOCK';
  }

  // H. Custom / unknown names:
  let custom = name.replace(/\bCAT\s*(\d+)?\b/gi, (_, n) => (n ? `SBA ${n}` : 'SBA'));
  custom = custom.replace(/\s+(?:assessment|examination|exam)$/i, '').trim();
  if (!custom) {
    custom = name;
  }
  return custom.toUpperCase();
}

/**
 * Clean and format assessment header dynamically:
 * - Bans "CAT" terminology (converts to "Assessment")
 * - Strips redundant Grade prefix (e.g. "Grade 9") and Term/Year suffix (e.g. "Term 3 2026")
 *   since Grade, Term, and Year are already displayed in the main report headers
 * - Returns clean, readable title (e.g., "OPENER ASSESSMENT", "MID TERM ASSESSMENT", "ASSESSMENT 1")
 * - If isJuniorSchool is true, uses concise Junior School labels to avoid mid-word truncation
 */
export function formatAssessmentColumnHeader(rawName: string, index: number, isJuniorSchool: boolean = false): string {
  if (isJuniorSchool) {
    return formatJuniorSchoolAssessmentColumnHeader(rawName, index);
  }
  if (!rawName) return `ASSESSMENT ${index + 1}`;
  let name = rawName.replace(/\bCAT\s*(\d+)?\b/gi, (_, n) => (n ? `Assessment ${n}` : 'Assessment'));
  // Remove redundant Grade prefix
  name = name.replace(/^Grade\s*\d+\s*[-:]?\s*/i, '');
  // Remove redundant Term/Year suffix
  name = name.replace(/\s*[-–—]?\s*Term\s*\d+\s*(20\d\d)?\s*$/i, '');
  name = name.replace(/\s*[-–—]?\s*20\d\d\s*$/i, '');
  name = name.trim();
  return (name || `ASSESSMENT ${index + 1}`).toUpperCase();
}

/**
 * Wraps text strictly by whole words at whitespace boundaries, never breaking words mid-word.
 */
export function wrapHeaderTextAtWordBoundaries(text: string, maxLineLength: number = 12): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (!trimmed) return '';

  // Preserve explicit newlines if present
  if (trimmed.includes('\n')) {
    return trimmed
      .split('\n')
      .map((line) => wrapHeaderTextAtWordBoundaries(line, maxLineLength))
      .join('\n');
  }

  // Split into whitespace-separated words
  const words = trimmed.split(/\s+/);
  if (words.length <= 1) return words[0] || text;

  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const testLine = `${currentLine} ${word}`;

    if (testLine.length <= maxLineLength) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines.join('\n');
}

// In-memory cache for monochrome converted logos
const monoLogoCache = new Map<string, string>();

export interface OptimizedLogoResult {
  dataUrl: string;
  format: 'JPEG' | 'PNG';
  width: number;
  height: number;
  aspectRatio: number;
}

// In-memory cache for optimized color logos
const optimizedLogoCache = new Map<string, OptimizedLogoResult>();

/**
 * Shared image preprocessor for Junior School Terminal Reports.
 * - Loads the school logo once and caches the result.
 * - Scales down oversized images to maxDimension (default: 480px) preserving exact aspect ratio.
 * - Fills solid white background (#FFFFFF) to safely prevent transparent PNGs from generating black backgrounds in JPEG.
 * - Encodes as compact JPEG at quality 0.88 (~25-35 KB) with high visual sharpness.
 * - Robust error handling with safe timeout (3500ms) for Android WebView / network conditions.
 * - Graceful fallback ensuring PDF generation never fails.
 */
export async function getOptimizedTerminalLogo(
  imageUrl?: string | null,
  maxDimension: number = 480,
  quality: number = 0.88
): Promise<OptimizedLogoResult | null> {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) {
    return null;
  }
  const trimmed = imageUrl.trim();
  const cacheKey = `${trimmed}::${maxDimension}::${quality}`;
  const cached = optimizedLogoCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Fallback for SSR / Node test environments where DOM is absent
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof Image === 'undefined'
  ) {
    const isJpeg = trimmed.toLowerCase().includes('jpeg') || trimmed.toLowerCase().includes('jpg');
    const fallback: OptimizedLogoResult = {
      dataUrl: trimmed,
      format: isJpeg ? 'JPEG' : 'PNG',
      width: maxDimension,
      height: maxDimension,
      aspectRatio: 1,
    };
    optimizedLogoCache.set(cacheKey, fallback);
    return fallback;
  }

  return new Promise<OptimizedLogoResult | null>((resolve) => {
    try {
      const img = new Image();
      // Only set crossOrigin for remote http(s) URLs; do NOT set for data: URIs (avoids CORS/taint bugs in WebView)
      if (!trimmed.startsWith('data:')) {
        img.crossOrigin = 'Anonymous';
      }
      let settled = false;

      const finishWithFallback = () => {
        if (settled) return;
        settled = true;
        const isJpeg = trimmed.toLowerCase().includes('jpeg') || trimmed.toLowerCase().includes('jpg');
        const fallbackResult: OptimizedLogoResult = {
          dataUrl: trimmed,
          format: isJpeg ? 'JPEG' : 'PNG',
          width: maxDimension,
          height: maxDimension,
          aspectRatio: 1,
        };
        optimizedLogoCache.set(cacheKey, fallbackResult);
        resolve(fallbackResult);
      };

      img.onload = () => {
        if (settled) return;
        settled = true;
        try {
          const naturalW = img.naturalWidth || img.width || maxDimension;
          const naturalH = img.naturalHeight || img.height || maxDimension;
          const aspect = naturalH > 0 ? naturalW / naturalH : 1;

          let targetW = naturalW;
          let targetH = naturalH;

          // Scale down if either dimension exceeds maxDimension (preserving exact aspect ratio)
          if (targetW > maxDimension || targetH > maxDimension) {
            if (targetW >= targetH) {
              targetW = maxDimension;
              targetH = Math.max(1, Math.round(maxDimension / aspect));
            } else {
              targetH = maxDimension;
              targetW = Math.max(1, Math.round(maxDimension * aspect));
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            finishWithFallback();
            return;
          }

          // Pre-fill canvas with solid pure white (#FFFFFF).
          // This prevents transparent PNGs from producing black backgrounds when converted to JPEG.
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, targetW, targetH);

          // Export as JPEG with specified quality (delivering ~25-35 KB image size with pristine sharpness)
          const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);

          // Verification: ensure canvas export actually produced a valid JPEG data URL
          if (jpegDataUrl && jpegDataUrl.startsWith('data:image/jpeg')) {
            const result: OptimizedLogoResult = {
              dataUrl: jpegDataUrl,
              format: 'JPEG',
              width: targetW,
              height: targetH,
              aspectRatio: aspect,
            };
            optimizedLogoCache.set(cacheKey, result);
            resolve(result);
          } else {
            // Fallback to PNG if JPEG export isn't supported by browser/canvas
            const pngDataUrl = canvas.toDataURL('image/png');
            const result: OptimizedLogoResult = {
              dataUrl: pngDataUrl || trimmed,
              format: pngDataUrl ? 'PNG' : (trimmed.toLowerCase().includes('jpeg') ? 'JPEG' : 'PNG'),
              width: targetW,
              height: targetH,
              aspectRatio: aspect,
            };
            optimizedLogoCache.set(cacheKey, result);
            resolve(result);
          }
        } catch (err) {
          console.warn('Canvas image optimization failed, falling back:', err);
          finishWithFallback();
        }
      };

      img.onerror = () => {
        finishWithFallback();
      };

      // Safe timeout for slow network / Android WebView loading conditions
      setTimeout(() => {
        finishWithFallback();
      }, 3500);

      img.src = trimmed;
    } catch {
      const isJpeg = trimmed.toLowerCase().includes('jpeg') || trimmed.toLowerCase().includes('jpg');
      const fallbackResult: OptimizedLogoResult = {
        dataUrl: trimmed,
        format: isJpeg ? 'JPEG' : 'PNG',
        width: maxDimension,
        height: maxDimension,
        aspectRatio: 1,
      };
      optimizedLogoCache.set(cacheKey, fallbackResult);
      resolve(fallbackResult);
    }
  });
}

/**
 * Converts an image URL / base64 string to a monochrome (grayscale) Data URL
 * suitable for pure black and white PDF documents, downscaling to print-optimal dimensions (KB size).
 */
export async function convertImageToMonochromeDataUrl(imageUrl: string): Promise<string | null> {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) return null;
  const trimmed = imageUrl.trim();
  const cached = monoLogoCache.get(trimmed);
  if (cached) return cached;

  // If not running in a browser DOM environment with HTMLCanvasElement support, return original imageUrl
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof Image === 'undefined') {
    monoLogoCache.set(trimmed, trimmed);
    return trimmed;
  }
  return new Promise((resolve) => {
    try {
      const img = new Image();
      // Only set crossOrigin for remote http(s) URLs; do NOT set for data: URIs (prevents canvas tainting / CORS failures)
      if (!trimmed.startsWith('data:')) {
        img.crossOrigin = 'Anonymous';
      }
      let resolved = false;

      img.onload = () => {
        if (resolved) return;
        resolved = true;
        try {
          const MAX_DIM = 240; // 240px produces ultra-crisp >400 DPI for a 15mm PDF logo box
          let width = img.naturalWidth || img.width || 240;
          let height = img.naturalHeight || img.height || 240;

          if (width > MAX_DIM || height > MAX_DIM) {
            if (width >= height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            monoLogoCache.set(trimmed, trimmed);
            resolve(trimmed);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const imgData = ctx.getImageData(0, 0, width, height);
          const data = imgData.data;
          for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            data[i] = gray;     // R
            data[i + 1] = gray; // G
            data[i + 2] = gray; // B
          }
          ctx.putImageData(imgData, 0, 0);
          const result = canvas.toDataURL('image/png');
          monoLogoCache.set(trimmed, result);
          resolve(result);
        } catch (err) {
          console.warn('Monochrome conversion fallback:', err);
          monoLogoCache.set(trimmed, trimmed);
          resolve(trimmed);
        }
      };
      img.onerror = () => {
        if (resolved) return;
        resolved = true;
        monoLogoCache.set(trimmed, trimmed);
        resolve(trimmed);
      };

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          monoLogoCache.set(trimmed, trimmed);
          resolve(trimmed);
        }
      }, 500);

      img.src = trimmed;
    } catch {
      monoLogoCache.set(trimmed, trimmed);
      resolve(trimmed);
    }
  });
}

/**
 * Safely determines if the provided report context belongs strictly to Junior School (Grades 7, 8, 9).
 * Uses authoritative education-level and grade-validation logic.
 * Ensures:
 * - Upper Primary contexts are never routed to Junior School.
 * - Lower Primary and Pre-Primary contexts are never routed to Junior School.
 * - Only Junior School Grades 7, 8, and 9 route to buildJuniorSchoolTerminalReportDoc.
 */
export function isJuniorSchoolTerminalContext(
  data: Partial<TerminalReportPDFData>
): boolean {
  const { student, classStream, ranking } = data;

  // 1. Upper Primary contexts must never be routed to Junior School
  if (isUpperPrimaryContext(student, classStream)) {
    return false;
  }

  // 2. Explicit education level check: Lower Primary or Pre-Primary are not Junior School
  const rawLevel = (classStream?.education_level || student?.education_level || '').trim().toLowerCase();
  if (rawLevel === 'lower primary' || rawLevel === 'pre-primary') {
    return false;
  }

  // 3. Authoritative Class/Stream or Student education level check for Junior School
  if (isJuniorSchoolEducationLevel(undefined, classStream, student)) {
    return true;
  }

  // 4. Ranking explicit flag
  if (ranking?.isJuniorSchool === true) {
    return true;
  }

  // 5. Authoritative grade label check (strictly Grades 7, 8, and 9)
  const rawGrade = (student?.grade || classStream?.class_name || '').trim();
  if (rawGrade) {
    const norm = normalizeGradeName(rawGrade);
    if (norm === 'Grade 7' || norm === 'Grade 8' || norm === 'Grade 9') {
      return true;
    }
  }

  return false;
}

/**
 * Builds an A4 Portrait jsPDF document for a learner's Terminal Report.
 * Uses strictly black & white presentation with white backgrounds and black borders.
 * Dispatches to buildJuniorSchoolTerminalReportDoc for Junior School Grades 7, 8, and 9.
 */
export async function buildTerminalReportDoc(
  data: TerminalReportPDFData,
  existingDoc?: jsPDF
): Promise<jsPDF> {
  // Safe Dispatch: Junior School Grades 7, 8, and 9 route strictly to the Junior School builder
  if (isJuniorSchoolTerminalContext(data)) {
    return buildJuniorSchoolTerminalReportDoc(data, existingDoc);
  }

  const {
    student,
    school,
    classStream,
    academicYear,
    term,
    contributingAssessments = [],
    subjects = [],
    resultsBySubject,
    nextTermOpeningDate,
    savedRemarks,
    teachers = [],
    customSubjectComments,
    ranking,
    subjectRanks,
  } = data;

  const doc = ensureSafeJsPdf(existingDoc || new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true }));
  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 8;
  const contentWidth = pageWidth - marginX * 2;

  let currentY = 8;

  // -------------------------------------------------------------
  // 1. HEADER (SCHOOL LOGO, SCHOOL NAME, MOTTO, TITLE, TERM • YEAR) — ALL CENTERED
  // -------------------------------------------------------------
  // Sourced strictly from Settings / school object (Never hard-coded)
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setFillColor(255, 255, 255);

  if (school?.logo_url) {
    try {
      const monoLogo = await convertImageToMonochromeDataUrl(school.logo_url);
      if (monoLogo) {
        const logoSize = 15;
        const logoX = (pageWidth - logoSize) / 2;
        doc.addImage(monoLogo, 'PNG', logoX, currentY, logoSize, logoSize, 'terminal_school_logo', 'FAST');
        currentY += logoSize + 5.5;
      }
    } catch (e) {
      console.warn('Could not render logo in terminal report PDF:', e);
    }
  }

  const schoolName = (school?.school_name || '').trim().toUpperCase();
  const isUpperPrimary = isUpperPrimaryContext(student, classStream);

  if (schoolName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(schoolName, pageWidth / 2, currentY, { align: 'center' });
    currentY += 5.0;
  }

  const schoolMotto = stripSurroundingQuotes(school?.motto || '').trim();
  if (schoolMotto) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.text(schoolMotto, pageWidth / 2, currentY, { align: 'center' });
    currentY += 4.5;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(isUpperPrimary ? 'UPPER PRIMARY TERMINAL REPORT' : 'TERMINAL LEARNER REPORT FORM', pageWidth / 2, currentY, { align: 'center' });
  currentY += 4.8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(`${term.toUpperCase()} • ${academicYear}`, pageWidth / 2, currentY, { align: 'center' });
  currentY += 7.0;

  // -------------------------------------------------------------
  // 2. LEARNER INFORMATION
  // -------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text('LEARNER INFORMATION', marginX, currentY);
  currentY += 2.5;

  const learnerFullName = (
    student.full_name || `${student.first_name || ''} ${student.last_name || ''}`
  ).trim().toUpperCase() || 'LEARNER';

  const learnerStreamName = getStreamNameForLearner(student, data.classes || (classStream ? [classStream] : []));
  const baseClassName = classStream?.class_name || student.grade || (student as any).class_name || 'Class';
  const classNameStr = (classStream?.class_name || baseClassName).toUpperCase();
  const streamNameStr = (learnerStreamName && learnerStreamName !== '—'
    ? learnerStreamName
    : classStream?.stream || '—').toUpperCase();

  const streamRankStr = ranking && ranking.isRankable && ranking.streamPosition !== null
    ? `${ranking.streamPosition} / ${ranking.streamPositionDenominator}`
    : '____ / ____';

  const overallRankStr = ranking && ranking.isRankable && ranking.overallPosition !== null
    ? `${ranking.overallPosition} / ${ranking.overallPositionDenominator}`
    : '____ / ____';

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    head: [['LEARNER', 'ADM NO', 'CLASS', 'STREAM', 'STREAM RANK', 'OVERALL RANK']],
    body: [[
      learnerFullName,
      student.admission_number || 'N/A',
      classNameStr,
      streamNameStr,
      streamRankStr,
      overallRankStr,
    ]],
    theme: 'grid',
    styles: {
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      font: 'helvetica',
      fontSize: 7.2,
      cellPadding: 1.8,
      fillColor: [255, 255, 255],
      valign: 'middle',
    },
    headStyles: {
      fontStyle: 'bold',
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
      halign: 'left',
    },
    bodyStyles: {
      fontStyle: 'normal',
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 54 },
      1: { cellWidth: 26 },
      2: { cellWidth: 26 },
      3: { cellWidth: 26 },
      4: { cellWidth: 31, halign: 'center' },
      5: { cellWidth: 31, halign: 'center' },
    },
    tableWidth: contentWidth,
  });

  currentY = (doc as any).lastAutoTable.finalY + 5.0;

  // -------------------------------------------------------------
  // 3. LEARNING AREA PERFORMANCE (MAIN TABLE)
  // -------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text('LEARNING AREA PERFORMANCE', marginX, currentY);
  currentY += 2.5;

  // Build clean dynamic assessment headers (Bans "CAT" terminology, cleans redundant prefixes)
  const assessmentHeaders = contributingAssessments.map((a, idx) => {
    return formatAssessmentColumnHeader(a.exam_name, idx);
  });

  const numAssessments = contributingAssessments.length;

  const tableHead = [
    [
      '#',
      'LEARNING AREA',
      ...assessmentHeaders.map((h) => wrapHeaderTextAtWordBoundaries(h, numAssessments >= 3 ? 10 : 12)),
      'TERMINAL\nSCORE',
      'LEVEL',
      'POINTS',
      'RANK',
      'COMMENT',
      'INSTRUCTOR',
    ],
  ];

  // Dynamic geometry calculation across exact 194mm printable width
  // Ensures assessment columns are sufficiently wide and headers don't wrap excessively
  const hashWidth = numAssessments >= 5 ? 5.0 : 5.5;
  let learningAreaWidth: number;
  let assessmentColWidth: number;
  let terminalScoreWidth: number;
  let levelWidth: number;
  let pointsWidth: number;
  let rankWidth: number;
  let commentWidth: number;
  let instructorWidth: number;

  if (numAssessments === 2) {
    learningAreaWidth = 36.0;
    assessmentColWidth = 17.5;
    terminalScoreWidth = 17.0;
    levelWidth = 11.0;
    pointsWidth = 10.0;
    rankWidth = 11.0;
    commentWidth = 43.5;
    instructorWidth = 25.0;
  } else if (numAssessments === 1) {
    learningAreaWidth = 40.0;
    assessmentColWidth = 22.0;
    terminalScoreWidth = 18.0;
    levelWidth = 12.0;
    pointsWidth = 11.0;
    rankWidth = 12.0;
    commentWidth = 47.5;
    instructorWidth = 26.0;
  } else if (numAssessments === 3) {
    learningAreaWidth = 34.0;
    assessmentColWidth = 15.0;
    terminalScoreWidth = 16.0;
    levelWidth = 11.0;
    pointsWidth = 9.5;
    rankWidth = 10.5;
    commentWidth = 40.0;
    instructorWidth = 22.5;
  } else if (numAssessments === 4) {
    learningAreaWidth = 32.0;
    assessmentColWidth = 13.5;
    terminalScoreWidth = 15.0;
    levelWidth = 10.0;
    pointsWidth = 9.0;
    rankWidth = 10.0;
    commentWidth = 37.0;
    instructorWidth = 21.5;
  } else {
    // numAssessments >= 5 or 0
    learningAreaWidth = 30.0;
    terminalScoreWidth = 14.5;
    levelWidth = 9.5;
    pointsWidth = 8.5;
    rankWidth = 9.5;
    commentWidth = 34.5;
    instructorWidth = 20.5;
    const fixedTotal = hashWidth + learningAreaWidth + terminalScoreWidth + levelWidth + pointsWidth + rankWidth + commentWidth + instructorWidth;
    assessmentColWidth = (contentWidth - fixedTotal) / (numAssessments || 1);
  }

  const targetClassId = classStream?.id || student.class_id;
  const targetStreamId = classStream?.stream_id || (student as any).stream_id;
  const effectiveSubjects = isUpperPrimary
    ? resolveUpperPrimaryTerminalSubjects(subjects, contributingAssessments)
    : subjects;

  const tableBody: (string | { content: string; styles?: any })[][] = [];

  effectiveSubjects.forEach((subject, idx) => {
    const res = resultsBySubject.get(subject.id);
    const entryWithComponents = res?.assessmentTrail?.find(
      (t) => t.components && t.components.length > 0
    );
    const hasComponents = Boolean(
      isUpperPrimary &&
      !data.hideSubComponents &&
      entryWithComponents?.components &&
      entryWithComponents.components.length > 0
    );

    const teacherObj = resolveSubjectTeacher(teachers, subject.id, targetClassId, targetStreamId);
    const teacherName = teacherObj ? teacherObj.teacher_name : '';

    if (hasComponents && entryWithComponents?.components) {
      entryWithComponents.components.forEach((comp) => {
        const compExamMarks = contributingAssessments.map((a) => {
          const trail = res?.assessmentTrail?.find((t) => t.examId === a.id);
          const c = trail?.components?.find((tc) => tc.code === comp.code);
          if (!c) return '—';
          if (c.status === 'Normal' && c.rawScore !== null) {
            return `${c.rawScore}/${c.outOf}`;
          }
          return c.displayScore || '—';
        });

        tableBody.push([
          '—',
          `  ${comp.name} (${comp.outOf}%)`,
          ...compExamMarks,
          '—',
          '—',
          '—',
          '—',
          `Component contribution (${comp.outOf}%)`,
          teacherName,
        ]);
      });
    }

    // Dynamic assessment marks
    const examMarks = contributingAssessments.map((a) => {
      const trail = res?.assessmentTrail?.find((t) => t.examId === a.id);
      if (!trail) return 'X';
      if (trail.notApplicable || (trail as any).isApplicable === false) return '—';
      if (trail.status === 'X' || trail.status === 'Blank') return 'X';
      if (trail.status === 'Y') return 'Y';
      if (typeof trail.percentage === 'number') {
        return `${Math.round(trail.percentage)}`;
      }
      if (typeof trail.rawScore === 'number') {
        return String(trail.rawScore);
      }
      return 'X';
    });

    // Terminal Score
    let terminalScoreDisplay = '—';
    if (res) {
      if (res.isComplete && typeof res.terminalPercentage === 'number') {
        terminalScoreDisplay = String(res.terminalPercentage);
      } else if (res.status === 'INCOMPLETE (X)') {
        terminalScoreDisplay = 'X';
      } else if (res.status === 'INCOMPLETE (Y)') {
        terminalScoreDisplay = 'Y';
      } else if (res.status === 'INCOMPLETE (X/Y)') {
        terminalScoreDisplay = 'X/Y';
      }
    }

    // Level and Points
    const upGradeObj = isUpperPrimary && res?.isComplete && typeof res?.terminalPercentage === 'number'
      ? getGradeForMark(res.terminalPercentage, data.grades, 'Upper Primary', student.grade || classStream?.class_name)
      : null;

    const levelDisplay = res?.isComplete
      ? (isUpperPrimary
          ? (upGradeObj?.grade_code || upGradeObj?.performance_level || 'BE')
          : (res?.cbePerformanceLevel || '—'))
      : '—';

    const pointsDisplay = res?.isComplete
      ? (isUpperPrimary
          ? String(upGradeObj?.points ?? 1)
          : (typeof res?.points === 'number' ? String(res.points) : '—'))
      : '—';

    // Rank inside Learning Area Performance table
    const rankDisplay = subjectRanks?.[subject.id] || '—';

    // Comment
    const commentDisplay =
      customSubjectComments?.[subject.id] ||
      savedRemarks?.subject_comments?.[subject.id] ||
      getDefaultSubjectComment(subject, res);

    tableBody.push([
      String(idx + 1),
      hasComponents ? `${subject.subject_name} (TOTAL)` : subject.subject_name,
      ...examMarks,
      terminalScoreDisplay,
      levelDisplay,
      pointsDisplay,
      rankDisplay,
      commentDisplay,
      teacherName,
    ]);
  });

  const columnStylesObj: Record<number, any> = {
    0: { cellWidth: hashWidth, halign: 'center' },
    1: { cellWidth: learningAreaWidth, halign: 'left' },
  };

  for (let i = 0; i < numAssessments; i++) {
    columnStylesObj[2 + i] = { cellWidth: assessmentColWidth, halign: 'center' };
  }

  const termScoreIdx = 2 + numAssessments;
  const levelIdx = termScoreIdx + 1;
  const pointsIdx = levelIdx + 1;
  const rankIdx = pointsIdx + 1;
  const commentIdx = rankIdx + 1;
  const instructorIdx = commentIdx + 1;

  columnStylesObj[termScoreIdx] = { cellWidth: terminalScoreWidth, halign: 'center' };
  columnStylesObj[levelIdx] = { cellWidth: levelWidth, halign: 'center' };
  columnStylesObj[pointsIdx] = { cellWidth: pointsWidth, halign: 'center' };
  columnStylesObj[rankIdx] = { cellWidth: rankWidth, halign: 'center' };
  columnStylesObj[commentIdx] = { cellWidth: commentWidth, halign: 'left' };
  columnStylesObj[instructorIdx] = { cellWidth: instructorWidth, halign: 'left' };

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    styles: {
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.15,
      font: 'helvetica',
      fontSize: numAssessments >= 4 ? 6.0 : 6.5,
      cellPadding: { top: 1.5, bottom: 1.5, left: 1.0, right: 1.0 },
      fillColor: [255, 255, 255],
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fontStyle: 'bold',
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
      halign: 'center',
      valign: 'middle',
      fontSize: numAssessments >= 4 ? 5.8 : (numAssessments === 3 ? 6.0 : 6.3),
      cellPadding: { top: 1.8, bottom: 1.8, left: 0.6, right: 0.6 },
      lineWidth: 0.15,
      lineColor: [0, 0, 0],
    },
    bodyStyles: {
      fontStyle: 'normal',
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
    },
    columnStyles: columnStylesObj,
    tableWidth: 'auto',
  });

  currentY = (doc as any).lastAutoTable.finalY + 4.0;

  // -------------------------------------------------------------
  // 3B. ASSESSMENT PERFORMANCE SUMMARY
  // -------------------------------------------------------------
  const effectiveAssessmentRankings =
    data.assessmentRankings ||
    (contributingAssessments && contributingAssessments.length > 0
      ? calculateSingleLearnerAssessmentRankings({
          student,
          classStream,
          resultsBySubject,
          applicableSubjects: effectiveSubjects,
          contributingAssessments,
          isProvisionalMode: data.isProvisionalMode,
        })
      : undefined);

  if (contributingAssessments && contributingAssessments.length > 0 && effectiveAssessmentRankings) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text('ASSESSMENT PERFORMANCE SUMMARY', marginX, currentY);
    currentY += 2.5;

    const summaryHead = [['ASSESSMENT NAME', 'TOTAL MARKS', 'STREAM RANK', 'OVERALL GRADE RANK']];
    const summaryBody = contributingAssessments.map((a, idx) => {
      const name = formatAssessmentColumnHeader(a.exam_name, idx);
      const ranking = effectiveAssessmentRankings?.[a.id];

      let totalStr = '—';
      let streamRankStr = '—';
      let overallRankStr = '—';

      if (ranking) {
        const maxVal = ranking.maxMarks || (isUpperPrimary
          ? resolveUpperPrimaryTerminalSubjects(subjects, [a], { classObj: classStream }).length * 100
          : 100);
        if (ranking.totalMarks !== null && ranking.totalMarks !== undefined) {
          totalStr = `${ranking.totalMarks} / ${maxVal}`;
        }
        if (ranking.isComplete && ranking.streamPosition !== null && ranking.streamPosition !== undefined) {
          streamRankStr = ranking.streamDenominator
            ? `${ranking.streamPosition} / ${ranking.streamDenominator}`
            : `${ranking.streamPosition}`;
        } else if (!ranking.isComplete) {
          streamRankStr = 'Unranked';
        }

        if (ranking.isComplete && ranking.overallPosition !== null && ranking.overallPosition !== undefined) {
          overallRankStr = ranking.overallDenominator
            ? `${ranking.overallPosition} / ${ranking.overallDenominator}`
            : `${ranking.overallPosition}`;
        } else if (!ranking.isComplete) {
          overallRankStr = 'Unranked';
        }
      }

      return [name, totalStr, streamRankStr, overallRankStr];
    });

    autoTable(doc, {
      startY: currentY,
      margin: { left: marginX, right: marginX },
      head: summaryHead,
      body: summaryBody,
      theme: 'grid',
      styles: {
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.15,
        font: 'helvetica',
        fontSize: 6.5,
        cellPadding: { top: 1.5, bottom: 1.5, left: 1.5, right: 1.5 },
        fillColor: [255, 255, 255],
        valign: 'middle',
      },
      headStyles: {
        fontStyle: 'bold',
        textColor: [0, 0, 0],
        fillColor: [255, 255, 255],
        fontSize: 6.3,
        cellPadding: { top: 1.8, bottom: 1.8, left: 1.5, right: 1.5 },
        lineWidth: 0.15,
        lineColor: [0, 0, 0],
      },
      bodyStyles: {
        fontStyle: 'normal',
        textColor: [0, 0, 0],
        fillColor: [255, 255, 255],
        halign: 'left',
      },
      columnStyles: {
        0: { cellWidth: 70, halign: 'left' },
        1: { cellWidth: 40, halign: 'center' },
        2: { cellWidth: 42, halign: 'center' },
        3: { cellWidth: 42, halign: 'center' },
      },
      tableWidth: contentWidth,
    });

    currentY = (doc as any).lastAutoTable.finalY + 4.0;
  }

  // -------------------------------------------------------------
  // 4. SUMMARY (TERMINAL TOTAL & MEAN SCORE)
  // -------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text('SUMMARY', marginX, currentY);
  currentY += 2.5;

  const terminalTotalMarks = ranking?.terminalTotalMarks ?? (
    isUpperPrimary
      ? (() => {
          let sum = 0;
          for (const s of effectiveSubjects) {
            const r = resultsBySubject.get(s.id);
            if (!r || !r.isComplete || typeof r.terminalPercentage !== 'number') return null;
            sum += r.terminalPercentage;
          }
          return sum;
        })()
      : null
  );
  const terminalTotalMaximum = ranking?.terminalTotalMaximum || effectiveSubjects.length * 100;
  const isRankable = Boolean(
    (ranking?.isRankable || isUpperPrimary) &&
    terminalTotalMarks !== null &&
    terminalTotalMarks !== undefined
  );

  const terminalTotalStr = isRankable
    ? `${terminalTotalMarks} / ${terminalTotalMaximum}`
    : '__________ / __________';

  let meanScoreStr = '__________';
  if (isRankable && typeof terminalTotalMarks === 'number' && effectiveSubjects.length > 0) {
    const meanVal = Math.round((terminalTotalMarks / effectiveSubjects.length) * 10) / 10;
    meanScoreStr = `${meanVal}%`;
  }

  // Single horizontal summary box with 2 columns (Strictly pure white fill & thin black border)
  const summaryBoxHeight = 7.5;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(marginX, currentY, contentWidth, summaryBoxHeight, 'FD');
  doc.line(marginX + contentWidth / 2, currentY, marginX + contentWidth / 2, currentY + summaryBoxHeight);

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('TERMINAL TOTAL:', marginX + 3, currentY + 4.9);
  doc.setFont('helvetica', 'normal');
  doc.text(terminalTotalStr, marginX + 34, currentY + 4.9);

  doc.setFont('helvetica', 'bold');
  doc.text('MEAN SCORE:', marginX + contentWidth / 2 + 3, currentY + 4.9);
  doc.setFont('helvetica', 'normal');
  doc.text(meanScoreStr, marginX + contentWidth / 2 + 28, currentY + 4.9);

  currentY += summaryBoxHeight + 5.0;

  // Authoritative Remarks & Names Resolution
  const resolvedRemarks = resolveTerminalReportRemarks(data);

  // -------------------------------------------------------------
  // 5. CLASS TEACHER'S REMARKS
  // -------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text("CLASS TEACHER'S REMARKS", marginX, currentY);
  currentY += 2.5;

  const ctBoxHeight = 16.0;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(marginX, currentY, contentWidth, ctBoxHeight, 'FD');

  const ctComment = resolvedRemarks.class_teacher_comment;

  if (ctComment) {
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.0);
    doc.text(ctComment, marginX + 3, currentY + 4.8, { maxWidth: contentWidth - 6 });
  } else {
    // Two empty writing lines
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.15);
    doc.line(marginX + 3, currentY + 5.0, marginX + contentWidth - 3, currentY + 5.0);
    doc.line(marginX + 3, currentY + 9.5, marginX + contentWidth - 3, currentY + 9.5);
  }

  let resolvedClassTeacher = data.teachers && data.classStream ? resolveClassTeacher(data.teachers, data.classStream) : null;
  if (!resolvedClassTeacher && data.teachers && data.teachers.length > 0) {
    if (resolvedRemarks.class_teacher_name) {
      const targetName = resolvedRemarks.class_teacher_name.toLowerCase().replace(/^(mr|mrs|ms|madam|dr|prof)\.?\s+/i, '').trim();
      resolvedClassTeacher = data.teachers.find(t => {
        const name = t.teacher_name.toLowerCase().replace(/^(mr|mrs|ms|madam|dr|prof)\.?\s+/i, '').trim();
        return (targetName.length > 1 && name.includes(targetName)) || (name.length > 1 && targetName.includes(name));
      }) || null;
    }
    if (!resolvedClassTeacher) {
      resolvedClassTeacher = data.teachers.find(t => t.is_class_teacher && t.signature_url) || data.teachers.find(t => !!t.signature_url) || null;
    }
  }

  const ctNameStr = resolvedRemarks.class_teacher_name
    ? `Class Teacher: ${resolvedRemarks.class_teacher_name}`
    : 'Class Teacher: ____________________________________________________________________________';
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.text(ctNameStr, marginX + 3, currentY + ctBoxHeight - 2.5);

  currentY += ctBoxHeight + 4.0;

  // -------------------------------------------------------------
  // 6. HEAD TEACHER'S REMARKS
  // -------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text("HEAD TEACHER'S REMARKS", marginX, currentY);
  currentY += 2.5;

  const htBoxHeight = 16.0;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(marginX, currentY, contentWidth, htBoxHeight, 'FD');

  const htComment = resolvedRemarks.headteacher_comment;

  if (htComment) {
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.0);
    doc.text(htComment, marginX + 3, currentY + 4.8, { maxWidth: contentWidth - 6 });
  } else {
    // Two empty writing lines
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.15);
    doc.line(marginX + 3, currentY + 5.0, marginX + contentWidth - 3, currentY + 5.0);
    doc.line(marginX + 3, currentY + 9.5, marginX + contentWidth - 3, currentY + 9.5);
  }

  const htNameStr = resolvedRemarks.headteacher_name
    ? `Head Teacher: ${resolvedRemarks.headteacher_name}`
    : 'Head Teacher: ____________________________________________________________________________';
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.text(htNameStr, marginX + 3, currentY + htBoxHeight - 2.5);

  currentY += htBoxHeight + 4.0;

  // -------------------------------------------------------------
  // 7. LEGEND (COMPACT POINTS MAPPING)
  // -------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text('LEGEND', marginX, currentY);
  currentY += 3.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.setTextColor(0, 0, 0);
  if (isUpperPrimary) {
    doc.text('76–100%: EE (Exceeding Expectations) = 4 pts | 51–75%: ME (Meeting Expectations) = 3 pts', marginX, currentY);
    currentY += 3.2;
    doc.text('26–50%: AE (Approaching Expectations) = 2 pts | 0–25%: BE (Below Expectations) = 1 pt', marginX, currentY);
    currentY += 5.0;
  } else {
    doc.text('EE1 – Exceeding Expectation 1 (8 pts) | EE2 – Exceeding Expectation 2 (7 pts) | ME1 – Meeting Expectation 1 (6 pts) | ME2 – Meeting Expectation 2 (5 pts)', marginX, currentY);
    currentY += 3.2;
    doc.text('AE1 – Approaching Expectation 1 (4 pts) | AE2 – Approaching Expectation 2 (3 pts) | BE1 – Below Expectation 1 (2 pts) | BE2 – Below Expectation 2 (1 pt)', marginX, currentY);
    currentY += 5.0;
  }

  // -------------------------------------------------------------
  // 8. SIGNATURES & OFFICIAL SEAL SECTION (3 COLUMNS)
  // -------------------------------------------------------------
  const sigColW = contentWidth / 3;
  const sigBoxHeight = 15.0;
  const sigBoxes = [
    { title: 'CLASS TEACHER SIGNATURE', defaultLabel: 'Sign: _____________' },
    { title: 'HEAD OF INSTITUTION & STAMP', defaultLabel: 'Sign & Seal: __________' },
    { title: 'PARENT / GUARDIAN SIGNATURE', defaultLabel: 'Sign: _____________' },
  ];

  sigBoxes.forEach((sig, idx) => {
    const x = marginX + idx * sigColW;
    const boxW = sigColW - (idx < 2 ? 1.5 : 0);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.rect(x, currentY, boxW, sigBoxHeight, 'FD');

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(sig.title, x + boxW / 2, currentY + 3.8, { align: 'center' });

    if (idx === 0) {
      // Connect Class Teacher digital signature from teacher portal
      let drawn = false;
      if (resolvedClassTeacher?.signature_url) {
        drawn = drawPdfImage(
          doc,
          resolvedClassTeacher.signature_url,
          x + boxW / 2 - 14,
          currentY + 4.2,
          28,
          7.0,
          `sig_ct_${resolvedClassTeacher.id || 'default'}`
        );
      }
      if (!drawn) {
        doc.setFontSize(7.0);
        doc.setFont('helvetica', 'normal');
        doc.text(sig.defaultLabel, x + boxW / 2, currentY + 11.5, { align: 'center' });
      }

      if (resolvedRemarks.class_teacher_name) {
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(80, 80, 80);
        doc.text(
          resolvedRemarks.class_teacher_name,
          x + boxW / 2,
          currentY + sigBoxHeight - 1.2,
          { align: 'center' }
        );
        doc.setTextColor(0, 0, 0);
      }
    } else if (idx === 1) {
      let drawn = false;
      if (data.school?.stamp_url) {
        drawn = drawPdfImage(
          doc,
          data.school.stamp_url,
          x + boxW / 2 - 14,
          currentY + 4.2,
          28,
          7.0,
          'school_stamp'
        );
      }
      if (!drawn) {
        doc.setFontSize(7.0);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        doc.text(sig.defaultLabel, x + boxW / 2, currentY + 11.5, { align: 'center' });
      }

      if (resolvedRemarks.headteacher_name || data.school?.principal_name) {
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(80, 80, 80);
        doc.text(
          resolvedRemarks.headteacher_name || data.school?.principal_name || 'Head Teacher',
          x + boxW / 2,
          currentY + sigBoxHeight - 1.2,
          { align: 'center' }
        );
        doc.setTextColor(0, 0, 0);
      }
    } else {
      doc.setFontSize(7.0);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(sig.defaultLabel, x + boxW / 2, currentY + 11.5, { align: 'center' });
    }
  });

  currentY += sigBoxHeight + 12.0;

  // -------------------------------------------------------------
  // 9. FOOTER: NEXT TERM OPENS ONLY (Except Grade 9 Term 3 completion)
  // -------------------------------------------------------------
  const isG9T3 = isGrade9Term3Report({
    student,
    classStream,
    grade: classStream?.class_name || student.grade,
    term,
  });

  if (!isG9T3) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(0, 0, 0);
    const openDateStr = nextTermOpeningDate
      ? formatKenyaDate(nextTermOpeningDate)
      : '________________________________________________';
    doc.text(`Next Term Opens: ${openDateStr}`, marginX, currentY);
  }

  return doc;
}

/**
 * Canonical ordering for Junior School 9 learning areas according to CBE Hub and redesigned report.
 * 1. English
 * 2. Kiswahili / Kenya Sign Language
 * 3. Mathematics
 * 4. Integrated Science
 * 5. Creative Arts and Sports
 * 6. Social Studies
 * 7. Religious Education / C.R.E.
 * 8. Agriculture / Agriculture & Nutrition
 * 9. Pre-Technical Studies
 */
export function getJuniorSchoolCanonicalSubjectOrder(subject: Subject): number {
  const code = (subject.subject_code || '').toUpperCase().trim();
  const name = (subject.subject_name || '').toLowerCase().trim();

  if (code === 'ENG' || name.includes('english')) return 1;
  if (code === 'KIS' || name.includes('kiswahili') || name.includes('sign language')) return 2;
  if (code === 'MATH' || code === 'MAT' || name.includes('mathematics')) return 3;
  if (code === 'INT-SCI' || code === 'SCI' || name.includes('integrated science')) return 4;
  if (code === 'CAS' || name.includes('creative arts')) return 5;
  if (code === 'SST' || name.includes('social studies')) return 6;
  if (code === 'CRE' || code === 'IRE' || code === 'HRE' || name.includes('religious') || name.includes('c.r.e')) return 7;
  if (code === 'AGN' || code === 'AGR' || name.includes('agriculture')) return 8;
  if (code === 'PRE-TECH' || code === 'PTS' || name.includes('pre-technical')) return 9;

  return 99;
}

/**
 * Resolves the short canonical abbreviation for Junior School learning areas (used in graph X-axis).
 */
export function getJuniorSchoolSubjectAbbreviation(subject: Subject): string {
  const code = (subject.subject_code || '').toUpperCase().trim();
  const name = (subject.subject_name || '').toLowerCase().trim();

  if (code === 'ENG' || name.includes('english')) return 'ENG';
  if (code === 'KIS' || name.includes('kiswahili')) return 'KIS';
  if (code === 'MATH' || code === 'MAT' || name.includes('mathematics')) return 'MATH';
  if (code === 'INT-SCI' || code === 'SCI' || name.includes('integrated science')) return 'INT-SCI';
  if (code === 'CAS' || name.includes('creative arts')) return 'CAS';
  if (code === 'SST' || name.includes('social studies')) return 'SST';
  if (code === 'CRE' || code === 'IRE' || code === 'HRE' || name.includes('religious') || name.includes('c.r.e')) return 'C.R.E';
  if (code === 'AGN' || code === 'AGR' || name.includes('agriculture')) return 'AGN';
  if (code === 'PRE-TECH' || code === 'PTS' || name.includes('pre-technical')) return 'PRE-TECH';

  return code || subject.subject_name.substring(0, 4).toUpperCase();
}

/**
 * Draws a diamond marker centered at (cx, cy) with radius r.
 */
function drawDiamondMarker(doc: jsPDF, cx: number, cy: number, r: number) {
  doc.lines(
    [
      [r, r],
      [-r, r],
      [-r, -r],
      [r, -r],
    ],
    cx,
    cy - r,
    [1, 1],
    'FD',
    true
  );
}

/**
 * Renders a bold prefix (e.g. teacher/HOI name) followed by normal text with natural wrapping.
 */
function renderBoldPrefixParagraph(
  doc: jsPDF,
  boldPrefix: string,
  normalText: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number = 7.0,
  lineHeight: number = 3.3
): number {
  doc.setFontSize(fontSize);

  if (!boldPrefix) {
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(normalText, maxWidth);
    doc.text(lines, x, y);
    return y + (lines.length - 1) * lineHeight;
  }

  doc.setFont('helvetica', 'bold');
  const prefixWidth = doc.getTextWidth(boldPrefix);

  doc.setFont('helvetica', 'normal');
  const words = normalText.split(/\s+/);
  const line1Words: string[] = [];
  const remainingWords: string[] = [];
  let currentW = prefixWidth;

  let wrapped = false;
  for (let i = 0; i < words.length; i++) {
    const space = line1Words.length > 0 ? ' ' : '';
    const wordWidth = doc.getTextWidth(space + words[i]);
    if (currentW + wordWidth <= maxWidth) {
      line1Words.push(words[i]);
      currentW += wordWidth;
    } else {
      wrapped = true;
      remainingWords.push(...words.slice(i));
      break;
    }
  }

  // Draw bold prefix
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(boldPrefix, x, y);

  // Draw remaining text of first line in normal font
  doc.setFont('helvetica', 'normal');
  if (line1Words.length > 0) {
    doc.text(line1Words.join(' '), x + prefixWidth, y);
  }

  let curY = y;
  if (wrapped && remainingWords.length > 0) {
    const remLines = doc.splitTextToSize(remainingWords.join(' '), maxWidth);
    curY += lineHeight;
    doc.text(remLines, x, curY);
    curY += (remLines.length - 1) * lineHeight;
  }

  return curY;
}

/**
 * Renders an independent bordered box for a Junior School remarks section (Grades 7, 8, 9).
 * - Encloses the section in a rectangular border (0.18mm black stroke, white fill)
 * - Internal padding: 3mm horizontal, 2.5mm top, 2.5mm bottom
 * - Heading: bold, 7.2 pt
 * - Comment body: 6.8 pt with bold name prefix + normal text, 3.2mm line height
 * - Heading-to-comment spacing: 2.6mm
 * - Dynamically computes box height to fit one-line, two-line, or multi-line remarks without clipping
 * - Returns the actual bottom Y-coordinate (top Y + boxHeight) of the completed box.
 */
export function renderJuniorRemarksBox(
  doc: jsPDF,
  heading: string,
  boldPrefix: string,
  comment: string,
  x: number,
  y: number,
  width: number = 190
): number {
  const paddingX = 3.0;
  const paddingTop = 2.5;
  const paddingBottom = 2.5;
  const headingFontSize = 7.2;
  const commentFontSize = 6.8;
  const commentLineHeight = 3.2;
  const headingToCommentSpacing = 2.6;

  const availableWidth = width - 2 * paddingX;
  const textX = x + paddingX;

  // 1. If comment is empty, render bordered box with empty writing lines for manual handwritten remark
  if (!comment || !comment.trim()) {
    const boxHeight = 13.0;
    const headingCapHeight = 2.0;
    const headingBaselineY = y + paddingTop + headingCapHeight;

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.18);
    doc.rect(x, y, width, boxHeight, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(headingFontSize);
    doc.setTextColor(0, 0, 0);
    doc.text(heading, textX, headingBaselineY);

    // Empty writing lines
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.15);
    doc.line(textX, headingBaselineY + 3.8, textX + availableWidth, headingBaselineY + 3.8);
    doc.line(textX, headingBaselineY + 7.5, textX + availableWidth, headingBaselineY + 7.5);

    if (boldPrefix) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(5.8);
      doc.setTextColor(80, 80, 80);
      doc.text(boldPrefix.replace(/:\s*$/, ''), textX, y + boxHeight - 1.2);
      doc.setTextColor(0, 0, 0);
    }

    return y + boxHeight;
  }

  // 1b. Measure comment lines to determine dynamic box height
  doc.setFontSize(commentFontSize);
  let commentLineCount = 1;

  if (!boldPrefix) {
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(comment, availableWidth);
    commentLineCount = Math.max(1, lines.length);
  } else {
    doc.setFont('helvetica', 'bold');
    const prefixW = doc.getTextWidth(boldPrefix);

    doc.setFont('helvetica', 'normal');
    const words = comment.split(/\s+/);
    const line1Words: string[] = [];
    const remainingWords: string[] = [];
    let curW = prefixW;
    let wrapped = false;

    for (let i = 0; i < words.length; i++) {
      const space = line1Words.length > 0 ? ' ' : '';
      const w = doc.getTextWidth(space + words[i]);
      if (curW + w <= availableWidth) {
        line1Words.push(words[i]);
        curW += w;
      } else {
        wrapped = true;
        remainingWords.push(...words.slice(i));
        break;
      }
    }

    if (wrapped && remainingWords.length > 0) {
      const remLines = doc.splitTextToSize(remainingWords.join(' '), availableWidth);
      commentLineCount = 1 + remLines.length;
    } else {
      commentLineCount = 1;
    }
  }

  // 2. Compute dynamic box height
  const headingCapHeight = 2.0;
  const headingBaselineY = y + paddingTop + headingCapHeight;
  const commentBaseline1Y = headingBaselineY + headingToCommentSpacing + 2.0;
  const lastCommentBaselineY = commentBaseline1Y + (commentLineCount - 1) * commentLineHeight;
  const textBottomDescent = 0.7;
  const boxHeight = (lastCommentBaselineY - y) + textBottomDescent + paddingBottom;

  // 3. Draw independent bordered box
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.18);
  doc.rect(x, y, width, boxHeight, 'FD');

  // 4. Render Heading (bold 7.2 pt)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(headingFontSize);
  doc.setTextColor(0, 0, 0);
  doc.text(heading, textX, headingBaselineY);

  // 5. Render Comment (bold name prefix + normal comment text)
  renderBoldPrefixParagraph(
    doc,
    boldPrefix,
    comment,
    textX,
    commentBaseline1Y,
    availableWidth,
    commentFontSize,
    commentLineHeight
  );

  return y + boxHeight;
}

/**
 * Resolves the facilitator for a Junior School subject.
 * Strictly delegates to the authoritative resolveSubjectTeacher to ensure:
 * 1. Exact subject ID, class ID, and stream ID matching.
 * 2. Complete cross-grade and sibling-stream isolation (no stream-name or grade leaks).
 * 3. Latest valid assignment timestamp takes precedence when conflicting active allocations exist.
 * 4. 100% consistency between in-app report preview and generated Junior School PDF.
 * 5. Returns empty string '' rather than guessing if unallocated or ambiguous.
 */
export function resolveJuniorSchoolFacilitator(
  teachers: Teacher[] | undefined,
  subject: Subject,
  targetClassId?: string,
  targetStreamId?: string,
  classStream?: ClassStream,
  student?: Student
): string {
  if (!teachers || teachers.length === 0 || !subject) return '';

  const cleanSubjId = (subject.id || '').trim();
  const cleanStreamId = targetStreamId?.trim() || classStream?.stream_id || (student as any)?.stream_id;
  const cleanClassId = targetClassId?.trim() || classStream?.id || (classStream as any)?.class_id || student?.class_id;

  const matchedTeacher = resolveSubjectTeacher(teachers, cleanSubjId, cleanClassId, cleanStreamId);
  return matchedTeacher ? matchedTeacher.teacher_name : '';
}

/**
 * Renders a faint, centered school logo watermark across the Junior School results table.
 * Follows strict graphics-state isolation:
 * - Watermark opacity calibrated to 0.14 (~14% opacity) following the existing PDF generator's opacity convention.
 * - Accepts opacity input, normalizing percentage/negative notation (e.g. -14 or 14 -> 0.14) to the standard [0.0, 1.0] GState range.
 * - Watermark size set to 78.0 mm (slightly increased from 70.0 mm for better visibility) while preserving natural proportions.
 * - Retains the original colours of the school logo while keeping the faint background appearance.
 * - Centered horizontally across the page (x = (pageWidth - w) / 2).
 * - Centered vertically within the results table body (y = tableStartY + (tableHeight - h) / 2).
 * - Wrapped in saveGraphicsState / restoreGraphicsState with GState fallback to guarantee zero opacity leakage.
 * - Graceful degradation: never throws or disrupts PDF generation if logo data or GState fails.
 */
export function renderJuniorReportWatermark(
  doc: jsPDF,
  logoDataUrl: string,
  tableStartY: number,
  tableHeight: number,
  pageWidth: number = 210,
  opacityInput: number = 0.14,
  alias: string = 'terminal_school_logo'
): void {
  if (!logoDataUrl || typeof logoDataUrl !== 'string' || !logoDataUrl.trim()) {
    return;
  }

  try {
    const maxWatermarkSize = 78.0;
    let w = maxWatermarkSize;
    let h = maxWatermarkSize;

    const anyDoc = doc as any;
    if (typeof anyDoc.getImageProperties === 'function') {
      try {
        const props = anyDoc.getImageProperties(logoDataUrl);
        if (props?.width && props?.height && props.height > 0) {
          const aspect = props.width / props.height;
          if (aspect >= 1) {
            w = maxWatermarkSize;
            h = maxWatermarkSize / aspect;
          } else {
            h = maxWatermarkSize;
            w = maxWatermarkSize * aspect;
          }
        }
      } catch {
        // Fallback to square bounding box
      }
    }

    const x = (pageWidth - w) / 2;
    const y = tableStartY + (tableHeight - h) / 2;

    const hasGState = typeof anyDoc.GState === 'function' && typeof anyDoc.setGState === 'function';
    const hasSaveRestore = typeof anyDoc.saveGraphicsState === 'function' && typeof anyDoc.restoreGraphicsState === 'function';

    if (hasSaveRestore) {
      anyDoc.saveGraphicsState();
    }

    // Resolves opacity following the existing PDF generator's opacity convention (0.14 / ~14%)
    // Safely handles normalized values (0.14) as well as requested -14 / 14 conventions
    let effectiveOpacity = opacityInput;
    if (effectiveOpacity < 0) {
      effectiveOpacity = Math.abs(effectiveOpacity) / 100;
    } else if (effectiveOpacity > 1) {
      effectiveOpacity = effectiveOpacity / 100;
    }

    try {
      if (hasGState) {
        anyDoc.setGState(new anyDoc.GState({ opacity: effectiveOpacity }));
      }
      drawPdfImage(doc, logoDataUrl, x, y, w, h, alias);
    } finally {
      if (hasSaveRestore) {
        anyDoc.restoreGraphicsState();
      } else if (hasGState) {
        anyDoc.setGState(new anyDoc.GState({ opacity: 1.0 }));
      }
    }
  } catch (err) {
    console.warn('Could not draw school background watermark on Junior School terminal report:', err);
  }
}

/**
 * Dedicated Junior School Terminal Report PDF Builder (Grades 7, 8, 9).
 * Implements the attached paper design:
 * 1. School Header & Logo
 * 2. Learner Information Box
 * 3. Assessment Summary Box
 * 4. 9-Learning-Area Results Table with dynamic assessment columns (1-4)
 *    and Deep Navy (#1E3A8A) / Light Blue (#EFF6FF) styling.
 *
 * Scope: Phase 3B.2 covers Header, Learner Info, Summary, Results Table, and Dynamic Columns.
 * Graph, Remarks, Signatures, and Footer will be added in subsequent phases.
 */
export async function buildJuniorSchoolTerminalReportDoc(
  data: TerminalReportPDFData,
  existingDoc?: jsPDF
): Promise<jsPDF> {
  const {
    student,
    school,
    classStream,
    academicYear,
    term,
    contributingAssessments = [],
    subjects = [],
    resultsBySubject = new Map(),
    grades = [],
    teachers = [],
    classes = [],
    customSubjectComments,
    savedRemarks,
    ranking,
    assessmentRankings,
    subjectRanks,
    nextTermOpeningDate,
  } = data;

  const doc = ensureSafeJsPdf(
    existingDoc || new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  );

  const pageWidth = 210;
  const marginX = 10;
  const tableWidth = 190;
  let currentY = 8;
  // 1. Preprocess school logo once for both top header and faint background watermark.
  // Optimizes oversized images to max 480x480 JPEG at 0.88 quality (~25-35 KB) on solid white background.
  // Both header and watermark reuse the exact same image data URL and alias 'terminal_school_logo'
  // for complete deduplication into a single PDF XObject.
  const optimizedLogo = school?.logo_url
    ? await getOptimizedTerminalLogo(school.logo_url, 480, 0.88)
    : null;

  if (optimizedLogo) {
    try {
      const logoMaxSize = 13;
      let logoW = logoMaxSize;
      let logoH = logoMaxSize;

      const aspect = optimizedLogo.aspectRatio;
      if (aspect >= 1) {
        logoW = logoMaxSize;
        logoH = logoMaxSize / aspect;
      } else {
        logoH = logoMaxSize;
        logoW = logoMaxSize * aspect;
      }

      const logoX = (pageWidth - logoW) / 2;
      const success = drawPdfImage(
        doc,
        optimizedLogo.dataUrl,
        logoX,
        currentY,
        logoW,
        logoH,
        'terminal_school_logo'
      );
      if (success) {
        currentY += logoH + 4.0;
      }
    } catch (e) {
      console.warn('Could not render logo in Junior School terminal report PDF:', e);
    }
  } else if (school?.logo_url) {
    try {
      const logoUrl = school.logo_url;
      const logoMaxSize = 13;
      let logoW = logoMaxSize;
      let logoH = logoMaxSize;

      const anyDoc = doc as any;
      if (typeof anyDoc.getImageProperties === 'function') {
        try {
          const props = anyDoc.getImageProperties(logoUrl);
          if (props?.width && props?.height && props.height > 0) {
            const aspect = props.width / props.height;
            if (aspect >= 1) {
              logoW = logoMaxSize;
              logoH = logoMaxSize / aspect;
            } else {
              logoH = logoMaxSize;
              logoW = logoMaxSize * aspect;
            }
          }
        } catch {
          // Fallback to square bounding box
        }
      }

      const logoX = (pageWidth - logoW) / 2;
      const success = drawPdfImage(doc, logoUrl, logoX, currentY, logoW, logoH, 'terminal_school_logo');
      if (success) {
        currentY += logoH + 4.0;
      }
    } catch (e) {
      console.warn('Could not render logo in Junior School terminal report PDF:', e);
    }
  }

  const schoolName = (school?.school_name || 'SCHOOL NAME').trim().toUpperCase();
  if (schoolName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(schoolName, pageWidth / 2, currentY, { align: 'center' });
    currentY += 4.5;
  }

  const schoolMotto = stripSurroundingQuotes(school?.motto || '').trim();
  if (schoolMotto) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.text(schoolMotto, pageWidth / 2, currentY, { align: 'center' });
    currentY += 4.0;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('TERMINAL LEARNER REPORT FORM', pageWidth / 2, currentY, { align: 'center' });
  currentY += 4.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(`${String(term).toUpperCase()} • ${academicYear}`, pageWidth / 2, currentY, { align: 'center' });
  currentY += 5.5;

  // -------------------------------------------------------------
  // 2. LEARNER INFORMATION (BOX WITH BORDER)
  // -------------------------------------------------------------
  const learnerBoxHeight = 15.5;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(marginX, currentY, tableWidth, learnerBoxHeight);

  const learnerFullName = (
    student.full_name || `${student.first_name || ''} ${student.last_name || ''}`
  ).trim().toUpperCase() || 'LEARNER';
  const admNo = student.admission_number || 'N/A';
  const gradeStr = (classStream?.class_name || student.grade || 'Grade 8').toUpperCase();
  const learnerStreamName = getStreamNameForLearner(student, classes || (classStream ? [classStream] : []));
  const streamStr = (learnerStreamName && learnerStreamName !== '—'
    ? learnerStreamName
    : classStream?.stream || '—').toUpperCase();

  const assessmentNamesStr = contributingAssessments.length > 0
    ? contributingAssessments.map((a, idx) => formatAssessmentColumnHeader(a.exam_name, idx)).join(' + ')
    : 'TERMINAL ASSESSMENTS';

  // Row 1: LEARNER & ADM NO
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('LEARNER', marginX + 3, currentY + 4.2);
  doc.setFont('helvetica', 'normal');
  doc.text(learnerFullName, marginX + 22, currentY + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.text('ADM NO.', marginX + 130, currentY + 4.2);
  doc.setFont('helvetica', 'normal');
  doc.text(admNo, marginX + 150, currentY + 4.2);

  // Row 2: GRADE & STREAM
  doc.setFont('helvetica', 'bold');
  doc.text('GRADE', marginX + 3, currentY + 8.7);
  doc.setFont('helvetica', 'normal');
  doc.text(gradeStr, marginX + 22, currentY + 8.7);

  doc.setFont('helvetica', 'bold');
  doc.text('STREAM', marginX + 130, currentY + 8.7);
  doc.setFont('helvetica', 'normal');
  doc.text(streamStr, marginX + 150, currentY + 8.7);

  // Row 3: ASSESSMENT
  doc.setFont('helvetica', 'bold');
  doc.text('ASSESSMENT', marginX + 3, currentY + 13.2);
  doc.setFont('helvetica', 'normal');
  doc.text(assessmentNamesStr, marginX + 28, currentY + 13.2);

  currentY += learnerBoxHeight + 3.5;

  // -------------------------------------------------------------
  // 3. ASSESSMENT SUMMARY TABLE
  // -------------------------------------------------------------
  // Sort Junior School subjects in canonical order
  const effectiveSubjects = [...subjects].sort(
    (a, b) => getJuniorSchoolCanonicalSubjectOrder(a) - getJuniorSchoolCanonicalSubjectOrder(b)
  );

  const totalPossibleMax = effectiveSubjects.length * 100;
  const totalPointsMax = effectiveSubjects.length * 8;

  const totalScoreDisplay = ranking && typeof ranking.terminalTotalMarks === 'number'
    ? `${ranking.terminalTotalMarks} / ${ranking.terminalTotalMaximum || totalPossibleMax}`
    : '—';

  let averageScoreVal: number | null = null;
  if (ranking && typeof ranking.terminalTotalMarks === 'number' && effectiveSubjects.length > 0) {
    averageScoreVal = Math.round(ranking.terminalTotalMarks / effectiveSubjects.length);
  } else if (resultsBySubject) {
    let sum = 0;
    let count = 0;
    effectiveSubjects.forEach((s) => {
      const r = resultsBySubject.get(s.id);
      if (r?.isComplete && typeof r.terminalPercentage === 'number') {
        sum += r.terminalPercentage;
        count++;
      }
    });
    if (count > 0) {
      averageScoreVal = Math.round(sum / count);
    }
  }
  const averageDisplay = averageScoreVal !== null ? `${averageScoreVal}%` : '—';

  const gradeObj = averageScoreVal !== null
    ? getGradeForMark(averageScoreVal, grades, 'Junior School', gradeStr)
    : null;
  const cbeLevelDisplay = ranking?.cbePerformanceLevel || gradeObj?.grade_code || gradeObj?.performance_level || '—';

  let totalPointsVal = 0;
  let hasValidPoints = false;
  effectiveSubjects.forEach((s) => {
    const r = resultsBySubject.get(s.id);
    if (r?.isComplete && typeof r.points === 'number') {
      totalPointsVal += r.points;
      hasValidPoints = true;
    }
  });
  const totalPointsDisplay = hasValidPoints
    ? `${totalPointsVal} / ${totalPointsMax}`
    : '—';

  const streamRankDisplay = ranking && ranking.isRankable && ranking.streamPosition !== null
    ? `STREAM RANK: ${ranking.streamPosition} OF ${ranking.streamPositionDenominator}`
    : 'STREAM RANK: —';

  const overallRankDisplay = ranking && ranking.isRankable && ranking.overallPosition !== null
    ? `OVERALL RANK: ${ranking.overallPosition} OF ${ranking.overallPositionDenominator}`
    : 'OVERALL RANK: —';

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    tableWidth: tableWidth,
    theme: 'grid',
    head: [
      [{ content: 'ASSESSMENT SUMMARY', colSpan: 4, styles: { halign: 'center', fontStyle: 'bold', fontSize: 7.5 } }],
      [
        { content: 'TOTAL SCORE', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: 'AVERAGE', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: 'CBE LEVEL', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: 'TOTAL POINTS', styles: { halign: 'center', fontStyle: 'bold' } },
      ],
    ],
    body: [
      [
        { content: totalScoreDisplay, styles: { halign: 'center', fontStyle: 'bold' } },
        { content: averageDisplay, styles: { halign: 'center', fontStyle: 'bold' } },
        { content: cbeLevelDisplay, styles: { halign: 'center', fontStyle: 'bold' } },
        { content: totalPointsDisplay, styles: { halign: 'center', fontStyle: 'bold' } },
      ],
      [
        { content: streamRankDisplay, colSpan: 2, styles: { halign: 'center', fontStyle: 'bold' } },
        { content: overallRankDisplay, colSpan: 2, styles: { halign: 'center', fontStyle: 'bold' } },
      ],
    ],
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.18,
      cellPadding: { top: 1.4, bottom: 1.4, left: 2.0, right: 2.0 },
      fillColor: [255, 255, 255],
      valign: 'middle',
    },
    headStyles: {
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
      lineWidth: 0.18,
      lineColor: [0, 0, 0],
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 3.5;

  // -------------------------------------------------------------
  // 4. NINE-LEARNING-AREA RESULTS TABLE (WITH DYNAMIC ASSESSMENT COLUMNS)
  // -------------------------------------------------------------
  const numAssessments = contributingAssessments.length;
  const assessmentHeaders = contributingAssessments.map((a, idx) =>
    formatJuniorSchoolAssessmentColumnHeader(a.exam_name, idx)
  );

  // Dynamic header wrapping threshold tailored to column width & font size:
  // 4 assessments: 11.5mm col (printable ~10.3mm) @ 5.8pt -> wrap at 7 chars (e.g. "MID-", "TERM", "SBA 1")
  // 3 assessments: 13.0mm col (printable ~11.8mm) @ 6.0pt -> wrap at 9 chars (e.g. "MID-TERM", "END-TERM")
  // 2 assessments: 16.0mm col (printable ~14.8mm) @ 6.3pt -> wrap at 11 chars
  // 1 assessment:  20.0mm col (printable ~18.8mm) @ 6.3pt -> wrap at 14 chars
  const jsHeaderMaxLineLength = numAssessments >= 4 ? 7 : (numAssessments === 3 ? 9 : (numAssessments === 2 ? 11 : 14));

  const tableHead = [
    [
      'LEARNING AREA',
      ...assessmentHeaders.map((h) => wrapHeaderTextAtWordBoundaries(h, jsHeaderMaxLineLength)),
      {
        content: 'TERMINAL\nSCORE',
        styles: {
          fillColor: [243, 244, 246],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          halign: 'center',
        },
      },
      'LEVEL',
      {
        content: 'POINTS',
        styles: {
          halign: 'center',
          cellPadding: { top: 1.8, bottom: 1.8, left: 0.2, right: 0.2 },
        },
      },
      'RANK',
      'COMMENTS',
      'FACILITATOR',
    ],
  ];

  // Dynamic geometry allocation across 190 mm table width (sufficiently wide points column prevents line-wrapping)
  let learningAreaWidth: number;
  let assessmentColWidth: number;
  let terminalScoreWidth: number;
  let levelWidth: number;
  let pointsWidth: number;
  let rankWidth: number;
  let commentWidth: number;
  let facilitatorWidth: number;

  if (numAssessments === 1) {
    learningAreaWidth = 38;
    assessmentColWidth = 20;
    terminalScoreWidth = 19;
    levelWidth = 10;
    pointsWidth = 11.5;
    rankWidth = 10.5;
    commentWidth = 53;
    facilitatorWidth = 28;
  } else if (numAssessments === 2) {
    learningAreaWidth = 36;
    assessmentColWidth = 18;
    terminalScoreWidth = 17;
    levelWidth = 10;
    pointsWidth = 11.5;
    rankWidth = 10.5;
    commentWidth = 45;
    facilitatorWidth = 24;
  } else if (numAssessments === 3) {
    learningAreaWidth = 35;
    assessmentColWidth = 14.5;
    terminalScoreWidth = 16;
    levelWidth = 10;
    pointsWidth = 11.0;
    rankWidth = 10;
    commentWidth = 42.5;
    facilitatorWidth = 22;
  } else if (numAssessments === 4) {
    learningAreaWidth = 34;
    assessmentColWidth = 12;
    terminalScoreWidth = 15;
    levelWidth = 9.5;
    pointsWidth = 10.5;
    rankWidth = 9.5;
    commentWidth = 41.5;
    facilitatorWidth = 22;
  } else {
    learningAreaWidth = 32;
    terminalScoreWidth = 14.5;
    levelWidth = 9.5;
    pointsWidth = 10.5;
    rankWidth = 9.5;
    commentWidth = 38.5;
    facilitatorWidth = 20;
    const fixed = learningAreaWidth + terminalScoreWidth + levelWidth + pointsWidth + rankWidth + commentWidth + facilitatorWidth;
    assessmentColWidth = (tableWidth - fixed) / Math.max(1, numAssessments);
  }

  const targetClassId = classStream?.id || student.class_id;
  const targetStreamId = classStream?.stream_id || (student as any).stream_id;

  const tableBody: any[][] = [];

  // Data rows for 9 learning areas
  effectiveSubjects.forEach((subject) => {
    const res = resultsBySubject.get(subject.id);

    // Dynamic assessment marks
    const examMarks = contributingAssessments.map((a) => {
      const trail = res?.assessmentTrail?.find((t) => t.examId === a.id);
      if (!trail) return 'X';
      if (trail.notApplicable || (trail as any).isApplicable === false) return '—';
      if (trail.status === 'X' || trail.status === 'Blank') return 'X';
      if (trail.status === 'Y') return 'Y';
      if (typeof trail.percentage === 'number') {
        return `${Math.round(trail.percentage)}`;
      }
      if (typeof trail.rawScore === 'number') {
        return String(trail.rawScore);
      }
      return 'X';
    });

    // Terminal Score
    let terminalScoreDisplay = '—';
    if (res) {
      if (res.isComplete && typeof res.terminalPercentage === 'number') {
        terminalScoreDisplay = String(res.terminalPercentage);
      } else if (res.status === 'INCOMPLETE (X)') {
        terminalScoreDisplay = 'X';
      } else if (res.status === 'INCOMPLETE (Y)') {
        terminalScoreDisplay = 'Y';
      } else if (res.status === 'INCOMPLETE (X/Y)') {
        terminalScoreDisplay = 'X/Y';
      }
    }

    const terminalScoreCell = {
      content: terminalScoreDisplay,
      styles: {
        fillColor: [242, 242, 242],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: numAssessments >= 4 ? 6.5 : 7.0,
        halign: 'center',
      },
    };

    const levelDisplay = res?.isComplete ? (res.cbePerformanceLevel || '—') : '—';
    const pointsDisplay = res?.isComplete && typeof res.points === 'number' ? String(res.points) : '—';
    const rankDisplay = subjectRanks?.[subject.id] || '—';

    // Retrieve teacher-written custom comment checking subject ID, subject name, and subject code,
    // preserving strict precedence: customSubjectComments first, then savedRemarks.subject_comments second.
    const rawCustomComment =
      customSubjectComments?.[subject.id] ||
      (subject.subject_name ? customSubjectComments?.[subject.subject_name] : undefined) ||
      (subject.subject_code ? customSubjectComments?.[subject.subject_code] : undefined) ||
      savedRemarks?.subject_comments?.[subject.id] ||
      (subject.subject_name ? savedRemarks?.subject_comments?.[subject.subject_name] : undefined) ||
      (subject.subject_code ? savedRemarks?.subject_comments?.[subject.subject_code] : undefined);

    const commentDisplay = resolveJuniorSchoolSubjectComment(
      subject,
      res,
      rawCustomComment,
      student
    );

    const facilitatorDisplay = resolveJuniorSchoolFacilitator(
      teachers,
      subject,
      targetClassId,
      targetStreamId,
      classStream,
      student
    );

    tableBody.push([
      subject.subject_name,
      ...examMarks,
      terminalScoreCell,
      levelDisplay,
      pointsDisplay,
      rankDisplay,
      commentDisplay,
      facilitatorDisplay,
    ]);
  });

  // Effective assessment rankings for summary rows
  const effectiveAssessmentRankings =
    assessmentRankings ||
    (contributingAssessments.length > 0
      ? calculateSingleLearnerAssessmentRankings({
          student,
          classStream,
          resultsBySubject,
          applicableSubjects: effectiveSubjects,
          contributingAssessments,
          isProvisionalMode: data.isProvisionalMode,
        })
      : undefined);

  // Summary Row styling configuration:
  // Light-grey shading [243, 244, 246] with bold typography
  // Terminal score uses neutral summaryGreyFill [243, 244, 246], dark black text [0, 0, 0], and prominent bold typography
  const summaryGreyFill = [243, 244, 246];

  // Summary Row 1: Total marks
  const totalMarksRow: any[] = [
    { content: 'Total marks', styles: { fontStyle: 'bold', fillColor: summaryGreyFill, textColor: [0, 0, 0] } },
  ];
  contributingAssessments.forEach((a) => {
    const aRanking = effectiveAssessmentRankings?.[a.id];
    const aTotalStr = aRanking && typeof aRanking.totalMarks === 'number'
      ? `${aRanking.totalMarks}/${aRanking.maxMarks || totalPossibleMax}`
      : '—';
    totalMarksRow.push({
      content: aTotalStr,
      styles: { fontStyle: 'bold', fillColor: summaryGreyFill, textColor: [0, 0, 0], halign: 'center' },
    });
  });
  totalMarksRow.push({
    content: `${ranking?.terminalTotalMarks ?? '—'}/${ranking?.terminalTotalMaximum || totalPossibleMax}`,
    styles: {
      fillColor: summaryGreyFill,
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: numAssessments >= 4 ? 6.5 : 7.0,
      halign: 'center',
    },
  });
  // Level: merged blank across 3 rows
  totalMarksRow.push({ content: '', rowSpan: 3, styles: { fillColor: summaryGreyFill } });
  // Points: merged across 3 rows showing total points e.g. "57/72", centered and bold
  totalMarksRow.push({
    content: `${totalPointsVal}/${totalPointsMax}`,
    rowSpan: 3,
    styles: { fontStyle: 'bold', fillColor: summaryGreyFill, textColor: [0, 0, 0], halign: 'center', valign: 'middle' },
  });
  // Rank, Comments, Facilitator: merged into one blank grey block spanning 3 rows and 3 columns (no inner borders)
  totalMarksRow.push({
    content: '',
    rowSpan: 3,
    colSpan: 3,
    styles: { fillColor: summaryGreyFill },
  });
  tableBody.push(totalMarksRow);

  // Summary Row 2: Stream rank
  const streamRankRow: any[] = [
    { content: 'Stream rank', styles: { fontStyle: 'bold', fillColor: summaryGreyFill, textColor: [0, 0, 0] } },
  ];
  contributingAssessments.forEach((a) => {
    const aRanking = effectiveAssessmentRankings?.[a.id];
    const aStreamStr = aRanking && aRanking.streamPosition !== null
      ? `${aRanking.streamPosition}/${aRanking.streamDenominator}`
      : '—';
    streamRankRow.push({
      content: aStreamStr,
      styles: { fontStyle: 'bold', fillColor: summaryGreyFill, textColor: [0, 0, 0], halign: 'center' },
    });
  });
  streamRankRow.push({
    content: ranking && ranking.streamPosition !== null
      ? `${ranking.streamPosition}/${ranking.streamPositionDenominator}`
      : '—',
    styles: {
      fillColor: summaryGreyFill,
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: numAssessments >= 4 ? 6.5 : 7.0,
      halign: 'center',
    },
  });
  // Level, Points, Rank, Comments, Facilitator omitted (covered by rowSpan from Row 1)
  tableBody.push(streamRankRow);

  // Summary Row 3: Overall rank
  const overallRankRow: any[] = [
    { content: 'Overall rank', styles: { fontStyle: 'bold', fillColor: summaryGreyFill, textColor: [0, 0, 0] } },
  ];
  contributingAssessments.forEach((a) => {
    const aRanking = effectiveAssessmentRankings?.[a.id];
    const aOverallStr = aRanking && aRanking.overallPosition !== null
      ? `${aRanking.overallPosition}/${aRanking.overallDenominator}`
      : '—';
    overallRankRow.push({
      content: aOverallStr,
      styles: { fontStyle: 'bold', fillColor: summaryGreyFill, textColor: [0, 0, 0], halign: 'center' },
    });
  });
  overallRankRow.push({
    content: ranking && ranking.overallPosition !== null
      ? `${ranking.overallPosition}/${ranking.overallPositionDenominator}`
      : '—',
    styles: {
      fillColor: summaryGreyFill,
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: numAssessments >= 4 ? 6.5 : 7.0,
      halign: 'center',
    },
  });
  // Level, Points, Rank, Comments, Facilitator omitted (covered by rowSpan from Row 1)
  tableBody.push(overallRankRow);

  // Column styles mapping
  const columnStylesObj: Record<number, any> = {
    0: { cellWidth: learningAreaWidth, halign: 'left' },
  };

  for (let i = 0; i < numAssessments; i++) {
    columnStylesObj[1 + i] = { cellWidth: assessmentColWidth, halign: 'center' };
  }

  const termScoreIdx = 1 + numAssessments;
  const levelIdx = termScoreIdx + 1;
  const pointsIdx = levelIdx + 1;
  const rankIdx = pointsIdx + 1;
  const commentIdx = rankIdx + 1;
  const facilitatorIdx = commentIdx + 1;

  columnStylesObj[termScoreIdx] = { cellWidth: terminalScoreWidth, halign: 'center' };
  columnStylesObj[levelIdx] = { cellWidth: levelWidth, halign: 'center' };
  columnStylesObj[pointsIdx] = { cellWidth: pointsWidth, halign: 'center' };
  columnStylesObj[rankIdx] = { cellWidth: rankWidth, halign: 'center' };
  columnStylesObj[commentIdx] = { cellWidth: commentWidth, halign: 'left' };
  columnStylesObj[facilitatorIdx] = { cellWidth: facilitatorWidth, halign: 'left' };

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    tableWidth: tableWidth,
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    styles: {
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.15,
      font: 'helvetica',
      fontSize: numAssessments >= 4 ? 6.0 : 6.5,
      cellPadding: { top: 1.4, bottom: 1.4, left: 1.0, right: 1.0 },
      fillColor: false,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fontStyle: 'bold',
      textColor: [0, 0, 0],
      fillColor: [243, 244, 246],
      halign: 'center',
      valign: 'middle',
      fontSize: numAssessments >= 4 ? 5.8 : (numAssessments === 3 ? 6.0 : 6.3),
      cellPadding: { top: 1.8, bottom: 1.8, left: 0.6, right: 0.6 },
      lineWidth: 0.15,
      lineColor: [0, 0, 0],
    },
    bodyStyles: {
      fontStyle: 'normal',
      textColor: [0, 0, 0],
      fillColor: false,
    },
    alternateRowStyles: {
      fillColor: false,
    },
    columnStyles: columnStylesObj,
  });

  const tableFinalY = (doc as any).lastAutoTable.finalY;
  const expectedHeaderHeight = 6.6;
  const tableBodyStartY = currentY + expectedHeaderHeight;
  const tableBodyHeight = tableFinalY - tableBodyStartY;

  // Render faint school logo watermark centered across the results table body (drawn after table so it is fully visible through colored cells)
  // Preserves original school logo colours at faint opacity (~14% / 0.14)
  // Reuses the preprocessed optimized logo asset and shared alias 'terminal_school_logo' for zero duplicate embedding
  if (optimizedLogo) {
    renderJuniorReportWatermark(
      doc,
      optimizedLogo.dataUrl,
      tableBodyStartY,
      tableBodyHeight,
      pageWidth,
      0.14,
      'terminal_school_logo'
    );
  } else if (school?.logo_url) {
    renderJuniorReportWatermark(
      doc,
      school.logo_url,
      tableBodyStartY,
      tableBodyHeight,
      pageWidth,
      0.14,
      'terminal_school_logo'
    );
  }

  // Vertical spacing from results table to first box: 4.5 mm
  currentY = tableFinalY + 4.5;

  // -------------------------------------------------------------
  // 5. REMARKS: CLASS TEACHER & HEAD OF INSTITUTION (INDEPENDENT BORDERED BOXES)
  // -------------------------------------------------------------
  const resolvedRemarks = resolveTerminalReportRemarks(data);
  const ctName = resolvedRemarks.class_teacher_name.trim();
  const ctComment = resolvedRemarks.class_teacher_comment.trim();
  const htName = resolvedRemarks.headteacher_name.trim();
  const htComment = resolvedRemarks.headteacher_comment.trim();

  // Box 1: CLASS TEACHER'S REMARKS
  const ctBoxBottomY = renderJuniorRemarksBox(
    doc,
    "CLASS TEACHER'S REMARKS",
    ctName ? `${ctName}: ` : '',
    ctComment,
    marginX,
    currentY,
    tableWidth
  );

  // Vertical spacing between boxes: 3.5 mm
  currentY = ctBoxBottomY + 3.5;

  // Box 2: HEAD OF INSTITUTION REMARKS
  const htBoxBottomY = renderJuniorRemarksBox(
    doc,
    'HEAD OF INSTITUTION REMARKS',
    htName ? `${htName}: ` : '',
    htComment,
    marginX,
    currentY,
    tableWidth
  );

  // Vertical spacing from second box to CBE Level Key: 4.0 mm
  currentY = htBoxBottomY + 4.0;

  // -------------------------------------------------------------
  // 6. CBE LEVEL KEY (2-ROW, 4-COLUMN GRID)
  // -------------------------------------------------------------
  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    tableWidth: tableWidth,
    theme: 'grid',
    head: [
      [{ content: 'CBE LEVEL KEY', colSpan: 4, styles: { halign: 'left', fontStyle: 'bold', fontSize: 7.2 } }],
    ],
    body: [
      [
        'EE1 (90–100%) • 8 pts',
        'EE2 (75–89%) • 7 pts',
        'ME1 (58–74%) • 6 pts',
        'ME2 (41–57%) • 5 pts',
      ],
      [
        'AE1 (31–40%) • 4 pts',
        'AE2 (21–30%) • 3 pts',
        'BE1 (11–20%) • 2 pts',
        'BE2 (1–10%) • 1 pt',
      ],
    ],
    styles: {
      font: 'helvetica',
      fontSize: 6.6,
      fontStyle: 'bold',
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.18,
      cellPadding: { top: 1.1, bottom: 1.1, left: 1.8, right: 1.8 },
      halign: 'left',
      fillColor: [255, 255, 255],
      valign: 'middle',
    },
    headStyles: {
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
      lineWidth: 0.18,
      lineColor: [0, 0, 0],
      cellPadding: { top: 1.2, bottom: 1.2, left: 1.8, right: 1.8 },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 3.5;

  // -------------------------------------------------------------
  // 7. SUBJECT PERFORMANCE COMPARISON LINE GRAPH
  // -------------------------------------------------------------
  // Title & Legend Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text('SUBJECT PERFORMANCE COMPARISON', marginX, currentY);

  const legendY = currentY - 0.5;
  // Legend 1: Stream mean (dashed slate line with diamond marker)
  const streamLegendX = marginX + tableWidth - 48;
  doc.setLineDashPattern([1.5, 1.2], 0);
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.35);
  doc.line(streamLegendX, legendY, streamLegendX + 6, legendY);
  doc.setLineDashPattern([], 0);
  doc.setFillColor(100, 116, 139);
  drawDiamondMarker(doc, streamLegendX + 3, legendY, 1.0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(0, 0, 0);
  doc.text('Stream mean', streamLegendX + 8, legendY + 0.8);

  // Legend 2: Learner (solid teal line with circle dot)
  const learnerLegendX = marginX + tableWidth - 18;
  doc.setDrawColor(13, 148, 136); // Teal #0D9488
  doc.setLineWidth(0.5);
  doc.line(learnerLegendX, legendY, learnerLegendX + 6, legendY);
  doc.setFillColor(13, 148, 136);
  doc.circle(learnerLegendX + 3, legendY, 1.0, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(13, 148, 136);
  doc.text('Learner', learnerLegendX + 8, legendY + 0.8);

  currentY += 3.5;

  // Plot Area geometry
  const plotYTop = currentY + 2.0;
  const plotHeight = 22.0;
  const plotYBottom = plotYTop + plotHeight;
  const plotXLeft = marginX + 11.0;
  const plotWidth = tableWidth - 13.0;

  // Horizontal Grid Lines (100%, 50%, 0%)
  const gridLevels = [
    { pct: 100, label: '100%' },
    { pct: 50, label: '50%' },
    { pct: 0, label: '0%' },
  ];

  doc.setLineWidth(0.12);
  doc.setDrawColor(220, 225, 230);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  doc.setTextColor(120, 120, 120);

  gridLevels.forEach((gl) => {
    const y = plotYBottom - (gl.pct / 100) * plotHeight;
    doc.line(plotXLeft, y, plotXLeft + plotWidth, y);
    doc.text(gl.label, plotXLeft - 2.0, y + 0.8, { align: 'right' });
  });

  const subjectCount = effectiveSubjects.length;
  const xStep = plotWidth / Math.max(1, subjectCount);

  // Data point structures for both series
  interface GraphPointData {
    x: number;
    y: number;
    val: number;
  }
  const streamPoints: (GraphPointData | null)[] = [];
  const learnerPoints: (GraphPointData | null)[] = [];

  effectiveSubjects.forEach((subject, idx) => {
    const x = plotXLeft + (idx + 0.5) * xStep;

    // Stream Mean point (rounded to whole number)
    const rawMean = data.streamSubjectAverages?.[subject.id];
    if (typeof rawMean === 'number' && Number.isFinite(rawMean)) {
      const roundedMean = Math.round(rawMean);
      const clampedMean = Math.min(100, Math.max(0, roundedMean));
      const y = plotYBottom - (clampedMean / 100) * plotHeight;
      streamPoints.push({ x, y, val: roundedMean });
    } else {
      streamPoints.push(null);
    }

    // Learner point
    const res = resultsBySubject.get(subject.id);
    const pct = res && res.isComplete && typeof res.terminalPercentage === 'number'
      ? res.terminalPercentage
      : null;
    if (typeof pct === 'number' && Number.isFinite(pct)) {
      const roundedPct = Math.round(pct);
      const clampedPct = Math.min(100, Math.max(0, roundedPct));
      const y = plotYBottom - (clampedPct / 100) * plotHeight;
      learnerPoints.push({ x, y, val: roundedPct });
    } else {
      learnerPoints.push(null);
    }
  });

  // Plot Series: Stream Mean (dashed slate line)
  let lastStreamPoint: GraphPointData | null = null;
  streamPoints.forEach((pt) => {
    if (pt) {
      if (lastStreamPoint) {
        doc.setLineDashPattern([1.5, 1.2], 0);
        doc.setDrawColor(100, 116, 139);
        doc.setLineWidth(0.35);
        doc.line(lastStreamPoint.x, lastStreamPoint.y, pt.x, pt.y);
        doc.setLineDashPattern([], 0);
      }
      lastStreamPoint = pt;
    } else {
      lastStreamPoint = null;
    }
  });

  // Plot Series: Learner (solid teal line)
  let lastLearnerPoint: GraphPointData | null = null;
  learnerPoints.forEach((pt) => {
    if (pt) {
      if (lastLearnerPoint) {
        doc.setDrawColor(13, 148, 136); // Teal #0D9488
        doc.setLineWidth(0.45);
        doc.line(lastLearnerPoint.x, lastLearnerPoint.y, pt.x, pt.y);
      }
      lastLearnerPoint = pt;
    } else {
      lastLearnerPoint = null;
    }
  });

  // Render Markers and Value Labels with Deterministic Collision Avoidance
  effectiveSubjects.forEach((subject, idx) => {
    const sPt = streamPoints[idx];
    const lPt = learnerPoints[idx];
    const x = plotXLeft + (idx + 0.5) * xStep;

    // Draw Stream marker (small dark dot on dashed line)
    if (sPt) {
      doc.setFillColor(71, 85, 105);
      doc.setDrawColor(71, 85, 105);
      doc.circle(sPt.x, sPt.y, 0.9, 'FD');
    }

    // Draw Learner marker (solid teal circle)
    if (lPt) {
      doc.setFillColor(13, 148, 136);
      doc.setDrawColor(13, 148, 136);
      doc.circle(lPt.x, lPt.y, 1.1, 'FD');
    }

    // Render value numbers according to collision avoidance rule
    if (lPt && sPt) {
      let lLabelY: number;
      let sLabelY: number;

      if (lPt.val > sPt.val) {
        // Learner above mean: learner number sits ABOVE green dot, mean number sits BELOW grey dot
        lLabelY = lPt.y - 2.5;
        sLabelY = sPt.y + 3.2;
      } else if (lPt.val < sPt.val) {
        // Learner below mean: learner number sits BELOW green dot, mean number sits ABOVE grey dot
        lLabelY = lPt.y + 3.2;
        sLabelY = sPt.y - 2.5;
      } else {
        // Equal: learner ABOVE, mean BELOW
        lLabelY = lPt.y - 2.5;
        sLabelY = sPt.y + 3.2;
      }

      // Boundary clamping to ensure labels stay within chart area
      if (lLabelY < plotYTop - 1.0) lLabelY = plotYTop - 0.5;
      if (sLabelY > plotYBottom + 0.5) sLabelY = plotYBottom - 0.5;

      // Draw Learner score (bold black)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.8);
      doc.setTextColor(0, 0, 0);
      doc.text(String(lPt.val), lPt.x, lLabelY, { align: 'center' });

      // Draw Stream mean (lighter grey)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(100, 116, 139);
      doc.text(String(sPt.val), sPt.x, sLabelY, { align: 'center' });
    } else if (lPt) {
      const lLabelY = lPt.val >= 95 ? lPt.y + 3.5 : lPt.y - 2.5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.8);
      doc.setTextColor(0, 0, 0);
      doc.text(String(lPt.val), lPt.x, lLabelY, { align: 'center' });
    } else if (sPt) {
      const sLabelY = sPt.val <= 5 ? sPt.y - 2.5 : sPt.y + 3.2;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(100, 116, 139);
      doc.text(String(sPt.val), sPt.x, sLabelY, { align: 'center' });
    }

    // X-Axis Canonical Subject Abbreviation
    const abbr = getJuniorSchoolSubjectAbbreviation(subject);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.0);
    doc.setTextColor(0, 0, 0);
    doc.text(abbr, x, plotYBottom + 3.8, { align: 'center' });
  });

  currentY = plotYBottom + 7.5;

  // -------------------------------------------------------------
  // 8. SIGNATURE BOXES (3 COLUMNS)
  // -------------------------------------------------------------
  let resolvedClassTeacher = teachers && classStream ? resolveClassTeacher(teachers, classStream) : null;
  if (!resolvedClassTeacher && teachers && teachers.length > 0) {
    if (resolvedRemarks.class_teacher_name) {
      const targetName = resolvedRemarks.class_teacher_name.toLowerCase().replace(/^(mr|mrs|ms|madam|dr|prof)\.?\s+/i, '').trim();
      resolvedClassTeacher = teachers.find(t => {
        const name = t.teacher_name.toLowerCase().replace(/^(mr|mrs|ms|madam|dr|prof)\.?\s+/i, '').trim();
        return (targetName.length > 1 && name.includes(targetName)) || (name.length > 1 && targetName.includes(name));
      }) || null;
    }
    if (!resolvedClassTeacher) {
      resolvedClassTeacher = teachers.find(t => t.is_class_teacher && t.signature_url) || teachers.find(t => !!t.signature_url) || null;
    }
  }

  const sigBoxW = (tableWidth - 4.0) / 3;
  const sigBoxH = 12.5;

  // Box 1: CLASS TEACHER
  const x1 = marginX;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.18);
  doc.rect(x1, currentY, sigBoxW, sigBoxH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(0, 0, 0);
  doc.text('CLASS TEACHER', x1 + sigBoxW / 2, currentY + 3.2, { align: 'center' });

  let ctSigDrawn = false;
  if (resolvedClassTeacher?.signature_url) {
    ctSigDrawn = drawPdfImage(
      doc,
      resolvedClassTeacher.signature_url,
      x1 + sigBoxW / 2 - 12,
      currentY + 3.8,
      24,
      5.5,
      `js_sig_ct_${resolvedClassTeacher.id || 'default'}`
    );
  }
  if (!ctSigDrawn) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text('Signature: _______', x1 + sigBoxW / 2, currentY + 9.5, { align: 'center' });
  }

  // Box 2: HEAD OF INSTITUTION
  const x2 = x1 + sigBoxW + 2.0;
  doc.rect(x2, currentY, sigBoxW, sigBoxH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('HEAD OF INSTITUTION', x2 + sigBoxW / 2, currentY + 3.2, { align: 'center' });

  let stampDrawn = false;
  if (school?.stamp_url) {
    stampDrawn = drawPdfImage(
      doc,
      school.stamp_url,
      x2 + sigBoxW / 2 - 12,
      currentY + 3.8,
      24,
      5.5,
      'js_school_stamp'
    );
  }
  if (!stampDrawn) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text('Sign & Seal: ______', x2 + sigBoxW / 2, currentY + 9.5, { align: 'center' });
  }

  // Box 3: PARENT / GUARDIAN
  const x3 = x2 + sigBoxW + 2.0;
  doc.rect(x3, currentY, sigBoxW, sigBoxH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('PARENT / GUARDIAN', x3 + sigBoxW / 2, currentY + 3.2, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('Signature: ______', x3 + sigBoxW / 2, currentY + 9.5, { align: 'center' });

  currentY += sigBoxH + 4.5;

  // -------------------------------------------------------------
  // 9. FOOTER: NEXT TERM OPENING DATE & GENERATION DATE
  // -------------------------------------------------------------
  const isG9T3 = isGrade9Term3Report({
    student,
    classStream,
    grade: classStream?.class_name || student.grade,
    term,
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(0, 0, 0);

  if (!isG9T3) {
    const openDateStr = nextTermOpeningDate
      ? formatKenyaDate(nextTermOpeningDate)
      : '____________________';
    doc.text(`NEXT TERM OPENING DATE: ${openDateStr}`, marginX, currentY);
  }

  const generatedDateStr = formatKenyaDate(new Date().toISOString());
  doc.text(`Generated: ${generatedDateStr}`, marginX + tableWidth, currentY, { align: 'right' });

  return doc;
}

/**
 * Download a single learner's Terminal Report PDF.
 */
export async function downloadSingleTerminalReportPDF(data: TerminalReportPDFData): Promise<void> {
  const doc = await buildTerminalReportDoc(data);
  const cleanAdm = (data.student.admission_number || 'Learner').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanName = (data.student.full_name || `${data.student.first_name || ''}_${data.student.last_name || ''}`)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanTerm = String(data.term).replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanYear = String(data.academicYear).replace(/[^a-zA-Z0-9_-]/g, '_');
  const modeTag = data.isProvisionalMode ? 'Provisional' : 'Official';

  const fileName = `Terminal_Report_${cleanAdm}_${cleanName}_${cleanYear}_${cleanTerm}_${modeTag}.pdf`;
  await savePdf(doc, fileName);
}

/**
 * Batch download Terminal Reports PDF for an entire cohort/class stream.
 * Creates a single combined master document where each learner's report starts cleanly.
 */
export async function downloadBatchTerminalReportsPDF(
  reportsData: TerminalReportPDFData[],
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  if (!reportsData || reportsData.length === 0) return;

  const total = reportsData.length;
  const masterDoc = ensureSafeJsPdf(
    new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  );

  // Pre-convert and cache school logo once before loop
  if (reportsData[0]?.school?.logo_url) {
    try {
      await getOptimizedTerminalLogo(reportsData[0].school.logo_url, 480, 0.88);
      await convertImageToMonochromeDataUrl(reportsData[0].school.logo_url);
    } catch {
      // ignore
    }
  }

  for (let i = 0; i < total; i++) {
    const reportItem = reportsData[i];
    if (onProgress) {
      onProgress(i + 1, total);
    }
    if (i > 0) {
      masterDoc.addPage('a4', 'portrait');
    }
    await buildTerminalReportDoc(reportItem, masterDoc);
    // Yield execution to browser event loop to smoothly update progress UI
    if (i % 3 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const firstItem = reportsData[0];
  const classNameStr = firstItem.classStream
    ? `${firstItem.classStream.class_name || ''}_${firstItem.classStream.stream || ''}`
    : 'Class';
  const cleanClass = classNameStr.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanYear = String(firstItem.academicYear).replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanTerm = String(firstItem.term).replace(/[^a-zA-Z0-9_-]/g, '_');
  const modeTag = firstItem.isProvisionalMode ? 'Provisional' : 'Official';

  const fileName = `Terminal_Reports_${cleanClass}_${cleanYear}_${cleanTerm}_${modeTag}.pdf`;
  await savePdf(masterDoc, fileName);
}
