const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

// -------------------- VERSIYA MA'LUMOTLARI --------------------
const BOT_VERSION = "1.3.0";
const NEW_BOT_LINK = "https://t.me/Isuzu_doctor_bot";
const INSTAGRAM_LINK = "https://www.instagram.com/isuzu.samarkand";
const INSTAGRAM_USERNAME = "isuzu.samarkand";

// Instagram bonus xabari (faqat link bilan)
const INSTAGRAM_BONUS_MESSAGE = `
📸 *INSTAGRAM OBUNA BONUSI!*

Instagram sahifamizga obuna bo'ling va 1 ta BEPUL diagnostika qozoning!

🎁 *BONUS:* 1 ta BEPUL diagnostika (barcha avtomobillaringizga)

👇 *Instagram sahifamizga o'tish uchun tugmani bosing:*

⚠️ *Eslatma:* Bonus faqat 1 marta beriladi!
Obuna bo'lgach, admin bilan bog'lanib bonusni oling.
`;

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

const USERS_FILE = path.join(VOLUME_PATH, 'users.json');
const DIAGNOSTICS_FILE = path.join(VOLUME_PATH, 'diagnostics.json');
const ERRORS_FILE = path.join(VOLUME_PATH, 'errors.json');
const VERSION_FILE = path.join(VOLUME_PATH, 'version.json');

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

ensureVolumeDir();

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
bot.deleteWebHook().catch(e => console.log('Webhook xatolik:', e.message));

// -------------------- INSTAGRAM BONUS BERISH --------------------
function giveInstagramBonus(userId) {
    const user = getUserByUserId(userId);
    if (!user) return { success: false, message: 'Foydalanuvchi topilmadi!' };
    
    if (user.instagramBonusReceived) {
        return { success: false, message: 'Siz allaqachon Instagram bonusini olgansiz!' };
    }
    
    // Barcha avtomobillarga 1 tadan BEPUL diagnostika qo'shish
    let bonusCount = 0;
    for (const car of user.cars) {
        car.freeDiagnostics += 1;
        bonusCount++;
    }
    
    user.instagramBonusReceived = true;
    user.instagramBonusDate = new Date().toISOString();
    saveUsers();
    
    // Adminlarga xabar yuborish
    for (const adminId of ADMIN_IDS) {
        bot.sendMessage(adminId, 
            `✅ *INSTAGRAM BONUS BERILDI!*\n\n` +
            `👤 Foydalanuvchi: ${user.fullName || user.phone}\n` +
            `📞 Telefon: ${user.phone}\n` +
            `🚗 Avtomobillar: ${bonusCount} ta\n` +
            `🎁 Bonus: ${bonusCount} ta BEPUL diagnostika\n` +
            `📅 Sana: ${new Date().toLocaleString()}`,
            { parse_mode: 'Markdown' }
        ).catch(() => {});
    }
    
    return { 
        success: true, 
        message: `✅ Tabriklaymiz! Instagram sahifamizga obuna bo'lganingiz uchun ${bonusCount} ta BEPUL diagnostika qozondingiz! (Har bir avtomobilingizga 1 tadan)`,
        bonusCount: bonusCount
    };
}

// -------------------- VERSIYA BOSHQARISH --------------------
let currentVersion = BOT_VERSION;
let isUpdateMode = false;

function loadVersion() {
    try {
        if (fs.existsSync(VERSION_FILE)) {
            const versionData = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
            currentVersion = versionData.version;
            isUpdateMode = versionData.updateMode || false;
            console.log(`📌 Joriy versiya: ${currentVersion}, Yangilanish rejimi: ${isUpdateMode}`);
        } else {
            saveVersion();
        }
    } catch (err) {
        console.error('Versiya yuklashda xatolik:', err);
        saveVersion();
    }
}

function saveVersion() {
    const versionData = {
        version: currentVersion,
        updateMode: isUpdateMode,
        lastUpdate: new Date().toISOString(),
        newBotLink: NEW_BOT_LINK
    };
    fs.writeFileSync(VERSION_FILE, JSON.stringify(versionData, null, 2));
}

function enableUpdateMode() {
    isUpdateMode = true;
    saveVersion();
    console.log('🔄 Yangilanish rejimi faollashtirildi!');
}

function disableUpdateMode() {
    isUpdateMode = false;
    saveVersion();
    console.log('✅ Yangilanish rejimi o\'chirildi');
}

