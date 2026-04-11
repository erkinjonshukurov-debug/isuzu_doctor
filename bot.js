const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

// -------------------- VERSIYA MA'LUMOTLARI --------------------
const BOT_VERSION = "1.1.0";
const NEW_BOT_LINK = "https://t.me/Isuzu_doctor_bot";
const INSTAGRAM_LINK = "https://www.instagram.com/isuzu.samarkand";
const TELEGRAM_GROUP_LINK = "https://t.me/+piY0W4XrGqFkN2Iy";

// -------------------- TOKEN VA ADMIN --------------------
const BOT_TOKEN = process.env.BOT_TOKEN || '8779251766:AAH12INusgBCawsk5awqIjcyHnNLiq5A33A';

const ADMIN_PHONE = "+998979247888";
const ADMIN_IDS = [1437230485];
const SUPER_ADMIN_ID = 1437230485;

// -------------------- RAILWAY VOLUME YO'LLARI --------------------
const VOLUME_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const BACKUP_DIR = path.join(VOLUME_PATH, 'backups');
const REPORTS_DIR = path.join(VOLUME_PATH, 'reports');

// -------------------- DATABASE FAYLLARI --------------------
const USERS_FILE = path.join(VOLUME_PATH, 'users.json');
const DIAGNOSTICS_FILE = path.join(VOLUME_PATH, 'diagnostics.json');
const ERRORS_FILE = path.join(VOLUME_PATH, 'errors.json');
const VERSION_FILE = path.join(VOLUME_PATH, 'version.json');
const ADMIN_SETTINGS_FILE = path.join(VOLUME_PATH, 'admin_settings.json');
const VERSION_HISTORY_FILE = path.join(VOLUME_PATH, 'version_history.json');
const LOCATIONS_FILE = path.join(VOLUME_PATH, 'locations.json');

// -------------------- DEFAULT LOKATSIYALAR --------------------
const defaultLocations = [
    {
        id: 1,
        name: "ISUZU DOCTOR - Asosiy xizmat",
        address: "Samarkand shahri, Chulpon ota",
        latitude: 39.680675,
        longitude: 67.047576,
        phone: "+998979247888",
        workTime: "Du - Shan: 09:00 - 18:00",
        isActive: true
    }
];

// -------------------- GLOBAL O'ZGARUVCHILAR --------------------
let users = [];
let diagnostics = [];
let errors = [];
let locations = [];
let versionHistory = [];
let currentVersion = BOT_VERSION;
let isUpdateMode = false;

let adminSettings = {
    allowedEditors: [],
    lastChanges: [],
    securityLog: []
};

const DIAGNOSTIC_PRICE = 250000;
const MAX_CARS_PER_USER = 20;

// -------------------- ESLATMA MATNI --------------------
const REMINDER_MESSAGE = `
🚗 **Hurmatli mijoz!**

Agar avtomobilingiz doimo soz, ishonchli va yo‘llarda sizni yarim yo‘lda qoldirmasligini istasangiz — unda unga faqat professional va malakali mutaxassislar xizmat ko‘rsatishi muhim.

🛠️ **Sifatli xizmat** — bu nafaqat qulaylik, balki sizning xavfsizligingiz kafolatidir.

✅ Shuning uchun avtomobilingizni haqiqiy professionallarga ishonib topshiring!
`;

// -------------------- VOLUME PAPKALARINI YARATISH --------------------
function ensureVolumeDir() {
    if (!fs.existsSync(VOLUME_PATH)) {
        fs.mkdirSync(VOLUME_PATH, { recursive: true });
        console.log(`✅ Volume yaratildi: ${VOLUME_PATH}`);
    }
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        console.log(`✅ Backup papkasi yaratildi: ${BACKUP_DIR}`);
    }
    if (!fs.existsSync(REPORTS_DIR)) {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
        console.log(`✅ Hisobot papkasi yaratildi: ${REPORTS_DIR}`);
    }
}

ensureVolumeDir();

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
bot.deleteWebHook().catch(e => console.log('Webhook xatolik:', e.message));

// ======================== LOKATSIYA FUNKSIYALARI ========================
function loadLocations() {
    try {
        if (fs.existsSync(LOCATIONS_FILE)) {
            locations = JSON.parse(fs.readFileSync(LOCATIONS_FILE, 'utf8'));
        } else {
            locations = defaultLocations;
            saveLocations();
        }
        console.log(`✅ Lokatsiyalar yuklandi: ${locations.length} ta manzil`);
    } catch (err) {
        console.error('Lokatsiyalarni yuklashda xatolik:', err);
        locations = defaultLocations;
    }
}

function saveLocations() {
    fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(locations, null, 2));
}

function getActiveLocations() {
    return locations.filter(l => l.isActive);
}

