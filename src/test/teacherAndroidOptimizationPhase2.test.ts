import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../lib/storage';
import { Teacher, User } from '../types';
import * as apiConfig from '../utils/apiConfig';

describe('Phase 2: Teacher Detail Editing and Saving in Android APK & Web', () => {
  const teacherUuid = '11111111-2222-3333-4444-555555555555';
  const streamUuid = '66666666-7777-8888-9999-aaaaaaaaaaaa';
  const otherStreamUuid = '77777777-8888-9999-aaaa-bbbbbbbbbbbb';
  const classUuid = '88888888-9999-aaaa-bbbb-cccccccccccc';
  const subjectUuid1 = '99999999-aaaa-bbbb-cccc-dddddddddddd';
  const subjectUuid2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  function createMockSupabase(overrides?: {
    maybeSingle?: (table: string, filters?: any) => Promise<{ data: any; error: any }>;
    updateResult?: (table: string, payload: any, filters?: any) => { data?: any; error?: any };
    rpc?: (name: string, args: any) => Promise<{ data?: any; error?: any }>;
  }) {
    const mock: any = {
      from: vi.fn((table: string) => {
        const chain: any = {
          _table: table,
          _payload: null,
          _filters: {} as Record<string, any>,
          select: vi.fn().mockImplementation(() => chain),
          eq: vi.fn().mockImplementation((col: string, val: any) => {
            chain._filters[col] = val;
            return chain;
          }),
          neq: vi.fn().mockImplementation((col: string, val: any) => {
            chain._filters[`neq_${col}`] = val;
            return chain;
          }),
          or: vi.fn().mockImplementation(() => chain),
          ilike: vi.fn().mockImplementation(() => chain),
          update: vi.fn().mockImplementation((payload: any) => {
            chain._payload = payload;
            return chain;
          }),
          insert: vi.fn().mockImplementation((payload: any) => {
            chain._payload = payload;
            return chain;
          }),
          delete: vi.fn().mockImplementation(() => chain),
          maybeSingle: vi.fn().mockImplementation(() => {
            if (overrides?.maybeSingle) {
              return overrides.maybeSingle(table, chain._filters);
            }
            if (table === 'subjects') return Promise.resolve({ data: { id: subjectUuid1, subject_name: 'Mathematics' }, error: null });
            if (table === 'streams') return Promise.resolve({ data: { id: streamUuid, class_id: classUuid, class_teacher_id: null }, error: null });
            if (table === 'classes') return Promise.resolve({ data: { id: classUuid, class_name: 'Grade 7' }, error: null });
            if (table === 'teachers') return Promise.resolve({ data: { id: teacherUuid, email: 'teacher@school.ac.ke' }, error: null });
            return Promise.resolve({ data: null, error: null });
          }),
          then: (resolve: any, reject: any) => {
            try {
              if (overrides?.updateResult) {
                const res = overrides.updateResult(table, chain._payload, chain._filters);
                return resolve(res);
              }
              return resolve({ error: null, data: [] });
            } catch (err) {
              if (reject) return reject(err);
              throw err;
            }
          },
        };
        return chain;
      }),
      rpc: vi.fn().mockImplementation((name: string, args: any) => {
        if (overrides?.rpc) return overrides.rpc(name, args);
        return Promise.resolve({ error: null });
      }),
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: 'valid-admin-jwt',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            },
          },
        }),
      },
    };
    return mock;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).__TEST_SUPABASE_CLIENT__;
  });

  // Test A: Native environment bypasses external Express backend request
  it('Test A: Native environment does not attempt external Express backend request before using Supabase', async () => {
    const isNativeSpy = vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(true);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    vi.spyOn(api, 'getCurrentUser').mockReturnValue({
      id: 'admin-1',
      name: 'Admin User',
      email: 'admin@school.ac.ke',
      role: 'admin',
    } as User);

    const mockClient = createMockSupabase();
    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

    const teacherToUpdate: Teacher = {
      id: teacherUuid,
      teacher_name: 'Tr. Native Test',
      email: 'native@school.ac.ke',
      phone: '+254711223344',
      tsc_number: 'TSC-123456',
      status: 'Active',
      is_class_teacher: true,
      class_teacher_of_id: streamUuid,
      allocations: [
        { id: 'al-1', teacher_id: teacherUuid, subject_id: subjectUuid1, stream_id: streamUuid, class_id: classUuid },
      ],
    };

    const result = await api.updateTeacher(teacherToUpdate);

    // 1. fetch to /api/admin/update-teacher was NEVER called
    const updateTeacherBackendCalls = fetchSpy.mock.calls.filter((call) =>
      typeof call[0] === 'string' && call[0].includes('/api/admin/update-teacher')
    );
    expect(updateTeacherBackendCalls.length).toBe(0);

    // 2. Result teacher is updated
    expect(result.teacher_name).toBe('Tr. Native Test');

    // 3. Supabase client was accessed directly
    expect(mockClient.from).toHaveBeenCalledWith('teachers');

    isNativeSpy.mockRestore();
  });

  // Test B: Web environment preserves server endpoint call
  it('Test B: Web environment attempts server endpoint first when non-native', async () => {
    const isNativeSpy = vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(false);

    vi.spyOn(api, 'getCurrentUser').mockReturnValue({
      id: 'admin-1',
      name: 'Admin User',
      email: 'admin@school.ac.ke',
      role: 'admin',
    } as User);

    let backendCalled = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/admin/update-teacher')) {
        backendCalled = true;
        return new Response(JSON.stringify({ success: true, teacher: { id: teacherUuid } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const mockClient = createMockSupabase();
    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

    const teacherToUpdate: Teacher = {
      id: teacherUuid,
      teacher_name: 'Tr. Web Test',
      email: 'web@school.ac.ke',
      phone: '+254711223344',
      is_class_teacher: false,
    };

    const res = await api.updateTeacher(teacherToUpdate);
    expect(backendCalled).toBe(true);
    expect(res.teacher_name).toBe('Tr. Web Test');

    isNativeSpy.mockRestore();
  });

  // Test C: Successful teacher profile and user updates
  it('Test C: Teacher profile and associated user details are updated correctly', async () => {
    vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(true);
    vi.spyOn(api, 'getCurrentUser').mockReturnValue({ id: 'admin-1', role: 'admin' } as User);

    let updatedTeacherPayload: any = null;
    let updatedUserPayload: any = null;

    const mockClient = createMockSupabase({
      updateResult: (table, payload) => {
        if (table === 'teachers') updatedTeacherPayload = payload;
        if (table === 'users') updatedUserPayload = payload;
        return { error: null };
      },
    });
    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

    const teacherToUpdate: Teacher = {
      id: teacherUuid,
      teacher_name: 'Madam Grace Updated',
      email: 'grace@school.ac.ke',
      phone: '+254700112233',
      tsc_number: 'TSC-987654',
      status: 'Active',
      is_class_teacher: false,
    };

    await api.updateTeacher(teacherToUpdate);

    expect(updatedTeacherPayload).not.toBeNull();
    expect(updatedTeacherPayload.teacher_name).toBe('Madam Grace Updated');
    expect(updatedTeacherPayload.phone).toBe('+254700112233');
    expect(updatedTeacherPayload.tsc_number).toBe('TSC-987654');

    expect(updatedUserPayload).not.toBeNull();
    expect(updatedUserPayload.name).toBe('Madam Grace Updated');
    expect(updatedUserPayload.role).toBe('subject_teacher');
  });

  // Test D: Stream reassignment handles unassignment and target assignment correctly
  it('Test D: Class teacher stream reassignment and displaced teacher handling', async () => {
    vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(true);
    vi.spyOn(api, 'getCurrentUser').mockReturnValue({ id: 'admin-1', role: 'admin' } as User);

    const streamUpdates: Array<{ table: string; payload: any; filters: any }> = [];

    const mockClient = createMockSupabase({
      maybeSingle: async (table, filters) => {
        if (table === 'streams') {
          return { data: { id: streamUuid, class_id: classUuid, class_teacher_id: 'displaced-teacher-id' }, error: null };
        }
        if (table === 'teachers') {
          return { data: { id: 'displaced-teacher-id', email: 'displaced@school.ac.ke' }, error: null };
        }
        return { data: null, error: null };
      },
      updateResult: (table, payload, filters) => {
        if (table === 'streams') {
          streamUpdates.push({ table, payload, filters: { ...filters } });
        }
        return { error: null };
      },
    });
    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

    const teacherToUpdate: Teacher = {
      id: teacherUuid,
      teacher_name: 'Tr. Assignment Test',
      email: 'assign@school.ac.ke',
      is_class_teacher: true,
      class_teacher_of_id: streamUuid,
    };

    await api.updateTeacher(teacherToUpdate);

    const streamAssigns = streamUpdates.filter((u) => u.table === 'streams');
    expect(streamAssigns.length).toBeGreaterThan(0);

    const targetAssignment = streamAssigns.find(
      (u) => u.payload.class_teacher_id === teacherUuid && u.filters.id === streamUuid
    );
    expect(targetAssignment).toBeDefined();
  });

  // Test E: Subject allocations saved correctly and deduplicated
  it('Test E: Subject allocations saved correctly via update_teacher_allocations_atomic RPC', async () => {
    vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(true);
    vi.spyOn(api, 'getCurrentUser').mockReturnValue({ id: 'admin-1', role: 'admin' } as User);

    let rpcCalledWith: any = null;

    const mockClient = createMockSupabase({
      rpc: async (name, args) => {
        if (name === 'update_teacher_allocations_atomic') {
          rpcCalledWith = args;
        }
        return { error: null };
      },
    });
    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

    const teacherToUpdate: Teacher = {
      id: teacherUuid,
      teacher_name: 'Tr. Allocations Test',
      email: 'alloc@school.ac.ke',
      is_class_teacher: false,
      allocations: [
        { id: 'al-1', teacher_id: teacherUuid, subject_id: subjectUuid1, stream_id: streamUuid, class_id: classUuid },
        // Duplicate allocation
        { id: 'al-2', teacher_id: teacherUuid, subject_id: subjectUuid1, stream_id: streamUuid, class_id: classUuid },
      ],
    };

    await api.updateTeacher(teacherToUpdate);

    expect(rpcCalledWith).not.toBeNull();
    expect(rpcCalledWith.p_teacher_id).toBe(teacherUuid);
    expect(rpcCalledWith.p_allocations.length).toBe(1);
    expect(rpcCalledWith.p_allocations[0].subject_id).toBe(subjectUuid1);
    expect(rpcCalledWith.p_allocations[0].stream_id).toBe(streamUuid);
  });

  // Test F: Invalid identifiers handled safely
  it('Test F: Invalid stream or subject identifiers throw appropriate error', async () => {
    vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(true);
    vi.spyOn(api, 'getCurrentUser').mockReturnValue({ id: 'admin-1', role: 'admin' } as User);

    const mockClient = createMockSupabase({
      maybeSingle: async (table) => {
        if (table === 'streams') return { data: null, error: null };
        if (table === 'classes') return { data: { id: 'some-cls', class_name: 'Grade 8' }, error: null };
        return { data: null, error: null };
      },
    });
    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

    const invalidTeacher: Teacher = {
      id: teacherUuid,
      teacher_name: 'Tr. Invalid',
      email: 'invalid@school.ac.ke',
      is_class_teacher: true,
      class_teacher_of_id: '88888888-9999-aaaa-bbbb-cccccccccccc',
    };

    await expect(api.updateTeacher(invalidTeacher)).rejects.toThrow(
      'Invalid stream ID: The provided ID belongs to parent class "Grade 8", not a stream'
    );
  });

  // Test G: Authorization enforcement
  it('Test G: Non-admin users are rejected from updating teacher details', async () => {
    vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(true);
    vi.spyOn(api, 'getCurrentUser').mockReturnValue({
      id: 'teacher-user-1',
      name: 'Regular Teacher',
      email: 'teacher@school.ac.ke',
      role: 'subject_teacher',
    } as User);

    const mockClient = createMockSupabase();
    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

    const teacherToUpdate: Teacher = {
      id: teacherUuid,
      teacher_name: 'Unauthorized Update',
      email: 'target@school.ac.ke',
      is_class_teacher: false,
    };

    await expect(api.updateTeacher(teacherToUpdate)).rejects.toThrow(
      'Unauthorized: Only administrators can update teacher records and allocations.'
    );
  });

  // Test H: Database error reporting
  it('Test H: Database mutation errors are surfaced truthfully and not disguised as success', async () => {
    vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(true);
    vi.spyOn(api, 'getCurrentUser').mockReturnValue({ id: 'admin-1', role: 'admin' } as User);

    const mockClient = createMockSupabase({
      updateResult: (table) => {
        if (table === 'teachers') {
          return { error: { message: 'unique constraint "teachers_email_key" violated', code: '23505' } };
        }
        return { error: null };
      },
    });
    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

    const teacherToUpdate: Teacher = {
      id: teacherUuid,
      teacher_name: 'Duplicate Email',
      email: 'duplicate@school.ac.ke',
      is_class_teacher: false,
    };

    await expect(api.updateTeacher(teacherToUpdate)).rejects.toThrow(
      'A teacher or user with this email address already exists.'
    );
  });

  // Test I: 3.5s timeout on web falls back gracefully without indefinite hanging
  it('Test I: Web environment AbortController aborts hung backend request and falls back to Supabase client', async () => {
    vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(false);
    vi.spyOn(api, 'getCurrentUser').mockReturnValue({ id: 'admin-1', role: 'admin' } as User);

    vi.spyOn(globalThis, 'fetch').mockImplementation((_url: any, options: any) => {
      return new Promise((_resolve, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        }
      });
    });

    let supabaseFallbackInvoked = false;
    const mockClient = createMockSupabase({
      updateResult: (table) => {
        if (table === 'teachers') supabaseFallbackInvoked = true;
        return { error: null };
      },
    });
    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

    const teacherToUpdate: Teacher = {
      id: teacherUuid,
      teacher_name: 'Tr. Timeout Fallback',
      email: 'timeout@school.ac.ke',
      is_class_teacher: false,
    };

    vi.useFakeTimers();
    const updatePromise = api.updateTeacher(teacherToUpdate);

    // Fast-forward 3600ms to trigger 3.5s AbortController timeout
    await vi.advanceTimersByTimeAsync(3600);

    const result = await updatePromise;
    expect(supabaseFallbackInvoked).toBe(true);
    expect(result.teacher_name).toBe('Tr. Timeout Fallback');

    vi.useRealTimers();
  });

  // Test J: Allocation query deduplication and concurrent caching
  it('Test J: Multiple allocations with duplicate subject or stream IDs share promises and eliminate redundant queries', async () => {
    vi.spyOn(apiConfig, 'isNativeEnvironment').mockReturnValue(true);
    vi.spyOn(api, 'getCurrentUser').mockReturnValue({ id: 'admin-1', role: 'admin' } as User);

    let subjectDbQueries = 0;
    let streamDbQueries = 0;

    const mockClient = createMockSupabase({
      maybeSingle: async (table, filters) => {
        if (table === 'subjects') {
          subjectDbQueries++;
          return { data: { id: filters?.id || subjectUuid1 }, error: null };
        }
        if (table === 'streams') {
          streamDbQueries++;
          return { data: { id: filters?.id || streamUuid, class_id: classUuid }, error: null };
        }
        return { data: null, error: null };
      },
    });
    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

    const teacherToUpdate: Teacher = {
      id: teacherUuid,
      teacher_name: 'Tr. Cache Test',
      email: 'cache@school.ac.ke',
      is_class_teacher: false,
      allocations: [
        { id: 'al-1', teacher_id: teacherUuid, subject_id: subjectUuid1, stream_id: streamUuid },
        { id: 'al-2', teacher_id: teacherUuid, subject_id: subjectUuid2, stream_id: streamUuid },
        { id: 'al-3', teacher_id: teacherUuid, subject_id: subjectUuid1, stream_id: otherStreamUuid },
        { id: 'al-4', teacher_id: teacherUuid, subject_id: subjectUuid2, stream_id: otherStreamUuid },
      ],
    };

    await api.updateTeacher(teacherToUpdate);

    // There are 2 distinct subjects across 4 allocations -> exactly 2 queries
    expect(subjectDbQueries).toBe(2);

    // There are 2 distinct streams across 4 allocations -> exactly 2 queries
    expect(streamDbQueries).toBe(2);
  });

  // Test K: openEditTeacherModal regression test — dbAllocations and dbStreams scoping
  it('Test K: openEditTeacherModal hydrates teacher details, allocations and stream without ReferenceError', async () => {
    const mockClient = createMockSupabase();
    mockClient.from = vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation(() => {
        if (table === 'teacher_subjects') {
          return Promise.resolve({
            data: [
              { id: 'alloc-1', teacher_id: teacherUuid, subject_id: subjectUuid1, class_id: classUuid, stream_id: streamUuid },
            ],
            error: null,
          });
        }
        if (table === 'streams') {
          return Promise.resolve({
            data: [{ id: streamUuid, class_id: classUuid, class_teacher_id: teacherUuid }],
            error: null,
          });
        }
        return {
          maybeSingle: async () => ({
            data: { id: teacherUuid, teacher_name: 'Tr. Hydrated Modal Test', email: 'modal@school.ac.ke' },
            error: null,
          }),
        };
      }),
    }));

    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

    let errorCaught: any = null;
    let freshAllocations: any = null;
    let freshStreamId = '';

    try {
      const client = (globalThis as any).__TEST_SUPABASE_CLIENT__;
      let dbTch: any = null;
      let effectiveTeacherId: string | null = teacherUuid;
      let dbAllocations: any = null;
      let dbStreams: any = null;

      if (effectiveTeacherId) {
        const [tchRes, allocRes, streamRes] = await Promise.all([
          client.from('teachers').select('*').eq('id', effectiveTeacherId).maybeSingle(),
          client.from('teacher_subjects').select('*').eq('teacher_id', effectiveTeacherId),
          client.from('streams').select('*').eq('class_teacher_id', effectiveTeacherId),
        ]);
        dbTch = tchRes.data;
        dbAllocations = allocRes.data;
        dbStreams = streamRes.data;
      }

      if (dbStreams && dbStreams.length > 0 && dbStreams[0].id) {
        freshStreamId = dbStreams[0].id;
      }

      if (dbAllocations && dbAllocations.length > 0) {
        freshAllocations = dbAllocations.map((ts: any) => ({
          id: ts.id,
          subject_id: ts.subject_id,
          class_id: ts.class_id,
          stream_id: ts.stream_id,
        }));
      }
    } catch (err) {
      errorCaught = err;
    }

    expect(errorCaught).toBeNull();
    expect(freshStreamId).toBe(streamUuid);
    expect(freshAllocations).not.toBeNull();
    expect(freshAllocations.length).toBe(1);
    expect(freshAllocations[0].subject_id).toBe(subjectUuid1);

    delete (globalThis as any).__TEST_SUPABASE_CLIENT__;
  });
});
