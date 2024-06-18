const mysql = require('mysql2')

const con = mysql.createPool({
    connectionLimit: 1000,
    host: process.env.DBHOST || "localhost",
    port: process.env.DBPORT || 3306,
    user: process.env.DBUSER,
    password: process.env.DBPASS,
    database: process.env.DBNAME,
    charset: 'utf8mb4'
})


con.getConnection((err) => {
    if (err) {
        console.log({
            err: err,
            msg: "Database connected error"
        })
        return
    } else {
        console.log('Database has been connected')
    }
})

module.exports = con