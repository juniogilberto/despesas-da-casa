"use strict";

/* =========================================================
   CONFIGURAÇÃO SUPABASE
   ========================================================= */

const SUPABASE_URL =
    "https://wbwqvtlirhllulnahjdx.supabase.co";

/*
 * COLE AQUI SUA CHAVE ANON/PUBLISHABLE DO SUPABASE.
 *
 * NÃO coloque aqui a service_role/secret key.
 */
const SUPABASE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indid3F2dGxpcmhsbHVsbmFoamR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDQxNzcsImV4cCI6MjEwNTYyMDE3N30.9PRA99X_if5jafFgnxuKSpRzojzB8zg7TI_XmR_lYXE";


const SITE_URL =
    "https://juniogilberto.github.io/despesas-da-casa/";


const SESSION_STORAGE_KEY =
    "house_expenses_session_v2";


/* =========================================================
   ESTADO
   ========================================================= */

let session = null;

let state = {
    settings: {
        start_day: 24,
        budget_mistura: 600,
        budget_geral: 400
    },

    expenses: []
};


let currentPage = "dashboard";

let selectedExpenseIcon = "🛒";

let selectedAvatar = "👤";

let historyCycle = "current";

let confirmCallback = null;

let toastTimer = null;


/* =========================================================
   ELEMENTOS
   ========================================================= */

const $ = (id) => document.getElementById(id);


/* =========================================================
   STORAGE DA SESSÃO
   ========================================================= */

function loadSession() {

    try {

        const raw =
            localStorage.getItem(SESSION_STORAGE_KEY);

        if (!raw) {
            return null;
        }

        return JSON.parse(raw);

    } catch (error) {

        console.error(
            "Erro ao carregar sessão:",
            error
        );

        localStorage.removeItem(
            SESSION_STORAGE_KEY
        );

        return null;
    }
}


function saveSession(newSession) {

    session = newSession;

    if (!session) {

        localStorage.removeItem(
            SESSION_STORAGE_KEY
        );

        return;
    }

    localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify(session)
    );
}


function clearSession() {

    session = null;

    localStorage.removeItem(
        SESSION_STORAGE_KEY
    );
}


function accessToken() {

    return session?.access_token || null;
}


/* =========================================================
   SUPABASE REST
   ========================================================= */

async function supabaseRequest(
    path,
    options = {}
) {

    const headers = {
        apikey: SUPABASE_KEY,

        ...(
            options.headers || {}
        )
    };


    if (!headers["Content-Type"] &&
        options.body) {

        headers["Content-Type"] =
            "application/json";
    }


    if (accessToken()) {

        headers.Authorization =
            `Bearer ${accessToken()}`;
    }


    const response =
        await fetch(
            `${SUPABASE_URL}${path}`,
            {
                ...options,
                headers
            }
        );


    const text =
        await response.text();


    let data = null;


    if (text) {

        try {

            data =
                JSON.parse(text);

        } catch {

            data = text;
        }
    }


    if (!response.ok) {

        let message =
            data?.msg ||
            data?.message ||
            data?.error_description ||
            data?.error ||
            `Erro HTTP ${response.status}`;


        if (
            response.status === 401 &&
            accessToken()
        ) {

            console.warn(
                "Sessão possivelmente expirada."
            );
        }


        const error =
            new Error(message);

        error.status =
            response.status;

        error.data =
            data;

        throw error;
    }


    return data;
}


/* =========================================================
   AUTENTICAÇÃO
   ========================================================= */

async function login(
    email,
    password
) {

    const data =
        await supabaseRequest(
            "/auth/v1/token?grant_type=password",
            {
                method: "POST",

                body: JSON.stringify({
                    email,
                    password
                })
            }
        );


    saveSession(data);

    return data;
}


/* ---------------------------------------------------------
   CADASTRO
   --------------------------------------------------------- */

async function register(
    email,
    password
) {

    const data =
        await supabaseRequest(
            "/auth/v1/signup",
            {
                method: "POST",

                body: JSON.stringify({
                    email,
                    password
                })
            }
        );


    /*
     * Como "Confirm email" está desativado no seu projeto,
     * o Supabase deve retornar access_token.
     *
     * Mantemos também o suporte caso a confirmação volte
     * a ser ativada posteriormente.
     */

    if (data?.access_token) {

        saveSession(data);

        return {
            authenticated: true,
            data
        };
    }


    return {
        authenticated: false,
        data
    };
}


/* ---------------------------------------------------------
   REFRESH
   --------------------------------------------------------- */

async function refreshSession() {

    if (!session?.refresh_token) {
        return false;
    }


    try {

        const data =
            await supabaseRequest(
                "/auth/v1/token?grant_type=refresh_token",
                {
                    method: "POST",

                    body: JSON.stringify({
                        refresh_token:
                            session.refresh_token
                    })
                }
            );


        saveSession(data);

        return true;

    } catch (error) {

        console.warn(
            "Não foi possível renovar a sessão:",
            error
        );

        clearSession();

        return false;
    }
}


/* ---------------------------------------------------------
   LOGOUT
   --------------------------------------------------------- */

async function logout() {

    try {

        if (accessToken()) {

            await supabaseRequest(
                "/auth/v1/logout",
                {
                    method: "POST"
                }
            );
        }

    } catch (error) {

        console.warn(
            "Logout remoto:",
            error
        );

    } finally {

        clearSession();

        state.expenses = [];

        showAuthModal();

        closeMobileSidebar();
    }
}


/* =========================================================
   RECUPERAÇÃO DE SENHA
   ========================================================= */

/*
 * IMPORTANTE:
 *
 * O Supabase envia o usuário de volta para:
 *
 * https://juniogilberto.github.io/despesas-da-casa/
 *
 * O token vem no HASH da URL.
 *
 * Exemplo:
 *
 * #access_token=...&refresh_token=...&type=recovery
 *
 * Não criamos uma página /reset-password.
 * Por isso o GitHub Pages não retorna 404.
 */