async function notifyAllUsersAboutUpdate() {
    const activeUsers = users.filter(u => !u.isAdmin && !u.isBlocked);
    let successCount = 0;
    let failCount = 0;
    
    for (const user of activeUsers) {
        try {
            await bot.sendMessage(user.userId, `🚀 *YANGI VERSIYA CHIQDI!*\n\nBotimiz yangilandi. Iltimos, yangi botga o'ting:\n${NEW_BOT_LINK}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🚀 Yangi botga o\'tish', url: NEW_BOT_LINK }]
                    ]
                }
            });
            successCount++;
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            failCount++;
            console.error(`Xabar yuborilmadi (${user.userId}):`, error.message);
        }
    }
    
    return { success: successCount, fail: failCount };
}

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
    
    if (fs.existsSync(USERS_FILE)) {
        fs.copyFileSync(USERS_FILE, path.join(BACKUP_DIR, `users_backup_${timestamp}.json`));
    }
    if (fs.existsSync(DIAGNOSTICS_FILE)) {
        fs.copyFileSync(DIAGNOSTICS_FILE, path.join(BACKUP_DIR, `diagnostics_backup_${timestamp}.json`));
    }
    if (fs.existsSync(ERRORS_FILE)) {
        fs.copyFileSync(ERRORS_FILE, path.join(BACKUP_DIR, `errors_backup_${timestamp}.json`));
    }
    
    const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json'));
    while (backups.length > 30) {
        const oldest = backups.sort()[0];
        fs.unlinkSync(path.join(BACKUP_DIR, oldest));
        backups.shift();
    }
    console.log(`✅ Backup yaratildi: ${timestamp}`);
    return true;
}

function listBackups() {
    ensureVolumeDir();
    const backups = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('users_backup_') && f.endsWith('.json'))
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
    
    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    fs.writeFileSync(USERS_FILE, JSON.stringify(backupData, null, 2));
    
    const diagBackupName = backupName.replace('users_backup_', 'diagnostics_backup_');
    const diagBackupPath = path.join(BACKUP_DIR, diagBackupName);
    if (fs.existsSync(diagBackupPath)) {
        const diagData = JSON.parse(fs.readFileSync(diagBackupPath, 'utf8'));
        fs.writeFileSync(DIAGNOSTICS_FILE, JSON.stringify(diagData, null, 2));
    }
    
    console.log(`✅ Database tiklandi: ${backupName}`);
    return true;
}

// -------------------- DATABASE FUNKSIYALARI --------------------
let users = [];
let diagnostics = [];
let errors = [];

function loadData() {
    try {
        ensureVolumeDir();
        
        if (fs.existsSync(USERS_FILE)) {
            users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            users.forEach(u => {
                if (u.isBlocked === undefined) u.isBlocked = false;
                if (u.instagramBonusReceived === undefined) u.instagramBonusReceived = false;
                if (u.instagramBonusDate === undefined) u.instagramBonusDate = null;
            });
            saveUsers();
        } else {
            users = [];
            saveUsers();
        }
        
        if (fs.existsSync(DIAGNOSTICS_FILE)) {
            diagnostics = JSON.parse(fs.readFileSync(DIAGNOSTICS_FILE, 'utf8'));
        } else {
            diagnostics = [];
            saveDiagnostics();
        }
        
        if (fs.existsSync(ERRORS_FILE)) {
            errors = JSON.parse(fs.readFileSync(ERRORS_FILE, 'utf8'));
        } else {
            errors = [];
            saveErrors();
        }
        
        console.log(`✅ Yuklandi: ${users.length} foydalanuvchi, ${diagnostics.length} diagnostika`);
        console.log(`✅ Volume manzili: ${VOLUME_PATH}`);
    } catch (err) {
        console.error('Ma\'lumot yuklashda xatolik:', err);
        users = [];
        diagnostics = [];
        errors = [];
    }
}

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function saveDiagnostics() {
    fs.writeFileSync(DIAGNOSTICS_FILE, JSON.stringify(diagnostics, null, 2));
}

function saveErrors() {
    fs.writeFileSync(ERRORS_FILE, JSON.stringify(errors, null, 2));
}

function getUserByPhone(phone) {
    return users.find(u => u.phone === phone);
}

function getUserByUserId(userId) {
    return users.find(u => u.userId === userId);
}

function isAdmin(userId) {
    if (ADMIN_IDS.includes(userId)) return true;
    const user = getUserByUserId(userId);
    return user ? user.isAdmin === true : false;
}

function blockUser(userId) {
    const user = getUserByUserId(userId);
    if (!user) return { success: false, message: 'Foydalanuvchi topilmadi' };
    if (user.isAdmin) return { success: false, message: 'Adminni bloklab bo\'lmaydi!' };
    
    user.isBlocked = true;
    saveUsers();
    return { success: true, message: `Foydalanuvchi bloklandi: ${user.fullName || user.phone}` };
}

function unblockUser(userId) {
    const user = getUserByUserId(userId);
    if (!user) return { success: false, message: 'Foydalanuvchi topilmadi' };
    
    user.isBlocked = false;
    saveUsers();
    return { success: true, message: `Foydalanuvchi blokdan ochildi: ${user.fullName || user.phone}` };
}

function deleteUser(userId) {
    const userIndex = users.findIndex(u => u.userId === userId);
    if (userIndex === -1) return { success: false, message: 'Foydalanuvchi topilmadi' };
    
    const user = users[userIndex];
    if (user.isAdmin) return { success: false, message: 'Adminni o\'chirib bo\'lmaydi!' };
    
    const userDiagnostics = diagnostics.filter(d => d.userId === userId);
    diagnostics = diagnostics.filter(d => d.userId !== userId);
    saveDiagnostics();
    
    users.splice(userIndex, 1);
    saveUsers();
    
    return { 
        success: true, 
        message: `Foydalanuvchi o'chirildi: ${user.fullName || user.phone}`,
        deletedDiagnostics: userDiagnostics.length
    };
}

function getBlockedUsers() {
    return users.filter(u => !u.isAdmin && u.isBlocked === true);
}

function getActiveUsers() {
    return users.filter(u => !u.isAdmin && u.isBlocked !== true);
}

function addNewUser(userId, phoneNumber, carNumber, firstName, lastName, username) {
    const newUser = {
        userId: userId,
        phone: phoneNumber,
        firstName: firstName || '',
        lastName: lastName || '',
        username: username || '',
        fullName: `${firstName || ''} ${lastName || ''}`.trim(),
        isAdmin: false,
        isActive: true,
        isBlocked: false,
        instagramBonusReceived: false,
        instagramBonusDate: null,
        registeredDate: new Date().toISOString(),
        cars: [{
            carId: Date.now(),
            carNumber: carNumber,
            bonusCount: 0,
            freeDiagnostics: 0,
            totalDiagnostics: 0,
            addedDate: new Date().toISOString(),
            isActive: true
        }],
        totalBonusCount: 0,
        totalFreeDiagnostics: 0,
        totalDiagnosticsAll: 0
    };
    users.push(newUser);
    saveUsers();
    return newUser;
}

function addCarToUser(phoneNumber, carNumber, userInfo = {}) {
    const user = getUserByPhone(phoneNumber);
    if (!user) return { success: false, message: 'Foydalanuvchi topilmadi' };
    
    if (user.cars.length >= MAX_CARS_PER_USER) {
        return { success: false, message: `Siz maksimum ${MAX_CARS_PER_USER} ta avtomobil qo'sha olasiz!` };
    }
    
    const existingCar = user.cars.find(c => c.carNumber === carNumber);
    if (existingCar) {
        return { success: false, message: 'Bu avtomobil raqami allaqachon qo\'shilgan!' };
    }
    
    if (userInfo.firstName && !user.firstName) {
        user.firstName = userInfo.firstName;
        user.lastName = userInfo.lastName || '';
        user.username = userInfo.username || '';
        user.fullName = `${userInfo.firstName || ''} ${userInfo.lastName || ''}`.trim();
        saveUsers();
    }
    
    user.cars.push({
        carId: Date.now(),
        carNumber: carNumber,
        bonusCount: 0,
        freeDiagnostics: 0,
        totalDiagnostics: 0,
        addedDate: new Date().toISOString(),
        isActive: true
    });
    
    saveUsers();
    return { success: true, message: 'Yangi avtomobil qo\'shildi!', carsCount: user.cars.length };
}

function addDiagnosticToCar(phoneNumber, carNumber, workDescription, additionalNotes) {
    const user = getUserByPhone(phoneNumber);
    if (!user) return { success: false, message: 'Foydalanuvchi topilmadi' };
    
    const car = user.cars.find(c => c.carNumber === carNumber);
    if (!car) return { success: false, message: 'Avtomobil topilmadi' };
    
    let isFree = false;
    let bonusMessage = '';
    let newBonusCount = car.bonusCount;
    let newFreeDiagnostics = car.freeDiagnostics;
    
    if (car.freeDiagnostics > 0) {
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
    
    const diagnostic = {
        id: Date.now(),
        userId: user.userId,
        phoneNumber: phoneNumber,
        carNumber: carNumber,
        date: new Date().toISOString(),
        workDescription: workDescription,
        additionalNotes: additionalNotes || '',
        price: isFree ? 0 : DIAGNOSTIC_PRICE,
        isFree: isFree
    };
    diagnostics.push(diagnostic);
    saveDiagnostics();
    
    car.bonusCount = newBonusCount;
    car.freeDiagnostics = newFreeDiagnostics;
    car.totalDiagnostics++;
    
    user.totalDiagnosticsAll++;
    if (isFree) {
        user.totalFreeDiagnostics = (user.totalFreeDiagnostics || 0) + 1;
    } else {
        user.totalBonusCount = (user.totalBonusCount || 0) + 1;
    }
    
    saveUsers();
    
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
    return diagnostics.filter(d => d.phoneNumber === phoneNumber).slice(-limit).reverse();
}

function getNearBonusCars() {
    const nearBonus = [];
    for (const user of users) {
        if (user.isAdmin) continue;
        for (const car of user.cars) {
            if (car.bonusCount >= 3 && car.bonusCount < 5) {
                nearBonus.push({
                    phone: user.phone,
                    carNumber: car.carNumber,
                    bonusCount: car.bonusCount,
                    remaining: 5 - car.bonusCount,
                    fullName: user.fullName || 'Ism kiritilmagan'
                });
            }
        }
    }
    return nearBonus;
}

function getTodayDiagnostics() {
    const today = new Date().toISOString().split('T')[0];
    return diagnostics.filter(d => d.date.split('T')[0] === today);
}

function getAllDiagnostics(limit = 50) {
    return diagnostics.slice(-limit).reverse();
}

function getStatistics() {
    const regularUsers = users.filter(u => !u.isAdmin);
    const blockedUsers = users.filter(u => !u.isAdmin && u.isBlocked === true);
    const activeUsers = regularUsers.filter(u => u.isBlocked !== true);
    const instagramBonusUsers = users.filter(u => u.instagramBonusReceived === true).length;
    
    let totalCars = 0;
    for (const user of activeUsers) {
        totalCars += user.cars.length;
    }
    
    const paidDiagnostics = diagnostics.filter(d => !d.isFree);
    const totalIncome = paidDiagnostics.reduce((sum, d) => sum + d.price, 0);
    
    return {
        totalUsers: activeUsers.length,
        blockedUsers: blockedUsers.length,
        instagramBonusUsers: instagramBonusUsers,
        totalCars: totalCars,
        totalDiagnostics: diagnostics.length,
        paidDiagnostics: paidDiagnostics.length,
        freeDiagnostics: diagnostics.filter(d => d.isFree).length,
        totalIncome: totalIncome,
        totalErrors: errors.length,
        currentVersion: currentVersion,
        isUpdateMode: isUpdateMode
    };
}

function getErrors() {
    return errors.slice(-50).reverse();
}

function getAllUsersWithDetails() {
    return users.filter(u => !u.isAdmin).map(u => ({
        userId: u.userId,
        fullName: u.fullName || 'Ism kiritilmagan',
        firstName: u.firstName || '',
        lastName: u.lastName || '',
        username: u.username || '',
        phone: u.phone,
        cars: u.cars,
        totalDiagnostics: u.totalDiagnosticsAll || 0,
        registeredDate: u.registeredDate,
        isBlocked: u.isBlocked || false,
        instagramBonusReceived: u.instagramBonusReceived || false
    }));
}

// -------------------- KEYBOARDS --------------------
function getAdminKeyboard() {
    const keyboard = [
        ['📊 Statistika', '👥 Foydalanuvchilar'],
        ['🔧 Diagnostika qo\'shish', '🎁 Bonusga yaqinlar'],
        ['⚠️ Xatoliklar', '📋 Diagnostikalar tarixi'],
        ['📅 Bugungi diagnostikalar', '💾 Backup yaratish'],
        ['🔄 Database tiklash', '🚫 Foydalanuvchini boshqarish'],
        ['📸 Instagram bonus', '🎁 Instagram statistika']
    ];
    
    if (!isUpdateMode) {
        keyboard.push(['🚀 Yangi versiyaga o\'tish']);
    } else {
        keyboard.push(['✅ Yangilanish rejimini o\'chirish']);
    }
    
    keyboard.push(['❌ Asosiy menyu']);
    
    return {
        reply_markup: {
            keyboard: keyboard,
            resize_keyboard: true,
            one_time_keyboard: false,
            selective: true
        }
    };
}

function getUserKeyboard() {
    const keyboard = [
        ['📊 Mening sahifam', '🚗 Mening avtomobillarim'],
        ['🎁 Mening bonuslarim', '➕ Yangi avtomobil qo\'shish'],
        ['📋 Diagnostika tarixim', '📸 Instagram bonus'],
        ['ℹ️ Ma\'lumot', '❌ Asosiy menyu']
    ];
    
    return {
        reply_markup: {
            keyboard: keyboard,
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

function getUserManagementKeyboard(users, page = 0) {
    const itemsPerPage = 5;
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const pageUsers = users.slice(start, end);
    
    const keyboard = [];
    
    pageUsers.forEach(user => {
        const status = user.isBlocked ? '🔴 Bloklangan' : '🟢 Faol';
        keyboard.push([{
            text: `${user.fullName || 'Ismsiz'} - ${user.phone} (${status})`,
            callback_data: `manage_user_${user.userId}`
        }]);
    });
    
    const navButtons = [];
    if (page > 0) {
        navButtons.push({ text: '◀️ Oldingi', callback_data: `user_page_${page - 1}` });
    }
    if (end < users.length) {
        navButtons.push({ text: 'Keyingi ▶️', callback_data: `user_page_${page + 1}` });
    }
    if (navButtons.length > 0) {
        keyboard.push(navButtons);
    }
    
    keyboard.push([{ text: '❌ Bekor qilish', callback_data: 'user_manage_cancel' }]);
    
    return { reply_markup: { inline_keyboard: keyboard } };
}

function getUserActionKeyboard(userId, isBlocked) {
    const keyboard = [];
    
    if (isBlocked) {
        keyboard.push([{ text: '✅ Blokdan ochish', callback_data: `unblock_user_${userId}` }]);
    } else {
        keyboard.push([{ text: '🚫 Bloklash', callback_data: `block_user_${userId}` }]);
    }
    
    keyboard.push([{ text: '🗑️ O\'chirish', callback_data: `delete_user_${userId}` }]);
    keyboard.push([{ text: '🔙 Orqaga', callback_data: 'back_to_user_list' }]);
    
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
            await bot.sendMessage(chatId, `🏠 *Asosiy menyu* (Versiya ${BOT_VERSION})\n\n🚗 ISUZU DOCTOR botiga xush kelibsiz!\n\nQuyidagi tugmalardan birini tanlang:`, {
                parse_mode: 'Markdown',
                ...getUserKeyboard()
            });
        }
    } catch (error) {
        console.error('Menu yuborishda xatolik:', error);
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
    
    if (existingUser && existingUser.isBlocked) {
        await bot.sendMessage(chatId, '🚫 *Siz botdan bloklangansiz!*\n\nIltimos, administrator bilan bog\'laning.\n📞 Aloqa: ' + ADMIN_PHONE, { 
            parse_mode: 'Markdown',
            reply_markup: { remove_keyboard: true }
        });
        return;
    }
    
    try {
        await sendReminder(chatId);
        
        if (existingUser) {
            if (!existingUser.firstName && firstName) {
                existingUser.firstName = firstName;
                existingUser.lastName = lastName;
                existingUser.username = username;
                existingUser.fullName = `${firstName} ${lastName}`.trim();
                saveUsers();
            }
            
            const carsCount = existingUser.cars.length;
            let welcomeText = `👋 *Xush kelibsiz, ${existingUser.fullName || firstName || 'hurmatli mijoz'}!*\n\n📞 Telefon: ${existingUser.phone}\n🚗 Avtomobillar: ${carsCount} ta\n🎁 Umumiy bonus: ${existingUser.totalBonusCount || 0}\n🎉 Bepul: ${existingUser.totalFreeDiagnostics || 0} ta\n📊 Jami diagnostika: ${existingUser.totalDiagnosticsAll || 0} ta\n📌 Bot versiyasi: ${BOT_VERSION}`;
            
            if (existingUser.instagramBonusReceived) {
                welcomeText += `\n📸 Instagram bonus: ✅ olingan`;
            } else {
                welcomeText += `\n📸 Instagram bonus: ❌ olinmagan (Instagram sahifamizga obuna bo'ling)`;
            }
            
            await bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, existingUser.isAdmin);
        } else {
            const session = getUserSession(userId);
            session.data.firstName = firstName;
            session.data.lastName = lastName;
            session.data.username = username;
            
            await bot.sendMessage(chatId, `🚗 *ISUZU DOCTOR* tizimiga xush kelibsiz! (Versiya ${BOT_VERSION})\n\n📱 Iltimos, telefon raqamingizni yuboring:`, {
                parse_mode: 'Markdown',
                ...getPhoneKeyboard()
            });
        }
    } catch (error) {
        console.error('/start xatolik:', error);
        await bot.sendMessage(chatId, '❌ *Xatolik yuz berdi!* Iltimos, qaytadan /start bosing.', { parse_mode: 'Markdown' });
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
        const newUser = {
            userId: userId,
            phone: phoneNumber,
            firstName: firstName,
            lastName: lastName,
            username: username,
            fullName: `${firstName} ${lastName}`.trim(),
            isAdmin: true,
            isActive: true,
            isBlocked: false,
            instagramBonusReceived: false,
            instagramBonusDate: null,
            registeredDate: new Date().toISOString(),
            cars: [{
                carId: Date.now(),
                carNumber: "ADMIN",
                bonusCount: 0,
                freeDiagnostics: 0,
                totalDiagnostics: 0,
                addedDate: new Date().toISOString(),
                isActive: true
            }],
            totalBonusCount: 0,
            totalFreeDiagnostics: 0,
            totalDiagnosticsAll: 0
        };
        users.push(newUser);
        saveUsers();
        
        try {
            await sendReminder(chatId);
            await bot.sendMessage(chatId, `👑 *Siz ADMIN sifatida tizimga kirdingiz!*\n\n📞 Telefon: ${phoneNumber}\n📌 Versiya: ${BOT_VERSION}`, { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, true);
        } catch (error) {
            console.error('Admin xabar xatolik:', error);
        }
        clearUserSession(userId);
        return;
    }
    
    const existingUser = getUserByPhone(phoneNumber);
    
    if (existingUser && existingUser.userId !== userId) {
        await bot.sendMessage(chatId, '❌ *Bu telefon raqam allaqachon ro\'yxatdan o\'tgan!*', { parse_mode: 'Markdown' });
        clearUserSession(userId);
        return;
    }
    
    if (existingUser && existingUser.userId === userId) {
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
    
    const carsList = user.cars.map(c => `🚗 ${c.carNumber} (${c.totalDiagnostics} ta diagnostika)`).join('\n');
    await sendReminder(chatId);
    let profileText = `📊 *MENGING SAHIFAM*\n\n👤 *Ism:* ${user.fullName || 'Kiritilmagan'}\n📞 *Telefon:* ${user.phone}\n🚗 *Avtomobillar:* ${user.cars.length}/${MAX_CARS_PER_USER}\n\n${carsList}\n\n🎁 *Umumiy bonuslar:* ${user.totalBonusCount || 0}\n🎉 *Bepul diagnostika:* ${user.totalFreeDiagnostics || 0} ta\n📊 *Jami diagnostika:* ${user.totalDiagnosticsAll || 0} ta\n📌 *Versiya:* ${BOT_VERSION}\n📸 *Instagram bonus:* ${user.instagramBonusReceived ? '✅ olingan' : '❌ olinmagan'}`;
    
    await bot.sendMessage(chatId, profileText, { parse_mode: 'Markdown' });
});

bot.onText(/\/my_cars/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const user = getUserByUserId(userId);
    
    if (!user) {
        await bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan! /start bosing.');
        return;
    }
    
    if (user.cars.length === 0) {
        await bot.sendMessage(chatId, '📭 Sizda hali avtomobillar mavjud emas!\n\n➕ "➕ Yangi avtomobil qo\'shish" tugmasini bosing.');
        return;
    }
    
    let carsText = '🚗 *MENGING AVTOMOBILLARIM*\n\n📌 *Bonus qoidasi:* 5 diagnostika = 1 BEPUL\n━━━━━━━━━━━━━━━━━━\n\n';
    for (const car of user.cars) {
        const nextFree = 5 - car.bonusCount;
        carsText += `🚗 *${car.carNumber}*\n`;
        carsText += `🎁 Bonus: ${car.bonusCount}/5\n`;
        carsText += `🎉 Bepul: ${car.freeDiagnostics} ta\n`;
        carsText += `📊 Diagnostika: ${car.totalDiagnostics} ta\n`;
        carsText += `📅 Qo'shilgan: ${new Date(car.addedDate).toLocaleDateString()}\n`;
        
        if (car.freeDiagnostics > 0) {
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
    
    let bonusText = '🎁 *MENGING BONUSLARIM*\n\n📌 *Qoida:* Har 5 diagnostikada 1 ta BEPUL!\n━━━━━━━━━━━━━━━━━━\n\n';
    for (const car of user.cars) {
        const nextFree = 5 - car.bonusCount;
        bonusText += `🚗 *${car.carNumber}*\n`;
        bonusText += `📊 To\'plangan: ${car.bonusCount}/5\n`;
        bonusText += `🎉 Bepul diagnostika: ${car.freeDiagnostics} ta\n`;
        
        if (car.freeDiagnostics > 0) {
            bonusText += `✅ *Sizda ${car.freeDiagnostics} ta BEPUL diagnostika bor!*\n`;
            bonusText += `💡 Keyingi diagnostikangiz BEPUL bo'ladi!\n`;
        } else if (nextFree > 0) {
            bonusText += `📌 *Keyingi BEPUL diagnostika:* ${nextFree} ta diagnostikadan keyin\n`;
            bonusText += `   (${nextFree} ta to'lovli diagnostika qilsangiz, 1 ta BEPUL olasiz)\n`;
        } else if (nextFree === 0 && car.bonusCount === 5) {
            bonusText += `🎉 *DARHOL BEPUL diagnostika qozondingiz!*\n`;
            bonusText += `✅ Keyingi diagnostikangiz BEPUL bo'ladi!\n`;
        }
        
        bonusText += `━━━━━━━━━━━━━━━━━━\n`;
    }
    
    if (!user.instagramBonusReceived) {
        bonusText += `\n📸 *INSTAGRAM BONUS!*\n`;
        bonusText += `Instagram sahifamizga obuna bo'ling va 1 ta BEPUL diagnostika oling!\n`;
        bonusText += `👇 Instagramga o'tish uchun "📸 Instagram bonus" tugmasini bosing\n`;
    } else {
        bonusText += `\n✅ *Instagram bonusi olingan!*`;
    }
    
    bonusText += `\n\n🎯 *QANDAY ISHLAYDI?*\n`;
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
        diagText += `🚗 ${d.carNumber}\n\n`;
        diagText += `📝 *Bajarilgan ishlar:*\n${d.workDescription}\n\n`;
        
        if (d.additionalNotes && d.additionalNotes !== '') {
            diagText += `➕ *Qo'shimcha eslatmalar:*\n${d.additionalNotes}\n\n`;
        }
        
        diagText += `💰 *Narx:* ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}\n`;
        diagText += `━━━━━━━━━━━━━━━━━━\n`;
        
        await bot.sendMessage(chatId, diagText, { parse_mode: 'Markdown' });
    }
});

bot.onText(/\/info/, async (msg) => {
    const chatId = msg.chat.id;
    await sendReminder(chatId);
    let infoText = `ℹ️ *ISUZU DOCTOR BOT*\n\n🚗 Avtomobil diagnostikasi\n🎁 Har 5 diagnostikada 1 ta BEPUL\n📱 Bitta telefon bilan ${MAX_CARS_PER_USER} tagacha avtomobil\n📞 Aloqa: ${ADMIN_PHONE}\n📌 Bot versiyasi: ${BOT_VERSION}\n🔗 Bot linki: ${NEW_BOT_LINK}\n📸 Instagram: ${INSTAGRAM_LINK}`;
    
    await bot.sendMessage(chatId, infoText, { parse_mode: 'Markdown' });
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
    await bot.sendMessage(chatId, 
        `📊 *STATISTIKA*\n\n` +
        `👥 Faol foydalanuvchilar: ${stats.totalUsers}\n` +
        `🚫 Bloklanganlar: ${stats.blockedUsers}\n` +
        `📸 Instagram bonus olganlar: ${stats.instagramBonusUsers}\n` +
        `🚗 Avtomobillar: ${stats.totalCars}\n` +
        `🔧 Jami diagnostika: ${stats.totalDiagnostics}\n` +
        `💰 To'lovli: ${stats.paidDiagnostics}\n` +
        `🎉 Bepul: ${stats.freeDiagnostics}\n` +
        `💵 Daromad: ${stats.totalIncome.toLocaleString()} so'm\n` +
        `⚠️ Xatoliklar: ${stats.totalErrors}\n` +
        `📌 Versiya: ${stats.currentVersion}\n` +
        `🔄 Yangilanish rejimi: ${stats.isUpdateMode ? '✅ Faol' : '❌ O\'chirilgan'}`,
        { parse_mode: 'Markdown' }
    );
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
        const status = u.isBlocked ? '🔴' : '🟢';
        const igBonus = u.instagramBonusReceived ? '📸✅' : '📸❌';
        msgText += `${status} ${igBonus} *${index + 1}. ${u.fullName || 'Ism kiritilmagan'}*\n`;
        msgText += `📞 ${u.phone}\n`;
        msgText += `🚗 ${u.cars.map(c => c.carNumber).join(', ')}\n`;
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
            await bot.sendMessage(chatId, `✅ *Siz muvaffaqiyatli ro'yxatdan o'tdingiz, ${userFullName || 'hurmatli mijoz'}!*\n\n👤 Ism: ${userFullName || 'Kiritilmagan'}\n🚗 Avtomobil: ${carNumber}\n📞 Telefon: ${session.data.phone}\n\n🎁 *Bonus tizimi:* Har 5 diagnostikada 1 ta BEPUL!\n📸 *Instagram:* Sahifamizga obuna bo'ling va 1 ta BEPUL diagnostika oling!\n\n➕ "➕ Yangi avtomobil qo'shish" tugmasi orqali yana avtomobil qo'shishingiz mumkin.\n📌 Bot versiyasi: ${BOT_VERSION}`, { parse_mode: 'Markdown' });
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
    
    if (session.step === 'admin_add_diagnostic') {
        const carNumber = text.toUpperCase().trim();
        
        let foundUser = null;
        let foundCar = null;
        
        for (const user of users) {
            const car = user.cars.find(c => c.carNumber === carNumber);
            if (car) {
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
        
        await bot.sendMessage(chatId, `✅ Foydalanuvchi topildi:\n\n👤 ${foundUser.fullName || 'Ism kiritilmagan'}\n📞 ${foundUser.phone}\n🚗 ${foundCar.carNumber}\n🎁 Bonus: ${foundCar.bonusCount}/5\n🎉 Bepul: ${foundCar.freeDiagnostics}\n📸 Instagram bonus: ${foundUser.instagramBonusReceived ? '✅ olingan' : '❌ olinmagan'}\n\n🔧 *Bajarilgan ishlarni kiriting:*`, { parse_mode: 'Markdown' });
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
            session.data.targetCar.carNumber,
            session.data.workDescription,
            session.data.additionalNotes
        );
        
        if (!result.success) {
            await bot.sendMessage(chatId, '❌ *Xatolik yuz berdi!*', { parse_mode: 'Markdown' });
            clearUserSession(userId);
            await sendMainMenu(chatId, true);
            return;
        }
        
        let adminResponse = `🔧 *DIAGNOSTIKA QO'SHILDI*\n\n👤 ${session.data.targetUser.fullName || 'Ism kiritilmagan'}\n🚗 ${result.carNumber}\n📞 ${session.data.targetUser.phone}\n💰 Narx: ${result.price.toLocaleString()} so'm\n\n📝 *Bajarilgan ishlar:*\n${session.data.workDescription}\n`;
        
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
        
        bot.sendMessage(session.data.targetUser.userId, userMsg, { parse_mode: 'Markdown' }).catch(() => {});
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true);
        return;
    }
    
    const user = getUserByUserId(userId);
    
    if (!user && text !== '❌ Asosiy menyu') {
        await bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan! /start bosing.');
        return;
    }
    
    if (user && user.isBlocked) {
        await bot.sendMessage(chatId, '🚫 *Siz botdan bloklangansiz!*\n\nIltimos, administrator bilan bog\'laning.\n📞 Aloqa: ' + ADMIN_PHONE, { 
            parse_mode: 'Markdown',
            reply_markup: { remove_keyboard: true }
        });
        return;
    }
    
    // Foydalanuvchi menyusi tugmalari
    if (text === '📊 Mening sahifam') {
        const carsList = user.cars.map(c => `🚗 ${c.carNumber} (${c.totalDiagnostics} ta diagnostika)`).join('\n');
        await sendReminder(chatId);
        let profileText = `📊 *MENGING SAHIFAM*\n\n👤 *Ism:* ${user.fullName || 'Kiritilmagan'}\n📞 *Telefon:* ${user.phone}\n🚗 *Avtomobillar:* ${user.cars.length}/${MAX_CARS_PER_USER}\n\n${carsList}\n\n🎁 *Umumiy bonuslar:* ${user.totalBonusCount || 0}\n🎉 *Bepul diagnostika:* ${user.totalFreeDiagnostics || 0} ta\n📊 *Jami diagnostika:* ${user.totalDiagnosticsAll || 0} ta\n📌 *Versiya:* ${BOT_VERSION}\n📸 *Instagram bonus:* ${user.instagramBonusReceived ? '✅ olingan' : '❌ olinmagan'}`;
        
        await bot.sendMessage(chatId, profileText, { parse_mode: 'Markdown' });
    }
    else if (text === '🚗 Mening avtomobillarim') {
        if (user.cars.length === 0) {
            await bot.sendMessage(chatId, '📭 Sizda hali avtomobillar mavjud emas!\n\n➕ "➕ Yangi avtomobil qo\'shish" tugmasini bosing.', { parse_mode: 'Markdown' });
            return;
        }
        
        let carsText = '🚗 *MENGING AVTOMOBILLARIM*\n\n📌 *Bonus qoidasi:* 5 diagnostika = 1 BEPUL\n━━━━━━━━━━━━━━━━━━\n\n';
        for (const car of user.cars) {
            const nextFree = 5 - car.bonusCount;
            carsText += `🚗 *${car.carNumber}*\n`;
            carsText += `🎁 Bonus: ${car.bonusCount}/5\n`;
            carsText += `🎉 Bepul: ${car.freeDiagnostics} ta\n`;
            carsText += `📊 Diagnostika: ${car.totalDiagnostics} ta\n`;
            carsText += `📅 Qo'shilgan: ${new Date(car.addedDate).toLocaleDateString()}\n`;
            
            if (car.freeDiagnostics > 0) {
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
        if (user.cars.length >= MAX_CARS_PER_USER) {
            await bot.sendMessage(chatId, `❌ Siz maksimum ${MAX_CARS_PER_USER} ta avtomobil qo'sha olasiz!`, { parse_mode: 'Markdown' });
            return;
        }
        
        const newSession = getUserSession(userId);
        newSession.step = 'add_new_car';
        newSession.data.phone = user.phone;
        newSession.data.isExistingUser = true;
        newSession.data.firstName = user.firstName;
        newSession.data.lastName = user.lastName;
        newSession.data.username = user.username;
        
        await bot.sendMessage(chatId, `🚗 *Yangi avtomobil raqamini kiriting:*\n\nMasalan: 01A777AA\n\n⚠️ Siz maksimum ${MAX_CARS_PER_USER} tagacha avtomobil qo'sha olasiz.\n📊 Hozirgi avtomobillar soni: ${user.cars.length}/${MAX_CARS_PER_USER}`, {
            parse_mode: 'Markdown',
            reply_markup: { remove_keyboard: true }
        });
    }
    else if (text === '🎁 Mening bonuslarim') {
        let bonusText = '🎁 *MENGING BONUSLARIM*\n\n📌 *Qoida:* Har 5 diagnostikada 1 ta BEPUL!\n━━━━━━━━━━━━━━━━━━\n\n';
        for (const car of user.cars) {
            const nextFree = 5 - car.bonusCount;
            bonusText += `🚗 *${car.carNumber}*\n`;
            bonusText += `📊 To\'plangan: ${car.bonusCount}/5\n`;
            bonusText += `🎉 Bepul diagnostika: ${car.freeDiagnostics} ta\n`;
            
            if (car.freeDiagnostics > 0) {
                bonusText += `✅ *Sizda ${car.freeDiagnostics} ta BEPUL diagnostika bor!*\n`;
                bonusText += `💡 Keyingi diagnostikangiz BEPUL bo'ladi!\n`;
            } else if (nextFree > 0) {
                bonusText += `📌 *Keyingi BEPUL diagnostika:* ${nextFree} ta diagnostikadan keyin\n`;
                bonusText += `   (${nextFree} ta to'lovli diagnostika qilsangiz, 1 ta BEPUL olasiz)\n`;
            } else if (nextFree === 0 && car.bonusCount === 5) {
                bonusText += `🎉 *DARHOL BEPUL diagnostika qozondingiz!*\n`;
                bonusText += `✅ Keyingi diagnostikangiz BEPUL bo'ladi!\n`;
            }
            
            bonusText += `━━━━━━━━━━━━━━━━━━\n`;
        }
        
        if (!user.instagramBonusReceived) {
            bonusText += `\n📸 *INSTAGRAM BONUS!*\n`;
            bonusText += `Instagram sahifamizga obuna bo'ling va 1 ta BEPUL diagnostika oling!\n`;
            bonusText += `👇 Instagramga o'tish uchun "📸 Instagram bonus" tugmasini bosing\n`;
        } else {
            bonusText += `\n✅ *Instagram bonusi olingan!*`;
        }
        
        bonusText += `\n\n🎯 *QANDAY ISHLAYDI?*\n`;
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
            diagText += `🚗 ${d.carNumber}\n\n`;
            diagText += `📝 *Bajarilgan ishlar:*\n${d.workDescription}\n\n`;
            
            if (d.additionalNotes && d.additionalNotes !== '') {
                diagText += `➕ *Qo'shimcha eslatmalar:*\n${d.additionalNotes}\n\n`;
            }
            
            diagText += `💰 *Narx:* ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}\n`;
            diagText += `━━━━━━━━━━━━━━━━━━\n`;
            
            await bot.sendMessage(chatId, diagText, { parse_mode: 'Markdown' });
        }
    }
    else if (text === '📸 Instagram bonus') {
        if (user.instagramBonusReceived) {
            await bot.sendMessage(chatId, 
                `✅ *Siz Instagram bonusini allaqachon olgansiz!*\n\n` +
                `📸 Instagram: ${INSTAGRAM_LINK}\n\n` +
                `Agar sizga yoqsa, do'stlaringizga ham tavsiya qiling!`,
                { parse_mode: 'Markdown' }
            );
        } else {
            // Instagram sahifasiga o'tish uchun tugma
            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📸 Instagram sahifasiga o\'tish', url: INSTAGRAM_LINK }],
                        [{ text: '✅ Obuna bo\'ldim, bonus olish', callback_data: `get_instagram_bonus` }]
                    ]
                }
            };
            
            await bot.sendMessage(chatId, INSTAGRAM_BONUS_MESSAGE, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }
    }
    else if (text === 'ℹ️ Ma\'lumot') {
        await sendReminder(chatId);
        let infoText = `ℹ️ *ISUZU DOCTOR BOT*\n\n🚗 Avtomobil diagnostikasi\n🎁 Har 5 diagnostikada 1 ta BEPUL\n📱 Bitta telefon bilan ${MAX_CARS_PER_USER} tagacha avtomobil\n📞 Aloqa: ${ADMIN_PHONE}\n📌 Bot versiyasi: ${BOT_VERSION}\n🔗 Bot linki: ${NEW_BOT_LINK}\n📸 Instagram: ${INSTAGRAM_LINK}`;
        
        await bot.sendMessage(chatId, infoText, { parse_mode: 'Markdown' });
    }
    else if (text === '❌ Asosiy menyu') {
        clearUserSession(userId);
        await sendMainMenu(chatId, isAdmin(userId));
    }
    else if (!session.step) {
        await bot.sendMessage(chatId, `❌ *Tushunarsiz buyruq!* Menyudan foydalaning.\n\n/start - Bosh sahifa\n/profile - Mening sahifam\n/my_cars - Mening avtomobillarim\n/my_bonus - Mening bonuslarim\n/history - Diagnostika tarixi\n/info - Ma'lumot\n📌 Versiya: ${BOT_VERSION}`, { parse_mode: 'Markdown' });
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
        await bot.sendMessage(chatId, 
            `📊 *STATISTIKA*\n\n` +
            `👥 Faol foydalanuvchilar: ${stats.totalUsers}\n` +
            `🚫 Bloklanganlar: ${stats.blockedUsers}\n` +
            `📸 Instagram bonus olganlar: ${stats.instagramBonusUsers}\n` +
            `🚗 Avtomobillar: ${stats.totalCars}\n` +
            `🔧 Jami: ${stats.totalDiagnostics}\n` +
            `💰 To'lovli: ${stats.paidDiagnostics}\n` +
            `🎉 Bepul: ${stats.freeDiagnostics}\n` +
            `💵 Daromad: ${stats.totalIncome.toLocaleString()} so'm\n` +
            `⚠️ Xatoliklar: ${stats.totalErrors}\n` +
            `📌 Versiya: ${stats.currentVersion}\n` +
            `🔄 Yangilanish rejimi: ${stats.isUpdateMode ? '✅ Faol' : '❌ O\'chirilgan'}`,
            { parse_mode: 'Markdown' }
        );
    }
    else if (text === '👥 Foydalanuvchilar') {
        const usersList = getAllUsersWithDetails();
        if (usersList.length === 0) { 
            await bot.sendMessage(chatId, '📭 Hech qanday foydalanuvchi yo\'q'); 
            return; 
        }
        
        let msg = '👥 *FOYDALANUVCHILAR RO\'YXATI*\n━━━━━━━━━━━━━━━━━━\n\n';
        usersList.slice(0, 20).forEach((u, index) => { 
            const status = u.isBlocked ? '🔴' : '🟢';
            const igBonus = u.instagramBonusReceived ? '📸✅' : '📸❌';
            msg += `${status} ${igBonus} *${index + 1}. ${u.fullName || 'Ism kiritilmagan'}*\n`;
            msg += `📞 ${u.phone}\n`;
            msg += `🚗 Avtomobillar:\n`;
            u.cars.forEach(car => {
                msg += `   • ${car.carNumber} (${car.totalDiagnostics} ta diagnostika)\n`;
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
            msg += `🚗 ${e.carNumber}\n🔴 ${e.errorCode}\n📝 ${e.errorDescription}\n📅 ${new Date(e.date).toLocaleDateString()}\n━━━━━━\n`; 
        });
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (text === '📋 Diagnostikalar tarixi') {
        const diags = getAllDiagnostics(20);
        if (diags.length === 0) { await bot.sendMessage(chatId, '📭 Hech qanday diagnostika yo\'q'); return; }
        for (const d of diags.slice(0, 10)) {
            let diagText = `📅 ${new Date(d.date).toLocaleDateString()}\n🚗 ${d.carNumber}\n📝 ${d.workDescription.substring(0, 50)}...\n💰 ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}\n`;
            if (d.additionalNotes && d.additionalNotes !== '') {
                diagText += `➕ ${d.additionalNotes.substring(0, 50)}...\n`;
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
            msg += `🚗 ${d.carNumber}\n📝 ${d.workDescription.substring(0, 40)}...\n💰 ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}\n━━━━━━\n`; 
        });
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (text === '💾 Backup yaratish') {
        await bot.sendMessage(chatId, '💾 *Backup yaratilmoqda...*', { parse_mode: 'Markdown' });
        createBackup();
        await bot.sendMessage(chatId, `✅ *Backup yaratildi!*\n\n📅 ${new Date().toLocaleString()}`, { parse_mode: 'Markdown' });
    }
    else if (text === '🔄 Database tiklash') {
        const backups = listBackups();
        if (backups.length === 0) {
            await bot.sendMessage(chatId, '❌ *Hech qanday backup topilmadi!*\n\n💾 Avval "💾 Backup yaratish" tugmasini bosing.', { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, '🔄 *Database tiklash*\n\nQuyidagi backup\'lardan birini tanlang:', { parse_mode: 'Markdown', ...getBackupListKeyboard(backups) });
        }
    }
    else if (text === '🚫 Foydalanuvchini boshqarish') {
        const activeUsers = getActiveUsers();
        const blockedUsers = getBlockedUsers();
        const allUsers = [...activeUsers, ...blockedUsers];
        
        if (allUsers.length === 0) {
            await bot.sendMessage(chatId, '📭 Hech qanday foydalanuvchi yo\'q', { parse_mode: 'Markdown' });
            return;
        }
        
        await bot.sendMessage(chatId, 
            `👥 *FOYDALANUVCHILARNI BOSHQARISH*\n\n` +
            `🟢 Faol foydalanuvchilar: ${activeUsers.length}\n` +
            `🔴 Bloklangan foydalanuvchilar: ${blockedUsers.length}\n\n` +
            `📌 Quyidagi ro'yxatdan foydalanuvchini tanlang:`,
            { 
                parse_mode: 'Markdown',
                ...getUserManagementKeyboard(allUsers)
            }
        );
    }
    else if (text === '📸 Instagram bonus') {
        const usersWithBonus = users.filter(u => u.instagramBonusReceived === true);
        const pendingUsers = users.filter(u => !u.instagramBonusReceived && !u.isAdmin);
        
        await bot.sendMessage(chatId, 
            `📸 *INSTAGRAM BONUS STATISTIKASI*\n\n` +
            `✅ Bonus olganlar: ${usersWithBonus.length} ta\n` +
            `⏳ Bonus olmaganlar: ${pendingUsers.length} ta\n\n` +
            `🔗 Instagram: ${INSTAGRAM_LINK}\n\n` +
            `📌 Qanday ishlaydi:\n` +
            `1. Foydalanuvchi "📸 Instagram bonus" tugmasini bosadi\n` +
            `2. Instagram sahifasiga o'tadi\n` +
            `3. Obuna bo'ladi\n` +
            `4. "Obuna bo'ldim, bonus olish" tugmasini bosadi\n` +
            `5. Admin tekshirib bonus beradi\n\n` +
            `⚠️ Har bir foydalanuvchi faqat 1 marta bonus olishi mumkin!`,
            { parse_mode: 'Markdown' }
        );
    }
    else if (text === '🎁 Instagram statistika') {
        const usersWithBonus = users.filter(u => u.instagramBonusReceived === true);
        let msg = '📸 *INSTAGRAM BONUS OLGANLAR*\n━━━━━━━━━━━━━━━━━━\n\n';
        
        if (usersWithBonus.length === 0) {
            msg += 'Hech kim Instagram bonusini olmagan.';
        } else {
            usersWithBonus.slice(0, 20).forEach((u, index) => {
                msg += `${index + 1}. ${u.fullName || u.phone}\n`;
                msg += `📞 ${u.phone}\n`;
                msg += `📅 ${new Date(u.instagramBonusDate).toLocaleDateString()}\n`;
                msg += `━━━━━━━━━━━━━━━━━━\n`;
            });
        }
        
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (text === '🚀 Yangi versiyaga o\'tish') {
        await bot.sendMessage(chatId, `⚠️ *YANGI VERSIYAGA O'TISH*\n\nSiz yangi versiyaga o'tmoqchisiz. Bu amal:\n\n1. Barcha foydalanuvchilarga yangilanish haqida xabar yuboriladi\n2. Bot yangilanish rejimiga o'tadi\n3. Foydalanuvchilarga yangi bot haqida eslatma ko'rsatiladi\n\n❓ Davom etasizmi?`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Ha, davom etish', callback_data: 'confirm_update' }],
                    [{ text: '❌ Bekor qilish', callback_data: 'cancel_update' }]
                ]
            }
        });
    }
    else if (text === '✅ Yangilanish rejimini o\'chirish') {
        disableUpdateMode();
        await bot.sendMessage(chatId, `✅ *Yangilanish rejimi o'chirildi!*\n\nBot normal rejimda ishlashda davom etadi.`, { parse_mode: 'Markdown' });
        await sendMainMenu(chatId, true);
    }
});

// -------------------- CALLBACK QUERY --------------------
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const messageId = query.message.message_id;
    
    // Instagram bonus olish
    if (data === 'get_instagram_bonus') {
        const userId = query.from.id;
        const user = getUserByUserId(userId);
        
        if (!user) {
            await bot.answerCallbackQuery(query.id, { text: 'Foydalanuvchi topilmadi!', show_alert: true });
            return;
        }
        
        if (user.instagramBonusReceived) {
            await bot.answerCallbackQuery(query.id, { text: 'Siz allaqachon bonus olgansiz!', show_alert: true });
            await bot.deleteMessage(chatId, messageId);
            return;
        }
        
        // Adminlarga xabar yuborish
        for (const adminId of ADMIN_IDS) {
            bot.sendMessage(adminId, 
                `📸 *YANGI INSTAGRAM BONUS SO'ROVI!*\n\n` +
                `👤 Foydalanuvchi: ${user.fullName || user.phone}\n` +
                `📞 Telefon: ${user.phone}\n` +
                `🆔 ID: ${userId}\n` +
                `📅 Sana: ${new Date().toLocaleString()}\n\n` +
                `Foydalanuvchi Instagram sahifamizga obuna bo'lganini tekshiring.\n` +
                `✅ Bonus berish uchun: /give_instagram_bonus ${userId}`,
                { parse_mode: 'Markdown' }
            ).catch(() => {});
        }
        
        await bot.answerCallbackQuery(query.id, { text: 'So\'rovingiz adminga yuborildi! Admin tekshirib bonus beradi.', show_alert: true });
        await bot.deleteMessage(chatId, messageId);
        
        await bot.sendMessage(chatId, 
            `✅ *So'rovingiz qabul qilindi!*\n\n` +
            `Admin ${INSTAGRAM_USERNAME} sahifasiga obuna bo'lganingizni tekshirib, bonusni beradi.\n\n` +
            `📞 Tezroq tasdiqlash uchun admin bilan bog'laning: ${ADMIN_PHONE}`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    // Admin uchun Instagram bonus berish
    if (data === 'confirm_update') {
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId, '📢 *Yangilanish boshlandi...*\n\nBarcha foydalanuvchilarga xabar yuborilmoqda...', { parse_mode: 'Markdown' });
        
        const result = await notifyAllUsersAboutUpdate();
        
        enableUpdateMode();
        
        await bot.sendMessage(chatId, 
            `✅ *YANGILANISH TUGALLANDI!*\n\n` +
            `📊 Natijalar:\n` +
            `✅ Yuborildi: ${result.success} ta\n` +
            `❌ Yuborilmadi: ${result.fail} ta\n\n` +
            `🔄 Bot yangilanish rejimiga o'tkazildi.\n` +
            `🔗 Yangi bot linki: ${NEW_BOT_LINK}\n\n` +
            `⚠️ Endi foydalanuvchilarga yangi bot haqida eslatma ko'rsatiladi.`,
            { parse_mode: 'Markdown' }
        );
        
        await sendMainMenu(chatId, true);
    }
    else if (data === 'cancel_update') {
        await bot.answerCallbackQuery(query.id);
        await bot.deleteMessage(chatId, messageId);
        await bot.sendMessage(chatId, '❌ *Yangilanish bekor qilindi.*', { parse_mode: 'Markdown' });
        await sendMainMenu(chatId, true);
    }
    else if (data === 'contact_admin') {
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId, `📞 *Admin bilan bog'lanish*\n\nTelefon: ${ADMIN_PHONE}\n\nSavollaringiz bo'lsa, ushbu raqam orqali bog'lanishingiz mumkin.`, { parse_mode: 'Markdown' });
    }
    else if (data.startsWith('restore_')) {
        const backupName = data.replace('restore_', '');
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId, '🔄 *Database tiklanmoqda...*\n\n⚠️ Bu jarayon bir necha daqiqa vaqt olishi mumkin.', { parse_mode: 'Markdown' });
        
        if (restoreBackup(backupName)) {
            loadData();
            await bot.sendMessage(chatId, `✅ *Database muvaffaqiyatli tiklandi!*\n\n📁 ${backupName}\n📅 ${new Date().toLocaleString()}\n\n🔄 Barcha foydalanuvchilar ma'lumotlari tiklandi.`, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, '❌ *Database tiklashda xatolik!*\n\nBackup fayli buzilgan bo\'lishi mumkin.', { parse_mode: 'Markdown' });
        }
    } 
    else if (data === 'restore_cancel') {
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId, '❌ *Database tiklash bekor qilindi.*', { parse_mode: 'Markdown' });
        await sendMainMenu(chatId, true);
    }
    else if (data === 'user_manage_cancel') {
        await bot.answerCallbackQuery(query.id);
        await bot.deleteMessage(chatId, messageId);
        await sendMainMenu(chatId, true);
    }
    else if (data === 'back_to_user_list') {
        await bot.answerCallbackQuery(query.id);
        const activeUsers = getActiveUsers();
        const blockedUsers = getBlockedUsers();
        const allUsers = [...activeUsers, ...blockedUsers];
        
        await bot.editMessageText(
            `👥 *FOYDALANUVCHILARNI BOSHQARISH*\n\n` +
            `🟢 Faol foydalanuvchilar: ${activeUsers.length}\n` +
            `🔴 Bloklangan foydalanuvchilar: ${blockedUsers.length}\n\n` +
            `📌 Quyidagi ro'yxatdan foydalanuvchini tanlang:`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...getUserManagementKeyboard(allUsers)
            }
        );
    }
    else if (data.startsWith('user_page_')) {
        const page = parseInt(data.split('_')[2]);
        const activeUsers = getActiveUsers();
        const blockedUsers = getBlockedUsers();
        const allUsers = [...activeUsers, ...blockedUsers];
        
        await bot.answerCallbackQuery(query.id);
        await bot.editMessageReplyMarkup(
            getUserManagementKeyboard(allUsers, page).reply_markup,
            { chat_id: chatId, message_id: messageId }
        );
    }
    else if (data.startsWith('manage_user_')) {
        const targetUserId = parseInt(data.split('_')[2]);
        const user = getUserByUserId(targetUserId);
        
        if (!user) {
            await bot.answerCallbackQuery(query.id, { text: 'Foydalanuvchi topilmadi!', show_alert: true });
            return;
        }
        
        await bot.answerCallbackQuery(query.id);
        
        const userInfo = 
            `👤 *${user.fullName || 'Ismsiz foydalanuvchi'}*\n\n` +
            `📞 Telefon: ${user.phone}\n` +
            `🚗 Avtomobillar: ${user.cars.length} ta\n` +
            `📊 Diagnostika: ${user.totalDiagnosticsAll || 0} ta\n` +
            `🎁 Bonus: ${user.totalBonusCount || 0}\n` +
            `🎉 Bepul: ${user.totalFreeDiagnostics || 0}\n` +
            `📸 Instagram bonus: ${user.instagramBonusReceived ? '✅ olingan' : '❌ olinmagan'}\n` +
            `📅 Ro'yxatdan: ${new Date(user.registeredDate).toLocaleDateString()}\n` +
            `🚦 Holat: ${user.isBlocked ? '🔴 BLOKLANGAN' : '🟢 FAOL'}\n\n` +
            `📌 Quyidagi amallardan birini tanlang:`;
        
        await bot.editMessageText(
            userInfo,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...getUserActionKeyboard(targetUserId, user.isBlocked)
            }
        );
    }
    else if (data.startsWith('block_user_')) {
        const targetUserId = parseInt(data.split('_')[2]);
        const result = blockUser(targetUserId);
        
        await bot.answerCallbackQuery(query.id, { text: result.message, show_alert: true });
        
        if (result.success) {
            const user = getUserByUserId(targetUserId);
            try {
                await bot.sendMessage(targetUserId, '🚫 *Siz botdan bloklandingiz!*\n\nIltimos, administrator bilan bog\'laning.\n📞 Aloqa: ' + ADMIN_PHONE, { parse_mode: 'Markdown' });
            } catch(e) {}
            
            const activeUsers = getActiveUsers();
            const blockedUsers = getBlockedUsers();
            const allUsers = [...activeUsers, ...blockedUsers];
            
            await bot.editMessageText(
                `👥 *FOYDALANUVCHILARNI BOSHQARISH*\n\n` +
                `🟢 Faol foydalanuvchilar: ${activeUsers.length}\n` +
                `🔴 Bloklangan foydalanuvchilar: ${blockedUsers.length}\n\n` +
                `📌 Quyidagi ro'yxatdan foydalanuvchini tanlang:`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    ...getUserManagementKeyboard(allUsers)
                }
            );
        }
    }
    else if (data.startsWith('unblock_user_')) {
        const targetUserId = parseInt(data.split('_')[2]);
        const result = unblockUser(targetUserId);
        
        await bot.answerCallbackQuery(query.id, { text: result.message, show_alert: true });
        
        if (result.success) {
            const user = getUserByUserId(targetUserId);
            try {
                await bot.sendMessage(targetUserId, '✅ *Sizning blokingiz ochildi!*\n\nBotdan yana foydalanishingiz mumkin.\n/start - Bosh sahifa', { parse_mode: 'Markdown' });
            } catch(e) {}
            
            const activeUsers = getActiveUsers();
            const blockedUsers = getBlockedUsers();
            const allUsers = [...activeUsers, ...blockedUsers];
            
            await bot.editMessageText(
                `👥 *FOYDALANUVCHILARNI BOSHQARISH*\n\n` +
                `🟢 Faol foydalanuvchilar: ${activeUsers.length}\n` +
                `🔴 Bloklangan foydalanuvchilar: ${blockedUsers.length}\n\n` +
                `📌 Quyidagi ro'yxatdan foydalanuvchini tanlang:`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    ...getUserManagementKeyboard(allUsers)
                }
            );
        }
    }
    else if (data.startsWith('delete_user_')) {
        const targetUserId = parseInt(data.split('_')[2]);
        
        const confirmKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Ha, o\'chirish', callback_data: `confirm_delete_${targetUserId}` }],
                    [{ text: '❌ Yo\'q, bekor qilish', callback_data: `back_to_user_list` }]
                ]
            }
        };
        
        await bot.answerCallbackQuery(query.id);
        await bot.editMessageText(
            `⚠️ *DIQQAT!*\n\nSiz foydalanuvchini butunlay o\'chirmoqchisiz!\n\n` +
            `Bu amalni ortga qaytarib bo'lmaydi.\n` +
            `Foydalanuvchining barcha ma'lumotlari va diagnostikalari o\'chiriladi.\n\n` +
            `Haqiqatan ham o\'chirishni xohlaysizmi?`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...confirmKeyboard
            }
        );
    }
    else if (data.startsWith('confirm_delete_')) {
        const targetUserId = parseInt(data.split('_')[2]);
        const result = deleteUser(targetUserId);
        
        await bot.answerCallbackQuery(query.id, { text: result.message, show_alert: true });
        
        if (result.success) {
            const activeUsers = getActiveUsers();
            const blockedUsers = getBlockedUsers();
            const allUsers = [...activeUsers, ...blockedUsers];
            
            await bot.editMessageText(
                `👥 *FOYDALANUVCHILARNI BOSHQARISH*\n\n` +
                `🟢 Faol foydalanuvchilar: ${activeUsers.length}\n` +
                `🔴 Bloklangan foydalanuvchilar: ${blockedUsers.length}\n\n` +
                `📌 Quyidagi ro'yxatdan foydalanuvchini tanlang:\n\n` +
                `✅ ${result.message} (${result.deletedDiagnostics} ta diagnostika o\'chirildi)`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    ...getUserManagementKeyboard(allUsers)
                }
            );
        }
    }
});

