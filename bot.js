const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// -------------------- TOKEN VA ADMIN --------------------
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN topilmadi!');
    console.error('👉 Railway\'da Variables -> BOT_TOKEN qo\'shing!');
    process.exit(1);
}

// ADMIN TELEFON RAQAMI (SHU RAQAM ADMIN)
const ADMIN_PHONE = "+998979247888";

// Admin ID lar (qo'shimcha, ixtiyoriy)
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

// -------------------- BOT SOZLAMALARI --------------------
const bot = new TelegramBot(BOT_TOKEN, { 
    polling: { 
        interval: 500, 
        timeout: 60, 
        limit: 50, 
        retryTimeout: 10000 
    }
});

// Webhook'ni o'chirish
(async () => { 
    try { 
        await bot.deleteWebHook(); 
        console.log('✅ Webhook o\'chirildi');
    } catch(e) {
        console.log('Webhook o\'chirishda xatolik:', e.message);
    } 
})();

// -------------------- MA'LUMOTLAR YO'LLARI --------------------
const DB_PATH = path.join(__dirname, 'users.json');

// -------------------- GLOBAL O'ZGARUVCHILAR --------------------
let users = [];  // Foydalanuvchilar ro'yxati
let adminUserId = null;  // Adminning Telegram ID si

const userSessions = new Map();

// -------------------- DATABASE FUNKSIYALARI --------------------
function loadUsers() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            users = JSON.parse(data);
            console.log('✅ Foydalanuvchilar yuklandi');
            
            // Admin ID ni topish
            const adminUser = users.find(u => u.phone === ADMIN_PHONE && u.isAdmin === true);
            if (adminUser) {
                adminUserId = adminUser.userId;
                console.log(`👑 Admin ID: ${adminUserId}`);
            }
        } else {
            saveUsers();
            console.log('📁 Yangi fayl yaratildi');
        }
    } catch (error) {
        console.error('Fayl yuklashda xatolik:', error);
        saveUsers();
    }
}

function saveUsers() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
        console.log('✅ Foydalanuvchilar saqlandi');
    } catch (error) {
        console.error('Fayl saqlashda xatolik:', error);
    }
}

// -------------------- YORDAMCHI FUNKSIYALAR --------------------
function isAdminByPhone(phoneNumber) {
    return phoneNumber === ADMIN_PHONE;
}

function isAdmin(userId) {
    // Telegram ID bo'yicha tekshirish
    if (ADMIN_IDS.includes(userId)) return true;
    
    // Database'dan tekshirish
    const user = users.find(u => u.userId === userId);
    return user ? user.isAdmin === true : false;
}

function findUserByUserId(userId) {
    return users.find(u => u.userId === userId);
}

function findUserByPhone(phone) {
    return users.find(u => u.phone === phone);
}

function getUserSession(userId) {
    if (!userSessions.has(userId)) {
        userSessions.set(userId, { step: null, data: {} });
    }
    return userSessions.get(userId);
}

function clearUserSession(userId) {
    userSessions.delete(userId);
}

// -------------------- ADMIN KEYBOARD --------------------
function getAdminKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                ['📊 Statistika', '👥 Foydalanuvchilar'],
                ['📅 Bugungi aktivlik', '🔍 Qidirish'],
                ['➕ Diagnostika qo\'shish', '⚠️ Xatolik qo\'shish'],
                ['💾 Backup', '🔄 Tiklash'],
                ['❌ Asosiy menyu']
            ],
            resize_keyboard: true
        }
    };
}

// -------------------- USER KEYBOARD --------------------
function getUserKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                ['📊 Mening sahifam', '🎁 Mening bonuslarim'],
                ['📜 Diagnostika tarixi', 'ℹ️ Ma\'lumot'],
                ['❌ Asosiy menyu']
            ],
            resize_keyboard: true
        }
    };
}

// -------------------- TELEFON RAQAM SO'RASH --------------------
function getPhoneKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '📱 Telefon raqamini yuborish', request_contact: true }]
            ],
            one_time_keyboard: true,
            resize_keyboard: true
        }
    };
}

