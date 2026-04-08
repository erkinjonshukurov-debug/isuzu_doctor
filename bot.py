from telegram import Update, ReplyKeyboardMarkup, KeyboardButton, ReplyKeyboardRemove, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes, MessageHandler, filters, ConversationHandler, CallbackQueryHandler
import sqlite3
import os
import shutil
from datetime import datetime

# Conversation holatlari
PHONE_NUMBER, CAR_NUMBER, PHOTO = range(3)
ADMIN_SELECT_USER, ADMIN_SELECT_CAR, ADMIN_DIAG_TYPE, ADMIN_DIAG_DESCRIPTION = range(5, 9)
ADMIN_ERROR_TYPE = 9
WAITING_FOR_ERROR = 10
ADMIN_SEARCH_CAR = 11

# Diagnostika narxi
DIAG_COST = 250000

# Admin telefon raqami
ADMIN_PHONE = "+998979247888"

# Admin ID
ADMIN_USER_ID = 1437230485

# Database fayl nomi
DB_FILE = 'users.db'
BACKUP_DIR = 'backups'

# Bot kolontituli
BOT_FOOTER = "\n\n" + "=" * 40 + "\n"
BOT_FOOTER += "🚗 Hurmatli mijoz,\n\n"
BOT_FOOTER += "Agar avtomobilingiz doimo soz, ishonchli va yo‘llarda sizni yarim yo‘lda qoldirmasligini istasangiz — unda unga faqat professional va malakali mutaxassislar xizmat ko‘rsatishi muhim.\n\n"
BOT_FOOTER += "🛠️ Sifatli xizmat — bu nafaqat qulaylik, balki sizning xavfsizligingiz kafolatidir.\n\n"
BOT_FOOTER += "✅ Shuning uchun avtomobilingizni haqiqiy professionallarga ishonib topshiring!\n"
BOT_FOOTER += "=" * 40

# ================ TUGMALAR (KEYBOARDS) ================

def get_user_keyboard():
    keyboard = [
        [KeyboardButton("📊 Mening sahifam")],
        [KeyboardButton("🎁 Mening bonuslarim")],
        [KeyboardButton("📜 Diagnostika tarixi")],
        [KeyboardButton("❌ Asosiy menyu")]
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True)

def get_admin_keyboard():
    keyboard = [
        [KeyboardButton("📊 Mening sahifam"), KeyboardButton("🎁 Mening bonuslarim")],
        [KeyboardButton("📜 Diagnostika tarixi"), KeyboardButton("📊 Statistika")],
        [KeyboardButton("👥 Barcha foydalanuvchilar"), KeyboardButton("📅 Bugungi diagnostikalar")],
        [KeyboardButton("🔍 Avtomobil qidirish"), KeyboardButton("➕ Diagnostika qo'shish")],
        [KeyboardButton("⚠️ Xatolik qo'shish"), KeyboardButton("💾 Backup yaratish")],
        [KeyboardButton("🔄 Database tiklash"), KeyboardButton("❌ Asosiy menyu")]
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True)

# ================ OUTLINE FUNKSIYALARI ================

def create_outline(title, content, icon="📌"):
    result = f"{icon} {title} {icon}\n"
    result += "-" * 50 + "\n"
    for line_text in content.split('\n'):
        result += f"{line_text}\n"
    result += "-" * 50
    return result

def create_info_box(title, info_dict, icon="ℹ️"):
    result = f"{icon} {title} {icon}\n"
    result += "-" * 50 + "\n"
    for key, value in info_dict.items():
        result += f"{key}: {value}\n"
    result += "-" * 50
    return result

def add_footer(text):
    return text + BOT_FOOTER

# ================ DATABASE FUNKSIYALARI ================

def create_backup_dir():
    if not os.path.exists(BACKUP_DIR):
        os.makedirs(BACKUP_DIR)

def create_backup():
    try:
        create_backup_dir()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = os.path.join(BACKUP_DIR, f"users_backup_{timestamp}.db")
        if os.path.exists(DB_FILE):
            shutil.copy2(DB_FILE, backup_file)
            backups = sorted([f for f in os.listdir(BACKUP_DIR) if f.startswith("users_backup_")])
            while len(backups) > 10:
                os.remove(os.path.join(BACKUP_DIR, backups.pop(0)))
            return backup_file
        return None
    except Exception as e:
        print(f"Backup xatolik: {e}")
        return None

