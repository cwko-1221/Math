/**
 * 統計資料路由 (Stats Routes)
 * 
 * GET /api/stats/overview     - 取得學生整體統計概覽
 * GET /api/stats/tags         - 取得各標籤正確率
 * GET /api/stats/history      - 取得作答歷史紀錄
 * GET /api/stats/weaknesses   - 取得弱點分析
 * GET /api/stats/time-analysis - 取得作答時間分析
 */

const express = require('express');
const router = express.Router();
const db = require('../db/database');

// ========================================
// 認證中介軟體
// ========================================
function requireAuth(req, res, next) {
    if (!req.session.studentId) {
        return res.status(401).json({
            success: false,
            message: '請先登入'
        });
    }
    next();
}

function requireTeacher(req, res, next) {
    if (req.session.role !== 'teacher') {
        return res.status(403).json({
            success: false,
            message: '權限不足，僅限教師存取'
        });
    }
    next();
}

// 輔助函數：決定要查詢哪個學生 (若是老師可輸入 query 參數，否則只能查自己)
function getTargetStudentId(req) {
    if (req.session.role === 'teacher' && req.query.studentId) {
        return req.query.studentId;
    }
    return req.session.studentId;
}

router.use(requireAuth);

// ========================================
// GET /api/stats/overview
// 學生整體統計概覽
// ========================================
router.get('/overview', (req, res) => {
    try {
        const studentId = getTargetStudentId(req);

        // 整體統計
        const overall = db.prepare(`
            SELECT 
                COALESCE(SUM(TotalAttempted), 0) as totalQuestions,
                COALESCE(SUM(TotalCorrect), 0) as totalCorrect,
                CASE 
                    WHEN SUM(TotalAttempted) > 0 
                    THEN ROUND(CAST(SUM(TotalCorrect) AS REAL) / SUM(TotalAttempted) * 100, 1)
                    ELSE 0 
                END as overallAccuracy
            FROM StudentStats
            WHERE StudentID = ?
        `).get(studentId);

        // 今日統計
        const today = db.prepare(`
            SELECT 
                COUNT(*) as todayQuestions,
                COALESCE(SUM(IsCorrect), 0) as todayCorrect,
                CASE 
                    WHEN COUNT(*) > 0 
                    THEN ROUND(CAST(SUM(IsCorrect) AS REAL) / COUNT(*) * 100, 1)
                    ELSE 0 
                END as todayAccuracy,
                COALESCE(ROUND(AVG(TimeTaken), 1), 0) as avgTime
            FROM QuestionLogs
            WHERE StudentID = ? AND DATE(Timestamp) = DATE('now')
        `).get(studentId);

        // 練習次數（以每組 10 題計算）
        const totalSessions = Math.floor((overall.totalQuestions || 0) / 10);

        res.json({
            success: true,
            overview: {
                totalQuestions: overall.totalQuestions,
                totalCorrect: overall.totalCorrect,
                overallAccuracy: overall.overallAccuracy,
                totalSessions,
                today: {
                    questions: today.todayQuestions,
                    correct: today.todayCorrect,
                    accuracy: today.todayAccuracy,
                    avgTime: today.avgTime,
                }
            }
        });

    } catch (error) {
        console.error('取得概覽錯誤:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// ========================================
// GET /api/stats/tags
// 各標籤正確率
// ========================================
router.get('/tags', (req, res) => {
    try {
        const studentId = getTargetStudentId(req);

        const stats = db.prepare(`
            SELECT 
                Tag as tag,
                TotalAttempted as totalAttempted,
                TotalCorrect as totalCorrect,
                AccuracyRate as accuracyRate
            FROM StudentStats
            WHERE StudentID = ?
            ORDER BY Tag
        `).all(studentId);

        // 加入標籤的中文名稱和類別
        const { TAG_INFO } = require('../engine/questionGenerator');
        const enriched = stats.map(s => ({
            ...s,
            tagName: TAG_INFO[s.tag]?.name || s.tag,
            category: TAG_INFO[s.tag]?.category || '未知',
        }));

        res.json({
            success: true,
            stats: enriched
        });

    } catch (error) {
        console.error('取得標籤統計錯誤:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// ========================================
// GET /api/stats/history
// 作答歷史紀錄
// Query: ?limit=50&offset=0&tag=add_2d_nc
// ========================================
router.get('/history', (req, res) => {
    try {
        const studentId = getTargetStudentId(req);
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const tag = req.query.tag || null;

        let query = `
            SELECT 
                LogID as logId,
                Tag as tag,
                QuestionText as questionText,
                CorrectAnswer as correctAnswer,
                UserAnswer as userAnswer,
                IsCorrect as isCorrect,
                TimeTaken as timeTaken,
                Timestamp as timestamp
            FROM QuestionLogs
            WHERE StudentID = ?
        `;
        const params = [studentId];

        if (tag) {
            query += ' AND Tag = ?';
            params.push(tag);
        }

        query += ' ORDER BY Timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const logs = db.prepare(query).all(...params);

        // 總數
        let countQuery = 'SELECT COUNT(*) as count FROM QuestionLogs WHERE StudentID = ?';
        const countParams = [studentId];
        if (tag) {
            countQuery += ' AND Tag = ?';
            countParams.push(tag);
        }
        const total = db.prepare(countQuery).get(...countParams);

        res.json({
            success: true,
            total: total.count,
            limit,
            offset,
            history: logs.map(l => ({
                ...l,
                isCorrect: !!l.isCorrect
            }))
        });

    } catch (error) {
        console.error('取得歷史記錄錯誤:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// ========================================
// GET /api/stats/weaknesses
// 弱點分析 (正確率低於 70% 的標籤)
// ========================================
router.get('/weaknesses', (req, res) => {
    try {
        const studentId = getTargetStudentId(req);

        const weaknesses = db.prepare(`
            SELECT 
                Tag as tag,
                TotalAttempted as totalAttempted,
                TotalCorrect as totalCorrect,
                AccuracyRate as accuracyRate
            FROM StudentStats
            WHERE StudentID = ? AND TotalAttempted > 0 AND AccuracyRate < 70
            ORDER BY AccuracyRate ASC
        `).all(studentId);

        const { TAG_INFO } = require('../engine/questionGenerator');
        const enriched = weaknesses.map(w => ({
            ...w,
            tagName: TAG_INFO[w.tag]?.name || w.tag,
            category: TAG_INFO[w.tag]?.category || '未知',
            suggestion: getSuggestion(w.accuracyRate),
        }));

        res.json({
            success: true,
            weaknesses: enriched,
            count: enriched.length
        });

    } catch (error) {
        console.error('弱點分析錯誤:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// ========================================
// GET /api/stats/time-analysis
// 作答時間分析 (各標籤平均作答時間)
// ========================================
router.get('/time-analysis', (req, res) => {
    try {
        const studentId = getTargetStudentId(req);

        const timeData = db.prepare(`
            SELECT 
                Tag as tag,
                COUNT(*) as count,
                ROUND(AVG(TimeTaken), 1) as avgTime,
                ROUND(MIN(TimeTaken), 1) as minTime,
                ROUND(MAX(TimeTaken), 1) as maxTime
            FROM QuestionLogs
            WHERE StudentID = ? AND TimeTaken > 0
            GROUP BY Tag
            ORDER BY avgTime DESC
        `).all(studentId);

        const { TAG_INFO } = require('../engine/questionGenerator');
        const enriched = timeData.map(t => ({
            ...t,
            tagName: TAG_INFO[t.tag]?.name || t.tag,
            category: TAG_INFO[t.tag]?.category || '未知',
        }));

        res.json({
            success: true,
            timeAnalysis: enriched
        });

    } catch (error) {
        console.error('時間分析錯誤:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// ========================================
// 輔助函數
// ========================================

function getSuggestion(accuracyRate) {
    if (accuracyRate < 30) return '需要大量練習，建議從基礎概念重新學習';
    if (accuracyRate < 50) return '需要加強練習，注意計算步驟';
    if (accuracyRate < 70) return '接近達標，再多練習幾次即可掌握';
    return '表現良好，繼續保持';
}

// ========================================
// GET /api/stats/teacher/students
// 取得所有學生列表與基礎統計 (僅限教師)
// ========================================
router.get('/teacher/students', requireTeacher, (req, res) => {
    try {
        const students = db.prepare(`
            SELECT 
                u.StudentID as id,
                u.Name as name,
                COALESCE(SUM(s.TotalAttempted), 0) as totalQuestions,
                CASE 
                    WHEN SUM(s.TotalAttempted) > 0 
                    THEN ROUND(CAST(SUM(s.TotalCorrect) AS REAL) / SUM(s.TotalAttempted) * 100, 1)
                    ELSE 0 
                END as overallAccuracy
            FROM Users u
            LEFT JOIN StudentStats s ON u.StudentID = s.StudentID
            WHERE u.Role = 'student'
            GROUP BY u.StudentID
            ORDER BY u.StudentID
        `).all();

        res.json({
            success: true,
            students
        });
    } catch (error) {
        console.error('取得學生列表錯誤:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

module.exports = router;
