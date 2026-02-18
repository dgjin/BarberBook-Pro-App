
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Layout } from '../../components/Layout';
import { BottomNav } from '../../components/BottomNav';
import { PageRoute, User, Appointment } from '../../types';
import { supabase } from '../../services/supabase';

interface Props {
  onNavigate: (route: PageRoute) => void;
  currentUser?: User | null;
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
    fetchAppointments();
    const channel = supabase.channel('workbench_updates').on('postgres_changes', { event: '*', schema: 'public', table: 'app_appointments' }, () => { fetchAppointments(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAppointments]);

  const currentServiceAppt = useMemo(() => { return appointments.find(a => a.status === 'checked_in'); }, [appointments]);

  const showNotification = (msg: string) => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleCompleteService = async () => {
    if (!currentServiceAppt || !currentUser) return;
    if(!window.confirm(`确认完成顾客 ${currentServiceAppt.customer_name} 的服务吗？`)) return;
    
    setIsCompleting(true);
    try {
        // 1. Check for Vouchers
        const { data: customerData } = await supabase
            .from('app_customers')
            .select('id, vouchers')
            .eq('name', currentServiceAppt.customer_name)
            .single();

        let usedVoucher = false;
        if (customerData && customerData.vouchers > 0) {
            // Automatic deduction from customer
            const { error: deductError } = await supabase
                .from('app_customers')
                .update({ vouchers: customerData.vouchers - 1 })
                .eq('id', customerData.id);
            
            if (!deductError) {
                usedVoucher = true;
                
                // 2. Increment Barber's Voucher Revenue Automatically
                const { data: barberData } = await supabase
                    .from('app_barbers')
                    .select('voucher_revenue')
                    .eq('name', currentUser.name)
                    .single();
                
                const currentRevenue = barberData?.voucher_revenue || 0;
                await supabase
                    .from('app_barbers')
                    .update({ voucher_revenue: currentRevenue + 1 })
                    .eq('name', currentUser.name);
                
                console.log("Voucher revenue incremented for barber:", currentUser.name);
            }
        }

        // 3. Update Appointment Status
        const { error } = await supabase
            .from('app_appointments')
            .update({ 
                status: 'completed',
                used_voucher: usedVoucher 
            })
            .eq('id', currentServiceAppt.id);

        if (error) throw error;

        await supabase.from('app_logs').insert({
            user: currentUser?.name || 'Barber',
            role: '理发师',
            action: '完成服务',
            details: `完成了顾客 ${currentServiceAppt.customer_name} 的服务${usedVoucher ? '（已扣除理发券并记录收入）' : ''}`,
            type: 'info',
            avatar: currentUser?.avatar || ''
        });
        
        await fetchAppointments();
        setWorkbenchMode('completed');
        showNotification(usedVoucher ? '服务已完成并自动扣券计入收入' : '服务已完成');

    } catch (e: any) { alert("操作失败: " + e.message); } finally { setIsCompleting(false); }
  };

  const handleCallNext = () => { setWorkbenchMode('active'); showNotification('准备接待下一位顾客'); };

  const handleScanSubmit = async () => {
      if (!scanInput) return;
      setIsProcessingScan(true);
      const apptId = scanInput.replace('appt:', '');
      try {
          const { error } = await supabase.from('app_appointments').update({ status: 'checked_in' }).eq('id', apptId);
          if (error) throw error;
          showNotification(`预约 #${apptId} 签到成功`);
          setIsScanning(false);
          setScanInput('');
          await fetchAppointments();
      } catch (e: any) { alert("扫码失败: " + e.message); } finally { setIsProcessingScan(false); }
  };

  if (!currentUser) return <div>Access Denied</div>;

  return (
    <Layout className="bg-slate-50 relative">
      <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[70] transition-all duration-300 ${showToast ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0'}`}>
        <div className="bg-slate-900 text-white px-4 py-2 rounded-full shadow-lg text-sm font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-green-400 text-lg">check_circle</span>
            操作成功
        </div>
      </div>

      <header className="pt-14 pb-6 px-6 flex justify-between items-center bg-white/70 ios-blur sticky top-0 z-30 border-b border-slate-100">
        <div>
          <p className="text-[10px] text-primary font-bold tracking-widest uppercase">BarberBook Pro</p>
          <h1 className="text-xl font-bold text-slate-900">{currentUser.name}的工作台</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-white shadow-sm overflow-hidden ring-1 ring-slate-100">
            <img className="w-full h-full object-cover" src={currentUser.avatar} alt="Avatar"/>
          </div>
        </div>
      </header>

      <main className="flex-1 px-5 pb-32 space-y-6 pt-6 overflow-y-auto">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setIsScanning(true)} className="flex items-center justify-center gap-2 bg-slate-900 text-white font-medium py-3 px-4 rounded-xl active:scale-95 transition-all shadow-md hover:bg-slate-800">
            <span className="material-symbols-outlined text-xl">qr_code_scanner</span>
            <span className="text-sm">扫描客户签到</span>
          </button>
          <div className="flex bg-slate-200/50 p-1 rounded-xl">
            <button onClick={() => setActiveTab('queue')} className={`flex-1 text-xs font-semibold py-2 px-1 rounded-lg transition-all ${activeTab === 'queue' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>今日队列</button>
            <button onClick={() => setActiveTab('saturation')} className={`flex-1 text-xs font-semibold py-2 px-1 rounded-lg transition-all ${activeTab === 'saturation' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>周饱和度</button>
          </div>
        </div>

        {activeTab === 'queue' ? (
            <>
                <section>
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${workbenchMode === 'active' && currentServiceAppt ? 'bg-primary' : 'bg-slate-300'}`}></span> 
                        {workbenchMode === 'active' ? '当前服务' : '服务状态'}
                        </h2>
                    </div>
                    {workbenchMode === 'active' ? (
                        currentServiceAppt ? (
                            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm relative overflow-hidden animate-fade-in">
                                <div className="absolute top-0 right-0 p-3 opacity-5"><span className="material-symbols-outlined text-8xl text-primary">content_cut</span></div>
                                <div className="flex justify-between items-start relative z-10">
                                <div className="flex gap-4 items-center">
                                    <div className="w-16 h-16 rounded-2xl overflow-hidden border border-slate-50 shadow-sm bg-slate-100 flex items-center justify-center">
                                       <img src={customerAvatars[currentServiceAppt.customer_name] || `https://ui-avatars.com/api/?name=${currentServiceAppt.customer_name}&background=random`} alt="Customer" className="w-full h-full object-cover"/>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900">{currentServiceAppt.customer_name}</h3>
                                        <p className="text-sm text-primary font-bold mt-0.5">{currentServiceAppt.service_name}</p>
                                    </div>
                                </div>
                                </div>
                                <div className="mt-8 flex items-end justify-between relative z-10">
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-wider">服务价格</p>
                                    <span className="text-2xl font-mono font-bold text-slate-900 tracking-tight">¥{currentServiceAppt.price}</span>
                                </div>
                                <button onClick={handleCompleteService} disabled={isCompleting} className="bg-primary text-white text-xs font-bold px-6 py-3 rounded-xl active:scale-95 transition-all shadow-lg shadow-blue-200/50 flex items-center gap-2">
                                    {isCompleting ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : <> <span className="material-symbols-outlined text-sm">check</span> <span>完成服务</span> </>}
                                </button>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm text-center border-dashed flex flex-col items-center justify-center h-[200px]">
                                <span className="material-symbols-outlined text-slate-300 text-3xl mb-2">chair</span>
                                <h3 className="text-sm font-bold text-slate-900">当前空闲</h3>
                            </div>
                        )
                    ) : (
                        <div className="bg-green-50 rounded-2xl p-8 border border-green-100 shadow-sm flex flex-col items-center justify-center text-center animate-fade-in">
                            <span className="material-symbols-outlined text-3xl text-green-500 mb-4">check</span>
                            <h3 className="text-lg font-bold text-green-900">服务已结束</h3>
                            <button onClick={handleCallNext} className="mt-6 w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined text-sm">notifications_active</span>
                                呼叫下一位
                            </button>
                        </div>
                    )}
                </section>

                <section>
                <div className="flex justify-between items-center mb-3 px-1 mt-6">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">待服务队列 ({appointments.length})</h2>
                </div>
                <div className="space-y-2.5">
                    {appointments.map((appt, i) => (
                        <div key={i} className={`flex items-center gap-4 bg-white p-4 rounded-2xl border shadow-sm ${appt.status === 'checked_in' ? 'border-green-200 bg-green-50/30' : 'border-slate-100'}`}>
                            <div className="text-center w-10"><p className="text-sm font-bold text-slate-900">{appt.time_str}</p></div>
                            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-600 font-semibold border border-slate-100 text-xs overflow-hidden">
                                {customerAvatars[appt.customer_name] ? <img src={customerAvatars[appt.customer_name]} alt={appt.customer_name} className="w-full h-full object-cover"/> : appt.customer_name.slice(0, 1)}
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-bold text-slate-800">{appt.customer_name}</h4>
                                <p className="text-[10px] text-slate-500">{appt.service_name}</p>
                            </div>
                        </div>
                    ))}
                </div>
                </section>
            </>
        ) : null}
      </main>
      <BottomNav activeRoute="admin_workbench" onNavigate={onNavigate} userRole="barber" />
    </Layout>
  );
};
