import 'dotenv/config';

import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import os from 'os';
import logger from './logger.js';
import { renderEfirGraphic } from './templateRenderer.js';
import { resolveFromRoot, PROJECT_ROOT } from './utils/paths.js';



// Глобальный cwd при старте (можно использовать напрямую)
// const CWD = process.cwd();
// const absFromCwd = (p) => {
//     console.log('НАШ ПУТЬ КВД PPPPPP', p)
//     return path.isAbsolute(p) ? p : path.join(CWD, p)
// };




const arrTv = [
    {
        name: 'UTV',
        subname: [
            {
                logo: 'Логотип',
                style: 'Фирменный Бланк',
                brand: 'Брендбук',
                font: 'Шрифт',
            }
        ]
    },
    {
        name: 'UTV Media',
        subname: [
            {
                logo: 'Логотип',
                style: 'Фирменный стиль',
                brand: 'Брендбук',
                font: 'Шрифт',
            }
        ]
    },
    {
        name: 'Живи Активно',
        subname: [
            {
                logo: 'Логотип',
                style: 'Фирменный стиль',
                brand: 'Брендбук',
                font: 'Шрифт',
            }
        ]
    },
    {
        name: 'Сумико',
        subname: [
            {
                logo: 'Логотип',
                style: 'Фирменный стиль',
                brand: 'Брендбук',
                font: 'Шрифт',
            }
        ]
    },
    {
        name: 'HOME4K',
        subname: [
            {
                logo: 'Логотип',
                style: 'Фирменный стиль',
                brand: 'Брендбук',
                font: 'Шрифт',
            }
        ]
    },
    {
        name: 'Живая природа',
        subname: [
            {
                logo: 'Логотип',
                style: 'Фирменный стиль',
                brand: 'Брендбук',
                font: 'Шрифт',
            }
        ]
    },
    {
        name: 'Глазами туриста',
        subname: [
            {
                nlogo: 'Логотип',
                style: 'Фирменный стиль',
                brand: 'Брендбук',
                font: 'Шрифт',
            }
        ]
    },
    {
        name: 'UTV Production',
        subname: [
            {
                logo: 'Логотип',
                style: 'Фирменный стиль',
                brand: 'Брендбук',
                font: 'Шрифт',
            }
        ]
    },
    {
        name: 'Уфанет и пр',
        subname: [
            {
                logo: 'Логотип',
                style: 'Фирменный стиль',
                brand: 'Брендбук',
                font: 'Шрифт',
            }
        ]
    },
];

const token = process.env.BOT_TOKEN;
if (!token) {
    throw new Error('Не задан BOT_TOKEN в переменных окружения');
}

const bot = new TelegramBot(token, { polling: true });

logger.info('Бот запущен...');

// --- КЕШ file_id и стриминговая отправка ---
const FILE_ID_DB = resolveFromRoot('.file_id_cache.json');
let fileIdCache = {};
try {
    if (fs.existsSync(FILE_ID_DB)) {
        const raw = fs.readFileSync(FILE_ID_DB, 'utf8') || '{}';
        fileIdCache = JSON.parse(raw);
        console.log('НАШ КЕШ ФАЙЛ ID', fileIdCache)
    }
} catch (e) {
    logger.warn({ err: e }, 'Не удалось загрузить кеш file_id');
}

function persistFileIdCache() {
    try {
        fs.writeFileSync(FILE_ID_DB, JSON.stringify(fileIdCache, null, 2), 'utf8');
    } catch (e) {
        logger.warn({ err: e }, 'Ошибка сохранения кеша file_id');
    }
}

async function fileKeyForCache(absPath, stats) {
    try {
        const st = stats || await fsPromises.stat(absPath);
        return `${absPath}:${st.size}:${st.mtimeMs}`;
    } catch (e) {
        logger.debug({ err: e, path: absPath }, 'fileKeyForCache: не удалось получить stat');
        return absPath;
    }
}

const MAX_CONCURRENT_SENDS = 2;
let currentSends = 0;
async function withSendSlot(fn) {
    while (currentSends >= MAX_CONCURRENT_SENDS) {
        await new Promise(r => setTimeout(r, 200));
    }
    currentSends++;
    try {
        return await fn();
    } finally {
        currentSends--;
    }
}

