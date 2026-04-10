const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// -------------------- TOKEN VA ADMIN --------------------
const BOT_TOKEN = process.env.BOT_TOKEN || '8779251766:AAH12INusgBCawsk5awqIjcyHnNLiq5A33A';

const ADMIN_PHONE = "+998979247888";
const ADMIN_IDS = [1437230485];
const DIAGNOSTIC_PRICE = 250000;
const MAX_CARS_PER_USER = 20;

// -------------------- ESLATMA MATNI --------------------
const REMINDER_MESSAGE = `
🚗 **Hurmatli mijoz!**

Agar avtomobilingiz doimo soz, ishonchli va yo‘llarda sizni yarim yo‘lda qoldirmasligini istasangiz — unda unga faqat professional va malakali mutaxassislar xizmat ko‘rsatishi muhim.

🛠️ **Sifatli xizmat** — bu nafaqat qulaylik, balki sizning xavfsizligingiz kafolatidir.

✅ Shuning uchun avtomobilingizni haqiqiy professionallarga ishonib topshiring!
`;

// -------------------- RAILWAY VOLUME YO'LLARI --------------------
const VOLUME_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const BACKUP_DIR = path.join(VOLUME_PATH, 'backups');
const DB_PATH = path.join(VOLUME_PATH, 'bot_data.db');

// Volume papkasini yaratish
function ensureVolumeDir() {
    if (!fs.existsSync(VOLUME_PATH)) {
        fs.mkdirSync(VOLUME_PATH, { recursive: true });
        console.log(`✅ Volume yaratildi: ${VOLUME_PATH}`);
    }
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        console.log(`✅ Backup papkasi yaratildi: ${BACKUP_DIR}`);
    }
}

// Volume ni tekshirish
ensureVolumeDir();

// -------------------- SQLITE DATABASE --------------------
let db = new Database(DB_PATH);

// Jadvallarni yaratish
function initDatabase() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            phone TEXT UNIQUE,
            first_name TEXT,
            last_name TEXT,
            username TEXT,
            full_name TEXT,
            is_admin INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            registered_date TEXT,
            total_bonus_count INTEGER DEFAULT 0,
            total_free_diagnostics INTEGER DEFAULT 0,
            total_diagnostics_all INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS cars (
            car_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            car_number TEXT,
            bonus_count INTEGER DEFAULT 0,
            free_diagnostics INTEGER DEFAULT 0,
            total_diagnostics INTEGER DEFAULT 0,
            added_date TEXT,
            is_active INTEGER DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        );

        CREATE TABLE IF NOT EXISTS diagnostics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            phone_number TEXT,
            car_number TEXT,
            date TEXT,
            work_description TEXT,
            additional_notes TEXT,
            price INTEGER,
            is_free INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        );

        CREATE TABLE IF NOT EXISTS errors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            car_number TEXT,
            error_code TEXT,
            error_description TEXT,
            date TEXT
        );
    `);
    console.log('✅ SQLite database jadvallari yaratildi');
}

initDatabase();

// -------------------- BOT SOZLAMALARI --------------------
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
bot.deleteWebHook().catch(e => console.log('Webhook xatolik:', e.message));

// -------------------- ESLATMA YUBORISH FUNKSIYASI --------------------
async function sendReminder(chatId) {
    try {
        await bot.sendMessage(chatId, REMINDER_MESSAGE, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Eslatma yuborishda xatolik:', error);
    }
}

// -------------------- BACKUP FUNKSIYALARI --------------------
function createBackup() {
    ensureVolumeDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupFilePath = path.join(BACKUP_DIR, `backup_${timestamp}.sqlite`);
    
    try {
        db.close();
        fs.copyFileSync(DB_PATH, backupFilePath);
        db = new Database(DB_PATH);
        initDatabase();
        console.log(`✅ Backup yaratildi: ${backupFilePath}`);
        
        const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.sqlite'));
        while (backups.length > 30) {
            const oldest = backups.sort()[0];
            fs.unlinkSync(path.join(BACKUP_DIR, oldest));
            backups.shift();
        }
        return true;
    } catch (err) {
        console.error('Backup yaratishda xatolik:', err);
        return false;
    }
}

function listBackups() {
    ensureVolumeDir();
    const backups = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('backup_') && f.endsWith('.sqlite'))
        .map(f => ({
            name: f,
            date: fs.statSync(path.join(BACKUP_DIR, f)).mtime
        }))
        .sort((a, b) => b.date - a.date);
    return backups;
}

function restoreBackup(backupName) {
    const backupPath = path.join(BACKUP_DIR, backupName);
    if (!fs.existsSync(backupPath)) return false;
    
    try {
        db.close();
        fs.copyFileSync(backupPath, DB_PATH);
        db = new Database(DB_PATH);
        initDatabase();
        console.log(`✅ Database tiklandi: ${backupName}`);
        return true;
    } catch (err) {
        console.error('Database tiklashda xatolik:', err);
        return false;
    }
}

// -------------------- DATABASE FUNKSIYALARI --------------------

function getUserByPhone(phone) {
    const stmt = db.prepare('SELECT * FROM users WHERE phone = ?');
    return stmt.get(phone);
}

function getUserByUserId(userId) {
    const stmt = db.prepare('SELECT * FROM users WHERE user_id = ?');
    return stmt.get(userId);
}

function getUserCars(userId) {
    const stmt = db.prepare('SELECT * FROM cars WHERE user_id = ? AND is_active = 1');
    return stmt.all(userId);
}

function isAdmin(userId) {
    if (ADMIN_IDS.includes(userId)) return true;
    const user = getUserByUserId(userId);
    return user ? user.is_admin === 1 : false;
}

function addNewUser(userId, phoneNumber, carNumber, firstName, lastName, username) {
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    const registeredDate = new Date().toISOString();
    
    const insertUser = db.prepare(`
        INSERT INTO users (user_id, phone, first_name, last_name, username, full_name, registered_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertUser.run(userId, phoneNumber, firstName, lastName, username, fullName, registeredDate);
    
    const insertCar = db.prepare(`
        INSERT INTO cars (user_id, car_number, added_date)
        VALUES (?, ?, ?)
    `);
    insertCar.run(userId, carNumber, registeredDate);
    
    return { userId, phone: phoneNumber, fullName };
}

function addCarToUser(phoneNumber, carNumber, userInfo = {}) {
    const user = getUserByPhone(phoneNumber);
    if (!user) return { success: false, message: 'Foydalanuvchi topilmadi' };
    
    const existingCar = db.prepare('SELECT * FROM cars WHERE user_id = ? AND car_number = ?').get(user.user_id, carNumber);
    if (existingCar) {
        return { success: false, message: 'Bu avtomobil raqami allaqachon qo\'shilgan!' };
    }
    
    const carsCount = db.prepare('SELECT COUNT(*) as count FROM cars WHERE user_id = ?').get(user.user_id).count;
    if (carsCount >= MAX_CARS_PER_USER) {
        return { success: false, message: `Siz maksimum ${MAX_CARS_PER_USER} ta avtomobil qo'sha olasiz!` };
    }
    
    const insertCar = db.prepare(`
        INSERT INTO cars (user_id, car_number, added_date)
        VALUES (?, ?, ?)
    `);
    insertCar.run(user.user_id, carNumber, new Date().toISOString());
    
    if (userInfo.firstName && !user.first_name) {
        db.prepare('UPDATE users SET first_name = ?, last_name = ?, username = ?, full_name = ? WHERE user_id = ?')
            .run(userInfo.firstName, userInfo.lastName || '', userInfo.username || '', `${userInfo.firstName} ${userInfo.lastName || ''}`.trim(), user.user_id);
    }
    
    const newCount = db.prepare('SELECT COUNT(*) as count FROM cars WHERE user_id = ?').get(user.user_id).count;
    
    return { success: true, message: 'Yangi avtomobil qo\'shildi!', carsCount: newCount };
}

