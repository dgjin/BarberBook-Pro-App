import React, { useState } from 'react';
import { Layout } from '../components/Layout';
import { PageRoute, User } from '../types';
import { supabase } from '../services/supabase';

interface Props {
  onNavigate: (route: PageRoute) => void;
  onLogin: (user: User) => void;
}

// Client-side hashing helper (SHA-256)
const hashPassword = async (pwd: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(pwd);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};

// CHANGELOG CONTENT MAPPING (Simulating reading doc/changelog.md)
const CHANGELOG_CONTENT = `
# 系统更新日志 (Changelog)

## v1.1.6 (2023-10-31)
- **安全升级**: 用户密码现已采用 SHA-256 哈希加密存储，提升账号安全性。
- **演示数据**: 更新了演示账号的验证机制。

## v1.1.5 (2023-10-30)
- **修复**: 强制应用优先连接后端数据库，优化 Mock 模式回退逻辑。

## v1.1.4 (2023-10-29)
- **核心修复**: 默认数据库自动链接，支持全功能内存数据库。
- **体验升级**: 演示模式支持完整业务闭环。

## v1.1.3 (2023-10-28)
- **排队算法**: 仅统计已到店客户。
`;

export const Login: React.FC<Props> = ({ onNavigate, onLogin }) => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showChangelog, setShowChangelog] = useState(false);

  const handleLogin = async () => {
    if (!phone || !password) {
      setErrorMsg('请输入手机号和密码');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      // Hash the password input to match stored hash
      const hashedPassword = await hashPassword(password);

      // Query database for matching phone and hashed password
      const { data, error } = await supabase
        .from('app_customers')
        .select('*')
        .eq('phone', phone)
        .eq('password_hash', hashedPassword)
        .single();

      if (error || !data) {
        throw new Error('手机号或密码错误');
      }

      // Log login action
      await supabase.from('app_logs').insert({
        user: data.name,
        role: 'customer',
        action: '用户登录',
        details: `用户 ${data.name} 登录成功`,
        type: 'info',
        avatar: data.avatar
      });

      // Map DB data to User object
      const user: User = {
        id: data.id,
        name: data.name,
        role: 'customer',
        avatar: data.avatar,
        phone: data.phone,
        realName: data.real_name,
        email: data.email
      };

      // Simulate slight delay for UX
      setTimeout(() => {
        setIsLoading(false);
        onLogin(user);
      }, 500);

    } catch (err: any) {
      console.error('Login error:', err);
      setIsLoading(false);
      setErrorMsg(err.message || '登录失败，请稍后重试');
    }
  };

  const handleMockLogin = () => {
      // Shortcut for demo purposes
      setPhone('13888888888');
      setPassword('123456'); // Will be hashed by handleLogin
  };

  return (
    <Layout className="bg-white">
      <header className="pt-12 pb-4 px-6 sticky top-0 bg-white z-40 flex items-center">
         <button 
           onClick={() => onNavigate('launcher')}
           className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-50 transition-colors -ml-2"
         >
            <span className="material-symbols-outlined text-slate-800">arrow_back</span>
         </button>
      </header>

      <main className="px-8 pt-4 pb-20 overflow-y-auto flex flex-col h-full">
        <div className="mb-10">
            <h1 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">欢迎回来</h1>
            <p className="text-slate-500 text-sm">登录以管理您的预约和会员权益</p>
        </div>

        <div className="space-y-6">
            <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">手机号码</label>
                <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">smartphone</span>
                    <input 
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="请输入手机号"
                        className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-4 text-slate-900 font-bold focus:ring-2 focus:ring-primary/20 placeholder:font-normal placeholder:text-slate-400 transition-all"
                    />
                </div>
            </div>

            <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">密码</label>
                <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">lock</span>
                    <input 
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="请输入密码"
                        className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-4 text-slate-900 font-bold focus:ring-2 focus:ring-primary/20 placeholder:font-normal placeholder:text-slate-400 transition-all"
                    />
                </div>
                <div className="flex justify-end mt-2">
                    <button className="text-xs font-bold text-primary hover:opacity-80">忘记密码?</button>
                </div>
            </div>
        </div>

        {errorMsg && (
            <div className="mt-4 p-3 bg-red-50 rounded-xl flex items-center gap-2 text-red-500 text-xs font-bold animate-pulse">
                <span className="material-symbols-outlined text-sm">error</span>
                {errorMsg}
            </div>
        )}

        <button 
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full mt-10 bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl shadow-slate-200 active:scale-[0.98] transition-all disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2"
        >
            {isLoading ? (
                <>
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>登录中...</span>
                </>
            ) : (
                <>
                  <span>立即登录</span>
                  <span className="material-symbols-outlined text-sm">login</span>
                </>
            )}
        </button>

        <div className="mt-auto pb-8 text-center space-y-4">
             {/* Demo helper */}
             <button onClick={handleMockLogin} className="text-[10px] text-slate-300 font-medium">填入演示账号</button>
             
             <div className="flex items-center justify-center gap-2 text-sm">
                <span className="text-slate-500">还没有账号?</span>
                <button 
                    onClick={() => onNavigate('register')}
                    className="text-primary font-bold hover:underline"
                >
                    立即注册
                </button>
             </div>
             
             {/* Version Link */}
             <div className="pt-4 border-t border-dashed border-gray-100">
                <button 
                    onClick={() => setShowChangelog(true)}
                    className="text-[10px] text-slate-300 font-mono hover:text-primary transition-colors"
                >
                    System Version v1.1.6
                </button>
             </div>
        </div>
      </main>

      {/* Changelog Modal */}
      {showChangelog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowChangelog(false)}></div>
              <div className="relative bg-white w-full max-w-md rounded-[32px] p-0 shadow-2xl max-h-[80vh] flex flex-col animate-[scale-in_0.2s_ease-out]">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50 rounded-t-[32px]">
                      <h2 className="text-lg font-bold text-slate-900">系统更新日志</h2>
                      <button onClick={() => setShowChangelog(false)} className="w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-sm text-slate-500">
                          <span className="material-symbols-outlined text-lg">close</span>
                      </button>
                  </div>
                  <div className="p-6 overflow-y-auto text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                      {CHANGELOG_CONTENT}
                  </div>
                  <div className="p-4 border-t border-gray-100 bg-white rounded-b-[32px]">
                      <button onClick={() => setShowChangelog(false)} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl">关闭</button>
                  </div>
              </div>
          </div>
      )}
    </Layout>
  );
};