async function sendLocations(chatId) {
    const activeLocations = getActiveLocations();
    
    if (activeLocations.length === 0) {
        await bot.sendMessage(chatId, '📍 *Hozirda faol xizmat manzillari mavjud emas!*\n\nTez orada yangilanadi.', { parse_mode: 'Markdown' });
        return;
    }
    
    for (const location of activeLocations) {
        const locationText = `🏢 *${location.name}*\n\n` +
            `📌 *Manzil:* ${location.address}\n` +
            `🕐 *Ish vaqti:* ${location.workTime}\n` +
            `📞 *Telefon:* ${location.phone}\n\n` +
            `📍 *Lokatsiya:* [Xaritada ko'rish](https://maps.google.com/?q=${location.latitude},${location.longitude})`;
        
        const locationKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🗺️ Xaritada ochish', url: `https://maps.google.com/?q=${location.latitude},${location.longitude}` }],
                    [{ text: '📞 Telefon qilish', url: `tel:${location.phone.replace(/\+/g, '')}` }],
                    [{ text: '📍 Yo\'nalish olish', url: `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}` }]
                ]
            }
        };
        
        await bot.sendMessage(chatId, locationText, {
            parse_mode: 'Markdown',
            ...locationKeyboard
        });
    }
}

// ======================== HISOBOT YARATISH ========================
async function generateDiagnosticsReport(diagnosticsList) {
    return new Promise((resolve, reject) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `diagnostics_report_${timestamp}.txt`;
        const filepath = path.join(REPORTS_DIR, filename);
        
        let content = '';
        content += '='.repeat(80) + '\n';
        content += '                    DIAGNOSTIKA HISOBOTI\n';
        content += '='.repeat(80) + '\n\n';
        content += `Yaratilgan sana: ${new Date().toLocaleString()}\n`;
        content += `Jami diagnostikalar: ${diagnosticsList.length} ta\n\n`;
        
        const paidCount = diagnosticsList.filter(d => !d.isFree).length;
        const freeCount = diagnosticsList.filter(d => d.isFree).length;
        const totalIncome = diagnosticsList.filter(d => !d.isFree).reduce((sum, d) => sum + d.price, 0);
        
        content += '-------------------------- STATISTIKA --------------------------\n';
        content += `To'lovli diagnostikalar: ${paidCount} ta\n`;
        content += `Bepul diagnostikalar: ${freeCount} ta\n`;
        content += `Umumiy daromad: ${totalIncome.toLocaleString()} som\n\n`;
        
        content += '----------------------- DIAGNOSTIKALAR RO\'YXATI -----------------------\n';
        content += '='.repeat(80) + '\n\n';
        
        let i = 1;
        for (const diag of diagnosticsList.slice(0, 200)) {
            content += `📅 ${i}-DIAGNOSTIKA\n`;
            content += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            content += `📆 Sana: ${new Date(diag.date).toLocaleString()}\n`;
            content += `🚗 Avtomobil raqami: ${diag.carNumber}\n`;
            content += `📝 Bajarilgan ishlar:\n${diag.workDescription}\n`;
            
            if (diag.additionalNotes && diag.additionalNotes !== '') {
                content += `\n➕ Qo'shimcha eslatmalar:\n${diag.additionalNotes}\n`;
            }
            
            content += `\n💰 Narx: ${diag.isFree ? 'BEPUL' : diag.price.toLocaleString() + ' so\'m'}\n`;
            content += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            i++;
        }
        
        content += `\nJami: ${diagnosticsList.length} ta diagnostika\n`;
        content += `Hisobot yaratildi: ${new Date().toLocaleString()}\n`;
        content += '='.repeat(80) + '\n';
        
        try {
            fs.writeFileSync(filepath, content, 'utf8');
            resolve(filepath);
        } catch (err) {
            reject(err);
        }
    });
}

// ======================== VERSIYA BOSHQARISH ========================
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

// ======================== XAVFSIZLIK FUNKSIYALARI ========================
function loadAdminSettings() {
    try {
        if (fs.existsSync(ADMIN_SETTINGS_FILE)) {
            adminSettings = JSON.parse(fs.readFileSync(ADMIN_SETTINGS_FILE, 'utf8'));
        } else {
            saveAdminSettings();
        }
    } catch (err) {
        console.error('Admin sozlamalarini yuklashda xatolik:', err);
        adminSettings = { allowedEditors: [], lastChanges: [], securityLog: [] };
    }
}

function saveAdminSettings() {
    fs.writeFileSync(ADMIN_SETTINGS_FILE, JSON.stringify(adminSettings, null, 2));
}

function isSuperAdmin(userId) {
    return userId === SUPER_ADMIN_ID;
}

function canEditCode(userId) {
    return isSuperAdmin(userId) || adminSettings.allowedEditors.includes(userId);
}