/* ---------------------------------------------------------
   ENVIA E-MAIL DE RECUPERAÇÃO
   --------------------------------------------------------- */

async function sendPasswordRecovery(
    email
) {

    await supabaseRequest(
        "/auth/v1/recover",
        {
            method: "POST",

            body: JSON.stringify({
                email,

                redirect_to:
                    SITE_URL
            })
        }
    );
}


/* ---------------------------------------------------------
   LÊ TOKEN DE RECUPERAÇÃO
   --------------------------------------------------------- */

function parseRecoveryFromHash() {

    const hash =
        window.location.hash;


    if (!hash) {
        return null;
    }


    const params =
        new URLSearchParams(
            hash.replace(/^#/, "")
        );


    const type =
        params.get("type");


    const accessTokenFromHash =
        params.get("access_token");


    const refreshTokenFromHash =
        params.get("refresh_token");


    if (
        type !== "recovery" ||
        !accessTokenFromHash
    ) {

        return null;
    }


    return {
        access_token:
            accessTokenFromHash,

        refresh_token:
            refreshTokenFromHash || "",

        token_type:
            params.get("token_type") || "bearer",

        expires_in:
            Number(
                params.get("expires_in") || 3600
            ),

        type
    };
}


/* ---------------------------------------------------------
   INICIA RECUPERAÇÃO
   --------------------------------------------------------- */

async function handleRecoveryRedirect() {

    const recovery =
        parseRecoveryFromHash();


    if (!recovery) {
        return false;
    }


    /*
     * Guardamos o token recebido pelo Supabase.
     */

    saveSession(recovery);


    /*
     * Limpa o token da barra de endereço.
     * O token continua no localStorage.
     */

    try {

        window.history.replaceState(
            {},
            document.title,
            SITE_URL
        );

    } catch (error) {

        console.warn(
            "Não foi possível limpar a URL:",
            error
        );
    }


    /*
     * Abre o modal para nova senha.
     */

    hideAuthModal();

    $("passwordResetModal")
        ?.classList.remove("hidden");


    return true;
}


/* ---------------------------------------------------------
   ALTERAR SENHA DURANTE RECOVERY
   --------------------------------------------------------- */

async function updatePassword(
    password
) {

    if (!accessToken()) {

        throw new Error(
            "A sessão de recuperação expirou. Solicite um novo e-mail."
        );
    }


    const data =
        await supabaseRequest(
            "/auth/v1/user",
            {
                method: "PUT",

                body: JSON.stringify({
                    password
                })
            }
        );


    /*
     * O token continua válido.
     * Atualizamos o usuário local se o Supabase
     * retornar os dados.
     */

    if (data?.id) {

        session.user =
            data;

        saveSession(session);
    }


    return data;
}


/* =========================================================
   USUÁRIO / PERFIL
   ========================================================= */

function currentUser() {

    return session?.user || null;
}


function userName() {

    const user =
        currentUser();


    return (
        user?.user_metadata?.name ||
        user?.user_metadata?.full_name ||
        user?.email?.split("@")[0] ||
        "Usuário"
    );
}


function userAvatar() {

    const user =
        currentUser();


    return (
        user?.user_metadata?.avatar ||
        "👤"
    );
}


/* ---------------------------------------------------------
   ATUALIZAR PERFIL
   --------------------------------------------------------- */

async function updateProfile(
    name,
    avatar
) {

    const data =
        await supabaseRequest(
            "/auth/v1/user",
            {
                method: "PUT",

                body: JSON.stringify({
                    data: {
                        name,
                        avatar
                    }
                })
            }
        );


    if (data) {

        session.user =
            data;

        saveSession(session);
    }


    return data;
}


/* =========================================================
   DADOS CLOUD
   ========================================================= */

async function loadCloudData() {

    /*
     * Configurações
     */

    const settings =
        await supabaseRequest(
            "/rest/v1/settings?select=*&limit=1",
            {
                method: "GET"
            }
        );


    if (
        Array.isArray(settings) &&
        settings.length > 0
    ) {

        state.settings = {
            start_day:
                Number(
                    settings[0].start_day
                ),

            budget_mistura:
                Number(
                    settings[0].budget_mistura
                ),

            budget_geral:
                Number(
                    settings[0].budget_geral
                )
        };

    } else {

        /*
         * Primeiro acesso:
         * cria configuração padrão.
         */

        await saveCloudSettings(
            state.settings
        );
    }


    /*
     * Gastos
     */

    const expenses =
        await supabaseRequest(
            "/rest/v1/expenses?select=*&order=date.desc",
            {
                method: "GET"
            }
        );


    state.expenses =
        Array.isArray(expenses)
            ? expenses.map(normalizeExpense)
            : [];
}


/* ---------------------------------------------------------
   NORMALIZA GASTO
   --------------------------------------------------------- */

function normalizeExpense(expense) {

    return {
        id:
            expense.id,

        description:
            expense.description || "",

        amount:
            Number(expense.amount || 0),

        category:
            expense.category === "geral"
                ? "geral"
                : "mistura",

        icon:
            expense.icon || "🛒",

        date:
            expense.date ||
            expense.created_at ||
            new Date().toISOString()
    };
}


/* ---------------------------------------------------------
   SALVA CONFIGURAÇÕES
   --------------------------------------------------------- */

async function saveCloudSettings(
    settings
) {

    const payload = {
        user_id:
            currentUser().id,

        start_day:
            Number(settings.start_day),

        budget_mistura:
            Number(settings.budget_mistura),

        budget_geral:
            Number(settings.budget_geral)
    };


    await supabaseRequest(
        "/rest/v1/settings?on_conflict=user_id",
        {
            method: "POST",

            headers: {
                Prefer:
                    "resolution=merge-duplicates,return=minimal"
            },

            body:
                JSON.stringify(payload)
        }
    );


    state.settings = {
        ...settings
    };
}


/* =========================================================
   DESPESAS
   ========================================================= */

async function addExpense(
    description,
    amount,
    category,
    icon
) {

    const payload = {
        user_id:
            currentUser().id,

        description:
            description.trim(),

        amount:
            Number(amount),

        category,

        icon,

        date:
            new Date().toISOString()
    };


    const data =
        await supabaseRequest(
            "/rest/v1/expenses",
            {
                method: "POST",

                headers: {
                    Prefer:
                        "return=representation"
                },

                body:
                    JSON.stringify(payload)
            }
        );


    const created =
        Array.isArray(data)
            ? data[0]
            : data;


    state.expenses.unshift(
        normalizeExpense(created)
    );


    return created;
}


/* ---------------------------------------------------------
   DELETE
   --------------------------------------------------------- */

async function deleteExpense(
    id
) {

    await supabaseRequest(
        `/rest/v1/expenses?id=eq.${encodeURIComponent(id)}`,
        {
            method: "DELETE",

            headers: {
                Prefer:
                    "return=minimal"
            }
        }
    );


    state.expenses =
        state.expenses.filter(
            expense =>
                expense.id !== id
        );
}


/* ---------------------------------------------------------
   DELETE TODOS
   --------------------------------------------------------- */

async function deleteAllExpenses() {

    const user =
        currentUser();


    if (!user) {
        return;
    }


    await supabaseRequest(
        `/rest/v1/expenses?user_id=eq.${encodeURIComponent(user.id)}`,
        {
            method: "DELETE",

            headers: {
                Prefer:
                    "return=minimal"
            }
        }
    );


    state.expenses = [];
}


/* =========================================================
   FORMATAÇÃO
   ========================================================= */

function money(value) {

    return new Intl.NumberFormat(
        "pt-BR",
        {
            style: "currency",
            currency: "BRL"
        }
    ).format(
        Number(value) || 0
    );
}


function dateOnly(date) {

    const d =
        new Date(date);


    return new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate()
    );
}