async function sendLocalFile(chatId, relativePath, caption) {
    // Пути относительно process.cwd()
    const absPath = resolveFromRoot(relativePath);
    logger.info({ chatId, path: absPath }, 'sendLocalFile: попытка отправки');

    let stats;
    try {
        stats = await fsPromises.stat(absPath);
    } catch (err) {
        if (err && err.code === 'ENOENT') {
            logger.warn({ chatId, path: absPath }, 'sendLocalFile: файл не найден');
            return bot.sendMessage(chatId, `Файл не найден: ${relativePath}`);
        }
        logger.error({ err, chatId, path: absPath }, 'sendLocalFile: не удалось получить информацию о файле');
        return bot.sendMessage(chatId, 'Не удалось открыть файл для отправки.');
    }

    const cacheKey = await fileKeyForCache(absPath, stats);
    const cachedFileId = fileIdCache[cacheKey];
    if (cachedFileId) {
        try {
            logger.debug({ chatId, cacheKey }, 'sendLocalFile: отправка по cached file_id');
            return await withSendSlot(() => bot.sendDocument(chatId, cachedFileId, { caption }));
        } catch (err) {
            logger.warn({ err, chatId, cacheKey }, 'sendLocalFile: ошибка при отправке по cached file_id, будем загружать файл заново');
        }
    }

    const stream = fs.createReadStream(absPath);
    try {
        const sent = await withSendSlot(() => bot.sendDocument(chatId, stream, { caption }));
        const fileId = sent && sent.document && sent.document.file_id;
        if (fileId) {
            fileIdCache[cacheKey] = fileId;
            persistFileIdCache();
        }
        logger.info({ chatId, path: absPath }, 'sendLocalFile: файл отправлен');
        return sent;
    } catch (e) {
        logger.error({ err: e, chatId, path: absPath }, 'sendLocalFile: ошибка при отправке файла');
        return bot.sendMessage(chatId, `Ошибка при отправке файла: ${e && e.message ? e.message : e}`);
    }
}

async function sendPhotoFromBuffer(chatId, buffer, caption, filename = 'efir-template.png') {
    const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'tgbot-'));
    const tmpFile = path.join(tmpDir, filename);
    try {
        await fsPromises.writeFile(tmpFile, buffer);
        await withSendSlot(() => bot.sendPhoto(chatId, tmpFile, { caption }, { filename, contentType: 'image/png' }));
    } finally {
        try {
            await fsPromises.unlink(tmpFile);
        } catch (err) {
            logger.warn({ err, path: tmpFile }, 'sendPhotoFromBuffer: не удалось удалить временный файл');
        }
        try {
            await fsPromises.rm(tmpDir, { recursive: true, force: true });
        } catch (err) {
            logger.warn({ err, path: tmpDir }, 'sendPhotoFromBuffer: не удалось удалить временную папку');
        }
    }
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    logger.info({ chatId }, 'Триггер: /start');
    showMainMenu(chatId);
});

bot.onText(/Телеканалы/, (msg) => {
    const chatId = msg.chat.id;
    logger.info({ chatId }, 'Триггер: Телеканалы');
    showChannels(chatId);
});

bot.onText(/Генерация текста для эфира/, (msg) => {
    const chatId = msg.chat.id;
    logger.info({ chatId }, 'Триггер: Генерация текста для эфира');
    promptEfirText(chatId);
});

bot.onText(/Что где лежит/, (msg) => {
    const chatId = msg.chat.id;
    logger.info({ chatId }, 'Триггер: Что где лежит');
    showWhatWhere(chatId);
});

bot.onText(/Проекты дизайнеров/, (msg) => {
    const chatId = msg.chat.id;
    logger.info({ chatId }, 'Триггер: Проекты дизайнеров');
    const message = "\\utv2.core.ufanet.ru\\UTV\\Дизайн";
    bot.sendMessage(chatId, message).catch(err => logger.warn({ err, chatId }, 'Ошибка отправки текста для Проекты дизайнеров'));
});

bot.onText(/Фотобанк/, (msg) => {
    const chatId = msg.chat.id;
    logger.info({ chatId }, 'Триггер: Фотобанк');
    const message = "\\utv2.core.ufanet.ru\\UTV\\Фото Банк";
    bot.sendMessage(chatId, message).catch(err => logger.warn({ err, chatId }, 'Ошибка отправки текста для фотобанк'));
});

