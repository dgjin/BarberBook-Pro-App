
export type UserRole = 'customer' | 'barber' | 'admin';

export interface User {
  id: string | number;
  name: string;
  role: UserRole;
  avatar?: string;
  barberId?: number; // Optional link to barber ID
  phone?: string;
  realName?: string;
  email?: string;
  vouchers?: number; // New: Number of haircut vouchers
}

export interface Barber {
  id: number;
  name: string;
  title: string;
  rating: number;
  image: string;
  specialties: string[];
  status: 'active' | 'busy' | 'rest';
  tags?: string[];
  schedule?: number[]; // Array of day numbers
  experience?: number; // Years of experience
  service_count?: number; // Total services performed (calculated)
  bio?: string; // Introduction
  voucher_revenue?: number; // New: Cumulative haircut voucher revenue
}

export interface ServiceItem {
  id: string | number;
  name: string;
  price: number;
  duration: number;
  icon: string;
}

export interface Appointment {
  id?: number;
  customer_name: string;
  barber_name: string;
  service_name: string;
  date_str: string;
  time_str: string;
  price: number;
  status: 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled';
  created_at?: string;
  used_voucher?: boolean; // New: Whether a voucher was consumed for this service
}

export interface Rating {
  id?: number;
  appointment_id: number;
  barber_name: string;
  customer_name: string;
  rating: number; // Overall rating
  attitude_rating?: number; // New: Service Attitude
  skill_rating?: number; // New: Technical Skill
  comment?: string;
  created_at?: string;
}

export interface LogEntry {
  id: string;
  user: string;
  role: string;
  avatar: string;
  time: string;
  action: string;
  details: string;
  type: 'danger' | 'info' | 'warning';
  created_at?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  images?: string[];
}

export type PageRoute = 
  | 'launcher'
  | 'login'
  | 'register'
  | 'home' 
  | 'booking' 
  | 'ai_chat' 
  | 'check_in' 
  | 'monitor' 
  | 'web_monitor'
  | 'admin_dashboard' 
  | 'admin_workbench' 
  | 'admin_management' 
  | 'admin_settings' 
  | 'admin_logs';

export interface NavItem {
  id: string;
  icon: string;
  label: string;
  route: PageRoute;
  fill?: boolean;
}
