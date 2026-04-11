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

// -------------------- DATABASE FAYLLARI --------------------
const USERS_FILE = path.join(VOLUME_PATH, 'users.json');
const DIAGNOSTICS_FILE = path.join(VOLUME_PATH, 'diagnostics.json');
const ERRORS_FILE = path.join(VOLUME_PATH, 'errors.json');
const VERSION_FILE = path.join(VOLUME_PATH, 'version.json');
const ADMIN_SETTINGS_FILE = path.join(VOLUME_PATH, 'admin_settings.json');
const VERSION_HISTORY_FILE = path.join(VOLUME_PATH, 'version_history.json');

// -------------------- XAVFSIZLIK SOZLAMALARI --------------------
let adminSettings = {
    allowedEditors: [],
    lastChanges: [],
    securityLog: []
};

// -------------------- GLOBAL O'ZGARUVCHILAR --------------------
let users = [];
let diagnostics = [];
let errors = [];
let versionHistory = [];
let currentVersion = BOT_VERSION;
let isUpdateMode = false;

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

function incrementVersion(version) {
    const parts = version.split('.');
    if (parts.length === 3) {
        parts[2] = parseInt(parts[2]) + 1;
        return parts.join('.');
    }
    return "1.1.1";
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
    
    const newVersion = incrementVersion(currentVersion);
    updateBotVersion(newVersion, `Lokatsiya o'chirildi: ${locationName}`, adminId);
    
    return true;
}

function getActiveLocations() {
    return locations.filter(l => l.isActive);
}

// -------------------- HISOBOT YARATISH --------------------
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
// Qolgan xabar handlerlari oldingi kod bilan bir xil...
// Uzunlik sababli qolgan qismlar avvalgi kod bilan bir xil

// -------------------- BOTNI ISHGA TUSHIRISH --------------------
console.log('='.repeat(60));
console.log('🚗 ISUZU DOCTOR BOT ISHGA TUSHMOQDA');
console.log('='.repeat(60));

// Ma'lumotlarni yuklash
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
