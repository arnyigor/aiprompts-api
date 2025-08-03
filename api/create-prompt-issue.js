import { Octokit } from "@octokit/rest";
import { z } from "zod";

// Схема Zod теперь не требует никаких дат от клиента
const PromptSchema = z.object({
    id: z.string().uuid(),
    title: z.string().min(1),
    // ... все остальные поля, КРОМЕ ДАТ
}).passthrough();

function formatPullRequestBody(data, filePath) { /* ... код без изменений ... */ }

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

        const filePath = `prompts/${incomingData.category}/${incomingData.id}.json`;
        let isUpdate = false;
        let finalData = { ...incomingData };
        let fileSha = undefined;

        try {
            const { data: existingFile } = await octokit.rest.repos.getContent({ owner, repo, path: filePath, ref: mainBranch });
            fileSha = existingFile.sha;
            isUpdate = true;
            const oldContent = JSON.parse(Buffer.from(existingFile.content, 'base64').toString('utf-8'));
            finalData.created_at = oldContent.created_at || getTimestampWithoutZ(new Date()); // Берем старую дату или создаем новую, если ее не было
        } catch (error) {
            if (error.status !== 404) throw error;
            isUpdate = false;
            finalData.created_at = getTimestampWithoutZ(new Date());
        }

        finalData.updated_at = getTimestampWithoutZ(new Date());

        // ... остальной код создания ветки, коммита и PR ...
        const actionPrefix = isUpdate ? 'Update' : 'Add';
        const prTitle = isUpdate ? `Обновление промпта: ${finalData.title}` : `Новый промпт: ${finalData.title}`;
        const commitMessage = isUpdate ? `fix(prompts): update prompt "${finalData.title}"` : `feat(prompts): add new prompt "${finalData.title}"`;
        const newBranchName = `prompts/${actionPrefix.toLowerCase()}-${finalData.id.substring(0, 8)}`;
        const mainBranchRef = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${mainBranch}` });
        await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${newBranchName}`, sha: mainBranchRef.data.object.sha });
        await octokit.rest.repos.createOrUpdateFileContents({
            owner, repo, path: filePath,
            message: commitMessage,
            content: Buffer.from(JSON.stringify(finalData, null, 2)).toString('base64'),
            branch: newBranchName,
            sha: fileSha,
            committer: { name: 'AIPrompts API Bot', email: 'bot@aiprompts.dev' },
        });
        const prBody = formatPullRequestBody(finalData, filePath);
        const pr = await octokit.rest.pulls.create({ owner, repo, title: prTitle, head: newBranchName, base: mainBranch, body: prBody });

        res.status(201).json({ 
            message: 'Pull Request created/updated successfully.',
            pullRequestUrl: pr.data.html_url
        });

    } catch (error) {
        console.error('FATAL: Error in PR creation pipeline:', error);
        // --- УЛУЧШЕННЫЙ ОТВЕТ ОБ ОШИБКЕ 500 ---
        const errorMessage = process.env.NODE_ENV === 'development' ? error.stack : 'Internal Server Error.';
        res.status(500).json({ error: errorMessage });
    }
}