def restore_from_backup():
    try:
        if not os.path.exists(BACKUP_DIR):
            return False
        backups = sorted([f for f in os.listdir(BACKUP_DIR) if f.startswith("users_backup_")], reverse=True)
        if backups:
            latest_backup = os.path.join(BACKUP_DIR, backups[0])
            shutil.copy2(latest_backup, DB_FILE)
            return True
        return False
    except Exception as e:
        print(f"Restore xatolik: {e}")
        return False

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (user_id INTEGER PRIMARY KEY,
                  phone_number TEXT,
                  car_number TEXT,
                  photo_path TEXT,
                  is_active BOOLEAN,
                  registered_date TEXT,
                  bonus_count INTEGER DEFAULT 0,
                  free_diagnostics INTEGER DEFAULT 0,
                  is_admin BOOLEAN DEFAULT 0,
                  total_diagnostics INTEGER DEFAULT 0)''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS diagnostics_history
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER,
                  car_number TEXT,
                  diagnostic_date TEXT,
                  work_done TEXT,
                  cost INTEGER,
                  is_free BOOLEAN DEFAULT 0)''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS error_history
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER,
                  car_number TEXT,
                  error_date TEXT,
                  error_code TEXT,
                  error_description TEXT,
                  status TEXT DEFAULT 'pending')''')
    
    conn.commit()
    conn.close()

def get_phone_keyboard():
    keyboard = [[KeyboardButton("📱 Telefon raqamini yuborish", request_contact=True)]]
    return ReplyKeyboardMarkup(keyboard, one_time_keyboard=True, resize_keyboard=True)

def is_admin_user(phone_number):
    return phone_number == ADMIN_PHONE

def find_user_by_car_number(car_number):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT user_id, phone_number, car_number, registered_date FROM users WHERE car_number LIKE ? AND is_admin = 0", (f'%{car_number}%',))
    result = c.fetchone()
    conn.close()
    return result

async def notify_admin(context, message):
    try:
        await context.bot.send_message(chat_id=ADMIN_USER_ID, text=add_footer(message))
    except Exception as e:
        print(f"Admin xabar xatolik: {e}")

async def is_admin_by_id(user_id):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT is_admin FROM users WHERE user_id = ?", (user_id,))
    result = c.fetchone()
    conn.close()
    return result and result[0] == 1

# ================ ASOSIY KOMANDALAR ================

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT is_active, is_admin, phone_number FROM users WHERE user_id = ?", (user_id,))
    user = c.fetchone()
    conn.close()
    
    if user:
        if user[1] == 1:
            welcome = create_outline("ADMIN PANEL", "Xush kelibsiz! Quyidagi tugmalardan foydalaning", "👑")
            await update.message.reply_text(add_footer(welcome), reply_markup=get_admin_keyboard())
        else:
            welcome = create_outline("ISUZU USER", "Xush kelibsiz! Quyidagi tugmalardan foydalaning", "🚗")
            await update.message.reply_text(add_footer(welcome), reply_markup=get_user_keyboard())
        return ConversationHandler.END
    else:
        await update.message.reply_text(add_footer(
            "🚗 ISUZU USER aktivlashtirish tizimiga xush kelibsiz!\n\n"
            "Ro'yxatdan o'tish uchun telefon raqamingizni yuboring 📱"
        ), reply_markup=get_phone_keyboard())
        return PHONE_NUMBER

async def get_phone_number(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if update.message.contact:
        phone_number = update.message.contact.phone_number
    else:
        phone_number = update.message.text
    if not phone_number.startswith('+'):
        phone_number = '+' + phone_number
    context.user_data['phone_number'] = phone_number
    
    if is_admin_user(phone_number):
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute('''INSERT OR REPLACE INTO users 
                     (user_id, phone_number, car_number, photo_path, is_active, registered_date, bonus_count, free_diagnostics, is_admin, total_diagnostics)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                  (user_id, phone_number, "ADMIN", "ADMIN", True,
                   datetime.now().strftime("%Y-%m-%d %H:%M:%S"), 0, 0, 1, 0))
        conn.commit()
        conn.close()
        welcome = create_outline("ADMIN PANEL", f"Telefon: {phone_number}\nSiz ADMIN sifatida kirdingiz", "👑")
        await update.message.reply_text(add_footer(welcome), reply_markup=get_admin_keyboard())
        return ConversationHandler.END
    
    await update.message.reply_text(add_footer(
        f"✅ Telefon raqamingiz qabul qilindi: {phone_number}\n\nEndi avtomobil raqamini kiriting:"
    ), reply_markup=ReplyKeyboardRemove())
    return CAR_NUMBER

async def get_car_number(update: Update, context: ContextTypes.DEFAULT_TYPE):
    car_number = update.message.text.upper()
    context.user_data['car_number'] = car_number
    await update.message.reply_text(add_footer(
        f"✅ Avtomobil raqami qabul qilindi: {car_number}\n\nEndi avtomobil rasmini yuboring (1 ta rasm):"
    ))
    return PHOTO

async def get_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    photo_file = await update.message.photo[-1].get_file()
    if not os.path.exists('user_photos'):
        os.makedirs('user_photos')
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    photo_path = f"user_photos/{user_id}_{timestamp}.jpg"
    await photo_file.download_to_drive(photo_path)
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''INSERT OR REPLACE INTO users 
                 (user_id, phone_number, car_number, photo_path, is_active, registered_date, bonus_count, free_diagnostics, is_admin, total_diagnostics)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
              (user_id, context.user_data['phone_number'], context.user_data['car_number'],
               photo_path, True, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), 0, 0, 0, 0))
    conn.commit()
    conn.close()
    
    result = create_outline("RO'YXATDAN O'TDI", "Siz muvaffaqiyatli ro'yxatdan o'tdingiz!", "✅")
    bonus = create_outline("BONUS TIZIMI", "Har 5 diagnostikada 1 diagnostika BEPUL!", "🎁")
    await update.message.reply_text(add_footer(f"{result}\n\n{bonus}"), reply_markup=get_user_keyboard())
    return ConversationHandler.END

# ================ FOYDALANUVCHI FUNKSIYALARI ================

