/**
 * Adaptive Math Learning System - 主伺服器
 * 國小四則運算適性學習系統
 */

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

// 初始化資料庫（會自動建立資料表與預設帳號）
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================
// 中介軟體 (Middleware)
// ========================================

// 解析 JSON 請求
app.use(express.json());

// 解析 URL-encoded 請求
app.use(express.urlencoded({ extended: true }));

// CORS 設定
app.use(cors({
    origin: true,
    credentials: true
}));

// Session 設定
app.use(session({
    secret: 'adaptive-math-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // 開發環境用 HTTP
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 小時
    }
}));

// 靜態檔案服務
app.use(express.static(path.join(__dirname, 'public')));

// ========================================
// 路由 (Routes)
// ========================================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/quiz', require('./routes/quiz'));
app.use('/api/stats', require('./routes/stats'));

// ========================================
// 健康檢查端點
// ========================================
app.get('/api/health', (req, res) => {
    try {
        // 驗證資料庫連線
        const userCount = db.prepare('SELECT COUNT(*) as count FROM Users').get();
        const tableInfo = db.prepare(`
            SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
        `).all();

        res.json({
            status: 'ok',
            database: {
                connected: true,
                tables: tableInfo.map(t => t.name),
                userCount: userCount.count
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// ========================================
// 資料庫狀態端點（開發用）
// ========================================
app.get('/api/db-status', (req, res) => {
    try {
        const users = db.prepare('SELECT StudentID, Name FROM Users').all();
        const stats = db.prepare('SELECT * FROM StudentStats').all();
        const logCount = db.prepare('SELECT COUNT(*) as count FROM QuestionLogs').get();

        res.json({
            users,
            statsCount: stats.length,
            statsSample: stats.slice(0, 10),
            questionLogCount: logCount.count
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================
// 啟動伺服器
// ========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('🚀 ===========================================');
    console.log(`🚀  適性學習系統伺服器已啟動！`);
    console.log(`🚀  http://0.0.0.0:${PORT}`);
    console.log('🚀 ===========================================');
    console.log('');
});

module.exports = app;
