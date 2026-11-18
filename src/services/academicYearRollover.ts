import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

let isRolloverChecked = false;

/**
 * Executes the academic year rollover via the authoritative PostgreSQL RPC function.
 * Safe, atomic, and concurrency-protected at the database level.
 * Zero TypeScript-side mutation fallback.
 */
export async function checkAndPerformAcademicYearRollover(force = false): Promise<{ success: boolean; message: string }> {
  if (isRolloverChecked && !force) {
    return { success: true, message: "Academic year rollover already checked for this server instance." };
  }
  isRolloverChecked = true;

  // 1. Safeguard: Automatic background rollover on ordinary HTTP traffic is strictly disabled.
  // Rollover requires explicit, authorized invocation by an administrator (force === true).
  if (!force) {
    return {
      success: true,
      message: "Automatic rollover via request is disabled. Rollover must be explicitly triggered by an authorized administrator."
    };
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return { success: false, message: "Supabase client uninitialized due to missing environment variables." };
    }

    // 2. Fetch current Active Academic Year from database
    const { data: activeAYs, error: ayErr } = await supabaseAdmin
      .from('academic_years')
      .select('*')
      .eq('status', 'Active');

    if (ayErr) {
      throw new Error(`Failed to fetch active academic year: ${ayErr.message}`);
    }

    if (!activeAYs || activeAYs.length === 0) {
      return { success: false, message: "No active academic year found in the database. Rollover cannot be performed." };
    }

    const activeAY = activeAYs[0];
    const activeYearNumber = activeAY.year; // e.g., 2026

    // Validate that activeYearNumber is a valid finite integer
    if (!Number.isInteger(activeYearNumber) || activeYearNumber < 2000 || activeYearNumber > 2100) {
      return { success: false, message: `Invalid active academic year retrieved from database: ${activeYearNumber}. Rollover aborted.` };
    }

    console.log(`[Rollover] Initiating academic year rollover from ${activeYearNumber} via PostgreSQL RPC...`);

    // 3. Execute the database RPC with exact argument p_expected_current_year
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('perform_academic_year_rollover', {
      p_expected_current_year: activeYearNumber
    });

    // 4. Strict Failure Handling: Halt immediately on any RPC error. Zero fallback mutations.
    if (rpcError) {
      console.error(`[Rollover Error] Database RPC perform_academic_year_rollover failed:`, rpcError.message);
      return { success: false, message: `Academic year rollover failed: ${rpcError.message}` };
    }

    // 5. If the RPC returns data with success: false, preserve and return that failure
    if (rpcData && rpcData.success === false) {
      console.warn(`[Rollover Precondition] Database RPC returned unsuccessful:`, rpcData.message);
      return {
        success: false,
        message: rpcData.message || `Academic year rollover failed.`
      };
    }

    console.log(`[Rollover] Database RPC perform_academic_year_rollover executed successfully:`, rpcData);
    return {
      success: true,
      message: rpcData?.message ?? `Academic year rollover from ${activeYearNumber} completed successfully.`
    };

  } catch (err: any) {
    console.error("[Rollover Error] Academic year rollover execution failed:", err);
    return { success: false, message: `Academic year rollover failed: ${err.message}` };
  }
}

/**
 * Resets the rollover checked state for unit testing.
 */
export function resetRolloverCheckedForTesting() {
  isRolloverChecked = false;
}
