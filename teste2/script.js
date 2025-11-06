// Este código substitui todo o conteúdo do seu arquivo affinity-main/teste2/script.js

// =================================================================
// DADOS INICIAIS E VARIÁVEIS DE ESTADO
// =================================================================

// Variáveis globais (devem ser inicializadas no index.html SEM 'const')
var db; 
var auth;

const OPERADORAS = [
    "Trasmontano", "Amil", "SulAmérica", "Bradesco", "Vera Cruz", "Supermed",
    "Qualicorp", "Porto", "Hapvida", "Unihosp", "MedSênior", "Prevent Senior",
];

// O estado inicial será carregado dinamicamente do Firebase
let state = {
    users: [], // Carregado do Firestore
    currentUser: null,
    email: "",
    senha: "",
    currentView: 'home',
    newNome: "",
    newEmail: "",
    newSenha: "",
    selected: null,
    query: "",
    faqs: {}, // Carregado do Firestore
    materiais: {}, // Carregado do Firestore
    dataLoaded: false, 
};

// O appContainer ainda pode ser null neste ponto. Será usado dentro de render().
const appContainer = document.getElementById('app-container');

function setState(newState) {
    state = { ...state, ...newState };
    render(); 
}

// -------------------------------------------------------------
// FERRAMENTA DE MENSAGENS E UTILIDADES
// -------------------------------------------------------------

function showCustomMessage(message, type = 'info') {
    const messageContainer = document.getElementById('custom-message-container');
    if (!messageContainer) return;

    let bgColor = 'bg-blue-500';
    if (type === 'success') bgColor = 'bg-green-500';
    else if (type === 'error') bgColor = 'bg-red-500';
    else if (type === 'warning') bgColor = 'bg-yellow-500';

    messageContainer.innerHTML = `
        <div class="fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg text-white ${bgColor} transition-opacity duration-300">
            ${message}
        </div>
    `;

    // Remove a mensagem após 4 segundos
    setTimeout(() => {
        messageContainer.innerHTML = '';
    }, 4000);
}

// -------------------------------------------------------------
// FUNÇÃO NOVO: CARREGAR DADOS DO FIREBASE
// -------------------------------------------------------------

async function loadData() {
    // Se não houver usuário logado, não carrega dados
    if (!state.currentUser) return;

    try {
        // 1. Carregar Usuários (para a tela de Gerenciamento)
        const usersSnapshot = await db.collection('users').get();
        const usersData = usersSnapshot.docs.map(doc => ({
            id: doc.id, // ID do Firestore para referência
            ...doc.data()
        }));

        // 2. Carregar Conteúdo Compartilhado (FAQs e Materiais)
        const contentDocRef = db.collection('content').doc('sharedContent');
        const contentDoc = await contentDocRef.get();

        if (contentDoc.exists) {
            const contentData = contentDoc.data();
            setState({
                users: usersData,
                faqs: contentData.faqs || {},
                materiais: contentData.materiais || {},
                dataLoaded: true
            });
        } else {
            // Se o documento não existe (primeira vez), cria ele e carrega
            await contentDocRef.set({ faqs: {}, materiais: {} });
            setState({ users: usersData, dataLoaded: true });
        }

    } catch (error) {
        console.error("Erro ao carregar dados do Firebase: ", error);
        showCustomMessage("Erro: Não foi possível carregar os dados. Verifique a conexão.", 'error');
    }
}

// -------------------------------------------------------------
// FUNÇÕES DE AUTENTICAÇÃO (INTEGRAÇÃO COM FIREBASE)
// -------------------------------------------------------------

