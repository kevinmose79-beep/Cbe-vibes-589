import { TermStatus } from '../types';
import { getKenyaCalendarToday } from './kenyaDateUtils';

export const canPlanExams = (status?: TermStatus | null): boolean => {
  if (!status) return false;
  return status === 'Upcoming' || status === 'Active';
};

export const canEnterMarks = (status?: TermStatus | null): boolean => {
  if (!status) return false;
  return status === 'Active';
};

export const canApproveExams = (status?: TermStatus | null): boolean => {
  if (!status) return false;
  return status === 'Active';
};

export const canGenerateReports = (status?: TermStatus | null): boolean => {
  if (!status) return true;
  return status === 'Active' || status === 'Closed' || status === 'Reactivated' || status === 'Locked' || status === 'Archived';
};

export const isTermModifiable = (status?: TermStatus | null): boolean => {
  if (!status) return false;
  return status === 'Active';
};

export const canViewTermData = (status?: TermStatus | null): boolean => {
  if (!status) return true;
  return status === 'Active' || status === 'Closed' || status === 'Reactivated' || status === 'Locked' || status === 'Archived' || status === 'Upcoming';
};

export const getTermStatusMessage = (status?: TermStatus | null): string => {
  if (!status) {
    return 'No active academic term configured. Modifications require an active academic session.';
  }
  switch (status) {
    case 'Locked':
      return 'Academic Term Locked\nThis examination belongs to a Locked academic term.\nAcademic records for this term are protected.\nReopen the academic term from the Academic Year & Term Control Center before making any modifications.';
    case 'Closed':
      return 'Academic Term Closed\nThis examination belongs to a Closed academic term.\nAcademic records for this term are protected.\nReopen the academic term from the Academic Year & Term Control Center before making any modifications.';
    case 'Reactivated':
      return 'Academic Term Reactivated\nThis examination belongs to a Reactivated academic term.\nAn administrator has reactivated this term for official corrections. Marks entry is active for administrators only.';
    case 'Upcoming':
      return 'Academic Term Upcoming\nThe selected academic term is upcoming. Marks entry and examination approvals cannot be done until the term becomes Active.';
    case 'Archived':
      return 'Academic Term Archived\nThe selected academic term has been archived. It is completely read-only.';
    default:
      return '';
  }
};

export const getTermStatusFromDates = (
  openingDate?: string,
  closingDate?: string,
  explicitStatus?: TermStatus,
  customDate?: Date | string | number
): TermStatus => {
  if (explicitStatus === 'Locked' || explicitStatus === 'Archived' || explicitStatus === 'Closed' || explicitStatus === 'Reactivated') {
    return explicitStatus;
  }
  if (!openingDate || !closingDate) {
    return explicitStatus || 'Upcoming';
  }
  const todayStr = getKenyaCalendarToday(customDate);
  if (todayStr < openingDate) {
    return 'Upcoming';
  } else if (todayStr >= openingDate && todayStr <= closingDate) {
    return 'Active';
  } else {
    return 'Closed';
  }
};
