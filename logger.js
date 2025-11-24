import { execSync } from 'child_process';
import pino from 'pino';

if (process.platform === 'win32') {
    try {
        execSync('chcp 65001 >NUL');
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Не удалось переключить кодировку консоли на UTF-8:', err && err.message);
    }
}

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime
});

export default logger;

