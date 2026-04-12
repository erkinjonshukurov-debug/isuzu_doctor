const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

// -------------------- VERSIYA MA'LUMOTLARI --------------------
const BOT_VERSION = "1.0.0";
const NEW_BOT_LINK = "https://t.me/Isuzu_doctor_bot";
const INSTAGRAM_LINK = "https://www.instagram.com/isuzu.samarkand";
const TELEGRAM_GROUP_LINK = "https://t.me/+piY0W4XrGqFkN2Iy";

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

// -------------------- RAILWAY VOLUME YO'LLARI --------------------
const VOLUME_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const BACKUP_DIR = path.join(VOLUME_PATH, 'backups');
const REPORTS_DIR = path.join(VOLUME_PATH, 'reports');
const VIDEOS_DIR = path.join(VOLUME_PATH, 'videos');

const USERS_FILE = path.join(VOLUME_PATH, 'users.json');
const DIAGNOSTICS_FILE = path.join(VOLUME_PATH, 'diagnostics.json');
const ERRORS_FILE = path.join(VOLUME_PATH, 'errors.json');
const VERSION_FILE = path.join(VOLUME_PATH, 'version.json');
const ADMIN_SETTINGS_FILE = path.join(VOLUME_PATH, 'admin_settings.json');
const VIDEOS_FILE = path.join(VOLUME_PATH, 'videos.json');

// -------------------- VIDEO GALEREYA --------------------
let videoList = [];

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
    if (!fs.existsSync(VIDEOS_DIR)) {
        fs.mkdirSync(VIDEOS_DIR, { recursive: true });
        console.log(`✅ Video papkasi yaratildi: ${VIDEOS_DIR}`);
    }
}

ensureVolumeDir();

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
bot.deleteWebHook().catch(e => console.log('Webhook xatolik:', e.message));

// -------------------- VIDEO FUNKSIYALARI --------------------
function loadVideos() {
    try {
        if (fs.existsSync(VIDEOS_FILE)) {
            videoList = JSON.parse(fs.readFileSync(VIDEOS_FILE, 'utf8'));
        } else {
            videoList = [];
            saveVideos();
        }
        console.log(`✅ Videolar yuklandi: ${videoList.length} ta video`);
    } catch (err) {
        console.error('Videolarni yuklashda xatolik:', err);
        videoList = [];
    }
}

function saveVideos() {
    fs.writeFileSync(VIDEOS_FILE, JSON.stringify(videoList, null, 2));
}

function addVideo(videoFileId, title, description, duration, thumbnail, adminId) {
    const newVideo = {
        id: Date.now(),
        fileId: videoFileId,
        title: title,
        description: description || '',
        duration: duration || 0,
        thumbnail: thumbnail || null,
        views: 0,
        likes: 0,
        likedBy: [],
        uploadedBy: adminId,
        uploadDate: new Date().toISOString(),
        isActive: true
    };
    videoList.unshift(newVideo);
    saveVideos();
    addSecurityLog('VIDEO_UPLOADED', adminId, `Video yuklandi: ${title}`);
    return newVideo;
}

function deleteVideo(videoId, adminId) {
    const index = videoList.findIndex(v => v.id === videoId);
    if (index === -1) return false;
    
    const video = videoList[index];
    videoList.splice(index, 1);
    saveVideos();
    addSecurityLog('VIDEO_DELETED', adminId, `Video o'chirildi: ${video.title}`);
    return true;
}

function updateVideoViews(videoId) {
    const video = videoList.find(v => v.id === videoId);
    if (video) {
        video.views = (video.views || 0) + 1;
        saveVideos();
    }
}

function updateVideoLikes(videoId, userId) {
    const video = videoList.find(v => v.id === videoId);
    if (video) {
        if (!video.likedBy) video.likedBy = [];
        if (!video.likedBy.includes(userId)) {
            video.likedBy.push(userId);
            video.likes = (video.likes || 0) + 1;
            saveVideos();
            return true;
        }
    }
    return false;
}

function getActiveVideos() {
    return videoList.filter(v => v.isActive);
}

// -------------------- ESLATMA MATNI --------------------
const REMINDER_MESSAGE = `
🚗 **Hurmatli mijoz!**

Agar avtomobilingiz doimo soz, ishonchli va yo‘llarda sizni yarim yo‘lda qoldirmasligini istasangiz — unda unga faqat professional va malakali mutaxassislar xizmat ko‘rsatishi muhim.

🛠️ **Sifatli xizmat** — bu nafaqat qulaylik, balki sizning xavfsizligingiz kafolatidir.

✅ Shuning uchun avtomobilingizni haqiqiy professionallarga ishonib topshiring!
`;

// -------------------- QURILMA TURINI ANIQLASH --------------------
let userDevices = new Map();

function getDeviceType(userAgent) {
    if (!userAgent) return 'web';
    const ua = userAgent.toLowerCase();
    if (ua.includes('android')) return 'android';
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios';
    return 'web';
}

function getUserDevice(userId) {
    return userDevices.get(userId) || 'web';
}

