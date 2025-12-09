
import { createClient } from '@supabase/supabase-js';

class AppManager {
    // --- Configuração do Supabase ---
    SUPABASE_URL = 'https://oshfytkulfybyxvigsls.supabase.co';
    SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zaGZ5dGt1bGZ5Ynl4dmlnc2xzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MDEzMjMsImV4cCI6MjA3NjM3NzMyM30.pashGk05S95SU1l0I-EaClgpavDL-BixWqXr0sGuNGs';

    // --- Configuração da Aplicação ---
    CARDS_PER_PAGE = 12;
    ROWS_PER_PAGE = 20;
    displayToDbMap = {
      "AVANÇO": "avanco", "STATUS": "status", "ORDEM": "ordem",
      "NOME DA TAREFA": "nome_da_tarefa", "RESPONSÁVEL": "responsavel",
      "ÁREA": "area", "ID": "id_csv"
    };
    displayHeaders = Object.keys(this.displayToDbMap);
    dbSelectColumns = '*';
    templateHeaders = ['id_csv', 'avanco', 'status', 'ordem', 'id_exclusiva', 'centro_de_trabalho', 'local_instalacao_tag', 'descricao_local_instalacao', 'nome_da_tarefa', 'duracao', 'inicio', 'termino', 'responsavel', 'predecessoras', 'sucessoras', 'calendario_da_tarefa', 'nome_dos_recursos', 'modo', 'id_exclusiva_2', 'resumo_sim_nao', 'tipo', 'tipo_de_restricao', 'inicio_da_linha_de_base', 'termino_da_linha_de_base', 'trabalho', 'quantidade_de_recursos', 'disciplina', 'area', 'subarea', 'atualizador_1_email', 'atualizador_2_email', 'atualizador_3_email', 'atualizador_4_email', 'atualizador_5_email', 'curva_escopo_geral', 'curva_andaime', 'curva_especial', 'curva_projeto', 'caminho_critico_sim_nao', 'tipo_de_parada_pp_pe_pg', 'previsto', 'desvio'];

    supabase = null;
    // FIX: Typed `elements` as `any` to resolve multiple TypeScript errors related to accessing properties on an object with an inferred type of `{}`.
    elements: any = {};
    state = {
        allData: [],
        filteredData: [],
        currentPage: 1,
        currentView: 'list',
        expandedGroups: new Set(),
        chartInstance: null,
        prevRealChartInstance: null,
    };

    constructor() {
        this.init();
    }
    
    init() {
        this.cacheElements();
        if (!(window as any).Chart || !(window as any).XLSX) {
            console.error("Libraries not loaded");
            this.showError("Erro: Bibliotecas externas não foram carregadas. Verifique sua conexão com a internet e atualize a página.");
            return;
        }
        this.supabase = createClient(this.SUPABASE_URL, this.SUPABASE_ANON_KEY);
        this.bindEvents();
        this.loadDataFromStorage();
        this.updateConnectionStatus();
        window.addEventListener('online', this.updateConnectionStatus.bind(this));
        window.addEventListener('offline', this.updateConnectionStatus.bind(this));
        window.addEventListener('resize', () => {
             if (this.state.currentView !== 'chart' && this.state.currentView !== 'prevReal') {
                this.renderPagination();
             }
        });
    }

    cacheElements() {
        const ids = ['loading', 'dataContainer', 'errorContainer', 'errorMessage', 'tableHeaders', 'tableBody', 'refreshBtn', 'retryBtn', 'searchInput', 'prevPage', 'nextPage', 'pageNumbers', 'paginationInfo', 'lastUpdated', 'clearFilters', 'areaFilter', 'responsavelFilter', 'atualizador1Filter', 'connectionStatus', 'viewToggleList', 'viewToggleCard', 'viewToggleChart', 'viewTogglePrevReal', 'tableViewContainer', 'cardViewContainer', 'chartViewContainer', 'prevRealChartContainer', 'areaChart', 'taskCount', 'exportBtn', 'importBtn', 'fileInput', 'importModal', 'importModalTitle', 'importModalBody', 'importModalCloseBtn', 'importModalActionBtn', 'passwordModal', 'passwordModalCloseBtn', 'passwordInput', 'passwordError', 'passwordCancelBtn', 'passwordSubmitBtn', 'passwordStep1', 'passwordStep2', 'passwordModalCloseBtn2', 'exportCurrentDataBtn', 'proceedToImportBtn', 'passwordCancelBtn2', 'detailsModal', 'detailsModalTitle', 'detailsModalBody', 'detailsModalCloseBtn', 'detailsModalActionBtn', 'paginationContainer'];
        ids.forEach(id => this.elements[id] = document.getElementById(id));
    }

    bindEvents() {
        this.elements.refreshBtn.addEventListener('click', () => this.fetchData());
        this.elements.retryBtn.addEventListener('click', () => this.fetchData());
        this.elements.exportBtn.addEventListener('click', () => this.exportTemplate());
        this.elements.importBtn.addEventListener('click', () => this.togglePasswordModal(true));
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileImport(e));
        
        const closeModal = () => this.toggleImportModal(false);
        this.elements.importModalCloseBtn.addEventListener('click', closeModal);
        this.elements.importModalActionBtn.addEventListener('click', closeModal);

        const closePasswordModal = () => this.togglePasswordModal(false);
        this.elements.passwordModalCloseBtn.addEventListener('click', closePasswordModal);
        this.elements.passwordCancelBtn.addEventListener('click', closePasswordModal);
        this.elements.passwordModalCloseBtn2.addEventListener('click', closePasswordModal);
        this.elements.passwordCancelBtn2.addEventListener('click', closePasswordModal);
        
