"use strict";

/* =========================================================
   SUPABASE
   ========================================================= */

const SUPABASE_URL =
    "https://wbwqvtlirhllulnahjdx.supabase.co";

const SUPABASE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indid3F2dGxpcmhsbHVsbmFoamR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDQxNzcsImV4cCI6MjEwNTYyMDE3N30.9PRA99X_if5jafFgnxuKSpRzojzB8zg7TI_XmR_lYXE";

/* =========================================================
   CONFIGURAÇÃO
   ========================================================= */

const STORAGE_KEY = "house_expenses_session_v1";

const ICONS = [
    "🥩","🍗","🐟","🥚","🍚","🫘","🥛","🍞",
    "🥬","🥕","🍎","🧀","🥫","🧃","🧼","🧴",
    "🧻","📦"
];

const DEFAULT_SETTINGS = {
    startDay: 24,
    budgets: {
        mistura: 600,
        geral: 400
    }
};

const $ = id => document.getElementById(id);

let session = loadSession();
let state = {
    settings: structuredClone(DEFAULT_SETTINGS),
    expenses: []
};

let selectedCycle = null;
let selectedIcon = "📦";
let authMode = "login";


/* =========================================================
   SESSÃO
   ========================================================= */

function loadSession() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
    } catch {
        return null;
    }
}

function saveSession() {
    if (session) {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(session)
        );
    }
}

function clearSession() {
    session = null;
    localStorage.removeItem(STORAGE_KEY);
}

function accessToken() {
    return session?.access_token || "";
}


/* =========================================================
   API SUPABASE
   ========================================================= */

async function supabaseRequest(
    path,
    options = {}
) {
    const headers = {
        apikey: SUPABASE_KEY,
        Accept: "application/json",
        ...(options.headers || {})
    };

    if (accessToken()) {
        headers.Authorization = `Bearer ${accessToken()}`;
    } else {
        headers.Authorization = `Bearer ${SUPABASE_KEY}`;
    }

    if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(
        `${SUPABASE_URL}${path}`,
        {
            ...options,
            headers
        }
    );

    const text = await response.text();

    let data = null;

    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
    }

    if (!response.ok) {
        const message =
            data?.message ||
            data?.error_description ||
            data?.hint ||
            data?.error ||
            `Erro HTTP ${response.status}`;

        throw new Error(message);
    }

    return data;
}


/* =========================================================
   AUTENTICAÇÃO
   ========================================================= */

async function login(email, password) {
    const data = await supabaseRequest(
        "/auth/v1/token?grant_type=password",
        {
            method: "POST",
            body: JSON.stringify({
                email,
                password
            })
        }
    );

    session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at:
            Date.now() +
            Number(data.expires_in || 3600) * 1000,
        user: data.user
    };

    saveSession();

    await loadCloudData();

    hideAuth();

    update();

    toast("Login realizado.");
}

async function register(email, password) {
    const data = await supabaseRequest(
        "/auth/v1/signup",
        {
            method: "POST",
            body: JSON.stringify({
                email,
                password
            })
        }
    );

    if (data.access_token) {
        session = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at:
                Date.now() +
                Number(data.expires_in || 3600) * 1000,
            user: data.user
        };

        saveSession();

        await loadCloudData();

        hideAuth();
        update();

        toast("Conta criada.");
        return;
    }

    toast(
        "Conta criada. Verifique seu e-mail para confirmar o cadastro."
    );
}

