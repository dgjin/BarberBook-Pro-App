import { createClient } from '@supabase/supabase-js';

// Helper to safely get config
const getSafeConfig = (key: string, envVar: string | undefined) => {
  const val = localStorage.getItem(key) || envVar;
  return val && val.trim().length > 0 ? val.trim() : null;
};

// Default Configuration
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

// Retrieve credentials from local storage (UI config) or environment variables, falling back to defaults.
const supabaseUrl = getSafeConfig('barber_supabase_url', getProcessEnv('SUPABASE_URL')) || DEFAULT_URL;
const supabaseKey = getSafeConfig('barber_supabase_key', getProcessEnv('SUPABASE_ANON_KEY')) || DEFAULT_KEY;

let client;

// --- Connection Initialization ---
// We attempt to create the client with provided credentials regardless of format.
// This ensures we connect to the real backend if credentials are provided.
if (supabaseUrl && supabaseKey) {
  try {
    client = createClient(supabaseUrl, supabaseKey);
  } catch (e) {
    console.error("Supabase Client Initialization Failed:", e);
  }
}

// --- Fallback Mock Database ---
// Only use mock if client could not be created (e.g. missing credentials).
// The user explicitly requested to prefer backend connection over mock.
if (!client) {
  console.warn("%c No Supabase credentials found. Running in Offline Mock Mode. ", "background: #FF3B30; color: #fff; border-radius: 4px; padding: 2px 6px; font-weight: bold;");
  
  // Helpers for Mock Data
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  // Seed Data
  const mockDb: Record<string, any[]> = {
    app_barbers: [
      { id: 1, name: 'Marcus K.', title: '美式渐变 / 刻痕', rating: 4.9, image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuASZI54tUmbDSYe5gS24e3PgOMrI9qj3GqCIEsupdXwc_RqEBRxxdeTzuQ3J0BROacciMi8-E7ETF5xeF2c2Uk4cf7YG5pilwN59DTPHgqMFtmR-BKshgwP10w2kJSINs_ypgvRDwU3w6nM3XlqoTe2P00EUzVesNcHEhim30CLfIwvsP3__IjMVSrLxerwxTk_9QTAUp9wDxhQiUOSQBM247evrYwIqH808FQf91hnQpmGCY8fFpkv8bZ_2SuikN86EqZhUYAYaRc', specialties: ['美式渐变', '刻痕'], status: 'active' },
      { id: 2, name: 'James L.', title: '经典剪裁 / 造型', rating: 4.8, image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD1qwvlDy5vm9u_b33_rfD-P40Tj3GDKG0BNW3yV3q6xsmoWSeF97hNH2lUiW2hPUuOombMFpnxNvcaTI3fvuVnlFjtiUQiAPARwitCM7fkkOmGhqU45Tbfv2ctMYXUcYuJog4zB8RNrPbkTdkcJVWtuV76N-kCOflrxai1WG_Ugv2XKZ674N23ONPrmzVGCM84SUkgpRzXQw-w7-ygvF6JovNcvEb3vxZjcdJvYqoeV8QJiVFDljKvMKL_L7dDIwrIvQXwOquUvYg', specialties: ['经典剪裁'], status: 'active' },
      { id: 3, name: 'Victor Z.', title: '韩式纹理 / 染烫', rating: 4.7, image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAKrSAmGdbivuGTmKJpJ0Uh6duJgkmTs2t0bKqF-97DEWpixi26Ccq815F0QH1osFHIGEtJn8EcJcncboVwXpxHzscJWrU-k1LgdZKE8obzNYOx8dNkwzSqBpp3tT8BdUQkxBcQ4nOl-zeENdRwcJlVsltNhSagqhspDeRVDRqH6V1xCzuomXMaKcfpuA2-kmVqmXUpHfkJUrNws1PYl-PhjRaNGcA0O8JNq_EmV8gM7GTu1JOL_TkGs9SK8OudR4LC21rylR1G_ao', specialties: ['纹理烫'], status: 'rest' }
    ],
    app_customers: [
      // password_hash is SHA-256 of '123456'
      { id: 101, name: '演示用户', phone: '13888888888', password_hash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', avatar: 'https://ui-avatars.com/api/?name=Demo&background=007AFF&color=fff', real_name: 'Demo User', email: 'demo@barberbook.com' }
    ],
    app_appointments: [
      { id: 1001, customer_name: '演示用户', barber_name: 'Marcus K.', service_name: '标准男士精剪', date_str: getTodayStr(), time_str: '14:00', price: 88, status: 'confirmed' },
      { id: 1002, customer_name: 'Jason', barber_name: 'Marcus K.', service_name: '美式油头', date_str: getTodayStr(), time_str: '10:00', price: 128, status: 'checked_in' },
      { id: 1003, customer_name: 'Mike', barber_name: 'James L.', service_name: '染发', date_str: getTodayStr(), time_str: '11:30', price: 388, status: 'confirmed' }
    ],
    app_services: [
        { id: 1, name: '标准男士精剪', price: 88, duration: 45, icon: 'content_cut' },
        { id: 2, name: '高级总监设计', price: 128, duration: 60, icon: 'face' },
        { id: 3, name: '尊享洗剪吹护', price: 168, duration: 90, icon: 'spa' },
        { id: 4, name: '潮流染烫套餐', price: 388, duration: 120, icon: 'palette' }
    ],
    app_settings: [
        { key: 'global_config', value: { openTime: '10:00', closeTime: '22:00', serviceDuration: 45, maxAppointments: 24 } }
    ],
    app_logs: [],
    app_ratings: []
  };

  class MockQueryBuilder {
    table: string;
    filters: Array<{ col: string, op: string, val: any }> = [];
    orders: Array<{ col: string, ascending: boolean }> = [];
    _limit: number | null = null;
    _single: boolean = false;
    
    constructor(table: string) {
      this.table = table;
    }

    select(columns?: string) { return this; }
    
    eq(col: string, val: any) { 
      this.filters.push({ col, op: 'eq', val }); 
      return this; 
    }
    
    in(col: string, vals: any[]) { 
      this.filters.push({ col, op: 'in', val: vals }); 
      return this; 
    }

    order(col: string, { ascending = true } = {}) {
      this.orders.push({ col, ascending });
      return this;
    }

    limit(n: number) {
      this._limit = n;
      return this;
    }

    single() {
      this._single = true;
      return this;
    }

    insert(data: any) {
      return this._exec('insert', data);
    }

    update(data: any) {
      return this._exec('update', data);
    }

    delete() {
      return this._exec('delete', null);
    }

    // Execute the query against mockDb
    then(resolve: (value: any) => void, reject: (reason?: any) => void) {
       this._exec('select', null).then(resolve, reject);
    }

    async _exec(op: string, payload: any): Promise<any> {
      // Simulate network delay
      await new Promise(r => setTimeout(r, 100));

      let rows = mockDb[this.table] || [];

      // Filtering (Common for all ops)
      let filteredIndices: number[] = []; // Track indices for update/delete
      let filteredRows = rows.filter((row, idx) => {
        const match = this.filters.every(f => {
           if (f.op === 'eq') return row[f.col] == f.val;
           if (f.op === 'in') return Array.isArray(f.val) && f.val.includes(row[f.col]);
           return true;
        });
        if (match) filteredIndices.push(idx);
        return match;
      });

      if (op === 'select') {
        // Sorting
        for (const o of this.orders) {
          filteredRows.sort((a, b) => {
             if (a[o.col] < b[o.col]) return o.ascending ? -1 : 1;
             if (a[o.col] > b[o.col]) return o.ascending ? 1 : -1;
             return 0;
          });
        }
        // Limit
        if (this._limit) {
          filteredRows = filteredRows.slice(0, this._limit);
        }
        // Single
        if (this._single) {
           return { data: filteredRows.length > 0 ? filteredRows[0] : null, error: null };
        }
        return { data: filteredRows, error: null };
      }

      if (op === 'insert') {
        const newItem = { id: Date.now() + Math.floor(Math.random()*1000), ...payload };
        // Simple duplicate check for phone in customers
        if (this.table === 'app_customers' && rows.find(r => r.phone === newItem.phone)) {
             return { data: null, error: { code: '23505', message: 'Unique violation' } };
        }
        mockDb[this.table] = [newItem, ...rows]; // Prepend
        return { data: newItem, error: null };
      }

      if (op === 'update') {
        const updatedRows: any[] = [];
        mockDb[this.table] = rows.map((row) => {
           const match = this.filters.every(f => {
              if (f.op === 'eq') return row[f.col] == f.val;
              if (f.op === 'in') return Array.isArray(f.val) && f.val.includes(row[f.col]);
              return true;
           });

           if (match) {
               const updated = { ...row, ...payload };
               updatedRows.push(updated);
               return updated;
           }
           return row;
        });
        return { data: updatedRows, error: null };
      }

      if (op === 'delete') {
         const initialLen = rows.length;
         mockDb[this.table] = rows.filter(row => {
            const match = this.filters.every(f => {
              if (f.op === 'eq') return row[f.col] == f.val;
              return true;
            });
            return !match; // Keep if NOT match
         });
         return { data: { count: initialLen - mockDb[this.table].length }, error: null };
      }
      
      return { data: null, error: null };
    }
  }

  // Mock Realtime Channel
  const mockChannel = {
      on: () => mockChannel,
      subscribe: () => mockChannel,
      unsubscribe: () => undefined
  };

  client = {
    from: (table: string) => new MockQueryBuilder(table),
    channel: (name: string) => mockChannel,
    removeChannel: () => {},
    rpc: async (fnName: string, params: any) => {
        console.log(`[Mock RPC] Calling ${fnName} with params:`, params);
        await new Promise(r => setTimeout(r, 500));
        return { data: null, error: null }; // Simulate successful void return
    }
  } as any;
}

export const supabase = client;