// ======================== DATABASE FUNKSIYALARI ========================
function loadData() {
    try {
        ensureVolumeDir();
        
        if (fs.existsSync(USERS_FILE)) {
            users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            users.forEach(u => {
                if (u.isBlocked === undefined) u.isBlocked = false;
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

function getAllDiagnostics(limit = 500) {
    return diagnostics.slice(-limit).reverse();
}

function getStatistics() {
    const regularUsers = users.filter(u => !u.isAdmin);
    const blockedUsers = users.filter(u => !u.isAdmin && u.isBlocked === true);
    const activeUsers = regularUsers.filter(u => u.isBlocked !== true);
    
    let totalCars = 0;
    for (const user of activeUsers) {
        totalCars += user.cars.length;
    }
    
    const paidDiagnostics = diagnostics.filter(d => !d.isFree);
    const totalIncome = paidDiagnostics.reduce((sum, d) => sum + d.price, 0);
    
    return {
        totalUsers: activeUsers.length,
        blockedUsers: blockedUsers.length,
        totalCars: totalCars,
        totalDiagnostics: diagnostics.length,
        paidDiagnostics: paidDiagnostics.length,
        freeDiagnostics: diagnostics.filter(d => d.isFree).length,
        totalIncome: totalIncome,
        totalErrors: errors.length,
        currentVersion: currentVersion,
        isUpdateMode: isUpdateMode,
        totalLocations: locations.length,
        activeLocations: getActiveLocations().length
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
        isBlocked: u.isBlocked || false
    }));
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

// ======================== BACKUP FUNKSIYALARI ========================
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

// ======================== KEYBOARDS ========================
function getAdminKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                ['📊 Statistika', '👥 Foydalanuvchilar'],
                ['🔧 Diagnostika qo\'shish', '🎁 Bonusga yaqinlar'],
                ['⚠️ Xatoliklar', '📋 Diagnostikalar tarixi'],
                ['📅 Bugungi diagnostikalar', '📄 Hisobot olish'],
                ['💾 Backup yaratish', '🔄 Database tiklash'],
                ['🚫 Foydalanuvchini boshqarish', '📍 Lokatsiyalar'],
                ['🔐 Xavfsizlik', '📜 Versiya tarixi'],
                ['❌ Asosiy menyu']
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
                ['📋 Diagnostika tarixim', '📍 Xizmat manzillari'],
                ['📸 Bizning Instagram', '👥 Telegram guruhimiz'],
                ['ℹ️ Ma\'lumot', '❌ Asosiy menyu']
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
            selective: true
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
            one_time_keyboard: true
        }
    };
}

function getBackupListKeyboard(backups) {
    const keyboard = backups.slice(0, 10).map(b => [{ text: `📁 ${b.name}`, callback_data: `restore_${b.name}` }]);
    keyboard.push([{ text: '❌ Bekor qilish', callback_data: 'restore_cancel' }]);
    return { reply_markup: { inline_keyboard: keyboard } };
}

function getUserManagementKeyboard(usersList, page = 0) {
    const itemsPerPage = 5;
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const pageUsers = usersList.slice(start, end);
    
    const keyboard = [];
    pageUsers.forEach(user => {
        keyboard.push([{ text: `${user.fullName || 'Ismsiz'} - ${user.phone}`, callback_data: `manage_user_${user.userId}` }]);
    });
    
    const navButtons = [];
    if (page > 0) navButtons.push({ text: '◀️ Oldingi', callback_data: `user_page_${page - 1}` });
    if (end < usersList.length) navButtons.push({ text: 'Keyingi ▶️', callback_data: `user_page_${page + 1}` });
    if (navButtons.length > 0) keyboard.push(navButtons);
    
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

function getSecurityKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: '👥 Ruxsat berilgan adminlar', callback_data: 'security_allowed_admins' }],
                [{ text: '➕ Admin qo\'shish', callback_data: 'security_add_admin' }],
                [{ text: '➖ Admin o\'chirish', callback_data: 'security_remove_admin' }],
                [{ text: '📜 Xavfsizlik jurnali', callback_data: 'security_log' }],
                [{ text: '🔙 Orqaga', callback_data: 'security_back' }]
            ]
        }
    };
}

function getLocationsManagementKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: '➕ Yangi lokatsiya qo\'shish', callback_data: 'location_add' }],
                [{ text: '✏️ Lokatsiyani tahrirlash', callback_data: 'location_edit' }],
                [{ text: '🗑️ Lokatsiyani o\'chirish', callback_data: 'location_delete' }],
                [{ text: '👁️ Barcha lokatsiyalar', callback_data: 'location_list_all' }],
                [{ text: '🔙 Orqaga', callback_data: 'location_back' }]
            ]
        }
    };
}

// ======================== SESSIONS ========================
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

async function sendReminder(chatId) {
    try {
        await bot.sendMessage(chatId, REMINDER_MESSAGE, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Eslatma yuborishda xatolik:', error);
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
            await bot.sendMessage(chatId, `🏠 *Asosiy menyu* (Versiya ${currentVersion})\n\n🚗 ISUZU DOCTOR botiga xush kelibsiz!\n\nQuyidagi tugmalardan birini tanlang:`, {
                parse_mode: 'Markdown',
                ...getUserKeyboard()
            });
        }
    } catch (error) {
        console.error('Menu yuborishda xatolik:', error);
    }
}

