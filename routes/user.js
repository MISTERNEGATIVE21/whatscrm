const router = require('express').Router()
const { query } = require('../database/dbpromise.js')
const randomstring = require('randomstring')
const bcrypt = require('bcrypt')
const { isValidEmail, getFileExtension, getBusinessPhoneNumber, createMetaTemplet, getAllTempletsMeta, delMetaTemplet, getFileInfo, getSessionUploadMediaMeta, uploadFileMeta, updateUserPlan, getUserOrderssByMonth, sendEmail, fetchProfileFun, returnWidget, generateWhatsAppURL } = require('../functions/function.js')
const { sign } = require('jsonwebtoken')
const validateUser = require('../middlewares/user.js')
const Stripe = require('stripe')
const { checkPlan, checkNote, checkTags, checkContactLimit } = require('../middlewares/plan.js')
const { recoverEmail } = require('../emails/returnEmails.js')
const moment = require('moment')

// aignup user 
router.post('/signup', async (req, res) => {
    try {
        const { email, name, password, mobile_with_country_code, acceptPolicy } = req.body

        if (!email || !name || !password || !mobile_with_country_code) {
            return res.json({ msg: "Please fill the details", success: false })
        }

        if (!acceptPolicy) {
            return res.json({ msg: "You did not click on checkbox of Privacy & Terms", success: false })
        }

        if (!isValidEmail(email)) {
            return res.json({ msg: "Please enter a valid email", success: false })
        }

        // check if user already has same email
        const findEx = await query(`SELECT * FROM user WHERE email = ?`, email)
        if (findEx.length > 0) {
            return res.json({ msg: "A user already exist with this email" })
        }

        const haspass = await bcrypt.hash(password, 10)
        const uid = randomstring.generate();

        await query(`INSERT INTO user (name, uid, email, password, mobile_with_country_code) VALUES (?,?,?,?,?)`, [
            name,
            uid,
            email,
            haspass,
            mobile_with_country_code
        ])

        res.json({ msg: "Signup Success", success: true })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// login user 
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res.json({ success: false, msg: "Please provide email and password" })
        }

        // check for user 
        const userFind = await query(`SELECT * FROM user WHERE email = ?`, [email])
        if (userFind.length < 1) {
            return res.json({ msg: "Invalid credentials" })
        }

        const compare = await bcrypt.compare(password, userFind[0].password)

        if (!compare) {
            return res.json({ msg: "Invalid credentials" })
        } else {
            const token = sign({ uid: userFind[0].uid, role: 'user', password: userFind[0].password, email: userFind[0].email }, process.env.JWTKEY, {})
            res.json({
                success: true, token
            })
        }

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})