function formatDate(date) {

    const d =
        new Date(date);


    if (Number.isNaN(d.getTime())) {
        return "Data inválida";
    }


    return d.toLocaleDateString(
        "pt-BR",
        {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        }
    );
}


function formatDateTime(date) {

    const d =
        new Date(date);


    if (Number.isNaN(d.getTime())) {
        return "Data inválida";
    }


    return d.toLocaleDateString(
        "pt-BR",
        {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        }
    );
}


function escapeHTML(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =========================================================
   TOAST
   ========================================================= */

function toast(
    message,
    type = "success"
) {

    const element =
        $("toast");


    if (!element) {
        return;
    }


    $("toastMessage").textContent =
        message;


    $("toastIcon").textContent =
        type === "error"
            ? "!"
            : "✓";


    element.classList.toggle(
        "error",
        type === "error"
    );


    element.classList.add(
        "show"
    );


    clearTimeout(
        toastTimer
    );


    toastTimer =
        setTimeout(
            () => {

                element.classList.remove(
                    "show"
                );

            },
            3500
        );
}


/* =========================================================
   CICLO
   ========================================================= */

function getCycleStart(
    referenceDate = new Date()
) {

    const startDay =
        Number(
            state.settings.start_day
        );


    const current =
        new Date(referenceDate);


    current.setHours(
        0,
        0,
        0,
        0
    );


    let year =
        current.getFullYear();


    let month =
        current.getMonth();


    if (
        current.getDate() <
        startDay
    ) {

        month--;

        if (month < 0) {

            month = 11;
            year--;
        }
    }


    return new Date(
        year,
        month,
        startDay,
        0,
        0,
        0,
        0
    );
}


function getNextCycleStart(
    referenceDate = new Date()
) {

    const start =
        getCycleStart(
            referenceDate
        );


    let year =
        start.getFullYear();

    let month =
        start.getMonth() + 1;


    if (month > 11) {

        month = 0;
        year++;
    }


    return new Date(
        year,
        month,
        state.settings.start_day,
        0,
        0,
        0,
        0
    );
}


function isInCurrentCycle(
    date
) {

    const value =
        new Date(date);


    const start =
        getCycleStart();


    const end =
        getNextCycleStart();


    return (
        value >= start &&
        value < end
    );
}


function getCycleLabel() {

    const start =
        getCycleStart();


    const end =
        getNextCycleStart();


    const endDisplay =
        new Date(end);

    endDisplay.setDate(
        endDisplay.getDate() - 1
    );


    return (
        `${start.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit"
        })} – ${endDisplay.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit"
        })}`
    );
}


function getDaysRemaining() {

    const now =
        new Date();


    const end =
        getNextCycleStart();


    const diff =
        end.getTime() -
        now.getTime();


    return Math.max(
        0,
        Math.ceil(
            diff / 86400000
        )
    );
}


/* =========================================================
   DASHBOARD
   ========================================================= */

function currentCycleExpenses() {

    return state.expenses.filter(
        expense =>
            isInCurrentCycle(
                expense.date
            )
    );
}


function calculateDashboard() {

    const expenses =
        currentCycleExpenses();


    let mistura = 0;
    let geral = 0;


    for (const expense of expenses) {

        if (
            expense.category === "mistura"
        ) {

            mistura +=
                expense.amount;

        } else {

            geral +=
                expense.amount;
        }
    }


    const spent =
        mistura + geral;


    const budgetMistura =
        Number(
            state.settings.budget_mistura
        ) || 0;


    const budgetGeral =
        Number(
            state.settings.budget_geral
        ) || 0;


    const budget =
        budgetMistura +
        budgetGeral;


    const balance =
        budget - spent;


    const progress =
        budget > 0
            ? Math.min(
                100,
                (spent / budget) * 100
            )
            : 0;


    return {
        expenses,
        mistura,
        geral,
        spent,
        budgetMistura,
        budgetGeral,
        budget,
        balance,
        progress
    };
}


/* ---------------------------------------------------------
   RENDER DASHBOARD
   --------------------------------------------------------- */

function renderDashboard() {

    const data =
        calculateDashboard();


    $("dashboardBudget").textContent =
        money(data.budget);


    $("dashboardSpent").textContent =
        money(data.spent);


    $("dashboardBalance").textContent =
        money(data.balance);


    $("dashboardDays").textContent =
        String(
            getDaysRemaining()
        );


    $("progressText").textContent =
        `${Math.round(data.progress)}% utilizado`;


    $("progressPercent").textContent =
        `${Math.round(data.progress)}%`;


    $("progressBar").style.width =
        `${data.progress}%`;


    $("progressSpent").textContent =
        money(data.spent);


    $("progressBudget").textContent =
        money(data.budget);


    $("legendMistura").textContent =
        money(data.mistura);


    $("legendGeral").textContent =
        money(data.geral);


    $("donutTotal").textContent =
        money(data.spent);


    renderDonut(data);

    renderCategory(
        "mistura",
        data.mistura,
        data.budgetMistura
    );

    renderCategory(
        "geral",
        data.geral,
        data.budgetGeral
    );


    $("cycleLabel").textContent =
        getCycleLabel();
}


/* ---------------------------------------------------------
   DONUT
   --------------------------------------------------------- */

function renderDonut(data) {

    const donut =
        $("expenseDonut");


    if (!donut) {
        return;
    }


    const total =
        data.mistura +
        data.geral;


    if (total <= 0) {

        donut.style.background =
            "conic-gradient(var(--surface-2) 0deg 360deg)";

        return;
    }


    const misturaDegrees =
        (data.mistura / total) *
        360;


    donut.style.background =
        `conic-gradient(
            var(--mistura) 0deg ${misturaDegrees}deg,
            var(--geral) ${misturaDegrees}deg 360deg
        )`;
}


/* ---------------------------------------------------------
   CATEGORY
   --------------------------------------------------------- */

function renderCategory(
    category,
    spent,
    budget
) {

    const percent =
        budget > 0
            ? Math.min(
                100,
                (spent / budget) * 100
            )
            : 0;


    const text =
        category === "mistura"
            ? $("categoryMisturaText")
            : $("categoryGeralText");


    const bar =
        category === "mistura"
            ? $("categoryMisturaBar")
            : $("categoryGeralBar");


    if (text) {

        text.textContent =
            `${money(spent)} / ${money(budget)}`;
    }


    if (bar) {

        bar.style.width =
            `${percent}%`;
    }
}


/* =========================================================
   NAVIGATION
   ========================================================= */

const pageTitles = {

    dashboard: {
        title: "Resumo",
        subtitle:
            "Visão geral das suas despesas"
    },

    add: {
        title: "Adicionar gasto",
        subtitle:
            "Registre uma nova despesa"
    },

    history: {
        title: "Histórico",
        subtitle:
            "Todos os seus gastos registrados"
    },

    profile: {
        title: "Perfil",
        subtitle:
            "Gerencie seus dados pessoais"
    },

    settings: {
        title: "Configurações",
        subtitle:
            "Personalize seu controle financeiro"
    }
};


function navigate(
    page
) {

    if (
        !pageTitles[page]
    ) {
        page = "dashboard";
    }


    currentPage =
        page;


    document
        .querySelectorAll(".page")
        .forEach(
            element => {

                element.classList.toggle(
                    "active",
                    element.id ===
                        `page-${page}`
                );
            }
        );


    document
        .querySelectorAll(".nav-item")
        .forEach(
            element => {

                element.classList.toggle(
                    "active",
                    element.dataset.page ===
                        page
                );
            }
        );


    const info =
        pageTitles[page];


    $("pageTitle").textContent =
        info.title;


    $("pageSubtitle").textContent =
        info.subtitle;


    closeMobileSidebar();


    if (page === "dashboard") {

        renderDashboard();
    }


    if (page === "history") {

        renderHistory();
    }


    if (page === "profile") {

        renderProfile();
    }


    if (page === "settings") {

        renderSettings();
    }
}


/* =========================================================
   SIDEBAR MOBILE
   ========================================================= */

function openMobileSidebar() {

    $("sidebar")
        ?.classList.add("open");

    $("sidebarOverlay")
        ?.classList.add("visible");

    document.body.style.overflow =
        "hidden";
}


function closeMobileSidebar() {

    $("sidebar")
        ?.classList.remove("open");

    $("sidebarOverlay")
        ?.classList.remove("visible");

    document.body.style.overflow =
        "";
}


/* =========================================================
   PROFILE UI
   ========================================================= */

function renderProfile() {

    const user =
        currentUser();


    if (!user) {
        return;
    }


    const name =
        userName();


    const avatar =
        userAvatar();


    const email =
        user.email || "—";


    $("profileName").textContent =
        name;


    $("profileEmail").textContent =
        email;


    $("profileViewName").textContent =
        name;


    $("profileViewEmail").textContent =
        email;


    $("profileAvatar").textContent =
        avatar;


    $("profileCreatedAt").textContent =
        user.created_at
            ? formatDate(
                user.created_at
            )
            : "—";


    $("profileNameInput").value =
        name;


    selectedAvatar =
        avatar;


    updateAvatarPicker();


    updateAllAvatars();
}


/* ---------------------------------------------------------
   AVATARES
   --------------------------------------------------------- */

function updateAllAvatars() {

    const avatar =
        userAvatar();


    $("sidebarAvatar").textContent =
        avatar;


    $("topAvatar").textContent =
        avatar;
}


function updateAvatarPicker() {

    document
        .querySelectorAll(".avatar-option")
        .forEach(
            button => {

                button.classList.toggle(
                    "active",
                    button.dataset.avatar ===
                        selectedAvatar
                );
            }
        );
}


/* ---------------------------------------------------------
   PROFILE EDIT MODE
   --------------------------------------------------------- */

function openProfileEdit() {

    renderProfile();


    $("profileView")
        ?.classList.add("hidden");


    $("profileEditForm")
        ?.classList.remove("hidden");
}


function closeProfileEdit() {

    $("profileEditForm")
        ?.classList.add("hidden");


    $("profileView")
        ?.classList.remove("hidden");


    renderProfile();
}


/* =========================================================
   SETTINGS
   ========================================================= */

function renderSettings() {

    $("startDay").value =
        String(
            state.settings.start_day
        );


    $("budgetMistura").value =
        Number(
            state.settings.budget_mistura
        );


    $("budgetGeral").value =
        Number(
            state.settings.budget_geral
        );


    $("settingsAccountEmail").textContent =
        currentUser()?.email || "—";
}


/* =========================================================
   HISTORY
   ========================================================= */

function filteredHistoryExpenses() {

    let expenses =
        [...state.expenses];


    if (
        historyCycle === "current"
    ) {

        expenses =
            expenses.filter(
                expense =>
                    isInCurrentCycle(
                        expense.date
                    )
            );
    }


    const search =
        $("historySearch")
            ?.value
            ?.trim()
            ?.toLowerCase() || "";


    const category =
        $("historyCategory")
            ?.value || "all";


    if (search) {

        expenses =
            expenses.filter(
                expense =>
                    expense.description
                        .toLowerCase()
                        .includes(search)
            );
    }


    if (category !== "all") {

        expenses =
            expenses.filter(
                expense =>
                    expense.category ===
                        category
            );
    }


    return expenses;
}


/* ---------------------------------------------------------
   RENDER HISTORY
   --------------------------------------------------------- */

function renderHistory() {

    const list =
        $("historyList");


    const empty =
        $("historyEmpty");


    if (!list || !empty) {
        return;
    }


    const expenses =
        filteredHistoryExpenses();


    list.innerHTML = "";


    if (expenses.length === 0) {

        empty.classList.remove(
            "hidden"
        );

        return;
    }


    empty.classList.add(
        "hidden"
    );


    expenses.forEach(
        expense => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "history-item";


            const categoryName =
                expense.category ===
                    "mistura"
                    ? "Mistura"
                    : "Geral";


            item.innerHTML = `

                <div class="history-icon">
                    ${escapeHTML(expense.icon)}
                </div>

                <div class="history-main">

                    <div class="history-title">
                        ${escapeHTML(
                            expense.description
                        )}
                    </div>

                    <div class="history-meta">

                        <span>
                            ${formatDate(
                                expense.date
                            )}
                        </span>

                        <span
                            class="history-category ${expense.category}">
                            ${categoryName}
                        </span>

                    </div>

                </div>

                <strong class="history-value">
                    ${money(expense.amount)}
                </strong>

                <button
                    class="history-delete"
                    type="button"
                    data-delete-id="${escapeHTML(
                        expense.id
                    )}"
                    title="Excluir gasto">
                    🗑️
                </button>
            `;


            list.appendChild(
                item
            );
        }
    );
}


