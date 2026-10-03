import { createServer } from 'node:http'

const server = createServer((req, res) => {
  res.end('Klopa radi\n')
})

// Bez adrese Node sluša na SVIM adresama (:: i 0.0.0.0) – suprotno od gunicorna!
server.listen(8000)

// Samo ovo računalo:
// server.listen(8000, '127.0.0.1')
