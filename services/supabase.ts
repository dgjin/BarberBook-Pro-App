
import { createClient } from '@supabase/supabase-js';

// Helper to safely get config
const getSafeConfig = (key: string, envVar: string | undefined) => {
  const val = localStorage.getItem(key) || envVar;
  return val && val.trim().length > 0 ? val.trim() : null;
};

// Default Configuration (Valid placeholders or dev keys)
const DEFAULT_URL = 'https://ggqyitnxjcbulitacogg.supabase.co';
const DEFAULT_KEY = 'sb_publishable_HeSdC3qng_IfFMZjdiQHkA_DEqRdivF';

// Safely access process.env
const getProcessEnv = (key: string) => {
  try {
    return typeof process !== 'undefined' && process.env ? process.env[key] : undefined;
  } catch (e) {
    return undefined;
  }
};

// Retrieve credentials
const supabaseUrl = getSafeConfig('barber_supabase_url', getProcessEnv('SUPABASE_URL')) || DEFAULT_URL;
const supabaseKey = getSafeConfig('barber_supabase_key', getProcessEnv('SUPABASE_ANON_KEY')) || DEFAULT_KEY;

let client: any;

// --- Connection Initialization with Realtime Optimization ---
if (supabaseUrl && supabaseUrl.startsWith('http') && supabaseKey) {
  try {
    client = createClient(supabaseUrl, supabaseKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
        },
        realtime: {
            // WebSocket 稳定性优化参数
            params: {
                eventsPerSecond: 10,
            },
            timeout: 20000, // 增加超时阈值至 20s
            // 默认会自动尝试重连
        }
    });
    console.log(`%c Supabase Client Initialized: ${new URL(supabaseUrl).hostname} `, "background: #34C759; color: #fff; border-radius: 4px; padding: 2px 6px; font-weight: bold;");
  } catch (e) {
    console.error("Supabase Client Initialization Failed:", e);
  }
}