/* =========================================================
   AUTH UI
   ========================================================= */

function showAuthModal() {

    $("app")
        ?.classList.add("hidden");


    $("authModal")
        ?.classList.remove("hidden");


    $("passwordResetModal")
        ?.classList.add("hidden");


    document.body.style.overflow =
        "hidden";
}


function hideAuthModal() {

    $("authModal")
        ?.classList.add("hidden");


    document.body.style.overflow =
        "";
}


function showApp() {

    $("authModal")
        ?.classList.add("hidden");


    $("passwordResetModal")
        ?.classList.add("hidden");


    $("app")
        ?.classList.remove("hidden");


    document.body.style.overflow =
        "";


    updateAllAvatars();

    navigate(
        currentPage
    );
}


/* =========================================================
   CONFIRM MODAL
   ========================================================= */

function showConfirm(
    title,
    message,
    callback
) {

    confirmCallback =
        callback;


    $("confirmTitle").textContent =
        title;


    $("confirmMessage").textContent =
        message;


    $("confirmModal")
        ?.classList.remove("hidden");
}


function closeConfirm() {

    $("confirmModal")
        ?.classList.add("hidden");


    confirmCallback =
        null;
}


/* =========================================================
   EVENTOS — NAVEGAÇÃO
   ========================================================= */

