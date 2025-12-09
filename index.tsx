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
        currentView: 'list', // 'list', 'card', 'chart', 'prevReal'
        chartInstance: null,
        prevRealChartInstance: null,
    },

    // --- Inicialização ---
    init() {
        this.cacheElements();

        // FIX: Removed check for global window.supabase since we are using ES imports.
        // Direct initialization using the imported createClient function.
        try {
            this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        } catch (error) {
            console.error("Supabase initialization failed:", error);
            this.showError("Erro crítico: Falha ao inicializar o cliente de dados.");
            return;
        }

        this.bindEvents();
        window.addEventListener('online', this.updateConnectionStatus.bind(this));
        window.addEventListener('offline', this.updateConnectionStatus.bind(this));
        window.addEventListener('resize', () => {
             if (this.state.currentView !== 'chart' && this.state.currentView !== 'prevReal') {
                this.renderPagination();
             }
        });
        this.loadDataFromStorage();
        this.updateConnectionStatus();
    },

    cacheElements() {
        const ids = [
            'loading', 'dataContainer', 'errorContainer', 'errorMessage', 
            'tableHeaders', 'tableBody', 'refreshBtn', 'retryBtn', 
            'searchInput', 'prevPage', 'nextPage', 'pageNumbers', 'paginationInfo', 
            'lastUpdated', 'clearFilters', 'areaFilter', 'responsavelFilter', 'atualizador1Filter', 'typeFilter', 
            'connectionStatus', 
            'viewToggleList', 'viewToggleCard', 'viewToggleChart', 'viewTogglePrevReal', 
            'tableViewContainer', 'cardViewContainer', 'chartViewContainer', 'prevRealChartContainer', 
            'areaChart', 'taskCount', 'paginationContainer'
        ];
        ids.forEach(id => this.elements[id] = document.getElementById(id));
    },

    bindEvents() {
        this.elements.refreshBtn.addEventListener('click', () => this.fetchData());
        this.elements.retryBtn.addEventListener('click', () => this.fetchData());
        
        const filterHandler = () => {
            this.state.currentPage = 1;
            this.filterAndRender();
        };

        ['searchInput', 'areaFilter', 'responsavelFilter', 'atualizador1Filter', 'typeFilter'].forEach(id => {
            if (this.elements[id]) {
                this.elements[id].addEventListener(id === 'searchInput' ? 'input' : 'change', filterHandler);
            }
        });
        
        this.elements.viewToggleList.addEventListener('click', () => this.setView('list'));
        this.elements.viewToggleCard.addEventListener('click', () => this.setView('card'));
        this.elements.viewToggleChart.addEventListener('click', () => this.setView('chart'));
        this.elements.viewTogglePrevReal.addEventListener('click', () => this.setView('prevReal'));

        this.elements.clearFilters.addEventListener('click', () => {
            this.elements.searchInput.value = '';
            this.elements.areaFilter.value = '';
            this.elements.responsavelFilter.value = '';
            this.elements.atualizador1Filter.value = '';
            this.elements.typeFilter.value = '';
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
        
        // Reset all buttons
        ['viewToggleList', 'viewToggleCard', 'viewToggleChart', 'viewTogglePrevReal'].forEach(id => {
            const el = this.elements[id];
            if(el) {
                el.classList.remove('bg-blue-600', 'text-white');
                el.classList.add('text-blue-200'); // Inactive style
            }
        });
        
        // Activate current button
        const activeBtnId = `viewToggle${view.charAt(0).toUpperCase() + view.slice(1)}`;
        const activeBtn = this.elements[activeBtnId];
        if (activeBtn) {
            activeBtn.classList.add('bg-blue-600', 'text-white');
            activeBtn.classList.remove('text-blue-200');
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
            this.showError(`Erro ao carregar dados.`);
        }
    },

    async updateAvanco(rowId, newValue) {
        const newValueString = `${newValue}%`;
        const localRow = this.state.allData.find(r => r.id === rowId);
        if (localRow) localRow.avanco = newValueString;
        
        // Recalculate summary and save history for charts
        this.calculateAvancoResumo();
        this.saveOverallProgressHistory();
        
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
    
    // Save history for Prev x Real chart
    saveOverallProgressHistory() {
        const summaryTasks = this.state.allData.filter(t => t.resumo_sim_nao?.toUpperCase() === 'SIM');
        if (summaryTasks.length === 0) return;
        
        const totalAvanco = summaryTasks.reduce((sum, task) => sum + (parseInt(task.avanco) || 0), 0);
        const avgAvanco = totalAvanco / summaryTasks.length;
        
        let history = [];
        try {
            history = JSON.parse(localStorage.getItem('avancoHistory') || '[]');
        } catch { history = []; }
        
        // Add current point
        history.push({ x: new Date().getTime(), y: avgAvanco });
        
        // Optional: Keep history manageable size
        if (history.length > 365) history = history.slice(-365);
        
        localStorage.setItem('avancoHistory', JSON.stringify(history));
    },

    updateUI() {
        this.filterAndRender();
        this.renderHeaders();
        this.populateFilterDropdowns();
        this.updateLastUpdated();
        this.showData();
        this.setView(this.state.currentView);
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
        const typeFilter = this.elements.typeFilter.value;
        
        let data = [...this.state.allData];
        if (areaFilter) data = data.filter(r => r.area === areaFilter);
        if (respFilter) data = data.filter(r => r.responsavel === respFilter);
        if (atuaFilter) data = data.filter(r => r.atualizador_1_email === atuaFilter);
        if (typeFilter) {
            if (typeFilter === 'SIM') {
                data = data.filter(r => r.resumo_sim_nao && r.resumo_sim_nao.toUpperCase() === 'SIM');
            } else {
                data = data.filter(r => !r.resumo_sim_nao || r.resumo_sim_nao.toUpperCase() !== 'SIM');
            }
        }
        
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
        if (this.elements.taskCount) this.elements.taskCount.textContent = `QT DE IDS EXCLUSIVOS: ${this.state.filteredData.length}`;
        
        const view = this.state.currentView;
        
        // Hide all containers initially
        this.elements.tableViewContainer.classList.add('hidden');
        this.elements.cardViewContainer.classList.add('hidden');
        this.elements.chartViewContainer.classList.add('hidden');
        this.elements.prevRealChartContainer.classList.add('hidden');
        this.elements.paginationContainer.style.display = 'block';

        if (view === 'list') {
            this.elements.tableViewContainer.classList.remove('hidden');
            this.renderTable();
        } else if (view === 'card') {
            this.elements.cardViewContainer.classList.remove('hidden');
            this.renderCards();
        } else if (view === 'chart') {
            this.elements.paginationContainer.style.display = 'none';
            this.elements.chartViewContainer.classList.remove('hidden');
            this.renderChart();
        } else if (view === 'prevReal') {
            this.elements.paginationContainer.style.display = 'none';
            this.elements.prevRealChartContainer.classList.remove('hidden');
            this.renderPrevRealChart();
        }
    },

    renderChart() {
        const Chart = (window as any).Chart;
        if (!Chart || !this.elements.chartViewContainer) return;

        // Destroy existing chart if it exists
        if (this.state.chartInstance) {
            this.state.chartInstance.destroy();
        }

        // Re-create canvas element to ensure clean state
        this.elements.chartViewContainer.innerHTML = '<canvas id="areaChartCanvas"></canvas>';
        const ctx = document.getElementById('areaChartCanvas');

        // Aggregate data by Area
        const areaStats = {};
        this.state.filteredData.forEach(row => {
            if (!row.area || row.resumo_sim_nao?.toUpperCase() === 'SIM') return;
            if (!areaStats[row.area]) areaStats[row.area] = { total: 0, count: 0 };
            areaStats[row.area].total += parseInt(row.avanco) || 0;
            areaStats[row.area].count++;
        });

        const labels = Object.keys(areaStats);
        const data = labels.map(area => Math.round(areaStats[area].total / areaStats[area].count));

        this.state.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Média de Avanço por Área (%)',
                    data: data,
                    backgroundColor: 'rgba(59, 130, 246, 0.6)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { callback: (value) => value + '%' }
                    }
                }
            }
        });
    },

    renderPrevRealChart() {
        const Chart = (window as any).Chart;
        if (!Chart || !this.elements.prevRealChartContainer) return;

        if (this.state.prevRealChartInstance) {
            this.state.prevRealChartInstance.destroy();
        }

        this.elements.prevRealChartContainer.innerHTML = '<canvas id="prevRealChartCanvas"></canvas>';
        const ctx = document.getElementById('prevRealChartCanvas');

        // Logic for "Predicted": Simple diagonal from min start to max end date
        // Logic for "Real": Historical data stored in localStorage
        
        const summaryTasks = this.state.allData.filter(t => t.resumo_sim_nao?.toUpperCase() === 'SIM' && t.inicio_da_linha_de_base && t.termino_da_linha_de_base);
        
        let minDate = new Date().getTime();
        let maxDate = new Date().getTime();

        if (summaryTasks.length > 0) {
            const starts = summaryTasks.map(t => new Date(t.inicio_da_linha_de_base).getTime());
            const ends = summaryTasks.map(t => new Date(t.termino_da_linha_de_base).getTime());
            minDate = Math.min(...starts);
            maxDate = Math.max(...ends);
        }

        // Retrieve History
        let historyData = [];
        try {
            historyData = JSON.parse(localStorage.getItem('avancoHistory') || '[]');
        } catch { }
        
        // Ensure data is sorted by date
        historyData.sort((a, b) => a.x - b.x);

        this.state.prevRealChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Previsto (Curva S Teórica)',
                        data: [{ x: minDate, y: 0 }, { x: maxDate, y: 100 }],
                        borderColor: 'rgba(59, 130, 246, 1)', // Blue
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0.1
                    },
                    {
                        label: 'Realizado (Histórico)',
                        data: historyData,
                        borderColor: 'rgba(16, 185, 129, 1)', // Green
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            displayFormats: { day: 'dd/MM' }
                        },
                        title: { display: true, text: 'Data' }
                    },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: { display: true, text: 'Avanço (%)' }
                    }
                }
            }
        });
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
                
                // Sticky styles for Summary Rows
                if (isResumoSim) {
                    // top-[41px] accounts for the height of the sticky main header
                    tr.className = `font-bold bg-blue-100 text-blue-900 sticky top-[41px] z-20 shadow-sm outline outline-1 outline-blue-200`;
                }

                displayHeaders.forEach(header => {
                    const td = document.createElement('td');
                    const dbKey = displayToDbMap[header];
                    const responsiveClasses = { "STATUS": "hidden sm:table-cell", "ORDEM": "hidden lg:table-cell", "RESPONSÁVEL": "hidden md:table-cell", "ÁREA": "hidden md:table-cell", "ID": "hidden lg:table-cell" };
                    const textColor = isResumoSim && header !== 'STATUS' ? 'text-blue-900' : 'text-gray-800';
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

                 // Sticky behavior for Summary Cards (Cabeçalho entre registros)
                if (isSummary) {
                    const card = document.createElement('div');
                    card.className = 'col-span-full sticky top-0 z-30 bg-blue-600 text-white rounded-lg shadow-md p-3 flex justify-between items-center mb-2 mt-2';
                    card.innerHTML = `
                        <div class="flex items-center gap-3">
                             <h3 class="font-bold text-lg uppercase tracking-wide">${row.nome_da_tarefa || 'Agrupamento'}</h3>
                             <span class="px-2 py-0.5 text-xs bg-white/20 rounded text-white font-mono">${row.ordem || ''}</span>
                        </div>
                        <div class="flex items-center gap-4">
                             <div class="flex items-center gap-2">
                                <span class="text-sm font-medium opacity-90">Avanço:</span>
                                <span class="font-bold">${avanco}%</span>
                             </div>
                             <div class="w-24 bg-blue-800 rounded-full h-2">
                                <div class="bg-white h-2 rounded-full" style="width: ${avanco}%"></div>
                             </div>
                        </div>
                    `;
                    container.appendChild(card);
                    return; // Stop here for summary cards
                }

                let footerHTML = '';
                if (isComplete) {
                     footerHTML = `
                        <div class="flex items-center justify-center gap-2 p-2 bg-green-50 rounded-lg border border-green-100 text-green-700">
                            <i class="fas fa-check-circle"></i>
                            <span class="font-bold text-sm">Tarefa Concluída</span>
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
      if (!this.elements.tableHeaders) return;
      this.elements.tableHeaders.innerHTML = '';
      displayHeaders.forEach(header => {
        const th = document.createElement('th');
        const responsiveClasses = { "STATUS": "hidden sm:table-cell", "ORDEM": "hidden lg:table-cell", "RESPONSÁVEL": "hidden md:table-cell", "ÁREA": "hidden md:table-cell", "ID": "hidden lg:table-cell" };
        th.scope = 'col';
        th.className = `px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider sticky top-0 z-30 bg-gray-100 shadow-sm ${responsiveClasses[header] || ''}`;
        th.textContent = header;
        this.elements.tableHeaders.appendChild(th);
      });
    },

    renderPagination() {
        const { currentPage, filteredData, currentView } = this.state;
        const itemsPerPage = currentView === 'list' ? ROWS_PER_PAGE : CARDS_PER_PAGE;
        const totalItems = filteredData.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);

        if (this.elements.paginationInfo) this.elements.paginationInfo.textContent = `Mostrando ${totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} a ${Math.min(currentPage * itemsPerPage, totalItems)} de ${totalItems} registros`;
        
        const pageNumbersContainer = this.elements.pageNumbers;
        if (!pageNumbersContainer) return;

        pageNumbersContainer.innerHTML = '';
        if (totalPages <= 1) {
            if (this.elements.prevPage) this.elements.prevPage.style.display = 'none';
            if (this.elements.nextPage) this.elements.nextPage.style.display = 'none';
            return;
        }
        if (this.elements.prevPage) {
            this.elements.prevPage.style.display = '';
            this.elements.prevPage.disabled = currentPage === 1;
        }
        if (this.elements.nextPage) {
            this.elements.nextPage.style.display = '';
            this.elements.nextPage.disabled = currentPage === totalPages;
        }
        
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
        const createOptions = (key) => {
            const values = this.state.allData.map(item => item[key]).filter(Boolean);
            const options = ['', ...new Set(values)];
            options.sort();
            return options;
        };
        const populate = (select, options) => {
            if (!select) return;
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
        if (this.elements.loading) this.elements.loading.classList.remove('hidden');
        if (this.elements.dataContainer) this.elements.dataContainer.classList.add('hidden');
        if (this.elements.errorContainer) this.elements.errorContainer.classList.add('hidden');
    },
    showData() {
        if (this.elements.loading) this.elements.loading.classList.add('hidden');
        if (this.elements.dataContainer) this.elements.dataContainer.classList.remove('hidden');
        if (this.elements.errorContainer) this.elements.errorContainer.classList.add('hidden');
    },
    showError(message) {
        if (this.elements.loading) this.elements.loading.classList.add('hidden');
        if (this.elements.dataContainer) this.elements.dataContainer.classList.add('hidden');
        if (this.elements.errorContainer) this.elements.errorContainer.classList.remove('hidden');
        if (this.elements.errorMessage) this.elements.errorMessage.textContent = message || 'Erro desconhecido';
    },
    updateLastUpdated() {
        if (this.elements.lastUpdated) this.elements.lastUpdated.textContent = `Atualizado: ${new Date().toLocaleString('pt-BR')}`;
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());
})();