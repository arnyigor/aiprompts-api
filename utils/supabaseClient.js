// utils/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// Получаем переменные из окружения
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Создаем и экспортируем единый клиент Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey);