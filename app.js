/* SplitEase — Application Logic */
(function () {
    'use strict';
    let participants = [], expenses = [], editingId = null;

    // DOM
    const $ = id => document.getElementById(id);
    const formAddParticipant = $('formAddParticipant'), inputParticipantName = $('inputParticipantName');
    const participantsList = $('participantsList'), participantCount = $('participantCount');
    const inputExpenseTitle = $('inputExpenseTitle'), inputExpenseAmount = $('inputExpenseAmount');
    const paidByContainer = $('paidByContainer'), checkSelectAllPayers = $('checkSelectAllPayers');
    const payerAmountsContainer = $('payerAmountsContainer');
    const splitBetweenContainer = $('splitBetweenContainer'), checkSelectAll = $('checkSelectAll');
    const btnAddExpense = $('btnAddExpense'), btnCancelEdit = $('btnCancelEdit');
    const btnAddExpenseText = $('btnAddExpenseText'), btnAddExpenseIcon = $('btnAddExpenseIcon');
    const expensesTableBody = $('expensesTableBody'), emptyExpenseState = $('emptyExpenseState');
    const tableExpenses = $('tableExpenses');
    const balancesContainer = $('balancesContainer'), settlementsContainer = $('settlementsContainer');
    const selfSpendingContainer = $('selfSpendingContainer');
    const btnResetAll = $('btnResetAll'), btnConfirmReset = $('btnConfirmReset');
    const btnDownloadPdf = $('btnDownloadPdf'), toastContainer = $('toastContainer');
    const expenseFormCard = inputExpenseTitle.closest('.glass-card');

    const LS_P = 'splitease_participants', LS_E = 'splitease_expenses';

    function init() {
        loadFromStorage(); migrateOldExpenses();
        renderParticipants(); renderPaidByContainer(); renderSplitBetween();
        renderExpensesTable(); recalculate(); updateBtnState(); bindEvents();
    }
    function migrateOldExpenses() {
        let c = false;
        expenses = expenses.map(e => {
            if (typeof e.paidBy === 'string') { c = true; return { ...e, paidBy: [{ name: e.paidBy, amount: e.amount }] }; }
            return e;
        });
        if (c) save();
    }
    function save() { localStorage.setItem(LS_P, JSON.stringify(participants)); localStorage.setItem(LS_E, JSON.stringify(expenses)); }
    function loadFromStorage() {
        try { const p = localStorage.getItem(LS_P), e = localStorage.getItem(LS_E);
            if (p) participants = JSON.parse(p); if (e) expenses = JSON.parse(e);
        } catch { participants = []; expenses = []; }
    }
    function bindEvents() {
        formAddParticipant.addEventListener('submit', handleAddParticipant);
        btnAddExpense.addEventListener('click', handleAddExpense);
        checkSelectAll.addEventListener('change', () => { document.querySelectorAll('.split-check').forEach(c => c.checked = checkSelectAll.checked); });
        checkSelectAllPayers.addEventListener('change', () => { document.querySelectorAll('.payer-check').forEach(c => c.checked = checkSelectAllPayers.checked); renderPayerAmounts(); });
        inputExpenseAmount.addEventListener('input', redistributePayerAmounts);
        btnCancelEdit.addEventListener('click', cancelEdit);
        btnResetAll.addEventListener('click', () => new bootstrap.Modal($('resetModal')).show());
        btnConfirmReset.addEventListener('click', handleReset);
        btnDownloadPdf.addEventListener('click', downloadPdf);
    }
    function updateBtnState() { btnAddExpense.disabled = participants.length < 2; }
    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function toast(msg, type) {
        const icons = { success:'bi-check-circle-fill text-success', warning:'bi-exclamation-triangle-fill text-warning', info:'bi-info-circle-fill text-info' };
        const el = document.createElement('div'); el.className = 'toast custom-toast'; el.setAttribute('role','alert');
        el.innerHTML = `<div class="toast-body d-flex align-items-center gap-2"><i class="bi ${icons[type]||icons.info}"></i><span>${esc(msg)}</span></div>`;
        toastContainer.appendChild(el);
        const t = new bootstrap.Toast(el, { delay: 3000 }); t.show();
        el.addEventListener('hidden.bs.toast', () => el.remove());
    }

    // Participants
    function handleAddParticipant(e) {
        e.preventDefault(); const name = inputParticipantName.value.trim();
        if (!name) return;
        if (participants.some(p => p.toLowerCase() === name.toLowerCase())) { toast(`"${name}" already added!`, 'warning'); return; }
        participants.push(name); inputParticipantName.value = ''; inputParticipantName.focus();
        save(); renderParticipants(); renderPaidByContainer(); renderSplitBetween(); updateBtnState(); toast(`${name} added!`, 'success');
    }
    function removeParticipant(name) {
        if (expenses.some(e => e.paidBy.some(p => p.name === name) || e.splitBetween.includes(name))) {
            toast(`Can't remove "${name}" — part of an expense.`, 'warning'); return;
        }
        participants = participants.filter(p => p !== name);
        save(); renderParticipants(); renderPaidByContainer(); renderSplitBetween(); updateBtnState();
    }
    function renderParticipants() {
        participantsList.innerHTML = '';
        participants.forEach(name => {
            const chip = document.createElement('span'); chip.className = 'participant-chip';
            chip.innerHTML = `<span>${esc(name)}</span><button type="button" class="chip-remove" title="Remove">&times;</button>`;
            chip.querySelector('.chip-remove').addEventListener('click', () => removeParticipant(name));
            participantsList.appendChild(chip);
        });
        participantCount.textContent = participants.length ? `${participants.length} participant${participants.length > 1 ? 's' : ''}` : 'No participants added yet.';
    }

    // Paid By
    function renderPaidByContainer() {
        paidByContainer.innerHTML = '';
        if (!participants.length) { paidByContainer.innerHTML = '<p class="text-muted small mb-0 p-1">Add participants first</p>'; checkSelectAllPayers.checked = false; payerAmountsContainer.innerHTML = ''; return; }
        participants.forEach(name => {
            const id = 'payer_' + name.replace(/\s+/g, '_'), div = document.createElement('div'); div.className = 'form-check';
            div.innerHTML = `<input class="form-check-input payer-check" type="checkbox" value="${esc(name)}" id="${id}"><label class="form-check-label" for="${id}">${esc(name)}</label>`;
            paidByContainer.appendChild(div);
        });
        document.querySelectorAll('.payer-check').forEach(cb => cb.addEventListener('change', () => { syncAllPayers(); renderPayerAmounts(); }));
        payerAmountsContainer.innerHTML = '';
    }
    function syncAllPayers() { const all = document.querySelectorAll('.payer-check'); checkSelectAllPayers.checked = [...all].every(c => c.checked); }
    function getSelectedPayers() { return [...document.querySelectorAll('.payer-check:checked')].map(c => c.value); }

    function renderPayerAmounts() {
        const sel = getSelectedPayers(); payerAmountsContainer.innerHTML = '';
        if (!sel.length) return;
        const total = parseFloat(inputExpenseAmount.value) || 0;
        if (sel.length === 1) { payerAmountsContainer.innerHTML = `<p class="text-muted small mb-0 mt-1"><i class="bi bi-info-circle me-1"></i>${esc(sel[0])} pays the full amount.</p>`; return; }
        const share = total > 0 ? total / sel.length : 0;
        sel.forEach(name => {
            const row = document.createElement('div'); row.className = 'payer-amount-row';
            row.innerHTML = `<span class="payer-name">${esc(name)}</span><span class="text-muted small">Rs.</span><input type="number" class="payer-amount-input" data-payer="${esc(name)}" value="${share > 0 ? share.toFixed(2) : ''}" placeholder="0.00" min="0" step="0.01">`;
            payerAmountsContainer.appendChild(row);
        });
        updatePayerTotal();
        document.querySelectorAll('.payer-amount-input').forEach(i => i.addEventListener('input', updatePayerTotal));
    }
    function redistributePayerAmounts() {
        const sel = getSelectedPayers(); if (sel.length <= 1) return;
        const total = parseFloat(inputExpenseAmount.value) || 0, share = total > 0 ? total / sel.length : 0;
        document.querySelectorAll('.payer-amount-input').forEach(i => i.value = share > 0 ? share.toFixed(2) : '');
        updatePayerTotal();
    }
    function updatePayerTotal() {
        const ex = payerAmountsContainer.querySelector('.payer-amounts-total'); if (ex) ex.remove();
        const inputs = document.querySelectorAll('.payer-amount-input'); if (!inputs.length) return;
        const tp = [...inputs].reduce((s, i) => s + (parseFloat(i.value) || 0), 0), et = parseFloat(inputExpenseAmount.value) || 0;
        const ok = Math.abs(tp - et) < 0.02, ind = document.createElement('div');
        ind.className = `payer-amounts-total ${ok ? 'match' : 'mismatch'}`;
        ind.innerHTML = `<i class="bi bi-${ok ? 'check-circle' : 'exclamation-circle'} me-1"></i>Payer total: Rs. ${tp.toFixed(2)} / Rs. ${et.toFixed(2)}`;
        payerAmountsContainer.appendChild(ind);
    }

    // Split Between
    function renderSplitBetween() {
        splitBetweenContainer.innerHTML = '';
        if (!participants.length) { splitBetweenContainer.innerHTML = '<p class="text-muted small mb-0 p-1">Add participants first</p>'; checkSelectAll.checked = false; return; }
        participants.forEach(name => {
            const id = 'split_' + name.replace(/\s+/g, '_'), div = document.createElement('div'); div.className = 'form-check';
            div.innerHTML = `<input class="form-check-input split-check" type="checkbox" value="${esc(name)}" id="${id}"><label class="form-check-label" for="${id}">${esc(name)}</label>`;
            splitBetweenContainer.appendChild(div);
        });
        document.querySelectorAll('.split-check').forEach(cb => cb.addEventListener('change', () => { const all = document.querySelectorAll('.split-check'); checkSelectAll.checked = [...all].every(c => c.checked); }));
    }

    // Add / Update Expense
    function handleAddExpense() {
        const title = inputExpenseTitle.value.trim(), amount = parseFloat(inputExpenseAmount.value);
        const selPayers = getSelectedPayers(), splitBetween = [...document.querySelectorAll('.split-check:checked')].map(c => c.value);
        if (!title || isNaN(amount) || amount <= 0) { toast('Please fill in all fields correctly.', 'warning'); return; }
        if (!selPayers.length) { toast('Select at least one payer.', 'warning'); return; }
        if (splitBetween.length < 2) { toast('Select at least 2 people to split between.', 'warning'); return; }
        let paidBy;
        if (selPayers.length === 1) { paidBy = [{ name: selPayers[0], amount }]; }
        else {
            paidBy = []; let tp = 0;
            document.querySelectorAll('.payer-amount-input').forEach(i => { const n = i.getAttribute('data-payer'), a = parseFloat(i.value) || 0; if (a > 0) { paidBy.push({ name: n, amount: a }); tp += a; } });
            if (!paidBy.length) { toast('Enter payment amounts for each payer.', 'warning'); return; }
            if (Math.abs(tp - amount) > 0.50) { toast(`Payer total (Rs. ${tp.toFixed(2)}) doesn't match amount (Rs. ${amount.toFixed(2)}).`, 'warning'); return; }
        }
        if (editingId !== null) {
            const idx = expenses.findIndex(e => e.id === editingId);
            if (idx !== -1) expenses[idx] = { id: editingId, title, amount, paidBy, splitBetween };
            exitEditMode(); toast(`Expense "${title}" updated!`, 'success');
        } else {
            expenses.push({ id: Date.now(), title, amount, paidBy, splitBetween });
            toast(`Expense "${title}" added!`, 'success');
        }
        resetForm(); save(); renderExpensesTable(); recalculate();
    }
    function resetForm() {
        inputExpenseTitle.value = ''; inputExpenseAmount.value = '';
        document.querySelectorAll('.payer-check').forEach(c => c.checked = false); checkSelectAllPayers.checked = false; payerAmountsContainer.innerHTML = '';
        document.querySelectorAll('.split-check').forEach(c => c.checked = false); checkSelectAll.checked = false;
    }

    // Edit
    function editExpense(id) {
        const exp = expenses.find(e => e.id === id); if (!exp) return;
        editingId = id;
        inputExpenseTitle.value = exp.title; inputExpenseAmount.value = exp.amount;
        // Set payers
        document.querySelectorAll('.payer-check').forEach(cb => { cb.checked = exp.paidBy.some(p => p.name === cb.value); });
        syncAllPayers(); renderPayerAmounts();
        // Set custom payer amounts
        if (exp.paidBy.length > 1) {
            exp.paidBy.forEach(p => { const inp = document.querySelector(`.payer-amount-input[data-payer="${p.name}"]`); if (inp) inp.value = p.amount.toFixed(2); });
            updatePayerTotal();
        }
        // Set split
        document.querySelectorAll('.split-check').forEach(cb => { cb.checked = exp.splitBetween.includes(cb.value); });
        const allSplit = document.querySelectorAll('.split-check'); checkSelectAll.checked = [...allSplit].every(c => c.checked);
        // UI
        btnAddExpenseText.textContent = 'Update Expense'; btnAddExpenseIcon.className = 'bi bi-pencil-square me-1';
        btnCancelEdit.classList.remove('d-none'); expenseFormCard.classList.add('edit-mode');
        expenseFormCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function cancelEdit() { editingId = null; resetForm(); exitEditMode(); }
    function exitEditMode() {
        editingId = null;
        btnAddExpenseText.textContent = 'Add Expense'; btnAddExpenseIcon.className = 'bi bi-plus-circle me-1';
        btnCancelEdit.classList.add('d-none'); expenseFormCard.classList.remove('edit-mode');
    }
    function deleteExpense(id) { expenses = expenses.filter(e => e.id !== id); if (editingId === id) cancelEdit(); save(); renderExpensesTable(); recalculate(); toast('Expense deleted.', 'info'); }

    // Render Table
    function renderExpensesTable() {
        expensesTableBody.innerHTML = '';
        if (!expenses.length) { tableExpenses.classList.add('d-none'); emptyExpenseState.classList.remove('d-none'); return; }
        tableExpenses.classList.remove('d-none'); emptyExpenseState.classList.add('d-none');
        expenses.forEach((exp, idx) => {
            const tr = document.createElement('tr');
            const pbHtml = exp.paidBy.map(p => exp.paidBy.length === 1 ? `<span class="split-badge payer-badge">${esc(p.name)}</span>` : `<span class="split-badge payer-badge">${esc(p.name)} <small class="text-accent">(Rs.${p.amount.toFixed(0)})</small></span>`).join('');
            tr.innerHTML = `<td>${idx+1}</td><td class="fw-semibold">${esc(exp.title)}</td><td class="text-accent fw-bold">Rs. ${exp.amount.toFixed(2)}</td><td><div class="split-badges">${pbHtml}</div></td><td><div class="split-badges">${exp.splitBetween.map(n=>`<span class="split-badge">${esc(n)}</span>`).join('')}</div></td><td><div class="action-btns"><button class="btn btn-sm btn-outline-secondary rounded-pill btn-edit" title="Edit"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger rounded-pill btn-delete" title="Delete"><i class="bi bi-trash3"></i></button></div></td>`;
            tr.querySelector('.btn-edit').addEventListener('click', () => editExpense(exp.id));
            tr.querySelector('.btn-delete').addEventListener('click', () => deleteExpense(exp.id));
            expensesTableBody.appendChild(tr);
        });
    }

    // Calculations
    function recalculate() {
        if (!expenses.length) {
            balancesContainer.innerHTML = '<div class="empty-state small-empty"><i class="bi bi-piggy-bank"></i><p>Add expenses to see balances.</p></div>';
            settlementsContainer.innerHTML = '<div class="empty-state small-empty"><i class="bi bi-check-circle"></i><p>No settlements needed yet.</p></div>';
            selfSpendingContainer.innerHTML = '<div class="empty-state small-empty"><i class="bi bi-person-lines-fill"></i><p>Add expenses to see personal spending.</p></div>';
            return;
        }
        const balances = {}, selfSpend = {};
        participants.forEach(p => { balances[p] = 0; selfSpend[p] = 0; });
        expenses.forEach(exp => {
            const share = exp.amount / exp.splitBetween.length;
            exp.paidBy.forEach(p => { if (balances[p.name] === undefined) balances[p.name] = 0; balances[p.name] += p.amount; });
            exp.splitBetween.forEach(person => { if (balances[person] === undefined) balances[person] = 0; balances[person] -= share; if (selfSpend[person] === undefined) selfSpend[person] = 0; selfSpend[person] += share; });
        });
        renderBalances(balances); renderSettlements(balances); renderSelfSpending(selfSpend);
    }
    function renderBalances(balances) {
        balancesContainer.innerHTML = '';
        Object.entries(balances).sort((a, b) => b[1] - a[1]).forEach(([name, amt]) => {
            const div = document.createElement('div'); div.className = 'balance-item';
            const cls = amt >= 0 ? 'balance-positive' : 'balance-negative', sign = amt >= 0 ? '+' : '';
            div.innerHTML = `<span class="name">${esc(name)}</span><span class="${cls} fw-bold">${sign}Rs. ${amt.toFixed(2)}</span>`;
            balancesContainer.appendChild(div);
        });
    }
    function renderSettlements(balances) {
        settlementsContainer.innerHTML = '';
        const debtors = [], creditors = [];
        Object.entries(balances).forEach(([n, a]) => { if (a < -0.01) debtors.push({ name: n, amount: Math.abs(a) }); else if (a > 0.01) creditors.push({ name: n, amount: a }); });
        debtors.sort((a, b) => b.amount - a.amount); creditors.sort((a, b) => b.amount - a.amount);
        const txns = []; let i = 0, j = 0;
        while (i < debtors.length && j < creditors.length) {
            const s = Math.min(debtors[i].amount, creditors[j].amount);
            if (s > 0.01) txns.push({ from: debtors[i].name, to: creditors[j].name, amount: s });
            debtors[i].amount -= s; creditors[j].amount -= s;
            if (debtors[i].amount < 0.01) i++; if (creditors[j].amount < 0.01) j++;
        }
        if (!txns.length) { settlementsContainer.innerHTML = '<div class="empty-state small-empty"><i class="bi bi-check-circle text-success"></i><p>All settled up! 🎉</p></div>'; return; }
        txns.forEach(t => {
            const card = document.createElement('div'); card.className = 'settlement-card';
            card.innerHTML = `<span class="person">${esc(t.from)}</span><span class="arrow"><i class="bi bi-arrow-right"></i></span><span class="person">${esc(t.to)}</span><span class="amount">Rs. ${t.amount.toFixed(2)}</span>`;
            settlementsContainer.appendChild(card);
        });
    }
    function renderSelfSpending(selfSpend) {
        selfSpendingContainer.innerHTML = '';
        const entries = Object.entries(selfSpend).sort((a, b) => b[1] - a[1]);
        const max = Math.max(...entries.map(e => e[1]), 1);
        entries.forEach(([name, amt]) => {
            const pct = (amt / max * 100).toFixed(1);
            const div = document.createElement('div'); div.className = 'self-spending-item';
            div.innerHTML = `<div style="flex:1"><div class="d-flex justify-content-between"><span class="name">${esc(name)}</span><span class="spending-amount">Rs. ${amt.toFixed(2)}</span></div><div class="self-spending-bar" style="width:${pct}%"></div></div>`;
            selfSpendingContainer.appendChild(div);
        });
    }

    // Reset
    function handleReset() {
        participants = []; expenses = []; editingId = null;
        localStorage.removeItem(LS_P); localStorage.removeItem(LS_E);
        renderParticipants(); renderPaidByContainer(); renderSplitBetween();
        renderExpensesTable(); recalculate(); updateBtnState(); exitEditMode();
        bootstrap.Modal.getInstance($('resetModal')).hide(); toast('All data has been reset.', 'info');
    }

    // PDF Download
    function downloadPdf() {
        if (!expenses.length) { toast('No expenses to download.', 'warning'); return; }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pw = doc.internal.pageSize.getWidth();
        let y = 15;

        // Title
        doc.setFontSize(22); doc.setFont('helvetica', 'bold');
        doc.text('SplitEase — Expense Report', pw / 2, y, { align: 'center' }); y += 10;
        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        doc.text(`Generated: ${new Date().toLocaleString()}`, pw / 2, y, { align: 'center' }); y += 10;

        // Expense Log Table
        doc.setFontSize(14); doc.setFont('helvetica', 'bold');
        doc.text('Expense Log', 14, y); y += 2;
        const tableData = expenses.map((e, i) => [i + 1, e.title, `Rs. ${e.amount.toFixed(2)}`, e.paidBy.map(p => p.name).join(', '), e.splitBetween.join(', ')]);
        doc.autoTable({ startY: y, head: [['#', 'Title', 'Amount', 'Paid By', 'Split Between']], body: tableData,
            theme: 'grid', headStyles: { fillColor: [124, 92, 252] }, styles: { fontSize: 9 } });
        y = doc.lastAutoTable.finalY + 10;

        // Total
        const total = expenses.reduce((s, e) => s + e.amount, 0);
        doc.setFontSize(11); doc.setFont('helvetica', 'bold');
        doc.text(`Total Expenses: Rs. ${total.toFixed(2)}`, 14, y); y += 10;

        // Balances
        const balances = {}, selfSpend = {};
        participants.forEach(p => { balances[p] = 0; selfSpend[p] = 0; });
        expenses.forEach(exp => {
            const share = exp.amount / exp.splitBetween.length;
            exp.paidBy.forEach(p => { if (balances[p.name] === undefined) balances[p.name] = 0; balances[p.name] += p.amount; });
            exp.splitBetween.forEach(person => { if (balances[person] === undefined) balances[person] = 0; balances[person] -= share; if (selfSpend[person] === undefined) selfSpend[person] = 0; selfSpend[person] += share; });
        });

        if (y > 250) { doc.addPage(); y = 15; }
        doc.setFontSize(14); doc.setFont('helvetica', 'bold');
        doc.text('Individual Balances', 14, y); y += 2;
        const balData = Object.entries(balances).sort((a, b) => b[1] - a[1]).map(([n, a]) => [n, `${a >= 0 ? '+' : ''}Rs. ${a.toFixed(2)}`]);
        doc.autoTable({ startY: y, head: [['Name', 'Balance']], body: balData, theme: 'grid', headStyles: { fillColor: [124, 92, 252] }, styles: { fontSize: 9 } });
        y = doc.lastAutoTable.finalY + 10;

        // Settlements
        const debtors = [], creditors = [];
        Object.entries(balances).forEach(([n, a]) => { if (a < -0.01) debtors.push({ name: n, amount: Math.abs(a) }); else if (a > 0.01) creditors.push({ name: n, amount: a }); });
        debtors.sort((a, b) => b.amount - a.amount); creditors.sort((a, b) => b.amount - a.amount);
        const txns = []; let si = 0, sj = 0;
        while (si < debtors.length && sj < creditors.length) {
            const s = Math.min(debtors[si].amount, creditors[sj].amount);
            if (s > 0.01) txns.push({ from: debtors[si].name, to: creditors[sj].name, amount: s });
            debtors[si].amount -= s; creditors[sj].amount -= s;
            if (debtors[si].amount < 0.01) si++; if (creditors[sj].amount < 0.01) sj++;
        }
        if (y > 250) { doc.addPage(); y = 15; }
        doc.setFontSize(14); doc.setFont('helvetica', 'bold');
        doc.text('Simplified Transactions', 14, y); y += 2;
        if (txns.length) {
            const txnData = txns.map(t => [t.from, '→', t.to, `Rs. ${t.amount.toFixed(2)}`]);
            doc.autoTable({ startY: y, head: [['From', '', 'To', 'Amount']], body: txnData, theme: 'grid', headStyles: { fillColor: [124, 92, 252] }, styles: { fontSize: 9 } });
            y = doc.lastAutoTable.finalY + 10;
        } else { doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text('All settled up!', 14, y + 5); y += 15; }

        // Self Spending
        if (y > 250) { doc.addPage(); y = 15; }
        doc.setFontSize(14); doc.setFont('helvetica', 'bold');
        doc.text('Personal Spending', 14, y); y += 2;
        const ssData = Object.entries(selfSpend).sort((a, b) => b[1] - a[1]).map(([n, a]) => [n, `Rs. ${a.toFixed(2)}`]);
        doc.autoTable({ startY: y, head: [['Name', 'Amount Consumed']], body: ssData, theme: 'grid', headStyles: { fillColor: [124, 92, 252] }, styles: { fontSize: 9 } });

        doc.save('SplitEase_Report.pdf');
        toast('PDF downloaded!', 'success');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
