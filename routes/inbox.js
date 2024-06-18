const router = require('express').Router()
const { query } = require('../database/dbpromise.js')
const randomstring = require('randomstring')
const bcrypt = require('bcrypt')
const { isValidEmail, getFileExtension, saveJsonToFile, saveWebhookConversation, readJSONFile, sendMetaMsg, mergeArrays, botWebhook, sendMetatemplet, updateMetaTempletInMsg, getUserPlayDays, deleteFileIfExists } = require('../functions/function.js')
const { sign } = require('jsonwebtoken')
const validateUser = require('../middlewares/user.js')
const { getIOInstance } = require('../socket.js');
const { checkPlan } = require('../middlewares/plan.js')

// handle post webhook 
router.post('/webhook/:uid', async (req, res) => {
    try {
        const body = req.body
        const userUID = req.params.uid;
        // console.log({ userUID, body: JSON.stringify(body) })

        res.sendStatus(200);

        const getDays = await getUserPlayDays(userUID)
        if (getDays < 1) {
            return
        }
        // save message 
        await saveWebhookConversation(body, userUID)

    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})


// getting chat lists 
router.get('/get_chats', validateUser, async (req, res) => {
    try {
        let data = []
        data = await query(`SELECT * FROM chats WHERE uid = ?`, [req.decode.uid])
        const getContacts = await query(`SELECT * FROM contact WHERE uid = ?`, [req.decode.uid])


        if (data.length > 0 && getContacts.length > 0) {
            data = mergeArrays(getContacts, data)
        } else {
            data = data
        }

        res.json({ data, success: true })

    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})


// get chat conversatio 
router.post('/get_convo', validateUser, async (req, res) => {
    try {
        const { chatId } = req.body

        const filePath = `${__dirname}/../conversations/inbox/${req.decode.uid}/${chatId}.json`
        const data = readJSONFile(filePath, 100)
        res.json({ data, success: true })
    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})


// adding webhook 
router.get('/webhook/:uid', async (req, res) => {
    try {
        const { uid } = req.params

        const queryParan = req.query
        const body = req.body

        console.log({ query: JSON.stringify(queryParan) })
        console.log({ body: JSON.stringify(body) })

        const getUser = await query(`SELECT * FROM user WHERE uid = ?`, [uid])

        let verify_token = ""

        if (getUser.length < 1) {
            verify_token = "NULL"
            res.json({ success: false, msg: "Token not verified", webhook: uid, token: "NOT FOUND" })
        } else {
            verify_token = uid

            let mode = req.query["hub.mode"];
            let token = req.query["hub.verify_token"];
            let challenge = req.query["hub.challenge"];

            // Check if a token and mode were sent
            if (mode && token) {
                // Check the mode and token sent are correct
                if (mode === "subscribe" && token === verify_token) {
                    // Respond with 200 OK and challenge token from the request
                    console.log("WEBHOOK_VERIFIED");
                    res.status(200).send(challenge);
                } else {
                    // Responds with '403 Forbidden' if verify tokens do not match
                    res.sendStatus(403);
                }
            } else {
                res.json({ success: false, msg: "Token not verified", webhook: uid, token: "FOUND" })
            }
        }
    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})


router.get('/', async (req, res) => {
    try {
        const uid = "lWvj6K0xI0FlSKJoyV7ak9DN0mzvKJK8"
        const { msg } = req.query

        // getting socket id 
        const sock = await query(`SELECT * FROM rooms WHERE uid = ?`, [uid])


        const io = getIOInstance();

        console.log(sock[0]?.socket_id)

        io.to(sock[0]?.socket_id).emit('update_conversations', "msg");

        res.json(msg);
    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
});

// sending templets 
router.post('/send_templet', validateUser, checkPlan, async (req, res) => {
    try {
        const { content, toName, toNumber, chatId, msgType } = req.body

        if (!content || !toName || !toName || !msgType) {
            return res.json({ success: false, msg: "Invalid request" })
        }

        const msgObj = content

        const savObj = {
            "type": msgType,
            "metaChatId": "",
            "msgContext": content,
            "reaction": "",
            "timestamp": "",
            "senderName": toName,
            "senderMobile": toNumber,
            "status": "sent",
            "star": false,
            "route": "OUTGOING"
        }

        const resp = await sendMetaMsg(req.decode.uid, msgObj, toNumber, savObj, chatId)
        res.json(resp)

    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})


// send image 
router.post('/send_image', validateUser, checkPlan, async (req, res) => {
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
            "route": "OUTGOING"
        }

        const resp = await sendMetaMsg(req.decode.uid, msgObj, toNumber, savObj, chatId)
        res.json(resp)


    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})

// send video 
router.post('/send_video', validateUser, checkPlan, async (req, res) => {
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
            "route": "OUTGOING"
        }

        const resp = await sendMetaMsg(req.decode.uid, msgObj, toNumber, savObj, chatId)
        res.json(resp)

    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})

// send document 
router.post('/send_doc', validateUser, checkPlan, async (req, res) => {
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
            "route": "OUTGOING"
        }

        const resp = await sendMetaMsg(req.decode.uid, msgObj, toNumber, savObj, chatId)
        res.json(resp)

    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})

// send audio 
router.post('/send_audio', validateUser, checkPlan, async (req, res) => {
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
            "route": "OUTGOING"
        }

        const resp = await sendMetaMsg(req.decode.uid, msgObj, toNumber, savObj, chatId)
        res.json(resp)

    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})

// send text message 
router.post('/send_text', validateUser, checkPlan, async (req, res) => {
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
            "route": "OUTGOING"
        }

        const resp = await sendMetaMsg(req.decode.uid, msgObj, toNumber, savObj, chatId)
        res.json(resp)
    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})

// send meta templet 
router.post('/send_meta_templet', validateUser, checkPlan, async (req, res) => {
    try {
        const { template, toNumber, toName, chatId, example } = req.body

        if (!template) {
            return res.json({ success: false, msg: "Please type input" })
        }

        const getMETA = await query(`SELECT * FROM meta_api WHERE uid = ?`, [req.decode.uid])
        if (getMETA.length < 1) {
            return res.json({ success: false, msg: "Please check your meta API keys [1]" })
        }

        const resp = await sendMetatemplet(toNumber, getMETA[0]?.business_phone_number_id, getMETA[0]?.access_token, template, example)

        if (resp.error) {
            console.log(resp)
            return res.json({ success: false, msg: resp?.error?.error_user_title || "Please check your API" })
        } else {

            const savObj = {
                "type": "text",
                "metaChatId": "",
                "msgContext": {
                    "type": "text",
                    "text": {
                        "preview_url": true,
                        "body": `{{TEMPLET_MESSAGE}} | ${template?.name}`
                    }
                },
                "reaction": "",
                "timestamp": "",
                "senderName": toName,
                "senderMobile": toNumber,
                "status": "sent",
                "star": false,
                "route": "OUTGOING"
            }

            await updateMetaTempletInMsg(req.decode.uid, savObj, chatId, resp?.messages[0]?.id)
            res.json({ success: true, msg: "The templet message was sent" })
        }

    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})


// del chat 
router.post("/del_chat", validateUser, async (req, res) => {
    try {
        const { chatId } = req.body
        await query(`DELETE FROM chats WHERE chat_id = ? AND uid = ?`, [chatId, req.decode.uid])
        const filePath = `${__dirname}/../conversations/inbox/${req.decode.uid}/${chatId}`

        deleteFileIfExists(filePath)

        res.json({ success: true, msg: "Conversation has been deleted" })

    } catch (err) {
        console.log(err);
        res.json({ err, success: false, msg: "Something went wrong" });
    }
})

module.exports = router;