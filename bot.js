const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

// -------------------- TOKEN VA ADMIN --------------------
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN topilmadi!');
    process.exit(1);
}

const ADMIN_PHONE = "+998979247888";
const ADMIN_IDS = (process.env.ADMIN_IDS || '1437230485').split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
const DIAGNOSTIC_PRICE = 250000;

// BACKUP SOZLAMALARI
const BACKUP_DIR = path.join(__dirname, 'backups');
const DB_PATH = path.join(__dirname, 'isuzu_doctor.db');
const MAX_BACKUPS = 20;

// -------------------- BOT SOZLAMALARI --------------------
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
bot.deleteWebHook().catch(e => console.log('Webhook xatolik:', e.message));

// -------------------- BACKUP FUNKSIYALARI --------------------
function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        console.log('📁 Backup papkasi yaratildi');
    }
}

function createBackup() {
    return new Promise((resolve, reject) => {
        ensureBackupDir();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const backupFile = path.join(BACKUP_DIR, `isuzu_doctor_backup_${timestamp}.db`);
        
        if (fs.existsSync(DB_PATH)) {
            fs.copyFile(DB_PATH, backupFile, (err) => {
                if (err) reject(err);
                else {
                    cleanOldBackups();
                    resolve(backupFile);
                }
            });
        } else {
            reject(new Error('Database fayli topilmadi'));
        }
    });
}

