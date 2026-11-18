import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Database,
  RefreshCw,
  WifiOff,
  X,
  Terminal,
  GraduationCap,
} from 'lucide-react';
import {
  School,
  User,
  Teacher,
  ClassStream,
  Student,
  Subject,
  Examination,
  Mark,
  Grade,
  VerificationLog,
  Role,
  EducationLevel,
} from './types';
import {
  api,
  testSupabaseConnection,
  syncFromSupabase,
  resetSyncState,
  hasCompletedStartupSync,
  getCachedUserId,
  setCachedUserId,
  purgeSensitiveEntityCaches,
  recoverInterruptedCacheCommit,
  reconcileMarksOnReconnect,
  subscribeToMarksRealtime,
  unsubscribeFromMarksRealtime,
  RealtimeMarkCallback,
  ConnectionStatus,
  getSupabaseCredentials,
} from './lib/storage';
import {
  initNetworkMonitoring,
  cleanupNetworkMonitoring,
  getNetworkState,
} from './lib/networkService';
import {
  triggerIntelligentSync,
  handleForegroundResumeSync,
  handleInactivityResumeSync,
  cancelPendingRetries,
  initSyncManagerNetworkBinding,
} from './lib/syncManager';
import { useConnectionStatus } from './utils/useConnectionStatus';
import { getActiveTeacher, getEffectiveRole, ROLE_ALLOWED_TABS, isTabAllowedForRole } from './utils/rbacUtils';
import { authService } from './services/authService';
import { AcademicSessionProvider } from './contexts/AcademicSessionContext';
import { sessionUpdateLock } from './utils/sessionUpdateLock';
import { safeLocalStorage } from './utils/safeStorage';
import { NativeAppStartup } from './lib/nativeAppStartup';

// Core & Shell Navigation Components
import { Header } from './components/Header';
import { Sidebar, TabType } from './components/Sidebar';
import { ModuleIndicator } from './components/ModuleIndicator';
import { MobileBottomNav } from './components/MobileBottomNav';
import { LoginPage } from './components/LoginPage';
import { BiometricStartupGate } from './components/BiometricStartupGate';
import { BiometricEnrollModal } from './components/BiometricEnrollModal';
import { isNativeEnvironment } from './utils/apiConfig';
import { isBiometricLoginAvailableForUser } from './lib/biometricAuthService';
import { NativeBiometric } from './lib/nativeBiometric';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { UnauthorizedView } from './components/UnauthorizedView';
import { useInactivityMonitor } from './utils/useInactivityMonitor';
import { InactivityWarningToast } from './components/InactivityWarningToast';
import { setupHardwareBackNavigation } from './utils/backNavigationHandler';
import { LoadingIndicator } from './components/LoadingIndicator';
import { AssessmentContextualNav } from './components/AssessmentContextualNav';
import { StartupRecoveryScreen, StartupRecoveryReason } from './components/StartupRecoveryScreen';
import { SectionErrorBoundary } from './components/SectionErrorBoundary';
import { startupDiagnostics } from './utils/startupDiagnostics';

// Application Views (Statically Loaded)
import { AdminDashboard } from './components/AdminDashboard';
import { TeacherDashboard } from './components/TeacherDashboard';
import { LearnerPortal } from './components/LearnerPortal';
import { StudentRegistration } from './components/StudentRegistration';
import { TeacherManagement } from './components/TeacherManagement';
import { ClassSubjectManagement } from './components/ClassSubjectManagement';
import { ExaminationManagement } from './components/ExaminationManagement';
import { MarksEntryTable } from './components/MarksEntryTable';
import { MarksMonitoringView } from './components/MarksMonitoringView';
import { ClassTeacherMarksMonitoringView } from './components/ClassTeacherMarksMonitoringView';
import { AssessmentStreamApprovalView } from './components/AssessmentStreamApprovalView';
import { ProvisionalResultsView } from './components/ProvisionalResultsView';
import { ExaminationAnalysisValidation } from './components/ExaminationAnalysisValidation';
import { ReportsView } from './components/ReportsView';
import { GradingSettings } from './components/GradingSettings';
import { SchoolPerformanceAnalytics } from './components/SchoolPerformanceAnalytics';
import { AcademicSessionManagement } from './components/AcademicSessionManagement';
import { StudentPromotionModule } from './components/StudentPromotionModule';
import { SchoolProfileView } from './components/SchoolProfileView';
import { SystemSettingsPage } from './components/SystemSettingsPage';
import { DeveloperSettingsPage } from './components/DeveloperSettingsPage';
import { KjseaAdminManagement } from './components/kjsea/KjseaAdminManagement';

// Modal Components (Statically Loaded)
import { SchoolProfileModal } from './components/SchoolProfileModal';
import { SupabaseModal } from './components/SupabaseModal';
import { LearnerProfileModal } from './components/LearnerProfileModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { SessionLockModal } from './components/SessionLockModal';

export { ROLE_ALLOWED_TABS, isTabAllowedForRole };

