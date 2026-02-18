
import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { BottomNav } from '../../components/BottomNav';
import { PageRoute, ServiceItem, User, Barber } from '../../types';
import { supabase } from '../../services/supabase';

interface Props {
  onNavigate: (route: PageRoute) => void;
  currentUser?: User | null;
  onUpdateUser?: (updates: Partial<User>) => void;
}

export const Settings: React.FC<Props> = ({ onNavigate, currentUser, onUpdateUser }) => {
  // --- Admin State ---
  const [serviceDuration, setServiceDuration] = useState<number>(45);
  const [maxAppointments, setMaxAppointments] = useState<number>(24);
  const [openTime, setOpenTime] = useState<string>("09:00");
  const [closeTime, setCloseTime] = useState<string>("21:00");
  const [services, setServices] = useState<ServiceItem[]>([]);
  
  // --- Barber State ---
  const [barberProfile, setBarberProfile] = useState<Partial<Barber>>({});
  
  // --- Common State ---
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingService, setEditingService] = useState<Partial<ServiceItem> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [showHelpGuide, setShowHelpGuide] = useState(false);

  const iconOptions = [
    'content_cut', 'face', 'spa', 'palette', 
    'colorize', 'wash', 'healing', 'content_paste',
    'person_celebrate', 'brush', 'dry_cleaning', 'soap',
    'hand_scissors', 'styler', 'shower', 'medical_services'
  ];

  const fetchData = async () => {
    if (!currentUser) return;

    try {
        if (currentUser.role === 'admin') {
            const { data: configData } = await supabase.from('app_settings').select('value').eq('key', 'global_config').single();
            if (configData?.value) {
                const config = configData.value;
                if(config.openTime) setOpenTime(config.openTime);
                if(config.closeTime) setCloseTime(config.closeTime);
                if(config.serviceDuration) setServiceDuration(config.serviceDuration);
                if(config.maxAppointments) setMaxAppointments(config.maxAppointments);
            }
            const { data: servicesData } = await supabase.from('app_services').select('*').order('price', { ascending: true });
            if (servicesData) setServices(servicesData);
        } else if (currentUser.role === 'barber' && currentUser.barberId) {
            const { data: barberData } = await supabase.from('app_barbers').select('*').eq('id', currentUser.barberId).single();
            if (barberData) setBarberProfile(barberData);
        }
    } catch (e) { console.error("Fetch Settings Error:", e); }
  };

  useEffect(() => {
    fetchData();
  }, [currentUser]);

  // --- Admin Actions ---
  const handleSaveSystemConfig = async () => {
    if (openTime >= closeTime) { alert('配置错误：营业结束时间必须晚于开始时间。'); return; }
    setIsSaving(true);
    const configPayload = { openTime, closeTime, serviceDuration, maxAppointments };
    try {
        const { error } = await supabase.from('app_settings').upsert({ key: 'global_config', value: configPayload });
        if (error) throw error;
        setShowSaveToast(true);
        setTimeout(() => setShowSaveToast(false), 2500);
    } catch (err: any) { alert('保存失败: ' + err.message); } finally { setIsSaving(false); }
  };

  // --- Barber Actions ---
  const handleSaveBarberProfile = async () => {
    if (!currentUser?.barberId || !barberProfile.name) return;
    setIsSaving(true);
    try {
        const payload = {
            name: barberProfile.name,
            title: barberProfile.title,
            bio: barberProfile.bio,
            specialties: barberProfile.specialties,
            image: barberProfile.image
        };
        const { error } = await supabase.from('app_barbers').update(payload).eq('id', currentUser.barberId);
        if (error) throw error;

        // Sync with Session
        if (onUpdateUser) {
            onUpdateUser({
                name: barberProfile.name,
                avatar: barberProfile.image
            });
        }
        
        setShowSaveToast(true);
        setTimeout(() => setShowSaveToast(false), 2500);
    } catch (e) {
        alert("资料更新失败");
    } finally {
        setIsSaving(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBarberProfile(prev => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Service Actions (Admin Only) ---
  const handleAddService = () => { setEditingService({ name: '', price: 88, duration: 45, icon: 'content_cut' }); setShowServiceModal(true); };
  const handleEditService = (service: ServiceItem) => { setEditingService({ ...service }); setShowServiceModal(true); };
  const handleDeleteService = async (id: number | string) => {
      if (!confirm('确定要删除该服务项目吗？')) return;
      const { error } = await supabase.from('app_services').delete().eq('id', id);
      if (!error) fetchData();
  };

  const handleSaveService = async () => {
      if (!editingService?.name) return;
      setIsSaving(true);
      const payload = { 
        name: editingService.name, 
        price: Number(editingService.price), 
        duration: Number(editingService.duration), 
        icon: editingService.icon || 'content_cut' 
      };
      try {
          if (editingService.id) await supabase.from('app_services').update(payload).eq('id', editingService.id);
          else await supabase.from('app_services').insert(payload);
          await fetchData();
          setShowServiceModal(false);
      } catch (err: any) { alert('操作失败'); } finally { setIsSaving(false); }
  };

  if (!currentUser) return null;

  return (
    <Layout className="bg-bg-main">
      {/* Save Toast */}
      <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[100] transition-all duration-500 transform ${showSaveToast ? 'translate-y-0 opacity-100' : '-translate-y-12 opacity-0'}`}>
        <div className="bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl text-sm font-bold flex items-center gap-3 border border-white/10">
            <span className="material-symbols-outlined text-green-400">check_circle</span>
            {currentUser.role === 'admin' ? '全局配置已同步' : '个人资料已更新'}
        </div>
      </div>

      <header className="sticky top-0 z-50 bg-white/80 ios-blur border-b border-gray-100 pt-12 pb-4 px-6 flex items-center justify-between">
        <div>
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-0.5">
                {currentUser.role === 'admin' ? 'System Config' : 'Barber Profile'}
            </p>
            <h1 className="text-xl font-black tracking-tight text-slate-900">
                {currentUser.role === 'admin' ? '系统全局设置' : '个人资料维护'}
            </h1>
        </div>
        <button onClick={() => setShowHelpGuide(true)} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-primary/10 hover:text-primary transition-all active:scale-95">
            <span className="material-symbols-outlined">help</span>
        </button>
      </header>
      
      <main className="flex-1 pb-40 overflow-y-auto p-5 space-y-8 no-scrollbar">
        {currentUser.role === 'admin' ? (
            <>
                {/* Operating Hours Section */}
                <section className="animate-fade-in">
                    <div className="px-1 mb-3">
                        <h2 className="text-[12px] font-bold text-slate-400 uppercase tracking-widest">基础运营参数</h2>
                    </div>
                    <div className="bg-white rounded-[28px] overflow-hidden shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between p-5 border-b border-gray-100 group">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
                                    <span className="material-symbols-outlined">wb_sunny</span>
                                </div>
                                <span className="text-base font-bold text-slate-700">开门营业时间</span>
                            </div>
                            <input className="text-primary font-black border-none bg-blue-50/50 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary/20 text-center min-w-[120px]" type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
                        </div>
                        <div className="flex items-center justify-between p-5 group">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center group-hover:bg-slate-100 transition-colors">
                                    <span className="material-symbols-outlined">dark_mode</span>
                                </div>
                                <span className="text-base font-bold text-slate-700">打烊关门时间</span>
                            </div>
                            <input className="text-primary font-black border-none bg-blue-50/50 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary/20 text-center min-w-[120px]" type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
                        </div>
                    </div>
                </section>

                {/* Service Management Section */}
                <section className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
                    <div className="px-1 mb-3 flex justify-between items-end">
                        <h2 className="text-[12px] font-bold text-slate-400 uppercase tracking-widest">服务套餐矩阵</h2>
                        <span className="text-[10px] text-primary font-bold bg-blue-50 px-2 py-0.5 rounded">共 {services.length} 个项目</span>
                    </div>
                    <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-gray-100 divide-y divide-gray-50">
                        {services.map((service) => (
                            <div key={service.id} className="p-5 flex items-center justify-between hover:bg-slate-50/80 transition-all group">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-all border border-transparent group-hover:border-primary/20">
                                        <span className="material-symbols-outlined text-[24px]">{service.icon}</span>
                                    </div>
                                    <div>
                                            <div className="text-[15px] font-black text-slate-900 mb-0.5">{service.name}</div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] font-bold text-primary">¥{service.price}</span>
                                                <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                                                <span className="text-[11px] text-slate-400 font-medium">{service.duration} 分钟</span>
                                            </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                        <button onClick={() => handleEditService(service)} className="w-9 h-9 rounded-full bg-blue-50 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all active:scale-90">
                                            <span className="material-symbols-outlined text-[18px]">edit</span>
                                        </button>
                                        <button onClick={() => handleDeleteService(service.id)} className="w-9 h-9 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all active:scale-90">
                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                        </button>
                                </div>
                            </div>
                        ))}
                        <button onClick={handleAddService} className="w-full p-5 text-primary text-sm font-black bg-blue-50/20 flex items-center justify-center gap-3 hover:bg-blue-50 transition-all group active:scale-[0.99]">
                            <span className="material-symbols-outlined text-[20px] transition-transform group-hover:scale-110">add_circle</span> 
                            <span>新增服务项目</span>
                        </button>
                    </div>
                </section>

                <div className="pt-4">
                    <button 
                        onClick={handleSaveSystemConfig} 
                        disabled={isSaving} 
                        className="w-full bg-slate-900 text-white font-black py-4.5 rounded-[24px] shadow-xl shadow-slate-200 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {isSaving ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : <> <span className="material-symbols-outlined">cloud_upload</span> <span>保存并分发全局配置</span> </>}
                    </button>
                </div>
            </>
        ) : (
            <>
                {/* Barber Personal Info Section */}
                <section className="animate-fade-in">
                    <div className="flex flex-col items-center mb-10">
                        <div className="relative group">
                            <div className="w-28 h-28 rounded-[36px] overflow-hidden border-4 border-white shadow-2xl bg-slate-100">
                                {barberProfile.image ? (
                                    <img src={barberProfile.image} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                                        <span className="material-symbols-outlined text-4xl">person</span>
                                    </div>
                                )}
                            </div>
                            <label className="absolute -bottom-2 -right-2 w-10 h-10 bg-primary text-white rounded-2xl flex items-center justify-center cursor-pointer shadow-lg border-4 border-white active:scale-90 transition-all">
                                <span className="material-symbols-outlined text-xl">photo_camera</span>
                                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                            </label>
                        </div>
                        <h2 className="mt-4 text-xl font-black text-slate-900 leading-none">{barberProfile.name || '未设置姓名'}</h2>
                        <p className="mt-2 text-[10px] text-slate-400 font-black uppercase tracking-widest">{barberProfile.title || '发型专家'}</p>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-white rounded-[28px] p-6 shadow-sm border border-gray-100 space-y-6">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-3 px-1">展示姓名 / DISPLAY NAME</label>
                                <input 
                                    type="text" 
                                    value={barberProfile.name || ''} 
                                    onChange={e => setBarberProfile({...barberProfile, name: e.target.value})}
                                    className="w-full bg-slate-50 border-none rounded-2xl py-4 px-5 text-slate-900 font-black focus:ring-4 focus:ring-primary/10 text-sm"
                                    placeholder="您的专业称呼"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-3 px-1">专业职级 / PROFESSIONAL TITLE</label>
                                <input 
                                    type="text" 
                                    value={barberProfile.title || ''} 
                                    onChange={e => setBarberProfile({...barberProfile, title: e.target.value})}
                                    className="w-full bg-slate-50 border-none rounded-2xl py-4 px-5 text-slate-900 font-bold focus:ring-4 focus:ring-primary/10 text-sm"
                                    placeholder="如：技术总监、首席设计师"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-3 px-1">个人简介 / BIOGRAPHY</label>
                                <textarea 
                                    value={barberProfile.bio || ''} 
                                    onChange={e => setBarberProfile({...barberProfile, bio: e.target.value})}
                                    className="w-full bg-slate-50 border-none rounded-2xl py-4 px-5 text-slate-900 font-medium focus:ring-4 focus:ring-primary/10 text-sm h-32 resize-none"
                                    placeholder="简单介绍您的设计风格和从业经历..."
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-3 px-1">擅长领域 / SPECIALTIES</label>
                                <div className="flex flex-wrap gap-2">
                                    {['渐变', '油头', '纹理', '染发', '烫发', '造型', '修容'].map(tag => {
                                        const isSelected = barberProfile.specialties?.includes(tag);
                                        return (
                                            <button 
                                                key={tag}
                                                onClick={() => {
                                                    const current = barberProfile.specialties || [];
                                                    const updated = isSelected ? current.filter(t => t !== tag) : [...current, tag];
                                                    setBarberProfile({...barberProfile, specialties: updated});
                                                }}
                                                className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-tight transition-all ${isSelected ? 'bg-primary text-white shadow-md' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                                            >
                                                {tag}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="pt-4">
                            <button 
                                onClick={handleSaveBarberProfile} 
                                disabled={isSaving || !barberProfile.name} 
                                className="w-full bg-slate-900 text-white font-black py-4.5 rounded-[24px] shadow-xl shadow-slate-200 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                            >
                                {isSaving ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : <> <span className="material-symbols-outlined">verified</span> <span>更新我的品牌资料</span> </>}
                            </button>
                        </div>
                    </div>
                </section>
            </>
        )}
      </main>

      {/* Service Modal (Admin Only) */}
      {showServiceModal && editingService && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-md transition-opacity animate-fade-in" onClick={() => setShowServiceModal(false)}></div>
          <div className="relative bg-white w-full max-w-sm m-4 rounded-[36px] p-7 shadow-2xl animate-[slide-up_0.35s_cubic-bezier(0.16,1,0.3,1)] overflow-y-auto max-h-[92vh] border border-white/20">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">{editingService.id ? '编辑套餐' : '定义新套餐'}</h2>
                </div>
                <button onClick={() => setShowServiceModal(false)} className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors">
                    <span className="material-symbols-outlined text-xl">close</span>
                </button>
            </div>

            <div className="space-y-6">
                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-2 px-1">项目名称</label>
                    <input type="text" value={editingService.name} onChange={e => setEditingService({...editingService, name: e.target.value})} className="w-full bg-slate-50 border-none rounded-[20px] py-4 px-5 font-bold text-slate-900 focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="grid grid-cols-2 gap-5">
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-2 px-1">价格 (¥)</label>
                        <input type="number" value={editingService.price} onChange={e => setEditingService({...editingService, price: Number(e.target.value)})} className="w-full bg-slate-50 border-none rounded-[20px] py-4 px-5 font-mono font-black text-slate-900" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-2 px-1">时长 (MIN)</label>
                        <input type="number" value={editingService.duration} onChange={e => setEditingService({...editingService, duration: Number(e.target.value)})} className="w-full bg-slate-50 border-none rounded-[20px] py-4 px-5 font-mono font-black text-slate-900" />
                    </div>
                </div>
                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-2 px-1">图标</label>
                    <div className="grid grid-cols-4 gap-3 bg-slate-50 p-4 rounded-[28px]">
                        {iconOptions.map(icon => (
                            <button key={icon} onClick={() => setEditingService({...editingService, icon})} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${editingService.icon === icon ? 'bg-primary text-white shadow-lg' : 'bg-white text-slate-400'}`}>
                                <span className="material-symbols-outlined text-[22px]">{icon}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <button onClick={handleSaveService} className="w-full bg-primary text-white font-black py-4.5 rounded-[24px] shadow-2xl active:scale-95 transition-all">保存项目</button>
            </div>
          </div>
        </div>
      )}

      {/* Help Guide Modal */}
      {showHelpGuide && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowHelpGuide(false)}></div>
              <div className="relative bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl animate-[scale-in_0.25s_cubic-bezier(0.34,1.56,0.64,1)]">
                  <div className="flex flex-col items-center text-center mb-8">
                      <div className="w-16 h-16 bg-blue-50 text-primary rounded-[22px] flex items-center justify-center mb-4">
                          <span className="material-symbols-outlined text-3xl">lightbulb</span>
                      </div>
                      <h2 className="text-2xl font-black text-slate-900">
                          {currentUser.role === 'admin' ? '系统运营指引' : '个人品牌建议'}
                      </h2>
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed text-center mb-8">
                      {currentUser.role === 'admin' 
                        ? '管理员可在此调整门店的基础运营时间，以及更新服务套餐。请注意，修改后的配置将影响所有客户的预约时段选择。' 
                        : '发型师的资料将展示在首页和预约页面。完善您的个人简介和擅长领域，能有效提升客户对您的信任度和预约率。'}
                  </p>
                  <button onClick={() => setShowHelpGuide(false)} className="w-full bg-slate-900 text-white font-black py-4 rounded-[20px] shadow-lg active:scale-95 transition-all">
                      我已了解
                  </button>
              </div>
          </div>
      )}

      <BottomNav activeRoute="admin_settings" onNavigate={onNavigate} userRole={currentUser.role} />
    </Layout>
  );
};