function cleanOldBackups() {
    fs.readdir(BACKUP_DIR, (err, files) => {
        if (err) return;
        const backupFiles = files.filter(f => f.startsWith('isuzu_doctor_backup_') && f.endsWith('.db'))
            .map(f => ({ name: f, path: path.join(BACKUP_DIR, f), time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
            .sort((a, b) => b.time - a.time);
        
        if (backupFiles.length > MAX_BACKUPS) {
            backupFiles.slice(MAX_BACKUPS).forEach(file => fs.unlinkSync(file.path));
        }
    });
}

function listBackups() {
    return new Promise((resolve, reject) => {
        ensureBackupDir();
        fs.readdir(BACKUP_DIR, (err, files) => {
            if (err) reject(err);
            else {
                const backups = files.filter(f => f.startsWith('isuzu_doctor_backup_') && f.endsWith('.db'))
                    .map(f => ({ name: f, path: path.join(BACKUP_DIR, f), date: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
                    .sort((a, b) => b.date - a.date);
                resolve(backups);
            }
        });
    });
}

function restoreBackup(backupName) {
    return new Promise((resolve, reject) => {
        const backupPath = path.join(BACKUP_DIR, backupName);
        if (!fs.existsSync(backupPath)) reject(new Error('Backup fayli topilmadi'));
        else {
            createBackup().catch(() => {});
            fs.copyFile(backupPath, DB_PATH, (err) => {
                if (err) reject(err);
                else {
                    // Databaseni qayta yuklash
                    if (db) db.close();
                    initDatabase();
                    resolve(backupPath);
                }
            });
        }
    });
}

// -------------------- DATABASE YARATISH --------------------
let db;

function initDatabase() {
    db = new sqlite3.Database(DB_PATH);
    
    db.run(`CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        phone_number TEXT NOT NULL,
        car_number TEXT NOT NULL,
        is_admin INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        registered_date TEXT NOT NULL,
        bonus_count INTEGER DEFAULT 0,
        free_diagnostics INTEGER DEFAULT 0,
        total_diagnostics INTEGER DEFAULT 0
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS diagnostics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        car_number TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        diagnostic_date TEXT NOT NULL,
        work_description TEXT NOT NULL,
        additional_notes TEXT,
        price INTEGER DEFAULT 0,
        is_free INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users (user_id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        car_number TEXT NOT NULL,
        error_date TEXT NOT NULL,
        error_code TEXT,
        error_description TEXT,
        status TEXT DEFAULT 'pending',
        FOREIGN KEY (user_id) REFERENCES users (user_id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS service_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        car_number TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        queue_number INTEGER,
        status TEXT DEFAULT 'waiting',
        created_at TEXT NOT NULL,
        notified_at TEXT,
        completed_at TEXT,
        cancelled_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users (user_id)
    )`);
    
    console.log('✅ Ma\'lumotlar bazasi yaratildi/yuklandi');
}

// -------------------- DATABASE FUNKSIYALARI --------------------
function userExists(userId, callback) {
    db.get('SELECT user_id FROM users WHERE user_id = ?', [userId], (err, row) => {
        callback(err, !!row);
    });
}

function getUser(userId, callback) {
    db.get('SELECT * FROM users WHERE user_id = ?', [userId], callback);
}

function getUserByCarNumber(carNumber, callback) {
    db.get('SELECT * FROM users WHERE car_number = ?', [carNumber], callback);
}

function getAllUsers(callback) {
    db.all('SELECT * FROM users WHERE is_admin = 0 ORDER BY registered_date DESC', [], callback);
}

function addUser(userId, phoneNumber, carNumber, callback) {
    const registeredDate = new Date().toISOString();
    db.run(`INSERT INTO users (user_id, phone_number, car_number, registered_date, bonus_count, free_diagnostics, total_diagnostics)
            VALUES (?, ?, ?, ?, 0, 0, 0)`, 
            [userId, phoneNumber, carNumber, registeredDate], callback);
}

function isAdmin(userId, callback) {
    if (ADMIN_IDS.includes(userId)) {
        callback(null, true);
        return;
    }
    db.get('SELECT is_admin FROM users WHERE user_id = ?', [userId], (err, row) => {
        callback(err, row ? row.is_admin === 1 : false);
    });
}

function addDiagnostic(userId, carNumber, phoneNumber, workDescription, additionalNotes, callback) {
    const diagnosticDate = new Date().toISOString();
    
    getUser(userId, (err, user) => {
        if (err || !user) {
            callback(err || new Error('Foydalanuvchi topilmadi'), null);
            return;
        }
        
        let isFree = false;
        let newBonusCount = user.bonus_count;
        let newFreeDiagnostics = user.free_diagnostics;
        let bonusMessage = '';
        
        if (user.free_diagnostics > 0) {
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
        
        db.run(`INSERT INTO diagnostics (user_id, car_number, phone_number, diagnostic_date, work_description, additional_notes, price, is_free)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, carNumber, phoneNumber, diagnosticDate, workDescription, additionalNotes || '', isFree ? 0 : DIAGNOSTIC_PRICE, isFree ? 1 : 0],
                function(err) {
                    if (err) {
                        callback(err, null);
                        return;
                    }
                    
                    db.run(`UPDATE users SET 
                            bonus_count = ?, 
                            free_diagnostics = ?, 
                            total_diagnostics = total_diagnostics + 1 
                            WHERE user_id = ?`,
                            [newBonusCount, newFreeDiagnostics, userId], (err2) => {
                                callback(err2, {
                                    success: true,
                                    isFree: isFree,
                                    price: isFree ? 0 : DIAGNOSTIC_PRICE,
                                    newBonusCount: newBonusCount,
                                    newFreeDiagnostics: newFreeDiagnostics,
                                    bonusMessage: bonusMessage
                                });
                            });
                });
    });
}

function getUserDiagnostics(userId, limit = 10, callback) {
    db.all(`SELECT * FROM diagnostics WHERE user_id = ? ORDER BY diagnostic_date DESC LIMIT ?`, [userId, limit], callback);
}

function getNearBonusUsers(callback) {
    db.all(`SELECT * FROM users WHERE is_admin = 0 AND bonus_count >= 3 AND bonus_count < 5 ORDER BY bonus_count DESC`, [], callback);
}

function getTodayDiagnostics(callback) {
    const today = new Date().toISOString().split('T')[0];
    db.all(`SELECT * FROM diagnostics WHERE date(diagnostic_date) = ? ORDER BY diagnostic_date DESC`, [today], callback);
}

function getAllDiagnostics(limit = 50, callback) {
    db.all(`SELECT * FROM diagnostics ORDER BY diagnostic_date DESC LIMIT ?`, [limit], callback);
}

function getStatistics(callback) {
    db.get(`SELECT 
            (SELECT COUNT(*) FROM users WHERE is_admin = 0) as total_users,
            (SELECT COUNT(*) FROM diagnostics) as total_diagnostics,
            (SELECT COUNT(*) FROM diagnostics WHERE is_free = 1) as free_diagnostics,
            (SELECT COUNT(*) FROM diagnostics WHERE is_free = 0) as paid_diagnostics,
            (SELECT SUM(price) FROM diagnostics WHERE is_free = 0) as total_income,
            (SELECT COUNT(*) FROM errors) as total_errors,
            (SELECT COUNT(*) FROM errors WHERE status = 'pending') as pending_errors
            `, [], callback);
}

function addError(userId, carNumber, errorCode, errorDescription, callback) {
    const errorDate = new Date().toISOString();
    db.run(`INSERT INTO errors (user_id, car_number, error_date, error_code, error_description, status)
            VALUES (?, ?, ?, ?, ?, 'pending')`,
            [userId, carNumber, errorDate, errorCode, errorDescription], callback);
}

function getErrors(callback) {
    db.all(`SELECT * FROM errors ORDER BY error_date DESC LIMIT 50`, [], callback);
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
            resize_keyboard: true
        }
    };
}

function getUserKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                ['📊 Mening sahifam', '🎁 Mening bonuslarim'],
                ['📋 Diagnostika tarixim', 'ℹ️ Ma\'lumot'],
                ['❌ Asosiy menyu']
            ],
            resize_keyboard: true
        }
    };
}

function getPhoneKeyboard() {
    return {
        reply_markup: {
            keyboard: [[{ text: '📱 Telefon raqamini yuborish', request_contact: true }]],
            one_time_keyboard: true,
            resize_keyboard: true
        }
    };
}

function getBackupListKeyboard(backups) {
    const keyboard = backups.slice(0, 10).map(b => [{ text: `📁 ${b.name} (${b.date.toLocaleDateString()})`, callback_data: `restore_${b.name}` }]);
    keyboard.push([{ text: '❌ Bekor qilish', callback_data: 'restore_cancel' }]);
    return { reply_markup: { inline_keyboard: keyboard } };
}

// -------------------- GLOBAL O'ZGARUVCHILAR --------------------
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

// -------------------- ASOSIY MENYU --------------------
async function sendMainMenu(chatId, isAdminUser = false) {
    if (isAdminUser) {
        await bot.sendMessage(chatId, '👑 **Admin paneliga xush kelibsiz!**', {
            parse_mode: 'Markdown',
            ...getAdminKeyboard()
        });
    } else {
        await bot.sendMessage(chatId, '🏠 **Asosiy menyu**\n\n🚗 ISUZU DOCTOR botiga xush kelibsiz!', {
            parse_mode: 'Markdown',
            ...getUserKeyboard()
        });
    }
}

// -------------------- /start KOMANDASI --------------------
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    clearUserSession(userId);
    
    // Foydalanuvchi mavjudligini tekshirish
    userExists(userId, (err, exists) => {
        if (exists) {
            // Foydalanuvchi allaqachon ro'yxatdan o'tgan - registratsiya talab qilinmaydi
            getUser(userId, (err, user) => {
                if (user) {
                    const welcomeText = `👋 **Xush kelibsiz!**\n\n🚗 Avtomobil: ${user.car_number}\n📞 Telefon: ${user.phone_number}\n🎁 Bonus: ${user.bonus_count}/5\n🎉 Bepul: ${user.free_diagnostics} ta\n📊 Jami: ${user.total_diagnostics} ta diagnostika`;
                    bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
                    sendMainMenu(chatId, user.is_admin === 1);
                } else {
                    sendMainMenu(chatId, false);
                }
            });
        } else {
            // Yangi foydalanuvchi - registratsiya kerak
            bot.sendMessage(chatId, '🚗 **ISUZU DOCTOR** tizimiga xush kelibsiz!\n\n📱 Iltimos, telefon raqamingizni yuboring:', {
                parse_mode: 'Markdown',
                ...getPhoneKeyboard()
            });
        }
    });
});

// -------------------- KONTAKT QABUL QILISH --------------------
bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const contact = msg.contact;
    
    if (!contact) return;
    
    let phoneNumber = contact.phone_number;
    if (!phoneNumber.startsWith('+')) {
        phoneNumber = '+' + phoneNumber;
    }
    
    const session = getUserSession(userId);
    session.data.phone = phoneNumber;
    
    // ADMIN TEKSHIRISH
    if (phoneNumber === ADMIN_PHONE) {
        const registeredDate = new Date().toISOString();
        db.run(`INSERT OR REPLACE INTO users (user_id, phone_number, car_number, is_admin, registered_date, bonus_count, free_diagnostics, total_diagnostics)
                VALUES (?, ?, 'ADMIN', 1, ?, 0, 0, 0)`, [userId, phoneNumber, registeredDate], () => {
            bot.sendMessage(chatId, `👑 **Siz ADMIN sifatida tizimga kirdingiz!**\n\n📞 Telefon: ${phoneNumber}`, { parse_mode: 'Markdown' });
            sendMainMenu(chatId, true);
            clearUserSession(userId);
        });
        return;
    }
    
    session.step = 'car_number';
    await bot.sendMessage(chatId, `✅ Telefon raqam qabul qilindi: ${phoneNumber}\n\n🚗 Endi avtomobil raqamini kiriting:\n\nMasalan: 01A777AA`, {
        parse_mode: 'Markdown',
        reply_markup: { remove_keyboard: true }
    });
});

// -------------------- MATNLARNI QAYTA ISHLASH --------------------
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    if (msg.photo) return;
    if (msg.contact) return;
    if (!text) return;
    if (text === '/start') return;
    
    const session = getUserSession(userId);
    
    // AVTOMOBIL RAQAM KIRITISH
    if (session.step === 'car_number') {
        const carNumber = text.toUpperCase().trim();
        
        if (carNumber.length < 2 || carNumber.length > 10) {
            await bot.sendMessage(chatId, '❌ **Noto\'g\'ri avtomobil raqami!**\n\nIltimos, to\'g\'ri raqam kiriting (2-10 belgi):', { parse_mode: 'Markdown' });
            return;
        }
        
        addUser(userId, session.data.phone, carNumber, (err) => {
            if (err) {
                bot.sendMessage(chatId, '❌ **Xatolik yuz berdi!** Qaytadan /start bosing.', { parse_mode: 'Markdown' });
                return;
            }
            
            bot.sendMessage(chatId, `✅ **Siz muvaffaqiyatli ro'yxatdan o'tdingiz!**\n\n🚗 Avtomobil: ${carNumber}\n📞 Telefon: ${session.data.phone}\n\n🎁 **Bonus tizimi:** Har 5 diagnostikada 1 ta BEPUL!`, { parse_mode: 'Markdown' });
            sendMainMenu(chatId, false);
            clearUserSession(userId);
        });
        return;
    }
    
    // ADMIN DIAGNOSTIKA QO'SHISH - AVTOMOBIL RAQAMI
    if (session.step === 'admin_add_diagnostic') {
        const carNumber = text.toUpperCase().trim();
        getUserByCarNumber(carNumber, (err, user) => {
            if (!user) {
                bot.sendMessage(chatId, '❌ **Bunday avtomobil topilmadi!**\n\nIltimos, to\'g\'ri avtomobil raqamini kiriting:', { parse_mode: 'Markdown' });
                return;
            }
            
            session.data.targetUser = user;
            session.step = 'admin_work_description';
            bot.sendMessage(chatId, `✅ Foydalanuvchi topildi:\n\n🚗 ${user.car_number}\n📞 ${user.phone_number}\n🎁 Bonus: ${user.bonus_count}/5\n🎉 Bepul: ${user.free_diagnostics}\n\n🔧 **Bajarilgan ishlarni kiriting:**`, { parse_mode: 'Markdown' });
        });
        return;
    }
    
    // ADMIN - BAJARILGAN ISHLAR
    if (session.step === 'admin_work_description') {
        session.data.workDescription = text;
        session.step = 'admin_additional_notes';
        bot.sendMessage(chatId, `✅ Bajarilgan ishlar qabul qilindi:\n\n📝 "${text}"\n\n➕ **Qo'shimcha eslatmalar kiriting** (ixtiyoriy):\n\n"❌ Bekor qilish" - bekor qilish uchun`, { parse_mode: 'Markdown' });
        return;
    }
    
    // ADMIN - QO'SHIMCHA ESLATMALAR
    if (session.step === 'admin_additional_notes') {
        session.data.additionalNotes = text === '❌ Bekor qilish' ? '' : text;
        
        addDiagnostic(
            session.data.targetUser.user_id,
            session.data.targetUser.car_number,
            session.data.targetUser.phone_number,
            session.data.workDescription,
            session.data.additionalNotes,
            (err, result) => {
                if (err) {
                    bot.sendMessage(chatId, '❌ **Xatolik yuz berdi!**', { parse_mode: 'Markdown' });
                    clearUserSession(userId);
                    sendMainMenu(chatId, true);
                    return;
                }
                
                let adminResponse = `🔧 **DIAGNOSTIKA QO'SHILDI**\n\n🚗 ${session.data.targetUser.car_number}\n📞 ${session.data.targetUser.phone_number}\n💰 Narx: ${result.price.toLocaleString()} so'm\n\n${result.bonusMessage}`;
                bot.sendMessage(chatId, adminResponse, { parse_mode: 'Markdown' });
                
                // Foydalanuvchiga xabar
                let userMsg = `🔧 **DIAGNOSTIKA NATIJALARI**\n\n🚗 ${session.data.targetUser.car_number}\n📝 ${session.data.workDescription}\n\n💰 Narx: ${result.price.toLocaleString()} so'm\n\n${result.bonusMessage}`;
                bot.sendMessage(session.data.targetUser.user_id, userMsg, { parse_mode: 'Markdown' }).catch(() => {});
                
                clearUserSession(userId);
                sendMainMenu(chatId, true);
            });
        return;
    }
    
    // FOYDALANUVCHI MENYUSI
    isAdmin(userId, (err, isAdminUser) => {
        if (!isAdminUser) {
            if (text === '📊 Mening sahifam') {
                getUser(userId, (err, user) => {
                    if (!user) { bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan!'); return; }
                    bot.sendMessage(chatId, `📊 **MENGING SAHIFAM**\n\n🚗 ${user.car_number}\n📞 ${user.phone_number}\n🎁 Bonus: ${user.bonus_count}/5\n🎉 Bepul: ${user.free_diagnostics} ta\n📊 Jami: ${user.total_diagnostics} ta`, { parse_mode: 'Markdown' });
                });
            }
            else if (text === '🎁 Mening bonuslarim') {
                getUser(userId, (err, user) => {
                    if (!user) { bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan!'); return; }
                    const nextFree = 5 - user.bonus_count;
                    bot.sendMessage(chatId, `🎁 **MENGING BONUSLARIM**\n\n📊 ${user.bonus_count}/5\n🎉 Bepul: ${user.free_diagnostics} ta\n${nextFree > 0 ? `📌 Keyingi BEPUL: ${nextFree} ta` : '🎉 BEPUL qozondingiz!'}\n\n🎯 Har 5 diagnostikada 1 ta BEPUL!`, { parse_mode: 'Markdown' });
                });
            }
            else if (text === '📋 Diagnostika tarixim') {
                getUserDiagnostics(userId, 10, (err, diags) => {
                    if (!diags || diags.length === 0) {
                        bot.sendMessage(chatId, '📭 **Sizda hali diagnostikalar mavjud emas!**', { parse_mode: 'Markdown' });
                        return;
                    }
                    for (const d of diags.reverse()) {
                        bot.sendMessage(chatId, `📅 ${new Date(d.diagnostic_date).toLocaleDateString()}\n📝 ${d.work_description}\n💰 ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}\n━━━━━━━━━━`, { parse_mode: 'Markdown' });
                    }
                });
            }
            else if (text === 'ℹ️ Ma\'lumot') {
                bot.sendMessage(chatId, `ℹ️ **ISUZU DOCTOR BOT**\n\n🚗 Avtomobil diagnostikasi\n🎁 Har 5 diagnostikada 1 ta BEPUL\n📞 Aloqa: ${ADMIN_PHONE}`, { parse_mode: 'Markdown' });
            }
            else if (text === '❌ Asosiy menyu') {
                clearUserSession(userId);
                sendMainMenu(chatId, false);
            }
            else if (!session.step) {
                bot.sendMessage(chatId, '❌ **Tushunarsiz buyruq!** Menyudan foydalaning.', { parse_mode: 'Markdown' });
            }
            return;
        }
        
        // ADMIN MENYUSI
        if (text === '📊 Statistika') {
            getStatistics((err, stats) => {
                bot.sendMessage(chatId, `📊 **STATISTIKA**\n\n👥 Foydalanuvchilar: ${stats.total_users}\n🔧 Jami: ${stats.total_diagnostics}\n💰 To'lovli: ${stats.paid_diagnostics}\n🎉 Bepul: ${stats.free_diagnostics}\n💵 Daromad: ${(stats.total_income || 0).toLocaleString()} so'm\n⚠️ Xatoliklar: ${stats.total_errors || 0}`, { parse_mode: 'Markdown' });
            });
        }
        else if (text === '👥 Foydalanuvchilar') {
            getAllUsers((err, users) => {
                if (!users || users.length === 0) { bot.sendMessage(chatId, '📭 Hech qanday foydalanuvchi yo\'q'); return; }
                let msg = '👥 **FOYDALANUVCHILAR**\n\n';
                users.slice(0, 15).forEach(u => { msg += `🚗 ${u.car_number}\n📞 ${u.phone_number}\n🎁 ${u.bonus_count}/5\n━━━━━━\n`; });
                bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            });
        }
        else if (text === '🔧 Diagnostika qo\'shish') {
            session.step = 'admin_add_diagnostic';
            bot.sendMessage(chatId, '🔧 **Diagnostika qo\'shish**\n\n🚗 Avtomobil raqamini kiriting:', { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
        }
        else if (text === '🎁 Bonusga yaqinlar') {
            getNearBonusUsers((err, users) => {
                if (!users || users.length === 0) { bot.sendMessage(chatId, '📭 Bonusga yaqin foydalanuvchilar yo\'q'); return; }
                let msg = '🎁 **BONUSGA YAQINLAR**\n\n';
                users.forEach(u => { msg += `🚗 ${u.car_number}\n📞 ${u.phone_number}\n🎁 ${u.bonus_count}/5 (${5 - u.bonus_count} ta qolgan)\n━━━━━━\n`; });
                bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            });
        }
        else if (text === '⚠️ Xatoliklar') {
            getErrors((err, errors) => {
                if (!errors || errors.length === 0) { bot.sendMessage(chatId, '✅ Hech qanday xatolik yo\'q'); return; }
                let msg = '⚠️ **XATOLIKLAR**\n\n';
                errors.slice(0, 10).forEach(e => { msg += `🚗 ${e.car_number}\n🔴 ${e.error_code}\n📝 ${e.error_description}\n📅 ${new Date(e.error_date).toLocaleDateString()}\n━━━━━━\n`; });
                bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            });
        }
        else if (text === '📋 Diagnostikalar tarixi') {
            getAllDiagnostics(20, (err, diags) => {
                if (!diags || diags.length === 0) { bot.sendMessage(chatId, '📭 Hech qanday diagnostika yo\'q'); return; }
                for (const d of diags.slice(0, 10)) {
                    bot.sendMessage(chatId, `📅 ${new Date(d.diagnostic_date).toLocaleDateString()}\n🚗 ${d.car_number}\n📝 ${d.work_description.substring(0, 50)}...\n💰 ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}\n━━━━━━━━━━`, { parse_mode: 'Markdown' });
                }
            });
        }
        else if (text === '📅 Bugungi diagnostikalar') {
            getTodayDiagnostics((err, diags) => {
                if (!diags || diags.length === 0) { bot.sendMessage(chatId, '📭 Bugun hech qanday diagnostika yo\'q'); return; }
                let msg = '📅 **BUGUNGI DIAGNOSTIKALAR**\n\n';
                diags.forEach(d => { msg += `🚗 ${d.car_number}\n📝 ${d.work_description.substring(0, 40)}...\n💰 ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}\n━━━━━━\n`; });
                bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            });
        }
        else if (text === '💾 Backup yaratish') {
            bot.sendMessage(chatId, '💾 **Backup yaratilmoqda...**', { parse_mode: 'Markdown' });
            createBackup().then(backupFile => {
                bot.sendMessage(chatId, `✅ **Backup yaratildi!**\n\n📁 ${path.basename(backupFile)}\n📅 ${new Date().toLocaleString()}`, { parse_mode: 'Markdown' });
            }).catch(err => {
                bot.sendMessage(chatId, '❌ **Backup yaratishda xatolik!**', { parse_mode: 'Markdown' });
            });
        }
        else if (text === '🔄 Database tiklash') {
            listBackups().then(backups => {
                if (backups.length === 0) {
                    bot.sendMessage(chatId, '❌ **Hech qanday backup topilmadi!**\n\n💾 Avval "💾 Backup yaratish" tugmasini bosing.', { parse_mode: 'Markdown' });
                } else {
                    bot.sendMessage(chatId, '🔄 **Database tiklash**\n\nQuyidagi backup'lardan birini tanlang:', { parse_mode: 'Markdown', ...getBackupListKeyboard(backups) });
                }
            });
        }
        else if (text === '❌ Asosiy menyu') {
            clearUserSession(userId);
            sendMainMenu(chatId, true);
        }
        else if (!session.step) {
            bot.sendMessage(chatId, '❌ **Tushunarsiz buyruq!** Menyudan foydalaning.', { parse_mode: 'Markdown' });
        }
    });
});

// -------------------- CALLBACK QUERY (BACKUP TIKLASH) --------------------
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    
    if (data.startsWith('restore_')) {
        const backupName = data.replace('restore_', '');
        bot.answerCallbackQuery(query.id);
        bot.sendMessage(chatId, '🔄 **Database tiklanmoqda...**\n\n⚠️ Bu jarayon bir necha daqiqa vaqt olishi mumkin.', { parse_mode: 'Markdown' });
        
        restoreBackup(backupName).then(() => {
            bot.sendMessage(chatId, `✅ **Database muvaffaqiyatli tiklandi!**\n\n📁 ${backupName}\n📅 ${new Date().toLocaleString()}\n\n🔄 Bot qayta ishga tushdi, barcha foydalanuvchilar ma'lumotlari tiklandi.`, { parse_mode: 'Markdown' });
        }).catch(err => {
            bot.sendMessage(chatId, '❌ **Database tiklashda xatolik!**\n\nBackup fayli buzilgan bo\'lishi mumkin.', { parse_mode: 'Markdown' });
        });
    } else if (data === 'restore_cancel') {
        bot.answerCallbackQuery(query.id);
        bot.sendMessage(chatId, '❌ **Database tiklash bekor qilindi.**', { parse_mode: 'Markdown' });
        sendMainMenu(chatId, true);
    }
});

// -------------------- XATOLIKLARNI QAYTA ISHLASH --------------------
bot.on('polling_error', (error) => console.error('Polling xatolik:', error));
process.on('uncaughtException', (error) => console.error('Uncaught exception:', error));

// -------------------- BOTNI ISHGA TUSHIRISH --------------------
console.log('='.repeat(60));
console.log('🚗 ISUZU DOCTOR BOT ISHGA TUSHMOQDA');
console.log('='.repeat(60));

initDatabase();

console.log('='.repeat(60));
console.log('🚗 ISUZU DOCTOR BOT ISHGA TUSHDI');
console.log('='.repeat(60));
console.log(`👑 Admin telefon: ${ADMIN_PHONE}`);
console.log(`💰 Diagnostika narxi: ${DIAGNOSTIC_PRICE.toLocaleString()} so'm`);
console.log('='.repeat(60));
console.log('✅ Bot ishlashga tayyor!');
