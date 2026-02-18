
import React, { useState } from 'react';
import { Layout } from '../components/Layout';
import { PageRoute, User } from '../types';
import { supabase } from '../services/supabase';

interface Props {
  onNavigate: (route: PageRoute) => void;
  onLogin: (user: User) => void;
}

const hashPassword = async (pwd: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(pwd);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
};

export const Login: React.FC<Props> = ({ onNavigate, onLogin }) => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async () => {
    if (!phone || !password) { setErrorMsg('请输入手机号和密码'); return; }
    setIsLoading(true); setErrorMsg('');
    try {
      const hashedPassword = await hashPassword(password);
      const { data, error } = await supabase.from('app_customers').select('*').eq('phone', phone).eq('password_hash', hashedPassword).single();
      if (error || !data) throw new Error('手机号或密码错误');
      const user: User = { id: data.id, name: data.name, role: 'customer', avatar: data.avatar, phone: data.phone, realName: data.real_name, email: data.email };
      setTimeout(() => { setIsLoading(false); onLogin(user); }, 600);
    } catch (err: any) { setIsLoading(false); setErrorMsg(err.message || '登录失败'); }
  };

  return (
    <Layout className="bg-white">
      <header className="pt-8 pb-2 px-8 sticky top-0 bg-white z-40 flex items-center">
         <button onClick={() => onNavigate('launcher')} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-800 active:scale-90 transition-all -ml-2">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
         </button>
      </header>

      <main className="px-10 pt-4 pb-12 flex flex-col h-full animate-fade-in">
        <div className="mb-8">
            <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tighter">尊享会员登录</h1>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Login to manage your experience</p>
        </div>

        <div className="space-y-5">
            <div className="group">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em] block mb-1.5 px-1">手机号码 / MOBILE</label>
                <div className="relative">
                    <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-primary transition-colors text-[20px]">smartphone</span>
                    <input 
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="请输入手机号"
                        className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-14 pr-6 text-slate-900 font-bold focus:ring-4 focus:ring-primary/10 placeholder:font-bold placeholder:text-slate-200 transition-all text-sm"
                    />
                </div>
            </div>

            <div className="group">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em] block mb-1.5 px-1">安全密码 / PASSWORD</label>
                <div className="relative">
                    <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-primary transition-colors text-[20px]">lock</span>
                    <input 
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="请输入密码"
                        className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-14 pr-6 text-slate-900 font-bold focus:ring-4 focus:ring-primary/10 placeholder:font-bold placeholder:text-slate-200 transition-all text-sm"
                    />
                </div>
                <div className="flex justify-end mt-2">
                    <button className="text-[10px] font-black text-primary uppercase tracking-widest hover:opacity-70 transition-opacity">忘记密码?</button>
                </div>
            </div>
        </div>

        {errorMsg && (
            <div className="mt-4 p-3 bg-red-50 rounded-xl flex items-center gap-2 text-red-500 text-[10px] font-black uppercase animate-shake border border-red-100">
                <span className="material-symbols-outlined text-base">error</span>
                {errorMsg}
            </div>
        )}

        <button onClick={handleLogin} disabled={isLoading} className="w-full mt-8 bg-slate-900 text-white font-black py-4 rounded-2xl shadow-xl shadow-slate-200 active:scale-[0.96] transition-all disabled:opacity-70 flex items-center justify-center gap-3 text-sm tracking-[0.15em]">
            {isLoading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : <> <span>立即进入系统</span> <span className="material-symbols-outlined text-[18px]">login</span> </>}
        </button>

        <div className="mt-auto pt-10 pb-4 text-center">
             <div className="flex items-center justify-center gap-3 text-[13px] font-bold">
                <span className="text-slate-400">还没有账号?</span>
                <button onClick={() => onNavigate('register')} className="text-primary font-black uppercase tracking-widest border-b border-primary/20 pb-0.5">立即注册</button>
             </div>
             <p className="text-[9px] text-slate-300 font-black uppercase tracking-[0.2em] mt-8">BarberBook Pro v1.5.5</p>
        </div>
      </main>
    </Layout>
  );
};
