const MENU = 'pasteguard-inspect';
const MAX_SOURCE_LENGTH = 60_000;
const PASTE_SITES = [
  'https://pastebin.com/*',
  'https://paste.ee/*',
  'https://paste.sh/*',
  'https://gist.github.com/*',
  'https://greasyfork.org/*',
  'https://*.greasyfork.org/*',
  'https://raw.githubusercontent.com/*',
  'https://github.com/*',
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU,
      title: 'Inspect selected source with PasteGuard',
      contexts: ['selection'],
      documentUrlPatterns: PASTE_SITES,
    });
  });
});

chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU || !info.selectionText?.trim()) return;
  void openCapture(info.selectionText).catch((error) => console.error('PasteGuard capture failed:', error.message));
});

async function openCapture(source) {
  const id = `capture-${crypto.randomUUID()}`;
  await chrome.storage.session.set({
    [id]: { source: source.slice(0, MAX_SOURCE_LENGTH), truncated: source.length > MAX_SOURCE_LENGTH },
  });
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL(`index.html?capture=${id}`) });
  } catch (error) {
    await chrome.storage.session.remove(id);
    throw error;
  }
}