function addDiagnosticToCar(phoneNumber, carNumber, workDescription, additionalNotes) {
    const user = getUserByPhone(phoneNumber);
    if (!user) return { success: false, message: 'Foydalanuvchi topilmadi' };
    
    const car = db.prepare('SELECT * FROM cars WHERE user_id = ? AND car_number = ?').get(user.user_id, carNumber);
    if (!car) return { success: false, message: 'Avtomobil topilmadi' };
    
    let isFree = false;
    let bonusMessage = '';
    let newBonusCount = car.bonus_count;
    let newFreeDiagnostics = car.free_diagnostics;
    
    if (car.free_diagnostics > 0) {
        isFree = true;
        newFreeDiagnostics--;
        bonusMessage = '🎉 BEPUL diagnostikadan foydalandingiz!';
    } else {
        newBonusCount++;
        if (newBonusCount >= 5) {
            const bonusCount = Math.floor(newBonusCount / 5);
            newFreeDiagnostics += bonusCount;
            newBonusCount = newBonusCount % 5;
            bonusMessage = '🎉🎉🎉 TABRIKLAYMIZ! 5-diagnostikani tugatdingiz va 1 ta BEPUL diagnostika qozondingiz!';
        }
    }
    
    const insertDiagnostic = db.prepare(`
        INSERT INTO diagnostics (user_id, phone_number, car_number, date, work_description, additional_notes, price, is_free)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertDiagnostic.run(user.user_id, phoneNumber, carNumber, new Date().toISOString(), workDescription, additionalNotes || '', isFree ? 0 : DIAGNOSTIC_PRICE, isFree ? 1 : 0);
    
    const updateCar = db.prepare(`
        UPDATE cars 
        SET bonus_count = ?, free_diagnostics = ?, total_diagnostics = total_diagnostics + 1
        WHERE user_id = ? AND car_number = ?
    `);
    updateCar.run(newBonusCount, newFreeDiagnostics, user.user_id, carNumber);
    
    if (isFree) {
        db.prepare('UPDATE users SET total_free_diagnostics = total_free_diagnostics + 1, total_diagnostics_all = total_diagnostics_all + 1 WHERE user_id = ?').run(user.user_id);
    } else {
        db.prepare('UPDATE users SET total_bonus_count = total_bonus_count + 1, total_diagnostics_all = total_diagnostics_all + 1 WHERE user_id = ?').run(user.user_id);
    }
    
    return {
        success: true,
        isFree: isFree,
        price: isFree ? 0 : DIAGNOSTIC_PRICE,
        newBonusCount: newBonusCount,
        newFreeDiagnostics: newFreeDiagnostics,
        bonusMessage: bonusMessage,
        carNumber: carNumber
    };
}

function getUserDiagnostics(phoneNumber, limit = 10) {
    const stmt = db.prepare(`
        SELECT * FROM diagnostics WHERE phone_number = ? 
        ORDER BY date DESC LIMIT ?
    `);
    return stmt.all(phoneNumber, limit);
}

function getNearBonusCars() {
    const cars = db.prepare(`
        SELECT u.phone, u.full_name, c.car_number, c.bonus_count
        FROM cars c
        JOIN users u ON c.user_id = u.user_id
        WHERE u.is_admin = 0 AND c.bonus_count >= 3 AND c.bonus_count < 5
    `).all();
    
    return cars.map(c => ({
        phone: c.phone,
        carNumber: c.car_number,
        bonusCount: c.bonus_count,
        remaining: 5 - c.bonus_count,
        fullName: c.full_name || 'Ism kiritilmagan'
    }));
}

function getTodayDiagnostics() {
    const today = new Date().toISOString().split('T')[0];
    const stmt = db.prepare(`
        SELECT * FROM diagnostics WHERE date LIKE ?
        ORDER BY date DESC
    `);
    return stmt.all(`${today}%`);
}

function getAllDiagnostics(limit = 50) {
    const stmt = db.prepare(`
        SELECT * FROM diagnostics ORDER BY date DESC LIMIT ?
    `);
    return stmt.all(limit);
}

function getStatistics() {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 0').get().count;
    const totalCars = db.prepare('SELECT COUNT(*) as count FROM cars').get().count;
    const totalDiagnostics = db.prepare('SELECT COUNT(*) as count FROM diagnostics').get().count;
    const paidDiagnostics = db.prepare('SELECT COUNT(*) as count FROM diagnostics WHERE is_free = 0').get().count;
    const freeDiagnostics = db.prepare('SELECT COUNT(*) as count FROM diagnostics WHERE is_free = 1').get().count;
    const totalIncome = db.prepare('SELECT SUM(price) as total FROM diagnostics WHERE is_free = 0').get().total || 0;
    const totalErrors = db.prepare('SELECT COUNT(*) as count FROM errors').get().count;
    
    return {
        totalUsers,
        totalCars,
        totalDiagnostics,
        paidDiagnostics,
        freeDiagnostics,
        totalIncome,
        totalErrors
    };
}

function getErrors() {
    const stmt = db.prepare('SELECT * FROM errors ORDER BY date DESC LIMIT 50');
    return stmt.all();
}

function addError(carNumber, errorCode, errorDescription) {
    const stmt = db.prepare(`
        INSERT INTO errors (car_number, error_code, error_description, date)
        VALUES (?, ?, ?, ?)
    `);
    stmt.run(carNumber, errorCode, errorDescription, new Date().toISOString());
}

function getAllUsersWithDetails() {
    const users = db.prepare(`
        SELECT u.*, 
               (SELECT COUNT(*) FROM cars WHERE user_id = u.user_id) as cars_count
        FROM users u 
        WHERE u.is_admin = 0
        ORDER BY u.registered_date DESC
    `).all();
    
    return users.map(u => {
        const cars = db.prepare('SELECT * FROM cars WHERE user_id = ?').all(u.user_id);
        return {
            userId: u.user_id,
            fullName: u.full_name || 'Ism kiritilmagan',
            firstName: u.first_name || '',
            lastName: u.last_name || '',
            username: u.username || '',
            phone: u.phone,
            cars: cars,
            totalDiagnostics: u.total_diagnostics_all || 0,
            registeredDate: u.registered_date
        };
    });
}

function loadData() {
    try {
        ensureVolumeDir();
        initDatabase();
        
        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        const diagCount = db.prepare('SELECT COUNT(*) as count FROM diagnostics').get().count;
        
        console.log(`✅ Yuklandi: ${userCount} foydalanuvchi, ${diagCount} diagnostika`);
        console.log(`✅ Database manzili: ${DB_PATH}`);
        console.log(`✅ Volume manzili: ${VOLUME_PATH}`);
    } catch (err) {
        console.error('Ma\'lumot yuklashda xatolik:', err);
    }
}

// -------------------- KEYBOARDS --------------------
function getAdminKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                ['📊 Statistika', '👥 Foydalanuvchilar'],
                ['🔧 Diagnostika qo\'shish', '🎁 Bonusga yaqinlar'],
                ['⚠️ Xatoliklar', '📋 Diagnostikalar tarixi'],
                ['📅 Bugungi diagnostikalar', '💾 Backup yaratish'],
                ['🔄 Database tiklash', '❌ Asosiy menyu']
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
            selective: true
        }
    };
}

function getUserKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                ['📊 Mening sahifam', '🚗 Mening avtomobillarim'],
                ['🎁 Mening bonuslarim', '➕ Yangi avtomobil qo\'shish'],
                ['📋 Diagnostika tarixim', 'ℹ️ Ma\'lumot'],
                ['❌ Asosiy menyu']
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
            selective: true,
            input_field_placeholder: "Menyudan tanlang..."
        }
    };
}

function getPhoneKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '📱 Telefon raqamini yuborish', request_contact: true }]
            ],
            resize_keyboard: false,    
            one_time_keyboard: true,
            selective: false
        }
    };
}

function getBackupListKeyboard(backups) {
    const keyboard = backups.slice(0, 10).map(b => [{ text: `📁 ${b.name} (${b.date.toLocaleDateString()})`, callback_data: `restore_${b.name}` }]);
    keyboard.push([{ text: '❌ Bekor qilish', callback_data: 'restore_cancel' }]);
    return { reply_markup: { inline_keyboard: keyboard } };
}

// -------------------- SESSIONS --------------------
const userSessions = new Map();

function getUserSession(userId) {
    if (!userSessions.has(userId)) {
        userSessions.set(userId, { step: null, data: {} });
    }
    return userSessions.get(userId);
}

function clearUserSession(userId) {
    userSessions.delete(userId);
}

async function clearKeyboard(chatId) {
    try {
        await bot.sendMessage(chatId, '⏳', {
            reply_markup: { remove_keyboard: true }
        });
    } catch (error) {
        console.error('Keyboard tozalash xatolik:', error);
    }
}

async function sendMainMenu(chatId, isAdminUser = false) {
    try {
        await sendReminder(chatId);
        
        if (isAdminUser) {
            await bot.sendMessage(chatId, '👑 *Admin paneliga xush kelibsiz!*\n\nQuyidagi tugmalardan foydalaning:', {
                parse_mode: 'Markdown',
                ...getAdminKeyboard()
            });
        } else {
            await bot.sendMessage(chatId, '🏠 *Asosiy menyu*\n\n🚗 ISUZU DOCTOR botiga xush kelibsiz!\n\nQuyidagi tugmalardan birini tanlang:', {
                parse_mode: 'Markdown',
                ...getUserKeyboard()
            });
        }
    } catch (error) {
        console.error('Menu yuborishda xatolik:', error);
        if (isAdminUser) {
            await bot.sendMessage(chatId, '👑 Admin paneliga xush kelibsiz!\n\n/statistika - Statistika\n/users - Foydalanuvchilar\n/add_diagnostic - Diagnostika qo\'shish\n/close - Asosiy menyu');
        } else {
            await bot.sendMessage(chatId, '🏠 Asosiy menyu\n\n/profile - Mening sahifam\n/my_cars - Mening avtomobillarim\n/my_bonus - Mening bonuslarim\n/add_car - Yangi avtomobil\n/history - Diagnostika tarixi\n/info - Ma\'lumot\n/close - Asosiy menyu');
        }
    }
}

// -------------------- /start KOMANDASI --------------------
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name || '';
    const lastName = msg.from.last_name || '';
    const username = msg.from.username || '';
    
    clearUserSession(userId);
    const existingUser = getUserByUserId(userId);
    
    try {
        await sendReminder(chatId);
        
        if (existingUser) {
            if (!existingUser.first_name && firstName) {
                db.prepare('UPDATE users SET first_name = ?, last_name = ?, username = ?, full_name = ? WHERE user_id = ?')
                    .run(firstName, lastName, username, `${firstName} ${lastName}`.trim(), userId);
            }
            
            const cars = getUserCars(userId);
            const carsCount = cars.length;
            const welcomeText = `👋 *Xush kelibsiz, ${existingUser.full_name || firstName || 'hurmatli mijoz'}!*\n\n📞 Telefon: ${existingUser.phone}\n🚗 Avtomobillar: ${carsCount} ta\n🎁 Umumiy bonus: ${existingUser.total_bonus_count || 0}\n🎉 Bepul: ${existingUser.total_free_diagnostics || 0} ta\n📊 Jami diagnostika: ${existingUser.total_diagnostics_all || 0} ta`;
            await bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, existingUser.is_admin === 1);
        } else {
            const session = getUserSession(userId);
            session.data.firstName = firstName;
            session.data.lastName = lastName;
            session.data.username = username;
            
            await bot.sendMessage(chatId, '🚗 *ISUZU DOCTOR* tizimiga xush kelibsiz!\n\n📱 Iltimos, telefon raqamingizni yuboring:', {
                parse_mode: 'Markdown',
                ...getPhoneKeyboard()
            });
        }
    } catch (error) {
        console.error('/start xatolik:', error);
    }
});

// -------------------- KONTAKT QABUL QILISH --------------------
bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const contact = msg.contact;
    const firstName = msg.from.first_name || '';
    const lastName = msg.from.last_name || '';
    const username = msg.from.username || '';
    
    if (!contact) return;
    
    let phoneNumber = contact.phone_number;
    if (!phoneNumber.startsWith('+')) {
        phoneNumber = '+' + phoneNumber;
    }
    
    const session = getUserSession(userId);
    session.data.phone = phoneNumber;
    
    if (!session.data.firstName) {
        session.data.firstName = firstName;
        session.data.lastName = lastName;
        session.data.username = username;
    }
    
    if (phoneNumber === ADMIN_PHONE) {
        const fullName = `${firstName} ${lastName}`.trim();
        const insertUser = db.prepare(`
            INSERT INTO users (user_id, phone, first_name, last_name, username, full_name, is_admin, registered_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insertUser.run(userId, phoneNumber, firstName, lastName, username, fullName, 1, new Date().toISOString());
        
        const insertCar = db.prepare(`
            INSERT INTO cars (user_id, car_number, added_date)
            VALUES (?, ?, ?)
        `);
        insertCar.run(userId, "ADMIN", new Date().toISOString());
        
        try {
            await sendReminder(chatId);
            await bot.sendMessage(chatId, `👑 *Siz ADMIN sifatida tizimga kirdingiz!*\n\n📞 Telefon: ${phoneNumber}`, { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, true);
        } catch (error) {
            console.error('Admin xabar xatolik:', error);
        }
        clearUserSession(userId);
        return;
    }
    
    const existingUser = getUserByPhone(phoneNumber);
    
    if (existingUser && existingUser.user_id !== userId) {
        await bot.sendMessage(chatId, '❌ *Bu telefon raqam allaqachon ro\'yxatdan o\'tgan!*', { parse_mode: 'Markdown' });
        clearUserSession(userId);
        return;
    }
    
    if (existingUser && existingUser.user_id === userId) {
        session.step = 'add_new_car';
        session.data.isExistingUser = true;
        await bot.sendMessage(chatId, `✅ Telefon raqam tasdiqlandi: ${phoneNumber}\n\n🚗 *Yangi avtomobil raqamini kiriting:*\n\nMasalan: 01A777AA\n\n⚠️ Siz maksimum ${MAX_CARS_PER_USER} tagacha avtomobil qo'sha olasiz.`, {
            parse_mode: 'Markdown',
            reply_markup: { remove_keyboard: true }
        });
    } else {
        session.step = 'first_car_number';
        session.data.isExistingUser = false;
        await bot.sendMessage(chatId, `✅ Telefon raqam qabul qilindi: ${phoneNumber}\n\n🚗 *Birinchi avtomobil raqamini kiriting:*\n\nMasalan: 01A777AA`, {
            parse_mode: 'Markdown',
            reply_markup: { remove_keyboard: true }
        });
    }
});

// -------------------- MATNLI BUYRUQLAR --------------------
bot.onText(/\/profile/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const user = getUserByUserId(userId);
    
    if (!user) {
        await bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan! /start bosing.');
        return;
    }
    
    const cars = getUserCars(userId);
    const carsList = cars.map(c => `🚗 ${c.car_number} (${c.total_diagnostics} ta diagnostika)`).join('\n');
    await sendReminder(chatId);
    await bot.sendMessage(chatId, `📊 *MENGING SAHIFAM*\n\n👤 *Ism:* ${user.full_name || 'Kiritilmagan'}\n📞 *Telefon:* ${user.phone}\n🚗 *Avtomobillar:* ${cars.length}/${MAX_CARS_PER_USER}\n\n${carsList}\n\n🎁 *Umumiy bonuslar:* ${user.total_bonus_count || 0}\n🎉 *Bepul diagnostika:* ${user.total_free_diagnostics || 0} ta\n📊 *Jami diagnostika:* ${user.total_diagnostics_all || 0} ta`, { parse_mode: 'Markdown' });
});

