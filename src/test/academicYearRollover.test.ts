import { test, expect, describe, vi, beforeEach } from 'vitest';
import '../testSetup';
import { checkAndPerformAcademicYearRollover, resetRolloverCheckedForTesting } from '../services/academicYearRollover';

// Track RPC calls and verify payload arguments
let rpcCalls: Array<{ name: string; args: any }> = [];

// Track database mutations to verify zero client-side mutations occur
let recordedMutations: Array<{ table: string; operation: string; data: any }> = [];

// Mock database state for academic years
let mockActiveAYs: any[] = [{ id: 'ay_2026', year: 2026, status: 'Active' }];

// Configurable RPC mock response
let rpcMockResponse: any = {
  data: { success: true, message: 'Academic year rollover completed successfully via RPC.' },
  error: null
};

// Database query error injector
let mockDbError: any = null;

// Mock Supabase client to ensure complete isolation from live database
vi.mock('@supabase/supabase-js', async () => {
  return {
    createClient: vi.fn(() => ({
      rpc: vi.fn(async (name: string, args: any) => {
        rpcCalls.push({ name, args });
        return rpcMockResponse;
      }),
      from: vi.fn((table: string) => {
        const chain: any = {
          select: vi.fn().mockImplementation(() => chain),
          eq: vi.fn().mockImplementation((col: string, val: any) => {
            if (!chain._eq_filters) chain._eq_filters = {};
            chain._eq_filters[col] = val;
            return chain;
          }),
          update: vi.fn().mockImplementation((data: any) => {
            recordedMutations.push({ table, operation: 'update', data });
            return chain;
          }),
          insert: vi.fn().mockImplementation((data: any) => {
            recordedMutations.push({ table, operation: 'insert', data });
            return chain;
          }),
          delete: vi.fn().mockImplementation(() => {
            recordedMutations.push({ table, operation: 'delete', data: null });
            return chain;
          }),
          upsert: vi.fn().mockImplementation((data: any) => {
            recordedMutations.push({ table, operation: 'upsert', data });
            return chain;
          }),
          then: vi.fn().mockImplementation((resolve) => {
            if (mockDbError) {
              const err = mockDbError;
              mockDbError = null;
              return resolve({ data: null, error: err });
            }

            if (table === 'academic_years') {
              if (chain._eq_filters && chain._eq_filters['status'] === 'Active') {
                return resolve({ data: mockActiveAYs, error: null });
              }
              return resolve({ data: mockActiveAYs, error: null });
            }

            return resolve({ data: [], error: null });
          })
        };
        return chain;
      })
    }))
  };
});

