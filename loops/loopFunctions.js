const fetch = require('node-fetch');
const { sendMetatemplet } = require('../functions/function');

function replaceVariables(obj, arr) {
    const replacedArr = arr.map(item => {
        if (item.startsWith('{{') && item.endsWith('}}')) {
            const key = item.slice(2, -2); // Remove '{{' and '}}' to get the key
            if (obj.hasOwnProperty(key) && obj[key] !== undefined && obj[key] !== '') {
                return obj[key];
            } else {
                return item; // Keep the original placeholder if key not found in object or value is empty
            }
        } else {
            return item; // Keep non-placeholder items as they are
        }
    });
    return replacedArr;
}

async function getMetaTempletByName(name, metaKeys) {
    const url = `https://graph.facebook.com/v18.0/${metaKeys?.waba_id}/message_templates?name=${name}`
    const options = {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${metaKeys?.access_token}`
        }
    };
    const response = await fetch(url, options);
    const data = await response.json();

    return data
}

async function sendMessage(message, metaKeys) {
    const templetName = message?.templet_name
    const templet = await getMetaTempletByName(templetName, metaKeys)
    const contact = JSON.parse(message?.contact)

    if (templet.error || templet?.data?.length < 1) {
        return { success: false, msg: templet.error?.message || "Unable to fetch templet from meta" }
    } else {
        // return { success: true, data: templet?.data[0] }
        const exampleArr = replaceVariables(contact, JSON.parse(message?.example))

        const resp = await sendMetatemplet(
            message?.send_to?.replace("+", ""),
            metaKeys?.business_phone_number_id,
            metaKeys?.access_token,
            templet?.data[0],
            exampleArr
        )

        if (resp.error) {
            return { success: false, msg: resp?.error?.error_user_title || "Please check your API" }
        } else {
            return { success: true, msgId: resp?.messages[0]?.id, msg: "sent" }
        }
    }
}

module.exports = { sendMessage }