// ======================== /start KOMANDASI ========================
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
            const welcomeText = `👋 *Xush kelibsiz, ${existingUser.fullName || firstName || 'hurmatli mijoz'}!*\n\n📞 Telefon: ${existingUser.phone}\n🚗 Avtomobillar: ${carsCount} ta\n🎁 Umumiy bonus: ${existingUser.totalBonusCount || 0}\n🎉 Bepul: ${existingUser.totalFreeDiagnostics || 0} ta\n📊 Jami diagnostika: ${existingUser.totalDiagnosticsAll || 0} ta\n📌 Bot versiyasi: ${currentVersion}`;
            await bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, existingUser.isAdmin);
        } else {
            const session = getUserSession(userId);
            session.data.firstName = firstName;
            session.data.lastName = lastName;
            session.data.username = username;
            
            await bot.sendMessage(chatId, `🚗 *ISUZU DOCTOR* tizimiga xush kelibsiz! (Versiya ${currentVersion})\n\n📱 Iltimos, telefon raqamingizni yuboring:`, {
                parse_mode: 'Markdown',
                ...getPhoneKeyboard()
            });
        }
    } catch (error) {
        console.error('/start xatolik:', error);
        await bot.sendMessage(chatId, '❌ *Xatolik yuz berdi!* Iltimos, qaytadan /start bosing.', { parse_mode: 'Markdown' });
    }
});

