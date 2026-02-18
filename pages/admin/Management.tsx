
import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from '../../components/Layout';
import { BottomNav } from '../../components/BottomNav';
import { PageRoute, Barber, User } from '../../types';
import { supabase } from '../../services/supabase';

interface Props {
  onNavigate: (route: PageRoute) => void;
}

type ManagementTab = 'barber' | 'customer';

export const Management: React.FC<Props> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<ManagementTab>('barber');
  const [staffList, setStaffList] = useState<Barber[]>([]);
  const [customerList, setCustomerList] = useState<User[]>([]);
  
  const [activeModal, setActiveModal] = useState<'none' | 'edit_barber' | 'schedule' | 'qr' | 'edit_customer'>('none');
  const [selectedStaff, setSelectedStaff] = useState<Barber | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<User | null>(null);
  
  const [barberFormData, setBarberFormData] = useState<Partial<Barber>>({});
  const [customerFormData, setCustomerFormData] = useState<Partial<User>>({});
  
  const [scheduleDays, setScheduleDays] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Calendar State
  const [viewDate, setViewDate] = useState(new Date());

  const fetchData = async () => {
    if (staffList.length === 0 && customerList.length === 0) setIsLoading(true);
    
    if (activeTab === 'barber') {
        const { data: barberData } = await supabase.from('app_barbers').select('*').order('id');
        
        // 核心取数逻辑：通过聚合已完成且用券的预约单，计算最真实的理发师收入
        const { data: apptStats } = await supabase
            .from('app_appointments')
            .select('barber_name, used_voucher')
            .eq('status', 'completed')
            .eq('used_voucher', true);
            
        const voucherCounts: Record<string, number> = {};
        if (apptStats) {
            apptStats.forEach((a: any) => {
                voucherCounts[a.barber_name] = (voucherCounts[a.barber_name] || 0) + 1;
            });
        }

        if (barberData) {
            const enrichedBarbers = barberData.map((b: any) => ({
                ...b,
                // 该字段完全由统计逻辑覆盖，不可编辑
                voucher_revenue: voucherCounts[b.name] ?? 0
            }));
            setStaffList(enrichedBarbers as Barber[]);
        }
    } else {
        const { data } = await supabase.from('app_customers').select('*').order('created_at', { ascending: false });
        if (data) {
            const mappedUsers: User[] = data.map((d: any) => ({
                id: d.id,
                name: d.name,
                role: 'customer',
                avatar: d.avatar,
                phone: d.phone,
                realName: d.real_name,
                email: d.email,
                vouchers: d.vouchers || 0 
            }));
            setCustomerList(mappedUsers);
        }
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('management_updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_barbers' }, () => { if (activeTab === 'barber') fetchData(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_customers' }, () => { if (activeTab === 'customer') fetchData(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_appointments' }, () => { if (activeTab === 'barber') fetchData(); })
        .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeTab]);

  const handleEditBarberClick = (staff: Barber) => {
    setSelectedStaff(staff);
    setBarberFormData({ ...staff });
    setActiveModal('edit_barber');
  };

  // 同步收入：重新执行聚合逻辑并刷新显示
  const handleSyncVoucherRevenue = async () => {
    if (!selectedStaff) return;
    setIsSyncing(true);
    try {
        await fetchData(); // 重新加载全局数据
        const freshBarber = staffList.find(s => s.id === selectedStaff.id);
        if (freshBarber) {
            setBarberFormData(prev => ({ ...prev, voucher_revenue: freshBarber.voucher_revenue }));
        }
        alert('收入数据对账已完成，已同步数据库最新统计结果。');
    } catch (err) {
        alert('同步失败，请检查网络连接。');
    } finally {
        setIsSyncing(false);
    }
  };

  const handleScheduleClick = (staff: Barber) => {
    setSelectedStaff(staff);
    const currentSchedule = Array.isArray(staff.schedule) ? staff.schedule : [1,2,3,4,5];
    setScheduleDays(currentSchedule);
    setViewDate(new Date());
    setActiveModal('schedule');
  }

  const toggleScheduleDay = (day: number) => {
      setScheduleDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleSaveSchedule = async () => {
    if (!selectedStaff) return;
    setIsSaving(true);
    try {
        await supabase.from('app_barbers').update({ schedule: scheduleDays }).eq('id', selectedStaff.id);
        await fetchData();
        setActiveModal('none');
    } catch (err) { alert('保存失败'); }
    finally { setIsSaving(false); }
  };

  const handleQrClick = (staff: Barber) => { setSelectedStaff(staff); setActiveModal('qr'); }

  const handleAddBarber = () => {
    const newStaff: Barber = { id: 0, name: '', title: '', status: 'active', specialties: [], rating: 5.0, experience: 1, service_count: 0, bio: '', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBjkSmPnTjla4o-VeIij_US-0pBrVEtz_P87_uFjoUkyUkjRJSBnVDmLeBiQa_biqdTOlVRx6c8emTaYmeaBRiTE6iVSdyxsYmrZb_mNBbtJKjxNNSfPtD4KKb4ZNDO8Q7cZRJeqBcef3nXFZL9_zFnZBxw0_EXhnb64poyQDzM1iDUbZymkDsJGiYK4qxwsprBAUNLUg46KeZqcT9qRsycBys9FzSMp8S2jmFfytSkXUDVsI86Wa2q711auKVMMbe06b7yWxsomxQ', voucher_revenue: 0 };
    setSelectedStaff(newStaff);
    setBarberFormData(newStaff);
    setActiveModal('edit_barber');
  }

  const handleDeleteBarber = async (id: number) => {
    if (confirm('确定要删除该理发师吗？')) {
        await supabase.from('app_barbers').delete().eq('id', id);
        fetchData();
    }
  };

  const handleSaveBarber = async () => {
    if (!selectedStaff || !barberFormData.name) return;
    setIsSaving(true);
    // 强制过滤掉收入字段，确保前端无法篡改统计数据
    const payload = { 
        name: barberFormData.name, 
        title: barberFormData.title, 
        status: barberFormData.status, 
        specialties: barberFormData.specialties, 
        image: barberFormData.image || selectedStaff.image, 
        rating: barberFormData.rating || 5.0, 
        experience: barberFormData.experience || 1, 
        bio: barberFormData.bio || ''
    };
    try {
        if (selectedStaff.id === 0) await supabase.from('app_barbers').insert(payload);
        else await supabase.from('app_barbers').update(payload).eq('id', selectedStaff.id);
        await fetchData();
        setActiveModal('none');
    } catch (err) { alert('保存失败'); }
    finally { setIsSaving(false); }
  };

  const handleEditCustomerClick = (customer: User) => {
      setSelectedCustomer(customer);
      setCustomerFormData({ ...customer });
      setActiveModal('edit_customer');
  };

  const handleDeleteCustomer = async (id: string | number) => {
      if(confirm('确定要删除该用户吗？')) {
          await supabase.from('app_customers').delete().eq('id', id);
          fetchData();
      }
  };

  const handleSaveCustomer = async () => {
      if (!selectedCustomer) return;
      setIsSaving(true);
      const payload = {
          name: customerFormData.name,
          real_name: customerFormData.realName,
          phone: customerFormData.phone,
          email: customerFormData.email,
          avatar: customerFormData.avatar,
          vouchers: Number(customerFormData.vouchers || 0) 
      };
      const { error } = await supabase.from('app_customers').update(payload).eq('id', selectedCustomer.id);
      setIsSaving(false);
      if (error) alert('更新失败');
      else { await fetchData(); setActiveModal('none'); }
  };

  const filteredStaff = staffList.filter(staff => {
    const query = searchQuery.toLowerCase();
    return staff.name.toLowerCase().includes(query) || staff.title?.toLowerCase().includes(query) || staff.specialties?.some(s => s.toLowerCase().includes(query));
  });

  const filteredCustomers = customerList.filter(user => {
      const query = searchQuery.toLowerCase();
      return user.name.toLowerCase().includes(query) || (user.realName && user.realName.toLowerCase().includes(query)) || (user.phone && user.phone.includes(query));
  });

  const calendarData = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    const prevMonthDays = new Date(year, month, 0).getDate();
    const startOffset = firstDay === 0 ? 6 : firstDay - 1; 

    for (let i = startOffset; i > 0; i--) {
        days.push({ day: prevMonthDays - i + 1, currentMonth: false, weekDay: (month === 0 ? 0 : month - 1) });
    }
    for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(year, month, i);
        days.push({ day: i, currentMonth: true, weekDay: d.getDay() });
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
        days.push({ day: i, currentMonth: false, weekDay: (month === 11 ? 0 : month + 1) });
    }

    return days;
  }, [viewDate]);

  const changeMonth = (offset: number) => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1));
  };

  return (
    <Layout className="bg-bg-main relative">
      <header className="sticky top-0 z-30 bg-white/80 ios-blur px-5 pt-14 pb-4 border-b border-gray-100">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-[11px] font-bold text-primary uppercase tracking-[0.05em] mb-0.5">BarberBook Pro</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">综合管理</h1>
          </div>
          {activeTab === 'barber' && (
            <button onClick={handleAddBarber} className="bg-primary hover:opacity-90 text-white w-9 h-9 rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-all">
                <span className="material-symbols-outlined text-[22px]">add</span>
            </button>
          )}
        </div>
      </header>
      
      <main className="px-4 py-4 pb-32 overflow-y-auto no-scrollbar">
        <div className="sticky top-0 z-20 space-y-4 mb-6">
            <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white border-none rounded-2xl py-3.5 pl-11 pr-4 text-[15px] shadow-sm focus:ring-2 focus:ring-primary/20 transition-all" placeholder={activeTab === 'barber' ? "搜索理发师..." : "搜索顾客姓名/手机号..."} type="text" />
            </div>
            <div className="bg-white p-1 rounded-xl flex shadow-sm border border-white">
                <button onClick={() => { setActiveTab('barber'); setSearchQuery(''); }} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'barber' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>理发师管理</button>
                <button onClick={() => { setActiveTab('customer'); setSearchQuery(''); }} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'customer' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>顾客管理</button>
            </div>
        </div>

        {isLoading ? (
            <div className="text-center py-20 text-slate-400">正在获取最新数据...</div>
        ) : (
            <div className="space-y-4">
                {activeTab === 'barber' ? (
                    filteredStaff.length > 0 ? (
                        filteredStaff.map((staff) => (
                            <div key={staff.id} className="bg-white rounded-[24px] p-5 shadow-sm border border-white relative group animate-fade-in">
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteBarber(staff.id); }} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors z-10 w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50">
                                    <span className="material-symbols-outlined text-[20px]">delete</span>
                                </button>
                                <div className="flex items-start gap-4 mb-5">
                                    <div className="relative shrink-0">
                                        <img className="w-16 h-16 rounded-2xl object-cover ring-4 ring-slate-50 shadow-sm" src={staff.image} alt={staff.name}/>
                                        <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-[3px] border-white shadow-sm ${staff.status === 'active' ? 'bg-status-ready' : staff.status === 'busy' ? 'bg-amber-400' : 'bg-slate-400'}`}></span>
                                    </div>
                                    <div className="flex-1 min-w-0 pr-8">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-[17px] font-bold text-slate-900 truncate">{staff.name}</h3>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${staff.status === 'active' ? 'text-status-ready bg-green-50' : staff.status === 'busy' ? 'text-amber-500 bg-amber-50' : 'text-slate-500 bg-slate-100'}`}>
                                            {staff.status === 'active' ? '在职' : staff.status === 'busy' ? '忙碌' : '休息'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <p className="text-[13px] text-slate-500">{staff.title}</p>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <div className="text-[10px] px-2 py-1 bg-primary/5 text-primary font-black rounded-lg border border-primary/10 flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-[14px]">confirmation_number</span>
                                                累计理发券: {staff.voucher_revenue || 0} 张
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-50">
                                    <button onClick={() => handleEditBarberClick(staff)} className="flex-1 flex flex-col items-center gap-1.5 py-1 text-slate-600 active:bg-slate-50 rounded-xl transition-colors hover:bg-slate-50 hover:text-primary">
                                        <span className="material-symbols-outlined text-[20px]">edit_square</span>
                                        <span className="text-[11px] font-bold">基本资料</span>
                                    </button>
                                    <button onClick={() => handleScheduleClick(staff)} className="flex-1 flex flex-col items-center gap-1.5 py-1 text-slate-600 active:bg-slate-50 rounded-xl transition-colors hover:bg-slate-50 hover:text-primary">
                                        <span className="material-symbols-outlined text-[20px]">calendar_month</span>
                                        <span className="text-[11px] font-bold">周排班</span>
                                    </button>
                                    <button onClick={() => handleQrClick(staff)} className="flex-1 flex flex-col items-center gap-1.5 py-1 text-primary active:bg-primary/5 rounded-xl transition-colors">
                                        <span className="material-symbols-outlined text-[20px]">qr_code_2</span>
                                        <span className="text-[11px] font-bold">预约码</span>
                                    </button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-20 text-slate-400">未找到符合条件的理发师</div>
                    )
                ) : (
                    filteredCustomers.length > 0 ? (
                        filteredCustomers.map((user) => (
                            <div key={user.id} className="bg-white rounded-[24px] p-5 shadow-sm border border-white flex flex-col gap-4 animate-fade-in">
                                <div className="flex items-center gap-4">
                                    <img src={user.avatar || 'https://via.placeholder.com/150'} alt={user.name} className="w-14 h-14 rounded-full object-cover bg-slate-100 shadow-sm" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-[16px] font-bold text-slate-900 truncate">{user.name}</h3>
                                            <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-md border border-primary/10">
                                                {user.vouchers} 张可用
                                            </span>
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-1 text-[12px] text-slate-500">
                                                <span className="material-symbols-outlined text-[14px]">phone_iphone</span>
                                                <span className="font-mono font-medium">{user.phone}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <button onClick={() => handleEditCustomerClick(user)} className="w-8 h-8 rounded-full bg-slate-50 text-slate-600 flex items-center justify-center hover:bg-primary hover:text-white transition-colors">
                                            <span className="material-symbols-outlined text-[18px]">edit</span>
                                        </button>
                                        <button onClick={() => handleDeleteCustomer(user.id)} className="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors">
                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-20 text-slate-400">未找到符合条件的顾客</div>
                    )
                )}
            </div>
        )}
      </main>

      {activeModal !== 'none' && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm pointer-events-auto transition-opacity" onClick={() => { setActiveModal('none'); setSelectedStaff(null); setSelectedCustomer(null); }}></div>
          <div className="bg-white w-full max-w-sm m-4 rounded-[32px] p-6 shadow-2xl pointer-events-auto transform transition-all animate-[slide-up_0.3s_ease-out] max-h-[90vh] overflow-y-auto no-scrollbar border border-white/20">
             <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900">
                    {activeModal === 'edit_barber' ? '基本资料' : 
                     activeModal === 'edit_customer' ? '客户权益管理' : 
                     activeModal === 'schedule' ? '排班日历' : '专属二维码'}
                </h2>
                <button onClick={() => { setActiveModal('none'); setSelectedStaff(null); setSelectedCustomer(null); }} className="p-2 bg-slate-100 rounded-full text-slate-500 active:bg-slate-200 transition-colors">
                    <span className="material-symbols-outlined text-xl">close</span>
                </button>
             </div>

             {activeModal === 'edit_barber' && selectedStaff && (
                <div className="space-y-6">
                    {/* 收益纯展示卡片：去掉了 input，改为只读 Stat Card */}
                    <div className="p-5 bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl relative overflow-hidden shadow-xl">
                        <div className="absolute top-0 right-0 p-4 opacity-10 text-white"><span className="material-symbols-outlined text-8xl">wallet</span></div>
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-1">理发券累计总收入</p>
                                    <p className="text-[9px] text-slate-400 font-medium italic">Data from Appointment History</p>
                                </div>
                                <button 
                                    onClick={handleSyncVoucherRevenue}
                                    disabled={isSyncing}
                                    className="w-8 h-8 rounded-xl bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-all active:scale-90"
                                    title="实时对账"
                                >
                                    <span className={`material-symbols-outlined text-[18px] ${isSyncing ? 'animate-spin' : ''}`}>sync</span>
                                </button>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-5xl font-mono font-black text-white tracking-tighter">
                                    {barberFormData.voucher_revenue || 0}
                                </span>
                                <span className="text-sm font-bold text-blue-300 uppercase opacity-60">Vouchers</span>
                            </div>
                            <div className="mt-5 flex items-center gap-2 py-2 px-3 bg-white/5 rounded-xl border border-white/5 backdrop-blur-sm">
                                <span className="material-symbols-outlined text-blue-400 text-sm">verified</span>
                                <p className="text-[9px] text-slate-300 font-bold leading-tight">
                                    统计项受系统财务保护，无法手动修改。
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 px-1">显示名称</label>
                            <input 
                                value={barberFormData.name} 
                                onChange={e => setBarberFormData({...barberFormData, name: e.target.value})} 
                                className="w-full bg-slate-50 border-none rounded-2xl py-3.5 px-5 text-slate-900 font-bold focus:ring-2 focus:ring-primary/20 placeholder:font-normal" 
                                placeholder="请输入姓名" 
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 px-1">专业职级</label>
                            <input 
                                value={barberFormData.title} 
                                onChange={e => setBarberFormData({...barberFormData, title: e.target.value})} 
                                className="w-full bg-slate-50 border-none rounded-2xl py-3.5 px-5 text-slate-900 font-bold focus:ring-2 focus:ring-primary/20 placeholder:font-normal" 
                                placeholder="如：美式渐变首席师" 
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 px-1">当前状态</label>
                            <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                                {(['active', 'busy', 'rest'] as const).map(status => (
                                    <button 
                                        key={status}
                                        onClick={() => setBarberFormData({...barberFormData, status})}
                                        className={`flex-1 py-2.5 rounded-xl text-[11px] font-black transition-all ${barberFormData.status === status ? 'bg-white text-slate-900 shadow-md scale-[1.02]' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        {status === 'active' ? '在职' : status === 'busy' ? '忙碌' : '休假'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    
                    <div className="pt-2">
                        <button 
                            onClick={handleSaveBarber} 
                            disabled={!barberFormData.name || isSaving} 
                            className={`w-full text-white font-bold py-4 rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 ${(!barberFormData.name || isSaving) ? 'bg-slate-300' : 'bg-slate-900 shadow-slate-200'}`}
                        >
                            {isSaving ? (
                                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-xl">check_circle</span>
                                    <span>保存资料更新</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
             )}

             {activeModal === 'edit_customer' && selectedCustomer && (
                 <div className="space-y-6">
                     <div className="bg-blue-50 p-5 rounded-3xl border border-blue-100">
                        <label className="text-[10px] font-black text-primary uppercase tracking-[0.2em] block mb-3 text-center">理发券手动充值 / 扣减</label>
                        <div className="flex items-center gap-4">
                            <button onClick={() => setCustomerFormData({...customerFormData, vouchers: Math.max(0, (customerFormData.vouchers || 0) - 1)})} className="w-12 h-12 rounded-2xl bg-white text-slate-500 font-bold text-xl shadow-sm border border-blue-100 active:scale-90 transition-all">-</button>
                            <div className="flex-1 bg-white border-2 border-blue-200 rounded-2xl py-3 px-4 text-center">
                                <input 
                                    type="number"
                                    value={customerFormData.vouchers} 
                                    onChange={e => setCustomerFormData({...customerFormData, vouchers: parseInt(e.target.value) || 0})}
                                    className="w-full bg-transparent border-none p-0 text-2xl font-mono font-black text-slate-900 text-center focus:ring-0"
                                />
                                <p className="text-[9px] text-blue-300 font-bold uppercase mt-1">Vouchers Balance</p>
                            </div>
                            <button onClick={() => setCustomerFormData({...customerFormData, vouchers: (customerFormData.vouchers || 0) + 1})} className="w-12 h-12 rounded-2xl bg-white text-slate-500 font-bold text-xl shadow-sm border border-blue-100 active:scale-90 transition-all">+</button>
                        </div>
                     </div>
                     <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 px-1">客户昵称</label>
                            <input value={customerFormData.name} onChange={e => setCustomerFormData({...customerFormData, name: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3.5 px-5 text-slate-900 font-bold focus:ring-2 focus:ring-primary/20" />
                        </div>
                        <button onClick={handleSaveCustomer} disabled={isSaving} className="w-full mt-2 bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2">
                            {isSaving ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : "更新客户信息"}
                        </button>
                     </div>
                 </div>
             )}

             {activeModal === 'schedule' && selectedStaff && (
                <div className="space-y-6">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
                        <img src={selectedStaff.image} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm" alt={selectedStaff.name}/>
                        <div>
                            <p className="text-base font-bold text-slate-900">{selectedStaff.name}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Work Schedule</p>
                        </div>
                    </div>
                    
                    <div className="bg-slate-50/50 p-5 rounded-[28px] border border-slate-100">
                        <div className="flex items-center justify-between mb-5">
                            <button onClick={() => changeMonth(-1)} className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm text-slate-400 hover:text-primary transition-colors"><span className="material-symbols-outlined text-lg">chevron_left</span></button>
                            <h4 className="text-sm font-black text-slate-800 tracking-tight">{viewDate.getFullYear()}年 {viewDate.getMonth() + 1}月</h4>
                            <button onClick={() => { setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1)); }} className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm text-slate-400 hover:text-primary transition-colors"><span className="material-symbols-outlined text-lg">chevron_right</span></button>
                        </div>
                        
                        <div className="grid grid-cols-7 gap-1 text-center mb-3">
                            {['一','二','三','四','五','六','日'].map(d => <span key={d} className="text-[10px] font-black text-slate-400 opacity-60 uppercase">{d}</span>)}
                        </div>
                        
                        <div className="grid grid-cols-7 gap-2">
                            {calendarData.map((d, i) => {
                                const isWorking = scheduleDays.includes(d.weekDay);
                                return (
                                    <button 
                                        key={i} 
                                        onClick={() => toggleScheduleDay(d.weekDay)}
                                        className={`aspect-square rounded-xl flex items-center justify-center text-xs font-bold transition-all relative overflow-hidden
                                            ${!d.currentMonth ? 'opacity-20 pointer-events-none' : ''}
                                            ${isWorking ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105 z-10' : 'bg-white text-slate-400 border border-slate-100 hover:border-primary/30'}
                                        `}
                                    >
                                        {d.day}
                                        {isWorking && d.currentMonth && <div className="absolute top-1 right-1 w-1 h-1 bg-white rounded-full"></div>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <button 
                        onClick={handleSaveSchedule} 
                        disabled={isSaving}
                        className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {isSaving ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : <span>保存周排班方案</span>}
                    </button>
                </div>
             )}

             {activeModal === 'qr' && selectedStaff && (
                 <div className="flex flex-col items-center">
                    <div className="p-5 bg-white rounded-[40px] border border-slate-100 shadow-inner mb-6 relative group">
                        <div className="absolute inset-0 bg-primary/5 rounded-[40px] opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=barber:${selectedStaff.id}`} className="w-56 h-56 mix-blend-multiply opacity-90 relative z-10" alt="QR Code"/>
                    </div>
                    <p className="text-lg font-bold text-slate-900 mb-1">{selectedStaff.name} 的专属名片</p>
                    <p className="text-xs text-slate-400 mb-8 text-center leading-relaxed px-6 font-medium">
                        客户扫码后将自动识别理发师，直接进入预约流程。建议打印张贴在工位。
                    </p>
                    <button onClick={() => { setActiveModal('none'); }} className="w-full bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl hover:bg-slate-200 transition-colors">返回列表</button>
                 </div>
             )}
          </div>
        </div>
      )}

      <BottomNav activeRoute="admin_management" onNavigate={onNavigate} userRole="admin" />
    </Layout>
  );
}
