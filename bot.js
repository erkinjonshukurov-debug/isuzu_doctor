const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

// -------------------- VERSIYA MA'LUMOTLARI --------------------
const BOT_VERSION = "1.1.0";
const NEW_BOT_LINK = "https://t.me/Isuzu_doctor_bot";
const INSTAGRAM_LINK = "https://www.instagram.com/isuzu.samarkand";
const TELEGRAM_GROUP_LINK = "https://t.me/+piY0W4XrGqFkN2Iy";

// Versiya tarixini saqlash
let versionHistory = [];

// -------------------- LOKATSIYA MA'LUMOTLARI --------------------
const LOCATIONS_FILE = path.join(VOLUME_PATH, 'locations.json');

// Default lokatsiyalar
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

let locations = [];

// -------------------- XAVFSIZLIK VA ADMIN --------------------
const BOT_TOKEN = process.env.BOT_TOKEN || '8779251766:AAH12INusgBCawsk5awqIjcyHnNLiq5A33A';

const ADMIN_PHONE = "+998979247888";
const ADMIN_IDS = [1437230485];
const SUPER_ADMIN_ID = 1437230485;

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

// -------------------- RAILWAY VOLUME YO'LLARI --------------------
const VOLUME_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const BACKUP_DIR = path.join(VOLUME_PATH, 'backups');
const REPORTS_DIR = path.join(VOLUME_PATH, 'reports');

const USERS_FILE = path.join(VOLUME_PATH, 'users.json');
const DIAGNOSTICS_FILE = path.join(VOLUME_PATH, 'diagnostics.json');
const ERRORS_FILE = path.join(VOLUME_PATH, 'errors.json');
const VERSION_FILE = path.join(VOLUME_PATH, 'version.json');
const ADMIN_SETTINGS_FILE = path.join(VOLUME_PATH, 'admin_settings.json');
const VERSION_HISTORY_FILE = path.join(VOLUME_PATH, 'version_history.json');

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

// -------------------- VERSIYA BOSHQARISH FUNKSIYALARI --------------------
function loadVersionHistory() {
    try {
        if (fs.existsSync(VERSION_HISTORY_FILE)) {
            versionHistory = JSON.parse(fs.readFileSync(VERSION_HISTORY_FILE, 'utf8'));
        } else {
            versionHistory = [];
            saveVersionHistory();
        }
        console.log(`✅ Versiya tarixi yuklandi: ${versionHistory.length} ta yozuv`);
    } catch (err) {
        console.error('Versiya tarixini yuklashda xatolik:', err);
        versionHistory = [];
    }
}

function saveVersionHistory() {
    fs.writeFileSync(VERSION_HISTORY_FILE, JSON.stringify(versionHistory, null, 2));
}

function addVersionChange(version, changes, changedBy) {
    const versionRecord = {
        version: version,
        changes: changes,
        changedBy: changedBy,
        date: new Date().toISOString()
    };
    versionHistory.unshift(versionRecord);
    if (versionHistory.length > 50) {
        versionHistory = versionHistory.slice(0, 50);
    }
    saveVersionHistory();
}

function updateBotVersion(newVersion, changes, adminId) {
    currentVersion = newVersion;
    saveVersion();
    addVersionChange(newVersion, changes, adminId);
    return true;
}

// -------------------- LOKATSIYA FUNKSIYALARI --------------------
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

function addLocation(name, address, latitude, longitude, phone, workTime, adminId) {
    const newLocation = {
        id: Date.now(),
        name: name,
        address: address,
        latitude: latitude,
        longitude: longitude,
        phone: phone || ADMIN_PHONE,
        workTime: workTime || "Du - Shan: 09:00 - 18:00",
        isActive: true
    };
    locations.push(newLocation);
    saveLocations();
    
    // Versiyani yangilash
    const newVersion = incrementVersion(currentVersion);
    updateBotVersion(newVersion, `Yangi lokatsiya qo'shildi: ${name}`, adminId);
    
    return newLocation;
}

function updateLocation(id, updates, adminId) {
    const index = locations.findIndex(l => l.id === id);
    if (index === -1) return null;
    
    const oldName = locations[index].name;
    locations[index] = { ...locations[index], ...updates };
    saveLocations();
    
    // Versiyani yangilash
    const newVersion = incrementVersion(currentVersion);
    updateBotVersion(newVersion, `Lokatsiya tahrirlandi: ${oldName}`, adminId);
    
    return locations[index];
}

function deleteLocation(id, adminId) {
    const index = locations.findIndex(l => l.id === id);
    if (index === -1) return false;
    
    const locationName = locations[index].name;
    locations.splice(index, 1);
    saveLocations();
    
    // Versiyani yangilash
    const newVersion = incrementVersion(currentVersion);
    updateBotVersion(newVersion, `Lokatsiya o'chirildi: ${locationName}`, adminId);
    
    return true;
}

function getActiveLocations() {
    return locations.filter(l => l.isActive);
}

function incrementVersion(version) {
    const parts = version.split('.');
    if (parts.length === 3) {
        parts[2] = parseInt(parts[2]) + 1;
        return parts.join('.');
    }
    return "1.1.1";
}

// -------------------- HISOBOT YARATISH (TO'LIQ MATN BILAN) --------------------
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
        
        // Statistika
        const paidCount = diagnosticsList.filter(d => !d.isFree).length;
        const freeCount = diagnosticsList.filter(d => d.isFree).length;
        const totalIncome = diagnosticsList.filter(d => !d.isFree).reduce((sum, d) => sum + d.price, 0);
        
        content += '-------------------------- STATISTIKA --------------------------\n';
        content += `To'lovli diagnostikalar: ${paidCount} ta\n`;
        content += `Bepul diagnostikalar: ${freeCount} ta\n`;
        content += `Umumiy daromad: ${totalIncome.toLocaleString()} som\n\n`;
        
        // Diagnostikalar ro'yxati (TO'LIQ MATN BILAN)
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

// -------------------- LOKATSIYALARNI KO'RSATISH --------------------
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

// -------------------- XAVFSIZLIK FUNKSIYALARI --------------------
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

function addSecurityLog(action, userId, details) {
    const log = {
        id: Date.now(),
        action: action,
        userId: userId,
        details: details,
        date: new Date().toISOString()
    };
    adminSettings.securityLog.unshift(log);
    if (adminSettings.securityLog.length > 100) {
        adminSettings.securityLog = adminSettings.securityLog.slice(0, 100);
    }
    saveAdminSettings();
}