bot.onText(/\/my_cars/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const user = getUserByUserId(userId);
    
    if (!user) {
        await bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan! /start bosing.');
        return;
    }
    
    const cars = getUserCars(userId);
    if (cars.length === 0) {
        await bot.sendMessage(chatId, '📭 Sizda hali avtomobillar mavjud emas!\n\n➕ "➕ Yangi avtomobil qo\'shish" tugmasini bosing.');
        return;
    }
    
    let carsText = '🚗 *MENGING AVTOMOBILLARIM*\n\n📌 *Bonus qoidasi:* 5 diagnostika = 1 BEPUL\n━━━━━━━━━━━━━━━━━━\n\n';
    for (const car of cars) {
        const nextFree = 5 - car.bonus_count;
        carsText += `🚗 *${car.car_number}*\n`;
        carsText += `🎁 Bonus: ${car.bonus_count}/5\n`;
        carsText += `🎉 Bepul: ${car.free_diagnostics} ta\n`;
        carsText += `📊 Diagnostika: ${car.total_diagnostics} ta\n`;
        carsText += `📅 Qo'shilgan: ${new Date(car.added_date).toLocaleDateString()}\n`;
        
        if (car.free_diagnostics > 0) {
            carsText += `✅ *Bepul diagnostika mavjud!*\n`;
        } else if (nextFree > 0) {
            carsText += `📌 Keyingi BEPUL: ${nextFree} ta diagnostikadan keyin\n`;
        }
        
        carsText += `━━━━━━━━━━━━━━━━━━\n`;
    }
    await sendReminder(chatId);
    await bot.sendMessage(chatId, carsText, { parse_mode: 'Markdown' });
});

