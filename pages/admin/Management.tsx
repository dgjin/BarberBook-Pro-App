import React, { useState, useEffect } from 'react';
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
  
  // Modals
  const [activeModal, setActiveModal] = useState<'none' | 'edit_barber' | 'schedule' | 'qr' | 'edit_customer'>('none');
  
  // Selected Items
  const [selectedStaff, setSelectedStaff] = useState<Barber | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<User | null>(null);
  
  // Forms
  const [barberFormData, setBarberFormData] = useState<Partial<Barber>>({});
  const [customerFormData, setCustomerFormData] = useState<Partial<User>>({});
  
  const [scheduleDays, setScheduleDays] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false); // New saving state
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = async () => {
    // We do not set loading true here to avoid flickering on realtime updates, only initial load
    if (staffList.length === 0 && customerList.length === 0) setIsLoading(true);
    
    if (activeTab === 'barber') {
        const { data: barberData, error } = await supabase.from('app_barbers').select('*').order('id');
        
        // Fetch service counts based on completed appointments
        const { data: apptData } = await supabase
            .from('app_appointments')
            .select('barber_name')
            .eq('status', 'completed');
            
        const counts: Record<string, number> = {};
        if (apptData) {
            apptData.forEach((a: any) => {
                counts[a.barber_name] = (counts[a.barber_name] || 0) + 1;
            });
        }

        if (barberData) {
            // Enrich barber data with calculated service counts
            const enrichedBarbers = barberData.map((b: any) => ({
                ...b,
                service_count: counts[b.name] || b.service_count || 0
            }));
            setStaffList(enrichedBarbers as Barber[]);
        } else {
            console.error("Error fetching barbers:", error);
            // Mock Fallback just in case
             setStaffList([
                { id: 1, name: 'Marcus K.', title: '高级资深发型师', status: 'active', specialties: ['渐变', '美式油头', '修容'], image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDBHb7X1TXkyZK3rnI-4lZF5dNTO5rkQUbECYnrBBv4urkXzkLBVyRoR9mUc7FrIwDN0ILHBqMvd09rH69Wcrs2WXTzk1JfuFd5Q3yRGJISQlJbE_t5ZOffyjpEauLu8VlRNoQkN8E1VjPbACLLB9crkaLsK98PaIOeGVa4H5V0qsjAyKmDmWaaFZxoa9gcu1GJ71vXSRW2KQ9BUZYaiZ_dWnigRL45YleHhYglNDWAgeEJG-qW3MBlq0WMfCQRyc6QsSpwf5cwMNA', rating: 5.0, experience: 8, service_count: 1240, bio: '专注于美式复古油头。' },
            ]);
        }
    } else {
        const { data } = await supabase.from('app_customers').select('*').order('created_at', { ascending: false });
        if (data) {
            // Map DB snake_case to User type camelCase
            const mappedUsers: User[] = data.map((d: any) => ({
                id: d.id,
                name: d.name,
                role: 'customer',
                avatar: d.avatar,
                phone: d.phone,
                realName: d.real_name,
                email: d.email
            }));
            setCustomerList(mappedUsers);
        }
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();

    // Subscribe to changes for immediate UI updates
    const channel = supabase.channel('management_updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_barbers' }, () => {
             if (activeTab === 'barber') fetchData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_customers' }, () => {
             if (activeTab === 'customer') fetchData();
        })
        .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeTab]);

  // --- Barber Handlers ---

  const handleEditBarberClick = (staff: Barber) => {
    setSelectedStaff(staff);
    setBarberFormData({ ...staff });
    setActiveModal('edit_barber');
  };

  const handleScheduleClick = (staff: Barber) => {
    setSelectedStaff(staff);
    // Use existing schedule from DB or default to some days if undefined
    const currentSchedule = staff.schedule && staff.schedule.length > 0 
        ? staff.schedule 
        : [1,2,3,4,5]; // default fallback
    setScheduleDays(currentSchedule);
    setActiveModal('schedule');
  }

  const toggleScheduleDay = (day: number) => {
      setScheduleDays(prev => 
          prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
      );
  };

  const handleSaveSchedule = async () => {
    if (!selectedStaff) return;
    setIsSaving(true);
    
    try {
        const { error } = await supabase
            .from('app_barbers')
            .update({ schedule: scheduleDays })
            .eq('id', selectedStaff.id);
            
        if (error) throw error;
        
        await fetchData(); // Refresh data
        setActiveModal('none');
    } catch (err: any) {
        if (err.message && (err.message.includes('schema cache') || err.message.includes('schedule'))) {
            alert('数据库结构需更新: 请在 Supabase SQL Editor 执行最新的 SQL 脚本以添加 "schedule" 字段。');
        } else {
            alert('排班保存失败: ' + err.message);
        }
    } finally {
        setIsSaving(false);
    }
  };

  const handleQrClick = (staff: Barber) => {
    setSelectedStaff(staff);
    setActiveModal('qr');
  }

  const handleAddBarber = () => {
    const newStaff: Barber = {
      id: 0,
      name: '',
      title: '',
      status: 'active',
      specialties: [],
      rating: 5.0,
      experience: 1,
      service_count: 0,
      bio: '',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBjkSmPnTjla4o-VeIij_US-0pBrVEtz_P87_uFjoUkyUkjRJSBnVDmLeBiQa_biqdTOlVRx6c8emTaYmeaBRiTE6iVSdyxsYmrZb_mNBbtJKjxNNSfPtD4KKb4ZNDO8Q7cZRJeqBcef3nXFZL9_zFnZBxw0_EXhnb64poyQDzM1iDUbZymkDsJGiYK4qxwsprBAUNLUg46KeZqcT9qRsycBys9FzSMp8S2jmFfytSkXUDVsI86Wa2q711auKVMMbe06b7yWxsomxQ'
    };
    setSelectedStaff(newStaff);
    setBarberFormData(newStaff);
    setActiveModal('edit_barber');
  }

  const handleDeleteBarber = async (id: number) => {
    if (confirm('确定要删除该理发师吗？此操作不可恢复。')) {
        const { error } = await supabase.from('app_barbers').delete().eq('id', id);
        if (error) {
            alert('删除失败: ' + error.message);
        } else {
            fetchData();
        }
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
        // service_count is not saved here, it is calculated from appointments table
    };

    try {
        if (selectedStaff.id === 0) {
            // Insert
            const { error } = await supabase.from('app_barbers').insert(payload);
            if (error) throw error;
        } else {
            // Update
            const { error } = await supabase.from('app_barbers').update(payload).eq('id', selectedStaff.id);
            if (error) throw error;
        }
        await fetchData();
        setActiveModal('none');
        setSelectedStaff(null);
    } catch (err: any) {
        alert('保存失败: ' + err.message);
    } finally {
        setIsSaving(false);
    }
  };

  const handleBarberImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBarberFormData(prev => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTagChange = (str: string) => {
     const tags = str.split(/[,，]/).map(s => s.trim()).filter(Boolean);
     setBarberFormData(prev => ({ ...prev, specialties: tags }));
  };

  // --- Customer Handlers ---

  const handleEditCustomerClick = (customer: User) => {
      setSelectedCustomer(customer);
      setCustomerFormData({ ...customer });
      setActiveModal('edit_customer');
  };

  const handleDeleteCustomer = async (id: string | number) => {
      if(confirm('确定要删除该用户吗？此操作不可恢复。')) {
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
          avatar: customerFormData.avatar
      };

      const { error } = await supabase.from('app_customers').update(payload).eq('id', selectedCustomer.id);
      setIsSaving(false);
      
      if (error) {
          alert('更新失败: ' + error.message);
      } else {
          await fetchData();
          setActiveModal('none');
          setSelectedCustomer(null);
      }
  };

  const handleCustomerAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustomerFormData(prev => ({ ...prev, avatar: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };


  // --- Filtering ---
  
  const filteredStaff = staffList.filter(staff => {
    const query = searchQuery.toLowerCase();
    return staff.name.toLowerCase().includes(query) || 
           staff.title?.toLowerCase().includes(query) || 
           staff.specialties?.some(s => s.toLowerCase().includes(query));
  });

  const filteredCustomers = customerList.filter(user => {
      const query = searchQuery.toLowerCase();
      return user.name.toLowerCase().includes(query) ||
             (user.realName && user.realName.toLowerCase().includes(query)) ||
             (user.phone && user.phone.includes(query));
  });

  return (
    <Layout className="bg-bg-main relative">
      <header className="sticky top-0 z-30 bg-white/80 ios-blur px-5 pt-14 pb-4 border-b border-gray-100">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-[11px] font-bold text-primary uppercase tracking-[0.05em] mb-0.5">BarberBook Pro</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">综合管理</h1>
          </div>
          {activeTab === 'barber' && (
            <button 
                onClick={handleAddBarber}
                className="bg-primary hover:opacity-90 text-white w-9 h-9 rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-all"
            >
                <span className="material-symbols-outlined text-[22px]">add</span>
            </button>
          )}
        </div>
      </header>
      
      <main className="px-4 py-4 pb-32 overflow-y-auto">
        {/* Search & Tabs */}
        <div className="sticky top-0 z-20 space-y-4 mb-6">
            <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
                <input 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white border-none rounded-2xl py-3.5 pl-11 pr-4 text-[15px] shadow-sm focus:ring-2 focus:ring-primary/20 placeholder:text-slate-400 transition-all" 
                    placeholder={activeTab === 'barber' ? "搜索理发师..." : "搜索顾客姓名/手机号..."}
                    type="text"
                />
            </div>

            <div className="bg-white p-1 rounded-xl flex shadow-sm border border-white">
                <button 
                    onClick={() => { setActiveTab('barber'); setSearchQuery(''); }}
                    className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'barber' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
                >
                    理发师管理
                </button>
                <button 
                    onClick={() => { setActiveTab('customer'); setSearchQuery(''); }}
                    className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'customer' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
                >
                    顾客管理
                </button>
            </div>
        </div>

        {isLoading ? (
            <div className="text-center py-10 text-slate-400">加载数据中...</div>
        ) : (
            <div className="space-y-4">
                {activeTab === 'barber' ? (
                    // --- Barber List ---
                    filteredStaff.length > 0 ? (
                        filteredStaff.map((staff) => (
                            <div key={staff.id} className="bg-white rounded-[24px] p-5 shadow-sm border border-white relative group">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleDeleteBarber(staff.id); }}
                                    className="absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors z-10 w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50"
                                >
                                    <span className="material-symbols-outlined text-[20px]">delete</span>
                                </button>
                                <div className="flex items-start gap-4 mb-5">
                                    <div className="relative shrink-0">
                                        <img className="w-16 h-16 rounded-2xl object-cover ring-4 ring-slate-50" src={staff.image} alt={staff.name}/>
                                        <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-[3px] border-white ${staff.status === 'active' ? 'bg-status-ready' : staff.status === 'busy' ? 'bg-amber-400' : 'bg-slate-400'}`}></span>
                                    </div>
                                    <div className="flex-1 min-w-0 pr-8">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-[17px] font-bold text-slate-900 truncate">{staff.name}</h3>
                                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${staff.status === 'active' ? 'text-status-ready bg-green-50' : staff.status === 'busy' ? 'text-amber-500 bg-amber-50' : 'text-slate-500 bg-slate-100'}`}>
                                            {staff.status === 'active' ? '在职' : staff.status === 'busy' ? '忙碌' : '休息'}
                                            </span>
                                        </div>
                                        
                                        <div className="flex items-center gap-2 mt-1">
                                            <p className="text-[13px] text-slate-500">{staff.title}</p>
                                            <span className="text-slate-200">|</span>
                                            <div className="flex items-center gap-0.5">
                                                <span className="text-[12px] font-bold text-slate-700">{staff.rating ? staff.rating.toFixed(1) : '5.0'}</span>
                                                <span className="material-symbols-outlined text-[14px] text-amber-400" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                                            {staff.specialties && staff.specialties.map(t => (
                                            <span key={t} className="bg-blue-50 text-blue-600 text-[11px] px-2.5 py-1 rounded-lg font-medium">{t}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-50">
                                    <button 
                                    onClick={() => handleEditBarberClick(staff)}
                                    className="flex-1 flex flex-col items-center gap-1.5 py-1 text-slate-600 active:bg-slate-50 rounded-xl transition-colors hover:bg-slate-50 hover:text-primary"
                                    >
                                    <span className="material-symbols-outlined text-[20px]">edit_square</span>
                                    <span className="text-[11px] font-medium">编辑</span>
                                    </button>
                                    <button 
                                    onClick={() => handleScheduleClick(staff)}
                                    className="flex-1 flex flex-col items-center gap-1.5 py-1 text-slate-600 active:bg-slate-50 rounded-xl transition-colors hover:bg-slate-50 hover:text-primary"
                                    >
                                    <span className="material-symbols-outlined text-[20px]">calendar_month</span>
                                    <span className="text-[11px] font-medium">排班</span>
                                    </button>
                                    <button 
                                    onClick={() => handleQrClick(staff)}
                                    className="flex-1 flex flex-col items-center gap-1.5 py-1 text-primary active:bg-primary/5 rounded-xl transition-colors"
                                    >
                                    <span className="material-symbols-outlined text-[20px]">qr_code_2</span>
                                    <span className="text-[11px] font-medium">二维码</span>
                                    </button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-10">
                            <p className="text-slate-500 text-sm font-medium">未找到理发师</p>
                            <button onClick={handleAddBarber} className="mt-4 text-primary text-sm font-bold hover:underline">点击新增</button>
                        </div>
                    )
                ) : (
                    // --- Customer List ---
                    filteredCustomers.length > 0 ? (
                        filteredCustomers.map((user) => (
                            <div key={user.id} className="bg-white rounded-[24px] p-5 shadow-sm border border-white flex flex-col gap-4">
                                <div className="flex items-center gap-4">
                                    <img 
                                        src={user.avatar || 'https://via.placeholder.com/150'} 
                                        alt={user.name} 
                                        className="w-14 h-14 rounded-full object-cover bg-slate-100"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-[16px] font-bold text-slate-900 truncate">{user.name}</h3>
                                            {user.realName && (
                                                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">{user.realName}</span>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-1 text-[12px] text-slate-500">
                                                <span className="material-symbols-outlined text-[14px]">phone_iphone</span>
                                                <span className="font-mono">{user.phone || '无手机号'}</span>
                                            </div>
                                            {user.email && (
                                                <div className="flex items-center gap-1 text-[12px] text-slate-400">
                                                    <span className="material-symbols-outlined text-[14px]">mail</span>
                                                    <span className="truncate max-w-[150px]">{user.email}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <button 
                                            onClick={() => handleEditCustomerClick(user)}
                                            className="w-8 h-8 rounded-full bg-slate-50 text-slate-600 flex items-center justify-center hover:bg-primary hover:text-white transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">edit</span>
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteCustomer(user.id)}
                                            className="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-10">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <span className="material-symbols-outlined text-3xl text-slate-300">group_off</span>
                            </div>
                            <p className="text-slate-500 text-sm font-medium">未找到顾客数据</p>
                        </div>
                    )
                )}
            </div>
        )}
      </main>

      {/* MODALS */}
      {activeModal !== 'none' && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center pointer-events-none">
          <div 
             className="absolute inset-0 bg-black/30 backdrop-blur-sm pointer-events-auto transition-opacity"
             onClick={() => { setActiveModal('none'); setSelectedStaff(null); setSelectedCustomer(null); }}
          ></div>
          
          <div className="bg-white w-full max-w-sm m-4 rounded-[32px] p-6 shadow-2xl pointer-events-auto transform transition-all animate-[slide-up_0.3s_ease-out] mb-6 sm:mb-auto max-h-[90vh] overflow-y-auto">
             <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900">
                    {activeModal === 'edit_barber' ? (selectedStaff?.id === 0 ? '新增理发师' : '编辑理发师') : 
                     activeModal === 'edit_customer' ? '编辑顾客信息' :
                     activeModal === 'schedule' ? '排班管理' : '专属二维码'}
                </h2>
                <button onClick={() => { setActiveModal('none'); setSelectedStaff(null); setSelectedCustomer(null); }} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
                   <span className="material-symbols-outlined text-xl text-slate-500">close</span>
                </button>
             </div>

             {/* EDIT BARBER FORM */}
             {activeModal === 'edit_barber' && selectedStaff && (
                <div className="space-y-4">
                    <div className="flex flex-col items-center justify-center mb-2">
                        <div className="relative group">
                            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-slate-50 shadow-md">
                                <img 
                                    src={barberFormData.image || 'https://via.placeholder.com/150'} 
                                    alt="Avatar Preview" 
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <label 
                                htmlFor="barber-avatar-upload" 
                                className="absolute bottom-0 right-0 w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:bg-primary transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">photo_camera</span>
                            </label>
                            <input 
                                id="barber-avatar-upload" 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={handleBarberImageUpload}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">姓名</label>
                        <input 
                            value={barberFormData.name} 
                            onChange={e => setBarberFormData({...barberFormData, name: e.target.value})}
                            placeholder="请输入理发师姓名"
                            className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 font-bold focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">头衔</label>
                        <input 
                            value={barberFormData.title} 
                            onChange={e => setBarberFormData({...barberFormData, title: e.target.value})}
                            placeholder="例如：高级总监"
                            className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">状态</label>
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button 
                            onClick={() => setBarberFormData({...barberFormData, status: 'active'})}
                            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${barberFormData.status === 'active' ? 'bg-white text-status-ready shadow-sm' : 'text-slate-400'}`}
                            >
                            在职 (Active)
                            </button>
                             <button 
                            onClick={() => setBarberFormData({...barberFormData, status: 'busy'})}
                            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${barberFormData.status === 'busy' ? 'bg-white text-amber-500 shadow-sm' : 'text-slate-400'}`}
                            >
                            忙碌 (Busy)
                            </button>
                            <button 
                            onClick={() => setBarberFormData({...barberFormData, status: 'rest'})}
                            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${barberFormData.status === 'rest' ? 'bg-white text-slate-600 shadow-sm' : 'text-slate-400'}`}
                            >
                            休息 (Rest)
                            </button>
                        </div>
                    </div>
                    
                    {/* NEW FIELDS: Experience & Service Count */}
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">从业经验 (年)</label>
                            <input 
                                type="number"
                                value={barberFormData.experience || ''} 
                                onChange={e => setBarberFormData({...barberFormData, experience: parseInt(e.target.value) || 0})}
                                placeholder="例如: 5"
                                className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 font-bold focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div className="flex-1">
                             <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">服务次数 (自动统计)</label>
                             <div className="w-full bg-slate-100 border-none rounded-xl py-3 px-4 text-slate-500 font-bold flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">analytics</span>
                                {selectedStaff.service_count || 0}
                             </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">个人简介</label>
                        <textarea 
                            value={barberFormData.bio || ''} 
                            onChange={e => setBarberFormData({...barberFormData, bio: e.target.value})}
                            placeholder="请输入理发师的个人简介、设计风格等..."
                            rows={3}
                            className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 text-sm focus:ring-2 focus:ring-primary/20 resize-none"
                        />
                    </div>

                    <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">技能标签</label>
                    <input 
                        defaultValue={barberFormData.specialties?.join(', ')} 
                        onBlur={e => handleTagChange(e.target.value)}
                        placeholder="例如：美式油头, 雕刻"
                        className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 text-sm focus:ring-2 focus:ring-primary/20"
                    />
                    </div>
                    <button 
                        onClick={handleSaveBarber}
                        disabled={!barberFormData.name || isSaving}
                        className={`w-full mt-4 text-white font-bold py-3.5 rounded-2xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${(!barberFormData.name || isSaving) ? 'bg-slate-300 cursor-not-allowed' : 'bg-slate-900'}`}
                    >
                        {isSaving ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                <span>保存中...</span>
                            </>
                        ) : (
                            <span>保存更改</span>
                        )}
                    </button>
                </div>
             )}
             
             {/* EDIT CUSTOMER FORM */}
             {activeModal === 'edit_customer' && selectedCustomer && (
                 <div className="space-y-4">
                     <div className="flex flex-col items-center justify-center mb-2">
                        <div className="relative group">
                            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-slate-50 shadow-md bg-slate-100">
                                <img 
                                    src={customerFormData.avatar || 'https://via.placeholder.com/150'} 
                                    alt="Avatar Preview" 
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <label 
                                htmlFor="cust-avatar-upload" 
                                className="absolute bottom-0 right-0 w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:bg-primary transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">photo_camera</span>
                            </label>
                            <input 
                                id="cust-avatar-upload" 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={handleCustomerAvatarUpload}
                            />
                        </div>
                    </div>

                     <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">昵称 (Nickname)</label>
                        <input 
                            value={customerFormData.name} 
                            onChange={e => setCustomerFormData({...customerFormData, name: e.target.value})}
                            className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 font-bold focus:ring-2 focus:ring-primary/20"
                        />
                     </div>
                     <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">真实姓名 (Real Name)</label>
                        <input 
                            value={customerFormData.realName || ''} 
                            onChange={e => setCustomerFormData({...customerFormData, realName: e.target.value})}
                            placeholder="未设置"
                            className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 focus:ring-2 focus:ring-primary/20"
                        />
                     </div>
                     <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">手机号 (Phone)</label>
                        <input 
                            value={customerFormData.phone || ''} 
                            onChange={e => setCustomerFormData({...customerFormData, phone: e.target.value})}
                            type="tel"
                            className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 focus:ring-2 focus:ring-primary/20 font-mono"
                        />
                     </div>
                     <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">邮箱 (Email)</label>
                        <input 
                            value={customerFormData.email || ''} 
                            onChange={e => setCustomerFormData({...customerFormData, email: e.target.value})}
                            type="email"
                            className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 focus:ring-2 focus:ring-primary/20"
                        />
                     </div>

                     <button 
                        onClick={handleSaveCustomer}
                        disabled={isSaving}
                        className="w-full mt-6 bg-slate-900 text-white font-bold py-3.5 rounded-2xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                         {isSaving ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                <span>保存中...</span>
                            </>
                        ) : (
                            <span>保存顾客信息</span>
                        )}
                    </button>
                 </div>
             )}

             {/* SCHEDULE FORM */}
             {activeModal === 'schedule' && selectedStaff && (
                 <div className="text-center">
                     <div className="flex items-center justify-center gap-2 mb-6">
                         <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                            <img src={selectedStaff.image} className="w-5 h-5 rounded-full object-cover"/>
                            <span className="text-sm font-bold text-slate-700">{selectedStaff.name}</span>
                         </div>
                         <span className="text-sm text-slate-400 font-medium">10月排班</span>
                     </div>

                     <div className="flex justify-end gap-3 mb-3 px-1">
                        <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-status-ready"></span>
                            <span className="text-[10px] text-slate-400 font-bold">工作</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-slate-200"></span>
                            <span className="text-[10px] text-slate-400 font-bold">休息</span>
                        </div>
                     </div>

                     <div className="grid grid-cols-7 gap-2 mb-6 select-none">
                         {['一','二','三','四','五','六','日'].map(d => <span key={d} className="text-xs font-bold text-slate-400 py-1">{d}</span>)}
                         
                         {Array.from({length: 6}).map((_, i) => <div key={`empty-${i}`}></div>)}

                         {Array.from({length: 31}).map((_, i) => {
                             const day = i + 1;
                             const isWork = scheduleDays.includes(day);
                             return (
                                 <button 
                                     key={day} 
                                     onClick={() => toggleScheduleDay(day)}
                                     className={`h-9 rounded-xl text-sm font-bold flex items-center justify-center transition-all active:scale-95 duration-200
                                         ${isWork 
                                             ? 'bg-status-ready text-white shadow-md shadow-green-200' 
                                             : 'bg-slate-50 text-slate-300 hover:bg-slate-100'}`}
                                 >
                                     {day}
                                 </button>
                             )
                         })}
                     </div>
                     
                     <div className="bg-slate-50 rounded-2xl p-3 mb-4 flex justify-between items-center border border-slate-100">
                        <span className="text-xs font-bold text-slate-500">本月出勤天数</span>
                        <span className="text-lg font-bold text-slate-900">{scheduleDays.length} <span className="text-xs font-medium text-slate-400">天</span></span>
                     </div>

                     <button 
                        onClick={handleSaveSchedule} 
                        disabled={isSaving}
                        className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                     >
                        {isSaving ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                <span>保存中...</span>
                            </>
                        ) : (
                            <span>保存排班设置</span>
                        )}
                     </button>
                 </div>
             )}

             {/* QR FORM */}
             {activeModal === 'qr' && selectedStaff && (
                 <div className="flex flex-col items-center">
                     <div className="w-48 h-48 bg-slate-900 rounded-2xl mb-4 p-2">
                         <img className="w-full h-full rounded-xl opacity-90" src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=barber:${selectedStaff.id}`} alt="QR"/>
                     </div>
                     <p className="font-bold text-lg">{selectedStaff.name}</p>
                     <p className="text-slate-400 text-xs mb-6">扫码直接预约该理发师</p>
                     <div className="flex gap-3 w-full">
                        <button className="flex-1 bg-slate-100 text-slate-900 font-bold py-3 rounded-xl">分享</button>
                        <button className="flex-1 bg-primary text-white font-bold py-3 rounded-xl">保存图片</button>
                     </div>
                 </div>
             )}
          </div>
        </div>
      )}

      <BottomNav activeRoute="admin_management" onNavigate={onNavigate} userRole="admin" />
    </Layout>
  );
}