function setUserDevice(userId, deviceType) {
    userDevices.set(userId, deviceType);
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
    if (fs.existsSync(VIDEOS_FILE)) {
        fs.copyFileSync(VIDEOS_FILE, path.join(BACKUP_DIR, `videos_backup_${timestamp}.json`));
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
    
    const videoBackupName = backupName.replace('users_backup_', 'videos_backup_');
    const videoBackupPath = path.join(BACKUP_DIR, videoBackupName);
    if (fs.existsSync(videoBackupPath)) {
        const videoData = JSON.parse(fs.readFileSync(videoBackupPath, 'utf8'));
        fs.writeFileSync(VIDEOS_FILE, JSON.stringify(videoData, null, 2));
        videoList = videoData;
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
        totalVideos: videoList.length,
        totalVideoViews: videoList.reduce((sum, v) => sum + (v.views || 0), 0)
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

// ======================== VIDEO GALEREYA FUNKSIYALARI ========================
async function showVideoGallery(chatId, page = 0) {
    const activeVideos = getActiveVideos();
    const itemsPerPage = 5;
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const pageVideos = activeVideos.slice(start, end);
    
    if (activeVideos.length === 0) {
        await bot.sendMessage(chatId, '📹 *VIDEO GALEREYA*\n\nHozircha videolar mavjud emas.\nTez orada yangi videolar qo\'shiladi!', {
            parse_mode: 'Markdown'
        });
        return;
    }
    
    let msg = '📹 *VIDEO GALEREYA*\n━━━━━━━━━━━━━━━━━━\n\n';
    msg += `📊 Jami videolar: ${activeVideos.length} ta\n`;
    msg += `👁️ Umumiy ko\'rishlar: ${activeVideos.reduce((sum, v) => sum + (v.views || 0), 0)} ta\n`;
    msg += `━━━━━━━━━━━━━━━━━━\n\n`;
    
    const keyboard = [];
    
    for (let i = 0; i < pageVideos.length; i++) {
        const video = pageVideos[i];
        const num = start + i + 1;
        msg += `${num}. *${video.title}*\n`;
        msg += `   👁️ ${video.views || 0} | 👍 ${video.likes || 0}\n`;
        if (video.description) {
            msg += `   📝 ${video.description.substring(0, 50)}${video.description.length > 50 ? '...' : ''}\n`;
        }
        msg += `   📅 ${new Date(video.uploadDate).toLocaleDateString()}\n`;
        msg += `━━━━━━━━━━━━━━━━━━\n`;
        keyboard.push([{ text: `▶️ ${num}. ${video.title.substring(0, 30)}`, callback_data: `watch_video_${video.id}` }]);
    }
    
    const navButtons = [];
    if (page > 0) navButtons.push({ text: '◀️ Oldingi', callback_data: `video_page_${page - 1}` });
    if (end < activeVideos.length) navButtons.push({ text: 'Keyingi ▶️', callback_data: `video_page_${page + 1}` });
    if (navButtons.length > 0) keyboard.push(navButtons);
    
    keyboard.push([{ text: '🔙 Asosiy menyu', callback_data: 'back_to_main' }]);
    
    await bot.sendMessage(chatId, msg, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
    });
}

// ======================== KEYBOARDS ========================

// ANDROID UCHUN INLINE KEYBOARD
function getUserInlineKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📊 Mening sahifam', callback_data: 'user_profile' }],
                [{ text: '🚗 Mening avtomobillarim', callback_data: 'user_my_cars' }],
                [{ text: '🎁 Mening bonuslarim', callback_data: 'user_my_bonus' }],
                [{ text: '➕ Yangi avtomobil qo\'shish', callback_data: 'user_add_car' }],
                [{ text: '📋 Diagnostika tarixim', callback_data: 'user_history' }],
                [{ text: '📹 Video galereya', callback_data: 'user_video_gallery' }],
                [{ text: '📸 Bizning Instagram', callback_data: 'user_instagram' }],
                [{ text: '👥 Telegram guruhimiz', callback_data: 'user_telegram_group' }],
                [{ text: 'ℹ️ Ma\'lumot', callback_data: 'user_info' }]
            ]
        }
    };
}

function getAdminInlineKeyboard() {
    const keyboard = [
        [{ text: '📊 Statistika', callback_data: 'admin_statistics' }],
        [{ text: '👥 Foydalanuvchilar', callback_data: 'admin_users' }],
        [{ text: '🔧 Diagnostika qo\'shish', callback_data: 'admin_add_diagnostic' }],
        [{ text: '🎁 Bonusga yaqinlar', callback_data: 'admin_near_bonus' }],
        [{ text: '⚠️ Xatoliklar', callback_data: 'admin_errors' }],
        [{ text: '📋 Diagnostikalar tarixi', callback_data: 'admin_diagnostics_history' }],
        [{ text: '📅 Bugungi diagnostikalar', callback_data: 'admin_today_diagnostics' }],
        [{ text: '📄 Hisobot olish', callback_data: 'admin_get_report' }],
        [{ text: '📹 Video galereya', callback_data: 'admin_video_gallery' }],
        [{ text: '📤 Video yuklash', callback_data: 'admin_upload_video' }],
        [{ text: '💾 Backup yaratish', callback_data: 'admin_create_backup' }],
        [{ text: '🔄 Database tiklash', callback_data: 'admin_restore_backup' }],
        [{ text: '🚫 Foydalanuvchini boshqarish', callback_data: 'admin_manage_users' }],
        [{ text: '🔐 Xavfsizlik', callback_data: 'admin_security' }]
    ];
    
    if (!isUpdateMode) {
        keyboard.push([{ text: '🚀 Yangi versiyaga o\'tish', callback_data: 'admin_update_mode' }]);
    } else {
        keyboard.push([{ text: '✅ Yangilanish rejimini o\'chirish', callback_data: 'admin_disable_update' }]);
    }
    
    return { reply_markup: { inline_keyboard: keyboard } };
}

// IPHONE VA WEB UCHUN REPLY KEYBOARD
function getUserReplyKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                ['📊 Mening sahifam', '🚗 Mening avtomobillarim'],
                ['🎁 Mening bonuslarim', '➕ Yangi avtomobil qo\'shish'],
                ['📋 Diagnostika tarixim', '📹 Video galereya'],
                ['📸 Bizning Instagram', '👥 Telegram guruhimiz'],
                ['ℹ️ Ma\'lumot', '❌ Asosiy menyu']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };
}

function getAdminReplyKeyboard() {
    const keyboard = [
        ['📊 Statistika', '👥 Foydalanuvchilar'],
        ['🔧 Diagnostika qo\'shish', '🎁 Bonusga yaqinlar'],
        ['⚠️ Xatoliklar', '📋 Diagnostikalar tarixi'],
        ['📅 Bugungi diagnostikalar', '📄 Hisobot olish'],
        ['📹 Video galereya', '📤 Video yuklash'],
        ['💾 Backup yaratish', '🔄 Database tiklash'],
        ['🚫 Foydalanuvchini boshqarish', '🔐 Xavfsizlik']
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
            one_time_keyboard: false
        }
    };
}

function getPhoneKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '📱 Telefon raqamini yuborish', request_contact: true }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };
}

function removeKeyboard() {
    return {
        reply_markup: {
            remove_keyboard: true
        }
    };
}

// Asosiy menyuni yuborish
async function sendMainMenu(chatId, isAdminUser = false, deviceType = 'web') {
    try {
        await sendReminder(chatId);
        
        if (isAdminUser) {
            if (deviceType === 'android') {
                await bot.sendMessage(chatId, '👑 *Admin paneliga xush kelibsiz!*\n\nQuyidagi tugmalardan foydalaning:', {
                    parse_mode: 'Markdown',
                    ...getAdminInlineKeyboard()
                });
            } else {
                await bot.sendMessage(chatId, '👑 *Admin paneliga xush kelibsiz!*\n\nQuyidagi tugmalardan foydalaning:', {
                    parse_mode: 'Markdown',
                    ...getAdminReplyKeyboard()
                });
            }
        } else {
            if (deviceType === 'android') {
                await bot.sendMessage(chatId, `🏠 *Asosiy menyu* (Versiya ${BOT_VERSION})\n\n🚗 ISUZU DOCTOR botiga xush kelibsiz!\n\nQuyidagi tugmalardan birini tanlang:`, {
                    parse_mode: 'Markdown',
                    ...getUserInlineKeyboard()
                });
            } else {
                await bot.sendMessage(chatId, `🏠 *Asosiy menyu* (Versiya ${BOT_VERSION})\n\n🚗 ISUZU DOCTOR botiga xush kelibsiz!\n\nQuyidagi tugmalardan birini tanlang:`, {
                    parse_mode: 'Markdown',
                    ...getUserReplyKeyboard()
                });
            }
        }
    } catch (error) {
        console.error('Menu yuborishda xatolik:', error);
    }
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

// -------------------- /start KOMANDASI --------------------
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name || '';
    const lastName = msg.from.last_name || '';
    const username = msg.from.username || '';
    
    const userAgent = msg.from?.userAgent || '';
    const deviceType = getDeviceType(userAgent);
    setUserDevice(userId, deviceType);
    
    clearUserSession(userId);
    const existingUser = getUserByUserId(userId);
    
    if (existingUser && existingUser.isBlocked) {
        await bot.sendMessage(chatId, '🚫 *Siz botdan bloklangansiz!*\n\nIltimos, administrator bilan bog\'laning.\n📞 Aloqa: ' + ADMIN_PHONE, { 
            parse_mode: 'Markdown',
            ...removeKeyboard()
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
            const welcomeText = `👋 *Xush kelibsiz, ${existingUser.fullName || firstName || 'hurmatli mijoz'}!*\n\n📞 Telefon: ${existingUser.phone}\n🚗 Avtomobillar: ${carsCount} ta\n🎁 Umumiy bonus: ${existingUser.totalBonusCount || 0}\n🎉 Bepul: ${existingUser.totalFreeDiagnostics || 0} ta\n📊 Jami diagnostika: ${existingUser.totalDiagnosticsAll || 0} ta\n📌 Bot versiyasi: ${BOT_VERSION}`;
            await bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, existingUser.isAdmin, deviceType);
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
            await sendMainMenu(chatId, true, getUserDevice(userId));
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
            ...removeKeyboard()
        });
    } else {
        session.step = 'first_car_number';
        session.data.isExistingUser = false;
        await bot.sendMessage(chatId, `✅ Telefon raqam qabul qilindi: ${phoneNumber}\n\n🚗 *Birinchi avtomobil raqamini kiriting:*\n\nMasalan: 01A777AA`, {
            parse_mode: 'Markdown',
            ...removeKeyboard()
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
    await bot.sendMessage(chatId, `📊 *MENGING SAHIFAM*\n\n👤 *Ism:* ${user.fullName || 'Kiritilmagan'}\n📞 *Telefon:* ${user.phone}\n🚗 *Avtomobillar:* ${user.cars.length}/${MAX_CARS_PER_USER}\n\n${carsList}\n\n🎁 *Umumiy bonuslar:* ${user.totalBonusCount || 0}\n🎉 *Bepul diagnostika:* ${user.totalFreeDiagnostics || 0} ta\n📊 *Jami diagnostika:* ${user.totalDiagnosticsAll || 0} ta\n📌 *Versiya:* ${BOT_VERSION}`, { parse_mode: 'Markdown' });
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
    await bot.sendMessage(chatId, `ℹ️ *ISUZU DOCTOR BOT*\n\n🚗 Avtomobil diagnostikasi\n🎁 Har 5 diagnostikada 1 ta BEPUL\n📱 Bitta telefon bilan ${MAX_CARS_PER_USER} tagacha avtomobil\n📞 Aloqa: ${ADMIN_PHONE}\n📌 Bot versiyasi: ${BOT_VERSION}\n🔗 Bot linki: ${NEW_BOT_LINK}\n📸 Instagram: ${INSTAGRAM_LINK}\n👥 Telegram guruhimiz: ${TELEGRAM_GROUP_LINK}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/close/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    clearUserSession(userId);
    await sendMainMenu(chatId, isAdmin(userId), getUserDevice(userId));
});

bot.onText(/\/statistika/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isAdmin(userId)) return;
    
    const stats = getStatistics();
    await bot.sendMessage(chatId, `📊 *STATISTIKA*\n\n👥 Faol foydalanuvchilar: ${stats.totalUsers}\n🚫 Bloklanganlar: ${stats.blockedUsers}\n🚗 Avtomobillar: ${stats.totalCars}\n🔧 Jami: ${stats.totalDiagnostics}\n💰 To'lovli: ${stats.paidDiagnostics}\n🎉 Bepul: ${stats.freeDiagnostics}\n💵 Daromad: ${stats.totalIncome.toLocaleString()} so'm\n⚠️ Xatoliklar: ${stats.totalErrors}\n📹 Videolar: ${stats.totalVideos} ta\n👁️ Video ko\'rishlar: ${stats.totalVideoViews} ta\n📌 Versiya: ${stats.currentVersion}\n🔄 Yangilanish rejimi: ${stats.isUpdateMode ? 'Faol' : 'O\'chirilgan'}`, { parse_mode: 'Markdown' });
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
    await bot.sendMessage(chatId, '🔧 *Diagnostika qo\'shish*\n\n🚗 Avtomobil raqamini kiriting:', { parse_mode: 'Markdown', ...removeKeyboard() });
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
    
    // Video yuklash session'lari
    if (session.step === 'admin_waiting_video') {
        if (msg.video) {
            session.data.videoFileId = msg.video.file_id;
            session.step = 'admin_waiting_video_title';
            await bot.sendMessage(chatId, '✅ *Video qabul qilindi!*\n\n📝 Endi video nomini kiriting:', { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, '❌ *Iltimos, video fayl yuboring!*', { parse_mode: 'Markdown' });
        }
        return;
    }
    
    if (session.step === 'admin_waiting_video_title') {
        session.data.title = text;
        session.step = 'admin_waiting_video_description';
        await bot.sendMessage(chatId, `✅ *Nom qabul qilindi:* ${text}\n\n📝 Endi video tavsifini kiriting (ixtiyoriy):\n\n"❌ Bekor qilish" - bekor qilish uchun`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (session.step === 'admin_waiting_video_description') {
        session.data.description = text === '❌ Bekor qilish' ? '' : text;
        
        const newVideo = addVideo(
            session.data.videoFileId,
            session.data.title,
            session.data.description,
            0,
            null,
            userId
        );
        
        await bot.sendMessage(chatId, `✅ *Video muvaffaqiyatli yuklandi!*\n\n📹 *Nomi:* ${newVideo.title}\n🆔 ID: ${newVideo.id}\n📅 Sana: ${new Date().toLocaleString()}`, { parse_mode: 'Markdown' });
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true, getUserDevice(userId));
        return;
    }
    
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
            await bot.sendMessage(chatId, `✅ *Siz muvaffaqiyatli ro'yxatdan o'tdingiz, ${userFullName || 'hurmatli mijoz'}!*\n\n👤 Ism: ${userFullName || 'Kiritilmagan'}\n🚗 Avtomobil: ${carNumber}\n📞 Telefon: ${session.data.phone}\n\n🎁 *Bonus tizimi:* Har 5 diagnostikada 1 ta BEPUL!\n📹 *Video galereya:* Ishlarimizni videoda kuzating!\n📸 *Instagram:* ${INSTAGRAM_LINK}\n👥 *Telegram guruhimiz:* ${TELEGRAM_GROUP_LINK}\n\n➕ "➕ Yangi avtomobil qo'shish" tugmasi orqali yana avtomobil qo'shishingiz mumkin.\n📌 Bot versiyasi: ${BOT_VERSION}`, { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, false, getUserDevice(userId));
            
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
        await sendMainMenu(chatId, false, getUserDevice(userId));
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
            await sendMainMenu(chatId, true, getUserDevice(userId));
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
        await sendMainMenu(chatId, true, getUserDevice(userId));
        return;
    }
    
    // IPHONE VA WEB UCHUN REPLY KEYBOARD TUGMALARI
    const deviceType = getUserDevice(userId);
    
    if (deviceType !== 'android') {
        const user = getUserByUserId(userId);
        if (!user && text !== '❌ Asosiy menyu') {
            await bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan! /start bosing.');
            return;
        }
        
        if (user && user.isBlocked) {
            await bot.sendMessage(chatId, '🚫 *Siz botdan bloklangansiz!*\n\nIltimos, administrator bilan bog\'laning.\n📞 Aloqa: ' + ADMIN_PHONE, { 
                parse_mode: 'Markdown',
                ...removeKeyboard()
            });
            return;
        }
        
        if (text === '📊 Mening sahifam') {
            const carsList = user.cars.map(c => `🚗 ${c.carNumber} (${c.totalDiagnostics} ta diagnostika)`).join('\n');
            await sendReminder(chatId);
            await bot.sendMessage(chatId, `📊 *MENGING SAHIFAM*\n\n👤 *Ism:* ${user.fullName || 'Kiritilmagan'}\n📞 *Telefon:* ${user.phone}\n🚗 *Avtomobillar:* ${user.cars.length}/${MAX_CARS_PER_USER}\n\n${carsList}\n\n🎁 *Umumiy bonuslar:* ${user.totalBonusCount || 0}\n🎉 *Bepul diagnostika:* ${user.totalFreeDiagnostics || 0} ta\n📊 *Jami diagnostika:* ${user.totalDiagnosticsAll || 0} ta\n📌 *Versiya:* ${BOT_VERSION}`, { parse_mode: 'Markdown' });
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
                ...removeKeyboard()
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
        else if (text === '📹 Video galereya') {
            await showVideoGallery(chatId);
        }
        else if (text === '📸 Bizning Instagram') {
            await bot.sendMessage(chatId, `📸 *BIZNING INSTAGRAM*\n\n🔗 ${INSTAGRAM_LINK}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '📸 Instagramga o\'tish', url: INSTAGRAM_LINK }]]
                }
            });
        }
        else if (text === '👥 Telegram guruhimiz') {
            await bot.sendMessage(chatId, `👥 *TELEGRAM GURUHIMIZ*\n\n🔗 ${TELEGRAM_GROUP_LINK}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '👥 Guruhga o\'tish', url: TELEGRAM_GROUP_LINK }]]
                }
            });
        }
        else if (text === 'ℹ️ Ma\'lumot') {
            await sendReminder(chatId);
            await bot.sendMessage(chatId, `ℹ️ *ISUZU DOCTOR BOT*\n\n🚗 Avtomobil diagnostikasi\n🎁 Har 5 diagnostikada 1 ta BEPUL\n📱 Bitta telefon bilan ${MAX_CARS_PER_USER} tagacha avtomobil\n📞 Aloqa: ${ADMIN_PHONE}\n📌 Bot versiyasi: ${BOT_VERSION}\n🔗 Bot linki: ${NEW_BOT_LINK}\n📸 Instagram: ${INSTAGRAM_LINK}\n👥 Telegram guruhimiz: ${TELEGRAM_GROUP_LINK}`, { parse_mode: 'Markdown' });
        }
        else if (text === '❌ Asosiy menyu') {
            clearUserSession(userId);
            await sendMainMenu(chatId, isAdmin(userId), deviceType);
        }
        else if (!session.step) {
            await bot.sendMessage(chatId, `❌ *Tushunarsiz buyruq!* Menyudan foydalaning.\n\n/start - Bosh sahifa\n/profile - Mening sahifam\n/my_cars - Mening avtomobillarim\n/my_bonus - Mening bonuslarim\n/history - Diagnostika tarixi\n/info - Ma'lumot\n📌 Versiya: ${BOT_VERSION}`, { parse_mode: 'Markdown' });
        }
    }
});