bot.onText(/\/my_bonus/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const user = getUserByUserId(userId);
    
    if (!user) {
        await bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan! /start bosing.');
        return;
    }
    
    const cars = getUserCars(userId);
    let bonusText = '🎁 *MENGING BONUSLARIM*\n\n📌 *Qoida:* Har 5 diagnostikada 1 ta BEPUL!\n━━━━━━━━━━━━━━━━━━\n\n';
    for (const car of cars) {
        const nextFree = 5 - car.bonus_count;
        bonusText += `🚗 *${car.car_number}*\n`;
        bonusText += `📊 To\'plangan: ${car.bonus_count}/5\n`;
        bonusText += `🎉 Bepul diagnostika: ${car.free_diagnostics} ta\n`;
        
        if (car.free_diagnostics > 0) {
            bonusText += `✅ *Sizda ${car.free_diagnostics} ta BEPUL diagnostika bor!*\n`;
            bonusText += `💡 Keyingi diagnostikangiz BEPUL bo'ladi!\n`;
        } else if (nextFree > 0) {
            bonusText += `📌 *Keyingi BEPUL diagnostika:* ${nextFree} ta diagnostikadan keyin\n`;
            bonusText += `   (${nextFree} ta to'lovli diagnostika qilsangiz, 1 ta BEPUL olasiz)\n`;
        } else if (nextFree === 0 && car.bonus_count === 5) {
            bonusText += `🎉 *DARHOL BEPUL diagnostika qozondingiz!*\n`;
            bonusText += `✅ Keyingi diagnostikangiz BEPUL bo'ladi!\n`;
        }
        
        bonusText += `━━━━━━━━━━━━━━━━━━\n`;
    }
    bonusText += `\n🎯 *QANDAY ISHLAYDI?*\n`;
    bonusText += `• Har 5 ta to'lovli diagnostika = 1 ta BEPUL\n`;
    bonusText += `• Har bir avtomobil uchun bonus alohida hisoblanadi\n`;
    bonusText += `• Bepul diagnostika cheksiz muddatga amal qiladi\n`;
    bonusText += `• Admin diagnostika qo'shganda avtomatik hisoblanadi`;
    
    await sendReminder(chatId);
    await bot.sendMessage(chatId, bonusText, { parse_mode: 'Markdown' });
});

bot.onText(/\/history/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const user = getUserByUserId(userId);
    
    if (!user) {
        await bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan! /start bosing.');
        return;
    }
    
    const diags = getUserDiagnostics(user.phone, 15);
    if (diags.length === 0) {
        await bot.sendMessage(chatId, '📭 *Sizda hali diagnostikalar mavjud emas!*', { parse_mode: 'Markdown' });
        return;
    }
    
    await sendReminder(chatId);
    for (const d of diags) {
        let diagText = `📅 *${new Date(d.date).toLocaleDateString()}*\n`;
        diagText += `🕐 ${new Date(d.date).toLocaleTimeString()}\n`;
        diagText += `🚗 ${d.car_number}\n\n`;
        diagText += `📝 *Bajarilgan ishlar:*\n${d.work_description}\n\n`;
        
        if (d.additional_notes && d.additional_notes !== '') {
            diagText += `➕ *Qo'shimcha eslatmalar:*\n${d.additional_notes}\n\n`;
        }
        
        diagText += `💰 *Narx:* ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}\n`;
        diagText += `━━━━━━━━━━━━━━━━━━\n`;
        
        await bot.sendMessage(chatId, diagText, { parse_mode: 'Markdown' });
    }
});