// -------------------- ASOSIY MENYU --------------------
async function sendMainMenu(chatId, isAdminUser = false) {
    if (isAdminUser) {
        await bot.sendMessage(chatId, '👑 **Admin paneliga xush kelibsiz!**', {
            parse_mode: 'Markdown',
            ...getAdminKeyboard()
        });
    } else {
        await bot.sendMessage(chatId, '🏠 **Asosiy menyu**', {
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
    
    // Foydalanuvchi mavjudmi tekshirish
    const existingUser = findUserByUserId(userId);
    
    if (existingUser) {
        // Foydalanuvchi mavjud
        const isAdminUser = existingUser.isAdmin;
        
        const welcomeText = `👋 **Xush kelibsiz!**

🚗 Avtomobil: ${existingUser.carNumber || 'Mavjud emas'}
📞 Telefon: ${existingUser.phone}
👑 Admin: ${isAdminUser ? 'Ha' : 'Yo\'q'}

Quyidagi menyudan foydalaning.`;
        
        await bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
        await sendMainMenu(chatId, isAdminUser);
    } else {
        // Yangi foydalanuvchi - telefon raqam so'rash
        await bot.sendMessage(chatId, '🚗 **ISUZU USER** tizimiga xush kelibsiz!\n\n📱 Iltimos, telefon raqamingizni yuboring:', {
            parse_mode: 'Markdown',
            ...getPhoneKeyboard()
        });
    }
});

// -------------------- TELEFON RAQAM QABUL QILISH --------------------
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
    const isAdminUser = isAdminByPhone(phoneNumber);
    
    if (isAdminUser) {
        // Admin bo'lsa, darhol admin qilib saqlash
        const adminUser = {
            userId: userId,
            phone: phoneNumber,
            carNumber: "ADMIN",
            photoPath: null,
            isAdmin: true,
            isActive: true,
            registeredDate: new Date().toISOString(),
            bonusCount: 0,
            freeDiagnostics: 0,
            totalDiagnostics: 0
        };
        
        users.push(adminUser);
        saveUsers();
        adminUserId = userId;
        
        await bot.sendMessage(chatId, `👑 **Siz ADMIN sifatida tizimga kirdingiz!**

📞 Telefon: ${phoneNumber}

Admin panelidan foydalanishingiz mumkin.`, {
            parse_mode: 'Markdown'
        });
        
        await sendMainMenu(chatId, true);
        clearUserSession(userId);
        return;
    }
    
    // Oddiy foydalanuvchi - avtomobil raqam so'rash
    session.step = 'car_number';
    await bot.sendMessage(chatId, `✅ Telefon raqam qabul qilindi: ${phoneNumber}\n\n🚗 Endi avtomobil raqamini kiriting:`, {
        parse_mode: 'Markdown',
        reply_markup: { remove_keyboard: true }
    });
});

// -------------------- AVTOMOBIL RAQAM QABUL QILISH --------------------
bot.onText(/^[A-Z0-9]{2,10}$/i, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    const session = getUserSession(userId);
    
    if (session.step === 'car_number') {
        const carNumber = text.toUpperCase();
        session.data.carNumber = carNumber;
        
        // Rasm so'rash
        session.step = 'photo';
        await bot.sendMessage(chatId, `✅ Avtomobil raqam qabul qilindi: ${carNumber}\n\n📸 Endi avtomobil rasmini yuboring:`, {
            parse_mode: 'Markdown'
        });
    }
});

// -------------------- RASM QABUL QILISH --------------------
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const session = getUserSession(userId);
    
    if (session.step === 'photo') {
        const photoFile = msg.photo[msg.photo.length - 1];
        
        // Rasmni saqlash
        const photosDir = path.join(__dirname, 'user_photos');
        if (!fs.existsSync(photosDir)) {
            fs.mkdirSync(photosDir, { recursive: true });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const photoPath = path.join(photosDir, `${userId}_${timestamp}.jpg`);
        
        try {
            const file = await bot.getFile(photoFile.file_id);
            const filePath = file.file_path;
            const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
            
            // Faylni yuklab olish (oddiy usul)
            const axios = require('axios');
            const response = await axios({ url, responseType: 'stream' });
            const writer = fs.createWriteStream(photoPath);
            response.data.pipe(writer);
            
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            
            // Foydalanuvchini saqlash
            const newUser = {
                userId: userId,
                phone: session.data.phone,
                carNumber: session.data.carNumber,
                photoPath: photoPath,
                isAdmin: false,
                isActive: true,
                registeredDate: new Date().toISOString(),
                bonusCount: 0,
                freeDiagnostics: 0,
                totalDiagnostics: 0
            };
            
            users.push(newUser);
            saveUsers();
            
            await bot.sendMessage(chatId, '✅ **Siz muvaffaqiyatli ro\'yxatdan o\'tdingiz!**\n\n🎁 **Bonus tizimi:** Har 5 diagnostikada 1 ta BEPUL!', {
                parse_mode: 'Markdown'
            });
            
            await sendMainMenu(chatId, false);
            clearUserSession(userId);
            
        } catch (error) {
            console.error('Rasm saqlashda xatolik:', error);
            await bot.sendMessage(chatId, '❌ Rasm saqlashda xatolik yuz berdi. Qaytadan urinib ko\'ring.');
        }
    }
});

// -------------------- ADMIN FUNKSIYALARI --------------------

// Statistika
bot.onText(/📊 Statistika/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ Bu buyruq faqat admin uchun!');
        return;
    }
    
    const totalUsers = users.filter(u => !u.isAdmin).length;
    const totalAdmins = users.filter(u => u.isAdmin).length;
    const activeUsers = users.filter(u => u.isActive).length;
    const totalDiagnostics = users.reduce((sum, u) => sum + (u.totalDiagnostics || 0), 0);
    
    const stats = `📊 **STATISTIKA**

👥 Jami foydalanuvchilar: ${totalUsers}
👑 Adminlar: ${totalAdmins}
✅ Faol foydalanuvchilar: ${activeUsers}
🔧 Jami diagnostikalar: ${totalDiagnostics}
📅 Oxirgi yangilanish: ${new Date().toLocaleString('uz-UZ')}`;
    
    await bot.sendMessage(chatId, stats, { parse_mode: 'Markdown' });
});

