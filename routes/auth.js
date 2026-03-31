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
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: '登出失敗'
            });
        }
        res.json({
            success: true,
            message: '已登出'
        });
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

module.exports = router;