async function handleLogin() {
    const emailToLogin = document.getElementById('login-email')?.value;
    const senhaToLogin = document.getElementById('login-senha')?.value;

    if (!emailToLogin || !senhaToLogin) {
        showCustomMessage("Preencha email e senha.", 'warning');
        return;
    }

    try {
        // 1. Buscar o usuário no Firestore (coleção 'users')
        const userQuery = await db.collection('users')
            .where('email', '==', emailToLogin)
            .limit(1)
            .get();

        if (userQuery.empty) {
            showCustomMessage("Usuário não encontrado.", 'error');
            return;
        }

        const userDoc = userQuery.docs[0];
        const userData = { id: userDoc.id, ...userDoc.data() };

        // 2. Verificação de Senha
        if (userData.senha === senhaToLogin) {
            // Login bem-sucedido!
            
            // NOVO PASSO CRUCIAL PARA REGRAS DE PRODUÇÃO: Criar uma sessão de autenticação no Firebase
            // Isso é o que preenche o 'request.auth' e satisfaz a regra de segurança!
            await firebase.auth().signInWithEmailAndPassword(emailToLogin, senhaToLogin);
            
            setState({ currentUser: userData, email: '', senha: '', newEmail: '', newSenha: '', currentView: 'home' });
            
            // 3. Carregar dados compartilhados do banco (FAQs/Materiais)
            await loadData();
            
        } else {
            showCustomMessage("Senha incorreta.", 'error');
        }
    } catch (error) {
        console.error("Erro no Login: ", error);
        
        // Se a autenticação no Passo 2 falhou, significa que o email/senha não foi criado no Firebase Authentication
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
             showCustomMessage("Usuário ou senha incorretos.", 'error');
        } else {
            showCustomMessage("Erro ao tentar login. Verifique as credenciais e as regras do Firebase.", 'error');
        }
    }
}

async function handleLogout() {
    try {
        await firebase.auth().signOut(); // Sai da sessão do Firebase Authentication
    } catch (error) {
        console.error("Erro ao fazer logout do Firebase: ", error);
    }
    setState({
        currentUser: null,
        email: "",
        senha: "",
        selected: null,
        query: "",
        currentView: 'home',
        dataLoaded: false, // Reseta o estado de carregamento
    });
}


// -------------------------------------------------------------
// FUNÇÕES DE GERENCIAMENTO (FIREBASE CRUD)
// -------------------------------------------------------------

async function addCorretor(newNome, newEmail, newSenha) {
    if (!newNome || !newEmail || !newSenha) return showCustomMessage("Preencha todos os campos: Nome, Email e Senha.", 'warning');
    
    if (state.users.some(u => u.email === newEmail)) return showCustomMessage("Email já cadastrado.", 'error');
    
    const newCorretor = {
        nome: newNome,
        email: newEmail,
        senha: newSenha,
        role: "Corretor"
    };

    try {
        // PASSO CRUCIAL PARA PRODUÇÃO: Cadastra o usuário no Firebase Authentication
        await firebase.auth().createUserWithEmailAndPassword(newEmail, newSenha);
        
        // Adiciona ao Firestore
        await db.collection('users').add(newCorretor);

        showCustomMessage(`Corretor ${newNome} cadastrado com sucesso!`, 'success');

        await loadData();
        setState({ newNome: '', newEmail: '', newSenha: '' }); 
    } catch (error) {
        console.error("Erro ao cadastrar corretor: ", error);
        
        if (error.code === 'auth/email-already-in-use') {
            showCustomMessage("Erro: Este email já está em uso.", 'error');
        } else {
            showCustomMessage("Erro ao cadastrar corretor. Tente novamente.", 'error');
        }
    }
}

async function removeCorretor(userEmail) {
    if (userEmail === 'assistente@painel.com') return showCustomMessage("Não é possível remover a Assistente Principal.", 'error');
    
    const userToRemove = state.users.find(u => u.email === userEmail);

    if (!userToRemove || !userToRemove.id) {
        return showCustomMessage("Erro: Usuário não encontrado no banco de dados.", 'error');
    }

    try {
        // NOTA: Remover o usuário do Auth é complexo (requer backend). 
        // Para simplificar, vamos apenas removê-lo do Firestore, impedindo o login no painel.
        await db.collection('users').doc(userToRemove.id).delete();
        
        showCustomMessage(`Corretor ${userEmail} removido.`, 'info');

        await loadData();
    } catch (error) {
        console.error("Erro ao remover corretor: ", error);
        showCustomMessage("Erro ao remover corretor. Tente novamente.", 'error');
    }
}


// -------------------------------------------------------------
// FUNÇÕES DE CONTEÚDO COMPARTILHADO (FIREBASE CRUD)
// -------------------------------------------------------------

async function updateSharedContent(updateObject, successMessage) {
    try {
        await db.collection('content').doc('sharedContent').update(updateObject);
        showCustomMessage(successMessage, 'success');
        await loadData();
    } catch (error) {
        console.error("Erro ao atualizar conteúdo: ", error);
        showCustomMessage("Erro ao atualizar o conteúdo. Verifique o banco.", 'error');
    }
}

