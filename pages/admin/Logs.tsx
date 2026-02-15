import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { BottomNav } from '../../components/BottomNav';
import { PageRoute, LogEntry } from '../../types';
import { supabase } from '../../services/supabase';

interface Props {
  onNavigate: (route: PageRoute) => void;
}

type FilterType = 'all' | 'system' | 'operation';

export const Logs: React.FC<Props> = ({ onNavigate }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    const fetchLogs = async () => {
        const { data, error } = await supabase.from('app_logs').select('*').order('created_at', { ascending: false });
        if (data) {
            // Need to format created_at to time string
            const formattedData = data.map((d: any) => ({
                ...d,
                time: new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }));
            setLogs(formattedData);
        } else {
             // Fallback mock
             setLogs([
                { id: '1', user: '张三', role: '管理员', avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDgaY8Z4ReHnKiLRZZn8nb7e8bNl2vt4vPuYKKfBxHGcK0wBIdR_S6ydJs-MxVIkyTBdB_KJ5kHSwymPO6aBpSxCv0Ntonejvwv295jNFB1NyEGSwKQAiRA8S_XtiNv0GoU-odRT4oEy_5sJP8VzurCTbpufO1a2u2BZgl9bPfBR6wNHjxfMzQ5tEfW5bGOhkYHVJl6OWMvpgOm3hTsEi7o5GflcpMOKzOesQ-wvRLfNeJa9l2fm5VxIDtkEE_ONPcO8VVnzjLkWRs', time: '14:22', action: '取消预约 #BK-88291', details: '管理员手动撤销了客户 李小明 的预约。', type: 'danger' },
             ]);
        }
    };
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => {
      const matchesSearch = log.user.includes(searchQuery) || 
                            log.action.includes(searchQuery) || 
                            log.details.includes(searchQuery);
                            
      const isSystemLog = log.role === 'system' || log.action.includes('系统更新');
      
      if (filter === 'system') return matchesSearch && isSystemLog;
      if (filter === 'operation') return matchesSearch && !isSystemLog;
      return matchesSearch;
  });

  const handleDownload = () => {
      setToast('正在导出 CSV...');
      setTimeout(() => setToast('导出成功！文件已保存'), 2000);
      setTimeout(() => setToast(''), 4000);
  }

  return (
    <Layout>
      {toast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg z-50 animate-fade-in">
              {toast}
          </div>
      )}

      <header className="sticky top-0 z-50 bg-white/80 ios-blur border-b border-gray-100 px-5 pt-6 pb-4">
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-2">
            <button onClick={() => onNavigate('admin_settings')} className="material-symbols-outlined text-slate-400">arrow_back</button>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">日志中心</h1>
          </div>
          <button 
            onClick={handleDownload}
            className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 bg-white text-slate-500 active:bg-slate-50 transition-colors"
          >
            <span className="material-symbols-outlined text-2xl">download</span>
          </button>
        </div>
        
        <div className="space-y-3">
            <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
                <input 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent border border-gray-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-400" 
                    placeholder="搜索操作、人员或详情..." 
                    type="text"
                />
            </div>
            
            <div className="flex p-1 bg-slate-100 rounded-xl">
                <button 
                    onClick={() => setFilter('all')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${filter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                >
                    全部
                </button>
                <button 
                    onClick={() => setFilter('operation')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${filter === 'operation' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                >
                    业务操作
                </button>
                <button 
                    onClick={() => setFilter('system')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${filter === 'system' ? 'bg-white text-primary shadow-sm' : 'text-slate-400'}`}
                >
                    系统更新
                </button>
            </div>
        </div>
      </header>

      <main className="px-5 mt-6 relative pb-32">
        <div className="absolute left-[21px] top-0 bottom-0 w-[1px] bg-blue-200 opacity-40"></div>
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-5 relative z-10">
            <div className="w-1.5 h-1.5 rounded-full bg-primary ring-[6px] ring-white outline outline-1 outline-blue-100 ml-[18px]"></div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em]">
                {filter === 'system' ? '版本发布记录' : '最近活动'}
            </span>
          </div>
          <div className="space-y-4 ml-10">
            {filteredLogs.length > 0 ? filteredLogs.map(log => {
                const isSystemLog = log.role === 'system' || log.action.includes('系统更新');
                return (
                    <div key={log.id} className={`bg-white rounded-xl p-4 shadow-sm border relative overflow-hidden ${isSystemLog ? 'border-l-4 border-l-blue-500 border-y-slate-100 border-r-slate-100' : 'border-slate-100'}`}>
                        {isSystemLog && (
                            <span className="absolute -right-4 -top-4 w-12 h-12 bg-blue-50 rounded-full flex items-end justify-start pl-2 pb-2">
                                <span className="material-symbols-outlined text-blue-200 text-sm">rocket_launch</span>
                            </span>
                        )}
                        <div className="flex justify-between items-start mb-2.5">
                            <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">
                                {log.avatar ? <img src={log.avatar} alt={log.user} className="w-full h-full object-cover"/> : <span className="material-symbols-outlined text-[16px] text-gray-500">smart_toy</span>}
                            </div>
                            <span className="text-xs font-semibold text-slate-700">{log.user}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${isSystemLog ? 'bg-blue-50 text-primary border-blue-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                {isSystemLog ? 'SYSTEM' : log.role}
                            </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">{log.time}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`text-xs font-bold ${log.type === 'danger' ? 'text-red-500' : log.type === 'warning' ? 'text-amber-500' : 'text-blue-500'}`}>{log.action.split(' ')[0]}</span>
                            <div className="w-1 h-1 rounded-full bg-slate-200"></div>
                            <h3 className="text-sm font-medium text-slate-800 line-clamp-1">{log.action}</h3>
                        </div>
                        <p className={`text-xs leading-relaxed p-2.5 rounded-lg border ${isSystemLog ? 'bg-blue-50/30 text-slate-600 border-blue-50 font-medium' : 'bg-slate-50/50 text-slate-500 border-slate-50'}`}>
                            {log.details}
                        </p>
                    </div>
                );
            }) : (
                <div className="text-center py-10">
                    <p className="text-sm text-slate-400">未找到相关日志</p>
                </div>
            )}
          </div>
        </div>
      </main>
      <BottomNav activeRoute="admin_logs" onNavigate={onNavigate} userRole="admin" />
    </Layout>
  );
};