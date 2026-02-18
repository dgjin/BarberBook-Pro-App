
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Layout } from '../../components/Layout';
import { BottomNav } from '../../components/BottomNav';
import { PageRoute, User, Appointment, Barber } from '../../types';
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
  const [allTodayAppointments, setAllTodayAppointments] = useState<Appointment[]>([]);
  
  // 核心统计状态 (全部来自后端真实数据)
  const [lifetimeStats, setLifetimeStats] = useState({ totalServices: 0, totalVoucherRevenue: 0 });
  const [todayRealStats, setTodayRealStats] = useState({ completedCount: 0, revenue: 0, voucherCount: 0 });
  
  const [systemMaxSlots, setSystemMaxSlots] = useState<number>(14);
  const [customerAvatars, setCustomerAvatars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);

  // 获取今日日期字符串 (格式: M月D日)
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  const fetchData = useCallback(async () => {
      if (!currentUser || currentUser.role !== 'barber') return;
      
      setLoading(true); // 显式开启加载
      try {
          // 1. 获取系统配置（用于计算饱和度）
          const { data: configData } = await supabase.from('app_settings').select('value').eq('key', 'global_config').single();
          if (configData?.value?.maxAppointments) setSystemMaxSlots(configData.value.maxAppointments);

          // 2. 实时聚合：计算真实累积成就 (全量生涯对账)
          const { data: lifetimeData } = await supabase.from('app_appointments')
            .select('price, used_voucher')
            .eq('barber_name', currentUser.name)
            .eq('status', 'completed');

          if (lifetimeData) {
            const totalServices = lifetimeData.length;
            const totalVoucherRevenue = lifetimeData
                .filter((a: any) => a.used_voucher)
                .reduce((sum: number, a: any) => sum + (a.price || 0), 0);
            setLifetimeStats({ totalServices, totalVoucherRevenue });
          } else {
            // 如果查询结果为 null，显式归零
            setLifetimeStats({ totalServices: 0, totalVoucherRevenue: 0 });
          }

          // 3. 实时聚合：计算今日真实战报 (当日营收对账)
          const todayStr = getTodayStr();
          const { data: todaySummary } = await supabase.from('app_appointments')
            .select('price, used_voucher, status')
            .eq('barber_name', currentUser.name)
            .eq('date_str', todayStr);

          if (todaySummary) {
              const completed = todaySummary.filter((a: any) => a.status === 'completed');
              setTodayRealStats({
                  completedCount: completed.length,
                  revenue: completed.reduce((sum: number, a: any) => sum + (a.price || 0), 0),
                  voucherCount: completed.filter((a: any) => a.used_voucher).length
              });
          } else {
              setTodayRealStats({ completedCount: 0, revenue: 0, voucherCount: 0 });
          }

          // 4. 获取今日所有预约单（用于队列展示）
          const { data: apptData } = await supabase.from('app_appointments')
            .select('*')
            .eq('barber_name', currentUser.name)
            .eq('date_str', todayStr)
            .order('time_str', { ascending: true });

          if (apptData) {
            setAllTodayAppointments(apptData as Appointment[]);
            
            // 批量获取客户头像
            const customerNames = Array.from(new Set(apptData.map((a: any) => a.customer_name)));
            if (customerNames.length > 0) {
                const { data: userData } = await supabase.from('app_customers').select('name, avatar').in('name', customerNames);
                if (userData) {
                    const avatarMap: Record<string, string> = {};
                    userData.forEach((u: any) => { if (u.avatar) avatarMap[u.name] = u.avatar; });
                    setCustomerAvatars(avatarMap);
                }
            }
          }
      } catch (err) { 
          console.error("Fetch Data Error:", err); 
      } finally { 
          setLoading(false); 
      }
  }, [currentUser]);

  useEffect(() => {
    fetchData();

    // 实时订阅预约单更新，确保任何状态变更都能触发表单刷新
    const channel = supabase.channel('workbench_stats_realtime_v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_appointments' }, () => {
        fetchData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  // UI 辅助计算
  const currentQueue = useMemo(() => 
    allTodayAppointments.filter(a => ['confirmed', 'pending', 'checked_in'].includes(a.status))
  , [allTodayAppointments]);

  const completedToday = useMemo(() => 
    allTodayAppointments.filter(a => a.status === 'completed')
  , [allTodayAppointments]);

  const currentServiceAppt = useMemo(() => currentQueue.find(a => a.status === 'checked_in'), [currentQueue]);
  const waitingList = useMemo(() => currentQueue.filter(a => a.status !== 'checked_in'), [currentQueue]);

  const saturation = useMemo(() => 
    Math.min(Math.round((allTodayAppointments.length / systemMaxSlots) * 100), 100)
  , [allTodayAppointments, systemMaxSlots]);

  const handleCompleteService = async () => {
    if (!currentServiceAppt || !currentUser) return;
    if(!window.confirm(`确认完成服务并结算吗？`)) return;
    setIsCompleting(true);
    try {
        const { error } = await supabase.from('app_appointments')
          .update({ status: 'completed' })
          .eq('id', currentServiceAppt.id);
        
        if (error) throw error;
        
        // 成功结算后手动触发一次数据拉取，确保当日统计和累积数据即时更新
        await fetchData();
        setWorkbenchMode('completed');
    } catch (e) { alert("结算操作失败，请检查网络"); } finally { setIsCompleting(false); }
  };

  if (!currentUser) return null;

  return (
    <Layout className="bg-slate-50 relative">
      <header className="pt-12 pb-4 px-6 flex justify-between items-center bg-white/90 ios-blur sticky top-0 z-30 border-b border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl border-2 border-white shadow-sm overflow-hidden bg-slate-100">
            <img className="w-full h-full object-cover" src={currentUser.avatar || `https://ui-avatars.com/api/?name=${currentUser.name}`} alt="Avatar"/>
          </div>
          <div>
            <p className="text-[9px] text-primary font-black tracking-widest uppercase leading-none mb-1">Live Workbench</p>
            <h1 className="text-lg font-black text-slate-900 leading-none">{currentUser.name}</h1>
          </div>
        </div>
        <button onClick={fetchData} className="w-9 h-9 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center hover:text-primary transition-all active:rotate-180">
            <span className="material-symbols-outlined text-[20px]">sync</span>
        </button>
      </header>

      <main className="flex-1 px-5 pb-32 space-y-6 pt-4 overflow-y-auto no-scrollbar">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setIsScanning(true)} className="flex items-center justify-center gap-2 bg-slate-900 text-white font-black py-3 rounded-xl active:scale-95 transition-all shadow-sm">
            <span className="material-symbols-outlined text-lg">qr_code_scanner</span>
            <span className="text-xs tracking-widest">扫描签到</span>
          </button>
          <div className="flex bg-slate-200/50 p-1 rounded-xl">
            <button onClick={() => setActiveTab('queue')} className={`flex-1 text-[10px] font-black py-2 rounded-lg transition-all ${activeTab === 'queue' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>今日队列</button>
            <button onClick={() => setActiveTab('saturation')} className={`flex-1 text-[10px] font-black py-2 rounded-lg transition-all ${activeTab === 'saturation' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>数据看板</button>
          </div>
        </div>

        {activeTab === 'queue' ? (
            <div className="space-y-6 animate-fade-in">
                <section>
                    <h2 className="text-[10px] font-black uppercase text-slate-400 mb-3 px-1 tracking-widest flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${currentServiceAppt ? 'bg-primary animate-pulse' : 'bg-slate-200'}`}></span>
                        正在接待中
                    </h2>
                    {workbenchMode === 'active' ? (
                        currentServiceAppt ? (
                            <div className="bg-white rounded-[28px] p-5 border border-white shadow-lg relative overflow-hidden group">
                                <div className="flex gap-4 items-center relative z-10">
                                    <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-sm bg-slate-50 shrink-0 border border-slate-100">
                                       <img src={customerAvatars[currentServiceAppt.customer_name] || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentServiceAppt.customer_name)}&background=random`} className="w-full h-full object-cover" alt="User"/>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-base font-black text-slate-900 truncate tracking-tight">{currentServiceAppt.customer_name}</h3>
                                            <div className="px-1.5 py-0.5 bg-slate-900 text-white text-[8px] font-mono font-black rounded-md">#{currentServiceAppt.id}</div>
                                        </div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter truncate">{currentServiceAppt.service_name}</p>
                                    </div>
                                </div>
                                <div className="mt-5 relative z-10">
                                    <button onClick={handleCompleteService} disabled={isCompleting} className="w-full bg-primary text-white font-black py-3.5 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50">
                                        {isCompleting ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : <> <span className="material-symbols-outlined text-xl">check_circle</span> 确认完成结算 </>}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white/40 rounded-[28px] p-10 border-2 border-dashed border-slate-200 text-center flex flex-col items-center justify-center transition-all">
                                <span className="material-symbols-outlined text-slate-200 text-4xl mb-2">chair</span>
                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">当前暂无服务客户</p>
                            </div>
                        )
                    ) : (
                        <div className="bg-green-50 rounded-[28px] p-10 border border-green-100 text-center flex flex-col items-center justify-center animate-fade-in">
                            <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-green-500 mb-4 shadow-sm border-2 border-green-100">
                                <span className="material-symbols-outlined text-2xl">done_all</span>
                            </div>
                            <h3 className="text-base font-black text-green-900">服务结算已完成</h3>
                            <button onClick={() => setWorkbenchMode('active')} className="mt-6 w-full bg-slate-900 text-white font-black py-3.5 rounded-xl shadow-lg active:scale-95 transition-all text-sm uppercase tracking-widest">呼叫下一位</button>
                        </div>
                    )}
                </section>

                <section>
                    <div className="flex justify-between items-center mb-3 px-1">
                        <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">待服务序列 ({waitingList.length})</h2>
                    </div>
                    {loading ? (
                        <div className="py-10 text-center">
                            <div className="w-6 h-6 border-2 border-slate-100 border-t-primary rounded-full animate-spin mx-auto mb-2"></div>
                            <p className="text-[9px] font-black text-slate-300 uppercase">Updating...</p>
                        </div>
                    ) : waitingList.length > 0 ? (
                        <div className="space-y-3">
                            {waitingList.map((appt) => (
                                <div key={appt.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-4 transition-all hover:border-primary/20 active:scale-[0.98] shadow-sm">
                                    <div className="flex flex-col items-center min-w-[36px]">
                                        <span className="text-[10px] font-black font-mono text-slate-900 bg-slate-50 w-full text-center py-1 rounded-lg">{appt.time_str}</span>
                                    </div>
                                    <div className="w-10 h-10 rounded-full bg-slate-50 overflow-hidden shrink-0 border border-white shadow-sm">
                                        <img src={customerAvatars[appt.customer_name] || `https://ui-avatars.com/api/?name=${encodeURIComponent(appt.customer_name)}&background=random`} className="w-full h-full object-cover" alt="User"/>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-[14px] font-black text-slate-900 truncate leading-none mb-1">{appt.customer_name}</h4>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter truncate">{appt.service_name}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-primary leading-none">¥{appt.price}</p>
                                        <p className="text-[8px] font-bold text-slate-300 uppercase mt-1">Pending</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-10 bg-white/40 rounded-[22px] border border-dashed border-slate-200 text-center">
                            <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none">今日暂无预约</p>
                        </div>
                    )}
                </section>
            </div>
        ) : (
            <div className="space-y-6 animate-fade-in pb-10">
                {/* Real-time Workload Saturation */}
                <section className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 flex items-center justify-between overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                    <div className="relative z-10">
                        <h3 className="text-sm font-black text-slate-900 leading-none">当日工作负荷</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest">Real-time Saturation</p>
                        <div className="mt-5">
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-black text-slate-900 leading-none">{saturation}%</span>
                                <span className={`text-[10px] font-black uppercase ${saturation > 80 ? 'text-orange-500' : 'text-primary'}`}>
                                    {saturation > 80 ? 'HIGH' : 'NORMAL'}
                                </span>
                            </div>
                            <div className="w-32 h-1.5 bg-slate-100 rounded-full mt-2.5 overflow-hidden">
                                <div 
                                    className={`h-full transition-all duration-1000 ${saturation > 80 ? 'bg-orange-400 shadow-[0_0_8px_#fb923c]' : 'bg-primary shadow-[0_0_8px_#007AFF]'}`}
                                    style={{ width: `${saturation}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                    <div className="w-20 h-20 rounded-full border-[6px] border-slate-50 flex items-center justify-center relative flex-shrink-0">
                        <span className="material-symbols-outlined text-3xl text-slate-200">dashboard_customize</span>
                        <svg className="absolute inset-0 -rotate-90 transform" viewBox="0 0 100 100">
                            <circle 
                                cx="50" cy="50" r="47" 
                                fill="none" stroke="currentColor" strokeWidth="6" 
                                className={`${saturation > 80 ? 'text-orange-400' : 'text-primary'} transition-all duration-700`}
                                strokeDasharray={`${saturation * 2.95} 295`}
                                strokeLinecap="round"
                            />
                        </svg>
                    </div>
                </section>

                {/* Today Real Metrics (Direct Backend Data) */}
                <section className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 relative group overflow-hidden">
                        <div className="absolute top-0 right-0 w-12 h-12 bg-green-50 rounded-bl-[20px] flex items-center justify-center text-green-500">
                            <span className="material-symbols-outlined text-lg">fact_check</span>
                        </div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">今日完结订单</p>
                        <div className="flex items-baseline gap-1 mt-3">
                            <span className={`text-3xl font-black text-slate-900 ${loading ? 'animate-pulse' : ''}`}>{todayRealStats.completedCount}</span>
                            <span className="text-[10px] font-bold text-slate-300 uppercase">Orders</span>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-50">
                            <p className="text-[7px] font-bold text-slate-300 uppercase tracking-tighter">Synced with Cloud</p>
                        </div>
                    </div>
                    
                    <div className="bg-slate-900 p-6 rounded-[32px] shadow-lg border border-slate-800 relative group overflow-hidden">
                        <div className="absolute top-0 right-0 w-12 h-12 bg-white/5 rounded-bl-[20px] flex items-center justify-center text-primary">
                            <span className="material-symbols-outlined text-lg">payments</span>
                        </div>
                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">今日流水营收</p>
                        <div className="flex items-baseline gap-1 mt-3">
                            <span className={`text-3xl font-black text-white ${loading ? 'animate-pulse' : ''}`}>¥{todayRealStats.revenue}</span>
                            <span className="text-[10px] font-bold text-slate-600 uppercase">CNY</span>
                        </div>
                        <div className="mt-4 pt-3 border-t border-white/5">
                            <p className="text-[7px] font-bold text-slate-600 uppercase tracking-tighter">Real-time Verified</p>
                        </div>
                    </div>
                </section>

                {/* Lifetime Career Achievement (Direct Backend Data) */}
                <section>
                    <div className="px-1 mb-3">
                        <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">品牌职业成就 (生涯累积)</h2>
                    </div>
                    <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100 relative overflow-hidden group">
                        <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-primary/5 rounded-full blur-[60px] group-hover:bg-primary/10 transition-all duration-1000"></div>
                        
                        <div className="flex justify-between items-start mb-10 relative z-10">
                            <div>
                                <p className="text-[10px] font-bold text-slate-900 uppercase tracking-[0.25em] mb-1">Career Achievement</p>
                                <p className="text-[9px] text-slate-400 font-medium italic">Verified History</p>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary text-2xl">workspace_premium</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8 relative z-10">
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.15em] mb-2">服务人次总计</p>
                                <div className="flex items-baseline gap-1.5">
                                    <span className={`text-3xl font-black font-mono tracking-tighter ${loading ? 'animate-pulse' : ''}`}>
                                        {loading ? '--' : lifetimeStats.totalServices.toLocaleString()}
                                    </span>
                                    <span className="text-[10px] font-bold opacity-30">PEOPLE</span>
                                </div>
                                <div className="w-8 h-0.5 bg-primary/30 mt-3 rounded-full"></div>
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.15em] mb-2">券额营收总计</p>
                                <div className="flex items-baseline gap-1.5">
                                    <span className={`text-3xl font-black font-mono tracking-tighter text-primary ${loading ? 'animate-pulse' : ''}`}>
                                        {loading ? '--' : `¥${lifetimeStats.totalVoucherRevenue.toLocaleString()}`}
                                    </span>
                                    <span className="text-[10px] font-bold opacity-30 uppercase">Total</span>
                                </div>
                                <div className="w-8 h-0.5 bg-primary/30 mt-3 rounded-full"></div>
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-slate-50 flex items-center gap-3 relative z-10">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                            <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">所有成就均直接溯源至历史流水</p>
                        </div>
                    </div>
                </section>

                {/* Recent Completed Logs (Final 5) */}
                <section>
                    <div className="px-1 mb-3 flex justify-between items-center">
                        <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">今日结算流水</h2>
                        <span className="text-[8px] font-black text-primary bg-blue-50 px-2 py-0.5 rounded-full">LATEST 5</span>
                    </div>
                    <div className="space-y-2.5 pb-10">
                        {completedToday.slice(-5).reverse().map(appt => (
                            <div key={appt.id} className="bg-white p-3.5 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm hover:border-slate-200 transition-all">
                                <div className="flex items-center gap-3.5">
                                    <div className="w-9 h-9 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center border border-slate-100">
                                        <span className="material-symbols-outlined text-[20px]">receipt_long</span>
                                    </div>
                                    <div>
                                        <p className="text-[13px] font-bold text-slate-900 leading-none">{appt.customer_name}</p>
                                        <p className="text-[9px] text-slate-400 font-bold mt-1.5 uppercase truncate max-w-[130px]">{appt.service_name}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[12px] font-black text-slate-900">¥{appt.price}</p>
                                    <p className="text-[9px] text-slate-300 font-mono mt-0.5">{appt.time_str}</p>
                                </div>
                            </div>
                        ))}
                        {completedToday.length === 0 && (
                            <div className="py-10 bg-white/40 rounded-2xl border border-dashed border-slate-200 text-center">
                                <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none">今日尚无结单记录</p>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        )}
      </main>

      {/* Manual Check-in Modal */}
      {isScanning && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
              <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-md" onClick={() => setIsScanning(false)}></div>
              <div className="relative bg-white w-full max-w-xs rounded-[32px] p-8 shadow-2xl animate-[scale-in_0.3s_cubic-bezier(0.16,1,0.3,1)]">
                  <div className="text-center mb-6">
                      <h2 className="text-xl font-black text-slate-900 tracking-tight leading-none">手动确认签到</h2>
                      <p className="text-[10px] text-slate-400 mt-2 font-medium">输入系统生成的预约 ID (纯数字)</p>
                  </div>
                  <input 
                    value={scanInput} 
                    onChange={e => setScanInput(e.target.value)} 
                    autoFocus 
                    type="number"
                    className="w-full bg-slate-50 border-none rounded-xl py-4 px-5 text-center font-mono font-black text-lg text-slate-900 focus:ring-1 focus:ring-primary/20 mb-6 placeholder:text-slate-200" 
                    placeholder="例如: 1001" 
                  />
                  <div className="flex flex-col gap-2">
                      <button 
                        onClick={async () => { 
                            if (!scanInput) return;
                            setIsProcessingScan(true); 
                            const { error } = await supabase.from('app_appointments').update({ status: 'checked_in' }).eq('id', scanInput); 
                            if (error) alert("未找到该预约单");
                            else {
                                setIsScanning(false); 
                                setScanInput('');
                                fetchData(); 
                            }
                            setIsProcessingScan(false); 
                        }} 
                        disabled={!scanInput || isProcessingScan} 
                        className="w-full bg-slate-900 text-white font-black py-3.5 rounded-xl active:scale-95 transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isProcessingScan ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : "确认签到并激活"}
                      </button>
                      <button onClick={() => setIsScanning(false)} className="w-full py-2 text-slate-400 text-[10px] font-black uppercase tracking-widest">取消</button>
                  </div>
              </div>
          </div>
      )}
      <BottomNav activeRoute="admin_workbench" onNavigate={onNavigate} userRole="barber" />
    </Layout>
  );
};