        const closeDetailsModal = () => this.toggleDetailsModal(false);
        this.elements.detailsModalCloseBtn.addEventListener('click', closeDetailsModal);
        this.elements.detailsModalActionBtn.addEventListener('click', closeDetailsModal);

        this.elements.passwordSubmitBtn.addEventListener('click', () => this.handlePasswordSubmit());
        this.elements.passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handlePasswordSubmit();
        });

        this.elements.exportCurrentDataBtn.addEventListener('click', () => this.exportCurrentData());
        this.elements.proceedToImportBtn.addEventListener('click', () => {
            this.togglePasswordModal(false);
            this.elements.fileInput.click();
        });

        const filterHandler = () => {
            this.state.currentPage = 1;
            this.filterAndRender();
        };

        ['searchInput', 'areaFilter', 'responsavelFilter', 'atualizador1Filter'].forEach(id => {
            this.elements[id].addEventListener(id === 'searchInput' ? 'input' : 'change', filterHandler);
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
            filterHandler();
        });

        this.elements.prevPage.addEventListener('click', () => {
            if (this.state.currentPage > 1) {
                this.state.currentPage--;
                this.renderContent();
            }
        });

        this.elements.nextPage.addEventListener('click', () => {
            const visibleItems = this.getVisibleItems();
            const itemsPerPage = this.state.currentView === 'list' ? this.ROWS_PER_PAGE : this.CARDS_PER_PAGE;
            const totalPages = Math.ceil(visibleItems.length / itemsPerPage);
            if (this.state.currentPage < totalPages) {
                this.state.currentPage++;
                this.renderContent();
            }
        });
    }

    toggleGroup(ordem) {
        if (this.state.expandedGroups.has(ordem)) {
            this.state.expandedGroups.delete(ordem);
        } else {
            this.state.expandedGroups.add(ordem);
        }
        this.state.currentPage = 1;
        this.renderContent();
    }
    
    formatError(error) {
        console.error("Raw error object:", error);
        if (!error) return 'Ocorreu um erro desconhecido.';
        if (typeof error === 'string') return error;

        if (error instanceof Error) {
            return error.message;
        }

        if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
            let fullMessage = error.message;
            if ('details' in error && typeof error.details === 'string') fullMessage += ` | Detalhes: ${error.details}`;
            if ('hint' in error && typeof error.hint === 'string') fullMessage += ` | Dica: ${error.hint}`;
            return fullMessage;
        }

        try {
            const jsonString = JSON.stringify(error);
            if (jsonString !== '{}') return `Objeto de erro: ${jsonString}`;
        } catch {}

        return 'Ocorreu um erro inesperado. Verifique o console para mais detalhes.';
    }

    exportTemplate() {
        const XLSX = (window as any).XLSX;
        const ws = XLSX.utils.aoa_to_sheet([this.templateHeaders]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "template_importacao_parei.xlsx");
    }
    
    exportCurrentData() {
        const XLSX = (window as any).XLSX;
        const dataToExport = this.state.allData.map(row => {
            const orderedRow = {};
            this.templateHeaders.forEach(header => {
                orderedRow[header] = row[header] !== undefined && row[header] !== null ? row[header] : '';
            });
            return orderedRow;
        });

        const ws = XLSX.utils.json_to_sheet(dataToExport, { header: this.templateHeaders });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Backup Dados Atuais");
        
        const today = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `backup_parei_${today}.xlsx`);
        (this.elements.proceedToImportBtn as HTMLButtonElement).disabled = false;
    }

    handleFileImport(event) {
        localStorage.removeItem('avancoHistory'); // Clear history on new import
        const file = (event.target as HTMLInputElement).files[0];
        if (!file) return;

        this.toggleImportModal(true, 'Processando...', '<p>Aguarde enquanto o arquivo é processado.</p>');

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const XLSX = (window as any).XLSX;
                if (!e.target?.result || !(e.target.result instanceof ArrayBuffer)) throw new Error("Não foi possível ler o arquivo corretamente.");
                
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const sheetName = workbook.SheetNames[0];
                if(!sheetName) throw new Error("O arquivo Excel parece estar vazio ou corrompido.");

                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { defval: null });

                if (json.length === 0) throw new Error("A planilha está vazia ou os dados não estão na primeira aba.");

                const headers = Object.keys(json[0]);
                const requiredHeaders = ['id_csv', 'ordem', 'nome_da_tarefa'];
                const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
                if (missingHeaders.length > 0) throw new Error(`Cabeçalhos obrigatórios ausentes no template: ${missingHeaders.join(', ')}`);

                const rowsToInsert = json.map(row => {
                    const newRow = {};
                    this.templateHeaders.forEach(header => {
                         if (row[header] !== undefined && row[header] !== null) newRow[header] = row[header];
                         else newRow[header] = null;
                    });
                    return newRow;
                });

                this.toggleImportModal(true, 'Atualizando Banco de Dados', '<p>Limpando tarefas antigas... Por favor, aguarde.</p>');
                const { error: deleteError } = await this.supabase.from('tarefas').delete().neq('id', -1); 
                if (deleteError) throw deleteError;

                this.toggleImportModal(true, 'Atualizando Banco de Dados', `<p>Inserindo ${rowsToInsert.length} novas tarefas...</p>`);
                const { error: insertError } = await this.supabase.from('tarefas').insert(rowsToInsert);
                if (insertError) throw insertError;
                
                this.toggleImportModal(true, 'Sucesso!', `<p>${rowsToInsert.length} tarefas importadas com sucesso.</p>`);
                await this.fetchData();

            } catch (error) {
                console.error("Erro na importação:", error);
                this.toggleImportModal(true, 'Erro na Importação', `<p class="text-red-600">${this.formatError(error)}</p>`);
            } finally {
                (event.target as HTMLInputElement).value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    }

    toggleImportModal(show, title = '', body = '') {
        if (show) {
            this.elements.importModalTitle.textContent = title;
            this.elements.importModalBody.innerHTML = body;
            this.elements.importModal.classList.remove('hidden');
        } else {
            this.elements.importModal.classList.add('hidden');
        }
    }
    
    toggleDetailsModal(show, task = null) {
        if (show && task) {
            this.elements.detailsModalTitle.textContent = `Detalhes: ${task.nome_da_tarefa || 'Tarefa sem nome'}`;
            const body = this.elements.detailsModalBody;
            body.innerHTML = '';
            const detailsGrid = document.createElement('div');
            detailsGrid.className = 'grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4';
            this.templateHeaders.forEach(key => {
                const value = task[key];
                if (value !== null && value !== undefined && String(value).trim() !== '') {
                    const item = document.createElement('div');
                    item.className = 'border-b border-gray-200 pb-2';
                    item.innerHTML = `<strong class="font-bold text-blue-700 capitalize mr-2">${key.replace(/_/g, ' ')}:</strong> <span class="text-gray-800">${String(value)}</span>`;
                    detailsGrid.appendChild(item);
                }
            });
            body.appendChild(detailsGrid);
            this.elements.detailsModal.classList.remove('hidden');
        } else {
            this.elements.detailsModal.classList.add('hidden');
        }
    }
    
    handlePasswordSubmit() {
        if (this.elements.passwordInput.value === '789512') {
            this.elements.passwordStep1.classList.add('hidden');
            this.elements.passwordStep2.classList.remove('hidden');
        } else {
            this.elements.passwordError.textContent = 'Senha incorreta!';
            const modalContent = this.elements.passwordModal.querySelector('.bg-white');
            if (modalContent) {
                modalContent.classList.add('animate-shake');
                setTimeout(() => modalContent.classList.remove('animate-shake'), 500);
            }
            this.elements.passwordInput.focus();
            this.elements.passwordInput.select();
        }
    }

    togglePasswordModal(show) {
        if (show) {
            this.elements.passwordStep1.classList.remove('hidden');
            this.elements.passwordStep2.classList.add('hidden');
            this.elements.passwordInput.value = '';
            this.elements.passwordError.textContent = '';
            (this.elements.proceedToImportBtn as HTMLButtonElement).disabled = true;
            this.elements.passwordModal.classList.remove('hidden');
            this.elements.passwordInput.focus();
        } else {
            this.elements.passwordModal.classList.add('hidden');
        }
    }

    setView(view) {
        this.state.currentView = view;
        this.state.currentPage = 1;
        
        ['viewToggleList', 'viewToggleCard', 'viewToggleChart', 'viewTogglePrevReal'].forEach(id => {
            const el = this.elements[id];
            el?.classList.remove('bg-blue-600', 'text-white');
            el?.classList.add('text-blue-200');
        });
        
        const activeBtnId = `viewToggle${view.charAt(0).toUpperCase() + view.slice(1)}`;
        this.elements[activeBtnId]?.classList.add('bg-blue-600', 'text-white');

        this.renderContent();
    }

    saveDataToStorage(data) {
        try {
            localStorage.setItem('tarefasData', JSON.stringify(data));
        } catch (e) { console.error("Erro ao salvar dados:", e); }
    }

    loadDataFromStorage() {
        const localData = localStorage.getItem('tarefasData');
        if (localData) {
            this.state.allData = JSON.parse(localData);
            this.updateUI();
        } else {
            this.fetchData();
        }
    }

    getUpdateQueue = () => JSON.parse(localStorage.getItem('updateQueue') || '[]');
    saveUpdateQueue = (queue) => localStorage.setItem('updateQueue', JSON.stringify(queue));

    queueUpdate(update) {
        const queue = this.getUpdateQueue();
        const existingIndex = queue.findIndex(item => item.id === update.id);
        if (existingIndex > -1) {
            queue[existingIndex] = { ...queue[existingIndex], ...update };
        } else {
            queue.push(update);
        }
        this.saveUpdateQueue(queue);
    }
    
    async processUpdateQueue() {
        let queue = this.getUpdateQueue();
        if (queue.length === 0) return;
        console.log(`Sincronizando ${queue.length} atualizações...`);
        const failedUpdates = [];
    
        for (const update of queue) {
            const { id, ...updateData } = update;
            if (!id || (updateData.avanco === undefined)) continue;
            
            try {
                const { error } = await this.supabase.from('tarefas').update(updateData).eq('id', id);
                if (error) {
                    if (error.message.includes("column") && (error.message.includes("avanco_history") || error.message.includes("avanco_updated_at"))) {
                        console.warn(`Fallback: Coluna de histórico não encontrada. Sincronizando apenas avanço para tarefa ${id}.`);
                        const { error: fallbackError } = await this.supabase.from('tarefas').update({ avanco: updateData.avanco }).eq('id', id);
                        if (fallbackError) throw fallbackError; // If fallback also fails, keep it in the queue
                    } else {
                        throw error;
                    }
                }
            } catch (error) {
                 console.error(`Erro ao sincronizar tarefa ${id}:`, this.formatError(error));
                 failedUpdates.push(update);
            }
        }
        this.saveUpdateQueue(failedUpdates);
        if (failedUpdates.length === 0) console.log("Sincronização da fila concluída.");
        else console.warn(`${failedUpdates.length} atualizações permaneceram na fila.`);
        if (navigator.onLine) await this.fetchData();
    }

    updateConnectionStatus() {
        const el = this.elements.connectionStatus;
        if (navigator.onLine) {
            el.textContent = 'Online';
            el.className = 'text-sm font-semibold px-3 py-1 rounded-full bg-green-100 text-green-800';
            this.processUpdateQueue();
        } else {
            el.textContent = 'Offline';
            el.className = 'text-sm font-semibold px-3 py-1 rounded-full bg-gray-200 text-gray-700';
        }
    }

    async fetchData() {
        if (!navigator.onLine) return;
        this.showLoading();
        try {
            const { data, error } = await this.supabase.from('tarefas').select(this.dbSelectColumns).order('ordem', { ascending: true });
            if (error) throw error;
            this.state.allData = data.map(d => ({ ...d, avanco_history: d.avanco_history || [] }));
            this.saveDataToStorage(this.state.allData);
            this.updateUI();
        } catch (error) {
            this.showError(this.formatError(error));
        }
    }

    async updateAvanco(rowId, newValue) {
        const timestamp = new Date().toISOString();
        const task = this.state.allData.find(r => r.id === rowId);
        if (!task) return;

        task.avanco = `${newValue}%`;
        task.avanco_history = task.avanco_history || [];
        task.avanco_history.push({ percent: newValue, date: timestamp });
    
        this.calculateAvancoResumo();
        this.saveOverallProgressHistory();
        this.saveDataToStorage(this.state.allData);
        this.filterAndRender();

        const syncTask = async (id, payload) => {
            if (navigator.onLine) {
                try {
                    const { error } = await this.supabase.from('tarefas').update(payload).eq('id', id);
                    if (error) {
                        if (error.message.includes("column") && error.message.includes("avanco_history")) {
                             console.warn(`Fallback: Coluna 'avanco_history' não encontrada. Sincronizando apenas avanço para tarefa ${id}.`);
                            const { error: fallbackError } = await this.supabase.from('tarefas').update({ avanco: payload.avanco }).eq('id', id);
                            if (fallbackError) throw fallbackError;
                        } else {
                            throw error;
                        }
                    }
                } catch (err) {
                    console.error(`Erro ao sincronizar tarefa ${id}:`, this.formatError(err));
                    this.queueUpdate({ id, ...payload });
                }
            } else {
                this.queueUpdate({ id, ...payload });
            }
        };

        await syncTask(task.id, { avanco: task.avanco, avanco_history: task.avanco_history });
        const parentRow = task.ordem ? this.state.allData.find(r => r.ordem === task.ordem && r.resumo_sim_nao?.toUpperCase() === 'SIM') : null;
        if (parentRow) {
            await syncTask(parentRow.id, { avanco: parentRow.avanco, avanco_history: parentRow.avanco_history });
        }
    }

    saveOverallProgressHistory() {
        const summaryTasks = this.state.allData.filter(t => t.resumo_sim_nao?.toUpperCase() === 'SIM');
        if (summaryTasks.length === 0) return;

        const totalAvanco = summaryTasks.reduce((sum, task) => sum + (parseInt(task.avanco) || 0), 0);
        const avgAvanco = totalAvanco / summaryTasks.length;
        
        let history = [];
        try {
            history = JSON.parse(localStorage.getItem('avancoHistory') || '[]');
        } catch { history = []; }
        
        history.push({ x: new Date().getTime(), y: avgAvanco });
        localStorage.setItem('avancoHistory', JSON.stringify(history));
    }
    
    updateUI() {
        this.filterAndRender();
        this.populateFilterDropdowns();
        this.updateLastUpdated();
        this.showData();
        this.setView(this.state.currentView);
    }
    
    filterAndRender() {
        this.applyStatusLogic();
        this.filterData();
        this.renderContent();
    }

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
    }

    filterData() {
        const sanitizedSearch = this.elements.searchInput.value.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, '');
        const searchTerm = sanitizedSearch.toLowerCase().trim();
        const areaFilter = this.elements.areaFilter.value;
        const respFilter = this.elements.responsavelFilter.value;
        const atuaFilter = this.elements.atualizador1Filter.value;
        
        let data = [...this.state.allData];
        if (areaFilter) data = data.filter(r => r.area === areaFilter);
        if (respFilter) data = data.filter(r => r.responsavel === respFilter);
        if (atuaFilter) data = data.filter(r => r.atualizador_1_email === atuaFilter);
        if (searchTerm) data = data.filter(row => Object.values(row).some(value => String(value).toLowerCase().includes(searchTerm)));
        data.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
        this.state.filteredData = data;
    }

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
                const avgAvanco = Math.round(total / naoRows.length);
                simRow.avanco = `${avgAvanco}%`;
    
                let latestChildUpdate = null;
                naoRows.forEach(child => {
                    if (child.avanco_history && child.avanco_history.length > 0) {
                        const lastUpdate = child.avanco_history[child.avanco_history.length - 1];
                        if (!latestChildUpdate || new Date(lastUpdate.date) > new Date(latestChildUpdate.date)) {
                            latestChildUpdate = lastUpdate;
                        }
                    }
                });
    
                if (latestChildUpdate) {
                    if (!simRow.avanco_history) simRow.avanco_history = [];
                    simRow.avanco_history.push({ percent: avgAvanco, date: latestChildUpdate.date });
                }
            }
        }
    }
    
    getVisibleItems() {
        const { filteredData, expandedGroups } = this.state;
        const groups = {};
        filteredData.forEach(row => {
            if (!row.ordem) return;
            groups[row.ordem] = groups[row.ordem] || { parent: null, children: [] };
            if (row.resumo_sim_nao?.toUpperCase() === 'SIM') groups[row.ordem].parent = row;
            else groups[row.ordem].children.push(row);
        });
        const visibleItems = [];
        const processedOrders = new Set();
        filteredData.forEach(row => {
            if (!row.ordem) {
                visibleItems.push(row);
                return;
            }
            if (processedOrders.has(row.ordem)) return;
            const group = groups[row.ordem];
            if (group) {
                if (group.parent) {
                    visibleItems.push({ ...group.parent, isParent: true, hasChildren: group.children.length > 0 });
                    if (expandedGroups.has(row.ordem)) {
                        group.children.forEach(child => visibleItems.push({ ...child, isChild: true }));
                    }
                } else {
                    visibleItems.push(...group.children);
                }
            }
            processedOrders.add(row.ordem);
        });
        return visibleItems;
    }

    renderContent() {
        this.calculateAvancoResumo();
        this.elements.taskCount.textContent = `QT DE IDS EXCLUSIVOS: ${this.state.filteredData.length}`;
        const view = this.state.currentView;

        Object.values(this.elements).forEach(el => {
            if (el && el.id?.includes('ViewContainer')) (el as HTMLElement).style.display = 'none';
        });
        this.elements.paginationContainer.style.display = 'flex'; 

        if (view === 'list') {
            this.elements.tableViewContainer.style.display = 'block';
            this.renderTable();
        } else if (view === 'card') {
            this.elements.cardViewContainer.style.display = 'grid';
            this.renderCards();
        } else if (view === 'chart' || view === 'prevReal') {
            this.elements.paginationContainer.style.display = 'none';
            if(view === 'chart'){
                this.elements.chartViewContainer.style.display = 'block';
                this.renderChart();
            } else {
                this.elements.prevRealChartContainer.style.display = 'block';
                this.renderPrevRealChart();
            }
        }
    }
    
    renderChart() {
        if (!this.elements.chartViewContainer) return;
        const Chart = (window as any).Chart;
        if (!Chart) return;

        if (this.state.chartInstance) this.state.chartInstance.destroy();
        this.elements.chartViewContainer.innerHTML = '<canvas id="areaChart"></canvas>';
        const ctx = (this.elements.chartViewContainer.querySelector('#areaChart') as HTMLCanvasElement)?.getContext('2d');
        if(!ctx) return;
        
        const areaProgress = this.state.filteredData.reduce((acc, row) => {
            if (!row.area || row.resumo_sim_nao?.toUpperCase() === 'SIM') return acc;
            if (!acc[row.area]) acc[row.area] = { total: 0, count: 0 };
            acc[row.area].total += parseInt(row.avanco) || 0;
            acc[row.area].count++;
            return acc;
        }, {});

        const labels = Object.keys(areaProgress);
        const data = labels.map(area => areaProgress[area].count > 0 ? areaProgress[area].total / areaProgress[area].count : 0);

        this.state.chartInstance = new Chart(ctx, {
            type: 'bar', data: { labels, datasets: [{ label: '% de Avanço Médio por Área', data, backgroundColor: 'rgba(59, 130, 246, 0.5)', borderColor: 'rgba(59, 130, 246, 1)', borderWidth: 1 }] },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, max: 100, ticks: { callback: (value) => value + '%' } } }, plugins: { legend: { display: true } } }
        });
    }
    
    renderPrevRealChart() {
        if (!this.elements.prevRealChartContainer) return;
        const Chart = (window as any).Chart;
        if (!Chart || !(window as any).Chart._adapters) {
            this.elements.prevRealChartContainer.innerHTML = '<p class="text-red-500 text-center">Erro: A biblioteca de gráficos ou o adaptador de data não foram carregados.</p>';
            return;
        }

        if (this.state.prevRealChartInstance) this.state.prevRealChartInstance.destroy();
        this.elements.prevRealChartContainer.innerHTML = '<canvas id="prevRealChart"></canvas>';
        const ctx = (this.elements.prevRealChartContainer.querySelector('#prevRealChart') as HTMLCanvasElement)?.getContext('2d');
        if (!ctx) return;

        const summaryTasks = this.state.filteredData.filter(t => t.resumo_sim_nao?.toUpperCase() === 'SIM' && t.inicio && t.termino);
        if (summaryTasks.length === 0) {
            this.elements.prevRealChartContainer.innerHTML = '<p class="text-center py-10 text-gray-500">Nenhuma tarefa de resumo com datas para exibir o gráfico.</p>';
            return;
        }

        const dates = summaryTasks.flatMap(t => [new Date(t.inicio).getTime(), new Date(t.termino).getTime()]);
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));

        let history = [];
        try { history = JSON.parse(localStorage.getItem('avancoHistory') || '[]'); } catch { history = []; }
        history.sort((a, b) => a.x - b.x);
        
        const todayLinePlugin = {
            id: 'todayLine',
            afterDraw: (chart) => {
                const ctx = chart.ctx;
                const xAxis = chart.scales.x;
                const yAxis = chart.scales.y;
                const todayX = xAxis.getPixelForValue(new Date().getTime());

                if (todayX >= xAxis.left && todayX <= xAxis.right) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(todayX, yAxis.top);
                    ctx.lineTo(todayX, yAxis.bottom);
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = 'rgba(255, 99, 132, 0.8)';
                    ctx.setLineDash([5, 5]);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        };

        this.state.prevRealChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    { label: 'Previsto', data: [{ x: minDate.getTime(), y: 0 }, { x: maxDate.getTime(), y: 100 }], borderColor: 'rgb(59, 130, 246)', tension: 0.1 },
                    { label: 'Realizado', data: history, borderColor: 'rgb(239, 68, 68)', borderDash: [5, 5], tension: 0.1 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { type: 'time', time: { unit: 'day', tooltipFormat: 'dd/MM/yyyy', displayFormats: { day: 'dd/MM' } }, min: minDate.getTime(), max: maxDate.getTime(), title: { display: true, text: 'Data' } },
                    y: { beginAtZero: true, max: 100, title: { display: true, text: 'Progresso (%)' }, ticks: { callback: (value) => value + '%' } }
                },
                plugins: { title: { display: true, text: 'Curva S - Previsto vs. Realizado' }, legend: { position: 'top' }, tooltip: { mode: 'index', intersect: false } }
            },
            plugins: [todayLinePlugin]
        });
    }

    renderHeaders() {
      this.elements.tableHeaders.innerHTML = '';
      this.displayHeaders.forEach(header => {
        const th = document.createElement('th');
        const responsiveClasses = { "STATUS": "hidden sm:table-cell", "ORDEM": "hidden lg:table-cell", "RESPONSÁVEL": "hidden md:table-cell", "ÁREA": "hidden md:table-cell", "ID": "hidden lg:table-cell" };
        th.className = `px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider ${responsiveClasses[header] || ''}`;
        th.textContent = header;
        this.elements.tableHeaders.appendChild(th);
      });
    }
    
    renderTable() {
        this.elements.tableBody.innerHTML = '';
        const visibleItems = this.getVisibleItems();
        const startIndex = (this.state.currentPage - 1) * this.ROWS_PER_PAGE;
        const pageData = visibleItems.slice(startIndex, startIndex + this.ROWS_PER_PAGE);

        if (pageData.length === 0) {
            this.elements.tableBody.innerHTML = `<tr><td colspan="${this.displayHeaders.length}" class="text-center py-10 text-gray-500">Nenhum registro encontrado.</td></tr>`;
        } else {
            pageData.forEach((row) => {
                const tr = document.createElement('tr');
                tr.className = `transition-colors hover:bg-blue-50 ${row.isChild ? 'bg-gray-50' : 'bg-white'}`;
                this.displayHeaders.forEach(header => {
                    const td = document.createElement('td');
                    const dbKey = this.displayToDbMap[header];
                    const isResumoSim = row.resumo_sim_nao?.toUpperCase() === 'SIM';
                    const textColor = isResumoSim ? 'text-red-600 font-bold' : 'text-gray-800';
                    const responsiveClasses = { "STATUS": "hidden sm:table-cell", "ORDEM": "hidden lg:table-cell", "RESPONSÁVEL": "hidden md:table-cell", "ÁREA": "hidden md:table-cell", "ID": "hidden lg:table-cell" };
                    td.className = `px-4 py-3 whitespace-nowrap text-sm ${textColor} ${responsiveClasses[header] || ''}`;

                    if (header === 'AVANÇO') this.renderAvancoCell(td, row);
                    else if (header === 'NOME DA TAREFA') this.renderTaskNameCell(td, row);
                    else if (header === 'STATUS') this.renderStatusCell(td, row.status);
                    else td.textContent = row[dbKey] || '-';
                    tr.appendChild(td);
                });
                this.elements.tableBody.appendChild(tr);
            });
        }
        this.renderPagination();
    }

    renderTaskNameCell(td, row) {
        let expanderIcon = "";
        if (row.isParent && row.hasChildren) {
            expanderIcon = `<i class="fas ${this.state.expandedGroups.has(row.ordem) ? 'fa-chevron-down' : 'fa-chevron-right'} text-blue-500 w-4 cursor-pointer mr-2"></i>`;
        }
        const indentClass = row.isChild ? 'pl-6' : '';
        const detailsIcon = `<button class="text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-100 transition-colors ml-2" data-details-id="${row.id}" aria-label="Ver detalhes"><i class="fas fa-plus-circle text-lg"></i></button>`;

        td.innerHTML = `<div class="flex items-center ${indentClass}">${expanderIcon}<span class="cursor-pointer">${row.nome_da_tarefa || '-'}</span>${detailsIcon}</div>`;
        
        const clickableArea = td.querySelector('.flex');
        if (row.isParent && row.hasChildren) {
            clickableArea.addEventListener('click', (e) => { e.stopPropagation(); this.toggleGroup(row.ordem); });
        }
        td.querySelector(`[data-details-id="${row.id}"]`).addEventListener('click', (e) => { e.stopPropagation(); this.toggleDetailsModal(true, row); });
    }
    
    renderStatusCell(td, status) {
        const statusText = status || 'PENDENTE';
        const statusColors = { 'ATRASADA': 'bg-red-100 text-red-800', 'EM ANDAMENTO': 'bg-blue-100 text-blue-800', 'CONCLUÍDA': 'bg-green-100 text-green-800', 'PENDENTE': 'bg-gray-100 text-gray-800' };
        const colorClass = statusColors[statusText.toUpperCase()] || 'bg-gray-100 text-gray-800';
        td.innerHTML = `<span class="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClass}">${statusText}</span>`;
    }

    renderAvancoCell(td, row) {
        const avancoValue = parseInt(row.avanco) || 0;
        const isResumo = row.resumo_sim_nao?.toUpperCase() === 'SIM' || row.isParent;
        
        const progressWrapper = document.createElement('div');
        progressWrapper.className = 'w-full bg-gray-200 rounded-full h-1.5 relative';
        progressWrapper.innerHTML = `<div class="bg-blue-600 h-1.5 rounded-full" style="width: ${avancoValue}%"></div>`;

        if (row.avanco_history && Array.isArray(row.avanco_history)) {
            row.avanco_history.forEach(hist => {
                const marker = document.createElement('div');
                marker.className = 'progress-marker';
                marker.style.left = `${hist.percent}%`;
                marker.title = `Avanço de ${hist.percent}% em ${new Date(hist.date).toLocaleString('pt-BR')}`;
                progressWrapper.appendChild(marker);
            });
        }
            
        const container = document.createElement('div');
        container.className = 'flex items-center gap-2';

        if (isResumo) {
            container.append(progressWrapper, new DOMParser().parseFromString(`<span class="font-semibold text-red-600 w-12 text-center">${row.avanco || '0%'}</span>`, 'text/html').body.firstChild);
        } else {
            const decBtn = new DOMParser().parseFromString('<button data-action="decrement" class="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100"><i class="fas fa-minus-circle"></i></button>', 'text/html').body.firstChild;
            const incBtn = new DOMParser().parseFromString('<button data-action="increment" class="text-green-500 hover:text-green-700 p-1 rounded-full hover:bg-green-100"><i class="fas fa-plus-circle"></i></button>', 'text/html').body.firstChild;
            const valueSpan = new DOMParser().parseFromString(`<span class="font-semibold text-gray-700 w-12 text-center">${row.avanco || '0%'}</span>`, 'text/html').body.firstChild;
            container.append(decBtn, progressWrapper, valueSpan, incBtn);
            container.querySelector('[data-action="decrement"]').addEventListener('click', () => this.updateAvanco(row.id, Math.max(0, avancoValue - 5)));
            container.querySelector('[data-action="increment"]').addEventListener('click', () => this.updateAvanco(row.id, Math.min(100, avancoValue + 5)));
        }
        td.appendChild(container);
    }
    
    renderCards() {
        const container = this.elements.cardViewContainer;
        container.innerHTML = '';
        const visibleItems = this.getVisibleItems();
        const startIndex = (this.state.currentPage - 1) * this.CARDS_PER_PAGE;
        const pageData = visibleItems.slice(startIndex, startIndex + this.CARDS_PER_PAGE);
    
        if (pageData.length === 0) {
            container.innerHTML = `<p class="col-span-full text-center py-10 text-gray-500">Nenhum registro encontrado.</p>`;
        } else {
            pageData.forEach(row => {
                const avanco = parseInt(row.avanco) || 0;
                const statusText = row.status || 'PENDENTE';
                const statusColors = { 'ATRASADA': 'bg-red-100 text-red-800', 'EM ANDAMENTO': 'bg-blue-100 text-blue-800', 'CONCLUÍDA': 'bg-green-100 text-green-800', 'PENDENTE': 'bg-gray-100 text-gray-800' };
                const colorClass = statusColors[statusText.toUpperCase()] || 'bg-gray-100 text-gray-800';
                const formatDate = (d) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '-';
    
                let footerHTML = '';
                const progressWrapper = `<div class="w-full bg-gray-200 rounded-full h-2 mt-1 relative"><div class="bg-blue-600 h-2 rounded-full" style="width: ${avanco}%"></div>${(row.avanco_history || []).map(h => `<div class="progress-marker" style="left: ${h.percent}%" title="Avanço de ${h.percent}% em ${new Date(h.date).toLocaleString('pt-BR')}"></div>`).join('')}</div>`;
                
                if (row.isParent) {
                    let previstoPercent = 0;
                    const today = new Date();
                    const startDate = row.inicio_da_linha_de_base ? new Date(row.inicio_da_linha_de_base) : null;
                    const endDate = row.termino_da_linha_de_base ? new Date(row.termino_da_linha_de_base) : null;
                    if (startDate && endDate && startDate < endDate) {
                        const totalDuration = endDate.getTime() - startDate.getTime();
                        const elapsedDuration = today.getTime() - startDate.getTime();
                        previstoPercent = Math.round(Math.max(0, Math.min(100, (elapsedDuration / totalDuration) * 100)));
                    }
                    footerHTML = `<div class="space-y-3"><div><div class="flex justify-between items-center text-sm"><span class="font-semibold text-slate-700">Avanço</span><span class="font-bold text-red-600">${avanco}%</span></div>${progressWrapper}</div><div><div class="flex justify-between items-center text-sm"><span class="font-semibold text-slate-700">Previsto</span><span class="font-bold text-green-600">${previstoPercent}%</span></div><div class="w-full bg-gray-200 rounded-full h-2 mt-1"><div class="bg-green-500 h-2 rounded-full" style="width: ${previstoPercent}%"></div></div></div></div>`;
                } else {
                    const progressSection = `<div class="w-full"><div class="flex justify-between items-center text-sm mb-1"><span class="font-semibold text-slate-700">Avanço</span><span class="font-bold text-red-600">${avanco}%</span></div>${progressWrapper}</div>`;
                    if (avanco === 100) footerHTML = progressSection;
                    else footerHTML = `<div class="flex items-center gap-3"><button data-action="decrement" class="w-7 h-7 flex-shrink-0 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white font-bold rounded-full text-lg">-</button>${progressSection}<button data-action="increment" class="w-7 h-7 flex-shrink-0 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white font-bold rounded-full text-lg">+</button></div>`;
                }
    
                const card = document.createElement('div');
                card.className = 'bg-white border border-slate-200 rounded-lg shadow-md flex flex-col p-4 transition-all hover:shadow-xl hover:-translate-y-1 relative';
                if (row.isChild) card.classList.add('ml-6', 'border-l-4', 'border-blue-400', 'pl-4');
                
                let expanderIcon = "";
                if (row.isParent && row.hasChildren) {
                    expanderIcon = `<i class="fas ${this.state.expandedGroups.has(row.ordem) ? 'fa-chevron-down' : 'fa-chevron-right'} text-blue-500 w-4 cursor-pointer"></i>`;
                }
                
                card.innerHTML = `<div class="flex justify-between items-start mb-2 gap-2"><div class="flex-grow flex items-center gap-2 cursor-pointer" data-group-toggle-header="${row.ordem || ''}">${expanderIcon}<h3 class="font-bold text-slate-800 pr-2">${row.nome_da_tarefa || 'Tarefa'}</h3></div><div class="flex items-center flex-shrink-0 gap-1"><span class="px-2.5 py-1 text-xs font-semibold rounded-full ${colorClass} whitespace-nowrap">${statusText}</span><button class="text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-100 transition-colors" data-details-id="${row.id}" aria-label="Ver detalhes"><i class="fas fa-plus-circle text-lg"></i></button></div></div><div class="bg-slate-50 p-3 rounded-md text-sm text-slate-600 space-y-1 my-3"><p><strong>Responsável:</strong> ${row.responsavel || '-'}</p><p><strong>Ordem:</strong> ${row.ordem || '-'}</p><p><strong>ID Exclusiva:</strong> ${row.id_csv || '-'}</p><p><strong>Início Base:</strong> ${formatDate(row.inicio_da_linha_de_base)}</p><p><strong>Término Base:</strong> ${formatDate(row.termino_da_linha_de_base)}</p></div>${row.isParent ? `<span class="mb-auto px-3 py-1 text-xs font-bold text-white bg-indigo-500 rounded-full self-start">TAREFA DE RESUMO</span>` : '<div class="mb-auto"></div>'}<div class="mt-4 pt-3 border-t border-slate-200">${footerHTML}</div>`;
                container.appendChild(card);
                
                const toggleHeader = card.querySelector(`[data-group-toggle-header="${row.ordem}"]`);
                if(toggleHeader && row.isParent && row.hasChildren) toggleHeader.addEventListener('click', () => this.toggleGroup(row.ordem));
                
                card.querySelector(`[data-details-id="${row.id}"]`)?.addEventListener('click', (e) => { e.stopPropagation(); this.toggleDetailsModal(true, row); });
    
                if (!row.isParent && avanco < 100) {
                    card.querySelector('[data-action="decrement"]')?.addEventListener('click', () => this.updateAvanco(row.id, Math.max(0, avanco - 5)));
                    card.querySelector('[data-action="increment"]')?.addEventListener('click', () => this.updateAvanco(row.id, Math.min(100, avanco + 5)));
                }
            });
        }
        this.renderPagination();
    }

    renderPagination() {
        const { currentPage, currentView } = this.state;
        const visibleItems = this.getVisibleItems();
        const totalItems = visibleItems.length;
        const itemsPerPage = currentView === 'list' ? this.ROWS_PER_PAGE : this.CARDS_PER_PAGE;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
    
        this.elements.paginationInfo.textContent = `Mostrando ${totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} a ${Math.min(currentPage * itemsPerPage, totalItems)} de ${totalItems} registros`;
        
        const pageNumbersContainer = this.elements.pageNumbers;
        pageNumbersContainer.innerHTML = '';
        
        if (totalPages <= 1) {
            this.elements.paginationContainer.style.display = 'none';
            return;
        }
        
        this.elements.paginationContainer.style.display = 'flex';
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
            btn.textContent = String(page);
            btn.onclick = () => { this.state.currentPage = page as number; this.renderContent(); };
            return btn;
        };
    
        const pages = this.getPaginationPages(currentPage, totalPages);
        pages.forEach(p => pageNumbersContainer.appendChild(createPageButton(p)));
    }
    
    getPaginationPages(currentPage, totalPages) {
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
        if (currentPage <= 4) return [1, 2, 3, 4, 5, '...', totalPages];
        if (currentPage >= totalPages - 3) return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
        return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
    }

    populateFilterDropdowns() {
        const createOptions = (key) => ['', ...new Set(this.state.allData.map(item => item[key]).filter(Boolean))].sort();
        const populate = (select, options) => {
            const currentValue = select.value;
            select.innerHTML = '<option value="">Todos</option>';
            options.filter(o => o).forEach(opt => select.add(new Option(opt, opt)));
            select.value = currentValue;
        };
        populate(this.elements.areaFilter, createOptions('area'));
        populate(this.elements.responsavelFilter, createOptions('responsavel'));
        populate(this.elements.atualizador1Filter, createOptions('atualizador_1_email'));
    }

    showLoading() {
        this.elements.loading.classList.remove('hidden');
        this.elements.dataContainer.classList.add('hidden');
        this.elements.errorContainer.classList.add('hidden');
    }
    showData() {
        this.elements.loading.classList.add('hidden');
        this.elements.dataContainer.classList.remove('hidden');
        this.elements.errorContainer.classList.add('hidden');
    }
    showError(message) {
        this.elements.loading.classList.add('hidden');
        this.elements.dataContainer.classList.add('hidden');
        this.elements.errorContainer.classList.remove('hidden');
        this.elements.errorMessage.textContent = message || 'Erro desconhecido';
    }
    updateLastUpdated() {
        this.elements.lastUpdated.textContent = `Atualizado: ${new Date().toLocaleString('pt-BR')}`;
    }
}

window.addEventListener('load', () => new AppManager());