/**
 * 認證路由 (Auth Routes)
 * 
 * POST /api/auth/login   - 學生登入
 * POST /api/auth/logout  - 學生登出
 * GET  /api/auth/me      - 取得目前登入的學生資訊
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../db/database');

/**
 * POST /api/auth/login
 * Body: { studentId, password }
 */
router.post('/login', async (req, res) => {
    try {
        const { studentId, password } = req.body;

        // 驗證輸入
        if (!studentId || !password) {
            return res.status(400).json({
                success: false,
                message: '請輸入學號和密碼'
            });
        }

        // 查詢學生
        const { rows } = await db.query('SELECT * FROM Users WHERE StudentID = $1', [studentId]);
        const user = rows.length > 0 ? rows[0] : null;

        if (!user) {
            return res.status(401).json({
                success: false,
                message: '學號不存在'
            });
        }

        // 驗證密碼
        const isMatch = bcrypt.compareSync(password, user.passwordhash);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: '密碼錯誤'
            });
        }

        // 設定 session
        req.session.studentId = user.studentid;
        req.session.studentName = user.name;
        req.session.role = user.role || 'student';

        res.json({
            success: true,
            message: '登入成功',
            student: {
                id: user.studentid,
                name: user.name,
                role: req.session.role
            }
        });

    } catch (error) {
        console.error('登入錯誤:', error);
        res.status(500).json({
            success: false,
            message: '伺服器錯誤'
        });
    }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
    req.session = null;
    res.json({
        success: true,
        message: '已登出'
    });
});

/**
 * GET /api/auth/me
 * 取得目前登入的學生資訊
 */
router.get('/me', (req, res) => {
    if (!req.session.studentId) {
        return res.status(401).json({
            success: false,
            message: '未登入'
        });
    }

    res.json({
        success: true,
        student: {
            id: req.session.studentId,
            name: req.session.studentName,
            role: req.session.role || 'student'
        }
    });
});

/**
 * POST /api/auth/register-student
 * 教師專用：新增學生
 * Body: { studentId, name, password }
 */
router.post('/register-student', async (req, res) => {
    try {
        // 權限驗證
        if (req.session.role !== 'teacher') {
            return res.status(403).json({ success: false, message: '權限不足，僅限教師操作' });
        }

        const { studentId, name, password } = req.body;
        if (!studentId || !name || !password) {
            return res.status(400).json({ success: false, message: '請填寫完整資訊 (學號、姓名、密碼)' });
        }

        // 檢查學號是否已存在
        const { rows: existing } = await db.query('SELECT StudentID FROM Users WHERE StudentID = $1', [studentId]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: '學號已經存在' });
        }

        // 加密密碼與寫入
        const hash = bcrypt.hashSync(password, 10);
        await db.query(`
            INSERT INTO Users (StudentID, Name, PasswordHash, Role)
            VALUES ($1, $2, $3, 'student')
        `, [studentId, name, hash]);

        // 初始化學生統據
        const allTags = [
            'add_2d_nc', 'add_2d_c', 'sub_2d_b', 'sub_3d_z_mid',
            'mul_2x2_nc_nc', 'mul_2x2_c_c', 'div_3d_1d_z0_mid', 'div_3d_1d_z0_end'
        ];
        
        for (const tag of allTags) {
            await db.query(`
                INSERT INTO StudentStats (StudentID, Tag, TotalAttempted, TotalCorrect, AccuracyRate)
                VALUES ($1, $2, 0, 0, 0.0)
                ON CONFLICT (StudentID, Tag) DO NOTHING
            `, [studentId, tag]);
        }

        res.json({ success: true, message: '學生帳號建立成功' });

    } catch (error) {
        console.error('新增學生錯誤:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

module.exports = router;