bot.onText(/Шаблоны для новостей в фигме/, (msg) => {
    const chatId = msg.chat.id;
    logger.info({ chatId }, 'Триггер: Шаблоны для новостей в фигме');
    const message = `• <a href="https://www.figma.com/design/2e4JbnCKqyWj15QhkaRXlv/%D1%88%D0%B0%D0%B1%D0%BB%D0%BE%D0%BD-%D1%83%D0%BB%D0%B8%D1%86%D1%8B-%D0%B8-%D0%B2%D0%BE%D0%B4%D0%B0?node-id=0-1&t=2tBPxMNSdIYW4xoL-0">Перекрытия</a>\n` +
        `• <a href="https://www.figma.com/design/5uuK7vwboEau7XDFGpcUPi/%D0%98%D1%82%D0%BE%D0%B3%D0%B8?node-id=0-1&p=f&t=2p1sR8sLebWv0P3D-0">Обложки</a>\n` +
        `• <a href="https://www.figma.com/design/asJoqHwnNuTWrw77Fefek8/%D0%9D%D0%BE%D0%B2%D0%BE%D1%81%D1%82%D0%B8_%D0%BF%D0%BB%D0%B0%D1%88%D0%BA%D0%B8?node-id=0-1&p=f&t=bFErVjQ1qsO9EPwq-0">Плашки подписи и др</a>`;
    bot.sendMessage(chatId, message, { parse_mode: 'HTML', disable_web_page_preview: false });
});

bot.onText(/Логотип/, (msg) => {
    const chatId = msg.chat.id;
    logger.info({ chatId }, 'Триггер: Логотип');
    showLogoOptions(chatId);
});

bot.onText(/Где заполнить заявку на Дизайн/, (msg) => {
    const chatId = msg.chat.id;
    logger.info({ chatId }, 'Триггер: Где заполнить заявку на Дизайн');
    bot.sendMessage(chatId, 'А вот же\nhttps://utv-editors.tw1.su/');
});

// Обработчики вариантов логотипа
bot.onText(/Цветной|цветной/, (msg) => {
    const chatId = msg.chat.id;
    const state = chatState.get(chatId);
    const channelName = state && state.selectedChannel;
    if (!channelName) return bot.sendMessage(chatId, 'Сначала выберите канал.');
    return safeSendAsset(chatId, channelName, 'logo_color', `Логотип — цветной (${channelName})`);
});

bot.onText(/белый/, (msg) => {
    const chatId = msg.chat.id;
    const state = chatState.get(chatId);
    const channelName = state && state.selectedChannel;
    if (!channelName) return bot.sendMessage(chatId, 'Сначала выберите канал.');
    return safeSendAsset(chatId, channelName, 'logo_white', `Логотип — белый (${channelName})`);
});

bot.onText(/черный/, (msg) => {
    const chatId = msg.chat.id;
    const state = chatState.get(chatId);
    const channelName = state && state.selectedChannel;
    if (!channelName) return bot.sendMessage(chatId, 'Сначала выберите канал.');
    return safeSendAsset(chatId, channelName, 'logo_black', `Логотип — черный (${channelName})`);
});

bot.onText(/вектор/, (msg) => {
    const chatId = msg.chat.id;
    const state = chatState.get(chatId);
    const channelName = state && state.selectedChannel;
    if (!channelName) return bot.sendMessage(chatId, 'Сначала выберите канал.');
    return safeSendAsset(chatId, channelName, 'logo_vector', `Логотип — вектор (${channelName})`);
});

function normalizeKey(name) {
    return name.toString().toLowerCase().replace(/[^a-z0-9а-яё]+/g, '');
}

const FILES_ROOT = resolveFromRoot('files');
const FILE_MAP_TTL_MS = 5 * 60 * 1000;
let fileMapCache = { map: {}, nameIndex: {}, builtAt: 0 };
let fileMapBuilding = null;

async function readDirSafe(dir) {
    try {
        return await fsPromises.readdir(dir, { withFileTypes: true });
    } catch (err) {
        if (err && err.code !== 'ENOENT') {
            logger.warn({ err, dir }, 'readDirSafe: не удалось прочитать каталог');
        }
        return [];
    }
}

