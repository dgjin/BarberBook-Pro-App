import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { BottomNav } from '../../components/BottomNav';
import { PageRoute, ServiceItem } from '../../types';
import { supabase } from '../../services/supabase';

interface Props {
  onNavigate: (route: PageRoute) => void;
}

export const Settings: React.FC<Props> = ({ onNavigate }) => {
  // State for interactive settings
  const [serviceDuration, setServiceDuration] = useState<number>(45);
  const [maxAppointments, setMaxAppointments] = useState<number>(24);
  const [openTime, setOpenTime] = useState<string>("09:00");
  const [closeTime, setCloseTime] = useState<string>("21:00");
  
  // Service Menu State
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingService, setEditingService] = useState<Partial<ServiceItem> | null>(null);
  
  // Data Config States
  const [autoBackup, setAutoBackup] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // System Config Loading/Saving
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);

  // Update Log State
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateVersion, setUpdateVersion] = useState('');
  const [updateContent, setUpdateContent] = useState('');

  // Default values
  const defaultUrl = 'https://ggqyitnxjcbulitacogg.supabase.co';
  const defaultKey = 'sb_publishable_HeSdC3qng_IfFMZjdiQHkA_DEqRdivF';
  
  // Database Config Modal State
  const [showDbModal, setShowDbModal] = useState(false);
  const [dbUrl, setDbUrl] = useState(localStorage.getItem('barber_supabase_url') || process.env.SUPABASE_URL || defaultUrl);
  const [dbKey, setDbKey] = useState(localStorage.getItem('barber_supabase_key') || process.env.SUPABASE_ANON_KEY || defaultKey);

  // Check if connected via Env or LocalStorage, or falling back to default valid config
  const isSupabaseConnected = !!(dbUrl && dbKey);

  // Icon options for services
  const iconOptions = ['content_cut', 'face', 'spa', 'palette', 'colorize', 'wash', 'healing', 'content_paste'];

  // Load System Settings on Mount
  useEffect(() => {
    const fetchSystemSettings = async () => {
        setIsLoadingSettings(true);
        try {
            // Fetch Global Config
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'global_config')
                .single();
            
            if (data && data.value) {
                const config = data.value;
                if(config.openTime) setOpenTime(config.openTime);
                if(config.closeTime) setCloseTime(config.closeTime);
                if(config.serviceDuration) setServiceDuration(config.serviceDuration);
                if(config.maxAppointments) setMaxAppointments(config.maxAppointments);
            }

            // Fetch Services
            const { data: servicesData } = await supabase
                .from('app_services')
                .select('*')
                .order('price', { ascending: true });
            
            if (servicesData) {
                setServices(servicesData);
            }
        } catch (e) {
            console.error("Failed to load settings", e);
        } finally {
            setIsLoadingSettings(false);
        }
    };
    
    // Attempt to fetch only if connected
    if (isSupabaseConnected) {
        fetchSystemSettings();
    }
  }, [isSupabaseConnected]);

  const handleIncrement = () => setMaxAppointments(prev => prev + 1);
  const handleDecrement = () => setMaxAppointments(prev => prev > 0 ? prev - 1 : 0);

  const handleClearCache = () => {
    if(confirm('确定要清除本地缓存数据吗？这将重新加载所有数据。')) {
        setIsClearing(true);
        setTimeout(() => setIsClearing(false), 1500);
    }
  };

  const handleSync = () => {
      setIsSyncing(true);
      setTimeout(() => setIsSyncing(false), 2000);
  };

  const safeShowPicker = (e: React.MouseEvent<HTMLInputElement>) => {
    try {
        if (typeof e.currentTarget.showPicker === 'function') {
            e.currentTarget.showPicker();
        }
    } catch (err) {
        // Ignore if not supported or failed
        console.debug('showPicker not supported', err);
    }
  };

  // Save Operating Hours & Service Rules to DB
  const handleSaveSystemConfig = async () => {
    if (openTime >= closeTime) {
        alert('配置错误：营业结束时间必须晚于开始时间。');
        return;
    }

    setIsSavingSettings(true);
    const configPayload = {
        openTime,
        closeTime,
        serviceDuration,
        maxAppointments
    };
    
    try {
        const { error } = await supabase
            .from('app_settings')
            .upsert({ key: 'global_config', value: configPayload });
            
        if (error) throw error;
        
        setShowSaveToast(true);
        setTimeout(() => setShowSaveToast(false), 2500);
    } catch (err: any) {
        if (err.message && err.message.includes('app_settings')) {
             alert('保存失败: 数据库缺少 app_settings 表。请在 Supabase SQL Editor 中运行最新的 schema 脚本。');
        } else {
             alert('保存失败: ' + err.message);
        }
    } finally {
        setIsSavingSettings(false);
    }
  };

  // Service Management Handlers
  const handleAddService = () => {
      setEditingService({ name: '', price: 88, duration: 45, icon: 'content_cut' });
      setShowServiceModal(true);
  };

  const handleEditService = (service: ServiceItem) => {
      setEditingService({ ...service });
      setShowServiceModal(true);
  };

  const handleDeleteService = async (id: number | string) => {
      if (!confirm('确定要删除该服务项目吗？')) return;
      
      const { error } = await supabase.from('app_services').delete().eq('id', id);
      if (error) {
          alert('删除失败: ' + error.message);
      } else {
          setServices(prev => prev.filter(s => s.id !== id));
      }
  };

  const handleSaveService = async () => {
      if (!editingService || !editingService.name) return;
      setIsSavingSettings(true);

      const payload = {
          name: editingService.name,
          price: Number(editingService.price),
          duration: Number(editingService.duration),
          icon: editingService.icon || 'content_cut'
      };

      try {
          if (editingService.id) {
              // Update
              const { error } = await supabase.from('app_services').update(payload).eq('id', editingService.id);
              if (error) throw error;
          } else {
              // Insert
              const { error } = await supabase.from('app_services').insert(payload);
              if (error) throw error;
          }

          // Refresh list
          const { data } = await supabase.from('app_services').select('*').order('price', { ascending: true });
          if (data) setServices(data);
          
          setShowServiceModal(false);
          setEditingService(null);
      } catch (err: any) {
          alert('保存服务失败: ' + err.message);
      } finally {
          setIsSavingSettings(false);
      }
  };

  // Publish Update Log
  const handlePublishUpdate = async () => {
      if (!updateVersion || !updateContent) {
          alert("请输入版本号和更新内容");
          return;
      }
      
      setIsSavingSettings(true);
      try {
          const { error } = await supabase.from('app_logs').insert({
              user: 'System Admin',
              role: 'system',
              action: `系统更新 ${updateVersion}`,
              details: updateContent,
              type: 'info',
              avatar: 'https://ui-avatars.com/api/?name=System&background=000&color=fff' 
          });

          if (error) throw error;

          alert("更新日志发布成功！");
          setShowUpdateModal(false);
          setUpdateVersion('');
          setUpdateContent('');
      } catch (e: any) {
          alert("发布失败: " + e.message);
      } finally {
          setIsSavingSettings(false);
      }
  };

  // Save DB Credentials to LocalStorage
  const saveDbConfig = () => {
      if (dbUrl.trim()) localStorage.setItem('barber_supabase_url', dbUrl.trim());
      else localStorage.removeItem('barber_supabase_url');
      
      if (dbKey.trim()) localStorage.setItem('barber_supabase_key', dbKey.trim());
      else localStorage.removeItem('barber_supabase_key');
      
      localStorage.setItem('app_last_route', 'admin_settings');
      window.location.reload();
  };

  const resetDbConfig = () => {
      if(confirm('确定要重置数据库配置吗？这将恢复为系统默认配置。')) {
        localStorage.removeItem('barber_supabase_url');
        localStorage.removeItem('barber_supabase_key');
        localStorage.setItem('app_last_route', 'admin_settings');
        window.location.reload();
      }
  };

  return (
    <Layout>
      {/* Save Success Toast */}
      <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[70] transition-all duration-300 ${showSaveToast ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0'}`}>
        <div className="bg-slate-900 text-white px-4 py-2 rounded-full shadow-lg text-sm font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-green-400 text-lg">check_circle</span>
            系统配置已保存
        </div>
      </div>

      <header className="sticky top-0 z-50 bg-white/80 ios-blur border-b border-gray-100 pt-12 pb-3 px-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">系统参数配置</h1>
        <div className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${isSupabaseConnected ? 'bg-status-ready' : 'bg-orange-400'}`}></span>
          <span className="text-[10px] font-medium text-text-secondary uppercase tracking-tight">System {isSupabaseConnected ? 'Online' : 'Local'}</span>
        </div>
      </header>
      
      <main className="flex-1 pb-40 overflow-y-auto p-4 space-y-8">
        
        {/* Operating Hours */}
        <section>
          <div className="px-1 mb-2 flex justify-between items-end">
            <h2 className="text-[13px] font-semibold text-text-secondary uppercase tracking-wider">营业时间设置</h2>
            {isLoadingSettings && <span className="text-[10px] text-slate-400">加载配置中...</span>}
          </div>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">wb_sunny</span>
                <span className="text-base font-medium">开门时间</span>
              </div>
              <div className="relative group">
                <input 
                    className="text-primary font-bold border-none bg-blue-50/50 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-primary/20 cursor-pointer text-right min-w-[100px]" 
                    type="time" 
                    step="1800"
                    value={openTime}
                    onChange={(e) => setOpenTime(e.target.value)}
                    onClick={safeShowPicker}
                />
              </div>
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">dark_mode</span>
                <span className="text-base font-medium">关门时间</span>
              </div>
              <div className="relative group">
                <input 
                    className="text-primary font-bold border-none bg-blue-50/50 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-primary/20 cursor-pointer text-right min-w-[100px]" 
                    type="time" 
                    step="1800"
                    value={closeTime}
                    onChange={(e) => setCloseTime(e.target.value)}
                    onClick={safeShowPicker}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Service Rules */}
        <section>
          <div className="px-1 mb-2">
            <h2 className="text-[13px] font-semibold text-text-secondary uppercase tracking-wider">服务规则配置</h2>
          </div>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 divide-y divide-gray-100">
            <div className="p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">timer</span>
                  <span className="text-base font-medium">单次服务时长 (分钟)</span>
                </div>
              </div>
              <div className="flex bg-gray-100 p-1 rounded-xl">
                {[30, 45, 60].map((duration) => (
                  <button
                    key={duration}
                    onClick={() => setServiceDuration(duration)}
                    className={`flex-1 py-2 text-sm rounded-lg transition-all duration-200 ${
                      serviceDuration === duration
                        ? 'font-bold bg-white text-primary shadow-sm ring-1 ring-black/5'
                        : 'font-medium text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {duration}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">group</span>
                <span className="text-base font-medium">每日最大预约人数</span>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleDecrement}
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-primary active:bg-gray-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-xl">remove</span>
                </button>
                <span className="text-lg font-bold w-8 text-center tabular-nums">{maxAppointments}</span>
                <button 
                  onClick={handleIncrement}
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-primary active:bg-gray-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-xl">add</span>
                </button>
              </div>
            </div>
          </div>

          {/* Save Button for Business Logic */}
          <button 
            onClick={handleSaveSystemConfig}
            disabled={isSavingSettings}
            className="w-full mt-4 bg-primary text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70"
          >
             {isSavingSettings ? (
                <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    <span>保存中...</span>
                </>
             ) : (
                <>
                    <span className="material-symbols-outlined">save</span>
                    <span>保存营业规则配置</span>
                </>
             )}
          </button>
        </section>
        
        {/* Service Menu Management */}
        <section>
          <div className="px-1 mb-2 flex justify-between items-center">
             <h2 className="text-[13px] font-semibold text-text-secondary uppercase tracking-wider">服务套餐管理</h2>
             <button 
               onClick={handleAddService}
               className="text-primary text-xs font-bold flex items-center gap-1 active:scale-95 transition-transform"
             >
                <span className="material-symbols-outlined text-sm">add_circle</span>
                新增套餐
             </button>
          </div>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 divide-y divide-gray-100">
             {services.length > 0 ? services.map((service) => (
                <div key={service.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                   <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500">
                           <span className="material-symbols-outlined">{service.icon}</span>
                       </div>
                       <div>
                           <p className="text-sm font-bold text-slate-900">{service.name}</p>
                           <p className="text-xs text-slate-400">¥{service.price} • {service.duration}分钟</p>
                       </div>
                   </div>
                   <div className="flex items-center gap-1">
                       <button onClick={() => handleEditService(service)} className="p-2 text-slate-400 hover:text-primary transition-colors">
                           <span className="material-symbols-outlined text-[18px]">edit</span>
                       </button>
                       <button onClick={() => handleDeleteService(service.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                           <span className="material-symbols-outlined text-[18px]">delete</span>
                       </button>
                   </div>
                </div>
             )) : (
                 <div className="p-8 text-center">
                     <p className="text-sm text-slate-400">暂无服务套餐，请添加</p>
                 </div>
             )}
          </div>
        </section>

        {/* System & Data Configuration */}
        <section>
          <div className="px-1 mb-2">
            <h2 className="text-[13px] font-semibold text-text-secondary uppercase tracking-wider">版本控制与数据</h2>
          </div>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 divide-y divide-gray-100">
            {/* Database Connection */}
            <div className="p-4 flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isSupabaseConnected ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-500'}`}>
                      <span className="material-symbols-outlined text-lg">database</span>
                  </div>
                  <div>
                      <p className="text-sm font-bold text-slate-900">数据库连接</p>
                      <p className="text-[10px] text-slate-400">{isSupabaseConnected ? 'Supabase (Connected)' : '演示模式 (Mock Mode)'}</p>
                  </div>
               </div>
               <div className="flex items-center gap-2">
                   <div className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${isSupabaseConnected ? 'bg-green-50 text-green-600 border-green-200' : 'bg-orange-50 text-orange-500 border-orange-200'}`}>
                       {isSupabaseConnected ? '已连接' : '未配置'}
                   </div>
                   <button 
                     onClick={() => setShowDbModal(true)}
                     className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                   >
                     <span className="material-symbols-outlined text-sm">settings</span>
                   </button>
               </div>
            </div>

            {/* Auto Backup Toggle */}
            <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => setAutoBackup(!autoBackup)}>
               <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">cloud_sync</span>
                  <span className="text-base font-medium">每日自动备份</span>
               </div>
               <div className={`w-12 h-7 rounded-full relative transition-colors duration-300 ${autoBackup ? 'bg-primary' : 'bg-slate-200'}`}>
                   <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300 ${autoBackup ? 'translate-x-6' : 'translate-x-1'}`}></div>
               </div>
            </div>
            
            {/* Update Log Trigger */}
            <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50" onClick={() => setShowUpdateModal(true)}>
               <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-blue-500">update</span>
                  <span className="text-base font-medium">发布系统更新日志</span>
               </div>
               <span className="material-symbols-outlined text-slate-300">chevron_right</span>
            </div>

            {/* Actions */}
            <div className="p-2 grid grid-cols-2 gap-2 bg-slate-50">
                <button 
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 rounded-xl text-slate-700 font-bold text-xs shadow-sm active:scale-95 transition-all"
                >
                    <span className={`material-symbols-outlined text-lg ${isSyncing ? 'animate-spin' : ''}`}>sync</span>
                    {isSyncing ? '同步中...' : '同步云端数据'}
                </button>
                <button 
                    onClick={handleClearCache}
                    disabled={isClearing}
                    className="flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 rounded-xl text-red-500 font-bold text-xs shadow-sm active:scale-95 transition-all hover:bg-red-50 hover:border-red-100"
                >
                    <span className="material-symbols-outlined text-lg">delete_forever</span>
                    {isClearing ? '清理中...' : '清除本地缓存'}
                </button>
            </div>
          </div>
        </section>

        <button 
           onClick={() => onNavigate('admin_logs')}
           className="w-full bg-slate-900 text-white font-semibold py-4 rounded-2xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined">history</span>
          查看审计日志
        </button>
      </main>

      {/* DB Config Modal */}
      {showDbModal && (
         <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowDbModal(false)}></div>
            <div className="relative bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl animate-[scale-in_0.2s_ease-out]">
                <h2 className="text-xl font-bold text-slate-900 mb-1">数据库连接配置</h2>
                <p className="text-xs text-slate-500 mb-6">配置 Supabase URL 和 Anon Key 以连接云端数据。配置将保存到本地存储。</p>
                
                <div className="space-y-4 mb-6">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Project URL</label>
                        <input 
                            value={dbUrl}
                            onChange={(e) => setDbUrl(e.target.value)}
                            className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-mono text-slate-700 focus:ring-2 focus:ring-primary/20"
                            placeholder="https://your-project.supabase.co"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Anon Key</label>
                        <textarea 
                            value={dbKey}
                            onChange={(e) => setDbKey(e.target.value)}
                            className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-mono text-slate-700 focus:ring-2 focus:ring-primary/20 h-24 resize-none"
                            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                        />
                    </div>
                </div>
                
                <div className="flex gap-3">
                    <button onClick={resetDbConfig} className="flex-1 bg-red-50 text-red-500 font-bold py-3.5 rounded-2xl hover:bg-red-100 transition-colors text-xs">
                        重置默认
                    </button>
                    <button onClick={saveDbConfig} className="flex-[2] bg-primary text-white font-bold py-3.5 rounded-2xl shadow-lg active:scale-95 transition-all">
                        保存并重启
                    </button>
                </div>
                <button onClick={() => setShowDbModal(false)} className="w-full mt-3 text-slate-400 text-xs font-bold py-2">取消</button>
            </div>
         </div>
       )}
       
       {/* Update Log Modal */}
       {showUpdateModal && (
         <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
             <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowUpdateModal(false)}></div>
             <div className="relative bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl animate-[scale-in_0.2s_ease-out]">
                 <div className="flex items-center gap-3 mb-4">
                     <div className="w-10 h-10 rounded-full bg-blue-50 text-primary flex items-center justify-center">
                         <span className="material-symbols-outlined">rocket_launch</span>
                     </div>
                     <div>
                         <h2 className="text-lg font-bold text-slate-900">发布系统更新</h2>
                         <p className="text-xs text-slate-400">记录系统版本变更与维护信息</p>
                     </div>
                 </div>
                 
                 <div className="space-y-4 mb-6">
                     <div>
                         <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">版本号 (Version)</label>
                         <input 
                             value={updateVersion}
                             onChange={(e) => setUpdateVersion(e.target.value)}
                             className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 font-bold focus:ring-2 focus:ring-primary/20"
                             placeholder="v1.0.0"
                         />
                     </div>
                     <div>
                         <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">更新内容 (Changelog)</label>
                         <textarea 
                             value={updateContent}
                             onChange={(e) => setUpdateContent(e.target.value)}
                             className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm text-slate-700 focus:ring-2 focus:ring-primary/20 h-32 resize-none"
                             placeholder="请输入本次更新的详细内容..."
                         />
                     </div>
                 </div>
                 
                 <div className="flex gap-3">
                     <button onClick={() => setShowUpdateModal(false)} className="flex-1 bg-slate-100 text-slate-500 font-bold py-3.5 rounded-2xl hover:bg-slate-200 transition-colors">
                         取消
                     </button>
                     <button onClick={handlePublishUpdate} disabled={isSavingSettings} className="flex-[2] bg-slate-900 text-white font-bold py-3.5 rounded-2xl shadow-lg active:scale-95 transition-all">
                         发布日志
                     </button>
                 </div>
             </div>
         </div>
       )}

      {/* Service Modal */}
      {showServiceModal && editingService && (
         <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowServiceModal(false)}></div>
            <div className="relative bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl animate-[scale-in_0.2s_ease-out]">
                <h2 className="text-xl font-bold text-slate-900 mb-6 text-center">{editingService.id ? '编辑套餐' : '新增服务套餐'}</h2>
                
                <div className="space-y-4 mb-6">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">服务名称</label>
                        <input 
                            value={editingService.name || ''}
                            onChange={(e) => setEditingService({...editingService, name: e.target.value})}
                            placeholder="例如：高级洗剪吹"
                            className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 font-bold focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">价格 (¥)</label>
                            <input 
                                type="number"
                                value={editingService.price || ''}
                                onChange={(e) => setEditingService({...editingService, price: Number(e.target.value)})}
                                className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 font-bold focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">时长 (分钟)</label>
                            <input 
                                type="number"
                                value={editingService.duration || ''}
                                onChange={(e) => setEditingService({...editingService, duration: Number(e.target.value)})}
                                className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 font-bold focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">图标</label>
                        <div className="grid grid-cols-4 gap-2">
                             {iconOptions.map(icon => (
                                 <button
                                    key={icon}
                                    onClick={() => setEditingService({...editingService, icon})}
                                    className={`h-12 rounded-xl flex items-center justify-center transition-all ${editingService.icon === icon ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                                 >
                                     <span className="material-symbols-outlined">{icon}</span>
                                 </button>
                             ))}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button onClick={() => setShowServiceModal(false)} className="flex-1 bg-slate-100 text-slate-500 font-bold py-3.5 rounded-2xl hover:bg-slate-200 transition-colors">
                        取消
                    </button>
                    <button onClick={handleSaveService} disabled={!editingService.name} className="flex-[2] bg-primary text-white font-bold py-3.5 rounded-2xl shadow-lg active:scale-95 transition-all disabled:opacity-50">
                        保存
                    </button>
                </div>
            </div>
         </div>
      )}

      <BottomNav activeRoute="admin_settings" onNavigate={onNavigate} userRole="admin" />
    </Layout>
  );
};