// ======================== KONTAKT QABUL QILISH ========================
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
            registeredDate: new Date().toISOString(),
            cars: [{ carId: Date.now(), carNumber: "ADMIN", bonusCount: 0, freeDiagnostics: 0, totalDiagnostics: 0, addedDate: new Date().toISOString(), isActive: true }],
            totalBonusCount: 0,
            totalFreeDiagnostics: 0,
            totalDiagnosticsAll: 0
        };
        users.push(newUser);
        saveUsers();
        
        try {
            await sendReminder(chatId);
            await bot.sendMessage(chatId, `👑 *Siz ADMIN sifatida tizimga kirdingiz!*\n\n📞 Telefon: ${phoneNumber}\n📌 Versiya: ${currentVersion}`, { parse_mode: 'Markdown' });
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

// ======================== XABAR HANDLER ========================
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
            await bot.sendMessage(chatId, '❌ *Noto\'g\'ri avtomobil raqami!*', { parse_mode: 'Markdown' });
            return;
        }
        
        addNewUser(userId, session.data.phone, carNumber, session.data.firstName || '', session.data.lastName || '', session.data.username || '');
        
        await bot.sendMessage(chatId, `✅ *Siz muvaffaqiyatli ro'yxatdan o'tdingiz!*\n\n🚗 Avtomobil: ${carNumber}\n📞 Telefon: ${session.data.phone}\n📌 Bot versiyasi: ${currentVersion}`, { parse_mode: 'Markdown' });
        await sendMainMenu(chatId, false);
        clearUserSession(userId);
        return;
    }
    
    // Yangi avtomobil qo'shish
    if (session.step === 'add_new_car') {
        const carNumber = text.toUpperCase().trim();
        if (carNumber.length < 2 || carNumber.length > 10) {
            await bot.sendMessage(chatId, '❌ *Noto\'g\'ri avtomobil raqami!*', { parse_mode: 'Markdown' });
            return;
        }
        
        const result = addCarToUser(session.data.phone, carNumber, {});
        await bot.sendMessage(chatId, result.success ? `✅ ${result.message}` : `❌ ${result.message}`, { parse_mode: 'Markdown' });
        
        clearUserSession(userId);
        await sendMainMenu(chatId, false);
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
            await bot.sendMessage(chatId, '❌ *Bunday avtomobil topilmadi!*', { parse_mode: 'Markdown' });
            return;
        }
        
        session.data.targetUser = foundUser;
        session.data.targetCar = foundCar;
        session.step = 'admin_work_description';
        await bot.sendMessage(chatId, `✅ Foydalanuvchi topildi: ${foundUser.fullName}\n\n🔧 *Bajarilgan ishlarni kiriting:*`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (session.step === 'admin_work_description') {
        session.data.workDescription = text;
        session.step = 'admin_additional_notes';
        await bot.sendMessage(chatId, `✅ Bajarilgan ishlar qabul qilindi.\n\n➕ *Qo'shimcha eslatmalar kiriting* (ixtiyoriy):`, { parse_mode: 'Markdown' });
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
        } else {
            await bot.sendMessage(chatId, `✅ *Diagnostika qo'shildi!*\n\n🚗 ${result.carNumber}\n💰 Narx: ${result.price.toLocaleString()} so'm\n${result.bonusMessage}`, { parse_mode: 'Markdown' });
            
            // Foydalanuvchiga xabar
            const userMsg = `🔧 *DIAGNOSTIKA NATIJALARI*\n\n🚗 *Avtomobil:* ${result.carNumber}\n📅 *Sana:* ${new Date().toLocaleString()}\n\n📝 *Bajarilgan ishlar:*\n${session.data.workDescription}\n\n💰 *Narx:* ${result.price.toLocaleString()} so'm\n\n${result.bonusMessage}`;
            bot.sendMessage(session.data.targetUser.userId, userMsg, { parse_mode: 'Markdown' }).catch(() => {});
        }
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true);
        return;
    }
    
    // Foydalanuvchi menyusi
    const user = getUserByUserId(userId);
    if (!user && text !== '❌ Asosiy menyu') {
        await bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan! /start bosing.');
        return;
    }
    
    if (user && user.isBlocked) {
        await bot.sendMessage(chatId, '🚫 *Siz botdan bloklangansiz!*', { parse_mode: 'Markdown' });
        return;
    }
    
    // Foydalanuvchi tugmalari
    if (text === '📊 Mening sahifam') {
        const carsList = user.cars.map(c => `🚗 ${c.carNumber} (${c.totalDiagnostics} ta)`).join('\n');
        await bot.sendMessage(chatId, `📊 *MENGING SAHIFAM*\n\n👤 *Ism:* ${user.fullName}\n📞 *Telefon:* ${user.phone}\n🚗 *Avtomobillar:* ${user.cars.length}/${MAX_CARS_PER_USER}\n\n${carsList}\n\n🎁 *Bonus:* ${user.totalBonusCount || 0}\n🎉 *Bepul:* ${user.totalFreeDiagnostics || 0} ta`, { parse_mode: 'Markdown' });
    }
    else if (text === '🚗 Mening avtomobillarim') {
        if (user.cars.length === 0) {
            await bot.sendMessage(chatId, '📭 Avtomobillar mavjud emas!', { parse_mode: 'Markdown' });
            return;
        }
        let carsText = '🚗 *MENGING AVTOMOBILLARIM*\n━━━━━━━━━━━━━━━━━━\n\n';
        for (const car of user.cars) {
            carsText += `🚗 ${car.carNumber}\n🎁 Bonus: ${car.bonusCount}/5\n🎉 Bepul: ${car.freeDiagnostics} ta\n━━━━━━━━━━━━━━━━━━\n`;
        }
        await bot.sendMessage(chatId, carsText, { parse_mode: 'Markdown' });
    }
    else if (text === '➕ Yangi avtomobil qo\'shish') {
        if (user.cars.length >= MAX_CARS_PER_USER) {
            await bot.sendMessage(chatId, `❌ Maksimum ${MAX_CARS_PER_USER} ta avtomobil!`, { parse_mode: 'Markdown' });
            return;
        }
        const newSession = getUserSession(userId);
        newSession.step = 'add_new_car';
        newSession.data.phone = user.phone;
        await bot.sendMessage(chatId, `🚗 *Yangi avtomobil raqamini kiriting:*`, { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
    }
    else if (text === '🎁 Mening bonuslarim') {
        let bonusText = '🎁 *MENGING BONUSLARIM*\n━━━━━━━━━━━━━━━━━━\n\n';
        for (const car of user.cars) {
            bonusText += `🚗 ${car.carNumber}\n📊 ${car.bonusCount}/5\n🎉 ${car.freeDiagnostics} ta BEPUL\n━━━━━━━━━━━━━━━━━━\n`;
        }
        bonusText += `\n🎯 Har 5 diagnostikada 1 ta BEPUL!`;
        await bot.sendMessage(chatId, bonusText, { parse_mode: 'Markdown' });
    }
    else if (text === '📋 Diagnostika tarixim') {
        const diags = getUserDiagnostics(user.phone, 10);
        if (diags.length === 0) {
            await bot.sendMessage(chatId, '📭 Diagnostikalar mavjud emas!', { parse_mode: 'Markdown' });
            return;
        }
        for (const d of diags) {
            await bot.sendMessage(chatId, `📅 ${new Date(d.date).toLocaleDateString()}\n🚗 ${d.carNumber}\n📝 ${d.workDescription}\n💰 ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}`, { parse_mode: 'Markdown' });
        }
    }
    else if (text === '📍 Xizmat manzillari') {
        await sendLocations(chatId);
    }
    else if (text === '📸 Bizning Instagram') {
        await bot.sendMessage(chatId, `📸 *BIZNING INSTAGRAM*\n\n🔗 ${INSTAGRAM_LINK}`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '📸 Instagramga o\'tish', url: INSTAGRAM_LINK }]] }
        });
    }
    else if (text === '👥 Telegram guruhimiz') {
        await bot.sendMessage(chatId, `👥 *TELEGRAM GURUHIMIZ*\n\n🔗 ${TELEGRAM_GROUP_LINK}`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '👥 Guruhga o\'tish', url: TELEGRAM_GROUP_LINK }]] }
        });
    }
    else if (text === 'ℹ️ Ma\'lumot') {
        await bot.sendMessage(chatId, `ℹ️ *ISUZU DOCTOR BOT*\n\n🚗 Avtomobil diagnostikasi\n🎁 Har 5 diagnostikada 1 ta BEPUL\n📌 Versiya: ${currentVersion}\n📞 Aloqa: ${ADMIN_PHONE}`, { parse_mode: 'Markdown' });
    }
    else if (text === '❌ Asosiy menyu') {
        clearUserSession(userId);
        await sendMainMenu(chatId, isAdmin(userId));
    }
});

