const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

// -------------------- TOKEN VA ADMIN --------------------
const BOT_TOKEN = process.env.BOT_TOKEN || '8779251766:AAH12INusgBCawsk5awqIjcyHnNLiq5A33A';

const ADMIN_PHONE = "+998979247888";
const ADMIN_IDS = [1437230485];
const DIAGNOSTIC_PRICE = 250000;
const MAX_CARS_PER_USER = 20;

// -------------------- MA'LUMOTLAR YO'LLARI --------------------
const USERS_FILE = path.join(__dirname, 'users.json');
const DIAGNOSTICS_FILE = path.join(__dirname, 'diagnostics.json');
const ERRORS_FILE = path.join(__dirname, 'errors.json');
const BACKUP_DIR = path.join(__dirname, 'backups');

// -------------------- BOT SOZLAMALARI --------------------
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
bot.deleteWebHook().catch(e => console.log('Webhook xatolik:', e.message));

// -------------------- BACKUP FUNKSIYALARI --------------------
function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
}

function createBackup() {
    ensureBackupDir();
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
    return true;
}

function listBackups() {
    ensureBackupDir();
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
    
    return true;
}

// -------------------- DATABASE FUNKSIYALARI --------------------
let users = [];
let diagnostics = [];
let errors = [];

function loadData() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
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

