const jwt = require('jsonwebtoken')
const { query } = require('../database/dbpromise')
const { getNumberOfDaysFromTimestamp } = require('../functions/function')

const checkPlan = async (req, res, next) => {
    try {

        if (req.owner) {
            req.decode.uid = req.owner.uid
        }

        const getUser = await query(`SELECT * FROM user WHERE uid = ?`, [req.decode.uid])
        const plan = getUser[0]?.plan

        if (!plan) {
            return res.json({ success: false, msg: "Please subscribe a plan to proceed this." })
        }

        const numOfDyaLeft = getNumberOfDaysFromTimestamp(getUser[0]?.plan_expire)

        if (numOfDyaLeft < 1) {
            return res.json({ success: false, msg: "Your plan was expired. Please buy a plan" })
        } else {
            req.plan = JSON.parse(getUser[0]?.plan)
            next()
        }

    } catch (err) {
        console.log(err)
        res.json({ msg: "server error", err })
    }
}


const checkContactLimit = async (req, res, next) => {
    try {
        const contact_limit = req.plan?.contact_limit

        const getContacts = await query(`SELECT * FROM contact WHERE uid = ?`, [req.decode.uid])

        if (getContacts.length >= contact_limit) {
            return res.json({ success: false, msg: `Your plan allowd you to add only ${contact_limit} contacts. Delete some to add new` })
        } else {
            next()
        }

    } catch (err) {
        console.log(err)
        res.json({ msg: "server error", err })
    }
}

const checkNote = async (req, res, next) => {
    try {

        if (req.plan?.allow_note > 0) {
            next()
        } else {
            return res.json({ msg: "Your plan does not allow you to add or edit chat notes" })
        }

    } catch (err) {
        console.log(err)
        res.json({ msg: "server error", err })
    }
}

const checkTags = async (req, res, next) => {
    try {

        if (req.plan?.allow_tag > 0) {
            next()
        } else {
            return res.json({ msg: "Your plan does not allow you to add or edit chat notes" })
        }

    } catch (err) {
        console.log(err)
        res.json({ msg: "server error", err })
    }
}

module.exports = { checkPlan, checkContactLimit, checkNote, checkTags }