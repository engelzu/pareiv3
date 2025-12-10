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
const IMPORT_PASSWORD = '789512'; // Senha para importação

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
        currentUser: null, // { email: string, role: 'admin' | 'user' }
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
        
        // Initial State: Check for login or show login screen
        this.checkSession();
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
            'areaChart', 'taskCount', 'paginationContainer',
            // Import/Export Elements
            'importBtn', 'exportBtn', 'fileInput',
            'passwordModal', 'passwordInput', 'passwordSubmitBtn', 'passwordCancelBtn', 'passwordModalCloseBtn', 'passwordError',
            'passwordStep1', 'passwordStep2', 'exportCurrentDataBtn', 'proceedToImportBtn', 'passwordCancelBtn2', 'passwordModalCloseBtn2',
            'importModal', 'importModalBody', 'importModalCloseBtn', 'importModalActionBtn',
            // Login & User Mgmt Elements
            'loginScreen', 'mainApp', 'loginEmail', 'loginPassword', 'loginBtn', 'loginError',
            'currentUserDisplay', 'adminBadge', 'logoutBtn', 'adminRegisterUserBtn',
            'registerUserModal', 'registerUserModalCloseBtn', 'registerUserCancelBtn', 'registerUserSubmitBtn',
            'regEmail', 'regPassword', 'regRole', 'regError', 'regSuccess'
        ];
        ids.forEach(id => this.elements[id] = document.getElementById(id));
    },

    bindEvents() {
        // --- AUTH EVENTS ---
        this.elements.loginBtn.addEventListener('click', () => this.handleLogin());
        this.elements.logoutBtn.addEventListener('click', () => this.handleLogout());
        this.elements.adminRegisterUserBtn.addEventListener('click', () => {
             this.elements.regEmail.value = '';
             this.elements.regPassword.value = '';
             this.elements.regRole.value = 'user';
             this.elements.regError.classList.add('hidden');
             this.elements.regSuccess.classList.add('hidden');
             this.elements.registerUserModal.classList.remove('hidden');
        });
        
        // Register Modal Events
        this.elements.registerUserModalCloseBtn.addEventListener('click', () => this.elements.registerUserModal.classList.add('hidden'));
        this.elements.registerUserCancelBtn.addEventListener('click', () => this.elements.registerUserModal.classList.add('hidden'));
        this.elements.registerUserSubmitBtn.addEventListener('click', () => this.handleRegisterUser());
        
        // Login on Enter key
        this.elements.loginPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });


        // --- EXISTING EVENTS ---
        this.elements.refreshBtn.addEventListener('click', () => this.fetchData());
        this.elements.retryBtn.addEventListener('click', () => this.fetchData());
        
        // Export Template
        if (this.elements.exportBtn) {
            this.elements.exportBtn.addEventListener('click', () => {
                const ws = (window as any).XLSX.utils.json_to_sheet([{ "ORDEM": 1, "NOME DA TAREFA": "Exemplo", "RESPONSÁVEL": "Fulano", "ÁREA": "SECAGEM", "AVANÇO": "0%", "ID": "100" }]);
                const wb = (window as any).XLSX.utils.book_new();
                (window as any).XLSX.utils.book_append_sheet(wb, ws, "Template");
                (window as any).XLSX.writeFile(wb, "template_parei.xlsx");
            });
        }

        // Import Flow
        if (this.elements.importBtn) {
            this.elements.importBtn.addEventListener('click', () => {
                this.elements.passwordInput.value = '';
                this.elements.passwordError.textContent = '';
                this.elements.passwordStep1.classList.remove('hidden');
                this.elements.passwordStep2.classList.add('hidden');
                this.elements.passwordModal.classList.remove('hidden');
            });
        }

        // Password Modal Events
        this.elements.passwordCancelBtn.addEventListener('click', () => this.elements.passwordModal.classList.add('hidden'));
        this.elements.passwordModalCloseBtn.addEventListener('click', () => this.elements.passwordModal.classList.add('hidden'));
        this.elements.passwordCancelBtn2.addEventListener('click', () => this.elements.passwordModal.classList.add('hidden'));
        this.elements.passwordModalCloseBtn2.addEventListener('click', () => this.elements.passwordModal.classList.add('hidden'));

        this.elements.passwordSubmitBtn.addEventListener('click', () => {
            if (this.elements.passwordInput.value === IMPORT_PASSWORD) {
                this.elements.passwordStep1.classList.add('hidden');
                this.elements.passwordStep2.classList.remove('hidden');
            } else {
                this.elements.passwordError.textContent = 'Senha incorreta.';
                this.elements.passwordInput.classList.add('animate-shake');
                setTimeout(() => this.elements.passwordInput.classList.remove('animate-shake'), 500);
            }
        });

        // Backup Flow
        this.elements.exportCurrentDataBtn.addEventListener('click', () => {
            const exportData = this.state.allData.map(row => {
                const newRow = {};
                Object.keys(displayToDbMap).forEach(key => {
                    newRow[key] = row[displayToDbMap[key]];
                });
                return newRow;
            });
            const ws = (window as any).XLSX.utils.json_to_sheet(exportData);
            const wb = (window as any).XLSX.utils.book_new();
            (window as any).XLSX.utils.book_append_sheet(wb, ws, "Backup");
            (window as any).XLSX.writeFile(wb, `backup_parei_${new Date().toISOString().slice(0,10)}.xlsx`);
            
            this.elements.proceedToImportBtn.disabled = false;
            this.elements.proceedToImportBtn.classList.remove('bg-gray-400', 'cursor-not-allowed');
            this.elements.proceedToImportBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
        });

        this.elements.proceedToImportBtn.addEventListener('click', () => {
            this.elements.passwordModal.classList.add('hidden');
            this.showImportConfigModal();
        });

        this.elements.importModalCloseBtn.addEventListener('click', () => this.elements.importModal.classList.add('hidden'));
        this.elements.importModalActionBtn.addEventListener('click', () => this.elements.importModal.classList.add('hidden'));

        // Main UI Events
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

    // --- AUTH LOGIC ---
    checkSession() {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            try {
                this.state.currentUser = JSON.parse(storedUser);
                this.showDashboard();
            } catch (e) {
                this.showLogin();
            }
        } else {
            this.showLogin();
        }
    },

    showLogin() {
        this.elements.loginScreen.classList.remove('hidden');
        this.elements.mainApp.classList.add('hidden');
    },

    showDashboard() {
        this.elements.loginScreen.classList.add('hidden');
        this.elements.mainApp.classList.remove('hidden');
        
        // Update User Info in Header
        if (this.state.currentUser) {
            this.elements.currentUserDisplay.textContent = this.state.currentUser.email;
            
            if (this.state.currentUser.role === 'admin') {
                this.elements.adminBadge.classList.remove('hidden');
                this.elements.adminRegisterUserBtn.classList.remove('hidden');
            } else {
                this.elements.adminBadge.classList.add('hidden');
                this.elements.adminRegisterUserBtn.classList.add('hidden');
            }
        }

        this.loadDataFromStorage();
        this.updateConnectionStatus();
    },

    handleLogout() {
        this.state.currentUser = null;
        localStorage.removeItem('currentUser');
        this.showLogin();
        this.elements.loginEmail.value = '';
        this.elements.loginPassword.value = '';
        this.elements.loginError.classList.add('hidden');
    },

    async handleLogin() {
        const email = this.elements.loginEmail.value.trim();
        const password = this.elements.loginPassword.value.trim();
        const errorEl = this.elements.loginError;

        if (!email || !password) {
            errorEl.textContent = 'Preencha todos os campos.';
            errorEl.classList.remove('hidden');
            return;
        }

        errorEl.classList.add('hidden');
        this.elements.loginBtn.disabled = true;
        this.elements.loginBtn.textContent = 'Verificando...';

        // 1. Hardcoded Admin Check (as requested)
        if (email === 'admin@admin.com' && password === '789512') {
            const adminUser = { email: 'admin@admin.com', role: 'admin' };
            this.state.currentUser = adminUser;
            localStorage.setItem('currentUser', JSON.stringify(adminUser));
            this.showDashboard();
            this.elements.loginBtn.disabled = false;
            this.elements.loginBtn.textContent = 'ENTRAR';
            return;
        }

        // 2. Database Check
        try {
            const { data, error } = await this.supabase
                .from('usuarios')
                .select('*')
                .eq('email', email)
                .eq('senha', password) // Note: In production, assume comparison of hashed passwords on server or via Supabase Auth
                .single();

            if (error || !data) {
                throw new Error('Credenciais inválidas.');
            }

            const user = { email: data.email, role: data.role || 'user' };
            this.state.currentUser = user;
            localStorage.setItem('currentUser', JSON.stringify(user));
            this.showDashboard();

        } catch (err) {
            errorEl.textContent = 'E-mail ou senha incorretos.';
            errorEl.classList.remove('hidden');
        } finally {
            this.elements.loginBtn.disabled = false;
            this.elements.loginBtn.textContent = 'ENTRAR';
        }
    },

    async handleRegisterUser() {
        const email = this.elements.regEmail.value.trim();
        const password = this.elements.regPassword.value.trim();
        const role = this.elements.regRole.value;
        const errorEl = this.elements.regError;
        const successEl = this.elements.regSuccess;

        if (!email || !password) {
            errorEl.textContent = 'Preencha todos os campos.';
            errorEl.classList.remove('hidden');
            return;
        }

        errorEl.classList.add('hidden');
        successEl.classList.add('hidden');
        this.elements.registerUserSubmitBtn.disabled = true;

        try {
            const { error } = await this.supabase
                .from('usuarios')
                .insert([{ email, senha: password, role }]);

            if (error) {
                if (error.code === '23505') throw new Error('Este e-mail já está cadastrado.');
                throw error;
            }

            successEl.textContent = 'Usuário cadastrado com sucesso!';
            successEl.classList.remove('hidden');
            
            // Clear inputs
            this.elements.regEmail.value = '';
            this.elements.regPassword.value = '';
            
            // Close modal after delay
            setTimeout(() => {
                this.elements.registerUserModal.classList.add('hidden');
                successEl.classList.add('hidden');
            }, 1500);

        } catch (err) {
            errorEl.textContent = err.message || 'Erro ao cadastrar usuário.';
            errorEl.classList.remove('hidden');
        } finally {
            this.elements.registerUserSubmitBtn.disabled = false;
        }
    },


    showImportConfigModal() {
        // Obter áreas únicas para o dropdown
        const areas = [...new Set(this.state.allData.map(item => item.area).filter(Boolean))].sort();
        
        const modalBody = this.elements.importModalBody;
        // FIX: Replaced class 'dark-input' with standard tailwind classes for light inputs.
        // 'dark-input' was enforcing white text on a white background, making it invisible.
        modalBody.innerHTML = `
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-slate-700 mb-1">Para qual área você deseja importar?</label>
                    <select id="importAreaSelect" class="block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-900 text-sm shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                        <option value="ALL" class="font-bold">🌍 TODAS AS ÁREAS (Substituir tudo)</option>
                        ${areas.map(area => `<option value="${area}">${area}</option>`).join('')}
                        <option value="NEW" class="text-blue-600 font-bold">➕ Nova Área / Digitar Manualmente...</option>
                    </select>
                    <div id="newAreaContainer" class="hidden mt-2">
                         <input type="text" id="newAreaInput" placeholder="Digite o nome da nova área (ex: MONTAGEM)" 
                                class="block w-full px-3 py-2 bg-blue-50 border border-blue-300 rounded-md text-blue-900 text-sm placeholder-blue-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 uppercase"/>
                    </div>
                    <p class="text-xs text-slate-500 mt-1">
                        <i class="fas fa-info-circle"></i> 
                        Se selecionar uma área específica, apenas as tarefas dessa área serão substituídas.
                    </p>
                </div>
                
                <div class="border-t border-slate-200 pt-4">
                    <label class="block text-sm font-medium text-slate-700 mb-1">Selecione o arquivo Excel (.xlsx)</label>
                    <input type="file" id="modalFileInput" accept=".xlsx, .xls" class="block w-full text-sm text-slate-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-full file:border-0
                        file:text-sm file:font-semibold
                        file:bg-blue-50 file:text-blue-700
                        hover:file:bg-blue-100
                    "/>
                </div>

                <div id="importStatus" class="hidden p-3 bg-blue-50 text-blue-700 rounded-lg text-sm">
                    <i class="fas fa-spinner fa-spin mr-2"></i> Processando...
                </div>
                
                <button id="runImportBtn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow transition-colors mt-2">
                    <i class="fas fa-file-import mr-2"></i> Iniciar Importação
                </button>
            </div>
        `;

        this.elements.importModal.classList.remove('hidden');

        // Logic for New Area Toggle
        const select = document.getElementById('importAreaSelect');
        const inputContainer = document.getElementById('newAreaContainer');
        select.addEventListener('change', (e) => {
            if ((e.target as HTMLSelectElement).value === 'NEW') {
                inputContainer.classList.remove('hidden');
                document.getElementById('newAreaInput').focus();
            } else {
                inputContainer.classList.add('hidden');
            }
        });

        // Bind events inside the modal
        document.getElementById('runImportBtn').addEventListener('click', () => {
            const fileInput = document.getElementById('modalFileInput') as HTMLInputElement;
            const areaSelect = document.getElementById('importAreaSelect') as HTMLSelectElement;
            let selectedArea = areaSelect.value;
            
            // Handle Manual Entry
            if (selectedArea === 'NEW') {
                const newAreaInput = document.getElementById('newAreaInput') as HTMLInputElement;
                selectedArea = newAreaInput.value.trim().toUpperCase();
                if (!selectedArea) {
                    alert('Por favor, digite o nome da nova área.');
                    return;
                }
            }
            
            if (!fileInput.files || fileInput.files.length === 0) {
                alert('Por favor, selecione um arquivo.');
                return;
            }
            
            this.processImportFile(fileInput.files[0], selectedArea);
        });
    },

    async processImportFile(file, selectedArea) {
        const statusEl = document.getElementById('importStatus');
        statusEl.classList.remove('hidden');
        statusEl.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Lendo arquivo...`;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result as ArrayBuffer);
                const workbook = (window as any).XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = (window as any).XLSX.utils.sheet_to_json(firstSheet);

                if (jsonData.length === 0) throw new Error("Arquivo vazio.");

                // Map Excel headers to DB columns
                let rowsToInsert = jsonData.map(row => {
                    const newRow = {};
                    Object.keys(displayToDbMap).forEach(displayHeader => {
                        const dbKey = displayToDbMap[displayHeader];
                        newRow[dbKey] = row[displayHeader] ? String(row[displayHeader]) : null;
                    });
                    
                    // Extra fields processing
                    newRow['resumo_sim_nao'] = row['RESUMO'] || null;
                    newRow['atualizador_1_email'] = row['ATUALIZADOR 1'] || null;
                    
                    // Format dates if strictly needed, otherwise Supabase usually handles ISO strings well
                    // or keeps them as text depending on DB schema. Assuming text/varchar for simplicity based on provided code.
                    
                    return newRow;
                });

                statusEl.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Enviando para o banco de dados...`;

                // --- LOGIC FOR AREA IMPORT ---
                if (selectedArea === 'ALL') {
                    // Scenario 1: Delete ALL, Insert ALL
                    // Note: Supabase doesn't have a truncate easily accessible via JS client without RLS policies sometimes,
                    // but delete w/ filter usually works. Warning: This is destructive.
                    
                    // Hack to delete all rows: id is not null (assuming id exists)
                    // First fetch IDs to verify we can delete
                    const { error: delError } = await this.supabase.from('tarefas').delete().neq('id', 0); // Assuming IDs are > 0
                    if (delError) throw delError;

                } else {
                    // Scenario 2: Delete Specific Area, Insert filtered rows
                    
                    // 1. Filter rows to insert: Ensure we only insert rows that belong to the selected area
                    // This prevents a user from uploading a "PINTURA" row when "SECAGEM" is selected
                    const originalCount = rowsToInsert.length;
                    rowsToInsert = rowsToInsert.filter(r => r.area === selectedArea);
                    
                    if (rowsToInsert.length === 0) {
                        throw new Error(`Nenhuma tarefa encontrada no arquivo para a área: ${selectedArea}. (Total no arquivo: ${originalCount})`);
                    }

                    // 2. Delete existing rows for this area
                    const { error: delError } = await this.supabase.from('tarefas').delete().eq('area', selectedArea);
                    if (delError) throw delError;
                }

                // Batch insert (Supabase allows bulk insert)
                const { error: insertError } = await this.supabase.from('tarefas').insert(rowsToInsert);
                if (insertError) throw insertError;

                statusEl.innerHTML = `<i class="fas fa-check text-green-600"></i> Importação concluída com sucesso!`;
                setTimeout(() => {
                    this.elements.importModal.classList.add('hidden');
                    this.fetchData(); // Refresh grid
                }, 1500);

            } catch (err) {
                console.error(err);
                statusEl.className = 'p-3 bg-red-50 text-red-700 rounded-lg text-sm';
                statusEl.innerHTML = `<i class="fas fa-times-circle"></i> Erro: ${err.message || err.toString()}`;
            }
        };
        reader.readAsArrayBuffer(file);
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
            el.className = 'text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800';
            this.processUpdateQueue().then(() => this.fetchData());
        } else {
            el.textContent = 'Offline';
            el.className = 'text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700';
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

        // Logic: Count tasks per status
        const counts = {
            concluida: 0,
            em_andamento: 0,
            atrasada: 0,
            pendente: 0
        };

        this.state.filteredData.forEach(row => {
            // Ignore summary rows for status count
            if (row.resumo_sim_nao?.toUpperCase() === 'SIM') return;
            
            // Robust status matching
            let status = (row.status || 'PENDENTE').toUpperCase();
            
            if (status.indexOf('CONCLU') >= 0) {
                counts.concluida++;
            } else if (status.indexOf('ANDAMENTO') >= 0) {
                counts.em_andamento++;
            } else if (status.indexOf('ATRASADA') >= 0) {
                counts.atrasada++;
            } else {
                counts.pendente++;
            }
        });

        const labels = ['CONCLUÍDA', 'EM ANDAMENTO', 'ATRASADA', 'PENDENTE'];
        const data = [counts.concluida, counts.em_andamento, counts.atrasada, counts.pendente];
        
        const backgroundColors = [
            'rgba(34, 197, 94, 0.7)',  // CONCLUÍDA (Green)
            'rgba(59, 130, 246, 0.7)', // EM ANDAMENTO (Blue)
            'rgba(239, 68, 68, 0.7)',  // ATRASADA (Red)
            'rgba(156, 163, 175, 0.7)' // PENDENTE (Gray)
        ];
        const borderColors = [
            'rgb(34, 197, 94)',
            'rgb(59, 130, 246)',
            'rgb(239, 68, 68)',
            'rgb(156, 163, 175)'
        ];

        this.state.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Quantidade de Tarefas',
                    data: data,
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false 
                    },
                    title: {
                        display: true,
                        text: 'Status das Tarefas'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
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
                        td.classList.add('min-w-[200px]'); // Ensure minimum width for task names on mobile
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
                    card.className = 'col-span-full sticky top-0 z-30 bg-blue-600 text-white rounded-lg shadow-md p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 mt-2 gap-2';
                    card.innerHTML = `
                        <div class="flex items-center gap-3 w-full sm:w-auto">
                             <h3 class="font-bold text-base sm:text-lg uppercase tracking-wide break-words">${row.nome_da_tarefa || 'Agrupamento'}</h3>
                             <span class="px-2 py-0.5 text-xs bg-white/20 rounded text-white font-mono flex-shrink-0">${row.ordem || ''}</span>
                        </div>
                        <div class="flex items-center gap-4 w-full sm:w-auto">
                             <div class="flex items-center gap-2">
                                <span class="text-sm font-medium opacity-90">Avanço:</span>
                                <span class="font-bold">${avanco}%</span>
                             </div>
                             <div class="flex-grow sm:w-24 bg-blue-800 rounded-full h-2">
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
                            <button data-action="decrement" class="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white font-bold rounded-full transition-colors text-lg touch-manipulation">
                                -
                            </button>
                            <div class="w-full">
                                <div class="flex justify-between items-center text-sm mb-1">
                                    <span class="font-semibold text-slate-700">Avanço</span>
                                    <span class="font-bold text-red-600">${avanco}%</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-3">
                                    <div class="bg-blue-600 h-3 rounded-full" style="width: ${avanco}%"></div>
                                </div>
                            </div>
                            <button data-action="increment" class="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white font-bold rounded-full transition-colors text-lg touch-manipulation">
                                +
                            </button>
                        </div>
                    `;
                }

                const card = document.createElement('div');
                card.className = 'bg-white border border-slate-200 rounded-lg shadow-md flex flex-col p-4 transition-all hover:shadow-xl hover:-translate-y-1 relative';
                
                // Added break-words and whitespace-normal to the title h3
                card.innerHTML = `
                    <div class="flex justify-between items-start mb-2 gap-2">
                        <h3 class="font-bold text-slate-800 text-sm sm:text-base break-words whitespace-normal leading-tight">${row.nome_da_tarefa || 'Tarefa sem nome'}</h3>
                        <span class="px-2 py-1 text-[10px] sm:text-xs font-semibold rounded-full ${colorClass} whitespace-nowrap flex-shrink-0">${statusText}</span>
                    </div>
                    <div class="bg-slate-50 p-3 rounded-md text-xs sm:text-sm text-slate-600 space-y-1 my-3">
                        <p class="flex justify-between"><span class="font-semibold">Resp:</span> <span class="truncate ml-2">${row.responsavel || '-'}</span></p>
                        <p class="flex justify-between"><span class="font-semibold">Ordem:</span> <span>${row.ordem || '-'}</span></p>
                        <p class="flex justify-between"><span class="font-semibold">ID:</span> <span>${row.id_csv || '-'}</span></p>
                        <div class="border-t border-slate-200 my-1 pt-1"></div>
                        <p class="flex justify-between"><span class="font-semibold">Início:</span> <span>${formatDate(row.inicio_da_linha_de_base)}</span></p>
                        <p class="flex justify-between"><span class="font-semibold">Fim:</span> <span>${formatDate(row.termino_da_linha_de_base)}</span></p>
                    </div>
                    <div class="mt-auto pt-3 border-t border-slate-200">
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

        if (this.elements.paginationInfo) this.elements.paginationInfo.textContent = `Mostrando ${totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} a ${Math.min(currentPage * itemsPerPage, totalItems)} de ${totalItems}`;
        
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
                span.className = 'px-2 py-1 sm:px-3 sm:py-2 text-xs sm:text-sm text-gray-500';
                span.textContent = '...';
                return span;
            }
            const btn = document.createElement('button');
            btn.className = `relative inline-flex items-center px-3 py-1 sm:px-4 sm:py-2 border text-xs sm:text-sm font-medium rounded-md ${currentPage === page ? 'z-10 bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}`;
            btn.textContent = page;
            btn.onclick = () => { this.state.currentPage = page; this.renderContent(); };
            return btn;
        };

        const pages = this.getPaginationPages(currentPage, totalPages);
        pages.forEach(p => pageNumbersContainer.appendChild(createPageButton(p)));
    },

    getPaginationPages(currentPage, totalPages) {
        if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
        if (currentPage <= 3) return [1, 2, 3, '...', totalPages];
        if (currentPage >= totalPages - 2) return [1, '...', totalPages - 2, totalPages - 1, totalPages];
        return [1, '...', currentPage, '...', totalPages]; // Reduced visible pages for mobile
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