// api/config.js
export default function handler(req, res) {
    // Устанавливаем заголовки кеширования
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=60');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'GET') {
    // Явно проверяем наличие переменной и возвращаем null, если ее нет
    const publicKey = process.env.PUBLIC_API_KEY || null;
    const constructorEnabled = process.env.NEXT_PUBLIC_ENABLE_CONSTRUCTOR === 'true';

    // Добавляем лог на сервере, чтобы видеть, что мы отдаем
    console.log(`[API Config] Отправка конфигурации: publicKey=${publicKey ? 'OK' : 'NOT SET'}, constructorEnabled=${constructorEnabled}`);

    res.status(200).json({
      publicKey: publicKey,
      constructorEnabled: constructorEnabled
    });
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end('Method Not Allowed');
  }
}