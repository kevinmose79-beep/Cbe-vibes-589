import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Lock,
  Unlock,
  Archive,
  Plus,
  Edit2,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  CalendarDays,
  ChevronRight,
  Info,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import {
  AcademicYear,
  SchoolTerm,
  AcademicYearStatus,
  TermStatus,
  TermName,
  Role,
  ClassStream,
  Student,
} from '../types';
import { api, generateUUID, syncFromSupabase } from '../lib/storage';
import { getTermStatusFromDates } from '../utils/termStatusUtils';
import { getKenyaCalendarToday, formatKenyaDate } from '../utils/kenyaDateUtils';
import { getUpcomingTermReminder } from '../utils/termReminderUtils';
import { AcademicTermReminderBanner } from './AcademicTermReminderBanner';
import { getAcademicYearRolloverReminder } from '../utils/academicYearReminderUtils';
import { AcademicYearRolloverReminderBanner } from './AcademicYearRolloverReminderBanner';
import { RolloverReadinessReview } from './RolloverReadinessReview';
import { useAcademicSession } from '../contexts/AcademicSessionContext';

interface AcademicSessionManagementProps {
  userRole?: Role;
  onSessionUpdated?: () => void;
  isModal?: boolean;
  onCloseModal?: () => void;
}

export const AcademicSessionManagement: React.FC<AcademicSessionManagementProps> = ({
  userRole = 'admin',
  onSessionUpdated,
  isModal = false,
}) => {
  const isAdmin = userRole === 'admin' || userRole === 'administrator' || String(userRole).toLowerCase() === 'admin';
  const { resetToActiveSession } = useAcademicSession();
  const hasResetOnMountRef = useRef(false);

  useEffect(() => {
    if (!hasResetOnMountRef.current) {
      hasResetOnMountRef.current = true;
      resetToActiveSession();
    }
  }, [resetToActiveSession]);

  // State
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>(() => api.getAcademicYears());
  const [activeYear, setActiveYear] = useState<AcademicYear>(() => api.getActiveAcademicYear());
  const [selectedYearId, setSelectedYearId] = useState<string>(() => api.getActiveAcademicYear().id);

  const [terms, setTerms] = useState<SchoolTerm[]>(() => api.getSchoolTerms());
  const [activeTerm, setActiveTerm] = useState<SchoolTerm | null>(() => api.getActiveTerm());

  const [classes, setClasses] = useState<ClassStream[]>(() => api.getClasses());
  const [students, setStudents] = useState<Student[]>(() => api.getStudents());

  const [activeTab, setActiveTab] = useState<'overview' | 'years' | 'terms' | 'rollover-readiness'>(() => {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const target = window.sessionStorage.getItem('cbe_target_academic_session_tab');
        if (target === 'rollover-readiness' || target === 'years' || target === 'terms' || target === 'overview') {
          window.sessionStorage.removeItem('cbe_target_academic_session_tab');
          return target as any;
        }
      } catch {
        // ignore
      }
    }
    return 'overview';
  });

  // Form modals
  const [showYearModal, setShowYearModal] = useState(false);
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null);
  const [inputYearNumber, setInputYearNumber] = useState<number>(new Date().getFullYear() + 1);
  const [inputYearStatus, setInputYearStatus] = useState<AcademicYearStatus>('Upcoming');
  const [yearModalError, setYearModalError] = useState<string | null>(null);

  const [showTermModal, setShowTermModal] = useState(false);
  const [editingTerm, setEditingTerm] = useState<SchoolTerm | null>(null);
  const [inputTermName, setInputTermName] = useState<TermName>('Term 1');
  const [inputTermYearId, setInputTermYearId] = useState<string>(selectedYearId);
  const [inputOpeningDate, setInputOpeningDate] = useState<string>('');
  const [inputClosingDate, setInputClosingDate] = useState<string>('');
  const [inputMidOpeningDate, setInputMidOpeningDate] = useState<string>('');
  const [inputMidClosingDate, setInputMidClosingDate] = useState<string>('');
  const [inputTermStatus, setInputTermStatus] = useState<TermStatus>('Upcoming');
  const [termModalError, setTermModalError] = useState<string | null>(null);

  // Deletion modals state
  const [deleteConfirmYear, setDeleteConfirmYear] = useState<AcademicYear | null>(null);
  const [deleteConfirmTerm, setDeleteConfirmTerm] = useState<SchoolTerm | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteModalError, setDeleteModalError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Term Reactivation modal state
  const [reactivateModalTerm, setReactivateModalTerm] = useState<SchoolTerm | null>(null);
  const [reactivateReason, setReactivateReason] = useState<string>('');
  const [reactivateError, setReactivateError] = useState<string | null>(null);
  const [isReactivating, setIsReactivating] = useState<boolean>(false);

  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [rolloverReminderDismissed, setRolloverReminderDismissed] = useState(false);

  const termReminder = isAdmin && !reminderDismissed
    ? getUpcomingTermReminder({
        schoolTerms: terms,
        activeTerm,
        activeAcademicYear: activeYear,
        checkDismissed: true,
      })
    : null;

  const rolloverReminder = isAdmin && !rolloverReminderDismissed
    ? getAcademicYearRolloverReminder({
        activeAcademicYear: activeYear,
        schoolTerms: terms,
        checkDismissed: true,
      })
    : null;

  const refreshData = async () => {
    // 1. Immediate local state update for instantaneous, lag-free UI feedback
    const updatedYears = api.getAcademicYears();
    const currentActiveYear = api.getActiveAcademicYear();
    const updatedTerms = api.getSchoolTerms();
    const currentActiveTerm = api.getActiveTerm();
    const updatedClasses = api.getClasses();
    const updatedStudents = api.getStudents();

    setAcademicYears(updatedYears);
    setActiveYear(currentActiveYear);
    setTerms(updatedTerms);
    setActiveTerm(currentActiveTerm);
    setClasses(updatedClasses);
    setStudents(updatedStudents);
    window.dispatchEvent(new Event('session-changed'));

    if (onSessionUpdated) {
      onSessionUpdated();
    }

    // 2. Authoritative background sync from Supabase to preserve single source of truth
    try {
      await syncFromSupabase({ force: true });
      const freshYears = api.getAcademicYears();
      const freshActiveYear = api.getActiveAcademicYear();
      const freshTerms = api.getSchoolTerms();
      const freshActiveTerm = api.getActiveTerm();
      setAcademicYears(freshYears);
      setActiveYear(freshActiveYear);
      setTerms(freshTerms);
      setActiveTerm(freshActiveTerm);
    } catch (err) {
      console.warn('[AcademicSessionManagement] Sync from Supabase warning:', err);
    }
  };

  const showFeedback = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // --- ACADEMIC YEAR HANDLERS ---
  const handleOpenNewYearModal = () => {
    if (!isAdmin) return;
    setEditingYear(null);
    setInputYearNumber(new Date().getFullYear() + 1);
    setInputYearStatus('Upcoming');
    setYearModalError(null);
    setShowYearModal(true);
  };

  const handleOpenEditYearModal = (year: AcademicYear) => {
    if (!isAdmin) return;
    setEditingYear(year);
    setInputYearNumber(year.year);
    setInputYearStatus(year.status);
    setYearModalError(null);
    setShowYearModal(true);
  };

  const handleSaveAcademicYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setYearModalError('Only administrators can manage academic years.');
      return;
    }
    if (processingId) return;

    if (!inputYearNumber || inputYearNumber < 2000 || inputYearNumber > 2100) {
      const msg = 'Please enter a valid year between 2000 and 2100.';
      setYearModalError(msg);
      showFeedback(msg, 'error');
      return;
    }

    const todayStr = new Date().toISOString();
    setProcessingId('save-year');
    setYearModalError(null);

    try {
      if (editingYear) {
        const updated: AcademicYear = {
          ...editingYear,
          year: inputYearNumber,
          status: inputYearStatus,
          updated_at: todayStr,
        };
        await api.updateAcademicYear(updated);
        if (inputYearStatus === 'Active') {
          await api.setActiveAcademicYear(editingYear.id);
          resetToActiveSession();
        }
        showFeedback(`Academic Year ${inputYearNumber} updated successfully.`);
      } else {
        if (academicYears.some((y) => y.year === inputYearNumber)) {
          const msg = `Academic Year ${inputYearNumber} already exists.`;
          setYearModalError(msg);
          showFeedback(msg, 'error');
          setProcessingId(null);
          return;
        }

        const newYearObj: AcademicYear = {
          id: generateUUID(),
          year: inputYearNumber,
          status: inputYearStatus,
          created_at: todayStr,
          updated_at: todayStr,
        };

        const savedYear = await api.addAcademicYear(newYearObj);
        const resolvedAyId = savedYear.id;

        // Standard dates template based on official Kenyan basic-education calendar
        const defaultTerms: SchoolTerm[] = [
          {
            id: generateUUID(),
            academic_year_id: resolvedAyId,
            year: inputYearNumber,
            term_name: 'Term 1',
            opening_date: `${inputYearNumber}-01-06`,
            closing_date: `${inputYearNumber}-04-02`,
            mid_term_opening_date: `${inputYearNumber}-02-25`,
            mid_term_closing_date: `${inputYearNumber}-03-01`,
            status: 'Upcoming',
            created_at: todayStr,
            updated_at: todayStr,
          },
          {
            id: generateUUID(),
            academic_year_id: resolvedAyId,
            year: inputYearNumber,
            term_name: 'Term 2',
            opening_date: `${inputYearNumber}-04-27`,
            closing_date: `${inputYearNumber}-07-31`,
            mid_term_opening_date: `${inputYearNumber}-06-24`,
            mid_term_closing_date: `${inputYearNumber}-06-28`,
            status: 'Upcoming',
            created_at: todayStr,
            updated_at: todayStr,
          },
          {
            id: generateUUID(),
            academic_year_id: resolvedAyId,
            year: inputYearNumber,
            term_name: 'Term 3',
            opening_date: `${inputYearNumber}-08-24`,
            closing_date: `${inputYearNumber}-10-23`,
            status: 'Upcoming',
            created_at: todayStr,
            updated_at: todayStr,
          },
        ];

        for (const term of defaultTerms) {
          await api.addSchoolTerm(term);
        }
        showFeedback(`Academic Year ${inputYearNumber} created with 3 standard terms.`);
      }

      setShowYearModal(false);
      setYearModalError(null);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to save academic year:', err);
      const errMsg = err?.message || 'Failed to save academic year.';
      setYearModalError(errMsg);
      showFeedback(errMsg, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleActivateYear = async (yearId: string) => {
    if (!isAdmin || processingId) return;
    const target = academicYears.find((y) => y.id === yearId);
    if (!target) return;

    setProcessingId(`activate-year-${yearId}`);
    try {
      await api.setActiveAcademicYear(yearId);
      showFeedback(`Academic Year ${target.year} set as ACTIVE.`);
      setSelectedYearId(yearId);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to activate academic year:', err);
      showFeedback(err?.message || 'Failed to activate academic year.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleArchiveYear = async (year: AcademicYear) => {
    if (!isAdmin || processingId) return;
    if (year.status === 'Active') {
      showFeedback('Cannot archive the current ACTIVE academic year. Activate another year first.', 'error');
      return;
    }
    setProcessingId(`archive-year-${year.id}`);
    try {
      const updated: AcademicYear = { ...year, status: 'Archived', updated_at: new Date().toISOString() };
      await api.updateAcademicYear(updated);
      showFeedback(`Academic Year ${year.year} has been archived.`);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to archive academic year:', err);
      showFeedback(err?.message || 'Failed to archive academic year.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReopenYear = async (year: AcademicYear) => {
    if (!isAdmin || processingId) return;
    setProcessingId(`reopen-year-${year.id}`);
    try {
      const updated: AcademicYear = { ...year, status: 'Closed', updated_at: new Date().toISOString() };
      await api.updateAcademicYear(updated);
      showFeedback(`Academic Year ${year.year} has been reopened to Closed status.`);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to reopen academic year:', err);
      showFeedback(err?.message || 'Failed to reopen academic year.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // --- TERM HANDLERS ---
  const handleOpenNewTermModal = () => {
    if (!isAdmin) return;
    const activeY = academicYears.find((y) => y.id === selectedYearId) || activeYear;
    setEditingTerm(null);
    setInputTermYearId(activeY.id);
    setInputTermName('Term 1');
    setInputOpeningDate(`${activeY.year}-01-06`);
    setInputClosingDate(`${activeY.year}-04-02`);
    setInputMidOpeningDate(`${activeY.year}-02-25`);
    setInputMidClosingDate(`${activeY.year}-03-01`);
    setInputTermStatus('Upcoming');
    setTermModalError(null);
    setShowTermModal(true);
  };

  const handleOpenEditTermModal = (term: SchoolTerm) => {
    if (!isAdmin) return;
    setEditingTerm(term);
    const matchedAy = academicYears.find((y) => y.id === term.academic_year_id || y.year === term.year);
    setInputTermYearId(matchedAy ? matchedAy.id : term.academic_year_id);
    setInputTermName(term.term_name);
    setInputOpeningDate(term.opening_date);
    setInputClosingDate(term.closing_date);
    setInputMidOpeningDate(term.mid_term_opening_date || '');
    setInputMidClosingDate(term.mid_term_closing_date || '');
    setInputTermStatus(term.status);
    setTermModalError(null);
    setShowTermModal(true);
  };

  const handleSaveTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setTermModalError('Only administrators can create or edit school terms.');
      return;
    }
    if (processingId) return;

    if (!inputOpeningDate || !inputClosingDate) {
      const msg = 'Opening and Closing dates are required for the term.';
      setTermModalError(msg);
      showFeedback(msg, 'error');
      return;
    }

    if (inputClosingDate < inputOpeningDate) {
      const msg = 'Closing date cannot be earlier than opening date.';
      setTermModalError(msg);
      showFeedback(msg, 'error');
      return;
    }

    if (inputMidOpeningDate && inputMidClosingDate && inputMidClosingDate < inputMidOpeningDate) {
      const msg = 'Mid-term closing date cannot be earlier than mid-term opening date.';
      setTermModalError(msg);
      showFeedback(msg, 'error');
      return;
    }

    const selectedAyObj =
      academicYears.find((y) => y.id === inputTermYearId || y.year.toString() === inputTermYearId) ||
      academicYears.find((y) => y.year === (editingTerm ? editingTerm.year : undefined)) ||
      activeYear ||
      academicYears[0];

    const todayStr = new Date().toISOString();
    const todayDateStr = getKenyaCalendarToday();

    // If activating, softly align opening date so it is immediately operationally active
    let openingDateToSave = inputOpeningDate;
    if (inputTermStatus === 'Active' && inputOpeningDate > todayDateStr) {
      openingDateToSave = todayDateStr;
    }

    setProcessingId('save-term');
    setTermModalError(null);

    try {
      if (editingTerm) {
        const updated: SchoolTerm = {
          ...editingTerm,
          academic_year_id: selectedAyObj.id,
          year: selectedAyObj.year,
          term_name: inputTermName,
          opening_date: openingDateToSave,
          closing_date: inputClosingDate,
          mid_term_opening_date: inputMidOpeningDate || undefined,
          mid_term_closing_date: inputMidClosingDate || undefined,
          status: inputTermStatus,
          updated_at: todayStr,
        };
        const saved = await api.updateSchoolTerm(updated);
        if (inputTermStatus === 'Active') {
          await api.setActiveTerm(saved.id || editingTerm.id);
          resetToActiveSession();
        }
        showFeedback(`${inputTermName} (${selectedAyObj.year}) updated successfully.`);
      } else {
        const newTerm: SchoolTerm = {
          id: generateUUID(),
          academic_year_id: selectedAyObj.id,
          year: selectedAyObj.year,
          term_name: inputTermName,
          opening_date: openingDateToSave,
          closing_date: inputClosingDate,
          mid_term_opening_date: inputMidOpeningDate || undefined,
          mid_term_closing_date: inputMidClosingDate || undefined,
          status: inputTermStatus,
          created_at: todayStr,
          updated_at: todayStr,
        };
        const saved = await api.addSchoolTerm(newTerm);
        if (inputTermStatus === 'Active') {
          await api.setActiveTerm(saved.id);
          resetToActiveSession();
        }
        showFeedback(`${inputTermName} (${selectedAyObj.year}) created successfully.`);
      }

      setShowTermModal(false);
      setTermModalError(null);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to save school term:', err);
      const errMsg = err?.message || 'Failed to save school term.';
      setTermModalError(errMsg);
      showFeedback(errMsg, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleActivateTerm = async (termId: string) => {
    if (!isAdmin || processingId) return;
    const target = terms.find((t) => t.id === termId);
    if (!target) return;

    setProcessingId(`activate-term-${termId}`);
    try {
      const todayStr = getKenyaCalendarToday();

      // If scheduled opening date is in the future, softly adjust opening date to today so the term is immediately and operationally active
      if (target.opening_date && todayStr < target.opening_date) {
        await api.updateSchoolTerm({
          ...target,
          opening_date: todayStr,
        });
      }

      const parentYear = academicYears.find((y) => y.id === target.academic_year_id || y.year === target.year);
      if (parentYear && parentYear.status !== 'Active') {
        await api.setActiveAcademicYear(parentYear.id);
      }

      await api.setActiveTerm(termId);
      resetToActiveSession();
      showFeedback(`${target.term_name} (${target.year}) set as ACTIVE. Marks entry and assessment active.`);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to activate school term:', err);
      showFeedback(err?.message || 'Failed to activate school term.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleCloseTerm = async (term: SchoolTerm) => {
    if (!isAdmin || processingId) return;
    setProcessingId(`close-term-${term.id}`);
    try {
      const updated: SchoolTerm = { ...term, status: 'Closed', updated_at: new Date().toISOString() };
      await api.updateSchoolTerm(updated);
      resetToActiveSession();
      showFeedback(`${term.term_name} (${term.year}) is now CLOSED. Marks entry locked.`);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to close school term:', err);
      showFeedback(err?.message || 'Failed to close school term.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReopenTerm = async (term: SchoolTerm) => {
    if (!isAdmin || processingId) return;
    setProcessingId(`reopen-term-${term.id}`);
    try {
      const todayStr = getKenyaCalendarToday();
      let updatedTerm = { ...term };
      if (term.opening_date && todayStr < term.opening_date) {
        updatedTerm.opening_date = todayStr;
        await api.updateSchoolTerm(updatedTerm);
      }

      const parentYear = academicYears.find((y) => y.id === term.academic_year_id || y.year === term.year);
      if (parentYear && parentYear.status !== 'Active') {
        await api.setActiveAcademicYear(parentYear.id);
      }

      await api.setActiveTerm(term.id);
      resetToActiveSession();
      showFeedback(`${term.term_name} (${term.year}) has been REOPENED as ACTIVE.`);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to reopen school term:', err);
      showFeedback(err?.message || 'Failed to reopen school term.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleLockTerm = async (term: SchoolTerm) => {
    if (!isAdmin || processingId) return;
    setProcessingId(`lock-term-${term.id}`);
    try {
      const updated: SchoolTerm = { ...term, status: 'Locked', updated_at: new Date().toISOString() };
      await api.updateSchoolTerm(updated);
      showFeedback(`${term.term_name} (${term.year}) is now LOCKED.`);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to lock term:', err);
      showFeedback(err?.message || 'Failed to lock term.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleUnlockTerm = async (term: SchoolTerm) => {
    if (!isAdmin || processingId) return;
    setProcessingId(`unlock-term-${term.id}`);
    try {
      const updated: SchoolTerm = { ...term, status: 'Closed', updated_at: new Date().toISOString() };
      await api.updateSchoolTerm(updated);
      showFeedback(`${term.term_name} (${term.year}) is now UNLOCKED to Closed.`);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to unlock term:', err);
      showFeedback(err?.message || 'Failed to unlock term.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleArchiveTerm = async (term: SchoolTerm) => {
    if (!isAdmin || processingId) return;
    if (term.status === 'Active') {
      showFeedback('Cannot archive an active term. Close or activate another term first.', 'error');
      return;
    }
    setProcessingId(`archive-term-${term.id}`);
    try {
      const updated: SchoolTerm = { ...term, status: 'Archived', updated_at: new Date().toISOString() };
      await api.updateSchoolTerm(updated);
      showFeedback(`${term.term_name} (${term.year}) archived.`);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to archive school term:', err);
      showFeedback(err?.message || 'Failed to archive school term.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleOpenReactivateModal = (term: SchoolTerm) => {
    if (!isAdmin) return;
    setReactivateModalTerm(term);
    setReactivateReason('');
    setReactivateError(null);
  };

  const handleConfirmReactivateTerm = async () => {
    if (!isAdmin || !reactivateModalTerm || isReactivating) return;

    const trimmedReason = reactivateReason.trim();
    if (!trimmedReason) {
      setReactivateError('Please provide a reason for reactivating this academic term.');
      return;
    }

    setIsReactivating(true);
    setReactivateError(null);
    setProcessingId(`reactivate-term-${reactivateModalTerm.id}`);

    try {
      await api.reactivateSchoolTerm(reactivateModalTerm.id, trimmedReason);
      resetToActiveSession();
      showFeedback(`${reactivateModalTerm.term_name} (${reactivateModalTerm.year}) has been REACTIVATED for official corrections.`);
      setReactivateModalTerm(null);
      setReactivateReason('');
      await refreshData();
    } catch (err: any) {
      console.error('Failed to reactivate school term:', err);
      const errMsg = err?.message || 'Failed to reactivate school term.';
      setReactivateError(errMsg);
      showFeedback(errMsg, 'error');
    } finally {
      setIsReactivating(false);
      setProcessingId(null);
    }
  };

  // --- SAFE CONDITIONAL DELETION HANDLERS ---
  const handleDeleteYearClick = async (ay: AcademicYear) => {
    if (!isAdmin) return;
    const check = await api.checkAcademicYearCanBeDeleted(ay.id);
    if (!check.canDelete) {
      showFeedback(check.reason || 'This academic year contains academic records and cannot be deleted.', 'error');
      return;
    }
    setDeleteConfirmYear(ay);
  };

  const handleConfirmDeleteYear = async () => {
    if (!deleteConfirmYear || isDeleting) return;
    setIsDeleting(true);

    const recheck = await api.checkAcademicYearCanBeDeleted(deleteConfirmYear.id);
    if (!recheck.canDelete) {
      setIsDeleting(false);
      setDeleteConfirmYear(null);
      showFeedback(recheck.reason || 'This academic year contains academic records and cannot be deleted.', 'error');
      return;
    }

    const result = await api.deleteAcademicYear(deleteConfirmYear.id);
    setIsDeleting(false);
    setDeleteConfirmYear(null);

    if (result.success) {
      showFeedback(result.message, 'success');
      refreshData();
    } else {
      showFeedback(result.message, 'error');
    }
  };

  const handleDeleteTermClick = async (t: SchoolTerm) => {
    if (!isAdmin) return;
    const check = await api.checkSchoolTermCanBeDeleted(t.id);
    if (!check.canDelete) {
      showFeedback(check.reason || 'This term contains academic records and cannot be deleted.', 'error');
      return;
    }
    setDeleteConfirmTerm(t);
  };

  const handleConfirmDeleteTerm = async () => {
    if (!deleteConfirmTerm || isDeleting) return;
    setIsDeleting(true);

    const recheck = await api.checkSchoolTermCanBeDeleted(deleteConfirmTerm.id);
    if (!recheck.canDelete) {
      setIsDeleting(false);
      setDeleteConfirmTerm(null);
      showFeedback(recheck.reason || 'This term contains academic records and cannot be deleted.', 'error');
      return;
    }

    const result = await api.deleteSchoolTerm(deleteConfirmTerm.id);
    setIsDeleting(false);
    setDeleteConfirmTerm(null);

    if (result.success) {
      showFeedback(result.message, 'success');
      refreshData();
    } else {
      showFeedback(result.message, 'error');
    }
  };

  // Selected year terms calculation
  const selectedYearObj = academicYears.find((y) => y.id === selectedYearId) || activeYear;
  const filteredTerms = terms.filter(
    (t) => t.academic_year_id === selectedYearObj.id || t.year === selectedYearObj.year
  );

  const getStatusBadge = (status: AcademicYearStatus | TermStatus) => {
    switch (status) {
      case 'Active':
        return (
          <span className="inline-flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/80 text-xs font-bold px-2.5 py-1 rounded-full shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-pulse"></span>
            <span>Active</span>
          </span>
        );
      case 'Closed':
        return (
          <span className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-xs font-medium px-2.5 py-1 rounded-full">
            <Lock className="w-3 h-3 text-slate-500 dark:text-slate-400" />
            <span>Closed</span>
          </span>
        );
      case 'Reactivated':
        return (
          <span className="inline-flex items-center gap-1.5 bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800/80 text-xs font-bold px-2.5 py-1 rounded-full shadow-2xs">
            <Unlock className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
            <span>Reactivated</span>
          </span>
        );
      case 'Locked':
        return (
          <span className="inline-flex items-center gap-1.5 bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800/80 text-xs font-medium px-2.5 py-1 rounded-full">
            <Lock className="w-3 h-3 text-rose-600 dark:text-rose-400" />
            <span>Locked</span>
          </span>
        );
      case 'Archived':
        return (
          <span className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 text-xs font-medium px-2.5 py-1 rounded-full">
            <Archive className="w-3 h-3 text-slate-500 dark:text-slate-400" />
            <span>Archived</span>
          </span>
        );
      case 'Upcoming':
        return (
          <span className="inline-flex items-center gap-1.5 bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/80 text-xs font-medium px-2.5 py-1 rounded-full">
            <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <span>Upcoming</span>
          </span>
        );
      default:
        return null;
    }
  };

  const formatDateLabel = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className={`space-y-6 bg-slate-50 dark:bg-slate-950 min-h-screen ${isModal ? 'p-2' : 'p-4 sm:p-6'}`}>
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs transition-all ${
            notification.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
              : notification.type === 'info'
              ? 'bg-blue-50 dark:bg-blue-950/80 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800'
              : 'bg-[#E8F3EE] dark:bg-emerald-950/80 text-[#176B45] dark:text-emerald-300 border border-[#2E7D5B]/30 dark:border-emerald-800/60'
          }`}
        >
          <div className="flex items-center space-x-2">
            {notification.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[#176B45] dark:text-emerald-400" />
            )}
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {/* Main Header / Banner - Deep Green Theme */}
      <div className="bg-[#0F5132] dark:bg-emerald-950 text-white rounded-2xl p-5 sm:p-6 shadow-xs border border-[#176B45]/40 dark:border-emerald-800/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-emerald-100 text-xs font-semibold">
              <CalendarDays className="w-3.5 h-3.5 text-emerald-300" />
              <span>Academic Year & Term Control Center</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Academic Session Management
            </h1>
          </div>

          {/* Quick Active Session Badge */}
          <div className="bg-white/10 border border-white/20 rounded-xl p-4 flex flex-col justify-center min-w-[240px]">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-200 mb-1">
              Current Active Session
            </span>
            {activeTerm ? (
              <>
                <div className="flex items-baseline space-x-2">
                  <span className="text-xl font-black text-white">{activeYear.year}</span>
                  <span className="text-sm font-bold text-emerald-200">{activeTerm.term_name}</span>
                  {getStatusBadge(activeTerm.status)}
                </div>
                <div className="mt-2 text-[11px] text-emerald-100/90 flex items-center space-x-2 border-t border-white/10 pt-1.5">
                  <span>{formatDateLabel(activeTerm.opening_date)}</span>
                  <span>&ndash;</span>
                  <span>{formatDateLabel(activeTerm.closing_date)}</span>
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-2 pt-1">
                <span className="text-xl font-black text-white">{activeYear.year}</span>
                <span className="text-xs font-bold text-amber-200 bg-white/10 px-2.5 py-0.5 rounded-full">
                  No Active Term
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Academic Term Transition Reminder Banner (Admin Only) */}
      {isAdmin && termReminder && (
        <AcademicTermReminderBanner
          reminder={termReminder}
          onNavigateToSession={() => setActiveTab('terms')}
          onDismiss={() => setReminderDismissed(true)}
        />
      )}

      {/* Academic Year Rollover Reminder Banner (Admin Only) */}
      {isAdmin && rolloverReminder && (
        <AcademicYearRolloverReminderBanner
          reminder={rolloverReminder}
          onNavigateToSession={() => setActiveTab(rolloverReminder.type === 'configuration_warning' ? 'years' : 'rollover-readiness')}
          onDismiss={() => setRolloverReminderDismissed(true)}
        />
      )}

      {/* Navigation Tabs - Soft Segmented Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100/70 dark:bg-slate-900/60 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            className={`py-2 px-3 sm:px-4 text-xs font-bold rounded-xl transition-all duration-200 flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-white dark:bg-slate-800 text-[#176B45] dark:text-emerald-400 shadow-xs border border-slate-200/80 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/40'
            }`}
          >
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>Session Dashboard</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'years'}
            onClick={() => setActiveTab('years')}
            className={`py-2 px-3 sm:px-4 text-xs font-bold rounded-xl transition-all duration-200 flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'years'
                ? 'bg-white dark:bg-slate-800 text-[#176B45] dark:text-emerald-400 shadow-xs border border-slate-200/80 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/40'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>Academic Years ({academicYears.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'terms'}
            onClick={() => setActiveTab('terms')}
            className={`py-2 px-3 sm:px-4 text-xs font-bold rounded-xl transition-all duration-200 flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'terms'
                ? 'bg-white dark:bg-slate-800 text-[#176B45] dark:text-emerald-400 shadow-xs border border-slate-200/80 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/40'
            }`}
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Terms Schedule ({terms.length})</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'rollover-readiness'}
              onClick={() => setActiveTab('rollover-readiness')}
              className={`py-2 px-3 sm:px-4 text-xs font-bold rounded-xl transition-all duration-200 flex items-center space-x-1.5 cursor-pointer ${
                activeTab === 'rollover-readiness'
                  ? 'bg-white dark:bg-slate-800 text-[#176B45] dark:text-emerald-400 shadow-xs border border-slate-200/80 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/40'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Rollover Readiness</span>
            </button>
          )}
        </div>

        {isAdmin && (
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleOpenNewYearModal}
              className="bg-[#176B45] hover:bg-[#0F5132] active:bg-[#0A3622] text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-xs transition-all duration-150 flex items-center space-x-1.5 active:scale-[0.98] cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>New Academic Year</span>
            </button>
          </div>
        )}
      </div>

      {/* --- TAB 1: OVERVIEW DASHBOARD --- */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Active Session Highlight Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden">
            {activeTerm ? (
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-3 flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs uppercase tracking-wider text-[#176B45] dark:text-emerald-400 font-extrabold">
                      Active Academic Session
                    </span>
                    {getStatusBadge(activeTerm.status)}
                  </div>

                  <div className="flex items-baseline space-x-3">
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100">{activeYear.year}</h2>
                    <span className="text-xl sm:text-2xl font-bold text-[#176B45] dark:text-emerald-400">{activeTerm.term_name}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
                    <div className="bg-[#E8F3EE]/60 dark:bg-emerald-950/40 rounded-xl p-3 border border-[#2E7D5B]/20 dark:border-emerald-800/40">
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Opening Date</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{formatDateLabel(activeTerm.opening_date)}</span>
                    </div>
                    <div className="bg-[#E8F3EE]/60 dark:bg-emerald-950/40 rounded-xl p-3 border border-[#2E7D5B]/20 dark:border-emerald-800/40">
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Closing Date</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{formatDateLabel(activeTerm.closing_date)}</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200 dark:border-slate-700/80">
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Mid-Term Start</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {activeTerm.mid_term_opening_date ? formatDateLabel(activeTerm.mid_term_opening_date) : 'None'}
                      </span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200 dark:border-slate-700/80">
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Mid-Term End</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {activeTerm.mid_term_closing_date ? formatDateLabel(activeTerm.mid_term_closing_date) : 'None'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Active Capabilities Summary */}
                <div className="bg-[#E8F3EE]/50 dark:bg-emerald-950/30 p-4 rounded-xl border border-[#2E7D5B]/20 dark:border-emerald-800/40 max-w-xs space-y-2">
                  <span className="text-xs font-bold text-[#176B45] dark:text-emerald-400 flex items-center space-x-1.5">
                    <ShieldAlert className="w-4 h-4 text-[#176B45] dark:text-emerald-400" />
                    <span>Active Term Capabilities</span>
                  </span>
                  <ul className="text-[11px] text-slate-700 dark:text-slate-300 space-y-1.5 list-disc pl-4 font-medium">
                    <li>Examination setup & entry open</li>
                    <li>Teacher marks entry enabled</li>
                    <li>Merit lists & report cards active</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2">
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400 font-extrabold">
                      Operational Status
                    </span>
                    <span className="inline-flex items-center gap-1.5 bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/80 text-xs font-bold px-2.5 py-0.5 rounded-full">
                      No Active Term
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
                    Academic Year {activeYear.year} &bull; No Active Term
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
                    There is currently no active term in session for {activeYear.year}. Marks entry and examination approvals are suspended until an administrator sets an upcoming term as active or reopens a closed term from the schedule below.
                  </p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedYearId(activeYear.id);
                      setActiveTab('terms');
                    }}
                    className="bg-[#176B45] hover:bg-[#0F5132] text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition shrink-0 cursor-pointer"
                  >
                    Activate a Term
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Academic Terms Timeline for Active Year */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-[#176B45] dark:text-emerald-400" />
                  <span>School Terms Schedule ({activeYear.year})</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Terms breakdown for academic year {activeYear.year}.
                </p>
              </div>

              {isAdmin && (
                <button
                  onClick={() => {
                    setSelectedYearId(activeYear.id);
                    setActiveTab('terms');
                  }}
                  className="text-xs font-bold text-[#176B45] dark:text-emerald-400 hover:text-[#0F5132] dark:hover:text-emerald-300 flex items-center space-x-1"
                >
                  <span>Manage Terms</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {terms
                .filter((t) => t.academic_year_id === activeYear.id || t.year === activeYear.year)
                .map((term) => {
                  const isActive = term.status === 'Active';
                  const isClosed = term.status === 'Closed';

                  return (
                    <div
                      key={term.id}
                      className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                        isActive
                          ? 'border-[#176B45] dark:border-emerald-500 bg-[#E8F3EE]/40 dark:bg-emerald-950/30 ring-1 ring-[#176B45]/20 dark:ring-emerald-500/20'
                          : isClosed
                          ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{term.term_name}</span>
                          {getStatusBadge(term.status)}
                        </div>

                        <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400 mb-4">
                          <div className="flex justify-between">
                            <span className="text-slate-500 dark:text-slate-400">Opens:</span>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">{formatDateLabel(term.opening_date)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500 dark:text-slate-400">Closes:</span>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">{formatDateLabel(term.closing_date)}</span>
                          </div>
                          {term.mid_term_opening_date ? (
                            <div className="flex justify-between text-[11px] pt-1.5 border-t border-slate-200 dark:border-slate-800">
                              <span className="text-slate-500 dark:text-slate-400">Mid-Term:</span>
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {formatDateLabel(term.mid_term_opening_date)} &ndash; {formatDateLabel(term.mid_term_closing_date)}
                              </span>
                            </div>
                          ) : (
                            <div className="flex justify-between text-[11px] pt-1.5 border-t border-slate-200 dark:border-slate-800">
                              <span className="text-slate-500 dark:text-slate-400">Mid-Term:</span>
                              <span className="text-slate-400 dark:text-slate-500 italic">None configured</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {isAdmin && (
                        <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800">
                          {term.status === 'Active' ? (
                            <button
                              type="button"
                              onClick={() => handleCloseTerm(term)}
                              disabled={Boolean(processingId)}
                              className="w-full bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold py-2 rounded-xl transition-all duration-150 text-center min-h-[38px] flex items-center justify-center space-x-1.5 shadow-2xs hover:shadow-xs active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                            >
                              {processingId === `close-term-${term.id}` ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Closing Term...</span>
                                </>
                              ) : (
                                <>
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>Close Term</span>
                                </>
                              )}
                            </button>
                          ) : term.status === 'Closed' ? (
                            <div className="flex items-center justify-between space-x-2">
                              {(() => {
                                const todayStr = getKenyaCalendarToday();
                                const parentYear = academicYears.find((y) => y.id === term.academic_year_id || y.year === term.year);
                                const isExpiredAndActiveAY = Boolean(
                                  isAdmin &&
                                  term.closing_date &&
                                  todayStr > term.closing_date &&
                                  parentYear &&
                                  parentYear.status === 'Active'
                                );

                                if (isExpiredAndActiveAY) {
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenReactivateModal(term)}
                                      disabled={Boolean(processingId)}
                                      className="flex-1 bg-[#176B45] hover:bg-[#0F5132] active:bg-[#0A3622] text-white text-xs font-bold py-2 rounded-xl transition-all duration-150 text-center min-h-[38px] flex items-center justify-center space-x-1 shadow-2xs hover:shadow-xs active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                                    >
                                      <Unlock className="w-3.5 h-3.5" />
                                      <span>Reactivate Term</span>
                                    </button>
                                  );
                                } else {
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => handleReopenTerm(term)}
                                      disabled={Boolean(processingId)}
                                      className="flex-1 bg-[#176B45] hover:bg-[#0F5132] active:bg-[#0A3622] text-white text-xs font-bold py-2 rounded-xl transition-all duration-150 text-center min-h-[38px] flex items-center justify-center space-x-1 shadow-2xs hover:shadow-xs active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                                    >
                                      {processingId === `reopen-term-${term.id}` ? (
                                        <>
                                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                          <span>Reopening...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Unlock className="w-3.5 h-3.5" />
                                          <span>Reopen</span>
                                        </>
                                      )}
                                    </button>
                                  );
                                }
                              })()}
                              <button
                                type="button"
                                onClick={() => handleLockTerm(term)}
                                disabled={Boolean(processingId)}
                                className="flex-1 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 active:bg-rose-200 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/80 text-xs font-bold py-2 rounded-xl transition-all duration-150 text-center min-h-[38px] flex items-center justify-center space-x-1 active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                              >
                                {processingId === `lock-term-${term.id}` ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Locking...</span>
                                  </>
                                ) : (
                                  <>
                                    <Lock className="w-3.5 h-3.5" />
                                    <span>Lock</span>
                                  </>
                                )}
                              </button>
                            </div>
                          ) : term.status === 'Reactivated' ? (
                            <div className="flex items-center justify-between space-x-2">
                              <div className="flex-1 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 text-[11px] font-bold py-2 rounded-xl text-center min-h-[38px] flex items-center justify-center space-x-1">
                                <Unlock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                                <span>Reactivated (Admin)</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCloseTerm(term)}
                                disabled={Boolean(processingId)}
                                className="bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all duration-150 text-center min-h-[38px] flex items-center justify-center space-x-1 shadow-2xs hover:shadow-xs active:scale-[0.98] disabled:opacity-60 cursor-pointer shrink-0"
                              >
                                {processingId === `close-term-${term.id}` ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <span>Close Term</span>
                                )}
                              </button>
                            </div>
                          ) : term.status === 'Locked' ? (
                            <button
                              type="button"
                              onClick={() => handleUnlockTerm(term)}
                              disabled={Boolean(processingId)}
                              className="w-full bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 active:bg-amber-200 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800/80 text-xs font-bold py-2 rounded-xl transition-all duration-150 text-center min-h-[38px] flex items-center justify-center space-x-1.5 active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                            >
                              {processingId === `unlock-term-${term.id}` ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Unlocking...</span>
                                </>
                              ) : (
                                <>
                                  <Unlock className="w-3.5 h-3.5" />
                                  <span>Unlock to Closed</span>
                                </>
                              )}
                            </button>
                          ) : term.status === 'Upcoming' ? (
                            <button
                              type="button"
                              onClick={() => handleActivateTerm(term.id)}
                              disabled={Boolean(processingId)}
                              className="w-full bg-[#176B45] hover:bg-[#0F5132] active:bg-[#0A3622] text-white text-xs font-bold py-2 rounded-xl transition-all duration-150 text-center min-h-[38px] flex items-center justify-center space-x-1.5 shadow-2xs hover:shadow-xs active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                            >
                              {processingId === `activate-term-${term.id}` ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Activating...</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Set Active</span>
                                </>
                              )}
                            </button>
                          ) : term.status === 'Archived' ? (
                            <button
                              type="button"
                              onClick={() => handleReopenTerm(term)}
                              disabled={Boolean(processingId)}
                              className="w-full bg-[#176B45] hover:bg-[#0F5132] active:bg-[#0A3622] text-white text-xs font-bold py-2 rounded-xl transition-all duration-150 text-center min-h-[38px] flex items-center justify-center space-x-1.5 shadow-2xs hover:shadow-xs active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                            >
                              {processingId === `reopen-term-${term.id}` ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Reopening...</span>
                                </>
                              ) : (
                                <>
                                  <Unlock className="w-3.5 h-3.5" />
                                  <span>Reopen</span>
                                </>
                              )}
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 2: ACADEMIC YEARS MANAGEMENT --- */}
      {activeTab === 'years' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">All Academic Years</h3>
            {isAdmin && (
              <button
                onClick={handleOpenNewYearModal}
                className="bg-[#176B45] hover:bg-[#0F5132] text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-xs transition flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Create Academic Year</span>
              </button>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 font-bold uppercase text-[10px] tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="p-3.5">Academic Year</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Terms Count</th>
                    <th className="p-3.5">Date Created</th>
                    <th className="p-3.5">Last Updated</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {academicYears
                    .sort((a, b) => b.year - a.year)
                    .map((ay) => {
                      const isActive = ay.status === 'Active';
                      const yearTerms = terms.filter((t) => t.academic_year_id === ay.id || t.year === ay.year);

                      return (
                        <tr key={ay.id} className={isActive ? 'bg-[#E8F3EE]/40 dark:bg-emerald-950/30 font-medium' : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/50'}>
                          <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                            <span>{ay.year}</span>
                            {isActive && <span className="text-[10px] font-extrabold text-[#176B45] dark:text-emerald-400 bg-[#E8F3EE] dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-[#2E7D5B]/30 dark:border-emerald-800/60">(Active)</span>}
                          </td>
                          <td className="p-3.5">{getStatusBadge(ay.status)}</td>
                          <td className="p-3.5 font-semibold text-slate-700 dark:text-slate-300">{yearTerms.length} Terms</td>
                          <td className="p-3.5 text-slate-500 dark:text-slate-400">{formatDateLabel(ay.created_at?.slice(0, 10))}</td>
                          <td className="p-3.5 text-slate-500 dark:text-slate-400">{formatDateLabel(ay.updated_at?.slice(0, 10))}</td>
                          <td className="p-3.5 text-right">
                            {isAdmin ? (
                              <div className="flex items-center justify-end space-x-2">
                                {!isActive && (
                                  <button
                                    type="button"
                                    onClick={() => handleActivateYear(ay.id)}
                                    disabled={Boolean(processingId)}
                                    className="px-2.5 py-1.5 text-[11px] font-bold bg-[#176B45] hover:bg-[#0F5132] active:bg-[#0A3622] text-white rounded-lg transition-all duration-150 active:scale-95 disabled:opacity-60 cursor-pointer shadow-2xs flex items-center space-x-1"
                                  >
                                    {processingId === `activate-year-${ay.id}` && <RefreshCw className="w-3 h-3 animate-spin mr-1" />}
                                    <span>Set Active</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedYearId(ay.id);
                                    setActiveTab('terms');
                                  }}
                                  className="px-2.5 py-1.5 text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:bg-slate-300 text-slate-700 dark:text-slate-300 rounded-lg transition-all duration-150 border border-slate-300 dark:border-slate-700 active:scale-95 cursor-pointer shadow-2xs"
                                >
                                  Manage Terms
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleOpenEditYearModal(ay)}
                                  disabled={Boolean(processingId)}
                                  className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-[#176B45] dark:hover:text-emerald-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-150 active:scale-95 cursor-pointer"
                                  title="Edit Academic Year"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>

                                {api.checkAcademicYearCanBeDeletedSync(ay.id) ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteYearClick(ay)}
                                    disabled={Boolean(processingId)}
                                    className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-all duration-150 active:scale-95 cursor-pointer"
                                    title="Delete Academic Year"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  ay.status !== 'Archived' && !isActive && (
                                    <button
                                      type="button"
                                      onClick={() => handleArchiveYear(ay)}
                                      disabled={Boolean(processingId)}
                                      className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-150 active:scale-95 cursor-pointer"
                                      title="Archive Academic Year"
                                    >
                                      {processingId === `archive-year-${ay.id}` ? (
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
                                      ) : (
                                        <Archive className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  )
                                )}

                                {ay.status === 'Archived' && (
                                  <button
                                    type="button"
                                    onClick={() => handleReopenYear(ay)}
                                    disabled={Boolean(processingId)}
                                    className="px-2 py-1 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-all duration-150 border border-slate-300 dark:border-slate-700 active:scale-95 cursor-pointer flex items-center space-x-1"
                                  >
                                    {processingId === `reopen-year-${ay.id}` && <RefreshCw className="w-3 h-3 animate-spin mr-1" />}
                                    <span>Reopen</span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500 text-[11px] font-medium">Read-Only</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 3: TERMS SCHEDULE --- */}
      {activeTab === 'terms' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center space-x-3">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Filter by Academic Year:</label>
              <select
                value={selectedYearId}
                onChange={(e) => setSelectedYearId(e.target.value)}
                className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold px-3 py-1.5 focus:ring-2 focus:ring-[#176B45] focus:outline-none"
              >
                {academicYears.map((ay) => (
                  <option key={ay.id} value={ay.id} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                    Academic Year {ay.year} {ay.status === 'Active' ? '(Active Year)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {isAdmin && (
              <button
                onClick={handleOpenNewTermModal}
                className="bg-[#176B45] hover:bg-[#0F5132] text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition flex items-center space-x-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Term for {selectedYearObj.year}</span>
              </button>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 font-bold uppercase text-[10px] tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="p-3.5">Term Name</th>
                    <th className="p-3.5">Academic Year</th>
                    <th className="p-3.5">Opening Date</th>
                    <th className="p-3.5">Closing Date</th>
                    <th className="p-3.5">Mid-Term Dates</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredTerms.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400 dark:text-slate-500 font-medium">
                        No terms created for Academic Year {selectedYearObj.year}.
                      </td>
                    </tr>
                  ) : (
                    filteredTerms.map((t) => {
                      const isActive = t.status === 'Active';
                      const isClosed = t.status === 'Closed';

                      return (
                        <tr key={t.id} className={isActive ? 'bg-[#E8F3EE]/40 dark:bg-emerald-950/30 font-medium' : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/50'}>
                          <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">{t.term_name}</td>
                          <td className="p-3.5 font-semibold text-slate-700 dark:text-slate-300">{t.year}</td>
                          <td className="p-3.5 font-medium">{formatDateLabel(t.opening_date)}</td>
                          <td className="p-3.5 font-medium">{formatDateLabel(t.closing_date)}</td>
                          <td className="p-3.5 text-slate-600 dark:text-slate-400 text-[11px]">
                            {t.mid_term_opening_date ? (
                              <span>
                                {formatDateLabel(t.mid_term_opening_date)} &ndash; {formatDateLabel(t.mid_term_closing_date)}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500 italic">None</span>
                            )}
                          </td>
                          <td className="p-3.5">{getStatusBadge(t.status)}</td>
                          <td className="p-3.5 text-right">
                            {isAdmin ? (
                              <div className="flex items-center justify-end space-x-1.5">
                                {t.status === 'Active' ? (
                                  <button
                                    type="button"
                                    onClick={() => handleCloseTerm(t)}
                                    disabled={Boolean(processingId)}
                                    className="px-2.5 py-1.5 text-[11px] font-bold bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-lg transition-all duration-150 flex items-center space-x-1 active:scale-95 disabled:opacity-60 cursor-pointer shadow-2xs"
                                  >
                                    {processingId === `close-term-${t.id}` ? (
                                      <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                                    ) : (
                                      <Lock className="w-3 h-3" />
                                    )}
                                    <span>Close</span>
                                  </button>
                                ) : t.status === 'Closed' ? (
                                   <div className="flex items-center space-x-1">
                                     {(() => {
                                       const todayStr = getKenyaCalendarToday();
                                       const parentYear = academicYears.find((y) => y.id === t.academic_year_id || y.year === t.year);
                                       const isExpiredAndActiveAY = Boolean(
                                         isAdmin &&
                                         t.closing_date &&
                                         todayStr > t.closing_date &&
                                         parentYear &&
                                         parentYear.status === 'Active'
                                       );

                                       if (isExpiredAndActiveAY) {
                                         return (
                                           <button
                                             type="button"
                                             onClick={() => handleOpenReactivateModal(t)}
                                             disabled={Boolean(processingId)}
                                             className="px-2.5 py-1.5 text-[11px] font-bold bg-[#176B45] hover:bg-[#0F5132] active:bg-[#0A3622] text-white rounded-lg transition-all duration-150 flex items-center space-x-1 active:scale-95 disabled:opacity-60 cursor-pointer shadow-2xs"
                                           >
                                             <Unlock className="w-3 h-3" />
                                             <span>Reactivate</span>
                                           </button>
                                         );
                                       } else {
                                         return (
                                           <button
                                             type="button"
                                             onClick={() => handleReopenTerm(t)}
                                             disabled={Boolean(processingId)}
                                             className="px-2.5 py-1.5 text-[11px] font-bold bg-[#176B45] hover:bg-[#0F5132] active:bg-[#0A3622] text-white rounded-lg transition-all duration-150 flex items-center space-x-1 active:scale-95 disabled:opacity-60 cursor-pointer shadow-2xs"
                                           >
                                             {processingId === `reopen-term-${t.id}` ? (
                                               <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                                             ) : (
                                               <Unlock className="w-3 h-3" />
                                             )}
                                             <span>Reopen</span>
                                           </button>
                                         );
                                       }
                                     })()}
                                     <button
                                       type="button"
                                       onClick={() => handleLockTerm(t)}
                                       disabled={Boolean(processingId)}
                                       className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-md transition-all duration-150 active:scale-95 disabled:opacity-60 cursor-pointer"
                                       title="Lock Term"
                                     >
                                       {processingId === `lock-term-${t.id}` ? (
                                         <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                       ) : (
                                         <Lock className="w-3.5 h-3.5" />
                                       )}
                                     </button>
                                   </div>
                                 ) : t.status === 'Reactivated' ? (
                                   <div className="flex items-center space-x-1">
                                     <span className="px-2 py-1 text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 rounded-lg">
                                       Reactivated
                                     </span>
                                     <button
                                       type="button"
                                       onClick={() => handleCloseTerm(t)}
                                       disabled={Boolean(processingId)}
                                       className="px-2 py-1 text-[11px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-all duration-150 flex items-center space-x-1 active:scale-95 disabled:opacity-60 cursor-pointer"
                                     >
                                       <span>Close</span>
                                     </button>
                                   </div>
                                 ) : t.status === 'Locked' ? (
                                  <button
                                    type="button"
                                    onClick={() => handleUnlockTerm(t)}
                                    disabled={Boolean(processingId)}
                                    className="px-2.5 py-1.5 text-[11px] font-bold bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800 rounded-lg transition-all duration-150 flex items-center space-x-1 active:scale-95 disabled:opacity-60 cursor-pointer shadow-2xs"
                                  >
                                    {processingId === `unlock-term-${t.id}` ? (
                                      <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                                    ) : (
                                      <Unlock className="w-3 h-3" />
                                    )}
                                    <span>Unlock</span>
                                  </button>
                                ) : t.status === 'Archived' ? (
                                  <button
                                    type="button"
                                    onClick={() => handleReopenTerm(t)}
                                    disabled={Boolean(processingId)}
                                    className="px-2.5 py-1.5 text-[11px] font-bold bg-[#176B45] hover:bg-[#0F5132] active:bg-[#0A3622] text-white rounded-lg transition-all duration-150 flex items-center space-x-1 active:scale-95 disabled:opacity-60 cursor-pointer shadow-2xs"
                                  >
                                    {processingId === `reopen-term-${t.id}` ? (
                                      <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                                    ) : (
                                      <Unlock className="w-3 h-3" />
                                    )}
                                    <span>Reopen</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleActivateTerm(t.id)}
                                    disabled={Boolean(processingId)}
                                    className="px-2.5 py-1.5 text-[11px] font-bold bg-[#176B45] hover:bg-[#0F5132] active:bg-[#0A3622] text-white rounded-lg transition-all duration-150 flex items-center space-x-1 active:scale-95 disabled:opacity-60 cursor-pointer shadow-2xs"
                                  >
                                    {processingId === `activate-term-${t.id}` && (
                                      <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                                    )}
                                    <span>Set Active</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleOpenEditTermModal(t)}
                                  disabled={Boolean(processingId)}
                                  className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-[#176B45] dark:hover:text-emerald-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-150 active:scale-95 cursor-pointer"
                                  title="Edit Term Schedule"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>

                                {api.checkSchoolTermCanBeDeletedSync(t.id) ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTermClick(t)}
                                    disabled={Boolean(processingId)}
                                    className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-all duration-150 active:scale-95 cursor-pointer"
                                    title="Delete Term"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  t.status !== 'Archived' && !isActive && (
                                    <button
                                      type="button"
                                      onClick={() => handleArchiveTerm(t)}
                                      disabled={Boolean(processingId)}
                                      className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-150 active:scale-95 cursor-pointer"
                                      title="Archive Term"
                                    >
                                      {processingId === `archive-term-${t.id}` ? (
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
                                      ) : (
                                        <Archive className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  )
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500 text-[11px] font-medium">Read-Only</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 4: ROLLOVER READINESS REVIEW (ADMIN ONLY) --- */}
      {activeTab === 'rollover-readiness' && isAdmin && (
        <RolloverReadinessReview
          academicYears={academicYears}
          schoolTerms={terms}
          classes={classes}
          students={students}
          onNavigateToTab={(tab) => setActiveTab(tab)}
          onRefresh={refreshData}
        />
      )}

      {/* --- CREATE / EDIT ACADEMIC YEAR MODAL --- */}
      {showYearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              {editingYear ? `Edit Academic Year ${editingYear.year}` : 'Create New Academic Year'}
            </h3>

             <form onSubmit={handleSaveAcademicYear} className="space-y-4 text-xs">
               {yearModalError && (
                 <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800 flex items-center space-x-2">
                   <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                   <span>{yearModalError}</span>
                 </div>
               )}

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Academic Year Number *</label>
                <input
                  type="number"
                  required
                  min={2020}
                  max={2100}
                  value={inputYearNumber}
                  onChange={(e) => setInputYearNumber(parseInt(e.target.value) || new Date().getFullYear())}
                  className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-[#176B45] focus:outline-none font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Status</label>
                <select
                  value={inputYearStatus}
                  onChange={(e) => setInputYearStatus(e.target.value as AcademicYearStatus)}
                  className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-[#176B45] focus:outline-none"
                >
                  <option value="Upcoming" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Upcoming</option>
                  <option value="Active" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Active (Deactivates current active year)</option>
                  <option value="Closed" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Closed</option>
                  <option value="Locked" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Locked</option>
                  <option value="Archived" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Archived</option>
                </select>
              </div>

              <div className="pt-4 flex items-center justify-end space-x-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowYearModal(false)}
                  disabled={Boolean(processingId)}
                  className="px-4 py-2 rounded-lg font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={Boolean(processingId)}
                  className="px-4 py-2 rounded-lg font-bold bg-[#176B45] hover:bg-[#0F5132] text-white shadow-xs transition flex items-center space-x-1.5 disabled:opacity-60 cursor-pointer"
                >
                  {processingId === 'save-year' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{processingId === 'save-year' ? 'Saving...' : 'Save Academic Year'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CREATE / EDIT TERM MODAL --- */}
      {showTermModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              {editingTerm ? `Edit ${editingTerm.term_name} (${editingTerm.year})` : 'Create School Term'}
            </h3>

            <form onSubmit={handleSaveTerm} className="space-y-4 text-xs">
              {termModalError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>{termModalError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Academic Year *</label>
                  <select
                    value={inputTermYearId}
                    onChange={(e) => setInputTermYearId(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-[#176B45] focus:outline-none"
                  >
                    {academicYears.map((ay) => (
                      <option key={ay.id} value={ay.id} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                        {ay.year}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Term Name *</label>
                  <select
                    value={inputTermName}
                    onChange={(e) => setInputTermName(e.target.value as TermName)}
                    className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-[#176B45] focus:outline-none"
                  >
                    <option value="Term 1" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Term 1</option>
                    <option value="Term 2" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Term 2</option>
                    <option value="Term 3" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Term 3</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Opening Date *</label>
                  <input
                    type="date"
                    required
                    value={inputOpeningDate}
                    onChange={(e) => setInputOpeningDate(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-[#176B45] focus:outline-none font-medium"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Closing Date *</label>
                  <input
                    type="date"
                    required
                    value={inputClosingDate}
                    onChange={(e) => setInputClosingDate(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-[#176B45] focus:outline-none font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Mid-Term Opening (Optional)</label>
                  <input
                    type="date"
                    value={inputMidOpeningDate}
                    onChange={(e) => setInputMidOpeningDate(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-[#176B45] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Mid-Term Closing (Optional)</label>
                  <input
                    type="date"
                    value={inputMidClosingDate}
                    onChange={(e) => setInputMidClosingDate(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-[#176B45] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Status</label>
                <select
                  value={inputTermStatus}
                  onChange={(e) => setInputTermStatus(e.target.value as TermStatus)}
                  className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-[#176B45] focus:outline-none"
                >
                  <option value="Upcoming" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Upcoming</option>
                  <option value="Active" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Active (Activates this term & locks marks for others)</option>
                  <option value="Closed" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Closed</option>
                  <option value="Locked" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Locked</option>
                  <option value="Archived" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Archived</option>
                </select>
              </div>

              <div className="pt-4 flex items-center justify-end space-x-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTermModal(false)}
                  disabled={Boolean(processingId)}
                  className="px-4 py-2 rounded-lg font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={Boolean(processingId)}
                  className="px-4 py-2 rounded-lg font-bold bg-[#176B45] hover:bg-[#0F5132] text-white shadow-xs transition flex items-center space-x-1.5 disabled:opacity-60 cursor-pointer"
                >
                  {processingId === 'save-term' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{processingId === 'save-term' ? 'Saving...' : 'Save Term Schedule'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- DELETE ACADEMIC YEAR CONFIRMATION MODAL --- */}
      {deleteConfirmYear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400 mb-4">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Delete Academic Year {deleteConfirmYear.year}?
              </h3>
            </div>
            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400 mb-6">
              <p className="font-medium text-slate-800 dark:text-slate-200">
                This academic year has no terms or associated academic records.
              </p>
              <p>
                Deleting it will permanently remove the unused academic year record.
              </p>
              <p className="text-rose-600 dark:text-rose-400 font-semibold">
                This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDeleteConfirmYear(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteYear}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition text-xs flex items-center space-x-1.5"
              >
                {isDeleting ? 'Deleting...' : 'Delete Academic Year'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- DELETE SCHOOL TERM CONFIRMATION MODAL --- */}
      {deleteConfirmTerm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400 mb-4">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Delete {deleteConfirmTerm.term_name}?
              </h3>
            </div>
            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400 mb-6">
              <p className="font-medium text-slate-800 dark:text-slate-200">
                This term has no associated academic records.
              </p>
              <p>
                Are you sure you want to permanently delete this unused term?
              </p>
              <p className="text-rose-600 dark:text-rose-400 font-semibold">
                This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDeleteConfirmTerm(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTerm}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition text-xs flex items-center space-x-1.5"
              >
                {isDeleting ? 'Deleting...' : 'Delete Term'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- REACTIVATE SCHOOL TERM CONFIRMATION MODAL --- */}
      {reactivateModalTerm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center space-x-3 text-amber-700 dark:text-amber-400 mb-3">
              <Unlock className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Reactivate {reactivateModalTerm.term_name} ({reactivateModalTerm.year})?
              </h3>
            </div>

            <div className="space-y-2 text-xs mb-4">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                Reactivating this term allows administrators to make authorised corrections to examination marks.
              </p>
              <ul className="list-disc pl-4 space-y-1 font-medium text-slate-700 dark:text-slate-300">
                <li>Teachers remain unable to edit marks.</li>
                <li>Examinations will not be automatically approved or published.</li>
                <li>The action and reason will be recorded in the audit log.</li>
              </ul>
            </div>

            {reactivateError && (
              <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs rounded-xl flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                <span>{reactivateError}</span>
              </div>
            )}

            <div className="mb-5">
              <label htmlFor="reactivate-reason" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Reason for Reactivation <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="reactivate-reason"
                rows={3}
                value={reactivateReason}
                onChange={(e) => {
                  setReactivateReason(e.target.value);
                  if (reactivateError) setReactivateError(null);
                }}
                placeholder="Enter reason for reactivation"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-600 dark:focus:ring-amber-500 font-medium resize-none"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setReactivateModalTerm(null);
                  setReactivateReason('');
                  setReactivateError(null);
                }}
                disabled={isReactivating}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 shadow-2xs transition-all duration-150 disabled:opacity-60 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReactivateTerm}
                disabled={isReactivating || !reactivateReason.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white shadow-xs transition-all duration-150 flex items-center space-x-1.5 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer"
              >
                {isReactivating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Reactivating...</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Reactivate Term</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