async function listFilesSafe(dir) {
    const entries = await readDirSafe(dir);
    const files = [];
    for (const entry of entries) {
        if (entry.isFile()) {
            files.push(path.join(dir, entry.name));
        }
    }
    return files;
}

async function buildFileMap() {
    logger.info({ base: FILES_ROOT }, 'buildFileMap: старт асинхронного сканирования');
    const map = {};
    const nameIndex = {};
    const channels = await readDirSafe(FILES_ROOT);
    for (const dirent of channels) {
        if (!dirent.isDirectory()) continue;
        const chFolder = path.join(FILES_ROOT, dirent.name);
        map[dirent.name] = map[dirent.name] || {};
        nameIndex[normalizeKey(dirent.name)] = dirent.name;

        const children = await readDirSafe(chFolder);
        for (const child of children) {
            if (!child.isDirectory()) continue;
            const childName = child.name.toLowerCase();
            const childPath = path.join(chFolder, child.name);

            let assetKey = null;
            if (childName.includes('цвет')) assetKey = 'logo_color';
            else if (childName.includes('бел')) assetKey = 'logo_white';
            else if (childName.includes('черн')) assetKey = 'logo_black';
            else if (childName.includes('вектор')) assetKey = 'logo_vector';
            else if (childName.includes('бренд')) assetKey = 'brandbook';
            else if (childName.includes('фир') || childName.includes('бланк')) assetKey = 'firmblank';
            else if (childName.includes('шрифт')) assetKey = 'font';

            if (assetKey) {
                const files = await listFilesSafe(childPath);
                if (files.length) {
                    map[dirent.name][assetKey] = files.map(f => resolveFromRoot(path.relative(CWD, f)));
                    logger.debug({ channel: dirent.name, assetKey, count: files.length }, 'buildFileMap: найден asset');
                }
                continue;
            }

            const grand = await readDirSafe(childPath);
            const hasAssetChild = grand.some(g => g.isDirectory() && /цвет|бел|черн|вектор|бренд|фир|шрифт/i.test(g.name));
            if (!hasAssetChild) continue;

            map[child.name] = map[child.name] || {};
            nameIndex[normalizeKey(child.name)] = child.name;
            for (const g of grand) {
                if (!g.isDirectory()) continue;
                const gName = g.name.toLowerCase();
                let assetKey2 = null;
                if (gName.includes('цвет')) assetKey2 = 'logo_color';
                else if (gName.includes('бел')) assetKey2 = 'logo_white';
                else if (gName.includes('черн')) assetKey2 = 'logo_black';
                else if (gName.includes('вектор')) assetKey2 = 'logo_vector';
                else if (gName.includes('бренд')) assetKey2 = 'brandbook';
                else if (gName.includes('фир') || gName.includes('бланк')) assetKey2 = 'firmblank';
                else if (gName.includes('шрифт')) assetKey2 = 'font';
                if (!assetKey2) continue;
                const files2 = await listFilesSafe(path.join(childPath, g.name));
                if (files2.length) {
                    map[child.name][assetKey2] = files2.map(f => resolveFromRoot(path.relative(CWD, f)));
                    logger.debug({ channel: child.name, assetKey: assetKey2, count: files2.length }, 'buildFileMap: найден asset у суббренда');
                }
            }
        }
    }
    fileMapCache = { map, nameIndex, builtAt: Date.now() };
    logger.info({ channels: Object.keys(map).length }, 'buildFileMap: завершено');
    return fileMapCache;
}

async function getFileMap(force = false) {
    const isFresh = Date.now() - fileMapCache.builtAt < FILE_MAP_TTL_MS && Object.keys(fileMapCache.map).length;
    if (!force && isFresh) return fileMapCache;
    if (!fileMapBuilding) {
        fileMapBuilding = buildFileMap().finally(() => {
            fileMapBuilding = null;
        });
    }
    return fileMapBuilding;
}

async function findFileEntry(channelName) {
    if (!channelName) return null;
    const { map, nameIndex } = await getFileMap();
    if (map[channelName]) return map[channelName];
    const k = normalizeKey(channelName);
    const real = nameIndex[k];
    if (real && map[real]) return map[real];
    logger.warn({ channelName }, 'findFileEntry: канал не найден');
    return null;
}

