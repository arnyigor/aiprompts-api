import { Octokit } from "@octokit/rest";
import { z } from "zod";

// --- Декларативная схема валидации с помощью Zod ---
const PromptSchema = z.object({
  // Обязательные поля для любого промпта
  uuid: z.string().uuid({ message: "Invalid UUID format" }),
  title: z.string().min(1, { message: "Title cannot be empty" }),
  version: z.string().min(1, { message: "Version cannot be empty" }),
  category: z.string().min(1, { message: "Category cannot be empty" }), // ИЗМЕНЕНИЕ: Сделано обязательным
  content: z.object({
    ru: z.string().optional(),
    en: z.string().optional(),
  }).passthrough(),

  // Необязательные поля
  type: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  prompt_variants: z.array(
    z.object({
      variant_id: z.object({
        type: z.string(),
        id: z.union([z.string(), z.number()]),
        priority: z.number().optional(),
      }).passthrough(),
      content: z.object({
        ru: z.string().optional(),
        en: z.string().optional(),
      }).passthrough(),
    })
  ).optional(), 
}).passthrough();


/**
 * Форматирует тело Issue.
 */
function formatIssueBody(data, filePath) {
    let body = `### 📥 Запрос на модерацию нового промпта\n\n`;
    body += `**Файл:** \`${filePath}\`\n`;
    body += `**Версия:** \`${data.version}\` | **Категория:** \`${data.category}\`\n\n`; // Категория теперь всегда будет
    body += `**Описание:**\n> ${data.description || 'Не указано'}\n\n`;

    if (data.prompt_variants && data.prompt_variants.length > 0) {
        body += `--- \n### ✨ Варианты промпта (${data.prompt_variants.length})\n\n`;
        data.prompt_variants.forEach(variant => {
            const { type, id, priority } = variant.variant_id;
            body += `- **Тип:** \`${type}\`, **ID:** \`${id}\``;
            if (priority) {
                body += `, **Приоритет:** \`${priority}\``;
            }
            body += `\n`;
        });
    }

    body += `\n---\n*Это Issue создано автоматически. Модератору необходимо проверить содержимое файла и, в случае одобрения, закрыть эту задачу.*`;
    return body;
}


export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }
    try {
        const validationResult = PromptSchema.safeParse(req.body);
        if (!validationResult.success) {
            // ... обработка ошибок валидации, как была ...
            return res.status(400).json({ /* ... */ });
        }
        const promptData = validationResult.data;
        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
        const owner = process.env.GITHUB_REPO_OWNER;
        const repo = process.env.GITHUB_REPO_NAME;
        const mainBranch = process.env.GITHUB_MAIN_BRANCH || 'main'; // Имя основной ветки

        // --- Этап 1: Создание новой ветки ---
        const newBranchName = `prompts/add-${promptData.uuid}`;
        const mainBranchRef = await octokit.rest.git.getRef({
            owner, repo, ref: `heads/${mainBranch}`,
        });
        const mainBranchSha = mainBranchRef.data.object.sha;
        await octokit.rest.git.createRef({
            owner, repo, ref: `refs/heads/${newBranchName}`, sha: mainBranchSha,
        });

        // --- Этап 2: Коммит файла в новую ветку ---
        const filePath = `prompts/${promptData.category}/${promptData.uuid}.json`;
        await octokit.rest.repos.createOrUpdateFileContents({
            owner, repo, path: filePath,
            message: `feat(prompts): add new prompt "${promptData.title}"`,
            content: Buffer.from(JSON.stringify(promptData, null, 2)).toString('base64'),
            branch: newBranchName, // Указываем новую ветку
            committer: { name: 'AIPrompts API Bot', email: 'bot@aiprompts.dev' },
        });

        // --- Этап 3: Создание Pull Request ---
        const pr = await octokit.rest.pulls.create({
            owner, repo,
            title: `Новый промпт: ${promptData.title}`,
            head: newBranchName, // Откуда
            base: mainBranch,    // Куда
            body: `Запрос на добавление нового промпта. Файл: \`${filePath}\`.\n\nПожалуйста, проверьте содержимое и слейте (merge) этот Pull Request для одобрения.`,
            maintainer_can_modify: true
        });

        res.status(201).json({ 
            message: 'Pull Request created successfully. Awaiting moderation.',
            pullRequestUrl: pr.data.html_url
        });

    } catch (error) {
        console.error('FATAL: Error in PR creation pipeline:', error);
        res.status(500).json({ message: 'Internal Server Error.' });
    }
}