require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// 建立 PostgreSQL 連線池
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // 通常雲端 DB 需要 SSL
});

// 當前連線池錯誤處理
db.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

async function initializeDatabase() {
    try {
        // ========================================
        // 1. Users 表 - 學生帳號資料
        // ========================================
        await db.query(`
            CREATE TABLE IF NOT EXISTS Users (
                StudentID TEXT PRIMARY KEY,
                Name TEXT NOT NULL,
                PasswordHash TEXT NOT NULL,
                Role TEXT DEFAULT 'student'
            )
        `);

        // 將欄位加入如果已經有的情況
        try {
            await db.query(`ALTER TABLE Users ADD COLUMN IF NOT EXISTS Role TEXT DEFAULT 'student'`);
        } catch (e) {
            // ignore
        }

        // ========================================
        // 2. QuestionLogs 表 - 作答紀錄
        // ========================================
        await db.query(`
            CREATE TABLE IF NOT EXISTS QuestionLogs (
                LogID SERIAL PRIMARY KEY,
                StudentID TEXT NOT NULL REFERENCES Users(StudentID),
                Tag TEXT NOT NULL,
                QuestionText TEXT NOT NULL,
                CorrectAnswer REAL NOT NULL,
                UserAnswer REAL,
                IsCorrect INTEGER DEFAULT 0,
                TimeTaken REAL DEFAULT 0,
                Timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ========================================
        // 3. StudentStats 表 - 學生各標籤統計資料
        // ========================================
        await db.query(`
            CREATE TABLE IF NOT EXISTS StudentStats (
                StudentID TEXT NOT NULL REFERENCES Users(StudentID),
                Tag TEXT NOT NULL,
                TotalAttempted INTEGER DEFAULT 0,
                TotalCorrect INTEGER DEFAULT 0,
                AccuracyRate REAL DEFAULT 0.0,
                PRIMARY KEY (StudentID, Tag)
            )
        `);

        // 建立索引
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_questionlogs_student ON QuestionLogs(StudentID);
            CREATE INDEX IF NOT EXISTS idx_questionlogs_tag ON QuestionLogs(StudentID, Tag);
            CREATE INDEX IF NOT EXISTS idx_questionlogs_timestamp ON QuestionLogs(Timestamp);
        `);

        console.log('✅ PostgreSQL 資料表初始化完成');

        await seedDefaultUsers();
        await initializeStudentStats();

    } catch (e) {
        console.error('資料庫初始化失敗:', e);
    }
}

async function seedDefaultUsers() {
    const defaultUsers = [
        { id: 'S001', name: '王小明', password: '123456', role: 'student' },
        { id: 'S002', name: '李小華', password: '123456', role: 'student' },
        { id: 'S003', name: '張小美', password: '123456', role: 'student' },
        { id: 'S004', name: '陳大偉', password: '123456', role: 'student' },
        { id: 'S005', name: '林小芬', password: '123456', role: 'student' },
        { id: 'T001', name: '孔子老師', password: '123456', role: 'teacher' },
    ];

    for (const user of defaultUsers) {
        const hash = bcrypt.hashSync(user.password, 10);
        await db.query(`
            INSERT INTO Users (StudentID, Name, PasswordHash, Role)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (StudentID) DO NOTHING
        `, [user.id, user.name, hash, user.role]);
    }

    console.log('✅ 預設測試帳號建立完成 (S001~S005, 教師: T001)');
}

async function initializeStudentStats() {
    const allTags = [
        'add_2d_nc', 'add_2d_c', 'sub_2d_b', 'sub_3d_z_mid',
        'mul_2x2_nc_nc', 'mul_2x2_c_c', 'div_3d_1d_z0_mid', 'div_3d_1d_z0_end'
    ];

    const { rows: users } = await db.query(`SELECT StudentID FROM Users WHERE Role = 'student'`);

    for (const user of users) {
        for (const tag of allTags) {
            await db.query(`
                INSERT INTO StudentStats (StudentID, Tag, TotalAttempted, TotalCorrect, AccuracyRate)
                VALUES ($1, $2, 0, 0, 0.0)
                ON CONFLICT (StudentID, Tag) DO NOTHING
            `, [user.studentid, tag]); // Postgres returns columns in lowercase by default
        }
    }

    console.log('✅ 學生統計資料初始化完成');
}

// 執行初始化
if (process.env.DATABASE_URL) {
    initializeDatabase();
} else {
    console.warn('⚠️ 尚未設定 DATABASE_URL，無法執行資料庫初始化。');
}

module.exports = db;
