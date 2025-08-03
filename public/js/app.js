document.addEventListener('DOMContentLoaded', () => {
    // --- КОНФИГУРАЦИИ И ГЛОБАЛЬНОЕ СОСТОЯНИЕ ---
    const GITHUB_API_BASE = '/api/get-prompts';
    window.allPrompts = [];
    let allCategories = [];
    let onModalSaveCallback = null;
    let constructorInitialized = false;

    // --- ЭЛЕМЕНТЫ DOM ---
    const views = {
        list: document.getElementById('list-view'),
        constructor: document.getElementById('constructor-view')
    };
    const navLinks = document.querySelectorAll('.nav-link');
    const loader = document.getElementById('loader');
    const promptGrid = document.getElementById('prompt-grid');
    const searchInput = document.getElementById('search-input');
    const categoryFilters = document.getElementById('category-filters');

    const promptModal = document.getElementById('prompt-modal');
    const promptModalBody = document.getElementById('modal-body');
    const promptModalCloseBtn = promptModal.querySelector('.modal-close-btn');

    const alertModal = document.getElementById('alert-modal');
    const alertModalBody = document.getElementById('alert-modal-body');
    const alertModalCloseBtn = alertModal.querySelector('.modal-close-btn');

    // --- ГЛАВНАЯ ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ ---
    function init() {
        setupNavigation();
        setupModalListeners();
        setupListAndFilters();
    }

    // --- ЛОГИКА СПИСКА ПРОМПТОВ ---
    function setupListAndFilters() {
        searchInput.addEventListener('input', applyFilters);
        categoryFilters.addEventListener('click', (e) => {
            if (e.target.matches('.category-btn')) {
                categoryFilters.querySelector('.active')?.classList.remove('active');
                e.target.classList.add('active');
                applyFilters();
            }
        });
        promptGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.prompt-card');
            if (card && card.dataset.promptId) {
                const prompt = window.allPrompts.find(p => p.id === card.dataset.promptId);
                if (prompt && window.openModalWithPromptData) {
                    window.openModalWithPromptData(prompt);
                }
            }
        });
        fetchAllPrompts();
    }

    async function fetchAllPrompts() {
        try {
            loader.classList.remove('hidden');
            promptGrid.classList.add('hidden');
            const response = await fetch(GITHUB_API_BASE);
            if (!response.ok) throw new Error((await response.json()).error || 'Не удалось загрузить промпты');

            const rawData = await response.json();
            window.allPrompts = rawData.filter(p => p && (p.id || p.uuid)).map(p => {
                if (!p.id && p.uuid) p.id = p.uuid;
                return p;
            });

            allCategories = [...new Set(window.allPrompts.map(p => p.category).filter(Boolean))].sort();

            renderCategories();
            applyFilters();

            // Если конструктор уже был открыт с пустыми категориями, обновляем их
            if (constructorInitialized && window.updateConstructorCategories) {
                window.updateConstructorCategories(allCategories);
            }

        } catch (error) {
            console.error("Ошибка при загрузке промптов:", error);
            loader.textContent = `❌ ${error.message}.`;
        } finally {
            loader.classList.add('hidden');
            promptGrid.classList.remove('hidden');
        }
    }

    function renderCategories() {
        let buttonsHtml = '<button class="category-btn active" data-category="all">Все</button>';
        allCategories.forEach(category => {
            buttonsHtml += `<button class="category-btn" data-category="${category}">${category.charAt(0).toUpperCase() + category.slice(1)}</button>`;
        });
        categoryFilters.innerHTML = buttonsHtml;
    }

    function renderPrompts(prompts) {
        if (!prompts || prompts.length === 0) {
            promptGrid.innerHTML = '<p>Промпты не найдены. Попробуйте изменить фильтры.</p>';
            return;
        }
        promptGrid.innerHTML = prompts.map(prompt => `
            <div class="prompt-card" data-prompt-id="${prompt.id}"> 
                <h3>${prompt.title || 'Без названия'}</h3>
                <div class="prompt-card-meta"><span><strong>Категория:</strong> ${prompt.category}</span><span><strong>Версия:</strong> ${prompt.version}</span></div>
                <p class="prompt-card-desc">${prompt.description || 'Нет описания.'}</p>
                <div class="prompt-card-tags">${(prompt.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}</div>
            </div>
        `).join('');
    }

    function applyFilters() {
        const searchTerm = searchInput.value.toLowerCase();
        const activeCategoryBtn = categoryFilters.querySelector('.category-btn.active');
        const activeCategory = activeCategoryBtn ? activeCategoryBtn.dataset.category : 'all';
        let filteredPrompts = window.allPrompts;
        if (activeCategory !== 'all') {
            filteredPrompts = filteredPrompts.filter(p => p.category === activeCategory);
        }
        if (searchTerm) {
            filteredPrompts = filteredPrompts.filter(p =>
                (p.title || '').toLowerCase().includes(searchTerm) ||
                (p.description || '').toLowerCase().includes(searchTerm) ||
                (p.tags || []).some(tag => tag.toLowerCase().includes(searchTerm))
            );
        }
        renderPrompts(filteredPrompts);
    }

    // --- ЛОГИКА МОДАЛЬНЫХ ОКОН ---
    function openModal(modalElement) {
        if (modalElement) {
            modalElement.classList.remove('hidden');
            modalElement.classList.add('visible');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeModal(modalElement) {
        if (modalElement) {
            modalElement.classList.remove('visible');
            modalElement.classList.add('hidden');
            if (!document.querySelector('.modal-overlay.visible')) {
                document.body.style.overflow = '';
            }
        }
    }


    window.showAlert = function (title, message, isError = false) {
        if (!alertModalBody) return;

        let finalMessage = message;

        if (isError) {
            try {
                const errorData = JSON.parse(message);

                // Сценарий 1: Ошибка валидации от Zod
                if (errorData.error === 'Validation failed' && errorData.details?.fieldErrors) {
                    finalMessage = "Пожалуйста, исправьте следующие ошибки в форме:\n\n";
                    for (const [field, errors] of Object.entries(errorData.details.fieldErrors)) {
                        finalMessage += `- **Поле \`${field}\`:** ${errors.join(', ')}\n`;
                    }
                }
                // Сценарий 2: Ошибка 500 с нашего сервера
                else if (errorData.error === 'Internal Server Error.' && errorData.details) {
                    // Пытаемся достать сообщение от GitHub API, если оно есть
                    const githubMessage = errorData.details.responseData?.message;
                    finalMessage = `Произошла внутренняя ошибка сервера.`;
                    if (githubMessage) {
                        finalMessage += `\n\n**Сообщение от GitHub:** \`${githubMessage}\``;
                    } else {
                        finalMessage += `\n\n**Технические детали:**\n\`\`\`json\n${JSON.stringify(errorData.details, null, 2)}\n\`\`\``;
                    }
                }
                // Сценарий 3: Любой другой JSON
                else {
                    finalMessage = `**Получен ответ:**\n\n\`\`\`json\n${JSON.stringify(errorData, null, 2)}\n\`\`\``;
                }
            } catch (e) {
                // Оставляем как есть, если это не JSON
                finalMessage = message;
            }
        }

        alertModalBody.innerHTML = `
        <h2 class="${isError ? 'error' : 'success'}">${title}</h2>
        <div>${window.marked ? window.marked.parse(finalMessage) : `<pre>${finalMessage}</pre>`}</div>
    `;
        openModal(alertModal);
    };
    function openSharedModal(promptData, isEditorMode) {
        if (!promptData) return;
        promptModal.classList.toggle('is-editor-mode', isEditorMode);
        const createPromptBlock = (title, contentObj) => {
            const rawContent = (contentObj.ru || contentObj.en || '');
            const htmlContent = window.marked ? window.marked.parse(rawContent) : rawContent;
            const textareaIsReadonly = isEditorMode ? '' : 'readonly';
            return `
                <div class="prompt-view-block">
                    <div class="prompt-view-header">
                        <h4>${title}</h4>
                        <div class="view-toggle">
                            <button class="toggle-btn active" data-view="rendered">Вид</button>
                            <button class="toggle-btn" data-view="raw">Исходник</button>
                        </div>
                        <button class="btn-copy">Копировать</button>
                    </div>
                    <div class="prompt-view-content-wrapper">
                        <div class="prompt-rendered-view markdown-preview active">${htmlContent}</div>
                        <textarea class="prompt-raw-view hidden" ${textareaIsReadonly}>${rawContent}</textarea>
                    </div>
                </div>
            `;
        };
        let variantsHtml = '';
        if (!isEditorMode && promptData.prompt_variants?.length > 0) {
            variantsHtml = promptData.prompt_variants.map((variant) =>
                createPromptBlock(`Вариант (тип: ${variant.variant_id.type}, id: ${variant.variant_id.id})`, variant.content)
            ).join('');
        }
        const footerHtml = isEditorMode
            ? `<div class="modal-footer"><button class="btn-save-modal">Сохранить</button></div>`
            : (promptData.created_at ? `<div class="modal-footer"><button class="btn-edit" data-edit-id="${promptData.id}">Редактировать</button></div>` : '');

        promptModalBody.innerHTML = `
            <div class="modal-header">
                <h2>${promptData.title}</h2>
                ${!isEditorMode ? `<div class="modal-meta"><span><strong>Категория:</strong> ${promptData.category}</span><span><strong>Версия:</strong> ${promptData.version}</span><span><strong>ID:</strong> ${promptData.id || ''}</span></div>` : ''}
            </div>
            ${createPromptBlock(isEditorMode ? 'Контент' : 'Базовый промпт', promptData.content)}
            ${variantsHtml}
            ${footerHtml}
        `;
        openModal(promptModal);
    }

    window.openModalWithPromptData = function (promptData) { openSharedModal(promptData, false); };
    window.openModalWithEditor = function (text, onSave) {
        const virtualPrompt = { title: "Редактор Markdown", content: { ru: text } };
        onModalSaveCallback = onSave;
        openSharedModal(virtualPrompt, true);
    };

    function setupModalListeners() {
        promptModalCloseBtn.addEventListener('click', () => closeModal(promptModal));
        alertModalCloseBtn.addEventListener('click', () => closeModal(alertModal));

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal(promptModal);
                closeModal(alertModal);
            }
        });

        promptModal.addEventListener('click', (e) => {
            if (e.target === promptModal && !promptModal.classList.contains('is-editor-mode')) {
                closeModal(promptModal);
            }
        });
        alertModal.addEventListener('click', (e) => {
            if (e.target === alertModal) {
                closeModal(alertModal);
            }
        });

        promptModal.addEventListener('click', async (e) => {
            const target = e.target;
            const promptBlock = target.closest('.prompt-view-block');

            if (target.matches('.toggle-btn')) {
                if (target.classList.contains('active') || !promptBlock) return;
                const viewType = target.dataset.view;
                const wrapper = promptBlock.querySelector('.prompt-view-content-wrapper');
                promptBlock.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
                target.classList.add('active');
                wrapper.querySelector('.prompt-rendered-view').classList.toggle('hidden', viewType !== 'rendered');
                wrapper.querySelector('.prompt-raw-view').classList.toggle('hidden', viewType !== 'raw');
            }

            if (target.matches('.btn-copy')) {
                const rawView = promptBlock?.querySelector('.prompt-raw-view');
                if (!rawView) return;
                try {
                    await navigator.clipboard.writeText(rawView.value);
                    target.textContent = 'Скопировано!';
                    setTimeout(() => { target.textContent = 'Копировать'; }, 2000);
                } catch (err) { console.error('Не удалось скопировать текст: ', err); target.textContent = 'Ошибка!'; }
            }

            if (target.matches('.btn-edit')) {
                const promptId = target.dataset.editId;
                const promptToEdit = window.allPrompts.find(p => p.id === promptId);
                if (promptToEdit) {
                    closeModal(promptModal);
                    if (window.initializeConstructor) {
                        window.initializeConstructor(views.constructor, allCategories, promptToEdit);
                    }
                    navLinks.forEach(l => l.classList.remove('active'));
                    const constructorLink = document.querySelector('.nav-link[data-view="constructor-view"]');
                    if (constructorLink) constructorLink.classList.add('active');
                    Object.values(views).forEach(v => v.classList.remove('active'));
                    views.constructor.classList.add('active');
                }
            }

            if (target.matches('.btn-save-modal')) {
                const newText = promptModal.querySelector('.prompt-raw-view').value;
                if (typeof onModalSaveCallback === 'function') {
                    onModalSaveCallback(newText);
                }
                closeModal(promptModal);
            }
        });
    }

    // --- ЛОГИКА НАВИГАЦИИ ---
    function setupNavigation() {
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetViewId = e.target.dataset.view;
                navLinks.forEach(l => l.classList.remove('active'));
                e.target.classList.add('active');
                Object.values(views).forEach(view => view.classList.remove('active'));
                const viewKey = targetViewId.split('-')[0];
                if (views[viewKey]) views[viewKey].classList.add('active');

                if (targetViewId === 'constructor-view' && !constructorInitialized) {
                    if (window.initializeConstructor) {
                        window.initializeConstructor(views.constructor, allCategories, null);
                        constructorInitialized = true;
                    }
                }
            });
        });
    }

    // --- ЗАПУСК ПРИЛОЖЕНИЯ ---
    init();
});