import { Octokit } from "@octokit/rest";
// Мы пока не будем использовать Vercel KV/Postgres здесь,
// чтобы сначала запустить базовую функциональность.
// import { kv } from '@vercel/kv';

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
        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
        const owner = process.env.GITHUB_REPO_OWNER;
        const repo = process.env.GITHUB_REPO_NAME;
        const promptsPath = 'prompts';

        const { data: categories } = await octokit.rest.repos.getContent({
            owner, repo, path: promptsPath,
        });
        const categoryDirs = categories.filter(item => item.type === 'dir' && !item.name.startsWith('.'));

        const allPromptsPromises = categoryDirs.map(async (categoryDir) => {
            const { data: files } = await octokit.rest.repos.getContent({
                owner, repo, path: categoryDir.path,
            });
            const fileContentPromises = files
                .filter(file => file.type === 'file' && file.name.endsWith('.json'))
                .map(async (file) => {
                    const response = await fetch(file.download_url);
                    const promptData = await response.json();

                    // --- ОБОГАЩЕНИЕ ДАННЫХ (ПОКА ЗАГЛУШКА) ---
                    // Добавляем пустой объект рейтинга, чтобы фронтенд всегда его получал
                    promptData.rating = { upvotes: 0, downvotes: 0 };

                    return promptData;
                });
            return Promise.all(fileContentPromises);
        });

        const promptsByCategory = await Promise.all(allPromptsPromises);
        const allPrompts = promptsByCategory.flat(); // Сливаем все в один массив

        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60'); // Кеш на 5 минут для отладки
        res.status(200).json(allPrompts); // <-- ГАРАНТИРОВАННО ВОЗВРАЩАЕМ МАССИВ

    } catch (error) {
        console.error("FATAL ERROR in get-prompts handler:", error);
        res.status(500).json({
            error: 'Failed to fetch prompts from GitHub.',
            details: error.message
        });
    }
}