document
    .querySelectorAll(".nav-item")
    .forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    navigate(
                        button.dataset.page
                    );
                }
            );
        }
    );


$("sidebarProfile")
    ?.addEventListener(
        "click",
        () => {

            navigate(
                "profile"
            );
        }
    );


$("topProfileButton")
    ?.addEventListener(
        "click",
        () => {

            navigate(
                "profile"
            );
        }
    );


$("openSidebarBtn")
    ?.addEventListener(
        "click",
        openMobileSidebar
    );


$("closeSidebarBtn")
    ?.addEventListener(
        "click",
        closeMobileSidebar
    );


$("sidebarOverlay")
    ?.addEventListener(
        "click",
        closeMobileSidebar
    );


/* =========================================================
   EVENTOS — CICLO
   ========================================================= */

$("cycleButton")
    ?.addEventListener(
        "click",
        () => {

            $("cycleModalText").textContent =
                `Seu ciclo atual vai de ${getCycleLabel()}.`;

            $("cycleModal")
                ?.classList.remove(
                    "hidden"
                );
        }
    );


$("closeCycleModalBtn")
    ?.addEventListener(
        "click",
        () => {

            $("cycleModal")
                ?.classList.add(
                    "hidden"
                );
        }
    );


/* =========================================================
   EVENTOS — ADD EXPENSE
   ========================================================= */

document
    .querySelectorAll(".expense-icon")
    .forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    selectedExpenseIcon =
                        button.dataset.icon;


                    document
                        .querySelectorAll(
                            ".expense-icon"
                        )
                        .forEach(
                            item => {

                                item.classList.toggle(
                                    "active",
                                    item ===
                                        button
                                );
                            }
                        );
                }
            );
        }
    );


