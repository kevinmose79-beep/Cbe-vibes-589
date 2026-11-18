import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api, KEYS, getStorage, setStorage, syncFromSupabase, resetSyncState } from '../lib/storage';
import { School } from '../types';

describe('Head of Institution (HOI) Phase 1 — Storage & Supabase Synchronisation', () => {
  const baseSchool: School = {
    id: '00000000-0000-0000-0000-000000000001',
    school_name: 'Muchorwe Comprehensive School',
    motto: 'Knowledge to Excel',
    county: 'Nakuru',
    postal_code: 'P.O. Box 100-20100',
    address: 'P.O. Box 100-20100',
    email: 'info@muchorwe.ac.ke',
  };

  const origFetch = globalThis.fetch;

  function createMockSupabase(initialSchoolRows: any[]) {
    let schoolRows = [...initialSchoolRows];
    let lastUpdatePayload: any = null;

    const makeGenericChain = (resolvedData: any[] = []): any => {
      const chain: any = {
        select: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: resolvedData, error: null }),
        eq: () => chain,
        in: () => chain,
        ilike: () => chain,
        update: () => chain,
        upsert: () => chain,
        insert: () => chain,
        delete: () => chain,
        single: () => Promise.resolve({ data: resolvedData[0] || null, error: null }),
        maybeSingle: () => Promise.resolve({ data: resolvedData[0] || null, error: null }),
        then: (onfulfilled: any, onrejected: any) =>
          Promise.resolve({ data: resolvedData, error: null }).then(onfulfilled, onrejected),
      };
      return chain;
    };

    const client: any = {
      getLastUpdatePayload: () => lastUpdatePayload,
      getSchoolRows: () => schoolRows,
      from: (table: string) => {
        if (table === 'school_profile') {
          const schoolChain: any = {
            select: () => schoolChain,
            order: () => schoolChain,
            limit: () => Promise.resolve({ data: schoolRows, error: null }),
            eq: () => schoolChain,
            update: (payload: any) => {
              lastUpdatePayload = payload;
              return {
                eq: (_col: string, val: string) => ({
                  select: () => {
                    schoolRows = schoolRows.map((r) =>
                      r.id === val ? { ...r, ...payload, id: val } : r
                    );
                    if (!schoolRows.some((r) => r.id === val) && schoolRows.length > 0) {
                      schoolRows[0] = { ...schoolRows[0], ...payload, id: val };
                    }
                    return Promise.resolve({ data: schoolRows, error: null });
                  },
                }),
              };
            },
            insert: (payloads: any[]) => ({
              select: () => {
                const inserted = payloads.map((p, idx) => ({
                  id: p.id || `gen-id-${idx}`,
                  ...p,
                }));
                schoolRows = inserted;
                return Promise.resolve({ data: inserted, error: null });
              },
            }),
            then: (onfulfilled: any, onrejected: any) =>
              Promise.resolve({ data: schoolRows, error: null }).then(onfulfilled, onrejected),
          };
          return schoolChain;
        }

        return makeGenericChain([]);
      },
      auth: {
        getSession: () =>
          Promise.resolve({
            data: { session: { user: { id: 'admin-1', email: 'admin@school.ac.ke' } } },
            error: null,
          }),
      },
    };

    return client;
  }

  beforeEach(() => {
    delete (globalThis as any).__TEST_SUPABASE_CLIENT__;
    resetSyncState();
    setStorage(KEYS.SCHOOL, { ...baseSchool });
    // Prevent unmocked fetch timeouts in Node
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    } as any);
  });

  afterEach(() => {
    delete (globalThis as any).__TEST_SUPABASE_CLIENT__;
    resetSyncState();
    globalThis.fetch = origFetch;
  });

  it('1. Includes principal_name in the local cache and Supabase payload when saving', async () => {
    const mockClient = createMockSupabase([{ ...baseSchool, id: baseSchool.id }]);
    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

    const schoolWithHoi: School = {
      ...baseSchool,
      principal_name: 'Dr. Jane Kimani',
    };

    const saved = await api.updateSchool(schoolWithHoi);

    const capturedPayload = mockClient.getLastUpdatePayload();
    expect(capturedPayload).toBeDefined();
    expect(capturedPayload.principal_name).toBe('Dr. Jane Kimani');
    expect(saved.principal_name).toBe('Dr. Jane Kimani');

    // Authoritative local cache check
    const inCache = api.getSchool();
    expect(inCache.principal_name).toBe('Dr. Jane Kimani');
  });

  it('2. Maps principal_name correctly during syncFromSupabase', async () => {
    const mockClient = createMockSupabase([
      {
        id: '21d46f26-99ec-4358-be96-67dd14c72909',
        school_name: 'Muchorwe Comprehensive School',
        county: 'Nakuru',
        address: 'P.O. Box 100-20100',
        email: 'info@muchorwe.ac.ke',
        motto: 'Knowledge to Excel',
        principal_name: 'Mr. Peter Omondi',
        logo_url: null,
      },
    ]);

    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

    // Run syncFromSupabase with force flag
    const syncSuccess = await syncFromSupabase({ force: true });
    expect(syncSuccess).toBe(true);

    // Verify local cache has been hydrated with principal_name
    const syncedSchool = api.getSchool();
    expect(syncedSchool.id).toBe('21d46f26-99ec-4358-be96-67dd14c72909');
    expect(syncedSchool.principal_name).toBe('Mr. Peter Omondi');
  });

  it('3. Survives the full save -> sync -> reload round-trip', async () => {
    const mockClient = createMockSupabase([
      {
        id: baseSchool.id,
        school_name: baseSchool.school_name,
        county: baseSchool.county,
        address: baseSchool.address,
        email: baseSchool.email,
        motto: baseSchool.motto,
        principal_name: null,
      },
    ]);

    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

    // Step A: Save new HOI name
    await api.updateSchool({
      ...baseSchool,
      principal_name: 'Sr. Mary Nduta',
    });

    expect(mockClient.getSchoolRows()[0].principal_name).toBe('Sr. Mary Nduta');
    expect(api.getSchool().principal_name).toBe('Sr. Mary Nduta');

    // Step B: Clear local storage to simulate a fresh browser session
    setStorage(KEYS.SCHOOL, null);
    resetSyncState();

    // Step C: Hydrate from Supabase
    const syncResult = await syncFromSupabase({ force: true });
    expect(syncResult).toBe(true);

    // Step D: Retrieve and assert
    const reloaded = api.getSchool();
    expect(reloaded.principal_name).toBe('Sr. Mary Nduta');
  });

  it('4. Handles null, empty string, and missing name safely without literal "null" or "undefined"', async () => {
    // 4a. Remote row has null
    const mockClientNull = createMockSupabase([{ ...baseSchool, principal_name: null }]);
    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClientNull;
    await syncFromSupabase({ force: true });

    const schoolWithNull = api.getSchool();
    expect(schoolWithNull.principal_name).toBeUndefined();
    expect(schoolWithNull.principal_name).not.toBe('null');
    expect(schoolWithNull.principal_name).not.toBe('undefined');

    // 4b. Saving empty string clears to undefined in cache and null in DB
    const clearedSchool = await api.updateSchool({
      ...baseSchool,
      principal_name: '   ',
    });

    const capturedPayload = mockClientNull.getLastUpdatePayload();
    expect(capturedPayload.principal_name).toBeNull();
    expect(clearedSchool.principal_name).toBeUndefined();
    expect(api.getSchool().principal_name).toBeUndefined();
  });

  it('5. Updating unrelated school profile fields does not unintentionally erase existing HOI name', async () => {
    const mockClient = createMockSupabase([
      {
        ...baseSchool,
        principal_name: 'Dr. Jane Kimani',
      },
    ]);
    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

    // Set existing school with HOI name
    setStorage(KEYS.SCHOOL, {
      ...baseSchool,
      principal_name: 'Dr. Jane Kimani',
    });

    // Caller updates ONLY motto without passing principal_name (principal_name is undefined)
    const unrelatedUpdate: School = {
      ...baseSchool,
      motto: 'Excellence and Integrity',
      principal_name: undefined,
    };

    const updated = await api.updateSchool(unrelatedUpdate);
    const capturedPayload = mockClient.getLastUpdatePayload();

    // Verify payload did not overwrite principal_name with null or undefined
    expect(capturedPayload.principal_name).toBeUndefined();
    expect(capturedPayload.motto).toBe('Excellence and Integrity');

    // Verify the existing principal_name is preserved in the returned and cached school object
    expect(updated.principal_name).toBe('Dr. Jane Kimani');
    expect(api.getSchool().principal_name).toBe('Dr. Jane Kimani');
  });

  it('6. Trims whitespace properly from principal_name input', async () => {
    const mockClient = createMockSupabase([{ ...baseSchool }]);
    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

    const saved = await api.updateSchool({
      ...baseSchool,
      principal_name: '   Prof. George Magoha   ',
    });

    const capturedPayload = mockClient.getLastUpdatePayload();
    expect(capturedPayload.principal_name).toBe('Prof. George Magoha');
    expect(saved.principal_name).toBe('Prof. George Magoha');
    expect(api.getSchool().principal_name).toBe('Prof. George Magoha');
  });
});
