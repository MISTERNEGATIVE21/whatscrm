const router = require('express').Router()
const { query } = require('../database/dbpromise.js')
const randomstring = require('randomstring')
const bcrypt = require('bcrypt')
const { createMetaTemplet, getMetaNumberDetail } = require('../functions/function.js')
const { sign } = require('jsonwebtoken')
const validateUser = require('../middlewares/user.js')
const { checkPlan } = require('../middlewares/plan.js')

// adding campaign 
router.post('/add_new', validateUser, checkPlan, async (req, res) => {
    try {
        const { title, templet, phonebook, scheduleTimestamp, example } = req.body

        if (!title || !templet?.name || !phonebook || !scheduleTimestamp) {
            return res.json({ success: false, msg: "Please enter all details" })
        }

        const { id } = phonebook

        if (!id) {
            return res.json({ msg: "Invalid phonebook provided" })
        }

        const getMetaAPI = await query(`SELECT * FROM meta_api WHERE uid = ?`, [req.decode.uid])

        if (getMetaAPI.length < 1) {
            return res.json({ msg: "We could not find your meta API keys" })
        }

        const getPhonebookContacts = await query(`SELECT * FROM contact where phonebook_id = ? AND uid = ?`, [id, req.decode.uid])

        if (getPhonebookContacts.length < 1) {
            return res.json({ success: false, msg: "The phonebook you have selected does not have any mobile number in it" })
        }

        const getMetaMobileDetails = await getMetaNumberDetail("v18.0", getMetaAPI[0]?.business_phone_number_id, getMetaAPI[0]?.access_token)

        if (getMetaMobileDetails.error) {
            return res.json({ success: false, msg: "Either your meta API are invalid or your access token has been expired" })
        }

        const broadcast_id = randomstring.generate()


        const broadcast_logs = getPhonebookContacts.map((i) => [
            req.decode.uid,
            broadcast_id,
            templet?.name || "NA",
            getMetaMobileDetails?.display_phone_number,
            i?.mobile,
            "PENDING",
            JSON.stringify(example),
            JSON.stringify(i)
        ])

        const getUser = await query(`SELECT * FROM user WHERE uid = ?`, [req.decode.uid])

        await query(`
                INSERT INTO broadcast_log (
                    uid,
                    broadcast_id,
                    templet_name,
                    sender_mobile,
                    send_to,
                    delivery_status,
                    example,
                    contact
                ) VALUES ?`, [broadcast_logs])

        const scheduleDate = scheduleTimestamp ? new Date(scheduleTimestamp) : null;

        await query(`INSERT INTO broadcast (broadcast_id, uid, title, templet, phonebook, status, schedule, timezone) VALUES (
            ?,?,?,?,?,?,?,?
        )`, [
            broadcast_id, req.decode.uid, title, JSON.stringify(templet), JSON.stringify(phonebook), "QUEUE", scheduleDate, getUser[0]?.timezone || "Asia/Kolkata"
        ])

        res.json({ success: true, msg: "Your broadcast has been added" })

    } catch (err) {
        console.log(err)
        res.json({ success: false, msg: "Something went wrong", err })
    }
})


// get all campaign 
router.get('/get_broadcast', validateUser, async (req, res) => {
    try {
        const data = await query(`SELECT * FROM broadcast WHERE uid = ?`, [req.decode.uid])
        res.json({ data, success: true })

    } catch (err) {
        console.log(err)
        res.json({ success: false, msg: "Something went wrong", err })
    }
})

// get broadcast logs by bid 
router.post('/get_broadcast_logs', validateUser, async (req, res) => {
    try {
        const { id } = req.body

        const data = await query(`SELECT * FROM broadcast_log WHERE broadcast_id = ? AND uid = ?`, [id, req.decode.uid])

        const getSent = data?.filter(i => i.delivery_status === "sent")

        const totalDelivered = data?.filter(i => i.delivery_status === "delivered")

        const totalRead = data?.filter(i => i.delivery_status === "read")
        const totalFailed = data?.filter(i => i.delivery_status === "failed")

        const totalPending = data?.filter(i => i.delivery_status === "PENDING")


        res.json({
            data, success: true,
            totalLogs: data?.length,
            getSent: getSent?.length,
            totalRead: totalRead?.length,
            totalFailed: totalFailed?.length,
            totalPending: totalPending?.length,
            totalDelivered: totalDelivered?.length
        })

    } catch (err) {
        console.log(err)
        res.json({ success: false, msg: "Something went wrong", err })
    }
})

// change campaign status 
router.post('/change_broadcast_status', validateUser, async (req, res) => {
    try {
        console.log(req.body)
        const { status, broadcast_id } = req.body

        if (!status) {
            return res.json({ msg: "Invalid request" })
        }

        await query(`UPDATE broadcast SET status = ? WHERE broadcast_id = ? AND uid = ?`, [status, broadcast_id, req.decode.uid])
        res.json({ success: true, msg: "Campaign status updated" })

    } catch (err) {
        console.log(err)
        res.json({ success: false, msg: "Something went wrong", err })
    }
})

// delete a broad cast 
router.post('/del_broadcast', validateUser, async (req, res) => {
    try {
        const { broadcast_id } = req.body

        await query(`DELETE FROM broadcast WHERE uid = ? AND broadcast_id = ?`, [req.decode.uid, broadcast_id])
        await query(`DELETE FROM broadcast_log WHERE uid = ? AND broadcast_id = ?`, [req.decode.uid, broadcast_id])

        res.json({ success: true, msg: "Broadcast was deleted" })

    } catch (err) {
        console.log(err)
        res.json({ success: false, msg: "Something went wrong", err })
    }
})

module.exports = router