// return image url 
router.post('/return_media_url', validateUser, async (req, res) => {
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

// get user 
router.get('/get_me', validateUser, async (req, res) => {
    try {
        const data = await query(`SELECT * FROM user WHERE uid = ?`, [req.decode.uid])

        // getting phonebook
        const contact = await query(`SELECT * FROM contact WHERE uid = ?`, [req.decode.uid])

        res.json({ data: { ...data[0], contact: contact.length }, success: true })
    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})


// update notes 
router.post("/save_note", validateUser, checkPlan, checkNote, async (req, res) => {
    try {
        const { chatId, note } = req.body

        await query(`UPDATE chats SET chat_note = ? WHERE chat_id = ?`, [note, chatId])
        res.json({ success: true, msg: "Notes were updated" })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// update tags 
router.post('/push_tag', validateUser, checkPlan, checkTags, async (req, res) => {
    try {
        const { tag, chatId } = req.body

        if (!tag) {
            return res.json({ success: false, msg: "Please type a tag" })
        }

        const getChat = await query(`SELECT * FROM chats WHERE chat_id = ?`, [chatId])

        if (getChat.length < 1) {
            return res.json({ success: false, msg: "Chat not found" })
        }
        const getTags = getChat[0]?.chat_tags ? JSON.parse(getChat[0]?.chat_tags) : []
        const addNew = [...getTags, tag]

        await query(`UPDATE chats SET chat_tags = ? WHERE chat_id = ?`, [JSON.stringify(addNew), chatId])

        res.json({ success: true, msg: "Tag was added" })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})


// del a tag 
router.post('/del_tag', validateUser, async (req, res) => {
    try {
        const { tag, chatId } = req.body

        const getAll = await query(`SELECT * FROM chats WHERE chat_id = ?`, [chatId])
        if (getAll.length < 1) {
            return res.json({ success: false, msg: "Chat not found" })
        }

        const getAllTags = getAll[0]?.chat_tags ? JSON.parse(getAll[0]?.chat_tags) : []

        const newOne = getAllTags?.filter(i => i !== tag)

        console.log({ newOne })

        await query(`UPDATE chats SET chat_tags = ? WHERE chat_id = ?`, [JSON.stringify(newOne), chatId])

        res.json({ success: true, msg: "Tag was deleted" })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})


// check contact exist 
router.post('/check_contact', validateUser, async (req, res) => {
    try {
        const { mobile } = req.body

        const findFirst = await query(`SELECT * FROM contact WHERE mobile = ? AND uid = ? `, [mobile, req.decode.uid])
        const getAllPhonebook = await query(`SELECT * FROM phonebook WHERE uid = ?`, [req.decode.uid])


        if (findFirst.length < 1) {
            return res.json({
                success: false,
                msg: "Contact not found in phonebook",
                phonebook: getAllPhonebook,
            })
        }

        res.json({
            success: true,
            phonebook: getAllPhonebook,
            contact: findFirst[0]
        })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})


// save the contact 
router.post('/save_contact', validateUser, checkPlan, checkContactLimit, async (req, res) => {
    try {
        const { phoneBookName, phoneBookId, phoneNumber, contactName, var1, var2, var3, var4, var5 } = req.body

        if (!phoneBookName || !phoneBookId || !phoneNumber || !contactName) {
            return res.json({ success: false, msg: "incomplete input provided" })
        }

        const findExist = await query(`SELECT * FROM contact WHERE mobile = ? AND uid = ?`, [phoneNumber, req.decode.uid])
        if (findExist.length > 0) {
            return res.json({ success: false, msg: "Contact already existed" })
        }

        await query(`INSERT INTO contact (uid, phonebook_id, phonebook_name, name, mobile, var1, var2, var3, var4, var5) VALUES (?,?,?,?,?,?,?,?,?,?)`, [
            req.decode.uid,
            phoneBookId,
            phoneBookName,
            contactName,
            phoneNumber,
            var1 || "",
            var2 || "",
            var3 || "",
            var4 || "",
            var5 || ""
        ])

        res.json({ success: true, msg: "Contact was added" })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// del contact  
router.post('/del_contact', validateUser, async (req, res) => {
    try {
        const { id } = req.body
        await query(`DELETE FROM contact WHERE id = ?`, [id])
        res.json({ success: true, msg: "Contact was deleted" })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

router.post('/update_meta', validateUser, async (req, res) => {
    try {
        const { waba_id, business_account_id, access_token, business_phone_number_id, app_id } = req.body

        if (!waba_id || !business_account_id || !access_token || !business_account_id || !app_id) {
            return res.json({ success: false, msg: "Please fill all the fields" })
        }

        const resp = await getBusinessPhoneNumber("v18.0", business_phone_number_id, access_token)

        if (resp?.error) {
            return res.json({ success: false, msg: resp?.error?.message || "Please check your details" })
        }

        const findOne = await query(`SELECT * FROM meta_api WHERE uid = ?`, [req.decode.uid])
        if (findOne.length > 0) {
            await query(`UPDATE meta_api SET waba_id = ?, business_account_id = ?, access_token = ?, business_phone_number_id = ?, app_id = ? WHERE uid = ?`, [
                waba_id, business_account_id, access_token, business_phone_number_id, app_id, req.decode.uid
            ])
        } else {
            await query(`INSERT INTO meta_api (uid, waba_id, business_account_id, access_token, business_phone_number_id, app_id) VALUES (?,?,?,?,?,?)`, [
                req.decode.uid, waba_id, business_account_id, access_token, business_phone_number_id, app_id
            ])
        }

        res.json({ success: true, msg: "Your meta settings were updated successfully!" })


    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// get meta keys 
router.get('/get_meta_keys', validateUser, async (req, res) => {
    try {
        const data = await query(`SELECT * FROM meta_api WHERE uid = ?`, [req.decode.uid])
        if (data.length < 1) {
            res.json({ success: true, data: {} })
        } else {
            res.json({ success: true, data: data[0] })
        }

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// add meta templet
router.post('/add_meta_templet', validateUser, checkPlan, async (req, res) => {
    try {
        console.log(JSON.stringify(req.body))

        const getAPIKEYS = await query(`SELECT * FROM meta_api WHERE uid = ?`, [req.decode.uid])

        if (getAPIKEYS.length < 1) {
            return res.json({ success: false, msg: "Please fill your meta API keys" })
        }

        const resp = await createMetaTemplet("v18.0", getAPIKEYS[0]?.waba_id, getAPIKEYS[0]?.access_token, req.body)

        if (resp.error) {
            res.json({ msg: resp?.error?.error_user_msg || resp?.error?.message })
        } else {
            console.log(resp)
            res.json({ msg: "Templet was added and waiting for the review", success: true })
        }

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})


// get user meta templet 
router.get('/get_my_meta_templets', validateUser, async (req, res) => {
    try {
        const getMETA = await query(`SELECT * FROM meta_api WHERE uid = ?`, [req.decode.uid])
        if (getMETA.length < 1) {
            return res.json({ success: false, msg: "Please check your meta API keys" })
        }

        const resp = await getAllTempletsMeta("v18.0", getMETA[0]?.waba_id, getMETA[0]?.access_token)

        if (resp?.error) {
            res.json({ success: false, msg: resp?.error?.message || "Please check your API" })
        }
        else {
            res.json({ success: true, data: resp?.data || [] })
        }


    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// del meta templet 
router.post('/del_meta_templet', validateUser, async (req, res) => {
    try {
        const { name } = req.body

        const getMETA = await query(`SELECT * FROM meta_api WHERE uid = ?`, [req.decode.uid])
        if (getMETA.length < 1) {
            return res.json({ success: false, msg: "Please check your meta API keys" })
        }

        const resp = await delMetaTemplet("v18.0", getMETA[0]?.waba_id, getMETA[0]?.access_token, name)

        if (resp.error) {
            return res.json({ success: false, msg: resp?.error?.error_user_title || "Please check your API" })
        } else {
            res.json({ success: true, data: resp?.data || [], msg: "Templet was deleted" })
        }

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})


// return meta media url 
router.post('/return_media_url_meta', validateUser, async (req, res) => {
    try {

        if (!req.body?.templet_name) {
            return res.json({ success: false, msg: "Please give a templet name first " })
        }

        if (!req.files || Object.keys(req.files).length === 0) {
            return res.json({ success: false, msg: "No files were uploaded" })
        }

        const getMETA = await query(`SELECT * FROM meta_api WHERE uid = ?`, [req.decode.uid])
        if (getMETA.length < 1) {
            return res.json({ success: false, msg: "Please check your meta API keys" })
        }

        const randomString = randomstring.generate()
        const file = req.files.file

        const filename = `${randomString}.${getFileExtension(file.name)}`

        // Move the file and wait for it to complete
        await new Promise((resolve, reject) => {
            file.mv(`${__dirname}/../client/public/media/${filename}`, err => {
                if (err) {
                    console.log(err)
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        setTimeout(async () => {
            const { fileSizeInBytes, mimeType } = await getFileInfo(`${__dirname}/../client/public/media/${filename}`)

            const getSession = await getSessionUploadMediaMeta('v18.0', getMETA[0]?.app_id, getMETA[0]?.access_token, fileSizeInBytes, mimeType)

            const uploadFile = await uploadFileMeta(getSession?.id, `${__dirname}/../client/public/media/${filename}`, "v18.0", getMETA[0]?.access_token)

            if (!uploadFile?.success) {
                return res.json({ success: false, msg: "Please check your meta API" })
            }

            const url = `${process.env.FRONTENDURI}/media/${filename}`

            await query(`INSERT INTO meta_templet_media (uid, templet_name, meta_hash, file_name) VALUES (?,?,?,?)`, [
                req.decode.uid,
                req.body?.templet_name,
                uploadFile?.data?.h,
                filename
            ])

            res.json({ success: true, url, hash: uploadFile?.data?.h })
        }, 1000);

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})


// get plan detail 
router.post("/get_plan_details", validateUser, async (req, res) => {
    try {
        const { id } = req.body

        const data = await query(`SELECT * FROM plan WHERE id = ?`, [id])
        if (data.length < 1) {
            return res.json({ success: false, data: null })
        } else {
            res.json({ success: true, data: data[0] })
        }

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// get payment gateway 
router.get("/get_payment_details", validateUser, async (req, res) => {
    try {
        const resp = await query(`SELECT * FROM web_private`, [])
        let data = resp[0]

        data.pay_stripe_key = ""
        res.json({ data, success: true })

    } catch (err) {
        res.json({ success: false, msg: "something went wrong", err })
        console.log(err)
    }
})

// creating stripe pay session
router.post('/create_stripe_session', validateUser, async (req, res) => {
    try {
        const getWeb = await query(`SELECT * FROM web_private`, [])

        if (getWeb.length < 1 || !getWeb[0]?.pay_stripe_key || !getWeb[0]?.pay_stripe_id) {
            return res.json({ success: false, msg: "Opss.. payment keys found not found" })
        }

        const stripeKeys = getWeb[0]?.pay_stripe_key


        const stripeClient = new Stripe(stripeKeys);

        const { planId } = req.body

        const plan = await query(`SELECT * FROM plan WHERE id = ?`, [planId])

        if (plan.length < 1) {
            return res.json({ msg: "No plan found with the id" })
        }

        const randomSt = randomstring.generate()
        const orderID = `STRIPE_${randomSt}`


        await query(`INSERT INTO orders (uid, payment_mode, amount, data) VALUES (?,?,?,?)`, [
            req.decode.uid,
            "STRIPE",
            plan[0]?.price,
            orderID
        ])

        const web = await query(`SELECT * FROM web_public`, [])

        const productStripe = [{
            price_data: {
                currency: web[0]?.currency_code,
                product_data: {
                    name: plan[0]?.title,
                    // images:[product.imgdata]
                },
                unit_amount: plan[0]?.price * 100,
            },
            quantity: 1
        }]

        const session = await stripeClient.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: productStripe,
            mode: "payment",
            success_url: `${process.env.BACKURI}/api/user/stripe_payment?order=${orderID}&plan=${plan[0]?.id}`,
            cancel_url: `${process.env.BACKURI}/api/user/stripe_payment?order=${orderID}&plan=${plan[0]?.id}`,
            locale: process.env.STRIPE_LANG || "en"
        });

        await query(`UPDATE orders SET s_token = ? WHERE data = ?`, [session?.id, orderID])

        res.json({ success: true, session: session })

    } catch (err) {
        res.json({ msg: err.toString(), err })
        console.log({ err, msg: JSON.stringify(err), string: err.toString() })
    }
})


function checlStripePayment(orderId) {
    return new Promise(async (resolve) => {
        try {
            const getStripe = await query(`SELECT * FROM web_private`, [])

            const stripeClient = new Stripe(getStripe[0]?.pay_stripe_key);
            const getPay = await stripeClient.checkout.sessions.retrieve(orderId)

            console.log({ status: getPay?.payment_status })

            if (getPay?.payment_status === "paid") {
                resolve({ success: true, data: getPay })
            } else {
                resolve({ success: false })
            }

        } catch (err) {
            resolve({ success: false, data: {} })
        }
    })
}


function returnHtmlRes(msg) {
    const html = `<!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="refresh" content="5;url=${process.env.FRONTENDURI}/user">
      <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #f4f4f4;
          text-align: center;
          margin: 0;
          padding: 0;
        }

        .container {
          background-color: #ffffff;
          border: 1px solid #ccc;
          border-radius: 4px;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
          margin: 100px auto;
          padding: 20px;
          width: 300px;
        }

        p {
          font-size: 18px;
          color: #333;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <p>${msg}</p>
      </div>
    </body>
    </html>
    `
    return html
}


router.get('/stripe_payment', async (req, res) => {
    try {
        const { order, plan } = req.query

        if (!order || !plan) {
            return res.send("INVALID REQUEST")
        }

        const getOrder = await query(`SELECT * FROM orders WHERE data = ?`, [order || ""])
        const getPlan = await query(`SELECT * FROM plan WHERE id = ?`, [plan])

        if (getOrder.length < 1) {
            return res.send("Invalid payment found")
        }

        if (getPlan.length < 1) {
            return res.send("Invalid plan found")
        }

        const checkPayment = await checlStripePayment(getOrder[0]?.s_token)
        console.log({ checkPayment: checkPayment })

        if (checkPayment.success) {
            res.send(returnHtmlRes("Payment Success! Redirecting..."))

            await query(`UPDATE orders SET data = ? WHERE data = ?`, [
                JSON.stringify(checkPayment?.data),
                order
            ])

            await updateUserPlan(getPlan[0], getOrder[0]?.uid)
        } else {
            res.send("Payment Failed! If the balance was deducted please contact to the HamWiz support. Redirecting...")
        }


    } catch (err) {
        console.log(err)
        res.json({ msg: "Something went wrong", err, success: false })
    }
})

// update profile 
router.post('/update_profile', validateUser, async (req, res) => {
    try {
        const { newPassword, name, mobile_with_country_code, email, timezone } = req.body

        if (!name || !mobile_with_country_code || !email || !timezone) {
            return res.json({ msg: "Name, Mobile, Email, Timezone are required fields" })
        }

        if (newPassword) {
            const hash = await bcrypt.hash(newPassword, 10)
            await query(`UPDATE user SET name = ?, email = ?, password = ?, mobile_with_country_code = ?, timezone = ? WHERE uid = ?`, [
                name, email, hash, mobile_with_country_code, timezone, req.decode.uid
            ])
        } else {
            await query(`UPDATE user SET name = ?, email = ?, mobile_with_country_code = ?, timezone = ? WHERE uid = ?`, [
                name, email, mobile_with_country_code, timezone, req.decode.uid
            ])
        }

        res.json({ success: true, msg: "Profile was updated" })

    } catch (err) {
        console.log(err)
        res.json({ msg: "Something went wrong", err, success: false })
    }
})


// get dashboard 
router.get('/get_dashboard', validateUser, async (req, res) => {
    try {
        const getOpenChat = await query(`SELECT * FROM chats WHERE uid = ? AND chat_status = ?`, [req.decode.uid, 'open'])
        const getOpenPending = await query(`SELECT * FROM chats WHERE uid = ? AND chat_status = ?`, [req.decode.uid, 'pending'])
        const getOpenResolved = await query(`SELECT * FROM chats WHERE uid = ? AND chat_status = ?`, [req.decode.uid, 'solved'])

        const getActiveChatbots = await query(`SELECT * FROM chatbot WHERE active = ? AND uid = ?`, [1, req.decode.uid])
        const getDActiveChatbots = await query(`SELECT * FROM chatbot WHERE active = ? AND uid = ?`, [0, req.decode.uid])

        const opened = getUserOrderssByMonth(getOpenChat)
        const pending = getUserOrderssByMonth(getOpenPending)
        const resolved = getUserOrderssByMonth(getOpenResolved)
        const activeBot = getUserOrderssByMonth(getActiveChatbots)
        const dActiveBot = getUserOrderssByMonth(getDActiveChatbots)

        // get total chats 
        const totalChats = await query(`SELECT * FROM chats WHERE uid = ?`, [req.decode.uid])
        const totalChatbots = await query(`SELECT * FROM chatbot WHERE uid = ?`, [req.decode.uid])
        const totalContacts = await query(`SELECT * FROM contact WHERE uid = ?`, [req.decode.uid])
        const totalFlows = await query(`SELECT * FROM flow WHERE uid = ?`, [req.decode.uid])
        const totalBroadcast = await query(`SELECT * FROM broadcast WHERE uid = ?`, [req.decode.uid])
        const totalTemplets = await query(`SELECT * FROM templets WHERE uid = ?`, [req.decode.uid])

        res.json({
            success: true,
            opened, pending,
            resolved,
            activeBot,
            dActiveBot,
            totalChats: totalChats.length,
            totalChatbots: totalChatbots?.length,
            totalContacts: totalContacts?.length,
            totalFlows: totalFlows?.length,
            totalBroadcast: totalBroadcast?.length,
            totalTemplets: totalTemplets?.length
        })

    } catch (err) {
        console.log(err)
        res.json({ msg: "Something went wrong", err, success: false })
    }
})


// enroll free plan 
router.post("/start_free_trial", validateUser, async (req, res) => {
    try {
        const { planId } = req.body

        const getUser = await query(`SELECT * FROM user WHERE uid = ?`, [req.decode.uid])
        if (getUser[0]?.trial > 0) {
            return res.json({ success: false, msg: "You have already taken Trial once. You can not enroll for trial again." })
        }

        const getPlan = await query(`SELECT * FROM plan WHERE id = ?`, [planId])
        if (getPlan.length < 1) {
            return res.json({ msg: "Invalid plan found" })
        }

        if (getPlan[0]?.price > 0) {
            return res.json({ msg: "This plan is not a trial plan." })
        }
        await query(`INSERT INTO orders (uid, payment_mode, amount, data) VALUES (?,?,?,?)`, [
            req.decode.uid,
            "OFFLINE",
            0,
            JSON.stringify({ plan: getPlan[0] })
        ])

        await updateUserPlan(getPlan[0], getUser[0]?.uid)

        await query(`UPDATE user SET trial = ? WHERE uid = ?`, [1, req.decode.uid])

        res.json({ success: true, msg: "Your trial plan has been activated. You are redirecting to the panel..." })

    } catch (err) {
        console.log(err)
        res.json({ msg: "Something went wrong", err, success: false })
    }
})

// send recover 
router.post('/send_resovery', async (req, res) => {
    try {
        const { email } = req.body

        if (!isValidEmail(email)) {
            return res.json({ msg: "Please enter a valid email" })
        }

        const checkEmailValid = await query(`SELECT * FROM user WHERE email = ?`, [email])
        if (checkEmailValid.length < 1) {
            return res.json({ success: true, msg: "We have sent a recovery link if this email is associated with user account." })
        }

        const getWeb = await query(`SELECT * FROM web_public`, [])
        const appName = getWeb[0]?.app_name

        const jsontoken = sign({
            old_email: email,
            email: email,
            time: moment(new Date()),
            password: checkEmailValid[0]?.password,
            role: 'user'
        }, process.env.JWTKEY, {})

        const recpveryUrl = `${process.env.FRONTENDURI}/recovery-user/${jsontoken}`

        const getHtml = recoverEmail(appName, recpveryUrl)

        // getting smtp 
        const smtp = await query(`SELECT * FROM smtp`, [])
        if (!smtp[0]?.email || !smtp[0]?.host || !smtp[0]?.port || !smtp[0]?.password) {
            return res.json({ success: false, msg: "SMTP connections not found! Unable to send recovery link" })
        }

        await sendEmail(smtp[0]?.host,
            smtp[0]?.port,
            smtp[0]?.email,
            smtp[0]?.password,
            getHtml,
            `${appName} - Password Recovery`,
            smtp[0]?.email,
            email)

        res.json({ success: true, msg: "We have sent your a password recovery link. Please check your email" })

    } catch (err) {
        console.log(err)
        res.json({ msg: "Something went wrong", err, success: false })
    }
})

// modify recpvery passwrod 
router.get('/modify_password', validateUser, async (req, res) => {
    try {
        const { pass } = req.query

        if (!pass) {
            return res.json({ success: false, msg: "Please provide a password" })
        }

        if (moment(req.decode.time).diff(moment(new Date()), 'hours') > 1) {
            return res.json({ success: false, msg: "Token expired" })
        }

        const hashpassword = await bcrypt.hash(pass, 10)

        const result = await query(`UPDATE user SET password = ? WHERE email = ?`, [hashpassword, req.decode.old_email])

        res.json({ success: true, msg: "Your password has been changed. You may login now! Redirecting...", data: result })

    } catch (err) {
        console.log(err)
        res.json({ msg: "Something went wrong", err, success: false })
    }
})


// generate api keys 
router.get('/generate_api_keys', validateUser, async (req, res) => {
    try {
        const token = sign({ uid: req.decode.uid, role: 'user' }, process.env.JWTKEY, {})

        // saving keys to user 
        await query(`UPDATE user SET api_key = ? WHERE uid = ?`, [token, req.decode.uid])

        res.json({ success: true, token, msg: "New keys has been generated" })

    } catch (err) {
        console.log(err)
        res.json({ msg: "Something went wrong", err, success: false })
    }
})

router.get('/fetch_profile', validateUser, async (req, res) => {
    try {
        // const getUser = await query(`SELECT * FROM user WHERE uid = ?`, [req.decode.uid])

        const metaKeys = await query('SELECT * FROM meta_api WHERE uid = ?', [req.decode?.uid]);


        if (!metaKeys[0]?.access_token || !metaKeys[0]?.business_phone_number_id) {
            return res.json({ success: false, msg: "Please fill the meta token and mobile id" })
        }
        const fetchProfile = await fetchProfileFun(metaKeys[0]?.business_phone_number_id, metaKeys[0]?.access_token)

        res.json(fetchProfile)
    } catch (err) {
        console.log(err)
        res.json({ msg: 'something went wrong', err })
    }
})

// adding task for agent
router.post('/add_task_for_agent', validateUser, async (req, res) => {
    try {
        const { title, des, agent_uid } = req.body
        if (!title || !des) {
            return res.json({ msg: "Please give title and description" })
        }

        if (!agent_uid) {
            return res.json({ msg: "Please select an agent" })
        }

        await query(`INSERT INTO agent_task (owner_uid, uid, title, description, status) VALUES (?,?,?,?,?)`, [
            req.decode.uid,
            agent_uid,
            title,
            des,
            "PENDING"
        ])

        res.json({ success: true, msg: "Task was added" })

    } catch (err) {
        console.log(err)
        res.json({ msg: 'something went wrong', err })
    }
})

// get my agent tasks 
router.get("/get_my_agent_tasks", validateUser, async (req, res) => {
    try {
        const data = await query(`
            SELECT agent_task.*, agents.email AS agent_email
            FROM agent_task
            JOIN agents ON agents.uid = agent_task.uid
            WHERE agent_task.owner_uid = ?
        `, [req.decode.uid]);

        res.json({ data, success: true })

    } catch (err) {
        console.log(err)
        res.json({ msg: 'something went wrong', err })
    }
})

// delete task for agent 
router.post('/del_task_for_agent', validateUser, async (req, res) => {
    try {
        const { id } = req.body
        await query(`DELETE FROM agent_task WHERE id = ? AND owner_uid = ?`, [
            id,
            req.decode.uid
        ])

        res.json({ msg: "Task was deleted", success: true })

    } catch (err) {
        console.log(err)
        res.json({ msg: 'something went wrong', err })
    }
})

// add widget 
router.post('/add_widget', validateUser, async (req, res) => {
    try {
        const { title, whatsapp_number, place, selectedIcon, logoType, size } = req.body


        if (!title || !whatsapp_number || !place) {
            return res.json({ msg: "Please fill the details" })
        }

        let filename

        if (logoType === "UPLOAD") {

            if (!req.files || Object.keys(req.files).length === 0) {
                return res.json({ success: false, msg: "Please upload a logo" })
            }

            const randomString = randomstring.generate()
            const file = req.files.file

            filename = `${randomString}.${getFileExtension(file.name)}`

            file.mv(`${__dirname}/../client/public/media/${filename}`, err => {
                if (err) {
                    console.log(err)
                    return res.json({ err })
                }
            })
        } else {
            filename = selectedIcon
        }

        const unique_id = randomstring.generate(10)

        await query(`INSERT INTO chat_widget (unique_id, uid, title, whatsapp_number, logo, place, size) VALUES (?,?,?,?,?,?,?)`, [
            unique_id,
            req.decode.uid,
            title,
            whatsapp_number,
            filename,
            place,
            size || 50
        ])

        res.json({
            msg: "Widget was added",
            success: true
        })

    } catch (err) {
        console.log(err)
        res.json({ msg: 'something went wrong', err })
    }
})

// get my widget 
router.get('/get_my_widget', validateUser, async (req, res) => {
    try {
        const data = await query(`SELECT * FROM chat_widget WHERE uid = ?`, [
            req.decode.uid
        ])

        res.json({ data, success: true })

    } catch (err) {
        console.log(err)
        res.json({ msg: 'something went wrong', err })
    }
})

// del widget 
router.post('/del_widget', validateUser, async (req, res) => {
    try {
        const { id } = req.body

        await query(`DELETE FROM chat_widget WHERE id = ?`, [
            id
        ])

        res.json({ msg: "Widget was deleted", success: true })

    } catch (err) {
        console.log(err)
        res.json({ msg: 'something went wrong', err })
    }
})

router.get("/widget", async (req, res) => {
    try {
        const { id } = req.query

        if (!id) {
            return res.send(``)
        }

        const getWidget = await query(`SELECT * FROM chat_widget WHERE unique_id = ?`, [id])

        if (getWidget.length < 1) {
            return res.send(``)
        }

        const url = generateWhatsAppURL(getWidget[0]?.whatsapp_number, getWidget[0]?.title)

        res.send(
            returnWidget(`${process.env.FRONTENDURI}/media/${getWidget[0]?.logo}`,
                getWidget[0]?.size,
                url,
                getWidget[0]?.place)
        )

    } catch (err) {
        console.log(err)
        res.json({ msg: 'something went wrong', err })
    }
})

// update agent profile 
router.post('/update_agent_profile', validateUser, async (req, res) => {
    try {
        const { email, name, mobile, newPas, uid } = req.body

        if (!email || !name || !mobile) {
            return res.json({
                msg: "You can not remove any detail of agent"
            })
        }

        if (newPas) {
            const hasPas = await bcrypt.hash(newPas, 10)
            await query(`UPDATE agents SET email = ?, name = ?, mobile = ?, password = ? WHERE uid = ?`, [
                email, name, mobile, hasPas, uid
            ])
        } else {
            await query(`UPDATE agents SET email = ?, name = ?, mobile = ? WHERE uid = ?`, [
                email, name, mobile, uid
            ])
        }

        res.json({ msg: "Agent profile was updated", success: true })

    } catch (err) {
        console.log(err)
        res.json({ msg: 'something went wrong', err })
    }
})

// auto login agent 
router.post('/auto_agent_login', validateUser, async (req, res) => {
    try {
        const { uid } = req.body
        const agentFind = await query(`SELECT * FROM agents WHERE uid = ?`, [
            uid
        ])

        const token = sign({
            uid: agentFind[0].uid,
            role: 'agent', password: agentFind[0].password,
            email: agentFind[0].email
        }, process.env.JWTKEY, {})

        res.json({ token, success: true })

    } catch (err) {
        console.log(err)
        res.json({ msg: 'something went wrong', err })
    }
})

module.exports = router