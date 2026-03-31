/**
 * Database Module - SQLite 連線與資料表初始化
 * 
 * 資料表:
 * 1. Users - 學生帳號資料
 * 2. QuestionLogs - 作答紀錄
 * 3. StudentStats - 學生各標籤統計資料
 */

const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'adaptive_math.db');

// 確保 data 目錄存在
const fs = require('fs');
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// 建立資料庫連線
const db = new Database(DB_PATH);

// 啟用 WAL 模式以提升效能
db.pragma('journal_mode = WAL');
// 啟用外鍵約束
db.pragma('foreign_keys = ON');

/**
 * 初始化資料表
 */
function initializeDatabase() {
    // ========================================
    // 1. Users 表 - 學生帳號資料
    // ========================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS Users (
            StudentID TEXT PRIMARY KEY,
            Name TEXT NOT NULL,
            PasswordHash TEXT NOT NULL,
            Role TEXT DEFAULT 'student'
        )
    `);

    // 檢查欄位是否存在，若舊表沒有 Role 則自動加上 (簡單遷移)
    try {
        const tableInfo = db.pragma('table_info(Users)');
        if (!tableInfo.some(col => col.name === 'Role')) {
            db.exec(`ALTER TABLE Users ADD COLUMN Role TEXT DEFAULT 'student'`);
        }
    } catch (e) {
        console.error('檢查/更新 Users 表欄位時發生錯誤:', e);
    }

    // ========================================
    // 2. QuestionLogs 表 - 作答紀錄
    // ========================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS QuestionLogs (
            LogID INTEGER PRIMARY KEY AUTOINCREMENT,
            StudentID TEXT NOT NULL,
            Tag TEXT NOT NULL,
            QuestionText TEXT NOT NULL,
            CorrectAnswer REAL NOT NULL,
            UserAnswer REAL,
            IsCorrect INTEGER DEFAULT 0,
            TimeTaken REAL DEFAULT 0,
            Timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (StudentID) REFERENCES Users(StudentID)
        )
    `);

    // ========================================
    // 3. StudentStats 表 - 學生各標籤統計資料
    // ========================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS StudentStats (
            StudentID TEXT NOT NULL,
            Tag TEXT NOT NULL,
            TotalAttempted INTEGER DEFAULT 0,
            TotalCorrect INTEGER DEFAULT 0,
            AccuracyRate REAL DEFAULT 0.0,
            PRIMARY KEY (StudentID, Tag),
            FOREIGN KEY (StudentID) REFERENCES Users(StudentID)
        )
    `);

    // 建立索引以加速查詢
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_questionlogs_student 
        ON QuestionLogs(StudentID);
        
        CREATE INDEX IF NOT EXISTS idx_questionlogs_tag 
        ON QuestionLogs(StudentID, Tag);
        
        CREATE INDEX IF NOT EXISTS idx_questionlogs_timestamp 
        ON QuestionLogs(Timestamp);
    `);

    console.log('✅ 資料庫資料表初始化完成');
}

/**
 * 建立預設測試帳號
 */
function seedDefaultUsers() {
    const insertUser = db.prepare(`
        INSERT OR IGNORE INTO Users (StudentID, Name, PasswordHash, Role)
        VALUES (?, ?, ?, ?)
    `);

    const defaultUsers = [
        { id: 'S001', name: '王小明', password: '123456', role: 'student' },
        { id: 'S002', name: '李小華', password: '123456', role: 'student' },
        { id: 'S003', name: '張小美', password: '123456', role: 'student' },
        { id: 'S004', name: '陳大偉', password: '123456', role: 'student' },
        { id: 'S005', name: '林小芬', password: '123456', role: 'student' },
        { id: 'T001', name: '孔子老師', password: '123456', role: 'teacher' }, // 預設教師
    ];

    const insertMany = db.transaction((users) => {
        for (const user of users) {
            const hash = bcrypt.hashSync(user.password, 10);
            insertUser.run(user.id, user.name, hash, user.role);
        }
    });

    insertMany(defaultUsers);
    console.log('✅ 預設測試帳號建立完成 (S001~S005, 教師: T001, 密碼: 123456)');
}

/**
 * 初始化學生的 StudentStats（為每個學生建立所有標籤的初始記錄）
 */
function initializeStudentStats() {
    const allTags = [
        'add_2d_nc',       // 兩位數加法 (無進位)
        'add_2d_c',        // 兩位數加法 (有進位)
        'sub_2d_b',        // 兩位數減法 (有退位)
        'sub_3d_z_mid',    // 三位數減法 (跨零退位)
        'mul_2x2_nc_nc',   // 兩位乘兩位 (無進位)
        'mul_2x2_c_c',     // 兩位乘兩位 (有進位)
        'div_3d_1d_z0_mid', // 三位數除以一位數 (商中間有零)
        'div_3d_1d_z0_end', // 三位數除以一位數 (商尾數有零)
    ];

    const insertStats = db.prepare(`
        INSERT OR IGNORE INTO StudentStats (StudentID, Tag, TotalAttempted, TotalCorrect, AccuracyRate)
        VALUES (?, ?, 0, 0, 0.0)
    `);

    const users = db.prepare(`SELECT StudentID FROM Users WHERE Role = 'student'`).all();

    const initStats = db.transaction(() => {
        for (const user of users) {
            for (const tag of allTags) {
                insertStats.run(user.StudentID, tag);
            }
        }
    });

    initStats();
    console.log('✅ 學生統計資料初始化完成');
}

// ========================================
// 執行初始化
// ========================================
initializeDatabase();
seedDefaultUsers();
initializeStudentStats();

module.exports = db;