async function refreshSession() {
    if (!session?.refresh_token) {
        clearSession();
        return false;
    }

    try {
        const data = await fetch(
            `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
            {
                method: "POST",
                headers: {
                    apikey: SUPABASE_KEY,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    refresh_token: session.refresh_token
                })
            }
        );

        if (!data.ok) {
            clearSession();
            return false;
        }

        const result = await data.json();

        session = {
            access_token: result.access_token,
            refresh_token: result.refresh_token,
            expires_at:
                Date.now() +
                Number(result.expires_in || 3600) * 1000,
            user: result.user || session.user
        };

        saveSession();

        return true;

    } catch {
        clearSession();
        return false;
    }
}

async function ensureSession() {
    if (!session?.access_token) {
        showAuth();
        return false;
    }

    if (
        session.expires_at &&
        Date.now() > session.expires_at - 60000
    ) {
        const refreshed = await refreshSession();

        if (!refreshed) {
            showAuth();
            return false;
        }
    }

    return true;
}

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
    } catch {
        /* sessão será removida localmente mesmo se a API falhar */
    }

    clearSession();

    state = {
        settings: structuredClone(DEFAULT_SETTINGS),
        expenses: []
    };

    showAuth();
}


/* =========================================================
   RECUPERAÇÃO DE SENHA
   ========================================================= */

async function resetPassword(email) {
    if (!email) {
        toast("Informe seu e-mail.");
        return;
    }

    await supabaseRequest(
        "/auth/v1/recover",
        {
            method: "POST",
            body: JSON.stringify({
                email
            })
        }
    );

    toast("E-mail de recuperação enviado.");
}


/* =========================================================
   DADOS
   ========================================================= */

async function loadCloudData() {
    if (!(await ensureSession())) return;

    const [expenses, settings] = await Promise.all([
        supabaseRequest(
            "/rest/v1/expenses?select=*&order=date.desc"
        ),

        supabaseRequest(
            "/rest/v1/settings?select=*&limit=1"
        )
    ]);

    state.expenses = (expenses || []).map(expense => ({
        id: expense.id,
        desc: expense.description,
        amount: Number(expense.amount),
        category: expense.category,
        icon: expense.icon || "📦",
        date: expense.date
    }));

    if (settings?.length) {
        const data = settings[0];

        state.settings = {
            startDay: Number(data.start_day),
            budgets: {
                mistura: Number(data.budget_mistura),
                geral: Number(data.budget_geral)
            }
        };
    } else {
        state.settings = structuredClone(
            DEFAULT_SETTINGS
        );

        await saveCloudSettings();
    }
}

async function saveCloudSettings() {
    if (!(await ensureSession())) return;

    const userId = session.user.id;

    await supabaseRequest(
        "/rest/v1/settings?on_conflict=user_id",
        {
            method: "POST",
            headers: {
                Prefer: "resolution=merge-duplicates,return=minimal"
            },
            body: JSON.stringify({
                user_id: userId,
                start_day: state.settings.startDay,
                budget_mistura:
                    state.settings.budgets.mistura,
                budget_geral:
                    state.settings.budgets.geral,
                updated_at: new Date().toISOString()
            })
        }
    );
}


/* =========================================================
   DESPESAS
   ========================================================= */

async function addExpense(expense) {
    if (!(await ensureSession())) return;

    const result = await supabaseRequest(
        "/rest/v1/expenses",
        {
            method: "POST",
            headers: {
                Prefer: "return=representation"
            },
            body: JSON.stringify({
                user_id: session.user.id,
                description: expense.desc,
                amount: expense.amount,
                category: expense.category,
                icon: expense.icon,
                date: expense.date
            })
        }
    );

    const saved = result?.[0];

    if (!saved) {
        throw new Error(
            "O Supabase não retornou o gasto salvo."
        );
    }

    state.expenses.push({
        id: saved.id,
        desc: saved.description,
        amount: Number(saved.amount),
        category: saved.category,
        icon: saved.icon || "📦",
        date: saved.date
    });
}

async function deleteExpense(id) {
    if (!(await ensureSession())) return;

    await supabaseRequest(
        `/rest/v1/expenses?id=eq.${encodeURIComponent(id)}`,
        {
            method: "DELETE"
        }
    );

    state.expenses = state.expenses.filter(
        expense => String(expense.id) !== String(id)
    );

    update();
    toast("Compra removida.");
}


/* =========================================================
   FORMATAÇÃO
   ========================================================= */

function money(value) {
    return Number(value).toLocaleString(
        "pt-BR",
        {
            style: "currency",
            currency: "BRL"
        }
    );
}

function toast(message) {
    const el = $("toast");

    el.textContent = message;
    el.classList.add("show");

    clearTimeout(toast.timer);

    toast.timer = setTimeout(
        () => el.classList.remove("show"),
        2200
    );
}

function dateOnly(date) {
    date = new Date(date);

    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
    );
}

function formatDate(date) {
    return new Date(date).toLocaleDateString(
        "pt-BR"
    );
}

function escapeHTML(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =========================================================
   ÍCONES
   ========================================================= */

function autoIcon(text) {
    const map = {
        carne: "🥩",
        bife: "🥩",
        picanha: "🥩",
        frango: "🍗",
        galinha: "🍗",
        peixe: "🐟",
        ovo: "🥚",
        arroz: "🍚",
        feijão: "🫘",
        leite: "🥛",
        pão: "🍞",
        padaria: "🍞",
        alface: "🥬",
        couve: "🥬",
        batata: "🥕",
        cenoura: "🥕",
        tomate: "🥕",
        banana: "🍎",
        maçã: "🍎",
        laranja: "🍎",
        queijo: "🧀",
        bebida: "🧃",
        refrigerante: "🧃",
        suco: "🧃",
        água: "🧃",
        sabão: "🧼",
        detergente: "🧼",
        limpeza: "🧼",
        desinfetante: "🧼",
        shampoo: "🧴",
        higiene: "🧴",
        papel: "🧻",
        higiênico: "🧻",
        guardanapo: "🧻"
    };

    const lower = text.toLowerCase();

    return (
        Object.entries(map).find(
            ([key]) => lower.includes(key)
        )?.[1] || "📦"
    );
}

function renderIcons() {
    $("iconPicker").innerHTML = ICONS.map(icon => `
        <button
            type="button"
            class="${icon === selectedIcon ? "active" : ""}"
            data-icon="${icon}">
            ${icon}
        </button>
    `).join("");
}


/* =========================================================
   CICLOS
   ========================================================= */

function cycleForDate(input) {
    const date = dateOnly(input);
    const day = state.settings.startDay;

    const start = new Date(
        date.getFullYear(),
        date.getMonth() -
            (date.getDate() < day ? 1 : 0),
        day
    );

    const end = new Date(
        start.getFullYear(),
        start.getMonth() + 1,
        day - 1
    );

    return {
        id:
            `${start.getFullYear()}-` +
            `${String(start.getMonth() + 1).padStart(2, "0")}`,

        start,
        end,

        label:
            `Referente a ${end.toLocaleDateString(
                "pt-BR",
                {
                    month: "long",
                    year: "numeric"
                }
            )}`
    };
}

function currentCycle() {
    return cycleForDate(new Date());
}

function expensesOf(cycle) {
    return state.expenses.filter(
        expense =>
            cycleForDate(expense.date).id ===
            cycle.id
    );
}

function totals(expenses) {
    return expenses.reduce(
        (result, expense) => {
            result[expense.category] +=
                Number(expense.amount);

            return result;
        },
        {
            mistura: 0,
            geral: 0
        }
    );
}

function cycles() {
    const map = new Map();
    const current = currentCycle();

    map.set(current.id, current);

    state.expenses.forEach(expense => {
        const cycle = cycleForDate(expense.date);

        map.set(cycle.id, cycle);
    });

    return [...map.values()].sort(
        (a, b) => b.start - a.start
    );
}


/* =========================================================
   NAVEGAÇÃO
   ========================================================= */

const pages = document.querySelectorAll(".page");
const navButtons =
    document.querySelectorAll(".nav-btn");

function showPage(page) {
    pages.forEach(el => {
        el.classList.toggle(
            "active",
            el.id === page
        );
    });

    navButtons.forEach(el => {
        el.classList.toggle(
            "active",
            el.dataset.page === page
        );
    });

    closeMenu();

    if (page === "history") {
        renderHistory();
    }

    if (page === "settings") {
        syncSettings();
    }
}

navButtons.forEach(button => {
    button.onclick = () =>
        showPage(button.dataset.page);
});

function openMenu() {
    $("sidebar").classList.add("open");
    $("overlay").classList.add("show");
}

function closeMenu() {
    $("sidebar").classList.remove("open");
    $("overlay").classList.remove("show");
}

$("menuBtn").onclick = openMenu;
$("overlay").onclick = closeMenu;


/* =========================================================
   DASHBOARD
   ========================================================= */

function renderDashboard() {
    const cycle = currentCycle();
    const data = totals(expensesOf(cycle));

    const budget =
        state.settings.budgets.mistura +
        state.settings.budgets.geral;

    const spent =
        data.mistura +
        data.geral;

    const balance = budget - spent;

    const percent = budget
        ? Math.min(
            100,
            spent / budget * 100
        )
        : 0;

    const days = Math.max(
        0,
        Math.ceil(
            (
                dateOnly(cycle.end) -
                dateOnly(new Date())
            ) / 86400000
        )
    );

    $("cycleName").textContent =
        cycle.label;

    $("cycleDates").textContent =
        `${formatDate(cycle.start)} → ` +
        `${formatDate(cycle.end)}`;

    $("heroTotal").textContent =
        money(spent);

    $("heroBudget").textContent =
        money(budget);

    $("heroLeft").textContent =
        money(Math.abs(balance));

    $("heroLeftLabel").textContent =
        balance >= 0
            ? "restante"
            : "acima do orçamento";

    $("heroProgress").style.width =
        `${percent}%`;

    $("heroProgress").style.background =
        balance < 0
            ? "#ef4444"
            : "";

    $("heroStatus").textContent =
        balance < 0
            ? "● Orçamento ultrapassado"
            : `● ${days} ${
                days === 1 ? "dia" : "dias"
            } até o fechamento`;

    $("donutPercent").textContent =
        `${Math.round(percent)}%`;

    $("donutFill").style.strokeDashoffset =
        440 - 440 * percent / 100;

    $("donutFill").style.stroke =
        balance < 0
            ? "#ef4444"
            : "";

    $("legendBalance").textContent =
        money(Math.abs(balance));

    $("legendSpent").textContent =
        money(spent);

    $("legendAvailable").textContent =
        money(Math.max(0, balance));

    $("misturaValue").textContent =
        money(data.mistura);

    $("geralValue").textContent =
        money(data.geral);

    setBalanceDetail(
        "misturaDetail",
        state.settings.budgets.mistura -
        data.mistura
    );

    setBalanceDetail(
        "geralDetail",
        state.settings.budgets.geral -
        data.geral
    );

    $("daysLeft").textContent =
        days;

    $("daysDetail").textContent =
        `Fechamento: ${formatDate(cycle.end)}`;
}

function setBalanceDetail(id, balance) {
    $(id).textContent =
        `${money(Math.abs(balance))} ` +
        `${balance >= 0 ? "restante" : "acima"}`;
}


/* =========================================================
   HISTÓRICO
   ========================================================= */

function renderHistory() {
    const list = cycles();
    const current = currentCycle();

    if (
        !selectedCycle ||
        !list.some(
            cycle => cycle.id === selectedCycle
        )
    ) {
        selectedCycle = current.id;
    }

    renderCycleTabs(list, current);

    const cycle = list.find(
        cycle => cycle.id === selectedCycle
    );

    const all = expensesOf(cycle);

    const query =
        $("search").value
            .trim()
            .toLowerCase();

    const filter =
        $("filter").value;

    const expenses = all
        .filter(expense =>
            (
                !query ||
                expense.desc
                    .toLowerCase()
                    .includes(query)
            ) &&
            (
                filter === "all" ||
                expense.category === filter
            )
        )
        .sort(
            (a, b) =>
                new Date(b.date) -
                new Date(a.date)
        );

    renderCycleSummary(
        cycle,
        current,
        all
    );

    renderExpenseList(
        expenses,
        all.length
    );
}

function renderCycleTabs(list, current) {
    $("cycleTabs").innerHTML =
        list.map(cycle => `
            <button
                class="${cycle.id === selectedCycle
                    ? "active"
                    : ""}"
                data-cycle="${cycle.id}">

                <strong>
                    ${
                        cycle.id === current.id
                            ? "Atual"
                            : cycle.label
                    }
                </strong>

                <small>
                    ${formatDate(cycle.start)}
                    →
                    ${formatDate(cycle.end)}
                </small>

            </button>
        `).join("");
}

$("cycleTabs").onclick = event => {
    const button =
        event.target.closest("button");

    if (!button) return;

    selectedCycle =
        button.dataset.cycle;

    renderHistory();
};

function renderCycleSummary(
    cycle,
    current,
    expenses
) {
    const total = totals(expenses);

    const balance =
        state.settings.budgets.mistura +
        state.settings.budgets.geral -
        total.mistura -
        total.geral;

    $("selectedCycleSummary").innerHTML = `
        <div class="summary">

            <div>

                <strong>
                    ${cycle.label}
                    ${
                        cycle.id === current.id
                            ? " • Em andamento"
                            : " • Fechado"
                    }
                </strong>

                <small>
                    ${expenses.length}
                    ${
                        expenses.length === 1
                            ? "compra"
                            : "compras"
                    }
                </small>

            </div>

            <div class="${
                balance >= 0
                    ? "positive"
                    : "negative"
            } balance">

                ${money(Math.abs(balance))}

                <small>
                    ${
                        balance >= 0
                            ? "saldo"
                            : "excedente"
                    }
                </small>

            </div>

        </div>
    `;

    $("footerInfo").textContent =
        cycle.id === current.id
            ? "Ciclo em andamento."
            : `Fechado em ${formatDate(cycle.end)}.`;
}

function renderExpenseList(
    expenses,
    total
) {
    if (!expenses.length) {
        $("expenseList").innerHTML = `
            <li class="empty">
                ${
                    total
                        ? "Nenhum resultado encontrado."
                        : "Nenhuma compra neste ciclo."
                }
            </li>
        `;

        return;
    }

    $("expenseList").innerHTML =
        expenses.map(expense => `
            <li class="expense">

                <div class="expense-left">

                    <div class="expense-icon">
                        ${
                            expense.icon ||
                            autoIcon(expense.desc)
                        }
                    </div>

                    <div>

                        <div class="expense-name">
                            ${escapeHTML(expense.desc)}
                        </div>

                        <div class="expense-meta">
                            ${
                                expense.category ===
                                "mistura"
                                    ? "Mistura"
                                    : "Geral"
                            }
                            •
                            ${formatDate(expense.date)}
                        </div>

                    </div>

                </div>

                <div class="expense-right">

                    <b>
                        ${money(expense.amount)}
                    </b>

                    <button
                        class="delete"
                        data-id="${expense.id}">
                        ✕
                    </button>

                </div>

            </li>
        `).join("");
}

$("expenseList").onclick = async event => {
    const button =
        event.target.closest(".delete");

    if (!button) return;

    if (
        !confirm(
            "Excluir este gasto?"
        )
    ) {
        return;
    }

    try {
        await deleteExpense(
            button.dataset.id
        );
    } catch (error) {
        console.error(error);
        toast(
            "Não foi possível excluir o gasto."
        );
    }
};


/* =========================================================
   ADICIONAR GASTO
   ========================================================= */

$("iconPicker").onclick = event => {
    const button =
        event.target.closest("button");

    if (!button) return;

    selectedIcon =
        button.dataset.icon;

    renderIcons();
};

$("expenseForm").onsubmit =
    async event => {
        event.preventDefault();

        const desc =
            $("desc").value.trim();

        const amount =
            Number($("amount").value);

        const category =
            $("category").value;

        if (
            !desc ||
            !Number.isFinite(amount) ||
            amount <= 0
        ) {
            toast(
                "Informe descrição e valor."
            );

            return;
        }

        const button =
            event.submitter;

        if (button) {
            button.disabled = true;
        }

        try {
            await addExpense({
                desc,
                amount:
                    Math.round(amount * 100) /
                    100,
                category,
                date:
                    new Date().toISOString(),
                icon:
                    selectedIcon === "📦"
                        ? autoIcon(desc)
                        : selectedIcon
            });

            $("expenseForm").reset();

            selectedIcon = "📦";

            renderIcons();
            update();

            toast(
                "Compra adicionada."
            );

        } catch (error) {
            console.error(error);

            toast(
                "Não foi possível salvar o gasto."
            );

        } finally {
            if (button) {
                button.disabled = false;
            }
        }
    };


/* =========================================================
   CONFIGURAÇÕES
   ========================================================= */

function syncSettings() {
    const {
        startDay,
        budgets
    } = state.settings;

    $("pageStartDay").value =
        startDay;

    $("pageBudgetMistura").value =
        budgets.mistura;

    $("pageBudgetGeral").value =
        budgets.geral;
}

function readSettings(
    prefix = "page"
) {
    return {
        day: Number(
            $(`${prefix}StartDay`).value
        ),

        mistura: Number(
            $(`${prefix}BudgetMistura`).value
        ),

        geral: Number(
            $(`${prefix}BudgetGeral`).value
        )
    };
}

function validateSettings(settings) {
    return (
        settings.day >= 1 &&
        settings.day <= 28 &&
        settings.mistura > 0 &&
        settings.geral > 0
    );
}

async function saveSettings() {
    const settings =
        readSettings();

    if (!validateSettings(settings)) {
        toast(
            "Informe valores válidos."
        );

        return false;
    }

    state.settings = {
        startDay: settings.day,

        budgets: {
            mistura: settings.mistura,
            geral: settings.geral
        }
    };

    selectedCycle = null;

    try {
        await saveCloudSettings();

        update();

        toast(
            "Configurações salvas."
        );

        return true;

    } catch (error) {
        console.error(error);

        toast(
            "Não foi possível salvar as configurações."
        );

        return false;
    }
}

$("savePageSettings").onclick =
    saveSettings;


/* =========================================================
   MODAL DE CICLO
   ========================================================= */

function openModal() {
    const {
        startDay,
        budgets
    } = state.settings;

    $("startDay").value =
        startDay;

    $("budgetMistura").value =
        budgets.mistura;

    $("budgetGeral").value =
        budgets.geral;

    $("modalBackdrop")
        .classList.remove("hidden");
}

function closeModal() {
    $("modalBackdrop")
        .classList.add("hidden");
}

$("cycleBtn").onclick =
    openModal;

$("cancelModal").onclick =
    closeModal;

$("saveSettings").onclick =
    async () => {

        $("pageStartDay").value =
            $("startDay").value;

        $("pageBudgetMistura").value =
            $("budgetMistura").value;

        $("pageBudgetGeral").value =
            $("budgetGeral").value;

        if (await saveSettings()) {
            closeModal();
        }
    };

$("modalBackdrop").onclick =
    event => {
        if (
            event.target ===
            $("modalBackdrop")
        ) {
            closeModal();
        }
    };


/* =========================================================
   PESQUISA / FILTRO
   ========================================================= */

$("search").oninput =
    renderHistory;

$("filter").onchange =
    renderHistory;


/* =========================================================
   LIMPAR HISTÓRICO
   ========================================================= */

$("clearBtn").onclick =
    async () => {

        if (!state.expenses.length) {
            toast(
                "Histórico já está vazio."
            );

            return;
        }

        if (
            !confirm(
                "Apagar todos os gastos deste usuário? " +
                "Esta ação não pode ser desfeita."
            )
        ) {
            return;
        }

        try {
            if (!(await ensureSession())) {
                return;
            }

            await supabaseRequest(
                `/rest/v1/expenses?user_id=eq.${encodeURIComponent(
                    session.user.id
                )}`,
                {
                    method: "DELETE"
                }
            );

            state.expenses = [];
            selectedCycle = null;

            update();

            toast(
                "Histórico apagado."
            );

        } catch (error) {
            console.error(error);

            toast(
                "Não foi possível apagar o histórico."
            );
        }
    };


/* =========================================================
   AUTENTICAÇÃO — INTERFACE
   ========================================================= */

function showAuth() {
    $("authModal")
        .classList.remove("hidden");
}

function hideAuth() {
    $("authModal")
        .classList.add("hidden");
}

$("authForm").onsubmit =
    async event => {

        event.preventDefault();

        const email =
            $("authEmail").value.trim();

        const password =
            $("authPassword").value;

        if (!email || !password) {
            toast(
                "Informe e-mail e senha."
            );

            return;
        }

        const button =
            event.submitter;

        if (button) {
            button.disabled = true;
        }

        try {

            if (authMode === "register") {
                await register(
                    email,
                    password
                );
            } else {
                await login(
                    email,
                    password
                );
            }

        } catch (error) {
            console.error(error);

            toast(
                error.message ||
                "Não foi possível autenticar."
            );

        } finally {
            if (button) {
                button.disabled = false;
            }
        }
    };

$("registerBtn").onclick =
    async () => {

        authMode = "register";

        const email =
            $("authEmail").value.trim();

        const password =
            $("authPassword").value;

        if (!email || !password) {
            toast(
                "Informe e-mail e senha para criar a conta."
            );

            return;
        }

        try {
            await register(
                email,
                password
            );
        } catch (error) {
            console.error(error);

            toast(
                error.message ||
                "Não foi possível criar a conta."
            );
        }
    };

$("forgotPasswordBtn").onclick =
    async () => {

        const email =
            $("authEmail").value.trim();

        try {
            await resetPassword(email);
        } catch (error) {
            console.error(error);

            toast(
                error.message ||
                "Não foi possível enviar a recuperação."
            );
        }
    };

$("logoutBtn").onclick =
    logout;


/* =========================================================
   ATUALIZAÇÃO DA INTERFACE
   ========================================================= */

function update() {
    renderDashboard();
    renderHistory();
    syncSettings();
}


/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

async function init() {

    $("today").textContent =
        new Date().toLocaleDateString(
            "pt-BR",
            {
                weekday: "long",
                day: "2-digit",
                month: "long"
            }
        );

    renderIcons();

    if (!(await ensureSession())) {
        return;
    }

    try {

        await loadCloudData();

        hideAuth();

        update();

    } catch (error) {

        console.error(error);

        if (
            error.message
                ?.toLowerCase()
                .includes("jwt")
        ) {
            clearSession();
            showAuth();
            return;
        }

        toast(
            "Não foi possível carregar seus dados."
        );
    }
}

init();