async def my_page(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    try:
        c.execute("SELECT phone_number, car_number, registered_date, bonus_count, free_diagnostics, is_admin FROM users WHERE user_id = ?", (user_id,))
        user = c.fetchone()
        if not user:
            await update.message.reply_text(add_footer(create_outline("XATOLIK", "Malumot topilmadi! /start bosing", "❌")))
            conn.close()
            return
        c.execute("SELECT COUNT(*) FROM diagnostics_history WHERE user_id = ?", (user_id,))
        diag_count = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM error_history WHERE user_id = ?", (user_id,))
        error_count = c.fetchone()[0]
        c.execute("SELECT work_done, diagnostic_date, is_free FROM diagnostics_history WHERE user_id = ? ORDER BY id DESC LIMIT 1", (user_id,))
        last_diag = c.fetchone()
        phone, car_number, reg_date, bonus_count, free_diagnostics, is_admin_user = user
        
        info_dict = {
            "🚗 Avtomobil": car_number, "📞 Telefon": phone, "📅 Ro'yxatdan o'tgan": reg_date,
            "🎁 Diagnostika soni": f"{bonus_count}/5", "🎉 Bepul diagnostikalar": f"{free_diagnostics} ta",
            "📊 Jami diagnostikalar": f"{diag_count} ta"
        }
        if error_count > 0:
            info_dict["⚠️ Xatoliklar soni"] = f"{error_count} ta"
        
        result = create_outline("MENGING SAHIFAM", f"Xush kelibsiz {car_number}!", "📊")
        info = create_info_box("MA'LUMOTLAR", info_dict, "📋")
        message = f"{result}\n\n{info}"
        if last_diag:
            work_done, diag_date, is_free = last_diag
            status_text = "BEPUL" if is_free else "To'lovli"
            message += f"\n\n{create_outline('OXIRGI DIAGNOSTIKA', f'Sana: {diag_date}\nIshlar: {work_done[:50]}...\nHolat: {status_text}', '📝')}"
        keyboard = get_admin_keyboard() if is_admin_user else get_user_keyboard()
        await update.message.reply_text(add_footer(message), reply_markup=keyboard)
    except Exception as e:
        print(f"MyPage xatolik: {e}")
        await update.message.reply_text(add_footer(create_outline("XATOLIK", "Xatolik yuz berdi", "❌")))
    finally:
        conn.close()

async def my_bonus(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT bonus_count, free_diagnostics, is_admin FROM users WHERE user_id = ?", (user_id,))
    user = c.fetchone()
    conn.close()
    if user:
        bonus_count, free_diagnostics, is_admin_user = user
        next_free = 5 - bonus_count
        info_dict = {"📊 Joriy diagnostika soni": f"{bonus_count}/5", "🎉 Bepul diagnostikalar": f"{free_diagnostics} ta"}
        if next_free > 0 and next_free < 5:
            info_dict["📌 Keyingi BEPUL"] = f"{next_free} ta diagnostikadan keyin"
        result = create_outline("MENGING BONUSLARIM", "Bonus tizimi ma'lumotlari", "🎁")
        info = create_info_box("MA'LUMOTLAR", info_dict, "📋")
        message = f"{result}\n\n{info}\n\n🎯 Qoida: Har 5 diagnostikada 1 ta BEPUL!"
        keyboard = get_admin_keyboard() if is_admin_user else get_user_keyboard()
        await update.message.reply_text(add_footer(message), reply_markup=keyboard)
    else:
        await update.message.reply_text(add_footer(create_outline("XATOLIK", "Ro'yxatdan o'tmagan!", "❌")), reply_markup=get_user_keyboard())

async def diagnostic_history(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT is_admin FROM users WHERE user_id = ?", (user_id,))
    is_admin_user = c.fetchone()
    is_admin_user = is_admin_user[0] if is_admin_user else 0
    c.execute('''SELECT diagnostic_date, work_done, cost, is_free FROM diagnostics_history WHERE user_id = ? ORDER BY id DESC LIMIT 10''', (user_id,))
    history = c.fetchall()
    conn.close()
    if history:
        result = create_outline("DIAGNOSTIKA TARIXI", "Oxirgi 10 ta diagnostika", "📜")
        message = result + "\n\n"
        for i, h in enumerate(history, 1):
            status = "✅ BEPUL" if h[3] else f"💰 {h[2]:,} so'm"
            message += f"{i}. 📅 {h[0]}\n   📝 {h[1][:50]}...\n   {status}\n\n"
        keyboard = get_admin_keyboard() if is_admin_user else get_user_keyboard()
        await update.message.reply_text(add_footer(message), reply_markup=keyboard)
    else:
        await update.message.reply_text(add_footer(create_outline("DIAGNOSTIKA TARIXI", "Hali hech qanday diagnostika yoq!", "📭")))

# ================ ADMIN DIAGNOSTIKA QO'SHISH ================

async def admin_add_diagnostic_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not await is_admin_by_id(user_id):
        await update.message.reply_text(add_footer(create_outline("XATOLIK", "Siz admin emassiz!", "❌")))
        return ConversationHandler.END
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT user_id, phone_number, car_number FROM users WHERE is_admin = 0 AND is_active = 1")
    users = c.fetchall()
    conn.close()
    
    if not users:
        await update.message.reply_text(add_footer(create_outline("XATOLIK", "Hech qanday foydalanuvchi yoq!", "❌")), reply_markup=get_admin_keyboard())
        return ConversationHandler.END
    
    keyboard = []
    for user in users:
        keyboard.append([InlineKeyboardButton(f"{user[1]} - {user[2]}", callback_data=f"diag_user_{user[0]}")])
    keyboard.append([InlineKeyboardButton("❌ Bekor qilish", callback_data="diag_cancel")])
    
    await update.message.reply_text(
        create_outline("DIAGNOSTIKA QO'SHISH", "Foydalanuvchini tanlang", "➕"),
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return ADMIN_SELECT_USER

async def diag_select_user_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not await is_admin_by_id(user_id):
        return ConversationHandler.END
    
    query = update.callback_query
    await query.answer()
    
    if query.data == "diag_cancel":
        await query.edit_message_text(add_footer(create_outline("BEKOR QILINDI", "Jarayon bekor qilindi", "❌")))
        return ConversationHandler.END
    
    target_user_id = int(query.data.split("_")[2])
    context.user_data['admin_target_user'] = target_user_id
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT car_number FROM users WHERE user_id = ?", (target_user_id,))
    cars = c.fetchall()
    conn.close()
    
    if not cars:
        await query.edit_message_text(add_footer(create_outline("XATOLIK", "Avtomobil raqami topilmadi!", "❌")))
        return ConversationHandler.END
    
    keyboard = []
    for car in cars:
        keyboard.append([InlineKeyboardButton(f"🚗 {car[0]}", callback_data=f"diag_car_{car[0]}")])
    keyboard.append([InlineKeyboardButton("❌ Bekor qilish", callback_data="diag_cancel")])
    
    await query.edit_message_text(
        create_outline("AVTOMOBIL TANLASH", "Avtomobil raqamini tanlang", "🚗"),
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return ADMIN_SELECT_CAR

async def diag_select_car_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not await is_admin_by_id(user_id):
        return ConversationHandler.END
    
    query = update.callback_query
    await query.answer()
    
    if query.data == "diag_cancel":
        await query.edit_message_text(add_footer(create_outline("BEKOR QILINDI", "Jarayon bekor qilindi", "❌")))
        return ConversationHandler.END
    
    car_number = query.data.split("_")[2]
    context.user_data['admin_car_number'] = car_number
    
    keyboard = [
        [InlineKeyboardButton("🔧 Dvigatel", callback_data="diag_type_engine")],
        [InlineKeyboardButton("⚙️ Transmissiya", callback_data="diag_type_transmission")],
        [InlineKeyboardButton("🛞 Podveska", callback_data="diag_type_suspension")],
        [InlineKeyboardButton("🔌 Elektronika", callback_data="diag_type_electronics")],
        [InlineKeyboardButton("🩸 Yog' va filtrlar", callback_data="diag_type_oil")],
        [InlineKeyboardButton("❌ Bekor qilish", callback_data="diag_cancel")]
    ]
    
    await query.edit_message_text(
        create_outline("DIAGNOSTIKA TURI", f"Avtomobil: {car_number}\nDiagnostika turini tanlang", "🔧"),
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return ADMIN_DIAG_TYPE

async def diag_type_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not await is_admin_by_id(user_id):
        return ConversationHandler.END
    
    query = update.callback_query
    await query.answer()
    
    if query.data == "diag_cancel":
        await query.edit_message_text(add_footer(create_outline("BEKOR QILINDI", "Jarayon bekor qilindi", "❌")))
        return ConversationHandler.END
    
    diag_names = {
        "diag_type_engine": "🔧 Dvigatel diagnostikasi",
        "diag_type_transmission": "⚙️ Transmissiya diagnostikasi",
        "diag_type_suspension": "🛞 Podveska diagnostikasi",
        "diag_type_electronics": "🔌 Elektronika diagnostikasi",
        "diag_type_oil": "🩸 Yog' va filtrlar"
    }
    
    diag_name = diag_names.get(query.data, "Diagnostika")
    context.user_data['admin_diag_name'] = diag_name
    
    await query.edit_message_text(
        create_outline("DIAGNOSTIKA MA'LUMOTLARI", f"Tanlangan: {diag_name}\n\nIltimos, diagnostika natijasini va bajarilgan ishlarni yozing:", "📝")
    )
    return ADMIN_DIAG_DESCRIPTION

async def admin_get_description(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not await is_admin_by_id(user_id):
        return ConversationHandler.END
    
    target_user_id = context.user_data.get('admin_target_user')
    car_number = context.user_data.get('admin_car_number')
    diag_name = context.user_data.get('admin_diag_name')
    description = update.message.text
    cost = DIAG_COST
    
    if not target_user_id or not car_number or not diag_name:
        await update.message.reply_text(add_footer(create_outline("XATOLIK", "Ma'lumotlar yo'qolgan! Qaytadan urinib ko'ring", "❌")))
        return ConversationHandler.END
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT bonus_count, free_diagnostics FROM users WHERE user_id = ?", (target_user_id,))
    user = c.fetchone()
    
    if not user:
        await update.message.reply_text(add_footer(create_outline("XATOLIK", "Foydalanuvchi topilmadi!", "❌")))
        conn.close()
        return ConversationHandler.END
    
    bonus_count, free_diagnostics = user
    is_free = False
    bonus_message = ""
    
    if free_diagnostics > 0:
        is_free = True
        free_diagnostics -= 1
        new_bonus_count = bonus_count
        bonus_message = "🎉 Siz BEPUL diagnostikadan foydalandingiz!"
    else:
        new_bonus_count = bonus_count + 1
        if new_bonus_count >= 5:
            free_diagnostics += 1
            new_bonus_count = 0
            bonus_message = "🎉🎉🎉 TABRIKLAYMIZ! 5-diagnostikani tugatdingiz va 1 ta BEPUL diagnostika qozondingiz!"
    
    c.execute('''INSERT INTO diagnostics_history 
                 (user_id, car_number, diagnostic_date, work_done, cost, is_free)
                 VALUES (?, ?, ?, ?, ?, ?)''',
              (target_user_id, car_number,
               datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
               f"{diag_name}: {description}", 0 if is_free else cost, is_free))
    
    c.execute('''UPDATE users 
                 SET bonus_count = ?, free_diagnostics = ?, total_diagnostics = total_diagnostics + 1
                 WHERE user_id = ?''',
              (new_bonus_count, free_diagnostics, target_user_id))
    
    conn.commit()
    conn.close()
    
    price_text = "BEPUL 🎉" if is_free else f"{cost:,} so'm"
    
    info_dict = {
        "👤 Foydalanuvchi ID": f"{target_user_id}",
        "🚗 Avtomobil": car_number,
        "🔧 Turi": diag_name,
        "📝 Ishlar": description[:40] + "...",
        "💰 Narxi": price_text,
        "🎁 Yangi bonus": f"{new_bonus_count}/5",
        "🎉 Bepul": f"{free_diagnostics} ta"
    }
    
    result = create_outline("DIAGNOSTIKA QO'SHILDI", "Muvaffaqiyatli qo'shildi!", "✅")
    info = create_info_box("MA'LUMOTLAR", info_dict, "📋")
    
    await update.message.reply_text(add_footer(f"{result}\n\n{info}\n\n{bonus_message}"), reply_markup=get_admin_keyboard())
    
    try:
        await context.bot.send_message(
            chat_id=target_user_id,
            text=add_footer(
                f"🔧 Yangi diagnostika qo'shildi!\n\n"
                f"🚗 Avtomobil: {car_number}\n"
                f"🔧 Turi: {diag_name}\n"
                f"📝 Ishlar: {description}\n"
                f"💰 Narxi: {price_text}\n\n"
                f"{bonus_message}"
            )
        )
    except:
        pass
    
    # Ma'lumotlarni tozalash
    context.user_data.pop('admin_target_user', None)
    context.user_data.pop('admin_car_number', None)
    context.user_data.pop('admin_diag_name', None)
    
    return ConversationHandler.END

# ================ ADMIN AVTOMOBIL QIDIRISH ================

async def admin_search_car(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not await is_admin_by_id(user_id):
        return
    
    await update.message.reply_text(
        create_outline("AVTOMOBIL QIDIRISH", "Iltimos, qidirmoqchi bo'lgan avtomobil raqamini kiriting:\n\nMasalan: 01A777AA yoki 777", "🔍"),
        reply_markup=ReplyKeyboardRemove()
    )
    return ADMIN_SEARCH_CAR

async def admin_search_car_number(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not await is_admin_by_id(user_id):
        return ConversationHandler.END
    
    search_text = update.message.text.upper().strip()
    if len(search_text) < 2:
        await update.message.reply_text(add_footer(create_outline("XATOLIK", "Kamida 2 ta belgi kiriting!", "❌")), reply_markup=get_admin_keyboard())
        return ConversationHandler.END
    
    user = find_user_by_car_number(search_text)
    
    if user:
        target_user_id, phone, car_number, reg_date = user
        
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM diagnostics_history WHERE user_id = ?", (target_user_id,))
        diag_count = c.fetchone()[0]
        c.execute("SELECT diagnostic_date, work_done, is_free FROM diagnostics_history WHERE user_id = ? ORDER BY id DESC LIMIT 3", (target_user_id,))
        last_diags = c.fetchall()
        conn.close()
        
        info_dict = {
            "🆔 User ID": f"{target_user_id}", "🚗 Avtomobil": car_number,
            "📞 Telefon": phone, "📅 Ro'yxatdan o'tgan": reg_date, "📊 Jami diagnostika": f"{diag_count} ta"
        }
        
        result = create_outline("AVTOMOBIL TOPILDI", f"'{search_text}' bo'yicha natija", "✅")
        info = create_info_box("MA'LUMOTLAR", info_dict, "📋")
        message = f"{result}\n\n{info}\n\n"
        
        if last_diags:
            message += f"📝 Oxirgi 3 diagnostika:\n"
            for i, d in enumerate(last_diags, 1):
                status = "BEPUL" if d[2] else "To'lovli"
                message += f"{i}. {d[0]} - {status}\n   {d[1][:40]}...\n\n"
        
        keyboard = [
            [InlineKeyboardButton(f"➕ {car_number} ga diagnostika qo'shish", callback_data=f"search_diag_{target_user_id}_{car_number}")],
            [InlineKeyboardButton("❌ Bekor qilish", callback_data="search_cancel")]
        ]
        
        await update.message.reply_text(add_footer(message), reply_markup=InlineKeyboardMarkup(keyboard))
    else:
        not_found = create_outline("AVTOMOBIL TOPILMADI", f"'{search_text}' raqamli avtomobil topilmadi!\n\n💡 Avtomobil avval ro'yxatdan o'tgan bo'lishi kerak.\n📌 Ro'yxatdan o'tish uchun /start bosing", "❌")
        await update.message.reply_text(add_footer(not_found), reply_markup=get_admin_keyboard())
    
    return ConversationHandler.END

async def search_diag_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not await is_admin_by_id(user_id):
        return
    
    query = update.callback_query
    await query.answer()
    
    if query.data == "search_cancel":
        await query.edit_message_text(add_footer(create_outline("BEKOR QILINDI", "Jarayon bekor qilindi", "❌")))
        return ConversationHandler.END
    
    parts = query.data.split("_")
    target_user_id = int(parts[2])
    car_number = parts[3]
    
    context.user_data['admin_target_user'] = target_user_id
    context.user_data['admin_car_number'] = car_number
    
    keyboard = [
        [InlineKeyboardButton("🔧 Dvigatel", callback_data="diag_type_engine")],
        [InlineKeyboardButton("⚙️ Transmissiya", callback_data="diag_type_transmission")],
        [InlineKeyboardButton("🛞 Podveska", callback_data="diag_type_suspension")],
        [InlineKeyboardButton("🔌 Elektronika", callback_data="diag_type_electronics")],
        [InlineKeyboardButton("🩸 Yog' va filtrlar", callback_data="diag_type_oil")],
        [InlineKeyboardButton("❌ Bekor qilish", callback_data="diag_cancel")]
    ]
    
    await query.edit_message_text(
        create_outline("DIAGNOSTIKA QO'SHISH", f"Avtomobil: {car_number}\nDiagnostika turini tanlang", "🔧"),
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return ADMIN_DIAG_TYPE

# ================ ADMIN BOSHQA FUNKSIYALAR ================

async def admin_all_users(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not await is_admin_by_id(user_id):
        return
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT user_id, phone_number, car_number, registered_date, bonus_count, free_diagnostics FROM users WHERE is_admin = 0 AND is_active = 1")
    users = c.fetchall()
    conn.close()
    if users:
        result = create_outline("BARCHA FOYDALANUVCHILAR", f"Jami: {len(users)} ta foydalanuvchi", "👥")
        message = result + "\n\n"
        for i, user in enumerate(users, 1):
            message += f"{i}. 🆔 ID: {user[0]}\n   📞 {user[1]}\n   🚘 {user[2]}\n   📅 {user[3]}\n   🎁 {user[4]}/5 | Bepul: {user[5]}\n\n"
            if len(message) > 3500:
                await update.message.reply_text(add_footer(message), reply_markup=get_admin_keyboard())
                message = ""
        if message:
            await update.message.reply_text(add_footer(message), reply_markup=get_admin_keyboard())
    else:
        await update.message.reply_text(add_footer(create_outline("FOYDALANUVCHILAR", "Hech qanday foydalanuvchi yoq", "📭")), reply_markup=get_admin_keyboard())

async def admin_today(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not await is_admin_by_id(user_id):
        return
    today = datetime.now().strftime("%Y-%m-%d")
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''SELECT d.id, u.car_number, u.phone_number, d.work_done, d.diagnostic_date, d.is_free
                 FROM diagnostics_history d JOIN users u ON d.user_id = u.user_id
                 WHERE date(d.diagnostic_date) = ? ORDER BY d.id DESC''', (today,))
    diags = c.fetchall()
    conn.close()
    if diags:
        result = create_outline("BUGUNGI DIAGNOSTIKALAR", f"Sana: {today}", "📊")
        message = result + "\n\n"
        for diag in diags:
            status = "✅ BEPUL" if diag[5] else f"💰 {DIAG_COST:,} so'm"
            message += f"#{diag[0]} - 🚗 {diag[1]}\n   📞 {diag[2]}\n   📝 {diag[3][:40]}...\n   {status}\n\n"
        await update.message.reply_text(add_footer(message), reply_markup=get_admin_keyboard())
    else:
        await update.message.reply_text(add_footer(create_outline("BUGUNGI DIAGNOSTIKALAR", "Bugun hech qanday diagnostika yoq", "📭")), reply_markup=get_admin_keyboard())

async def admin_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not await is_admin_by_id(user_id):
        return
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM users WHERE is_admin = 0 AND is_active = 1")
    total_users = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM diagnostics_history")
    total_diagnostics = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM diagnostics_history WHERE is_free = 1")
    free_diagnostics = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM error_history")
    total_errors = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM error_history WHERE status = 'pending'")
    pending_errors = c.fetchone()[0]
    today = datetime.now().strftime("%Y-%m-%d")
    c.execute("SELECT COUNT(*) FROM diagnostics_history WHERE date(diagnostic_date) = ?", (today,))
    today_diag = c.fetchone()[0]
    conn.close()
    
    info_dict = {
        "👥 Foydalanuvchilar": f"{total_users}", "🔧 Jami diagnostika": f"{total_diagnostics}",
        "✅ Bepul diagnostika": f"{free_diagnostics}", "💰 To'lovli": f"{total_diagnostics - free_diagnostics}",
        "⚠️ Jami xatoliklar": f"{total_errors}", "⏳ Kutilayotgan xatoliklar": f"{pending_errors}",
        "📅 Bugungi diagnostika": f"{today_diag}", "💰 Diagnostika narxi": f"{DIAG_COST:,} so'm"
    }
    result = create_outline("BOT STATISTIKASI", "Umumiy ma'lumotlar", "📊")
    info = create_info_box("ASOSIY MA'LUMOTLAR", info_dict, "📋")
    await update.message.reply_text(add_footer(f"{result}\n\n{info}"), reply_markup=get_admin_keyboard())

async def admin_add_error(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not await is_admin_by_id(user_id):
        return
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT user_id, phone_number, car_number FROM users WHERE is_admin = 0 AND is_active = 1")
    users = c.fetchall()
    conn.close()
    
    if not users:
        await update.message.reply_text(add_footer(create_outline("XATOLIK", "Hech qanday foydalanuvchi yoq!", "❌")), reply_markup=get_admin_keyboard())
        return ConversationHandler.END
    
    keyboard = []
    for user in users:
        keyboard.append([InlineKeyboardButton(f"{user[1]} - {user[2]}", callback_data=f"error_user_{user[0]}")])
    keyboard.append([InlineKeyboardButton("❌ Bekor qilish", callback_data="error_cancel")])
    
    await update.message.reply_text(
        create_outline("XATOLIK QO'SHISH", "Foydalanuvchini tanlang", "⚠️"),
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return ADMIN_ERROR_TYPE

async def admin_select_error_user_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not await is_admin_by_id(user_id):
        return ConversationHandler.END
    
    query = update.callback_query
    await query.answer()
    
    if query.data == "error_cancel":
        await query.edit_message_text(add_footer(create_outline("BEKOR QILINDI", "Jarayon bekor qilindi", "❌")))
        return ConversationHandler.END
    
    target_user_id = int(query.data.split("_")[2])
    context.user_data['error_target_user'] = target_user_id
    
    await query.edit_message_text(
        create_outline("XATOLIK MA'LUMOTLARI", "Format: [KOD] [Tavsif]\nMisol: P0301 1-silindrda uzilish", "⚠️")
    )
    return WAITING_FOR_ERROR

async def admin_get_error(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not await is_admin_by_id(user_id):
        return ConversationHandler.END
    
    target_user_id = context.user_data.get('error_target_user')
    if not target_user_id:
        await update.message.reply_text(add_footer(create_outline("XATOLIK", "Ma'lumotlar yo'qolgan!", "❌")))
        return ConversationHandler.END
    
    error_text = update.message.text
    parts = error_text.split(' ', 1)
    if len(parts) < 2:
        await update.message.reply_text(add_footer(create_outline("XATOLIK", "Noto'g'ri format!\n\nFormat: [KOD] [Tavsif]\nMisol: P0301 1-silindrda uzilish", "❌")))
        return WAITING_FOR_ERROR
    
    error_code = parts[0].upper()
    error_description = parts[1]
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT car_number FROM users WHERE user_id = ?", (target_user_id,))
    car = c.fetchone()
    car_number = car[0] if car else "Noma'lum"
    
    c.execute('''INSERT INTO error_history (user_id, car_number, error_date, error_code, error_description, status)
                 VALUES (?, ?, ?, ?, ?, ?)''', 
              (target_user_id, car_number, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), 
               error_code, error_description, "pending"))
    conn.commit()
    conn.close()
    
    info_dict = {
        "👤 Foydalanuvchi ID": f"{target_user_id}", 
        "🚗 Avtomobil": car_number, 
        "🔴 Xatolik kodi": error_code, 
        "📝 Tavsif": error_description, 
        "⏳ Holat": "Kutilmoqda"
    }
    result = create_outline("XATOLIK QO'SHILDI", "Muvaffaqiyatli qo'shildi!", "✅")
    info = create_info_box("MA'LUMOTLAR", info_dict, "⚠️")
    await update.message.reply_text(add_footer(f"{result}\n\n{info}"), reply_markup=get_admin_keyboard())
    
    try:
        await context.bot.send_message(
            chat_id=target_user_id, 
            text=add_footer(f"⚠️ Yangi xatolik qayd etildi!\n\n🚗 Avtomobil: {car_number}\n🔴 Xatolik kodi: {error_code}\n📝 Tavsif: {error_description}")
        )
    except:
        pass
    
    del context.user_data['error_target_user']
    return ConversationHandler.END

async def backup_database(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not await is_admin_by_id(user_id):
        return
    await update.message.reply_text(create_outline("BACKUP", "Database backup yaratilmoqda...", "💾"))
    backup_file = create_backup()
    if backup_file:
        result = create_outline("BACKUP YARATILDI", f"Fayl: {backup_file}\nVaqt: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", "✅")
        await update.message.reply_text(add_footer(result), reply_markup=get_admin_keyboard())
    else:
        await update.message.reply_text(add_footer(create_outline("XATOLIK", "Backup yaratishda xatolik yuz berdi!", "❌")), reply_markup=get_admin_keyboard())

async def restore_database(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not await is_admin_by_id(user_id):
        return
    await update.message.reply_text(create_outline("TIKLASH", "Database tiklanmoqda...", "🔄"))
    if restore_from_backup():
        result = create_outline("DATABASE TIKLANDI", f"Vaqt: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n⚠️ Botni qayta ishga tushiring!", "✅")
        await update.message.reply_text(add_footer(result), reply_markup=get_admin_keyboard())
    else:
        await update.message.reply_text(add_footer(create_outline("XATOLIK", "Hech qanday backup topilmadi!", "❌")), reply_markup=get_admin_keyboard())

async def back_to_main_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT is_admin FROM users WHERE user_id = ?", (user_id,))
    result = c.fetchone()
    conn.close()
    is_admin_user = result and result[0] == 1
    if is_admin_user:
        await update.message.reply_text(add_footer(create_outline("ASOSIY MENYU", "Quyidagi tugmalardan foydalaning", "🏠")), reply_markup=get_admin_keyboard())
    else:
        await update.message.reply_text(add_footer(create_outline("ASOSIY MENYU", "Quyidagi tugmalardan foydalaning", "🏠")), reply_markup=get_user_keyboard())

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(add_footer(create_outline("BEKOR QILINDI", "Jarayon bekor qilindi.\nQaytadan boshlash uchun /start bosing.", "❌")), reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

# ================ MATNLARNI QAYTA ISHLASH ================

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text
    if text == "📊 Mening sahifam":
        await my_page(update, context)
    elif text == "🎁 Mening bonuslarim":
        await my_bonus(update, context)
    elif text == "📜 Diagnostika tarixi":
        await diagnostic_history(update, context)
    elif text == "👥 Barcha foydalanuvchilar":
        await admin_all_users(update, context)
    elif text == "📅 Bugungi diagnostikalar":
        await admin_today(update, context)
    elif text == "📊 Statistika":
        await admin_stats(update, context)
    elif text == "🔍 Avtomobil qidirish":
        return await admin_search_car(update, context)
    elif text == "➕ Diagnostika qo'shish":
        return await admin_add_diagnostic_start(update, context)
    elif text == "⚠️ Xatolik qo'shish":
        return await admin_add_error(update, context)
    elif text == "💾 Backup yaratish":
        await backup_database(update, context)
    elif text == "🔄 Database tiklash":
        await restore_database(update, context)
    elif text == "❌ Asosiy menyu":
        await back_to_main_menu(update, context)
    else:
        await update.message.reply_text(add_footer(create_outline("TUSHUNARSIZ BUYRUK", "Iltimos, quyidagi tugmalardan foydalaning", "❌")))

# ================ BOTNI ISHGA TUSHIRISH ================

if __name__ == '__main__':
    print("=" * 60)
    print("🚗 ISUZU USER BOT ISHGA TUSHMOQDA")
    print("=" * 60)
    
    create_backup_dir()
    if os.path.exists(DB_FILE):
        print("📁 Mavjud database topildi")
        create_backup()
    else:
        print("📁 Yangi database yaratiladi")
        if restore_from_backup():
            print("✅ Backup dan tiklandi")
    
    init_db()
    
    # ================ BOTNI ISHGA TUSHIRISH ================

import os

if __name__ == '__main__':
    print("=" * 60)
    print("🚗 ISUZU USER BOT ISHGA TUSHMOQDA")
    print("=" * 60)
    
    create_backup_dir()
    if os.path.exists(DB_FILE):
        print("📁 Mavjud database topildi")
        create_backup()
    else:
        print("📁 Yangi database yaratiladi")
        if restore_from_backup():
            print("✅ Backup dan tiklandi")
    
    init_db()
    
    # Tokenni environment variable dan o'qish (XAVFSIZ)
    TOKEN = os.environ.get('BOT_TOKEN')
    if not TOKEN:
        print("❌ XATOLIK: BOT_TOKEN environment variable topilmadi!")
        print("👉 Railway'da Variables -> BOT_TOKEN = 8779251766:AAH12INusgBCawsk5awqIjcyHnNLiq5A33A")
        exit(1)
    
    app = ApplicationBuilder().token(TOKEN).build()
    
    # Conversation handlerlar
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler('start', start)],
        states={
            PHONE_NUMBER: [MessageHandler(filters.TEXT | filters.CONTACT, get_phone_number)],
            CAR_NUMBER: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_car_number)],
            PHOTO: [MessageHandler(filters.PHOTO, get_photo)],
        },
        fallbacks=[CommandHandler('cancel', cancel)],
    )
    
    admin_diag_handler = ConversationHandler(
        entry_points=[MessageHandler(filters.Regex('^➕ Diagnostika qo\'shish$'), admin_add_diagnostic_start)],
        states={
            ADMIN_SELECT_USER: [CallbackQueryHandler(diag_select_user_callback, pattern='^diag_user_|diag_cancel$')],
            ADMIN_SELECT_CAR: [CallbackQueryHandler(diag_select_car_callback, pattern='^diag_car_|diag_cancel$')],
            ADMIN_DIAG_TYPE: [CallbackQueryHandler(diag_type_callback, pattern='^diag_type_|diag_cancel$')],
            ADMIN_DIAG_DESCRIPTION: [MessageHandler(filters.TEXT & ~filters.COMMAND, admin_get_description)],
        },
        fallbacks=[CommandHandler('cancel', cancel)],
    )
    
    admin_error_handler = ConversationHandler(
        entry_points=[MessageHandler(filters.Regex('^⚠️ Xatolik qo\'shish$'), admin_add_error)],
        states={
            ADMIN_ERROR_TYPE: [CallbackQueryHandler(admin_select_error_user_callback, pattern='^error_user_|error_cancel$')],
            WAITING_FOR_ERROR: [MessageHandler(filters.TEXT & ~filters.COMMAND, admin_get_error)],
        },
        fallbacks=[CommandHandler('cancel', cancel)],
    )
    
    admin_search_handler = ConversationHandler(
        entry_points=[MessageHandler(filters.Regex('^🔍 Avtomobil qidirish$'), admin_search_car)],
        states={
            ADMIN_SEARCH_CAR: [MessageHandler(filters.TEXT & ~filters.COMMAND, admin_search_car_number)],
        },
        fallbacks=[CommandHandler('cancel', cancel)],
    )
    
    # Handlerlarni qo'shish
    app.add_handler(conv_handler)
    app.add_handler(admin_diag_handler)
    app.add_handler(admin_error_handler)
    app.add_handler(admin_search_handler)
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.add_handler(CallbackQueryHandler(search_diag_callback, pattern='^search_diag_|search_cancel$'))
    
    print("=" * 60)
    print("🚗 ISUZU USER BOT ISHGA TUSHDI")
    print("=" * 60)
    print(f"💰 Diagnostika narxi: {DIAG_COST:,} so'm")
    print(f"👑 Admin telefon: {ADMIN_PHONE}")
    print(f"🆔 Admin ID: {ADMIN_USER_ID}")
    print("=" * 60)
    
    app.run_polling()
    
    # Conversation handlerlar
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler('start', start)],
        states={
            PHONE_NUMBER: [MessageHandler(filters.TEXT | filters.CONTACT, get_phone_number)],
            CAR_NUMBER: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_car_number)],
            PHOTO: [MessageHandler(filters.PHOTO, get_photo)],
        },
        fallbacks=[CommandHandler('cancel', cancel)],
    )
    
    admin_diag_handler = ConversationHandler(
        entry_points=[MessageHandler(filters.Regex('^➕ Diagnostika qo\'shish$'), admin_add_diagnostic_start)],
        states={
            ADMIN_SELECT_USER: [CallbackQueryHandler(diag_select_user_callback, pattern='^diag_user_|diag_cancel$')],
            ADMIN_SELECT_CAR: [CallbackQueryHandler(diag_select_car_callback, pattern='^diag_car_|diag_cancel$')],
            ADMIN_DIAG_TYPE: [CallbackQueryHandler(diag_type_callback, pattern='^diag_type_|diag_cancel$')],
            ADMIN_DIAG_DESCRIPTION: [MessageHandler(filters.TEXT & ~filters.COMMAND, admin_get_description)],
        },
        fallbacks=[CommandHandler('cancel', cancel)],
    )
    
    admin_error_handler = ConversationHandler(
        entry_points=[MessageHandler(filters.Regex('^⚠️ Xatolik qo\'shish$'), admin_add_error)],
        states={
            ADMIN_ERROR_TYPE: [CallbackQueryHandler(admin_select_error_user_callback, pattern='^error_user_|error_cancel$')],
            WAITING_FOR_ERROR: [MessageHandler(filters.TEXT & ~filters.COMMAND, admin_get_error)],
        },
        fallbacks=[CommandHandler('cancel', cancel)],
    )
    
    admin_search_handler = ConversationHandler(
        entry_points=[MessageHandler(filters.Regex('^🔍 Avtomobil qidirish$'), admin_search_car)],
        states={
            ADMIN_SEARCH_CAR: [MessageHandler(filters.TEXT & ~filters.COMMAND, admin_search_car_number)],
        },
        fallbacks=[CommandHandler('cancel', cancel)],
    )
    
    # Handlerlarni qo'shish
    app.add_handler(conv_handler)
    app.add_handler(admin_diag_handler)
    app.add_handler(admin_error_handler)
    app.add_handler(admin_search_handler)
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.add_handler(CallbackQueryHandler(search_diag_callback, pattern='^search_diag_|search_cancel$'))
    
    print("=" * 60)
    print("🚗 ISUZU USER BOT ISHGA TUSHDI")
    print("=" * 60)
    print(f"💰 Diagnostika narxi: {DIAG_COST:,} so'm")
    print(f"👑 Admin telefon: {ADMIN_PHONE}")
    print(f"🆔 Admin ID: {ADMIN_USER_ID}")
    print("=" * 60)
    
    app.run_polling()