export default function App() {

  // Authentication & Session State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [isDataSyncing, setIsDataSyncing] = useState<boolean>(false);

  // Android Biometric Startup Gate & Post-Login Enrollment State
  const [biometricGateUser, setBiometricGateUser] = useState<User | null>(null);
  const [showBiometricEnrollModal, setShowBiometricEnrollModal] = useState<boolean>(false);
  const [pendingEnrollUser, setPendingEnrollUser] = useState<User | null>(null);

  // Android Biometric Foreground Return Lock State
  const [isForegroundLocked, setIsForegroundLocked] = useState<boolean>(false);
  const [foregroundLockUser, setForegroundLockUser] = useState<User | null>(null);

  // Network & Offline Detection State
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isOfflineModeForced, setIsOfflineModeForced] = useState<boolean>(false);
  const [startupRecoveryReason, setStartupRecoveryReason] = useState<StartupRecoveryReason | null>(null);

  // Database State
  const [school, setSchool] = useState<School>(api.getSchool());
  const [teachers, setTeachers] = useState<Teacher[]>(api.getTeachers());
  const [classes, setClasses] = useState<ClassStream[]>(api.getClasses());
  const [students, setStudents] = useState<Student[]>(api.getStudents());
  const [marksStudents, setMarksStudents] = useState<Student[]>(api.getAllStudentsForMarks());
  const [subjects, setSubjects] = useState<Subject[]>(api.getSubjects());
  const [exams, setExams] = useState<Examination[]>(api.getExaminations());
  const [marks, setMarks] = useState<Mark[]>(api.getMarks());
  const [grades, setGrades] = useState<Grade[]>(api.getGrades());
  const [verificationLogs, setVerificationLogs] = useState<VerificationLog[]>(
    api.getVerificationLogs()
  );

  const activeTeacher = getActiveTeacher(currentUser || null, teachers || []);

  // Supabase Connection Status & Priority 2 Connectivity Status
  const connectionStatus = useConnectionStatus();
  const [showRestoredToast, setShowRestoredToast] = useState(false);
  const [showRealtimeUnavailableToast, setShowRealtimeUnavailableToast] = useState(false);
  const prevStatusRef = useRef<ConnectionStatus>(connectionStatus);
  const connectionToastTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Inactivity & Non-Destructive 8-Hour Maximum Session Lock Monitor
  const {
    isWarningVisible,
    warningType,
    isSessionLocked,
    lockReason,
    resetActivity,
    dismissWarning,
    unlockSession,
  } = useInactivityMonitor({
    enabled: isAuthenticated && currentUser !== null,
    getLastActivityTime: () => authService.getLastActivityTime(),
    onActivityRecord: (timestamp) => authService.recordLastActivity(timestamp),
    getSessionStartTime: () => authService.getSessionStartTime(),
    onSessionRenew: () => authService.recordSessionStart(Date.now()),
    onActive: () => {
      handleInactivityResumeSync().then((succeeded) => {
        if (succeeded) refreshData();
      }).catch(() => {});
    },
  });

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = connectionStatus;

    if (
      (prev === 'offline' || prev === 'reconnecting' || prev === 'syncing' || prev === 'realtime_unavailable') &&
      connectionStatus === 'online'
    ) {
      if (connectionToastTimerRef.current) {
        clearTimeout(connectionToastTimerRef.current);
      }
      setShowRestoredToast(true);
      setShowRealtimeUnavailableToast(false);
      connectionToastTimerRef.current = setTimeout(() => {
        setShowRestoredToast(false);
        connectionToastTimerRef.current = null;
      }, 3500);
    } else if (prev !== 'realtime_unavailable' && connectionStatus === 'realtime_unavailable') {
      if (connectionToastTimerRef.current) {
        clearTimeout(connectionToastTimerRef.current);
      }
      setShowRealtimeUnavailableToast(true);
      setShowRestoredToast(false);
      connectionToastTimerRef.current = setTimeout(() => {
        setShowRealtimeUnavailableToast(false);
        connectionToastTimerRef.current = null;
      }, 3500);
    }
  }, [connectionStatus]);

  useEffect(() => {
    return () => {
      if (connectionToastTimerRef.current) {
        clearTimeout(connectionToastTimerRef.current);
      }
    };
  }, []);

  const [dbStatus, setDbStatus] = useState<{
    checking: boolean;
    success: boolean;
    message: string;
    url?: string;
    error?: string;
    fixInstructions?: string;
    records?: any[];
    lastCheckedAt?: number;
  }>({
    checking: true,
    success: false,
    message: 'Testing connection to Supabase project...',
    lastCheckedAt: undefined,
  });
  const [dismissBanner, setDismissBanner] = useState(false);

  // UI State
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  // Lightweight Navigation History Stack for Android Back Navigation
  const navigationHistoryRef = useRef<TabType[]>([]);
  const isNavigatingBackRef = useRef<boolean>(false);

  // Synchronize navigation context into SessionUpdateLock to protect sensitive views (e.g., marks-entry)
  useEffect(() => {
    sessionUpdateLock.setNavigationTab(activeTab);
  }, [activeTab]);
  const [isOpenMobileSidebar, setIsOpenMobileSidebar] = useState(false);
  const [isOpenSchoolProfileModal, setIsOpenSchoolProfileModal] = useState(false);
  const [isOpenSupabaseModal, setIsOpenSupabaseModal] = useState(false);
  const [isOpenSearchModal, setIsOpenSearchModal] = useState(false);
  const [profileStudent, setProfileStudent] = useState<Student | null>(null);

  // Global Ctrl+K / Cmd+K Search Shortcut
  useEffect(() => {
    const handleGlobalSearchKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpenSearchModal((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalSearchKey);
    return () => window.removeEventListener('keydown', handleGlobalSearchKey);
  }, []);

  // Android Hardware Back Button Navigation Handler
  useEffect(() => {
    const cleanupBackNavigation = setupHardwareBackNavigation(() => {
      const defaultTab: TabType = currentUser?.role === 'learner' ? 'learner-portal' : 'dashboard';
      const isModalOpen = isOpenSchoolProfileModal || isOpenSupabaseModal || isOpenSearchModal || profileStudent !== null;
      const isDrawerOpen = isOpenMobileSidebar;

      // Filter history stack to find the most recent valid and allowed tab
      const tch = getActiveTeacher(currentUser, teachers || []);
      const history = navigationHistoryRef.current;
      while (
        history.length > 0 &&
        (!history[history.length - 1] ||
          history[history.length - 1] === activeTab ||
          !isTabAllowedForRole(currentUser, history[history.length - 1], tch, classes))
      ) {
        history.pop();
      }

      const hasHistory = history.length > 0;
      const canGoBack = hasHistory || activeTab !== defaultTab;

      return {
        isSessionLocked: isSessionLocked || isForegroundLocked,
        isModalOpen,
        onCloseModal: () => {
          if (profileStudent !== null) setProfileStudent(null);
          else if (isOpenSearchModal) setIsOpenSearchModal(false);
          else if (isOpenSchoolProfileModal) setIsOpenSchoolProfileModal(false);
          else if (isOpenSupabaseModal) setIsOpenSupabaseModal(false);
        },
        isDrawerOpen,
        onCloseDrawer: () => setIsOpenMobileSidebar(false),
        canGoBack,
        onGoBack: () => {
          if (hasHistory) {
            const previousTab = history.pop()!;
            isNavigatingBackRef.current = true;
            setActiveTab(previousTab);
            window.location.hash = previousTab;
          } else {
            isNavigatingBackRef.current = true;
            setActiveTab(defaultTab);
            window.location.hash = defaultTab;
          }
        },
        isRootView: !canGoBack,
      };
    });

    return () => cleanupBackNavigation();
  }, [
    isSessionLocked,
    isForegroundLocked,
    isOpenSchoolProfileModal,
    isOpenSupabaseModal,
    isOpenSearchModal,
    profileStudent,
    isOpenMobileSidebar,
    activeTab,
    currentUser,
    teachers,
    classes,
  ]);

  // Capacitor Android Foreground / Background App Lifecycle Listener
  useEffect(() => {
    if (!isNativeEnvironment()) return;

    let appStateHandle: any = null;

    const setupAppStateListener = async () => {
      try {
        appStateHandle = await CapacitorApp.addListener('appStateChange', async ({ isActive }) => {
          if (!isActive) {
            // App transitioning to background: lock workspace if teacher/admin is authenticated with biometric enabled
            if (isAuthenticated && currentUser && currentUser.role !== 'learner' && !biometricGateUser) {
              try {
                const { available, state: bioState } = await isBiometricLoginAvailableForUser(currentUser.id);
                if (available && bioState && bioState.enabled) {
                  setIsForegroundLocked(true);
                  setForegroundLockUser(currentUser);
                }
              } catch (bioErr) {
                console.warn('Background lock availability check error:', bioErr);
              }
            }
          } else {
            // App returning to foreground: perform resilient lifecycle recovery
            startupDiagnostics.record('foreground_resumed', 'Android app returned to foreground');
            recoverInterruptedCacheCommit();
            if (typeof navigator !== 'undefined') {
              setIsOnline(navigator.onLine);
            }
            // If user is authenticated and not locked behind biometric gate, verify server session & reconnect realtime
            if (isAuthenticated && currentUser && !isForegroundLocked && !biometricGateUser) {
              authService.verifyServerUser().then((verification) => {
                if (verification.status === 'revoked') {
                  console.warn('[App] Server verification on resume revoked access');
                  handleLogout();
                } else if (verification.status === 'role_changed') {
                  setCurrentUser(verification.user);
                  api.setCurrentUser(verification.user);
                  refreshData();
                }
              }).catch(() => {});
              // Reconcile realtime marks if disconnected
              reconcileMarksOnReconnect().catch(() => {});
              // Perform intelligent background sync if data is stale
              handleForegroundResumeSync().then((succeeded) => {
                if (succeeded) refreshData();
              }).catch(() => {});
            }
          }
        });
      } catch (err) {
        console.warn('Error registering Capacitor appStateChange listener:', err);
      }
    };

    setupAppStateListener();

    return () => {
      if (appStateHandle && typeof appStateHandle.remove === 'function') {
        appStateHandle.remove();
      }
    };
  }, [isAuthenticated, currentUser, biometricGateUser]);

  // Web / Browser Foreground Resume Listener
  useEffect(() => {
    if (isNativeEnvironment() || typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        startupDiagnostics.record('foreground_resumed', 'Browser tab returned to foreground');
        recoverInterruptedCacheCommit();
        if (typeof navigator !== 'undefined') {
          setIsOnline(navigator.onLine);
        }
        if (isAuthenticated && currentUser && !isForegroundLocked && !biometricGateUser) {
          authService.verifyServerUser().then((verification) => {
            if (verification.status === 'revoked') {
              console.warn('[App] Server verification on tab focus revoked access');
              handleLogout();
            } else if (verification.status === 'role_changed') {
              setCurrentUser(verification.user);
              api.setCurrentUser(verification.user);
              refreshData();
            }
          }).catch(() => {});
          reconcileMarksOnReconnect().catch(() => {});
          handleForegroundResumeSync().then((succeeded) => {
            if (succeeded) refreshData();
          }).catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, currentUser, isForegroundLocked, biometricGateUser]);

  // Phase 2D: Global Network Monitoring & Sync Binding
  useEffect(() => {
    const cleanupNet = initNetworkMonitoring();
    const cleanupSync = initSyncManagerNetworkBinding();
    return () => {
      cleanupNet();
      cleanupSync();
    };
  }, []);

  // Browser/Device Online & Offline State Sync
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsOfflineModeForced(false);
      // Non-blocking connectivity verification without disrupting active view
      verifyAndSyncSupabase({ checkConnectivityOnly: true }).catch(() => {});
    };
    const handleOffline = () => {
      setIsOnline(false);
      setIsDataSyncing(false);
      setDbStatus((prev) => ({
        ...prev,
        checking: false,
        success: false,
        message: 'You are currently offline. Please check your internet connection.',
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initial authentication check & session listener
  useEffect(() => {
    let isMounted = true;

    const initAuthSession = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (isMounted) {
          setIsOnline(false);
          setIsAuthChecking(false);
          setDbStatus({
            checking: false,
            success: false,
            message: 'Offline Mode: No internet connection detected.',
            error: 'Offline',
          });
        }
        return;
      }

      recoverInterruptedCacheCommit();
      startupDiagnostics.record('auth_restoration_start');
      setIsAuthChecking(true);

      // Startup Timeout Safety Watchdog (8 seconds maximum)
      let startupTimer: NodeJS.Timeout | null = setTimeout(() => {
        if (isMounted) {
          console.warn('[App] Startup session verification exceeded 8s timeout.');
          startupDiagnostics.record('recovery_invoked', 'Startup session verification timeout after 8s');
          setIsAuthChecking(false);
          const cachedUser = api.getCurrentUser();
          if (cachedUser && cachedUser.id && cachedUser.role) {
            // Keep user session, do not log out merely because of network lag
            setCurrentUser(cachedUser);
            setIsAuthenticated(true);
            setStartupRecoveryReason(null);
          } else {
            setStartupRecoveryReason(typeof navigator !== 'undefined' && navigator.onLine ? 'startup_timeout' : 'no_internet');
          }
        }
      }, 8000);

      try {
        const user = await authService.getSession();
        if (startupTimer) {
          clearTimeout(startupTimer);
          startupTimer = null;
        }
        startupDiagnostics.record('auth_restoration_end', user ? 'User session restored' : 'No stored session');
        if (isMounted) {
          if (user && user.id && user.role) {
            // User identity binding: if account switched, purge stale previous user cache
            const lastCachedUserId = getCachedUserId();
            if (lastCachedUserId && lastCachedUserId !== user.id) {
              console.log('[App] Account switch detected; purging previous user cache.');
              purgeSensitiveEntityCaches();
              refreshData();
            }
            setCachedUserId(user.id);

            // Android Biometric Startup Gate Check:
            // If biometric login is enabled for this teacher/admin, hold workspace behind Biometric Gate
            if (isNativeEnvironment() && user.role !== 'learner') {
              try {
                const { available, state: bioState } = await isBiometricLoginAvailableForUser(user.id);
                if (available && bioState && bioState.enabled) {
                  setBiometricGateUser(user);
                  setIsAuthChecking(false);
                  setDbStatus({
                    checking: false,
                    success: true,
                    url: getSupabaseCredentials().url,
                    message: 'Supabase session verified',
                  });
                  return;
                }
              } catch (bioErr) {
                console.warn('Biometric startup gate check error:', bioErr);
              }
            }

            setCurrentUser(user);
            setIsAuthenticated(true);
            api.setCurrentUser(user);

            const hash = window.location.hash.replace('#', '') as TabType;
            const tch = getActiveTeacher(user, api.getTeachers());
            const currentClasses = api.getClasses();
            if (hash && isTabAllowedForRole(user, hash, tch, currentClasses)) {
              setActiveTab(hash);
            } else {
              const defaultTab: TabType = user.role === 'learner' ? 'learner-portal' : 'dashboard';
              setActiveTab(defaultTab);
              window.location.hash = defaultTab;
            }

            // Immediately mark authentication check complete so initial safe interface renders
            // and signals NativeAppStartup.notifyAppReady() within ~100-300ms
            setIsAuthChecking(false);
            setDbStatus({
              checking: false,
              success: true,
              url: getSupabaseCredentials().url,
              message: 'Supabase session verified',
            });

            // 1. Asynchronously verify user standing with Supabase Auth servers (detect bans/revocations/role changes)
            authService.verifyServerUser().then((verification) => {
              if (!isMounted) return;
              if (verification.status === 'revoked') {
                console.warn('[App] Server verification revoked access:', verification.reason);
                handleLogout();
              } else if (verification.status === 'role_changed') {
                console.log('[App] Server verification detected role change to:', verification.newRole);
                setCurrentUser(verification.user);
                api.setCurrentUser(verification.user);
                refreshData();
              }
            }).catch((err) => {
              console.warn('[App] Background server user verification error:', err);
            });

            // 2. Asynchronously run background authoritative Supabase data sync
            triggerIntelligentSync().then((syncSucceeded) => {
              if (!isMounted) return;
              if (api.getCurrentUser()?.id === user.id) {
                refreshData();
              }
              if (syncSucceeded) {
                setIsOnline(true);
                setIsOfflineModeForced(false);
                safeLocalStorage.setItem('cbe_system_configured', 'true');
                setDbStatus({
                  checking: false,
                  success: true,
                  url: getSupabaseCredentials().url,
                  message: 'Supabase connection successful',
                });
              }
            }).catch((syncErr) => {
              console.warn('[App] Background session recovery sync error:', syncErr);
            });
          } else {
            setCurrentUser(null);
            setIsAuthenticated(false);
            api.setCurrentUser(null);
            setIsAuthChecking(false);
            // Non-blocking connectivity check for dbStatus reporting for unauthenticated visitors
            verifyAndSyncSupabase({ checkConnectivityOnly: true }).catch((connErr) => {
              console.warn('Unauthenticated background Supabase connectivity check error:', connErr);
            });
          }
        }
      } catch (err: any) {
        if (startupTimer) {
          clearTimeout(startupTimer);
          startupTimer = null;
        }
        console.error('Error verifying auth session:', err);
        if (isMounted) {
          const errMsg = String(err?.message || err || '').toLowerCase();
          const isNetErr = errMsg.includes('failed to fetch') || errMsg.includes('network') || !navigator.onLine;
          const cachedUser = api.getCurrentUser();
          if (isNetErr && cachedUser && cachedUser.id && cachedUser.role) {
            // Network failure: preserve cached user session without logging user out
            setCurrentUser(cachedUser);
            setIsAuthenticated(true);
            setStartupRecoveryReason(null);
          } else if (isNetErr) {
            setStartupRecoveryReason(typeof navigator !== 'undefined' && navigator.onLine ? 'supabase_unavailable' : 'no_internet');
            setIsAuthenticated(false);
          } else {
            setCurrentUser(null);
            setIsAuthenticated(false);
            api.setCurrentUser(null);
          }
          setIsAuthChecking(false);
        }
      } finally {
        if (startupTimer) {
          clearTimeout(startupTimer);
          startupTimer = null;
        }
        if (isMounted) {
          setIsAuthChecking(false);
        }
      }
    };

    initAuthSession();

    const unsubscribe = authService.onAuthStateChange((user) => {
      if (!isMounted) return;
      if (user && user.id && user.role) {
        setCurrentUser(user);
        setIsAuthenticated(true);
        api.setCurrentUser(user);
      } else {
        resetSyncState();
        navigationHistoryRef.current = [];
        isNavigatingBackRef.current = false;
        setCurrentUser(null);
        setIsAuthenticated(false);
        api.setCurrentUser(null);
        window.location.hash = '';
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Single-use guard to signal native Android container that initial safe interface has committed and painted
  const hasSignaledAppReadyRef = useRef<boolean>(false);

  useEffect(() => {
    // Only signal readiness once authentication checking has completed and an initial screen is rendered
    if (!isAuthChecking && !hasSignaledAppReadyRef.current) {
      hasSignaledAppReadyRef.current = true;
      startupDiagnostics.record('first_safe_interface_render');
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            NativeAppStartup.notifyAppReady().then(() => {
              startupDiagnostics.record('native_splash_dismissed');
            }).catch((err) => {
              console.warn('[Startup] notifyAppReady warning:', err);
            });
          });
        });
      } else {
        NativeAppStartup.notifyAppReady().then(() => {
          startupDiagnostics.record('native_splash_dismissed');
        }).catch((err) => {
          console.warn('[Startup] notifyAppReady fallback warning:', err);
        });
      }
    }
  }, [isAuthChecking]);

  // Sync activeTab with URL hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as TabType;
      if (hash && isAuthenticated && currentUser) {
        if (isNavigatingBackRef.current) {
          isNavigatingBackRef.current = false;
          return;
        }

        if (!isTabAllowedForRole(currentUser, hash, activeTeacher, classes)) {
          const defaultTab: TabType = currentUser.role === 'learner' ? 'learner-portal' : 'dashboard';
          if (activeTab !== defaultTab) {
            navigationHistoryRef.current.push(activeTab);
          }
          setActiveTab(defaultTab);
          window.location.hash = defaultTab;
          return;
        }

        if (hash !== activeTab) {
          const history = navigationHistoryRef.current;
          if (history.length === 0 || history[history.length - 1] !== activeTab) {
            history.push(activeTab);
            if (history.length > 20) {
              history.shift();
            }
          }
          setActiveTab(hash);
        }
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [isAuthenticated, currentUser, activeTeacher, classes, activeTab]);

  // Stage 8B: Realtime Marks State Synchronization
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleRealtimeMarkEvent: RealtimeMarkCallback = () => {
      setMarks(api.getMarks());
    };

    subscribeToMarksRealtime(handleRealtimeMarkEvent);

    return () => {
      unsubscribeFromMarksRealtime(handleRealtimeMarkEvent);
    };
  }, [isAuthenticated]);

  // Connection test & data sync
  const verifyAndSyncSupabase = async (options?: { forceSync?: boolean; checkConnectivityOnly?: boolean }) => {
    setDbStatus((prev) => ({ ...prev, checking: true }));
    const result = await testSupabaseConnection();
    const completedAt = Date.now();
    if (result.success) {
      setIsOnline(true);
      setIsOfflineModeForced(false);
      safeLocalStorage.setItem('cbe_system_configured', 'true');

      // Trigger sync ONLY if forceSync is explicitly requested AND checkConnectivityOnly is NOT set
      if (options?.forceSync && !options?.checkConnectivityOnly) {
        const sessionUser = await authService.getSession();
        if (sessionUser && sessionUser.id && sessionUser.role) {
          await triggerIntelligentSync({ force: true });
          refreshData();
        }
      }

      setDbStatus({
        checking: false,
        success: true,
        url: result.url,
        message: 'Supabase connection successful',
        records: result.records,
        lastCheckedAt: completedAt,
      });
    } else {
      setDbStatus({
        checking: false,
        success: false,
        url: result.url,
        message: result.message,
        error: result.error,
        fixInstructions: result.fixInstructions,
        lastCheckedAt: completedAt,
      });

      // If we failed to connect, check if the browser/device itself is offline
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setIsOnline(false);
      }

      // If system has never been configured and user is admin, prompt for first-time database setup
      const isConfigured = safeLocalStorage.getItem('cbe_system_configured');
      if (!isConfigured && currentUser?.role === 'admin') {
        setIsOpenSupabaseModal(true);
      }
    }
  };

  // Sync state whenever data updates
  const refreshData = () => {
    setSchool(api.getSchool());
    setTeachers(api.getTeachers());
    setClasses(api.getClasses());
    setStudents(api.getStudents());
    setMarksStudents(api.getAllStudentsForMarks());
    setSubjects(api.getSubjects());
    setExams(api.getExaminations());
    setMarks(api.getMarks());
    setGrades(api.getGrades());
    setVerificationLogs(api.getVerificationLogs());
  };

  const handleMarksUpdated = useCallback(() => {
    setMarks(api.getMarks());
    setExams(api.getExaminations());
  }, []);

  // Select tab with URL hash update
  const handleSelectTab = (tab: TabType) => {
    if (!isTabAllowedForRole(currentUser, tab, activeTeacher, classes)) {
      const defaultTab: TabType = currentUser?.role === 'learner' ? 'learner-portal' : 'dashboard';
      if (activeTab !== defaultTab) {
        navigationHistoryRef.current.push(activeTab);
      }
      setActiveTab(defaultTab);
      window.location.hash = defaultTab;
      return;
    }

    if (tab !== activeTab) {
      // Record current tab in history stack before transitioning to new tab
      const history = navigationHistoryRef.current;
      if (history.length === 0 || history[history.length - 1] !== activeTab) {
        history.push(activeTab);
        if (history.length > 20) {
          history.shift();
        }
      }
    }

    setActiveTab(tab);
    window.location.hash = tab;
    setMarks(api.getMarks());
  };

  // Secure logout handler with instant UI transition
  const handleLogout = () => {
    // 1. Instantly transition UI to Login screen (0ms delay)
    setIsForegroundLocked(false);
    setForegroundLockUser(null);
    setBiometricGateUser(null);
    setIsAuthenticated(false);
    setCurrentUser(null);
    api.setCurrentUser(null);
    cancelPendingRetries();
    resetSyncState();
    purgeSensitiveEntityCaches();
    setCachedUserId(null);
    unsubscribeFromMarksRealtime();
    navigationHistoryRef.current = [];
    isNavigatingBackRef.current = false;
    window.location.hash = '';

    // 2. Invalidate cloud authentication session asynchronously in background
    authService.signOut().catch((err) => {
      console.warn('Background sign out error:', err);
    });
  };

  // Callback when biometric startup gate authentication succeeds
  const handleBiometricGateSuccess = (user: User) => {
    // 1. Immediately transition to authenticated workspace (0ms blocking delay)
    setBiometricGateUser(null);
    setCurrentUser(user);
    setIsAuthenticated(true);
    api.setCurrentUser(user);

    const hash = window.location.hash.replace('#', '') as TabType;
    const tch = getActiveTeacher(user, api.getTeachers());
    const currentClasses = api.getClasses();
    if (hash && isTabAllowedForRole(user, hash, tch, currentClasses)) {
      setActiveTab(hash);
    } else {
      const defaultTab: TabType = user.role === 'learner' ? 'learner-portal' : 'dashboard';
      setActiveTab(defaultTab);
      window.location.hash = defaultTab;
    }

    // 2. Perform authoritative data synchronisation non-blockingly in the background
    triggerIntelligentSync()
      .then((syncSucceeded) => {
        refreshData();
        if (syncSucceeded) {
          setIsOnline(true);
          setIsOfflineModeForced(false);
          safeLocalStorage.setItem('cbe_system_configured', 'true');
          setDbStatus({
            checking: false,
            success: true,
            url: getSupabaseCredentials().url,
            message: 'Supabase connection successful',
          });
        } else {
          verifyAndSyncSupabase({ checkConnectivityOnly: true });
        }
      })
      .catch((syncErr) => {
        console.warn('Biometric gate background sync error:', syncErr);
      });
  };

  // Callback when teacher selects 'Use Password Instead' on the startup biometric gate
  const handleBiometricGateFallbackPassword = () => {
    setIsForegroundLocked(false);
    setForegroundLockUser(null);
    setBiometricGateUser(null);
    setIsAuthenticated(false);
    setCurrentUser(null);
    api.setCurrentUser(null);
    cancelPendingRetries();
    resetSyncState();
    unsubscribeFromMarksRealtime();
    window.location.hash = '';

    authService.signOut().catch((err) => {
      console.warn('Background fallback sign out error:', err);
    });
  };

  // Callback when teacher/admin unlocks workspace via foreground return biometric gate
  const handleForegroundBiometricSuccess = async (user: User) => {
    // Confirm existing Supabase session is still active and valid
    const confirmedUser = await authService.getSession();
    if (confirmedUser && confirmedUser.id === user.id) {
      setIsForegroundLocked(false);
      setForegroundLockUser(null);
    } else {
      // Session revoked or expired while in background -> fallback to login
      handleForegroundBiometricFallbackPassword();
    }
  };

  // Callback when teacher/admin selects 'Use Password Instead' on the foreground return biometric gate
  const handleForegroundBiometricFallbackPassword = () => {
    setIsForegroundLocked(false);
    setForegroundLockUser(null);
    setBiometricGateUser(null);
    setIsAuthenticated(false);
    setCurrentUser(null);
    api.setCurrentUser(null);
    cancelPendingRetries();
    resetSyncState();
    unsubscribeFromMarksRealtime();
    window.location.hash = '';

    authService.signOut().catch((err) => {
      console.warn('Foreground fallback sign out error:', err);
    });
  };

  // Successful login callback from LoginPage
  const handleLoginSuccess = async (user: User) => {
    cancelPendingRetries();
    resetSyncState();
    setIsDataSyncing(true);
    try {
      setCurrentUser(user);
      setIsAuthenticated(true);
      api.setCurrentUser(user);

      // Perform authoritative post-login synchronisation using the authenticated Supabase session
      await triggerIntelligentSync({ force: true });
      refreshData();

      // On Android native, check if teacher/admin is eligible for biometric opt-in prompt
      if (isNativeEnvironment() && user.role !== 'learner') {
        try {
          const { available, state: bioState } = await isBiometricLoginAvailableForUser(user.id);
          if (!bioState || !bioState.enabled) {
            const availCheck = await NativeBiometric.isAvailable();
            if (availCheck.isAvailable) {
              setPendingEnrollUser(user);
              setShowBiometricEnrollModal(true);
            }
          }
        } catch (bioEnrollErr) {
          console.warn('Biometric enrollment check error:', bioEnrollErr);
        }
      }

      const hash = window.location.hash.replace('#', '') as TabType;
      const tch = getActiveTeacher(user, api.getTeachers());
      const currentClasses = api.getClasses();
      if (hash && isTabAllowedForRole(user, hash, tch, currentClasses)) {
        setActiveTab(hash);
      } else {
        const defaultTab: TabType = user.role === 'learner' ? 'learner-portal' : 'dashboard';
        setActiveTab(defaultTab);
        window.location.hash = defaultTab;
      }
    } catch (syncErr) {
      console.error('Post-login data synchronisation failed:', syncErr);
    } finally {
      setIsDataSyncing(false);
    }
  };

  // CRUD Actions
  const handleUpdateSchool = async (updated: School) => {
    const saved = await api.updateSchool(updated);
    setSchool(saved);
  };

  const handleAddStudent = async (std: Student) => {
    try {
      await api.addStudent(std);
      await refreshData();
    } catch (err: any) {
      console.error('Error adding student:', err);
      throw err;
    }
  };

  const handleBatchAddStudents = async (batch: Student[]) => {
    try {
      await api.batchAddStudents(batch);
      await refreshData();
    } catch (err: any) {
      console.error('Error batch registering learners:', err);
      throw err;
    }
  };

  const handleUpdateStudent = async (std: Student) => {
    try {
      await api.updateStudent(std);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to update learner:', err);
      throw err;
    }
  };

  const handleDeleteStudent = async (id: string) => {
    try {
      await api.deleteStudent(id);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to delete learner:', err);
      throw err;
    }
  };

  const handleAddTeacher = (tch: Teacher, authUserId?: string) => {
    api.addTeacher(tch, authUserId);
    refreshData();
  };

  const handleUpdateTeacher = async (tch: Teacher) => {
    await api.updateTeacher(tch);
    setTeachers((prev) => prev.map((t) => (t.id === tch.id || (t.email && tch.email && t.email.trim().toLowerCase() === tch.email.trim().toLowerCase()) ? { ...t, ...tch } : t)));
    await refreshData();
  };

  const handleDeleteTeacher = async (id: string) => {
    const targetTeacher = teachers.find((t) => t.id === id);
    const res = await authService.adminDeleteTeacher(id, targetTeacher?.email);
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete teacher account.');
    }
    await refreshData();
  };

  const handleAddClass = async (cls: ClassStream) => {
    try {
      await api.addClass(cls);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to add class/stream:', err);
      throw err;
    }
  };

  const handleUpdateClass = async (cls: ClassStream) => {
    try {
      await api.updateClass(cls);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to update class/stream:', err);
      throw err;
    }
  };

  const handleDeleteClass = async (id: string) => {
    try {
      await api.deleteClass(id);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to delete class from database:', err);
      throw err;
    }
  };

  const handleDeleteStream = async (streamId: string) => {
    try {
      await api.deleteStream(streamId);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to delete stream from database:', err);
      throw err;
    }
  };

  const handleAddSubject = async (sb: Subject) => {
    try {
      await api.addSubject(sb);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to add learning area:', err);
      throw err;
    }
  };

  const handleUpdateSubject = async (sb: Subject) => {
    try {
      await api.updateSubject(sb);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to update learning area:', err);
      throw err;
    }
  };

  const handleDeleteSubject = async (id: string) => {
    await api.deleteSubject(id);
    await refreshData();
  };

  const handleAddExamination = async (ex: Examination) => {
    await api.addExamination(ex);
    await refreshData();
  };

  const handleUpdateExamination = async (ex: Examination) => {
    await api.updateExamination(ex, currentUser);
    await refreshData();
  };

  const handleUpdateExamStatus = async (examId: string, status: Examination['status']) => {
    await api.updateExaminationStatus(examId, status, currentUser);
    await refreshData();
  };

  const handleUpdateExamLevelApproval = async (
    examId: string,
    level: EducationLevel,
    approved: boolean
  ) => {
    await api.updateExaminationLevelApproval(examId, level, approved, currentUser);
    await refreshData();
  };

  const handleUpdateExamClassApproval = async (
    examId: string,
    classStreamId: string,
    approved: boolean
  ) => {
    await api.updateExaminationClassApproval(examId, classStreamId, approved, currentUser);
    await refreshData();
  };

  const handleDeleteExamination = async (examId: string) => {
    const res = await api.deleteExamination(examId, currentUser);
    await refreshData();
    return res;
  };

  const handleSaveMarks = async (newMarks: Mark[]) => {
    try {
      await api.saveBulkMarks(newMarks, currentUser);
      setMarks(api.getMarks());
    } catch (err: any) {
      console.error('Failed to save marks:', err);
      throw err;
    }
  };

  const handleUpdateGrades = async (newGrades: Grade[]) => {
    try {
      await api.updateGrades(newGrades);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to update grading boundaries:', err);
      throw err;
    }
  };

  const handleAddVerificationLog = (log: VerificationLog) => {
    api.addVerificationLog(log);
    refreshData();
  };

  const handleResetDemoData = () => {
    if (window.confirm('Are you sure you want to reset all data to the clean default seed?')) {
      api.resetToDefaultSeed();
      refreshData();
    }
  };

  // Render User-Friendly Recovery Screen for startup delay, server outage, or data sync errors
  if (startupRecoveryReason) {
    return (
      <StartupRecoveryScreen
        reason={startupRecoveryReason}
        school={school}
        cachedUser={api.getCurrentUser()}
        onRetry={() => {
          setStartupRecoveryReason(null);
          setIsAuthChecking(true);
          verifyAndSyncSupabase({ checkConnectivityOnly: true }).finally(() => {
            setIsAuthChecking(false);
          });
        }}
        onContinueCached={() => {
          const cachedUser = api.getCurrentUser();
          if (cachedUser) {
            setCurrentUser(cachedUser);
            setIsAuthenticated(true);
            setIsOfflineModeForced(true);
            setStartupRecoveryReason(null);
          }
        }}
        onProceedLogin={() => {
          setStartupRecoveryReason(null);
          setIsAuthChecking(false);
          setIsAuthenticated(false);
          setCurrentUser(null);
        }}
        onResetSession={() => {
          resetSyncState();
          purgeSensitiveEntityCaches();
          setCachedUserId(null);
          handleLogout();
        }}
      />
    );
  }

  // Render Offline Screen strictly when device is offline
  if (!isOnline && !isOfflineModeForced) {
    return (
      <StartupRecoveryScreen
        reason="no_internet"
        school={school}
        cachedUser={api.getCurrentUser()}
        onRetry={() => {
          const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
          setIsOnline(online);
          if (online) {
            setIsAuthChecking(true);
            verifyAndSyncSupabase({ checkConnectivityOnly: true }).finally(() => {
              setIsAuthChecking(false);
            });
          }
        }}
        onContinueCached={() => {
          const cachedUser = api.getCurrentUser();
          if (cachedUser) {
            setCurrentUser(cachedUser);
            setIsAuthenticated(true);
            setIsAuthChecking(false);
            setIsDataSyncing(false);
            setIsOfflineModeForced(true);
          }
        }}
        onProceedLogin={() => {
          setIsAuthChecking(false);
          setIsDataSyncing(false);
          setIsOfflineModeForced(true);
        }}
      />
    );
  }

  // Render Loading / Synchronising Screen during initial startup session verification, post-login hydration, or authenticated connectivity checks.
  // Unauthenticated visitors (on LoginPage) must not be blocked by background Supabase connectivity checks.
  const isProtectedDataLoading = isAuthenticated && (isAuthChecking || dbStatus.checking);
  if (isDataSyncing || isAuthChecking || isProtectedDataLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="min-h-screen bg-[#176B45] flex items-center justify-center p-4"
      >
        <div
          className="w-[clamp(120px,36.7vw,160px)] h-[clamp(120px,36.7vw,160px)] text-white flex items-center justify-center"
          style={{ width: 'clamp(120px, 36.7vw, 160px)', height: 'clamp(120px, 36.7vw, 160px)' }}
        >
          <GraduationCap className="w-full h-full text-white" strokeWidth={1.2} />
        </div>
      </div>
    );
  }

  // Mandatory Android Biometric Foreground Return Lock Guard
  if (isForegroundLocked && foregroundLockUser && isAuthenticated) {
    return (
      <BiometricStartupGate
        user={foregroundLockUser}
        school={school}
        onSuccess={handleForegroundBiometricSuccess}
        onFallbackPassword={handleForegroundBiometricFallbackPassword}
      />
    );
  }

  // Render Biometric Startup Gate or Login Page if not authenticated or no active user
  if (!isAuthenticated || !currentUser) {
    if (biometricGateUser) {
      return (
        <BiometricStartupGate
          user={biometricGateUser}
          school={school}
          onSuccess={handleBiometricGateSuccess}
          onFallbackPassword={handleBiometricGateFallbackPassword}
        />
      );
    }

    return (
      <LoginPage
        school={school}
        onLoginSuccess={handleLoginSuccess}
        dbStatusSuccess={dbStatus.success}
      />
    );
  }

  // Mandatory First Login Password Change Guard
  if (currentUser.force_password_change) {
    return (
      <ChangePasswordModal
        user={currentUser}
        onPasswordChanged={(updatedUser) => {
          setCurrentUser(updatedUser);
          api.setCurrentUser(updatedUser);
        }}
        onLogout={handleLogout}
      />
    );
  }

  // Active Teacher / Student context
  const effectiveRole = getEffectiveRole(currentUser, activeTeacher, classes);
  const effectiveUser =
    currentUser && effectiveRole !== currentUser.role
      ? { ...currentUser, role: effectiveRole }
      : currentUser;

  const activeStudent =
    currentUser.role === 'student'
      ? students.find((s) => s.id === currentUser.student_id) || students[0]
      : null;

  // Check role authorization for activeTab
  const isTabAllowed = isTabAllowedForRole(currentUser, activeTab, activeTeacher, classes);

  const handleSelectSearchResult = (category: string, item: any, targetTab: TabType) => {
    if (category === 'Learners' && item) {
      setProfileStudent(item);
      if (isTabAllowedForRole(currentUser, 'students', activeTeacher, classes)) {
        handleSelectTab('students');
      }
      return;
    }

    if (targetTab && isTabAllowedForRole(currentUser, targetTab, activeTeacher, classes)) {
      handleSelectTab(targetTab);
    } else if (category === 'Classes & Streams' && isTabAllowedForRole(currentUser, 'students', activeTeacher, classes)) {
      handleSelectTab('students');
    } else if (
      (category === 'Learning Areas' || category === 'Assessments') &&
      isTabAllowedForRole(currentUser, 'marks-entry', activeTeacher, classes)
    ) {
      handleSelectTab('marks-entry');
    }
  };

  return (
    <AcademicSessionProvider currentUser={effectiveUser || currentUser}>
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col font-sans text-slate-800 dark:text-slate-100 antialiased transition-colors duration-200">
      {/* Navbar Header */}
      <Header
        school={school}
        currentUser={effectiveUser || currentUser}
        onLogout={handleLogout}
        onOpenSchoolProfile={() => setIsOpenSchoolProfileModal(true)}
        onOpenSupabaseModal={() => setIsOpenSupabaseModal(true)}
        onNavigateToSystem={() => handleSelectTab('system-settings')}
        onNavigateToDiagnostics={() => handleSelectTab('developer-mode')}
        onToggleSidebar={() => setIsOpenMobileSidebar(!isOpenMobileSidebar)}
        onOpenSearch={() => setIsOpenSearchModal(true)}
        connectionStatus={connectionStatus}
        dbStatus={dbStatus}
        lastCheckedAt={dbStatus.lastCheckedAt}
        onRetryConnection={() => verifyAndSyncSupabase({ checkConnectivityOnly: true })}
      />

      {/* Floating Brief Pop-up Toasts (Samsung One UI Inspired) */}
      {showRealtimeUnavailableToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-[calc(1rem+env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-6 sm:top-[calc(1.25rem+env(safe-area-inset-top,0px))] z-50 flex items-center bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100 border border-amber-300 dark:border-amber-700/80 shadow-lg shadow-black/10 dark:shadow-black/30 rounded-2xl px-3.5 py-2 sm:px-4 sm:py-2.5 backdrop-blur-md space-x-2.5 max-w-[calc(100vw-2rem)] sm:max-w-md transition-all duration-300 animate-in fade-in slide-in-from-top-2"
        >
          <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-bold leading-tight break-words">Live updates unavailable</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight break-words">Changes may be delayed.</span>
          </div>
          <button
            onClick={() => {
              if (connectionToastTimerRef.current) {
                clearTimeout(connectionToastTimerRef.current);
                connectionToastTimerRef.current = null;
              }
              setShowRealtimeUnavailableToast(false);
            }}
            className="ml-1 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showRestoredToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-[calc(1rem+env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-6 sm:top-[calc(1.25rem+env(safe-area-inset-top,0px))] z-50 flex items-center bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100 border border-emerald-300 dark:border-emerald-700/80 shadow-lg shadow-black/10 dark:shadow-black/30 rounded-2xl px-3.5 py-2 sm:px-4 sm:py-2.5 backdrop-blur-md space-x-2.5 max-w-[calc(100vw-2rem)] sm:max-w-md transition-all duration-300 animate-in fade-in slide-in-from-top-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-bold leading-tight break-words">Live updates restored</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight break-words">Syncing latest changes…</span>
          </div>
          <button
            onClick={() => {
              if (connectionToastTimerRef.current) {
                clearTimeout(connectionToastTimerRef.current);
                connectionToastTimerRef.current = null;
              }
              setShowRestoredToast(false);
            }}
            className="ml-1 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Body */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 gap-6">
        {/* Navigation Sidebar (hidden for learner role) */}
        {(effectiveUser || currentUser).role !== 'learner' && (
          <Sidebar
            currentRole={(effectiveUser || currentUser).role}
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            isOpenMobile={isOpenMobileSidebar}
            onCloseMobile={() => setIsOpenMobileSidebar(false)}
            onLogout={handleLogout}
          />
        )}

        {/* Dynamic Workspace Container with mobile bottom clearance for MobileBottomNav */}
        <main className="flex-1 overflow-x-hidden pb-20 md:pb-0">
          {/* Module Indicator Breadcrumb (outside header) */}
          <ModuleIndicator
            activeTab={activeTab}
            onNavigateSession={
              (effectiveUser || currentUser).role !== 'learner'
                ? () => handleSelectTab('academic-session')
                : undefined
            }
          />

          {/* Handle Role Route Authorization Protection */}
          {!isTabAllowed ? (
            <UnauthorizedView
              currentRole={(effectiveUser || currentUser).role}
              onReturnToDashboard={() =>
                handleSelectTab((effectiveUser || currentUser).role === 'learner' ? 'learner-portal' : 'dashboard')
              }
            />
          ) : (
            <SectionErrorBoundary
              key={activeTab}
              sectionName={activeTab}
              onReset={() => refreshData()}
              onNavigateDashboard={() =>
                handleSelectTab((effectiveUser || currentUser).role === 'learner' ? 'learner-portal' : 'dashboard')
              }
            >
              <>
              {/* TAB: LEARNER PORTAL */}
              {activeTab === 'learner-portal' && (effectiveUser || currentUser).role === 'learner' && (
                <LearnerPortal
                  currentUser={effectiveUser || currentUser}
                  classes={classes}
                  subjects={subjects}
                  teachers={teachers}
                  exams={exams}
                  school={school}
                  marks={marks}
                  students={marksStudents}
                  allStudents={students}
                  onLogout={handleLogout}
                  onMarksUpdated={handleMarksUpdated}
                />
              )}
              {/* TAB: DASHBOARD */}
              {activeTab === 'dashboard' && (
                <>
                  {(effectiveUser || currentUser).role === 'admin' && (
                    classes.length === 0 && teachers.length === 0 && students.length === 0 && !hasCompletedStartupSync() ? (
                      <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[300px]">
                        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-gray-700 dark:text-gray-200 font-medium text-base">Loading School Data...</p>
                        <p className="text-gray-400 dark:text-gray-400 text-sm mt-1">Hydrating school records from Supabase...</p>
                      </div>
                    ) : (
                      <AdminDashboard
                        userName={currentUser.name}
                        school={school}
                        students={students}
                        teachers={teachers}
                        classes={classes}
                        exams={exams}
                        marks={marks}
                        grades={grades}
                        subjects={subjects}
                        onNavigate={handleSelectTab}
                        onResetData={handleResetDemoData}
                        onMarksUpdated={handleMarksUpdated}
                      />
                    )
                  )}

                  {((effectiveRole === 'class_teacher' || (effectiveUser || currentUser).role === 'class_teacher') || (effectiveRole === 'subject_teacher' || (effectiveUser || currentUser).role === 'subject_teacher')) && (
                    activeTeacher ? (
                      <TeacherDashboard
                        teacher={activeTeacher}
                        classes={classes}
                        subjects={subjects}
                        exams={exams}
                        marks={marks}
                        students={marksStudents}
                        grades={grades}
                        onNavigate={handleSelectTab}
                        currentUser={effectiveUser || currentUser}
                        onMarksUpdated={handleMarksUpdated}
                        onTeacherUpdated={handleUpdateTeacher}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[300px]">
                        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-gray-700 dark:text-gray-200 font-medium text-base">Loading Teacher Dashboard...</p>
                        <p className="text-gray-400 dark:text-gray-400 text-sm mt-1">Hydrating teacher allocations and classroom stream data...</p>
                      </div>
                    )
                  )}
                </>
              )}

              {/* TAB: STUDENTS */}
              {activeTab === 'students' && (
                <StudentRegistration
                  students={students}
                  classes={classes}
                  teachers={teachers}
                  subjects={subjects}
                  currentUser={currentUser}
                  onAddStudent={handleAddStudent}
                  onBatchAddStudents={handleBatchAddStudents}
                  onUpdateStudent={handleUpdateStudent}
                  onDeleteStudent={handleDeleteStudent}
                  onViewProfile={(std) => setProfileStudent(std)}
                />
              )}

              {/* TAB: STUDENT PROMOTION */}
              {activeTab === 'student-promotion' && (
                <StudentPromotionModule
                  students={students}
                  classes={classes}
                  onRefreshData={refreshData}
                />
              )}

              {/* TAB: TEACHERS */}
              {activeTab === 'teachers' && (
                <TeacherManagement
                  teachers={teachers}
                  subjects={subjects}
                  classes={classes}
                  onAddTeacher={handleAddTeacher}
                  onUpdateTeacher={handleUpdateTeacher}
                  onDeleteTeacher={handleDeleteTeacher}
                />
              )}

              {/* TAB: CLASSES & SUBJECTS */}
              {activeTab === 'classes' && (
                <ClassSubjectManagement
                  classes={classes}
                  subjects={subjects}
                  teachers={teachers}
                  initialTab="classes"
                  onAddClass={handleAddClass}
                  onUpdateClass={handleUpdateClass}
                  onDeleteClass={handleDeleteClass}
                  onDeleteStream={handleDeleteStream}
                  onAddSubject={handleAddSubject}
                  onUpdateSubject={handleUpdateSubject}
                  onDeleteSubject={handleDeleteSubject}
                />
              )}

              {/* TAB: LEARNING AREAS */}
              {activeTab === 'subjects' && (
                <ClassSubjectManagement
                  classes={classes}
                  subjects={subjects}
                  teachers={teachers}
                  initialTab="subjects"
                  onAddClass={handleAddClass}
                  onUpdateClass={handleUpdateClass}
                  onDeleteClass={handleDeleteClass}
                  onDeleteStream={handleDeleteStream}
                  onAddSubject={handleAddSubject}
                  onUpdateSubject={handleUpdateSubject}
                  onDeleteSubject={handleDeleteSubject}
                />
              )}

              {/* TAB: ACADEMIC SESSION MANAGEMENT */}
              {activeTab === 'academic-session' && (
                <AcademicSessionManagement
                  userRole={(effectiveUser || currentUser).role}
                  onSessionUpdated={refreshData}
                />
              )}

              {/* CONTEXTUAL ASSESSMENT NAVIGATION BAR */}
              {['exams', 'marks-entry', 'marks-monitoring', 'class-marks-monitoring', 'stream-approval', 'results-approval', 'provisional', 'exam-validation', 'reports', 'kjsea-admin'].includes(activeTab) && (
                <AssessmentContextualNav
                  activeTab={activeTab}
                  onSelectTab={handleSelectTab}
                  userRole={(effectiveUser || currentUser).role}
                />
              )}

              {/* TAB: EXAMINATIONS */}
              {activeTab === 'exams' && (
                <ExaminationManagement
                  exams={exams}
                  classes={classes}
                  userRole={(effectiveUser || currentUser).role}
                  currentUser={effectiveUser || currentUser}
                  onAddExamination={handleAddExamination}
                  onUpdateExamination={handleUpdateExamination}
                  onUpdateStatus={handleUpdateExamStatus}
                  onDeleteExamination={handleDeleteExamination}
                />
              )}

              {/* TAB: MARKS ENTRY GRID */}
              {activeTab === 'marks-entry' && (
                <MarksEntryTable
                  exams={exams}
                  classes={classes}
                  subjects={subjects}
                  students={marksStudents}
                  marks={marks}
                  grades={grades}
                  teachers={teachers}
                  currentUser={effectiveUser || currentUser}
                  userRole={(effectiveUser || currentUser).role}
                  onSaveMarks={handleSaveMarks}
                  onUpdateExamStatus={handleUpdateExamStatus}
                  onUpdateExamClassApproval={handleUpdateExamClassApproval}
                />
              )}

              {/* TAB: MARKS MONITORING (ADMIN) */}
              {activeTab === 'marks-monitoring' && (
                <MarksMonitoringView
                  exams={exams}
                  classes={classes}
                  subjects={subjects}
                  students={marksStudents}
                  marks={marks}
                  grades={grades}
                  teachers={teachers}
                  currentUser={effectiveUser || currentUser}
                  onNavigateToTab={handleSelectTab}
                />
              )}

              {/* TAB: CLASS TEACHER INDIVIDUAL MARKS MONITORING */}
              {activeTab === 'class-marks-monitoring' && (effectiveRole === 'class_teacher' || (effectiveUser || currentUser)?.role === 'class_teacher') && (
                <ClassTeacherMarksMonitoringView
                  exams={exams}
                  classes={classes}
                  subjects={subjects}
                  students={marksStudents}
                  marks={marks}
                  grades={grades}
                  teachers={teachers}
                  currentUser={effectiveUser || currentUser}
                  onNavigateToTab={handleSelectTab}
                  onMarksUpdated={handleMarksUpdated}
                />
              )}

              {/* TAB: ASSESSMENT STREAM APPROVAL (LEGACY COMPATIBILITY) */}
              {activeTab === 'stream-approval' && (
                <AssessmentStreamApprovalView
                  exams={exams}
                  classes={classes}
                  subjects={subjects}
                  students={marksStudents}
                  marks={marks}
                  grades={grades}
                  teachers={teachers}
                  currentUser={effectiveUser || currentUser}
                  onNavigateToTab={handleSelectTab}
                  onMarksUpdated={handleMarksUpdated}
                  onUpdateExamClassApproval={handleUpdateExamClassApproval}
                />
              )}

              {/* TAB: PROVISIONAL RESULTS VERIFICATION */}
              {activeTab === 'provisional' && (
                <ProvisionalResultsView
                  school={school}
                  exams={exams}
                  students={marksStudents}
                  subjects={subjects}
                  marks={marks}
                  grades={grades}
                  classes={classes}
                  teachers={teachers}
                  currentUser={effectiveUser || currentUser}
                  verificationLogs={verificationLogs}
                  onUpdateStatus={handleUpdateExamStatus}
                  onAddLog={handleAddVerificationLog}
                  onNavigateToTab={handleSelectTab}
                  onMarksUpdated={handleMarksUpdated}
                />
              )}

              {/* TAB: EXAMINATION ANALYSIS & VALIDATION */}
              {activeTab === 'exam-validation' && (effectiveUser || currentUser)?.role === 'admin' && (
                <ExaminationAnalysisValidation
                  exams={exams}
                  students={marksStudents}
                  classes={classes}
                  subjects={subjects}
                  marks={marks}
                  grades={grades}
                  teachers={teachers}
                  currentUser={effectiveUser || currentUser}
                  initialAdminViewMode="analysis"
                  onUpdateExamStatus={handleUpdateExamStatus}
                  onUpdateExamLevelApproval={handleUpdateExamLevelApproval}
                  onUpdateExamClassApproval={handleUpdateExamClassApproval}
                  onNavigateToTab={handleSelectTab}
                  onMarksUpdated={handleMarksUpdated}
                />
              )}

              {/* TAB: RESULTS APPROVAL */}
              {activeTab === 'results-approval' && (
                <>
                  {(effectiveUser || currentUser)?.role === 'admin' && (
                    <ExaminationAnalysisValidation
                      exams={exams}
                      students={marksStudents}
                      classes={classes}
                      subjects={subjects}
                      marks={marks}
                      grades={grades}
                      teachers={teachers}
                      currentUser={effectiveUser || currentUser}
                      initialAdminViewMode="stream-approvals"
                      onUpdateExamStatus={handleUpdateExamStatus}
                      onUpdateExamLevelApproval={handleUpdateExamLevelApproval}
                      onUpdateExamClassApproval={handleUpdateExamClassApproval}
                      onNavigateToTab={handleSelectTab}
                      onMarksUpdated={handleMarksUpdated}
                    />
                  )}
                  {(effectiveRole === 'class_teacher' || (effectiveUser || currentUser)?.role === 'class_teacher') && (
                    <AssessmentStreamApprovalView
                      exams={exams}
                      classes={classes}
                      subjects={subjects}
                      students={marksStudents}
                      marks={marks}
                      grades={grades}
                      teachers={teachers}
                      currentUser={effectiveUser || currentUser}
                      onNavigateToTab={handleSelectTab}
                      onMarksUpdated={handleMarksUpdated}
                      onUpdateExamClassApproval={handleUpdateExamClassApproval}
                    />
                  )}
                </>
              )}

              {/* TAB: KJSEA RESULTS (ADMIN ONLY) */}
              {activeTab === 'kjsea-admin' && (effectiveUser || currentUser)?.role === 'admin' && (
                <KjseaAdminManagement />
              )}

              {/* TAB: REPORTS & MERIT LISTS */}
              {activeTab === 'reports' && (
                <ReportsView
                  school={school}
                  students={marksStudents}
                  subjects={subjects}
                  exams={exams}
                  marks={marks}
                  grades={grades}
                  classes={classes}
                  teachers={teachers}
                  currentUser={effectiveUser || currentUser}
                  onNavigateToTab={handleSelectTab}
                  onMarksUpdated={handleMarksUpdated}
                  onUpdateExamClassApproval={handleUpdateExamClassApproval}
                />
              )}

              {/* TAB: SCHOOL PERFORMANCE ANALYTICS & RANKINGS */}
              {activeTab === 'school-analytics' && (
                <SchoolPerformanceAnalytics
                  school={school}
                  exams={exams}
                  students={students}
                  classes={classes}
                  subjects={subjects}
                  marks={marks}
                  grades={grades}
                  teachers={teachers}
                  currentUser={effectiveUser || currentUser}
                  onMarksUpdated={handleMarksUpdated}
                />
              )}

              {/* TAB: GRADING SETTINGS */}
              {activeTab === 'grading' && (
                <GradingSettings grades={grades} onUpdateGrades={handleUpdateGrades} />
              )}

              {/* TAB: SCHOOL PROFILE */}
              {activeTab === 'school-profile' && (
                <SchoolProfileView
                  school={school}
                  onSaveSchool={handleUpdateSchool}
                  readOnly={currentUser.role !== 'admin'}
                />
              )}

              {/* TAB: SYSTEM SETTINGS (ADMIN ONLY) */}
              {activeTab === 'system-settings' && currentUser.role === 'admin' && (
                <SystemSettingsPage
                  onNavigate={handleSelectTab}
                  school={school}
                  onSaveSchool={handleUpdateSchool}
                  grades={grades}
                  onUpdateGrades={handleUpdateGrades}
                  dbStatus={dbStatus}
                  onVerifyAndSync={verifyAndSyncSupabase}
                  students={students}
                  teachers={teachers}
                  classes={classes}
                  subjects={subjects}
                  exams={exams}
                  marks={marks}
                  onResetData={handleResetDemoData}
                />
              )}

              {/* TAB: DEVELOPER MODE (HIDDEN) */}
              {activeTab === 'developer-mode' && currentUser.role === 'admin' && (
                <DeveloperSettingsPage
                  dbStatus={dbStatus}
                  onVerifyAndSync={verifyAndSyncSupabase}
                  school={school}
                  students={students}
                  teachers={teachers}
                  classes={classes}
                  subjects={subjects}
                  exams={exams}
                  marks={marks}
                  grades={grades}
                  onResetData={handleResetDemoData}
                />
              )}
              </>
            </SectionErrorBoundary>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation (Hidden for learner role & desktop screens) */}
      {(effectiveUser || currentUser).role !== 'learner' && (
        <MobileBottomNav
          currentRole={(effectiveUser || currentUser).role}
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          onOpenMore={() => setIsOpenMobileSidebar(true)}
        />
      )}
    

      {/* Modals */}
      {currentUser.role === 'admin' && isOpenSchoolProfileModal && (
        <SchoolProfileModal
          isOpen={isOpenSchoolProfileModal}
          school={school}
          onSave={handleUpdateSchool}
          onClose={() => setIsOpenSchoolProfileModal(false)}
        />
      )}

      {isOpenSupabaseModal && (
        <SupabaseModal
          isOpen={isOpenSupabaseModal}
          onClose={() => setIsOpenSupabaseModal(false)}
        />
      )}

      {profileStudent && (
        <LearnerProfileModal
          student={profileStudent}
          classes={classes}
          subjects={subjects}
          exams={exams}
          marks={marks}
          grades={grades}
          teachers={teachers}
          currentUser={currentUser}
          onClose={() => setProfileStudent(null)}
        />
      )}

      {isOpenSearchModal && (
        <GlobalSearchModal
          isOpen={isOpenSearchModal}
          onClose={() => setIsOpenSearchModal(false)}
          currentUser={currentUser}
          activeTeacher={activeTeacher}
          students={students}
          teachers={teachers}
          classes={classes}
          subjects={subjects}
          exams={exams}
          academicYears={api.getAcademicYears()}
          schoolTerms={api.getSchoolTerms()}
          onSelectResult={handleSelectSearchResult}
        />
      )}

      {/* Non-blocking Warning Toast (25-min Inactivity or 7h45m 8-Hour Session Limit) */}
      <InactivityWarningToast
        isOpen={isWarningVisible && !isSessionLocked}
        warningType={warningType}
        onStaySignedIn={resetActivity}
        onDismiss={dismissWarning}
        minutesRemaining={warningType === 'max_session' ? 15 : 5}
      />

      {/* Non-Destructive Workspace Lock & Re-Authentication Modal (30-min idle or 8-hour max session) */}
      <SessionLockModal
        isOpen={isSessionLocked}
        lockReason={lockReason}
        currentUser={currentUser}
        school={school}
        onUnlock={(updatedUser) => {
          const isMax = lockReason === 'max_session';
          if (isMax) {
            authService.recordSessionStart(Date.now());
          }
          setCurrentUser(updatedUser);
          unlockSession(isMax);
        }}
        onSignOut={handleLogout}
      />

      {/* Optional Fingerprint Enrollment Modal for Android Teachers */}
      {showBiometricEnrollModal && pendingEnrollUser && (
        <BiometricEnrollModal
          isOpen={showBiometricEnrollModal}
          currentUser={pendingEnrollUser}
          onClose={() => {
            setShowBiometricEnrollModal(false);
            setPendingEnrollUser(null);
          }}
          onSuccess={() => {
            setShowBiometricEnrollModal(false);
            setPendingEnrollUser(null);
          }}
        />
      )}
    </div>
    </AcademicSessionProvider>
  );
}
