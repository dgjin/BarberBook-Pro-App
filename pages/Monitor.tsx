import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Layout } from '../components/Layout';
import { BottomNav } from '../components/BottomNav';
import { PageRoute, Barber, Appointment } from '../types';
import { supabase } from '../services/supabase';

interface Props {
  onNavigate: (route: PageRoute) => void;
}

interface NotificationState {
    show: boolean;
    message: string;
    type: 'booking' | 'checkin' | 'info';
}

export const Monitor: React.FC<Props> = ({ onNavigate }) => {
  const [isExpanded, setIsExpanded] = useState<Record<number, boolean>>({});
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Notification State
  const [notification, setNotification] = useState<NotificationState>({ show: false, message: '', type: 'info' });
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Function to get "Today" string matching the format stored in DB: "M月D日"
  const getTodayString = () => {
    const d = new Date();
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  const showToast = (msg: string, type: 'booking' | 'checkin' | 'info') => {
      if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
      
      setNotification({ show: true, message: msg, type });
      
      notificationTimeoutRef.current = setTimeout(() => {
          setNotification(prev => ({ ...prev, show: false }));
      }, 5000); // Show for 5 seconds
  };

  const fetchMonitorData = useCallback(async (silent = false) => {
      if (!silent) setLoading(true);
      try {
          // 1. Fetch Active Barbers
          const { data: barberData } = await supabase
              .from('app_barbers')
              .select('*')
              .eq('status', 'active')
              .order('id');
          
          if (barberData) {
              setBarbers(barberData as unknown as Barber[]);
          }

          // 2. Fetch Active Appointments for Today
          // Status: pending, confirmed, checked_in
          const todayStr = getTodayString();
          const { data: apptData } = await supabase
              .from('app_appointments')
              .select('*')
              .eq('date_str', todayStr)
              .in('status', ['confirmed', 'pending', 'checked_in'])
              .order('time_str', { ascending: true }); // Sort by time

          if (apptData) {
              setAppointments(apptData as Appointment[]);
          }
      } catch (e) {
          console.error("Monitor fetch error:", e);
      } finally {
          if (!silent) setLoading(false);
      }
  }, []);

  useEffect(() => {
    // Initial Load
    fetchMonitorData();

    // --- 1. Realtime Subscription ---
    const channel = supabase.channel('monitor_updates')
        .on(
            'postgres_changes', 
            { event: '*', schema: 'public', table: 'app_appointments' }, 
            (payload) => {
                // Determine event type for UI feedback
                const newRecord = payload.new as Appointment;
                const oldRecord = payload.old as Appointment;
                const todayStr = getTodayString();

                // Only care about today's updates
                if (newRecord?.date_str === todayStr || oldRecord?.date_str === todayStr) {
                    
                    if (payload.eventType === 'INSERT') {
                        showToast(`新预约: ${newRecord.customer_name} - ${newRecord.time_str}`, 'booking');
                    } 
                    else if (payload.eventType === 'UPDATE') {
                        if (oldRecord.status !== 'checked_in' && newRecord.status === 'checked_in') {
                            showToast(`客户已到店: ${newRecord.customer_name}`, 'checkin');
                        } else if (newRecord.status === 'cancelled') {
                            showToast(`预约已取消: ${newRecord.customer_name}`, 'info');
                        }
                    }

                    // Refresh Data
                    fetchMonitorData(true); 
                }
            }
        )
        .subscribe();
    
    // --- 2. Polling Fallback (Robustness) ---
    // Poll every 10 seconds to ensure data consistency even if socket drops or in Mock mode
    const pollingInterval = setInterval(() => {
        fetchMonitorData(true);
    }, 10000);

    // --- 3. Clock ---
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 60000);

    return () => { 
        supabase.removeChannel(channel);
        clearInterval(pollingInterval);
        clearInterval(clockInterval);
        if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    };
  }, [fetchMonitorData]);

  const toggleExpand = (barberId: number) => {
      setIsExpanded(prev => ({ ...prev, [barberId]: !prev[barberId] }));
  };

  // Derived Statistics
  const totalWaiting = appointments.filter(a => a.status !== 'completed' && a.status !== 'cancelled').length;
  // Estimate: 20 mins per waiting person
  const estimatedWaitTime = totalWaiting * 20;

  // Group appointments by Barber
  const getBarberQueue = (barberName: string) => {
      return appointments.filter(a => a.barber_name === barberName);
  };

  const formatTime = (date: Date) => {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Layout>
      {/* Dynamic Notification Toast */}
      <div className={`fixed top-24 right-6 z-50 transition-all duration-500 transform ${notification.show ? 'translate-x-0 opacity-100' : 'translate-x-10 opacity-0'}`}>
          <div className={`shadow-xl rounded-2xl p-4 flex items-center gap-3 border border-white/50 backdrop-blur-md min-w-[240px]
              ${notification.type === 'booking' ? 'bg-blue-500/90 text-white' : 
                notification.type === 'checkin' ? 'bg-green-500/90 text-white' : 'bg-slate-800/90 text-white'}
          `}>
              <div className="bg-white/20 p-2 rounded-full">
                  <span className="material-symbols-outlined text-xl">
                      {notification.type === 'booking' ? 'event_available' : 
                       notification.type === 'checkin' ? 'how_to_reg' : 'info'}
                  </span>
              </div>
              <div>
                  <p className="text-[10px] font-bold opacity-80 uppercase tracking-wider">
                      {notification.type === 'booking' ? 'New Booking' : 
                       notification.type === 'checkin' ? 'Check-In' : 'Update'}
                  </p>
                  <p className="text-sm font-bold">{notification.message}</p>
              </div>
          </div>
      </div>

      <header className="pt-14 pb-6 px-6 sticky top-0 bg-bg-main/90 backdrop-blur-xl z-20 flex justify-between items-end border-b border-white/50">
        <div>
          <p className="text-[10px] text-primary font-bold tracking-[0.1em] uppercase mb-1 flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              REAL-TIME MONITOR
          </p>
          <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-text-main">今日排队动态</h1>
              <button 
                onClick={() => onNavigate('web_monitor')}
                className="bg-slate-800 text-white px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm active:scale-95 transition-transform"
                title="Open Web Monitor"
              >
                  <span className="material-symbols-outlined text-xs">desktop_windows</span>
                  <span className="text-[10px] font-bold">大屏模式</span>
              </button>
          </div>
        </div>
        <div className="flex flex-col items-end">
            <span className="text-3xl font-mono font-bold text-slate-900 tracking-tighter leading-none">{formatTime(currentTime)}</span>
            <span className="text-[10px] font-bold text-text-secondary mt-1">{getTodayString()}</span>
        </div>
      </header>
      
      <main className="flex-1 overflow-y-auto px-6 pb-32 space-y-6 pt-6">
        {/* Statistics Cards */}
        <section className="grid grid-cols-2 gap-4">
          <div className="bg-surface rounded-2xl p-4 shadow-sm border border-white">
            <p className="text-text-secondary text-[10px] font-bold mb-1">总预计等待</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold font-display text-primary">{loading ? '-' : estimatedWaitTime}</span>
              <span className="text-[10px] font-medium text-text-secondary">分钟</span>
            </div>
          </div>
          <div className="bg-surface rounded-2xl p-4 shadow-sm border border-white">
            <p className="text-text-secondary text-[10px] font-bold mb-1">候补总人数</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold font-display text-text-main">{loading ? '-' : totalWaiting}</span>
              <span className="text-[10px] font-medium text-text-secondary">位顾客</span>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold tracking-widest text-text-secondary uppercase">理发师队列状态</h3>
            <span className="text-[10px] text-primary font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px] animate-spin">sync</span>
                自动同步中
            </span>
          </div>
          
          {loading && barbers.length === 0 ? (
             <div className="text-center py-10 text-slate-400 text-xs">正在连接实时数据...</div>
          ) : barbers.length > 0 ? (
             barbers.map(barber => {
                 const queue = getBarberQueue(barber.name);
                 // Determine who is currently being served (Checked In status takes priority, or first in line)
                 const currentCustomer = queue.find(a => a.status === 'checked_in');
                 // Remaining queue
                 const waitingList = queue.filter(a => a.id !== currentCustomer?.id);
                 
                 return (
                    <div key={barber.id} className="bg-surface rounded-3xl overflow-hidden shadow-sm border-t-4 border-primary animate-fade-in relative">
                        <div className="p-5">
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                                <img className="w-full h-full object-cover" src={barber.image} alt={barber.name}/>
                            </div>
                            <div>
                                <h4 className="font-bold text-text-main">{barber.name}</h4>
                                <div className="flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${currentCustomer ? 'bg-status-busy' : 'bg-status-ready'}`}></span>
                                <span className="text-[10px] text-text-secondary font-bold uppercase">
                                    {currentCustomer ? '服务中' : '空闲 / 等待中'}
                                </span>
                                </div>
                            </div>
                            </div>
                            <div className={`px-3 py-2 rounded-xl flex flex-col items-end transition-colors duration-500 ${waitingList.length > 0 ? 'bg-blue-50' : 'bg-slate-50'}`}>
                                <p className={`text-[8px] font-bold uppercase ${waitingList.length > 0 ? 'text-primary' : 'text-slate-400'}`}>排队人数</p>
                                <p className={`text-sm font-display font-bold tracking-tight ${waitingList.length > 0 ? 'text-primary' : 'text-slate-400'}`}>{waitingList.length}</p>
                            </div>
                        </div>

                        {/* Current Service Block */}
                        {currentCustomer ? (
                            <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-4 mb-4 border border-slate-700 shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-3 opacity-10">
                                    <span className="material-symbols-outlined text-4xl text-white">content_cut</span>
                                </div>
                                <div className="flex justify-between items-center relative z-10">
                                <div>
                                    <p className="text-[9px] text-blue-300 font-bold uppercase mb-0.5 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span> 正在服务
                                    </p>
                                    <p className="font-bold text-lg text-white">{currentCustomer.customer_name}</p>
                                </div>
                                <span className="text-[10px] text-slate-300 font-medium bg-white/10 px-2 py-1 rounded-lg border border-white/10">{currentCustomer.service_name}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-green-50 rounded-2xl p-3 mb-4 border border-green-100 text-center">
                                <p className="text-[10px] text-green-600 font-bold">当前暂无正在服务的客户</p>
                            </div>
                        )}

                        {/* Waiting List Block */}
                        <div className="space-y-2 transition-all duration-300">
                            <p className="text-[9px] text-text-secondary font-bold uppercase px-1">等待队列 ({waitingList.length})</p>
                            
                            {waitingList.length > 0 ? (
                                <>
                                    {waitingList.slice(0, isExpanded[barber.id] ? undefined : 2).map((appt, idx) => (
                                        <div key={appt.id} className="flex items-center gap-3 px-3 py-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                                            <span className="text-[11px] font-bold font-display text-primary bg-blue-50 w-6 h-6 flex items-center justify-center rounded-lg">{idx + 1}</span>
                                            <span className="text-xs font-bold text-text-main">{appt.customer_name}</span>
                                            <div className="ml-auto flex items-center gap-2">
                                                <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{appt.service_name}</span>
                                                <span className="text-[10px] text-text-secondary font-display font-bold">{appt.time_str}</span>
                                            </div>
                                        </div>
                                    ))}

                                    {waitingList.length > 2 && (
                                        <button 
                                            onClick={() => toggleExpand(barber.id)}
                                            className="w-full py-2 text-[10px] text-text-secondary font-bold hover:text-primary transition-colors flex items-center justify-center gap-1"
                                        >
                                            {isExpanded[barber.id] ? '收起列表' : `查看剩余 ${waitingList.length - 2} 位`}
                                            <span className="material-symbols-outlined text-sm">{isExpanded[barber.id] ? 'expand_less' : 'expand_more'}</span>
                                        </button>
                                    )}
                                </>
                            ) : (
                                <div className="px-3 py-2 text-[10px] text-slate-400 text-center border border-dashed border-gray-200 rounded-xl">
                                    队列空闲
                                </div>
                            )}
                        </div>
                        </div>
                    </div>
                 );
             })
          ) : (
              <div className="text-center py-10 text-slate-400">暂无理发师数据</div>
          )}
        </section>
      </main>
      <BottomNav activeRoute="monitor" onNavigate={onNavigate} userRole="customer" />
    </Layout>
  );
};