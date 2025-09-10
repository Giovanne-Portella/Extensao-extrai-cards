// ==UserScript==
// @name         Extensão extrai cards
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Extrai informações de cards do Azure DevOps
// @author       Seu Nome
// @match        https://dev.azure.com/*/_boards/board*
// @grant        none
// ==/UserScript==

(() => {
    // Função para extrair o nome da coluna a partir do card
    const getColumnNameFromCard = (cardElement) => {
        const ariaLabel = cardElement.getAttribute('aria-label');
        if (!ariaLabel) return null;
        const match = ariaLabel.match(/, Column (.*?)\s*$/);
        return (match && match[1]) ? match[1].trim() : null;
    };
    // Função para extrair o valor de um campo específico
    const getFieldValue = (cardElement, label) => {
        const labels = cardElement.querySelectorAll('.field-container .label.text-ellipsis');
        for (let l of labels) {
            const labelText = l.innerText.trim();
            if (labelText.toLowerCase().startsWith(label.toLowerCase())) {
                const valueElement = l.nextElementSibling.querySelector('.text-ellipsis');
                return valueElement ? valueElement.innerText.trim() : '';
            }
        }
        return '';
    };
    // Função para extrair o nome do responsável
    const getAssignedToName = (cardElement) => {
        return cardElement.querySelector('.card-assigned-to .identity-display-name span')?.innerText.trim() || 'Não Atribuído';
    };
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "get_columns") {
            const columnNames = new Set();
            document.querySelectorAll('.wit-card').forEach(card => {
                const columnName = getColumnNameFromCard(card);
                if (columnName) columnNames.add(columnName);
            });
            sendResponse({ columnNames: Array.from(columnNames) });
            return true;
        }
        // Ação para extrair dados com filtros e colunas selecionadas
        if (request.action === "extract_data") {
            const filters = request.filters;
            const selectedColumns = request.selectedColumns;
            const groupedCards = {};
            const allCardsOnPage = document.querySelectorAll('.wit-card');
            allCardsOnPage.forEach(card => {
                const columnName = getColumnNameFromCard(card);
                if (columnName && selectedColumns.includes(columnName)) {
                    let isMatch = true;
                    const cardId = card.querySelector('.font-weight-semibold.selectable-text')?.innerText.trim().toLowerCase() || '';
                    const assignedTo = getAssignedToName(card).toLowerCase();
                    const clientName = getFieldValue(card, 'Cliente').toLowerCase();
                    const effortValue = getFieldValue(card, 'Esforço Esti').toLowerCase();
                    const cardTags = Array.from(card.querySelectorAll('.tags-list .bolt-pill-content')).map(t => t.innerText.trim().toLowerCase());
                    if (filters.name && !assignedTo.includes(filters.name.toLowerCase())) isMatch = false;
                    if (isMatch && filters.client && !clientName.includes(filters.client.toLowerCase())) isMatch = false;
                    if (isMatch && filters.id && !cardId.includes(filters.id.toLowerCase())) isMatch = false;
                    if (isMatch && filters.effort && !effortValue.includes(filters.effort.toLowerCase())) isMatch = false;
                    if (isMatch && filters.tags) {
                        const searchTags = filters.tags.toLowerCase().split(',').map(t => t.trim());
                        if (!searchTags.every(searchTag => cardTags.includes(searchTag))) isMatch = false;
                    }
                    if (isMatch) {
                        // Extrai o link correto do card
                        let finalLink = '#';
                        const linkElement = card.querySelector('a.bolt-link');
                        const relativeLink = linkElement ? linkElement.getAttribute('href') : null;
                        
                        if (relativeLink) {
                            const idMatch = relativeLink.match(/\d+$/); // Pega apenas os números no final do href
                            if (idMatch && idMatch[0]) {
                                const workItemId = idMatch[0];
                                // Monta o link com a base "chumbada" e o ID extraído
                                finalLink = `https://dev.azure.com/robbu/Suporte/_workitems/edit/${workItemId}`;
                            }
                        }
                        // Extrai os dados do card
                        const cardData = {
                            id: card.querySelector('.font-weight-semibold.selectable-text')?.innerText.trim() || '',
                            titulo: card.querySelector('.title-text.word-break')?.innerText.trim() || '',
                            link: finalLink, // Usa o link corrigido
                            cliente: getFieldValue(card, 'Cliente'),
                            statusN2: columnName,
                            createdDate: getFieldValue(card, 'Created Date'),
                            equipeResponsavel: getFieldValue(card, 'Equipe Responsável'),
                            assignedTo: getAssignedToName(card),
                            escalationDate: getFieldValue(card, 'Inicio pend')
                        };
                        if (!groupedCards[columnName]) groupedCards[columnName] = [];
                        groupedCards[columnName].push(cardData);
                    }
                }
            });
            chrome.runtime.sendMessage({ action: "display_grouped_results", data: groupedCards });
        }
        return request.action === "get_columns";
    });
})();