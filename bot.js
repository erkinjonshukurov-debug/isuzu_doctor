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

// DIAGNOSTIKA NARXI
const DIAGNOSTIC_PRICE = 250000;

// -------------------- BOT SOZLAMALARI --------------------
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Webhook'ni o'chirish
bot.deleteWebHook().catch(e => console.log('Webhook xatolik:', e.message));

// -------------------- MA'LUMOTLAR YO'LLARI --------------------
const DB_PATH = path.join(__dirname, 'users.json');
const DIAGNOSTICS_PATH = path.join(__dirname, 'diagnostics.json');

// -------------------- GLOBAL O'ZGARUVCHILAR --------------------
let users = [];
let diagnostics = [];
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

function loadDiagnostics() {
    try {
        if (fs.existsSync(DIAGNOSTICS_PATH)) {
            const data = fs.readFileSync(DIAGNOSTICS_PATH, 'utf8');
            diagnostics = JSON.parse(data);
            console.log('✅ Diagnostikalar yuklandi:', diagnostics.length);
        } else {
            diagnostics = [];
            saveDiagnostics();
        }
    } catch (error) {
        console.error('Diagnostika faylini yuklashda xatolik:', error);
        diagnostics = [];
        saveDiagnostics();
    }
}

function saveDiagnostics() {
    try {
        fs.writeFileSync(DIAGNOSTICS_PATH, JSON.stringify(diagnostics, null, 2));
        console.log('✅ Diagnostikalar saqlandi');
    } catch (error) {
        console.error('Diagnostika faylini saqlashda xatolik:', error);
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

function findUserByCarNumber(carNumber) {
    return users.find(u => u.carNumber === carNumber);
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

// -------------------- BONUS TIZIMI --------------------
function addDiagnostic(userId, workDescription = '', additionalNotes = '') {
    const user = findUserByUserId(userId);
    if (!user) return { success: false, message: 'Foydalanuvchi topilmadi' };
    
    let bonusAwarded = false;
    let freeDiagnosticUsed = false;
    
    // Agar bepul diagnostika mavjud bo'lsa
    if (user.freeDiagnostics > 0) {
        user.freeDiagnostics--;
        freeDiagnosticUsed = true;
        user.totalDiagnostics++;
        
        // Diagnostikani saqlash
        const diagnostic = {
            id: Date.now(),
            userId: user.userId,
            carNumber: user.carNumber,
            phone: user.phone,
            date: new Date().toISOString(),
            workDescription: workDescription || 'Bepul diagnostika',
            additionalNotes: additionalNotes || '',
            price: 0,
            isFree: true
        };
        diagnostics.push(diagnostic);
        saveDiagnostics();
        saveUsers();
        
        return {
            success: true,
            message: '✅ Bepul diagnostika amalga oshirildi!',
            freeUsed: true,
            remainingFree: user.freeDiagnostics,
            workDescription: workDescription,
            additionalNotes: additionalNotes
        };
    }
    
    // Oddiy diagnostika
    user.bonusCount++;
    user.totalDiagnostics++;
    
    // Har 5 diagnostikada bonus
    if (user.bonusCount >= 5) {
        const bonusCount = Math.floor(user.bonusCount / 5);
        user.freeDiagnostics += bonusCount;
        user.bonusCount = user.bonusCount % 5;
        bonusAwarded = true;
    }
    
    // Diagnostikani saqlash
    const diagnostic = {
        id: Date.now(),
        userId: user.userId,
        carNumber: user.carNumber,
        phone: user.phone,
        date: new Date().toISOString(),
        workDescription: workDescription,
        additionalNotes: additionalNotes,
        price: DIAGNOSTIC_PRICE,
        isFree: false
    };
    diagnostics.push(diagnostic);
    saveDiagnostics();
    saveUsers();
    
    return {
        success: true,
        message: '✅ Diagnostika qo\'shildi!',
        bonusAwarded: bonusAwarded,
        currentBonus: user.bonusCount,
        freeDiagnostics: user.freeDiagnostics,
        remainingToNext: 5 - user.bonusCount,
        workDescription: workDescription,
        additionalNotes: additionalNotes,
        price: DIAGNOSTIC_PRICE
    };
}

// -------------------- KEYBOARDS --------------------
function getAdminKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                ['📊 Statistika', '👥 Foydalanuvchilar'],
                ['🔧 Diagnostika qo\'shish', '🎁 Bonusga yaqinlar'],
                ['⚠️ Xatoliklar statistikasi', '📋 Diagnostikalar tarixi'],
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
                ['📋 Diagnostika tarixim', '💰 Narxlar'],
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

function getWorkTypeKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                ['🔧 Dvigatel diagnostikasi', '🛞 Shassi diagnostikasi'],
                ['⚡ Elektronika diagnostikasi', '🌡️ Klimat diagnostikasi'],
                ['🔍 To\'liq kompyuter diagnostikasi', '❌ Bekor qilish']
            ],
            resize_keyboard: true
        }
    };
}

