import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from '../../components/Layout';
import { BottomNav } from '../../components/BottomNav';
import { PageRoute, Barber, Appointment } from '../../types';
import { supabase } from '../../services/supabase';

interface Props {
  onNavigate: (route: PageRoute) => void;
}

interface DayStatus {
    dayName: string; // "周一"
    dateNum: string; // "23"
    fullDateStr: string; // "10月23日" matches DB format
    count: number;
    status: 'free' | 'busy' | 'full';
}

interface TimeSlot {
    time: string;
    appointment?: Appointment;
    status: 'available' | 'booked';
}

export const Dashboard: React.FC<Props> = ({ onNavigate }) => {
  const [selectedBarberName, setSelectedBarberName] = useState<string>('');
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // System Config State
  const [config, setConfig] = useState({
      openTime: "09:00",
      closeTime: "21:00",
      serviceDuration: 45, // minutes
      maxAppointments: 24
  });

  // Helper: Format Date to "M月D日"
  const formatDateToDB = (date: Date) => {
      return `${date.getMonth() + 1}月${date.getDate()}日`;
  };

  // Helper: Get Day Name
  const getDayName = (date: Date) => {
      const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return days[date.getDay()];
  };

  // 1. Fetch System Settings & Barbers
  useEffect(() => {
    const initData = async () => {
        setLoading(true);
        try {
            // Fetch Config
            const { data: settingsData } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'global_config')
                .single();
            
            if (settingsData?.value) {
                setConfig(prev => ({ ...prev, ...settingsData.value }));
            }

            // Fetch Barbers
            const { data: barberData } = await supabase.from('app_barbers').select('*').order('id');
            if (barberData && barberData.length > 0) {
                setBarbers(barberData as unknown as Barber[]);
                if (!selectedBarberName) {
                    setSelectedBarberName(barberData[0].name);
                }
            }
        } catch (e) {
            console.error("Init Error", e);
        } finally {
            setLoading(false);
        }
    };

    initData();
  }, []);

  // 2. Fetch Appointments when Barber changes
  useEffect(() => {
      if (!selectedBarberName) return;

      const fetchAppointments = async () => {
          // Fetch appointments for the selected barber (simple fetch all active for simplicity in this demo scope)
          // In prod, you would filter by date range >= today
          const { data } = await supabase
              .from('app_appointments')
              .select('*')
              .eq('barber_name', selectedBarberName)
              .neq('status', 'cancelled');
          
          if (data) {
              setAppointments(data as Appointment[]);
          }
      };

      fetchAppointments();

      const channel = supabase.channel('dashboard_appt_updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_appointments' }, () => {
            fetchAppointments(); 
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
  }, [selectedBarberName]);

  // 3. Compute 7-Day View Data
  const weekData = useMemo(() => {
      const days: DayStatus[] = [];
      const today = new Date();
      
      // Calculate total possible slots per day
      const [openH, openM] = config.openTime.split(':').map(Number);
      const [closeH, closeM] = config.closeTime.split(':').map(Number);
      const totalMinutes = (closeH * 60 + closeM) - (openH * 60 + openM);
      const totalSlots = Math.floor(totalMinutes / config.serviceDuration);

      for (let i = 0; i < 7; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() + i);
          
          const dbDateStr = formatDateToDB(d);
          const dayName = i === 0 ? '今天' : getDayName(d);
          
          // Count appointments for this day
          const dailyAppts = appointments.filter(a => a.date_str === dbDateStr);
          const count = dailyAppts.length;
          
          let status: 'free' | 'busy' | 'full' = 'free';
          const ratio = count / totalSlots;
          
          if (ratio >= 0.8) status = 'full';
          else if (ratio >= 0.5) status = 'busy';
          
          days.push({
              dayName,
              dateNum: d.getDate().toString(),
              fullDateStr: dbDateStr,
              count,
              status
          });
      }
      return days;
  }, [appointments, config]);

  // 4. Compute Daily Schedule Slots
  const currentDaySchedule = useMemo(() => {
      const selectedDateStr = weekData[selectedDayIndex]?.fullDateStr;
      const slots: TimeSlot[] = [];
      
      if (!selectedDateStr) return [];

      let current = new Date(`2000-01-01T${config.openTime}:00`);
      const end = new Date(`2000-01-01T${config.closeTime}:00`);
      
      const dailyAppts = appointments.filter(a => a.date_str === selectedDateStr);

      while (current < end) {
          const timeStr = current.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
          
          // Find if there is an appointment at this time
          // Note: This matches exact start time string. Robust systems use time ranges.
          const appt = dailyAppts.find(a => a.time_str === timeStr);
          
          slots.push({
              time: timeStr,
              appointment: appt,
              status: appt ? 'booked' : 'available'
          });

          // Increment
          current.setMinutes(current.getMinutes() + config.serviceDuration);
      }
      
      return slots;
  }, [weekData, selectedDayIndex, appointments, config]);

  const currentBarberObj = barbers.find(b => b.name === selectedBarberName) || barbers[0];
  const currentDayInfo = weekData[selectedDayIndex];

  return (
    <Layout>
      <header className="pt-14 pb-4 px-6 flex justify-between items-end sticky top-0 bg-white/85 ios-blur z-20 border-b border-gray-100">
        <div>
          <p className="text-[10px] text-primary font-bold tracking-[0.1em] uppercase">BARBERBOOK PRO</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">本周预约看板</h1>
        </div>
        <button className="w-10 h-10 rounded-full bg-white border border-gray-100 shadow-sm flex items-center justify-center text-slate-600 active:bg-slate-50">
          <span className="material-symbols-outlined text-2xl">notifications</span>
        </button>
      </header>

      <main className="flex-1 overflow-y-auto pb-32">
        {/* Barber Selector */}
        <section className="mt-6 mb-8">
          <div className="px-6 flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-500">选择理发师</h3>
            <span 
              onClick={() => setShowDetailModal(true)} 
              className="text-xs text-primary font-medium cursor-pointer hover:underline"
            >
              查看详情
            </span>
          </div>
          
          {loading && barbers.length === 0 ? (
             <div className="px-6 text-xs text-slate-400">加载理发师数据...</div>
          ) : (
            <div className="flex gap-5 overflow-x-auto px-6 pb-2 hide-scrollbar">
                {barbers.map((barber) => {
                const isSelected = selectedBarberName === barber.name;
                return (
                    <div 
                    key={barber.id} 
                    onClick={() => setSelectedBarberName(barber.name)}
                    className={`flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer transition-all ${isSelected ? '' : 'opacity-60 scale-95'}`}
                    >
                    <div className={`relative w-16 h-16 rounded-full p-0.5 transition-all ${isSelected ? 'border-2 border-primary shadow-md shadow-blue-100' : 'border border-transparent'}`}>
                        <img 
                        alt={barber.name} 
                        className={`w-full h-full rounded-full object-cover transition-all ${isSelected ? '' : 'grayscale-[20%]'}`}
                        src={barber.image}
                        />
                        {/* Status Indicator */}
                        <div className={`absolute top-0 right-0 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center
                            ${barber.status === 'active' ? 'bg-status-ready' : barber.status === 'busy' ? 'bg-amber-400' : 'bg-slate-400'}
                        `}>
                            {isSelected && <span className="material-symbols-outlined text-[8px] text-white font-bold">check</span>}
                        </div>
                    </div>
                    <span className={`text-xs ${isSelected ? 'font-bold text-slate-900' : 'font-medium text-slate-500'}`}>{barber.name}</span>
                    </div>
                );
                })}
            </div>
          )}
        </section>

        {/* 7 Day View */}
        <section className="px-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-500">未来 7 天饱和度</h3>
            <div className="flex gap-3 text-[10px] font-medium text-slate-400">
              <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-status-ready"></span> 空闲</div>
              <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> 繁忙</div>
              <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-status-busy"></span> 已满</div>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {weekData.map((day, i) => {
              const isSelected = selectedDayIndex === i;
              return (
                <button 
                  key={i} 
                  onClick={() => setSelectedDayIndex(i)}
                  className={`flex flex-col items-center py-3 rounded-2xl transition-all duration-300
                    ${isSelected 
                      ? 'ring-2 ring-primary bg-white shadow-lg scale-110 z-10 -translate-y-1' 
                      : 'bg-white border border-gray-100 shadow-sm hover:bg-gray-50'
                    }`}
                >
                  <span className={`text-[10px] font-medium mb-1 ${isSelected ? 'text-primary' : 'text-slate-400'}`}>{day.dayName}</span>
                  <span className={`text-sm font-bold mb-3 ${isSelected ? 'text-slate-900' : 'text-slate-500'}`}>{day.dateNum}</span>
                  <div className={`w-1.5 h-1.5 rounded-full ${day.status === 'free' ? 'bg-status-ready' : day.status === 'busy' ? 'bg-amber-400' : 'bg-status-busy'}`}></div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Today's List */}
        <section className="px-6">
          <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-50 transition-all duration-500">
            {currentDayInfo && (
                <div className="flex justify-between items-start mb-6">
                <div>
                    <h4 className="font-bold text-slate-900 text-lg">{currentDayInfo.fullDateStr} ({currentDayInfo.dayName})</h4>
                    <p className="text-sm text-slate-400">
                    {selectedBarberName} • 已预约 {currentDayInfo.count} 单
                    </p>
                </div>
                <div className={`px-3 py-1 border rounded-full text-[11px] font-bold
                    ${currentDayInfo.status === 'free' ? 'bg-green-50 text-status-ready border-green-100' : 
                    currentDayInfo.status === 'busy' ? 'bg-amber-50 text-amber-500 border-amber-100' : 
                    'bg-red-50 text-status-busy border-red-100'}
                `}>
                    状态：{currentDayInfo.status === 'free' ? '空闲' : currentDayInfo.status === 'busy' ? '繁忙' : '已满'}
                </div>
                </div>
            )}
            
            <div className="space-y-4">
              {currentDaySchedule.length > 0 ? (
                  currentDaySchedule.map((slot, idx) => (
                    <div key={idx}>
                        {slot.status === 'available' ? (
                            <div className="flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed border-primary/20 bg-blue-50/20 hover:bg-blue-50 transition-colors group">
                                <span className="text-xs font-semibold text-primary w-12">{slot.time}</span>
                                <div className="h-8 w-1 bg-status-ready rounded-full"></div>
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-primary group-hover:text-blue-700 transition-colors">可预约</p>
                                    <p className="text-[10px] text-primary/60">当前时段空闲</p>
                                </div>
                                <button className="bg-primary text-white px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-blue-600 transition-colors shadow-sm">预留</button>
                            </div>
                        ) : (
                            <div className={`flex items-center gap-4 p-4 rounded-2xl border ${slot.appointment?.status === 'checked_in' ? 'bg-green-50/50 border-green-100' : 'bg-gray-50/50 border-gray-100'}`}>
                                <span className="text-xs font-semibold text-slate-400 w-12">{slot.time}</span>
                                <div className={`h-8 w-1 rounded-full ${slot.appointment?.status === 'checked_in' ? 'bg-status-ready' : 'bg-status-busy'}`}></div>
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-slate-900">{slot.appointment?.customer_name}</p>
                                    <p className="text-[10px] text-slate-400">{slot.appointment?.service_name} • {config.serviceDuration}分钟</p>
                                </div>
                                {slot.appointment?.status === 'checked_in' ? (
                                    <span className="material-symbols-outlined text-green-500 text-xl" title="已签到">check_circle</span>
                                ) : (
                                    <span className="material-symbols-outlined text-slate-300 text-xl">lock</span>
                                )}
                            </div>
                        )}
                    </div>
                  ))
              ) : (
                  <div className="text-center py-8 text-slate-400 text-xs">暂无排班数据</div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Barber Detail Modal */}
      {showDetailModal && currentBarberObj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
                className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" 
                onClick={() => setShowDetailModal(false)}
            ></div>
            <div className="relative bg-white w-full max-w-xs rounded-[32px] p-6 shadow-2xl animate-[scale-in_0.2s_ease-out]">
                <div className="flex flex-col items-center">
                    <div className="relative">
                        <img src={currentBarberObj.image} className="w-24 h-24 rounded-full object-cover mb-4 shadow-lg border-4 border-white" />
                        <span className={`absolute bottom-4 right-0 w-6 h-6 border-4 border-white rounded-full
                             ${currentBarberObj.status === 'active' ? 'bg-status-ready' : currentBarberObj.status === 'busy' ? 'bg-amber-400' : 'bg-slate-400'}
                        `}></span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">{currentBarberObj.name}</h2>
                    <p className="text-sm text-slate-500 mb-6 font-medium">{currentBarberObj.title || '理发师'}</p>
                    
                    <div className="grid grid-cols-2 gap-4 w-full mb-6">
                        <div className="bg-slate-50 p-3 rounded-2xl text-center border border-slate-100">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">历史服务</p>
                            <p className="text-xl font-bold text-slate-900">{currentBarberObj.service_count || 0}</p>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-2xl text-center border border-slate-100">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">综合评分</p>
                            <div className="flex items-center justify-center gap-1">
                                <span className="text-xl font-bold text-primary">{currentBarberObj.rating}</span>
                                <span className="material-symbols-outlined text-amber-400 text-sm">star</span>
                            </div>
                        </div>
                    </div>

                    <button 
                        onClick={() => { setShowDetailModal(false); onNavigate('admin_management'); }} 
                        className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-2xl mb-3 shadow-lg active:scale-95 transition-all"
                    >
                        管理档案
                    </button>
                    <button 
                        onClick={() => setShowDetailModal(false)} 
                        className="w-full text-slate-400 font-bold py-2 hover:text-slate-600 transition-colors"
                    >
                        关闭
                    </button>
                </div>
            </div>
        </div>
      )}

      <BottomNav activeRoute="admin_dashboard" onNavigate={onNavigate} userRole="admin" />
    </Layout>
  );
};