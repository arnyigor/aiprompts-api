// Константы вынесены для легкого доступа
const CONSTRUCTOR_API_URL = 'https://aipromptsapi.vercel.app/api/create-prompt-issue';
const CONSTRUCTOR_GITHUB_API_URL = 'https://api.github.com/repos/arnyigor/aiprompts/contents/prompts';

// HTML-шаблон для формы
const constructorHtmlTemplate = `
    <form id="prompt-form" novalidate>
        <fieldset>
            <legend>Основная информация</legend>
            <div class="form-grid">
                <div class="form-group"><label for="title">Название <span class="required">*</span></label><input type="text" id="title" name="title" required></div>
                <div class="form-group"><label for="version">Версия <span class="required">*</span></label><input type="text" id="version" name="version" required value="1.0.0"></div>
                <div class="form-group"><label for="category-constructor">Категория <span class="required">*</span></label><select id="category-constructor" name="category" required><option value="">Загрузка...</option></select></div>
            </div>
            <div class="form-group" style="margin-top: 1.5rem;"><label for="description">Описание</label><textarea id="description" name="description"></textarea></div>
        </fieldset>
        <fieldset>
            <legend>Базовый Промпт <span class="required">*</span></legend>
            <p style="color: #6c757d; font-size: 0.9rem; margin-top: -1rem; margin-bottom: 1rem;">Этот вариант будет виден всем пользователям.</p>
            <div class="form-grid">
                <div class="form-group"><label for="content_ru">Русский вариант</label><textarea id="content_ru" name="content_ru" required></textarea></div>
                <div class="form-group"><label for="content_en">Английский вариант</label><textarea id="content_en" name="content_en"></textarea></div>
            </div>
        </fieldset>
        <fieldset>
            <legend>Специфичные варианты (опционально)</legend>
            <div id="variants-list" class="dynamic-list"></div><div class="btn-add" data-list-id="variants-list">Добавить вариант</div>
        </fieldset>
        <fieldset>
            <legend>Дополнительные атрибуты</legend>
            <div class="form-grid">
                <div class="form-group"><label>Теги</label><div id="tags-list" class="dynamic-list"></div><div class="btn-add" data-list-id="tags-list">Добавить тег</div></div>
                <div class="form-group"><label>Совместимые модели</label><div id="models-list" class="dynamic-list"></div><div class="btn-add" data-list-id="models-list">Добавить модель</div></div>
            </div>
        </fieldset>
        <fieldset>
            <legend>Переменные</legend>
            <div id="variables-list" class="dynamic-list"></div><div class="btn-add" data-list-id="variables-list">Добавить переменную</div>
        </fieldset>
        <button type="submit" id="submit-btn" class="btn-submit"><span class="button-text">Создать Pull Request</span><div class="spinner"></div></button>
        <div class="preview-container"><h2>Предпросмотр JSON</h2><pre id="json-preview-constructor" class="preview-area json-preview"></pre></div>
        <div class="preview-container"><h2>Ответ Сервера</h2><pre id="response-area-constructor" class="preview-area" aria-live="polite"></pre></div>
    </form>
`;

