import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AcademicYear, SchoolTerm, User } from '../types';
import { api, isUUID } from '../lib/storage';
import { getTermStatusFromDates } from '../utils/termStatusUtils';

interface AcademicSessionContextType {
  activeYear: AcademicYear;
  activeTerm: SchoolTerm | null;
  
  viewingYear: AcademicYear;
  viewingTerm: SchoolTerm | null;
  
  setViewingSession: (yearId: string, termId: string) => void;
  resetToActiveSession: () => void;
  refreshSessionState: () => void;
  
  // Expose these so modules can check permissions directly against the viewing session
  isViewingActiveSession: boolean;
}

export const AcademicSessionContext = createContext<AcademicSessionContextType | undefined>(undefined);

export const AcademicSessionProvider: React.FC<{ children: ReactNode; currentUser: User | null }> = ({ children, currentUser }) => {
  const [activeYear, setActiveYear] = useState<AcademicYear>(() => api.getActiveAcademicYear());
  const [activeTerm, setActiveTerm] = useState<SchoolTerm | null>(() => api.getActiveTerm());
  
  const [viewingYear, setViewingYear] = useState<AcademicYear>(() => api.getActiveAcademicYear());
  const [viewingTerm, setViewingTerm] = useState<SchoolTerm | null>(() => {
    const active = api.getActiveTerm();
    if (active) return active;
    const terms = api.getSchoolTerms();
    const year = api.getActiveAcademicYear();
    const yearTerms = terms.filter(t => t.academic_year_id === year.id || t.year === year.year);
    return yearTerms[yearTerms.length - 1] || terms[terms.length - 1] || null;
  });
  const [isExplicitHistorical, setIsExplicitHistorical] = useState(false);

  const refreshSessionState = useCallback(() => {
    const year = api.getActiveAcademicYear();
    const term = api.getActiveTerm();
    setActiveYear(year);
    setActiveTerm(term);
    
    const years = api.getAcademicYears();
    const terms = api.getSchoolTerms();

    // Unless the user has deliberately chosen a historical session,
    // the viewing session MUST track the authoritative active session.
    if (!isExplicitHistorical) {
      setViewingYear(year);
      if (term) {
        setViewingTerm(term);
      } else {
        const yearTerms = terms.filter(t => t.academic_year_id === year.id || t.year === year.year);
        setViewingTerm(prev => {
          if (prev && yearTerms.some(t => t.id === prev.id)) return prev;
          return yearTerms[yearTerms.length - 1] || terms[terms.length - 1] || null;
        });
      }
      return;
    }

    // If the user deliberately selected a historical session, retain it as long as it exists.
    if (viewingTerm) {
      const matchedViewingYear = years.find(y => y.id === viewingYear.id || y.year === viewingYear.year) || year;
      setViewingYear(matchedViewingYear);
      
      const matchedViewingTerm = terms.find(t => 
        t.id === viewingTerm.id || 
        ((t.academic_year_id === matchedViewingYear.id || t.year === matchedViewingYear.year) && t.term_name === viewingTerm.term_name)
      );
      
      if (matchedViewingTerm) {
        setViewingTerm(matchedViewingTerm);
      } else {
        // Fallback: Selected historical session no longer exists; return cleanly to active session
        setIsExplicitHistorical(false);
        setViewingYear(year);
        setViewingTerm(term || terms[terms.length - 1] || null);
      }
    } else {
      setIsExplicitHistorical(false);
      setViewingYear(year);
      setViewingTerm(term || terms[terms.length - 1] || null);
    }
  }, [isExplicitHistorical, viewingTerm, viewingYear]);

  const setViewingSession = useCallback((yearId: string, termId: string) => {
    const years = api.getAcademicYears();
    const terms = api.getSchoolTerms();
    
    const selectedYear = years.find(y => y.id === yearId || y.year === Number(yearId));
    const selectedTerm = terms.find(t => t.id === termId || (t.term_name === termId && (t.academic_year_id === yearId || t.year === selectedYear?.year)));
    
    if (selectedYear && selectedTerm) {
      const currentActiveYear = api.getActiveAcademicYear();
      const currentActiveTerm = api.getActiveTerm();
      const isSelectedActive = Boolean(
        currentActiveTerm &&
        getTermStatusFromDates(currentActiveTerm.opening_date, currentActiveTerm.closing_date, currentActiveTerm.status) === 'Active' &&
        (selectedTerm.id === currentActiveTerm.id || selectedTerm.term_name === currentActiveTerm.term_name) &&
        (selectedYear.id === currentActiveYear.id || selectedYear.year === currentActiveYear.year)
      );

      setIsExplicitHistorical(!isSelectedActive);
      setViewingYear(selectedYear);
      setViewingTerm(selectedTerm);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('session-view-changed', {
          detail: { year: selectedYear, term: selectedTerm }
        }));
      }
    }
  }, []);

  const resetToActiveSession = useCallback(() => {
    const currentActiveYear = api.getActiveAcademicYear();
    const currentActiveTerm = api.getActiveTerm();
    setIsExplicitHistorical(false);
    setViewingYear(currentActiveYear);
    if (currentActiveTerm) {
      setViewingTerm(currentActiveTerm);
    } else {
      const terms = api.getSchoolTerms();
      const yearTerms = terms.filter(t => t.academic_year_id === currentActiveYear.id || t.year === currentActiveYear.year);
      setViewingTerm(yearTerms[yearTerms.length - 1] || terms[terms.length - 1] || null);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('session-view-changed', {
        detail: { year: currentActiveYear, term: currentActiveTerm }
      }));
    }
  }, []);

  useEffect(() => {
    window.addEventListener('session-changed', refreshSessionState);
    return () => window.removeEventListener('session-changed', refreshSessionState);
  }, [refreshSessionState]);

  const isViewingActiveSession =
    Boolean(
      activeTerm &&
      getTermStatusFromDates(activeTerm.opening_date, activeTerm.closing_date, activeTerm.status) === 'Active'
    ) &&
    Boolean(
      viewingTerm &&
      getTermStatusFromDates(viewingTerm.opening_date, viewingTerm.closing_date, viewingTerm.status) === 'Active'
    ) &&
    ((viewingYear.id === activeYear.id && viewingTerm?.id === activeTerm?.id) ||
     (viewingYear.year === activeYear.year && viewingTerm?.term_name === activeTerm?.term_name));

  return (
    <AcademicSessionContext.Provider
      value={{
        activeYear,
        activeTerm,
        viewingYear,
        viewingTerm,
        setViewingSession,
        resetToActiveSession,
        refreshSessionState,
        isViewingActiveSession
      }}
    >
      {children}
    </AcademicSessionContext.Provider>
  );
};

export const useAcademicSession = () => {
  const context = useContext(AcademicSessionContext);
  if (context === undefined) {
    throw new Error('useAcademicSession must be used within an AcademicSessionProvider');
  }
  return context;
};
