import path from 'path';
import fs from 'fs';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import logger from './logger.js';

const TEMPLATE_PATH = path.resolve('Files/Efir/bg.png');
const FONT_PATH = path.resolve('assets/fonts/Oswald-Regular.ttf');
const FONT_FAMILY = 'Oswald';

if (fs.existsSync(FONT_PATH)) {
    try {
        GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
        logger.info({ font: FONT_FAMILY }, 'templateRenderer: шрифт зарегистрирован');
    } catch (err) {
        logger.error({ err }, 'templateRenderer: не удалось зарегистрировать шрифт');
    }
} else {
    logger.warn({ path: FONT_PATH }, 'templateRenderer: файл шрифта не найден');
}

async function ensureTemplate() {
    if (!fs.existsSync(TEMPLATE_PATH)) {
        throw new Error(`Шаблон не найден: ${TEMPLATE_PATH}`);
    }
    return loadImage(TEMPLATE_PATH);
}

function wrapTextIntoLines(ctx, text, maxWidth, maxLines, fontSize) {
    const clean = text.trim().replace(/\s+/g, ' ');
    if (!clean) return [''];

    const explicitLines = clean.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const words = explicitLines.length > 1 ? explicitLines : clean.split(' ');

    const lines = [];
    let currentLine = '';

    const pushLine = (line) => {
        if (line.length) lines.push(line.trim());
    };

    for (const word of words) {
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        const width = ctx.measureText(candidate).width;
        if (width <= maxWidth) {
            currentLine = candidate;
        } else {
            if (!currentLine) {
                // слово длиннее maxWidth, принудительно режем
                let chunk = '';
                for (const char of word) {
                    const test = chunk + char;
                    if (ctx.measureText(test).width > maxWidth) {
                        pushLine(chunk);
                        chunk = char;
                        if (lines.length === maxLines) return lines;
                    } else {
                        chunk = test;
                    }
                }
                currentLine = chunk;
            } else {
                pushLine(currentLine);
                if (lines.length === maxLines) return lines;
                currentLine = word;
            }
        }
        if (lines.length === maxLines) break;
    }

    if (lines.length < maxLines && currentLine) pushLine(currentLine);
    if (lines.length > maxLines) return lines.slice(0, maxLines);

    // Если меньше строк, но требуется две — добавим пустую вторую
    if (lines.length === 1 && maxLines > 1) {
        lines.push('');
    }
    return lines;
}

export async function renderEfirGraphic(text) {
    const templateImage = await ensureTemplate();
    const canvas = createCanvas(templateImage.width, templateImage.height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(templateImage, 0, 0, canvas.width, canvas.height);

    const fontSize = Math.floor(canvas.width * 0.04); // ~4% ширины
    const maxWidth = canvas.width * 0.7;
    ctx.font = `600 ${fontSize}px "${FONT_FAMILY}", sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lines = wrapTextIntoLines(ctx, text, maxWidth, 2, fontSize);
    const lineHeight = fontSize * 1.3;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const totalHeight = lineHeight * (lines.length - 1);
    let offsetY = centerY - totalHeight / 2;

    for (const line of lines) {
        ctx.fillText(line, centerX, offsetY);
        offsetY += lineHeight;
    }

    return canvas.toBuffer('image/png');
}

