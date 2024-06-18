const router = require('express').Router()
const { query } = require('../database/dbpromise.js')
const randomstring = require('randomstring')
const bcrypt = require('bcrypt')
const { isValidEmail, getFileExtension } = require('../functions/function.js')
const { sign } = require('jsonwebtoken')
const validateUser = require('../middlewares/user.js')
const { checkPlan } = require('../middlewares/plan.js')

router.post('/add_chatbot', validateUser, checkPlan, async (req, res) => {
    try {
        const { title, chats, flow, for_all } = req.body

        if (req.plan?.allow_chatbot < 1) {
            return res.json({ success: false, msg: "Your plan does not allow you to set a chatbot" })
        }

        if (!title || chats.length < 1 || !flow) {
            return res.json({ success: false, msg: "Please provide the all fields! title, chats, flow are required" })
        }

        await query(`INSERT INTO chatbot (uid, title, for_all, chats, flow, flow_id, active) VALUES (?,?,?,?,?,?,?)`, [
            req.decode.uid,
            title,
            for_all ? 1 : 0,
            JSON.stringify(chats),
            JSON.stringify(flow),
            flow?.id,
            1
        ])

        res.json({ success: true, msg: "Chatbot was added" })

    } catch (err) {
        console.log(err)
        res.json({ success: false, msg: "Something went wrong", err })
    }
})

// update chatbot 
router.post('/update_chatbot', validateUser, checkPlan, async (req, res) => {
    try {
        const { title, chats, flow, for_all, id } = req.body

        if (req.plan?.allow_chatbot < 1) {
            return res.json({ success: false, msg: "Your plan does not allow you to set a chatbot" })
        }

        if (!title || chats.length < 1 || !flow) {
            return res.json({ success: false, msg: "Please provide the all fields! title, chats, flow are required" })
        }

        await query(`UPDATE chatbot SET title = ?, for_all = ?, chats = ?, flow = ?, flow_id = ? WHERE id = ?`, [
            title,
            for_all ? 1 : 0,
            JSON.stringify(chats),
            JSON.stringify(flow),
            flow?.id,
            id
        ])

        res.json({ success: true, msg: "Chatbot was updated" })

    } catch (err) {
        console.log(err)
        res.json({ success: false, msg: "Something went wrong", err })
    }
})

// get my chatbots 
router.get('/get_chatbot', validateUser, async (req, res) => {
    try {
        const data = await query(`SELECT * FROM chatbot WHERE uid = ?`, [req.decode.uid])
        res.json({ data, success: true })

    } catch (err) {
        console.log(err)
        res.json({ success: false, msg: "Something went wrong", err })
    }
})

// change bot status 
router.post('/change_bot_status', validateUser, checkPlan, async (req, res) => {
    try {

        const { id, status } = req.body

        if (req.plan?.allow_chatbot < 1) {
            return res.json({ success: false, msg: "Your plan does not allow you to set a chatbot" })
        }

        await query(`UPDATE chatbot SET active = ? WHERE uid = ? AND id = ?`, [status ? 1 : 0, req.decode.uid, id])

        res.json({ success: true, msg: "Chatbot was updated" })

    } catch (err) {
        console.log(err)
        res.json({ success: false, msg: "Something went wrong", err })
    }
})

// del chatbot 
router.post('/del_chatbot', validateUser, async (req, res) => {
    try {

        const { id } = req.body
        await query(`DELETE FROM chatbot WHERE id = ? AND uid = ?`, [id, req.decode.uid])
        res.json({ success: true, msg: "Chatbot was deleted" })

    } catch (err) {
        console.log(err)
        res.json({ success: false, msg: "Something went wrong", err })
    }
})


module.exports = router