async function sendAsset(chatId, channelName, assetKey, caption) {
    logger.info({ chatId, channel: channelName, assetKey }, 'sendAsset: запрос отправки');
    const entry = await findFileEntry(channelName);
    if (!entry) {
        logger.warn({ chatId, channelName, assetKey }, 'sendAsset: отсутствует запись для канала');
        return bot.sendMessage(chatId, 'Будет позже');
    }
    const rel = entry[assetKey];
    if (!rel) {
        logger.warn({ chatId, channelName, assetKey }, 'sendAsset: файлы для assetKey не найдены');
        return bot.sendMessage(chatId, 'Будет позже');
    }
    if (Array.isArray(rel)) {
        logger.info({ chatId, channel: channelName, assetKey, count: rel.length }, 'sendAsset: отправка нескольких файлов');
        for (const p of rel) {
            await sendLocalFile(chatId, p, caption || `${channelName} — ${assetKey}`);
        }
        return;
    }
    return sendLocalFile(chatId, rel, caption || `${channelName} — ${assetKey}`);
}

async function safeSendAsset(chatId, channelName, assetKey, caption) {
    try {
        return await sendAsset(chatId, channelName, assetKey, caption);
    } catch (error) {
        logger.error({ err: error, chatId, channel: channelName, assetKey }, 'safeSendAsset: ошибка отправки');
        return bot.sendMessage(chatId, 'Не удалось отправить файл, попробуйте ещё раз позже.');
    }
}

// минимальное состояние чата — выбранный канал
const chatState = new Map();
const chatCleanupTimers = new Map();
const CHAT_STATE_TTL_MS = 60 * 60 * 1000;

function scheduleStateCleanup(chatId) {
    if (chatCleanupTimers.has(chatId)) {
        clearTimeout(chatCleanupTimers.get(chatId));
    }
    const timer = setTimeout(() => {
        chatState.delete(chatId);
        chatCleanupTimers.delete(chatId);
        logger.debug({ chatId }, 'chatState: очищено состояние');
    }, CHAT_STATE_TTL_MS);
    chatCleanupTimers.set(chatId, timer);
}

function ensureState(chatId) {
    if (!chatState.has(chatId)) {
        chatState.set(chatId, { stack: [], selectedChannel: null, pendingAction: null, pendingPayload: null });
    }
    const state = chatState.get(chatId);
    state.updatedAt = Date.now();
    scheduleStateCleanup(chatId);
    return state;
}

function setPendingAction(chatId, action, payload = null) {
    const state = ensureState(chatId);
    state.pendingAction = action;
    state.pendingPayload = payload;
}

function resetPendingAction(chatId) {
    const state = ensureState(chatId);
    state.pendingAction = null;
    state.pendingPayload = null;
}

function makeTwoColumnKeyboard(labels, { includeBack = true } = {}) {
    const keyboard = [];
    for (let i = 0; i < labels.length; i += 2) {
        const row = [{ text: labels[i] }];
        if (i + 1 < labels.length) row.push({ text: labels[i + 1] });
        keyboard.push(row);
    }
    if (includeBack) {
        keyboard.push([{ text: 'Назад' }]);
    }
    return keyboard;
}

function pushView(chatId, view) {
    const state = ensureState(chatId);
    state.stack.push(view);
    logger.debug({ chatId, view }, 'pushView');
}

function popView(chatId) {
    const state = ensureState(chatId);
    const v = state.stack.pop();
    logger.debug({ chatId, view: v }, 'popView');
    return v;
}

function currentView(chatId) {
    const state = ensureState(chatId);
    const s = state.stack;
    return s.length ? s[s.length - 1] : null;
}

function showMainMenu(chatId) {
    // reset stack to main
    const state = ensureState(chatId);
    state.stack = ['main'];
    state.selectedChannel = null;
    resetPendingAction(chatId);
    logger.debug({ chatId }, 'showMainMenu');
    bot.sendMessage(chatId, 'Добро пожаловать, выберите действие:', {
        reply_markup: {
            keyboard: [
                [{ text: 'Телеканалы' }, { text: 'Генерация текста для эфира' }],
                [{ text: 'Что где лежит' }], [{ text: 'Где заполнить заявку на Дизайн' }]
            ],
            resize_keyboard: true
        }
    });
}