// ======================== ADMIN MENYUSI ========================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    if (!isAdmin(userId)) return;
    
    if (text === '📊 Statistika') {
        const stats = getStatistics();
        await bot.sendMessage(chatId, `📊 *STATISTIKA*\n\n👥 Foydalanuvchilar: ${stats.totalUsers}\n🚫 Bloklangan: ${stats.blockedUsers}\n🚗 Avtomobillar: ${stats.totalCars}\n🔧 Diagnostika: ${stats.totalDiagnostics}\n💰 Daromad: ${stats.totalIncome.toLocaleString()} so'm\n📍 Lokatsiyalar: ${stats.totalLocations} ta\n📌 Versiya: ${stats.currentVersion}`, { parse_mode: 'Markdown' });
    }
    else if (text === '👥 Foydalanuvchilar') {
        const usersList = getAllUsersWithDetails();
        if (usersList.length === 0) {
            await bot.sendMessage(chatId, '📭 Foydalanuvchilar yo\'q', { parse_mode: 'Markdown' });
            return;
        }
        let msg = '👥 *FOYDALANUVCHILAR*\n━━━━━━━━━━━━━━━━━━\n\n';
        usersList.slice(0, 15).forEach((u, i) => {
            msg += `${i+1}. ${u.fullName}\n📞 ${u.phone}\n🚗 ${u.cars.map(c => c.carNumber).join(', ')}\n━━━━━━━━━━━━━━━━━━\n`;
        });
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
            await bot.sendMessage(chatId, '📭 Bonusga yaqin avtomobillar yo\'q', { parse_mode: 'Markdown' });
            return;
        }
        let msg = '🎁 *BONUSGA YAQINLAR*\n━━━━━━━━━━━━━━━━━━\n\n';
        nearBonus.forEach(c => {
            msg += `👤 ${c.fullName}\n🚗 ${c.carNumber}\n🎁 ${c.bonusCount}/5\n📌 ${c.remaining} ta qoldi\n━━━━━━━━━━━━━━━━━━\n`;
        });
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (text === '⚠️ Xatoliklar') {
        const errorsList = getErrors();
        if (errorsList.length === 0) {
            await bot.sendMessage(chatId, '✅ Xatoliklar yo\'q', { parse_mode: 'Markdown' });
            return;
        }
        let msg = '⚠️ *XATOLIKLAR*\n\n';
        errorsList.slice(0, 10).forEach(e => {
            msg += `🚗 ${e.carNumber}\n📝 ${e.errorDescription}\n📅 ${new Date(e.date).toLocaleDateString()}\n━━━━━━━━━━━━━━━━━━\n`;
        });
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (text === '📋 Diagnostikalar tarixi') {
        const diags = getAllDiagnostics(20);
        if (diags.length === 0) {
            await bot.sendMessage(chatId, '📭 Diagnostikalar yo\'q', { parse_mode: 'Markdown' });
            return;
        }
        for (const d of diags.slice(0, 10)) {
            await bot.sendMessage(chatId, `📅 ${new Date(d.date).toLocaleDateString()}\n🚗 ${d.carNumber}\n📝 ${d.workDescription}\n💰 ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}`, { parse_mode: 'Markdown' });
        }
    }
    else if (text === '📅 Bugungi diagnostikalar') {
        const diags = getTodayDiagnostics();
        if (diags.length === 0) {
            await bot.sendMessage(chatId, '📭 Bugun diagnostika yo\'q', { parse_mode: 'Markdown' });
            return;
        }
        let msg = '📅 *BUGUNGI DIAGNOSTIKALAR*\n\n';
        diags.forEach(d => {
            msg += `🚗 ${d.carNumber}\n📝 ${d.workDescription}\n💰 ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}\n━━━━━━━━━━━━━━━━━━\n`;
        });
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (text === '📄 Hisobot olish') {
        await bot.sendMessage(chatId, '📄 *Hisobot tayyorlanmoqda...*', { parse_mode: 'Markdown' });
        try {
            const allDiagnostics = getAllDiagnostics(500);
            const filepath = await generateDiagnosticsReport(allDiagnostics);
            await bot.sendDocument(chatId, filepath, { caption: `📊 Diagnostika hisoboti\n📅 ${new Date().toLocaleString()}` });
            setTimeout(() => fs.unlinkSync(filepath), 60000);
        } catch (error) {
            await bot.sendMessage(chatId, '❌ *Xatolik!*', { parse_mode: 'Markdown' });
        }
    }
    else if (text === '💾 Backup yaratish') {
        await bot.sendMessage(chatId, '💾 *Backup yaratilmoqda...*', { parse_mode: 'Markdown' });
        createBackup();
        await bot.sendMessage(chatId, `✅ *Backup yaratildi!*`, { parse_mode: 'Markdown' });
    }
    else if (text === '🔄 Database tiklash') {
        const backups = listBackups();
        if (backups.length === 0) {
            await bot.sendMessage(chatId, '❌ *Backup topilmadi!*', { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, '🔄 *Database tiklash*\n\nBackup tanlang:', { parse_mode: 'Markdown', ...getBackupListKeyboard(backups) });
        }
    }
    else if (text === '🚫 Foydalanuvchini boshqarish') {
        const usersList = getAllUsersWithDetails();
        if (usersList.length === 0) {
            await bot.sendMessage(chatId, '📭 Foydalanuvchilar yo\'q', { parse_mode: 'Markdown' });
            return;
        }
        await bot.sendMessage(chatId, '👥 *FOYDALANUVCHILARNI BOSHQARISH*\n\nQuyidagilardan tanlang:', { parse_mode: 'Markdown', ...getUserManagementKeyboard(usersList) });
    }
    else if (text === '📍 Lokatsiyalar') {
        await bot.sendMessage(chatId, '📍 *LOKATSIYALARNI BOSHQARISH*\n\nQuyidagi amallardan birini tanlang:', { parse_mode: 'Markdown', ...getLocationsManagementKeyboard() });
    }
    else if (text === '🔐 Xavfsizlik') {
        await bot.sendMessage(chatId, '🔐 *XAVFSIZLIK SOZLAMALARI*\n\nQuyidagi amallardan birini tanlang:', { parse_mode: 'Markdown', ...getSecurityKeyboard() });
    }
    else if (text === '📜 Versiya tarixi') {
        await bot.sendMessage(chatId, `📌 *Versiya:* ${currentVersion}\n📅 Oxirgi yangilanish: ${new Date().toLocaleString()}`, { parse_mode: 'Markdown' });
    }
    else if (text === '❌ Asosiy menyu') {
        await sendMainMenu(chatId, true);
    }
});

// ======================== CALLBACK QUERY ========================
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const messageId = query.message.message_id;
    const userId = query.from.id;
    
    await bot.answerCallbackQuery(query.id);
    
    if (data === 'user_manage_cancel') {
        await bot.deleteMessage(chatId, messageId);
        await sendMainMenu(chatId, true);
    }
    else if (data === 'back_to_user_list') {
        const usersList = getAllUsersWithDetails();
        await bot.editMessageText('👥 *FOYDALANUVCHILARNI BOSHQARISH*', {
            chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
            ...getUserManagementKeyboard(usersList)
        });
    }
    else if (data.startsWith('manage_user_')) {
        const targetUserId = parseInt(data.split('_')[2]);
        const user = getUserByUserId(targetUserId);
        if (!user) return;
        
        await bot.editMessageText(`👤 *${user.fullName}*\n📞 ${user.phone}\n🚗 ${user.cars.length} ta avtomobil\n📊 ${user.totalDiagnosticsAll} ta diagnostika\n🚦 ${user.isBlocked ? '🔴 Bloklangan' : '🟢 Faol'}`, {
            chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
            ...getUserActionKeyboard(targetUserId, user.isBlocked)
        });
    }
    else if (data.startsWith('block_user_')) {
        const targetUserId = parseInt(data.split('_')[2]);
        const result = blockUser(targetUserId);
        await bot.sendMessage(chatId, result.message, { parse_mode: 'Markdown' });
        await bot.deleteMessage(chatId, messageId);
        await sendMainMenu(chatId, true);
    }
    else if (data.startsWith('unblock_user_')) {
        const targetUserId = parseInt(data.split('_')[2]);
        const result = unblockUser(targetUserId);
        await bot.sendMessage(chatId, result.message, { parse_mode: 'Markdown' });
        await bot.deleteMessage(chatId, messageId);
        await sendMainMenu(chatId, true);
    }
    else if (data.startsWith('delete_user_')) {
        const targetUserId = parseInt(data.split('_')[2]);
        const confirmKeyboard = {
            reply_markup: { inline_keyboard: [[{ text: '✅ Ha', callback_data: `confirm_delete_${targetUserId}` }, { text: '❌ Yo\'q', callback_data: 'back_to_user_list' }]] }
        };
        await bot.editMessageText('⚠️ *Foydalanuvchini o\'chirishni tasdiqlaysizmi?*', {
            chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...confirmKeyboard
        });
    }
    else if (data.startsWith('confirm_delete_')) {
        const targetUserId = parseInt(data.split('_')[2]);
        const result = deleteUser(targetUserId);
        await bot.sendMessage(chatId, result.message, { parse_mode: 'Markdown' });
        await bot.deleteMessage(chatId, messageId);
        await sendMainMenu(chatId, true);
    }
    else if (data.startsWith('restore_')) {
        const backupName = data.replace('restore_', '');
        if (restoreBackup(backupName)) {
            loadData();
            await bot.sendMessage(chatId, '✅ *Database tiklandi!*', { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, '❌ *Xatolik!*', { parse_mode: 'Markdown' });
        }
        await bot.deleteMessage(chatId, messageId);
        await sendMainMenu(chatId, true);
    }
    else if (data === 'restore_cancel') {
        await bot.deleteMessage(chatId, messageId);
        await sendMainMenu(chatId, true);
    }
    else if (data === 'location_back') {
        await bot.deleteMessage(chatId, messageId);
        await sendMainMenu(chatId, true);
    }
    else if (data === 'location_add') {
        await bot.sendMessage(chatId, '📍 *Yangi lokatsiya qo\'shish* funksiyasi tez orada!', { parse_mode: 'Markdown' });
    }
    else if (data === 'location_edit') {
        await bot.sendMessage(chatId, '✏️ *Lokatsiyani tahrirlash* funksiyasi tez orada!', { parse_mode: 'Markdown' });
    }
    else if (data === 'location_delete') {
        await bot.sendMessage(chatId, '🗑️ *Lokatsiyani o\'chirish* funksiyasi tez orada!', { parse_mode: 'Markdown' });
    }
    else if (data === 'location_list_all') {
        let msg = '📍 *BARACHA LOKATSIYALAR*\n━━━━━━━━━━━━━━━━━━\n\n';
        locations.forEach((loc, i) => {
            msg += `${i+1}. ${loc.name}\n📌 ${loc.address}\n🕐 ${loc.workTime}\n━━━━━━━━━━━━━━━━━━\n`;
        });
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (data === 'security_allowed_admins') {
        let msg = '👥 *RUXSAT BERILGAN ADMINLAR*\n━━━━━━━━━━━━━━━━━━\n\n';
        if (adminSettings.allowedEditors.length === 0) {
            msg += 'Hech qanday admin ruxsatga ega emas.';
        } else {
            adminSettings.allowedEditors.forEach((id, i) => {
                msg += `${i+1}. ID: ${id}\n━━━━━━━━━━━━━━━━━━\n`;
            });
        }
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (data === 'security_add_admin') {
        await bot.sendMessage(chatId, '➕ *Admin qo\'shish*\n\nAdmin ID sini yuboring:\n/approve_admin [ID]', { parse_mode: 'Markdown' });
    }
    else if (data === 'security_remove_admin') {
        await bot.sendMessage(chatId, '➖ *Admin o\'chirish*\n\nAdmin ID sini yuboring:\n/remove_admin [ID]', { parse_mode: 'Markdown' });
    }
    else if (data === 'security_log') {
        let msg = '📜 *XAVFSIZLIK JURNALI*\n━━━━━━━━━━━━━━━━━━\n\n';
        if (adminSettings.securityLog.length === 0) {
            msg += 'Hech qanday hodisa qayd etilmagan.';
        } else {
            adminSettings.securityLog.slice(0, 10).forEach(log => {
                msg += `📅 ${new Date(log.date).toLocaleString()}\n🔹 ${log.action}\n👤 ${log.userId}\n━━━━━━━━━━━━━━━━━━\n`;
            });
        }
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (data === 'security_back') {
        await bot.deleteMessage(chatId, messageId);
        await sendMainMenu(chatId, true);
    }
});

// ======================== ADMIN BUYRUQLARI ========================
bot.onText(/\/approve_admin (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isSuperAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ Faqat Super Admin!', { parse_mode: 'Markdown' });
        return;
    }
    const targetId = parseInt(match[1]);
    if (!adminSettings.allowedEditors.includes(targetId)) {
        adminSettings.allowedEditors.push(targetId);
        saveAdminSettings();
        await bot.sendMessage(chatId, `✅ Admin ${targetId} ruxsat berildi!`, { parse_mode: 'Markdown' });
    } else {
        await bot.sendMessage(chatId, `❌ Admin allaqachon ruxsatga ega!`, { parse_mode: 'Markdown' });
    }
});

bot.onText(/\/remove_admin (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isSuperAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ Faqat Super Admin!', { parse_mode: 'Markdown' });
        return;
    }
    const targetId = parseInt(match[1]);
    const index = adminSettings.allowedEditors.indexOf(targetId);
    if (index !== -1) {
        adminSettings.allowedEditors.splice(index, 1);
        saveAdminSettings();
        await bot.sendMessage(chatId, `✅ Admin ${targetId} ruxsat olib qo'yildi!`, { parse_mode: 'Markdown' });
    } else {
        await bot.sendMessage(chatId, `❌ Admin topilmadi!`, { parse_mode: 'Markdown' });
    }
});

// ======================== BOTNI ISHGA TUSHIRISH ========================
console.log('='.repeat(60));
console.log('🚗 ISUZU DOCTOR BOT ISHGA TUSHMOQDA');
console.log('='.repeat(60));

loadVersion();
loadData();
loadAdminSettings();
loadLocations();

console.log('='.repeat(60));
console.log('🚗 ISUZU DOCTOR BOT ISHGA TUSHDI');
console.log('='.repeat(60));
console.log(`📌 Versiya: ${currentVersion}`);
console.log(`👑 Adminlar: ${ADMIN_IDS.join(', ')}`);
console.log(`👥 Foydalanuvchilar: ${users.filter(u => !u.isAdmin).length}`);
console.log(`🔧 Diagnostikalar: ${diagnostics.length}`);
console.log(`📍 Lokatsiyalar: ${locations.length} ta`);
console.log('='.repeat(60));
console.log('✅ Bot ishlashga tayyor!');