bot.onText(/\/info/, async (msg) => {
    const chatId = msg.chat.id;
    await sendReminder(chatId);
    await bot.sendMessage(chatId, `ℹ️ *ISUZU DOCTOR BOT*\n\n🚗 Avtomobil diagnostikasi\n🎁 Har 5 diagnostikada 1 ta BEPUL\n📱 Bitta telefon bilan ${MAX_CARS_PER_USER} tagacha avtomobil\n📞 Aloqa: ${ADMIN_PHONE}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/close/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    clearUserSession(userId);
    await sendMainMenu(chatId, isAdmin(userId));
});

bot.onText(/\/statistika/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isAdmin(userId)) return;
    
    const stats = getStatistics();
    await bot.sendMessage(chatId, `📊 *STATISTIKA*\n\n👥 Foydalanuvchilar: ${stats.totalUsers}\n🚗 Avtomobillar: ${stats.totalCars}\n🔧 Jami: ${stats.totalDiagnostics}\n💰 To'lovli: ${stats.paidDiagnostics}\n🎉 Bepul: ${stats.freeDiagnostics}\n💵 Daromad: ${stats.totalIncome.toLocaleString()} so'm\n⚠️ Xatoliklar: ${stats.totalErrors}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/users/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isAdmin(userId)) return;
    
    const usersList = getAllUsersWithDetails();
    if (usersList.length === 0) { 
        await bot.sendMessage(chatId, '📭 Hech qanday foydalanuvchi yo\'q'); 
        return; 
    }
    
    let msgText = '👥 *FOYDALANUVCHILAR*\n━━━━━━━━━━━━━━━━━━\n\n';
    usersList.slice(0, 15).forEach((u, index) => { 
        msgText += `*${index + 1}. ${u.fullName || 'Ism kiritilmagan'}*\n`;
        msgText += `📞 ${u.phone}\n`;
        msgText += `🚗 ${u.cars.map(c => c.car_number).join(', ')}\n`;
        msgText += `📊 ${u.totalDiagnostics} ta diagnostika\n`;
        msgText += `━━━━━━━━━━━━━━━━━━\n`;
    });
    await bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
});

bot.onText(/\/add_diagnostic/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isAdmin(userId)) return;
    
    const session = getUserSession(userId);
    session.step = 'admin_add_diagnostic';
    await bot.sendMessage(chatId, '🔧 *Diagnostika qo\'shish*\n\n🚗 Avtomobil raqamini kiriting:', { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
});