// -------------------- CALLBACK QUERY HANDLER --------------------
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const userId = query.from.id;
    const messageId = query.message.message_id;
    
    await bot.answerCallbackQuery(query.id);
    
    const user = getUserByUserId(userId);
    if (!user) {
        await bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan! /start bosing.');
        return;
    }
    
    // Video galereya callback'lari
    if (data === 'user_video_gallery') {
        await showVideoGallery(chatId);
    }
    else if (data === 'admin_video_gallery') {
        if (!isAdmin(userId)) return;
        await showVideoGallery(chatId);
    }
    else if (data === 'admin_upload_video') {
        if (!isAdmin(userId)) return;
        const session = getUserSession(userId);
        session.step = 'admin_waiting_video';
        session.data = {};
        await bot.sendMessage(chatId, '📤 *VIDEO YUKLASH*\n\nIltimos, video faylni yuboring:\n\n📹 MP4 formatida, 50MB gacha', { parse_mode: 'Markdown' });
    }
    else if (data.startsWith('watch_video_')) {
        const videoId = parseInt(data.split('_')[2]);
        const video = videoList.find(v => v.id === videoId);
        
        if (!video || !video.isActive) {
            await bot.sendMessage(chatId, '❌ *Video topilmadi yoki o\'chirilgan!*', { parse_mode: 'Markdown' });
            return;
        }
        
        updateVideoViews(videoId);
        
        const videoText = `📹 *${video.title}*\n\n📝 ${video.description || 'Tavsif mavjud emas'}\n\n👁️ Ko\'rishlar: ${video.views || 0}\n👍 Layklar: ${video.likes || 0}\n📅 Yuklangan: ${new Date(video.uploadDate).toLocaleDateString()}`;
        
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '👍 Like', callback_data: `like_video_${videoId}` }],
                    [{ text: '📹 Boshqa videolar', callback_data: 'user_video_gallery' }],
                    [{ text: '🔙 Asosiy menyu', callback_data: 'back_to_main' }]
                ]
            }
        };
        
        try {
            await bot.sendVideo(chatId, video.fileId, {
                caption: videoText,
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (err) {
            await bot.sendMessage(chatId, `❌ *Video yuborishda xatolik!*\n\nVideo ID: ${videoId}`, { parse_mode: 'Markdown' });
        }
    }
    else if (data.startsWith('like_video_')) {
        const videoId = parseInt(data.split('_')[2]);
        const result = updateVideoLikes(videoId, userId);
        
        if (result) {
            await bot.answerCallbackQuery(query.id, { text: '👍 Video layklandi!', show_alert: false });
        } else {
            await bot.answerCallbackQuery(query.id, { text: '❌ Siz allaqachon layk bosgansiz!', show_alert: true });
        }
    }
    else if (data.startsWith('video_page_')) {
        const page = parseInt(data.split('_')[2]);
        await showVideoGallery(chatId, page);
    }
    else if (data === 'back_to_main') {
        await sendMainMenu(chatId, isAdmin(userId), getUserDevice(userId));
    }
    
    // FOYDALANUVCHI CALLBACK'LARI
    else if (data === 'user_profile') {
        const carsList = user.cars.map(c => `🚗 ${c.carNumber} (${c.totalDiagnostics} ta diagnostika)`).join('\n');
        await sendReminder(chatId);
        await bot.sendMessage(chatId, `📊 *MENGING SAHIFAM*\n\n👤 *Ism:* ${user.fullName || 'Kiritilmagan'}\n📞 *Telefon:* ${user.phone}\n🚗 *Avtomobillar:* ${user.cars.length}/${MAX_CARS_PER_USER}\n\n${carsList}\n\n🎁 *Umumiy bonuslar:* ${user.totalBonusCount || 0}\n🎉 *Bepul diagnostika:* ${user.totalFreeDiagnostics || 0} ta\n📊 *Jami diagnostika:* ${user.totalDiagnosticsAll || 0} ta\n📌 *Versiya:* ${BOT_VERSION}`, { parse_mode: 'Markdown' });
    }
    else if (data === 'user_my_cars') {
        if (user.cars.length === 0) {
            await bot.sendMessage(chatId, '📭 Sizda hali avtomobillar mavjud emas!', { parse_mode: 'Markdown' });
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
    else if (data === 'user_my_bonus') {
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
    else if (data === 'user_add_car') {
        if (user.cars.length >= MAX_CARS_PER_USER) {
            await bot.sendMessage(chatId, `❌ Siz maksimum ${MAX_CARS_PER_USER} ta avtomobil qo'sha olasiz!`, { parse_mode: 'Markdown' });
            return;
        }
        
        const session = getUserSession(userId);
        session.step = 'add_new_car';
        session.data.phone = user.phone;
        session.data.isExistingUser = true;
        session.data.firstName = user.firstName;
        session.data.lastName = user.lastName;
        session.data.username = user.username;
        
        await bot.sendMessage(chatId, `🚗 *Yangi avtomobil raqamini kiriting:*\n\nMasalan: 01A777AA\n\n⚠️ Siz maksimum ${MAX_CARS_PER_USER} tagacha avtomobil qo'sha olasiz.\n📊 Hozirgi avtomobillar soni: ${user.cars.length}/${MAX_CARS_PER_USER}`, {
            parse_mode: 'Markdown',
            ...removeKeyboard()
        });
    }
    else if (data === 'user_history') {
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
    else if (data === 'user_instagram') {
        await bot.sendMessage(chatId, `📸 *BIZNING INSTAGRAM*\n\n🔗 ${INSTAGRAM_LINK}`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '📸 Instagramga o\'tish', url: INSTAGRAM_LINK }]]
            }
        });
    }
    else if (data === 'user_telegram_group') {
        await bot.sendMessage(chatId, `👥 *TELEGRAM GURUHIMIZ*\n\n🔗 ${TELEGRAM_GROUP_LINK}`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '👥 Guruhga o\'tish', url: TELEGRAM_GROUP_LINK }]]
            }
        });
    }
    else if (data === 'user_info') {
        await sendReminder(chatId);
        await bot.sendMessage(chatId, `ℹ️ *ISUZU DOCTOR BOT*\n\n🚗 Avtomobil diagnostikasi\n🎁 Har 5 diagnostikada 1 ta BEPUL\n📱 Bitta telefon bilan ${MAX_CARS_PER_USER} tagacha avtomobil\n📞 Aloqa: ${ADMIN_PHONE}\n📌 Bot versiyasi: ${BOT_VERSION}\n🔗 Bot linki: ${NEW_BOT_LINK}\n📸 Instagram: ${INSTAGRAM_LINK}\n👥 Telegram guruhimiz: ${TELEGRAM_GROUP_LINK}`, { parse_mode: 'Markdown' });
    }
    
    // ADMIN CALLBACK'LARI (qisqacha)
    else if (data === 'admin_statistics') {
        if (!isAdmin(userId)) return;
        const stats = getStatistics();
        await bot.sendMessage(chatId, `📊 *STATISTIKA*\n\n👥 Faol foydalanuvchilar: ${stats.totalUsers}\n🚫 Bloklanganlar: ${stats.blockedUsers}\n🚗 Avtomobillar: ${stats.totalCars}\n🔧 Jami: ${stats.totalDiagnostics}\n💰 To'lovli: ${stats.paidDiagnostics}\n🎉 Bepul: ${stats.freeDiagnostics}\n💵 Daromad: ${stats.totalIncome.toLocaleString()} so'm\n⚠️ Xatoliklar: ${stats.totalErrors}\n📹 Videolar: ${stats.totalVideos} ta\n👁️ Video ko\'rishlar: ${stats.totalVideoViews} ta\n📌 Versiya: ${stats.currentVersion}\n🔄 Yangilanish rejimi: ${stats.isUpdateMode ? 'Faol' : 'O\'chirilgan'}`, { parse_mode: 'Markdown' });
    }
    else if (data === 'admin_users') {
        if (!isAdmin(userId)) return;
        const usersList = getAllUsersWithDetails();
        if (usersList.length === 0) {
            await bot.sendMessage(chatId, '📭 Hech qanday foydalanuvchi yo\'q', { parse_mode: 'Markdown' });
            return;
        }
        let msg = '👥 *FOYDALANUVCHILAR*\n━━━━━━━━━━━━━━━━━━\n\n';
        usersList.slice(0, 15).forEach((u, index) => {
            const status = u.isBlocked ? '🔴' : '🟢';
            msg += `${status} *${index + 1}. ${u.fullName || 'Ism kiritilmagan'}*\n`;
            msg += `📞 ${u.phone}\n`;
            msg += `🚗 ${u.cars.map(c => c.carNumber).join(', ')}\n`;
            msg += `📊 ${u.totalDiagnostics} ta diagnostika\n`;
            msg += `━━━━━━━━━━━━━━━━━━\n`;
        });
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (data === 'admin_add_diagnostic') {
        if (!isAdmin(userId)) return;
        const session = getUserSession(userId);
        session.step = 'admin_add_diagnostic';
        await bot.sendMessage(chatId, '🔧 *Diagnostika qo\'shish*\n\n🚗 Avtomobil raqamini kiriting:', { parse_mode: 'Markdown', ...removeKeyboard() });
    }
    else if (data === 'admin_near_bonus') {
        if (!isAdmin(userId)) return;
        const nearBonus = getNearBonusCars();
        if (nearBonus.length === 0) {
            await bot.sendMessage(chatId, '📭 Bonusga yaqin avtomobillar yo\'q', { parse_mode: 'Markdown' });
            return;
        }
        let msg = '🎁 *BONUSGA YAQIN AVTOMOBILLAR*\n━━━━━━━━━━━━━━━━━━\n\n';
        nearBonus.forEach(c => {
            msg += `👤 ${c.fullName}\n🚗 ${c.carNumber}\n🎁 ${c.bonusCount}/5\n📌 ${c.remaining} ta qoldi\n━━━━━━━━━━━━━━━━━━\n`;
        });
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (data === 'admin_errors') {
        if (!isAdmin(userId)) return;
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
    else if (data === 'admin_diagnostics_history') {
        if (!isAdmin(userId)) return;
        const diags = getAllDiagnostics(20);
        if (diags.length === 0) {
            await bot.sendMessage(chatId, '📭 Diagnostikalar yo\'q', { parse_mode: 'Markdown' });
            return;
        }
        for (const d of diags.slice(0, 10)) {
            await bot.sendMessage(chatId, `📅 ${new Date(d.date).toLocaleDateString()}\n🚗 ${d.carNumber}\n📝 ${d.workDescription}\n💰 ${d.price > 0 ? d.price.toLocaleString() + ' so\'m' : 'BEPUL'}`, { parse_mode: 'Markdown' });
        }
    }
    else if (data === 'admin_today_diagnostics') {
        if (!isAdmin(userId)) return;
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
    else if (data === 'admin_get_report') {
        if (!isAdmin(userId)) return;
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
    else if (data === 'admin_create_backup') {
        if (!isAdmin(userId)) return;
        await bot.sendMessage(chatId, '💾 *Backup yaratilmoqda...*', { parse_mode: 'Markdown' });
        createBackup();
        await bot.sendMessage(chatId, `✅ *Backup yaratildi!*`, { parse_mode: 'Markdown' });
    }
    else if (data === 'admin_restore_backup') {
        if (!isAdmin(userId)) return;
        const backups = listBackups();
        if (backups.length === 0) {
            await bot.sendMessage(chatId, '❌ *Backup topilmadi!*', { parse_mode: 'Markdown' });
        } else {
            let msg = '🔄 *DATABASE TIKLASH*\n\nQuyidagi backup\'lardan birini tanlang:\n\n';
            const keyboard = backups.slice(0, 10).map(b => [{ text: `📁 ${b.name}`, callback_data: `restore_${b.name}` }]);
            keyboard.push([{ text: '❌ Bekor qilish', callback_data: 'restore_cancel' }]);
            await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
        }
    }
    else if (data === 'admin_manage_users') {
        if (!isAdmin(userId)) return;
        const activeUsers = getActiveUsers();
        const blockedUsers = getBlockedUsers();
        const allUsers = [...activeUsers, ...blockedUsers];
        
        if (allUsers.length === 0) {
            await bot.sendMessage(chatId, '📭 Hech qanday foydalanuvchi yo\'q', { parse_mode: 'Markdown' });
            return;
        }
        
        let msg = '👥 *FOYDALANUVCHILARNI BOSHQARISH*\n\n🟢 Faol: ' + activeUsers.length + '\n🔴 Bloklangan: ' + blockedUsers.length + '\n\n📌 Foydalanuvchini tanlang:\n\n';
        
        const keyboard = [];
        allUsers.slice(0, 10).forEach(user => {
            keyboard.push([{ text: `${user.isBlocked ? '🔴' : '🟢'} ${user.fullName || user.phone}`, callback_data: `manage_user_${user.userId}` }]);
        });
        keyboard.push([{ text: '❌ Bekor qilish', callback_data: 'user_manage_cancel' }]);
        
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
    }
    else if (data === 'admin_security') {
        if (!isAdmin(userId)) return;
        if (!isSuperAdmin(userId) && !canEditCode(userId)) {
            await bot.sendMessage(chatId, '❌ *Sizda bu amalni bajarish uchun ruxsat yo\'q!*', { parse_mode: 'Markdown' });
            return;
        }
        
        const keyboard = [
            [{ text: '👥 Ruxsat berilgan adminlar', callback_data: 'security_allowed_admins' }],
            [{ text: '➕ Admin qo\'shish', callback_data: 'security_add_admin' }],
            [{ text: '➖ Admin o\'chirish', callback_data: 'security_remove_admin' }],
            [{ text: '📜 Xavfsizlik jurnali', callback_data: 'security_log' }],
            [{ text: '🔙 Orqaga', callback_data: 'security_back' }]
        ];
        
        await bot.sendMessage(chatId, '🔐 *XAVFSIZLIK SOZLAMALARI*\n\nQuyidagi amallardan birini tanlang:', {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    }
    else if (data === 'admin_update_mode') {
        if (!isAdmin(userId)) return;
        await bot.sendMessage(chatId, `⚠️ *YANGI VERSIYAGA O'TISH*\n\nDavom etasizmi?`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Ha', callback_data: 'confirm_update' }],
                    [{ text: '❌ Yo\'q', callback_data: 'cancel_update' }]
                ]
            }
        });
    }
    else if (data === 'admin_disable_update') {
        if (!isAdmin(userId)) return;
        disableUpdateMode();
        await bot.sendMessage(chatId, `✅ *Yangilanish rejimi o'chirildi!*`, { parse_mode: 'Markdown' });
        await sendMainMenu(chatId, true, getUserDevice(userId));
    }
    
    // SECURITY CALLBACK'LARI
    else if (data === 'security_allowed_admins') {
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
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (data === 'security_add_admin') {
        await bot.sendMessage(chatId, '➕ *ADMIN QO\'SHISH*\n\nRuxsat bermoqchi bo\'lgan adminning Telegram ID sini yuboring.\n\n⚠️ Faqat Super Admin bu amalni bajarishi mumkin!\n\n❌ Bekor qilish uchun /cancel yozing.', { parse_mode: 'Markdown' });
        const session = getUserSession(userId);
        session.step = 'add_admin_permission';
    }
    else if (data === 'security_remove_admin') {
        if (adminSettings.allowedEditors.length === 0) {
            await bot.sendMessage(chatId, '❌ *Hech qanday admin ruxsatga ega emas!*', { parse_mode: 'Markdown' });
            return;
        }
        let msg = '➖ *ADMIN O\'CHIRISH*\n\nRuxsatni olib qo\'yish uchun adminni tanlang:\n\n';
        const keyboard = [];
        adminSettings.allowedEditors.forEach(adminId => {
            const admin = getUserByUserId(adminId);
            const name = admin ? admin.fullName || admin.phone : `ID: ${adminId}`;
            keyboard.push([{ text: `❌ ${name}`, callback_data: `remove_admin_${adminId}` }]);
        });
        keyboard.push([{ text: '🔙 Orqaga', callback_data: 'security_back' }]);
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
    }
    else if (data === 'security_log') {
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
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
    else if (data === 'security_back') {
        await sendMainMenu(chatId, true, getUserDevice(userId));
    }
    else if (data.startsWith('remove_admin_')) {
        const targetAdminId = parseInt(data.split('_')[2]);
        const result = revokeEditPermission(userId, targetAdminId);
        await bot.sendMessage(chatId, result.message, { parse_mode: 'Markdown' });
        await sendMainMenu(chatId, true, getUserDevice(userId));
    }
    else if (data.startsWith('restore_')) {
        const backupName = data.replace('restore_', '');
        await bot.sendMessage(chatId, '🔄 *Database tiklanmoqda...*', { parse_mode: 'Markdown' });
        if (restoreBackup(backupName)) {
            loadData();
            loadVideos();
            await bot.sendMessage(chatId, `✅ *Database muvaffaqiyatli tiklandi!*`, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, '❌ *Database tiklashda xatolik!*', { parse_mode: 'Markdown' });
        }
        await sendMainMenu(chatId, true, getUserDevice(userId));
    }
    else if (data === 'restore_cancel') {
        await bot.sendMessage(chatId, '❌ *Database tiklash bekor qilindi.*', { parse_mode: 'Markdown' });
        await sendMainMenu(chatId, true, getUserDevice(userId));
    }
    else if (data === 'confirm_update') {
        if (!isAdmin(userId)) return;
        const result = await notifyAllUsersAboutUpdate();
        enableUpdateMode();
        await bot.sendMessage(chatId, `✅ *YANGILANISH TUGALLANDI!*\n\n✅ Yuborildi: ${result.success} ta\n❌ Yuborilmadi: ${result.fail} ta`, { parse_mode: 'Markdown' });
        await sendMainMenu(chatId, true, getUserDevice(userId));
    }
    else if (data === 'cancel_update') {
        await bot.sendMessage(chatId, '❌ *Yangilanish bekor qilindi.*', { parse_mode: 'Markdown' });
        await sendMainMenu(chatId, true, getUserDevice(userId));
    }
    else if (data === 'user_manage_cancel') {
        await sendMainMenu(chatId, true, getUserDevice(userId));
    }
    else if (data.startsWith('manage_user_')) {
        const targetUserId = parseInt(data.split('_')[2]);
        const targetUser = getUserByUserId(targetUserId);
        if (!targetUser) {
            await bot.sendMessage(chatId, '❌ Foydalanuvchi topilmadi!', { parse_mode: 'Markdown' });
            return;
        }
        
        const userInfo = `👤 *${targetUser.fullName || 'Ismsiz foydalanuvchi'}*\n\n📞 Telefon: ${targetUser.phone}\n🚗 Avtomobillar: ${targetUser.cars.length} ta\n📊 Diagnostika: ${targetUser.totalDiagnosticsAll || 0} ta\n🎁 Bonus: ${targetUser.totalBonusCount || 0}\n🎉 Bepul: ${targetUser.totalFreeDiagnostics || 0}\n📅 Ro'yxatdan: ${new Date(targetUser.registeredDate).toLocaleDateString()}\n🚦 Holat: ${targetUser.isBlocked ? '🔴 BLOKLANGAN' : '🟢 FAOL'}`;
        
        const keyboard = [];
        if (targetUser.isBlocked) {
            keyboard.push([{ text: '✅ Blokdan ochish', callback_data: `unblock_user_${targetUserId}` }]);
        } else {
            keyboard.push([{ text: '🚫 Bloklash', callback_data: `block_user_${targetUserId}` }]);
        }
        keyboard.push([{ text: '🗑️ O\'chirish', callback_data: `delete_user_${targetUserId}` }]);
        keyboard.push([{ text: '🔙 Orqaga', callback_data: 'admin_manage_users' }]);
        
        await bot.sendMessage(chatId, userInfo, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    }
    else if (data.startsWith('block_user_')) {
        const targetUserId = parseInt(data.split('_')[2]);
        const result = blockUser(targetUserId);
        await bot.sendMessage(chatId, result.message, { parse_mode: 'Markdown' });
        await sendMainMenu(chatId, true, getUserDevice(userId));
    }
    else if (data.startsWith('unblock_user_')) {
        const targetUserId = parseInt(data.split('_')[2]);
        const result = unblockUser(targetUserId);
        await bot.sendMessage(chatId, result.message, { parse_mode: 'Markdown' });
        await sendMainMenu(chatId, true, getUserDevice(userId));
    }
    else if (data.startsWith('delete_user_')) {
        const targetUserId = parseInt(data.split('_')[2]);
        const confirmKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Ha, o\'chirish', callback_data: `confirm_delete_${targetUserId}` }],
                    [{ text: '❌ Yo\'q, bekor qilish', callback_data: 'admin_manage_users' }]
                ]
            }
        };
        await bot.sendMessage(chatId, '⚠️ *DIQQAT!*\n\nFoydalanuvchini butunlay o\'chirmoqchisiz!\n\nBu amalni ortga qaytarib bo\'lmaydi.\n\nHaqiqatan ham o\'chirishni xohlaysizmi?', {
            parse_mode: 'Markdown',
            ...confirmKeyboard
        });
    }
    else if (data.startsWith('confirm_delete_')) {
        const targetUserId = parseInt(data.split('_')[2]);
        const result = deleteUser(targetUserId);
        await bot.sendMessage(chatId, result.message, { parse_mode: 'Markdown' });
        await sendMainMenu(chatId, true, getUserDevice(userId));
    }
});

// -------------------- SESSION ADMIN QO'SHISH --------------------
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    const session = getUserSession(userId);
    
    if (session.step === 'add_admin_permission') {
        if (text === '/cancel') {
            clearUserSession(userId);
            await bot.sendMessage(chatId, '❌ *Amal bekor qilindi.*', { parse_mode: 'Markdown' });
            await sendMainMenu(chatId, true, getUserDevice(userId));
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
        await sendMainMenu(chatId, true, getUserDevice(userId));
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
loadVideos();

console.log('='.repeat(60));
console.log('🚗 ISUZU DOCTOR BOT ISHGA TUSHDI');
console.log('='.repeat(60));
console.log(`📌 Versiya: ${BOT_VERSION}`);
console.log(`👑 Adminlar: ${ADMIN_IDS.join(', ')}`);
console.log(`👥 Foydalanuvchilar: ${users.filter(u => !u.isAdmin).length}`);
console.log(`🔧 Diagnostikalar: ${diagnostics.length}`);
console.log(`📹 Videolar: ${videoList.length} ta`);
console.log(`💾 Volume manzili: ${VOLUME_PATH}`);
console.log('='.repeat(60));
console.log('✅ Bot ishlashga tayyor!');