$("expenseForm")
    ?.addEventListener(
        "submit",
        async event => {

            event.preventDefault();


            const description =
                $("expenseDescription")
                    .value
                    .trim();


            const amount =
                Number(
                    $("expenseAmount").value
                );


            const category =
                document
                    .querySelector(
                        'input[name="expenseCategory"]:checked'
                    )
                    ?.value ||
                "mistura";


            if (!description) {

                toast(
                    "Informe a descrição do gasto.",
                    "error"
                );

                return;
            }


            if (
                !Number.isFinite(amount) ||
                amount <= 0
            ) {

                toast(
                    "Informe um valor válido.",
                    "error"
                );

                return;
            }


            const submitButton =
                event.submitter;


            if (submitButton) {

                submitButton.disabled =
                    true;

                submitButton.dataset.originalText =
                    submitButton.textContent;

                submitButton.textContent =
                    "Salvando...";
            }


            try {

                await addExpense(
                    description,
                    amount,
                    category,
                    selectedExpenseIcon
                );


                $("expenseForm").reset();


                document
                    .querySelector(
                        'input[name="expenseCategory"][value="mistura"]'
                    )
                    ?.click();


                selectedExpenseIcon =
                    "🛒";


                document
                    .querySelectorAll(
                        ".expense-icon"
                    )
                    .forEach(
                        button => {

                            button.classList.toggle(
                                "active",
                                button.dataset.icon ===
                                    "🛒"
                            );
                        }
                    );


                toast(
                    "Gasto adicionado com sucesso."
                );


                navigate(
                    "history"
                );


            } catch (error) {

                console.error(
                    error
                );


                toast(
                    error.message ||
                        "Não foi possível salvar o gasto.",
                    "error"
                );

            } finally {

                if (submitButton) {

                    submitButton.disabled =
                        false;

                    submitButton.textContent =
                        submitButton.dataset.originalText ||
                        "Adicionar gasto";
                }
            }
        }
    );


$("cancelExpenseBtn")
    ?.addEventListener(
        "click",
        () => {

            $("expenseForm")
                ?.reset();

            navigate(
                "dashboard"
            );
        }
    );


/* =========================================================
   EVENTOS — HISTORY
   ========================================================= */

$("historySearch")
    ?.addEventListener(
        "input",
        renderHistory
    );


$("historyCategory")
    ?.addEventListener(
        "change",
        renderHistory
    );


document
    .querySelectorAll(".cycle-tab")
    .forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    historyCycle =
                        button.dataset.cycle;


                    document
                        .querySelectorAll(
                            ".cycle-tab"
                        )
                        .forEach(
                            tab => {

                                tab.classList.toggle(
                                    "active",
                                    tab ===
                                        button
                                );
                            }
                        );


                    renderHistory();
                }
            );
        }
    );


$("historyList")
    ?.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    "[data-delete-id]"
                );


            if (!button) {
                return;
            }


            const id =
                button.dataset.deleteId;


            const expense =
                state.expenses.find(
                    item =>
                        item.id === id
                );


            if (!expense) {
                return;
            }


            showConfirm(
                "Excluir gasto?",
                `Deseja excluir "${expense.description}"?`,
                async () => {

                    try {

                        await deleteExpense(
                            id
                        );


                        toast(
                            "Gasto excluído."
                        );


                        renderHistory();
                        renderDashboard();

                    } catch (error) {

                        console.error(
                            error
                        );


                        toast(
                            error.message ||
                                "Não foi possível excluir o gasto.",
                            "error"
                        );
                    }
                }
            );
        }
    );


$("clearHistoryBtn")
    ?.addEventListener(
        "click",
        () => {

            if (
                state.expenses.length === 0
            ) {

                toast(
                    "Não existem gastos para apagar.",
                    "error"
                );

                return;
            }


            showConfirm(
                "Limpar histórico?",
                "Todos os gastos da sua conta serão excluídos permanentemente.",
                async () => {

                    try {

                        await deleteAllExpenses();


                        toast(
                            "Histórico apagado."
                        );


                        renderHistory();
                        renderDashboard();

                    } catch (error) {

                        console.error(
                            error
                        );


                        toast(
                            error.message ||
                                "Não foi possível limpar o histórico.",
                            "error"
                        );
                    }
                }
            );
        }
    );


/* =========================================================
   EVENTOS — PERFIL
   ========================================================= */

$("editProfileBtn")
    ?.addEventListener(
        "click",
        openProfileEdit
    );


$("editProfileTopBtn")
    ?.addEventListener(
        "click",
        openProfileEdit
    );


$("cancelProfileEditBtn")
    ?.addEventListener(
        "click",
        closeProfileEdit
    );


document
    .querySelectorAll(".avatar-option")
    .forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    selectedAvatar =
                        button.dataset.avatar;


                    updateAvatarPicker();
                }
            );
        }
    );


$("profileEditForm")
    ?.addEventListener(
        "submit",
        async event => {

            event.preventDefault();


            const name =
                $("profileNameInput")
                    .value
                    .trim();


            if (!name) {

                toast(
                    "Digite seu nome.",
                    "error"
                );

                return;
            }


            if (name.length > 60) {

                toast(
                    "O nome pode ter no máximo 60 caracteres.",
                    "error"
                );

                return;
            }


            const submitButton =
                event.submitter;


            if (submitButton) {

                submitButton.disabled =
                    true;

                submitButton.textContent =
                    "Salvando...";
            }


            try {

                await updateProfile(
                    name,
                    selectedAvatar
                );


                toast(
                    "Perfil atualizado."
                );


                renderProfile();


                closeProfileEdit();


                updateAllAvatars();

            } catch (error) {

                console.error(
                    error
                );


                toast(
                    error.message ||
                        "Não foi possível atualizar o perfil.",
                    "error"
                );

            } finally {

                if (submitButton) {

                    submitButton.disabled =
                        false;

                    submitButton.textContent =
                        "Salvar alterações";
                }
            }
        }
    );


/* =========================================================
   EVENTOS — ALTERAÇÃO DE SENHA
   ========================================================= */