async function addFaq(op, pergunta, resposta) {
    if (!pergunta || !resposta) return showCustomMessage("Preencha todos os campos do FAQ.", 'warning');
    
    const faqsToUpdate = { ...state.faqs };
    if (!faqsToUpdate[op]) faqsToUpdate[op] = [];
    faqsToUpdate[op].push({ pergunta, resposta });

    await updateSharedContent({ faqs: faqsToUpdate }, `FAQ adicionada para ${op}.`);
}

async function removeFaq(op, idx) {
    const faqsToUpdate = { ...state.faqs };
    const newOpFaqs = (faqsToUpdate[op] || []).filter((_, i) => i !== idx);
    faqsToUpdate[op] = newOpFaqs;

    await updateSharedContent({ faqs: faqsToUpdate }, `FAQ removida de ${op}.`);
}

async function addMaterial(op, description, link) {
    if (!description.trim()) return showCustomMessage("Preencha a descrição do material.", 'warning');
            
    let formattedLink = link.trim();
    if (formattedLink && !formattedLink.startsWith('http://') && !formattedLink.startsWith('https://')) {
        formattedLink = 'https://' + formattedLink;
    }

    const newMaterial = { description: description.trim(), link: formattedLink };
    const materiaisToUpdate = { ...state.materiais };
    if (!materiaisToUpdate[op]) materiaisToUpdate[op] = [];
    materiaisToUpdate[op].push(newMaterial);

    await updateSharedContent({ materiais: materiaisToUpdate }, `Material adicionado: ${description.trim()}.`);
}

async function removeMaterial(op, idx) {
    const materiaisToUpdate = { ...state.materiais };
    const newOpMateriais = (materiaisToUpdate[op] || []).filter((_, i) => i !== idx);
    materiaisToUpdate[op] = newOpMateriais;

    await updateSharedContent({ materiais: materiaisToUpdate }, `Material removido de ${op}.`);
}

// -------------------------------------------------------------
// FUNÇÕES DE RENDERIZAÇÃO
// -------------------------------------------------------------

function renderLogin() {
    return `
        <div class="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div class="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md">
                <div class="flex flex-col items-center mb-6">
                    <img src="img/images.png" 
                        alt="Logo da Affinity" 
                        class="w-40 h-auto rounded-lg mb-4"
                        onerror="this.onerror=null; this.src='https://placehold.co/160x50/3730A3/ffffff?text=LOGO';" />
                    <h1 class="text-3xl font-bold text-indigo-700">Painel Affinity ABC</h1>
                    <p class="text-gray-500 mt-1">Acesso para Corretores e Assistentes</p>
                </div>

                <div class="space-y-4">
                    <input type="email" id="login-email" placeholder="Email" value="${state.email}"
                        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" required>
                    
                    <input type="password" id="login-senha" placeholder="Senha" value="${state.senha}"
                        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" required>

                    <button id="login-button" 
                        class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg transition duration-200">
                        Entrar
                    </button>
                </div>

                <p class="mt-6 text-center text-gray-400 text-sm">
                    Utilize seu email e senha cadastrados para acessar.
                </p>
            </div>
        </div>
    `;
}

function renderNav() {
    return `
        <nav class="bg-indigo-700 shadow-lg fixed w-full z-10">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center h-16">
                    <div class="flex items-center">
                        <span class="text-white text-xl font-bold cursor-pointer" onclick="setState({ currentView: 'home', selected: null, query: '' })">
                            Painel Affinity
                        </span>
                        
                        ${state.currentUser.role === 'Assistente' ? `
                            <button onclick="setState({ currentView: 'gerenciamento_corretores', selected: null, query: '' })"
                                class="ml-6 px-3 py-2 rounded-md text-sm font-medium text-white hover:bg-indigo-600 transition duration-150">
                                Gerenciar Corretores
                            </button>
                        ` : ''}
                    </div>
                    
                    <div class="flex items-center space-x-4">
                        <span class="text-white text-sm">Olá, ${state.currentUser.nome.split(' ')[0]} (${state.currentUser.role})</span>
                        <button onclick="handleLogout()"
                            class="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-md text-sm font-medium transition duration-150">
                            Sair
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    `;
}

