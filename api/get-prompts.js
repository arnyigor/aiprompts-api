// pages/api/get-prompts.js

// ИМПОРТ: Подключаем наш клиент Supabase
import { supabase } from '../../lib/supabaseClient';

// Включаем кеширование на стороне Vercel
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // --- БЛОК БЕЗОПАСНОСТИ (ОСТАВЛЕН БЕЗ ИЗМЕНЕНИЙ) ---
  const allowedOrigins = [
    'https://aipromptsapi.vercel.app',
    'https://www.aipromptsapi.vercel.app'
  ];
  if (process.env.VERCEL_ENV === 'development') {
    allowedOrigins.push('http://localhost:3000');
  }
  const origin = req.headers['origin'];
  const clientApiKey = req.headers['x-api-key'];

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!allowedOrigins.includes(origin) && clientApiKey !== process.env.API_SECRET_KEY) {
    console.warn(`[SECURITY] Unauthorized access attempt from origin: ${origin || 'unknown'}.`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // --- КОНЕЦ БЛОКА БЕЗОПАСНОСТИ ---

  // Устанавливаем заголовки для кеширования (без изменений)
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');

  try {
    // КОММЕНТАРИЙ: Новая логика для пагинации
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    // КОММЕНТАРИЙ: Запрашиваем данные напрямую из Supabase
    const { data: prompts, error, count } = await supabase
      .from('prompts')
      // Запрашиваем все поля и общее количество записей для пагинации
      .select('*', { count: 'exact' })
      // Фильтруем только публичные промпты согласно ТЗ
      .eq('status', 'active')
      // Сортируем по дате создания, чтобы новые были сверху
      .order('created_at', { ascending: false })
      // Применяем пагинацию
      .range(offset, offset + limit - 1);

    if (error) {
      throw error; // Передаем ошибку в блок catch
    }

    // КОММЕНТАРИЙ: Рассчитываем, есть ли следующая страница
    const hasNextPage = offset + prompts.length < count;

    // Отправляем ответ в формате, указанном в ТЗ
    res.status(200).json({ prompts, hasNextPage });

  } catch (error) {
    console.error("Error fetching prompts from Supabase:", error.message);
    res.status(500).json({ error: 'Failed to fetch prompts from Supabase.' });
  }
}