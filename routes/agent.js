const router = require('express').Router()
const { query } = require('../database/dbpromise.js')
const randomstring = require('randomstring')
const bcrypt = require('bcrypt')
const { isValidEmail, getFileExtension, getBusinessPhoneNumber, createMetaTemplet, getAllTempletsMeta, delMetaTemplet, getFileInfo, getSessionUploadMediaMeta, uploadFileMeta, updateUserPlan, getUserOrderssByMonth, sendEmail, fetchProfileFun, mergeArrays, readJSONFile, sendMetaMsg } = require('../functions/function.js')
const { sign } = require('jsonwebtoken')
const validateUser = require('../middlewares/user.js')
const validateAgent = require('../middlewares/agent.js')
const Stripe = require('stripe')
const { checkPlan, checkNote, checkTags, checkContactLimit } = require('../middlewares/plan.js')
const { recoverEmail } = require('../emails/returnEmails.js')
const moment = require('moment')

// adding agent 
router.post('/add_agent', validateUser, checkPlan, async (req, res) => {
    try {
        const { name, password, email, mobile, comments } = req.body

        if (!name || !password || !email || !mobile) {
            return res.json({
                msg: "Please fill all the details"
            })
        }

        if (!isValidEmail(email)) {
            return res.json({ msg: "Please enter a valid email" })
        }

        // check if already 
        const getUser = await query(`SELECT * FROM agents WHERE email = ?`, [email?.toLowerCase()])

        if (getUser.length > 0) {
            return res.json({ msg: "This email is already used by you or someone else on the platform, Please choose another email" })
        }

        const hashPass = await bcrypt.hash(password, 10)

        const uid = randomstring.generate()

        await query(`INSERT INTO agents (owner_uid, uid, email, password, name, mobile, comments) VALUES (
            ?,?,?,?,?,?,?
        )`, [
            req.decode.uid,
            uid,
            email?.toLowerCase(),
            hashPass,
            name,
            mobile,
            comments
        ])

        res.json({
            msg: "Agent account was created",
            success: true
        })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// get all agents 
router.get("/get_my_agents", validateUser, async (req, res) => {
    try {
        const data = await query(`SELECT * FROM agents WHERE owner_uid = ?`, [
            req.decode.uid
        ])

        res.json({ data, success: true })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// change agent activeness 
router.post('/change_agent_activeness', validateUser, async (req, res) => {
    try {
        const { agentUid, activeness } = req.body

        await query(`UPDATE agents SET is_active = ? WHERE uid = ?`, [
            activeness ? 1 : 0,
            agentUid
        ])

        res.json({
            success: true,
            msg: "Success"
        })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// del user 
router.post('/del_agent', validateUser, async (req, res) => {
    try {
        const { uid } = req.body
        await query(`DELETE FROM agents WHERE uid = ? AND owner_uid = ?`, [uid, req.decode.uid])

        res.json({
            success: true,
            msg: "Agent was deleted"
        })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// get agent chats by owner 
router.post('/get_agent_chats_owner', validateUser, async (req, res) => {
    try {
        const { uid } = req.body

        // const data = await query(`SELECT * FROM agent_chats WHERE owner_uid = ? AND uid = ?`, [
        //     req.decode.uid,
        //     uid
        // ])

        const data = await query(`
        SELECT * 
        FROM agent_chats 
        JOIN chats  
        ON agent_chats.chat_id = chats.chat_id 
        WHERE agent_chats.owner_uid = ? 
        AND chats.uid = ?        
        `, [
            req.decode.uid,
            req.decode.uid,
            uid
        ]);

        res.json({ data, success: true })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// get chat assisgn agent 
router.post('/get_assigned_chat_agent', validateUser, async (req, res) => {
    try {
        const { chatId } = req.body

        let data

        data = await query(`SELECT * FROM agent_chats WHERE chat_id = ? AND owner_uid = ?`, [
            chatId,
            req.decode.uid
        ])

        if (data.length > 0) {
            const agent = await query(`SELECT * FROM agents WHERE uid = ?`, [data[0]?.uid]);
            data[0] = { ...agent[0], chat_id: data[0].chat_id, owner_uid: data[0].owner_uid };
        } else {
            data = {}
        }

        res.json({ data: data[0], success: true })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// update agent in chat 
router.post('/update_agent_in_chat', validateUser, async (req, res) => {
    try {
        const { assignAgent, chatId, agentUid } = req.body

        if (assignAgent?.email) {
            await query(`INSERT INTO agent_chats (owner_uid, uid, chat_id) VALUES (?,?,?)`, [
                req.decode.uid,
                assignAgent?.uid,
                chatId
            ])
        } else {
            await query(`DELETE FROM agent_chats WHERE owner_uid = ? AND chat_id = ?`, [
                req.decode?.uid,
                chatId
            ])
        }

        res.json({ msg: "Updated", success: true })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// deleted assign chat 
router.post('/del_assign_chat_by_owner', validateUser, async (req, res) => {
    try {
        const { uid, chat_id } = req.body

        console.log(req.body)

        await query(`DELETE FROM agent_chats WHERE owner_uid = ? AND uid = ? AND chat_id = ?`, [
            req.decode.uid,
            uid,
            chat_id
        ])

        res.json({ msg: "Chat was removed from the agent", success: true })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// login agent 
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res.json({ success: false, msg: "Please provide email and password" })
        }

        // check for user 
        const agentFind = await query(`SELECT * FROM agents WHERE email = ?`, [email])
        if (agentFind.length < 1) {
            return res.json({ msg: "Invalid credentials" })
        }

        const compare = await bcrypt.compare(password, agentFind[0].password)

        if (!compare) {
            return res.json({ msg: "Invalid credentials" })
        } else {
            const token = sign({ uid: agentFind[0].uid, role: 'agent', password: agentFind[0].password, email: agentFind[0].email }, process.env.JWTKEY, {})
            res.json({
                success: true, token
            })
        }

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// get me agent 
router.get('/get_me', validateAgent, async (req, res) => {
    try {
        const data = await query(`SELECT * FROM agents WHERE uid = ?`, [req.decode.uid])
        res.json({ data: data[0], success: true })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// get agent assign chats 
router.get("/get_my_assigned_chats", validateAgent, async (req, res) => {
    try {
        let data = [];

        const getMyChatsId = await query(`SELECT chat_id FROM agent_chats WHERE uid = ?`, [
            req.decode.uid
        ]);

        if (getMyChatsId.length < 1) {
            return res.json({ data: [], success: true });
        }

        const chatIds = getMyChatsId.map(i => i?.chat_id);

        // Using IN clause to match against multiple IDs
        data = await query(`SELECT * FROM chats WHERE chat_id IN (?)`, [chatIds]);

        const getContacts = await query(`SELECT * FROM contact WHERE uid = ?`, [req.owner.uid])

        if (data.length > 0 && getContacts.length > 0) {
            data = mergeArrays(getContacts, data)
        } else {
            data = data
        }

        res.json({ data, success: true })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// get chat conversatio 
router.post('/get_convo', validateAgent, async (req, res) => {
    try {
        const { chatId } = req.body

        const filePath = `${__dirname}/../conversations/inbox/${req.owner.uid}/${chatId}.json`
        const data = readJSONFile(filePath, 100)

        res.json({ data, success: true })
    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})


// send chat text 
router.post('/send_text', validateAgent, checkPlan, async (req, res) => {
    try {
        const { text, toNumber, toName, chatId } = req.body


        if (!text || !toNumber || !toName || !chatId) {
            return res.json({ success: false, msg: "Not enough input provided" })
        }

        const msgObj = {
            "type": "text",
            "text": {
                "preview_url": true,
                "body": text
            }
        }

        const savObj = {
            "type": "text",
            "metaChatId": "",
            "msgContext": {
                "type": "text",
                "text": {
                    "preview_url": true,
                    "body": text
                }
            },
            "reaction": "",
            "timestamp": "",
            "senderName": toName,
            "senderMobile": toNumber,
            "status": "sent",
            "star": false,
            "route": "OUTGOING",
            "agent": req.decode?.email
        }

        const resp = await sendMetaMsg(req.owner.uid, msgObj, toNumber, savObj, chatId)
        res.json(resp)
    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})


// send audio 
router.post('/send_audio', validateAgent, checkPlan, async (req, res) => {
    try {
        const { url, toNumber, toName, chatId } = req.body


        if (!url || !toNumber || !toName || !chatId) {
            return res.json({ success: false, msg: "Not enough input provided" })
        }

        const msgObj = {
            "type": "audio",
            "audio": {
                "link": url
            }
        }

        const savObj = {
            "type": "audio",
            "metaChatId": "",
            "msgContext": {
                "type": "audio",
                "audio": {
                    "link": url
                }
            },
            "reaction": "",
            "timestamp": "",
            "senderName": toName,
            "senderMobile": toNumber,
            "status": "sent",
            "star": false,
            "route": "OUTGOING",
            "agent": req.decode?.email
        }

        const resp = await sendMetaMsg(req.owner.uid, msgObj, toNumber, savObj, chatId)
        res.json(resp)

    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})


// return image url 
router.post('/return_media_url', validateAgent, async (req, res) => {
    try {

        if (!req.files || Object.keys(req.files).length === 0) {
            return res.json({ success: false, msg: "No files were uploaded" })
        }

        const randomString = randomstring.generate()
        const file = req.files.file

        const filename = `${randomString}.${getFileExtension(file.name)}`

        file.mv(`${__dirname}/../client/public/media/${filename}`, err => {
            if (err) {
                console.log(err)
                return res.json({ err })
            }
        })

        const url = `${process.env.FRONTENDURI}/media/${filename}`
        res.json({ success: true, url })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})


// send document 
router.post('/send_doc', validateAgent, checkPlan, async (req, res) => {
    try {
        const { url, toNumber, toName, chatId, caption } = req.body

        if (!url || !toNumber || !toName || !chatId) {
            return res.json({ success: false, msg: "Not enough input provided" })
        }

        const msgObj = {
            "type": "document",
            "document": {
                "link": url,
                "caption": caption || ""
            }
        }

        const savObj = {
            "type": "document",
            "metaChatId": "",
            "msgContext": {
                "type": "document",
                "document": {
                    "link": url,
                    "caption": caption || ""
                }
            },
            "reaction": "",
            "timestamp": "",
            "senderName": toName,
            "senderMobile": toNumber,
            "status": "sent",
            "star": false,
            "route": "OUTGOING",
            "agent": req.decode?.email
        }

        const resp = await sendMetaMsg(req.owner.uid, msgObj, toNumber, savObj, chatId)
        res.json(resp)

    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})


// send video 
router.post('/send_video', validateAgent, checkPlan, async (req, res) => {
    try {
        const { url, toNumber, toName, chatId, caption } = req.body

        if (!url || !toNumber || !toName || !chatId) {
            return res.json({ success: false, msg: "Not enough input provided" })
        }

        const msgObj = {
            "type": "video",
            "video": {
                "link": url,
                "caption": caption || ""
            }
        }

        const savObj = {
            "type": "video",
            "metaChatId": "",
            "msgContext": {
                "type": "video",
                "video": {
                    "link": url,
                    "caption": caption || ""
                }
            },
            "reaction": "",
            "timestamp": "",
            "senderName": toName,
            "senderMobile": toNumber,
            "status": "sent",
            "star": false,
            "route": "OUTGOING",
            "agent": req.decode?.email
        }

        const resp = await sendMetaMsg(req.owner.uid, msgObj, toNumber, savObj, chatId)
        res.json(resp)

    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})


// send image 
router.post('/send_image', validateAgent, checkPlan, async (req, res) => {
    try {
        const { url, toNumber, toName, chatId, caption } = req.body

        if (!url || !toNumber || !toName || !chatId) {
            return res.json({ success: false, msg: "Not enough input provided" })
        }

        const msgObj = {
            "type": "image",
            "image": {
                "link": url,
                "caption": caption || ""
            }
        }

        const savObj = {
            "type": "image",
            "metaChatId": "",
            "msgContext": {
                "type": "image",
                "image": {
                    "link": url,
                    "caption": caption || ""
                }
            },
            "reaction": "",
            "timestamp": "",
            "senderName": toName,
            "senderMobile": toNumber,
            "status": "sent",
            "star": false,
            "route": "OUTGOING",
            "agent": req.decode?.email
        }

        const resp = await sendMetaMsg(req.owner.uid, msgObj, toNumber, savObj, chatId)
        res.json(resp)


    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})

// get my tasks 
router.get('/get_my_task', validateAgent, async (req, res) => {
    try {
        const data = await query(`SELECT * FROM agent_task WHERE uid = ?`, [
            req.decode.uid
        ])

        res.json({ data, success: true })

    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})

// mark task complete 
router.post('/mark_task_complete', validateAgent, async (req, res) => {
    try {
        const { id, comment } = req.body

        if (!comment) {
            return res.json({ msg: "Please type your comments." })
        }

        await query(`UPDATE agent_task SET status = ?, agent_comments = ? WHERE id = ?`, [
            "COMPLETED",
            comment,
            id
        ])

        res.json({ msg: "Task updated", success: true })

    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})

// change chat status 
router.post('/change_chat_ticket_status', validateAgent, async (req, res) => {
    try {
        const { status, chatId } = req.body

        if (!status || !chatId) {
            return res.json({ msg: "invalid request" })
        }

        await query(`UPDATE chats SET chat_status = ? WHERE chat_id = ?`, [
            status,
            chatId
        ])

        res.json({
            success: true,
            msg: "Chat status updated"
        })

    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})

module.exports = router