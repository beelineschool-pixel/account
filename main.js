document.addEventListener('DOMContentLoaded', () => {
    
    // --- DATABASE (LocalStorage) ---
    const db = {
        get: (key) => JSON.parse(localStorage.getItem(key)) || [],
        set: (key, data) => localStorage.setItem(key, JSON.stringify(data)),
        
        // Data Models
        students: () => db.get('students'),
        feeTypes: () => db.get('feeTypes'),
        payments: () => db.get('payments'),
        expenses: () => db.get('expenses'),
        routes: () => db.get('routes'),
        vehicleAssignments: () => db.get('vehicleAssignments'),
        vehicleLedger: () => db.get('vehicleLedger'),
        classes: () => db.get('classes'), // [REQ 1] New
        
        // School Info helper
        schoolInfo: () => db.get('schoolInfo')[0] || {},
        setSchoolInfo: (data) => db.set('schoolInfo', [data]),
        
        // Get next ID
        getNextId: (key) => {
            const data = db.get(key);
            return data.length > 0 ? Math.max(...data.map(item => item.id)) + 1 : 1;
        },
        findById: (key, id) => db.get(key).find(item => item.id === parseInt(id)),
    };

    // --- STATE ---
    let incomeExpenseChart = null; 
    const academicYear = '2025-2026'; 
    const academicMonths = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    let allFeeEntriesCache = []; // Cache for fee entries

    // --- UTILITY FUNCTIONS ---
    const formatCurrency = (amount) => `₹${Number(amount || 0).toFixed(2)}`;
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };
    // [REQ 1] getClasses now uses the database
    const getClasses = () => {
        const classes = db.classes();
        if (classes.length === 0) {
            // Default classes if none are set
            const defaultClasses = ['LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5'];
            db.set('classes', defaultClasses);
            return defaultClasses;
        }
        return classes.sort();
    };

    // --- NAVIGATION ---
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');
    const pageTitle = document.getElementById('page-title');
    const showPage = (pageId) => {
        pages.forEach(page => page.classList.add('hidden'));
        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.classList.remove('hidden');
            targetPage.classList.add('active');
        }
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${pageId}`) {
                link.classList.add('active');
            }
        });
        pageTitle.textContent = pageId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        switch(pageId) {
            case 'dashboard': renderDashboard(); break;
            case 'students': renderStudentList(); break;
            case 'fee-management': renderFeeManagement(); break;
            case 'student-fee': renderStudentFeeTable(); break;
            case 'vehicle': renderVehicleFeeTable(); break;
            case 'payments': renderPaymentsTable(); break;
            case 'invoice': renderInvoiceList(); break;
            case 'expenses': renderExpenseList(); break;
            case 'reports': renderReports(); break;
            case 'about': renderAboutPage(); break; 
        }
    };
    document.querySelector('nav').addEventListener('click', (e) => {
        const link = e.target.closest('.nav-link');
        if (link) {
            e.preventDefault();
            const pageId = link.getAttribute('href').substring(1);
            showPage(pageId);
            document.getElementById('sidebar').classList.remove('active');
        }
    });
    document.getElementById('menu-toggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('active');
    });

    // --- MODAL HANDLING ---
    const openModal = (modalId) => {
        document.getElementById(modalId).classList.remove('hidden');
    };
    const closeModal = (modalId) => {
        document.getElementById(modalId).classList.add('hidden');
    };
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal-overlay');
            if (modal) {
                modal.classList.add('hidden');
            }
        });
    });

    // --- DATE PICKER INITIALIZATION ---
    flatpickr(".date-picker", { dateFormat: "Y-m-d", allowInput: true });
    
    // --- CORE DATA COMPUTATION ---
    
    // getAllFeeEntries (Caches the result)
    const getAllFeeEntries = (forceRefresh = false) => {
        if (!forceRefresh && allFeeEntriesCache.length > 0) {
            return allFeeEntriesCache;
        }

        const students = db.students();
        const feeTypes = db.feeTypes();
        const payments = db.payments();
        const assignments = db.vehicleAssignments();
        let allEntries = [];
        // 1. Process standard fee types
        students.forEach(student => {
            feeTypes.forEach(feeType => {
                if (feeType.section === 'All' || feeType.section === student.class) {
                    const entryId = `${student.id}-${feeType.id}`;
                    const relevantPayments = payments.filter(p => p.feeEntryId === entryId);
                    const totalPaid = relevantPayments.reduce((sum, p) => sum + p.amount, 0);
                    const totalDue = feeType.amount;
                    const balance = totalDue - totalPaid;
                    let status = (totalPaid === 0) ? 'Pending' : (balance > 0 ? 'Partial' : 'Paid');
                    allEntries.push({
                        id: entryId, studentId: student.id, studentName: student.name, studentClass: student.class,
                        studentParentName: student.parentName, studentWhatsApp: student.whatsapp, studentAdmNo: student.admNo,
                        feeTypeId: feeType.id, feeTypeName: feeType.name, dueDate: feeType.dueDate, totalDue: totalDue,
                        totalPaid: totalPaid, balance: balance, status: status, isVehicleFee: false
                    });
                }
            });
        });
        // 2. Process vehicle fees
        assignments.forEach(assign => {
            const student = students.find(s => s.id === assign.studentId);
            if (!student) return; 
            academicMonths.forEach((month, index) => {
                const monthData = assign.monthlyFees[month];
                if (monthData.fee > 0) {
                    const entryId = `v-${assign.id}-${month}`;
                    const totalDue = monthData.fee;
                    const relevantPayments = payments.filter(p => p.feeEntryId === entryId);
                    const totalPaid = relevantPayments.reduce((sum, p) => sum + p.amount, 0);
                    const balance = totalDue - totalPaid;
                    let status = (totalPaid === 0) ? 'Pending' : (balance > 0 ? 'Partial' : 'Paid');
                    const monthIndex = (index + 5) % 12;
                    const year = (monthIndex >= 0 && monthIndex <= 4) ? 2026 : 2025;
                    const dueDate = new Date(year, monthIndex, 10).toISOString().split('T')[0];
                    allEntries.push({
                        id: entryId, studentId: student.id, studentName: student.name, studentClass: student.class,
                        studentParentName: student.parentName, studentWhatsApp: student.whatsapp, studentAdmNo: student.admNo,
                        feeTypeId: null, feeTypeName: `Vehicle Fee - ${month}`, dueDate: dueDate, totalDue: totalDue,
                        totalPaid: totalPaid, balance: balance, status: status, isVehicleFee: true
                    });
                }
            });
        });
        
        allFeeEntriesCache = allEntries;
        return allEntries;
    };
    
    // getStudentFeeSummary (Unchanged)
    const getStudentFeeSummary = (studentId) => {
        const allEntries = getAllFeeEntries().filter(e => !e.isVehicleFee);
        const studentEntries = allEntries.filter(e => e.studentId === studentId);
        const summary = { totalDue: 0, totalPaid: 0, balance: 0, fees: {} };
        const feeTypes = db.feeTypes();
        const uniqueFeeNames = [...new Set(feeTypes.map(ft => ft.name))];
        uniqueFeeNames.forEach(name => { summary.fees[name] = 0; });
        studentEntries.forEach(entry => {
            if (entry.feeTypeName in summary.fees) {
                summary.fees[entry.feeTypeName] += entry.totalDue;
            } else {
                summary.fees[entry.feeTypeName] = entry.totalDue;
            }
            summary.totalDue += entry.totalDue;
            summary.totalPaid += entry.totalPaid;
        });
        summary.balance = summary.totalDue - summary.totalPaid;
        return summary;
    };

    // --- DASHBOARD (Unchanged) ---
    const renderDashboard = () => {
        const allFeeEntries = getAllFeeEntries(true); // Force refresh on dashboard load
        const expenses = db.expenses();
        const payments = db.payments(); 

        const totalIncome = allFeeEntries.reduce((sum, entry) => sum + entry.totalPaid, 0);
        document.getElementById('dash-total-income').textContent = formatCurrency(totalIncome);

        const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        document.getElementById('dash-total-expenses').textContent = formatCurrency(totalExpenses);

        const totalCashIncome = payments.filter(p => p.method === 'Cash').reduce((sum, p) => sum + p.amount, 0);
        const totalCashExpense = expenses.filter(e => e.payMode === 'Cash').reduce((sum, e) => sum + e.amount, 0);
        const balanceCash = totalCashIncome - totalCashExpense;
        document.getElementById('dash-balance-cash').textContent = formatCurrency(balanceCash);
        
        const totalBankIncome = payments.filter(p => p.method === 'Online' || p.method === 'Card').reduce((sum, p) => sum + p.amount, 0);
        const totalBankExpense = expenses.filter(e => e.payMode === 'Online' || e.payMode === 'Card').reduce((sum, e) => sum + e.amount, 0);
        const balanceBank = totalBankIncome - totalBankExpense;
        document.getElementById('dash-balance-bank').textContent = formatCurrency(balanceBank);
        
        const recentPayments = payments.filter(p => !p.lineItems).slice().reverse().slice(0, 5); // Exclude grouped payments
        const recentPaymentsBody = document.getElementById('dash-recent-payments-table');
        if (recentPayments.length === 0) {
            recentPaymentsBody.innerHTML = `<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">No recent payments.</td></tr>`;
        } else {
            recentPaymentsBody.innerHTML = recentPayments.map(p => {
                const student = db.findById('students', p.studentId);
                return `
                    <tr>
                        <td class="px-6 py-4 whitespace-nowrap">${p.invoiceId}</td>
                        <td class="px-6 py-4 whitespace-nowrap">${student ? student.name : 'N/A'}</td>
                        <td class="px-6 py-4 whitespace-nowrap">${formatCurrency(p.amount)}</td>
                        <td class="px-6 py-4 whitespace-nowrap">${formatDate(p.date)}</td>
                    </tr>
                `;
            }).join('');
        }
        
        const duePayments = allFeeEntries.filter(e => e.balance > 0 && new Date(e.dueDate) <= new Date());
        const duePaymentsList = document.getElementById('dash-due-payments-list');
        if (duePayments.length === 0) {
            duePaymentsList.innerHTML = `<p class="text-gray-500">No due payments found.</p>`;
        } else {
            duePaymentsList.innerHTML = duePayments.slice(0, 5).map(due => `
                <div class="flex justify-between items-center">
                    <div>
                        <p class="font-semibold">${due.studentName}</p>
                        <p class="text-sm text-gray-500">${due.feeTypeName} (Due: ${formatDate(due.dueDate)})</p>
                    </div>
                    <p class="font-semibold text-red-600">${formatCurrency(due.balance)}</p>
                </div>
            `).join('');
        }
        
        renderIncomeExpenseChart();
    };
    const renderIncomeExpenseChart = () => {
        const payments = db.payments();
        const expenses = db.expenses();
        const labels = [];
        const incomeData = [];
        const expenseData = [];
        
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateString = date.toISOString().split('T')[0];
            labels.push(date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }));
            
            const dailyIncome = payments.filter(p => p.date === dateString).reduce((sum, p) => sum + p.amount, 0);
            const dailyExpense = expenses.filter(e => e.date === dateString).reduce((sum, e) => sum + e.amount, 0);
            
            incomeData.push(dailyIncome);
            expenseData.push(dailyExpense);
        }
        
        const ctx = document.getElementById('incomeExpenseChart').getContext('2d');
        if (incomeExpenseChart) {
            incomeExpenseChart.destroy();
        }
        incomeExpenseChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Income',
                        data: incomeData,
                        borderColor: 'rgba(54, 162, 235, 1)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        fill: true,
                        tension: 0.1
                    },
                    {
                        label: 'Expense',
                        data: expenseData,
                        borderColor: 'rgba(255, 99, 132, 1)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        fill: true,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    };

    // --- STUDENTS ---
    const renderStudentList = () => {
        const students = db.students();
        const tbody = document.getElementById('student-list-table');
        if (students.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No students found. Add one to get started.</td></tr>`;
            return;
        }
        tbody.innerHTML = students.map(student => `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap">${student.admNo}</td>
                <td class="px-6 py-4 whitespace-nowrap font-medium text-gray-900">${student.name}</td>
                <td class="px-6 py-4 whitespace-nowrap">${student.class}</td>
                <td class="px-6 py-4 whitespace-nowrap">${student.parentName}</td>
                <td class="px-6 py-4 whitespace-nowrap">${student.whatsapp}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button class="text-blue-600 hover:text-blue-900 mr-3" data-id="${student.id}" data-action="edit-student"><i class="fas fa-edit"></i> Edit</button>
                    <button class="text-red-600 hover:text-red-900" data-id="${student.id}" data-action="delete-student"><i class="fas fa-trash"></i> Delete</button>
                </td>
            </tr>
        `).join('');
    };
    document.getElementById('add-student-btn').addEventListener('click', () => {
        document.getElementById('student-form').reset();
        document.getElementById('student-id').value = '';
        document.getElementById('student-modal-title').textContent = 'Add New Student';
        updateClassFilters(); // Make sure dropdown is populated
        openModal('student-modal');
    });
    document.getElementById('student-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const studentId = document.getElementById('student-id').value;
        const students = db.students();
        const studentData = {
            id: studentId ? parseInt(studentId) : db.getNextId('students'),
            name: document.getElementById('student-name').value,
            admNo: document.getElementById('student-adm-no').value,
            class: document.getElementById('student-class').value,
            parentName: document.getElementById('student-parent-name').value,
            whatsapp: document.getElementById('student-whatsapp').value,
            contact: document.getElementById('student-contact').value,
        };
        if (studentId) {
            const index = students.findIndex(s => s.id === studentData.id);
            students[index] = studentData;
        } else {
            students.push(studentData);
        }
        db.set('students', students);
        allFeeEntriesCache = []; // Clear cache
        renderStudentList();
        updateClassFilters();
        closeModal('student-modal');
    });
    document.getElementById('student-list-table').addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const id = target.dataset.id;
        const action = target.dataset.action;
        if (action === 'edit-student') {
            const student = db.findById('students', id);
            document.getElementById('student-modal-title').textContent = 'Edit Student';
            document.getElementById('student-id').value = student.id;
            document.getElementById('student-name').value = student.name;
            document.getElementById('student-adm-no').value = student.admNo;
            document.getElementById('student-parent-name').value = student.parentName;
            document.getElementById('student-whatsapp').value = student.whatsapp;
            document.getElementById('student-contact').value = student.contact;
            
            updateClassFilters(); // Populate dropdown
            document.getElementById('student-class').value = student.class; // Set correct class
            
            openModal('student-modal');
        }
        if (action === 'delete-student') {
            if (confirm(`Are you sure you want to delete this student? This action cannot be undone.`)) {
                let students = db.students().filter(s => s.id !== parseInt(id));
                db.set('students', students);
                let payments = db.payments().filter(p => p.studentId !== parseInt(id));
                db.set('payments', payments);
                let assignments = db.vehicleAssignments().filter(a => a.studentId !== parseInt(id));
                db.set('vehicleAssignments', assignments);
                allFeeEntriesCache = []; // Clear cache
                renderStudentList();
            }
        }
    });

    // --- [REQ 1] MANAGE CLASSES ---
    const renderClassList = () => {
        const classes = getClasses(); // Use getClasses to ensure defaults
        const tbody = document.getElementById('class-list-table');
        tbody.innerHTML = classes.map(cls => `
            <tr>
                <td class="px-4 py-4 whitespace-nowrap">${cls}</td>
                <td class="px-4 py-4 whitespace-nowrap">
                    <button class="text-red-600 hover:text-red-900" data-class-name="${cls}" data-action="delete-class">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </td>
            </tr>
        `).join('');
    };

    document.getElementById('manage-class-btn').addEventListener('click', () => {
        renderClassList();
        openModal('manage-class-modal');
    });

    document.getElementById('add-class-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const className = document.getElementById('class-name').value.trim();
        if (className) {
            let classes = db.classes();
            if (!classes.includes(className)) {
                classes.push(className);
                db.set('classes', classes);
                renderClassList();
                updateClassFilters(); // Update all dropdowns
            }
            document.getElementById('add-class-form').reset();
        }
    });

    document.getElementById('class-list-table').addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (target && target.dataset.action === 'delete-class') {
            const className = target.dataset.className;
            if (confirm(`Are you sure you want to delete class "${className}"?`)) {
                let classes = db.classes().filter(c => c !== className);
                db.set('classes', classes);
                renderClassList();
                updateClassFilters(); // Update all dropdowns
            }
        }
    });

    // --- FEE MANAGEMENT ---
    const renderFeeManagement = () => {
        const feeTypes = db.feeTypes();
        const tbody = document.getElementById('fee-types-table');
        if (feeTypes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-4 text-center text-gray-500">No fee types defined.</td></tr>`;
        } else {
            tbody.innerHTML = feeTypes.map(ft => `
                <tr>
                    <td class="px-4 py-4 whitespace-nowrap">${ft.name}</td>
                    <td class="px-4 py-4 whitespace-nowrap">${ft.section}</td>
                    <td class="px-4 py-4 whitespace-nowrap">${formatCurrency(ft.amount)}</td>
                    <td class="px-4 py-4 whitespace-nowrap">${formatDate(ft.dueDate)}</td>
                    <td class="px-4 py-4 whitespace-nowrap text-sm font-medium">
                        <button class="text-blue-600 hover:text-blue-900 mr-3" data-id="${ft.id}" data-action="edit-fee-type"><i class="fas fa-edit"></i></button>
                        <button class="text-red-600 hover:text-red-900" data-id="${ft.id}" data-action="delete-fee-type"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');
        }
        document.getElementById('fee-groups-table').innerHTML = `<tr><td colspan="3" class="px-4 py-4 text-center text-gray-500">Fee Groups not yet implemented.</td></tr>`;
    };
    document.getElementById('add-fee-type-btn').addEventListener('click', () => {
        document.getElementById('fee-type-form').reset();
        document.getElementById('fee-type-id').value = '';
        document.getElementById('fee-type-modal-title').textContent = 'Add Fee Type';
        updateClassFilters(); // Make sure dropdown is populated
        openModal('fee-type-modal');
    });
    document.getElementById('fee-type-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const feeTypeId = document.getElementById('fee-type-id').value;
        const feeTypes = db.feeTypes();
        const feeTypeData = {
            id: feeTypeId ? parseInt(feeTypeId) : db.getNextId('feeTypes'),
            name: document.getElementById('fee-type-name').value,
            section: document.getElementById('fee-type-section').value,
            amount: parseFloat(document.getElementById('fee-type-amount').value),
            remindDate: document.getElementById('fee-type-remind-date').value,
            dueDate: document.getElementById('fee-type-due-date').value,
        };
        if (feeTypeId) {
            const index = feeTypes.findIndex(ft => ft.id === feeTypeData.id);
            feeTypes[index] = feeTypeData;
        } else {
            feeTypes.push(feeTypeData);
        }
        db.set('feeTypes', feeTypes);
        allFeeEntriesCache = []; // Clear cache
        renderFeeManagement();
        closeModal('fee-type-modal');
    });
    document.getElementById('fee-types-table').addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const id = target.dataset.id;
        const action = target.dataset.action;
        if (action === 'edit-fee-type') {
            const ft = db.findById('feeTypes', id);
            document.getElementById('fee-type-modal-title').textContent = 'Edit Fee Type';
            document.getElementById('fee-type-id').value = ft.id;
            document.getElementById('fee-type-name').value = ft.name;
            document.getElementById('fee-type-amount').value = ft.amount;
            document.getElementById('fee-type-remind-date').value = ft.remindDate;
            document.getElementById('fee-type-due-date').value = ft.dueDate;
            
            updateClassFilters(); // Populate dropdown
            document.getElementById('fee-type-section').value = ft.section; // Set correct section
            
            flatpickr(".date-picker", {dateFormat: "Y-m-d", allowInput: true});
            openModal('fee-type-modal');
        }
        if (action === 'delete-fee-type') {
            if (confirm(`Are you sure you want to delete this fee type? This will affect all student records.`)) {
                let feeTypes = db.feeTypes().filter(ft => ft.id !== parseInt(id));
                db.set('feeTypes', feeTypes);
                allFeeEntriesCache = []; // Clear cache
                renderFeeManagement();
            }
        }
    });

    // --- STUDENT FEE ---
    const renderStudentFeeTable = () => {
        const students = db.students();
        const feeTypes = db.feeTypes();
        const uniqueFeeNames = [...new Set(feeTypes.map(ft => ft.name))].sort();
        
        const tableHead = document.getElementById('student-fee-table-head');
        const tableBody = document.getElementById('student-fee-table-body');
        const tableFoot = document.getElementById('student-fee-table-foot');
        
        const classFilter = document.getElementById('student-fee-class').value;
        const filteredStudents = (classFilter === 'All') 
            ? students 
            : students.filter(s => s.class === classFilter);
        
        // 1. Generate Table Headers
        let headHTML = '<tr>';
        headHTML += '<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SL</th>';
        headHTML += '<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>';
        headHTML += '<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Due</th>';
        uniqueFeeNames.forEach(name => {
            headHTML += `<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">${name}</th>`;
        });
        headHTML += '<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Paid</th>';
        headHTML += '<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>';
        headHTML += '</tr>';
        tableHead.innerHTML = headHTML;
        
        // 2. Generate Table Body
        if (filteredStudents.length === 0) {
            const colSpan = uniqueFeeNames.length + 5;
            tableBody.innerHTML = `<tr><td colspan="${colSpan}" class="px-4 py-4 text-center text-gray-500">No students found for this class.</td></tr>`;
            tableFoot.innerHTML = '';
            return;
        }

        let bodyHTML = '';
        let globalTotals = { totalDue: 0, totalPaid: 0, balance: 0, fees: {} };
        uniqueFeeNames.forEach(name => globalTotals.fees[name] = 0);
        
        const allEntries = getAllFeeEntries();

        filteredStudents.forEach((student, index) => {
            const summary = getStudentFeeSummary(student.id);
            
            bodyHTML += `
                <tr>
                    <td class="px-4 py-4 whitespace-nowrap">${index + 1}</td>
                    <td class="px-4 py-4 whitespace-nowrap font-medium">${student.name}</td>
                    <td class="px-4 py-4 whitespace-nowrap">${formatCurrency(summary.totalDue)}</td>
            `;
            
            uniqueFeeNames.forEach(name => {
                const studentEntriesForFee = allEntries.filter(e => 
                    !e.isVehicleFee && 
                    e.studentId === student.id && 
                    e.feeTypeName === name
                );
                
                const totalDueForFee = studentEntriesForFee.reduce((sum, e) => sum + e.totalDue, 0);
                const totalBalanceForFee = studentEntriesForFee.reduce((sum, e) => sum + e.balance, 0);
                
                const colorClass = (totalDueForFee > 0 && totalBalanceForFee <= 0) ? 'text-green-600 font-semibold' : '';
                
                bodyHTML += `<td class="px-4 py-4 whitespace-nowrap ${colorClass}">${formatCurrency(totalDueForFee)}</td>`;
                globalTotals.fees[name] += totalDueForFee;
            });
            
            bodyHTML += `
                    <td class="px-4 py-4 whitespace-nowrap text-green-600">${formatCurrency(summary.totalPaid)}</td>
                    <td class="px-4 py-4 whitespace-nowrap text-red-600">${formatCurrency(summary.balance)}</td>
                </tr>
            `;
            
            globalTotals.totalDue += summary.totalDue;
            globalTotals.totalPaid += summary.totalPaid;
            globalTotals.balance += summary.balance;
        });
        tableBody.innerHTML = bodyHTML;
        
        // 3. Generate Table Footer
        let footHTML = '<tr>';
        footHTML += '<td class="px-4 py-3 text-left" colspan="2"><strong>TOTALS</strong></td>';
        footHTML += `<td class="px-4 py-3 text-left"><strong>${formatCurrency(globalTotals.totalDue)}</strong></td>`;
        uniqueFeeNames.forEach(name => {
            footHTML += `<td class="px-4 py-3 text-left"><strong>${formatCurrency(globalTotals.fees[name])}</strong></td>`;
        });
        footHTML += `<td class="px-4 py-3 text-left text-green-700"><strong>${formatCurrency(globalTotals.totalPaid)}</strong></td>`;
        footHTML += `<td class="px-4 py-3 text-left text-red-700"><strong>${formatCurrency(globalTotals.balance)}</strong></td>`;
        footHTML += '</tr>';
        tableFoot.innerHTML = footHTML;
    };
    
    document.getElementById('student-fee-class').addEventListener('change', renderStudentFeeTable);
    
    // --- PAYMENTS ---
    const renderPaymentsTable = () => {
        const allEntries = getAllFeeEntries(true); // Force refresh cache
        const tbody = document.getElementById('payments-table-body');
        
        const classFilter = document.getElementById('payment-class-filter').value;
        const statusFilter = document.getElementById('payment-status-filter').value;
        const searchFilter = document.getElementById('payment-student-search').value.toLowerCase();
        
        const filteredEntries = allEntries.filter(entry => {
            const classMatch = (classFilter === 'All') || (entry.studentClass === classFilter);
            const statusMatch = (statusFilter === 'All') || (entry.status === statusFilter);
            const searchMatch = entry.studentName.toLowerCase().includes(searchFilter);
            return classMatch && statusMatch && searchMatch;
        });

        if (filteredEntries.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="px-6 py-4 text-center text-gray-500">No payment records match your filters.</td></tr>`;
            return;
        }
        
        tbody.innerHTML = filteredEntries.map(entry => {
            let statusClass = '';
            switch(entry.status) {
                case 'Paid': statusClass = 'bg-green-100 text-green-800'; break;
                case 'Partial': statusClass = 'bg-yellow-100 text-yellow-800'; break;
                case 'Pending': statusClass = 'bg-red-100 text-red-800'; break;
            }
            
            const isOverdue = entry.balance > 0 && new Date(entry.dueDate) < new Date();
            
            let actionButton = '';
            if (entry.status !== 'Paid') {
                actionButton = `
                    <button class="text-blue-600 hover:text-blue-900" data-id="${entry.id}" data-action="pay">
                        <i class="fas fa-money-bill"></i> Pay
                    </button>
                `;
            } else {
                 actionButton = `
                    <button class="text-green-600 hover:text-green-900" data-id="${entry.id}" data-action="view-invoice">
                        <i class="fas fa-receipt"></i> View
                    </button>
                `;
            }
            
            return `
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap">${entry.id}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${entry.studentName} (${entry.studentClass})</td>
                    <td class="px-6 py-4 whitespace-nowrap">${entry.feeTypeName}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${formatDate(entry.dueDate)}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${formatCurrency(entry.totalDue)}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${formatCurrency(entry.totalPaid)}</td>
                    <td class="px-6 py-4 whitespace-nowrap font-bold">${formatCurrency(entry.balance)}</td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                            ${entry.status}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        ${actionButton}
                        ${isOverdue ? `
                        <button class="text-green-600 hover:text-green-900 ml-2" data-action="whatsapp-reminder" 
                                data-parent="${entry.studentParentName}" data-student="${entry.studentName}" 
                                data-balance="${entry.balance}" data-due="${entry.dueDate}" data-phone="${entry.studentWhatsApp}">
                            <i class="fab fa-whatsapp"></i>
                        </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    };
    document.getElementById('payment-class-filter').addEventListener('change', renderPaymentsTable);
    document.getElementById('payment-status-filter').addEventListener('change', renderPaymentsTable);
    document.getElementById('payment-student-search').addEventListener('input', renderPaymentsTable);
    document.getElementById('payments-table-body').addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        
        const id = target.dataset.id;
        const action = target.dataset.action;
        
        if (action === 'pay') {
            const entry = getAllFeeEntries().find(e => e.id === id);
            
            document.getElementById('make-payment-form').reset();
            document.getElementById('payment-fee-entry-id').value = entry.id;
            document.getElementById('payment-modal-student').textContent = entry.studentName;
            document.getElementById('payment-modal-fee-type').textContent = entry.feeTypeName;
            document.getElementById('payment-modal-total-due').textContent = formatCurrency(entry.totalDue);
            document.getElementById('payment-modal-already-paid').textContent = formatCurrency(entry.totalPaid);
            document.getElementById('payment-modal-balance').textContent = formatCurrency(entry.balance);
            document.getElementById('payment-modal-amount').value = entry.balance;
            document.getElementById('payment-modal-amount').max = entry.balance;
            
            document.getElementById('payment-modal-invoice').value = ''; 
            
            document.getElementById('payment-modal-date')._flatpickr.setDate(new Date());
            openModal('make-payment-modal');
        }
        
        if (action === 'whatsapp-reminder') {
            const parent = target.dataset.parent;
            const student = target.dataset.student;
            const balance = formatCurrency(target.dataset.balance);
            const dueDate = formatDate(target.dataset.due);
            const phone = target.dataset.phone;
            const message = `Dear ${parent}, your child ${student} has a pending balance of ${balance} for fee due on ${dueDate}. Please pay at your earliest convenience. Thank you.`;
            const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank');
        }
        
        if (action === 'view-invoice') {
            const payments = db.payments();
            const relevantPayments = payments
                .filter(p => p.feeEntryId === id)
                .sort((a, b) => new Date(a.date) - new Date(b.date));
                
            if (relevantPayments.length > 0) {
                const lastPayment = relevantPayments.pop();
                showInvoice(lastPayment.id);
            } else {
                alert('No invoice found for this entry.');
            }
        }
    });
    document.getElementById('make-payment-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const feeEntryId = document.getElementById('payment-fee-entry-id').value;
        const entry = getAllFeeEntries().find(e => e.id === feeEntryId);
        
        const paymentData = {
            id: db.getNextId('payments'),
            feeEntryId: feeEntryId,
            studentId: entry.studentId,
            feeTypeId: entry.feeTypeId,
            amount: parseFloat(document.getElementById('payment-modal-amount').value),
            date: document.getElementById('payment-modal-date').value,
            method: document.getElementById('payment-modal-method').value,
            invoiceId: document.getElementById('payment-modal-invoice').value,
        };
        
        if (!paymentData.invoiceId) {
            alert('Invoice Number is required.');
            return;
        }

        const payments = db.payments();
        payments.push(paymentData);
        db.set('payments', payments);
        
        if (entry.isVehicleFee) {
            const [_, assignId, month] = entry.id.split('-');
            const assignments = db.vehicleAssignments();
            const assignment = assignments.find(a => a.id === parseInt(assignId));
            
            if (assignment) {
                const allPayments = db.payments();
                const vehicleMonthPayments = allPayments.filter(p => p.feeEntryId === entry.id);
                const totalPaidForMonth = vehicleMonthPayments.reduce((sum, p) => sum + p.amount, 0);
                
                assignment.monthlyFees[month].paid = totalPaidForMonth;
                db.set('vehicleAssignments', assignments);
            }
        }
        
        allFeeEntriesCache = []; // Clear cache
        renderPaymentsTable();
        closeModal('make-payment-modal');
        showInvoice(paymentData.id);
    });

    // --- INVOICE ---
    const showInvoice = (paymentId) => {
        const payment = db.findById('payments', paymentId);
        if (!payment) return;
        
        // [REQ 2] Check for grouped/manual payment
        if (payment.lineItems) {
            // This is a grouped payment
            const student = db.findById('students', payment.studentId);
            const schoolInfo = db.schoolInfo();
            
            document.getElementById('invoice-school-name').textContent = schoolInfo.name || 'Your School Name';
            document.getElementById('invoice-school-address').textContent = schoolInfo.address || '123 School Address, City';
            document.getElementById('invoice-school-contact').textContent = `${schoolInfo.email || 'contact@school.com'} | ${schoolInfo.phone || '+91 9876543210'}`;
            document.getElementById('invoice-school-whatsapp').textContent = `Contact us via WhatsApp: ${schoolInfo.whatsapp || '+91 9876543210'}`;

            document.getElementById('invoice-view-no').textContent = payment.invoiceId;
            document.getElementById('invoice-view-date').textContent = formatDate(payment.date);
            document.getElementById('invoice-view-due-date').textContent = 'N/A'; // No due date for manual
            
            document.getElementById('invoice-view-student-name').textContent = student.name;
            document.getElementById('invoice-view-adm-no').textContent = student.admNo;
            document.getElementById('invoice-view-class').textContent = student.class;
            document.getElementById('invoice-view-parent').textContent = `${student.parentName} (${student.whatsapp})`;
            
            // Build table from lineItems
            const tableBody = document.querySelector('#invoice-printable-area tbody');
            tableBody.innerHTML = payment.lineItems.map(item => `
                <tr>
                    <td class="px-4 py-3">${item.desc}</td>
                    <td class="px-4 py-3 text-right">${formatCurrency(item.amt)}</td>
                    <td class="px-4 py-3 text-right">${formatCurrency(item.amt)}</td>
                </tr>
            `).join('');
            
            document.getElementById('invoice-view-method').textContent = payment.method;
            document.getElementById('invoice-view-total-paid-footer').textContent = formatCurrency(payment.amount);
            
            // This is a receipt for a payment, so it's always "PAID"
            document.getElementById('invoice-paid-stamp').classList.remove('hidden');

        } else {
            // This is a standard single fee payment
            const entry = getAllFeeEntries().find(e => e.id === payment.feeEntryId);
            if (!entry) return;
            const schoolInfo = db.schoolInfo();
            
            document.getElementById('invoice-school-name').textContent = schoolInfo.name || 'Your School Name';
            document.getElementById('invoice-school-address').textContent = schoolInfo.address || '123 School Address, City';
            document.getElementById('invoice-school-contact').textContent = `${schoolInfo.email || 'contact@school.com'} | ${schoolInfo.phone || '+91 9876543210'}`;
            document.getElementById('invoice-school-whatsapp').textContent = `Contact us via WhatsApp: ${schoolInfo.whatsapp || '+91 9876543210'}`;

            document.getElementById('invoice-view-no').textContent = payment.invoiceId;
            document.getElementById('invoice-view-date').textContent = formatDate(payment.date);
            document.getElementById('invoice-view-due-date').textContent = formatDate(entry.dueDate);
            
            document.getElementById('invoice-view-student-name').textContent = entry.studentName;
            document.getElementById('invoice-view-adm-no').textContent = entry.studentAdmNo;
            document.getElementById('invoice-view-class').textContent = entry.studentClass;
            document.getElementById('invoice-view-parent').textContent = `${entry.studentParentName} (${entry.studentWhatsApp})`;
            
            // Single row for standard payment
            const tableBody = document.querySelector('#invoice-printable-area tbody');
            tableBody.innerHTML = `
                <tr>
                    <td id="invoice-view-desc" class="px-4 py-3">${entry.feeTypeName}</td>
                    <td id="invoice-view-total-due" class="px-4 py-3 text-right">${formatCurrency(entry.totalDue)}</td>
                    <td id="invoice-view-amount-paid" class="px-4 py-3 text-right">${formatCurrency(payment.amount)}</td>
                </tr>
            `;
            
            document.getElementById('invoice-view-method').textContent = payment.method;
            document.getElementById('invoice-view-total-paid-footer').textContent = formatCurrency(payment.amount);
            
            if (entry.balance <= 0) {
                document.getElementById('invoice-paid-stamp').classList.remove('hidden');
            } else {
                document.getElementById('invoice-paid-stamp').classList.add('hidden');
            }
        }
        
        openModal('invoice-view-modal');
    };
    document.getElementById('invoice-print-btn').addEventListener('click', () => {
        window.print();
    });
    const renderInvoiceList = () => {
        const payments = db.payments();
        const searchQuery = document.getElementById('invoice-search').value.toLowerCase();
        
        const filteredPayments = payments.filter(p => 
            p.invoiceId.toLowerCase().includes(searchQuery)
        );

        const tbody = document.getElementById('invoice-list-table');
        if (filteredPayments.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No invoices found.</td></tr>`;
            return;
        }
        tbody.innerHTML = filteredPayments.slice().reverse().map(p => {
            const student = db.findById('students', p.studentId);
            let studentName = 'N/A';
            if (p.lineItems) { // For grouped
                studentName = db.findById('students', p.studentId)?.name || 'N/A';
            } else { // For single
                studentName = student ? student.name : 'N/A';
            }
            
            return `
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap">${p.invoiceId}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${studentName}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${formatDate(p.date)}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${formatCurrency(p.amount)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button class="text-blue-600 hover:text-blue-900" data-id="${p.id}" data-action="view-invoice">
                            <i class="fas fa-eye"></i> View
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    };
    document.getElementById('invoice-search').addEventListener('input', renderInvoiceList);
    document.getElementById('invoice-list-table').addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (target && target.dataset.action === 'view-invoice') {
            showInvoice(target.dataset.id);
        }
    });

    // --- EXPENSES (Unchanged) ---
    const renderExpenseList = () => {
        const expenses = db.expenses();
        const tbody = document.getElementById('expense-list-table');
        if (expenses.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No expenses recorded.</td></tr>`;
        } else {
            tbody.innerHTML = expenses.map(exp => `
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap">${formatDate(exp.date)}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${exp.category}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${exp.description}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${formatCurrency(exp.amount)}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${exp.payMode}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button class="text-blue-600 hover:text-blue-900 mr-3" data-id="${exp.id}" data-action="edit-expense"><i class="fas fa-edit"></i></button>
                        <button class="text-red-600 hover:text-red-900" data-id="${exp.id}" data-action="delete-expense"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');
        }
    };
    document.getElementById('add-expense-btn').addEventListener('click', () => {
        document.getElementById('expense-form').reset();
        document.getElementById('expense-id').value = '';
        document.getElementById('expense-modal-title').textContent = 'Add Expense';
        document.getElementById('expense-date')._flatpickr.setDate(new Date());
        openModal('expense-modal');
    });
    document.getElementById('expense-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const expenseId = document.getElementById('expense-id').value;
        const expenses = db.expenses();
        const expenseData = {
            id: expenseId ? parseInt(expenseId) : db.getNextId('expenses'),
            date: document.getElementById('expense-date').value,
            category: document.getElementById('expense-category').value,
            description: document.getElementById('expense-description').value,
            amount: parseFloat(document.getElementById('expense-amount').value),
            payMode: document.getElementById('expense-pay-mode').value,
        };
        if (expenseId) {
            const index = expenses.findIndex(ex => ex.id === expenseData.id);
            expenses[index] = expenseData;
        } else {
            expenses.push(expenseData);
        }
        db.set('expenses', expenses);
        allFeeEntriesCache = []; // Clear cache
        renderExpenseList();
        closeModal('expense-modal');
    });
    document.getElementById('expense-list-table').addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const id = target.dataset.id;
        const action = target.dataset.action;
        if (action === 'edit-expense') {
            const exp = db.findById('expenses', id);
            document.getElementById('expense-modal-title').textContent = 'Edit Expense';
            document.getElementById('expense-id').value = exp.id;
            document.getElementById('expense-date').value = exp.date;
            document.getElementById('expense-category').value = exp.category;
            document.getElementById('expense-description').value = exp.description;
            document.getElementById('expense-amount').value = exp.amount;
            document.getElementById('expense-pay-mode').value = exp.payMode;
            flatpickr(".date-picker", {dateFormat: "Y-m-d", allowInput: true});
            openModal('expense-modal');
        }
        if (action === 'delete-expense') {
            if (confirm(`Are you sure you want to delete this expense?`)) {
                let expenses = db.expenses().filter(ex => ex.id !== parseInt(id));
                db.set('expenses', expenses);
                allFeeEntriesCache = []; // Clear cache
                renderExpenseList();
            }
        }
    });

    // --- VEHICLE FEE TRACKING (Unchanged) ---
    const migrateVehicleData = () => {
        const assignments = db.get('vehicleAssignments'); 
        if (assignments.length > 0 && assignments[0].routeId !== undefined) {
            console.log('Migrating old vehicle assignment data...');
            const newAssignments = assignments.map(assign => {
                const oldRouteId = assign.routeId;
                const newMonthlyFees = {};
                academicMonths.forEach(month => {
                    const oldMonthData = assign.monthlyFees[month] || { fee: 0, paid: 0 };
                    newMonthlyFees[month] = {
                        routeId: oldRouteId,
                        fee: oldMonthData.fee,
                        paid: oldMonthData.paid
                    };
                });
                delete assign.routeId;
                assign.monthlyFees = newMonthlyFees;
                return assign;
            });
            db.set('vehicleAssignments', newAssignments);
            console.log('Vehicle data migration complete.');
        }
    };
    document.getElementById('vehicle-manage-routes-btn').addEventListener('click', () => {
        renderRoutesList();
        openModal('manage-routes-modal');
    });
    const renderRoutesList = () => {
        const routes = db.routes();
        const tbody = document.getElementById('routes-list-table');
        if (routes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="px-4 py-4 text-center text-gray-500">No routes defined.</td></tr>`;
        } else {
            tbody.innerHTML = routes.map(r => `
                <tr>
                    <td class="px-4 py-4 whitespace-nowrap">${r.name}</td>
                    <td class="px-4 py-4 whitespace-nowrap">${r.driver}</td>
                    <td class="px-4 py-4 whitespace-nowrap">
                        <button class="text-red-600 hover:text-red-900" data-id="${r.id}" data-action="delete-route"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');
        }
    };
    document.getElementById('add-route-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const routes = db.routes();
        const routeData = {
            id: db.getNextId('routes'),
            name: document.getElementById('route-name').value,
            driver: document.getElementById('route-driver').value,
        };
        routes.push(routeData);
        db.set('routes', routes);
        renderRoutesList();
        updateRouteFilters();
        document.getElementById('add-route-form').reset();
    });
    document.getElementById('routes-list-table').addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (target && target.dataset.action === 'delete-route') {
            if (confirm('Are you sure you want to delete this route? Students will be unassigned for months on this route.')) {
                const id = parseInt(target.dataset.id);
                let routes = db.routes().filter(r => r.id !== id);
                db.set('routes', routes);
                let assignments = db.vehicleAssignments();
                assignments.forEach(assign => {
                    academicMonths.forEach(month => {
                        if (assign.monthlyFees[month].routeId === id) {
                            assign.monthlyFees[month].routeId = null;
                            assign.monthlyFees[month].fee = 0;
                            assign.monthlyFees[month].paid = 0;
                        }
                    });
                });
                db.set('vehicleAssignments', assignments);
                allFeeEntriesCache = []; // Clear cache
                renderRoutesList();
                updateRouteFilters();
                renderVehicleFeeTable();
            }
        }
    });
    document.getElementById('vehicle-add-student-btn').addEventListener('click', () => {
        const students = db.students();
        const assignments = db.vehicleAssignments();
        const assignedStudentIds = assignments.map(a => a.studentId);
        const unassignedStudents = students.filter(s => !assignedStudentIds.includes(s.id));
        const studentSelect = document.getElementById('vehicle-add-student-select');
        studentSelect.innerHTML = '<option value="">Select Student</option>';
        unassignedStudents.forEach(s => {
            studentSelect.innerHTML += `<option value="${s.id}">${s.name} (${s.class})</option>`;
        });
        const routes = db.routes();
        const routeSelect = document.getElementById('vehicle-add-route-select');
        routeSelect.innerHTML = '<option value="">Select Route</option>';
        routes.forEach(r => {
            routeSelect.innerHTML += `<option value="${r.id}">${r.name} (${r.driver})</option>`;
        });
        document.getElementById('add-student-vehicle-form').reset();
        openModal('add-student-vehicle-modal');
    });
    document.getElementById('add-student-vehicle-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const assignments = db.vehicleAssignments();
        const studentId = parseInt(document.getElementById('vehicle-add-student-select').value);
        const routeId = parseInt(document.getElementById('vehicle-add-route-select').value);
        const monthlyFee = parseFloat(document.getElementById('vehicle-add-monthly-fee').value);
        const monthlyFees = {};
        academicMonths.forEach(month => {
            monthlyFees[month] = { 
                routeId: routeId, 
                fee: monthlyFee, 
                paid: 0 
            };
        });
        const newAssignment = {
            id: db.getNextId('vehicleAssignments'),
            studentId: studentId,
            monthlyFees: monthlyFees
        };
        assignments.push(newAssignment);
        db.set('vehicleAssignments', assignments);
        allFeeEntriesCache = []; // Clear cache
        renderVehicleFeeTable();
        closeModal('add-student-vehicle-modal');
    });
    const renderVehicleFeeTable = () => {
        const routes = db.routes();
        const students = db.students();
        const assignments = db.vehicleAssignments();
        const ledger = db.vehicleLedger();
        const container = document.getElementById('vehicle-fee-table-container');
        const classFilter = document.getElementById('vehicle-class-filter').value;
        const routeFilter = document.getElementById('vehicle-route-filter').value;
        let tableHTML = '';
        routes.forEach(route => {
            if (routeFilter !== 'All' && route.id !== parseInt(routeFilter)) {
                return;
            }
            let studentsOnThisRoute = [];
            assignments.forEach(assign => {
                const student = students.find(s => s.id === assign.studentId);
                if (!student) return;
                if (classFilter !== 'All' && student.class !== classFilter) {
                    return;
                }
                let isOnRoute = false;
                for (const month of academicMonths) {
                    if (assign.monthlyFees[month].routeId === route.id) {
                        isOnRoute = true;
                        break;
                    }
                }
                if (isOnRoute) {
                    studentsOnThisRoute.push({ student, assignment: assign });
                }
            });
            if (studentsOnThisRoute.length === 0) return;
            tableHTML += `
                <table class="min-w-full divide-y divide-gray-200 mb-8">
                    <thead class="bg-gray-100">
                        <tr>
                            <th colspan="${academicMonths.length + 5}" class="px-4 py-3 text-left text-lg font-semibold text-gray-800">
                                ${route.name} (${route.driver})
                            </th>
                        </tr>
                        <tr class="bg-gray-50">
                            <th class="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">SL</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class</th>
                            ${academicMonths.map(m => `<th class="px-1 py-3 text-center text-xs font-medium text-gray-500 uppercase">${m}</th>`).join('')}
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Paid</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
            `;
            const routeMonthTotals = {};
            academicMonths.forEach(m => {
                routeMonthTotals[m] = { collection: 0, paidToDriver: 0, balance: 0 };
            });
            studentsOnThisRoute.forEach(({ student, assignment }, index) => {
                let totalStudentPaid = 0;
                let monthCols = '';
                academicMonths.forEach(month => {
                    const monthData = assignment.monthlyFees[month];
                    if (monthData.routeId === route.id) {
                        const paid = monthData.paid;
                        totalStudentPaid += paid;
                        routeMonthTotals[month].collection += paid;
                        monthCols += `
                            <td class="px-1 py-2 text-center">
                                <input type="number" class="form-input w-16 text-center text-sm p-1 bg-gray-100" 
                                       value="${paid}" readonly>
                                <span class="text-xs text-gray-500">/ ${monthData.fee}</span>
                            </td>
                        `;
                    } else {
                        monthCols += `<td class="px-1 py-2 text-center text-gray-400">-</td>`;
                    }
                });
                tableHTML += `
                    <tr>
                        <td class="px-2 py-4">${index + 1}</td>
                        <td class="px-4 py-4 whitespace-nowrap">${student.name}</td>
                        <td class="px-4 py-4 whitespace-nowrap">${student.class}</td>
                        ${monthCols}
                        <td class="px-4 py-4 whitespace-nowrap font-semibold">${formatCurrency(totalStudentPaid)}</td>
                        <td class="px-4 py-4 whitespace-nowrap">
                            <button class="text-blue-600 hover:text-blue-900" data-id="${assignment.id}" data-action="edit-vehicle-assignment">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                        </td>
                    </tr>
                `;
            });
            tableHTML += `</tbody>`;
            if (classFilter === 'All') {
                let collectionCols = '';
                let driverPayCols = '';
                let balanceCols = '';
                let totalRouteCollection = 0;
                let totalRoutePaidToDriver = 0;
                let totalRouteBalance = 0;
                academicMonths.forEach(month => {
                    const collection = routeMonthTotals[month].collection;
                    const ledgerEntry = ledger.find(l => l.routeId === route.id && l.month === month);
                    const paidToDriver = ledgerEntry ? ledgerEntry.paidToDriver : 0;
                    const balance = collection - paidToDriver;
                    collectionCols += `<td class="px-1 py-3 text-center">${formatCurrency(collection)}</td>`;
                    driverPayCols += `<td class="px-1 py-2 text-center">
                                        <input type="number" class="form-input w-16 text-center text-sm p-1 vehicle-driver-paid" 
                                        value="${paidToDriver > 0 ? paidToDriver : ''}" data-route-id="${route.id}" data-month="${month}">
                                     </td>`;
                    balanceCols += `<td class="px-1 py-3 text-center font-semibold ${balance < 0 ? 'text-red-600' : ''}">${formatCurrency(balance)}</td>`;
                    totalRouteCollection += collection;
                    totalRoutePaidToDriver += paidToDriver;
                    totalRouteBalance += balance;
                });
                tableHTML += `
                    <tfoot class="bg-gray-50 font-semibold text-xs">
                        <tr>
                            <td colspan="3" class="px-4 py-3 text-right">Total Collection:</td>
                            ${collectionCols}
                            <td class="px-4 py-3 text-left">${formatCurrency(totalRouteCollection)}</td>
                            <td></td>
                        </tr>
                        <tr>
                            <td colspan="3" class="px-4 py-3 text-right">Paid to Driver:</td>
                            ${driverPayCols}
                            <td class="px-4 py-3 text-left">${formatCurrency(totalRoutePaidToDriver)}</td>
                            <td></td>
                        </tr>
                        <tr>
                            <td colspan="3" class="px-4 py-3 text-right">Balance:</td>
                            ${balanceCols}
                            <td class="px-4 py-3 text-left ${totalRouteBalance < 0 ? 'text-red-600' : ''}">${formatCurrency(totalRouteBalance)}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                `;
            }
            tableHTML += `</table>`;
        });
        container.innerHTML = tableHTML;
    };
    document.getElementById('vehicle-fee-table-container').addEventListener('change', (e) => {
        if (e.target.classList.contains('vehicle-driver-paid')) {
            const routeId = parseInt(e.target.dataset.routeId);
            const month = e.target.dataset.month;
            const amount = parseFloat(e.target.value) || 0;
            let ledger = db.vehicleLedger();
            let entry = ledger.find(l => l.routeId === routeId && l.month === month);
            if (entry) {
                entry.paidToDriver = amount;
            } else {
                ledger.push({ routeId, month, paidToDriver: amount });
            }
            db.set('vehicleLedger', ledger);
            renderVehicleFeeTable();
        }
    });
    document.getElementById('vehicle-fee-table-container').addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (target && target.dataset.action === 'edit-vehicle-assignment') {
            const id = parseInt(target.dataset.id);
            const assignment = db.vehicleAssignments().find(a => a.id === id);
            const student = db.students().find(s => s.id === assignment.studentId);
            document.getElementById('vehicle-student-id').value = assignment.id;
            document.getElementById('vehicle-modal-student-name').value = `${student.name} (${student.class})`;
            const routeSelect = document.getElementById('vehicle-modal-route');
            routeSelect.innerHTML = '';
            db.routes().forEach(r => {
                routeSelect.innerHTML += `<option value="${r.id}">${r.name} (${r.driver})</option>`;
            });
            document.getElementById('vehicle-modal-fee').value = assignment.monthlyFees['Jun'].fee;
            const monthContainer = document.getElementById('vehicle-modal-months');
            monthContainer.innerHTML = academicMonths.map(month => `
                <label class="flex items-center">
                    <input type="checkbox" class="form-checkbox" value="${month}">
                    <span class="ml-2">${month}</span>
                </label>
            `).join('');
            openModal('edit-vehicle-modal');
        }
    });
    document.getElementById('edit-vehicle-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = parseInt(document.getElementById('vehicle-student-id').value);
        const newRouteId = parseInt(document.getElementById('vehicle-modal-route').value);
        const newMonthlyFee = parseFloat(document.getElementById('vehicle-modal-fee').value);
        const selectedMonths = [];
        document.querySelectorAll('#vehicle-modal-months input:checked').forEach(chk => {
            selectedMonths.push(chk.value);
        });
        if (selectedMonths.length === 0) {
            alert('Please select at least one month to apply changes.');
            return;
        }
        const assignments = db.vehicleAssignments();
        const assignment = assignments.find(a => a.id === id);
        selectedMonths.forEach(month => {
            assignment.monthlyFees[month].routeId = newRouteId;
            assignment.monthlyFees[month].fee = newMonthlyFee;
        });
        db.set('vehicleAssignments', assignments);
        allFeeEntriesCache = []; // Clear cache
        renderVehicleFeeTable();
        closeModal('edit-vehicle-modal');
    });
    document.getElementById('vehicle-class-filter').addEventListener('change', renderVehicleFeeTable);
    document.getElementById('vehicle-route-filter').addEventListener('change', renderVehicleFeeTable);


    // --- REPORTS ---
    const getAllTransactions = () => {
        const payments = db.payments();
        const expenses = db.expenses();
        let transactions = [];
        // 1. All Payments
        payments.forEach(p => {
            const student = db.findById('students', p.studentId);
            let feeName = 'N/A';
            
            if (p.lineItems) {
                feeName = "Grouped Payment";
            } else if (p.feeEntryId.startsWith('v-')) {
                const parts = p.feeEntryId.split('-');
                const month = parts[parts.length - 1];
                feeName = `Vehicle Fee - ${month}`;
            } else {
                const feeType = db.findById('feeTypes', p.feeTypeId);
                if (feeType) feeName = feeType.name;
            }
            transactions.push({
                date: p.date, type: 'Income', category: feeName, method: p.method,
                description: student ? student.name : 'Grouped Payment',
                amount: p.amount, invBill: p.invoiceId
            });
        });
        // 2. Expenses
        expenses.forEach(e => {
            transactions.push({
                date: e.date, type: 'Expense', category: e.category, method: e.payMode,
                description: e.description, amount: e.amount, invBill: `BILL-${e.id}`
            });
        });
        transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
        return transactions;
    };
    const renderReports = () => {
        const transactions = getAllTransactions();
        const startDate = document.getElementById('report-start-date').value;
        const endDate = document.getElementById('report-end-date').value;
        const typeFilter = document.getElementById('report-type').value;
        const payModeFilter = document.getElementById('report-pay-mode').value;
        const searchFilter = document.getElementById('report-search').value.toLowerCase();
        
        const filtered = transactions.filter(t => {
            const date = new Date(t.date);
            const dateMatch = (!startDate || date >= new Date(startDate)) && (!endDate || date <= new Date(endDate));
            const typeMatch = (typeFilter === 'All') || (t.type === typeFilter);
            const payModeMatch = (payModeFilter === 'All') || (t.method === payModeFilter);
            const searchMatch = (t.description.toLowerCase().includes(searchFilter) || t.category.toLowerCase().includes(searchFilter));
            return dateMatch && typeMatch && payModeMatch && searchMatch;
        });
        
        const tbody = document.getElementById('report-table-body');
        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500">No transactions match your filters.</td></tr>`;
        } else {
            tbody.innerHTML = filtered.map(t => `
                <tr class="${t.type === 'Income' ? 'bg-green-50' : 'bg-red-50'}">
                    <td class="px-6 py-4 whitespace-nowrap">${formatDate(t.date)}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${t.type}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${t.category}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${t.method}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${t.description}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${formatCurrency(t.amount)}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${t.invBill}</td>
                </tr>
            `).join('');
        }
        
        const totalIncome = filtered.filter(t => t.type === 'Income').reduce((sum, t) => sum + t.amount, 0);
        const totalExpense = filtered.filter(t => t.type === 'Expense').reduce((sum, t) => sum + t.amount, 0);
        const netTotal = totalIncome - totalExpense;
        
        document.getElementById('report-total-income').textContent = formatCurrency(totalIncome);
        document.getElementById('report-total-expense').textContent = formatCurrency(totalExpense);
        document.getElementById('report-net-total').textContent = formatCurrency(netTotal);
    };
    document.getElementById('report-filter-btn').addEventListener('click', renderReports);
    
    // --- EXPORT FUNCTIONS ---
    
    // CSV (Unchanged)
    const downloadCSV = (csvContent, fileName) => {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', fileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };
    
    // PDF (Fixed)
    const downloadPDF = (headers, data, title, fileName) => {
        // [FIX] Access the global object here, not at the top of the file.
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            alert('PDF library is not loaded yet. Please try again in a moment.');
            return;
        }
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.text(title, 14, 16);
        doc.autoTable({
            head: [headers],
            body: data,
            startY: 24,
            theme: 'grid',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [22, 160, 133] }
        });
        doc.save(fileName);
    };

    // Export Listeners (Unchanged)
    document.getElementById('student-fee-csv-btn').addEventListener('click', () => {
        const table = document.getElementById('student-fee-table');
        let csv = [];
        table.querySelectorAll('tr').forEach(row => {
            let rowData = [];
            row.querySelectorAll('th, td').forEach(cell => {
                rowData.push(`"${cell.innerText.replace(/"/g, '""')}"`);
            });
            csv.push(rowData.join(','));
        });
        downloadCSV(csv.join('\n'), 'student_fees.csv');
    });
    document.getElementById('student-fee-pdf-btn').addEventListener('click', () => {
        const table = document.getElementById('student-fee-table');
        const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText);
        const data = Array.from(table.querySelectorAll('tbody tr')).map(tr =>
            Array.from(tr.querySelectorAll('td')).map(td => td.innerText)
        );
        const footer = Array.from(table.querySelectorAll('tfoot tr')).map(tr =>
            Array.from(tr.querySelectorAll('td')).map(td => td.innerText)
        );
        data.push(...footer);
        downloadPDF(headers, data, 'Student Fee Report', 'student_fees.pdf');
    });
    document.getElementById('vehicle-csv-btn').addEventListener('click', () => {
        const routes = db.routes();
        const students = db.students();
        const assignments = db.vehicleAssignments();
        let csv = [];
        const headers = ['Route', 'Student', 'Class', ...academicMonths, 'Total Paid'];
        csv.push(headers.join(','));
        routes.forEach(route => {
            assignments.forEach(assign => {
                const student = students.find(s => s.id === assign.studentId);
                if (!student) return;
                let totalPaid = 0;
                let row = [`"${route.name}"`, `"${student.name}"`, `"${student.class}"`];
                let studentOnThisRoute = false;
                academicMonths.forEach(month => {
                    const monthData = assign.monthlyFees[month];
                    if (monthData.routeId === route.id) {
                        row.push(formatCurrency(monthData.paid) + ' / ' + formatCurrency(monthData.fee));
                        totalPaid += monthData.paid;
                        studentOnThisRoute = true;
                    } else {
                        row.push('-');
                    }
                });
                if (studentOnThisRoute) {
                    row.push(formatCurrency(totalPaid));
                    csv.push(row.join(','));
                }
            });
        });
        downloadCSV(csv.join('\n'), 'vehicle_fees.csv');
    });
    document.getElementById('vehicle-pdf-btn').addEventListener('click', () => {
        const routes = db.routes();
        const students = db.students();
        const assignments = db.vehicleAssignments();
        const headers = ['Student', 'Class', ...academicMonths, 'Total Paid'];
        const doc = new jsPDF({ orientation: 'landscape' });
        let startY = 24;
        doc.text('Vehicle Fee Report', 14, 16);
        routes.forEach(route => {
            let data = [];
            assignments.forEach(assign => {
                const student = students.find(s => s.id === assign.studentId);
                if (!student) return;
                let totalPaid = 0;
                let row = [student.name, student.class];
                let studentOnThisRoute = false;
                academicMonths.forEach(month => {
                    const monthData = assign.monthlyFees[month];
                    if (monthData.routeId === route.id) {
                        row.push(`${formatCurrency(monthData.paid)} / ${formatCurrency(monthData.fee)}`);
                        totalPaid += monthData.paid;
                        studentOnThisRoute = true;
                    } else {
                        row.push('-');
                    }
                });
                if (studentOnThisRoute) {
                    row.push(formatCurrency(totalPaid));
                    data.push(row);
                }
            });
            if (data.length > 0) {
                doc.text(`Route: ${route.name} (${route.driver})`, 14, startY);
                doc.autoTable({
                    head: [headers],
                    body: data,
                    startY: startY + 6,
                    theme: 'grid',
                    styles: { fontSize: 7 },
                    headStyles: { fillColor: [96, 125, 139] },
                });
                startY = doc.autoTable.previous.finalY + 10;
            }
        });
        doc.save('vehicle_fees.pdf');
    });
    document.getElementById('report-export-csv-btn').addEventListener('click', () => {
        const table = document.getElementById('report-table');
        let csv = [];
        table.querySelectorAll('tr').forEach(row => {
            let rowData = [];
            row.querySelectorAll('th, td').forEach(cell => {
                rowData.push(`"${cell.innerText.replace(/"/g, '""')}"`);
            });
            csv.push(rowData.join(','));
        });
        downloadCSV(csv.join('\n'), 'transactions_report.csv');
    });
    document.getElementById('report-export-pdf-btn').addEventListener('click', () => {
        const table = document.getElementById('report-table');
        const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText);
        const data = Array.from(table.querySelectorAll('tbody tr')).map(tr =>
            Array.from(tr.querySelectorAll('td')).map(td => td.innerText)
        );
        const footer = Array.from(table.querySelectorAll('tfoot tr')).map(tr =>
            Array.from(tr.querySelectorAll('td')).map(td => td.innerText)
        );
        data.push(...footer);
        downloadPDF(headers, data, 'Transactions Report', 'transactions_report.pdf');
    });

    // --- ABOUT PAGE ---
    const renderAboutPage = () => {
        const info = db.schoolInfo();
        document.getElementById('school-name').value = info.name || '';
        document.getElementById('school-address').value = info.address || '';
        document.getElementById('school-phone').value = info.phone || '';
        document.getElementById('school-email').value = info.email || '';
        document.getElementById('school-whatsapp').value = info.whatsapp || '';
        document.getElementById('school-website').value = info.website || '';
        
        document.querySelectorAll('#school-info-form input').forEach(input => {
            input.readOnly = true;
        });
        document.getElementById('save-school-info-btn').classList.add('hidden');
        document.getElementById('edit-school-info-btn').textContent = "Edit Info";
    };
    document.getElementById('edit-school-info-btn').addEventListener('click', (e) => {
        const isEditing = e.target.textContent.includes('Cancel');
        const inputs = document.querySelectorAll('#school-info-form input');
        
        if (isEditing) {
            renderAboutPage(); // Resets the form
        } else {
            inputs.forEach(input => input.readOnly = false);
            e.target.textContent = "Cancel";
            document.getElementById('save-school-info-btn').classList.remove('hidden');
        }
    });
    document.getElementById('school-info-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const info = {
            name: document.getElementById('school-name').value,
            address: document.getElementById('school-address').value,
            phone: document.getElementById('school-phone').value,
            email: document.getElementById('school-email').value,
            whatsapp: document.getElementById('school-whatsapp').value,
            website: document.getElementById('school-website').value,
        };
        db.setSchoolInfo(info);
        alert('School information saved!');
        renderAboutPage(); // Re-render to set fields to readonly
    });
    
    // --- [REQ 2] GROUPED PAYMENT MODAL ---
    document.getElementById('create-manual-invoice-btn').addEventListener('click', () => {
        const studentSelect = document.getElementById('multi-pay-student');
        const students = db.students();
        studentSelect.innerHTML = '<option value="">-- Select a student --</option>';
        students.forEach(s => {
            studentSelect.innerHTML += `<option value="${s.id}">${s.name} (${s.admNo})</option>`;
        });
        
        document.getElementById('multi-pay-form').reset();
        document.getElementById('multi-pay-fees-container').classList.add('hidden');
        document.getElementById('multi-pay-details').classList.add('hidden');
        document.getElementById('multi-pay-total').textContent = '₹0.00';
        document.getElementById('multi-pay-submit-btn').disabled = true;
        
        flatpickr("#multi-pay-date", { dateFormat: "Y-m-d", allowInput: true }).setDate(new Date());

        openModal('multi-pay-modal');
    });

    document.getElementById('multi-pay-student').addEventListener('change', (e) => {
        const studentId = e.target.value;
        const feesListDiv = document.getElementById('multi-pay-fees-list');
        const feesContainer = document.getElementById('multi-pay-fees-container');
        const detailsContainer = document.getElementById('multi-pay-details');
        
        if (!studentId) {
            feesListDiv.innerHTML = '';
            feesContainer.classList.add('hidden');
            detailsContainer.classList.add('hidden');
            return;
        }
        
        const pendingFees = getAllFeeEntries().filter(e => 
            e.studentId === parseInt(studentId) && e.status !== 'Paid'
        );
        
        if (pendingFees.length === 0) {
            feesListDiv.innerHTML = '<p class="text-gray-500">No pending fees for this student.</p>';
        } else {
            feesListDiv.innerHTML = pendingFees.map(fee => `
                <label class="flex items-center justify-between p-2 rounded hover:bg-gray-100">
                    <div>
                        <input type="checkbox" class="form-checkbox multi-pay-checkbox" value="${fee.id}" data-balance="${fee.balance}">
                        <span class="ml-2">${fee.feeTypeName}</span>
                    </div>
                    <span class="font-semibold">${formatCurrency(fee.balance)}</span>
                </label>
            `).join('');
        }
        
        feesContainer.classList.remove('hidden');
        detailsContainer.classList.remove('hidden');
        document.getElementById('multi-pay-total').textContent = '₹0.00';
        document.getElementById('multi-pay-submit-btn').disabled = true;
    });

    document.getElementById('multi-pay-fees-list').addEventListener('change', (e) => {
        if (e.target.classList.contains('multi-pay-checkbox')) {
            let total = 0;
            const checkboxes = document.querySelectorAll('.multi-pay-checkbox:checked');
            checkboxes.forEach(cb => {
                total += parseFloat(cb.dataset.balance);
            });
            document.getElementById('multi-pay-total').textContent = formatCurrency(total);
            document.getElementById('multi-pay-submit-btn').disabled = total === 0;
        }
    });

    document.getElementById('multi-pay-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const studentId = parseInt(document.getElementById('multi-pay-student').value);
        const invoiceId = document.getElementById('multi-pay-invoice').value;
        const date = document.getElementById('multi-pay-date').value;
        const method = document.getElementById('multi-pay-method').value;
        
        if (!invoiceId) {
            alert('Invoice Number is required.');
            return;
        }

        const checkedFees = document.querySelectorAll('.multi-pay-checkbox:checked');
        if (checkedFees.length === 0) {
            alert('Please select at least one fee to pay.');
            return;
        }

        const payments = db.payments();
        const assignments = db.vehicleAssignments();
        let nextPaymentId = db.getNextId('payments');
        
        const lineItemsForInvoice = []; // For a combined invoice
        let totalPaid = 0;

        checkedFees.forEach(cb => {
            const feeEntryId = cb.value;
            const balance = parseFloat(cb.dataset.balance);
            const entry = getAllFeeEntries().find(e => e.id === feeEntryId);
            
            const paymentData = {
                id: nextPaymentId,
                feeEntryId: feeEntryId,
                studentId: studentId,
                feeTypeId: entry.feeTypeId,
                amount: balance,
                date: date,
                method: method,
                invoiceId: invoiceId
            };
            payments.push(paymentData);
            
            // Add to line items for the manual invoice
            lineItemsForInvoice.push({ desc: entry.feeTypeName, amt: balance });
            totalPaid += balance;

            if (entry.isVehicleFee) {
                const [_, assignId, month] = entry.id.split('-');
                const assignment = assignments.find(a => a.id === parseInt(assignId));
                if (assignment) {
                    assignment.monthlyFees[month].paid += balance;
                }
            }
            nextPaymentId++;
        });

        // Create one "master" payment object to represent the grouped bill
        const masterPayment = {
            id: nextPaymentId,
            studentId: studentId,
            amount: totalPaid,
            date: date,
            method: method,
            invoiceId: invoiceId,
            feeEntryId: `manual-${invoiceId}`, // Special ID for grouped payments
            lineItems: lineItemsForInvoice
        };
        payments.push(masterPayment);

        db.set('payments', payments);
        db.set('vehicleAssignments', assignments);
        allFeeEntriesCache = []; // Clear cache

        closeModal('multi-pay-modal');
        renderPaymentsTable();
        showInvoice(masterPayment.id); // Show the new grouped invoice
    });
    
    // --- INITIALIZATION ---
    
    // [REQ 1] Function to update all class filter dropdowns
    const updateClassFilters = () => {
        const classes = getClasses(); // Gets from DB
        
        const selects = document.querySelectorAll('#student-class, #fee-type-section, #student-fee-class, #payment-class-filter, #vehicle-class-filter');
        
        selects.forEach(select => {
            const currentValue = select.value;
            const firstOptionValue = select.options[0].value;
            let firstOptionText = "Select Class"; // Default for student-class
            
            if (firstOptionValue === "All") {
                firstOptionText = "All Classes";
            }
            if (select.id === "fee-type-section") {
                 firstOptionText = "All Classes";
            }

            select.innerHTML = ''; // Clear all
            
            // Re-add the first option
            const firstOption = document.createElement('option');
            firstOption.value = firstOptionValue;
            firstOption.textContent = firstOptionText;
            select.appendChild(firstOption);

            // Add new options
            classes.forEach(c => {
                const option = document.createElement('option');
                option.value = c;
                option.textContent = c;
                select.appendChild(option);
            });
            select.value = currentValue || firstOption.value;
        });
    };
    
    // Update Route Filters
    const updateRouteFilters = () => {
        const routes = db.routes();
        const selects = document.querySelectorAll('#vehicle-route-filter');
        selects.forEach(select => {
            const currentValue = select.value;
            select.innerHTML = '<option value="All">All Routes</option>';
            routes.forEach(r => {
                select.innerHTML += `<option value="${r.id}">${r.name}</option>`;
            });
            select.value = currentValue || 'All';
        });
    };

    /**
     * Standard Init function
     */
    const init = () => {
        // Run data migration on load
        migrateVehicleData();
        
        // Check for initial hash
        const initialPage = window.location.hash.substring(1) || 'dashboard';
        
        // Populate filters
        updateClassFilters(); // [REQ 1]
        updateRouteFilters();
        
        // Show the initial page
        showPage(initialPage);
    };

    // Run initialization
    init();
    
});