// -------------------- ADMIN BUYRUQLARI --------------------
bot.onText(/\/give_instagram_bonus (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) return;
    
    const targetUserId = parseInt(match[1]);
    const result = giveInstagramBonus(targetUserId);
    
    await bot.sendMessage(chatId, result.message, { parse_mode: 'Markdown' });
});

// -------------------- XATOLIKLARNI QAYTA ISHLASH --------------------
bot.on('polling_error', (error) => console.error('Polling xatolik:', error));
process.on('uncaughtException', (error) => console.error('Uncaught exception:', error));

// -------------------- BOTNI ISHGA TUSHIRISH --------------------
console.log('='.repeat(60));
console.log('🚗 ISUZU DOCTOR BOT ISHGA TUSHMOQDA');
console.log('='.repeat(60));

loadVersion();
loadData();

console.log('='.repeat(60));
console.log('🚗 ISUZU DOCTOR BOT ISHGA TUSHDI');
console.log('='.repeat(60));
console.log(`📌 Versiya: ${BOT_VERSION}`);
console.log(`🔗 Bot linki: ${NEW_BOT_LINK}`);
console.log(`📸 Instagram: ${INSTAGRAM_LINK}`);
console.log(`👑 Admin telefon: ${ADMIN_PHONE}`);
console.log(`💰 Diagnostika narxi: ${DIAGNOSTIC_PRICE.toLocaleString()} so'm`);
console.log(`👥 Faol foydalanuvchilar: ${users.filter(u => !u.isAdmin && !u.isBlocked).length}`);
console.log(`🚫 Bloklanganlar: ${users.filter(u => !u.isAdmin && u.isBlocked).length}`);
console.log(`📸 Instagram bonus olganlar: ${users.filter(u => u.instagramBonusReceived === true).length}`);
console.log(`🚗 Avtomobillar: ${users.reduce((sum, u) => sum + (u.cars ? u.cars.length : 0), 0)}`);
console.log(`🔧 Diagnostikalar: ${diagnostics.length}`);
console.log(`💾 Volume manzili: ${VOLUME_PATH}`);
console.log(`🔄 Yangilanish rejimi: ${isUpdateMode ? 'Faol' : 'O\'chirilgan'}`);
console.log('='.repeat(60));
console.log('✅ Bot ishlashga tayyor!');