// -------------------- ASOSIY MENYU --------------------
async function sendMainMenu(chatId, isAdminUser = false) {
    if (isAdminUser) {
        await bot.sendMessage(chatId, '👑 **Admin paneliga xush kelibsiz!**\n\n🔧 Quyidagi funksiyalardan foydalaning:', {
            parse_mode: 'Markdown',
            ...getAdminKeyboard()
        });
    } else {
        await bot.sendMessage(chatId, '🏠 **Asosiy menyu**\n\n🚗 ISUZU DOCTOR botiga xush kelibsiz!\n💰 Diagnostika narxi: 250,000 so\'m', {
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
        const welcomeText = `👋 **Xush kelibsiz!**\n\n🚗 Avtomobil: ${existingUser.carNumber}\n📞 Telefon: ${existingUser.phone}\n👑 Admin: ${existingUser.isAdmin ? 'Ha' : 'Yo\'q'}\n🎁 Bonus: ${existingUser.bonusCount}/5\n🎉 Bepul diagnostika: ${existingUser.freeDiagnostics} ta\n💰 Diagnostika narxi: ${DIAGNOSTIC_PRICE.toLocaleString()} so'm`;
        await bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
        await sendMainMenu(chatId, existingUser.isAdmin);
    } else {
        await bot.sendMessage(chatId, '🚗 **ISUZU DOCTOR** tizimiga xush kelibsiz!\n\n💰 Diagnostika narxi: 250,000 so\'m\n\n📱 Iltimos, telefon raqamingizni yuboring:', {
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
        
        await bot.sendMessage(chatId, `✅ **Siz muvaffaqiyatli ro'yxatdan o'tdingiz!**\n\n🚗 Avtomobil: ${carNumber}\n📞 Telefon: ${session.data.phone}\n💰 Diagnostika narxi: ${DIAGNOSTIC_PRICE.toLocaleString()} so'm\n\n🎁 **Bonus tizimi:** Har 5 diagnostikada 1 ta BEPUL!`, {
            parse_mode: 'Markdown'
        });
        
        await sendMainMenu(chatId, false);
        clearUserSession(userId);
        return;
    }
    
    // Admin diagnostika qo'shish - Avtomobil raqami
    if (session.step === 'admin_add_diagnostic') {
        const carNumber = text.toUpperCase().trim();
        const user = findUserByCarNumber(carNumber);
        
        if (!user) {
            await bot.sendMessage(chatId, '❌ **Bunday avtomobil topilmadi!**\n\nIltimos, to\'g\'ri avtomobil raqamini kiriting:', {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        session.data.targetUser = user;
        session.step = 'admin_work_description';
        
        await bot.sendMessage(chatId, `✅ Foydalanuvchi topildi:\n\n🚗 ${user.carNumber}\n📞 ${user.phone}\n🎁 Bonus: ${user.bonusCount}/5\n🎉 Bepul: ${user.freeDiagnostics}\n💰 Narx: ${DIAGNOSTIC_PRICE.toLocaleString()} so'm\n\n🔧 **Bajarilgan ishlarni kiriting:**\n\nMasalan: "Dvigatel tekshirildi, moy almashtirildi, filtr tozalandi"`, {
            parse_mode: 'Markdown',
            reply_markup: { remove_keyboard: true }
        });
        return;
    }
    
    // Admin - Bajarilgan ishlar tavsifi
    if (session.step === 'admin_work_description') {
        session.data.workDescription = text;
        session.step = 'admin_additional_notes';
        
        await bot.sendMessage(chatId, `✅ Bajarilgan ishlar qabul qilindi:\n\n📝 "${text}"\n\n➕ **Qo'shimcha eslatmalar kiriting** (ixtiyoriy):\n\nMasalan: "Mijozga keyingi diagnostika 3000 km dan keyin tavsiya qilindi"`, {
            parse_mode: 'Markdown'
        });
        return;
    }
    
    // Admin - Qo'shimcha eslatmalar
    if (session.step === 'admin_additional_notes') {
        session.data.additionalNotes = text;
        
        const result = addDiagnostic(
            session.data.targetUser.userId, 
            session.data.workDescription, 
            session.data.additionalNotes
        );
        
        let response = `🔧 **DIAGNOSTIKA NATIJASI**\n\n`;
        response += `🚗 Avtomobil: ${session.data.targetUser.carNumber}\n`;
        response += `📞 Telefon: ${session.data.targetUser.phone}\n`;
        response += `📅 Sana: ${new Date().toLocaleString()}\n`;
        response += `💰 Narx: ${result.price ? result.price.toLocaleString() : 0} so'm\n\n`;
        response += `📝 **Bajarilgan ishlar:**\n${session.data.workDescription}\n\n`;
        
        if (session.data.additionalNotes && session.data.additionalNotes !== '❌ Bekor qilish') {
            response += `➕ **Qo'shimcha:**\n${session.data.additionalNotes}\n\n`;
        }
        
        response += `${result.message}\n`;
        
        if (result.bonusAwarded) {
            response += `🎉 **TABRIKLAYMIZ!** 5-diagnostikadan so\'ng 1 ta BEPUL diagnostika qozondingiz!\n`;
        }
        
        response += `\n📊 **Joriy holat:**\n`;
        response += `🎁 Bonus: ${result.currentBonus || session.data.targetUser.bonusCount}/5\n`;
        response += `🎉 Bepul diagnostika: ${result.freeDiagnostics || session.data.targetUser.freeDiagnostics} ta\n`;
        response += `📊 Jami diagnostikalar: ${session.data.targetUser.totalDiagnostics + 1}`;
        
        await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        
        // Foydalanuvchiga xabar yuborish
        try {
            const userMsg = `🔧 **Diagnostika amalga oshirildi!**\n\n` +
                `🚗 Avtomobil: ${session.data.targetUser.carNumber}\n` +
                `📅 Sana: ${new Date().toLocaleString()}\n` +
                `💰 Narx: ${result.price ? result.price.toLocaleString() : 0} so'm\n\n` +
                `📝 **Bajarilgan ishlar:**\n${session.data.workDescription}\n\n`;
            
            if (session.data.additionalNotes && session.data.additionalNotes !== '❌ Bekor qilish') {
                userMsg += `➕ **Qo'shimcha ma'lumot:**\n${session.data.additionalNotes}\n\n`;
            }
            
            userMsg += `🎁 Bonus: ${session.data.targetUser.bonusCount}/5\n` +
                `🎉 Bepul diagnostikalar: ${session.data.targetUser.freeDiagnostics} ta\n\n` +
                `📊 Diagnostika tarixingizni "${'📋 Diagnostika tarixim'}" bo'limidan ko'rishingiz mumkin.`;
            
            await bot.sendMessage(session.data.targetUser.userId, userMsg, { parse_mode: 'Markdown' });
        } catch (e) {
            console.log('Foydalanuvchiga xabar yuborib bo\'lmadi');
        }
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true);
        return;
    }
    
    // Asosiy menyu buyruqlari
    if (text === '❌ Asosiy menyu') {
        clearUserSession(userId);
        await sendMainMenu(chatId, isAdmin(userId));
        return;
    }
    
    // FOYDALANUVCHI MENYUSI
    if (!isAdmin(userId)) {
        if (text === '📊 Mening sahifam') {
            const user = findUserByUserId(userId);
            if (!user) {
                await bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan! /start bosing.');
                return;
            }
            
            const profile = `📊 **MENGING SAHIFAM**\n\n` +
                `🚗 Avtomobil: ${user.carNumber}\n` +
                `📞 Telefon: ${user.phone}\n` +
                `📅 Ro'yxat: ${new Date(user.registeredDate).toLocaleDateString()}\n` +
                `🎁 Bonus: ${user.bonusCount}/5\n` +
                `🎉 Bepul: ${user.freeDiagnostics} ta\n` +
                `📊 Jami: ${user.totalDiagnostics} ta diagnostika\n` +
                `💰 Diagnostika narxi: ${DIAGNOSTIC_PRICE.toLocaleString()} so'm`;
            
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
            const bonusText = `🎁 **MENGING BONUSLARIM**\n\n` +
                `📊 Joriy: ${user.bonusCount}/5\n` +
                `🎉 Bepul: ${user.freeDiagnostics} ta\n` +
                `${nextFree > 0 ? `📌 Keyingi BEPUL: ${nextFree} ta diagnostikadan so'ng` : '🎉 BEPUL diagnostika qozondingiz!'}\n\n` +
                `🎯 Har 5 diagnostikada 1 ta BEPUL!\n` +
                `💰 Har bir diagnostika narxi: ${DIAGNOSTIC_PRICE.toLocaleString()} so'm`;
            
            await bot.sendMessage(chatId, bonusText, { parse_mode: 'Markdown' });
            return;
        }
        
        if (text === '📋 Diagnostika tarixim') {
            const user = findUserByUserId(userId);
            if (!user) {
                await bot.sendMessage(chatId, '❌ Ro\'yxatdan o\'tmagan! /start bosing.');
                return;
            }
            
            const userDiagnostics = diagnostics.filter(d => d.userId === userId).slice(-10).reverse();
            
            if (userDiagnostics.length === 0) {
                await bot.sendMessage(chatId, '📭 **Sizda hali diagnostikalar mavjud emas!**', { parse_mode: 'Markdown' });
                return;
            }
            
            for (const diag of userDiagnostics) {
                let diagText = `📅 **${new Date(diag.date).toLocaleDateString()}**\n`;
                diagText += `🕐 ${new Date(diag.date).toLocaleTimeString()}\n\n`;
                diagText += `📝 **Bajarilgan ishlar:**\n${diag.workDescription}\n\n`;
                
                if (diag.additionalNotes) {
                    diagText += `➕ **Qo'shimcha:**\n${diag.additionalNotes}\n\n`;
                }
                
                diagText += `💰 Narx: ${diag.price.toLocaleString()} so'm\n`;
                diagText += `${diag.isFree ? '🎉 BEPUL diagnostika' : '💵 To\'lovli diagnostika'}\n`;
                diagText += `━━━━━━━━━━━━━━━━━━\n`;
                
                await bot.sendMessage(chatId, diagText, { parse_mode: 'Markdown' });
            }
            return;
        }
        
        if (text === '💰 Narxlar') {
            const priceText = `💰 **DIAGNOSTIKA NARXLARI**\n\n` +
                `🔧 Standart diagnostika: ${DIAGNOSTIC_PRICE.toLocaleString()} so'm\n\n` +
                `📋 **Diagnostika tarkibiga kiradi:**\n` +
                `• Dvigatel tizimi tekshiruvi\n` +
                `• Shassi va podveska diagnostikasi\n` +
                `• Elektronika va sensorlar tekshiruvi\n` +
                `• Klimat tizimi diagnostikasi\n` +
                `• Xatoliklarni o'qish va tahlil qilish\n` +
                `• Tavsiyalar berish\n\n` +
                `🎁 **Bonus:** Har 5 diagnostikada 1 ta BEPUL!`;
            
            await bot.sendMessage(chatId, priceText, { parse_mode: 'Markdown' });
            return;
        }
    }
    
    // ADMIN MENYUSI
    if (isAdmin(userId)) {
        if (text === '📊 Statistika') {
            const totalUsers = users.filter(u => !u.isAdmin).length;
            const totalDiagnostics = diagnostics.length;
            const totalIncome = diagnostics.reduce((sum, d) => sum + d.price, 0);
            const freeDiagnosticsGiven = diagnostics.filter(d => d.isFree).length;
            const paidDiagnostics = totalDiagnostics - freeDiagnosticsGiven;
            
            const stats = `📊 **STATISTIKA**\n\n` +
                `👥 Foydalanuvchilar: ${totalUsers}\n` +
                `🔧 Jami diagnostikalar: ${totalDiagnostics}\n` +
                `💵 To'lovli: ${paidDiagnostics}\n` +
                `🎉 Bepul: ${freeDiagnosticsGiven}\n` +
                `💰 Umumiy daromad: ${totalIncome.toLocaleString()} so'm\n` +
                `📊 O'rtacha daromad: ${(totalIncome / (paidDiagnostics || 1)).toLocaleString()} so'm\n` +
                `📅 Sana: ${new Date().toLocaleString('uz-UZ')}`;
            
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
                userList += `🚗 ${user.carNumber}\n`;
                userList += `📞 ${user.phone}\n`;
                userList += `📅 ${new Date(user.registeredDate).toLocaleDateString()}\n`;
                userList += `🎁 ${user.bonusCount}/5\n`;
                userList += `🎉 ${user.freeDiagnostics} ta bepul\n`;
                userList += `📊 ${user.totalDiagnostics} ta diagnostika\n`;
                userList += `━━━━━━━━━━━━━━━━━━\n`;
            }
            
            await bot.sendMessage(chatId, userList, { parse_mode: 'Markdown' });
            return;
        }
        
        if (text === '🔧 Diagnostika qo\'shish') {
            session.step = 'admin_add_diagnostic';
            await bot.sendMessage(chatId, '🔧 **Diagnostika qo\'shish**\n\n🚗 Avtomobil raqamini kiriting:', {
                parse_mode: 'Markdown',
                reply_markup: { remove_keyboard: true }
            });
            return;
        }
        
        if (text === '🎁 Bonusga yaqinlar') {
            const usersNearBonus = users.filter(u => !u.isAdmin && u.bonusCount >= 3 && u.bonusCount < 5);
            
            if (usersNearBonus.length === 0) {
                await bot.sendMessage(chatId, '📭 **Bonusga yaqin foydalanuvchilar topilmadi!**', { parse_mode: 'Markdown' });
                return;
            }
            
            let nearText = '🎁 **BONUSGA YAQIN FOYDALANUVCHILAR**\n\n';
            for (const user of usersNearBonus) {
                const remaining = 5 - user.bonusCount;
                nearText += `🚗 ${user.carNumber}\n`;
                nearText += `📞 ${user.phone}\n`;
                nearText += `🎁 Bonus: ${user.bonusCount}/5\n`;
                nearText += `📌 Qolgan: ${remaining} ta diagnostika\n`;
                nearText += `━━━━━━━━━━━━━━━━━━\n`;
            }
            
            await bot.sendMessage(chatId, nearText, { parse_mode: 'Markdown' });
            return;
        }
        
        if (text === '⚠️ Xatoliklar statistikasi') {
            const errorDiagnostics = diagnostics.filter(d => 
                d.workDescription.toLowerCase().includes('xato') || 
                d.workDescription.toLowerCase().includes('nosozlik') ||
                d.additionalNotes.toLowerCase().includes('xato') ||
                d.additionalNotes.toLowerCase().includes('nosozlik')
            );
            
            const errorTypes = {};
            errorDiagnostics.forEach(d => {
                const type = d.workDescription.split(' ')[0];
                errorTypes[type] = (errorTypes[type] || 0) + 1;
            });
            
            if (errorDiagnostics.length === 0) {
                await bot.sendMessage(chatId, '✅ **Xatoliklar qayd etilmagan!**', { parse_mode: 'Markdown' });
                return;
            }
            
            let errorText = '⚠️ **XATOLIKLAR STATISTIKASI**\n\n';
            errorText += `📊 Jami xatoliklar: ${errorDiagnostics.length}\n\n`;
            errorText += `📋 **Xatolik turlari:**\n`;
            for (const [type, count] of Object.entries(errorTypes)) {
                errorText += `• ${type}: ${count} ta\n`;
            }
            errorText += `\n📅 Oxirgi xatoliklar:\n\n`;
            
            for (const diag of errorDiagnostics.slice(-5).reverse()) {
                errorText += `📅 ${new Date(diag.date).toLocaleDateString()}\n`;
                errorText += `🚗 ${diag.carNumber}\n`;
                errorText += `🔧 ${diag.workDescription.substring(0, 50)}${diag.workDescription.length > 50 ? '...' : ''}\n\n`;
            }
            
            await bot.sendMessage(chatId, errorText, { parse_mode: 'Markdown' });
            return;
        }
        
        if (text === '📋 Diagnostikalar tarixi') {
            const recentDiagnostics = diagnostics.slice(-20).reverse();
            
            if (recentDiagnostics.length === 0) {
                await bot.sendMessage(chatId, '📭 **Hech qanday diagnostika topilmadi!**', { parse_mode: 'Markdown' });
                return;
            }
            
            for (const diag of recentDiagnostics) {
                let diagText = `📅 **${new Date(diag.date).toLocaleDateString()}**\n`;
                diagText += `🕐 ${new Date(diag.date).toLocaleTimeString()}\n`;
                diagText += `🚗 ${diag.carNumber}\n`;
                diagText += `📞 ${diag.phone}\n\n`;
                diagText += `📝 **Bajarilgan ishlar:**\n${diag.workDescription}\n\n`;
                
                if (diag.additionalNotes) {
                    diagText += `➕ **Qo'shimcha:**\n${diag.additionalNotes}\n\n`;
                }
                
                diagText += `💰 Narx: ${diag.price.toLocaleString()} so'm\n`;
                diagText += `${diag.isFree ? '🎉 BEPUL' : '💵 To\'lovli'}\n`;
                diagText += `━━━━━━━━━━━━━━━━━━\n`;
                
                await bot.sendMessage(chatId, diagText, { parse_mode: 'Markdown' });
            }
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
loadDiagnostics();

console.log('='.repeat(60));
console.log('🚗 ISUZU DOCTOR BOT ISHGA TUSHDI');
console.log('='.repeat(60));
console.log(`👑 Admin telefon: ${ADMIN_PHONE}`);
console.log(`💰 Diagnostika narxi: ${DIAGNOSTIC_PRICE.toLocaleString()} so'm`);
console.log(`👥 Foydalanuvchilar: ${users.filter(u => !u.isAdmin).length}`);
console.log(`🔧 Diagnostikalar: ${diagnostics.length}`);
console.log('='.repeat(60));

console.log('✅ Bot ishlashga tayyor!');