$("passwordChangeForm")
    ?.addEventListener(
        "submit",
        async event => {

            event.preventDefault();


            const password =
                $("newPassword").value;


            const confirm =
                $("confirmPassword").value;


            if (password.length < 6) {

                toast(
                    "A senha precisa ter pelo menos 6 caracteres.",
                    "error"
                );

                return;
            }


            if (password !== confirm) {

                toast(
                    "As senhas não são iguais.",
                    "error"
                );

                return;
            }


            const button =
                event.submitter;


            if (button) {

                button.disabled =
                    true;

                button.textContent =
                    "Alterando...";
            }


            try {

                await updatePassword(
                    password
                );


                $("passwordChangeForm")
                    .reset();


                toast(
                    "Senha alterada com sucesso."
                );

            } catch (error) {

                console.error(
                    error
                );


                toast(
                    error.message ||
                        "Não foi possível alterar a senha.",
                    "error"
                );

            } finally {

                if (button) {

                    button.disabled =
                        false;

                    button.textContent =
                        "Alterar senha";
                }
            }
        }
    );


/* =========================================================
   EVENTOS — PASSWORD RESET
   ========================================================= */

$("passwordResetForm")
    ?.addEventListener(
        "submit",
        async event => {

            event.preventDefault();


            const password =
                $("resetNewPassword")
                    .value;


            const confirm =
                $("resetConfirmPassword")
                    .value;


            if (password.length < 6) {

                toast(
                    "A senha precisa ter pelo menos 6 caracteres.",
                    "error"
                );

                return;
            }


            if (password !== confirm) {

                toast(
                    "As senhas não são iguais.",
                    "error"
                );

                return;
            }


            const button =
                event.submitter;


            if (button) {

                button.disabled =
                    true;

                button.textContent =
                    "Salvando...";
            }


            try {

                await updatePassword(
                    password
                );


                $("passwordResetForm")
                    .reset();


                $("passwordResetModal")
                    ?.classList.add(
                        "hidden"
                    );


                toast(
                    "Senha redefinida com sucesso."
                );


                navigate(
                    "dashboard"
                );


            } catch (error) {

                console.error(
                    error
                );


                toast(
                    error.message ||
                        "Não foi possível redefinir a senha.",
                    "error"
                );

            } finally {

                if (button) {

                    button.disabled =
                        false;

                    button.textContent =
                        "Definir nova senha";
                }
            }
        }
    );


/* =========================================================
   EVENTOS — SETTINGS
   ========================================================= */

$("saveSettingsBtn")
    ?.addEventListener(
        "click",
        async () => {

            const startDay =
                Number(
                    $("startDay").value
                );


            const budgetMistura =
                Number(
                    $("budgetMistura").value
                );


            const budgetGeral =
                Number(
                    $("budgetGeral").value
                );


            if (
                !Number.isInteger(startDay) ||
                startDay < 1 ||
                startDay > 28
            ) {

                toast(
                    "Escolha um dia inicial válido.",
                    "error"
                );

                return;
            }


            if (
                !Number.isFinite(budgetMistura) ||
                budgetMistura <= 0
            ) {

                toast(
                    "Informe um orçamento válido para Mistura.",
                    "error"
                );

                return;
            }


            if (
                !Number.isFinite(budgetGeral) ||
                budgetGeral <= 0
            ) {

                toast(
                    "Informe um orçamento válido para Geral.",
                    "error"
                );

                return;
            }


            const button =
                $("saveSettingsBtn");


            button.disabled =
                true;

            button.textContent =
                "Salvando...";


            try {

                await saveCloudSettings({

                    start_day:
                        startDay,

                    budget_mistura:
                        budgetMistura,

                    budget_geral:
                        budgetGeral
                });


                toast(
                    "Configurações salvas."
                );


                renderDashboard();

            } catch (error) {

                console.error(
                    error
                );


                toast(
                    error.message ||
                        "Não foi possível salvar as configurações.",
                    "error"
                );

            } finally {

                button.disabled =
                    false;

                button.textContent =
                    "Salvar configurações";
            }
        }
    );


/* =========================================================
   EVENTOS — AUTH
   ========================================================= */

$("authForm")
    ?.addEventListener(
        "submit",
        async event => {

            event.preventDefault();


            const email =
                $("authEmail")
                    .value
                    .trim();


            const password =
                $("authPassword")
                    .value;


            if (!email) {

                toast(
                    "Digite seu e-mail.",
                    "error"
                );

                return;
            }


            if (password.length < 6) {

                toast(
                    "A senha precisa ter pelo menos 6 caracteres.",
                    "error"
                );

                return;
            }


            const button =
                event.submitter;


            if (button) {

                button.disabled =
                    true;

                button.textContent =
                    "Entrando...";
            }


            try {

                await login(
                    email,
                    password
                );


                $("authForm")
                    .reset();


                await loadCloudData();


                showApp();


                toast(
                    "Login realizado com sucesso."
                );

            } catch (error) {

                console.error(
                    error
                );


                let message =
                    error.message ||
                    "Não foi possível entrar.";


                if (
                    message
                        .toLowerCase()
                        .includes("invalid login credentials")
                ) {

                    message =
                        "E-mail ou senha incorretos.";
                }


                toast(
                    message,
                    "error"
                );

            } finally {

                if (button) {

                    button.disabled =
                        false;

                    button.textContent =
                        "Entrar";
                }
            }
        }
    );


/* ---------------------------------------------------------
   CADASTRO
   --------------------------------------------------------- */

$("registerBtn")
    ?.addEventListener(
        "click",
        async () => {

            const email =
                $("authEmail")
                    .value
                    .trim();


            const password =
                $("authPassword")
                    .value;


            if (!email) {

                toast(
                    "Digite o e-mail para criar a conta.",
                    "error"
                );

                return;
            }


            if (password.length < 6) {

                toast(
                    "A senha precisa ter pelo menos 6 caracteres.",
                    "error"
                );

                return;
            }


            const button =
                $("registerBtn");


            button.disabled =
                true;

            button.textContent =
                "Criando...";


            try {

                const result =
                    await register(
                        email,
                        password
                    );


                if (
                    result.authenticated
                ) {

                    $("authForm")
                        .reset();


                    await loadCloudData();


                    showApp();


                    toast(
                        "Conta criada com sucesso."
                    );

                } else {

                    toast(
                        "Conta criada. Verifique seu e-mail para continuar."
                    );
                }

            } catch (error) {

                console.error(
                    error
                );


                let message =
                    error.message ||
                    "Não foi possível criar a conta.";


                if (
                    message
                        .toLowerCase()
                        .includes("already registered")
                ) {

                    message =
                        "Este e-mail já possui uma conta.";
                }


                toast(
                    message,
                    "error"
                );

            } finally {

                button.disabled =
                    false;

                button.textContent =
                    "Criar conta";
            }
        }
    );


