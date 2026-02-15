import { supabase } from './supabase';

/**
 * Triggers the remote database function `cancel_expired_appointments`.
 * This function handles the logic of checking time and updating statuses on the server side (or via pg_cron).
 * We invoke it here via RPC to allow manual triggers or legacy support if pg_cron isn't active.
 */
export const checkAndCancelExpiredAppointments = async () => {
    try {
        console.log("[Scheduler] Triggering cloud cleanup...");
        const { error } = await supabase.rpc('cancel_expired_appointments');
        
        if (error) {
            console.warn("Cloud scheduler RPC failed (function might not exist or network issue):", error.message);
        } else {
            console.log("[Scheduler] Cloud cleanup executed successfully.");
        }
    } catch (e) {
        console.error("Scheduler invocation error:", e);
    }
};