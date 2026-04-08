const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// -------------------- TOKEN VA ADMIN --------------------
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN topilmadi!');
    process.exit(1);
}

// ADMIN TELEFON RAQAMI
const ADMIN_PHONE = "+998979247888";
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

// -------------------- BOT SOZLAMALARI --------------------
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Webhook'ni o'chirish
bot.deleteWebHook().catch(e => console.log('Webhook xatolik:', e.message));

// -------------------- MA'LUMOTLAR YO'LLARI --------------------
const DB_PATH = path.join(__dirname, 'users.json');

// -------------------- GLOBAL O'ZGARUVCHILAR --------------------
let users = [];
const userSessions = new Map();

// -------------------- DATABASE FUNKSIYALARI --------------------
function loadUsers() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            users = JSON.parse(data);
            console.log('✅ Foydalanuvchilar yuklandi:', users.length);
        } else {
            users = [];
            saveUsers();
            console.log('📁 Yangi fayl yaratildi');
        }
    } catch (error) {
        console.error('Fayl yuklashda xatolik:', error);
        users = [];
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
    if (ADMIN_IDS.includes(userId)) return true;
    const user = users.find(u => u.userId === userId);
    return user ? user.isAdmin === true : false;
}

function findUserByUserId(userId) {
    return users.find(u => u.userId === userId);
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

// -------------------- KEYBOARDS --------------------
function getAdminKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                ['📊 Statistika', '👥 Foydalanuvchilar'],
                ['❌ Asosiy menyu']
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
                ['❌ Asosiy menyu']
            ],
            resize_keyboard: true
        }
    };
}

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
    const existingUser = findUserByUserId(userId);
    
    if (existingUser) {
        const welcomeText = `👋 **Xush kelibsiz!**\n\n🚗 Avtomobil: ${existingUser.carNumber}\n📞 Telefon: ${existingUser.phone}\n👑 Admin: ${existingUser.isAdmin ? 'Ha' : 'Yo\'q'}`;
        await bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
        await sendMainMenu(chatId, existingUser.isAdmin);
    } else {
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
    if (isAdminByPhone(phoneNumber)) {
        const adminUser = {
            userId: userId,
            phone: phoneNumber,
            carNumber: "ADMIN",
            isAdmin: true,
            isActive: true,
            registeredDate: new Date().toISOString(),
            bonusCount: 0,
            freeDiagnostics: 0,
            totalDiagnostics: 0
        };
        
        users.push(adminUser);
        saveUsers();
        
        await bot.sendMessage(chatId, `👑 **Siz ADMIN sifatida tizimga kirdingiz!**\n\n📞 Telefon: ${phoneNumber}`, {
            parse_mode: 'Markdown'
        });
        await sendMainMenu(chatId, true);
        clearUserSession(userId);
        return;
    }
    
    session.step = 'car_number';
    await bot.sendMessage(chatId, `✅ Telefon raqam qabul qilindi: ${phoneNumber}\n\n🚗 Endi avtomobil raqamini kiriting:\n\nMasalan: 01A777AA`, {
        parse_mode: 'Markdown',
        reply_markup: { remove_keyboard: true }
    });
});

