import React, { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronDown, RefreshCw, Check, Sparkles } from 'lucide-react';
import { useAcademicSession } from '../contexts/AcademicSessionContext';
import { api } from '../lib/storage';
import { getTermStatusFromDates } from '../utils/termStatusUtils';

export const SessionSwitcher: React.FC<{ className?: string }> = ({ className }) => {
  const {
    viewingYear,
    viewingTerm,
    activeYear,
    activeTerm,
    setViewingSession,
    resetToActiveSession,
    isViewingActiveSession,
  } = useAcademicSession();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedModalYearId, setSelectedModalYearId] = useState<string>(() => viewingYear?.id || activeYear?.id || '');
  const [years, setYears] = useState(() => api.getAcademicYears());
  const [terms, setTerms] = useState(() => api.getSchoolTerms());
  const [isResetting, setIsResetting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Synchronize when storage or session changes
  useEffect(() => {
    const handleUpdate = () => {
      setYears(api.getAcademicYears());
      setTerms(api.getSchoolTerms());
    };
    window.addEventListener('session-changed', handleUpdate);
    window.addEventListener('session-view-changed', handleUpdate);
    return () => {
      window.removeEventListener('session-changed', handleUpdate);
      window.removeEventListener('session-view-changed', handleUpdate);
    };
  }, []);

  // Sync selected modal year when viewingYear changes
  useEffect(() => {
    if (viewingYear?.id) {
      setSelectedModalYearId(viewingYear.id);
    }
  }, [viewingYear?.id]);

  // Handle click outside to close popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelectTerm = (yearId: string, termId: string) => {
    setViewingSession(yearId, termId);
    setIsOpen(false);
  };

  const handleReset = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsResetting(true);
    resetToActiveSession();
    setTimeout(() => {
      setIsResetting(false);
      setIsOpen(false);
    }, 250);
  };

  // Resolved year object for popover
  const currentModalYear = years.find((y) => y.id === selectedModalYearId || y.year === viewingYear?.year) || viewingYear || activeYear;
  const modalYearTerms = terms.filter(
    (t) => t.academic_year_id === currentModalYear?.id || t.year === currentModalYear?.year
  );

  return (
    <div ref={dropdownRef} className={`relative inline-block text-left ${className || ''}`}>
      {/* Primary Soft Trigger Bar */}
      <div
        className={`group flex items-center justify-between bg-[#054531] hover:bg-[#043828] dark:bg-slate-800/95 dark:hover:bg-slate-700/95 rounded-xl border border-[#087F5B]/60 hover:border-emerald-400/80 dark:border-slate-700 dark:hover:border-slate-600 transition-all duration-200 shadow-2xs hover:shadow-xs ${
          isOpen ? 'ring-2 ring-emerald-400/80 border-emerald-400 shadow-xs' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-label={`Academic Session Switcher: Active term is ${activeTerm?.term_name || 'No Active Term'} ${activeYear?.year || ''}${!isViewingActiveSession && viewingTerm ? `, viewing ${viewingTerm.term_name}` : ''}. Click to switch terms softly.`}
          className="flex items-center justify-between space-x-2 flex-1 min-w-0 px-2.5 sm:px-3 py-1.5 text-left cursor-pointer select-none rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80 active:scale-[0.99]"
        >
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            <div className="p-1 rounded-lg bg-white/10 dark:bg-slate-700/60 shrink-0 transition-transform duration-200 group-hover:scale-105">
              <Calendar className="w-3.5 h-3.5 text-emerald-300 dark:text-emerald-400" />
            </div>

            <div className="flex items-center space-x-1.5 min-w-0 truncate">
              <span className="text-xs font-bold text-white dark:text-slate-100 tracking-tight truncate">
                {activeTerm && activeTerm.status === 'Active'
                  ? `${activeTerm.term_name} • ${activeYear?.year || ''}`
                  : `Academic Year ${activeYear?.year || ''}`}
              </span>

              {activeTerm && activeTerm.status === 'Active' ? (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-200 dark:text-emerald-300 border border-emerald-400/35 px-1.5 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Active</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/25 text-amber-100 border border-amber-400/40 px-1.5 py-0.5 rounded-full">
                  <span>No Active Term</span>
                </span>
              )}

              {!isViewingActiveSession && viewingTerm && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold bg-sky-500/25 text-sky-100 border border-sky-300/40 dark:bg-indigo-500/30 dark:text-indigo-200 dark:border-indigo-400/40 px-1.5 py-0.5 rounded-full truncate"
                  title={`Viewing records: ${viewingTerm.term_name} ${viewingYear?.year}`}
                >
                  <span>Viewing: {viewingTerm.term_name}</span>
                </span>
              )}
            </div>
          </div>

          <ChevronDown
            className={`w-3.5 h-3.5 text-emerald-200/90 dark:text-slate-400 shrink-0 ml-1 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-white' : 'group-hover:translate-y-0.5'
            }`}
          />
        </button>

        {!isViewingActiveSession && activeTerm && activeTerm.status === 'Active' && (
          <button
            type="button"
            onClick={handleReset}
            className="text-amber-200 hover:text-white p-1.5 mr-1 rounded-lg hover:bg-amber-500/25 active:scale-95 transition-all duration-150 cursor-pointer shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            title="Return to Active Session"
            aria-label="Return to Active Session"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Floating Soft Popover Menu */}
      {isOpen && (
        <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200/90 dark:border-slate-800 p-3.5 z-50 text-slate-800 dark:text-slate-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-[#176B45] dark:text-emerald-400" />
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Select Term Session
              </span>
            </div>
            {!isViewingActiveSession && activeTerm && activeTerm.status === 'Active' && (
              <button
                type="button"
                onClick={handleReset}
                className="text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:text-amber-800 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800/80 transition flex items-center space-x-1 cursor-pointer active:scale-95"
              >
                <RefreshCw className={`w-3 h-3 ${isResetting ? 'animate-spin' : ''}`} />
                <span>Reset to Active</span>
              </button>
            )}
          </div>

          {/* Academic Year Selector Pills */}
          <div className="mb-3">
            <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Academic Year
            </span>
            <div className="flex flex-wrap gap-1.5">
              {years.map((year) => {
                const isSelectedYear = (currentModalYear?.id === year.id) || (currentModalYear?.year === year.year);
                const isActiveYear = activeYear.id === year.id || activeYear.year === year.year;
                return (
                  <button
                    key={year.id}
                    type="button"
                    onClick={() => setSelectedModalYearId(year.id)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all duration-150 flex items-center space-x-1.5 cursor-pointer ${
                      isSelectedYear
                        ? 'bg-[#176B45] text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>{year.year}</span>
                    {isActiveYear && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        isSelectedYear ? 'bg-white/20 text-white' : 'bg-emerald-100 dark:bg-emerald-950 text-[#176B45] dark:text-emerald-400'
                      }`}>
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Term Sessions Soft Buttons */}
          <div>
            <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Terms for {currentModalYear?.year}
            </span>
            <div className="space-y-1.5">
              {modalYearTerms.length === 0 ? (
                <div className="text-center py-3 text-xs text-slate-500 dark:text-slate-400">
                  No terms registered for this year
                </div>
              ) : (
                modalYearTerms.map((term) => {
                  const isCurrentViewing =
                    (viewingYear?.id === currentModalYear?.id || viewingYear?.year === currentModalYear?.year) &&
                    (viewingTerm?.id === term.id || viewingTerm?.term_name === term.term_name);

                  // Operational date-aware status
                  const effectiveStatus = getTermStatusFromDates(term.opening_date, term.closing_date, term.status);
                  const isGenuineActive = effectiveStatus === 'Active';

                  return (
                    <button
                      key={term.id}
                      type="button"
                      onClick={() => handleSelectTerm(currentModalYear.id, term.id)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                        isCurrentViewing
                          ? 'border-[#176B45] bg-[#E8F3EE] dark:bg-emerald-950/60 dark:border-emerald-700 shadow-2xs'
                          : 'border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 active:scale-[0.99]'
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs ${
                            isCurrentViewing
                              ? 'bg-[#176B45] text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {term.term_name.replace('Term ', 'T')}
                        </div>
                        <div className="min-w-0">
                          <span
                            className={`text-xs font-bold block truncate ${
                              isCurrentViewing
                                ? 'text-[#176B45] dark:text-emerald-300'
                                : 'text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {term.term_name}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                            {term.opening_date?.slice(5) || ''} &ndash; {term.closing_date?.slice(5) || ''}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                        {isGenuineActive && (
                          <span className="text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                            Active
                          </span>
                        )}
                        {effectiveStatus === 'Reactivated' && (
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-300 dark:border-indigo-800">
                            Reactivated
                          </span>
                        )}
                        {effectiveStatus === 'Closed' && (
                          <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            Closed
                          </span>
                        )}
                        {effectiveStatus === 'Locked' && (
                          <span className="text-[10px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950 px-1.5 py-0.5 rounded">
                            Locked
                          </span>
                        )}
                        {effectiveStatus === 'Upcoming' && (
                          <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 rounded">
                            Upcoming
                          </span>
                        )}
                        {effectiveStatus === 'Archived' && (
                          <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            Archived
                          </span>
                        )}
                        {isCurrentViewing && (
                          <Check className="w-4 h-4 text-[#176B45] dark:text-emerald-400 shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Quick Active Return Bar if Viewing Archive */}
          {!isViewingActiveSession && (
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
              {activeTerm && activeTerm.status === 'Active' ? (
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full flex items-center justify-center space-x-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 text-xs font-bold py-2 rounded-xl border border-amber-200 dark:border-amber-800/80 transition-all duration-150 cursor-pointer active:scale-[0.98]"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                  <span>Return to Active ({activeTerm.term_name} • {activeYear.year})</span>
                </button>
              ) : (
                <div className="text-center py-1 text-xs text-slate-500 dark:text-slate-400 italic">
                  No Active Term
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
