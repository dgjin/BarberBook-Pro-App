import React, { useState, useEffect, useCallback } from 'react';
import { Layout, Header } from '../components/Layout';
import { PageRoute, Barber, Appointment, User, ServiceItem } from '../types';
import { supabase } from '../services/supabase';

interface Props {
  onNavigate: (route: PageRoute) => void;
  preselectedBarber?: Barber | null;
  onBookingSuccess?: (appointment: Appointment) => void;
  currentUser?: User | null;
}

interface DateOption {
    day: string;
    date: number;
    month: number;
    fullDate: Date;
}

export const Booking: React.FC<Props> = ({ onNavigate, preselectedBarber, onBookingSuccess, currentUser }) => {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [currentBarber, setCurrentBarber] = useState<Barber | null>(preselectedBarber || null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [dates, setDates] = useState<DateOption[]>([]);
  const [selectedDate, setSelectedDate] = useState<DateOption | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [bookedSlots, setBookedSlots] = useState<string[]>([]); 
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showBarberDetailModal, setShowBarberDetailModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Dynamic Time Slots State
  const [timeSlots, setTimeSlots] = useState<string[]>([]);

  // Init Dates
  useEffect(() => {
    const today = new Date();
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const d: DateOption[] = [];
    
    for (let i = 0; i < 14; i++) {
        const nextDay = new Date(today);
        nextDay.setDate(today.getDate() + i);
        d.push({
            day: i === 0 ? '今天' : i === 1 ? '明天' : dayNames[nextDay.getDay()],
            date: nextDay.getDate(),
            month: nextDay.getMonth() + 1,
            fullDate: nextDay
        });
    }
    setDates(d);
    setSelectedDate(d[0]);
  }, []);

  // Fetch Services from DB
  useEffect(() => {
      const fetchServices = async () => {
          const { data } = await supabase.from('app_services').select('*').order('price', { ascending: true });
          if (data && data.length > 0) {
              setServices(data);
              // Select the second item by default if available (usually standard cut), else first
              setSelectedService(data.length > 1 ? data[1] : data[0]);
          } else {
              // Fallback mock
              const mockServices = [
                { id: '1', name: '标准男士精剪', price: 88, duration: 45, icon: 'content_cut' },
                { id: '2', name: '高级总监设计', price: 128, duration: 60, icon: 'face' },
                { id: '3', name: '尊享洗剪吹护', price: 168, duration: 90, icon: 'spa' },
                { id: '4', name: '潮流染烫套餐', price: 388, duration: 120, icon: 'palette' },
              ];
              setServices(mockServices);
              setSelectedService(mockServices[1]);
          }
      };
      fetchServices();
  }, []);

  // Load System Config for Operating Hours
  useEffect(() => {
    const loadOperatingHours = async () => {
        let openTime = "10:00";
        let closeTime = "20:00";
        
        try {
            const { data } = await supabase.from('app_settings').select('value').eq('key', 'global_config').single();
            if (data?.value) {
                if (data.value.openTime) openTime = data.value.openTime;
                if (data.value.closeTime) closeTime = data.value.closeTime;
            }
        } catch (e) {
            console.error("Error loading settings, using defaults", e);
        }

        // Generate hourly slots
        const slots: string[] = [];
        let current = new Date(`2000-01-01T${openTime}`);
        const end = new Date(`2000-01-01T${closeTime}`);
        
        // Safety break to prevent infinite loop
        let count = 0;
        while (current < end && count < 24) {
            const timeStr = current.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            slots.push(timeStr);
            // Increment by 1 hour (default)
            current.setHours(current.getHours() + 1);
            count++;
        }
        
        setTimeSlots(slots);
        // Default select logic will be handled in render loop or effect
    };
    loadOperatingHours();
  }, []);

  // Fetch barbers
  useEffect(() => {
    const fetchBarbers = async () => {
      const { data } = await supabase.from('app_barbers').select('*').eq('status', 'active').order('rating', { ascending: false });
      
      // Also fetch counts for better display if needed, but for simplicity we rely on what's in DB or updated via management
      // To ensure 'service_count' is fresh, we could do the same aggregation here, but let's assume management updates it or we rely on base value.
      // Better: perform the same lightweight aggregation.
      
      let enrichedData = data as unknown as Barber[];

      // Lightweight fetch for counts to keep booking page fresh
      const { data: apptData } = await supabase.from('app_appointments').select('barber_name').eq('status', 'completed');
      if (apptData && data) {
           const counts: Record<string, number> = {};
           apptData.forEach((a: any) => counts[a.barber_name] = (counts[a.barber_name] || 0) + 1);
           enrichedData = data.map((b: any) => ({
               ...b,
               service_count: counts[b.name] || b.service_count || 0
           }));
      }

      if (enrichedData && enrichedData.length > 0) {
        setBarbers(enrichedData);
        
        // If no barber pre-selected, select the first one
        if (!currentBarber) {
          setCurrentBarber(enrichedData[0]);
        } else {
            // Update current barber with enriched data (e.g. fresh service count)
            const fresh = enrichedData.find(b => b.id === currentBarber.id);
            if (fresh) setCurrentBarber(fresh);
        }
      } else {
        // Fallback mock data
        const mockBarbers: Barber[] = [
          { id: 1, name: 'Marcus K.', title: '美式渐变 / 刻痕', rating: 4.9, image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuASZI54tUmbDSYe5gS24e3PgOMrI9qj3GqCIEsupdXwc_RqEBRxxdeTzuQ3J0BROacciMi8-E7ETF5xeF2c2Uk4cf7YG5pilwN59DTPHgqMFtmR-BKshgwP10w2kJSINs_ypgvRDwU3w6nM3XlqoTe2P00EUzVesNcHEhim30CLfIwvsP3__IjMVSrLxerwxTk_9QTAUp9wDxhQiUOSQBM247evrYwIqH808FQf91hnQpmGCY8fFpkv8bZ_2SuikN86EqZhUYAYaRc', specialties: [], status: 'active', experience: 8, service_count: 1205, bio: 'Marcus 专注于美式复古风格。' },
          { id: 2, name: 'James L.', title: '经典剪裁 / 造型', rating: 4.8, image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD1qwvlDy5vm9u_b33_rfD-P40Tj3GDKG0BNW3yV3q6xsmoWSeF97hNH2lUiW2hPUuOombMFpnxNvcaTI3fvuVnlFjtiUQiAPARwitCM7fkkOmGhqU45Tbfv2ctMYXUcYuJog4zB8RNrPbkTdkcJVWtuV76N-kCOflrxai1WG_Ugv2XKZ674N23ONPrmzVGCM84SUkgpRzXQw-w7-ygvF6JovNcvEb3vxZjcdJvYqoeV8QJiVFDljKvMKL_L7dDIwrIvQXwOquUvYg', specialties: [], status: 'active', experience: 5, service_count: 890, bio: 'James 擅长经典剪裁。' },
        ];
        setBarbers(mockBarbers);
        if (!currentBarber) setCurrentBarber(mockBarbers[0]);
      }
    };
    fetchBarbers();
  }, []);

  // Update if prop changes
  useEffect(() => {
    if (preselectedBarber) {
      setCurrentBarber(preselectedBarber);
    }
  }, [preselectedBarber]);

  // Define fetch booked slots logic as reusable function
  const fetchBookedSlots = useCallback(async () => {
    if (!currentBarber || !selectedDate) return;

    const dateString = `${selectedDate.month}月${selectedDate.date}日`;

    try {
      const { data, error } = await supabase
        .from('app_appointments')
        .select('time_str')
        .eq('barber_name', currentBarber.name)
        .eq('date_str', dateString)
        .in('status', ['confirmed', 'pending']);

      if (error) {
        console.error('Error fetching booked slots:', error);
        return;
      }

      if (data) {
        const slots = data.map((appt: any) => appt.time_str);
        setBookedSlots(slots);
      }
    } catch (err) {
      console.error('System error fetching slots:', err);
    }
  }, [currentBarber, selectedDate]);

  // Initial Fetch & Reset on Change
  useEffect(() => {
    setBookedSlots([]); // Clear immediate on change
    fetchBookedSlots();
  }, [fetchBookedSlots]);

  // Real-time Subscription
  useEffect(() => {
    if (!currentBarber || !selectedDate || !supabase.channel) return;

    const channel = supabase
      .channel('booking_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_appointments' },
        (payload) => {
           // Type cast payload for safety
           const newRecord = payload.new as Appointment;
           const oldRecord = payload.old as Appointment;

           // If the change is relevant to the current barber, refresh slots
           if (
               (newRecord && newRecord.barber_name === currentBarber.name) || 
               (oldRecord && oldRecord.barber_name === currentBarber.name)
           ) {
               fetchBookedSlots();
           }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentBarber, selectedDate, fetchBookedSlots]);

  const handleBookingTrigger = () => {
      if (!currentUser) {
          // Direct navigation without confirm dialog to avoid browser blocking
          onNavigate('login');
          return;
      }
      setShowConfirmModal(true);
  };

  const handleConfirmPay = async () => {
    if (!currentBarber || !selectedService || !selectedDate || !currentUser) return;
    setIsProcessing(true);
    
    const dateString = `${selectedDate.month}月${selectedDate.date}日`;
    const customerName = currentUser.name;

    // 1. Pre-check: Concurrency control to prevent double booking
    const { data: existingAppts } = await supabase
        .from('app_appointments')
        .select('id')
        .eq('barber_name', currentBarber.name)
        .eq('date_str', dateString)
        .eq('time_str', selectedTime)
        .in('status', ['confirmed', 'pending']);

    if (existingAppts && existingAppts.length > 0) {
        alert('非常抱歉，该时段刚刚被其他用户抢先预订。请选择其他时间。');
        setIsProcessing(false);
        setShowConfirmModal(false);
        fetchBookedSlots(); // Refresh UI to reflect the taken slot
        return;
    }

    // 2. Create Appointment Object
    const newAppointment: Appointment = {
        customer_name: customerName,
        barber_name: currentBarber.name,
        service_name: selectedService.name,
        date_str: dateString,
        time_str: selectedTime,
        price: selectedService.price,
        status: 'confirmed'
    };

    try {
        // IMPORTANT: Use .select().single() to get the inserted record WITH ID
        const { data, error } = await supabase
            .from('app_appointments')
            .insert(newAppointment)
            .select()
            .single();

        if (error) {
            console.error("Booking Error:", error);
            alert("预约失败，请稍后重试");
            setIsProcessing(false);
            return;
        }
        
        // Log action
        await supabase.from('app_logs').insert({
            user: customerName,
            role: '顾客',
            action: '创建预约',
            details: `预约了 ${currentBarber.name} (${selectedService.name}) @ ${selectedDate.month}月${selectedDate.date}日 ${selectedTime}`,
            type: 'info',
            avatar: currentUser.avatar || ''
        });

        // Success flow
        setTimeout(() => {
          setIsProcessing(false);
          setShowConfirmModal(false);
          if (onBookingSuccess) {
              // Pass the full record including generated ID
              onBookingSuccess(data ? (data as Appointment) : newAppointment);
          } else {
              onNavigate('check_in');
          }
        }, 1500);

    } catch (e) {
        console.error("System Error", e);
        setIsProcessing(false);
    }
  };

  if (!currentBarber) {
    return (
        <Layout className="bg-white">
            <div className="flex flex-col items-center justify-center h-screen text-slate-400 gap-2">
                <span className="material-symbols-outlined text-4xl animate-pulse">content_cut</span>
                <span className="text-xs font-medium">加载预约信息...</span>
            </div>
        </Layout>
    );
  }

  return (
    <Layout className="bg-gray-50/50">
      <Header 
        title="预约服务"
        className="bg-white"
        left={
          <button onClick={() => onNavigate('home')} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-50 transition-colors">
            <span className="material-symbols-outlined text-slate-800">arrow_back_ios_new</span>
          </button>
        }
      />

      <main className="flex-1 overflow-y-auto pb-48">
        {/* Barber Selection Carousel */}
        <section className="bg-white pt-2 pb-6 px-6 border-b border-dashed border-gray-100">
          <div className="flex justify-between items-center mb-4">
             <h3 className="font-bold text-[15px] text-slate-900">选择理发师</h3>
             <span className="text-[11px] font-medium text-slate-400">向左滑动查看更多</span>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar -mx-6 px-6 snap-x">
             {barbers.map(barber => {
                 const isSelected = currentBarber.id === barber.id;
                 return (
                     <div 
                        key={barber.id} 
                        onClick={() => setCurrentBarber(barber)}
                        className={`snap-center flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer transition-all duration-300 ${isSelected ? 'scale-100 opacity-100' : 'opacity-50 scale-90'}`}
                     >
                         <div className={`relative w-[72px] h-[72px] rounded-[24px] p-0.5 transition-all ${isSelected ? 'bg-gradient-to-tr from-primary to-cyan-400 shadow-lg shadow-blue-200' : 'bg-transparent'}`}>
                             <img src={barber.image} className="w-full h-full rounded-[22px] object-cover border-2 border-white" alt={barber.name} />
                             {isSelected && (
                                 <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                                     <span className="material-symbols-outlined text-primary text-[14px] bg-blue-50 rounded-full p-0.5">check</span>
                                 </div>
                             )}
                         </div>
                         <div className="text-center">
                             <p className={`text-xs ${isSelected ? 'font-bold text-slate-900' : 'font-medium text-slate-500'}`}>{barber.name}</p>
                             {isSelected && <div className="w-1 h-1 bg-primary rounded-full mx-auto mt-1 animate-scale-in"></div>}
                         </div>
                     </div>
                 )
             })}
          </div>

          {/* Selected Barber Info Card */}
          <div className="mt-2 bg-slate-50 rounded-2xl p-4 flex items-center justify-between border border-slate-100 animate-fade-in">
              <div>
                  <div className="flex items-center gap-2">
                      <h2 className="font-bold text-slate-900">{currentBarber.name}</h2>
                      <span className="text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 text-slate-500 rounded font-medium">{currentBarber.title || '理发师'}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                      <span className="material-symbols-outlined text-amber-400 text-[14px] fill-1">star</span>
                      <span className="text-xs font-bold text-slate-700">{currentBarber.rating}</span>
                      <span className="text-[10px] text-slate-400"> · 擅长: {currentBarber.specialties?.[0] || '综合造型'}</span>
                  </div>
              </div>
              <button 
                onClick={() => setShowBarberDetailModal(true)}
                className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 active:bg-slate-50 transition-colors"
              >
                  <span className="material-symbols-outlined text-lg">info</span>
              </button>
          </div>
        </section>

        {/* Service Selection */}
        <section className="mt-6 px-6">
            <h3 className="font-bold text-[15px] text-slate-900 mb-4">选择服务项目</h3>
            {services.length === 0 ? (
                <div className="p-4 text-center bg-white rounded-xl">
                    <span className="text-xs text-slate-400">加载套餐中...</span>
                </div>
            ) : (
                <div className="space-y-3">
                    {services.map(service => {
                        const isSelected = selectedService?.id === service.id;
                        return (
                            <div 
                                key={service.id}
                                onClick={() => setSelectedService(service)}
                                className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer active:scale-[0.99]
                                    ${isSelected ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-white text-slate-700 border-slate-100 hover:border-slate-200'}
                                `}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSelected ? 'bg-white/20' : 'bg-slate-50 text-slate-500'}`}>
                                        <span className="material-symbols-outlined">{service.icon}</span>
                                    </div>
                                    <div>
                                        <p className={`font-bold text-[15px] ${isSelected ? 'text-white' : 'text-slate-900'}`}>{service.name}</p>
                                        <p className={`text-xs ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>预计 {service.duration} 分钟</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-lg">¥{service.price}</p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </section>

        {/* Date Selector */}
        <section className="mt-8">
          <div className="px-6 mb-4 flex justify-between items-center">
            <h3 className="font-bold text-[15px] text-slate-900">预约日期</h3>
            <span className="text-slate-400 text-xs font-medium bg-white px-2 py-1 rounded-lg border border-slate-100">
                {selectedDate ? `${selectedDate.month}月${selectedDate.date}日` : '选择日期'}
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto px-6 hide-scrollbar pb-2">
            {dates.map((d) => {
              const isActive = selectedDate?.date === d.date;
              return (
                <button
                  key={d.date}
                  onClick={() => setSelectedDate(d)}
                  className={`flex flex-col items-center justify-center min-w-[62px] h-[80px] rounded-[22px] transition-all
                    ${isActive ? 'bg-slate-900 text-white shadow-lg scale-105' : 'bg-white border border-slate-100 text-slate-400 active:bg-slate-50'}
                  `}
                >
                  <span className={`text-[10px] font-medium mb-1 ${isActive ? 'opacity-60' : ''}`}>{d.day}</span>
                  <span className={`text-[18px] font-bold ${isActive ? 'text-white' : 'text-slate-800'}`}>{d.date}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Time Slots */}
        <section className="mt-4 px-6 pb-6">
            <h3 className="font-bold text-[15px] text-slate-900 mb-4">选择时间</h3>
            {timeSlots.length > 0 ? (
                <div className="grid grid-cols-4 gap-3">
                {timeSlots.map(time => {
                    const isSelected = selectedTime === time;
                    const isBusy = bookedSlots.includes(time); // Check against real booked slots
                    
                    // Logic to check if past
                    let isPast = false;
                    if (selectedDate) {
                        const now = new Date();
                        const [hours, minutes] = time.split(':').map(Number);
                        // Ensure we use the date from selectedDate but time from the slot
                        const slotDate = new Date(selectedDate.fullDate);
                        slotDate.setHours(hours, minutes, 0, 0);
                        
                        if (slotDate < now) {
                            isPast = true;
                        }
                    }
                    
                    const isDisabled = isBusy || isPast;

                    return (
                    <button
                        key={time}
                        disabled={isDisabled}
                        onClick={() => !isDisabled && setSelectedTime(time)}
                        className={`py-3 rounded-xl text-sm font-bold transition-all border relative overflow-hidden flex flex-col items-center justify-center gap-0.5
                        ${isDisabled ? 'bg-slate-50 text-slate-300 border-transparent cursor-not-allowed opacity-60' : 
                            isSelected ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 
                            'bg-white text-slate-600 border-slate-200 hover:border-slate-300 active:bg-slate-50'}
                        `}
                    >
                        <span>{time}</span>
                        {isBusy && <span className="text-[9px] font-normal scale-90">已约</span>}
                        {isPast && !isBusy && <span className="text-[9px] font-normal scale-90">过期</span>}
                        {isBusy && <div className="absolute inset-0 flex items-center justify-center bg-white/10"><div className="w-8 h-[1px] bg-slate-300/50 rotate-45"></div></div>}
                    </button>
                    )
                })}
                </div>
            ) : (
                <div className="text-center py-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-slate-400 text-xs">暂无可预约时间</p>
                </div>
            )}
        </section>
      </main>

      {/* Confirmation Bar */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 ios-blur border-t border-slate-100 px-6 pt-4 pb-8 z-50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">总价预估</span>
              <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-slate-900">¥{selectedService?.price || 0}</span>
                  <span className="text-xs text-slate-500 font-medium">.00</span>
              </div>
          </div>
          <div className="text-right">
             <p className="text-[11px] font-bold text-slate-500">{currentBarber.name}</p>
             <p className="text-xs font-bold text-slate-900">{selectedService?.name}</p>
          </div>
        </div>
        <button 
          onClick={handleBookingTrigger}
          disabled={!selectedService}
          className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-primary/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
        >
          {currentUser ? (
              <>
                 <span>确认支付并预约</span>
                 <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </>
          ) : (
              <>
                 <span>登录后预约</span>
                 <span className="material-symbols-outlined text-sm">login</span>
              </>
          )}
        </button>
      </div>

      {/* Confirm Modal */}
      {showConfirmModal && selectedService && selectedDate && currentUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
           <div 
             className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
             onClick={() => !isProcessing && setShowConfirmModal(false)}
           ></div>
           
           <div className="relative bg-white w-full max-w-xs rounded-[32px] p-6 shadow-2xl transform transition-all animate-[scale-in_0.2s_ease-out]">
               <h2 className="text-xl font-bold text-slate-900 mb-6 text-center">支付确认</h2>
               
               <div className="space-y-4 mb-6">
                  <div className="bg-slate-50 p-4 rounded-2xl space-y-3 border border-slate-100">
                    <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-xs font-bold">理发师</span>
                        <div className="flex items-center gap-2">
                           <img src={currentBarber.image} className="w-5 h-5 rounded-full object-cover"/>
                           <span className="text-slate-900 font-bold text-sm">{currentBarber.name}</span>
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-xs font-bold">服务项目</span>
                        <span className="text-slate-900 font-bold text-sm">{selectedService.name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-xs font-bold">预约时间</span>
                        <span className="text-slate-900 font-bold text-sm">{selectedDate.month}月{selectedDate.date}日 {selectedTime}</span>
                    </div>
                    <div className="border-t border-dashed border-slate-200 pt-3 flex justify-between items-center">
                        <span className="text-slate-900 font-bold text-sm">支付总额</span>
                        <span className="text-primary text-xl font-bold">¥{selectedService.price}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-center text-slate-400">请仔细核对以上信息，确认无误后进行支付</p>
               </div>

               <div className="flex flex-col gap-3">
                 <button 
                    onClick={handleConfirmPay}
                    disabled={isProcessing}
                    className="w-full bg-primary text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-70 disabled:active:scale-100"
                 >
                    {isProcessing ? (
                       <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    ) : (
                       <>
                          <span className="material-symbols-outlined text-[20px]">check_circle</span>
                          <span>确认支付</span>
                       </>
                    )}
                 </button>
                 <button 
                    onClick={() => setShowConfirmModal(false)}
                    disabled={isProcessing}
                    className="w-full bg-slate-100 text-slate-600 font-bold py-3.5 rounded-2xl hover:bg-slate-200 transition-colors disabled:opacity-50"
                 >
                    取消
                 </button>
               </div>
           </div>
        </div>
      )}

      {/* Barber Detail Modal */}
      {showBarberDetailModal && currentBarber && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div 
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={() => setShowBarberDetailModal(false)}
            ></div>
            <div className="relative bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl animate-[scale-in_0.2s_ease-out]">
                <button 
                    onClick={() => setShowBarberDetailModal(false)}
                    className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-slate-50 rounded-full text-slate-400 hover:bg-slate-100 transition-colors"
                >
                    <span className="material-symbols-outlined text-lg">close</span>
                </button>

                <div className="flex flex-col items-center mt-2">
                    <div className="relative mb-4">
                        <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-primary to-cyan-400 shadow-lg shadow-blue-200">
                            <img 
                                src={currentBarber.image} 
                                alt={currentBarber.name}
                                className="w-full h-full rounded-full object-cover border-2 border-white"
                            />
                        </div>
                        <div className={`absolute bottom-1 right-1 w-6 h-6 border-4 border-white rounded-full flex items-center justify-center
                            ${currentBarber.status === 'active' ? 'bg-status-ready' : currentBarber.status === 'busy' ? 'bg-amber-400' : 'bg-slate-400'}
                        `}>
                            {currentBarber.status === 'active' && <span className="material-symbols-outlined text-[10px] text-white font-bold">check</span>}
                        </div>
                    </div>
                    
                    <h2 className="text-xl font-bold text-slate-900">{currentBarber.name}</h2>
                    <p className="text-sm font-medium text-slate-500 mb-6">{currentBarber.title || '专业理发师'}</p>

                    <div className="grid grid-cols-3 gap-3 w-full mb-6">
                        <div className="bg-slate-50 rounded-2xl p-3 text-center border border-slate-100">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">评分</p>
                            <div className="flex items-center justify-center gap-0.5">
                                <span className="text-lg font-bold text-slate-900">{currentBarber.rating}</span>
                                <span className="material-symbols-outlined text-amber-400 text-[12px] fill-1">star</span>
                            </div>
                        </div>
                        <div className="bg-slate-50 rounded-2xl p-3 text-center border border-slate-100">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">经验</p>
                            <p className="text-lg font-bold text-slate-900">{currentBarber.experience || 1}<span className="text-xs font-medium text-slate-400 ml-0.5">年</span></p>
                        </div>
                        <div className="bg-slate-50 rounded-2xl p-3 text-center border border-slate-100">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">服务</p>
                            <p className="text-lg font-bold text-slate-900">{currentBarber.service_count || 0}<span className="text-xs font-medium text-slate-400 ml-0.5">+</span></p>
                        </div>
                    </div>

                    <div className="w-full mb-6">
                        <h3 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-1">
                            <span className="material-symbols-outlined text-primary text-sm">stars</span>
                            擅长领域
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {currentBarber.specialties && currentBarber.specialties.length > 0 ? (
                                currentBarber.specialties.map((tag, i) => (
                                    <span key={i} className="px-3 py-1.5 bg-blue-50 text-primary text-xs font-bold rounded-lg border border-blue-100">
                                        {tag}
                                    </span>
                                ))
                            ) : (
                                <span className="text-xs text-slate-400">暂无标签</span>
                            )}
                        </div>
                    </div>
                    
                    <div className="w-full bg-slate-50 rounded-2xl p-4 border border-slate-100 text-left">
                        <p className="text-xs text-slate-500 leading-relaxed">
                            {currentBarber.bio || `${currentBarber.name} 是一位经验丰富的发型设计师，致力于根据每位顾客的脸型和气质打造独特的个人风格。`}
                        </p>
                    </div>

                    <button 
                        onClick={() => setShowBarberDetailModal(false)}
                        className="w-full mt-6 bg-slate-900 text-white font-bold py-3.5 rounded-2xl shadow-lg active:scale-95 transition-all"
                    >
                        选择该理发师
                    </button>
                </div>
            </div>
        </div>
      )}
    </Layout>
  );
};