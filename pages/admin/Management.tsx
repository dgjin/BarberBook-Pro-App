
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

  const handleSyncVoucherRevenue = async () => {
    if (!selectedStaff) return;
    setIsSyncing(true);
    try {
        await fetchData(); 
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
    const newStaff: Barber = { id: 0, name: '', title: '', status: 'active', specialties: [], rating: 5.0, experience: 1, service_count: 0, bio: '', image: '', voucher_revenue: 0 };
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

  const handleBarberAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBarberFormData(prev => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveBarber = async () => {
    if (!selectedStaff || !barberFormData.name) return;
    setIsSaving(true);
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

  const handleCustomerAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustomerFormData(prev => ({ ...prev, avatar: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
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

  const getPlaceholderAvatar = (name: string) => `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'B')}&background=random&color=fff&size=128`;

  return (
    <Layout className="bg-[#F8FAFC] relative">
      <header className="sticky top-0 z-30 bg-white/80 ios-blur px-6 pt-14 pb-4 border-b border-slate-100">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-0.5">Management Pro</p>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">人员与权益管理</h1>
          </div>
          {activeTab === 'barber' && (
            <button onClick={handleAddBarber} className="bg-primary hover:opacity-90 text-white w-10 h-10 rounded-[14px] flex items-center justify-center shadow-lg shadow-blue-200 active:scale-95 transition-all">
                <span className="material-symbols-outlined text-[24px]">add</span>
            </button>
          )}
        </div>
      </header>
      
      <main className="px-5 py-6 pb-32 overflow-y-auto no-scrollbar">
        <div className="sticky top-0 z-20 space-y-4 mb-8">
            <div className="relative group">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-primary transition-colors">search</span>
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white border-none rounded-[20px] py-4 pl-12 pr-5 text-[15px] shadow-sm border border-transparent focus:ring-2 focus:ring-primary/10 transition-all" placeholder={activeTab === 'barber' ? "搜索理发师姓名或职级..." : "通过姓名或手机号检索客户..."} type="text" />
            </div>
            <div className="bg-slate-200/50 p-1 rounded-[16px] flex">
                <button onClick={() => { setActiveTab('barber'); setSearchQuery(''); }} className={`flex-1 py-3 text-[13px] font-black rounded-[12px] transition-all duration-300 ${activeTab === 'barber' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>发型师团队</button>
                <button onClick={() => { setActiveTab('customer'); setSearchQuery(''); }} className={`flex-1 py-3 text-[13px] font-black rounded-[12px] transition-all duration-300 ${activeTab === 'customer' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>顾客档案库</button>
            </div>
        </div>

        {isLoading ? (
            <div className="text-center py-24 flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-slate-100 border-t-primary rounded-full animate-spin"></div>
                <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">Synchronizing Data...</p>
            </div>
        ) : (
            <div className="space-y-5">
                {activeTab === 'barber' ? (
                    filteredStaff.length > 0 ? (
                        filteredStaff.map((staff) => (
                            <div key={staff.id} className="bg-white rounded-[28px] p-6 shadow-sm border border-white relative group animate-fade-in hover:shadow-xl hover:shadow-blue-100/30 transition-all duration-500">
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteBarber(staff.id); }} className="absolute top-5 right-5 text-slate-200 hover:text-red-500 transition-colors z-10 w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-50">
                                    <span className="material-symbols-outlined text-[20px]">delete_sweep</span>
                                </button>
                                <div className="flex items-start gap-5 mb-6">
                                    <div className="relative shrink-0">
                                        <div className="w-[72px] h-[72px] rounded-[24px] overflow-hidden ring-4 ring-slate-50 shadow-sm">
                                            <img className="w-full h-full object-cover" src={staff.image || getPlaceholderAvatar(staff.name)} alt={staff.name}/>
                                        </div>
                                        <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-[4px] border-white shadow-sm ${staff.status === 'active' ? 'bg-status-ready' : staff.status === 'busy' ? 'bg-amber-400' : 'bg-slate-400'}`}></span>
                                    </div>
                                    <div className="flex-1 min-w-0 pr-8">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-[17px] font-black text-slate-900 truncate tracking-tight">{staff.name}</h3>
                                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${staff.status === 'active' ? 'text-green-600 bg-green-50' : staff.status === 'busy' ? 'text-amber-600 bg-amber-50' : 'text-slate-400 bg-slate-100'}`}>
                                                {staff.status === 'active' ? 'Ready' : staff.status === 'busy' ? 'Busy' : 'Off'}
                                            </span>
                                        </div>
                                        <p className="text-[12px] text-slate-400 font-bold uppercase tracking-widest mt-1">{staff.title}</p>
                                        <div className="mt-4 inline-flex items-center gap-2 py-1.5 px-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                                            <span className="material-symbols-outlined text-primary text-[16px]">confirmation_number</span>
                                            <span className="text-[11px] font-black text-primary uppercase">收益: {staff.voucher_revenue || 0} Vouchers</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between gap-3 pt-5 border-t border-slate-50">
                                    <button onClick={() => handleEditBarberClick(staff)} className="flex-1 flex flex-col items-center gap-1.5 py-2.5 bg-slate-50 text-slate-600 rounded-[18px] transition-all hover:bg-slate-900 hover:text-white">
                                        <span className="material-symbols-outlined text-[22px]">edit_square</span>
                                        <span className="text-[10px] font-black uppercase tracking-tighter">基本资料</span>
                                    </button>
                                    <button onClick={() => handleScheduleClick(staff)} className="flex-1 flex flex-col items-center gap-1.5 py-2.5 bg-slate-50 text-slate-600 rounded-[18px] transition-all hover:bg-slate-900 hover:text-white">
                                        <span className="material-symbols-outlined text-[22px]">event_repeat</span>
                                        <span className="text-[10px] font-black uppercase tracking-tighter">排班计划</span>
                                    </button>
                                    <button onClick={() => handleQrClick(staff)} className="flex-1 flex flex-col items-center gap-1.5 py-2.5 bg-blue-50 text-primary rounded-[18px] transition-all hover:bg-primary hover:text-white">
                                        <span className="material-symbols-outlined text-[22px]">qr_code_2</span>
                                        <span className="text-[10px] font-black uppercase tracking-tighter">专属预约码</span>
                                    </button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-24 text-slate-300 font-black uppercase tracking-widest text-[10px]">No stylist found</div>
                    )
                ) : (
                    filteredCustomers.length > 0 ? (
                        filteredCustomers.map((user) => (
                            <div key={user.id} className="bg-white rounded-[28px] p-5 shadow-sm border border-white flex flex-col gap-4 animate-fade-in hover:shadow-lg transition-all duration-300">
                                <div className="flex items-center gap-5">
                                    <div className="w-[60px] h-[60px] rounded-full overflow-hidden border-2 border-slate-50 shadow-sm bg-slate-100 flex-shrink-0">
                                        <img src={user.avatar || getPlaceholderAvatar(user.name)} alt={user.name} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-[16px] font-black text-slate-900 truncate">{user.name}</h3>
                                            <div className="px-2 py-0.5 bg-blue-50 text-primary text-[9px] font-black rounded-md border border-blue-100 uppercase tracking-tighter">
                                                {user.vouchers} Vouchers
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
                                                <span className="material-symbols-outlined text-[16px] text-slate-300">phone_iphone</span>
                                                <span className="font-mono font-bold tracking-tight">{user.phone}</span>
                                            </div>
                                            {user.realName && (
                                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                                                    <span className="material-symbols-outlined text-[14px]">id_card</span>
                                                    <span>Verified: {user.realName}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <button onClick={() => handleEditCustomerClick(user)} className="w-10 h-10 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-900 hover:text-white transition-all shadow-sm">
                                            <span className="material-symbols-outlined text-[20px]">edit_note</span>
                                        </button>
                                        <button onClick={() => handleDeleteCustomer(user.id)} className="w-10 h-10 rounded-full bg-red-50 text-red-300 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm">
                                            <span className="material-symbols-outlined text-[20px]">person_remove</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-24 text-slate-300 font-black uppercase tracking-widest text-[10px]">No customer found</div>
                    )
                )}
            </div>
        )}
      </main>

      {activeModal !== 'none' && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-md pointer-events-auto transition-opacity" onClick={() => { setActiveModal('none'); setSelectedStaff(null); setSelectedCustomer(null); }}></div>
          <div className="bg-white w-full max-w-sm m-4 rounded-[36px] p-8 shadow-2xl pointer-events-auto transform transition-all animate-[slide-up_0.35s_cubic-bezier(0.16,1,0.3,1)] max-h-[90vh] overflow-y-auto no-scrollbar border border-white/20">
             <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                        {activeModal === 'edit_barber' ? '资料维护' : 
                         activeModal === 'edit_customer' ? '权益配置' : 
                         activeModal === 'schedule' ? '排班日历' : '身份凭证'}
                    </h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Management Console</p>
                </div>
                <button onClick={() => { setActiveModal('none'); setSelectedStaff(null); setSelectedCustomer(null); }} className="w-10 h-10 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors">
                    <span className="material-symbols-outlined text-xl">close</span>
                </button>
             </div>

             {activeModal === 'edit_barber' && selectedStaff && (
                <div className="space-y-8">
                    <div className="p-6 bg-slate-900 rounded-[28px] relative overflow-hidden shadow-2xl">
                        <div className="absolute top-0 right-0 p-4 opacity-10 text-white"><span className="material-symbols-outlined text-9xl">wallet</span></div>
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-1">年度理发券核销额度</p>
                                    <p className="text-[9px] text-slate-500 font-medium italic">Verified Transactions Only</p>
                                </div>
                                <button 
                                    onClick={handleSyncVoucherRevenue}
                                    disabled={isSyncing}
                                    className="w-10 h-10 rounded-[14px] bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-all active:scale-90"
                                    title="实时对账"
                                >
                                    <span className={`material-symbols-outlined text-[20px] ${isSyncing ? 'animate-spin' : ''}`}>sync</span>
                                </button>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-5xl font-mono font-black text-white tracking-tighter shadow-sm">
                                    {barberFormData.voucher_revenue || 0}
                                </span>
                                <span className="text-sm font-black text-blue-300 uppercase opacity-60">Total</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-center">
                        <div className="relative">
                            <div className="w-[100px] h-[100px] rounded-[32px] overflow-hidden border-4 border-slate-50 shadow-xl bg-slate-100 flex items-center justify-center">
                                {barberFormData.image ? (
                                    <img src={barberFormData.image} alt="Barber Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="material-symbols-outlined text-4xl text-slate-300">person</span>
                                )}
                            </div>
                            <label 
                                htmlFor="barber-avatar-upload-mgmt" 
                                className="absolute -bottom-2 -right-2 w-10 h-10 bg-primary text-white rounded-2xl flex items-center justify-center cursor-pointer shadow-lg border-4 border-white active:scale-90 transition-transform"
                            >
                                <span className="material-symbols-outlined text-xl">photo_camera</span>
                            </label>
                            <input 
                                id="barber-avatar-upload-mgmt" 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={handleBarberAvatarFileChange}
                            />
                        </div>
                    </div>

                    <div className="space-y-5">
                        <div className="group">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-2 px-1">显示名称</label>
                            <input 
                                value={barberFormData.name} 
                                onChange={e => setBarberFormData({...barberFormData, name: e.target.value})} 
                                className="w-full bg-slate-50 border-none rounded-[18px] py-4 px-5 text-slate-900 font-black focus:ring-2 focus:ring-primary/10 transition-all" 
                                placeholder="请输入姓名" 
                            />
                        </div>
                        <div className="group">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-2 px-1">专业职级</label>
                            <input 
                                value={barberFormData.title} 
                                onChange={e => setBarberFormData({...barberFormData, title: e.target.value})} 
                                className="w-full bg-slate-50 border-none rounded-[18px] py-4 px-5 text-slate-900 font-bold focus:ring-2 focus:ring-primary/10 transition-all" 
                                placeholder="如：美式渐变首席师" 
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-3 px-1">当前状态</label>
                            <div className="flex gap-2.5 p-1.5 bg-slate-100 rounded-[20px]">
                                {(['active', 'busy', 'rest'] as const).map(status => (
                                    <button 
                                        key={status}
                                        onClick={() => setBarberFormData({...barberFormData, status})}
                                        className={`flex-1 py-3 rounded-[14px] text-[11px] font-black uppercase tracking-tighter transition-all duration-300 ${barberFormData.status === status ? 'bg-white text-slate-900 shadow-md scale-[1.05]' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        {status === 'active' ? '在线' : status === 'busy' ? '忙碌' : '休憩'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    
                    <div className="pt-4">
                        <button 
                            onClick={handleSaveBarber} 
                            disabled={!barberFormData.name || isSaving} 
                            className="w-full bg-primary text-white font-black py-4.5 rounded-[22px] shadow-2xl shadow-blue-100 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                            {isSaving ? (
                                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-xl">verified</span>
                                    <span className="text-sm tracking-wide">立即保存更改</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
             )}

             {activeModal === 'edit_customer' && selectedCustomer && (
                 <div className="space-y-8">
                     <div className="bg-blue-50/50 p-6 rounded-[28px] border border-blue-100 shadow-inner">
                        <label className="text-[10px] font-black text-primary uppercase tracking-[0.25em] block mb-5 text-center">理发券余额调剂中心</label>
                        <div className="flex items-center gap-5">
                            <button onClick={() => setCustomerFormData({...customerFormData, vouchers: Math.max(0, (customerFormData.vouchers || 0) - 1)})} className="w-14 h-14 rounded-[18px] bg-white text-slate-400 font-black text-2xl shadow-sm border border-blue-100 active:scale-90 transition-all">-</button>
                            <div className="flex-1 bg-white border-2 border-blue-100 rounded-[22px] py-4 text-center shadow-sm">
                                <input 
                                    type="number"
                                    value={customerFormData.vouchers} 
                                    onChange={e => setCustomerFormData({...customerFormData, vouchers: parseInt(e.target.value) || 0})}
                                    className="w-full bg-transparent border-none p-0 text-3xl font-mono font-black text-slate-900 text-center focus:ring-0"
                                />
                                <p className="text-[9px] text-blue-300 font-black uppercase mt-1">Wallet Balance</p>
                            </div>
                            <button onClick={() => setCustomerFormData({...customerFormData, vouchers: (customerFormData.vouchers || 0) + 1})} className="w-14 h-14 rounded-[18px] bg-white text-slate-400 font-black text-2xl shadow-sm border border-blue-100 active:scale-90 transition-all">+</button>
                        </div>
                     </div>

                     <div className="flex flex-col items-center">
                        <div className="relative">
                            <div className="w-[90px] h-[90px] rounded-full overflow-hidden border-4 border-slate-50 shadow-xl bg-slate-100 flex items-center justify-center">
                                {customerFormData.avatar ? (
                                    <img src={customerFormData.avatar} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="material-symbols-outlined text-4xl text-slate-300">person</span>
                                )}
                            </div>
                            <label 
                                htmlFor="admin-customer-avatar-upload" 
                                className="absolute -bottom-1 -right-1 w-9 h-9 bg-slate-900 text-white rounded-2xl flex items-center justify-center cursor-pointer shadow-lg border-4 border-white active:scale-90 transition-transform"
                            >
                                <span className="material-symbols-outlined text-lg">photo_camera</span>
                            </label>
                            <input 
                                id="admin-customer-avatar-upload" 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={handleCustomerAvatarFileChange}
                            />
                        </div>
                     </div>

                     <div className="space-y-5">
                        <div className="group">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-2 px-1">客户昵称</label>
                            <input value={customerFormData.name} onChange={e => setCustomerFormData({...customerFormData, name: e.target.value})} className="w-full bg-slate-50 border-none rounded-[18px] py-4 px-5 text-slate-900 font-black focus:ring-2 focus:ring-primary/10 transition-all" />
                        </div>
                        <div className="group">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-2 px-1">真实姓名</label>
                            <input value={customerFormData.realName} onChange={e => setCustomerFormData({...customerFormData, realName: e.target.value})} className="w-full bg-slate-50 border-none rounded-[18px] py-4 px-5 text-slate-900 font-bold focus:ring-2 focus:ring-primary/10 transition-all" placeholder="身份验证姓名" />
                        </div>
                        <div className="group">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-2 px-1">联系电话</label>
                            <input value={customerFormData.phone} onChange={e => setCustomerFormData({...customerFormData, phone: e.target.value})} className="w-full bg-slate-50 border-none rounded-[18px] py-4 px-5 text-slate-900 font-mono font-bold focus:ring-2 focus:ring-primary/10 transition-all" />
                        </div>
                        <div className="group">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-2 px-1">头像图片链接 (可选)</label>
                            <input value={customerFormData.avatar} onChange={e => setCustomerFormData({...customerFormData, avatar: e.target.value})} className="w-full bg-slate-50 border-none rounded-[18px] py-3 px-5 text-slate-900 font-medium focus:ring-2 focus:ring-primary/10 text-xs" placeholder="URL Link" />
                        </div>
                        <button onClick={handleSaveCustomer} disabled={isSaving} className="w-full mt-4 bg-slate-900 text-white font-black py-4.5 rounded-[22px] shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3">
                            {isSaving ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : "全量更新客户档案"}
                        </button>
                     </div>
                 </div>
             )}

             {activeModal === 'schedule' && selectedStaff && (
                <div className="space-y-8">
                    <div className="p-5 bg-slate-50 rounded-[24px] border border-slate-100 flex items-center gap-5 shadow-sm">
                        <img src={selectedStaff.image || getPlaceholderAvatar(selectedStaff.name)} className="w-[52px] h-[52px] rounded-[18px] object-cover border-2 border-white shadow-md" alt={selectedStaff.name}/>
                        <div>
                            <p className="text-base font-black text-slate-900 tracking-tight">{selectedStaff.name}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-0.5">Stylist Schedule</p>
                        </div>
                    </div>
                    
                    <div className="bg-slate-50/50 p-6 rounded-[32px] border border-slate-100 shadow-inner">
                        <div className="flex items-center justify-between mb-6">
                            <button onClick={() => changeMonth(-1)} className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-slate-300 hover:text-primary transition-all active:scale-90"><span className="material-symbols-outlined text-lg font-black">chevron_left</span></button>
                            <h4 className="text-[15px] font-black text-slate-800 tracking-tight uppercase">{viewDate.getFullYear()} / {viewDate.getMonth() + 1}</h4>
                            <button onClick={() => { setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1)); }} className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-slate-300 hover:text-primary transition-all active:scale-90"><span className="material-symbols-outlined text-lg font-black">chevron_right</span></button>
                        </div>
                        
                        <div className="grid grid-cols-7 gap-2 text-center mb-4">
                            {['一','二','三','四','五','六','日'].map(d => <span key={d} className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{d}</span>)}
                        </div>
                        
                        <div className="grid grid-cols-7 gap-2.5">
                            {calendarData.map((d, i) => {
                                const isWorking = scheduleDays.includes(d.weekDay);
                                return (
                                    <button 
                                        key={i} 
                                        onClick={() => toggleScheduleDay(d.weekDay)}
                                        className={`aspect-square rounded-[14px] flex items-center justify-center text-xs font-black transition-all relative overflow-hidden
                                            ${!d.currentMonth ? 'opacity-10 pointer-events-none' : ''}
                                            ${isWorking ? 'bg-primary text-white shadow-xl shadow-blue-200 scale-105 z-10' : 'bg-white text-slate-400 border border-slate-100 hover:border-primary/20'}
                                        `}
                                    >
                                        {d.day}
                                        {isWorking && d.currentMonth && <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <button 
                        onClick={handleSaveSchedule} 
                        disabled={isSaving}
                        className="w-full bg-slate-900 text-white font-black py-4.5 rounded-[22px] shadow-2xl shadow-slate-200 flex items-center justify-center gap-3 active:scale-95 transition-all"
                    >
                        {isSaving ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : <span className="text-sm tracking-wide">发布排班至全局终端</span>}
                    </button>
                </div>
             )}

             {activeModal === 'qr' && selectedStaff && (
                 <div className="flex flex-col items-center">
                    <div className="p-7 bg-white rounded-[48px] border border-slate-50 shadow-2xl shadow-blue-100/50 mb-10 relative group overflow-hidden">
                        <div className="absolute inset-0 bg-primary opacity-0 group-hover:opacity-[0.02] transition-opacity"></div>
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=barber:${selectedStaff.id}`} className="w-60 h-60 mix-blend-multiply opacity-90 relative z-10 scale-[1.02]" alt="QR Code"/>
                    </div>
                    <div className="text-center mb-10">
                        <p className="text-xl font-black text-slate-900 tracking-tight">{selectedStaff.name} 专属席位预约码</p>
                        <p className="text-[10px] text-slate-400 mt-2 font-black uppercase tracking-[0.2em] px-8 leading-relaxed">
                            建议打印并张贴在工位醒目位置，客户扫码将自动定位该理发师。
                        </p>
                    </div>
                    <button onClick={() => { setActiveModal('none'); }} className="w-full bg-slate-50 text-slate-400 font-black py-4 rounded-[18px] hover:bg-slate-100 hover:text-slate-600 transition-all text-[11px] uppercase tracking-widest">返回列表</button>
                 </div>
             )}
          </div>
        </div>
      )}

      <BottomNav activeRoute="admin_management" onNavigate={onNavigate} userRole="admin" />
    </Layout>
  );
}
