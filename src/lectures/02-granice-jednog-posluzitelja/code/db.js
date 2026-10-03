// db.js – svaki Node.js proces drži bazen veza prema Postgresu
const { Pool } = require('pg')

const pool = new Pool({
  host: 'localhost',
  database: 'klopa',
  max: 10, // najviše 10 upita istodobno; ostali čekaju slobodnu vezu
})

module.exports = pool