// -------------------- AVTOMOBIL RAQAM QABUL QILISH --------------------
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    // Rasm va kontaktlarni o'tkazib yuborish
    if (msg.photo) return;
    if (msg.contact) return;
    if (!text) return;
    if (text === '/start') return;
    
    const session = getUserSession(userId);
    
    // Avtomobil raqam kutilayotgan holat
    if (session.step === 'car_number') {
        const carNumber = text.toUpperCase().trim();
        
        if (carNumber.length < 2 || carNumber.length > 10) {
            await bot.sendMessage(chatId, '❌ **Noto\'g\'ri avtomobil raqami!**\n\nIltimos, to\'g\'ri raqam kiriting (2-10 belgi):', {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        // RASMSIZ ro'yxatdan o'tkazish (rasm saqlash o'tkazib yuboriladi)
        const newUser = {
            userId: userId,
            phone: session.data.phone,
            carNumber: carNumber,
            isAdmin: false,
            isActive: true,
            registeredDate: new Date().toISOString(),
            bonusCount: 0,
            freeDiagnostics: 0,
            totalDiagnostics: 0
        };
        
        users.push(newUser);
        saveUsers();
        
        await bot.sendMessage(chatId, `✅ **Siz muvaffaqiyatli ro'yxatdan o'tdingiz!**\n\n🚗 Avtomobil: ${carNumber}\n📞 Telefon: ${session.data.phone}\n\n🎁 **Bonus tizimi:** Har 5 diagnostikada 1 ta BEPUL!`, {
            parse_mode: 'Markdown'
        });
        
        await sendMainMenu(chatId, false);
        clearUserSession(userId);
        return;
    }
    
    // Asosiy menyu buyruqlari
    if (text === '❌ Asosiy menyu') {
        clearUserSession(userId);
        await sendMainMenu(chatId, isAdmin(userId));
        return;
    }
    
    if (text === '📊 Mening sahifam') {
        const user = findUserByUserId(userId);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan! /start bosing.');
            return;
        }
        
        const profile = `📊 **MENGING SAHIFAM**\n\n🚗 Avtomobil: ${user.carNumber}\n📞 Telefon: ${user.phone}\n📅 Ro'yxat: ${new Date(user.registeredDate).toLocaleDateString()}\n🎁 Bonus: ${user.bonusCount}/5\n🎉 Bepul: ${user.freeDiagnostics} ta\n📊 Jami: ${user.totalDiagnostics} ta`;
        
        await bot.sendMessage(chatId, profile, { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '🎁 Mening bonuslarim') {
        const user = findUserByUserId(userId);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan! /start bosing.');
            return;
        }
        
        const nextFree = 5 - user.bonusCount;
        const bonusText = `🎁 **MENGING BONUSLARIM**\n\n📊 Joriy: ${user.bonusCount}/5\n🎉 Bepul: ${user.freeDiagnostics} ta\n${nextFree > 0 ? `📌 Keyingi BEPUL: ${nextFree} ta` : '🎉 BEPUL diagnostika qozondingiz!'}\n\n🎯 Har 5 diagnostikada 1 ta BEPUL!`;
        
        await bot.sendMessage(chatId, bonusText, { parse_mode: 'Markdown' });
        return;
    }
    
    // Admin funksiyalari
    if (isAdmin(userId)) {
        if (text === '📊 Statistika') {
            const totalUsers = users.filter(u => !u.isAdmin).length;
            const totalDiagnostics = users.reduce((sum, u) => sum + (u.totalDiagnostics || 0), 0);
            
            const stats = `📊 **STATISTIKA**\n\n👥 Foydalanuvchilar: ${totalUsers}\n🔧 Jami diagnostikalar: ${totalDiagnostics}\n📅 Sana: ${new Date().toLocaleString('uz-UZ')}`;
            
            await bot.sendMessage(chatId, stats, { parse_mode: 'Markdown' });
            return;
        }
        
        if (text === '👥 Foydalanuvchilar') {
            const regularUsers = users.filter(u => !u.isAdmin);
            
            if (regularUsers.length === 0) {
                await bot.sendMessage(chatId, '📭 **Hech qanday foydalanuvchi topilmadi!**', { parse_mode: 'Markdown' });
                return;
            }
            
            let userList = '👥 **FOYDALANUVCHILAR**\n\n';
            for (const user of regularUsers.slice(-15).reverse()) {
                userList += `🚗 ${user.carNumber}\n📞 ${user.phone}\n📅 ${new Date(user.registeredDate).toLocaleDateString()}\n🎁 ${user.bonusCount}/5\n\n`;
            }
            
            await bot.sendMessage(chatId, userList, { parse_mode: 'Markdown' });
            return;
        }
    }
    
    // Tushunarsiz xabar
    if (!session.step) {
        await bot.sendMessage(chatId, '❌ **Tushunarsiz buyruq!** Menyudan foydalaning.', {
            parse_mode: 'Markdown'
        });
        await sendMainMenu(chatId, isAdmin(userId));
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

loadUsers();

console.log('='.repeat(60));
console.log('🚗 ISUZU DOCTOR BOT ISHGA TUSHDI');
console.log('='.repeat(60));
console.log(`👑 Admin telefon: ${ADMIN_PHONE}`);
console.log(`👥 Foydalanuvchilar: ${users.filter(u => !u.isAdmin).length}`);
console.log('='.repeat(60));

console.log('✅ Bot ishlashga tayyor!');
