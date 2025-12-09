// FIX: Wrap the entire script in an IIFE to prevent global scope pollution and resolve redeclaration errors.
(() => {
// --- Configuração do Supabase ---
const SUPABASE_URL = 'https://oshfytkulfybyxvigsls.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zaGZ5dGt1bGZ5Ynl4dmlnc2xzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MDEzMjMsImV4cCI6MjA3NjM3NzMyM30.pashGk05S95SU1l0I-EaClgpavDL-BixWqXr0sGuNGs';

// --- Configuração da Aplicação ---
const ROWS_PER_PAGE = 20;
const displayToDbMap = {
  "AVANÇO": "avanco", "STATUS": "status", "ORDEM": "ordem",
  "NOME DA TAREFA": "nome_da_tarefa", "RESPONSÁVEL": "responsavel",
  "ÁREA": "area", "ID": "id_csv"
};
const displayHeaders = Object.keys(displayToDbMap);
const dbSelectColumns = `id, ${Object.values(displayToDbMap).join(', ')}, resumo_sim_nao, atualizador_1_email`;

const App = {
    supabase: null,
    elements: {},
    state: {
        allData: [],
        filteredData: [],
        currentPage: 1,
    },

    // --- Inicialização ---
    init() {
        this.cacheElements();

        // FIX: Add a check to ensure the Supabase client is loaded before trying to use it.
        // This prevents the "Cannot read properties of undefined (reading 'createClient')" error.
        // FIX: Cast window to `any` to solve TypeScript error: Property 'supabase' does not exist on type 'Window'.
        if (!(window as any).supabase) {
            console.error("Supabase client not loaded. Make sure the library script is included in your HTML file before the main app script.");
            this.showError("Erro crítico: A biblioteca de dados não pôde ser carregada. Verifique sua conexão e atualize a página.");
            return; // Stop initialization if the library is missing
        }
        
        // @ts-ignore
        this.supabase = (window as any).supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        this.bindEvents();
        window.addEventListener('online', this.updateConnectionStatus.bind(this));
        window.addEventListener('offline', this.updateConnectionStatus.bind(this));
        window.addEventListener('resize', this.renderPagination.bind(this));
        this.loadDataFromStorage();
        this.updateConnectionStatus();
    },

    cacheElements() {
        const ids = ['loading', 'dataContainer', 'errorContainer', 'errorMessage', 'tableHeaders', 'tableBody', 'refreshBtn', 'retryBtn', 'searchInput', 'prevPage', 'nextPage', 'pageNumbers', 'paginationInfo', 'lastUpdated', 'clearFilters', 'areaFilter', 'responsavelFilter', 'atualizador1Filter', 'connectionStatus'];
        ids.forEach(id => this.elements[id] = document.getElementById(id));
    },

    bindEvents() {
        this.elements.refreshBtn.addEventListener('click', () => this.fetchData());
        this.elements.retryBtn.addEventListener('click', () => this.fetchData());
        
        const filterHandler = () => {
            this.state.currentPage = 1;
            this.filterAndRender();
        };

        ['searchInput', 'areaFilter', 'responsavelFilter', 'atualizador1Filter'].forEach(id => {
            this.elements[id].addEventListener(id === 'searchInput' ? 'input' : 'change', filterHandler);
        });

        this.elements.clearFilters.addEventListener('click', () => {
            this.elements.searchInput.value = '';
            this.elements.areaFilter.value = '';
            this.elements.responsavelFilter.value = '';
            this.elements.atualizador1Filter.value = '';
            filterHandler();
        });

        this.elements.prevPage.addEventListener('click', () => {
            if (this.state.currentPage > 1) {
                this.state.currentPage--;
                this.renderTable();
            }
        });

        this.elements.nextPage.addEventListener('click', () => {
            const totalPages = Math.ceil(this.state.filteredData.length / ROWS_PER_PAGE);
            if (this.state.currentPage < totalPages) {
                this.state.currentPage++;
                this.renderTable();
            }
        });
    },

    // --- Sincronização e Offline ---
    saveDataToStorage(data) {
        try {
            localStorage.setItem('tarefasData', JSON.stringify(data));
        } catch (e) {
            console.error("Erro ao salvar dados no localStorage:", e);
        }
    },

    loadDataFromStorage() {
        const localData = localStorage.getItem('tarefasData');
        if (localData) {
            this.state.allData = JSON.parse(localData);
            this.updateUI();
        }
    },

    getUpdateQueue: () => JSON.parse(localStorage.getItem('updateQueue') || '[]'),
    saveUpdateQueue: (queue) => localStorage.setItem('updateQueue', JSON.stringify(queue)),

    queueUpdate(update) {
        const queue = this.getUpdateQueue();
        const existingIndex = queue.findIndex(item => item.id === update.id);
        if (existingIndex > -1) {
            queue[existingIndex] = update;
        } else {
            queue.push(update);
        }
        this.saveUpdateQueue(queue);
    },

    async processUpdateQueue() {
        let queue = this.getUpdateQueue();
        if (queue.length === 0) return;

        console.log(`Sincronizando ${queue.length} atualizações pendentes...`);
        const promises = queue.map(upd => this.supabase.from('tarefas').update({ avanco: upd.avanco }).eq('id', upd.id));
        
        try {
            const results = await Promise.all(promises);
            const errors = results.filter(res => res.error);
            if (errors.length > 0) {
                console.error("Algumas atualizações falharam:", errors);
            } else {
                console.log("Sincronização concluída.");
                this.saveUpdateQueue([]);
            }
        } catch (error) {
            console.error("Erro ao processar fila de atualizações:", error);
        }
    },

    updateConnectionStatus() {
        const el = this.elements.connectionStatus;
        if (navigator.onLine) {
            el.textContent = 'Online';
            el.className = 'text-sm font-semibold px-3 py-1 rounded-full bg-green-100 text-green-800';
            this.processUpdateQueue().then(() => this.fetchData());
        } else {
            el.textContent = 'Offline';
            el.className = 'text-sm font-semibold px-3 py-1 rounded-full bg-gray-200 text-gray-700';
        }
    },

    // --- Lógica de Dados e UI ---
    async fetchData() {
        if (!navigator.onLine) {
            console.log("Offline. Exibindo dados locais.");
            return;
        }
        this.showLoading();
        try {
            const { data, error } = await this.supabase.from('tarefas').select(dbSelectColumns).order('ordem', { ascending: true });
            if (error) throw error;
            this.state.allData = data;
            this.saveDataToStorage(data);
            this.updateUI();
        } catch (error) {
            console.error('Erro ao buscar dados:', error);
            this.showError(`Erro ao carregar dados: ${error.message}`);
        }
    },

    async updateAvanco(rowId, newValue) {
        const newValueString = `${newValue}%`;
        const localRow = this.state.allData.find(r => r.id === rowId);
        if (localRow) localRow.avanco = newValueString;
        this.saveDataToStorage(this.state.allData);
        this.renderTable();

        if (navigator.onLine) {
            const { error } = await this.supabase.from('tarefas').update({ avanco: newValueString }).eq('id', rowId);
            if (error) {
                console.error('Erro ao sincronizar avanço:', error);
                this.queueUpdate({ id: rowId, avanco: newValueString });
            }
        } else {
            this.queueUpdate({ id: rowId, avanco: newValueString });
        }
    },
    
    updateUI() {
        this.filterAndRender();
        this.renderHeaders();
        this.populateFilterDropdowns();
        this.updateLastUpdated();
        this.showData();
    },

    filterAndRender() {
        this.filterData();
        this.renderTable();
    },

    filterData() {
        const searchTerm = this.elements.searchInput.value.toLowerCase().trim();
        const areaFilter = this.elements.areaFilter.value;
        const respFilter = this.elements.responsavelFilter.value;
        const atuaFilter = this.elements.atualizador1Filter.value;
        
        let data = [...this.state.allData];

        if (areaFilter) data = data.filter(r => r.area === areaFilter);
        if (respFilter) data = data.filter(r => r.responsavel === respFilter);
        if (atuaFilter) data = data.filter(r => r.atualizador_1_email === atuaFilter);

        if (searchTerm) {
            data = data.filter(row =>
                Object.values(row).some(value => String(value).toLowerCase().includes(searchTerm))
            );
        }
        
        data.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
        this.state.filteredData = data;
    },

    calculateAvancoResumo() {
        const groups = this.state.allData.reduce((acc, row) => {
            if (!row.ordem) return acc;
            acc[row.ordem] = acc[row.ordem] || { simRow: null, naoRows: [] };
            if (row.resumo_sim_nao?.toUpperCase() === 'SIM') acc[row.ordem].simRow = row;
            else acc[row.ordem].naoRows.push(row);
            return acc;
        }, {});

        for (const order in groups) {
            const { simRow, naoRows } = groups[order];
            if (simRow && naoRows.length > 0) {
                const total = naoRows.reduce((sum, r) => sum + (parseInt(r.avanco) || 0), 0);
                simRow.avanco = `${Math.round(total / naoRows.length)}%`;
            }
        }
    },
    
    // --- Funções de Renderização ---
    renderTable() {
        this.calculateAvancoResumo();
        this.elements.tableBody.innerHTML = '';
        const { currentPage, filteredData } = this.state;
        const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
        const pageData = filteredData.slice(startIndex, startIndex + ROWS_PER_PAGE);

        if (pageData.length === 0) {
            this.elements.tableBody.innerHTML = `<tr><td colspan="${displayHeaders.length}" class="text-center py-10 text-gray-500">Nenhum registro encontrado.</td></tr>`;
        } else {
            pageData.forEach((row, index) => {
                const tr = document.createElement('tr');
                tr.className = `transition-colors hover:bg-blue-50 ${index % 2 !== 0 ? 'bg-gray-50' : ''}`;
                
                const isResumoSim = row.resumo_sim_nao?.toUpperCase() === 'SIM';
                if (isResumoSim) tr.classList.add('font-bold');

                displayHeaders.forEach(header => {
                    const td = document.createElement('td');
                    const dbKey = displayToDbMap[header];
                    const responsiveClasses = { "STATUS": "hidden sm:table-cell", "ORDEM": "hidden lg:table-cell", "RESPONSÁVEL": "hidden md:table-cell", "ÁREA": "hidden md:table-cell", "ID": "hidden lg:table-cell" };
                    const textColor = isResumoSim ? 'text-red-600' : 'text-gray-800';
                    td.className = `px-4 py-3 whitespace-nowrap text-sm ${textColor} ${responsiveClasses[header] || ''}`;
                    
                    if (header === 'AVANÇO') this.renderAvancoCell(td, row, isResumoSim);
                    else td.textContent = row[dbKey] || '-';
                    
                    tr.appendChild(td);
                });
                this.elements.tableBody.appendChild(tr);
            });
        }
        this.renderPagination();
    },

    renderAvancoCell(td, row, isResumoSim) {
        const avancoString = row.avanco || '0%';
        const avancoValue = parseInt(avancoString) || 0;
        td.className += ' w-64';

        if (isResumoSim) {
            td.textContent = avancoString;
            return;
        }
        
        const createBtn = (icon, color, clickHandler) => {
            const btn = document.createElement('button');
            btn.className = `text-${color}-500 hover:text-${color}-700 transition-colors px-2 py-1 rounded-full hover:bg-gray-200`;
            btn.innerHTML = `<i class="fas fa-${icon}"></i>`;
            btn.onclick = clickHandler;
            return btn;
        };

        const container = document.createElement('div');
        container.className = 'flex items-center gap-2';
        
        const decBtn = createBtn('minus', 'red', () => this.updateAvanco(row.id, Math.max(0, avancoValue - 10)));
        const incBtn = createBtn('plus', 'green', () => this.updateAvanco(row.id, Math.min(100, avancoValue + 10)));

        const progressWrapper = document.createElement('div');
        progressWrapper.className = 'w-full bg-gray-200 rounded-full h-2.5';
        const progressBar = document.createElement('div');
        progressBar.className = 'bg-blue-600 h-2.5 rounded-full transition-all duration-300';
        progressBar.style.width = `${avancoValue}%`;
        progressWrapper.appendChild(progressBar);
        
        const valueSpan = document.createElement('span');
        valueSpan.className = 'font-semibold text-gray-700 w-12 text-center';
        valueSpan.textContent = avancoString;

        container.append(decBtn, progressWrapper, valueSpan, incBtn);
        td.appendChild(container);
    },

    renderHeaders() {
      this.elements.tableHeaders.innerHTML = '';
      displayHeaders.forEach(header => {
        const th = document.createElement('th');
        const responsiveClasses = { "STATUS": "hidden sm:table-cell", "ORDEM": "hidden lg:table-cell", "RESPONSÁVEL": "hidden md:table-cell", "ÁREA": "hidden md:table-cell", "ID": "hidden lg:table-cell" };
        th.scope = 'col';
        th.className = `px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider ${responsiveClasses[header] || ''}`;
        th.textContent = header;
        this.elements.tableHeaders.appendChild(th);
      });
    },

    renderPagination() {
        const { currentPage, filteredData } = this.state;
        const totalItems = filteredData.length;
        const totalPages = Math.ceil(totalItems / ROWS_PER_PAGE);

        this.elements.paginationInfo.textContent = `Mostrando ${totalItems > 0 ? (currentPage - 1) * ROWS_PER_PAGE + 1 : 0} a ${Math.min(currentPage * ROWS_PER_PAGE, totalItems)} de ${totalItems} registros`;
        
        this.elements.pageNumbers.innerHTML = '';
        if (totalPages <= 1) {
            this.elements.prevPage.style.display = 'none';
            this.elements.nextPage.style.display = 'none';
            return;
        }
        this.elements.prevPage.style.display = '';
        this.elements.nextPage.style.display = '';
        this.elements.prevPage.disabled = currentPage === 1;
        this.elements.nextPage.disabled = currentPage === totalPages;
        
        const pagesToShow = [];
        if (totalPages <= 5) {
            for (let i = 1; i <= totalPages; i++) pagesToShow.push(i);
        } else {
            pagesToShow.push(1);
            if (currentPage > 2) pagesToShow.push('...');
            if (currentPage > 1 && currentPage < totalPages) pagesToShow.push(currentPage);
            if (currentPage < totalPages - 1) pagesToShow.push('...');
            pagesToShow.push(totalPages);
        }

        [...new Set(pagesToShow)].forEach(page => {
            if (page === '...') {
                const span = document.createElement('span');
                span.className = 'px-3 py-2 text-sm text-gray-500';
                span.textContent = '...';
                this.elements.pageNumbers.appendChild(span);
            } else {
                const btn = document.createElement('button');
                btn.className = `relative inline-flex items-center px-4 py-2 border text-sm font-medium rounded-md ${currentPage === page ? 'z-10 bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}`;
                btn.textContent = page;
                btn.onclick = () => { this.state.currentPage = page; this.renderTable(); };
                this.elements.pageNumbers.appendChild(btn);
            }
        });
    },

    populateFilterDropdowns() {
        const createOptions = (key) => ['', ...new Set(this.state.allData.map(item => item[key]).filter(Boolean))].sort();
        const populate = (select, options) => {
            const currentValue = select.value;
            select.innerHTML = '';
            options.forEach(opt => select.add(new Option(opt || 'Todos', opt)));
            select.value = currentValue;
        };
        populate(this.elements.areaFilter, createOptions('area'));
        populate(this.elements.responsavelFilter, createOptions('responsavel'));
        populate(this.elements.atualizador1Filter, createOptions('atualizador_1_email'));
    },

    // --- UI State Changers ---
    showLoading: () => document.getElementById('loading').classList.remove('hidden'),
    showData() {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('dataContainer').classList.remove('hidden');
        document.getElementById('errorContainer').classList.add('hidden');
    },
    showError(message) {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('dataContainer').classList.add('hidden');
        document.getElementById('errorContainer').classList.remove('hidden');
        document.getElementById('errorMessage').textContent = message || 'Erro desconhecido';
    },
    updateLastUpdated() {
        this.elements.lastUpdated.textContent = `Atualizado: ${new Date().toLocaleString('pt-BR')}`;
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());
})();