// --- Enhanced Mock Database with Realtime Simulation ---
if (!client) {
  console.warn("%c No valid Supabase credentials. Running in Enhanced Mock Mode. ", "background: #FF3B30; color: #fff; border-radius: 4px; padding: 2px 6px; font-weight: bold;");
  
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  // Internal Mock DB State
  const mockDb: Record<string, any[]> = {
    app_barbers: [
      { id: 1, name: 'Marcus K.', title: '美式渐变 / 刻痕', rating: 4.9, image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuASZI54tUmbDSYe5gS24e3PgOMrI9qj3GqCIEsupdXwc_RqEBRxxdeTzuQ3J0BROacciMi8-E7ETF5xeF2c2Uk4cf7YG5pilwN59DTPHgqMFtmR-BKshgwP10w2kJSINs_ypgvRDwU3w6nM3XlqoTe2P00EUzVesNcHEhim30CLfIwvsP3__IjMVSrLxerwxTk_9QTAUp9wDxhQiUOSQBM247evrYwIqH808FQf91hnQpmGCY8fFpkv8bZ_2SuikN86EqZhUYAYaRc', specialties: ['美式渐变', '刻痕'], status: 'active', voucher_revenue: 42 },
      { id: 2, name: 'James L.', title: '经典剪裁 / 造型', rating: 4.8, image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD1qwvlDy5vm9u_b33_rfD-P40Tj3GDKG0BNW3yV3q6xsmoWSeF97hNH2lUiW2hPUuOombMFpnxNvcaTI3fvuVnlFjtiUQiAPARwitCM7fkkOmGhqU45Tbfv2ctMYXUcYuJog4zB8RNrPbkTdkcJVWtuV76N-kCOflrxai1WG_Ugv2XKZ674N23ONPrmzVGCM84SUkgpRzXQw-w7-ygvF6JovNcvEb3vxZjcdJvYqoeV8QJiVFDljKvMKL_L7dDIwrIvQXwOquUvYg', specialties: ['经典剪裁'], status: 'active', voucher_revenue: 28 },
      { id: 3, name: 'Victor Z.', title: '韩式纹理 / 染烫', rating: 4.7, image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAKrSAmGdbivuGTmKJpJ0Uh6duJgkmTs2t0bKqF-97DEWpixi26Ccq815F0QH1osFHIGEtJn8EcJcncboVwXpxHzscJWrU-k1LgdZKE8obzNYOx8dNkwzSqBpp3tT8BdUQkxBcQ4nOl-zeENdRwcJlVsltNhSagqhspDeRVDRqH6V1xCzuomXMaKcfpuA2-kmVqmXUpHfkJUrNws1PYl-PhjRaNGcA0O8JNq_EmV8gM7GTu1JOL_TkGs9SK8OudR4LC21rylR1G_ao', specialties: ['纹理烫'], status: 'rest', voucher_revenue: 15 }
    ],
    app_customers: [
      { id: 101, name: '演示用户', phone: '13888888888', password_hash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', avatar: 'https://ui-avatars.com/api/?name=Demo&background=007AFF&color=fff', real_name: 'Demo User', email: 'demo@barberbook.com', vouchers: 5 }
    ],
    app_appointments: [
      // 当前队列数据
      { id: 1001, customer_name: '演示用户', barber_name: 'Marcus K.', service_name: '标准男士精剪', date_str: getTodayStr(), time_str: '14:00', price: 88, status: 'confirmed', used_voucher: false },
      { id: 1002, customer_name: 'Jason', barber_name: 'Marcus K.', service_name: '美式油头', date_str: getTodayStr(), time_str: '10:00', price: 128, status: 'checked_in', used_voucher: false },
      // 历史完成数据 (用于测试累积成就)
      { id: 901, customer_name: '历史客户A', barber_name: 'Marcus K.', service_name: '创意烫发', date_str: '3月20日', time_str: '14:00', price: 288, status: 'completed', used_voucher: true, created_at: '2024-03-20T10:00:00Z' },
      { id: 902, customer_name: '历史客户B', barber_name: 'Marcus K.', service_name: '洗剪吹', date_str: '3月21日', time_str: '11:00', price: 68, status: 'completed', used_voucher: false, created_at: '2024-03-21T10:00:00Z' },
      { id: 903, customer_name: '历史客户C', barber_name: 'Marcus K.', service_name: '美式油头', date_str: '3月22日', time_str: '16:00', price: 128, status: 'completed', used_voucher: true, created_at: '2024-03-22T10:00:00Z' }
    ],
    app_services: [
        { id: 1, name: '标准男士精剪', price: 88, duration: 45, icon: 'content_cut' },
        { id: 2, name: '高级总监设计', price: 128, duration: 60, icon: 'face' }
    ],
    app_settings: [
        { key: 'global_config', value: { openTime: '09:00', closeTime: '22:00', serviceDuration: 45, maxAppointments: 24 } }
    ],
    app_logs: [],
    app_ratings: []
  };

  // Track active mock subscribers
  const mockSubscribers: Array<{ 
    table: string, 
    event: string, 
    callback: (payload: any) => void 
  }> = [];

  const notifySubscribers = (table: string, eventType: string, newData: any, oldData?: any) => {
    mockSubscribers.forEach(sub => {
      if (sub.table === '*' || sub.table === table) {
        if (sub.event === '*' || sub.event === eventType) {
          sub.callback({
            eventType,
            new: newData,
            old: oldData,
            schema: 'public',
            table
          });
        }
      }
    });
  };

  class MockQueryBuilder {
    table: string;
    filters: Array<{ col: string, op: string, val: any }> = [];
    orders: Array<{ col: string, ascending: boolean }> = [];
    _limit: number | null = null;
    _single: boolean = false;
    
    constructor(table: string) { this.table = table; }
    select(columns?: string) { return this; }
    eq(col: string, val: any) { this.filters.push({ col, op: 'eq', val }); return this; }
    neq(col: string, val: any) { this.filters.push({ col, op: 'neq', val }); return this; }
    in(col: string, vals: any[]) { this.filters.push({ col, op: 'in', val: vals }); return this; }
    gte(col: string, val: any) { this.filters.push({ col, op: 'gte', val }); return this; }
    lt(col: string, val: any) { this.filters.push({ col, op: 'lt', val }); return this; }
    order(col: string, { ascending = true } = {}) { this.orders.push({ col, ascending }); return this; }
    limit(n: number) { this._limit = n; return this; }
    single() { this._single = true; return this; }

    insert(data: any) { return this._exec('insert', data); }
    update(data: any) { return this._exec('update', data); }
    delete() { return this._exec('delete', null); }
    upsert(data: any) { return this._exec('upsert', data); }

    then(resolve: (value: any) => void, reject: (reason?: any) => void) {
       this._exec('select', null).then(resolve, reject);
    }

    async _exec(op: string, payload: any): Promise<any> {
      await new Promise(r => setTimeout(r, 80));
      let rows = mockDb[this.table] || [];

      // Filtering logic
      let filteredIndices: number[] = [];
      let filteredRows = rows.filter((row, idx) => {
        const match = this.filters.every(f => {
           if (f.op === 'eq') return row[f.col] == f.val;
           if (f.op === 'neq') return row[f.col] != f.val;
           if (f.op === 'in') return Array.isArray(f.val) && f.val.includes(row[f.col]);
           if (f.op === 'gte') return row[f.col] >= f.val;
           if (f.op === 'lt') return row[f.col] < f.val;
           return true;
        });
        if (match) filteredIndices.push(idx);
        return match;
      });

      if (op === 'select') {
        for (const o of this.orders) {
          filteredRows.sort((a, b) => (a[o.col] < b[o.col] ? (o.ascending ? -1 : 1) : (o.ascending ? 1 : -1)));
        }
        if (this._limit) filteredRows = filteredRows.slice(0, this._limit);
        if (this._single) return { data: filteredRows.length > 0 ? filteredRows[0] : null, error: null };
        return { data: filteredRows, error: null };
      }

      if (op === 'insert') {
        const items = Array.isArray(payload) ? payload : [payload];
        const inserted = items.map(p => {
            const item = { id: Date.now() + Math.floor(Math.random()*1000), created_at: new Date().toISOString(), ...p };
            mockDb[this.table] = [item, ...(mockDb[this.table] || [])];
            notifySubscribers(this.table, 'INSERT', item);
            return item;
        });
        return { data: Array.isArray(payload) ? inserted : inserted[0], error: null };
      }

      if (op === 'update') {
        mockDb[this.table] = rows.map((row) => {
           if (filteredRows.includes(row)) {
               const updated = { ...row, ...payload };
               notifySubscribers(this.table, 'UPDATE', updated, row);
               return updated;
           }
           return row;
        });
        return { data: null, error: null };
      }

      if (op === 'upsert') {
          // Simplified upsert
          const key = this.table === 'app_settings' ? 'key' : 'id';
          const existing = rows.find(r => r[key] === payload[key]);
          if (existing) return this.update(payload);
          else return this.insert(payload);
      }

      if (op === 'delete') {
         mockDb[this.table] = rows.filter(row => !filteredRows.includes(row));
         filteredRows.forEach(row => notifySubscribers(this.table, 'DELETE', null, row));
         return { data: { count: filteredRows.length }, error: null };
      }
      
      return { data: null, error: null };
    }
  }

  const mockChannel = (name: string) => {
    const channel = {
      on: (event: string, filter: any, callback: any) => {
        // filter object is ignored in simple mock
        const table = filter.table || '*';
        const eventType = filter.event || '*';
        mockSubscribers.push({ table, event: eventType, callback });
        return channel;
      },
      subscribe: (statusCallback?: any) => {
        if (statusCallback) setTimeout(() => statusCallback('SUBSCRIBED'), 10);
        return channel;
      },
      unsubscribe: () => {
        // Clear subscriptions for this channel
        return channel;
      }
    };
    return channel;
  };

  client = {
    from: (table: string) => new MockQueryBuilder(table),
    channel: mockChannel,
    removeChannel: () => {},
    rpc: async (fnName: string, params: any) => {
        console.log(`[Mock RPC] ${fnName}`, params);
        return { data: null, error: null };
    }
  } as any;
}

export const supabase = client;
