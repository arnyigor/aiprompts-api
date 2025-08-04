const CONSTRUCTOR_API_URL = '/api/create-prompt-issue';

const constructorHtmlTemplate = `
    <form id="prompt-form" novalidate>
        <h2 id="constructor-title" style="text-align: center; color: var(--accent-color); margin-bottom: 2rem;"></h2>
        <input type="hidden" id="prompt-id" name="prompt-id">
        <input type="hidden" id="original-category" name="original-category">
        <fieldset>
            <legend>Основная информация</legend>
            <div class="form-grid">
                <div class="form-group"><label for="title">Название <span class="required">*</span></label><input type="text" id="title" name="title" required></div>
                <div class="form-group"><label for="version">Версия <span class="required">*</span></label><input type="text" id="version" name="version" required value="1.0.0"></div>
                <div class="form-group"><label for="category-constructor">Категория <span class="required">*</span></label><select id="category-constructor" name="category" required><option value="">Выберите категорию...</option></select></div>
            </div>
            <div class="form-group form-group-editor" style="margin-top: 1.5rem;">
                <label for="description">Описание</label>
                <textarea id="description" name="description"></textarea>
                <button type="button" class="btn-editor-preview" data-editor-target="description">👁️</button>
            </div>
        </fieldset>
        <fieldset>
            <legend>Базовый Промпт <span class="required">*</span></legend>
            <div class="form-grid">
                <div class="form-group form-group-editor">
                    <label for="content_ru">Русский вариант</label>
                    <textarea id="content_ru" name="content_ru" required></textarea>
                    <button type="button" class="btn-editor-preview" data-editor-target="content_ru">👁️</button>
                </div>
                <div class="form-group form-group-editor">
                    <label for="content_en">Английский вариант</label>
                    <textarea id="content_en" name="content_en"></textarea>
                    <button type="button" class="btn-editor-preview" data-editor-target="content_en">👁️</button>
                </div>
            </div>
        </fieldset>
        <fieldset><legend>Специфичные варианты (опционально)</legend><div id="variants-list" class="dynamic-list"></div><div class="btn-add" data-list-id="variants-list">Добавить вариант</div></fieldset>
        <fieldset><legend>Дополнительные атрибуты</legend><div class="form-grid"><div class="form-group"><label>Теги</label><div id="tags-list" class="dynamic-list"></div><div class="btn-add" data-list-id="tags-list">Добавить тег</div></div><div class="form-group"><label>Совместимые модели</label><div id="models-list" class="dynamic-list"></div><div class="btn-add" data-list-id="models-list">Добавить модель</div></div></div></fieldset>
        <fieldset><legend>Переменные</legend><div id="variables-list" class="dynamic-list"></div><div class="btn-add" data-list-id="variables-list">Добавить переменную</div></fieldset>
        <div class="constructor-actions">
            <button type="submit" id="submit-btn" class="btn-submit"><span class="button-text"></span><div class="spinner"></div></button>
        </div>
        <div class="preview-container"><h2>Предпросмотр JSON</h2><pre id="json-preview-constructor" class="preview-area json-preview"></pre></div>
    </form>
`;