describe('Authoritative RPC-Only Academic-Year Rollover Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRolloverCheckedForTesting();
    rpcCalls = [];
    recordedMutations = [];
    mockDbError = null;
    mockActiveAYs = [{ id: 'ay_2026', year: 2026, status: 'Active' }];
    rpcMockResponse = {
      data: { success: true, message: 'Academic year rollover completed successfully via RPC.' },
      error: null
    };
  });

  // TEST 1: Unforced check (force = false) - disabled on ordinary requests
  test('Test 1: Unforced check (force = false) returns early, never invokes RPC or mutates tables', async () => {
    const result = await checkAndPerformAcademicYearRollover(false);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Automatic rollover via request is disabled');
    expect(rpcCalls.length).toBe(0);
    expect(recordedMutations.length).toBe(0);
  });

  // TEST 2: Already checked in current server instance - returns early
  test('Test 2: Already checked for server instance returns early without invoking RPC', async () => {
    await checkAndPerformAcademicYearRollover(false);
    const result = await checkAndPerformAcademicYearRollover(false);

    expect(result.success).toBe(true);
    expect(result.message).toContain('already checked for this server instance');
    expect(rpcCalls.length).toBe(0);
    expect(recordedMutations.length).toBe(0);
  });

  // TEST 3: Active academic year missing in database -> Safe abort
  test('Test 3: Missing active academic year aborts safely before calling RPC', async () => {
    mockActiveAYs = [];

    const result = await checkAndPerformAcademicYearRollover(true);

    expect(result.success).toBe(false);
    expect(result.message).toContain('No active academic year found in the database');
    expect(rpcCalls.length).toBe(0);
    expect(recordedMutations.length).toBe(0);
  });

  // TEST 4: Invalid active academic year value -> Safe abort
  test('Test 4: Non-integer active year aborts safely before calling RPC', async () => {
    mockActiveAYs = [{ id: 'ay_invalid', year: 'INVALID_YEAR', status: 'Active' }];

    const result = await checkAndPerformAcademicYearRollover(true);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Invalid active academic year retrieved from database');
    expect(rpcCalls.length).toBe(0);
    expect(recordedMutations.length).toBe(0);
  });

  // TEST 5: Active year 2026 -> passes exact argument { p_expected_current_year: 2026 }
  test('Test 5: Passes { p_expected_current_year: 2026 } to database RPC', async () => {
    mockActiveAYs = [{ id: 'ay_2026', year: 2026, status: 'Active' }];

    const result = await checkAndPerformAcademicYearRollover(true);

    expect(result.success).toBe(true);
    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0].name).toBe('perform_academic_year_rollover');
    expect(rpcCalls[0].args).toEqual({ p_expected_current_year: 2026 });
    expect(recordedMutations.length).toBe(0);
  });

  // TEST 6: Active year 2027 -> dynamically passes { p_expected_current_year: 2027 }
  test('Test 6: Passes { p_expected_current_year: 2027 } when database active year is 2027', async () => {
    mockActiveAYs = [{ id: 'ay_2027', year: 2027, status: 'Active' }];

    const result = await checkAndPerformAcademicYearRollover(true);

    expect(result.success).toBe(true);
    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0].args).toEqual({ p_expected_current_year: 2027 });
    expect(recordedMutations.length).toBe(0);
  });

  // TEST 7: RPC returns PGRST202 error -> strictly returns failure with zero fallback mutations
  test('Test 7: RPC error PGRST202 returns failure immediately and executes NO TypeScript mutations', async () => {
    rpcMockResponse = {
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.perform_academic_year_rollover' }
    };

    const result = await checkAndPerformAcademicYearRollover(true);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Academic year rollover failed: Could not find the function');
    expect(rpcCalls.length).toBe(1);
    // Crucial invariant: No client-side fallback mutations occurred
    expect(recordedMutations.length).toBe(0);
  });

  // TEST 8: RPC returns database deadlock/execution error -> returns failure with zero fallback mutations
  test('Test 8: RPC database transaction failure returns failure without fallback mutations', async () => {
    rpcMockResponse = {
      data: null,
      error: { code: '40001', message: 'could not serialize access due to concurrent update' }
    };

    const result = await checkAndPerformAcademicYearRollover(true);

    expect(result.success).toBe(false);
    expect(result.message).toContain('could not serialize access');
    expect(rpcCalls.length).toBe(1);
    expect(recordedMutations.length).toBe(0);
  });

  // TEST 9: RPC returns payload with success: false -> preserved and returned as failure
  test('Test 9: RPC response with { success: false } is preserved and returned as failure', async () => {
    rpcMockResponse = {
      data: {
        success: false,
        message: 'Upcoming academic year 2027 not found in database.'
      },
      error: null
    };

    const result = await checkAndPerformAcademicYearRollover(true);

    expect(result.success).toBe(false);
    expect(result.message).toBe('Upcoming academic year 2027 not found in database.');
    expect(rpcCalls.length).toBe(1);
    expect(recordedMutations.length).toBe(0);
  });

  // TEST 10: Successful RPC execution -> returns success message from database RPC
  test('Test 10: Successful database RPC execution returns success and RPC message', async () => {
    rpcMockResponse = {
      data: {
        success: true,
        message: 'Academic year 2026 closed, 2027 activated, 42 learners promoted.'
      },
      error: null
    };

    const result = await checkAndPerformAcademicYearRollover(true);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Academic year 2026 closed, 2027 activated, 42 learners promoted.');
    expect(rpcCalls.length).toBe(1);
    expect(recordedMutations.length).toBe(0);
  });
});