function showChannels(chatId) {
    ensureState(chatId);
    if (currentView(chatId) !== 'channels') pushView(chatId, 'channels');
    logger.debug({ chatId }, 'showChannels');
    const keyboard = makeTwoColumnKeyboard(arrTv.map(c => c.name));
    bot.sendMessage(chatId, 'Выберите нужный канал:', { reply_markup: { keyboard, resize_keyboard: true } });
}

const ufanetSubs = ['Уфанет', 'Свос', 'Авантис', 'ССС'];

function showUfanetSubs(chatId) {
    ensureState(chatId);
    if (currentView(chatId) !== 'ufanet_subs') pushView(chatId, 'ufanet_subs');
    logger.debug({ chatId }, 'showUfanetSubs');
    const keyboard = [
        [{ text: 'Уфанет' }, { text: 'Свос' }],
        [{ text: 'Авантис' }, { text: 'ССС' }],
        [{ text: 'Назад' }]
    ];
    bot.sendMessage(chatId, 'Выберите подраздел Уфанет:', { reply_markup: { keyboard, resize_keyboard: true } });
}

function showChannelSubmenu(chatId, channel) {
    ensureState(chatId);
    if (channel === 'Уфанет и пр') {
        return showUfanetSubs(chatId);
    }

    const view = `channel:${channel}`;
    if (currentView(chatId) !== view) pushView(chatId, view);
    ensureState(chatId).selectedChannel = channel;
    logger.info({ chatId, channel }, 'showChannelSubmenu');
    const ch = arrTv.find(c => c.name === channel);
    const labels = [];
    if (ch) {
        for (const subObj of ch.subname) {
            for (const v of Object.values(subObj)) labels.push(v);
        }
    } else {
        labels.push('Логотип', 'Фирменный бланк', 'Брендбук', 'Шрифт');
    }
    const keyboard = makeTwoColumnKeyboard(labels);
    bot.sendMessage(chatId, `Выбран канал: ${channel}\nВыберите действие:`, { reply_markup: { keyboard, resize_keyboard: true } });
}

function showWhatWhere(chatId) {
    ensureState(chatId);
    if (currentView(chatId) !== 'what_where') pushView(chatId, 'what_where');
    logger.debug({ chatId }, 'showWhatWhere');
    const keyboard = [
        [{ text: 'Проекты дизайнеров' }, { text: 'Фотобанк' }],
        [{ text: 'Шаблоны для новостей в фигме' }],
        [{ text: 'Назад' }]
    ];
    bot.sendMessage(chatId, 'Что вы хотите найти?', { reply_markup: { keyboard, resize_keyboard: true } });
}

function showLogoOptions(chatId) {
    ensureState(chatId);
    if (currentView(chatId) !== 'logo_options') pushView(chatId, 'logo_options');
    logger.debug({ chatId }, 'showLogoOptions');
    const keyboard = makeTwoColumnKeyboard(['Цветной', 'белый', 'черный', 'вектор']);
    bot.sendMessage(chatId, 'Какой лого вам нужен?\nЛоготипы сразу будут в двух вариантах с прозрачным и белым фоном', { reply_markup: { keyboard, resize_keyboard: true } });
}

function promptEfirText(chatId, { reminder } = {}) {
    ensureState(chatId);
    if (currentView(chatId) !== 'efir_generate') pushView(chatId, 'efir_generate');
    setPendingAction(chatId, 'efir_text');
    const keyboard = [
        [{ text: 'Отмена' }],
        [{ text: 'Назад' }]
    ];
    bot.sendMessage(chatId, reminder || 'Введите текст, который нужно разместить на плашке (до 2 строк).', {
        reply_markup: { keyboard, resize_keyboard: true }
    });
}

