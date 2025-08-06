// api/notice.js
export default async function handler(req, res) {
  // --- ФИНАЛЬНЫЙ БЛОК БЕЗОПАСНОСТИ v2 ---

  const allowedOrigins = [
    'https://aipromptsapi.vercel.app',
    'https://www.aipromptsapi.vercel.app'
  ];

  // Используем системную переменную VERCEL_ENV, которую vercel dev устанавливает в 'development'
  if (process.env.VERCEL_ENV === 'development') {
    allowedOrigins.push('http://localhost:3000');
  }

  const origin = req.headers['origin'];
  const clientApiKey = req.headers['x-api-key'];

  // Устанавливаем CORS заголовок, только если origin разрешен
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Проверка доступа
  if (!allowedOrigins.includes(origin) && clientApiKey !== process.env.API_SECRET_KEY) {
    // Оставляем только один полезный лог на случай реальной атаки
    console.warn(`[SECURITY] Unauthorized access attempt from origin: ${origin || 'unknown'}.`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // --- КОНЕЦ БЛОКА БЕЗОПАСНОСТИ ---

  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Missing required field: message' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.error('Telegram secrets are not configured!');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    // Отправляем готовое сообщение в Telegram
    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    await fetch(telegramApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true // Удобно, чтобы ссылки не занимали много места
      }),
    });

    return res.status(200).json({ message: 'Notification sent successfully!' });
  } catch (error) {
    console.error('Internal Server Error in notice.js:', error);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}