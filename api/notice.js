// api/notice.js
export default async function handler(req, res) {
  // --- БЛОК БЕЗОПАСНОСТИ (УЛУЧШЕННЫЙ) ---

  const VERCEL_URL = process.env.VERCEL_URL || 'localhost:3000';
  const ALLOWED_ORIGINS = [
    `https://${VERCEL_URL}`,
    `https://www.aipromptsapi.vercel.app` // Добавим www-версию явно
  ];
  // Для локальной разработки добавляем localhost
  if (process.env.NODE_ENV === 'development') {
    ALLOWED_ORIGINS.push('http://localhost:3000');
  }

  const origin = req.headers['origin'];
  const clientApiKey = req.headers['x-api-key'];

  // Устанавливаем CORS заголовок, только если origin разрешен
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Проверка доступа
  if (!ALLOWED_ORIGINS.includes(origin) && clientApiKey !== process.env.API_SECRET_KEY) {
    // Добавим логирование, чтобы видеть, какой origin был отклонен
    console.warn(`Unauthorized access attempt from origin: ${origin}`);
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