// api/notice.js
export default async function handler(req, res) {
  // --- БЛОК БЕЗОПАСНОСТИ ---
  // --- НАСТРОЙКА CORS ---
  const allowedOrigin = 'https://aipromptsapi.vercel.app';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Обработка preflight-запроса
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --- ПРОВЕРКА API-КЛЮЧА ---
  // Если запрос идет НЕ из браузера, он должен иметь ключ
  const clientApiKey = req.headers['x-api-key'];
  const origin = req.headers['origin'];

  // Разрешаем запросы, только если:
  // 1. Они приходят с нашего же сайта (проверка Origin)
  // ИЛИ
  // 2. Они содержат правильный API-ключ (проверка X-API-Key)
  if (origin !== allowedOrigin && clientApiKey !== process.env.API_SECRET_KEY) {
    // Если ни одно из условий не выполнено - отклоняем запрос.
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