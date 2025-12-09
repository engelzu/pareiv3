import { createClient } from '@supabase/supabase-js';
import './index.css';

// FIX: Replaced corrupted file content with valid application code to resolve syntax errors.
// The script is wrapped in an IIFE to prevent global scope pollution.
(() => {
// --- Configuração do Supabase ---
const SUPABASE_URL = 'https://oshfytkulfybyxvigsls.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zaGZ5dGt1bGZ5Ynl4dmlnc2xzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MDEzMjMsImV4cCI6MjA3NjM3NzMyM30.pashGk05S95SU1l0I-EaClgpavDL-BixWqXr0sGuNGs';

// --- Configuração da Aplicação ---
const CARDS_PER_PAGE = 12; // Cards can be larger, so show fewer per page
const ROWS_PER_PAGE = 20;
const displayToDbMap = {
  "AVANÇO": "avanco", "STATUS": "status", "ORDEM": "ordem",
  "NOME DA TAREFA": "nome_da_tarefa", "RESPONSÁVEL": "responsavel",
  "ÁREA": "area", "ID": "id_csv"
};
const displayHeaders = Object.keys(displayToDbMap);
// Add termino_da_linha_de_base for the card view
const dbSelectColumns = `id, ${Object.values(displayToDbMap).join(', ')}, resumo_sim_nao, atualizador_1_email, inicio_da_linha_de_base, termino_da_linha_de_base`;

const App = {
    supabase: null,
    elements: {},
    state: {
        allData: [],
        filteredData: [],
        currentPage: 1,
        currentView: 'list', // 'list' or 'card'
    },

    // --- Inicialização ---
    init() {
        this.cacheElements();

        this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        this.bindEvents();
        window.addEventListener('online', this.updateConnectionStatus.bind(this));
        window.addEventListener('offline', this.updateConnectionStatus.bind(this));
        window.addEventListener('resize', this.renderPagination.bind(this));
        this.loadDataFromStorage();
        this.updateConnectionStatus();
    },

    cacheElements() {
        const ids = ['loading', 'dataContainer', 'errorContainer', 'errorMessage', 'tableHeaders', 'tableBody', 'refreshBtn', 'retryBtn', 'searchInput', 'prevPage', 'nextPage', 'pageNumbers', 'paginationInfo', 'lastUpdated', 'clearFilters', 'areaFilter', 'responsavelFilter', 'atualizador1Filter', 'connectionStatus', 'viewToggleList', 'viewToggleCard', 'tableViewContainer', 'cardViewContainer', 'taskCount'];
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
        
        this.elements.viewToggleList.addEventListener('click', () => this.setView('list'));
        this.elements.viewToggleCard.addEventListener('click', () => this.setView('card'));

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
                this.renderContent();
            }
        });

        this.elements.nextPage.addEventListener('click', () => {
            const itemsPerPage = this.state.currentView === 'list' ? ROWS_PER_PAGE : CARDS_PER_PAGE;
            const totalPages = Math.ceil(this.state.filteredData.length / itemsPerPage);
            if (this.state.currentPage < totalPages) {
                this.state.currentPage++;
                this.renderContent();
            }
        });
    },
    
    setView(view) {
        this.state.currentView = view;
        this.state.currentPage = 1; // Reset to first page on view change
        
        const listBtn = this.elements.viewToggleList;
        const cardBtn = this.elements.viewToggleCard;
        
        if (view === 'list') {
            listBtn.classList.add('bg-blue-600', 'text-white');
            listBtn.classList.remove('text-blue-200');
            cardBtn.classList.remove('bg-blue-600', 'text-white');
            cardBtn.classList.add('text-blue-200');
        } else {
            cardBtn.classList.add('bg-blue-600', 'text-white');
            cardBtn.classList.remove('text-blue-200');
            listBtn.classList.remove('bg-blue-600', 'text-white');
            listBtn.classList.add('text-blue-200');
        }
        
        this.renderContent();
    },

    // --- Sincronização e Offline ---
    saveDataToStorage(data) {
        try {
            localStorage.setItem('tarefasData', JSON.stringify(data));
        } catch (e) { console.error("Erro ao salvar dados:", e); }
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
        if (existingIndex > -1) queue[existingIndex] = update;
        else queue.push(update);
        this.saveUpdateQueue(queue);
    },

    async processUpdateQueue() {
        let queue = this.getUpdateQueue();
        if (queue.length === 0) return;
        console.log(`Sincronizando ${queue.length} atualizações...`);
        const promises = queue.map(upd => this.supabase.from('tarefas').update({ avanco: upd.avanco }).eq('id', upd.id));
        try {
            const results = await Promise.all(promises);
            const errors = results.filter(res => res.error);
            if (errors.length > 0) console.error("Falha em algumas atualizações:", errors);
            else {
                console.log("Sincronização concluída.");
                this.saveUpdateQueue([]);
            }
        } catch (error) { console.error("Erro ao processar fila:", error); }
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
        if (!navigator.onLine) return;
        this.showLoading();
        try {
            const { data, error } = await this.supabase.from('tarefas').select(dbSelectColumns).order('ordem', { ascending: true });
            if (error) throw error;
            this.state.allData = data;
            this.saveDataToStorage(data);
            this.updateUI();
        } catch (error) {
            console.error('Erro ao buscar dados:', error);
            // FIX: Improved error handling to display more informative messages in the UI
            // instead of a generic "[object Object]". This robustly handles different
            // error shapes.
            let errorMessage = 'Ocorreu um erro desconhecido.';
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (error && typeof error === 'object' && 'message' in error) {
                errorMessage = String((error as { message: unknown }).message);
            } else {
                try {
                    errorMessage = JSON.stringify(error);
                } catch {
                    errorMessage = String(error);
                }
            }
            this.showError(`Erro ao carregar dados: ${errorMessage}`);
        }
    },

    async updateAvanco(rowId, newValue) {
        const newValueString = `${newValue}%`;
        const localRow = this.state.allData.find(r => r.id === rowId);
        if (localRow) localRow.avanco = newValueString;
        this.saveDataToStorage(this.state.allData);
        this.filterAndRender();

        if (navigator.onLine) {
            const { error } = await this.supabase.from('tarefas').update({ avanco: newValueString }).eq('id', rowId);
            if (error) {
                console.error('Erro ao sincronizar:', error);
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
        this.setView(this.state.currentView); // Set initial view button style
    },
    
    filterAndRender() {
        this.applyStatusLogic();
        this.filterData();
        this.renderContent();
    },

    applyStatusLogic() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        this.state.allData.forEach(row => {
            if (row.resumo_sim_nao?.toUpperCase() === 'SIM') return;
            const avanco = parseInt(row.avanco) || 0;
            if (avanco === 100) row.status = 'CONCLUÍDA';
            else if (avanco > 0) row.status = 'EM ANDAMENTO';
            else {
                const startDate = row.inicio_da_linha_de_base ? new Date(row.inicio_da_linha_de_base) : null;
                if (startDate && startDate < today) row.status = 'ATRASADA';
                else row.status = 'PENDENTE';
            }
        });
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
            data = data.filter(row => Object.values(row).some(value => String(value).toLowerCase().includes(searchTerm)));
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
    renderContent() {
        this.calculateAvancoResumo();
        this.elements.taskCount.textContent = `QT DE IDS EXCLUSIVOS: ${this.state.filteredData.length}`;
        if (this.state.currentView === 'list') {
            this.elements.cardViewContainer.classList.add('hidden');
            this.elements.tableViewContainer.classList.remove('hidden');
            this.renderTable();
        } else {
            this.elements.tableViewContainer.classList.add('hidden');
            this.elements.cardViewContainer.classList.remove('hidden');
            this.renderCards();
        }
    },

    renderTable() {
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
                    const textColor = isResumoSim && header !== 'STATUS' ? 'text-red-600' : 'text-gray-800';
                    td.className = `px-4 py-3 whitespace-nowrap text-sm ${textColor} ${responsiveClasses[header] || ''}`;
                    
                    if (header === 'NOME DA TAREFA') {
                        td.classList.remove('whitespace-nowrap');
                        td.classList.add('whitespace-normal');
                    }
                    
                    if (header === 'AVANÇO') this.renderAvancoCell(td, row, isResumoSim);
                    else if (header === 'STATUS') this.renderStatusCell(td, row.status);
                    else td.textContent = row[dbKey] || '-';
                    tr.appendChild(td);
                });
                this.elements.tableBody.appendChild(tr);
            });
        }
        this.renderPagination();
    },

    renderCards() {
        const container = this.elements.cardViewContainer;
        container.innerHTML = '';
        const { currentPage, filteredData } = this.state;
        const startIndex = (currentPage - 1) * CARDS_PER_PAGE;
        const pageData = filteredData.slice(startIndex, startIndex + CARDS_PER_PAGE);

        if (pageData.length === 0) {
            container.innerHTML = `<p class="col-span-full text-center py-10 text-gray-500">Nenhum registro encontrado.</p>`;
        } else {
            pageData.forEach(row => {
                const avanco = parseInt(row.avanco) || 0;
                const isSummary = row.resumo_sim_nao?.toUpperCase() === 'SIM';
                const isComplete = avanco === 100;
                const statusText = row.status || 'PENDENTE';
                const statusColors = {
                    'ATRASADA': 'bg-red-100 text-red-800',
                    'EM ANDAMENTO': 'bg-blue-100 text-blue-800',
                    'CONCLUÍDA': 'bg-green-100 text-green-800',
                    'PENDENTE': 'bg-gray-100 text-gray-800',
                };
                const colorClass = statusColors[statusText.toUpperCase()] || 'bg-gray-100 text-gray-800';
                
                const formatDate = (dateString) => {
                    if (!dateString) return '-';
                    const date = new Date(dateString);
                    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
                };

                let footerHTML = '';
                if (isSummary || isComplete) {
                    footerHTML = `
                        <div class="flex justify-between items-center text-sm">
                            <span class="font-semibold text-slate-700">Avanço</span>
                            <span class="font-bold text-red-600">${avanco}%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2 mt-1">
                            <div class="bg-blue-600 h-2 rounded-full" style="width: ${avanco}%"></div>
                        </div>
                    `;
                } else {
                    footerHTML = `
                        <div class="flex items-center gap-3">
                            <button data-action="decrement" class="w-7 h-7 flex-shrink-0 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white font-bold rounded-full transition-colors text-lg">
                                -
                            </button>
                            <div class="w-full">
                                <div class="flex justify-between items-center text-sm mb-1">
                                    <span class="font-semibold text-slate-700">Avanço</span>
                                    <span class="font-bold text-red-600">${avanco}%</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-2">
                                    <div class="bg-blue-600 h-2 rounded-full" style="width: ${avanco}%"></div>
                                </div>
                            </div>
                            <button data-action="increment" class="w-7 h-7 flex-shrink-0 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white font-bold rounded-full transition-colors text-lg">
                                +
                            </button>
                        </div>
                    `;
                }

                const card = document.createElement('div');
                card.className = 'bg-white border border-slate-200 rounded-lg shadow-md flex flex-col p-4 transition-all hover:shadow-xl hover:-translate-y-1';
                
                card.innerHTML = `
                    <div class="flex justify-between items-start mb-2">
                        <h3 class="font-bold text-slate-800 pr-2">${row.nome_da_tarefa || 'Tarefa sem nome'}</h3>
                        <span class="px-2.5 py-1 text-xs font-semibold rounded-full ${colorClass} whitespace-nowrap">${statusText}</span>
                    </div>
                    <div class="bg-slate-50 p-3 rounded-md text-sm text-slate-600 space-y-1 my-3">
                        <p><strong>Responsável:</strong> ${row.responsavel || '-'}</p>
                        <p><strong>Ordem:</strong> ${row.ordem || '-'}</p>
                        <p><strong>ID Exclusiva:</strong> ${row.id_csv || '-'}</p>
                        <p><strong>Início Base:</strong> ${formatDate(row.inicio_da_linha_de_base)}</p>
                        <p><strong>Término Base:</strong> ${formatDate(row.termino_da_linha_de_base)}</p>
                    </div>
                    ${isSummary ? `<span class="mb-auto px-3 py-1 text-xs font-bold text-white bg-indigo-500 rounded-full self-start">TAREFA DE RESUMO</span>` : '<div class="mb-auto"></div>'}
                    <div class="mt-4 pt-3 border-t border-slate-200">
                       ${footerHTML}
                    </div>
                `;
                container.appendChild(card);

                if (!isSummary && !isComplete) {
                    const decBtn = card.querySelector('[data-action="decrement"]');
                    const incBtn = card.querySelector('[data-action="increment"]');
                    if (decBtn) decBtn.addEventListener('click', () => this.updateAvanco(row.id, Math.max(0, avanco - 10)));
                    if (incBtn) incBtn.addEventListener('click', () => this.updateAvanco(row.id, Math.min(100, avanco + 10)));
                }
            });
        }
        this.renderPagination();
    },

    renderStatusCell(td, status) {
        const statusText = status || 'PENDENTE';
        const statusColors = {
            'ATRASADA': 'bg-red-100 text-red-800',
            'EM ANDAMENTO': 'bg-blue-100 text-blue-800',
            'CONCLUÍDA': 'bg-green-100 text-green-800',
            'PENDENTE': 'bg-gray-100 text-gray-800',
        };
        const colorClass = statusColors[statusText.toUpperCase()] || 'bg-gray-100 text-gray-800';
        td.innerHTML = `<span class="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClass}">${statusText}</span>`;
    },

    renderAvancoCell(td, row, isResumoSim) {
        const avancoString = row.avanco || '0%';
        if (isResumoSim) {
            td.textContent = avancoString;
            return;
        }
        const avancoValue = parseInt(avancoString) || 0;
        
        td.innerHTML = `
            <div class="flex items-center gap-2">
                <button data-action="decrement" data-id="${row.id}" class="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100 transition-colors">
                    <i class="fas fa-minus-circle"></i>
                </button>
                <div class="w-full bg-gray-200 rounded-full h-1.5">
                    <div class="bg-blue-600 h-1.5 rounded-full" style="width: ${avancoValue}%"></div>
                </div>
                <span class="font-semibold text-gray-700 w-12 text-center">${avancoString}</span>
                <button data-action="increment" data-id="${row.id}" class="text-green-500 hover:text-green-700 p-1 rounded-full hover:bg-green-100 transition-colors">
                     <i class="fas fa-plus-circle"></i>
                </button>
            </div>
        `;
        td.querySelector('[data-action="decrement"]').addEventListener('click', () => this.updateAvanco(row.id, Math.max(0, avancoValue - 10)));
        td.querySelector('[data-action="increment"]').addEventListener('click', () => this.updateAvanco(row.id, Math.min(100, avancoValue + 10)));
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
        const { currentPage, filteredData, currentView } = this.state;
        const itemsPerPage = currentView === 'list' ? ROWS_PER_PAGE : CARDS_PER_PAGE;
        const totalItems = filteredData.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);

        this.elements.paginationInfo.textContent = `Mostrando ${totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} a ${Math.min(currentPage * itemsPerPage, totalItems)} de ${totalItems} registros`;
        
        const pageNumbersContainer = this.elements.pageNumbers;
        pageNumbersContainer.innerHTML = '';
        if (totalPages <= 1) {
            this.elements.prevPage.style.display = 'none';
            this.elements.nextPage.style.display = 'none';
            return;
        }
        this.elements.prevPage.style.display = '';
        this.elements.nextPage.style.display = '';
        this.elements.prevPage.disabled = currentPage === 1;
        this.elements.nextPage.disabled = currentPage === totalPages;
        
        const createPageButton = (page) => {
             if (page === '...') {
                const span = document.createElement('span');
                span.className = 'px-3 py-2 text-sm text-gray-500';
                span.textContent = '...';
                return span;
            }
            const btn = document.createElement('button');
            btn.className = `relative inline-flex items-center px-4 py-2 border text-sm font-medium rounded-md ${currentPage === page ? 'z-10 bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}`;
            btn.textContent = page;
            btn.onclick = () => { this.state.currentPage = page; this.renderContent(); };
            return btn;
        };

        const pages = this.getPaginationPages(currentPage, totalPages);
        pages.forEach(p => pageNumbersContainer.appendChild(createPageButton(p)));
    },

    getPaginationPages(currentPage, totalPages) {
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
        if (currentPage <= 4) return [1, 2, 3, 4, 5, '...', totalPages];
        if (currentPage >= totalPages - 3) return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
        return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
    },

    populateFilterDropdowns() {
        // FIX: Refactored to improve readability and avoid potential complex type inference issues.
        const createOptions = (key) => {
            const values = this.state.allData.map(item => item[key]).filter(Boolean);
            const options = ['', ...new Set(values)];
            options.sort();
            return options;
        };
        const populate = (select, options) => {
            const currentValue = select.value;
            select.innerHTML = `<option value="">Todos</option>`;
            options.filter(o => o).forEach(opt => select.add(new Option(opt, opt)));
            select.value = currentValue;
        };
        populate(this.elements.areaFilter, createOptions('area'));
        populate(this.elements.responsavelFilter, createOptions('responsavel'));
        populate(this.elements.atualizador1Filter, createOptions('atualizador_1_email'));
    },

    // --- UI State Changers ---
    showLoading() {
        this.elements.loading.classList.remove('hidden');
        this.elements.dataContainer.classList.add('hidden');
        this.elements.errorContainer.classList.add('hidden');
    },
    showData() {
        this.elements.loading.classList.add('hidden');
        this.elements.dataContainer.classList.remove('hidden');
        this.elements.errorContainer.classList.add('hidden');
    },
    showError(message) {
        this.elements.loading.classList.add('hidden');
        this.elements.dataContainer.classList.add('hidden');
        this.elements.errorContainer.classList.remove('hidden');
        this.elements.errorMessage.textContent = message || 'Erro desconhecido';
    },
    updateLastUpdated() {
        this.elements.lastUpdated.textContent = `Atualizado: ${new Date().toLocaleString('pt-BR')}`;
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());
})();