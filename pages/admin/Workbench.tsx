
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Layout } from '../../components/Layout';
import { BottomNav } from '../../components/BottomNav';
import { PageRoute, User, Appointment } from '../../types';
import { supabase } from '../../services/supabase';

interface Props {
  onNavigate: (route: PageRoute) => void;
  currentUser?: User | null;
}

interface DaySaturation {
    dayName: string;
    dateStr: string;
    fullDate: Date;
    count: number;
    percentage: number;
    status: 'low' | 'medium' | 'high' | 'full';
}

export const Workbench: React.FC<Props> = ({ onNavigate, currentUser }) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'saturation'>('queue');
  const [isScanning, setIsScanning] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const [workbenchMode, setWorkbenchMode] = useState<'active' | 'completed'>('active');
  const [showToast, setShowToast] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customerAvatars, setCustomerAvatars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);

  const [config, setConfig] = useState({
      openTime: "10:00",
      closeTime: "22:00",
      serviceDuration: 45
  });

  const fetchConfig = useCallback(async () => {
    try {
        const { data } = await supabase.from('app_settings').select('value').eq('key', 'global_config').single();
        if (data?.value) setConfig(prev => ({ ...prev, ...data.value }));
    } catch (e) { console.error(e); }
  }, []);

  const fetchAppointments = useCallback(async () => {
      if (!currentUser || currentUser.role !== 'barber') return;
      setLoading(true);
      try {
          const { data } = await supabase
            .from('app_appointments')
            .select('*')
            .eq('barber_name', currentUser.name)
            .in('status', ['confirmed', 'pending', 'checked_in'])
            .order('time_str', { ascending: true });

          if (data) {
            setAppointments(data as Appointment[]);
            const customerNames = Array.from(new Set(data.map((a: any) => a.customer_name)));
            if (customerNames.length > 0) {
                const { data: userData } = await supabase.from('app_customers').select('name, avatar').in('name', customerNames);
                if (userData) {
                    const avatarMap: Record<string, string> = {};
                    userData.forEach((u: any) => { if (u.avatar) avatarMap[u.name] = u.avatar; });
                    setCustomerAvatars(avatarMap);
                }
            }
          } else { setAppointments([]); }
      } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [currentUser]);

  useEffect(() => {
    fetchConfig();
    fetchAppointments();
    const channel = supabase.channel('workbench_updates').on('postgres_changes', { event: '*', schema: 'public', table: 'app_appointments' }, () => { fetchAppointments(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAppointments, fetchConfig]);

  const currentServiceAppt = useMemo(() => appointments.find(a => a.status === 'checked_in'), [appointments]);

  const saturationData = useMemo(() => {
    const days: DaySaturation[] = [];
    const today = new Date();
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    
    const [openH, openM] = config.openTime.split(':').map(Number);
    const [closeH, closeM] = config.closeTime.split(':').map(Number);
    const totalMinutes = (closeH * 60 + closeM) - (openH * 60 + openM);
    const slotsPerDay = Math.max(1, Math.floor(totalMinutes / config.serviceDuration));

    for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const dateStr = `${d.getMonth() + 1}月${d.getDate()}日`;
        const count = appointments.filter(a => a.date_str === dateStr).length;
        const percentage = Math.min(100, Math.round((count / slotsPerDay) * 100));
        
        let status: 'low' | 'medium' | 'high' | 'full' = 'low';
        if (percentage >= 100) status = 'full';
        else if (percentage >= 80) status = 'high';
        else if (percentage >= 40) status = 'medium';

        days.push({
            dayName: i === 0 ? '今天' : i === 1 ? '明天' : dayNames[d.getDay()],
            dateStr,
            fullDate: d,
            count,
            percentage,
            status
        });
    }
    return days;
  }, [appointments, config]);

  const handleCompleteService = async () => {
    if (!currentServiceAppt || !currentUser) return;
    if(!window.confirm(`确认完成顾客 ${currentServiceAppt.customer_name} 的服务吗？`)) return;
    
    setIsCompleting(true);
    try {
        const { data: customerData } = await supabase.from('app_customers').select('id, vouchers').eq('name', currentServiceAppt.customer_name).single();

        let usedVoucher = false;
        if (customerData && customerData.vouchers > 0) {
            await supabase.from('app_customers').update({ vouchers: customerData.vouchers - 1 }).eq('id', customerData.id);
            usedVoucher = true;
            const { data: barberData } = await supabase.from('app_barbers').select('voucher_revenue').eq('name', currentUser.name).single();
            await supabase.from('app_barbers').update({ voucher_revenue: (barberData?.voucher_revenue || 0) + 1 }).eq('name', currentUser.name);
        }

        await supabase.from('app_appointments').update({ status: 'completed', used_voucher: usedVoucher }).eq('id', currentServiceAppt.id);
        
        await supabase.from('app_logs').insert({
            user: currentUser?.name || 'Barber',
            role: '理发师',
            action: '完成服务',
            details: `完成了顾客 ${currentServiceAppt.customer_name} 的服务 (单号: #${currentServiceAppt.id})${usedVoucher ? ' [理发券已扣除]' : ''}`,
            type: 'info'
        });
        
        await fetchAppointments();
        setWorkbenchMode('completed');
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
    } catch (e: any) { alert("操作失败"); } finally { setIsCompleting(false); }
  };

  const handleCallNext = () => { setWorkbenchMode('active'); fetchAppointments(); };

  const handleScanSubmit = async () => {
      if (!scanInput) return;
      setIsProcessingScan(true);
      const apptId = scanInput.replace('appt:', '');
      try {
          const { error } = await supabase.from('app_appointments').update({ status: 'checked_in' }).eq('id', apptId);
          if (error) throw error;
          setShowToast(true);
          setTimeout(() => setShowToast(false), 3000);
          setIsScanning(false);
          setScanInput('');
          await fetchAppointments();
      } catch (e: any) { alert("扫码失败"); } finally { setIsProcessingScan(false); }
  };

  if (!currentUser) return null;

  return (
    <Layout className="bg-slate-50 relative">
      <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[70] transition-all duration-300 ${showToast ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0'}`}>
        <div className="bg-slate-900 text-white px-4 py-2 rounded-full shadow-lg text-sm font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-green-400 text-lg">check_circle</span>
            操作成功
        </div>
      </div>

      <header className="pt-14 pb-6 px-6 flex justify-between items-center bg-white/80 ios-blur sticky top-0 z-30 border-b border-slate-100">
        <div>
          <p className="text-[10px] text-primary font-bold tracking-widest uppercase">Barber Station</p>
          <h1 className="text-xl font-black text-slate-900">{currentUser.name}</h1>
        </div>
        <div className="w-10 h-10 rounded-full border-2 border-white shadow-sm overflow-hidden ring-1 ring-slate-100">
          <img className="w-full h-full object-cover" src={currentUser.avatar} alt="Avatar"/>
        </div>
      </header>

      <main className="flex-1 px-5 pb-32 space-y-6 pt-6 overflow-y-auto no-scrollbar">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setIsScanning(true)} className="flex items-center justify-center gap-2 bg-slate-900 text-white font-black py-3 px-4 rounded-xl active:scale-95 transition-all shadow-lg">
            <span className="material-symbols-outlined text-xl">qr_code_scanner</span>
            <span className="text-sm">扫码签到</span>
          </button>
          <div className="flex bg-slate-200/50 p-1 rounded-xl">
            <button onClick={() => setActiveTab('queue')} className={`flex-1 text-[11px] font-black py-2 rounded-lg transition-all ${activeTab === 'queue' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>今日队列</button>
            <button onClick={() => setActiveTab('saturation')} className={`flex-1 text-[11px] font-black py-2 rounded-lg transition-all ${activeTab === 'saturation' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>周饱和度</button>
          </div>
        </div>

        {activeTab === 'queue' ? (
            <div className="space-y-6">
                <section>
                    <h2 className="text-[10px] font-black uppercase text-slate-400 mb-3 px-1 tracking-widest flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${currentServiceAppt ? 'bg-primary animate-pulse' : 'bg-slate-300'}`}></span>
                        正在服务
                    </h2>
                    {workbenchMode === 'active' ? (
                        currentServiceAppt ? (
                            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm relative overflow-hidden animate-fade-in group">
                                <div className="absolute top-0 right-0 p-4 opacity-5"><span className="material-symbols-outlined text-9xl">face</span></div>
                                <div className="flex gap-4 items-center mb-6 relative z-10">
                                    <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-sm bg-slate-100 border border-slate-50">
                                       <img src={customerAvatars[currentServiceAppt.customer_name] || `https://ui-avatars.com/api/?name=${currentServiceAppt.customer_name}&background=random`} className="w-full h-full object-cover"/>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-lg font-bold text-slate-900">{currentServiceAppt.customer_name}</h3>
                                            <span className="px-1.5 py-0.5 bg-slate-900 text-white text-[9px] font-mono font-bold rounded">#{currentServiceAppt.id}</span>
                                        </div>
                                        <p className="text-xs text-primary font-bold uppercase tracking-wider mt-1">{currentServiceAppt.service_name}</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between border-t border-slate-50 pt-6">
                                    <span className="text-2xl font-mono font-black text-slate-900">¥{currentServiceAppt.price}</span>
                                    <button onClick={handleCompleteService} disabled={isCompleting} className="bg-primary text-white text-xs font-black px-8 py-3.5 rounded-2xl active:scale-95 transition-all shadow-xl shadow-blue-100 flex items-center justify-center gap-2">
                                        {isCompleting ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : "完成并结算"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white/40 rounded-3xl p-10 border border-dashed border-slate-200 text-center flex flex-col items-center justify-center">
                                <span className="material-symbols-outlined text-slate-300 text-4xl mb-3">chair</span>
                                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">当前暂无正在服务的顾客</p>
                            </div>
                        )
                    ) : (
                        <div className="bg-green-50 rounded-3xl p-10 border border-green-100 text-center flex flex-col items-center justify-center animate-fade-in">
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-green-500 mb-4 shadow-sm border border-green-100"><span className="material-symbols-outlined text-3xl">check</span></div>
                            <h3 className="text-lg font-bold text-green-900">服务已结束</h3>
                            <button onClick={handleCallNext} className="mt-6 w-full bg-slate-900 text-white font-black py-4 rounded-2xl shadow-xl active:scale-95 transition-all">下一位</button>
                        </div>
                    )}
                </section>

                <section>
                    <h2 className="text-[10px] font-black uppercase text-slate-400 mb-3 px-1 tracking-widest">待服务序列 ({appointments.length})</h2>
                    <div className="space-y-3">
                        {appointments.filter(a => a.status !== 'checked_in').map((appt) => (
                            <div key={appt.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-4 group transition-all hover:border-primary/20">
                                <span className="text-xs font-mono font-black text-slate-300 w-10">{appt.time_str}</span>
                                <div className="w-10 h-10 rounded-full bg-slate-50 overflow-hidden shrink-0 border border-slate-100">
                                    <img src={customerAvatars[appt.customer_name] || `https://ui-avatars.com/api/?name=${appt.customer_name}&background=random`} className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-sm font-bold text-slate-900">{appt.customer_name}</h4>
                                        <span className="text-[9px] font-mono font-bold text-primary bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10">#{appt.id}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tighter mt-0.5">{appt.service_name}</p>
                                </div>
                                <span className="text-[10px] font-black px-2 py-1 bg-slate-50 text-slate-400 rounded-md border border-slate-100 uppercase tracking-widest">等待中</span>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        ) : (
            <div className="animate-fade-in space-y-6">
                {/* 饱和度 UI 代码省略以保持简洁，核心在于渲染 saturationData */}
                <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                    <h2 className="text-[15px] font-black text-slate-900 mb-6 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">analytics</span>
                        周饱和度分析
                    </h2>
                    <div className="space-y-6">
                        {saturationData.map((day, idx) => (
                            <div key={idx}>
                                <div className="flex justify-between items-end mb-2 text-xs">
                                    <span className="font-bold">{day.dayName}</span>
                                    <span className="font-mono">{day.count} 单 / {day.percentage}%</span>
                                </div>
                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-primary" style={{ width: `${day.percentage}%` }}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}
      </main>

      {isScanning && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
              <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-md" onClick={() => setIsScanning(false)}></div>
              <div className="relative bg-white w-full max-w-xs rounded-[32px] p-8 shadow-2xl animate-[scale-in_0.3s_ease-out]">
                  <div className="text-center mb-6">
                      <h2 className="text-xl font-black">签到识别</h2>
                      <p className="text-xs text-slate-400 mt-1">请输入预约单 ID (appt:XXXX)</p>
                  </div>
                  <input value={scanInput} onChange={e => setScanInput(e.target.value)} className="w-full bg-slate-100 border-none rounded-2xl py-4 px-6 text-center font-mono font-bold mb-4" />
                  <button onClick={handleScanSubmit} className="w-full bg-slate-900 text-white font-black py-4 rounded-xl active:scale-95 transition-all">确认签到</button>
              </div>
          </div>
      )}
      <BottomNav activeRoute="admin_workbench" onNavigate={onNavigate} userRole="barber" />
    </Layout>
  );
};
