
import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { BottomNav } from '../../components/BottomNav';
import { PageRoute, ServiceItem } from '../../types';
import { supabase } from '../../services/supabase';

interface Props {
  onNavigate: (route: PageRoute) => void;
}

export const Settings: React.FC<Props> = ({ onNavigate }) => {
  const [serviceDuration, setServiceDuration] = useState<number>(45);
  const [maxAppointments, setMaxAppointments] = useState<number>(24);
  const [openTime, setOpenTime] = useState<string>("09:00");
  const [closeTime, setCloseTime] = useState<string>("21:00");
  
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingService, setEditingService] = useState<Partial<ServiceItem> | null>(null);
  
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [showHelpGuide, setShowHelpGuide] = useState(false);

  const iconOptions = [
    'content_cut', 'face', 'spa', 'palette', 
    'colorize', 'wash', 'healing', 'content_paste',
    'person_celebrate', 'brush', 'dry_cleaning', 'soap',
    'hand_scissors', 'styler', 'shower', 'medical_services'
  ];

  const fetchSystemSettings = async () => {
    try {
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
    } catch (e) { console.error("Fetch Settings Error:", e); }
  };

  useEffect(() => {
    fetchSystemSettings();
    
    // 启用实时监听，确保多端同步
    const channel = supabase.channel('settings_realtime_sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_services' }, () => fetchSystemSettings())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, () => fetchSystemSettings())
        .subscribe();
        
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSaveSystemConfig = async () => {
    if (openTime >= closeTime) { alert('配置错误：营业结束时间必须晚于开始时间。'); return; }
    setIsSavingSettings(true);
    const configPayload = { openTime, closeTime, serviceDuration, maxAppointments };
    try {
        const { error } = await supabase.from('app_settings').upsert({ key: 'global_config', value: configPayload });
        if (error) throw error;
        setShowSaveToast(true);
        setTimeout(() => setShowSaveToast(false), 2500);
    } catch (err: any) { alert('保存失败: ' + err.message); } finally { setIsSavingSettings(false); }
  };

  const handleAddService = () => { 
    setEditingService({ name: '', price: 88, duration: 45, icon: 'content_cut' }); 
    setShowServiceModal(true); 
  };

  const handleEditService = (service: ServiceItem) => { 
    setEditingService({ ...service }); 
    setShowServiceModal(true); 
  };

  const handleDeleteService = async (id: number | string) => {
      if (!confirm('确定要删除该服务项目吗？这将导致相关历史记录显示异常。')) return;
      const { error } = await supabase.from('app_services').delete().eq('id', id);
      if (!error) {
          setServices(prev => prev.filter(s => s.id !== id));
          await supabase.from('app_logs').insert({
              user: '管理员',
              role: 'admin',
              action: '删除套餐',
              details: `删除了套餐项目 ID: ${id}`,
              type: 'danger'
          });
      }
  };

  const handleSaveService = async () => {
      if (!editingService?.name) { alert('请输入项目名称'); return; }
      if ((editingService.price || 0) <= 0) { alert('价格必须大于0'); return; }
      if ((editingService.duration || 0) <= 0) { alert('时长必须大于0'); return; }

      setIsSavingSettings(true);
      const payload = { 
        name: editingService.name, 
        price: Number(editingService.price), 
        duration: Number(editingService.duration), 
        icon: editingService.icon || 'content_cut' 
      };
      
      try {
          let error;
          if (editingService.id) {
            const result = await supabase.from('app_services').update(payload).eq('id', editingService.id);
            error = result.error;
          } else {
            const result = await supabase.from('app_services').insert(payload);
            error = result.error;
          }
          
          if (error) throw error;

          await fetchSystemSettings();
          setShowServiceModal(false);
          setEditingService(null);
          
          await supabase.from('app_logs').insert({
              user: '管理员',
              role: 'admin',
              action: editingService.id ? '更新套餐' : '新增套餐',
              details: `${editingService.id ? '修改了' : '新增了'}套餐项目: ${payload.name}`,
              type: 'info'
          });
      } catch (err: any) { 
        alert('操作失败: ' + err.message); 
      } finally { 
        setIsSavingSettings(false); 
      }
  };

  const adminGuides = [
    { label: '理发券管理', content: '进入“人员管理”可为顾客手动充值或核销理发券。系统在完成服务时会自动优先扣除余额。', icon: 'confirmation_number' },
    { label: '系统排班', content: '理发师的工作台会实时显示今日队列。管理员可通过 Dashboard 查看各发型师的饱和度。', icon: 'event_repeat' },
    { label: '实时监控', content: '开启“大屏模式”可获得全屏看板、实时语音播报以及发型师状态实时反馈。', icon: 'desktop_windows' }
  ];

  return (
    <Layout className="bg-bg-main">
      {/* Save Toast */}
      <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[100] transition-all duration-500 transform ${showSaveToast ? 'translate-y-0 opacity-100' : '-translate-y-12 opacity-0'}`}>
        <div className="bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl text-sm font-bold flex items-center gap-3 border border-white/10">
            <span className="material-symbols-outlined text-green-400">check_circle</span>
            全局配置已成功同步
        </div>
      </div>

      <header className="sticky top-0 z-50 bg-white/80 ios-blur border-b border-gray-100 pt-12 pb-4 px-6 flex items-center justify-between">
        <div>
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-0.5">System Config</p>
            <h1 className="text-xl font-black tracking-tight text-slate-900">系统全局设置</h1>
        </div>
        <button onClick={() => setShowHelpGuide(true)} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-primary/10 hover:text-primary transition-all active:scale-95">
            <span className="material-symbols-outlined">help</span>
        </button>
      </header>
      
      <main className="flex-1 pb-40 overflow-y-auto p-5 space-y-8 no-scrollbar">
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
                disabled={isSavingSettings} 
                className="w-full bg-slate-900 text-white font-black py-4.5 rounded-[24px] shadow-xl shadow-slate-200 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
            >
                {isSavingSettings ? (
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                ) : (
                    <>
                        <span className="material-symbols-outlined">cloud_upload</span>
                        <span>保存并分发全局配置</span>
                    </>
                )}
            </button>
            <p className="text-center text-[10px] text-slate-400 font-medium mt-4 leading-relaxed px-10">
                配置更改将实时推送至所有在线客户端。为了保证排队体验，请勿在营业高峰期大幅度修改服务时长。
            </p>
        </div>
      </main>

      {/* Service Modal */}
      {showServiceModal && editingService && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-md transition-opacity animate-fade-in" onClick={() => setShowServiceModal(false)}></div>
          <div className="relative bg-white w-full max-w-sm m-4 rounded-[36px] p-7 shadow-2xl animate-[slide-up_0.35s_cubic-bezier(0.16,1,0.3,1)] overflow-y-auto max-h-[92vh] border border-white/20">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">{editingService.id ? '编辑套餐' : '定义新套餐'}</h2>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">为您的顾客提供更丰富的服务选择</p>
                </div>
                <button onClick={() => setShowServiceModal(false)} className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors">
                    <span className="material-symbols-outlined text-xl">close</span>
                </button>
            </div>

            <div className="space-y-6">
                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-2 px-1">套餐显示名称</label>
                    <input 
                        type="text" 
                        value={editingService.name} 
                        onChange={e => setEditingService({...editingService, name: e.target.value})} 
                        className="w-full bg-slate-50 border-none rounded-[20px] py-4 px-5 font-bold text-slate-900 focus:ring-2 focus:ring-primary/20 placeholder:font-normal" 
                        placeholder="如：美式复古精剪"
                    />
                </div>

                <div className="grid grid-cols-2 gap-5">
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-2 px-1">价格 (¥)</label>
                        <div className="relative">
                            <input 
                                type="number" 
                                value={editingService.price} 
                                onChange={e => setEditingService({...editingService, price: Number(e.target.value)})} 
                                className="w-full bg-slate-50 border-none rounded-[20px] py-4 px-5 font-mono font-black text-slate-900 focus:ring-2 focus:ring-primary/20" 
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-2 px-1">时长 (MIN)</label>
                        <div className="relative">
                            <input 
                                type="number" 
                                value={editingService.duration} 
                                onChange={e => setEditingService({...editingService, duration: Number(e.target.value)})} 
                                className="w-full bg-slate-50 border-none rounded-[20px] py-4 px-5 font-mono font-black text-slate-900 focus:ring-2 focus:ring-primary/20" 
                            />
                        </div>
                    </div>
                </div>

                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-2 px-1">选择识别图标</label>
                    <div className="grid grid-cols-4 gap-3 bg-slate-50/50 p-4 rounded-[28px] border border-slate-100">
                        {iconOptions.map(icon => (
                            <button 
                                key={icon} 
                                onClick={() => setEditingService({...editingService, icon})}
                                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${editingService.icon === icon 
                                    ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-110 ring-4 ring-primary/10' 
                                    : 'bg-white text-slate-400 border border-slate-100 hover:border-primary/30'}`}
                            >
                                <span className="material-symbols-outlined text-[22px]">{icon}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="pt-2">
                    <button 
                        onClick={handleSaveService} 
                        disabled={isSavingSettings || !editingService.name}
                        className="w-full bg-primary text-white font-black py-4.5 rounded-[24px] shadow-2xl shadow-primary/30 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                        {isSavingSettings ? (
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-xl">save</span>
                                <span>{editingService.id ? '更新套餐项目' : '立即发布套餐'}</span>
                            </>
                        )}
                    </button>
                </div>
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
                      <h2 className="text-2xl font-black text-slate-900">系统运营指引</h2>
                      <p className="text-xs text-slate-400 font-medium mt-1">Admin Operation Manual</p>
                  </div>
                  
                  <div className="space-y-5 mb-8">
                      {adminGuides.map((guide, i) => (
                          <div key={i} className="flex gap-4 p-4 bg-slate-50/50 rounded-[24px] border border-slate-100 hover:bg-white hover:shadow-md transition-all">
                              <div className="w-10 h-10 rounded-xl bg-white text-primary flex items-center justify-center shrink-0 shadow-sm border border-slate-100">
                                  <span className="material-symbols-outlined text-xl">{guide.icon}</span>
                              </div>
                              <div className="text-left">
                                  <h4 className="text-[13px] font-black text-slate-900 mb-1">{guide.label}</h4>
                                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium">{guide.content}</p>
                              </div>
                          </div>
                      ))}
                  </div>
                  
                  <button onClick={() => setShowHelpGuide(false)} className="w-full bg-slate-900 text-white font-black py-4 rounded-[20px] shadow-lg shadow-slate-200 active:scale-95 transition-all">
                      我已了解规则
                  </button>
              </div>
          </div>
      )}

      <BottomNav activeRoute="admin_settings" onNavigate={onNavigate} userRole="admin" />
    </Layout>
  );
};
