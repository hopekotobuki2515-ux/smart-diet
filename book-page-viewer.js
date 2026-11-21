'use strict';
// Paper-page images must not be exposed until public distribution is authorized.
// This module does not use or alter the 686-food master or 80-kcal calculations.
const manifestUrl = './book-page-manifest.json';
const pageMin = 229, pageMax = 255;
let manifestPromise;
let approvedPages = new Map();
let viewer;

function validEntry(entry) {
  if (!entry || !Number.isInteger(entry.page) || entry.page < pageMin || entry.page > pageMax) return false;
  if (entry.publicAuthorized !== true || typeof entry.rightsReference !== 'string' || !entry.rightsReference.trim()) return false;
  if (typeof entry.image !== 'string') return false;
  const match = entry.image.match(/^\.\/book-pages\/page-(\d{3})\.(png|jpe?g|webp)$/i);
  return Boolean(match) && Number(match[1]) === entry.page;
}

function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(manifestUrl, {cache: 'no-store'})
      .then(response => {
        if (!response.ok) throw Error('manifest HTTP ' + response.status);
        return response.json();
      })
      .then(data => {
        if (data?.schemaVersion !== 1 || !Array.isArray(data.pages)) throw Error('invalid manifest');
        const next = new Map();
        for (const entry of data.pages) if (validEntry(entry) && !next.has(entry.page)) next.set(entry.page, entry);
        approvedPages = next;
        return approvedPages;
      })
      .catch(error => {
        console.warn('書籍ページ画像は公開されていません:', error);
        return approvedPages;
      });
  }
  return manifestPromise;
}

function buildViewer() {
  if (viewer) return viewer;
  const css = document.createElement('style');
  css.textContent = `
    .book-page-control { margin-top: 12px; }
    .book-page-pending { margin: 0; font-size: 12px; color: #64728a; line-height: 1.6; }
    .book-page-open { display: block; width: 100%; min-height: 44px; padding: 11px; border: 1px solid #76b18a; background: #f0f9f2; color: #245d3a; border-radius: 10px; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
    .book-page-open:focus-visible, .book-page-close:focus-visible, .book-page-image-link:focus-visible { outline: 3px solid #d9a75b; outline-offset: 2px; }
    .book-page-dialog { box-sizing: border-box; width: min(95vw, 920px); max-width: 95vw; max-height: 92vh; max-height: 92dvh; padding: 16px; overflow: auto; border: 0; border-radius: 16px; color: #233830; background: #fff; box-shadow: 0 16px 50px #122b2255; }
    .book-page-dialog::backdrop { background: rgba(12, 29, 20, .78); }
    .book-page-dialog-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .book-page-dialog-title { margin: 0; font-size: 18px; }
    .book-page-close { border: 1px solid #cadacd; background: #fff; border-radius: 9px; padding: 8px 14px; min-height: 44px; font: inherit; cursor: pointer; }
    .book-page-image { display: block; max-width: 100%; width: auto; height: auto; max-height: 72vh; max-height: 72dvh; object-fit: contain; margin: 14px auto; }
    .book-page-message { font-size: 13px; line-height: 1.65; }
    .book-page-image-link { display: inline-block; margin-top: 8px; font-size: 14px; color: #286d4f; }
  `;
  document.head.append(css);

  const dialog = document.createElement('dialog');
  dialog.className = 'book-page-dialog';
  dialog.setAttribute('aria-label', '書籍の掲載ページ画像');

  const header = document.createElement('div'); header.className = 'book-page-dialog-header';
  const title = document.createElement('h2'); title.className = 'book-page-dialog-title';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'book-page-close'; close.textContent = '閉じる';
  close.addEventListener('click', () => dialog.close());
  header.append(title, close);

  const message = document.createElement('p'); message.className = 'book-page-message'; message.setAttribute('role','status');
  const image = document.createElement('img'); image.className = 'book-page-image'; image.hidden = true;
  const link = document.createElement('a'); link.className = 'book-page-image-link'; link.textContent = '画像を別タブで開いて拡大';
  link.target = '_blank'; link.rel = 'noopener noreferrer'; link.hidden = true;

  dialog.append(header, message, image, link);
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.body.append(dialog);
  viewer = {dialog, title, message, image, link};
  return viewer;
}

function openPage(page) {
  const entry = approvedPages.get(page);
  if (!entry) return;
  const {dialog, title, message, image, link} = buildViewer();
  image.onload = () => { message.textContent = ''; image.hidden = false; link.hidden = false; };
  image.onerror = () => { image.hidden = true; link.hidden = true; message.textContent = '画像を読み込めませんでした。公開用ファイルの配置を確認してください。'; };
  title.textContent = '書籍 ' + page + 'ページ';
  message.textContent = 'ページ画像を読み込んでいます。';
  image.hidden = true;
  link.hidden = true;
  image.alt = '書籍 ' + page + 'ページの掲載内容';
  image.src = entry.image;
  link.href = entry.image;
  if (!dialog.open) dialog.showModal();
}

export function createBookPageControl(page) {
  const root = document.createElement('div');
  root.className = 'book-page-control';
  const number = Number(page);
  if (!Number.isInteger(number) || number < pageMin || number > pageMax) return root;

  const pending = document.createElement('p');
  pending.className = 'book-page-pending';
  pending.textContent = '書籍 ' + number + 'ページの画像は、公開条件の確認待ちです。';
  root.append(pending);
  loadManifest().then(pages => {
    if (!root.isConnected || !pages.has(number)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'book-page-open';
    button.textContent = '書籍 ' + number + 'ページの画像を見る';
    button.addEventListener('click', () => openPage(number));
    root.replaceChildren(button);
  });
  return root;
}
