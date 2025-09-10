// Este código lida com o efeito de gradiente reativo ao mouse.
document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    // Garante que o evento só seja adicionado se o body existir
    if (body) {
        window.addEventListener('mousemove', (e) => {
            // Usa variáveis CSS para uma atualização de performance mais alta
            body.style.setProperty('--x', e.clientX + 'px');
            body.style.setProperty('--y', e.clientY + 'px');
        });
    }
});