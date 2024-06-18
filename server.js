require('dotenv').config()
const express = require('express')
const app = express()
const cors = require('cors')
const fileUpload = require('express-fileupload')
const { initializeSocket } = require('./socket.js');
const { runCampaign } = require('./loops/campaignLoop.js')

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use(express.urlencoded({ extended: true }))
app.use(cors())
app.use(express.json())
app.use(fileUpload())

// routers 
const userRoute = require('./routes/user')
app.use('/api/user', userRoute)

const webRoute = require('./routes/web')
app.use('/api/web', webRoute)

const adminRoute = require('./routes/admin')
app.use('/api/admin', adminRoute)

const phonebookRoute = require('./routes/phonebook')
app.use('/api/phonebook', phonebookRoute)

const chat_flowRoute = require('./routes/chatFlow')
app.use('/api/chat_flow', chat_flowRoute)

const inboxRoute = require('./routes/inbox')
app.use('/api/inbox', inboxRoute)

const templetRoute = require('./routes/templet')
app.use('/api/templet', templetRoute)

const chatbotRoute = require('./routes/chatbot')
app.use('/api/chatbot', chatbotRoute)

const broadcastRoute = require('./routes/broadcast')
app.use('/api/broadcast', broadcastRoute)

const apiRoute = require('./routes/apiv2')
app.use('/api/v1', apiRoute)

const agentRoute = require('./routes/agent')
app.use('/api/agent', agentRoute)

const path = require("path");

const currentDir = process.cwd();

app.use(express.static(path.resolve(currentDir, "./client/public")));

app.get("*", function (request, response) {
    response.sendFile(path.resolve(currentDir, "./client/public", "index.html"));
});

const server = app.listen(process.env.PORT || 3010, () => {
    console.log(`WaCrm server is running on port ${process.env.PORT}`);
    setTimeout(() => {
        runCampaign()
    }, 1000);
});

// Initialize Socket.IO and export it
const io = initializeSocket(server);

module.exports = io;
