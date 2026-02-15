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

  // 'active' = showing customer card (or idle state), 'completed' = showing "Call Next" transition screen
  const [workbenchMode, setWorkbenchMode] = useState<'active' | 'completed'>('active');
  
  const [showToast, setShowToast] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  
  // Store a map of "Customer Name" -> "Avatar URL" to avoid joining tables manually in SQL
  const [customerAvatars, setCustomerAvatars] = useState<Record<string, string>>({});
  
  const [loading, setLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);

  // Define fetch logic as a reusable callback
  const fetchAppointments = useCallback(async () => {
      if (!currentUser || currentUser.role !== 'barber') return;
      
      setLoading(true);
      
      try {
          const { data, error } = await supabase
            .from('app_appointments')
            .select('*')
            .eq('barber_name', currentUser.name)
            .in('status', ['confirmed', 'pending', 'checked_in'])
            .order('time_str', { ascending: true });

          if (data) {
            setAppointments(data as Appointment[]);
            
            // --- ENRICHMENT: Fetch Real Avatars for these customers ---
            const customerNames = Array.from(new Set(data.map((a: any) => a.customer_name)));
            
            if (customerNames.length > 0) {
                const { data: userData } = await supabase
                    .from('app_customers')
                    .select('name, avatar')
                    .in('name', customerNames);
                
                if (userData) {
                    const avatarMap: Record<string, string> = {};
                    userData.forEach((u: any) => {
                        if (u.avatar) avatarMap[u.name] = u.avatar;
                    });
                    setCustomerAvatars(avatarMap);
                }
            }
          } else {
            setAppointments([]);
          }
      } catch (err) {
          console.error("Error fetching workbench data", err);
      } finally {
          setLoading(false);
      }
  }, [currentUser]);

  // Initial Fetch & Subscription
  useEffect(() => {
    fetchAppointments();

    const channel = supabase
      .channel('workbench_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_appointments' }, () => {
         fetchAppointments();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchAppointments]);

  // Derived State: Current Customer is the first person who is "checked_in"
  const currentServiceAppt = useMemo(() => {
      return appointments.find(a => a.status === 'checked_in');
  }, [appointments]);

  const showNotification = (msg: string) => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleCompleteService = async () => {
    if (!currentServiceAppt) {
        alert("当前没有正在服务的客户");
        return;
    }

    if(!window.confirm(`确认完成顾客 ${currentServiceAppt.customer_name} 的服务吗？`)) {
        return;
    }
    
    setIsCompleting(true);

    try {
        // 1. Update Appointment Status in DB
        const { error } = await supabase
            .from('app_appointments')
            .update({ status: 'completed' })
            .eq('id', currentServiceAppt.id);

        if (error) throw error;

        // 2. Log the action
        await supabase.from('app_logs').insert({
            user: currentUser?.name || 'Barber',
            role: '理发师',
            action: '完成服务',
            details: `完成了顾客 ${currentServiceAppt.customer_name} (${currentServiceAppt.service_name}) 的服务`,
            type: 'info',
            avatar: currentUser?.avatar || ''
        });
        
        // 3. Force Refresh Data (Crucial for UI sync, especially in Mock mode)
        await fetchAppointments();

        // 4. Update UI State
        setWorkbenchMode('completed');
        showNotification('服务已完成，记录已保存');

    } catch (e: any) {
        console.error("Complete service error", e);
        alert("操作失败: " + e.message);
    } finally {
        setIsCompleting(false);
    }
  };

  const handleCallNext = () => {
      setWorkbenchMode('active');
      showNotification('准备接待下一位顾客');
  };

  const handleScanSubmit = async () => {
      if (!scanInput) return;
      setIsProcessingScan(true);
      
      const apptId = scanInput.replace('appt:', '');
      
      try {
          const { error } = await supabase
            .from('app_appointments')
            .update({ status: 'checked_in' })
            .eq('id', apptId);
            
          if (error) throw error;
          
          showNotification(`预约 #${apptId} 签到成功`);
          setIsScanning(false);
          setScanInput('');
          
          // Force refresh
          await fetchAppointments();
          
      } catch (e: any) {
          alert("扫码失败: " + e.message);
      } finally {
          setIsProcessingScan(false);
      }
  };

  if (!currentUser) return <div>Access Denied</div>;

  return (
    <Layout className="bg-slate-50 relative">
      {/* Toast Notification */}
      <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[70] transition-all duration-300 ${showToast ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0'}`}>
        <div className="bg-slate-900 text-white px-4 py-2 rounded-full shadow-lg text-sm font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-green-400 text-lg">check_circle</span>
            {showToast ? '操作成功' : ''}
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
        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => setIsScanning(true)}
            className="flex items-center justify-center gap-2 bg-slate-900 text-white font-medium py-3 px-4 rounded-xl active:scale-95 transition-all shadow-md hover:bg-slate-800"
          >
            <span className="material-symbols-outlined text-xl">qr_code_scanner</span>
            <span className="text-sm">扫描客户签到</span>
          </button>
          <div className="flex bg-slate-200/50 p-1 rounded-xl">
            <button 
                onClick={() => setActiveTab('queue')}
                className={`flex-1 text-xs font-semibold py-2 px-1 rounded-lg transition-all ${activeTab === 'queue' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
                今日队列
            </button>
            <button 
                onClick={() => setActiveTab('saturation')}
                className={`flex-1 text-xs font-semibold py-2 px-1 rounded-lg transition-all ${activeTab === 'saturation' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
                周饱和度
            </button>
          </div>
        </div>

        {activeTab === 'queue' ? (
            <>
                {/* Current Service Area */}
                <section>
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${workbenchMode === 'active' && currentServiceAppt ? 'bg-primary' : 'bg-slate-300'}`}></span> 
                        {workbenchMode === 'active' ? '当前服务' : '服务状态'}
                        </h2>
                        {workbenchMode === 'active' && currentServiceAppt && (
                            <span className="flex items-center gap-1 text-primary text-[10px] font-bold bg-primary/5 px-2.5 py-1 rounded-full border border-primary/10 animate-pulse">
                                进行中
                            </span>
                        )}
                    </div>
                    
                    {workbenchMode === 'active' ? (
                        currentServiceAppt ? (
                            // --- Active Service Card ---
                            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm relative overflow-hidden animate-fade-in">
                                <div className="absolute top-0 right-0 p-3 opacity-5">
                                    <span className="material-symbols-outlined text-8xl text-primary">content_cut</span>
                                </div>
                                <div className="flex justify-between items-start relative z-10">
                                <div className="flex gap-4 items-center">
                                    <div className="w-16 h-16 rounded-2xl overflow-hidden border border-slate-50 shadow-sm bg-slate-100 flex items-center justify-center">
                                       {/* Use REAL Avatar if available, fallback to generated */}
                                       <img 
                                          src={customerAvatars[currentServiceAppt.customer_name] || `https://ui-avatars.com/api/?name=${currentServiceAppt.customer_name}&background=random`} 
                                          alt="Customer"
                                          className="w-full h-full object-cover"
                                       />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900">{currentServiceAppt.customer_name}</h3>
                                        <p className="text-sm text-primary font-bold mt-0.5">{currentServiceAppt.service_name}</p>
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className="text-[10px] px-2 py-0.5 bg-green-50 text-green-700 font-bold rounded-md border border-green-100 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[10px]">check_circle</span> 已签到
                                            </span>
                                            <span className="text-[10px] text-slate-400 font-mono">预约时间 {currentServiceAppt.time_str}</span>
                                        </div>
                                    </div>
                                </div>
                                </div>
                                <div className="mt-8 flex items-end justify-between relative z-10">
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-wider">服务价格</p>
                                    <div className="flex items-baseline gap-1">
                                       <span className="text-2xl font-mono font-bold text-slate-900 tracking-tight">¥{currentServiceAppt.price}</span>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleCompleteService}
                                    disabled={isCompleting}
                                    className="bg-primary text-white text-xs font-bold px-6 py-3 rounded-xl active:scale-95 transition-all shadow-lg shadow-blue-200/50 flex items-center gap-2"
                                >
                                    {isCompleting ? (
                                        <>
                                            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                            <span>提交中...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-sm">check</span>
                                            <span>完成服务</span>
                                        </>
                                    )}
                                </button>
                                </div>
                            </div>
                        ) : (
                            // --- Idle State Card ---
                            <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm text-center border-dashed flex flex-col items-center justify-center h-[200px]">
                                <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                                    <span className="material-symbols-outlined text-slate-300 text-2xl">chair</span>
                                </div>
                                <h3 className="text-sm font-bold text-slate-900">当前空闲</h3>
                                <p className="text-xs text-slate-400 mt-1">等待顾客扫码或人工签到</p>
                            </div>
                        )
                    ) : (
                        // --- Transition State: Completed ---
                        <div className="bg-green-50 rounded-2xl p-8 border border-green-100 shadow-sm flex flex-col items-center justify-center text-center animate-fade-in">
                            <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mb-4 shadow-sm">
                                <span className="material-symbols-outlined text-3xl">check</span>
                            </div>
                            <h3 className="text-lg font-bold text-green-900">服务已结束</h3>
                            <p className="text-xs text-green-700 mb-6">服务日志已自动上传</p>
                            <button 
                                onClick={handleCallNext}
                                className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined text-sm">notifications_active</span>
                                呼叫下一位
                            </button>
                        </div>
                    )}
                </section>

                {/* Wait List */}
                <section>
                <div className="flex justify-between items-center mb-3 px-1 mt-6">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">待服务队列 ({appointments.filter(a => a.status !== 'completed').length})</h2>
                </div>
                <div className="space-y-2.5">
                    {appointments.length > 0 ? appointments.map((appt, i) => (
                        <div key={i} className={`flex items-center gap-4 bg-white p-4 rounded-2xl border shadow-sm active:bg-slate-50 transition-colors ${appt.status === 'checked_in' ? 'border-green-200 bg-green-50/30' : 'border-slate-100'} ${currentServiceAppt?.id === appt.id ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
                            <div className="text-center w-10">
                                <p className="text-sm font-bold text-slate-900">{appt.time_str}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-600 font-semibold border border-slate-100 text-xs overflow-hidden">
                                {customerAvatars[appt.customer_name] ? (
                                    <img src={customerAvatars[appt.customer_name]} alt={appt.customer_name} className="w-full h-full object-cover"/>
                                ) : (
                                    appt.status === 'checked_in' ? (
                                        <span className="material-symbols-outlined text-lg">person</span>
                                    ) : (
                                        appt.customer_name.slice(0, 1)
                                    )
                                )}
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                    {appt.customer_name}
                                    {currentServiceAppt?.id === appt.id && <span className="text-[9px] bg-primary text-white px-1.5 rounded">Current</span>}
                                </h4>
                                <p className="text-[10px] text-slate-500">{appt.service_name}</p>
                            </div>
                            <div className={`text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1 ${appt.status === 'confirmed' ? 'bg-blue-50 text-blue-600' : appt.status === 'checked_in' ? 'bg-green-100 text-green-700' : 'bg-orange-50 text-orange-500'}`}>
                                {appt.status === 'confirmed' ? '已预约' : appt.status === 'checked_in' ? '已签到' : '待处理'}
                            </div>
                        </div>
                    )) : (
                        <div className="text-center py-10 text-slate-400 text-xs bg-white rounded-2xl border border-dashed border-slate-200">
                            暂无预约记录
                        </div>
                    )}
                </div>
                </section>
            </>
        ) : (
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-center py-10">
                <span className="material-symbols-outlined text-4xl text-slate-200 mb-2">bar_chart</span>
                <p className="text-slate-400 text-sm">暂无周统计数据</p>
            </div>
        )}

      </main>

      {/* Scan Overlay */}
      {isScanning && (
        <div className="fixed inset-0 z-[80] bg-black/90 flex flex-col items-center justify-center animate-fade-in p-6">
           <div className="relative w-72 h-72 border-2 border-white/30 rounded-3xl overflow-hidden mb-8">
              <div className="absolute inset-0 border-4 border-primary/50 rounded-3xl animate-pulse"></div>
              <div className="absolute top-0 left-0 w-full h-1 bg-primary/80 shadow-[0_0_15px_rgba(0,122,255,0.8)] animate-[scan_2s_linear_infinite]"></div>
              <div className="w-full h-full flex items-center justify-center">
                 <p className="text-white/80 font-bold tracking-widest text-sm">SCANNING...</p>
              </div>
           </div>
           
           <div className="w-full max-w-xs space-y-4">
               <p className="text-white text-center text-sm font-medium">模拟扫码结果</p>
               <input 
                 value={scanInput}
                 onChange={(e) => setScanInput(e.target.value)}
                 className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-white/30 text-center"
                 placeholder="输入预约ID (如: 123)"
               />
               <button 
                 onClick={handleScanSubmit}
                 disabled={!scanInput || isProcessingScan}
                 className="w-full py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/30"
               >
                 {isProcessingScan ? '处理中...' : '确认签到'}
               </button>
               <button 
                 onClick={() => { setIsScanning(false); setScanInput(''); }}
                 className="w-full py-3 bg-transparent text-white/60 font-medium"
               >
                 取消
               </button>
           </div>
        </div>
      )}

      <BottomNav activeRoute="admin_workbench" onNavigate={onNavigate} userRole="barber" />
    </Layout>
  );
};