/* ---------------------------------------------------------
   ESQUECI SENHA
   --------------------------------------------------------- */

$("forgotPasswordBtn")
    ?.addEventListener(
        "click",
        async () => {

            const email =
                $("authEmail")
                    .value
                    .trim();


            if (!email) {

                toast(
                    "Digite seu e-mail primeiro.",
                    "error"
                );

                $("authEmail").focus();

                return;
            }


            const button =
                $("forgotPasswordBtn");


            button.disabled =
                true;

            button.textContent =
                "Enviando...";


            try {

                await sendPasswordRecovery(
                    email
                );


                toast(
                    "Se o e-mail existir, o link de recuperação foi enviado."
                );

            } catch (error) {

                console.error(
                    error
                );


                toast(
                    error.message ||
                        "Não foi possível enviar o e-mail.",
                    "error"
                );

            } finally {

                button.disabled =
                    false;

                button.textContent =
                    "Esqueci minha senha";
            }
        }
    );


/* =========================================================
   LOGOUT
   ========================================================= */

$("logoutBtn")
    ?.addEventListener(
        "click",
        () => {

            showConfirm(
                "Sair da conta?",
                "Você será desconectado deste dispositivo.",
                async () => {

                    await logout();

                    toast(
                        "Você saiu da conta."
                    );
                }
            );
        }
    );


/* =========================================================
   CONFIRM MODAL
   ========================================================= */

$("confirmCancelBtn")
    ?.addEventListener(
        "click",
        closeConfirm
    );


$("confirmOkBtn")
    ?.addEventListener(
        "click",
        async () => {

            const callback =
                confirmCallback;


            closeConfirm();


            if (
                typeof callback ===
                "function"
            ) {

                await callback();
            }
        }
    );


/* =========================================================
   FECHAR MODAIS CLICANDO FORA
   ========================================================= */

[
    "cycleModal",
    "confirmModal"
].forEach(
    id => {

        $(id)?.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    $(id)
                ) {

                    $(id)
                        .classList.add(
                            "hidden"
                        );
                }
            }
        );
    }
);


/* =========================================================
   ATUALIZA DADOS DO SIDEBAR
   ========================================================= */

function renderUserUI() {

    const user =
        currentUser();


    if (!user) {
        return;
    }


    const name =
        userName();


    const email =
        user.email ||
        "—";


    const avatar =
        userAvatar();


    $("sidebarName").textContent =
        name;


    $("sidebarEmail").textContent =
        email;


    $("sidebarAvatar").textContent =
        avatar;


    $("topAvatar").textContent =
        avatar;


    $("settingsAccountEmail").textContent =
        email;
}


/* =========================================================
   SESSION / TOKEN
   ========================================================= */

async function ensureValidSession() {

    if (!session) {
        return false;
    }


    /*
     * Se houver token de recuperação,
     * não tentamos validar como uma sessão comum.
     */

    if (
        session.type ===
        "recovery"
    ) {

        return true;
    }


    /*
     * Primeiro tentamos carregar os dados.
     * Se der 401, renovamos o token.
     */

    try {

        await supabaseRequest(
            "/auth/v1/user",
            {
                method: "GET"
            }
        );


        return true;

    } catch (error) {

        if (
            error.status !== 401
        ) {

            console.warn(
                "Erro ao validar sessão:",
                error
            );

            return true;
        }


        return await refreshSession();
    }
}


/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

async function initializeApp() {

    /*
     * 1. Primeiro verifica se o site acabou de receber
     * um link de recuperação de senha.
     */

    const recovery =
        await handleRecoveryRedirect();


    if (recovery) {

        return;
    }


    /*
     * 2. Carrega sessão salva.
     */

    session =
        loadSession();


    /*
     * 3. Não existe sessão.
     */

    if (!session) {

        showAuthModal();

        return;
    }


    /*
     * 4. Verifica se ainda é válida.
     */

    const valid =
        await ensureValidSession();


    if (!valid) {

        clearSession();

        showAuthModal();

        return;
    }


    /*
     * 5. Carrega dados da conta.
     */

    try {

        await loadCloudData();

    } catch (error) {

        console.error(
            "Erro ao carregar dados:",
            error
        );


        /*
         * Se a sessão expirou durante o carregamento,
         * tentamos renovar uma vez.
         */

        if (
            error.status === 401
        ) {

            const refreshed =
                await refreshSession();


            if (refreshed) {

                try {

                    await loadCloudData();

                } catch (secondError) {

                    console.error(
                        secondError
                    );

                    clearSession();

                    showAuthModal();

                    toast(
                        "Sua sessão expirou. Entre novamente.",
                        "error"
                    );

                    return;
                }

            } else {

                clearSession();

                showAuthModal();

                toast(
                    "Sua sessão expirou. Entre novamente.",
                    "error"
                );

                return;
            }

        } else {

            toast(
                "Não foi possível carregar seus dados.",
                "error"
            );
        }
    }


    /*
     * 6. Atualiza interface.
     */

    renderUserUI();

    renderProfile();

    renderSettings();

    renderDashboard();

    renderHistory();

    showApp();
}


/* =========================================================
   TRATAMENTO DE ERRO GLOBAL
   ========================================================= */

window.addEventListener(
    "unhandledrejection",
    event => {

        console.error(
            "Promise rejeitada:",
            event.reason
        );
    }
);


/* =========================================================
   INICIAR
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        initializeApp()
            .catch(
                error => {

                    console.error(
                        "Erro fatal na inicialização:",
                        error
                    );


                    clearSession();

                    showAuthModal();


                    toast(
                        "Não foi possível iniciar o aplicativo.",
                        "error"
                    );
                }
            );
    }
);