// Barcha foydalanuvchilar
bot.onText(/👥 Foydalanuvchilar/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ Bu buyruq faqat admin uchun!');
        return;
    }
    
    const regularUsers = users.filter(u => !u.isAdmin);
    
    if (regularUsers.length === 0) {
        await bot.sendMessage(chatId, '📭 **Hech qanday foydalanuvchi topilmadi!**', { parse_mode: 'Markdown' });
        return;
    }
    
    let userList = '👥 **FOYDALANUVCHILAR RO\'YXATI**\n\n';
    for (const user of regularUsers.slice(-15).reverse()) {
        userList += `🆔 ID: ${user.userId}\n🚗 ${user.carNumber}\n📞 ${user.phone}\n📅 ${new Date(user.registeredDate).toLocaleDateString()}\n🎁 Bonus: ${user.bonusCount}/5\n\n`;
    }
    
    await bot.sendMessage(chatId, userList, { parse_mode: 'Markdown' });
});

// Asosiy menyu
bot.onText(/❌ Asosiy menyu/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const isAdminUser = isAdmin(userId);
    
    clearUserSession(userId);
    await sendMainMenu(chatId, isAdminUser);
});

// Mening sahifam (foydalanuvchi)
bot.onText(/📊 Mening sahifam/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const user = findUserByUserId(userId);
    
    if (!user) {
        await bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan! /start bosing.');
        return;
    }
    
    const profile = `📊 **MENGING SAHIFAM**

🚗 Avtomobil: ${user.carNumber}
📞 Telefon: ${user.phone}
📅 Ro'yxatdan o'tgan: ${new Date(user.registeredDate).toLocaleDateString()}
🎁 Diagnostika soni: ${user.bonusCount}/5
🎉 Bepul diagnostikalar: ${user.freeDiagnostics} ta
📊 Jami diagnostikalar: ${user.totalDiagnostics} ta`;
    
    await bot.sendMessage(chatId, profile, { parse_mode: 'Markdown' });
});

// Mening bonuslarim
bot.onText(/🎁 Mening bonuslarim/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const user = findUserByUserId(userId);
    
    if (!user) {
        await bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan! /start bosing.');
        return;
    }
    
    const nextFree = 5 - user.bonusCount;
    const bonusText = `🎁 **MENGING BONUSLARIM**

📊 Joriy diagnostika soni: ${user.bonusCount}/5
🎉 Bepul diagnostikalar: ${user.freeDiagnostics} ta
${nextFree > 0 ? `📌 Keyingi BEPUL: ${nextFree} ta diagnostikadan keyin` : '🎉 Siz BEPUL diagnostika qozondingiz!'}

🎯 Qoida: Har 5 diagnostikada 1 ta BEPUL!`;
    
    await bot.sendMessage(chatId, bonusText, { parse_mode: 'Markdown' });
});

// -------------------- TUSHUNARSIZ XABAR --------------------
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    // Agar rasm bo'lsa, yuqorida ishlov beriladi
    if (msg.photo) return;
    if (msg.contact) return;
    if (!text) return;
    
    // Komandalarni o'tkazib yuborish
    if (text === '/start') return;
    if (text === '📊 Statistika') return;
    if (text === '👥 Foydalanuvchilar') return;
    if (text === '❌ Asosiy menyu') return;
    if (text === '📊 Mening sahifam') return;
    if (text === '🎁 Mening bonuslarim') return;
    
    const session = getUserSession(userId);
    
    // Ro'yxatdan o'tish jarayonida avtomobil raqam kutilmoqda
    if (session.step === 'car_number' && /^[A-Z0-9]{2,10}$/i.test(text)) {
        // Yuqoridagi regex bilan ishlov beriladi
        return;
    }
    
    // Agar boshqa holatda bo'lsa
    if (!session.step) {
        const isAdminUser = isAdmin(userId);
        await bot.sendMessage(chatId, '❌ **Tushunarsiz buyruq!** Iltimos, menyudan foydalaning.', {
            parse_mode: 'Markdown'
        });
        await sendMainMenu(chatId, isAdminUser);
    }
});

// -------------------- XATOLIKLARNI QAYTA ISHLASH --------------------
bot.on('polling_error', (error) => {
    console.error('Polling xatolik:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

// -------------------- BOTNI ISHGA TUSHIRISH --------------------
console.log('='.repeat(60));
console.log('🚗 ISUZU DOCTOR BOT ISHGA TUSHMOQDA');
console.log('='.repeat(60));

// Foydalanuvchilarni yuklash
loadUsers();

console.log('='.repeat(60));
console.log('🚗 ISUZU DOCTOR BOT ISHGA TUSHDI');
console.log('='.repeat(60));
console.log(`👑 Admin telefon: ${ADMIN_PHONE}`);
console.log(`👥 Jami foydalanuvchilar: ${users.filter(u => !u.isAdmin).length}`);
console.log('='.repeat(60));

console.log('✅ Bot ishlashga tayyor!');