function grantEditPermission(adminId, targetUserId) {
    if (!isSuperAdmin(adminId)) {
        return { success: false, message: 'Faqat Super Admin ruxsat bera oladi!' };
    }
    
    if (adminSettings.allowedEditors.includes(targetUserId)) {
        return { success: false, message: 'Bu admin allaqachon ruxsatga ega!' };
    }
    
    adminSettings.allowedEditors.push(targetUserId);
    saveAdminSettings();
    addSecurityLog('GRANT_EDIT_PERMISSION', adminId, `Admin ${targetUserId} ga ruxsat berildi`);
    
    return { success: true, message: 'Ruxsat muvaffaqiyatli berildi!' };
}

function revokeEditPermission(adminId, targetUserId) {
    if (!isSuperAdmin(adminId)) {
        return { success: false, message: 'Faqat Super Admin ruxsatni olib qo\'yishi mumkin!' };
    }
    
    const index = adminSettings.allowedEditors.indexOf(targetUserId);
    if (index === -1) {
        return { success: false, message: 'Bu admin ruxsatga ega emas!' };
    }
    
    adminSettings.allowedEditors.splice(index, 1);
    saveAdminSettings();
    addSecurityLog('REVOKE_EDIT_PERMISSION', adminId, `Admin ${targetUserId} dan ruxsat olindi`);
    
    return { success: true, message: 'Ruxsat muvaffaqiyatli olib qo\'yildi!' };
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
            await bot.sendMessage(user.userId, `🚀 *YANGI VERSIYA CHIQDI!*\n\nBotimiz yangilandi (Versiya ${currentVersion}). Iltimos, yangi botga o'ting:\n${NEW_BOT_LINK}`, {
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
    if (fs.existsSync(LOCATIONS_FILE)) {
        fs.copyFileSync(LOCATIONS_FILE, path.join(BACKUP_DIR, `locations_backup_${timestamp}.json`));
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

// -------------------- KEYBOARDS --------------------
function getAdminKeyboard() {
    const keyboard = [
        ['📊 Statistika', '👥 Foydalanuvchilar'],
        ['🔧 Diagnostika qo\'shish', '🎁 Bonusga yaqinlar'],
        ['⚠️ Xatoliklar', '📋 Diagnostikalar tarixi'],
        ['📅 Bugungi diagnostikalar', '📄 Hisobot olish'],
        ['💾 Backup yaratish', '🔄 Database tiklash'],
        ['🚫 Foydalanuvchini boshqarish', '📍 Lokatsiyalar'],
        ['🔐 Xavfsizlik', '📜 Versiya tarixi']
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

function getSecurityKeyboard() {
    const keyboard = [
        [{ text: '👥 Ruxsat berilgan adminlar', callback_data: 'security_allowed_admins' }],
        [{ text: '➕ Admin qo\'shish', callback_data: 'security_add_admin' }],
        [{ text: '➖ Admin o\'chirish', callback_data: 'security_remove_admin' }],
        [{ text: '📜 Xavfsizlik jurnali', callback_data: 'security_log' }],
        [{ text: '🔙 Orqaga', callback_data: 'security_back' }]
    ];
    
    return { reply_markup: { inline_keyboard: keyboard } };
}

function getLocationsManagementKeyboard() {
    const keyboard = [
        [{ text: '➕ Yangi lokatsiya qo\'shish', callback_data: 'location_add' }],
        [{ text: '✏️ Lokatsiyani tahrirlash', callback_data: 'location_edit' }],
        [{ text: '🗑️ Lokatsiyani o\'chirish', callback_data: 'location_delete' }],
        [{ text: '👁️ Barcha lokatsiyalar', callback_data: 'location_list_all' }],
        [{ text: '🔙 Orqaga', callback_data: 'location_back' }]
    ];
    
    return { reply_markup: { inline_keyboard: keyboard } };
}

function getLocationsListKeyboard(locationsList, action) {
    const keyboard = [];
    
    locationsList.forEach(location => {
        keyboard.push([{
            text: `${location.isActive ? '🟢' : '🔴'} ${location.name}`,
            callback_data: `${action}_${location.id}`
        }]);
    });
    
    keyboard.push([{ text: '🔙 Orqaga', callback_data: 'location_back_to_menu' }]);
    
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
            await bot.sendMessage(chatId, `👑 *Admin paneliga xush kelibsiz!* (Versiya ${currentVersion})\n\nQuyidagi tugmalardan foydalaning:`, {
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
    await bot.sendMessage(chatId, `📊 *MENGING SAHIFAM*\n\n👤 *Ism:* ${user.fullName || 'Kiritilmagan'}\n📞 *Telefon:* ${user.phone}\n🚗 *Avtomobillar:* ${user.cars.length}/${MAX_CARS_PER_USER}\n\n${carsList}\n\n🎁 *Umumiy bonuslar:* ${user.totalBonusCount || 0}\n🎉 *Bepul diagnostika:* ${user.totalFreeDiagnostics || 0} ta\n📊 *Jami diagnostika:* ${user.totalDiagnosticsAll || 0} ta\n📌 *Bot versiyasi:* ${currentVersion}`, { parse_mode: 'Markdown' });
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
        diagText += `🚗 *${d.carNumber}*\n\n`;
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
    await bot.sendMessage(chatId, `ℹ️ *ISUZU DOCTOR BOT*\n\n🚗 Avtomobil diagnostikasi\n🎁 Har 5 diagnostikada 1 ta BEPUL\n📱 Bitta telefon bilan ${MAX_CARS_PER_USER} tagacha avtomobil\n📞 Aloqa: ${ADMIN_PHONE}\n📌 Bot versiyasi: ${currentVersion}\n🔗 Bot linki: ${NEW_BOT_LINK}\n📸 Instagram: ${INSTAGRAM_LINK}\n👥 Telegram guruhimiz: ${TELEGRAM_GROUP_LINK}\n📍 Xizmat manzillari: ${locations.length} ta filial`, { parse_mode: 'Markdown' });
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
    await bot.sendMessage(chatId, `📊 *STATISTIKA*\n\n👥 Faol foydalanuvchilar: ${stats.totalUsers}\n🚫 Bloklanganlar: ${stats.blockedUsers}\n🚗 Avtomobillar: ${stats.totalCars}\n🔧 Jami: ${stats.totalDiagnostics}\n💰 To'lovli: ${stats.paidDiagnostics}\n🎉 Bepul: ${stats.freeDiagnostics}\n💵 Daromad: ${stats.totalIncome.toLocaleString()} so'm\n⚠️ Xatoliklar: ${stats.totalErrors}\n📍 Lokatsiyalar: ${stats.totalLocations} ta (${stats.activeLocations} ta faol)\n📌 Versiya: ${stats.currentVersion}\n🔄 Yangilanish rejimi: ${stats.isUpdateMode ? 'Faol' : 'O\'chirilgan'}`, { parse_mode: 'Markdown' });
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
        msgText += `${status} *${index + 1}. ${u.fullName || 'Ism kiritilmagan'}*\n`;
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
            await bot.sendMessage(chatId, `✅ *Siz muvaffaqiyatli ro'yxatdan o'tdingiz, ${userFullName || 'hurmatli mijoz'}!*\n\n👤 Ism: ${userFullName || 'Kiritilmagan'}\n🚗 Avtomobil: ${carNumber}\n📞 Telefon: ${session.data.phone}\n\n🎁 *Bonus tizimi:* Har 5 diagnostikada 1 ta BEPUL!\n📸 *Instagram:* Bizni kuzatib boring: ${INSTAGRAM_LINK}\n👥 *Telegram guruhimiz:* Ehtiyot qismlar va yangiliklar: ${TELEGRAM_GROUP_LINK}\n📍 *Xizmat manzili:* Samarkand shahri, Chulpon ota\n\n➕ "➕ Yangi avtomobil qo'shish" tugmasi orqali yana avtomobil qo'shishingiz mumkin.\n📌 Bot versiyasi: ${currentVersion}`, { parse_mode: 'Markdown' });
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
        
        await bot.sendMessage(chatId, `✅ Foydalanuvchi topildi:\n\n👤 ${foundUser.fullName || 'Ism kiritilmagan'}\n📞 ${foundUser.phone}\n🚗 ${foundCar.carNumber}\n🎁 Bonus: ${foundCar.bonusCount}/5\n🎉 Bepul: ${foundCar.freeDiagnostics}\n\n🔧 *Bajarilgan ishlarni kiriting:*`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (session.step === 'admin_work_description') {
        session.data.workDescription = text;
        session.step = 'admin_additional_notes';
        await bot.sendMessage(chatId, `✅ Bajarilgan ishlar qabul qilindi:\n\n📝 *"${text}"*\n\n➕ *Qo'shimcha eslatmalar kiriting* (ixtiyoriy):\n\n"❌ Bekor qilish" - bekor qilish uchun`, { parse_mode: 'Markdown' });
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
        await bot.sendMessage(chatId, `📊 *MENGING SAHIFAM*\n\n👤 *Ism:* ${user.fullName || 'Kiritilmagan'}\n📞 *Telefon:* ${user.phone}\n🚗 *Avtomobillar:* ${user.cars.length}/${MAX_CARS_PER_USER}\n\n${carsList}\n\n🎁 *Umumiy bonuslar:* ${user.totalBonusCount || 0}\n🎉 *Bepul diagnostika:* ${user.totalFreeDiagnostics || 0} ta\n📊 *Jami diagnostika:* ${user.totalDiagnosticsAll || 0} ta\n📌 *Bot versiyasi:* ${currentVersion}`, { parse_mode: 'Markdown' });
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
            diagText += `🚗 *${d.carNumber}*\n\n`;
            diagText += `📝 *Bajarilgan ishlar:*\n${d.workDescription}\n\n`;
            
            if (d.additionalNotes && d.additionalNotes !== '') {
                diagText += `➕ *Qo'shimcha eslatmalar:*\n${d.additionalNotes}\n\n`;
            }
            
            diagText += `💰 *Narx:* ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}\n`;
            diagText += `━━━━━━━━━━━━━━━━━━\n`;
            
            await bot.sendMessage(chatId, diagText, { parse_mode: 'Markdown' });
        }
    }
    else if (text === '📍 Xizmat manzillari') {
        await sendLocations(chatId);
    }
    else if (text === '📸 Bizning Instagram') {
        const instagramKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📸 Instagram sahifamizga o\'tish', url: INSTAGRAM_LINK }]
                ]
            }
        };
        
        await bot.sendMessage(chatId, `📸 *BIZNING INSTAGRAM*\n\nBizni Instagram sahifamizda kuzatib boring:\n\n🔗 ${INSTAGRAM_LINK}\n\n🚗 Avtomobil yangiliklari, aksiyalar va foydali maslahatlar uchun bizni kuzating!`, {
            parse_mode: 'Markdown',
            ...instagramKeyboard
        });
    }
    else if (text === '👥 Telegram guruhimiz') {
        const groupKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '👥 Telegram guruhiga o\'tish', url: TELEGRAM_GROUP_LINK }]
                ]
            }
        };
        
        await bot.sendMessage(chatId, `👥 *TELEGRAM GURUHIMIZ*\n\nEhtiyot qismlar, yangiliklar va foydali ma'lumotlar uchun Telegram guruhimizga qo'shiling:\n\n🔗 ${TELEGRAM_GROUP_LINK}`, {
            parse_mode: 'Markdown',
            ...groupKeyboard
        });
    }
    else if (text === 'ℹ️ Ma\'lumot') {
        await sendReminder(chatId);
        await bot.sendMessage(chatId, `ℹ️ *ISUZU DOCTOR BOT*\n\n🚗 Avtomobil diagnostikasi\n🎁 Har 5 diagnostikada 1 ta BEPUL\n📱 Bitta telefon bilan ${MAX_CARS_PER_USER} tagacha avtomobil\n📞 Aloqa: ${ADMIN_PHONE}\n📌 Bot versiyasi: ${currentVersion}\n🔗 Bot linki: ${NEW_BOT_LINK}\n📸 Instagram: ${INSTAGRAM_LINK}\n👥 Telegram guruhimiz: ${TELEGRAM_GROUP_LINK}\n📍 Xizmat manzillari: ${locations.length} ta filial`, { parse_mode: 'Markdown' });
    }
    else if (text === '❌ Asosiy menyu') {
        clearUserSession(userId);
        await sendMainMenu(chatId, isAdmin(userId));
    }
    else if (!session.step) {
        await bot.sendMessage(chatId, `❌ *Tushunarsiz buyruq!* Menyudan foydalaning.\n\n/start - Bosh sahifa\n/profile - Mening sahifam\n/my_cars - Mening avtomobillarim\n/my_bonus - Mening bonuslarim\n/history - Diagnostika tarixi\n/info - Ma'lumot\n📌 Versiya: ${currentVersion}`, { parse_mode: 'Markdown' });
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
        await bot.sendMessage(chatId, `📊 *STATISTIKA*\n\n👥 Faol foydalanuvchilar: ${stats.totalUsers}\n🚫 Bloklanganlar: ${stats.blockedUsers}\n🚗 Avtomobillar: ${stats.totalCars}\n🔧 Jami: ${stats.totalDiagnostics}\n💰 To'lovli: ${stats.paidDiagnostics}\n🎉 Bepul: ${stats.freeDiagnostics}\n💵 Daromad: ${stats.totalIncome.toLocaleString()} so'm\n⚠️ Xatoliklar: ${stats.totalErrors}\n📍 Lokatsiyalar: ${stats.totalLocations} ta (${stats.activeLocations} ta faol)\n📌 Versiya: ${stats.currentVersion}\n🔄 Yangilanish rejimi: ${stats.isUpdateMode ? 'Faol' : 'O\'chirilgan'}`, { parse_mode: 'Markdown' });
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
            msg += `${status} *${index + 1}. ${u.fullName || 'Ism kiritilmagan'}*\n`;
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
            let diagText = `📅 ${new Date(d.date).toLocaleDateString()}\n🚗 ${d.carNumber}\n📝 *Bajarilgan ishlar:*\n${d.workDescription}\n`;
            if (d.additionalNotes && d.additionalNotes !== '') {
                diagText += `\n➕ *Qo'shimcha eslatmalar:*\n${d.additionalNotes}\n`;
            }
            diagText += `\n💰 Narx: ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}\n`;
            diagText += `━━━━━━━━━━━━━━━━━━\n`;
            await bot.sendMessage(chatId, diagText, { parse_mode: 'Markdown' });
        }
    }
    else if (text === '📅 Bugungi diagnostikalar') {
        const diags = getTodayDiagnostics();
        if (diags.length === 0) { await bot.sendMessage(chatId, '📭 Bugun hech qanday diagnostika yo\'q'); return; }
        let msg = '📅 *BUGUNGI DIAGNOSTIKALAR*\n\n';
        diags.forEach(d => { 
            msg += `🚗 ${d.carNumber}\n📝 *Bajarilgan ishlar:*\n${d.workDescription}\n`;
            if (d.additionalNotes && d.additionalNotes !== '') {
                msg += `\n➕ *Qo'shimcha eslatmalar:*\n${d.additionalNotes}\n`;
            }
            msg += `\n💰 Narx: ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}\n━━━━━━━━━━━━━━━━━━\n`;
        });
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (text === '📄 Hisobot olish') {
        await bot.sendMessage(chatId, '📄 *Hisobot tayyorlanmoqda...*\n\nIltimos, kuting...', { parse_mode: 'Markdown' });
        
        try {
            const allDiagnostics = getAllDiagnostics(500);
            const filepath = await generateDiagnosticsReport(allDiagnostics);
            
            await bot.sendDocument(chatId, filepath, {
                caption: `📊 *DIAGNOSTIKA HISOBOTI*\n\n📅 Sana: ${new Date().toLocaleString()}\n📊 Jami diagnostikalar: ${allDiagnostics.length} ta\n💰 Umumiy daromad: ${allDiagnostics.filter(d => !d.isFree).reduce((sum, d) => sum + d.price, 0).toLocaleString()} so'm\n📌 Versiya: ${currentVersion}\n\n📌 Hisobot fayli yuklandi.`,
                parse_mode: 'Markdown'
            });
            
            setTimeout(() => {
                fs.unlinkSync(filepath);
            }, 60000);
            
        } catch (error) {
            console.error('Hisobot yaratish xatolik:', error);
            await bot.sendMessage(chatId, '❌ *Hisobot yaratishda xatolik yuz berdi!*', { parse_mode: 'Markdown' });
        }
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
    else if (text === '📍 Lokatsiyalar') {
        if (!isAdmin(userId)) return;
        
        const activeCount = getActiveLocations().length;
        const totalCount = locations.length;
        
        await bot.sendMessage(chatId, 
            `📍 *LOKATSIYALARNI BOSHQARISH*\n\n` +
            `📊 Statistikalar:\n` +
            `• Jami lokatsiyalar: ${totalCount} ta\n` +
            `• Faol lokatsiyalar: ${activeCount} ta\n\n` +
            `📌 Quyidagi amallardan birini tanlang:`,
            { 
                parse_mode: 'Markdown',
                ...getLocationsManagementKeyboard()
            }
        );
    }
    else if (text === '🔐 Xavfsizlik') {
        if (!isSuperAdmin(userId) && !canEditCode(userId)) {
            await bot.sendMessage(chatId, '❌ *Sizda bu amalni bajarish uchun ruxsat yo\'q!*\n\nFaqat Super Admin yoki ruxsat berilgan adminlar xavfsizlik sozlamalarini o\'zgartirishi mumkin.', { parse_mode: 'Markdown' });
            return;
        }
        
        await bot.sendMessage(chatId, 
            `🔐 *XAVFSIZLIK SOZLAMALARI*\n\n` +
            `👑 Super Admin ID: ${SUPER_ADMIN_ID}\n` +
            `👥 Ruxsat berilgan adminlar: ${adminSettings.allowedEditors.length} ta\n` +
            `📜 Xavfsizlik jurnali: ${adminSettings.securityLog.length} ta yozuv\n\n` +
            `📌 Quyidagi amallardan birini tanlang:`,
            { 
                parse_mode: 'Markdown',
                ...getSecurityKeyboard()
            }
        );
    }
    else if (text === '📜 Versiya tarixi') {
        let msg = '📜 *VERSIYA TARIXI*\n━━━━━━━━━━━━━━━━━━\n\n';
        
        if (versionHistory.length === 0) {
            msg += 'Hech qanday versiya o\'zgarishi qayd etilmagan.';
        } else {
            versionHistory.slice(0, 20).forEach(record => {
                msg += `📌 *Versiya ${record.version}*\n`;
                msg += `📅 Sana: ${new Date(record.date).toLocaleString()}\n`;
                msg += `👤 O\'zgartirgan: ${record.changedBy === SUPER_ADMIN_ID ? 'Super Admin' : `Admin ID: ${record.changedBy}`}\n`;
                msg += `📝 O\'zgarishlar:\n${record.changes}\n`;
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
    const userId = query.from.id;
    
    // Lokatsiya callback'lari
    if (data === 'location_add') {
        await bot.answerCallbackQuery(query.id);
        
        const session = getUserSession(userId);
        session.step = 'location_add_name';
        session.data = {};
        
        await bot.editMessageText(
            `➕ *YANGI LOKATSIYA QO'SHISH*\n\n` +
            `1-qadam: Lokatsiya nomini kiriting.\n\n` +
            `Masalan: "ISUZU DOCTOR - Chilonzor filiali"\n\n` +
            `❌ Bekor qilish uchun /cancel yozing.`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            }
        );
    }
    else if (data === 'location_edit') {
        await bot.answerCallbackQuery(query.id);
        
        if (locations.length === 0) {
            await bot.editMessageText(
                `❌ *Hech qanday lokatsiya mavjud emas!*\n\nAvval lokatsiya qo'shing.`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    ...getLocationsManagementKeyboard()
                }
            );
            return;
        }
        
        await bot.editMessageText(
            `✏️ *LOKATSIYANI TAHRIRLASH*\n\nTahrirlamoqchi bo'lgan lokatsiyani tanlang:`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...getLocationsListKeyboard(locations, 'location_edit_select')
            }
        );
    }
    else if (data === 'location_delete') {
        await bot.answerCallbackQuery(query.id);
        
        if (locations.length === 0) {
            await bot.editMessageText(
                `❌ *Hech qanday lokatsiya mavjud emas!*`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    ...getLocationsManagementKeyboard()
                }
            );
            return;
        }
        
        await bot.editMessageText(
            `🗑️ *LOKATSIYANI O'CHIRISH*\n\nO'chirmoqchi bo'lgan lokatsiyani tanlang:`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...getLocationsListKeyboard(locations, 'location_delete_select')
            }
        );
    }
    else if (data === 'location_list_all') {
        await bot.answerCallbackQuery(query.id);
        
        if (locations.length === 0) {
            await bot.editMessageText(
                `❌ *Hech qanday lokatsiya mavjud emas!*`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    ...getLocationsManagementKeyboard()
                }
            );
            return;
        }
        
        let msg = '📍 *BARACHA LOKATSIYALAR*\n━━━━━━━━━━━━━━━━━━\n\n';
        locations.forEach((loc, index) => {
            msg += `${index + 1}. ${loc.isActive ? '🟢' : '🔴'} *${loc.name}*\n`;
            msg += `   📌 ${loc.address}\n`;
            msg += `   🕐 ${loc.workTime}\n`;
            msg += `   📞 ${loc.phone}\n`;
            msg += `   📍 ${loc.latitude}, ${loc.longitude}\n`;
            msg += `━━━━━━━━━━━━━━━━━━\n`;
        });
        
        await bot.editMessageText(msg, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            ...getLocationsManagementKeyboard()
        });
    }
    else if (data === 'location_back') {
        await bot.answerCallbackQuery(query.id);
        await sendMainMenu(chatId, true);
    }
    else if (data === 'location_back_to_menu') {
        await bot.answerCallbackQuery(query.id);
        
        const activeCount = getActiveLocations().length;
        const totalCount = locations.length;
        
        await bot.editMessageText(
            `📍 *LOKATSIYALARNI BOSHQARISH*\n\n` +
            `📊 Statistikalar:\n` +
            `• Jami lokatsiyalar: ${totalCount} ta\n` +
            `• Faol lokatsiyalar: ${activeCount} ta\n\n` +
            `📌 Quyidagi amallardan birini tanlang:`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...getLocationsManagementKeyboard()
            }
        );
    }
    else if (data.startsWith('location_edit_select_')) {
        const locationId = parseInt(data.split('_')[3]);
        const location = locations.find(l => l.id === locationId);
        
        if (!location) {
            await bot.answerCallbackQuery(query.id, { text: 'Lokatsiya topilmadi!', show_alert: true });
            return;
        }
        
        await bot.answerCallbackQuery(query.id);
        
        const editKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📝 Nom', callback_data: `location_edit_name_${locationId}` }],
                    [{ text: '📍 Manzil', callback_data: `location_edit_address_${locationId}` }],
                    [{ text: '🕐 Ish vaqti', callback_data: `location_edit_time_${locationId}` }],
                    [{ text: '📞 Telefon', callback_data: `location_edit_phone_${locationId}` }],
                    [{ text: '🗺️ Koordinatalar', callback_data: `location_edit_coords_${locationId}` }],
                    [{ text: location.isActive ? '🔴 Faolsizlantirish' : '🟢 Faollashtirish', callback_data: `location_edit_active_${locationId}` }],
                    [{ text: '🔙 Orqaga', callback_data: 'location_back_to_menu' }]
                ]
            }
        };
        
        await bot.editMessageText(
            `✏️ *LOKATSIYANI TAHRIRLASH*\n\n🏢 ${location.name}\n\nQaysi maydonni tahrirlamoqchisiz?`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...editKeyboard
            }
        );
    }
    else if (data.startsWith('location_edit_name_')) {
        const locationId = parseInt(data.split('_')[3]);
        await bot.answerCallbackQuery(query.id);
        
        const session = getUserSession(userId);
        session.step = 'location_edit_name';
        session.data = { locationId: locationId, field: 'name' };
        
        await bot.editMessageText(
            `✏️ *NOMNI TAHRIRLASH*\n\nYangi nomni kiriting:\n\n❌ Bekor qilish uchun /cancel yozing.`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            }
        );
    }
    else if (data.startsWith('location_edit_address_')) {
        const locationId = parseInt(data.split('_')[3]);
        await bot.answerCallbackQuery(query.id);
        
        const session = getUserSession(userId);
        session.step = 'location_edit_address';
        session.data = { locationId: locationId, field: 'address' };
        
        await bot.editMessageText(
            `✏️ *MANZILNI TAHRIRLASH*\n\nYangi manzilni kiriting:\n\nMasalan: "Samarkand shahri, Chulpon ota"\n\n❌ Bekor qilish uchun /cancel yozing.`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            }
        );
    }
    else if (data.startsWith('location_edit_time_')) {
        const locationId = parseInt(data.split('_')[3]);
        await bot.answerCallbackQuery(query.id);
        
        const session = getUserSession(userId);
        session.step = 'location_edit_time';
        session.data = { locationId: locationId, field: 'workTime' };
        
        await bot.editMessageText(
            `✏️ *ISH VAQTINI TAHRIRLASH*\n\nYangi ish vaqtini kiriting:\n\nMasalan: "Du - Shan: 09:00 - 18:00"\n\n❌ Bekor qilish uchun /cancel yozing.`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            }
        );
    }
    else if (data.startsWith('location_edit_phone_')) {
        const locationId = parseInt(data.split('_')[3]);
        await bot.answerCallbackQuery(query.id);
        
        const session = getUserSession(userId);
        session.step = 'location_edit_phone';
        session.data = { locationId: locationId, field: 'phone' };
        
        await bot.editMessageText(
            `✏️ *TELEFONNI TAHRIRLASH*\n\nYangi telefon raqamini kiriting:\n\nMasalan: "+998979247888"\n\n❌ Bekor qilish uchun /cancel yozing.`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            }
        );
    }
    else if (data.startsWith('location_edit_coords_')) {
        const locationId = parseInt(data.split('_')[3]);
        await bot.answerCallbackQuery(query.id);
        
        const session = getUserSession(userId);
        session.step = 'location_edit_coords';
        session.data = { locationId: locationId, field: 'coords' };
        
        await bot.editMessageText(
            `✏️ *KOORDINATALARNI TAHRIRLASH*\n\nYangi koordinatalarni kiriting (latitude, longitude):\n\nMasalan: "39.680675, 67.047576"\n\n📍 Google Maps dan koordinata olish mumkin.\n\n❌ Bekor qilish uchun /cancel yozing.`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            }
        );
    }
    else if (data.startsWith('location_edit_active_')) {
        const locationId = parseInt(data.split('_')[3]);
        const location = locations.find(l => l.id === locationId);
        
        if (location) {
            location.isActive = !location.isActive;
            saveLocations();
            
            // Versiyani yangilash
            const newVersion = incrementVersion(currentVersion);
            updateBotVersion(newVersion, `Lokatsiya ${location.isActive ? 'faollashtirildi' : 'faolsizlantirildi'}: ${location.name}`, userId);
            
            await bot.answerCallbackQuery(query.id, { text: `Lokatsiya ${location.isActive ? 'faollashtirildi' : 'faolsizlantirildi'}! Versiya ${newVersion} ga yangilandi.`, show_alert: true });
        }
        
        // Qaytadan lokatsiyalar ro'yxatini ko'rsatish
        const editKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📝 Nom', callback_data: `location_edit_name_${locationId}` }],
                    [{ text: '📍 Manzil', callback_data: `location_edit_address_${locationId}` }],
                    [{ text: '🕐 Ish vaqti', callback_data: `location_edit_time_${locationId}` }],
                    [{ text: '📞 Telefon', callback_data: `location_edit_phone_${locationId}` }],
                    [{ text: '🗺️ Koordinatalar', callback_data: `location_edit_coords_${locationId}` }],
                    [{ text: location.isActive ? '🔴 Faolsizlantirish' : '🟢 Faollashtirish', callback_data: `location_edit_active_${locationId}` }],
                    [{ text: '🔙 Orqaga', callback_data: 'location_back_to_menu' }]
                ]
            }
        };
        
        await bot.editMessageText(
            `✏️ *LOKATSIYANI TAHRIRLASH*\n\n🏢 ${location.name}\n\nQaysi maydonni tahrirlamoqchisiz?`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...editKeyboard
            }
        );
    }
    else if (data.startsWith('location_delete_select_')) {
        const locationId = parseInt(data.split('_')[3]);
        const location = locations.find(l => l.id === locationId);
        
        if (!location) {
            await bot.answerCallbackQuery(query.id, { text: 'Lokatsiya topilmadi!', show_alert: true });
            return;
        }
        
        await bot.answerCallbackQuery(query.id);
        
        const confirmKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Ha, o\'chirish', callback_data: `location_confirm_delete_${locationId}` }],
                    [{ text: '❌ Bekor qilish', callback_data: 'location_back_to_menu' }]
                ]
            }
        };
        
        await bot.editMessageText(
            `⚠️ *DIQQAT!*\n\n"${location.name}" lokatsiyasini o'chirmoqchisiz.\n\nBu amalni ortga qaytarib bo'lmaydi!\n\nHaqiqatan ham o'chirishni xohlaysizmi?`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...confirmKeyboard
            }
        );
    }
    else if (data.startsWith('location_confirm_delete_')) {
        const locationId = parseInt(data.split('_')[3]);
        const location = locations.find(l => l.id === locationId);
        const locationName = location ? location.name : '';
        const result = deleteLocation(locationId, userId);
        
        if (result) {
            const newVersion = incrementVersion(currentVersion);
            await bot.answerCallbackQuery(query.id, { text: `Lokatsiya o'chirildi! Versiya ${newVersion} ga yangilandi.`, show_alert: true });
        } else {
            await bot.answerCallbackQuery(query.id, { text: 'Xatolik yuz berdi!', show_alert: true });
        }
        
        const activeCount = getActiveLocations().length;
        const totalCount = locations.length;
        
        await bot.editMessageText(
            `📍 *LOKATSIYALARNI BOSHQARISH*\n\n` +
            `📊 Statistikalar:\n` +
            `• Jami lokatsiyalar: ${totalCount} ta\n` +
            `• Faol lokatsiyalar: ${activeCount} ta\n\n` +
            `📌 Quyidagi amallardan birini tanlang:`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...getLocationsManagementKeyboard()
            }
        );
    }
    // Xavfsizlik callback'lari
    else if (data === 'security_allowed_admins') {
        await bot.answerCallbackQuery(query.id);
        
        let msg = '👥 *RUXSAT BERILGAN ADMINLAR*\n━━━━━━━━━━━━━━━━━━\n\n';
        if (adminSettings.allowedEditors.length === 0) {
            msg += 'Hech qanday admin ruxsatga ega emas.\nFaqat Super Admin kodni o\'zgartirishi mumkin.';
        } else {
            adminSettings.allowedEditors.forEach((adminId, index) => {
                const admin = getUserByUserId(adminId);
                msg += `${index + 1}. ID: ${adminId}\n`;
                if (admin) {
                    msg += `👤 ${admin.fullName || admin.phone}\n`;
                }
                msg += `━━━━━━━━━━━━━━━━━━\n`;
            });
        }
        
        await bot.editMessageText(msg, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            ...getSecurityKeyboard()
        });
    }
    else if (data === 'security_add_admin') {
        await bot.answerCallbackQuery(query.id);
        await bot.editMessageText(
            `➕ *ADMIN QO'SHISH*\n\nRuxsat bermoqchi bo'lgan adminning Telegram ID sini yuboring.\n\n⚠️ Faqat Super Admin bu amalni bajarishi mumkin!\n\n❌ Bekor qilish uchun /cancel yozing.`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            }
        );
        
        const session = getUserSession(userId);
        session.step = 'add_admin_permission';
        return;
    }
    else if (data === 'security_remove_admin') {
        await bot.answerCallbackQuery(query.id);
        
        if (adminSettings.allowedEditors.length === 0) {
            await bot.editMessageText(
                `❌ *Hech qanday admin ruxsatga ega emas!*`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    ...getSecurityKeyboard()
                }
            );
            return;
        }
        
        let msg = `➖ *ADMIN O'CHIRISH*\n\nRuxsatni olib qo'yish uchun adminni tanlang:\n\n`;
        const keyboard = [];
        
        adminSettings.allowedEditors.forEach(adminId => {
            const admin = getUserByUserId(adminId);
            const name = admin ? admin.fullName || admin.phone : `ID: ${adminId}`;
            keyboard.push([{ text: `❌ ${name}`, callback_data: `remove_admin_${adminId}` }]);
        });
        keyboard.push([{ text: '🔙 Orqaga', callback_data: 'security_back' }]);
        
        await bot.editMessageText(msg, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
        return;
    }
    else if (data === 'security_log') {
        await bot.answerCallbackQuery(query.id);
        
        let msg = '📜 *XAVFSIZLIK JURNALI*\n━━━━━━━━━━━━━━━━━━\n\n';
        if (adminSettings.securityLog.length === 0) {
            msg += 'Hech qanday xavfsizlik hodisasi qayd etilmagan.';
        } else {
            adminSettings.securityLog.slice(0, 20).forEach(log => {
                msg += `📅 ${new Date(log.date).toLocaleString()}\n`;
                msg += `🔹 ${log.action}\n`;
                msg += `👤 Admin ID: ${log.userId}\n`;
                msg += `📝 ${log.details}\n`;
                msg += `━━━━━━━━━━━━━━━━━━\n`;
            });
        }
        
        await bot.editMessageText(msg, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            ...getSecurityKeyboard()
        });
    }
    else if (data === 'security_back') {
        await bot.answerCallbackQuery(query.id);
        await bot.editMessageText(
            `🔐 *XAVFSIZLIK SOZLAMALARI*\n\n` +
            `👑 Super Admin ID: ${SUPER_ADMIN_ID}\n` +
            `👥 Ruxsat berilgan adminlar: ${adminSettings.allowedEditors.length} ta\n` +
            `📜 Xavfsizlik jurnali: ${adminSettings.securityLog.length} ta yozuv\n\n` +
            `📌 Quyidagi amallardan birini tanlang:`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...getSecurityKeyboard()
            }
        );
    }
    else if (data.startsWith('remove_admin_')) {
        const targetAdminId = parseInt(data.split('_')[2]);
        const result = revokeEditPermission(userId, targetAdminId);
        
        await bot.answerCallbackQuery(query.id, { text: result.message, show_alert: true });
        
        await bot.editMessageText(
            `🔐 *XAVFSIZLIK SOZLAMALARI*\n\n` +
            `👑 Super Admin ID: ${SUPER_ADMIN_ID}\n` +
            `👥 Ruxsat berilgan adminlar: ${adminSettings.allowedEditors.length} ta\n` +
            `📜 Xavfsizlik jurnali: ${adminSettings.securityLog.length} ta yozuv\n\n` +
            `📌 Quyidagi amallardan birini tanlang:`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...getSecurityKeyboard()
            }
        );
    }
    else if (data === 'confirm_update') {
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
            loadLocations();
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

// -------------------- SESSION LOKATSIYA QO'SHISH --------------------
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    const session = getUserSession(userId);
    
    // Admin qo'shish session
    if (session.step === 'add_admin_permission') {
        if (text === '/cancel') {
            clearUserSession(userId);
            await bot.sendMessage(chatId, '❌ *Amal bekor qilindi.*', { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, true);
            return;
        }
        
        const targetAdminId = parseInt(text);
        if (isNaN(targetAdminId)) {
            await bot.sendMessage(chatId, '❌ *Noto\'g\'ri ID!* Iltimos, to\'g\'ri Telegram ID yuboring yoki /cancel yozing.', { parse_mode: 'Markdown' });
            return;
        }
        
        const result = grantEditPermission(userId, targetAdminId);
        await bot.sendMessage(chatId, result.message, { parse_mode: 'Markdown' });
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true);
    }
    // Lokatsiya qo'shish session'lari
    else if (session.step === 'location_add_name') {
        if (text === '/cancel') {
            clearUserSession(userId);
            await bot.sendMessage(chatId, '❌ *Amal bekor qilindi.*', { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, true);
            return;
        }
        
        session.data.name = text;
        session.step = 'location_add_address';
        
        await bot.sendMessage(chatId, 
            `✅ *Nom qabul qilindi:* ${text}\n\n` +
            `2-qadam: Lokatsiya manzilini kiriting.\n\n` +
            `Masalan: "Samarkand shahri, Chulpon ota"\n\n` +
            `❌ Bekor qilish uchun /cancel yozing.`,
            { parse_mode: 'Markdown' }
        );
    }
    else if (session.step === 'location_add_address') {
        if (text === '/cancel') {
            clearUserSession(userId);
            await bot.sendMessage(chatId, '❌ *Amal bekor qilindi.*', { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, true);
            return;
        }
        
        session.data.address = text;
        session.step = 'location_add_coords';
        
        await bot.sendMessage(chatId,
            `✅ *Manzil qabul qilindi:* ${text}\n\n` +
            `3-qadam: Lokatsiya koordinatalarini kiriting (latitude, longitude).\n\n` +
            `Masalan: "39.680675, 67.047576"\n\n` +
            `📍 Google Maps dan koordinata olish mumkin.\n\n` +
            `❌ Bekor qilish uchun /cancel yozing.`,
            { parse_mode: 'Markdown' }
        );
    }
    else if (session.step === 'location_add_coords') {
        if (text === '/cancel') {
            clearUserSession(userId);
            await bot.sendMessage(chatId, '❌ *Amal bekor qilindi.*', { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, true);
            return;
        }
        
        const coords = text.split(',').map(c => parseFloat(c.trim()));
        if (coords.length !== 2 || isNaN(coords[0]) || isNaN(coords[1])) {
            await bot.sendMessage(chatId, '❌ *Noto\'g\'ri format!*\n\nIltimos, koordinatalarni to\'g\'ri formatda kiriting:\nMasalan: "39.680675, 67.047576"', { parse_mode: 'Markdown' });
            return;
        }
        
        session.data.latitude = coords[0];
        session.data.longitude = coords[1];
        session.step = 'location_add_phone';
        
        await bot.sendMessage(chatId,
            `✅ *Koordinatalar qabul qilindi:* ${coords[0]}, ${coords[1]}\n\n` +
            `4-qadam: Lokatsiya telefon raqamini kiriting.\n\n` +
            `Masalan: "+998979247888"\n\n` +
            `❌ Bekor qilish uchun /cancel yozing.`,
            { parse_mode: 'Markdown' }
        );
    }
    else if (session.step === 'location_add_phone') {
        if (text === '/cancel') {
            clearUserSession(userId);
            await bot.sendMessage(chatId, '❌ *Amal bekor qilindi.*', { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, true);
            return;
        }
        
        session.data.phone = text;
        session.step = 'location_add_time';
        
        await bot.sendMessage(chatId,
            `✅ *Telefon qabul qilindi:* ${text}\n\n` +
            `5-qadam: Lokatsiya ish vaqtini kiriting.\n\n` +
            `Masalan: "Du - Shan: 09:00 - 18:00"\n\n` +
            `❌ Bekor qilish uchun /cancel yozing.`,
            { parse_mode: 'Markdown' }
        );
    }
    else if (session.step === 'location_add_time') {
        if (text === '/cancel') {
            clearUserSession(userId);
            await bot.sendMessage(chatId, '❌ *Amal bekor qilindi.*', { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, true);
            return;
        }
        
        const newLocation = addLocation(
            session.data.name,
            session.data.address,
            session.data.latitude,
            session.data.longitude,
            session.data.phone,
            text,
            userId
        );
        
        await bot.sendMessage(chatId,
            `✅ *Yangi lokatsiya qo'shildi!*\n\n` +
            `🏢 *Nomi:* ${newLocation.name}\n` +
            `📍 *Manzil:* ${newLocation.address}\n` +
            `🕐 *Ish vaqti:* ${newLocation.workTime}\n` +
            `📞 *Telefon:* ${newLocation.phone}\n` +
            `🗺️ *Koordinatalar:* ${newLocation.latitude}, ${newLocation.longitude}\n\n` +
            `📍 Xaritada ko'rish: https://maps.google.com/?q=${newLocation.latitude},${newLocation.longitude}\n\n` +
            `📌 Bot versiyasi ${currentVersion} ga yangilandi!`,
            { parse_mode: 'Markdown' }
        );
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true);
    }
    // Lokatsiyani tahrirlash session'lari
    else if (session.step === 'location_edit_name') {
        if (text === '/cancel') {
            clearUserSession(userId);
            await bot.sendMessage(chatId, '❌ *Amal bekor qilindi.*', { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, true);
            return;
        }
        
        const updated = updateLocation(session.data.locationId, { name: text }, userId);
        if (updated) {
            await bot.sendMessage(chatId, `✅ *Nomi yangilandi:* ${text}\n📌 Bot versiyasi ${currentVersion} ga yangilandi!`, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, `❌ *Xatolik yuz berdi!*`, { parse_mode: 'Markdown' });
        }
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true);
    }
    else if (session.step === 'location_edit_address') {
        if (text === '/cancel') {
            clearUserSession(userId);
            await bot.sendMessage(chatId, '❌ *Amal bekor qilindi.*', { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, true);
            return;
        }
        
        const updated = updateLocation(session.data.locationId, { address: text }, userId);
        if (updated) {
            await bot.sendMessage(chatId, `✅ *Manzil yangilandi:* ${text}\n📌 Bot versiyasi ${currentVersion} ga yangilandi!`, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, `❌ *Xatolik yuz berdi!*`, { parse_mode: 'Markdown' });
        }
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true);
    }
    else if (session.step === 'location_edit_time') {
        if (text === '/cancel') {
            clearUserSession(userId);
            await bot.sendMessage(chatId, '❌ *Amal bekor qilindi.*', { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, true);
            return;
        }
        
        const updated = updateLocation(session.data.locationId, { workTime: text }, userId);
        if (updated) {
            await bot.sendMessage(chatId, `✅ *Ish vaqti yangilandi:* ${text}\n📌 Bot versiyasi ${currentVersion} ga yangilandi!`, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, `❌ *Xatolik yuz berdi!*`, { parse_mode: 'Markdown' });
        }
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true);
    }
    else if (session.step === 'location_edit_phone') {
        if (text === '/cancel') {
            clearUserSession(userId);
            await bot.sendMessage(chatId, '❌ *Amal bekor qilindi.*', { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, true);
            return;
        }
        
        const updated = updateLocation(session.data.locationId, { phone: text }, userId);
        if (updated) {
            await bot.sendMessage(chatId, `✅ *Telefon yangilandi:* ${text}\n📌 Bot versiyasi ${currentVersion} ga yangilandi!`, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, `❌ *Xatolik yuz berdi!*`, { parse_mode: 'Markdown' });
        }
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true);
    }
    else if (session.step === 'location_edit_coords') {
        if (text === '/cancel') {
            clearUserSession(userId);
            await bot.sendMessage(chatId, '❌ *Amal bekor qilindi.*', { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, true);
            return;
        }
        
        const coords = text.split(',').map(c => parseFloat(c.trim()));
        if (coords.length !== 2 || isNaN(coords[0]) || isNaN(coords[1])) {
            await bot.sendMessage(chatId, '❌ *Noto\'g\'ri format!*\n\nIltimos, koordinatalarni to\'g\'ri formatda kiriting:\nMasalan: "39.680675, 67.047576"', { parse_mode: 'Markdown' });
            return;
        }
        
        const updated = updateLocation(session.data.locationId, { latitude: coords[0], longitude: coords[1] }, userId);
        if (updated) {
            await bot.sendMessage(chatId, `✅ *Koordinatalar yangilandi:* ${coords[0]}, ${coords[1]}\n📌 Bot versiyasi ${currentVersion} ga yangilandi!`, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, `❌ *Xatolik yuz berdi!*`, { parse_mode: 'Markdown' });
        }
        
        clearUserSession(userId);
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

loadVersion();
loadData();
loadAdminSettings();
loadLocations();
loadVersionHistory();

console.log('='.repeat(60));
console.log('🚗 ISUZU DOCTOR BOT ISHGA TUSHDI');
console.log('='.repeat(60));
console.log(`📌 Versiya: ${currentVersion}`);
console.log(`🔗 Bot linki: ${NEW_BOT_LINK}`);
console.log(`📸 Instagram: ${INSTAGRAM_LINK}`);
console.log(`👥 Telegram guruhi: ${TELEGRAM_GROUP_LINK}`);
console.log(`📍 Lokatsiyalar: ${locations.length} ta (${getActiveLocations().length} ta faol)`);
console.log(`👑 Admin telefon: ${ADMIN_PHONE}`);
console.log(`🔐 Super Admin ID: ${SUPER_ADMIN_ID}`);
console.log(`👥 Ruxsat berilgan adminlar: ${adminSettings.allowedEditors.length} ta`);
console.log(`💰 Diagnostika narxi: ${DIAGNOSTIC_PRICE.toLocaleString()} so'm`);
console.log(`👥 Faol foydalanuvchilar: ${users.filter(u => !u.isAdmin && !u.isBlocked).length}`);
console.log(`🚫 Bloklanganlar: ${users.filter(u => !u.isAdmin && u.isBlocked).length}`);
console.log(`🚗 Avtomobillar: ${users.reduce((sum, u) => sum + (u.cars ? u.cars.length : 0), 0)}`);
console.log(`🔧 Diagnostikalar: ${diagnostics.length}`);
console.log(`💾 Volume manzili: ${VOLUME_PATH}`);
console.log(`🔄 Yangilanish rejimi: ${isUpdateMode ? 'Faol' : 'O\'chirilgan'}`);
console.log('='.repeat(60));
console.log('✅ Bot ishlashga tayyor!');