// Главная функция, которая запускает всю логику конструктора
function initializeConstructor(container) {
    container.innerHTML = constructorHtmlTemplate;

    const form = container.querySelector('#prompt-form');
    const jsonPreview = container.querySelector('#json-preview-constructor');
    const responseArea = container.querySelector('#response-area-constructor');
    const categorySelect = container.querySelector('#category-constructor');
    let currentUUID = '';

    const itemTemplates = {
        simple: () => `<input type="text" value="" /><button type="button" class="btn-remove">×</button>`,
        variable: () => `<div class="form-grid" style="width: 100%"><input type="text" placeholder="Имя" data-key="name" /><input type="text" placeholder="Описание" data-key="description" /><input type="text" placeholder="Значение" data-key="default_value" /></div><button type="button" class="btn-remove">×</button>`,
        variant: () => `<div class="variant-header"><h4>Специфичный вариант</h4><button type="button" class="btn-remove">×</button></div><div class="form-grid"><div class="form-group"><label>Тип</label><input type="text" placeholder="e.g., model" data-key="type" /></div><div class="form-group"><label>ID</label><input type="text" placeholder="e.g., gpt-4" data-key="id" /></div><div class="form-group"><label>Приоритет</label><input type="number" placeholder="e.g., 1" data-key="priority" /></div></div><div class="form-group" style="margin-top: 1rem;"><label>Контент (RU)</label><textarea data-key="content_ru"></textarea></div><div class="form-group"><label>Контент (EN)</label><textarea data-key="content_en"></textarea></div>`
    };

    function addItem(listContainer, templateHtml) {
        const item = document.createElement('div');
        item.className = templateHtml.includes('variant-header') ? 'variant-item' : 'dynamic-item';
        item.innerHTML = templateHtml;
        listContainer.appendChild(item);
        item.querySelector('.btn-remove').addEventListener('click', () => {
            item.remove();
            updateJsonPreview();
        });
        updateJsonPreview();
    }

    function gatherPayload() {
        if (!currentUUID) currentUUID = (() => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); }))();
        const formData = new FormData(form);
        const now = new Date().toISOString();
        return {
            uuid: currentUUID,
            title: formData.get('title'),
            version: formData.get('version'),
            status: "active", is_local: false, is_favorite: false,
            description: formData.get('description'),
            content: { ru: formData.get('content_ru'), en: formData.get('content_en') },
            prompt_variants: Array.from(container.querySelectorAll('#variants-list .variant-item')).map(item => ({
                variant_id: { type: item.querySelector('[data-key="type"]').value, id: item.querySelector('[data-key="id"]').value, priority: parseInt(item.querySelector('[data-key="priority"]').value, 10) || 0 },
                content: { ru: item.querySelector('[data-key="content_ru"]').value, en: item.querySelector('[data-key="content_en"]').value }
            })).filter(v => v.variant_id.type && v.variant_id.id),
            compatible_models: Array.from(container.querySelectorAll('#models-list input')).map(i => i.value).filter(Boolean),
            category: formData.get('category'),
            tags: Array.from(container.querySelectorAll('#tags-list input')).map(i => i.value).filter(Boolean),
            variables: Array.from(container.querySelectorAll('#variables-list .dynamic-item')).map(item => ({ name: item.querySelector('[data-key="name"]').value, description: item.querySelector('[data-key="description"]').value, default_value: item.querySelector('[data-key="default_value"]').value })).filter(v => v.name),
            metadata: { author: { id: "", name: "WebApp Contributor" }, source: "WebApp", notes: "" },
            rating: { score: 0.0, votes: 0 },
            created_at: now, updated_at: now,
        };
    }

    function updateJsonPreview() {
        jsonPreview.textContent = JSON.stringify(gatherPayload(), null, 2);
    }

    function validateForm() {
        let isValid = true;
        form.querySelectorAll('[required]').forEach(input => {
            const isFilled = input.value.trim() !== '';
            input.classList.toggle('invalid', !isFilled);
            if (!isFilled) isValid = false;
        });
        return isValid;
    }

    async function fetchCategoriesForConstructor() {
        const categorySelect = document.getElementById('category-constructor');
        try {
            // Используем тот же самый прокси-эндпоинт
            const response = await fetch('/api/get-prompts');
            if (!response.ok) throw new Error('Failed to fetch categories');

            const prompts = await response.json();
            const categories = [...new Set(prompts.map(p => p.category))].sort();

            categorySelect.innerHTML = '<option value="">Выберите категорию...</option>';
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category.charAt(0).toUpperCase() + category.slice(1);
                categorySelect.appendChild(option);
            });

        } catch (error) {
            console.error("Error fetching categories for constructor:", error);
            categorySelect.innerHTML = '<option value="">Ошибка загрузки</option>';
        }
    }

    container.querySelectorAll('.btn-add').forEach(button => {
        button.addEventListener('click', (e) => {
            const listId = e.target.dataset.listId;
            const listContainer = container.querySelector(`#${listId}`);
            let template;
            if (listId === 'variants-list') template = itemTemplates.variant();
            else if (listId === 'variables-list') template = itemTemplates.variable();
            else template = itemTemplates.simple();
            addItem(listContainer, template);
        });
    });

    form.addEventListener('input', updateJsonPreview);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!validateForm()) {
            alert('Пожалуйста, заполните все обязательные поля.');
            return;
        }
        const submitBtn = form.querySelector('#submit-btn');
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');
        responseArea.innerHTML = '';
        responseArea.className = 'preview-area';
        const payload = gatherPayload();
        try {
            const response = await fetch(CONSTRUCTOR_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const responseData = await response.json();
            if (!response.ok) throw new Error(JSON.stringify(responseData, null, 2));
            responseArea.classList.add('success');
            responseArea.innerHTML = `<p>✅ Успех! Статус: ${response.status}. PR создан.</p><a href="${responseData.pullRequestUrl}" target="_blank" rel="noopener noreferrer">${responseData.pullRequestUrl}</a>`;
        } catch (error) {
            responseArea.classList.add('error');
            responseArea.textContent = `Ошибка!\n\n${error.message}`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
            currentUUID = '';
            updateJsonPreview();
        }
    });

    fetchCategoriesForConstructor();
    updateJsonPreview();
}