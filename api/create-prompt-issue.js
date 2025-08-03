import { Octokit } from "@octokit/rest";
import { z } from "zod";

const PromptSchema = z.object({
    id: z.string().uuid(),
    title: z.string().min(1),
    version: z.string().min(1),
    category: z.string().min(1),
    original_category: z.string().optional(),
    description: z.string().optional(),
    content: z.object({ ru: z.string().optional(), en: z.string().optional() }).passthrough(),
    prompt_variants: z.array(z.object({
        variant_id: z.object({ type: z.string().min(1), id: z.string().min(1), priority: z.number().optional() }),
        content: z.object({ ru: z.string().optional(), en: z.string().optional() }).passthrough(),
    })).optional(),
    compatible_models: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    variables: z.array(z.object({ name: z.string(), description: z.string().optional(), default_value: z.string().optional() })).optional(),
    status: z.string(),
    is_local: z.boolean(),
    is_favorite: z.boolean(),
    metadata: z.any(),
    rating: z.any(),
}).passthrough();

function formatPullRequestBody(data, filePath, oldFilePath = null) {
    let body = `### 📥 Предложение: ${data.title}\n\n`;
    if (oldFilePath) {
        body += `**Перемещение файла:**\n- ~~${oldFilePath}~~\n- → \`${filePath}\`\n\n`;
    } else {
        body += `**Файл:** \`${filePath}\`\n`;
    }
    body += `**Версия:** \`${data.version}\` | **Категория:** \`${data.category}\`\n`;
    if (data.tags?.length > 0) { body += `**Теги:** ${data.tags.map(t => `\`${t}\``).join(', ')}\n`; }
    body += `\n---\n\n#### Описание\n> ${data.description || 'Не предоставлено'}\n`;
    if (data.prompt_variants?.length > 0) {
        body += `\n---\n\n#### 🔬 Специфичные варианты (${data.prompt_variants.length})\n`;
        data.prompt_variants.forEach(variant => {
            const { type, id, priority } = variant.variant_id;
            body += `\n<details><summary>Вариант: <strong>${type} = ${id}</strong> (приоритет: ${priority || 0})</summary>\n\n`;
            if (variant.content.ru) { body += `**RU:**\n\`\`\`\n${variant.content.ru}\n\`\`\`\n`; }
            if (variant.content.en) { body += `**EN:**\n\`\`\`\n${variant.content.en}\n\`\`\`\n`; }
            body += `</details>\n`;
        });
    }
    if (data.variables?.length > 0) {
        body += `\n---\n\n#### 🔧 Переменные (${data.variables.length})\n`;
        data.variables.forEach(v => { body += `- \`${v.name}\`: ${v.description || ''} (значение по умолчанию: \`${v.default_value || ''}\`)\n`; });
    }
    body += `\n---\n*PR создан автоматически. Для одобрения слейте (merge) его.*`;
    return body;
}

function getTimestampWithoutZ(date) { return date.toISOString().slice(0, -1); }

export default async function handler(req, res) {
    if (req.method !== 'POST') { return res.status(405).end('Method Not Allowed'); }
    try {
        const validationResult = PromptSchema.safeParse(req.body);
        if (!validationResult.success) {
            console.error("Validation Error:", validationResult.error.flatten());
            return res.status(400).json({ error: 'Validation failed', details: validationResult.error.flatten() });
        }
        
        const incomingData = validationResult.data;
        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
        const owner = process.env.GITHUB_REPO_OWNER;
        const repo = process.env.GITHUB_REPO_NAME;
        const mainBranch = process.env.GITHUB_MAIN_BRANCH || 'main';
        const committer = { name: 'AIPrompts API Bot', email: 'bot@aiprompts.dev' };

        const { category: newCategory, original_category: oldCategory } = incomingData;
        const isEditing = !!oldCategory;
        const categoryChanged = isEditing && newCategory !== oldCategory;

        const newFilePath = `prompts/${newCategory}/${incomingData.id}.json`;
        const oldFilePath = isEditing ? `prompts/${oldCategory}/${incomingData.id}.json` : null;

        let finalData = { ...incomingData };
        let fileSha = undefined;

        if (isEditing) {
            try {
                const { data: existingFile } = await octokit.rest.repos.getContent({ owner, repo, path: oldFilePath, ref: mainBranch });
                fileSha = existingFile.sha;
                const oldContent = JSON.parse(Buffer.from(existingFile.content, 'base64').toString('utf-8'));
                finalData.created_at = oldContent.created_at || getTimestampWithoutZ(new Date());
            } catch (error) {
                if (error.status === 404) {
                    // Это странный случай: мы в режиме редактирования, но файла нет.
                    // Будем считать это созданием, но с сохранением ID.
                    isUpdate = false;
                    finalData.created_at = getTimestampWithoutZ(new Date());
                    fileSha = undefined; // Явно сбрасываем SHA
                } else {
                    throw error; // Пробрасываем другие ошибки
                }
            }
        } else {
            finalData.created_at = getTimestampWithoutZ(new Date());
        }
        
        finalData.updated_at = getTimestampWithoutZ(new Date());
        delete finalData.original_category;

        const prTitle = isEditing ? `Обновление промпта: ${finalData.title}` : `Новый промпт: ${finalData.title}`;
        const newBranchName = `prompts/${isEditing ? 'update' : 'add'}-${finalData.id.substring(0, 8)}`;

        const mainBranchRef = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${mainBranch}` });
        await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${newBranchName}`, sha: mainBranchRef.data.object.sha });

        if (categoryChanged) {
            await octokit.rest.repos.deleteFile({ owner, repo, path: oldFilePath, message: `chore(prompts): move prompt (delete old)`, sha: fileSha, branch: newBranchName, committer });
            await octokit.rest.repos.createOrUpdateFileContents({ owner, repo, path: newFilePath, message: `feat(prompts): move prompt (create new)`, content: Buffer.from(JSON.stringify(finalData, null, 2)).toString('base64'), branch: newBranchName, committer });
        } else {
            await octokit.rest.repos.createOrUpdateFileContents({
                owner, repo, path: newFilePath,
                message: isEditing ? `fix: update prompt "${finalData.title}"` : `feat: add prompt "${finalData.title}"`,
                content: Buffer.from(JSON.stringify(finalData, null, 2)).toString('base64'),
                branch: newBranchName,
                sha: fileSha,
                committer,
            });
        }
        
        const prBody = formatPullRequestBody(finalData, newFilePath, oldFilePath);
        const pr = await octokit.rest.pulls.create({ owner, repo, title: prTitle, head: newBranchName, base: mainBranch, body: prBody });

        res.status(201).json({ message: 'Pull Request created/updated successfully.', pullRequestUrl: pr.data.html_url });

    } catch (error) {
        // --- УЛУЧШЕННОЕ ЛОГИРОВАНИЕ И ОТВЕТ ---
        console.error('FATAL Error in create-prompt-issue handler:', error);
        const errorDetails = {
            message: error.message,
            status: error.status,
            request: error.request,
            // Добавляем данные ответа от GitHub, если они есть
            responseData: error.response?.data
        };
        res.status(500).json({ 
            error: 'Internal Server Error.', 
            details: errorDetails 
        });
    }
}