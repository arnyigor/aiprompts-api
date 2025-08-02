document.addEventListener('DOMContentLoaded', () => {
    // --- КОНФИГУРАЦИИ И ГЛОБАЛЬНОЕ СОСТОЯНИЕ ---
    const GITHUB_API_BASE = '/api/get-prompts';
    let allPrompts = [];
    let allCategories = [];
    let constructorInitialized = false;

    // --- ЭЛЕМЕНТЫ DOM ---
    const views = { list: document.getElementById('list-view'), constructor: document.getElementById('constructor-view') };
    const navLinks = document.querySelectorAll('.nav-link');
    const loader = document.getElementById('loader');
    const promptGrid = document.getElementById('prompt-grid');
    const searchInput = document.getElementById('search-input');
    const categoryFilters = document.getElementById('category-filters');
    const modal = document.getElementById('prompt-modal');
    const modalBody = document.getElementById('modal-body');
    const modalCloseBtn = document.querySelector('.modal-close-btn');

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
                openModalWithPrompt(card.dataset.promptId);
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
            allPrompts = rawData
                .filter(p => p && (p.id || p.uuid))
                .map(p => {
                    if (!p.id && p.uuid) p.id = p.uuid;
                    return p;
                });
            
            allCategories = [...new Set(allPrompts.map(p => p.category).filter(Boolean))].sort();
            renderCategories();
            applyFilters();

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
        let filteredPrompts = allPrompts;
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
    
    // --- ЛОГИКА МОДАЛЬНОГО ОКНА ---
    function openModalWithPrompt(id) {
        const prompt = allPrompts.find(p => p.id === id);
        if (!prompt) {
            console.error(`Промпт с ID ${id} не найден.`);
            return;
        }
        const createPromptBlock = (title, contentObj) => {
            const lang = contentObj.ru ? 'ru' : 'en';
            const content = contentObj[lang] || 'Контент отсутствует.';
            const elementId = `prompt-text-${Math.random().toString(36).substr(2, 9)}`;
            return `<div class="prompt-view-block"><div class="prompt-view-header"><h4>${title}</h4><button class="btn-copy" data-clipboard-target="#${elementId}">Копировать</button></div><div class="prompt-view-content" id="${elementId}">${content}</div></div>`;
        };
        let variantsHtml = '';
        if (prompt.prompt_variants?.length > 0) {
            variantsHtml = prompt.prompt_variants.map(variant =>
                createPromptBlock(`Вариант (тип: ${variant.variant_id.type}, id: ${variant.variant_id.id})`, variant.content)
            ).join('');
        }
        modalBody.innerHTML = `
            <div class="modal-header">
                <h2>${prompt.title}</h2>
                <div class="modal-meta"><span><strong>Категория:</strong> ${prompt.category}</span><span><strong>Версия:</strong> ${prompt.version}</span><span><strong>ID:</strong> ${prompt.id}</span></div>
            </div>
            ${createPromptBlock('Базовый промпт', prompt.content)}
            ${variantsHtml}
        `;
        modal.classList.add('visible');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modal.classList.remove('visible');
        document.body.style.overflow = '';
    }

    function setupModalListeners() {
        modal.addEventListener('click', async (e) => {
            if (e.target.matches('.btn-copy')) {
                const targetSelector = e.target.dataset.clipboardTarget;
                const contentElement = document.querySelector(targetSelector);
                if (!contentElement) return;
                try {
                    await navigator.clipboard.writeText(contentElement.innerText);
                    e.target.textContent = 'Скопировано!';
                    setTimeout(() => { e.target.textContent = 'Копировать'; }, 2000);
                } catch (err) {
                    console.error('Не удалось скопировать текст: ', err);
                    e.target.textContent = 'Ошибка!';
                }
            }
        });
        modalCloseBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('visible')) closeModal(); });
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
                    initializeConstructor(views.constructor, allCategories);
                    constructorInitialized = true;
                }
            });
        });
    }

    // --- ЗАПУСК ПРИЛОЖЕНИЯ ---
    init();
});