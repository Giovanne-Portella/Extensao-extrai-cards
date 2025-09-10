// popup.js - Script principal para a interface do popup da extensão
// Autor: Giovanne Marinho
// Data: 2024-06-26
// Descrição: Gerencia a UI do popup, interage com o conteúdo da página, processa dados e gera insights visuais.    
document.addEventListener('DOMContentLoaded', () => {
    // Ordem personalizada para exibição e cópia dos status
    const statusOrder = [
        'Novo', 'Aberto', 'Em progresso', 'Pendente', 
        'Escalonado Engenharia', 'Resolvido', 'Fechado'
    ];
    // Função para analisar datas no formato DD/MM/YYYY
    const parseDate = (dateStr) => {
        if (!dateStr || typeof dateStr !== 'string') return null;
        const parts = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!parts) return null;
        return new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
    };

    // Referências a TODOS os elementos da UI
    const extractButton = document.getElementById('extractButton');
    const openSelectedButton = document.getElementById('openSelectedButton');
    const copyButton = document.getElementById('copyButton');
    const generateInsightsButton = document.getElementById('generateInsightsButton');
    const nameFilterInput = document.getElementById('nameFilter');
    const clientFilterInput = document.getElementById('clientFilter');
    const idFilterInput = document.getElementById('idFilter');
    const tagsFilterInput = document.getElementById('tagsFilter');
    const effortFilterInput = document.getElementById('effortFilter');
    const columnFiltersContainer = document.getElementById('columnFiltersContainer');
    const resultsContainer = document.getElementById('resultsContainer');
    const insightsModal = document.getElementById('insightsModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const insightsContainer = document.getElementById('insightsContainer');
    const responsibleFilterModal = document.getElementById('responsibleFilterModal');
    const closeResponsibleModalBtn = document.getElementById('closeResponsibleModalBtn');
    const responsibleFilterChoices = document.getElementById('responsibleFilterChoices');
    const responsibleFilterSelectAllBtn = document.getElementById('responsibleFilterSelectAllBtn');
    const responsibleFilterClearAllBtn = document.getElementById('responsibleFilterClearAllBtn');
    const applyResponsibleFiltersBtn = document.getElementById('applyResponsibleFiltersBtn');
    const copyFeedback = document.getElementById('copyFeedback');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');
    // Variáveis globais
    let groupedDataForCopy = {};
    let activeCharts = [];
    let allExtractedCards = [];
    let currentResponsibleFilters = [];
    // Função para tornar uma tabela ordenável
    function makeTableSortable(table) {
        const headers = table.querySelectorAll('th');
        headers.forEach((header, index) => {
            if (header.classList.contains('checkbox-column')) return;
            // Adiciona indicador visual de ordenação
            header.classList.add('sortable-header');
            const arrowSpan = document.createElement('span');
            arrowSpan.className = 'sort-arrow';
            header.appendChild(arrowSpan);
            // Evento de clique para ordenar
            header.addEventListener('click', () => {
                const tbody = table.querySelector('tbody');
                const rows = Array.from(tbody.querySelectorAll('tr'));
                const currentDirection = header.dataset.sortDirection || 'desc';
                const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';
                const directionMultiplier = newDirection === 'asc' ? 1 : -1;
                // Reseta outras colunas
                headers.forEach(h => {
                    if (h !== header && h.classList.contains('sortable-header')) {
                        h.dataset.sortDirection = '';
                        if(h.querySelector('.sort-arrow')) h.querySelector('.sort-arrow').innerText = '';
                    }
                });
                // Atualiza estado da coluna clicada
                header.dataset.sortDirection = newDirection;
                header.querySelector('.sort-arrow').innerText = newDirection === 'asc' ? '▲' : '▼';
                // Função de comparação personalizada
                rows.sort((rowA, rowB) => {
                    const cellA = rowA.cells[index].innerText.trim();
                    const cellB = rowB.cells[index].innerText.trim();
                    const dateA = parseDate(cellA);
                    const dateB = parseDate(cellB);
                    if (dateA && dateB) {
                        return (dateA - dateB) * directionMultiplier;
                    }
                    const numA = parseFloat(cellA.replace(',', '.'));
                    const numB = parseFloat(cellB.replace(',', '.'));
                    if (!isNaN(numA) && !isNaN(numB)) {
                        return (numA - numB) * directionMultiplier;
                    }
                    return cellA.localeCompare(cellB, undefined, { numeric: true }) * directionMultiplier;
                });

                tbody.innerHTML = '';
                rows.forEach(row => tbody.appendChild(row));
            });
        });
    }
    // Função para gerar uma cor aleatória em formato RGBA
    const generateRandomColor = (alpha = 0.7) => `rgba(${Math.floor(Math.random()*255)}, ${Math.floor(Math.random()*255)}, ${Math.floor(Math.random()*255)}, ${alpha})`;
    // Carrega filtros salvos da última extração
    const loadSavedFilters = () => {
        chrome.storage.local.get(['lastFilters'], (result) => {
            if (result.lastFilters) {
                nameFilterInput.value = result.lastFilters.name || '';
                clientFilterInput.value = result.lastFilters.client || '';
                idFilterInput.value = result.lastFilters.id || '';
                tagsFilterInput.value = result.lastFilters.tags || '';
                effortFilterInput.value = result.lastFilters.effort || '';
            }
        });
    };
    // Inicialização
    loadSavedFilters();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) { console.error("Extrator: Não foi possível obter a aba ativa."); return; }
        chrome.tabs.sendMessage(tabs[0].id, { action: "get_columns" }, (response) => {
            if (chrome.runtime.lastError) {
                columnFiltersContainer.innerHTML = `<p style="color:red;">Falha ao conectar: ${chrome.runtime.lastError.message}. Recarregue a página e tente novamente.</p>`;
                return;
            }
            if (!response || !response.columnNames) {
                 columnFiltersContainer.innerHTML = '<p>Nenhuma coluna encontrada.</p>';
                 return;
            }
            // Limpa e popula os filtros de coluna
            columnFiltersContainer.innerHTML = '';
            const sortedColumnNames = response.columnNames.sort((a, b) => {
                const indexA = statusOrder.indexOf(a); const indexB = statusOrder.indexOf(b);
                if (indexA === -1) return 1; if (indexB === -1) return -1;
                return indexA - indexB;
            });
            // Adiciona os filtros de coluna
            sortedColumnNames.forEach(name => {
                const pill = document.createElement('div');
                pill.className = 'filter-pill selected';
                pill.innerHTML = `<input type="checkbox" name="column" value="${name}" checked><label style="pointer-events: none;">${name}</label>`;
                pill.addEventListener('click', () => {
                    const checkbox = pill.querySelector('input');
                    checkbox.checked = !checkbox.checked;
                    pill.classList.toggle('selected');
                });
                columnFiltersContainer.appendChild(pill);
            });
        });
    });
    // Eventos dos botões de selecionar/limpar todos os filtros
    selectAllBtn.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.column-filters .filter-pill').forEach(pill => {
            pill.classList.add('selected');
            pill.querySelector('input').checked = true;
        });
    });

    clearAllBtn.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.column-filters .filter-pill').forEach(pill => {
            pill.classList.remove('selected');
            pill.querySelector('input').checked = false;
        });
    });
    // Evento do botão de extração
    extractButton.addEventListener('click', () => {
        const filters = {
            name: nameFilterInput.value.trim(), client: clientFilterInput.value.trim(),
            id: idFilterInput.value.trim(), tags: tagsFilterInput.value.trim(), effort: effortFilterInput.value.trim()
        };
        const selectedColumns = Array.from(document.querySelectorAll('input[name="column"]:checked')).map(cb => cb.value);
        if (selectedColumns.length === 0) {
            alert('Por favor, selecione pelo menos uma coluna de status para extrair.');
            return;
        }
        // Reseta a UI para o estado de carregamento
        resultsContainer.innerHTML = '<p>Buscando cards...</p>';
        insightsModal.style.display = 'none';
        responsibleFilterModal.style.display = 'none';
        copyButton.disabled = true;
        generateInsightsButton.disabled = true;
        openSelectedButton.disabled = true;
        chrome.storage.local.set({ lastFilters: filters });

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) { console.error("Extrator: Não foi possível obter a aba ativa para extração."); return; }
            chrome.tabs.sendMessage(tabs[0].id, { action: "extract_data", filters: filters, selectedColumns: selectedColumns });
        });
    });
    // Listener para receber dados extraídos do content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "display_grouped_results") {
            resultsContainer.innerHTML = '';
            groupedDataForCopy = message.data;
            allExtractedCards = Object.values(message.data).flat();
            
            activeCharts.forEach(chart => chart.destroy());
            activeCharts = [];
            insightsContainer.innerHTML = '';
            // Ordena os status conforme a ordem personalizada
            const statuses = Object.keys(groupedDataForCopy).sort((a, b) => {
                const indexA = statusOrder.indexOf(a); const indexB = statusOrder.indexOf(b);
                if (indexA === -1) return 1; if (indexB === -1) return -1;
                return indexA - indexB;
            });
            const hasCards = allExtractedCards.length > 0;
            // Atualiza a interface com os resultados
            if (hasCards) {
                statuses.forEach(status => {
                    const cards = groupedDataForCopy[status];
                    if(cards.length === 0) return;
                    // Cria título e tabela para cada status
                    const title = document.createElement('h3');
                    title.innerText = `${status} (${cards.length})`;
                    resultsContainer.appendChild(title);
                    // Cria a tabela para os cards
                    const table = document.createElement('table');
                    const thead = table.createTHead();
                    thead.innerHTML = `<tr>
                        <th class="checkbox-column"><input type="checkbox" class="select-all-in-table"></th>
                        <th style="width: 7%;">ID</th>
                        <th style="width: 26%;">Título</th>
                        <th style="width: 11%;">Cliente</th>
                        <th style="width: 11%;">Status N2</th>
                        <th style="width: 12%;">Data/hora de Criação</th>
                        <th style="width: 14%;">Equipe responsável</th>
                        <th style="width: 15%;">Data/hora de escalonamento</th>
                    </tr>`;
                    // Corpo da tabela
                    const tbody = table.createTBody();
                    cards.forEach(card => {
                        const newRow = tbody.insertRow();
                        newRow.insertCell(0).innerHTML = `<input type="checkbox" class="card-checkbox" data-link="${card.link}">`;
                        newRow.cells[0].className = 'checkbox-column';
                        newRow.insertCell(1).innerText = card.id;
                        newRow.insertCell(2).innerHTML = `<a href="${card.link}" target="_blank">${card.titulo}</a>`;
                        newRow.insertCell(3).innerText = card.cliente;
                        newRow.insertCell(4).innerText = card.statusN2;
                        newRow.insertCell(5).innerText = card.createdDate;
                        newRow.insertCell(6).innerText = card.equipeResponsavel;
                        newRow.insertCell(7).innerText = card.escalationDate;
                    });
                    resultsContainer.appendChild(table);
                    makeTableSortable(table);

                    thead.querySelector('.select-all-in-table').addEventListener('change', (e) => {
                        tbody.querySelectorAll('.card-checkbox').forEach(checkbox => { checkbox.checked = e.target.checked; });
                    });
                });
                copyButton.disabled = false;
                generateInsightsButton.disabled = false;
                openSelectedButton.disabled = false;
            } else {
                resultsContainer.innerText = 'Nenhum card encontrado para os filtros selecionados.';
                generateInsightsButton.disabled = true;
                openSelectedButton.disabled = true;
            }
        }
    });
    // Evento do botão de abrir cards selecionados
    openSelectedButton.addEventListener('click', () => {
        const checkedBoxes = document.querySelectorAll('.card-checkbox:checked');
        if (checkedBoxes.length === 0) {
            alert('Nenhum card selecionado para abrir.');
            return;
        }
        if (checkedBoxes.length > 10) {
            if (!confirm(`Você está prestes a abrir ${checkedBoxes.length} abas. Deseja continuar?`)) {
                return;
            }
        }
        checkedBoxes.forEach(checkbox => {
            const urlToOpen = checkbox.dataset.link;
            if (urlToOpen && urlToOpen !== '#') {
                chrome.tabs.create({ url: urlToOpen, active: false });
            }
        });
    });
    // Funções e eventos para geração de insights
    function createPill(name, value, isChecked, isBold = false) {
        const pill = document.createElement('div');
        pill.className = isChecked ? 'filter-pill selected' : 'filter-pill';
        const labelStyle = isBold ? 'font-weight: bold; pointer-events: none;' : 'pointer-events: none;';
        pill.innerHTML = `<input type="checkbox" name="responsible-filter" value="${value}" ${isChecked ? 'checked' : ''}><label style="${labelStyle}">${name}</label>`;
        // Evento de clique para alternar seleção
        pill.addEventListener('click', () => {
            const checkbox = pill.querySelector('input');
            checkbox.checked = !checkbox.checked;
            pill.classList.toggle('selected');

            if (value === 'select-all') {
                responsibleFilterChoices.querySelectorAll('.filter-pill input[name="responsible-filter"]').forEach(cb => {
                    cb.checked = checkbox.checked;
                    cb.parentElement.classList.toggle('selected', checkbox.checked);
                });
            } else {
                const allOtherPills = Array.from(responsibleFilterChoices.querySelectorAll('.filter-pill input[name="responsible-filter"]'));
                const allOthersChecked = allOtherPills.every(cb => cb.checked);
                // Atualiza o estado do "Selecionar Todos"
                const selectAllCheckbox = responsibleFilterChoices.querySelector('input[value="select-all"]');
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = allOthersChecked;
                    selectAllCheckbox.parentElement.classList.toggle('selected', allOthersChecked);
                }
            }
        });
        return pill;
    }
    // Função para atualizar os gráficos com base nos filtros aplicados
    function updateCharts() {
        activeCharts.forEach(chart => chart.destroy());
        activeCharts = [];
        insightsContainer.innerHTML = '<h3>Insights Gerados</h3>';
        const filteredCards = allExtractedCards.filter(card => currentResponsibleFilters.includes(card.assignedTo));

        if (filteredCards.length === 0) {
            insightsContainer.innerHTML += '<p style="color: #949BA4; width: 100%; text-align: center;">Nenhum card para os responsáveis selecionados.</p>';
            return;
        }
        // Gráfico de Status vs Quantidade
        const statusCounts = {};
        filteredCards.forEach(card => { statusCounts[card.statusN2] = (statusCounts[card.statusN2] || 0) + 1; });
        createChart('Status vs Quantidade', Object.keys(statusCounts), Object.values(statusCounts), 'bar');
        // Gráfico de Itens por Responsável
        const responsibleCounts = {};
        filteredCards.forEach(card => { responsibleCounts[card.assignedTo] = (responsibleCounts[card.assignedTo] || 0) + 1; });
        const sortedResponsibles = Object.entries(responsibleCounts).sort(([, a], [, b]) => b - a);
        createChart('Itens por Responsável', sortedResponsibles.map(([name]) => name), sortedResponsibles.map(([, count]) => count), 'bar');
        // Tabela de Itens por Cliente
        const clientCounts = {};
        filteredCards.forEach(card => { const client = card.cliente || 'Não Informado'; clientCounts[client] = (clientCounts[client] || 0) + 1; });
        createTable('Itens por Cliente', clientCounts);
        // Gráficos de Cards Criados e Escalonados por Dia
        const createdCounts = {};
        filteredCards.forEach(card => { if (card.createdDate) { createdCounts[card.createdDate] = (createdCounts[card.createdDate] || 0) + 1; } });
        const sortedCreatedDates = Object.keys(createdCounts).sort((a, b) => parseDate(a) - parseDate(b));
        if (sortedCreatedDates.length > 0) {
            createChart('Cards Criados por Dia', sortedCreatedDates, sortedCreatedDates.map(date => createdCounts[date]), 'line');
        }
        const escalatedCounts = {};
        const escalatedCards = filteredCards.filter(card => card.statusN2 === 'Escalonado Engenharia' && card.escalationDate);
        escalatedCards.forEach(card => { escalatedCounts[card.escalationDate] = (escalatedCounts[card.escalationDate] || 0) + 1; });
        const sortedEscalatedDates = Object.keys(escalatedCounts).sort((a, b) => parseDate(a) - parseDate(b));
        if (sortedEscalatedDates.length > 0) {
            createChart('Cards Escalonados por Dia', sortedEscalatedDates, sortedEscalatedDates.map(date => escalatedCounts[date]), 'line');
        }
    }
    // Eventos relacionados ao modal de insights e filtros
    generateInsightsButton.addEventListener('click', () => {
        responsibleFilterChoices.innerHTML = '';
        const uniqueResponsibles = [...new Set(allExtractedCards.map(card => card.assignedTo))].sort();
        // Adiciona a opção de selecionar todos se houver responsáveis
        if (uniqueResponsibles.length > 0) {
            const selectAllPill = createPill('Todos', 'select-all', true, true);
            responsibleFilterChoices.appendChild(selectAllPill);
        }
        uniqueResponsibles.forEach(name => {
            responsibleFilterChoices.appendChild(createPill(name, name, true));
        });
        
        responsibleFilterModal.style.display = 'flex';
    });
    // Aplica os filtros selecionados e gera os gráficos
    applyResponsibleFiltersBtn.addEventListener('click', () => {
        currentResponsibleFilters = Array.from(responsibleFilterChoices.querySelectorAll('input[name="responsible-filter"]:checked'))
                                    .filter(cb => cb.value !== 'select-all')
                                    .map(cb => cb.value);
        responsibleFilterModal.style.display = 'none';
        updateCharts();
        insightsModal.style.display = 'flex';
    });
    // Eventos para selecionar/limpar todos os responsáveis
    responsibleFilterSelectAllBtn.addEventListener('click', () => {
        responsibleFilterChoices.querySelectorAll('.filter-pill').forEach(p => {
            p.querySelector('input').checked = true;
            p.classList.add('selected');
        });
    });
    // Evento para limpar todos os responsáveis
    responsibleFilterClearAllBtn.addEventListener('click', () => {
        responsibleFilterChoices.querySelectorAll('.filter-pill').forEach(p => {
            p.querySelector('input').checked = false;
            p.classList.remove('selected');
        });
    });
    // Eventos para fechar modais
    closeModalBtn.addEventListener('click', () => { insightsModal.style.display = 'none'; });
    closeResponsibleModalBtn.addEventListener('click', () => { responsibleFilterModal.style.display = 'none'; });
    window.addEventListener('click', (event) => { 
        if (event.target == insightsModal) { insightsModal.style.display = 'none'; }
        if (event.target == responsibleFilterModal) { responsibleFilterModal.style.display = 'none'; }
    });
    // Evento do botão de copiar dados para a área de transferência
    copyButton.addEventListener('click', () => {
        let dataToCopy = [];
        const statuses = Object.keys(groupedDataForCopy).sort((a, b) => {
            const indexA = statusOrder.indexOf(a); const indexB = statusOrder.indexOf(b);
            if (indexA === -1) return 1; if (indexB === -1) return -1;
            return indexA - indexB;
        });
        statuses.forEach(status => {
            const cards = groupedDataForCopy[status];
            cards.forEach(card => {
                const rowData = [
                    card.id, card.titulo, card.cliente, card.statusN2,
                    card.createdDate, card.equipeResponsavel, card.escalationDate
                ];
                dataToCopy.push(rowData.join('\t'));
            });
        });
        if (dataToCopy.length > 0) {
            navigator.clipboard.writeText(dataToCopy.join('\n')).then(() => {
                copyFeedback.innerText = 'Copiado!';
                setTimeout(() => { copyFeedback.innerText = ''; }, 2000);
            });
        }
    });
    // Função para criar gráficos usando Chart.js
    function createChart(titleText, labels, data, type) {
        const chartCard = document.createElement('div');
        chartCard.className = 'chart-card';
        insightsContainer.appendChild(chartCard);
        const title = document.createElement('h4');
        title.innerText = titleText;
        chartCard.appendChild(title);
        const chartContainer = document.createElement('div');
        chartContainer.className = 'chart-container';
        chartCard.appendChild(chartContainer);
        const canvas = document.createElement('canvas');
        chartContainer.appendChild(canvas);
        const chartColors = labels.map(() => generateRandomColor());
        let chartData;
        let chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { labels: { color: 'var(--text-normal)' } } 
            },
            scales: {
                x: { ticks: { color: 'var(--text-muted)', autoSkip: false }, grid: { color: 'rgba(255, 255, 255, 0.1)' } },
                y: { ticks: { color: 'var(--text-muted)' }, grid: { color: 'rgba(255, 255, 255, 0.1)' }, beginAtZero: true }
            }
        };
        const datasetOptions = { label: 'Quantidade', data: data, backgroundColor: chartColors, borderColor: (type === 'line') ? generateRandomColor(1) : chartColors.map(color => color.replace('0.7', '1')), borderWidth: (type === 'line') ? 2 : 1, pointBackgroundColor: (type === 'line') ? '#F2F3F5' : undefined, tension: (type === 'line') ? 0.1 : undefined };
        if (type === 'doughnut') {
            chartData = { labels: labels, datasets: [{ data: data, backgroundColor: chartColors, borderColor: 'var(--background-secondary)', borderWidth: 2 }] };
            chartOptions.scales = {};
        } else {
            chartData = { labels: labels, datasets: [datasetOptions] };
        }
        const newChart = new Chart(canvas, { type: type, data: chartData, options: chartOptions });
        activeCharts.push(newChart);
        const copyChartBtn = document.createElement('button');
        copyChartBtn.className = 'copy-chart-btn';
        copyChartBtn.innerText = 'Copiar Gráfico';
        copyChartBtn.addEventListener('click', async () => {
            try {
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                await navigator.clipboard.write([ new ClipboardItem({ 'image/png': blob }) ]);
                copyChartBtn.innerText = 'Copiado!';
                setTimeout(() => { copyChartBtn.innerText = 'Copiar Gráfico'; }, 2000);
            } catch (err) { console.error('Falha ao copiar gráfico:', err); copyChartBtn.innerText = 'Falhou!'; setTimeout(() => { copyChartBtn.innerText = 'Copiar Gráfico'; }, 2000); }
        });
        chartCard.appendChild(copyChartBtn);
    }
    // Função para criar tabelas de dados
    function createTable(titleText, dataCounts) {
        const tableCard = document.createElement('div');
        tableCard.className = 'table-card';
        insightsContainer.appendChild(tableCard);
        const title = document.createElement('h4');
        title.innerText = titleText;
        tableCard.appendChild(title);
        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'client-table-wrapper';
        tableCard.appendChild(tableWrapper);
        const table = document.createElement('table');
        tableWrapper.appendChild(table);
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        const th1 = document.createElement('th');
        th1.innerText = titleText.replace('Itens por ', '');
        headerRow.appendChild(th1);
        const th2 = document.createElement('th');
        th2.innerText = 'Quantidade';
        headerRow.appendChild(th2);
        const tbody = table.createTBody();
        const sortedData = Object.entries(dataCounts).sort(([, a], [, b]) => b - a);
        sortedData.forEach(([item, count]) => {
            const row = tbody.insertRow();
            row.insertCell().innerText = item;
            row.insertCell().innerText = count;
        });
        const copyTableBtn = document.createElement('button');
        copyTableBtn.className = 'copy-table-btn';
        copyTableBtn.innerText = 'Copiar Tabela';
        copyTableBtn.addEventListener('click', async () => {
            let tableText = `${headerRow.cells[0].innerText}\t${headerRow.cells[1].innerText}\n`;
            sortedData.forEach(([item, count]) => { tableText += `${item}\t${count}\n`; });
            try {
                await navigator.clipboard.writeText(tableText);
                copyTableBtn.innerText = 'Copiado!';
                setTimeout(() => { copyTableBtn.innerText = 'Copiar Tabela'; }, 2000);
            } catch (err) { console.error('Falha ao copiar tabela:', err); copyTableBtn.innerText = 'Falhou!'; setTimeout(() => { copyTableBtn.innerText = 'Copiar Tabela'; }, 2000); }
        });
        tableCard.appendChild(copyTableBtn);
    }
});