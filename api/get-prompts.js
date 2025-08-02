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
  // Устанавливаем заголовки для кеширования.
  // Кешировать на 10 минут (600 секунд), но проверять наличие новой версии каждые 60 секунд.
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60');

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