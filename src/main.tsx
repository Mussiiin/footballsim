import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// ---------------------------------------------------------------
// PWA: registro do service worker (apenas produção — não interfere no dev)
// Fluxo de atualização:
//   1. o SW novo instala e FICA PARADO (sem skipWaiting automático)
//   2. updatefound/statechange detecta "instalou porém há controlador antigo"
//   3. mostra banner "Nova versão disponível" com botão Atualizar
//   4. ao clicar, envia SKIP_WAITING → SW ativa → controllerchange → reload
// Quem está jogando decide quando atualizar; ninguém é derrubado à força.
// ---------------------------------------------------------------
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    let updateBanner: HTMLDivElement | null = null;
    let refreshing = false;

    // quando o SW novo assume o controle (após SKIP_WAITING), recarrega uma vez
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('./sw.js').then((reg) => {
      // verificação periódica: usuários que deixam o app aberto recebem a atualização
      setInterval(() => { void reg.update(); }, 60 * 60 * 1000);
      // ao voltar para a aba, verifica se há versão nova (pega o deploy sem precisar de reload manual)
      document.addEventListener('visibilitychange', () => { if (!document.hidden) void reg.update(); });
      window.addEventListener('focus', () => void reg.update());

      const showBanner = () => {
        if (updateBanner) return;
        updateBanner = document.createElement('div');
        updateBanner.id = 'fs-update-banner';
        updateBanner.style.cssText =
          'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:9999;' +
          'display:flex;align-items:center;gap:12px;background:#0b0f19;border:1px solid #3ddc84;' +
          'border-radius:12px;padding:10px 16px;font-family:Inter,system-ui,sans-serif;' +
          'font-size:13px;color:#e2e8f0;box-shadow:0 8px 30px rgba(0,0,0,.5);max-width:92vw;';
        const text = document.createElement('span');
        text.textContent = '🔄 Nova versão disponível';
        const btn = document.createElement('button');
        btn.textContent = 'Atualizar agora';
        btn.style.cssText =
          'background:#3ddc84;color:#0b0f19;font-weight:700;border:none;border-radius:8px;' +
          'padding:6px 14px;cursor:pointer;font-family:inherit;font-size:12px;';
        btn.onclick = () => {
          if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          else void reg.update().then(() => window.location.reload());
        };
        updateBanner.appendChild(text);
        updateBanner.appendChild(btn);
        document.body.appendChild(updateBanner);
      };

      // quando o browser encontra um SW novo sendo instalado
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener('statechange', () => {
          // instalou, existe um controlador antigo ativo → há versão nova esperando
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            showBanner();
          }
        });
      });

      // já existe um SW novo esperando (instalou numa visita anterior)? mostra o
      // banner na hora — antes, o banner só aparecia se o install acontecesse
      // com a página aberta, deixando usuários presos na versão antiga.
      if (reg.waiting && navigator.serviceWorker.controller) {
        showBanner();
      }
    }).catch((err) => {
      console.warn('Falha ao registrar service worker:', err);
    });
  });
}