// -------------------- XABARLARNI QAYTA ISHLASH --------------------
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    if (msg.photo) return;
    if (msg.contact) return;
    if (!text) return;
    if (text === '/start') return;
    if (text.startsWith('/')) return;
    
    const session = getUserSession(userId);
    
    // Birinchi avtomobil raqami
    if (session.step === 'first_car_number') {
        const carNumber = text.toUpperCase().trim();
        
        if (carNumber.length < 2 || carNumber.length > 10) {
            await bot.sendMessage(chatId, '❌ *Noto\'g\'ri avtomobil raqami!*\n\nIltimos, to\'g\'ri raqam kiriting (2-10 belgi):', { parse_mode: 'Markdown' });
            return;
        }
        
        const userFullName = `${session.data.firstName || ''} ${session.data.lastName || ''}`.trim();
        
        addNewUser(
            userId, 
            session.data.phone, 
            carNumber,
            session.data.firstName || '',
            session.data.lastName || '',
            session.data.username || ''
        );
        
        try {
            await sendReminder(chatId);
            await bot.sendMessage(chatId, `✅ *Siz muvaffaqiyatli ro'yxatdan o'tdingiz, ${userFullName || 'hurmatli mijoz'}!*\n\n👤 Ism: ${userFullName || 'Kiritilmagan'}\n🚗 Avtomobil: ${carNumber}\n📞 Telefon: ${session.data.phone}\n\n🎁 *Bonus tizimi:* Har 5 diagnostikada 1 ta BEPUL!\n\n➕ "➕ Yangi avtomobil qo'shish" tugmasi orqali yana avtomobil qo'shishingiz mumkin.`, { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, false);
            
            for (const adminId of ADMIN_IDS) {
                bot.sendMessage(adminId, `🆕 *YANGI FOYDALANUVCHI!*\n\n👤 Ism: ${userFullName || 'Kiritilmagan'}\n📞 Telefon: ${session.data.phone}\n🚗 Avtomobil: ${carNumber}\n📅 Sana: ${new Date().toLocaleString()}`, { parse_mode: 'Markdown' }).catch(() => {});
            }
        } catch (error) {
            console.error('Ro\'yxatdan o\'tkazish xatolik:', error);
        }
        clearUserSession(userId);
        return;
    }
    
    // Yangi avtomobil qo'shish
    if (session.step === 'add_new_car') {
        const carNumber = text.toUpperCase().trim();
        
        if (carNumber.length < 2 || carNumber.length > 10) {
            await bot.sendMessage(chatId, '❌ *Noto\'g\'ri avtomobil raqami!*\n\nIltimos, to\'g\'ri raqam kiriting (2-10 belgi):', { parse_mode: 'Markdown' });
            return;
        }
        
        const result = addCarToUser(session.data.phone, carNumber, {
            firstName: session.data.firstName,
            lastName: session.data.lastName,
            username: session.data.username
        });
        
        if (result.success) {
            try {
                await sendReminder(chatId);
                await bot.sendMessage(chatId, `✅ *Yangi avtomobil qo'shildi!*\n\n🚗 ${carNumber}\n📊 Jami avtomobillar: ${result.carsCount}/${MAX_CARS_PER_USER}\n\n🎁 Har bir avtomobil uchun bonus tizimi alohida hisoblanadi!`, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Avtomobil qo\'shish xatolik:', error);
            }
        } else {
            await bot.sendMessage(chatId, `❌ ${result.message}`, { parse_mode: 'Markdown' });
        }
        
        clearUserSession(userId);
        await sendMainMenu(chatId, false);
        return;
    }
    
    // Admin diagnostika qo'shish
    if (session.step === 'admin_add_diagnostic') {
        const carNumber = text.toUpperCase().trim();
        
        let foundUser = null;
        let foundCar = null;
        
        const cars = db.prepare('SELECT * FROM cars WHERE car_number = ?').all(carNumber);
        for (const car of cars) {
            const user = getUserByUserId(car.user_id);
            if (user) {
                foundUser = user;
                foundCar = car;
                break;
            }
        }
        
        if (!foundUser) {
            await bot.sendMessage(chatId, '❌ *Bunday avtomobil topilmadi!*\n\nIltimos, to\'g\'ri avtomobil raqamini kiriting:', { parse_mode: 'Markdown' });
            return;
        }
        
        session.data.targetUser = foundUser;
        session.data.targetCar = foundCar;
        session.step = 'admin_work_description';
        
        await bot.sendMessage(chatId, `✅ Foydalanuvchi topildi:\n\n👤 ${foundUser.full_name || 'Ism kiritilmagan'}\n📞 ${foundUser.phone}\n🚗 ${foundCar.car_number}\n🎁 Bonus: ${foundCar.bonus_count}/5\n🎉 Bepul: ${foundCar.free_diagnostics}\n\n🔧 *Bajarilgan ishlarni kiriting:*`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (session.step === 'admin_work_description') {
        session.data.workDescription = text;
        session.step = 'admin_additional_notes';
        await bot.sendMessage(chatId, `✅ Bajarilgan ishlar qabul qilindi:\n\n📝 "${text}"\n\n➕ *Qo'shimcha eslatmalar kiriting* (ixtiyoriy):\n\n"❌ Bekor qilish" - bekor qilish uchun`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (session.step === 'admin_additional_notes') {
        session.data.additionalNotes = text === '❌ Bekor qilish' ? '' : text;
        
        const result = addDiagnosticToCar(
            session.data.targetUser.phone,
            session.data.targetCar.car_number,
            session.data.workDescription,
            session.data.additionalNotes
        );
        
        if (!result.success) {
            await bot.sendMessage(chatId, '❌ *Xatolik yuz berdi!*', { parse_mode: 'Markdown' });
            clearUserSession(userId);
            await sendMainMenu(chatId, true);
            return;
        }
        
        let adminResponse = `🔧 *DIAGNOSTIKA QO'SHILDI*\n\n👤 ${session.data.targetUser.full_name || 'Ism kiritilmagan'}\n🚗 ${result.carNumber}\n📞 ${session.data.targetUser.phone}\n💰 Narx: ${result.price.toLocaleString()} so'm\n\n📝 *Bajarilgan ishlar:*\n${session.data.workDescription}\n`;
        
        if (session.data.additionalNotes && session.data.additionalNotes !== '') {
            adminResponse += `\n➕ *Qo'shimcha eslatmalar:*\n${session.data.additionalNotes}\n`;
        }
        
        adminResponse += `\n${result.bonusMessage}\n\n`;
        adminResponse += `📊 *Yangi holat:*\n`;
        adminResponse += `🎁 Bonus: ${result.newBonusCount}/5\n`;
        adminResponse += `🎉 Bepul: ${result.newFreeDiagnostics} ta\n`;
        
        const remainingForNext = 5 - result.newBonusCount;
        if (result.newFreeDiagnostics > 0) {
            adminResponse += `✅ Foydalanuvchida ${result.newFreeDiagnostics} ta BEPUL diagnostika bor!\n`;
        } else if (remainingForNext > 0) {
            adminResponse += `📌 Keyingi BEPUL: ${remainingForNext} ta diagnostikadan keyin\n`;
        }
        
        await bot.sendMessage(chatId, adminResponse, { parse_mode: 'Markdown' });
        
        let userMsg = `🔧 *DIAGNOSTIKA NATIJALARI*\n\n`;
        userMsg += `🚗 *Avtomobil:* ${result.carNumber}\n`;
        userMsg += `📅 *Sana:* ${new Date().toLocaleString()}\n\n`;
        userMsg += `📝 *Bajarilgan ishlar:*\n${session.data.workDescription}\n\n`;
        
        if (session.data.additionalNotes && session.data.additionalNotes !== '') {
            userMsg += `➕ *Qo'shimcha eslatmalar:*\n${session.data.additionalNotes}\n\n`;
        }
        
        userMsg += `💰 *Narx:* ${result.price.toLocaleString()} so'm\n\n`;
        userMsg += `${result.bonusMessage}\n\n`;
        userMsg += `📊 *Joriy holat:*\n`;
        userMsg += `🎁 To'plangan bonus: ${result.newBonusCount}/5\n`;
        userMsg += `🎉 Bepul diagnostika: ${result.newFreeDiagnostics} ta\n`;
        
        const remainingForNextFree = 5 - result.newBonusCount;
        if (result.newFreeDiagnostics > 0) {
            userMsg += `✅ *Sizda ${result.newFreeDiagnostics} ta BEPUL diagnostika bor!*\n`;
            userMsg += `💡 Keyingi diagnostikangiz BEPUL bo'lishi mumkin!\n`;
        } else if (remainingForNextFree > 0 && remainingForNextFree < 5) {
            userMsg += `📌 *Keyingi BEPUL:* ${remainingForNextFree} ta diagnostikadan keyin\n`;
        } else if (remainingForNextFree === 0 && result.newBonusCount === 5) {
            userMsg += `🎉 *Siz 5-diagnostikani tugatdingiz!* Keyingisi BEPUL!\n`;
        }
        
        userMsg += `━━━━━━━━━━━━━━━━━━\n`;
        userMsg += `🚗 Sifatli xizmat - xavfsizlik kafolati!\n`;
        userMsg += `📌 Eslatma: Har 5 diagnostikada 1 ta BEPUL!`;
        
        bot.sendMessage(session.data.targetUser.user_id, userMsg, { parse_mode: 'Markdown' }).catch(() => {});
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true);
        return;
    }
    
    // FOYDALANUVCHI MENYUSI (tugmalar)
    const user = getUserByUserId(userId);
    
    if (!user && text !== '❌ Asosiy menyu') {
        await bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan! /start bosing.');
        return;
    }
    
    const cars = user ? getUserCars(userId) : [];
    
    if (text === '📊 Mening sahifam') {
        const carsList = cars.map(c => `🚗 ${c.car_number} (${c.total_diagnostics} ta diagnostika)`).join('\n');
        await sendReminder(chatId);
        await bot.sendMessage(chatId, `📊 *MENGING SAHIFAM*\n\n👤 *Ism:* ${user.full_name || 'Kiritilmagan'}\n📞 *Telefon:* ${user.phone}\n🚗 *Avtomobillar:* ${cars.length}/${MAX_CARS_PER_USER}\n\n${carsList}\n\n🎁 *Umumiy bonuslar:* ${user.total_bonus_count || 0}\n🎉 *Bepul diagnostika:* ${user.total_free_diagnostics || 0} ta\n📊 *Jami diagnostika:* ${user.total_diagnostics_all || 0} ta`, { parse_mode: 'Markdown' });
    }
    else if (text === '🚗 Mening avtomobillarim') {
        if (cars.length === 0) {
            await bot.sendMessage(chatId, '📭 Sizda hali avtomobillar mavjud emas!\n\n➕ "➕ Yangi avtomobil qo\'shish" tugmasini bosing.', { parse_mode: 'Markdown' });
            return;
        }
        
        let carsText = '🚗 *MENGING AVTOMOBILLARIM*\n\n📌 *Bonus qoidasi:* 5 diagnostika = 1 BEPUL\n━━━━━━━━━━━━━━━━━━\n\n';
        for (const car of cars) {
            const nextFree = 5 - car.bonus_count;
            carsText += `🚗 *${car.car_number}*\n`;
            carsText += `🎁 Bonus: ${car.bonus_count}/5\n`;
            carsText += `🎉 Bepul: ${car.free_diagnostics} ta\n`;
            carsText += `📊 Diagnostika: ${car.total_diagnostics} ta\n`;
            carsText += `📅 Qo'shilgan: ${new Date(car.added_date).toLocaleDateString()}\n`;
            
            if (car.free_diagnostics > 0) {
                carsText += `✅ *Bepul diagnostika mavjud!*\n`;
            } else if (nextFree > 0) {
                carsText += `📌 Keyingi BEPUL: ${nextFree} ta diagnostikadan keyin\n`;
            }
            
            carsText += `━━━━━━━━━━━━━━━━━━\n`;
        }
        await sendReminder(chatId);
        await bot.sendMessage(chatId, carsText, { parse_mode: 'Markdown' });
    }
    else if (text === '➕ Yangi avtomobil qo\'shish') {
        if (cars.length >= MAX_CARS_PER_USER) {
            await bot.sendMessage(chatId, `❌ Siz maksimum ${MAX_CARS_PER_USER} ta avtomobil qo'sha olasiz!`, { parse_mode: 'Markdown' });
            return;
        }
        
        const newSession = getUserSession(userId);
        newSession.step = 'add_new_car';
        newSession.data.phone = user.phone;
        newSession.data.isExistingUser = true;
        newSession.data.firstName = user.first_name;
        newSession.data.lastName = user.last_name;
        newSession.data.username = user.username;
        
        await bot.sendMessage(chatId, `🚗 *Yangi avtomobil raqamini kiriting:*\n\nMasalan: 01A777AA\n\n⚠️ Siz maksimum ${MAX_CARS_PER_USER} tagacha avtomobil qo'sha olasiz.\n📊 Hozirgi avtomobillar soni: ${cars.length}/${MAX_CARS_PER_USER}`, {
            parse_mode: 'Markdown',
            reply_markup: { remove_keyboard: true }
        });
    }
    else if (text === '🎁 Mening bonuslarim') {
        let bonusText = '🎁 *MENGING BONUSLARIM*\n\n📌 *Qoida:* Har 5 diagnostikada 1 ta BEPUL!\n━━━━━━━━━━━━━━━━━━\n\n';
        for (const car of cars) {
            const nextFree = 5 - car.bonus_count;
            bonusText += `🚗 *${car.car_number}*\n`;
            bonusText += `📊 To\'plangan: ${car.bonus_count}/5\n`;
            bonusText += `🎉 Bepul diagnostika: ${car.free_diagnostics} ta\n`;
            
            if (car.free_diagnostics > 0) {
                bonusText += `✅ *Sizda ${car.free_diagnostics} ta BEPUL diagnostika bor!*\n`;
                bonusText += `💡 Keyingi diagnostikangiz BEPUL bo'ladi!\n`;
            } else if (nextFree > 0) {
                bonusText += `📌 *Keyingi BEPUL diagnostika:* ${nextFree} ta diagnostikadan keyin\n`;
                bonusText += `   (${nextFree} ta to'lovli diagnostika qilsangiz, 1 ta BEPUL olasiz)\n`;
            } else if (nextFree === 0 && car.bonus_count === 5) {
                bonusText += `🎉 *DARHOL BEPUL diagnostika qozondingiz!*\n`;
                bonusText += `✅ Keyingi diagnostikangiz BEPUL bo'ladi!\n`;
            }
            
            bonusText += `━━━━━━━━━━━━━━━━━━\n`;
        }
        bonusText += `\n🎯 *QANDAY ISHLAYDI?*\n`;
        bonusText += `• Har 5 ta to'lovli diagnostika = 1 ta BEPUL\n`;
        bonusText += `• Har bir avtomobil uchun bonus alohida hisoblanadi\n`;
        bonusText += `• Bepul diagnostika cheksiz muddatga amal qiladi\n`;
        bonusText += `• Admin diagnostika qo'shganda avtomatik hisoblanadi`;
        
        await sendReminder(chatId);
        await bot.sendMessage(chatId, bonusText, { parse_mode: 'Markdown' });
    }
    else if (text === '📋 Diagnostika tarixim') {
        const diags = getUserDiagnostics(user.phone, 15);
        if (diags.length === 0) {
            await bot.sendMessage(chatId, '📭 *Sizda hali diagnostikalar mavjud emas!*', { parse_mode: 'Markdown' });
            return;
        }
        
        await sendReminder(chatId);
        for (const d of diags) {
            let diagText = `📅 *${new Date(d.date).toLocaleDateString()}*\n`;
            diagText += `🕐 ${new Date(d.date).toLocaleTimeString()}\n`;
            diagText += `🚗 ${d.car_number}\n\n`;
            diagText += `📝 *Bajarilgan ishlar:*\n${d.work_description}\n\n`;
            
            if (d.additional_notes && d.additional_notes !== '') {
                diagText += `➕ *Qo'shimcha eslatmalar:*\n${d.additional_notes}\n\n`;
            }
            
            diagText += `💰 *Narx:* ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}\n`;
            diagText += `━━━━━━━━━━━━━━━━━━\n`;
            
            await bot.sendMessage(chatId, diagText, { parse_mode: 'Markdown' });
        }
    }
    else if (text === 'ℹ️ Ma\'lumot') {
        await sendReminder(chatId);
        await bot.sendMessage(chatId, `ℹ️ *ISUZU DOCTOR BOT*\n\n🚗 Avtomobil diagnostikasi\n🎁 Har 5 diagnostikada 1 ta BEPUL\n📱 Bitta telefon bilan ${MAX_CARS_PER_USER} tagacha avtomobil\n📞 Aloqa: ${ADMIN_PHONE}`, { parse_mode: 'Markdown' });
    }
    else if (text === '❌ Asosiy menyu') {
        clearUserSession(userId);
        await sendMainMenu(chatId, isAdmin(userId));
    }
    else if (!session.step) {
        await bot.sendMessage(chatId, '❌ *Tushunarsiz buyruq!* Menyudan foydalaning.\n\n/start - Bosh sahifa\n/profile - Mening sahifam\n/my_cars - Mening avtomobillarim\n/my_bonus - Mening bonuslarim\n/history - Diagnostika tarixi\n/info - Ma\'lumot', { parse_mode: 'Markdown' });
    }
});

// -------------------- ADMIN MENYUSI TUGMALARI --------------------
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    if (!isAdmin(userId)) return;
    
    if (text === '📊 Statistika') {
        const stats = getStatistics();
        await bot.sendMessage(chatId, `📊 *STATISTIKA*\n\n👥 Foydalanuvchilar: ${stats.totalUsers}\n🚗 Avtomobillar: ${stats.totalCars}\n🔧 Jami: ${stats.totalDiagnostics}\n💰 To'lovli: ${stats.paidDiagnostics}\n🎉 Bepul: ${stats.freeDiagnostics}\n💵 Daromad: ${stats.totalIncome.toLocaleString()} so'm\n⚠️ Xatoliklar: ${stats.totalErrors}`, { parse_mode: 'Markdown' });
    }
    else if (text === '👥 Foydalanuvchilar') {
        const usersList = getAllUsersWithDetails();
        if (usersList.length === 0) { 
            await bot.sendMessage(chatId, '📭 Hech qanday foydalanuvchi yo\'q'); 
            return; 
        }
        
        let msg = '👥 *FOYDALANUVCHILAR RO\'YXATI*\n━━━━━━━━━━━━━━━━━━\n\n';
        usersList.slice(0, 20).forEach((u, index) => { 
            msg += `*${index + 1}. ${u.fullName || 'Ism kiritilmagan'}*\n`;
            msg += `📞 ${u.phone}\n`;
            msg += `🚗 Avtomobillar:\n`;
            u.cars.forEach(car => {
                msg += `   • ${car.car_number} (${car.total_diagnostics} ta diagnostika)\n`;
            });
            msg += `📊 Jami diagnostika: ${u.totalDiagnostics} ta\n`;
            msg += `📅 Ro\'yxatdan o\'tgan: ${new Date(u.registeredDate).toLocaleDateString()}\n`;
            msg += `━━━━━━━━━━━━━━━━━━\n`;
        });
        if (usersList.length > 20) {
            msg += `\n📌 *Jami ${usersList.length} ta foydalanuvchi* (oxirgi 20 tasi ko\'rsatilgan)`;
        }
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (text === '🔧 Diagnostika qo\'shish') {
        const session = getUserSession(userId);
        session.step = 'admin_add_diagnostic';
        await bot.sendMessage(chatId, '🔧 *Diagnostika qo\'shish*\n\n🚗 Avtomobil raqamini kiriting:', { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
    }
    else if (text === '🎁 Bonusga yaqinlar') {
        const nearBonus = getNearBonusCars();
        if (nearBonus.length === 0) { 
            await bot.sendMessage(chatId, '📭 Bonusga yaqin avtomobillar yo\'q\n\n📌 Bepul diagnostika 5 ta diagnostikadan keyin beriladi.', { parse_mode: 'Markdown' }); 
            return; 
        }
        let msg = '🎁 *BONUSGA YAQIN AVTOMOBILLAR*\n\n📌 *Qoida:* Har 5 diagnostikada 1 ta BEPUL!\n━━━━━━━━━━━━━━━━━━\n\n';
        nearBonus.forEach(c => { 
            msg += `👤 ${c.fullName}\n`;
            msg += `🚗 ${c.carNumber}\n`;
            msg += `📞 ${c.phone}\n`;
            msg += `🎁 ${c.bonusCount}/5 diagnostika\n`;
            msg += `📌 Keyingi BEPUL: ${c.remaining} ta diagnostikadan keyin\n`;
            msg += `━━━━━━━━━━━━━━━━━━\n`;
        });
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (text === '⚠️ Xatoliklar') {
        const errorsList = getErrors();
        if (errorsList.length === 0) { await bot.sendMessage(chatId, '✅ Hech qanday xatolik yo\'q'); return; }
        let msg = '⚠️ *XATOLIKLAR*\n\n';
        errorsList.slice(0, 10).forEach(e => { 
            msg += `🚗 ${e.car_number}\n🔴 ${e.error_code}\n📝 ${e.error_description}\n📅 ${new Date(e.date).toLocaleDateString()}\n━━━━━━\n`; 
        });
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (text === '📋 Diagnostikalar tarixi') {
        const diags = getAllDiagnostics(20);
        if (diags.length === 0) { await bot.sendMessage(chatId, '📭 Hech qanday diagnostika yo\'q'); return; }
        for (const d of diags.slice(0, 10)) {
            let diagText = `📅 ${new Date(d.date).toLocaleDateString()}\n🚗 ${d.car_number}\n📝 ${d.work_description.substring(0, 50)}...\n💰 ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}\n`;
            if (d.additional_notes && d.additional_notes !== '') {
                diagText += `➕ ${d.additional_notes.substring(0, 50)}...\n`;
            }
            diagText += `━━━━━━━━━━\n`;
            await bot.sendMessage(chatId, diagText, { parse_mode: 'Markdown' });
        }
    }
    else if (text === '📅 Bugungi diagnostikalar') {
        const diags = getTodayDiagnostics();
        if (diags.length === 0) { await bot.sendMessage(chatId, '📭 Bugun hech qanday diagnostika yo\'q'); return; }
        let msg = '📅 *BUGUNGI DIAGNOSTIKALAR*\n\n';
        diags.forEach(d => { 
            msg += `🚗 ${d.car_number}\n📝 ${d.work_description.substring(0, 40)}...\n💰 ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}\n━━━━━━\n`; 
        });
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (text === '💾 Backup yaratish') {
        await bot.sendMessage(chatId, '💾 *Backup yaratilmoqda...*', { parse_mode: 'Markdown' });
        if (createBackup()) {
            await bot.sendMessage(chatId, `✅ *Backup yaratildi!*\n\n📅 ${new Date().toLocaleString()}`, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, '❌ *Backup yaratishda xatolik!*', { parse_mode: 'Markdown' });
        }
    }
    else if (text === '🔄 Database tiklash') {
        const backups = listBackups();
        if (backups.length === 0) {
            await bot.sendMessage(chatId, '❌ *Hech qanday backup topilmadi!*\n\n💾 Avval "💾 Backup yaratish" tugmasini bosing.', { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, '🔄 *Database tiklash*\n\nQuyidagi backup\'lardan birini tanlang:', { parse_mode: 'Markdown', ...getBackupListKeyboard(backups) });
        }
    }
});

// -------------------- CALLBACK QUERY --------------------
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    
    if (data.startsWith('restore_')) {
        const backupName = data.replace('restore_', '');
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId, '🔄 *Database tiklanmoqda...*\n\n⚠️ Bu jarayon bir necha daqiqa vaqt olishi mumkin.', { parse_mode: 'Markdown' });
        
        if (restoreBackup(backupName)) {
            await bot.sendMessage(chatId, `✅ *Database muvaffaqiyatli tiklandi!*\n\n📁 ${backupName}\n📅 ${new Date().toLocaleString()}\n\n🔄 Barcha foydalanuvchilar ma'lumotlari tiklandi.`, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, '❌ *Database tiklashda xatolik!*\n\nBackup fayli buzilgan bo\'lishi mumkin.', { parse_mode: 'Markdown' });
        }
    } else if (data === 'restore_cancel') {
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId, '❌ *Database tiklash bekor qilindi.*', { parse_mode: 'Markdown' });
        await sendMainMenu(chatId, true);
    }
});

// -------------------- XATOLIKLARNI QAYTA ISHLASH --------------------
bot.on('polling_error', (error) => console.error('Polling xatolik:', error));
process.on('uncaughtException', (error) => console.error('Uncaught exception:', error));

// -------------------- BOTNI ISHGA TUSHIRISH --------------------
console.log('='.repeat(60));
console.log('🚗 ISUZU DOCTOR BOT ISHGA TUSHMOQDA');
console.log('='.repeat(60));

loadData();

console.log('='.repeat(60));
console.log('🚗 ISUZU DOCTOR BOT ISHGA TUSHDI');
console.log('='.repeat(60));
console.log(`👑 Admin telefon: ${ADMIN_PHONE}`);
console.log(`💰 Diagnostika narxi: ${DIAGNOSTIC_PRICE.toLocaleString()} so'm`);

const userCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 0').get().count;
const carCount = db.prepare('SELECT COUNT(*) as count FROM cars').get().count;
const diagCount = db.prepare('SELECT COUNT(*) as count FROM diagnostics').get().count;

console.log(`👥 Foydalanuvchilar: ${userCount}`);
console.log(`🚗 Avtomobillar: ${carCount}`);
console.log(`🔧 Diagnostikalar: ${diagCount}`);
console.log(`💾 Database manzili: ${DB_PATH}`);
console.log(`📁 Volume manzili: ${VOLUME_PATH}`);
console.log('='.repeat(60));
console.log('✅ Bot ishlashga tayyor!');
