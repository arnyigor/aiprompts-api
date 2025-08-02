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
        // Этап 1: Валидация с помощью Zod
        const validationResult = PromptSchema.safeParse(req.body);
        if (!validationResult.success) {
            const formattedErrors = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
            return res.status(400).json({ message: `Bad Request: Invalid data structure. Details: ${formattedErrors}` });
        }
        const promptData = validationResult.data;

        // Этап 2: Инициализация и определение путей
        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
        const owner = process.env.GITHUB_REPO_OWNER;
        const repo = process.env.GITHUB_REPO_NAME;

        // Категория теперь гарантированно существует
        const category = promptData.category;
        const fileName = `${promptData.uuid}.json`;
        const filePath = `prompts/${category}/${fileName}`;
        
        const fileContent = JSON.stringify(promptData, null, 2); 
        const contentEncoded = Buffer.from(fileContent).toString('base64');

        // Этап 3: Создание файла с проверкой на дубликат
        try {
            await octokit.repos.createFile({
                owner,
                repo,
                path: filePath,
                message: `feat(prompts): add new prompt "${promptData.title}"`,
                content: contentEncoded,
                committer: {
                    name: 'AIPrompts API Bot',
                    email: 'bot@aiprompts.dev'
                },
            });
        } catch (error) {
            if (error.status === 422) {
                return res.status(409).json({ message: 'Conflict: A prompt with this UUID already exists.' });
            }
            throw error;
        }

        // Этап 4: Запуск Workflow
        const issueBody = formatIssueBody(promptData, filePath);
        await octokit.repos.createDispatchEvent({
            owner,
            repo,
            event_type: 'create-moderation-issue',
            client_payload: {
                title: promptData.title,
                body: issueBody 
            }
        });

        res.status(202).json({ message: 'Accepted: Prompt submitted and is awaiting moderation.' });

    } catch (error) {
        console.error('FATAL: Error in processing pipeline:', error);
        res.status(500).json({ message: 'Internal Server Error. Please contact support.' });
    }
}