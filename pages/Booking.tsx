
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [systemConfig, setSystemConfig] = useState({ openTime: "10:00", closeTime: "21:00", serviceDuration: 45 });

  // 初始化日期选项
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

  // 加载系统配置和服务项目
  useEffect(() => {
    const loadStaticData = async () => {
        const { data: config } = await supabase.from('app_settings').select('value').eq('key', 'global_config').single();
        if (config?.value) setSystemConfig(prev => ({ ...prev, ...config.value }));
        const { data: svcs } = await supabase.from('app_services').select('*').order('price', { ascending: true });
        if (svcs) { 
            setServices(svcs); 
            // 默认选中第一个服务
            if (!selectedService) setSelectedService(svcs[0]); 
        }
    };
    loadStaticData();
  }, []);

  // 加载在线理发师
  useEffect(() => {
    const fetchBarbers = async () => {
      const { data } = await supabase.from('app_barbers').select('*').eq('status', 'active').order('rating', { ascending: false });
      if (data) {
          const mapped = data as unknown as Barber[];
          setBarbers(mapped);
          if (!currentBarber && mapped.length > 0) setCurrentBarber(mapped[0]);
      }
    };
    fetchBarbers();
  }, []);

  // 获取已被占用的时段
  const fetchBookedSlots = useCallback(async () => {
    if (!currentBarber || !selectedDate) return;
    const dateString = `${selectedDate.month}月${selectedDate.date}日`;
    const { data } = await supabase.from('app_appointments')
        .select('time_str')
        .eq('barber_name', currentBarber.name)
        .eq('date_str', dateString)
        .in('status', ['confirmed', 'pending', 'checked_in']);
    if (data) setBookedSlots(data.map((appt: any) => appt.time_str));
  }, [currentBarber, selectedDate]);

  useEffect(() => { fetchBookedSlots(); }, [fetchBookedSlots]);

  // 生成时间段网格
  const timeSlots = useMemo(() => {
      const slots: string[] = [];
      let current = new Date(`2000-01-01T${systemConfig.openTime}`);
      const end = new Date(`2000-01-01T${systemConfig.closeTime}`);
      while (current < end) {
          slots.push(current.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
          current.setMinutes(current.getMinutes() + systemConfig.serviceDuration);
      }
      return slots;
  }, [systemConfig]);

  // 校验时间是否已过期（针对当天）
  const isSlotPast = useCallback((time: string) => {
      if (!selectedDate || selectedDate.day !== '今天') return false;
      const now = new Date();
      const currentH = now.getHours();
      const currentM = now.getMinutes();
      const [slotH, slotM] = time.split(':').map(Number);
      
      if (slotH < currentH) return true;
      if (slotH === currentH && slotM <= currentM) return true;
      return false;
  }, [selectedDate]);

  const handleConfirmPay = async () => {
    if (!currentBarber || !selectedService || !selectedDate || !currentUser || !selectedTime) return;
    setIsProcessing(true);
    const dateString = `${selectedDate.month}月${selectedDate.date}日`;
    const newAppointment: Appointment = {
        customer_name: currentUser.name,
        barber_name: currentBarber.name,
        service_name: selectedService.name,
        date_str: dateString,
        time_str: selectedTime,
        price: selectedService.price,
        status: 'confirmed'
    };
    try {
        const { data, error } = await supabase.from('app_appointments').insert(newAppointment).select().single();
        if (error) throw error;
        
        await supabase.from('app_logs').insert({
            user: currentUser.name,
            role: 'customer',
            action: '完成预约',
            details: `成功预约 ${currentBarber.name} - ${dateString} ${selectedTime}`,
            type: 'info'
        });

        setTimeout(() => { 
            setIsProcessing(false); 
            setShowConfirmModal(false); 
            onBookingSuccess ? onBookingSuccess(data as Appointment) : onNavigate('check_in'); 
        }, 800);
    } catch (e) { 
        setIsProcessing(false); 
        alert("系统繁忙，请稍后再试"); 
    }
  };

  const isFormValid = !!(currentBarber && selectedService && selectedDate && selectedTime);

  if (!currentBarber) {
      return (
          <Layout className="bg-white flex items-center justify-center">
              <div className="text-center">
                  <div className="w-12 h-12 border-4 border-slate-100 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">加载服务配置...</p>
              </div>
          </Layout>
      );
  }

  return (
    <Layout className="bg-[#F8FAFC]">
      <Header 
        title="席位预约"
        className="bg-white/95 ios-blur"
        left={<button onClick={() => onNavigate('home')} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-800 active:scale-90 transition-all"><span className="material-symbols-outlined text-xl">arrow_back</span></button>}
      />

      <main className="flex-1 overflow-y-auto pb-40 px-6 no-scrollbar pt-2 space-y-6">
        {/* Barber Section */}
        <section>
          <div className="flex flex-col mb-3 px-1">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">甄选理发师</h3>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar -mx-6 px-6 snap-x">
             {barbers.map(barber => {
                 const isSelected = currentBarber.id === barber.id;
                 return (
                     <div key={barber.id} onClick={() => { setCurrentBarber(barber); setSelectedTime(''); }} className={`snap-center flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer transition-all duration-300 ${isSelected ? 'scale-105' : 'opacity-40 scale-90'}`}>
                         <div className={`relative w-12 h-12 rounded-2xl p-0.5 transition-all duration-300 ${isSelected ? 'bg-primary shadow-lg shadow-blue-100' : 'bg-transparent'}`}>
                             <img src={barber.image} className="w-full h-full rounded-[14px] object-cover border border-white" alt={barber.name} />
                         </div>
                         <p className={`text-[10px] tracking-tight ${isSelected ? 'font-black text-slate-900' : 'font-bold text-slate-500'}`}>{barber.name}</p>
                     </div>
                 )
             })}
          </div>
        </section>

        {/* Services Section */}
        <section>
            <div className="px-1 mb-3 flex justify-between items-end">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">服务套餐</h3>
                {selectedService && <span className="text-[9px] font-black text-primary bg-blue-50 px-2 py-0.5 rounded-md">¥{selectedService.price}</span>}
            </div>
            <div className="grid grid-cols-2 gap-3">
                {services.map(service => {
                    const isSelected = selectedService?.id === service.id;
                    return (
                        <div key={service.id} onClick={() => setSelectedService(service)} className={`p-3 rounded-2xl border transition-all duration-300 cursor-pointer active:scale-95 flex items-center gap-3 ${isSelected ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-700 border-slate-100'}`}>
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isSelected ? 'bg-white/10' : 'bg-slate-50'}`}>
                                <span className={`material-symbols-outlined text-lg ${isSelected ? 'text-blue-300' : 'text-slate-400'}`}>{service.icon}</span>
                            </div>
                            <div>
                                <p className={`font-black text-[12px] tracking-tight leading-none ${isSelected ? 'text-white' : 'text-slate-900'}`}>{service.name}</p>
                                <p className={`text-[9px] font-bold mt-1 ${isSelected ? 'text-white/40' : 'text-slate-300'}`}>{service.duration}m</p>
                            </div>
                        </div>
                    )
                })}
            </div>
        </section>

        {/* Date Section */}
        <section>
          <div className="flex justify-between items-end mb-3 px-1">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">预约日期</h3>
              <span className="text-[9px] font-black text-slate-300 uppercase">{selectedDate?.month}/{selectedDate?.date}</span>
          </div>
          <div className="flex gap-2.5 overflow-x-auto px-1 hide-scrollbar pb-2">
            {dates.map((d) => {
              const isActive = selectedDate?.date === d.date;
              return (
                <button key={d.date} onClick={() => { setSelectedDate(d); setSelectedTime(''); }} className={`flex flex-col items-center justify-center min-w-[50px] h-14 rounded-xl transition-all duration-300 ${isActive ? 'bg-primary text-white shadow-lg' : 'bg-white border border-slate-100 text-slate-300'}`}>
                  <span className={`text-[7px] font-black mb-1 uppercase tracking-tighter ${isActive ? 'opacity-70' : ''}`}>{d.day}</span>
                  <span className={`text-sm font-black font-mono leading-none ${isActive ? 'text-white' : 'text-slate-900'}`}>{d.date}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Time Section - Grid 4 Columns */}
        <section className="pb-8">
            <div className="px-1 mb-3">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">预约时段</h3>
            </div>
            <div className="grid grid-cols-4 gap-2.5">
            {timeSlots.map(time => {
                const isSelected = selectedTime === time;
                const isOccupied = bookedSlots.includes(time); 
                const isExpired = isSlotPast(time);
                const isDisabled = isOccupied || isExpired;

                return (
                <button 
                    key={time} 
                    disabled={isDisabled} 
                    onClick={() => setSelectedTime(time)} 
                    className={`h-10 rounded-xl text-[11px] font-black font-mono transition-all border relative
                    ${isDisabled ? 'bg-slate-50 text-slate-200 border-transparent cursor-not-allowed' : 
                      isSelected ? 'bg-slate-900 text-white border-slate-900 shadow-md scale-105 z-10' : 
                      'bg-white text-slate-700 border-slate-100 active:scale-95'}`}
                >
                    {time}
                    {isOccupied && <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-400 rounded-full border-2 border-white"></div>}
                </button>
                )
            })}
            </div>
            <div className="mt-4 flex gap-4 px-1">
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-slate-50 border border-slate-100"></div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">可选</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-slate-900"></div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">选中</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-slate-50 border border-slate-100 relative">
                        <div className="absolute inset-0 bg-red-400 rounded-full scale-50"></div>
                    </div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">已约满</span>
                </div>
            </div>
        </section>
      </main>

      {/* Floating Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 px-6 pb-10 pointer-events-none">
        <div className="bg-white/95 ios-blur rounded-[28px] p-3 shadow-2xl border border-white flex items-center justify-between gap-4 pointer-events-auto">
          <div className="pl-3">
              <p className="text-[8px] text-slate-400 uppercase font-black mb-0.5 tracking-widest">预估总额</p>
              <p className="text-xl font-black font-mono text-slate-900 leading-none">¥{selectedService?.price || 0}</p>
          </div>
          <button 
            onClick={() => { if(currentUser) setShowConfirmModal(true); else onNavigate('login'); }} 
            disabled={!isFormValid || isProcessing} 
            className="flex-1 h-12 bg-primary text-white font-black rounded-2xl shadow-lg active:scale-95 transition-all disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none flex items-center justify-center gap-2"
          >
             <span className="text-sm tracking-widest">{isProcessing ? '请求中...' : '确认预约'}</span>
             {!isProcessing && <span className="material-symbols-outlined text-lg">arrow_forward</span>}
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmModal && selectedService && selectedDate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
           <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm animate-fade-in" onClick={() => !isProcessing && setShowConfirmModal(false)}></div>
           <div className="relative bg-white w-full max-w-xs rounded-[32px] p-8 shadow-2xl animate-[scale-in_0.3s_cubic-bezier(0.16,1,0.3,1)]">
               <div className="text-center mb-6">
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">确认预约信息</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Ticket Verification</p>
               </div>
               <div className="bg-slate-50 rounded-2xl p-5 mb-6 space-y-3 border border-slate-100 shadow-inner">
                    <div className="flex justify-between items-center"><span className="text-slate-400 text-[10px] font-black uppercase">理发师</span><span className="text-slate-900 font-black text-sm">{currentBarber.name}</span></div>
                    <div className="flex justify-between items-center"><span className="text-slate-400 text-[10px] font-black uppercase">服务项目</span><span className="text-slate-900 font-black text-sm">{selectedService.name}</span></div>
                    <div className="flex justify-between items-center"><span className="text-slate-400 text-[10px] font-black uppercase">预约时间</span><span className="text-slate-900 font-black text-sm font-mono">{selectedDate.month}/{selectedDate.date} {selectedTime}</span></div>
                    <div className="pt-3 border-t border-slate-200 flex justify-between items-center"><span className="text-slate-900 font-black text-xs">实付金额</span><span className="text-primary text-xl font-black font-mono">¥{selectedService.price}</span></div>
               </div>
               <div className="flex flex-col gap-2">
                   <button onClick={handleConfirmPay} disabled={isProcessing} className="w-full bg-primary text-white font-black py-4 rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70">
                     {isProcessing ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : "确认并提交"}
                   </button>
                   <button onClick={() => setShowConfirmModal(false)} disabled={isProcessing} className="w-full py-3 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-slate-600 transition-colors">
                     返回修改
                   </button>
               </div>
           </div>
        </div>
      )}
    </Layout>
  );
};