function renderHero() {
    return `
        <div class="bg-indigo-600 pt-16 pb-16">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <h2 class="text-4xl font-extrabold text-white sm:text-5xl">
                    Materiais e FAQs
                </h2>
                <p class="mt-4 text-xl text-indigo-200">
                    Consulte materiais de apoio e respostas rápidas por operadora.
                </p>
                <div class="mt-6 relative rounded-md shadow-sm">
                    <input type="text" id="operadora-search" placeholder="Buscar por operadora..." value="${state.query}"
                        class="w-full px-5 py-3 border border-transparent rounded-lg text-gray-900 placeholder-gray-500 focus:ring-white focus:border-white sm:text-base">
                    <button onclick="setState({ query: '' })" class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                        <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderOperadoraCard(op) {
    // Filtra as operadoras pelo termo de busca (case insensitive)
    if (state.query && !op.toLowerCase().includes(state.query.toLowerCase())) {
        return '';
    }

    const faqsCount = (state.faqs[op] || []).length;
    const materiaisCount = (state.materiais[op] || []).length;

    return `
        <div onclick="setState({ selected: '${op}', currentView: 'operadora_detail' })" 
             class="bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 p-6 cursor-pointer transform hover:-translate-y-1">
            <h3 class="text-xl font-bold text-indigo-800 mb-2">${op}</h3>
            <p class="text-gray-500 text-sm">
                ${faqsCount} FAQs | ${materiaisCount} Materiais
            </p>
            <button class="mt-4 text-indigo-600 hover:text-indigo-800 font-semibold text-sm">
                Ver Detalhes &rarr;
            </button>
        </div>
    `;
}

function renderOperadorasHome() {
    return `
        <div class="py-12 -mt-8">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <h3 class="text-2xl font-bold text-gray-800 mb-6">Operadoras Disponíveis</h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    ${OPERADORAS.map(renderOperadoraCard).join('')}
                </div>
                ${OPERADORAS.filter(op => op.toLowerCase().includes(state.query.toLowerCase())).length === 0 && state.query
                    ? `<p class="mt-8 text-lg text-gray-500">Nenhuma operadora encontrada com o termo "${state.query}".</p>`
                    : ''}
            </div>
        </div>
    `;
}

function renderOperadoraDetail() {
    const op = state.selected;
    const faqs = state.faqs[op] || [];
    const materiais = state.materiais[op] || [];
    const isAssistente = state.currentUser.role === 'Assistente';

    return `
        <div class="py-12 -mt-8">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <button onclick="setState({ selected: null, currentView: 'home' })" 
                        class="mb-6 inline-flex items-center text-indigo-600 hover:text-indigo-800 font-medium transition duration-150">
                    <svg class="h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Voltar para a lista
                </button>
                
                <h2 class="text-3xl font-extrabold text-gray-900 mb-8">${op} - Detalhes</h2>

                <div class="bg-white shadow-xl rounded-xl p-6 mb-8">
                    <h3 class="text-2xl font-bold text-gray-800 mb-4 flex justify-between items-center">
                        Perguntas Frequentes (FAQs)
                    </h3>
                    
                    ${faqs.length === 0 ? `<p class="text-gray-500">Nenhuma FAQ cadastrada para ${op}.</p>` : ''}

                    <div class="space-y-4 mt-4">
                        ${faqs.map((faq, idx) => `
                            <div class="border-b border-gray-200 pb-4">
                                <p class="text-lg font-semibold text-gray-700">${faq.pergunta}</p>
                                <p class="text-gray-600 mt-1">${faq.resposta}</p>
                                ${isAssistente ? `
                                    <button data-op="${op}" data-idx="${idx}" class="remove-faq-button mt-2 text-red-500 hover:text-red-700 text-sm">
                                        Remover
                                    </button>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>

                    ${isAssistente ? `
                        <div class="mt-6 border-t pt-4">
                            <h4 class="text-lg font-semibold text-gray-700 mb-2">Adicionar Novo FAQ</h4>
                            <input type="text" id="new-faq-pergunta" placeholder="Pergunta" class="w-full px-3 py-2 border rounded-lg mb-2">
                            <textarea id="new-faq-resposta" placeholder="Resposta" rows="2" class="w-full px-3 py-2 border rounded-lg mb-2"></textarea>
                            <button id="add-faq-button" data-op="${op}" class="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm">
                                Adicionar FAQ
                            </button>
                        </div>
                    ` : ''}
                </div>

                <div class="bg-white shadow-xl rounded-xl p-6">
                    <h3 class="text-2xl font-bold text-gray-800 mb-4">Materiais de Apoio</h3>

                    ${materiais.length === 0 ? `<p class="text-gray-500">Nenhum material de apoio cadastrado para ${op}.</p>` : ''}
                    
                    <ul class="space-y-3 mt-4">
                        ${materiais.map((material, idx) => `
                            <li class="flex justify-between items-center border-b pb-2">
                                <a href="${material.link}" target="_blank" class="text-indigo-600 hover:text-indigo-800 font-medium truncate">
                                    ${material.description}
                                </a>
                                ${isAssistente ? `
                                    <button data-op="${op}" data-idx="${idx}" class="remove-material-button text-red-500 hover:text-red-700 text-sm ml-4">
                                        Remover
                                    </button>
                                ` : ''}
                            </li>
                        `).join('')}
                    </ul>

                    ${isAssistente ? `
                        <div class="mt-6 border-t pt-4">
                            <h4 class="text-lg font-semibold text-gray-700 mb-2">Adicionar Novo Material</h4>
                            <input type="text" id="new-material-description" placeholder="Descrição (ex: Tabela de Vidas Junho)" class="w-full px-3 py-2 border rounded-lg mb-2">
                            <input type="url" id="new-material-link" placeholder="Link (ex: drive.google.com/doc/abc...)" class="w-full px-3 py-2 border rounded-lg mb-2">
                            <button id="add-material-button" data-op="${op}" class="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm">
                                Adicionar Material
                            </button>
                        </div>
                    ` : ''}
                </div>

            </div>
        </div>
    `;
}

function renderGerenciamentoCorretores() {
    const corretores = state.users.filter(u => u.role === 'Corretor');
    
    return `
        <div class="py-12 pt-24 min-h-screen bg-gray-50">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <h2 class="text-3xl font-extrabold text-gray-900 mb-8">Gerenciamento de Corretores</h2>

                <div class="bg-white shadow-xl rounded-xl p-6 mb-8">
                    <h3 class="text-2xl font-bold text-indigo-700 mb-4">Cadastrar Novo Corretor</h3>
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <input type="text" id="new-corretor-nome" placeholder="Nome Completo" value=""
                            class="col-span-1 md:col-span-4 px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500">
                            
                        <input type="email" id="new-corretor-email" placeholder="Email" value=""
                            class="col-span-1 md:col-span-2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500">
                        
                        <input type="password" id="new-corretor-senha" placeholder="Senha" value=""
                            class="col-span-1 md:col-span-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500">
                        
                        <button id="add-corretor-button" 
                            class="col-span-1 md:col-span-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg transition duration-200">
                            Cadastrar
                        </button>
                    </div>
                </div>

                <div class="bg-white shadow-xl rounded-xl p-6">
                    <h3 class="text-2xl font-bold text-gray-800 mb-4">Corretores Cadastrados (${corretores.length})</h3>
                    <ul class="space-y-3">
                        ${corretores.map(user => `
                            <li class="corretor-list-item bg-gray-50 p-3 rounded-lg">
                                <div>
                                    <p class="font-semibold text-gray-800">${user.nome}</p>
                                    <p class="text-sm text-gray-500">${user.email}</p>
                                </div>
                                <button data-email="${user.email}" class="remove-corretor-button text-red-500 hover:text-red-700 font-medium text-sm">
                                    Remover
                                </button>
                            </li>
                        `).join('')}
                        ${corretores.length === 0 ? `<li class="text-gray-500">Nenhum corretor cadastrado ainda.</li>` : ''}
                    </ul>
                </div>
            </div>
        </div>
    `;
}

function render() {
    // 🚨 AQUI a verificação é CRÍTICA. Se o HTML não carregou, appContainer será null.
    const appContainer = document.getElementById('app-container');
    if (!appContainer) {
        console.error("Erro: Elemento 'app-container' não encontrado no DOM. O script está rodando cedo demais.");
        return; // Sai da função se não conseguir encontrar o container
    }

    if (!state.currentUser) {
        appContainer.innerHTML = renderLogin();
    } else {
        let content = '';
        if (state.currentView === 'home' || state.selected) {
            content += renderHero();
            content += state.selected ? renderOperadoraDetail() : renderOperadorasHome();
        } else if (state.currentView === 'gerenciamento_corretores') {
            content += renderGerenciamentoCorretores();
        }

        appContainer.innerHTML = renderNav() + `<div id="custom-message-container"></div>` + `<div class="pt-16">${content}</div>`;
    }

    // Sempre anexa os eventos após renderizar o HTML
    attachEventListeners();
}

// -------------------------------------------------------------
// FUNÇÕES DE EVENTOS
// -------------------------------------------------------------

function attachEventListeners() {
    // Eventos do Login
    const loginButton = document.getElementById('login-button');
    if (loginButton) {
        loginButton.addEventListener('click', () => {
            handleLogin();
        });
        // Permite login com Enter
        document.getElementById('login-senha')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
    }

    if (state.currentUser) {
        // Eventos da Home/Busca
        document.getElementById('operadora-search')?.addEventListener('input', (e) => {
            setState({ query: e.target.value });
        });

        // Eventos da Operadora Detail (Adicionar/Remover)
        if (state.currentView === 'operadora_detail' && state.currentUser.role === 'Assistente') {
            const op = state.selected;
            
            // Evento Adicionar FAQ
            document.getElementById('add-faq-button')?.addEventListener('click', () => {
                const pergunta = document.getElementById('new-faq-pergunta').value;
                const resposta = document.getElementById('new-faq-resposta').value;
                addFaq(op, pergunta, resposta);
                // Limpa os campos
                document.getElementById('new-faq-pergunta').value = '';
                document.getElementById('new-faq-resposta').value = '';
            });

            // Evento Remover FAQ
            document.querySelectorAll('.remove-faq-button').forEach(button => {
                button.addEventListener('click', (e) => {
                    const buttonElement = e.target.closest('button');
                    removeFaq(buttonElement.dataset.op, parseInt(buttonElement.dataset.idx));
                });
            });

            // Evento Adicionar Material
            document.getElementById('add-material-button')?.addEventListener('click', () => {
                const description = document.getElementById('new-material-description').value;
                const link = document.getElementById('new-material-link').value;
                addMaterial(op, description, link);
                // Limpa os campos
                document.getElementById('new-material-description').value = '';
                document.getElementById('new-material-link').value = '';
            });

            // Evento Remover Material
            document.querySelectorAll('.remove-material-button').forEach(button => {
                button.addEventListener('click', (e) => {
                    const buttonElement = e.target.closest('button');
                    removeMaterial(buttonElement.dataset.op, parseInt(buttonElement.dataset.idx));
                });
            });

        } else if (state.currentView === 'gerenciamento_corretores' && state.currentUser.role === 'Assistente') {
            // Eventos da Página de Gerenciamento de Corretores (Assistente)
            const newCorretorNome = document.getElementById('new-corretor-nome');
            const newCorretorEmail = document.getElementById('new-corretor-email');
            const newCorretorSenha = document.getElementById('new-corretor-senha');

            // Evento de Cadastro
            document.getElementById('add-corretor-button')?.addEventListener('click', () => {
                addCorretor(newCorretorNome.value, newCorretorEmail.value, newCorretorSenha.value);
                // Limpar campos após sucesso está no addCorretor
            });

            // Evento de Remoção
            document.querySelectorAll('.remove-corretor-button').forEach(button => {
                button.addEventListener('click', (e) => {
                    const buttonElement = e.target.closest('button');
                    removeCorretor(buttonElement.dataset.email);
                });
            });
        }
    }
}

// =================================================================
// INICIALIZAÇÃO DA APLICAÇÃO
// =================================================================

// 🚨 CORREÇÃO CRÍTICA: Garante que o HTML foi totalmente carregado antes de chamar render()
document.addEventListener('DOMContentLoaded', () => {
    // A primeira renderização irá para a tela de Login
    render(); 
});

// AQUI ESTAVA A CHAMADA RENDER() SOLTA QUE CAUSAVA O ERRO!
