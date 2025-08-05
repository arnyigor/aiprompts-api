// Используем встроенный fetch, доступный в современных средах Node.js на Vercel
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

  // 1. Проверяем, что это POST-запрос
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  try {
    // 2. Получаем данные из тела запроса
    const { appname, content } = req.body;

    // Простая валидация
    if (!appname || !content) {
      return res.status(400).json({ error: 'Missing required fields: appname and content' });
    }

    // 3. Получаем секреты из переменных окружения Vercel
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.error('Telegram secrets are not configured!');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    // 4. Формируем сообщение для Telegram
    const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    let messageText = `🔔 *Новый фидбек!*\n\n`;
    messageText += `*Приложение:* \`${appname.name} (v${appname.version}, ID: ${appname.id}, Pkg: ${appname.packagename})\`\n`;
    messageText += `*Время:* \`${timestamp}\`\n\n`;
    messageText += `*Содержание:*\n${content}`;

    // 5. Отправляем запрос к Telegram Bot API
    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const telegramResponse = await fetch(telegramApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: 'Markdown', // Используем Markdown для красивого форматирования
      }),
    });

    const telegramResult = await telegramResponse.json();

    if (!telegramResult.ok) {
      // Если Telegram вернул ошибку, логируем ее
      console.error('Telegram API Error:', telegramResult.description);
      return res.status(500).json({ error: 'Failed to send message to Telegram.' });
    }

    // 6. Отправляем успешный ответ клиенту
    return res.status(200).json({ message: 'Feedback sent successfully!' });

  } catch (error) {
    console.error('Internal Server Error:', error);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}
