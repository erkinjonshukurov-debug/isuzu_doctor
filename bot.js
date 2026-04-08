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

// Admin ID lar (vergul bilan ajratilgan)
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

if (ADMIN_IDS.length === 0) {
    console.warn('⚠️ ADMIN_IDS topilmadi! Admin funksiyalari ishlamaydi.');
    console.warn('👉 Railway\'da Variables -> ADMIN_IDS = 123456789 qo\'shing!');
}

// -------------------- BOT SOZLAMALARI --------------------
const bot = new TelegramBot(BOT_TOKEN, { 
    polling: { 
        interval: 500, 
        timeout: 60, 
        limit: 50, 
        retryTimeout: 10000 
    }
});

// Webhook'ni o'chirish (polling ishlatayotganimiz uchun)
(async () => { 
    try { 
        await bot.deleteWebHook(); 
        console.log('✅ Webhook o\'chirildi');
    } catch(e) {
        console.log('Webhook o\'chirishda xatolik:', e.message);
    } 
})();

// -------------------- MA'LUMOTLAR YO'LLARI --------------------
const DB_PATH = path.join(__dirname, 'db.json');
const DEPARTMENTS_PATH = path.join(__dirname, 'departments.json');

// -------------------- GLOBAL O'ZGARUVCHILAR --------------------
let db = { 
    teams: [], 
    individuals: [], 
    registrationOpen: true 
};

let departments = { 
    departments: [] 
};

const userSessions = new Map();

// -------------------- DATABASE FUNKSIYALARI --------------------
function loadDatabase() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            db = JSON.parse(data);
            console.log('✅ Database yuklandi');
        } else {
            saveDatabase();
            console.log('📁 Yangi database yaratildi');
        }
    } catch (error) {
        console.error('Database yuklashda xatolik:', error);
        saveDatabase();
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
        console.log('✅ Database saqlandi');
    } catch (error) {
        console.error('Database saqlashda xatolik:', error);
    }
}

function loadDepartments() {
    try {
        if (fs.existsSync(DEPARTMENTS_PATH)) {
            const data = fs.readFileSync(DEPARTMENTS_PATH, 'utf8');
            departments = JSON.parse(data);
            console.log('✅ Departamentlar yuklandi');
        } else {
            saveDepartments();
            console.log('📁 Yangi departamentlar yaratildi');
        }
    } catch (error) {
        console.error('Departament yuklashda xatolik:', error);
        saveDepartments();
    }
}

function saveDepartments() {
    try {
        fs.writeFileSync(DEPARTMENTS_PATH, JSON.stringify(departments, null, 2));
        console.log('✅ Departamentlar saqlandi');
    } catch (error) {
        console.error('Departament saqlashda xatolik:', error);
    }
}

// -------------------- YORDAMCHI FUNKSIYALAR --------------------
function isAdmin(userId) {
    return ADMIN_IDS.includes(userId);
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

// -------------------- ASOSIY KOMANDALAR --------------------
async function sendMainMenu(chatId, isAdminUser = false) {
    const keyboard = isAdminUser ? {
        reply_markup: {
            keyboard: [
                ['📊 Statistika', '👥 Foydalanuvchilar'],
                ['📝 Ro\'yxatdan o\'tish', '❌ Yopish']
            ],
            resize_keyboard: true
        }
    } : {
        reply_markup: {
            keyboard: [
                ['📝 Ro\'yxatdan o\'tish', 'ℹ️ Ma\'lumot'],
                ['❌ Yopish']
            ],
            resize_keyboard: true
        }
    };
    
    await bot.sendMessage(chatId, '🏠 **Asosiy menyu**', {
        parse_mode: 'Markdown',
        ...keyboard
    });
}

// -------------------- /start KOMANDASI --------------------
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const isAdminUser = isAdmin(userId);
    
    clearUserSession(userId);
    
    const welcomeText = `🤖 **Botga xush kelibsiz!**

👑 Admin: ${isAdminUser ? 'Ha' : 'Yo\'q'}
📅 Sana: ${new Date().toLocaleDateString('uz-UZ')}

Quyidagi menyu orqali ishlashingiz mumkin.`;
    
    await bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
    await sendMainMenu(chatId, isAdminUser);
});

// -------------------- RO'YXATDAN O'TISH --------------------
bot.onText(/📝 Ro'yxatdan o'tish/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const session = getUserSession(userId);
    
    session.step = 'registration_name';
    await bot.sendMessage(chatId, '📝 Iltimos, **ismingizni** kiriting:', {
        parse_mode: 'Markdown',
        reply_markup: { remove_keyboard: true }
    });
});

