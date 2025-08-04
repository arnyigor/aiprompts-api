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
    console.log("--- [START] Handling request ---");
    if (req.method !== 'POST') { return res.status(405).end('Method Not Allowed'); }
    try {
        const validationResult = PromptSchema.safeParse(req.body);
        if (!validationResult.success) {
            console.error("Validation Error:", validationResult.error.flatten());
            return res.status(400).json({ error: 'Validation failed', details: validationResult.error.flatten() });
        }
        
        const incomingData = validationResult.data;
        console.log("[DATA] Incoming data is valid. Title:", incomingData.title);

        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
        const owner = process.env.GITHUB_REPO_OWNER;
        const repo = process.env.GITHUB_REPO_NAME;
        const mainBranch = process.env.GITHUB_MAIN_BRANCH || 'main';
        const committer = { name: 'AIPrompts API Bot', email: 'bot@aiprompts.dev' };

        const { category: newCategory, original_category: oldCategory } = incomingData;
        const isEditing = !!oldCategory;
        const categoryChanged = isEditing && newCategory !== oldCategory;

        console.log(`[STATE] isEditing: ${isEditing}, categoryChanged: ${categoryChanged}`);

        const newFilePath = `prompts/${newCategory}/${incomingData.id}.json`;
        const oldFilePath = isEditing ? `prompts/${oldCategory}/${incomingData.id}.json` : null;
        console.log(`[PATHS] newFilePath: ${newFilePath}, oldFilePath: ${oldFilePath}`);

        let finalData = { ...incomingData };

        // 1. Получаем ссылку на последний коммит
        console.log(`[GIT] 1. Fetching ref for branch: ${mainBranch}`);
        const mainBranchRef = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${mainBranch}` });
        const lastCommitSha = mainBranchRef.data.object.sha;
        console.log(`[GIT] 1. lastCommitSha: ${lastCommitSha}`);

        // 2. Получаем дерево файлов этого коммита
        console.log(`[GIT] 2. Fetching commit tree for sha: ${lastCommitSha}`);
        const { data: lastCommit } = await octokit.rest.git.getCommit({ owner, repo, commit_sha: lastCommitSha });
        const baseTreeSha = lastCommit.tree.sha;
        console.log(`[GIT] 2. baseTreeSha: ${baseTreeSha}`);
        
        // 3. Формируем новое дерево файлов
        console.log("[GIT] 3. Building new tree array...");
        const tree = [];

        if (categoryChanged) {
            console.log("[TREE] Category changed. Adding delete operation for:", oldFilePath);
            tree.push({ path: oldFilePath, mode: '100644', type: 'blob', sha: null });
            try {
                const { data: existingFile } = await octokit.rest.repos.getContent({ owner, repo, path: oldFilePath, ref: mainBranch });
                const oldContent = JSON.parse(Buffer.from(existingFile.content, 'base64').toString('utf-8'));
                finalData.created_at = oldContent.created_at || getTimestampWithoutZ(new Date());
            } catch (e) {
                console.warn("[WARN] Could not read old file for created_at, generating new date.");
                finalData.created_at = getTimestampWithoutZ(new Date());
            }
        } else if (isEditing) {
            try {
                const { data: existingFile } = await octokit.rest.repos.getContent({ owner, repo, path: newFilePath, ref: mainBranch });
                const oldContent = JSON.parse(Buffer.from(existingFile.content, 'base64').toString('utf-8'));
                finalData.created_at = oldContent.created_at || getTimestampWithoutZ(new Date());
            } catch(e) { /* Игнорируем */ }
        } else {
            finalData.created_at = getTimestampWithoutZ(new Date());
        }
        
        finalData.updated_at = getTimestampWithoutZ(new Date());
        delete finalData.original_category;

        console.log("[TREE] Adding create/update operation for:", newFilePath);
        tree.push({ path: newFilePath, mode: '100644', type: 'blob', content: JSON.stringify(finalData, null, 2) });
        console.log("[TREE] Final tree array:", tree);

        // 4. Создаем новое дерево на сервере GitHub
        console.log(`[GIT] 4. Creating new tree object based on: ${baseTreeSha}`);
        const { data: newTree } = await octokit.rest.git.createTree({ owner, repo, tree, base_tree: baseTreeSha });
        console.log(`[GIT] 4. New tree created. SHA: ${newTree.sha}`);

        // 5. Создаем новый коммит
        const commitMessage = isEditing ? `fix(prompts): update prompt "${finalData.title}"` : `feat(prompts): add new prompt "${finalData.title}"`;
        console.log(`[GIT] 5. Creating new commit with message: "${commitMessage}"`);
        const { data: newCommit } = await octokit.rest.git.createCommit({ owner, repo, message: commitMessage, tree: newTree.sha, parents: [lastCommitSha], author: committer });
        console.log(`[GIT] 5. New commit created. SHA: ${newCommit.sha}`);
        
        // 6. Создаем новую ветку
        const timestamp = Date.now().toString().slice(-6);
        const newBranchName = `prompts/${isEditing ? 'update' : 'add'}-${finalData.id.substring(0, 8)}-${timestamp}`;
        console.log(`[GIT] 6. Creating new branch: ${newBranchName}`);
        await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${newBranchName}`, sha: newCommit.sha });
        console.log(`[GIT] 6. Branch created successfully.`);
        
        // 7. Создаем Pull Request
        const prTitle = isEditing ? `Обновление промпта: ${finalData.title}` : `Новый промпт: ${finalData.title}`;
        console.log(`[GIT] 7. Creating Pull Request with title: "${prTitle}"`);
        const prBody = formatPullRequestBody(finalData, newFilePath, oldFilePath);
        const pr = await octokit.rest.pulls.create({ owner, repo, title: prTitle, head: newBranchName, base: mainBranch, body: prBody });
        console.log(`[GIT] 7. Pull Request created: ${pr.data.html_url}`);

        console.log("--- [SUCCESS] Request handled successfully ---");
        res.status(201).json({ message: 'Pull Request created/updated successfully.', pullRequestUrl: pr.data.html_url });

    } catch (error) {
        console.error('--- [FATAL ERROR] ---');
        console.error('Error Status:', error.status);
        console.error('Error Message:', error.message);
        console.error('GitHub Response Data:', error.response?.data);
        console.error('Full Error Stack:', error.stack);
        console.error('--- [END FATAL ERROR] ---');
        res.status(500).json({ error: 'Internal Server Error.', details: error.response?.data || { message: error.message } });
    }
}