async function generateEfirImage(chatId, text) {
    const trimmed = text.trim();
    if (!trimmed) {
        bot.sendMessage(chatId, 'Текст не должен быть пустым. Попробуйте снова.');
        promptEfirText(chatId, { reminder: 'Введите текст для плашки:' });
        return;
    }

    try {
        const buffer = await renderEfirGraphic(trimmed);
        await sendPhotoFromBuffer(chatId, buffer, 'Черновик плашки');
        setPendingAction(chatId, 'efir_edit', { lastText: trimmed });
        const keyboard = [
            [{ text: 'Изменить текст' }, { text: 'Готово' }],
            [{ text: 'Назад' }]
        ];
        bot.sendMessage(chatId, 'Если нужно изменить текст, отправьте новый вариант или нажмите «Изменить текст». Когда всё готово — нажмите «Готово».', {
            reply_markup: { keyboard, resize_keyboard: true }
        });
    } catch (err) {
        logger.error({ err }, 'generateEfirImage: ошибка рендеринга');
        bot.sendMessage(chatId, 'Не удалось создать изображение. Попробуйте снова позже.');
        promptEfirText(chatId, { reminder: 'Введите текст для плашки:' });
    }
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    logger.debug({ chatId, text }, 'incoming message');

    if (!text) return;
    const state = ensureState(chatId);

    if (state.pendingAction === 'efir_text') {
        if (text === 'Отмена' || text === 'Назад') {
            resetPendingAction(chatId);
            showMainMenu(chatId);
            return;
        }
        await generateEfirImage(chatId, text);
        return;
    }

    if (state.pendingAction === 'efir_edit') {
        if (text === 'Готово') {
            resetPendingAction(chatId);
            showMainMenu(chatId);
            return;
        }
        if (text === 'Изменить текст') {
            promptEfirText(chatId, { reminder: 'Введите новый текст для плашки:' });
            return;
        }
        if (text === 'Отмена' || text === 'Назад') {
            resetPendingAction(chatId);
            showMainMenu(chatId);
            return;
        }
        await generateEfirImage(chatId, text);
        return;
    }

    const skipDirect = ['Логотип', 'Проекты дизайнеров', 'Фотобанк', 'Шаблоны для новостей в фигме', 'Где заполнить заявку на Дизайн'];
    const extraSkip = ['Цветной', 'цветной', 'белый', 'черный', 'вектор', 'Изменить текст', 'Готово', 'Отмена'];
    if (extraSkip.includes(text)) return;
    if (skipDirect.includes(text)) return;

    if (text === 'Назад') {
        logger.debug({ chatId }, 'user pressed Назад');
        popView(chatId);
        const prev = currentView(chatId);
        if (!prev || prev === 'main') {
            showMainMenu(chatId);
        } else if (prev === 'channels') {
            showChannels(chatId);
        } else if (prev === 'what_where') {
            showWhatWhere(chatId);
        } else if (prev === 'logo_options') {
            showLogoOptions(chatId);
        } else if (prev === 'efir_generate') {
            resetPendingAction(chatId);
            showMainMenu(chatId);
        } else if (prev && prev.startsWith('channel:')) {
            const ch = prev.split(':')[1];
            showChannelSubmenu(chatId, ch);
        } else {
            showMainMenu(chatId);
        }
        return;
    }

    if (ufanetSubs.includes(text)) {
        showChannelSubmenu(chatId, text);
        logger.info({ chatId, channel: text }, 'user selected ufanet sub');
        return;
    }

    const channel = arrTv.find(c => c.name === text);
    if (channel) {
        showChannelSubmenu(chatId, channel.name);
        logger.info({ chatId, channel: channel.name }, 'user selected channel');
        return;
    }

    let found = false;
    for (const c of arrTv) {
        for (const subObj of c.subname) {
            for (const v of Object.values(subObj)) {
                if (v === text) {
                    found = true;
                    const state = chatState.get(chatId);
                    const channelName = (state && state.selectedChannel) || c.name;
                    const lowercase = v.toLowerCase();
                    if (lowercase.includes('логотип')) {
                        safeSendAsset(chatId, channelName, 'logo_color', `Логотип ${channelName}`);
                    } else if (lowercase.includes('фирмен') || lowercase.includes('бланк')) {
                        safeSendAsset(chatId, channelName, 'firmblank', `Фирменный бланк ${channelName}`);
                    } else if (lowercase.includes('бренд')) {
                        safeSendAsset(chatId, channelName, 'brandbook', `Брендбук ${channelName}`);
                    } else if (lowercase.includes('шрифт')) {
                        safeSendAsset(chatId, channelName, 'font', `Шрифт ${channelName}`);
                    } else {
                        bot.sendMessage(chatId, `Вы выбрали "${v}" для канала "${c.name}". Здесь можно отправить ссылку/файл или выполнить действие.`);
                    }
                    break;
                }
            }
            if (found) break;
        }
        if (found) break;
    }
});