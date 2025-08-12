// lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

// Получаем переменные окружения, которые вы скопировали
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Создаем и экспортируем клиент Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
