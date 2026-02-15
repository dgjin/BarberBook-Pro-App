import { supabase } from './supabase';

/**
 * Checks for pending or confirmed appointments that have passed their scheduled time.
 * If current time > appointment time + grace period (e.g. 15 mins), cancel them.
 */
export const checkAndCancelExpiredAppointments = async () => {
    try {
        // Fetch active appointments
        const { data: activeAppts, error } = await supabase
            .from('app_appointments')
            .select('*')
            .in('status', ['confirmed', 'pending']);

        if (error || !activeAppts || activeAppts.length === 0) return;

        const now = new Date();
        const currentYear = now.getFullYear();
        const expiredIds: number[] = [];
        const gracePeriodMinutes = 15; // Allow 15 mins grace period before auto-cancelling

        for (const appt of activeAppts) {
            // Expected date format: "10月24日"
            const dateMatch = appt.date_str.match(/(\d+)月(\d+)日/);
            if (!dateMatch) continue;

            const month = parseInt(dateMatch[1], 10);
            const day = parseInt(dateMatch[2], 10);
            
            // Expected time format: "14:00"
            const [hour, minute] = appt.time_str.split(':').map(Number);
            
            // Construct Appointment Date (assuming current year)
            // Note: In a real production app, we should store full ISO timestamps to handle year rollovers correctly.
            const apptDate = new Date(currentYear, month - 1, day, hour, minute);
            
            // Check if expired (now > appt time + grace)
            if (now.getTime() > apptDate.getTime() + (gracePeriodMinutes * 60 * 1000)) {
                expiredIds.push(appt.id);
            }
        }

        if (expiredIds.length > 0) {
            // Batch update status to 'cancelled'
            const { error: updateError } = await supabase
                .from('app_appointments')
                .update({ status: 'cancelled' })
                .in('id', expiredIds);
            
            if (!updateError) {
                // Log the system action
                await supabase.from('app_logs').insert({
                    user: 'System (Scheduler)',
                    role: 'system',
                    action: '自动取消违约',
                    details: `已自动取消 ${expiredIds.length} 个超时未签到的预约 (IDs: ${expiredIds.join(', ')})`,
                    type: 'warning',
                    avatar: 'https://ui-avatars.com/api/?name=Sys&background=ff3b30&color=fff'
                });
                console.log(`[Scheduler] Cancelled ${expiredIds.length} expired appointments.`);
            }
        }

    } catch (e) {
        console.error("Scheduler error:", e);
    }
};