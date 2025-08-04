// api/get-prompts.js
import { Octokit } from "@octokit/rest";

// Инициализируем один раз для переиспользования
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner = process.env.GITHUB_REPO_OWNER;
const repo = process.env.GITHUB_REPO_NAME;
const promptsPath = 'prompts';

// Включаем кеширование на стороне Vercel
// https://vercel.com/docs/edge-network/caching#stale-while-revalidate
export const config = {
  api: {
    bodyParser: false, // Не нужен, так как это GET запрос
  },
};

// Функция для получения содержимого файла по URL
async function getFileContent(download_url) {
  const response = await fetch(download_url);
  return response.json();
}

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

  // Устанавливаем заголовки для кеширования.
  // s-maxage=86400: Кешировать результат на Edge-сети Vercel на 24 часа (86400 секунд).
  // stale-while-revalidate=600: Если пользователь зайдет после истечения 24 часов,
  // Vercel отдаст ему старые (stale) данные, но в фоне запустит функцию,
  // чтобы обновить кеш на следующие 24 часа. 
  // Следующий пользователь уже получит свежие данные.
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=600');

  try {
    // 1. Получаем список категорий (директорий)
    const { data: categories } = await octokit.rest.repos.getContent({
      owner, repo, path: promptsPath,
    });
    const categoryDirs = categories.filter(item => item.type === 'dir' && !item.name.startsWith('.'));

    // 2. Для каждой категории получаем список файлов
    const allPromptsPromises = categoryDirs.map(async (categoryDir) => {
      const { data: files } = await octokit.rest.repos.getContent({
        owner, repo, path: categoryDir.path,
      });

      // 3. Для каждого файла получаем его содержимое
      const fileContentPromises = files
        .filter(file => file.type === 'file' && file.name.endsWith('.json'))
        .map(file => getFileContent(file.download_url));

      return Promise.all(fileContentPromises);
    });

    const promptsByCategory = await Promise.all(allPromptsPromises);
    const allPrompts = promptsByCategory.flat(); // Сливаем все в один массив

    // 4. Отправляем все промпты клиенту
    res.status(200).json(allPrompts);

  } catch (error) {
    console.error("Error fetching prompts from GitHub:", error);
    res.status(500).json({ error: 'Failed to fetch prompts from GitHub.' });
  }
}