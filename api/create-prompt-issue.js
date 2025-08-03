import { Octokit } from "@octokit/rest";
import { z } from "zod";

const PromptSchema = z.object({
    id: z.string().uuid(),
    title: z.string().min(1),
    version: z.string().min(1),
    category: z.string().min(1),
    original_category: z.string().optional(), // Новое необязательное поле
    description: z.string().optional(),
    content: z.object({
        ru: z.string().optional(),
        en: z.string().optional(),
    }).passthrough(),
    prompt_variants: z.array(
        z.object({
            variant_id: z.object({
                type: z.string().min(1),
                id: z.string().min(1),
                priority: z.number().optional(),
            }),
            content: z.object({ ru: z.string().optional(), en: z.string().optional() }).passthrough(),
        })
    ).optional(),
    compatible_models: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    variables: z.array(
        z.object({
            name: z.string(),
            description: z.string().optional(),
            default_value: z.string().optional(),
        })
    ).optional(),
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

    if (data.tags && data.tags.length > 0) {
        body += `**Теги:** ${data.tags.map(t => `\`${t}\``).join(', ')}\n`;
    }

    body += `\n---\n\n#### Описание\n`;
    body += `> ${data.description || 'Не предоставлено'}\n`;

    if (data.prompt_variants && data.prompt_variants.length > 0) {
        body += `\n---\n\n#### 🔬 Специфичные варианты (${data.prompt_variants.length})\n`;
        data.prompt_variants.forEach(variant => {
            const { type, id, priority } = variant.variant_id;
            body += `\n<details>\n`;
            body += `<summary>Вариант: <strong>${type} = ${id}</strong> (приоритет: ${priority || 0})</summary>\n\n`;
            if (variant.content.ru) {
                body += `**RU:**\n\`\`\`\n${variant.content.ru}\n\`\`\`\n`;
            }
            if (variant.content.en) {
                body += `**EN:**\n\`\`\`\n${variant.content.en}\n\`\`\`\n`;
            }
            body += `</details>\n`;
        });
    }

    if (data.variables && data.variables.length > 0) {
        body += `\n---\n\n#### 🔧 Переменные (${data.variables.length})\n`;
        data.variables.forEach(variable => {
            body += `- \`${variable.name}\`: ${variable.description || ''} (значение по умолчанию: \`${variable.default_value || ''}\`)\n`;
        });
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

        // 1. Получаем ссылку на последний коммит в основной ветке
        const mainBranchRef = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${mainBranch}` });
        const lastCommitSha = mainBranchRef.data.object.sha;

        // 2. Получаем дерево файлов этого коммита
        const { data: lastCommit } = await octokit.rest.git.getCommit({ owner, repo, commit_sha: lastCommitSha });
        const baseTreeSha = lastCommit.tree.sha;

        // 3. Формируем новое дерево файлов
        const tree = [];

        // Если категория изменилась, удаляем старый файл из дерева
        if (categoryChanged) {
            tree.push({
                path: oldFilePath,
                mode: '100644', // file mode
                type: 'blob',
                sha: null, // `null` sha означает удаление
            });
            // Берем дату создания из старого файла (нужно его прочитать)
            try {
                const { data: existingFile } = await octokit.rest.repos.getContent({ owner, repo, path: oldFilePath, ref: mainBranch });
                const oldContent = JSON.parse(Buffer.from(existingFile.content, 'base64').toString('utf-8'));
                finalData.created_at = oldContent.created_at || getTimestampWithoutZ(new Date());
            } catch (e) {
                finalData.created_at = getTimestampWithoutZ(new Date()); // Запасной вариант
            }
        } else if (isEditing) {
            // Если это просто обновление, нам все равно нужна старая дата создания
            try {
                const { data: existingFile } = await octokit.rest.repos.getContent({ owner, repo, path: newFilePath, ref: mainBranch });
                const oldContent = JSON.parse(Buffer.from(existingFile.content, 'base64').toString('utf-8'));
                finalData.created_at = oldContent.created_at || getTimestampWithoutZ(new Date());
            } catch (e) { /* Игнорируем */ }
        } else {
            finalData.created_at = getTimestampWithoutZ(new Date());
        }

        finalData.updated_at = getTimestampWithoutZ(new Date());
        delete finalData.original_category;

        // Добавляем новый/обновленный файл в дерево
        tree.push({
            path: newFilePath,
            mode: '100644',
            type: 'blob',
            content: JSON.stringify(finalData, null, 2),
        });

        // 4. Создаем новое дерево на сервере GitHub
        const { data: newTree } = await octokit.rest.git.createTree({
            owner, repo, tree, base_tree: baseTreeSha,
        });

        // 5. Создаем новый коммит, который указывает на это новое дерево
        const commitMessage = isEditing
            ? `fix(prompts): update prompt "${finalData.title}"`
            : `feat(prompts): add new prompt "${finalData.title}"`;
        const { data: newCommit } = await octokit.rest.git.createCommit({
            owner, repo,
            message: commitMessage,
            tree: newTree.sha,
            parents: [lastCommitSha],
            author: committer,
        });

        // 6. Создаем новую ветку, указывающую на этот новый коммит
        const prTitle = isEditing ? `Обновление промпта: ${finalData.title}` : `Новый промпт: ${finalData.title}`;
        const timestamp = Date.now().toString().slice(-6);
        const newBranchName = `prompts/${isEditing ? 'update' : 'add'}-${finalData.id.substring(0, 8)}-${timestamp}`;
        await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${newBranchName}`, sha: newCommit.sha });

        // 7. Создаем Pull Request
        const prBody = formatPullRequestBody(finalData, newFilePath, oldFilePath);
        const pr = await octokit.rest.pulls.create({ owner, repo, title: prTitle, head: newBranchName, base: mainBranch, body: prBody });

        res.status(201).json({ message: 'Pull Request created/updated successfully.', pullRequestUrl: pr.data.html_url });

    } catch (error) {
        console.error('FATAL Error:', error.response?.data || error.stack || error);
        res.status(500).json({ error: 'Internal Server Error.', details: error.response?.data || error.message });
    }
}