window.initializeConstructor = function (container, categories = [], promptToEdit = null) {
    if (!container) return;
    container.innerHTML = constructorHtmlTemplate;

    // --- ВСЕ ПЕРЕМЕННЫЕ И ФУНКЦИИ ТЕПЕРЬ ВНУТРИ ОДНОЙ ОБЛАСТИ ВИДИМОСТИ ---
    const form = container.querySelector('#prompt-form');
    const jsonPreview = container.querySelector('#json-preview-constructor');
    const categorySelect = container.querySelector('#category-constructor');
    let currentId = promptToEdit ? promptToEdit.id : '';
    const isEditing = promptToEdit !== null;

    form.querySelector('#constructor-title').textContent = isEditing ? "Редактирование промпта" : "Создание нового промпта";
    form.querySelector('#submit-btn .button-text').textContent = isEditing ? "Отправить изменения" : "Создать Pull Request";

    const itemTemplates = {
        simple: (value = '') => `<input type="text" value="${value}" /><button type="button" class="btn-remove">×</button>`,
        variable: (name = '', desc = '', def = '') => `<div class="form-grid" style="width: 100%"><input type="text" placeholder="Имя" data-key="name" value="${name}"/><input type="text" placeholder="Описание" data-key="description" value="${desc}"/><input type="text" placeholder="Значение" data-key="default_value" value="${def}"/></div><button type="button" class="btn-remove">×</button>`,
        variant: () => `<div class="variant-header"><h4>Специфичный вариант</h4><button type="button" class="btn-remove">×</button></div><div class="form-grid"><div class="form-group"><label>Тип</label><input type="text" placeholder="e.g., model" data-key="type" /></div><div class="form-group"><label>ID</label><input type="text" placeholder="e.g., gpt-4" data-key="id" /></div><div class="form-group"><label>Приоритет</label><input type="number" placeholder="e.g., 1" data-key="priority" /></div></div><div class="form-group form-group-editor"><label>Контент (RU)</label><textarea data-key="content_ru"></textarea><button type="button" class="btn-editor-preview" data-editor-target-dynamic="content_ru">👁️</button></div><div class="form-group form-group-editor"><label>Контент (EN)</label><textarea data-key="content_en"></textarea><button type="button" class="btn-editor-preview" data-editor-target-dynamic="content_en">👁️</button></div>`
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
        return item; // Возвращаем для заполнения
    }

    function gatherPayload() {
        const formData = new FormData(form);
        const originalCategory = form.querySelector('#original-category').value;
        return {
            id: currentId,
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
            original_category: isEditing ? originalCategory : undefined
        };
    }

    function updateJsonPreview() {
        if (jsonPreview) jsonPreview.textContent = JSON.stringify(gatherPayload(), null, 2);
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

    function populateCategories(categoriesToPopulate) {
        if (categoriesToPopulate && categoriesToPopulate.length > 0) {
            categorySelect.innerHTML = '<option value="">Выберите категорию...</option>';
            categoriesToPopulate.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category.charAt(0).toUpperCase() + category.slice(1);
                categorySelect.appendChild(option);
            });
        } else {
            categorySelect.innerHTML = '<option value="">Загрузка...</option>';
        }
    }
    
    // --- ЗАПОЛНЕНИЕ ДАННЫМИ И ПРИВЯЗКА СОБЫТИЙ ---

    // Сначала заполняем категории
    populateCategories(categories);

    if (isEditing) {
        form.querySelector('#title').value = promptToEdit.title || '';
        form.querySelector('#version').value = promptToEdit.version || '';
        form.querySelector('#description').value = promptToEdit.description || '';
        form.querySelector('#content_ru').value = promptToEdit.content?.ru || '';
        form.querySelector('#content_en').value = promptToEdit.content?.en || '';
        categorySelect.value = promptToEdit.category || '';
        form.querySelector('#original-category').value = promptToEdit.category || '';
        
        (promptToEdit.tags || []).forEach(tag => addItem(container.querySelector('#tags-list'), itemTemplates.simple(tag)));
        (promptToEdit.compatible_models || []).forEach(model => addItem(container.querySelector('#models-list'), itemTemplates.simple(model)));
        (promptToEdit.variables || []).forEach(v => addItem(container.querySelector('#variables-list'), itemTemplates.variable(v.name, v.description, v.default_value)));
        
        (promptToEdit.prompt_variants || []).forEach(variant => {
            const newItem = addItem(container.querySelector('#variants-list'), itemTemplates.variant());
            newItem.querySelector('[data-key="type"]').value = variant.variant_id.type;
            newItem.querySelector('[data-key="id"]').value = variant.variant_id.id;
            newItem.querySelector('[data-key="priority"]').value = variant.variant_id.priority || '';
            newItem.querySelector('[data-key="content_ru"]').value = variant.content.ru || '';
            newItem.querySelector('[data-key="content_en"]').value = variant.content.en || '';
        });
    }

    // Привязываем все обработчики
    form.addEventListener('click', (e) => {
        if (e.target.matches('.btn-editor-preview')) {
            const targetTextarea = e.target.closest('.form-group-editor').querySelector('textarea');
            if (targetTextarea && window.openModalWithEditor) {
                window.openModalWithEditor(targetTextarea.value, (newText) => {
                    targetTextarea.value = newText;
                    updateJsonPreview();
                });
            }
        }
        if (e.target.matches('.btn-add')) {
            const listId = e.target.dataset.listId;
            const listContainer = container.querySelector(`#${listId}`);
            let template;
            if (listId === 'variants-list') template = itemTemplates.variant();
            else if (listId === 'variables-list') template = itemTemplates.variable();
            else template = itemTemplates.simple();
            addItem(listContainer, template);
        }
    });

    form.addEventListener('input', updateJsonPreview);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!validateForm()) { alert('Пожалуйста, заполните все обязательные поля.'); return; }
        
        const submitBtn = form.querySelector('#submit-btn');
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');
        
        // Генерируем новый ID только если мы НЕ в режиме редактирования
        if (!isEditing) {
            currentId = (() => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); }))();
        }
        
        const payload = gatherPayload();
        
        const now = new Date().toISOString();
        payload.updated_at = now;
        if (!isEditing) {
            payload.created_at = now;
        } else {
             const originalPrompt = window.allPrompts.find(p => p.id === currentId);
             payload.created_at = originalPrompt?.created_at || now; // Защита от случая, если промпт не найден
        }

        try {
            const response = await fetch(CONSTRUCTOR_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const responseData = await response.json();
            if (!response.ok) {
                const errorPayload = { ...responseData, status: response.status };
                if (window.showAlert) window.showAlert(`❌ Ошибка отправки`, JSON.stringify(errorPayload), true);
                throw new Error('Server returned an error');
            }
            const successMessage = `**Pull Request успешно создан!**\n\nВы можете посмотреть его по ссылке:\n[${responseData.pullRequestUrl}](${responseData.pullRequestUrl})`;
            if (window.showAlert) window.showAlert('✅ Успех!', successMessage, false);
            
            if (window.initializeConstructor) {
                window.initializeConstructor(container, categories);
            }
        } catch (error) {
            console.error("Ошибка при отправке формы:", error);
            if (!error.message.includes('Server returned an error')) {
                 if (window.showAlert) window.showAlert('❌ Критическая ошибка', `Произошла непредвиденная ошибка. Подробности в консоли.`, true);
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
        }
    });

    updateJsonPreview();
};