// -------------------- MATNLARNI QAYTA ISHLASH --------------------
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    // Komandalarni o'tkazib yuborish
    if (text === '/start') return;
    if (text === '❌ Yopish') {
        clearUserSession(userId);
        await bot.sendMessage(chatId, '❌ **Amal bekor qilindi**', {
            parse_mode: 'Markdown',
            reply_markup: { remove_keyboard: true }
        });
        await sendMainMenu(chatId, isAdmin(userId));
        return;
    }
    
    const session = getUserSession(userId);
    
    // Ro'yxatdan o'tish jarayoni
    if (session.step === 'registration_name') {
        session.data.name = text;
        session.step = 'registration_phone';
        await bot.sendMessage(chatId, '📱 **Telefon raqamingizni** kiriting:\nMasalan: +998901234567', {
            parse_mode: 'Markdown'
        });
        return;
    }
    
    if (session.step === 'registration_phone') {
        session.data.phone = text;
        session.step = 'registration_department';
        
        // Departamentlar ro'yxatini tayyorlash
        const deptList = departments.departments.map((dept, index) => `${index + 1}. ${dept.name}`).join('\n');
        
        await bot.sendMessage(chatId, `🏢 **Bo'limni tanlang:**\n\n${deptList}\n\nRaqamni yuboring (1-${departments.departments.length})`, {
            parse_mode: 'Markdown'
        });
        return;
    }
    
    if (session.step === 'registration_department') {
        const deptIndex = parseInt(text) - 1;
        
        if (isNaN(deptIndex) || deptIndex < 0 || deptIndex >= departments.departments.length) {
            await bot.sendMessage(chatId, `❌ **Noto'g'ri tanlov!**\n\n1 dan ${departments.departments.length} gacha raqam kiriting.`);
            return;
        }
        
        session.data.department = departments.departments[deptIndex].name;
        
        // Ma'lumotlarni saqlash
        const newUser = {
            id: Date.now(),
            userId: userId,
            name: session.data.name,
            phone: session.data.phone,
            department: session.data.department,
            registeredAt: new Date().toISOString()
        };
        
        db.individuals.push(newUser);
        saveDatabase();
        
        const successText = `✅ **Ro'yxatdan o'tdingiz!**

📝 Ism: ${session.data.name}
📱 Telefon: ${session.data.phone}
🏢 Bo'lim: ${session.data.department}
📅 Vaqt: ${new Date().toLocaleString('uz-UZ')}`;
        
        await bot.sendMessage(chatId, successText, { parse_mode: 'Markdown' });
        
        clearUserSession(userId);
        await sendMainMenu(chatId, isAdmin(userId));
        
        // Adminlarga xabar yuborish
        for (const adminId of ADMIN_IDS) {
            try {
                await bot.sendMessage(adminId, `🆕 **Yangi foydalanuvchi ro'yxatdan o'tdi!**

${successText}`);
            } catch(e) {}
        }
        return;
    }
    
    // Admin funksiyalari
    if (isAdmin(userId)) {
        if (text === '📊 Statistika') {
            const stats = `📊 **Statistika**

👥 Jami foydalanuvchilar: ${db.individuals.length}
👥 Jami jamoalar: ${db.teams.length}
✅ Ro'yxatdan o'tish: ${db.registrationOpen ? 'Ochiq' : 'Yopiq'}

📅 Oxirgi yangilanish: ${new Date().toLocaleString('uz-UZ')}`;
            
            await bot.sendMessage(chatId, stats, { parse_mode: 'Markdown' });
            return;
        }
        
        if (text === '👥 Foydalanuvchilar') {
            if (db.individuals.length === 0) {
                await bot.sendMessage(chatId, '📭 **Hech qanday foydalanuvchi topilmadi!**', { parse_mode: 'Markdown' });
                return;
            }
            
            let userList = '👥 **Foydalanuvchilar ro\'yxati**\n\n';
            for (const user of db.individuals.slice(-10).reverse()) {
                userList += `🆔 ID: ${user.userId}\n📝 ${user.name}\n📱 ${user.phone}\n🏢 ${user.department}\n📅 ${new Date(user.registeredAt).toLocaleDateString()}\n\n`;
            }
            
            await bot.sendMessage(chatId, userList, { parse_mode: 'Markdown' });
            return;
        }
    }
    
    // Tushunarsiz xabar
    if (!session.step) {
        await bot.sendMessage(chatId, '❌ **Tushunarsiz buyruq!** Iltimos, menyudan foydalaning.', {
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

// Ma'lumotlarni yuklash
loadDatabase();
loadDepartments();

console.log('='.repeat(60));
console.log('🚗 ISUZU DOCTOR BOT ISHGA TUSHDI');
console.log('='.repeat(60));
console.log(`👑 Admin ID lar: ${ADMIN_IDS.length > 0 ? ADMIN_IDS.join(', ') : 'Yo\'q'}`);
console.log(`👥 Jami foydalanuvchilar: ${db.individuals.length}`);
console.log(`🏢 Jami departamentlar: ${departments.departments.length}`);
console.log('='.repeat(60));

// Bot tayyor
console.log('✅ Bot ishlashga tayyor!');
