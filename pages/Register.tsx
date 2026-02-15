import React, { useState } from 'react';
import { Layout } from '../components/Layout';
import { PageRoute, User } from '../types';
import { supabase } from '../services/supabase';

interface Props {
  onNavigate: (route: PageRoute) => void;
  onRegister: (user: User) => void;
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

export const Register: React.FC<Props> = ({ onNavigate, onRegister }) => {
  const [formData, setFormData] = useState({
    nickname: '',
    realName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
    avatar: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, avatar: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    // Basic validation
    if (!formData.nickname || !formData.phone || !formData.password) {
        setErrorMsg('请填写必填项（昵称、手机号、密码）');
        return;
    }
    if (formData.password !== formData.confirmPassword) {
        setErrorMsg('两次输入的密码不一致');
        return;
    }

    setIsLoading(true);

    try {
        // Hash the password before sending to DB
        const hashedPassword = await hashPassword(formData.password);

        // 1. Prepare Data
        const dbPayload = {
            name: formData.nickname,
            real_name: formData.realName,
            phone: formData.phone,
            email: formData.email,
            avatar: formData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.nickname)}&background=random`,
            password_hash: hashedPassword
        };

        // 2. Insert into Database
        const { data, error } = await supabase
            .from('app_customers')
            .insert(dbPayload)
            .select()
            .single();

        if (error) {
            // Handle duplicate phone number
            if (error.code === '23505') {
                throw new Error('该手机号已被注册');
            }
            throw error;
        }

        // Handle Mock Mode or DB response
        // If data is null (Mock mode), use payload + generated ID
        const finalData = data ? data : { ...dbPayload, id: 'mock_' + Date.now() };

        // 3. Log the action
        await supabase.from('app_logs').insert({
            user: finalData.name,
            role: 'customer',
            action: '用户注册',
            details: `新用户注册: ${finalData.phone}`,
            type: 'info',
            avatar: finalData.avatar
        });

        // 4. Map DB response to User type and Login
        const newUser: User = {
            id: finalData.id,
            name: finalData.name,
            role: 'customer',
            avatar: finalData.avatar,
            phone: finalData.phone,
            realName: finalData.real_name, // Map DB snake_case to camelCase
            email: finalData.email
        };
        
        // Simulating network delay for UX smoothness if DB is too fast
        setTimeout(() => {
            setIsLoading(false);
            onRegister(newUser);
        }, 500);

    } catch (err: any) {
        console.error('Registration error:', err);
        setIsLoading(false);
        setErrorMsg(err.message || '注册失败，请稍后再试');
    }
  };

  return (
    <Layout className="bg-white">
      <header className="pt-12 pb-4 px-6 sticky top-0 bg-white z-40 border-b border-gray-100 flex items-center">
         <button 
           onClick={() => onNavigate('launcher')}
           className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-50 transition-colors -ml-2"
         >
            <span className="material-symbols-outlined text-slate-800">arrow_back</span>
         </button>
         <h1 className="text-lg font-bold text-slate-900 ml-2">注册新账号</h1>
      </header>

      <main className="p-6 pb-20 overflow-y-auto">
        {/* Avatar Upload */}
        <div className="flex flex-col items-center justify-center mb-8">
            <div className="relative group">
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-slate-50 shadow-md bg-slate-100">
                    {formData.avatar ? (
                        <img 
                            src={formData.avatar} 
                            alt="Avatar Preview" 
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                             <span className="material-symbols-outlined text-4xl">person</span>
                        </div>
                    )}
                </div>
                <label 
                    htmlFor="reg-avatar-upload" 
                    className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:bg-blue-600 transition-colors"
                >
                    <span className="material-symbols-outlined text-sm">photo_camera</span>
                </label>
                <input 
                    id="reg-avatar-upload" 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleAvatarChange}
                />
            </div>
            <p className="text-xs text-slate-400 mt-2">上传头像 (可选)</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
            <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">昵称 <span className="text-red-500">*</span></label>
                <input 
                    type="text"
                    value={formData.nickname}
                    onChange={e => setFormData({...formData, nickname: e.target.value})}
                    placeholder="请输入您的昵称"
                    className="w-full bg-slate-50 border-none rounded-xl py-3.5 px-4 text-slate-900 font-bold focus:ring-2 focus:ring-primary/20 placeholder:font-normal"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">真实姓名</label>
                    <input 
                        type="text"
                        value={formData.realName}
                        onChange={e => setFormData({...formData, realName: e.target.value})}
                        placeholder="可选"
                        className="w-full bg-slate-50 border-none rounded-xl py-3.5 px-4 text-slate-900 font-medium focus:ring-2 focus:ring-primary/20 placeholder:font-normal"
                    />
                 </div>
                 <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">手机号码 <span className="text-red-500">*</span></label>
                    <input 
                        type="tel"
                        value={formData.phone}
                        onChange={e => setFormData({...formData, phone: e.target.value})}
                        placeholder="11位手机号"
                        className="w-full bg-slate-50 border-none rounded-xl py-3.5 px-4 text-slate-900 font-medium focus:ring-2 focus:ring-primary/20 placeholder:font-normal"
                    />
                 </div>
            </div>

            <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">电子邮箱</label>
                <input 
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    placeholder="example@mail.com (可选)"
                    className="w-full bg-slate-50 border-none rounded-xl py-3.5 px-4 text-slate-900 font-medium focus:ring-2 focus:ring-primary/20 placeholder:font-normal"
                />
            </div>

            <div className="border-t border-dashed border-gray-200 my-2 pt-2"></div>

            <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">密码 <span className="text-red-500">*</span></label>
                <input 
                    type="password"
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    placeholder="设置登录密码"
                    className="w-full bg-slate-50 border-none rounded-xl py-3.5 px-4 text-slate-900 font-medium focus:ring-2 focus:ring-primary/20 placeholder:font-normal"
                />
            </div>

            <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">确认密码 <span className="text-red-500">*</span></label>
                <input 
                    type="password"
                    value={formData.confirmPassword}
                    onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                    placeholder="请再次输入密码"
                    className="w-full bg-slate-50 border-none rounded-xl py-3.5 px-4 text-slate-900 font-medium focus:ring-2 focus:ring-primary/20 placeholder:font-normal"
                />
            </div>

            {errorMsg && (
                <div className="p-3 bg-red-50 rounded-xl flex items-center gap-2 text-red-500 text-xs font-bold animate-pulse">
                    <span className="material-symbols-outlined text-sm">error</span>
                    {errorMsg}
                </div>
            )}

            <button 
                type="submit"
                disabled={isLoading}
                className="w-full mt-10 bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl shadow-slate-200 active:scale-[0.98] transition-all disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2"
            >
                {isLoading ? (
                    <>
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    <span>注册中...</span>
                    </>
                ) : (
                    <>
                    <span>立即注册</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </>
                )}
            </button>
        </form>
        
        <p className="text-center text-xs text-slate-400 mt-6">
            注册即代表您同意 <span className="text-primary font-bold">服务条款</span> 和 <span className="text-primary font-bold">隐私政策</span>
        </p>
      </main>
    </Layout>
  );
};