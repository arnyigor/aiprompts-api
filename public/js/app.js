document.addEventListener('DOMContentLoaded', () => {
    // --- КОНФИГУРАЦИИ ---
    const GITHUB_REPO_OWNER = 'arnyigor';
    const GITHUB_REPO_NAME = 'aiprompts';
    const GITHUB_PROMPTS_PATH = 'prompts';
    const GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/`;

    // --- ГЛОБАЛЬНОЕ СОСТОЯНИЕ ---
    let allPrompts = [];
    let allCategories = [];
    let constructorInitialized = false;

    // --- ЭЛЕМЕНТЫ DOM ---
    const views = {
        list: document.getElementById('list-view'),
        constructor: document.getElementById('constructor-view'),
    };
    const navLinks = document.querySelectorAll('.nav-link');
    const loader = document.getElementById('loader');
    const promptGrid = document.getElementById('prompt-grid');
    const searchInput = document.getElementById('search-input');
    const categoryFilters = document.getElementById('category-filters');

    // --- ЛОГИКА СПИСКА ПРОМПТОВ ---
    async function fetchAllPrompts() {
        try {
            loader.classList.remove('hidden');
            promptGrid.classList.add('hidden');

            // --- ИЗМЕНЕНИЕ: Делаем один запрос к нашему API ---
            const response = await fetch('/api/get-prompts'); // Относительный URL
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Не удалось загрузить промпты');
            }

            allPrompts = await response.json();

            // Получаем уникальные категории из загруженных данных
            const categories = [...new Set(allPrompts.map(p => p.category))];
            allCategories = categories.sort();

            renderCategories();
            renderPrompts(allPrompts);

        } catch (error) {
            console.error("Ошибка при загрузке промптов:", error);
            loader.textContent = `❌ ${error.message}. Попробуйте обновить страницу.`;
        } finally {
            loader.classList.add('hidden');
            promptGrid.classList.remove('hidden');
        }
    }
    function renderCategories() {
        categoryFilters.innerHTML = '<button class="category-btn active" data-category="all">Все</button>';
        allCategories.forEach(category => {
            categoryFilters.innerHTML += `<button class="category-btn" data-category="${category}">${category.charAt(0).toUpperCase() + category.slice(1)}</button>`;
        });
    }

    function renderPrompts(prompts) {
        if (prompts.length === 0) {
            promptGrid.innerHTML = '<p>Промпты не найдены.</p>';
            return;
        }
        promptGrid.innerHTML = prompts.map(prompt => `
            <div class="prompt-card">
                <h3>${prompt.title}</h3>
                <div class="prompt-card-meta"><span><strong>Категория:</strong> ${prompt.category}</span><span><strong>Версия:</strong> ${prompt.version}</span></div>
                <p class="prompt-card-desc">${prompt.description || 'Нет описания.'}</p>
                <div class="prompt-card-tags">${(prompt.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}</div>
            </div>
        `).join('');
    }

    function applyFilters() {
        const searchTerm = searchInput.value.toLowerCase();
        const activeCategoryBtn = document.querySelector('#category-filters .category-btn.active');
        if (!activeCategoryBtn) return;
        const activeCategory = activeCategoryBtn.dataset.category;

        let filteredPrompts = allPrompts;
        if (activeCategory !== 'all') {
            filteredPrompts = filteredPrompts.filter(p => p.category === activeCategory);
        }
        if (searchTerm) {
            filteredPrompts = filteredPrompts.filter(p => p.title.toLowerCase().includes(searchTerm) || (p.description || '').toLowerCase().includes(searchTerm) || (p.tags || []).some(tag => tag.toLowerCase().includes(searchTerm)));
        }
        renderPrompts(filteredPrompts);
    }

    // --- УСТАНОВКА ОБРАБОТЧИКОВ СОБЫТИЙ ---
    function setupEventListeners() {
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetViewId = e.target.dataset.view;
                navLinks.forEach(l => l.classList.remove('active'));
                e.target.classList.add('active');
                Object.values(views).forEach(view => view.classList.remove('active'));
                views[targetViewId.split('-')[0]].classList.add('active');
                if (targetViewId === 'constructor-view' && !constructorInitialized) {
                    initializeConstructor(views.constructor);
                    constructorInitialized = true;
                }
            });
        });

        searchInput.addEventListener('input', applyFilters);
        categoryFilters.addEventListener('click', (e) => {
            if (e.target.matches('.category-btn')) {
                const currentActive = categoryFilters.querySelector('.active');
                if (currentActive) currentActive.classList.remove('active');
                e.target.classList.add('active');
                applyFilters();
            }
        });
    }

    // --- ЗАПУСК ПРИЛОЖЕНИЯ ---
    setupEventListeners();
    fetchAllPrompts();
});