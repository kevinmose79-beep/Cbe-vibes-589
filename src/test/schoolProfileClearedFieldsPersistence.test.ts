import { describe, it, expect, beforeEach } from 'vitest';
import { api, KEYS, setStorage, getStorage, syncFromSupabase, resetSyncState } from '../lib/storage';
import { initialSchool } from '../data/seedData';
import { School } from '../types';

describe('School Profile Cleared Fields & Supabase Persistence Audit', () => {
  beforeEach(() => {
    resetSyncState();
    globalThis.fetch = ((() =>
      Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      })) as any);
  });

  it('1. Confirms initialSchool seed data no longer contains hardcoded postal code or email', () => {
    expect(initialSchool.postal_code).toBe('');
    expect(initialSchool.email).toBe('');
    expect(initialSchool.address).toBe('');
  });

  it('2. Verifies that syncFromSupabase does not resurrect hardcoded postal code or email when cleared in Supabase', async () => {
    // Simulate Supabase row where user cleared postal code (address) and email
    const remoteSchoolRow = {
      id: '21d46f26-99ec-4358-be96-67dd14c72909',
      school_name: 'Muchorwe Comprehensive School',
      motto: 'Knowledge to Excel',
      county: 'Nakuru',
      address: '',
      postal_code: '',
      email: '',
      principal_name: 'Mr Paul Kamau',
      logo_url: null,
    };

    const mockClient: any = {
      auth: {
        getSession: () =>
          Promise.resolve({
            data: { session: { user: { id: 'admin-1', email: 'admin@muchorwe.ac.ke' } } },
            error: null,
          }),
      },
      from: (table: string) => {
        const chain: any = {
          select: () => chain,
          order: () => chain,
          limit: () => {
            if (table === 'school_profile') {
              return Promise.resolve({ data: [remoteSchoolRow], error: null });
            }
            return Promise.resolve({ data: [], error: null });
          },
          eq: () => chain,
          single: () => Promise.resolve({ data: null, error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          then: (onfulfilled: any) =>
            Promise.resolve({
              data: table === 'school_profile' ? [remoteSchoolRow] : [],
              error: null,
            }).then(onfulfilled),
        };
        return chain;
      },
    };

    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

    await syncFromSupabase({ force: true });

    const syncedSchool = api.getSchool();
    expect(syncedSchool.school_name).toBe('Muchorwe Comprehensive School');
    expect(syncedSchool.postal_code).toBe('');
    expect(syncedSchool.address).toBe('');
    expect(syncedSchool.email).toBe('');
    expect(syncedSchool.postal_code).not.toContain('100-00100');
    expect(syncedSchool.email).not.toContain('info@school.ac.ke');
  });

  it('3. Verifies that saving empty postal code and email correctly saves empty strings without resurrecting seed defaults', async () => {
    let capturedPayload: any = null;
    const remoteSchoolRow = {
      id: '21d46f26-99ec-4358-be96-67dd14c72909',
      school_name: 'Muchorwe Comprehensive School',
      motto: 'Knowledge to Excel',
      county: 'Nakuru',
      address: '',
      email: '',
      principal_name: 'Mr Paul Kamau',
    };

    const mockClient: any = {
      from: (table: string) => {
        if (table === 'school_profile') {
          const chain: any = {
            select: () => chain,
            limit: () => Promise.resolve({ data: [{ id: remoteSchoolRow.id }], error: null }),
            update: (payload: any) => {
              capturedPayload = payload;
              return {
                eq: (_col: string, val: string) => ({
                  select: () => Promise.resolve({ data: [{ ...remoteSchoolRow, ...payload, id: val }], error: null }),
                }),
              };
            },
          };
          return chain;
        }
        return {
          select: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        };
      },
    };

    (globalThis as any).__TEST_SUPABASE_CLIENT__ = mockClient;

    const savedSchool = await api.updateSchool({
      id: '21d46f26-99ec-4358-be96-67dd14c72909',
      school_name: 'Muchorwe Comprehensive School',
      motto: 'Knowledge to Excel',
      county: 'Nakuru',
      postal_code: '',
      address: '',
      email: '',
      principal_name: 'Mr Paul Kamau',
    });

    expect(capturedPayload).toBeDefined();
    expect(capturedPayload.address).toBe('');
    expect(capturedPayload.email).toBe('');
    expect(savedSchool.postal_code).toBe('');
    expect(savedSchool.email).toBe('');

    const localStored = getStorage<School>(KEYS.SCHOOL, initialSchool);
    expect(localStored.postal_code).toBe('');
    expect(localStored.email).toBe('');
  });
});