function addNewUser(userId, phoneNumber, carNumber) {
    const newUser = {
        userId: userId,
        phone: phoneNumber,
        isAdmin: false,
        isActive: true,
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

function addCarToUser(phoneNumber, carNumber) {
    const user = getUserByPhone(phoneNumber);
    if (!user) return { success: false, message: 'Foydalanuvchi topilmadi' };
    
    if (user.cars.length >= MAX_CARS_PER_USER) {
        return { success: false, message: `Siz maksimum ${MAX_CARS_PER_USER} ta avtomobil qo'sha olasiz!` };
    }
    
    const existingCar = user.cars.find(c => c.carNumber === carNumber);
    if (existingCar) {
        return { success: false, message: 'Bu avtomobil raqami allaqachon qo\'shilgan!' };
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
                    remaining: 5 - car.bonusCount
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
    let totalCars = 0;
    for (const user of regularUsers) {
        totalCars += user.cars.length;
    }
    
    const paidDiagnostics = diagnostics.filter(d => !d.isFree);
    const totalIncome = paidDiagnostics.reduce((sum, d) => sum + d.price, 0);
    
    return {
        totalUsers: regularUsers.length,
        totalCars: totalCars,
        totalDiagnostics: diagnostics.length,
        paidDiagnostics: paidDiagnostics.length,
        freeDiagnostics: diagnostics.filter(d => d.isFree).length,
        totalIncome: totalIncome,
        totalErrors: errors.length
    };
}

function getErrors() {
    return errors.slice(-50).reverse();
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
                ['📊 Mening sahifam', '🚗 Mening avtomobillarim'],
                ['🎁 Mening bonuslarim', '➕ Yangi avtomobil qo\'shish'],
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
    const existingUser = getUserByUserId(userId);
    
    if (existingUser) {
        const carsCount = existingUser.cars.length;
        const welcomeText = `👋 **Xush kelibsiz!**\n\n📞 Telefon: ${existingUser.phone}\n🚗 Avtomobillar: ${carsCount} ta\n🎁 Umumiy bonus: ${existingUser.totalBonusCount || 0}\n🎉 Bepul: ${existingUser.totalFreeDiagnostics || 0} ta\n📊 Jami diagnostika: ${existingUser.totalDiagnosticsAll || 0} ta`;
        bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
        sendMainMenu(chatId, existingUser.isAdmin);
    } else {
        bot.sendMessage(chatId, '🚗 **ISUZU DOCTOR** tizimiga xush kelibsiz!\n\n📱 Iltimos, telefon raqamingizni yuboring:', {
            parse_mode: 'Markdown',
            ...getPhoneKeyboard()
        });
    }
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
    
    if (phoneNumber === ADMIN_PHONE) {
        const newUser = {
            userId: userId,
            phone: phoneNumber,
            isAdmin: true,
            isActive: true,
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
        
        bot.sendMessage(chatId, `👑 **Siz ADMIN sifatida tizimga kirdingiz!**\n\n📞 Telefon: ${phoneNumber}`, { parse_mode: 'Markdown' });
        sendMainMenu(chatId, true);
        clearUserSession(userId);
        return;
    }
    
    const existingUser = getUserByPhone(phoneNumber);
    
    if (existingUser && existingUser.userId !== userId) {
        bot.sendMessage(chatId, '❌ **Bu telefon raqam allaqachon ro\'yxatdan o\'tgan!**', { parse_mode: 'Markdown' });
        clearUserSession(userId);
        return;
    }
    
    if (existingUser && existingUser.userId === userId) {
        session.step = 'add_new_car';
        session.data.isExistingUser = true;
        bot.sendMessage(chatId, `✅ Telefon raqam tasdiqlandi: ${phoneNumber}\n\n🚗 **Yangi avtomobil raqamini kiriting:**\n\nMasalan: 01A777AA\n\n⚠️ Siz maksimum ${MAX_CARS_PER_USER} tagacha avtomobil qo'sha olasiz.`, {
            parse_mode: 'Markdown',
            reply_markup: { remove_keyboard: true }
        });
    } else {
        session.step = 'first_car_number';
        session.data.isExistingUser = false;
        bot.sendMessage(chatId, `✅ Telefon raqam qabul qilindi: ${phoneNumber}\n\n🚗 **Birinchi avtomobil raqamini kiriting:**\n\nMasalan: 01A777AA`, {
            parse_mode: 'Markdown',
            reply_markup: { remove_keyboard: true }
        });
    }
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
    
    const session = getUserSession(userId);
    
    // Birinchi avtomobil raqami
    if (session.step === 'first_car_number') {
        const carNumber = text.toUpperCase().trim();
        
        if (carNumber.length < 2 || carNumber.length > 10) {
            bot.sendMessage(chatId, '❌ **Noto\'g\'ri avtomobil raqami!**\n\nIltimos, to\'g\'ri raqam kiriting (2-10 belgi):', { parse_mode: 'Markdown' });
            return;
        }
        
        addNewUser(userId, session.data.phone, carNumber);
        
        bot.sendMessage(chatId, `✅ **Siz muvaffaqiyatli ro'yxatdan o'tdingiz!**\n\n🚗 Avtomobil: ${carNumber}\n📞 Telefon: ${session.data.phone}\n\n🎁 **Bonus tizimi:** Har 5 diagnostikada 1 ta BEPUL!\n\n➕ "➕ Yangi avtomobil qo'shish" tugmasi orqali yana avtomobil qo'shishingiz mumkin.`, { parse_mode: 'Markdown' });
        sendMainMenu(chatId, false);
        clearUserSession(userId);
        return;
    }
    
    // Yangi avtomobil qo'shish
    if (session.step === 'add_new_car') {
        const carNumber = text.toUpperCase().trim();
        
        if (carNumber.length < 2 || carNumber.length > 10) {
            bot.sendMessage(chatId, '❌ **Noto\'g\'ri avtomobil raqami!**\n\nIltimos, to\'g\'ri raqam kiriting (2-10 belgi):', { parse_mode: 'Markdown' });
            return;
        }
        
        const result = addCarToUser(session.data.phone, carNumber);
        
        if (result.success) {
            bot.sendMessage(chatId, `✅ **Yangi avtomobil qo'shildi!**\n\n🚗 ${carNumber}\n📊 Jami avtomobillar: ${result.carsCount}/${MAX_CARS_PER_USER}\n\n🎁 Har bir avtomobil uchun bonus tizimi alohida hisoblanadi!`, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, `❌ ${result.message}`, { parse_mode: 'Markdown' });
        }
        
        clearUserSession(userId);
        sendMainMenu(chatId, false);
        return;
    }
    
    // Admin diagnostika qo'shish
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
            bot.sendMessage(chatId, '❌ **Bunday avtomobil topilmadi!**\n\nIltimos, to\'g\'ri avtomobil raqamini kiriting:', { parse_mode: 'Markdown' });
            return;
        }
        
        session.data.targetUser = foundUser;
        session.data.targetCar = foundCar;
        session.step = 'admin_work_description';
        
        bot.sendMessage(chatId, `✅ Foydalanuvchi topildi:\n\n📞 ${foundUser.phone}\n🚗 ${foundCar.carNumber}\n🎁 Bonus: ${foundCar.bonusCount}/5\n🎉 Bepul: ${foundCar.freeDiagnostics}\n\n🔧 **Bajarilgan ishlarni kiriting:**`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (session.step === 'admin_work_description') {
        session.data.workDescription = text;
        session.step = 'admin_additional_notes';
        bot.sendMessage(chatId, `✅ Bajarilgan ishlar qabul qilindi:\n\n📝 "${text}"\n\n➕ **Qo'shimcha eslatmalar kiriting** (ixtiyoriy):\n\n"❌ Bekor qilish" - bekor qilish uchun`, { parse_mode: 'Markdown' });
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
            bot.sendMessage(chatId, '❌ **Xatolik yuz berdi!**', { parse_mode: 'Markdown' });
            clearUserSession(userId);
            sendMainMenu(chatId, true);
            return;
        }
        
        let adminResponse = `🔧 **DIAGNOSTIKA QO'SHILDI**\n\n🚗 ${result.carNumber}\n📞 ${session.data.targetUser.phone}\n💰 Narx: ${result.price.toLocaleString()} so'm\n\n${result.bonusMessage}`;
        bot.sendMessage(chatId, adminResponse, { parse_mode: 'Markdown' });
        
        let userMsg = `🔧 **DIAGNOSTIKA NATIJALARI**\n\n🚗 ${result.carNumber}\n📝 ${session.data.workDescription}\n\n💰 Narx: ${result.price.toLocaleString()} so'm\n\n${result.bonusMessage}`;
        bot.sendMessage(session.data.targetUser.userId, userMsg, { parse_mode: 'Markdown' }).catch(() => {});
        
        clearUserSession(userId);
        sendMainMenu(chatId, true);
        return;
    }
    
    // FOYDALANUVCHI MENYUSI
    if (!isAdmin(userId)) {
        const user = getUserByUserId(userId);
        
        if (!user && text !== '❌ Asosiy menyu') {
            bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan! /start bosing.');
            return;
        }
        
        if (text === '📊 Mening sahifam') {
            const carsList = user.cars.map(c => `🚗 ${c.carNumber} (${c.totalDiagnostics} ta diagnostika)`).join('\n');
            bot.sendMessage(chatId, `📊 **MENGING SAHIFAM**\n\n📞 ${user.phone}\n🚗 Avtomobillar: ${user.cars.length}/${MAX_CARS_PER_USER}\n\n${carsList}\n\n🎁 Umumiy bonuslar: ${user.totalBonusCount || 0}\n🎉 Bepul diagnostika: ${user.totalFreeDiagnostics || 0} ta\n📊 Jami diagnostika: ${user.totalDiagnosticsAll || 0} ta`, { parse_mode: 'Markdown' });
        }
        else if (text === '🚗 Mening avtomobillarim') {
            if (user.cars.length === 0) {
                bot.sendMessage(chatId, '📭 Sizda hali avtomobillar mavjud emas!\n\n➕ "➕ Yangi avtomobil qo\'shish" tugmasini bosing.', { parse_mode: 'Markdown' });
                return;
            }
            
            let carsText = '🚗 **MENGING AVTOMOBILLARIM**\n\n';
            for (const car of user.cars) {
                carsText += `🚗 ${car.carNumber}\n`;
                carsText += `🎁 Bonus: ${car.bonusCount}/5\n`;
                carsText += `🎉 Bepul: ${car.freeDiagnostics} ta\n`;
                carsText += `📊 Diagnostika: ${car.totalDiagnostics} ta\n`;
                carsText += `📅 Qo'shilgan: ${new Date(car.addedDate).toLocaleDateString()}\n`;
                carsText += `━━━━━━━━━━━━━━━━━━\n`;
            }
            bot.sendMessage(chatId, carsText, { parse_mode: 'Markdown' });
        }
        else if (text === '➕ Yangi avtomobil qo\'shish') {
            if (user.cars.length >= MAX_CARS_PER_USER) {
                bot.sendMessage(chatId, `❌ Siz maksimum ${MAX_CARS_PER_USER} ta avtomobil qo'sha olasiz!`, { parse_mode: 'Markdown' });
                return;
            }
            
            const newSession = getUserSession(userId);
            newSession.step = 'add_new_car';
            newSession.data.phone = user.phone;
            newSession.data.isExistingUser = true;
            
            bot.sendMessage(chatId, `🚗 **Yangi avtomobil raqamini kiriting:**\n\nMasalan: 01A777AA\n\n⚠️ Siz maksimum ${MAX_CARS_PER_USER} tagacha avtomobil qo'sha olasiz.\n📊 Hozirgi avtomobillar soni: ${user.cars.length}/${MAX_CARS_PER_USER}`, {
                parse_mode: 'Markdown',
                reply_markup: { remove_keyboard: true }
            });
        }
        else if (text === '🎁 Mening bonuslarim') {
            let bonusText = '🎁 **MENGING BONUSLARIM**\n\n';
            for (const car of user.cars) {
                const nextFree = 5 - car.bonusCount;
                bonusText += `🚗 ${car.carNumber}\n`;
                bonusText += `📊 ${car.bonusCount}/5\n`;
                bonusText += `🎉 Bepul: ${car.freeDiagnostics} ta\n`;
                bonusText += `${nextFree > 0 ? `📌 Keyingi BEPUL: ${nextFree} ta` : '🎉 BEPUL qozondingiz!'}\n`;
                bonusText += `━━━━━━━━━━━━━━━━━━\n`;
            }
            bonusText += `\n🎯 Har 5 diagnostikada 1 ta BEPUL!\n💡 Har bir avtomobil uchun bonus alohida hisoblanadi.`;
            bot.sendMessage(chatId, bonusText, { parse_mode: 'Markdown' });
        }
        else if (text === '📋 Diagnostika tarixim') {
            const diags = getUserDiagnostics(user.phone, 15);
            if (diags.length === 0) {
                bot.sendMessage(chatId, '📭 **Sizda hali diagnostikalar mavjud emas!**', { parse_mode: 'Markdown' });
                return;
            }
            
            for (const d of diags) {
                bot.sendMessage(chatId, `📅 ${new Date(d.date).toLocaleDateString()}\n🚗 ${d.carNumber}\n📝 ${d.workDescription}\n💰 ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}\n━━━━━━━━━━`, { parse_mode: 'Markdown' });
            }
        }
        else if (text === 'ℹ️ Ma\'lumot') {
            bot.sendMessage(chatId, `ℹ️ **ISUZU DOCTOR BOT**\n\n🚗 Avtomobil diagnostikasi\n🎁 Har 5 diagnostikada 1 ta BEPUL\n📱 Bitta telefon bilan ${MAX_CARS_PER_USER} tagacha avtomobil\n📞 Aloqa: ${ADMIN_PHONE}`, { parse_mode: 'Markdown' });
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
        const stats = getStatistics();
        bot.sendMessage(chatId, `📊 **STATISTIKA**\n\n👥 Foydalanuvchilar: ${stats.totalUsers}\n🚗 Avtomobillar: ${stats.totalCars}\n🔧 Jami: ${stats.totalDiagnostics}\n💰 To'lovli: ${stats.paidDiagnostics}\n🎉 Bepul: ${stats.freeDiagnostics}\n💵 Daromad: ${stats.totalIncome.toLocaleString()} so'm\n⚠️ Xatoliklar: ${stats.totalErrors}`, { parse_mode: 'Markdown' });
    }
    else if (text === '👥 Foydalanuvchilar') {
        const usersList = users.filter(u => !u.isAdmin);
        if (usersList.length === 0) { bot.sendMessage(chatId, '📭 Hech qanday foydalanuvchi yo\'q'); return; }
        let msg = '👥 **FOYDALANUVCHILAR**\n\n';
        usersList.slice(0, 15).forEach(u => { 
            msg += `📞 ${u.phone}\n🚗 ${u.cars.length} ta avtomobil\n📊 ${u.totalDiagnosticsAll || 0} ta diagnostika\n━━━━━━\n`; 
        });
        bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (text === '🔧 Diagnostika qo\'shish') {
        session.step = 'admin_add_diagnostic';
        bot.sendMessage(chatId, '🔧 **Diagnostika qo\'shish**\n\n🚗 Avtomobil raqamini kiriting:', { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
    }
    else if (text === '🎁 Bonusga yaqinlar') {
        const nearBonus = getNearBonusCars();
        if (nearBonus.length === 0) { bot.sendMessage(chatId, '📭 Bonusga yaqin avtomobillar yo\'q'); return; }
        let msg = '🎁 **BONUSGA YAQIN AVTOMOBILLAR**\n\n';
        nearBonus.forEach(c => { 
            msg += `🚗 ${c.carNumber}\n📞 ${c.phone}\n🎁 ${c.bonusCount}/5 (${c.remaining} ta qolgan)\n━━━━━━\n`; 
        });
        bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (text === '⚠️ Xatoliklar') {
        const errorsList = getErrors();
        if (errorsList.length === 0) { bot.sendMessage(chatId, '✅ Hech qanday xatolik yo\'q'); return; }
        let msg = '⚠️ **XATOLIKLAR**\n\n';
        errorsList.slice(0, 10).forEach(e => { 
            msg += `🚗 ${e.carNumber}\n🔴 ${e.errorCode}\n📝 ${e.errorDescription}\n📅 ${new Date(e.date).toLocaleDateString()}\n━━━━━━\n`; 
        });
        bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (text === '📋 Diagnostikalar tarixi') {
        const diags = getAllDiagnostics(20);
        if (diags.length === 0) { bot.sendMessage(chatId, '📭 Hech qanday diagnostika yo\'q'); return; }
        for (const d of diags.slice(0, 10)) {
            bot.sendMessage(chatId, `📅 ${new Date(d.date).toLocaleDateString()}\n🚗 ${d.carNumber}\n📝 ${d.workDescription.substring(0, 50)}...\n💰 ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}\n━━━━━━━━━━`, { parse_mode: 'Markdown' });
        }
    }
    else if (text === '📅 Bugungi diagnostikalar') {
        const diags = getTodayDiagnostics();
        if (diags.length === 0) { bot.sendMessage(chatId, '📭 Bugun hech qanday diagnostika yo\'q'); return; }
        let msg = '📅 **BUGUNGI DIAGNOSTIKALAR**\n\n';
        diags.forEach(d => { 
            msg += `🚗 ${d.carNumber}\n📝 ${d.workDescription.substring(0, 40)}...\n💰 ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}\n━━━━━━\n`; 
        });
        bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (text === '💾 Backup yaratish') {
        bot.sendMessage(chatId, '💾 **Backup yaratilmoqda...**', { parse_mode: 'Markdown' });
        createBackup();
        bot.sendMessage(chatId, `✅ **Backup yaratildi!**\n\n📅 ${new Date().toLocaleString()}`, { parse_mode: 'Markdown' });
    }
    else if (text === '🔄 Database tiklash') {
        const backups = listBackups();
        if (backups.length === 0) {
            bot.sendMessage(chatId, '❌ **Hech qanday backup topilmadi!**\n\n💾 Avval "💾 Backup yaratish" tugmasini bosing.', { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, '🔄 **Database tiklash**\n\nQuyidagi backup\'lardan birini tanlang:', { parse_mode: 'Markdown', ...getBackupListKeyboard(backups) });
        }
    }
    else if (text === '❌ Asosiy menyu') {
        clearUserSession(userId);
        sendMainMenu(chatId, true);
    }
    else if (!session.step) {
        bot.sendMessage(chatId, '❌ **Tushunarsiz buyruq!** Menyudan foydalaning.', { parse_mode: 'Markdown' });
    }
});

// -------------------- CALLBACK QUERY --------------------
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    
    if (data.startsWith('restore_')) {
        const backupName = data.replace('restore_', '');
        bot.answerCallbackQuery(query.id);
        bot.sendMessage(chatId, '🔄 **Database tiklanmoqda...**\n\n⚠️ Bu jarayon bir necha daqiqa vaqt olishi mumkin.', { parse_mode: 'Markdown' });
        
        if (restoreBackup(backupName)) {
            loadData();
            bot.sendMessage(chatId, `✅ **Database muvaffaqiyatli tiklandi!**\n\n📁 ${backupName}\n📅 ${new Date().toLocaleString()}\n\n🔄 Barcha foydalanuvchilar ma'lumotlari tiklandi.`, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, '❌ **Database tiklashda xatolik!**\n\nBackup fayli buzilgan bo\'lishi mumkin.', { parse_mode: 'Markdown' });
        }
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

loadData();

console.log('='.repeat(60));
console.log('🚗 ISUZU DOCTOR BOT ISHGA TUSHDI');
console.log('='.repeat(60));
console.log(`👑 Admin telefon: ${ADMIN_PHONE}`);
console.log(`💰 Diagnostika narxi: ${DIAGNOSTIC_PRICE.toLocaleString()} so'm`);
console.log(`👥 Foydalanuvchilar: ${users.filter(u => !u.isAdmin).length}`);
console.log(`🚗 Avtomobillar: ${users.reduce((sum, u) => sum + (u.cars ? u.cars.length : 0), 0)}`);
console.log(`🔧 Diagnostikalar: ${diagnostics.length}`);
console.log('='.repeat(60));
console.log('✅ Bot ishlashga tayyor!');
