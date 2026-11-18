import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Users,
  GraduationCap,
  Building2,
  ArrowRight,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AcademicYear, SchoolTerm, ClassStream, Student } from '../types';
import { syncFromSupabase } from '../lib/storage';
import {
  assessRolloverReadiness,
  ReadinessStatus,
  RolloverReadinessReport,
  DateReadinessCheck,
} from '../services/rolloverReadinessEngine';
import { formatKenyaDate } from '../utils/kenyaDateUtils';

interface RolloverReadinessReviewProps {
  academicYears: AcademicYear[];
  schoolTerms: SchoolTerm[];
  classes: ClassStream[];
  students: Student[];
  onNavigateToTab?: (tab: 'overview' | 'years' | 'terms') => void;
  onRefresh?: () => void | Promise<void>;
}

export const RolloverReadinessReview: React.FC<RolloverReadinessReviewProps> = ({
  academicYears = [],
  schoolTerms = [],
  classes = [],
  students = [],
  onNavigateToTab,
  onRefresh,
}) => {
  const [showEmptyLowerPrimary, setShowEmptyLowerPrimary] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [lastCheckedTime, setLastCheckedTime] = useState<string | null>(null);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        await syncFromSupabase({ force: true });
      }
      setJustRefreshed(true);
      const now = new Date();
      setLastCheckedTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      setTimeout(() => setJustRefreshed(false), 2500);
    } catch (err) {
      console.error('[RolloverReadinessReview] Refresh failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const report: RolloverReadinessReport = useMemo(() => {
    return assessRolloverReadiness({
      academicYears,
      schoolTerms,
      classes,
      students,
    });
  }, [academicYears, schoolTerms, classes, students]);

  const { overallStatus, summaryHeadline, summaryExplanation, datesCheck, classesCheck, learnersCheck } = report;

  // Deduplicate issues to prevent repeated notices
  const uniqueDateIssues = useMemo(() => Array.from(new Set(datesCheck.issues)), [datesCheck.issues]);
  const uniqueClassIssues = useMemo(() => Array.from(new Set(classesCheck.issues)), [classesCheck.issues]);
  const uniqueLearnerIssues = useMemo(() => Array.from(new Set(learnersCheck.issues)), [learnersCheck.issues]);

  const getStatusBadge = (status: ReadinessStatus) => {
    switch (status) {
      case 'ready':
        return (
          <span
            role="status"
            className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Ready for Review</span>
          </span>
        );
      case 'needs_attention':
        return (
          <span
            role="status"
            className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-300 dark:border-amber-700"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Needs Attention</span>
          </span>
        );
      case 'not_configured':
        return (
          <span
            role="status"
            className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-700"
          >
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>Not Configured</span>
          </span>
        );
    }
  };

  /**
   * Evaluates the upcoming destination year card status truthfully.
   * Never reports "Configured" if Term 1 is missing or has invalid dates.
   */
  const getUpcomingYearStatusBadge = (dates: DateReadinessCheck) => {
    if (!dates.hasUpcomingYear) {
      return (
        <span
          role="status"
          className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-700"
        >
          <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
          <span>Year Not Created</span>
        </span>
      );
    }
    if (!dates.hasUpcomingTerm1) {
      return (
        <span
          role="status"
          className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-300 dark:border-amber-700"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>Term 1 Missing</span>
        </span>
      );
    }
    if (!dates.hasValidTerm1Dates) {
      return (
        <span
          role="status"
          className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-300 dark:border-amber-700"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>Term 1 Dates Incomplete</span>
        </span>
      );
    }
    return (
      <span
        role="status"
        className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span>Fully Configured</span>
      </span>
    );
  };

  // Cohort progression display filtering:
  // - Grade 6, 7, 8, 9 are core rollover cohorts and always shown.
  // - Any grade with active learners (count > 0) or an issue is always shown.
  // - Lower primary grades with 0 learners and no issues are collapsed by default to reduce clutter.
  const coreGrades = new Set(['Grade 6', 'Grade 7', 'Grade 8', 'Grade 9']);
  const emptyLowerPrimaryMappings = classesCheck.cohortMappings.filter(
    (c) => !coreGrades.has(c.currentGrade) && c.currentLearnersCount === 0 && c.isSafe
  );
  const visibleCohortMappings = classesCheck.cohortMappings.filter(
    (c) =>
      showAllGradesOrHasLearners(c, coreGrades, showEmptyLowerPrimary)
  );

  function showAllGradesOrHasLearners(
    c: typeof classesCheck.cohortMappings[0],
    coreSet: Set<string>,
    expanded: boolean
  ): boolean {
    if (coreSet.has(c.currentGrade)) return true;
    if (c.currentLearnersCount > 0) return true;
    if (!c.isSafe) return true;
    return expanded;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ========================================================
          1. HEADER & OVERALL READINESS SUMMARY
         ======================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#075E42] bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                Pre-Rollover Audit
              </span>
              {getStatusBadge(overallStatus)}
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
              Academic-Year Rollover Readiness Review
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Pre-flight readiness audit for the next academic-year transition. Purely read-only; no student promotions or database changes occur here.
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end gap-1">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="self-start md:self-auto min-h-[38px] text-xs font-semibold px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center space-x-1.5 cursor-pointer active:scale-95 transition disabled:opacity-60 disabled:cursor-not-allowed"
              aria-label="Refresh Rollover Readiness Check"
            >
              {justRefreshed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isRefreshing ? 'animate-spin text-[#176B45]' : ''}`} />
              )}
              <span>{isRefreshing ? 'Checking...' : justRefreshed ? 'Check Updated' : 'Refresh Check'}</span>
            </button>
            {lastCheckedTime && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                Last checked: {lastCheckedTime}
              </span>
            )}
          </div>
        </div>

        {/* Overall Status Banner */}
        <div
          className={`mt-4 p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
            overallStatus === 'ready'
              ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300/80 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100'
              : overallStatus === 'needs_attention'
              ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300/80 dark:border-amber-800 text-amber-950 dark:text-amber-100'
              : 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300/80 dark:border-rose-800 text-rose-950 dark:text-rose-100'
          }`}
        >
          <div className="flex items-start space-x-3 min-w-0">
            <div className="shrink-0 mt-0.5">
              {overallStatus === 'ready' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              ) : overallStatus === 'needs_attention' ? (
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              )}
            </div>
            <div className="space-y-0.5 min-w-0">
              <h4 className="text-sm font-bold">{summaryHeadline}</h4>
              <p className="text-xs leading-relaxed opacity-95">{summaryExplanation}</p>
            </div>
          </div>

          {/* Quick Action Button for Mobile / Prominent Navigation */}
          {onNavigateToTab && overallStatus !== 'ready' && (
            <button
              type="button"
              onClick={() => onNavigateToTab('years')}
              className="w-full sm:w-auto shrink-0 min-h-[40px] inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-[#176B45] hover:bg-[#0F5132] active:bg-[#075E42] transition shadow-xs cursor-pointer focus-visible:outline-2"
            >
              <span>Setup Academic Dates</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          )}
        </div>

        {/* Quick KPI Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mt-4">
          <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200/70 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block truncate">
              Evaluated Learners
            </span>
            <span className="text-lg font-extrabold text-slate-900 dark:text-slate-100 block">
              {learnersCheck.totalActiveLearners}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
              Grades 6–9 in scope
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200/70 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block truncate">
              Standard Progression (G6–G8)
            </span>
            <span className="text-lg font-extrabold text-[#176B45] dark:text-emerald-400 block">
              {learnersCheck.promotableLearnersCount}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
              Advancing 1 grade level
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200/70 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block truncate">
              Graduating (Grade 9)
            </span>
            <span className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400 block">
              {learnersCheck.graduatingLearnersCount}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
              Exits to Senior School
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200/70 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block truncate">
              Active Cohorts
            </span>
            <span className="text-lg font-extrabold text-slate-900 dark:text-slate-100 block">
              {classesCheck.cohortMappings.filter((c) => c.currentLearnersCount > 0).length}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
              Grades with enrolled learners
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================
          2. SECTION A: ACADEMIC-YEAR AND TERM DATES
         ======================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-[#176B45] dark:text-emerald-400 shrink-0" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              A. Academic-Year & Term Dates
            </h3>
          </div>
          {getStatusBadge(datesCheck.status)}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {/* Active Year Card */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Current Academic Year
              </span>
              <span
                role="status"
                className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Active</span>
              </span>
            </div>
            {datesCheck.activeYear ? (
              <div className="space-y-1">
                <div className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Academic Year {datesCheck.activeYear.year}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                  <div>
                    Closing Date:{' '}
                    {datesCheck.activeYearEndDate ? (
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {formatKenyaDate(datesCheck.activeYearEndDate)}
                      </span>
                    ) : (
                      <span className="font-semibold text-rose-600 dark:text-rose-400">
                        Not Configured (neither year end date nor Term 3 closing date found)
                      </span>
                    )}
                  </div>
                  {datesCheck.activeYearEndDateSource === 'term_3_closing_date' && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                      Source: Active Term 3 closing date
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
                No active academic year found in the database.
              </p>
            )}
          </div>

          {/* Upcoming Year Card - Truthful Status & No False "Configured" */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Upcoming Academic Year
              </span>
              {getUpcomingYearStatusBadge(datesCheck)}
            </div>

            <div className="space-y-1">
              <div className="text-base font-bold text-slate-900 dark:text-slate-100">
                Academic Year {datesCheck.upcomingYearNumber || 'Upcoming'}
              </div>

              {datesCheck.hasUpcomingYear ? (
                <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Term 1 Record:</span>
                    {datesCheck.hasUpcomingTerm1 ? (
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400 inline-flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Created ({datesCheck.upcomingTerm1?.status})</span>
                      </span>
                    ) : (
                      <span className="font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center space-x-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Not Created in Database</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Term 1 Opening:</span>
                    {datesCheck.term1OpeningDate ? (
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {formatKenyaDate(datesCheck.term1OpeningDate)}
                      </span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400 font-semibold inline-flex items-center space-x-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Not Configured</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Term 1 Closing:</span>
                    {datesCheck.term1ClosingDate ? (
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {formatKenyaDate(datesCheck.term1ClosingDate)}
                      </span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400 font-semibold inline-flex items-center space-x-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Not Configured</span>
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
                  Upcoming Academic Year {datesCheck.upcomingYearNumber} must be registered in Academic Session Control before rollover can proceed.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Date Issues / Explanations & Mobile-Optimized Action Button */}
        {uniqueDateIssues.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-3.5 text-xs space-y-2">
            <span className="font-bold text-amber-900 dark:text-amber-200 block">
              Required Date Actions:
            </span>
            <ul className="list-disc list-inside space-y-1 text-amber-800 dark:text-amber-300">
              {uniqueDateIssues.map((iss, i) => (
                <li key={i}>{iss}</li>
              ))}
            </ul>

            {onNavigateToTab && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onNavigateToTab('years')}
                  className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-bold text-white bg-[#176B45] hover:bg-[#0F5132] active:bg-[#075E42] transition shadow-xs cursor-pointer focus-visible:outline-2"
                >
                  <span>Go to Academic Years & Term Setup</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================
          3. SECTION B: CLASSES AND STREAMS
         ======================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Building2 className="w-5 h-5 text-[#176B45] dark:text-emerald-400 shrink-0" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              B. Classes & Destination Streams
            </h3>
          </div>
          {getStatusBadge(classesCheck.status)}
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400">
          Verifies that each advancing learner cohort has an active destination stream configured in the school registry.
        </p>

        {/* Class issues if any */}
        {uniqueClassIssues.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-3.5 text-xs space-y-1">
            <span className="font-bold text-amber-900 dark:text-amber-200 block">
              Stream Mapping Notices:
            </span>
            <ul className="list-disc list-inside space-y-1 text-amber-800 dark:text-amber-300">
              {uniqueClassIssues.map((iss, i) => (
                <li key={i}>{iss}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Cohort Progression Matrix - Mobile-friendly with min width, badge chips, and clear Grade 9 styling */}
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-xs text-left min-w-[620px]">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-2.5 px-3 font-semibold w-28">Current Grade</th>
                <th className="py-2.5 px-3 font-semibold w-28">Active Learners</th>
                <th className="py-2.5 px-3 font-semibold w-40">Destination</th>
                <th className="py-2.5 px-3 font-semibold">Destination Streams</th>
                <th className="py-2.5 px-3 font-semibold text-right w-44">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleCohortMappings.map((c, idx) => {
                const isGrade9 = c.targetGrade === 'Graduated';

                return (
                  <tr
                    key={idx}
                    className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors ${
                      !c.isSafe
                        ? 'bg-amber-50/40 dark:bg-amber-950/20'
                        : isGrade9
                        ? 'bg-indigo-50/25 dark:bg-indigo-950/15'
                        : ''
                    }`}
                  >
                    <td className="py-3 px-3">
                      <span className="font-bold text-slate-900 dark:text-slate-100 block">
                        {c.currentGrade}
                      </span>
                      {isGrade9 && (
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold block">
                          Junior School Exit
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-slate-700 dark:text-slate-300">
                      <span className="font-semibold">{c.currentLearnersCount}</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1">
                        {c.currentLearnersCount === 1 ? 'learner' : 'learners'}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      {isGrade9 ? (
                        <span className="inline-flex items-center space-x-1 font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 text-[11px]">
                          <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                          <span>Senior School Transition</span>
                        </span>
                      ) : (
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {c.targetGrade}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      {isGrade9 ? (
                        <span className="text-slate-500 dark:text-slate-400 italic text-[11px]">
                          External placement (No junior-school stream required)
                        </span>
                      ) : c.availableStreams.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {c.availableStreams.map((st, sIdx) => (
                            <span
                              key={sIdx}
                              className="inline-block px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded text-[11px] font-medium border border-slate-200/80 dark:border-slate-700"
                            >
                              {st}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400 font-semibold text-[11px]">
                          No active streams registered
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right">
                      {isGrade9 ? (
                        <span
                          role="status"
                          className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-900 dark:bg-indigo-950/70 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800"
                        >
                          <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                          <span>Graduating Cohort</span>
                        </span>
                      ) : c.isSafe ? (
                        <span
                          role="status"
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Destination Ready</span>
                        </span>
                      ) : (
                        <span
                          role="status"
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>Missing Destination</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Collapsible toggle for empty lower-primary rows to avoid visual clutter */}
        {emptyLowerPrimaryMappings.length > 0 && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowEmptyLowerPrimary((prev) => !prev)}
              className="inline-flex items-center space-x-1 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
            >
              {showEmptyLowerPrimary ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Hide empty lower-primary grades ({emptyLowerPrimaryMappings.length})</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Show empty lower-primary grades ({emptyLowerPrimaryMappings.length} with 0 active learners)</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ========================================================
          4. SECTION C: LEARNER READINESS
         ======================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-[#176B45] dark:text-emerald-400 shrink-0" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              C. Learner Cohorts & Identity Integrity
            </h3>
          </div>
          {getStatusBadge(learnersCheck.status)}
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400">
          Audits active learners for integrity, verifying that all eligible learners have valid class stream assignments and unique admission numbers.
        </p>

        {/* Breakdown Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200/70 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block truncate">
              Advancing Learners (Grades 6–8)
            </span>
            <span className="text-base font-extrabold text-[#176B45] dark:text-emerald-400 block">
              {learnersCheck.promotableLearnersCount} Learners
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
              Grade 6, 7, and 8 advancing 1 grade level
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200/70 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block truncate">
              Graduating Learners (Grade 9)
            </span>
            <span className="text-base font-extrabold text-indigo-600 dark:text-indigo-400 block">
              {learnersCheck.graduatingLearnersCount} Learners
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
              Exits to Senior School
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200/70 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block truncate">
              Learners Needing Attention
            </span>
            <span
              className={`text-base font-extrabold block ${
                learnersCheck.unassignedLearnersCount > 0 ||
                learnersCheck.invalidClassLearnersCount > 0 ||
                learnersCheck.duplicateAdmissionNumbers.length > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {learnersCheck.unassignedLearnersCount +
                learnersCheck.invalidClassLearnersCount +
                learnersCheck.duplicateAdmissionNumbers.length}{' '}
              Flagged
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
              Unassigned, orphaned, or duplicate admissions
            </span>
          </div>
        </div>

        {/* Detailed Learner Warnings if any */}
        {uniqueLearnerIssues.length > 0 ? (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-3.5 text-xs space-y-2">
            <span className="font-bold text-amber-900 dark:text-amber-200 block">
              Learner Registry Warnings:
            </span>
            <ul className="list-disc list-inside space-y-1 text-amber-800 dark:text-amber-300">
              {uniqueLearnerIssues.map((iss, i) => (
                <li key={i}>{iss}</li>
              ))}
            </ul>

            {learnersCheck.duplicateAdmissionNumbers.length > 0 && (
              <div className="pt-2 space-y-1">
                <span className="font-bold text-amber-900 dark:text-amber-200 block">
                  Duplicate Admission Numbers:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {learnersCheck.duplicateAdmissionNumbers.map((d, i) => (
                    <span
                      key={i}
                      className="bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded text-[11px] font-mono"
                      title={d.studentNames.join(', ')}
                    >
                      {d.admissionNumber} ({d.count} learners: {d.studentNames.join(', ')})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center space-x-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>All active learners in scope have valid class stream assignments and unique admission numbers.</span>
          </div>
        )}
      </div>

      {/* ========================================================
          5. READ-ONLY SAFETY ADVISORY (NO ROLLOVER EXECUTION BUTTON)
         ======================================================== */}
      <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-start space-x-3 text-xs text-slate-600 dark:text-slate-400">
        <Info className="w-4 h-4 text-[#176B45] dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-bold text-slate-800 dark:text-slate-200">
            Pre-Flight Safety Notice
          </p>
          <p className="leading-relaxed">
            This review screen is strictly informational. It does not invoke the database rollover function, does not modify any learner records, and does not alter academic session dates. To address any flagged items, navigate to Class Management or Academic Session Control.
          </p>
        </div>
      </div>
    </div>
  );
};
